#!/usr/bin/env node
// Live Prototype (Screens_Handoff_Skill, step 4): review comments from the published prototype.
// Usage (from the Root):
//   node tools/prototype_comments.cjs "My Projects/<Project>" --schema           writes prototype/supabase/schema.sql
//   node tools/prototype_comments.cjs "My Projects/<Project>" --pull             writes prototype/comments/inbox.json + inbox.md
//                                                                                (+ comments/images/ with the reference images)
//   node tools/prototype_comments.cjs "My Projects/<Project>" --resolve <id> [--reply "text"]   marks one comment resolved,
//                                                                                with the design team's answer shown under it
//   node tools/prototype_comments.cjs "My Projects/<Project>" --schema-status    prints JSON: keys found, schema up to date, bucket
//   [--env <file>]  a project override, default <project>/prototype/.env.local
// Keys come from the shared file %USERPROFILE%/.atomica/supabase.env (one Supabase project for every Atomica
// project, set up once per device), then the project's .env.local (git-ignored) overrides any of them. They hold:
//   VITE_SUPABASE_URL=https://<ref>.supabase.co
//   VITE_SUPABASE_ANON_KEY=<anon / publishable key> (public by design: the prototype page uses it)
//   SUPABASE_SERVICE_KEY=<service_role / secret key> (secret: only this tool reads it; Vite never exposes non-VITE_ keys)
//   VITE_COMMENTS_PROJECT=<project slug>          (optional, default: the project folder name as a slug)
// The keys are never printed. --pull and --resolve use the service key (it bypasses row level security).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
const project = args[0] && !args[0].startsWith('--') ? path.resolve(ROOT, args[0]) : null;
if (!project || !(flag('--schema') || flag('--pull') || flag('--resolve') || flag('--schema-status'))) {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 15).join('\n'));
  process.exit(2);
}
const app = path.join(project, 'prototype');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function readEnv(file) {
  if (!fs.existsSync(file)) return {};
  const env = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#')) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}
const SHARED = path.join(require('os').homedir(), '.atomica', 'supabase.env');
const envFile = path.resolve(opt('--env', path.join(app, '.env.local')));
const env = { ...readEnv(SHARED), ...readEnv(envFile) };
const PROJECT = env.VITE_COMMENTS_PROJECT || slug(path.basename(project));

if (flag('--schema')) {
  const tpl = fs.readFileSync(path.join(ROOT, 'Screens_Handoff_Skill', 'templates', 'supabase', 'schema.sql'), 'utf8');
  const out = path.join(app, 'supabase', 'schema.sql');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, tpl);
  console.log(`Wrote ${path.relative(ROOT, out)}. Run it once in the Supabase SQL Editor; it serves every project (rows are kept apart by their project slug, "${PROJECT}" here).`);
  process.exit(0);
}

// The project's own Supabase pair travels with its repo (status.json > comments, tools/project_repo.cjs), so a designer
// who opens the project from GitHub reads its comments with no setup: reading is allowed to the public key by row level
// security. Resolving and replying are updates, refused to that key on purpose (anyone with the live link has it), so
// they need the secret key, pasted once on each computer (Connect services > Supabase, ~/.atomica, never in the repo).
const pub = require('./project_repo.cjs').publicSupabase(project);
const URL_ = (pub.url || env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const readOnly = !flag('--resolve');
const KEY = env.SUPABASE_SERVICE_KEY || (readOnly ? pub.anonKey : null);
if (!URL_ || !KEY) {
  console.error(!URL_ || readOnly
    ? `No Supabase URL and key for comments: they come with the project (status.json > comments) or from ~/.atomica/supabase.env (Connect services > Supabase).`
    : 'Resolving or replying needs the Supabase secret key on this computer: ask the project owner for it and paste it once in Connect services > Supabase (it stays in ~/.atomica, never in the repo).');
  process.exit(3);
}
// Legacy service_role keys are JWTs and also go in Authorization; the newer secret keys (sb_secret_...) only in apikey.
const headers = { apikey: KEY, 'content-type': 'application/json', ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}) };
const api = `${URL_}/rest/v1/prototype_comments`;

async function main() {
  if (flag('--schema-status')) {
    // Read-only: does the table have the current columns, and does the image bucket exist? No key is printed.
    const out = { keys: true, url: URL_.replace(/^https?:\/\//, ''), table: false, reply: false, images: false, bucket: false };
    const t = await fetch(`${api}?select=id&limit=1`, { headers });
    out.table = t.ok;
    for (const col of ['reply', 'images']) {
      const r = await fetch(`${api}?select=${col}&limit=1`, { headers });
      out[col] = r.ok;
    }
    // the bucket can be read only with the secret key; with the project's public key it is not checked (secret: false)
    out.secret = !!env.SUPABASE_SERVICE_KEY;
    const b = out.secret ? await fetch(`${URL_}/storage/v1/bucket/prototype-comments`, { headers }) : { ok: true };
    out.bucket = b.ok;
    out.upToDate = out.table && out.reply && out.images && out.bucket;
    console.log(JSON.stringify(out));
    return;
  }
  if (flag('--resolve')) {
    const id = opt('--resolve');
    if (!/^[0-9a-f-]{36}$/i.test(id || '')) { console.error('--resolve needs a comment id (uuid)'); process.exit(2); }
    const r = await fetch(`${api}?id=eq.${id}&project=eq.${encodeURIComponent(PROJECT)}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'resolved', resolved_at: new Date().toISOString(), ...(opt('--reply') ? { reply: opt('--reply') } : {}) }),
    });
    if (!r.ok) {
      const t = await r.text();
      // The Supabase project has an older schema (no reply / images column): say so, so callers can ask for the update.
      if (/PGRST204/.test(t) && /'(reply|images)' column/.test(t)) { console.error('SCHEMA_UPDATE_NEEDED: run the current schema.sql once in Supabase (adds replies and images).'); process.exit(3); }
      console.error(`Resolve failed: HTTP ${r.status} ${t.slice(0, 200)}`);
      process.exit(1);
    }
    const hit = await r.json();
    console.log(hit.length ? `Resolved ${id} (${hit[0].screen} · ${hit[0].component || hit[0].figma_node}).` : `No comment ${id} in "${PROJECT}".`);
    return;
  }
  const r = await fetch(`${api}?select=*&project=eq.${encodeURIComponent(PROJECT)}&order=created_at.asc`, { headers });
  if (!r.ok) { console.error(`Pull failed: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); process.exit(1); }
  const all = await r.json();
  const open = all.filter((c) => c.status !== 'resolved');
  const outDir = path.join(app, 'comments');
  fs.mkdirSync(outDir, { recursive: true });
  // Reference images of open comments: comments/images/<comment id>-<n>.<ext> (public Storage URLs, no key needed).
  const imgDir = path.join(outDir, 'images');
  const local = {};
  for (const c of open) for (const [i, p] of (c.images || []).entries()) {
    const ext = (p.split('.').pop() || 'webp').replace(/[^a-z0-9]/gi, '').slice(0, 5) || 'webp';
    const file = path.join(imgDir, `${c.id}-${i + 1}.${ext}`);
    if (!fs.existsSync(file)) {
      const r = await fetch(`${URL_}/storage/v1/object/public/prototype-comments/${p}`);
      if (!r.ok) { console.error(`Image ${p}: HTTP ${r.status}`); continue; }
      fs.mkdirSync(imgDir, { recursive: true });
      fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
    }
    (local[c.id] ||= []).push(`images/${path.basename(file)}`);
  }
  fs.writeFileSync(path.join(outDir, 'inbox.json'), JSON.stringify({ project: PROJECT, pulled_at: new Date().toISOString(), comments: all }, null, 1) + '\n');
  // Markdown triage: open comments grouped by screen, then component (Figma node), oldest first.
  const md = [`# Prototype comments: ${PROJECT}`, '', `Pulled ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Open ${open.length}, resolved ${all.length - open.length}.`, ''];
  const byScreen = {};
  for (const c of open) ((byScreen[c.screen] ||= {})[`${c.component || 'Frame'} · ${c.figma_node || '-'}`] ||= []).push(c);
  for (const [screen, groups] of Object.entries(byScreen)) {
    md.push(`## ${screen}`, '');
    for (const [comp, list] of Object.entries(groups)) {
      md.push(`### ${comp}`, '');
      for (const c of list) {
        md.push(`- **${(c.author || 'Anonymous').replace(/[*_`]/g, '')}** (${c.created_at.slice(0, 16).replace('T', ' ')}, ${c.theme || '-'} / ${(c.lang || '-').toUpperCase()}, ${c.viewport || '-'}): ${c.body.replace(/\s+/g, ' ')}`);
        md.push(`  - id \`${c.id}\` · pin ${Math.round(c.x)}, ${Math.round(c.y)} · Triage: fix / decision / info`);
        for (const [i, f] of (local[c.id] || []).entries()) md.push(`  - image ${i + 1}: ![image ${i + 1}](${f})`);
      }
      md.push('');
    }
  }
  if (!open.length) md.push('No open comments.', '');
  fs.writeFileSync(path.join(outDir, 'inbox.md'), md.join('\n'));
  console.log(`Pulled ${all.length} comment(s) for "${PROJECT}" (open ${open.length}) -> ${path.relative(ROOT, path.join(outDir, 'inbox.md'))}`);
}
main().catch((e) => { console.error(String(e).slice(0, 300)); process.exit(1); });

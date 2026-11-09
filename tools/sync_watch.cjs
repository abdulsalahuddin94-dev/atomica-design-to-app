#!/usr/bin/env node
// Daily sync check (Screens_Handoff_Skill), no AI: has the Figma Design file or the linked code repo moved since the last
// time anyone looked? Compares the file's latest Figma version (REST /versions, light) and the code repo's latest
// commit (git ls-remote, no sign-in for a public repo) with what this check saw last
// (<project>/prototype/data/figma-sync.json > watch). No change: nothing is written, nothing is said. A change: a short
// summary goes to <project>/prototype/data/sync-watch.json, which the dashboard shows on its Sync with Figma badge.
// Never writes to Figma or to the code repo.
// Usage (from the Root):
//   node tools/sync_watch.cjs "My Projects/<Project>"
//   node tools/sync_watch.cjs --all [--projects "<folder with the projects>"]
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// The code repo linked to a project: status.json > code_repo { url, branch } (a GitHub link or any git URL).
function codeRepoOf(status) {
  const r = status?.code_repo;
  if (!r) return null;
  const url = typeof r === 'string' ? r : r.url;
  return url ? { url: /\.git$|^git@/.test(url) ? url : url.replace(/\/+$/, '') + '.git', branch: (typeof r === 'object' && r.branch) || null, web: url.replace(/\.git$/, '') } : null;
}

// Decide from what was seen before and what is there now (pure; the tests call it directly).
function compareWatch(prev, now) {
  const changes = [];
  if (now.figmaVersion && prev?.figmaVersion && now.figmaVersion !== prev.figmaVersion) changes.push({ side: 'figma', from: prev.figmaVersion, to: now.figmaVersion, label: now.figmaLabel || null, by: now.figmaBy || null, at: now.figmaAt || null });
  if (now.codeCommit && prev?.codeCommit && now.codeCommit !== prev.codeCommit) changes.push({ side: 'code', from: prev.codeCommit, to: now.codeCommit });
  const first = !prev || (!prev.figmaVersion && !prev.codeCommit);
  return { first, changed: changes.length > 0, changes };
}
function summarize(changes, names) {
  return changes.map((c) => c.side === 'figma'
    ? `Figma: "${names.file || 'the Design file'}" has a new version${c.by ? ` by ${c.by}` : ''}${c.at ? ` (${String(c.at).slice(0, 16).replace('T', ' ')})` : ''}.`
    : `Code: ${names.repo || 'the code repo'} has new commits (${c.from.slice(0, 7)} -> ${c.to.slice(0, 7)}).`).join(' ');
}

function latestFigmaVersion(fileKey, tok) {
  return new Promise((resolve) => {
    if (!fileKey || !tok) return resolve(null);
    const req = https.get({ host: 'api.figma.com', path: `/v1/files/${encodeURIComponent(fileKey)}/versions?page_size=1`, headers: { 'X-Figma-Token': tok }, timeout: 15000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ error: res.statusCode });
        try { const v = JSON.parse(body).versions?.[0]; resolve(v ? { id: v.id, label: v.label || null, by: v.user?.handle || null, at: v.created_at } : null); } catch { resolve(null); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}
function latestCommit(repo) {
  if (!repo) return null;
  try {
    const out = execFileSync('git', ['ls-remote', repo.url, repo.branch ? `refs/heads/${repo.branch}` : 'HEAD'], { encoding: 'utf8', timeout: 30000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
    return (out.split(/\s/)[0] || '').trim() || null;
  } catch { return null; }
}

async function watchProject(dir, { tok, getVersion = latestFigmaVersion, getCommit = latestCommit } = {}) {
  const status = readJson(path.join(dir, 'status.json'), {});
  const shot = readJson(path.join(dir, 'prototype', 'data', 'screens.json'), {}) || {};
  const design = (status.figma?.design_files || []).find((f) => f.name === shot.file) || (status.figma?.design_files || [])[0] || null;
  const repo = codeRepoOf(status);
  if (!design && !repo) return { skipped: 'no Figma Design file or code repo linked' };
  const v = design?.file_key ? await getVersion(design.file_key, tok) : null;
  const now = { figmaVersion: v && !v.error ? v.id : null, figmaBy: v?.by, figmaAt: v?.at, figmaLabel: v?.label, codeCommit: getCommit(repo) };
  const snapPath = path.join(dir, 'prototype', 'data', 'figma-sync.json');
  if (!fs.existsSync(path.dirname(snapPath))) return { skipped: 'no prototype yet' };
  const snap = readJson(snapPath, { screens: {} });
  const res = compareWatch(snap.watch, now);
  // keep what was seen; only a value that was read replaces the old one (a failed read changes nothing)
  const seen = { ...(snap.watch || {}), ...(now.figmaVersion ? { figmaVersion: now.figmaVersion } : {}), ...(now.codeCommit ? { codeCommit: now.codeCommit } : {}), checkedAt: new Date().toISOString() };
  snap.watch = seen;
  fs.writeFileSync(snapPath, JSON.stringify(snap, null, 1) + '\n');
  if (!res.changed) return { changed: false, first: res.first };
  const summary = summarize(res.changes, { file: design?.name, repo: repo?.web });
  const watchFile = path.join(dir, 'prototype', 'data', 'sync-watch.json');
  fs.writeFileSync(watchFile, JSON.stringify({ at: new Date().toISOString(), summary, changes: res.changes, seen: false }, null, 1) + '\n');
  return { changed: true, summary };
}

module.exports = { compareWatch, summarize, codeRepoOf, watchProject };

if (require.main === module) {
  const args = process.argv.slice(2);
  const tok = (() => { try { return require('./figma_versions.cjs').token(); } catch { return null; } })();
  const projectsDir = (() => { const i = args.indexOf('--projects'); return i >= 0 ? path.resolve(args[i + 1]) : path.join(ROOT, 'My Projects'); })();
  const dirs = args.includes('--all')
    ? (() => { try { return fs.readdirSync(projectsDir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith('_') && !d.name.startsWith('.')).map((d) => path.join(projectsDir, d.name)); } catch { return []; } })()
    : args[0] && !args[0].startsWith('--') ? [path.resolve(ROOT, args[0])] : [];
  if (!dirs.length) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 11).join('\n')); process.exit(2); }
  (async () => {
    for (const d of dirs) {
      const r = await watchProject(d, { tok });
      if (r.changed) console.log(`${path.basename(d)}: ${r.summary}`);
      // no change: silent (no tokens, no message)
    }
  })();
}

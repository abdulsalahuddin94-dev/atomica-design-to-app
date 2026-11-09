#!/usr/bin/env node
// Two-way sync between a project's prototype and Figma (Screens_Handoff_Skill), for any project.
//   Prototype -> Figma: what is waiting (status.json > prototype.pending_figma_sync, data/sync-queue.json pushes), DS
//   components first, then screens.
//   Figma -> Prototype: which screens changed in the Design file since the last sync, which frames are new.
//   Conflicts: a screen changed on both sides since the last sync is never overwritten silently.
// Snapshot per screen in <project>/prototype/data/figma-sync.json:
//   { fileKey, file, screens: { <slug>: { name, nodes: { <mode>: <figma id> }, figmaHash, codeHash, syncedAt } } }
// Figma is read with its REST API (the token is found the way figma-console-mcp finds it; never printed).
// Usage (from the Root):
//   node tools/figma_sync.cjs "My Projects/<Project>" --status          pending + the last comparison (no Figma call)
//   node tools/figma_sync.cjs "My Projects/<Project>" --check           read Figma now and compare (JSON)
//   node tools/figma_sync.cjs "My Projects/<Project>" --mark a,b         record screens a, b as in sync (both sides)
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'screen';
const baseName = (n) => String(n).replace(/\s*[/\-–—|(]\s*(Dark|Light)\)?\s*$/i, '').trim();
// The prototype drops the page prefix of a frame name ("Listen / Explore - Full" -> "Explore - Full").
const stripPage = (name, page) => (page && name.toLowerCase().startsWith(page.toLowerCase()) && /^\s*\//.test(name.slice(page.length)) ? name.slice(page.length).replace(/^\s*\/\s*/, '') : name);
const snapFile = (dir) => path.join(dir, 'prototype', 'data', 'figma-sync.json');

// The prototype's screens and their Figma frames (from the generated routes).
function screenDefs(dir) {
  const routes = readText(path.join(dir, 'prototype', 'src', 'generated', 'routes.tsx'));
  return [...routes.matchAll(/\{\s*slug:\s*"([^"]+)",\s*name:\s*"([^"]+)"[^}]*?figma:\s*(\{[^}]*\})/g)].map((m) => {
    let nodes = {};
    try { nodes = JSON.parse(m[3]); } catch {}
    return { slug: m[1], name: m[2], nodes };
  });
}
// Code side: the generated screen plus the code-first overrides that touch it.
function codeHash(dir, slug, name) {
  const screen = readText(path.join(dir, 'prototype', 'src', 'generated', 'screens', `${slug}.tsx`));
  const ov = (readJson(path.join(dir, 'prototype', 'data', 'overrides.json'), {})?.changes || []).filter((c) => slugify(c.screen || '') === slug || c.screen === name);
  return sha(screen + JSON.stringify(ov));
}
// The Design file of the screens, and the DS file.
function figmaFiles(dir) {
  const status = readJson(path.join(dir, 'status.json'), {});
  const shot = readJson(path.join(dir, 'prototype', 'data', 'screens.json'), {}) || {};
  const files = status.figma?.design_files || [];
  const design = files.find((f) => f.name === shot.file) || files[0] || null;
  return { design, ds: status.figma?.design_system || null, page: shot.page || null, status };
}

// Prototype -> Figma: everything waiting, DS changes first (they have to exist before the screens can use them).
function pendingToFigma(dir) {
  const { status, ds, design } = figmaFiles(dir);
  const overrides = readJson(path.join(dir, 'prototype', 'data', 'overrides.json'), {})?.changes || [];
  const queue = readJson(path.join(dir, 'data', 'sync-queue.json'), {})?.requests || [];
  const items = [];
  for (const p of status.prototype?.pending_figma_sync || []) {
    const ov = overrides.find((o) => o.id === p.override);
    const isDs = p.kind === 'ds' || (!!ds?.name && p.file === ds.name) || /\bDS\b|design system/i.test(p.file || '');
    items.push({ id: `pending:${p.override || sha(p.change)}`, kind: isDs ? 'ds' : 'screen', file: p.file || (isDs ? ds?.name : design?.name) || null,
      screen: ov?.screen || null, slug: ov?.screen ? slugify(ov.screen) : null, title: ov?.description || p.change, source: 'status.json' });
  }
  for (const q of queue) {
    if (q.status !== 'queued' || !String(q.ref || '').startsWith('push:')) continue;
    const slug = (q.ref.match(/^push:screen:(.+)$/) || [])[1] || null;
    if (items.some((i) => slug && i.slug === slug && i.source === 'queue')) continue;
    items.push({ id: q.ref, kind: 'screen', file: design?.name || null, screen: null, slug, title: q.title || q.ref, source: 'queue' });
  }
  return items.sort((a, b) => (a.kind === 'ds' ? 0 : 1) - (b.kind === 'ds' ? 0 : 1));
}

// The comparison (pure): what changed where since the last sync.
//   snapshot: figma-sync.json; figma: { screens: { slug: { hash, exists } }, newFrames: [{ id, name }] }
//   code: { slug: hash }; pendingSlugs: screens with a code-first change waiting for Figma
function diffSync({ snapshot, figma, code, pendingSlugs = [] }) {
  const rows = [];
  const snaps = snapshot?.screens || {};
  for (const slug of new Set([...Object.keys(code || {}), ...Object.keys(figma?.screens || {})])) {
    const s = snaps[slug];
    const f = figma?.screens?.[slug];
    const codeChanged = pendingSlugs.includes(slug) || (!!s && code?.[slug] !== undefined && code[slug] !== s.codeHash);
    if (f && f.codeOnly) { rows.push({ slug, status: 'prototype-only', codeChanged: true }); continue; }
    if (f && f.exists === false) { rows.push({ slug, status: 'removed-in-figma', codeChanged }); continue; }
    if (!s) { rows.push({ slug, status: pendingSlugs.includes(slug) ? 'prototype-changed' : 'baseline', codeChanged: pendingSlugs.includes(slug) }); continue; }
    // fingerprints from another reading method (FigCli vs REST) are not comparable: that screen starts again from now
    if (f && f.hash !== undefined && s.figmaMethod && figma?.method && s.figmaMethod !== figma.method) { rows.push({ slug, status: codeChanged ? 'prototype-changed' : 'baseline', codeChanged, rebaseline: true }); continue; }
    const figmaChanged = !!f && f.hash !== undefined && f.hash !== s.figmaHash;
    rows.push({ slug, status: figmaChanged && codeChanged ? 'conflict' : figmaChanged ? 'figma-changed' : codeChanged ? 'prototype-changed' : 'in-sync', codeChanged, figmaChanged });
  }
  for (const n of figma?.newFrames || []) rows.push({ slug: slugify(baseName(n.name)), status: 'new-in-figma', name: baseName(n.name), id: n.id });
  return rows;
}

// Figma's side of the screens (REST): a fingerprint per frame and the frames on the page the prototype does not have.
function figmaGet(p, tok) {
  return new Promise((resolve) => {
    const req = https.get({ host: 'api.figma.com', path: p, headers: { 'X-Figma-Token': tok }, timeout: 20000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) return resolve({ error: 'Figma refused the token (it needs file read access).' });
        if (res.statusCode === 404) return resolve({ error: 'Figma did not find the Design file (check status.json > figma).' });
        if (res.statusCode === 429) { const s = +res.headers['retry-after'] || 60; return resolve({ error: `Figma is limiting requests for now; try again in about ${s >= 120 ? Math.round(s / 60) + ' minutes' : s + ' seconds'}.`, retryAfter: s }); }
        if (res.statusCode !== 200) return resolve({ error: `Figma answered ${res.statusCode}.` });
        try { resolve({ json: JSON.parse(body) }); } catch { resolve({ error: 'Figma sent an unreadable answer.' }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ error: 'Figma did not answer in time.' }); });
    req.on('error', () => resolve({ error: 'Figma could not be reached (offline?).' }));
  });
}
// The visible design of a frame, without ids that change on every copy: what a designer would call "changed".
const fingerprint = (node) => sha(JSON.stringify(node, (k, v) => (k === 'id' || k === 'transitionNodeID' || k === 'pluginData' || k === 'sharedPluginData' ? undefined : v)));

// FigCli Yolo (no limits, Figma Desktop open with port 9222): a read-only script fingerprints the frames inside Figma.
function findFigCli() {
  const os = require('os');
  const cands = [];
  if (process.env.FIGMA_CLI_DIR) cands.push(process.env.FIGMA_CLI_DIR);
  for (const b of [path.join(path.parse(ROOT).root, 'Tools'), path.join(ROOT, '..', 'Tools'), path.join(os.homedir(), 'Tools')]) {
    try { for (const d of fs.readdirSync(b)) if (d.startsWith('figma-cli')) cands.push(path.join(b, d)); } catch {}
  }
  return cands.find((d) => fs.existsSync(path.join(d, 'src', 'index.js'))) || null;
}
async function figcliUp() {
  try { const r = await fetch('http://127.0.0.1:9222/json/version', { signal: AbortSignal.timeout(800) }); return r.ok; } catch { return false; }
}
const FIGCLI_SCRIPT = `(async () => {
  const opts = __OPTS__;
  const h = (s) => { let x = 5381; for (let i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) | 0; return (x >>> 0).toString(16); };
  const sig = (n) => {
    const o = [n.type, n.name, Math.round(n.width || 0), Math.round(n.height || 0), Math.round(n.x || 0), Math.round(n.y || 0), n.visible];
    if ('characters' in n) o.push(n.characters);
    if ('fills' in n && Array.isArray(n.fills)) o.push(JSON.stringify(n.fills.map((p) => [p.type, p.color ? [p.color.r, p.color.g, p.color.b].map((v) => Math.round(v * 255)) : null, p.opacity, p.boundVariables && p.boundVariables.color ? p.boundVariables.color.id : null])));
    if (n.type === 'INSTANCE') { try { o.push(n.mainComponent ? (n.mainComponent.key || n.mainComponent.name) : ''); o.push(JSON.stringify(n.componentProperties)); } catch (e) {} }
    if ('children' in n) o.push(n.children.map(sig).join('|'));
    return o.join(',');
  };
  const out = { file: figma.root.name, nodes: {}, frames: [] };
  for (const id of opts.ids) { const n = await figma.getNodeByIdAsync(id); out.nodes[id] = n ? h(sig(n)) : null; }
  if (opts.page) {
    await figma.loadAllPagesAsync();
    const pg = figma.root.children.find((p) => p.name === opts.page);
    for (const c of (pg ? pg.children : [])) {
      if (c.type === 'FRAME') out.frames.push({ id: c.id, name: c.name });
      if (c.type === 'SECTION') for (const k of c.children) if (k.type === 'FRAME') out.frames.push({ id: k.id, name: k.name });
    }
  }
  return JSON.stringify(out);
})()`;
function figcliRead(fileName, ids, page) {
  const os = require('os');
  const { execFileSync } = require('child_process');
  const cli = findFigCli();
  if (!cli) return { error: 'FigCli is not installed.' };
  const tmp = path.join(os.tmpdir(), `figma_sync_${process.pid}.js`);
  fs.writeFileSync(tmp, FIGCLI_SCRIPT.replace('__OPTS__', JSON.stringify({ ids, page })));
  try {
    const out = execFileSync(process.execPath, [path.join(cli, 'src', 'index.js'), 'eval', '--file', tmp], { env: { ...process.env, FIGMA_FILE: fileName }, encoding: 'utf8', timeout: 120000, maxBuffer: 64 << 20 });
    const a = out.indexOf('{'), b = out.lastIndexOf('}');
    let res = JSON.parse(out.slice(a, b + 1));
    if (typeof res === 'string') res = JSON.parse(res);
    if (res.file && res.file !== fileName) return { error: `FigCli answered from "${res.file}", not "${fileName}". Bring the Design file to Figma and try again.` };
    return res;
  } catch (e) { return { error: 'FigCli could not read Figma: ' + String(e.message || e).split('\n')[0].slice(0, 200) }; }
  finally { try { fs.unlinkSync(tmp); } catch {} }
}
async function figmaStateFigCli(dir) {
  const { design, page } = figmaFiles(dir);
  if (!design?.name) return { error: 'No Design file in status.json > figma.design_files.' };
  const defs = screenDefs(dir);
  const realId = (id) => /^I?\d+:\d+(;\d+:\d+)*$/.test(String(id));
  const ids = [...new Set(defs.flatMap((d) => Object.values(d.nodes)).filter(realId))];
  const r = figcliRead(design.name, ids, page);
  if (r.error) return { error: r.error };
  const screens = {};
  for (const d of defs) {
    if (!Object.values(d.nodes).some(realId)) { screens[d.slug] = { codeOnly: true }; continue; }
    const hs = Object.values(d.nodes).map((id) => r.nodes?.[id] ?? null);
    screens[d.slug] = hs.some((x) => !x) ? { exists: false } : { exists: true, hash: sha(hs.join('|')) };
  }
  const known = new Set(defs.map((d) => d.name.toLowerCase()));
  const seen = new Set(), newFrames = [];
  for (const fr of r.frames || []) {
    const b = stripPage(baseName(fr.name), page);
    if (known.has(b.toLowerCase()) || seen.has(b.toLowerCase())) continue;
    seen.add(b.toLowerCase()); newFrames.push({ id: fr.id, name: b });
  }
  return { screens, newFrames, file: design.name, fileKey: design.file_key, method: 'figcli' };
}
// FigCli first (no limits); Figma's REST API otherwise (its limits depend on the Figma plan and seat).
async function figmaState(dir, tok) {
  if (findFigCli() && await figcliUp()) {
    const r = await figmaStateFigCli(dir);
    if (!r.error) return r;
    if (!tok) return r;
  }
  const r = await figmaStateRest(dir, tok);
  if (r.error && !findFigCli()) return r;
  if (r.error && !(await figcliUp())) return { ...r, error: r.error + ' FigCli (no limits) is not connected either: open Figma Desktop and connect FigCli (Figma box > FigCli).' };
  return r;
}

async function figmaStateRest(dir, tok) {
  const { design, page } = figmaFiles(dir);
  if (!design?.file_key) return { error: 'No Design file key in status.json > figma.design_files.' };
  if (!tok) return { error: 'No Figma token on this computer, so Figma cannot be read (Connect services > Figma).' };
  const defs = screenDefs(dir);
  // only real Figma ids ("27:816"); a screen made code first has placeholders until it is added to Figma
  const realId = (id) => /^I?\d+:\d+(;\d+:\d+)*$/.test(String(id));
  const ids = [...new Set(defs.flatMap((d) => Object.values(d.nodes)).filter(realId))];
  const screens = {};
  if (ids.length) {
    const r = await figmaGet(`/v1/files/${encodeURIComponent(design.file_key)}/nodes?ids=${encodeURIComponent(ids.join(','))}&geometry=omit`, tok);
    if (r.error) return { error: r.error };
    for (const d of defs) {
      if (!Object.values(d.nodes).some(realId)) { screens[d.slug] = { codeOnly: true }; continue; }
      const docs = Object.values(d.nodes).map((id) => r.json.nodes?.[id]?.document || null);
      screens[d.slug] = docs.some((x) => !x) ? { exists: false } : { exists: true, hash: sha(docs.map(fingerprint).join('|')) };
    }
  }
  // new frames on the screens' page (frames directly on it or inside its sections)
  const newFrames = [];
  if (page) {
    // light requests: the page list (depth 1), then only the screens' page two levels down (its frames and sections)
    const top = await figmaGet(`/v1/files/${encodeURIComponent(design.file_key)}?depth=1`, tok);
    const pageId = (top.json?.document?.children || []).find((p) => p.name === page)?.id;
    const r = pageId ? await figmaGet(`/v1/files/${encodeURIComponent(design.file_key)}/nodes?ids=${encodeURIComponent(pageId)}&depth=2&geometry=omit`, tok) : { error: top.error || 'page not found' };
    if (!r.error) {
      const pg = r.json.nodes?.[pageId]?.document;
      const known = new Set(defs.map((d) => d.name.toLowerCase()));
      const frames = [];
      for (const c of pg?.children || []) { if (c.type === 'FRAME') frames.push(c); if (c.type === 'SECTION') for (const k of c.children || []) if (k.type === 'FRAME') frames.push(k); }
      const seen = new Set();
      for (const f of frames) {
        // the prototype drops the page prefix ("Listen / Explore - Full" -> "Explore - Full"), so compare without it
        const b = stripPage(baseName(f.name), page);
        if (known.has(b.toLowerCase()) || seen.has(b.toLowerCase())) continue;
        seen.add(b.toLowerCase());
        newFrames.push({ id: f.id, name: b });
      }
    }
  }
  return { screens, newFrames, file: design.name, fileKey: design.file_key, method: 'rest' };
}

function codeState(dir) {
  return Object.fromEntries(screenDefs(dir).map((d) => [d.slug, codeHash(dir, d.slug, d.name)]));
}
function pendingSlugs(dir) { return [...new Set(pendingToFigma(dir).map((i) => i.slug).filter(Boolean))]; }

// After a sync or a pull: both sides of these screens are the new baseline.
async function mark(dir, slugs, tok) {
  const snap = readJson(snapFile(dir), { screens: {} });
  const defs = screenDefs(dir);
  const fig = tok ? await figmaState(dir, tok) : { screens: {} };
  for (const slug of slugs) {
    const d = defs.find((x) => x.slug === slug);
    if (!d) continue;
    const fh = fig.screens?.[slug]?.hash;
    snap.screens[slug] = { name: d.name, nodes: d.nodes, figmaHash: fh ?? snap.screens[slug]?.figmaHash ?? null, figmaMethod: fh ? fig.method : snap.screens[slug]?.figmaMethod || null, codeHash: codeHash(dir, slug, d.name), syncedAt: new Date().toISOString() };
  }
  if (fig.fileKey) { snap.fileKey = fig.fileKey; snap.file = fig.file; }
  fs.mkdirSync(path.dirname(snapFile(dir)), { recursive: true });
  fs.writeFileSync(snapFile(dir), JSON.stringify(snap, null, 1) + '\n');
  return snap;
}

async function check(dir, tok) {
  const fig = await figmaState(dir, tok);
  const snapshot = readJson(snapFile(dir), { screens: {} });
  if (fig.error) return { error: fig.error, pending: pendingToFigma(dir) };
  // the first check is the baseline: nothing can be called changed before there is a "before"
  const baseline = !Object.keys(snapshot.screens || {}).length;
  if (baseline) { await mark(dir, screenDefs(dir).map((d) => d.slug), tok); }
  const rows = diffSync({ snapshot: baseline ? readJson(snapFile(dir)) : snapshot, figma: fig, code: codeState(dir), pendingSlugs: pendingSlugs(dir) });
  // owned conflicts get the owner's side as the proposal (sync-rules.json); unowned ones stay a question
  const rules = readRules(dir);
  const pend = pendingToFigma(dir);
  for (const r of rows) if (r.status === 'conflict') { const p = proposalFor(r.slug, rules, pend.filter((i) => i.slug === r.slug).map((i) => i.title)); if (p) r.proposal = p; }
  // the code repo: commits since the last sync (status.json > code_repo)
  const st = readJson(path.join(dir, 'status.json'), {});
  const repo = st.code_repo ? { url: /\.git$/.test(st.code_repo.url || st.code_repo) ? (st.code_repo.url || st.code_repo) : String(st.code_repo.url || st.code_repo).replace(/\/+$/, '') + '.git', branch: st.code_repo.branch || null } : null;
  let code = null;
  if (repo) {
    const snapNow = readJson(snapFile(dir), { screens: {} });
    const lg = codeLog(repo, snapNow.codeSyncedCommit || null);
    if (lg.error) code = { error: lg.error };
    else {
      if (!snapNow.codeSyncedCommit) { snapNow.codeSyncedCommit = lg.head; fs.writeFileSync(snapFile(dir), JSON.stringify(snapNow, null, 1) + '\n'); }
      code = { repo: repo.url.replace(/\.git$/, ''), head: lg.head, items: lg.items, baseline: !readJson(snapFile(dir), {}).codeSyncedCommit };
    }
  }
  const rebase = rows.filter((r) => r.rebaseline && r.status === 'baseline').map((r) => r.slug);
  if (rebase.length) await mark(dir, rebase, tok);
  const out = { checkedAt: new Date().toISOString(), baseline, method: fig.method, file: fig.file, rows, pending: pendingToFigma(dir), code };
  const snap2 = readJson(snapFile(dir), { screens: {} });
  snap2.lastCheck = { at: out.checkedAt, rows };
  fs.writeFileSync(snapFile(dir), JSON.stringify(snap2, null, 1) + '\n');
  return out;
}


// ----- Ownership rules: <project>/sync-rules.json (editable) -----
// Who owns what when both sides changed: e.g. colors, type, spacing and variables belong to Figma, component props and
// behavior to the code. An owned conflict gets the owner's side as the proposal (still applied only on the user's press);
// only unowned conflicts are asked as a question.
const DEFAULT_RULES = {
  _help: 'Who wins when Figma and the prototype/code both changed the same thing: "figma", "code" or null (ask). screens: per screen slug; categories: by what the change is about.',
  screens: {},
  categories: { colors: 'figma', typography: 'figma', spacing: 'figma', radius: 'figma', variables: 'figma', icons: 'figma', props: 'code', behavior: 'code', copy: null, layout: null },
};
const rulesFile = (dir) => path.join(dir, 'sync-rules.json');
function readRules(dir) {
  const r = readJson(rulesFile(dir), null);
  return r && typeof r === 'object' ? { ...DEFAULT_RULES, ...r, categories: { ...DEFAULT_RULES.categories, ...(r.categories || {}) }, screens: r.screens || {} } : DEFAULT_RULES;
}
function saveRules(dir, rules) {
  const clean = { _help: DEFAULT_RULES._help, screens: {}, categories: {} };
  const ok = (v) => v === 'figma' || v === 'code' || v === null;
  for (const [k, v] of Object.entries(rules?.screens || {})) if (/^[\w-]+$/.test(k) && ok(v)) clean.screens[k] = v;
  for (const [k, v] of Object.entries(rules?.categories || {})) if (/^[\w-]+$/.test(k) && ok(v)) clean.categories[k] = v;
  fs.writeFileSync(rulesFile(dir), JSON.stringify(clean, null, 2) + '\n');
  return clean;
}
// What a change is about, from its words.
const CATEGORY_WORDS = {
  colors: /colou?r|fill|palette|token|tint|contrast/i, typography: /font|type(face)?|text style|typography|weight|size \d/i,
  spacing: /spacing|padding|margin|gap|space/i, radius: /radius|corner|rounded/i, variables: /variable|mode|light\/dark/i, icons: /icon/i,
  props: /prop|variant|state|property|filter|option|toggle|field/i, behavior: /behaviou?r|interaction|navigat|flow|click|tap|scroll/i, copy: /copy|text|label|wording|translation|string/i, layout: /layout|section|order|remove|add|repeat/i,
};
function categorize(text) { return Object.entries(CATEGORY_WORDS).filter(([, re]) => re.test(String(text || ''))).map(([k]) => k); }
// The proposal for one conflicting screen: its own rule, else one owner shared by every category its changes touch.
function proposalFor(slug, rules, texts = []) {
  const own = rules?.screens?.[slug];
  if (own === 'figma' || own === 'code') return { side: own, why: `sync-rules.json gives ${slug} to ${own === 'figma' ? 'Figma' : 'the code'}` };
  const cats = [...new Set(texts.flatMap(categorize))];
  const owners = [...new Set(cats.map((c) => rules?.categories?.[c]).filter((v) => v === 'figma' || v === 'code'))];
  if (cats.length && owners.length === 1 && cats.every((c) => rules.categories[c] === owners[0])) return { side: owners[0], why: `${cats.join(', ')} belong to ${owners[0] === 'figma' ? 'Figma' : 'the code'} (sync-rules.json)` };
  return null;
}

// ----- The code repo as a third side: status.json > code_repo { url, branch } -----
// New commits since the last sync become items ("add to Figma?"); merges and housekeeping are left out.
function codeItems(logText) {
  return String(logText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => { const [sha, ...rest] = l.split('\t'); return { sha, subject: rest.join('\t').trim() }; })
    .filter((c) => c.sha && c.subject && !/^(merge\b|chore|bump|deps|ci\b|build\b|wip\b|revert "?merge)/i.test(c.subject));
}
function repoCache(url) { const os = require('os'); return path.join(os.homedir(), '.atomica', 'repos', sha(url)); }
function codeLog(repo, from) {
  const { execFileSync } = require('child_process');
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
  const dir = repoCache(repo.url);
  try {
    if (!fs.existsSync(path.join(dir, '.git')) && !fs.existsSync(path.join(dir, 'HEAD'))) { fs.mkdirSync(path.dirname(dir), { recursive: true }); execFileSync('git', ['clone', '--quiet', '--filter=blob:none', '--no-checkout', repo.url, dir], { env, timeout: 120000 }); }
    else execFileSync('git', ['-C', dir, 'fetch', '--quiet', 'origin'], { env, timeout: 120000 });
    const head = execFileSync('git', ['-C', dir, 'rev-parse', repo.branch ? `origin/${repo.branch}` : 'origin/HEAD'], { env, encoding: 'utf8' }).trim();
    if (!from) return { head, items: [] };
    const log = execFileSync('git', ['-C', dir, 'log', '--no-merges', '--format=%h%x09%s', `${from}..${head}`], { env, encoding: 'utf8', maxBuffer: 8 << 20 });
    return { head, items: codeItems(log) };
  } catch (e) { return { error: 'The code repo could not be read: ' + String(e.message || e).split('\n')[0].slice(0, 160) }; }
}

module.exports = { screenDefs, codeHash, pendingToFigma, diffSync, figmaState, mark, check, codeState, snapFile, slugify, baseName, stripPage, readRules, saveRules, proposalFor, categorize, codeItems, codeLog, DEFAULT_RULES };

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = args[0] && !args[0].startsWith('--') ? path.resolve(ROOT, args[0]) : null;
  if (!dir) { console.log(readText(__filename).split('\n').slice(1, 14).join('\n')); process.exit(2); }
  const tok = (() => { try { return require('./figma_versions.cjs').token(); } catch { return null; } })();
  (async () => {
    if (args.includes('--check')) console.log(JSON.stringify(await check(dir, tok), null, 1));
    else if (args.includes('--mark')) { const i = args.indexOf('--mark'); await mark(dir, String(args[i + 1] || '').split(',').filter(Boolean), tok); console.log('Marked as in sync.'); }
    else { const snap = readJson(snapFile(dir), { screens: {} }); console.log(JSON.stringify({ pending: pendingToFigma(dir), lastCheck: snap.lastCheck || null }, null, 1)); }
  })();
}

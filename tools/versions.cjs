#!/usr/bin/env node
// Version history for Vibe code / Code first projects (Abdul, 2026-11-09), like Lovable's History panel: every change
// is a version (a git commit), any version can be viewed read only, reverted to (a NEW version with the old content, so
// nothing is lost) or bookmarked. Everything stays on this computer: nothing here pushes.
//
// The versioned code is the project's app folder (`prototype/` today, or status.json > versions.app). Its git repo is
// the one that folder already belongs to (an imported Lovable / v0 repo keeps its own history and shows it); without one
// the project folder becomes a local repo. Only the app folder is snapshotted and reverted, never the brief, status or
// CHANGELOG.
//
// CLI (from the Root):
//   node tools/versions.cjs "My Projects/<P>" --list [--limit 50]
//   node tools/versions.cjs "My Projects/<P>" --snapshot "<what changed>"
//   node tools/versions.cjs "My Projects/<P>" --revert <sha>
//   node tools/versions.cjs "My Projects/<P>" --bookmark <sha> "<label>"   |   --unbookmark <sha>
//   node tools/versions.cjs "My Projects/<P>" --view <sha>                 (prints the folder of a read-only copy)
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const SHA = /^[0-9a-f]{7,40}$/i;
const BOOKMARK = 'atomica-bookmark-';
const IGNORE = ['node_modules/', 'dist/', '.env', '.env.*', '!.env.example', '.DS_Store', 'Thumbs.db'];

function git(cwd, args, opts = {}) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, timeout: opts.timeout || 60000, env: { ...process.env, ...(opts.env || {}) }, input: opts.input });
  return { ok: !r.error && r.status === 0, out: (r.stdout || '').trim(), err: ((r.stderr || '') + (r.error ? String(r.error) : '')).trim() };
}
// A commit needs a name and email; a computer without git config gets a local one (only on these commits).
function authorEnv(cwd) {
  if (git(cwd, ['config', 'user.email']).out) return {};
  return { GIT_AUTHOR_NAME: 'Atomica', GIT_AUTHOR_EMAIL: 'atomica@localhost', GIT_COMMITTER_NAME: 'Atomica', GIT_COMMITTER_EMAIL: 'atomica@localhost' };
}

// Versions are kept for code projects only: Vibe code (intake 0.0s) or Code first (status.json > prototype.design_mode).
function enabled(dir) {
  const s = readJson(path.join(path.resolve(dir), 'status.json'), {}) || {};
  return s.start === 'vibe-code' || s.prototype?.design_mode === 'code-first' || s.versions?.enabled === true;
}

// Where the app lives and which repo holds it.
function locate(dir) {
  dir = path.resolve(dir);
  const status = readJson(path.join(dir, 'status.json'), {}) || {};
  const appRel = String(status.versions?.app || 'prototype').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const app = path.join(dir, appRel);
  if (!fs.existsSync(app)) return { dir, app, exists: false };
  const top = git(app, ['rev-parse', '--show-toplevel']);
  // a repo above the project folder (e.g. the workflow Root itself) is not the project's: ignore it
  const root = top.ok && path.resolve(top.out).toLowerCase().startsWith(dir.toLowerCase()) ? path.resolve(top.out) : null;
  return { dir, app, exists: true, root, rel: root ? path.relative(root, app).replace(/\\/g, '/') || '.' : null };
}

// The project folder becomes a local repo (no remote is added, nothing is pushed), with a .gitignore that keeps
// packages, builds and key files out.
function ensureRepo(dir) {
  let loc = locate(dir);
  if (!loc.exists) return { ...loc, error: 'This project has no app folder yet (prototype/).' };
  if (!loc.root) {
    const r = git(loc.dir, ['init', '-q']);
    if (!r.ok) return { ...loc, error: `Could not start the version history: ${r.err}` };
  }
  loc = locate(dir);
  const gi = path.join(loc.root, '.gitignore');
  const have = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  const lines = new Set(have.split(/\r?\n/).map((l) => l.trim()));
  const add = IGNORE.filter((l) => !lines.has(l));
  if (add.length) fs.writeFileSync(gi, `${have}${have && !have.endsWith('\n') ? '\n' : ''}# Version history (tools/versions.cjs): packages, builds and keys stay out\n${add.join('\n')}\n`);
  return loc;
}

// The versions that touched the app folder, newest first, with bookmarks and the published one marked.
function list(dir, limit = 50) {
  const loc = locate(dir);
  if (!loc.exists || !loc.root) return { versions: [], repo: false };
  const head = git(loc.root, ['rev-parse', 'HEAD']);
  if (!head.ok) return { versions: [], repo: true };
  const log = git(loc.root, ['log', `-n${Math.max(1, Math.min(500, +limit || 50))}`, '--format=%H%x1f%h%x1f%cI%x1f%an%x1f%s', '--', loc.rel]);
  const marks = {};
  for (const line of git(loc.root, ['tag', '-l', `${BOOKMARK}*`, '--format=%(refname:short)%1f%(*objectname)%1f%(objectname)%1f%(contents:subject)']).out.split('\n').filter(Boolean)) {
    const [, peeled, obj, label] = line.split('\x1f');
    marks[peeled || obj] = label || 'Bookmark';
  }
  const pub = readJson(path.join(loc.app, 'data', 'publish.json'), null);
  const pubAt = pub?.commit ? null : Date.parse(pub?.at || '') || null;
  const versions = log.out.split('\n').filter(Boolean).map((l) => {
    const [sha, short, at, author, message] = l.split('\x1f');
    return { sha, short, at, author, message, bookmark: marks[sha] || null, published: false, current: sha === head.out };
  });
  // Published: the commit publish.json names, else the newest version made before the last publish
  const p = pub?.commit ? versions.find((v) => v.sha.startsWith(pub.commit)) : pubAt ? versions.find((v) => Date.parse(v.at) <= pubAt) : null;
  if (p) p.published = true;
  const dirty = git(loc.root, ['status', '--porcelain', '--', loc.rel]).out.length > 0;
  return { versions, repo: true, dirty, app: loc.rel };
}

// One version of whatever changed in the app folder. Nothing changed = no version. A key or token stops it.
function snapshot(dir, message) {
  const loc = ensureRepo(dir);
  if (loc.error) return { ok: false, error: loc.error };
  const changed = git(loc.root, ['status', '--porcelain', '-uall', '--', loc.rel]).out.split('\n').filter(Boolean)
    .map((l) => l.slice(3).replace(/^"|"$/g, '').replace(/^.* -> /, ''));
  if (!changed.length) return { ok: true, created: false };
  try {
    const { scanFiles } = require('./project_repo.cjs');
    const found = scanFiles(loc.root, changed.filter((f) => fs.existsSync(path.join(loc.root, f))));
    if (found.length) return { ok: false, error: `No version saved: possible keys in ${[...new Set(found.map((x) => x.file))].join(', ')}. Move them to .env.local (ignored) first.` };
  } catch { /* the scanner is optional here; the pre-commit guard still runs when it is on */ }
  const add = git(loc.root, ['add', '-A', '--', loc.rel]);
  if (!add.ok) return { ok: false, error: add.err };
  const msg = String(message || 'Change').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Change';
  const c = git(loc.root, ['commit', '-q', '-m', msg, '--', loc.rel], { env: authorEnv(loc.root) });
  if (!c.ok && !/nothing to commit/.test(c.out + c.err)) return { ok: false, error: c.err || c.out };
  return { ok: true, created: c.ok, sha: git(loc.root, ['rev-parse', 'HEAD']).out };
}

// Revert = a new version whose app folder equals the old one. Unsaved changes are saved first ("Before revert").
function revert(dir, sha) {
  if (!SHA.test(String(sha))) return { ok: false, error: 'bad version' };
  const loc = locate(dir);
  if (!loc.root) return { ok: false, error: 'No version history yet.' };
  if (!git(loc.root, ['cat-file', '-e', `${sha}^{commit}`]).ok) return { ok: false, error: 'That version is not in this project.' };
  const before = snapshot(dir, 'Before revert (unsaved changes)');
  if (!before.ok) return before;
  const when = git(loc.root, ['show', '-s', '--format=%cd', '--date=format:%b %d, %H:%M', sha]).out;
  // restore deletes tracked files the old version did not have and brings back the ones it had
  const r = git(loc.root, ['restore', `--source=${sha}`, '--staged', '--worktree', '--', loc.rel]);
  if (!r.ok) return { ok: false, error: r.err };
  const s = snapshot(dir, `Reverted to ${when} (${String(sha).slice(0, 7)})`);
  return s.ok ? { ...s, reverted: true } : s;
}

function bookmark(dir, sha, label) {
  const loc = locate(dir);
  if (!loc.root || !SHA.test(String(sha))) return { ok: false, error: 'bad version' };
  const full = git(loc.root, ['rev-parse', `${sha}^{commit}`]);
  if (!full.ok) return { ok: false, error: 'That version is not in this project.' };
  const name = `${BOOKMARK}${full.out.slice(0, 12)}`;
  const t = git(loc.root, ['tag', '-f', '-a', name, full.out, '-m', String(label || 'Bookmark').replace(/\s+/g, ' ').slice(0, 80)], { env: authorEnv(loc.root) });
  return t.ok ? { ok: true } : { ok: false, error: t.err };
}
function unbookmark(dir, sha) {
  const loc = locate(dir);
  if (!loc.root || !SHA.test(String(sha))) return { ok: false, error: 'bad version' };
  const full = git(loc.root, ['rev-parse', `${sha}^{commit}`]).out;
  git(loc.root, ['tag', '-d', `${BOOKMARK}${full.slice(0, 12)}`]);
  return { ok: true };
}

// A read-only copy of one version (a git worktree outside the project), so the dashboard can run its preview without
// touching the working folder. Packages are shared with the current app through a link (a junction on Windows).
function viewDir(loc, sha) { return path.join(os.homedir(), '.atomica', 'versions', path.basename(loc.dir).replace(/[^\w.-]+/g, '_'), String(sha).slice(0, 12)); }
function view(dir, sha) {
  if (!SHA.test(String(sha))) return { ok: false, error: 'bad version' };
  const loc = locate(dir);
  if (!loc.root) return { ok: false, error: 'No version history yet.' };
  const full = git(loc.root, ['rev-parse', `${sha}^{commit}`]);
  if (!full.ok) return { ok: false, error: 'That version is not in this project.' };
  const out = viewDir(loc, full.out);
  if (!fs.existsSync(path.join(out, '.git'))) {
    git(loc.root, ['worktree', 'prune']);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const w = git(loc.root, ['worktree', 'add', '--detach', '-f', out, full.out]);
    if (!w.ok) return { ok: false, error: w.err };
  }
  const app = loc.rel === '.' ? out : path.join(out, loc.rel);
  const mods = path.join(loc.app, 'node_modules'), link = path.join(app, 'node_modules');
  if (fs.existsSync(mods) && fs.existsSync(app) && !fs.existsSync(link)) {
    try { fs.symlinkSync(mods, link, process.platform === 'win32' ? 'junction' : 'dir'); } catch { /* the preview then says packages are missing */ }
  }
  return { ok: true, app, sha: full.out };
}
// Old read-only copies are removed (worktree remove keeps the real node_modules: the link is removed, not followed).
function clearViews(dir) {
  const loc = locate(dir);
  if (!loc.root) return { ok: true };
  const base = path.dirname(viewDir(loc, '0'));
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const p = path.join(base, d);
    for (const link of [path.join(p, 'node_modules'), path.join(p, loc.rel, 'node_modules')]) { try { if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link); } catch {} }
    git(loc.root, ['worktree', 'remove', '--force', p]);
  }
  git(loc.root, ['worktree', 'prune']);
  return { ok: true };
}

module.exports = { enabled, locate, ensureRepo, list, snapshot, revert, bookmark, unbookmark, view, clearViews, BOOKMARK };

if (require.main === module) {
  const [dir, flag, a, b] = process.argv.slice(2);
  if (!dir || !flag) { console.error('Usage: node tools/versions.cjs "My Projects/<P>" --list | --snapshot "<msg>" | --revert <sha> | --bookmark <sha> "<label>" | --unbookmark <sha> | --view <sha>'); process.exit(2); }
  const r = flag === '--list' ? list(dir, a === '--limit' ? b : 50)
    : flag === '--snapshot' ? snapshot(dir, a)
    : flag === '--revert' ? revert(dir, a)
    : flag === '--bookmark' ? bookmark(dir, a, b)
    : flag === '--unbookmark' ? unbookmark(dir, a)
    : flag === '--view' ? view(dir, a)
    : { ok: false, error: `unknown option ${flag}` };
  console.log(JSON.stringify(r, null, 1));
  process.exit(r.ok === false ? 1 : 0);
}

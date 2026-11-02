#!/usr/bin/env node
// One GitHub repo per project (Abdul, 2026-11-02, the-live-prototype branch): the project folder in My Projects is the
// repo and holds everything a second designer needs (brief, decisions, status.json, CHANGELOG, data, skills, audits,
// the prototype's and the Storybook's code). Its GitHub Pages site carries both live links: /<repo>/prototype/ and
// /<repo>/storybook/, with a small link page at /<repo>/. This file holds the shared logic for the dashboard, the
// publish tools and the tests:
//   secrets   scanText / scanFiles / installHook: a pre-commit and pre-publish guard; keys stay in ~/.atomica
//   files     auditFiles: what is not uploaded yet, what stays on this computer and why
//   pages     pagesPlan / pushPages / linkPage: the one-repo Pages layout (status.json > github.pages = "project-repo")
//   access    access / requestAccess / pendingRequests / approveRequest / sendForReview: edit rights and reviews
//   editor    editorState / claim / handOver / requestTakeover: one editor at a time (status.json > current_editor)
//   open      openFromGitHub / setupCheck: clone a shared project and list what this computer still needs
//   comments  publicSupabase / recordPublicSupabase: the comments' Supabase URL and public key travel with the project
// Project repos are always public (Abdul, 2026-11-02: the links stay inside the company), so nothing secret goes in:
// the guard blocks keys and tokens; the Supabase secret key and Figma tokens stay in ~/.atomica on each computer.
// Every GitHub call goes through `run` (git / gh), so the tests replace it; nothing here changes a repo's visibility.
// CLI (from the Root):
//   node tools/project_repo.cjs --scan-staged "<project folder>"   the pre-commit hook (exit 1 when a key is staged)
//   node tools/project_repo.cjs --audit "My Projects/<P>"          what is not uploaded (JSON)
//   node tools/project_repo.cjs --install-hook "My Projects/<P>"   turn the secrets guard on for this computer
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const readStatus = (dir) => readJson(path.join(dir, 'status.json'), {}) || {};
const writeStatus = (dir, s) => fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(s, null, 2) + '\n');
// git / gh, in the user's environment; throws with stderr on a failure (the tests pass their own).
function defaultRun(cmd, args, opts = {}) {
  const { userEnv } = require('./publish_checks.cjs');
  return execFileSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 120000, env: userEnv(), stdio: ['ignore', 'pipe', 'pipe'], ...opts });
}

// ---------- secrets ----------
const RULES = [
  ['GitHub token', /\b(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ['Figma token', /\bfigd_[A-Za-z0-9_-]{20,}/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI-style key', /\bsk-(?:proj-)?[A-Za-z0-9]{32,}/],
  ['Supabase secret key', /\bsb_secret_[A-Za-z0-9_-]{10,}/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  // a named secret with a value (an empty or placeholder value is fine)
  ['Secret in a config line', /\b(?:SUPABASE_SERVICE(?:_ROLE)?_KEY|FIGMA_(?:ACCESS_)?TOKEN|GITHUB_TOKEN|GH_TOKEN|ANTHROPIC_API_KEY|OPENAI_API_KEY)\s*[=:]\s*["']?(?!<|\$\{|your|xxx|\.\.\.)[^\s"'#,]{12,}/],
];
const JWT = /\beyJ[\w-]{10,}\.eyJ[\w-]{10,}\.[\w-]{10,}/g;
// A Supabase JWT is public only when its role is anon (the comments' public key); service_role is the secret one.
function jwtRole(token) {
  try { return JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')).role || null; } catch { return undefined; }
}
// Findings name the file, the line and the kind, never the value.
function scanText(text, file = '') {
  const out = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    for (const [kind, re] of RULES) if (re.test(line)) out.push({ file, line: i + 1, kind });
    for (const m of line.matchAll(JWT)) { const role = jwtRole(m[0]); if (role && role !== 'anon') out.push({ file, line: i + 1, kind: role === 'service_role' ? 'Supabase service key' : `Signed token (${role})` }); }
  });
  return out;
}
const TEXT_FILE = /\.(js|cjs|mjs|ts|tsx|jsx|json|md|mdx|txt|css|html|yml|yaml|toml|env|py|sh|cmd|ps1|ini|cfg|map|svg|xml|csv)$|(^|[\\/])\.env[^\\/]*$|(^|[\\/])[^.\\/]+$/i;
function scanFiles(dir, files) {
  const out = [];
  for (const f of files) {
    const p = path.isAbsolute(f) ? f : path.join(dir, f);
    let st; try { st = fs.statSync(p); } catch { continue; }
    if (!st.isFile() || st.size > 2 * 1024 * 1024 || !TEXT_FILE.test(f)) continue;
    out.push(...scanText(fs.readFileSync(p, 'utf8'), path.relative(dir, p).split(path.sep).join('/')));
  }
  return out;
}
const walk = (d) => { let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return []; } return e.flatMap((x) => (x.isDirectory() ? (x.name === '.git' || x.name === 'node_modules' ? [] : walk(path.join(d, x.name))) : [path.join(d, x.name)])); };
const scanDir = (d) => scanFiles(d, walk(d));
const secretsMessage = (found) => `Possible keys or tokens, nothing ${found.commit ? 'committed' : 'published'}:\n` +
  found.items.map((f) => `  ${f.file}:${f.line}  ${f.kind}`).join('\n') +
  '\nKeys stay on each computer in ~/.atomica (Connect services); remove the value from the file and try again.';

const HOOK_MARK = '# atomica-secrets-guard';
// The pre-commit hook of this computer's copy (not committed; each computer turns it on once, the dashboard offers it).
function installHook(dir) {
  const hooks = path.join(dir, '.git', 'hooks');
  if (!fs.existsSync(path.join(dir, '.git'))) return { ok: false, reason: 'This project folder is not a Git repo yet.' };
  const f = path.join(hooks, 'pre-commit');
  const prev = fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '';
  if (prev.includes(HOOK_MARK)) return { ok: true, already: true };
  const tool = path.join(ROOT, 'tools', 'project_repo.cjs').split(path.sep).join('/');
  const line = `${HOOK_MARK}\nnode "${tool}" --scan-staged "$(git rev-parse --show-toplevel)" || exit 1\n`;
  fs.mkdirSync(hooks, { recursive: true });
  fs.writeFileSync(f, prev ? prev.replace(/\s*$/, '\n') + line : `#!/bin/sh\n${line}`);
  try { fs.chmodSync(f, 0o755); } catch {}
  return { ok: true, appended: !!prev };
}
const hookOn = (dir) => { try { return fs.readFileSync(path.join(dir, '.git', 'hooks', 'pre-commit'), 'utf8').includes(HOOK_MARK); } catch { return false; } };

// ---------- files: what a second designer would miss ----------
const MACHINE = [/(^|\/)node_modules(\/|$)/, /(^|\/)dist(\/|$)/, /storybook-static(\/|$)/, /(^|\/)\.DS_Store$/, /(^|\/)Thumbs\.db$/, /(^|\/)\.cache(\/|$)/, /(^|\/)__pycache__(\/|$)/];
const SECRET_FILE = [/(^|\/)\.env([.\w-]*)?$/, /\.(pem|key|p12|pfx)$/i];
// Ignored on purpose, with the reason the files page shows.
const KNOWN_LOCAL = [[/^prototype\/comments(\/|$)/, 'comment cache: each computer pulls the comments from Supabase']];
function auditFiles(dir, run = defaultRun) {
  if (!fs.existsSync(path.join(dir, '.git'))) return { repo: false };
  const out = run('git', ['-C', dir, 'status', '--porcelain=v1', '--ignored', '-uall']);
  const res = { repo: true, notCommitted: [], localOnly: [], keptSecret: [], machine: 0, secrets: [] };
  for (const raw of String(out).split(/\r?\n/).filter(Boolean)) {
    const code = raw.slice(0, 2), file = raw.slice(3).replace(/^"|"$/g, '').replace(/^.* -> /, '');
    if (code === '!!') {
      if (MACHINE.some((r) => r.test(file))) { res.machine++; continue; }
      if (SECRET_FILE.some((r) => r.test(file))) { res.keptSecret.push(file); continue; }
      const known = KNOWN_LOCAL.find(([r]) => r.test(file));
      res.localOnly.push({ file, reason: known ? known[1] : null, upload: !known });
    } else if (code.trim() !== 'D') res.notCommitted.push({ file, change: code === '??' ? 'new' : 'changed' });
  }
  res.secrets = scanFiles(dir, res.notCommitted.map((x) => x.file));
  return res;
}

// ---------- pages: one repo, two live links ----------
function repoFromUrl(u) {
  const m = String(u || '').trim().match(/^(?:https:\/\/github\.com\/|git@github\.com:)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}
function projectRepo(dir, status = readStatus(dir), run = defaultRun) {
  const s = status.github?.repo || status.team?.repo;
  if (s) return repoFromUrl(s);
  try { return repoFromUrl(run('git', ['-C', dir, 'remote', 'get-url', 'origin']).trim()); } catch { return null; }
}
// Where Publish sends each part. "project-repo": the project's repo, at /prototype/ and /storybook/. Anything else keeps
// the older setup (the prototype in its own repo, the Storybook from its own workflow) until the user switches.
function pagesPlan(dir, status = readStatus(dir), run = defaultRun) {
  const repo = projectRepo(dir, status, run);
  if (status.github?.pages !== 'project-repo' || !repo) return { mode: 'separate', repo };
  const [owner, name] = repo.split('/');
  const site = `https://${owner}.github.io/${name}/`;
  return { mode: 'project-repo', repo, site, prototype: { base: `/${name}/prototype/`, url: `${site}prototype/`, subdir: 'prototype' }, storybook: { base: `/${name}/storybook/`, url: `${site}storybook/`, subdir: 'storybook' } };
}
const LINK_MARK = '<!-- atomica-link-page -->';
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The root page of the project's site: one link per published part (the folders present).
function linkPage(title, parts) {
  title = String(title).replace(/_/g, ' '); // a folder name reads as words
  const links = parts.map((p) => `<a href="./${p}/">${p === 'prototype' ? 'Live prototype' : 'Storybook design system'}<span>${p === 'prototype' ? 'Try the screens' : 'Tokens and components for developers'}</span></a>`).join('\n    ');
  return `<!doctype html>\n${LINK_MARK}\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>:root{color-scheme:light dark;--bg:#fafafa;--fg:#16181d;--mut:#5d6470;--card:#fff;--line:#e3e5e9}@media(prefers-color-scheme:dark){:root{--bg:#121417;--fg:#eceef1;--mut:#9aa1ab;--card:#1b1e23;--line:#2b2f36}}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,sans-serif}main{max-width:560px;margin:12vh auto;padding:0 16px}h1{font-size:28px;margin:0 0 4px}p{color:var(--mut);margin:0 0 24px}
a{display:block;padding:16px 18px;margin:0 0 12px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:inherit;text-decoration:none;font-weight:600}a:hover{border-color:var(--mut)}a span{display:block;font-weight:400;color:var(--mut);font-size:14px}</style></head>
<body><main><h1>${esc(title)}</h1><p>Made with the Atomica workflow.</p>
    ${links}
</main></body></html>\n`;
}
// Puts a built folder at <subdir>/ of the repo's gh-pages branch, keeps the other parts, refreshes the link page.
// Never a force push. Returns { changed }.
function pushPages({ repo, subdir, dist, title, run = defaultRun, message }) {
  const url = `https://github.com/${repo}.git`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomica-pages-'));
  try {
    let has = true;
    try { run('git', ['clone', '-q', '--depth', '1', '--branch', 'gh-pages', url, tmp]); } catch { has = false; }
    if (!has) { run('git', ['-C', tmp, 'init', '-q']); run('git', ['-C', tmp, 'checkout', '-q', '--orphan', 'gh-pages']); }
    // An older single-site publish at the root (no link page; e.g. the Storybook before the switch) gives way to the link
    // page: its files leave the root (they stay in the branch history); the parts' folders stay.
    const rootIdx = path.join(tmp, 'index.html');
    if (fs.existsSync(rootIdx) && !fs.readFileSync(rootIdx, 'utf8').includes(LINK_MARK)) {
      for (const e of fs.readdirSync(tmp)) if (!['.git', 'prototype', 'storybook'].includes(e)) fs.rmSync(path.join(tmp, e), { recursive: true, force: true });
    }
    const target = path.join(tmp, subdir);
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(dist, target, { recursive: true });
    const parts = ['prototype', 'storybook'].filter((p) => fs.existsSync(path.join(tmp, p)));
    fs.writeFileSync(rootIdx, linkPage(title || repo.split('/')[1], parts));
    fs.writeFileSync(path.join(tmp, '.nojekyll'), '');
    run('git', ['-C', tmp, 'add', '-A']);
    let changed = true;
    try { run('git', ['-C', tmp, '-c', 'user.name=Atomica', '-c', 'user.email=atomica@users.noreply.github.com', 'commit', '-q', '-m', message || `Publish ${subdir} (${new Date().toISOString().slice(0, 10)})`]); } catch { changed = false; }
    if (changed) run('git', ['-C', tmp, 'push', '-q', url, 'HEAD:gh-pages']);
    return { changed, parts };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

// ---------- access: who can edit, requests, reviews ----------
const ghLogin = (run = defaultRun) => { try { return run('gh', ['api', 'user', '--jq', '.login']).trim() || null; } catch { return null; } };
function access(repo, run = defaultRun) {
  const login = ghLogin(run);
  if (!login) return { login: null, signedIn: false, push: false, admin: false };
  try {
    const p = JSON.parse(run('gh', ['api', `repos/${repo}`, '--jq', '{permissions: .permissions, owner: .owner.login, private: .private}']));
    return { login, signedIn: true, owner: p.owner, private: !!p.private, push: !!p.permissions?.push, admin: !!p.permissions?.admin };
  } catch (e) { return { login, signedIn: true, push: false, admin: false, error: 'The repo could not be read (private, or the link is wrong).' }; }
}
const REQUEST_TITLE = 'Edit access request: ';
const requestBody = (login, project) => `${login} asks for edit access to the Atomica project "${project}".\n\nThe owner can approve it from the Atomica dashboard (the project > GitHub > Add as collaborator), or in GitHub Settings > Collaborators.`;
// An issue on the project repo; when issues cannot be created there, a prefilled link the user opens themselves.
function requestAccess(repo, project, run = defaultRun) {
  const login = ghLogin(run);
  if (!login) return { ok: false, error: 'Sign in with GitHub first (Connect services > GitHub).' };
  const title = REQUEST_TITLE + login;
  try {
    const open = JSON.parse(run('gh', ['issue', 'list', '--repo', repo, '--state', 'open', '--search', `"${title}" in:title`, '--json', 'url,title']) || '[]').find((i) => i.title === title);
    if (open) return { ok: true, url: open.url, already: true };
    const url = run('gh', ['issue', 'create', '--repo', repo, '--title', title, '--body', requestBody(login, project)]).trim().split(/\s+/).pop();
    return { ok: true, url };
  } catch {
    return { ok: true, manual: true, url: `https://github.com/${repo}/issues/new?${new URLSearchParams({ title, body: requestBody(login, project) })}` };
  }
}
function pendingRequests(repo, run = defaultRun) {
  try {
    return JSON.parse(run('gh', ['issue', 'list', '--repo', repo, '--state', 'open', '--search', `"${REQUEST_TITLE.trim()}" in:title`, '--json', 'number,title,author,createdAt,url']) || '[]')
      .filter((i) => i.title.startsWith(REQUEST_TITLE)).map((i) => ({ number: i.number, login: i.title.slice(REQUEST_TITLE.length).trim(), author: i.author?.login || null, at: i.createdAt, url: i.url }))
      .filter((r) => /^[\w-]+$/.test(r.login) && (!r.author || r.author.toLowerCase() === r.login.toLowerCase())); // only requests people made for themselves
  } catch { return []; }
}
// The owner's click: write access for that person, then the request issue is closed with a note.
function approveRequest(repo, request, run = defaultRun) {
  if (!/^[\w-]+$/.test(request?.login || '')) return { ok: false, error: 'Unknown request.' };
  run('gh', ['api', '-X', 'PUT', `repos/${repo}/collaborators/${request.login}`, '-f', 'permission=push']);
  if (request.number) { try { run('gh', ['issue', 'close', String(request.number), '--repo', repo, '--comment', 'Added as a collaborator from the Atomica dashboard. Accept the invitation from GitHub, then open the project again.']); } catch {} }
  return { ok: true };
}
const editBranch = (login) => `edit/${String(login).toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
// The owner merges; with merge_policy "editors", an editor may merge their own pull request too.
const mayMerge = (status, a) => !!(a?.admin || (status.github?.merge_policy === 'editors' && a?.push));
// Editors (not the owner) send their work as a pull request from edit/<login>; the secrets scan runs first.
function sendForReview(dir, { login, title, run = defaultRun }) {
  const found = scanFiles(dir, String(run('git', ['-C', dir, 'status', '--porcelain=v1', '-uall'])).split(/\r?\n/).filter(Boolean).map((l) => l.slice(3)));
  if (found.length) return { ok: false, error: secretsMessage({ items: found, commit: true }) };
  const branch = editBranch(login);
  run('git', ['-C', dir, 'checkout', '-q', '-B', branch]);
  run('git', ['-C', dir, 'add', '-A']);
  try { run('git', ['-C', dir, 'commit', '-q', '-m', title || 'Project changes']); } catch {}
  run('git', ['-C', dir, 'push', '-q', '-u', 'origin', branch]);
  let url = null;
  try { url = run('gh', ['pr', 'create', '--head', branch, '--title', title || 'Project changes', '--body', 'Sent for review from the Atomica dashboard.'], { cwd: dir }).trim().split(/\s+/).pop(); }
  catch { try { url = JSON.parse(run('gh', ['pr', 'view', branch, '--json', 'url'], { cwd: dir })).url; } catch {} }
  return { ok: true, branch, url };
}

// ---------- editor: one person edits at a time ----------
const STALE_HOURS = 12;
function editorState(status, me, now = Date.now()) {
  const e = status.current_editor || null;
  const since = e ? Date.parse(e.seen || e.since) : 0;
  const stale = !!e && now - since > STALE_HOURS * 3600e3;
  return { editor: e, mine: !!e && !!me && e.login === me, free: !e, stale, request: status.takeover_request || null, staleHours: STALE_HOURS };
}
function claim(status, me, now = new Date()) {
  status.current_editor = { login: me, since: now.toISOString(), seen: now.toISOString() };
  delete status.takeover_request;
  return status;
}
// Hand over: free the project (or give it straight to whoever asked).
function handOver(status, me, toRequester = false) {
  if (status.current_editor?.login !== me) return { ok: false, error: 'Only the current editor hands over.' };
  const req = status.takeover_request;
  if (toRequester && req) claim(status, req.by); else { delete status.current_editor; delete status.takeover_request; }
  return { ok: true };
}
// Take over: free -> yours; stale -> yours, with a note; someone active -> a request they answer (Hand over / Keep).
function requestTakeover(status, me, now = new Date()) {
  const s = editorState(status, me, now.getTime());
  if (s.free || s.mine) { claim(status, me, now); return { ok: true, took: true }; }
  if (s.stale) { const prev = s.editor.login; claim(status, me, now); return { ok: true, took: true, fromStale: prev }; }
  status.takeover_request = { by: me, at: now.toISOString() };
  return { ok: true, asked: s.editor.login };
}

// ---------- comments: the Supabase project travels with the repo ----------
// The URL and the public (anon / publishable) key are public by design (the live prototype carries them), so they are
// kept in status.json > comments and the next designer sees the same comments with no setup. Order: the project's
// prototype/.env.local, then status.json, then this computer's ~/.atomica/supabase.env. The secret key is never stored here.
const envOf = (f) => { try { return Object.fromEntries(fs.readFileSync(f, 'utf8').split(/\r?\n/).map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')])); } catch { return {}; } };
const isPublicKey = (k) => /^sb_publishable_[\w-]+$/.test(k || '') || (/^eyJ/.test(k || '') && jwtRole(k) === 'anon');
function publicSupabase(dir, home = os.homedir()) {
  const local = envOf(path.join(dir, 'prototype', '.env.local'));
  const st = readStatus(dir).comments || {};
  const shared = envOf(path.join(home, '.atomica', 'supabase.env'));
  const url = local.VITE_SUPABASE_URL || st.supabase_url || shared.VITE_SUPABASE_URL || null;
  const anonKey = local.VITE_SUPABASE_ANON_KEY || st.anon_key || shared.VITE_SUPABASE_ANON_KEY || null;
  return { url, anonKey: isPublicKey(anonKey) ? anonKey : null };
}
// Before an upload or publish: write the public pair into status.json (only a public key; a secret one is refused).
function recordPublicSupabase(dir, home = os.homedir()) {
  const pub = publicSupabase(dir, home);
  if (!pub.url || !pub.anonKey) return false;
  const s = readStatus(dir);
  if (s.comments?.supabase_url === pub.url && s.comments?.anon_key === pub.anonKey) return false;
  s.comments = { ...(s.comments || {}), supabase_url: pub.url, anon_key: pub.anonKey };
  writeStatus(dir, s);
  return true;
}

// ---------- open a shared project ----------
function openFromGitHub(link, { base = path.join(ROOT, 'My Projects'), run = defaultRun } = {}) {
  const repo = repoFromUrl(link);
  if (!repo) return { ok: false, error: 'Paste the project\'s GitHub link, e.g. https://github.com/owner/project.' };
  const tmp = path.join(base, `.open-${Date.now()}`);
  try { run('git', ['clone', '-q', `https://github.com/${repo}.git`, tmp]); }
  catch (e) { fs.rmSync(tmp, { recursive: true, force: true }); return { ok: false, error: /not found|could not read|Authentication|403|404/i.test(String(e.stderr || e.message)) ? 'GitHub could not open this repo: it is private and this account has no access, or the link is wrong. Ask the owner to add you, or use Request edit access.' : `Clone failed: ${String(e.stderr || e.message).trim().split('\n').pop()}` }; }
  const status = readStatus(tmp);
  if (!fs.existsSync(path.join(tmp, 'status.json'))) { fs.rmSync(tmp, { recursive: true, force: true }); return { ok: false, error: 'This repo is not an Atomica project (no status.json).' }; }
  const name = String(status.project && !/^</.test(status.project) ? status.project : repo.split('/')[1]).replace(/[\\/:*?"<>|]/g, '_');
  const dest = path.join(base, name);
  if (fs.existsSync(dest)) { fs.rmSync(tmp, { recursive: true, force: true }); return { ok: false, error: `My Projects/${name} is already on this computer; nothing was overwritten.`, name }; }
  fs.renameSync(tmp, dest);
  return { ok: true, name, dir: dest, repo };
}
// What this computer still needs for this project (no values are read out; only whether they exist).
function setupCheck(dir, { home = os.homedir(), env = process.env, run = defaultRun } = {}) {
  const has = (p) => fs.existsSync(path.join(dir, p));
  const supa = (() => { try { return fs.readFileSync(path.join(home, '.atomica', 'supabase.env'), 'utf8'); } catch { return ''; } })();
  const steps = [];
  const add = (key, label, ok, fix, optional = false) => steps.push({ key, label, ok, fix, optional });
  let gh = false; try { gh = !!run('gh', ['api', 'user', '--jq', '.login']).trim(); } catch {}
  add('github', 'GitHub sign-in', gh, 'Connect services > GitHub > Sign in with GitHub.');
  if (has('prototype/package.json')) add('prototype', 'Prototype packages', has('prototype/node_modules'), 'Run npm install in the prototype folder (Claude asks first).');
  if (has('storybook/package.json')) add('storybook', 'Storybook packages', has('storybook/node_modules'), 'Run npm install in the storybook folder (Claude asks first).');
  if (has('prototype/package.json')) {
    const pub = publicSupabase(dir, home);
    add('supabase', 'Comments (Supabase URL and public key)', !!(pub.url && pub.anonKey), 'They come with the project once its owner uploads it; or Connect services > Supabase.');
    add('supabase-secret', 'Answering comments (Supabase secret key)', /SUPABASE_SERVICE_KEY\s*=\s*\S/.test(supa), 'Only to resolve or reply: ask the project owner for the secret key and paste it once in Connect services > Supabase (it stays in ~/.atomica on this computer, never in the repo).', true);
  }
  const status = readStatus(dir);
  if (status.figma?.design_system?.file_key || (status.figma?.design_files || []).length) add('figma', 'Figma token (version checks, Sync)', !!(env.FIGMA_ACCESS_TOKEN || env.FIGMA_TOKEN), 'Add a Figma personal access token as FIGMA_ACCESS_TOKEN on this computer (Figma > Settings > Security).');
  add('guard', 'Secrets guard on this computer', hookOn(dir), 'Project > GitHub > Turn on the secrets guard.');
  return steps;
}

module.exports = { publicSupabase, recordPublicSupabase, isPublicKey, ghLogin, scanText, scanFiles, scanDir, secretsMessage, installHook, hookOn, auditFiles, repoFromUrl, projectRepo, pagesPlan, linkPage, pushPages, LINK_MARK,
  access, requestAccess, pendingRequests, approveRequest, editBranch, mayMerge, sendForReview, REQUEST_TITLE,
  editorState, claim, handOver, requestTakeover, STALE_HOURS, openFromGitHub, setupCheck, readStatus, writeStatus };

if (require.main === module) {
  const [cmd, target] = process.argv.slice(2);
  const dir = target ? path.resolve(ROOT, target) : null;
  if (cmd === '--scan-staged' && dir) {
    const files = String(defaultRun('git', ['-C', dir, 'diff', '--cached', '--name-only', '--diff-filter=ACM'])).split(/\r?\n/).filter(Boolean);
    const found = scanFiles(dir, files);
    if (found.length) { console.error(secretsMessage({ items: found, commit: true })); process.exit(1); }
  } else if (cmd === '--audit' && dir) console.log(JSON.stringify(auditFiles(dir), null, 1));
  else if (cmd === '--install-hook' && dir) console.log(JSON.stringify(installHook(dir)));
  else { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(13, 17).join('\n')); process.exit(2); }
}

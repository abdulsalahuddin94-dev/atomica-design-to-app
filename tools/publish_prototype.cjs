#!/usr/bin/env node
// Live Prototype trial (Screens_Handoff_Skill): publish a project's prototype to GitHub Pages in one command.
// Usage (from the Root, after tools/build_prototype.py):
//   node tools/publish_prototype.cjs "My Projects/<Project>" --repo <owner>/<name> [--create] [--title "<text>"]
//   node tools/publish_prototype.cjs "My Projects/<Project>" --repo <owner>/<name> --check   preflight only (JSON)
// --create  makes the repo (public) when it does not exist; never used without the user's yes.
// Builds <project>/prototype with Vite for the sub-path /<name>/, checks the build for secrets, pushes it to the repo's
// gh-pages branch (a normal commit on top of the last one, never a force push), and turns Pages on for that branch.
// Uses the gh-pages branch, not a GitHub Actions workflow, so no `workflow` token scope is needed. A new repo also gets
// a short README on its default branch. Prints the live URL. Comments: Vite reads prototype/.env.local (the public
// anon key, VITE_*); the build is refused if the service key from that file appears in it.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { userEnv, runChecks, errText } = require('./publish_checks.cjs');
const projectRepo = require('./project_repo.cjs');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);
const project = args[0] && !args[0].startsWith('--') ? path.resolve(ROOT, args[0]) : null;
// One repo per project (status.json > github.pages = "project-repo"): the prototype goes to the project's own repo at
// /<repo>/prototype/, next to its Storybook; otherwise the repo given with --repo, at its root (the older setup).
const plan = project ? projectRepo.pagesPlan(project) : { mode: 'separate' };
const shared = plan.mode === 'project-repo';
const repo = shared ? plan.repo : opt('--repo');
if (!project || !repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 9).join('\n'));
  process.exit(2);
}
const [owner, name] = repo.split('/');
const base = shared ? plan.prototype.base : `/${name}/`;
const liveUrl = shared ? plan.prototype.url : `https://${owner}.github.io/${name}/`;
const app = path.join(project, 'prototype');
// No shell: arguments go to the program as they are (no quoting problems, no Node DEP0190 warning).
// The user's full environment (home folders, Git and GitHub CLI on PATH), however this was started; prompts fail instead
// of waiting.
const ENV = userEnv();
const run = (cmd, a, o = {}) => execFileSync(cmd, a, Object.assign({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: ENV }, o));
const git = (cwd, ...a) => run('git', a, { cwd });

// 0. Preflight (tools/publish_checks.cjs): packages, Git, the repo (git, not gh), write access, Pages, gh (optional).
const pre = runChecks({ repo, app, env: ENV });
if (flag('--check')) { console.log(JSON.stringify(pre, null, 1)); process.exit(0); }
const failed = pre.checks.filter((c) => !c.ok && !c.optional && !(c.key === 'repo' && pre.repoState === 'missing' && flag('--create')));
if (failed.length) {
  // a repo that is truly missing needs the user's yes (--create); everything else gets its reason and fix
  const missing = failed.find((c) => c.key === 'repo' && (pre.repoState === 'missing' || pre.repoState === 'missing-or-private'));
  for (const c of failed) console.error(`${c.label}: ${c.reason} Fix: ${c.fix}`);
  if (missing && failed.length === 1) console.error(`Run again with --create (public repo) after the user's yes.`);
  console.error('Nothing published.');
  process.exit(missing && failed.length === 1 ? 4 : 6);
}
if (pre.repoState === 'missing' && flag('--create') && !pre.gh.signedIn) { console.error('Creating a repo needs the GitHub CLI signed in. Fix: run gh auth login, then try again. Nothing published.'); process.exit(6); }

// 1. Build for the sub-path.
console.log(`Building ${path.relative(ROOT, app)} for ${base} ...`);
const viteBin = path.join(app, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(viteBin)) { console.error(`No ${path.relative(ROOT, viteBin)}. Run npm install in the prototype folder first.`); process.exit(5); }
// Comments: the public Supabase URL and anon key come from the project's prototype/.env.local (Vite reads it) or,
// when it has none, from the shared ~/.atomica/supabase.env (one Supabase project for every Atomica project).
const readEnv = (f) => (fs.existsSync(f) ? Object.fromEntries(fs.readFileSync(f, 'utf8').split(/\r?\n/)
  .map((l) => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')])) : {});
const sharedEnv = readEnv(path.join(os.homedir(), '.atomica', 'supabase.env'));
const projectEnv = readEnv(path.join(app, '.env.local'));
const buildEnv = { ...process.env };
// the project's own Supabase pair (status.json > comments, committed) before this computer's shared file
const pub = projectRepo.publicSupabase(project);
if (pub.url && pub.anonKey) { buildEnv.VITE_SUPABASE_URL = pub.url; buildEnv.VITE_SUPABASE_ANON_KEY = pub.anonKey; }
else for (const k of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) if (!projectEnv[k] && sharedEnv[k]) buildEnv[k] = sharedEnv[k];
projectRepo.recordPublicSupabase(project);
delete buildEnv.SUPABASE_SERVICE_KEY;
run(process.execPath, [viteBin, 'build', '--base', base], { cwd: app, env: buildEnv });
const dist = path.join(app, 'dist');

// 2. No secrets in what goes public (tokens of GitHub, Figma, OpenAI / Anthropic style keys, private keys).
// The same scan as the projects' pre-commit guard (tools/project_repo.cjs); the Supabase anon key is public and allowed.
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const leaks = projectRepo.scanDir(dist);
if (leaks.length) { console.error(projectRepo.secretsMessage({ items: leaks })); process.exit(3); }
// The comments service key (SUPABASE_SERVICE_KEY, shared or project file) must never reach the build; the anon key may.
const services = [projectEnv.SUPABASE_SERVICE_KEY, sharedEnv.SUPABASE_SERVICE_KEY].filter(Boolean);
if (services.length && walk(dist).some((f) => services.some((k) => fs.readFileSync(f, 'utf8').includes(k)))) {
  console.error('The Supabase service key is in the build. Nothing published.');
  process.exit(3);
}

// 3. The repo: checked in the preflight; a missing one is created only with --create (the user's yes).
const exists = !(pre.repoState === 'missing' || pre.repoState === 'missing-or-private');
if (!exists) {
  run('gh', ['repo', 'create', repo, '--public', '--description', opt('--title', 'Live prototype built from a Figma Design file with the Atomica workflow')]);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proto-main-'));
  fs.writeFileSync(path.join(tmp, 'README.md'), [
    `# ${opt('--title', name)}`, '',
    'A trial live prototype made with Atomica Studio: every screen is generated from a Figma Design file and built only from its design system (the project tokens and its Storybook React components).', '',
    `Live: https://${owner}.github.io/${name}/`, '',
    'The `gh-pages` branch holds the built site. It is regenerated by `tools/publish_prototype.cjs`; do not edit it by hand.', '',
  ].join('\n'));
  git(tmp, 'init', '-q', '-b', 'main');
  git(tmp, 'add', 'README.md');
  git(tmp, 'commit', '-q', '-m', 'README');
  git(tmp, 'push', '-q', `https://github.com/${repo}.git`, 'main');
}

// 4. gh-pages: on top of the last publish (never force), else a new orphan branch. One repo per project: only the
// prototype/ folder is replaced; the Storybook and the link page stay.
let changed = true;
if (shared) {
  changed = projectRepo.pushPages({ repo, subdir: 'prototype', dist, title: opt('--title', path.basename(project)), run: (c, a, o) => run(c, a, o), message: `Publish prototype (${new Date().toISOString().slice(0, 10)})` }).changed;
} else {
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'proto-pages-'));
let hasPages = true;
try { git(os.tmpdir(), 'clone', '-q', '--depth', '1', '--branch', 'gh-pages', `https://github.com/${repo}.git`, tmp); } catch (e) { hasPages = false; }
if (!hasPages) { git(tmp, 'init', '-q'); git(tmp, 'checkout', '-q', '--orphan', 'gh-pages'); }
for (const f of fs.readdirSync(tmp)) if (f !== '.git') fs.rmSync(path.join(tmp, f), { recursive: true, force: true });
fs.cpSync(dist, tmp, { recursive: true });
fs.writeFileSync(path.join(tmp, '.nojekyll'), '');
git(tmp, 'add', '-A');
try { git(tmp, 'commit', '-q', '-m', `Publish prototype (${new Date().toISOString().slice(0, 10)})`); } catch (e) { changed = false; }
if (changed) git(tmp, 'push', '-q', `https://github.com/${repo}.git`, 'HEAD:gh-pages');
fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(changed ? 'Pushed the build to gh-pages.' : 'gh-pages already has this build.');
// What the dashboard shows as "Last publish": the live link, when, and the build that went up.
const indexHtml = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
// Code projects: the version that went live, for the History panel's Published mark (tools/versions.cjs).
let commit = null;
try {
  const versions = require('./versions.cjs');
  if (versions.enabled(project)) { const s = versions.snapshot(project, 'Published'); if (s.ok) commit = versions.list(project, 1).versions[0]?.sha?.slice(0, 12) || null; }
} catch (e) { /* no history: the panel marks the newest version before the publish time instead */ }
fs.writeFileSync(path.join(app, 'data', 'publish.json'), JSON.stringify({
  url: liveUrl, repo, at: new Date().toISOString(),
  build: (indexHtml.match(/assets\/index-([\w-]+)\.js/) || [])[1] || null, changed, commit,
}, null, 1) + '\n');

// 5. Pages from gh-pages /. Already on for a repo published before, so a gh problem here only warns.
try { run('gh', ['api', `repos/${repo}/pages`]); } catch (e) {
  try {
    run('gh', ['api', '-X', 'POST', `repos/${repo}/pages`, '-f', 'source[branch]=gh-pages', '-f', 'source[path]=/']);
    console.log('GitHub Pages turned on (gh-pages, /).');
  } catch (e2) { console.log(`Note: could not check GitHub Pages with gh (${errText(e2)}); if this is the first publish, turn Pages on for the gh-pages branch in the repo settings.`); }
}
console.log(`Live (after the Pages build, about a minute): ${liveUrl}`);

// Publish preflight (Screens_Handoff_Skill): can this computer publish this project's prototype to GitHub Pages?
// One source for tools/publish_prototype.cjs (before every publish, and `--check`), the dashboard and the tests.
// Each check: { key, label, ok, optional, reason, fix }. An auth or network problem is never reported as "not found".
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// The user's full environment, however the caller was started (a dashboard from a shortcut, a service, a terminal):
// home folders, and the usual Git and GitHub CLI folders on PATH. GH_TOKEN / GITHUB_TOKEN pass through when set.
function userEnv(base = process.env) {
  const env = { ...base };
  const home = os.homedir();
  env.HOME = env.HOME || home;
  env.USERPROFILE = env.USERPROFILE || home;
  if (process.platform === 'win32') {
    env.APPDATA = env.APPDATA || path.join(home, 'AppData', 'Roaming');
    env.LOCALAPPDATA = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
    const pf = env.ProgramFiles || 'C:\\Program Files';
    const extra = [path.join(pf, 'GitHub CLI'), path.join(pf, 'Git', 'cmd'), path.join(env.LOCALAPPDATA, 'Programs', 'Git', 'cmd')];
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path';
    const parts = String(env[key] || '').split(';').filter(Boolean);
    for (const e of extra) if (fs.existsSync(e) && !parts.some((p) => p.toLowerCase() === e.toLowerCase())) parts.push(e);
    env[key] = parts.join(';');
  } else {
    const parts = String(env.PATH || '').split(':');
    for (const e of ['/opt/homebrew/bin', '/usr/local/bin']) if (fs.existsSync(e) && !parts.includes(e)) parts.push(e);
    env.PATH = parts.join(':');
  }
  // never wait on a hidden password prompt: fail with a message instead
  env.GIT_TERMINAL_PROMPT = '0';
  env.GCM_INTERACTIVE = 'never';
  return env;
}

// What a git or gh error means. "Repository not found" is also what GitHub answers for a private repo when you are not
// signed in, so a not-found from git is confirmed with gh when gh is signed in.
function classifyError(text) {
  const t = String(text || '').toLowerCase();
  if (/enoent|is not recognized|command not found|no such file or directory.*(git|gh)\b/.test(t)) return 'missing-tool';
  if (/could not resolve host|failed to connect|connection timed out|timed out|network is unreachable|unable to access.*(ssl|tls)|getaddrinfo/.test(t)) return 'network';
  if (/authentication failed|could not read username|terminal prompts disabled|invalid username or password|permission to .* denied|403|access denied|gh auth login|not logged in|bad credentials|requires authentication|401/.test(t)) return 'auth';
  if (/repository .*not found|could not resolve to a repository|not found|404/.test(t)) return 'not-found';
  return 'other';
}
const errText = (e) => String((e && (e.stderr || e.stdout || e.message)) || e).trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' ');

function makeRun(env) {
  return (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, env, ...opts });
}

// The checks. repo is "owner/name"; app is the project's prototype folder.
function runChecks({ repo, app, env = userEnv(), run = makeRun(env), siteHead = null }) {
  const checks = [];
  const add = (c) => { checks.push({ optional: false, ...c }); return c.ok; };
  const url = `https://github.com/${repo}.git`;

  add({ key: 'build', label: 'Prototype packages', ok: fs.existsSync(path.join(app, 'node_modules', 'vite', 'bin', 'vite.js')),
    reason: 'The prototype\'s packages (Vite) are not installed.', fix: 'Run npm install in the project\'s prototype folder (or ask Claude in the Design chat).' });

  let gitOk = true;
  try { run('git', ['--version']); } catch (e) { gitOk = false; }
  add({ key: 'git', label: 'Git', ok: gitOk, reason: 'Git is not installed or not on PATH.', fix: 'Install Git (https://git-scm.com/downloads), then restart the dashboard.' });

  // gh: optional; needed only to create a new repo and to turn Pages on the first time
  let gh = { installed: true, signedIn: false, error: null };
  try { run('gh', ['--version']); } catch (e) { gh.installed = false; }
  if (gh.installed) { try { run('gh', ['auth', 'status', '--hostname', 'github.com']); gh.signedIn = true; } catch (e) { gh.error = errText(e); } }
  add({ key: 'gh', label: 'GitHub CLI (optional)', optional: true, ok: gh.installed && gh.signedIn,
    reason: !gh.installed ? 'The GitHub CLI (gh) is not installed. Publishing works without it; it is needed only to create a new repo or turn Pages on.' : 'The GitHub CLI is not signed in here. Publishing works without it; it is needed only to create a new repo or turn Pages on.',
    fix: !gh.installed ? 'Install it from https://cli.github.com, then run: gh auth login' : 'Run: gh auth login (Connect services > GitHub > Sign in), then restart the dashboard.' });

  let repoState = 'unknown';
  let heads = '';
  if (gitOk) {
    try { heads = run('git', ['ls-remote', '--heads', url], { cwd: os.tmpdir() }); repoState = 'exists'; }
    catch (e) {
      const kind = classifyError(errText(e));
      if (kind === 'not-found' && gh.signedIn) {
        try { run('gh', ['repo', 'view', repo, '--json', 'name']); repoState = 'exists-private'; }
        catch (e2) { repoState = classifyError(errText(e2)) === 'not-found' ? 'missing' : classifyError(errText(e2)); }
      } else repoState = kind === 'not-found' ? 'missing-or-private' : kind;
    }
  }
  const repoMsg = {
    missing: [`${repo} does not exist on GitHub yet.`, 'Create it from the Publish panel (Create the repo, after your yes), or check the repo name in the project settings.'],
    'missing-or-private': [`${repo} was not found. It does not exist yet, or it is private and this computer is not signed in to GitHub.`, 'If it is new: create it from the Publish panel. If it is private: sign in to GitHub (gh auth login, or Git asks you the first time you push).'],
    auth: [`GitHub refused this computer for ${repo} (not signed in, or no access).`, 'Sign in to GitHub: run gh auth login, or push once from a terminal so Git saves your sign-in. Then check again.'],
    network: ['GitHub could not be reached (network, proxy or VPN).', 'Check the internet connection or proxy, then check again.'],
    'missing-tool': ['Git could not run.', 'Install Git, then restart the dashboard.'],
    other: [`Could not check ${repo} on GitHub.`, 'Run git ls-remote https://github.com/' + repo + '.git in a terminal to see the error.'],
    unknown: ['Not checked (Git is missing).', 'Install Git first.'],
  }[repoState] || [null, null];
  add({ key: 'repo', label: 'GitHub repo', ok: repoState === 'exists' || repoState === 'exists-private', state: repoState, reason: repoMsg[0], fix: repoMsg[1] });

  // write access: a dry-run push of a throwaway ref authenticates for writing without writing anything
  if (repoState === 'exists' || repoState === 'exists-private') {
    let canPush = true, why = '';
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomica-push-check-'));
    try {
      run('git', ['init', '-q'], { cwd: tmp });
      run('git', ['-c', 'user.name=atomica', '-c', 'user.email=atomica@localhost', 'commit', '-q', '--allow-empty', '-m', 'check'], { cwd: tmp });
      run('git', ['push', '--dry-run', '-q', url, 'HEAD:refs/heads/atomica-access-check'], { cwd: tmp });
    } catch (e) { canPush = false; why = classifyError(errText(e)); }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    add({ key: 'push', label: 'Write access', ok: canPush,
      reason: why === 'network' ? 'GitHub could not be reached for the push check.' : `This computer cannot push to ${repo} (not signed in to GitHub in Git, or no write access).`,
      fix: why === 'network' ? 'Check the connection, then check again.' : 'Sign in once: run gh auth login and choose "Login with a web browser", or push once from a terminal so Git saves your sign-in. If the repo belongs to someone else, ask for write access.' });
    // Pages: on when the site answers, or (with gh) when the API says so
    let pages = siteHead;
    if (pages === null && gh.signedIn) { try { run('gh', ['api', `repos/${repo}/pages`]); pages = true; } catch { pages = false; } }
    add({ key: 'pages', label: 'GitHub Pages', optional: true, ok: pages !== false || !/refs\/heads\/gh-pages/.test(heads),
      reason: 'GitHub Pages is not turned on for this repo yet.', fix: 'The first publish turns it on when the GitHub CLI is signed in; otherwise: repo Settings > Pages > Branch gh-pages, folder / (root).' });
  }
  const blocking = checks.filter((c) => !c.ok && !c.optional);
  return { ok: blocking.length === 0, repo, repoState, gh, checks };
}

module.exports = { userEnv, classifyError, runChecks, errText, makeRun };

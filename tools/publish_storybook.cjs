#!/usr/bin/env node
// One repo per project: publish a project's Storybook to /<repo>/storybook/ of the project's own GitHub Pages site, next to
// the prototype (tools/project_repo.cjs > pushPages). Runs only when the project's Storybook is on and "Public link for
// developers" is checked (status.json > storybook, tools/storybook_sections.cjs), and the project uses the one-repo
// layout (status.json > github.pages = "project-repo"); the user presses Publish, Claude never publishes on its own.
// Usage (from the Root): node tools/publish_storybook.cjs "My Projects/<Project>" [--check]
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { userEnv } = require('./publish_checks.cjs');
const projectRepo = require('./project_repo.cjs');
const sections = require('./storybook_sections.cjs');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const project = args[0] && !args[0].startsWith('--') ? path.resolve(ROOT, args[0]) : null;
if (!project) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 6).join('\n')); process.exit(2); }

// What blocks a publish, in words the dashboard shows as they are.
function checks(dir) {
  const cfg = sections.readConfig(dir);
  const plan = projectRepo.pagesPlan(dir);
  const sb = path.join(dir, 'storybook');
  const out = [];
  const add = (key, ok, reason, fix) => out.push({ key, ok, reason, fix });
  add('enabled', cfg.enabled, 'Storybook is off for this project.', 'Project > Storybook > Enable Storybook design system.');
  add('pages', cfg.sections.includes('pages'), '"Public link for developers" is not checked.', 'Project > Storybook > Publishing > Public link for developers.');
  add('layout', plan.mode === 'project-repo', 'This project does not publish to its own repo yet.', 'Project > GitHub > Live links: One repo (/prototype/ and /storybook/).');
  add('built', fs.existsSync(path.join(sb, 'package.json')), 'The Storybook is not built yet.', 'Project > Storybook > Build / update in chat.');
  add('packages', fs.existsSync(path.join(sb, 'node_modules', 'storybook')), 'The Storybook packages are not installed on this computer.', 'Run npm install in the storybook folder (Claude asks first).');
  return { ok: out.every((c) => c.ok), plan, checks: out };
}
const pre = checks(project);
if (args.includes('--check')) { console.log(JSON.stringify(pre, null, 1)); process.exit(0); }
if (!pre.ok) { for (const c of pre.checks.filter((x) => !x.ok)) console.error(`${c.reason} Fix: ${c.fix}`); console.error('Nothing published.'); process.exit(6); }

const sb = path.join(project, 'storybook');
const out = path.join(sb, 'storybook-static');
const ENV = userEnv();
const run = (cmd, a, o = {}) => execFileSync(cmd, a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: ENV, ...o });
console.log(`Building the Storybook for ${pre.plan.storybook.base} ...`);
// the CLI entry from the package itself (its path changed between Storybook versions)
const pkg = JSON.parse(fs.readFileSync(path.join(sb, 'node_modules', 'storybook', 'package.json'), 'utf8'));
const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.storybook || Object.values(pkg.bin)[0];
run(process.execPath, [path.join(sb, 'node_modules', 'storybook', bin), 'build', '-o', out, '--quiet'], { cwd: sb, stdio: 'inherit' });
const leaks = projectRepo.scanDir(out);
if (leaks.length) { console.error(projectRepo.secretsMessage({ items: leaks })); process.exit(3); }
const r = projectRepo.pushPages({ repo: pre.plan.repo, subdir: 'storybook', dist: out, title: path.basename(project), run, message: `Publish Storybook (${new Date().toISOString().slice(0, 10)})` });
const s = projectRepo.readStatus(project);
s.storybook_url = pre.plan.storybook.url;
projectRepo.writeStatus(project, s);
console.log(r.changed ? 'Pushed the Storybook to gh-pages.' : 'gh-pages already has this Storybook.');
console.log(`Live (after the Pages build, about a minute): ${pre.plan.storybook.url}`);

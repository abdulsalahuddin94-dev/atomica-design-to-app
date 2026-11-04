#!/usr/bin/env node
// No hover on mobile (Abdul, 2026-10-28): a mobile project (Android, iOS, cross-platform, Mobile Adaptive) has no Hover
// state. This check lists what still has one, so it cannot slip back:
//   - component-registry.json: a State option named Hover / Hovered
//   - the project's Storybook styles and components: :hover rules, data-state="Hovered", a "Hovered" state option
//   - the prototype's generated screens: :hover rules or Tailwind hover: classes inside the device
// The Storybook docs pages and the prototype's own controls (outside the device) are desktop UI and are not counted.
// Usage (from the Root): node tools/check_no_hover.cjs "My Projects/<Project>" [--json]
// Exit 1 when a mobile project has findings; a Web project is skipped (exit 0).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const readJson = (f) => { try { return JSON.parse(read(f)); } catch { return null; } };

// Mobile when the brief says so (intake 1.1), or when every prototype screen is narrower than 600.
function isMobileProject(dir) {
  const brief = read(path.join(dir, 'Project_Brief.md'));
  const m = brief.match(/\|\s*1\.1\s*\|[^|]*\|\s*([^|\n]*)\|/);
  if (m && /mobile|android|ios/i.test(m[1])) return true;
  if (m && /web/i.test(m[1])) return false;
  const status = readJson(path.join(dir, 'status.json')) || {};
  if (status.mobile_setup) return true;
  const widths = [...read(path.join(dir, 'prototype', 'src', 'generated', 'routes.tsx')).matchAll(/\bw:\s*(\d+)/g)].map((x) => +x[1]);
  return widths.length > 0 && widths.every((w) => w < 600);
}

function walk(d, filter, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, filter, out); else if (filter(p)) out.push(p);
  }
  return out;
}

function findHover(dir) {
  const findings = [];
  const rel = (p) => path.relative(dir, p).replace(/\\/g, '/');
  const reg = readJson(path.join(dir, 'data', 'component-registry.json'));
  // any key with "state" in its name, at any depth of a component entry, whose list holds Hover / Hovered
  const scan = (name, node, trail) => {
    if (Array.isArray(node)) { if (/state/i.test(trail.at(-1) || "")) for (const v of node) if (typeof v === "string" && /^hover(ed)?$/i.test(v)) findings.push({ where: "registry", file: "data/component-registry.json", item: `${name} · ${trail.at(-1)}=${v}` }); return; }
    if (node && typeof node === "object") for (const [k, v] of Object.entries(node)) scan(name, v, [...trail, k]);
  };
  for (const c of reg?.components || []) scan(c.name, c, []);
  const sb = path.join(dir, 'storybook', 'src');
  for (const f of walk(sb, (p) => /\.(css|tsx|ts)$/.test(p) && !/[\\/]docs[\\/]/.test(p) && !/\.stories\./.test(p))) {
    read(f).split(/\r?\n/).forEach((line, i) => {
      if (/^\s*(\/\/|\/\*|\*)/.test(line)) return; // comment lines only describe
      if (/:hover\b/.test(line) || /data-state="Hovered"|['"]Hovered['"]/.test(line)) findings.push({ where: 'storybook', file: `${rel(f)}:${i + 1}`, item: line.trim().slice(0, 140) });
    });
  }
  const gen = path.join(dir, 'prototype', 'src', 'generated');
  for (const f of walk(gen, (p) => /\.(css|tsx|ts)$/.test(p))) {
    read(f).split(/\r?\n/).forEach((line, i) => {
      if (/:hover\b|\bhover:[\w[]/.test(line)) findings.push({ where: 'prototype', file: `${rel(f)}:${i + 1}`, item: line.trim().slice(0, 140) });
    });
  }
  return findings;
}

module.exports = { isMobileProject, findHover };

if (require.main === module) {
  const arg = process.argv[2];
  if (!arg || arg.startsWith('--')) { console.log(read(__filename).split('\n').slice(1, 9).join('\n')); process.exit(2); }
  const dir = path.resolve(ROOT, arg);
  const mobile = isMobileProject(dir);
  const findings = mobile ? findHover(dir) : [];
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ project: path.basename(dir), mobile, findings }, null, 1)); }
  else if (!mobile) console.log(`${path.basename(dir)}: not a mobile project; hover is allowed (Web).`);
  else if (!findings.length) console.log(`${path.basename(dir)}: no hover found (mobile). OK.`);
  else {
    console.log(`${path.basename(dir)} is mobile: ${findings.length} hover finding(s). Mobile uses Pressed (and Focused) instead of Hover.`);
    for (const f of findings) console.log(`- [${f.where}] ${f.file}  ${f.item}`);
  }
  process.exit(mobile && findings.length ? 1 : 0);
}

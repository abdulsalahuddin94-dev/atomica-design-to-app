#!/usr/bin/env node
// Storybook is opt-in, by sections (Abdul, 2026-11-02): one switch per project ("Enable Storybook design system", off by
// default, Code first or Figma first) and a checklist of what goes up; only checked sections are built, so nothing else
// costs time or tokens. Saved in <project>/status.json > storybook { enabled, sections: [...], components: "all" | [...] }.
// Used by the dashboard (Storybook page, Connect services), the Storybook skill (what to generate) and the tests.
// Usage (from the Root): node tools/storybook_sections.cjs "My Projects/<Project>"   prints the plan (what to build)
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const readJson = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

// The checklist: groups of sections, each with an id, a label and an optional note.
const GROUPS = [
  { id: 'foundations', label: 'Foundations (tokens)', items: [
    ['colors-primitives', 'Colors: Primitives', 'the raw palette'],
    ['colors-semantic', 'Colors: Semantics', 'background, text, border... with Light/Dark'],
    ['typography', 'Typography', 'text styles: size, weight, line height'],
    ['spacing', 'Spacing'], ['radius', 'Radius'], ['effects', 'Shadows / Effects'],
    ['sizes', 'Sizes', 'heights of buttons, inputs, icons'], ['breakpoints', 'Breakpoints', 'Web'],
    ['icons', 'Icons', 'all of them, with search and copy name'], ['app-icon', 'App icon'],
  ] },
  { id: 'components', label: 'Components', items: [
    ['variants', 'Variants and states'], ['playground', 'Playground', 'try the props live'],
    ['show-code', 'Show code', 'copy the code as it is'], ['usage', 'When to use / not, Do and Don\'t'],
    ['a11y', 'Accessibility', 'contrast, touch size'], ['figma-link', 'Link to the component in Figma', 'Figma first only'],
  ] },
  { id: 'patterns', label: 'Patterns and screens (optional)', items: [['patterns', 'Patterns', 'forms, lists, empty states...'], ['screens', 'Full screens as examples']] },
  { id: 'docs', label: 'Docs pages', items: [['welcome', 'Welcome / Getting started', 'how a developer installs and uses the DS'], ['changelog', 'Changelog', 'what changed and when']] },
  { id: 'files', label: 'Code files to download', items: [['css-vars', 'CSS variables'], ['tailwind', 'Tailwind config'], ['tokens-json', 'tokens.json'], ['native', 'Swift / Kotlin', 'iOS / Android']] },
  { id: 'display', label: 'Display', items: [['dark', 'Light/Dark switch'], ['rtl', 'Arabic / RTL'], ['platform-switch', 'Platform switch', 'iOS/Android, Mobile Adaptive']] },
  { id: 'publish', label: 'Publishing', items: [['local', 'Local only on this computer'], ['pages', 'Public link for developers', 'GitHub Pages'], ['mcp', 'Storybook MCP', 'developers\' AI tools read the DS directly'], ['auto-update', 'Auto-update', 'with every Figma or code change']] },
];
const ALL = GROUPS.flatMap((g) => g.items.map((i) => i[0]));
const PRESETS = {
  tokens: { label: 'Tokens only', note: 'colors, type, spacing', sections: ['colors-primitives', 'colors-semantic', 'typography', 'spacing', 'css-vars', 'dark', 'local'], components: [] },
  developer: { label: 'What the developer needs', recommended: true, note: 'tokens + components with code', sections: ['colors-primitives', 'colors-semantic', 'typography', 'spacing', 'radius', 'sizes', 'icons', 'variants', 'playground', 'show-code', 'usage', 'welcome', 'css-vars', 'tailwind', 'dark', 'local'], components: 'all' },
  full: { label: 'The full DS', note: 'everything', sections: ALL.filter((s) => s !== 'local'), components: 'all' },
};

// Keeps only known sections and a valid component choice; disabled until the user turns it on.
function normalize(cfg = {}) {
  const sections = [...new Set((Array.isArray(cfg.sections) ? cfg.sections : []).filter((s) => ALL.includes(s)))];
  const components = cfg.components === 'all' ? 'all' : (Array.isArray(cfg.components) ? [...new Set(cfg.components.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim()))] : []);
  return { enabled: cfg.enabled === true, sections, components, preset: PRESETS[cfg.preset] ? cfg.preset : null, updatedAt: cfg.updatedAt || null };
}

// The components a project has: its registry (Figma first), or, for Code first, the component files of the linked repo
// (list of paths from the repo, e.g. "src/components/ui/button.tsx").
function componentsFromRegistry(registry) {
  return (registry?.components || []).map((c) => ({ name: c.name, group: c.group || c.category || c.page || null })).filter((c) => c.name);
}
function componentsFromFiles(files) {
  const out = [];
  for (const f of files) {
    const m = String(f).match(/(?:^|\/)components\/(?:(.+)\/)?([^/]+)\.(tsx|jsx|vue|svelte)$/i);
    if (!m || /\.(stories|test|spec)\./i.test(f) || /^index$/i.test(m[2])) continue;
    const name = m[2].replace(/[-_]+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toUpperCase());
    out.push({ name, group: m[1] ? m[1].split('/')[0] : null, file: f });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

// What to build, from the choices: the only thing the Storybook build reads.
function plan(cfg, available = []) {
  const c = normalize(cfg);
  if (!c.enabled) return { enabled: false, build: [] };
  const comps = c.components === 'all' ? available.map((x) => x.name) : c.components.filter((n) => !available.length || available.some((x) => x.name === n));
  const label = Object.fromEntries(GROUPS.flatMap((g) => g.items.map((i) => [i[0], i[1]])));
  return {
    enabled: true,
    build: c.sections.map((s) => ({ id: s, label: label[s] })),
    components: comps,
    componentDetail: c.sections.filter((s) => GROUPS[1].items.some((i) => i[0] === s)),
    skip: ALL.filter((s) => !c.sections.includes(s)),
  };
}

function readConfig(dir) { return normalize(readJson(path.join(dir, 'status.json'), {})?.storybook || {}); }
function saveConfig(dir, cfg) {
  const f = path.join(dir, 'status.json');
  const s = readJson(f, {});
  const c = normalize({ ...cfg, updatedAt: new Date().toISOString() });
  // keep the project's other Storybook facts (plan, url, sync dates); the plan answer follows the switch
  s.storybook = { ...(typeof s.storybook === 'object' && s.storybook ? s.storybook : {}), ...c };
  if (c.enabled) s.storybook_plan = 'yes';
  fs.writeFileSync(f, JSON.stringify(s, null, 2) + '\n');
  return c;
}

module.exports = { GROUPS, PRESETS, ALL, normalize, componentsFromRegistry, componentsFromFiles, plan, readConfig, saveConfig };

if (require.main === module) {
  const dir = process.argv[2] ? path.resolve(ROOT, process.argv[2]) : null;
  if (!dir) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 7).join('\n')); process.exit(2); }
  const avail = componentsFromRegistry(readJson(path.join(dir, 'data', 'component-registry.json'), {}));
  console.log(JSON.stringify(plan(readConfig(dir), avail), null, 1));
}

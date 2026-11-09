#!/usr/bin/env node
// Measures what the project Storybook really renders, for the Storybook style check (idea from storysync's `snap`,
// adopted 2026-10-11). For every component, variant and mode in <folder>/data/figma-styles.json (from
// tools/figma_styles.figma.js) it opens the story with those args and that mode, reads the computed styles of the
// component and writes <folder>/data/storybook-styles.json in the same shape. Then run tools/style_parity.py.
//
// Usage:  node tools/storybook_snap.cjs "<folder>" [--url http://localhost:6006] [--components "Button,Toggle"]
//                                        [--selector "<css>"] [--global <key>] [--timeout 10000]
// --url    a running Storybook (`npm run storybook`) or a served static build; default http://localhost:6006.
// --global the Storybook global that switches the Figma color mode (default: read from src/tokens/tokens.ts).
// Needs Playwright (the `playwright` package) in <folder>/storybook or globally, and Chrome, Edge or a Playwright
// Chromium. It is never installed by this tool: if it is missing the tool prints the command; ask the user first.
// Component root: the element with data-figma-component, else the first real box inside [data-figma-root] (a device
// frame's content area) or the story (wrappers with no background, border or padding are skipped). Use --selector when a story needs another root.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
if (!args[0] || args[0].startsWith('--')) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 15).join('\n')); process.exit(1); }
const folder = path.resolve(ROOT, args[0]);
const base = opt('--url', 'http://localhost:6006').replace(/\/$/, '');
const only = opt('--components', '') ? opt('--components').split(',').map((s) => s.trim()) : null;
const selector = opt('--selector', '');
const timeout = Number(opt('--timeout', '10000'));

function loadPlaywright() {
  for (const name of ['playwright', 'playwright-core']) {
    try { return require(require.resolve(name, { paths: [path.join(folder, 'storybook'), process.cwd(), ROOT] })); } catch (e) { /* next */ }
  }
  try { return require('playwright'); } catch (e) { return null; }
}

async function launch(pw) {
  const exe = process.env.STORYBOOK_SNAP_BROWSER || process.env.CHROME_PATH;
  const tries = exe ? [{ executablePath: exe }] : [{}, { channel: 'chrome' }, { channel: 'msedge' }];
  let last;
  for (const t of tries) {
    try { return await pw.chromium.launch({ headless: true, ...t }); } catch (e) { last = e; }
  }
  throw new Error('No browser found (tried Playwright Chromium, Chrome, Edge). Set STORYBOOK_SNAP_BROWSER to a Chrome path. ' + (last ? last.message.split('\n')[0] : ''));
}

// Figma collection -> Storybook global key (tokens.ts written by tools/tokens_to_css.py: attribute "data-<slug>").
function globalKey(collection) {
  try {
    const ts = fs.readFileSync(path.join(folder, 'storybook', 'src', 'tokens', 'tokens.ts'), 'utf8');
    const json = JSON.parse(ts.slice(ts.indexOf('=') + 1, ts.lastIndexOf(' as const')));
    const c = json.collections && json.collections[collection];
    if (c && c.attribute) return c.attribute.replace(/^data-/, '');
  } catch (e) { /* older Storybook: the global is named after the collection */ }
  return collection;
}

const URL_SAFE = /^[a-zA-Z0-9 _-]*$/;
const parseVariant = (name) => (name === 'Default' ? {} : Object.fromEntries(name.split(',').map((p) => p.split('=').map((s) => s.trim()))));

// Runs in the story iframe: picks the component root and reads its computed styles.
function measureInPage(sel) {
  const hex = (c) => {
    if (!c) return null;
    let m = c.match(/^rgba?\(([^)]+)\)/);
    let ch;
    if (m) { ch = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); ch[3] = ch[3] === undefined ? 1 : ch[3]; }
    else if ((m = c.match(/^color\(srgb ([^)]+)\)/))) { const v = m[1].split(/[ /]+/).filter(Boolean).map(Number); ch = [v[0] * 255, v[1] * 255, v[2] * 255, v[3] === undefined ? 1 : v[3]]; }
    else return c;
    if (ch[3] === 0) return null;
    const h = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0').toUpperCase();
    return '#' + h(ch[0]) + h(ch[1]) + h(ch[2]) + h(ch[3] * 255);
  };
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null; };
  const box = (el) => {
    const s = getComputedStyle(el);
    return hex(s.backgroundColor) || parseFloat(s.borderTopWidth) > 0 || parseFloat(s.paddingTop) > 0 || parseFloat(s.paddingLeft) > 0;
  };
  let el = sel ? document.querySelector(sel) : document.querySelector('[data-figma-component]');
  if (!el) {
    const start = document.querySelector('[data-figma-root]') || document.querySelector('#storybook-root .sb-canvas') || document.querySelector('#storybook-root');
    el = start && start.firstElementChild;
    while (el && !box(el) && el.children.length === 1) el = el.firstElementChild;
  }
  if (!el) return { error: 'no component root found' };
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const bw = s.borderTopStyle !== 'none' ? px(s.borderTopWidth) : 0;
  const out = {
    fill: hex(s.backgroundColor),
    stroke: bw > 0 ? hex(s.borderTopColor) : null,
    strokeWeight: 0,
    radius: Math.min(px(s.borderTopLeftRadius) || 0, Math.min(r.width, r.height) / 2),
    paddingTop: px(s.paddingTop) + px(s.borderTopWidth),
    paddingRight: px(s.paddingRight) + px(s.borderRightWidth),
    paddingBottom: px(s.paddingBottom) + px(s.borderBottomWidth),
    paddingLeft: px(s.paddingLeft) + px(s.borderLeftWidth),
    gap: /flex|grid/.test(s.display) ? px(/column/.test(s.flexDirection) ? s.rowGap : s.columnGap) ?? 0 : null,
    width: Math.round(r.width * 100) / 100,
    height: Math.round(r.height * 100) / 100,
    opacity: px(s.opacity),
  };
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? 1 : 3) });
  let t = walker.nextNode();
  while (t && t.parentElement && getComputedStyle(t.parentElement).visibility === 'hidden') t = walker.nextNode();
  if (t && t.parentElement) {
    const ts = getComputedStyle(t.parentElement);
    out.textColor = hex(ts.color);
    out.fontFamily = ts.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    out.fontSize = px(ts.fontSize);
    out.fontWeight = Number(ts.fontWeight);
    out.lineHeight = ts.lineHeight === 'normal' ? null : px(ts.lineHeight);
  }
  if (out.stroke) out.strokeWeight = bw;
  // A Figma inside stroke drawn as an inset ring (box-shadow: inset 0 0 0 Npx color) leaves the padding alone, like Figma.
  const ring = !out.stroke && /^(rgba?\([^)]*\)|#\w+)\s+0px\s+0px\s+0px\s+([\d.]+)px\s+inset/.exec(s.boxShadow || '');
  if (ring && parseFloat(ring[2]) > 0) { out.stroke = hex(ring[1]); out.strokeWeight = parseFloat(ring[2]); }
  return out;
}

(async () => {
  const figmaFile = path.join(folder, 'data', 'figma-styles.json');
  if (!fs.existsSync(figmaFile)) { console.error('Missing ' + path.relative(ROOT, figmaFile) + ': run tools/figma_styles.figma.js on the DS file first.'); process.exit(1); }
  const figmaData = JSON.parse(fs.readFileSync(figmaFile, 'utf8'));
  const pw = loadPlaywright();
  if (!pw) {
    console.error('Playwright is not installed. Ask the user first, then: npm --prefix "' + path.relative(ROOT, path.join(folder, 'storybook')) + '" install -D playwright');
    process.exit(2);
  }
  let index;
  try { index = await (await fetch(base + '/index.json')).json(); } catch (e) {
    console.error('Storybook is not reachable at ' + base + ' (start it with npm run storybook, or pass --url).'); process.exit(1);
  }
  const stories = Object.values(index.entries || index.stories || {}).filter((e) => e.type === 'story' || !e.type);
  const storyFor = (name) => {
    const own = stories.filter((e) => e.title === name || e.title.endsWith('/' + name));
    return own.find((e) => e.name === 'Playground') || own[0] || null;
  };
  const mCol = figmaData.meta.modeCollection;
  const gKey = opt('--global', '') || (mCol ? globalKey(mCol) : null);

  const browser = await launch(pw);
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const out = { meta: { tool: 'storybook_snap.cjs', url: base, measuredAt: new Date().toISOString(), modeCollection: mCol, globalKey: gKey, modes: figmaData.meta.modes }, components: {}, failures: [] };
  let measured = 0;
  for (const [comp, variants] of Object.entries(figmaData.components)) {
    if (only && !only.includes(comp)) continue;
    const story = storyFor(comp);
    if (!story) { out.failures.push({ component: comp, reason: 'no story with this Figma name' }); continue; }
    out.components[comp] = {};
    for (const [vName, modes] of Object.entries(variants)) {
      const vArgs = parseVariant(vName);
      const unsafe = Object.entries(vArgs).find(([k, v]) => !URL_SAFE.test(k) || !URL_SAFE.test(v || ''));
      if (unsafe) { out.failures.push({ component: comp, variant: vName, reason: 'args_unsupported (characters a story URL cannot carry)' }); continue; }
      out.components[comp][vName] = {};
      for (const mode of Object.keys(modes)) {
        const q = new URLSearchParams({ id: story.id, viewMode: 'story' });
        const a = Object.entries(vArgs).map(([k, v]) => k + ':' + v).join(';');
        if (a) q.set('args', a);
        if (gKey && mode !== 'Default') q.set('globals', gKey + ':' + mode);
        try {
          await page.goto(base + '/iframe.html?' + q.toString(), { waitUntil: 'load', timeout });
          await page.waitForFunction(() => { const r = document.querySelector('#storybook-root'); return r && r.firstElementChild; }, null, { timeout });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(150);
          const m = await page.evaluate(measureInPage, selector || null);
          if (m.error) out.failures.push({ component: comp, variant: vName, mode, reason: m.error });
          else { out.components[comp][vName][mode] = m; measured += 1; }
        } catch (e) {
          out.failures.push({ component: comp, variant: vName, mode, reason: e.message.split('\n')[0] });
        }
      }
    }
  }
  await browser.close();
  const file = path.join(folder, 'data', 'storybook-styles.json');
  fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
  console.log(measured + ' variant-modes measured, ' + out.failures.length + ' failures -> ' + path.relative(ROOT, file));
  for (const f of out.failures.slice(0, 20)) console.log(' - ' + [f.component, f.variant, f.mode].filter(Boolean).join(' > ') + ': ' + f.reason);
})();

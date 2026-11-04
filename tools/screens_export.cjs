#!/usr/bin/env node
// Live Prototype trial (Screens_Handoff_Skill): read a Design file's screens into data/screens.json. Read only.
// Usage (from the Root):
//   node tools/screens_export.cjs --file "Brownfield Design" --page Listen --out "<folder>/prototype/data" [--only "Lyrics,Search"] [--no-images] [--png]
// Runs tools/screens_export.figma.js through FigCli Yolo (FIGMA_FILE = --file), one eval per screen, then exports every
// image layer (artwork photos) as PNG into <out>/assets/ and, with --png, each screen frame at 1x into <out>/figma/
// (the fidelity reference). FigCli folder: FIGMA_CLI_DIR, else a figma-cli* folder in a Tools folder at the drive root,
// next to the Root, or in the home folder (same search as tools/figma_tools_check.py).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes(k);

function findFigCli() {
  const cands = [];
  if (process.env.FIGMA_CLI_DIR) cands.push(process.env.FIGMA_CLI_DIR);
  const bases = [path.join(path.parse(ROOT).root, 'Tools'), path.join(ROOT, '..', 'Tools'), path.join(os.homedir(), 'Tools')];
  for (const b of bases) {
    try { for (const d of fs.readdirSync(b)) if (d.startsWith('figma-cli')) cands.push(path.join(b, d)); } catch (e) { /* no folder */ }
  }
  const dir = cands.find((d) => fs.existsSync(path.join(d, 'src', 'index.js')));
  if (!dir) throw new Error('FigCli not found (set FIGMA_CLI_DIR)');
  return dir;
}

const FILE = opt('--file');
const PAGE = opt('--page', 'Listen');
const OUT = path.resolve(opt('--out', '.'));
const ONLY = (opt('--only', '') || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!FILE) { console.error('--file "<exact Figma file name>" is required'); process.exit(2); }

const CLI = findFigCli();
const env = Object.assign({}, process.env, { FIGMA_FILE: FILE });
const fig = (cmdArgs, timeout = 120000) => execFileSync('node', [path.join(CLI, 'src', 'index.js'), ...cmdArgs], { env, encoding: 'utf8', timeout, maxBuffer: 64 << 20 });

const SCRIPT = fs.readFileSync(path.join(__dirname, 'screens_export.figma.js'), 'utf8');
// Figma answers slowly while its tab is hidden; each call gets up to 3 tries.
function evalJson(opts) {
  for (let tries = 0; ; tries++) {
    try { return evalOnce(opts); } catch (e) { if (tries >= 2 || !/No JSON|ETIMEDOUT/.test(e.message)) throw e; }
  }
}
function evalOnce(opts) {
  const tmp = path.join(os.tmpdir(), `screens_export_${process.pid}.js`);
  fs.writeFileSync(tmp, SCRIPT.replace('})(__OPTS__)', '})(' + JSON.stringify(opts) + ')'));
  const out = fig(['eval', '--file', tmp]);
  fs.unlinkSync(tmp);
  if (out.length >= 19900) return { tooLong: true };
  // FigCli may wrap the result or append notes: keep the outer JSON object only.
  const a = out.indexOf('{'), b = out.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('No JSON from Figma:\n' + out.slice(0, 500));
  let res;
  try { res = JSON.parse(out.slice(a, b + 1)); } catch (e) { throw new Error('Unreadable JSON from Figma:\n' + out.slice(0, 300)); }
  if (typeof res === 'string') res = JSON.parse(res);
  if (res.error) throw new Error(res.error);
  return res;
}

// A screen or node too big for one FigCli answer is read shallow (children as stubs), then child by child.
let calls = 0;
function readNode(opts) {
  calls++;
  const full = evalJson(opts);
  if (!full.tooLong) return full;
  const top = evalJson(Object.assign({}, opts, { shallow: true }));
  calls++;
  if (top.tooLong) throw new Error('Node ' + opts.id + ' is too big even without its children');
  const fill = (n) => {
    if (!n.ch) return;
    n.ch = n.ch.map((c) => (c.stub ? readNode({ mode: 'node', id: c.id }).tree : c));
  };
  fill(top.tree);
  return top;
}

// 1. File check + list of screens.
const list = evalJson({ mode: 'list', page: PAGE });
if (list.file !== FILE) { console.error(`Open file is "${list.file}", expected "${FILE}". Nothing read.`); process.exit(3); }
let frames = list.frames;
if (ONLY.length) frames = frames.filter((f) => ONLY.some((o) => f.n.includes(o)));
console.log(`${list.file} > ${list.page}: ${frames.length} screens`);

// 2. One eval per screen (--reuse keeps an existing screens.json and only fetches missing images / PNGs).
fs.mkdirSync(OUT, { recursive: true });
const reuse = flag('--reuse') && fs.existsSync(path.join(OUT, 'screens.json'));
const screens = reuse ? JSON.parse(fs.readFileSync(path.join(OUT, 'screens.json'), 'utf8')).screens : [];
for (const f of reuse ? [] : frames) {
  const t0 = Date.now();
  calls = 0;
  const s = readNode({ mode: 'screen', id: f.id });
  s.section = f.section; s.w = f.w; s.h = f.h;
  if (!Object.keys(s.modes || {}).length) s.modes = f.modes;
  screens.push(s);
  console.log(`  ${f.n} (${f.id}) ${Math.round((Date.now() - t0) / 100) / 10}s, ${calls} call(s)`);
}
if (!reuse) {
  const out = { file: list.file, page: list.page, exported_at: new Date().toISOString(), screens };
  fs.writeFileSync(path.join(OUT, 'screens.json'), JSON.stringify(out, null, 1));
  console.log('Wrote', path.join(OUT, 'screens.json'));
}

// 3. Images (artwork photos) and, with --png, the screen frames themselves.
const images = new Map();
const collect = (n) => {
  for (const im of n.img && Array.isArray(n.img) ? n.img : []) images.set(im.id, im);
  if (n.img === true) images.set(n.id, { id: n.id, n: n.n, w: n.w, h: n.h });
  for (const c of n.ch || []) collect(c);
};
screens.forEach((s) => collect(s.tree));
const fileName = (id) => id.replace(/[:;]/g, '-') + '.png';
// Bytes from the eval script in base64 slices: an exported layer (id) or a source image (hash).
function readImage(id, hash) {
  const head = evalJson(hash ? { mode: 'img', id, hash } : { mode: 'img', id, scale: 2 });
  let b64 = '';
  for (let off = 0; off < head.len; off += 18000) {
    // A slice can fail when Figma is busy; the cached bytes stay in the page, so retry the slice alone.
    for (let tries = 0; ; tries++) {
      try { b64 += evalJson({ mode: 'chunk', id, off, keep: true }).d; break; } catch (e) { if (tries >= 2) throw e; }
    }
  }
  if (b64.length !== head.len) throw new Error(`image ${id}: got ${b64.length} of ${head.len}`);
  return Buffer.from(b64, 'base64');
}
if (!flag('--no-images')) {
  // a. Crop info of every image layer (hash, scale mode, transform). Screens built from screenshots often show one
  //    source image cropped many times; tools/build_prototype.py cuts each crop from its source, which also works for
  //    layers clipped by a scrolling rail (Figma's own export cuts those at the parent's edge).
  const ids = [...images.keys()];
  const cropsPath = path.join(OUT, 'crops.json');
  const crops = flag('--reuse') && fs.existsSync(cropsPath) ? JSON.parse(fs.readFileSync(cropsPath, 'utf8')) : {};
  if (!Object.keys(crops).length) for (let i = 0; i < ids.length; i += 25) Object.assign(crops, evalJson({ mode: 'crops', ids: ids.slice(i, i + 25) }).crops);
  fs.writeFileSync(cropsPath, JSON.stringify(crops, null, 1));
  // b. Each source image once.
  const srcDir = path.join(OUT, 'sources');
  fs.mkdirSync(srcDir, { recursive: true });
  const hashes = [...new Set(Object.values(crops).map((c) => c.hash))];
  for (const h of hashes) {
    const p = path.join(srcDir, h);
    if (!fs.existsSync(p)) fs.writeFileSync(p, readImage('src-' + h.slice(0, 12), h));
  }
  // c. Layers without crop info (no image paint found): Figma's export of the layer.
  const dir = path.join(OUT, 'assets');
  var failed = [];
  fs.mkdirSync(dir, { recursive: true });
  for (const im of images.values()) {
    if (crops[im.id]) continue;
    const p = path.join(dir, fileName(im.id));
    if (fs.existsSync(p)) continue;
    try { fs.writeFileSync(p, readImage(im.id)); } catch (e) { failed.push(im.id + ' ' + e.message.slice(0, 80)); }
  }
  console.log(`  ${Object.keys(crops).length}/${images.size} image layers as crops of ${hashes.length} source image(s); ${images.size - Object.keys(crops).length - failed.length} exported` + (failed.length ? ` (failed: ${failed.slice(0, 5).join(', ')})` : ''));
}
if (flag('--png')) {
  const dir = path.join(OUT, 'figma');
  fs.mkdirSync(dir, { recursive: true });
  for (const s of screens) {
    const p = path.join(dir, fileName(s.id));
    if (fs.existsSync(p)) continue;
    try { fig(['export', 'node', s.id, '-o', p, '-s', '1'], 120000); } catch (e) { console.log('  ! screen PNG failed:', s.n); }
  }
  console.log(`  ${screens.length} screen PNGs in figma/`);
}

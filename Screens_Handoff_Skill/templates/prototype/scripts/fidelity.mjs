// Fidelity check: each prototype screen (bare, at its Figma size) against the Figma export of the same frame, per mode.
// Usage (in the prototype folder, with `npm run dev` running):
//   node scripts/fidelity.mjs [--url http://localhost:5190] [--shots <folder>] [--only <slug,...>]
// Needs data/screens.json and data/figma/<frame id>.png (tools/screens_export.cjs --png).
// Writes fidelity/<slug>-<mode>.png (prototype), fidelity/<slug>-<mode>-diff.png and fidelity/report.json.
// Score = share of pixels that match (pixelmatch, threshold 0.1, anti-aliasing ignored), on the Figma frame's size.
// --shots also saves every screen inside the phone frame (the shell) for review.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'http://localhost:5190');
const SHOTS = opt('--shots', null);
const ONLY = (opt('--only', '') || '').split(',').filter(Boolean);
const here = process.cwd();
const outDir = path.join(here, 'fidelity');
fs.mkdirSync(outDir, { recursive: true });
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const routesSrc = fs.readFileSync(path.join(here, 'src', 'generated', 'routes.tsx'), 'utf8');
// Screens changed code-first (data/overrides.json) differ from Figma on purpose until they are synced.
const codeAhead = (() => { try { return JSON.parse(fs.readFileSync(path.join(here, 'data', 'build-report.json'), 'utf8')).code_ahead || []; } catch (e) { return []; } })();
const screens = [...routesSrc.matchAll(/\{ slug: "([^"]+)", name: "([^"]*)", w: (\d+), h: (\d+), (?:scroll: \w+, )?figma: (\{[^}]*\})/g)]
  .map((m) => ({ slug: m[1], name: m[2], w: +m[3], h: +m[4], figma: JSON.parse(m[5]) }))
  .filter((s) => !ONLY.length || ONLY.includes(s.slug));

async function launch() {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try { return await chromium.launch(channel ? { channel } : {}); } catch (e) { /* next */ }
  }
  throw new Error('No Chromium-based browser found for playwright-core (Edge or Chrome)');
}

const fit = (png, w, h) => {
  // Crop or pad (transparent) to the Figma frame's size so the images compare pixel for pixel.
  const out = new PNG({ width: w, height: h });
  PNG.bitblt(png, out, 0, 0, Math.min(w, png.width), Math.min(h, png.height), 0, 0);
  return out;
};

const browser = await launch();
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { width: 1280, height: 900 } });
const report = [];
for (const s of screens) {
  for (const [mode, id] of Object.entries(s.figma)) {
    const ref = path.join(here, 'data', 'figma', id.replace(/[:;]/g, '-') + '.png');
    await page.setViewportSize({ width: Math.max(400, s.w), height: Math.max(400, s.h) });
    await page.goto(`${URL}/#/${s.slug}?mode=${mode}&lang=en&bare=1`);
    await page.waitForSelector('[data-figma-node]');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const el = await page.$('.fp-screen');
    const file = path.join(outDir, `${s.slug}-${mode}.png`);
    await el.screenshot({ path: file });
    const row = { slug: s.slug, name: s.name, mode, figma: id, codeAhead: codeAhead.includes(s.slug) };
    if (fs.existsSync(ref)) {
      const a = PNG.sync.read(fs.readFileSync(ref));
      const b = fit(PNG.sync.read(fs.readFileSync(file)), a.width, a.height);
      const diff = new PNG({ width: a.width, height: a.height });
      const bad = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1, includeAA: false });
      fs.writeFileSync(path.join(outDir, `${s.slug}-${mode}-diff.png`), PNG.sync.write(diff));
      row.score = Math.round((1 - bad / (a.width * a.height)) * 10000) / 100;
      // Second score, tolerant to 1px: a differing pixel still counts when the prototype has a close colour within 1px
      // (text anti-aliasing and sub-pixel line placement differ between Figma and the browser).
      let bad1 = 0;
      const near = (i, j) => Math.abs(a.data[i] - b.data[j]) + Math.abs(a.data[i + 1] - b.data[j + 1]) + Math.abs(a.data[i + 2] - b.data[j + 2]) < 60;
      for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
        const i = (y * a.width + x) * 4;
        if (diff.data[i] !== 255 || diff.data[i + 1] !== 0) continue; // pixelmatch marks a difference in red
        let ok = false;
        for (let dy = -1; dy <= 1 && !ok; dy++) for (let dx = -1; dx <= 1 && !ok; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < a.width && yy < a.height) ok = near(i, (yy * a.width + xx) * 4);
        }
        if (!ok) bad1++;
      }
      row.score1px = Math.round((1 - bad1 / (a.width * a.height)) * 10000) / 100;
      row.size = { figma: [a.width, a.height] };
    } else row.score = null;
    report.push(row);
    console.log(`${s.name} ${mode}: ${row.score === null ? 'no Figma export' : `${row.score}% (1px-tolerant ${row.score1px}%)`}${row.codeAhead ? ' · code ahead of Figma (pending sync): not a failure' : ''}`);
    if (SHOTS) {
      await page.setViewportSize({ width: 1100, height: 1000 });
      for (const lang of ['en', 'ar']) {
        await page.goto(`${URL}/#/${s.slug}?mode=${mode}&lang=${lang}`);
        await page.waitForSelector('[aria-label="Android phone"] [data-figma-node]');
        await page.waitForTimeout(400);
        await (await page.$('[aria-label="Android phone"]')).screenshot({ path: path.join(SHOTS, `${s.slug}-${mode}-${lang}.png`) });
      }
    }
  }
}
await browser.close();
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 1));
const scored = report.filter((r) => r.score !== null);
const avg = (k) => Math.round(scored.reduce((t, r) => t + r[k], 0) / scored.length * 100) / 100;
if (scored.length) console.log(`Average ${avg('score')}% (1px-tolerant ${avg('score1px')}%) over ${scored.length} captures`);

// Live check of a prototype (local dev or the published URL), in the prototype folder:
//   node scripts/check_live.mjs --url <https://.../name/ or http://localhost:5190/> [--shots <folder>] [--code-only] [--comments]
// For every screen x Light/Dark x EN/AR, on desktop (1280 x 900) and phone width (390 x 844): the page renders DS
// components, no image is broken, no console error. Then: navigation (bottom navigation, Mini Player, Lyrics, back) and
// Inspect (a tap shows the component and Figma node without navigating), and the Code panel: every screen in every
// platform tab, Inspect -> highlighted lines, Copy, Light/Dark and EN/AR, side panel (desktop) / bottom sheet (phone).
// Prints a summary; exit code 1 on any problem.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const URL = opt('--url', 'http://localhost:5190/').replace(/\/?$/, '/');
const SHOTS = opt('--shots', null);
const CODE_ONLY = args.includes('--code-only');
const COMMENTS = args.includes('--comments'); // also post one test comment per device and read it back
let commentStore = null;
const postedIds = []; // skip the screen x mode x language loop (quick panel check)
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const routes = fs.readFileSync(path.join(process.cwd(), 'src', 'generated', 'routes.tsx'), 'utf8');
const slugs = [...routes.matchAll(/\{ slug: "([^"]+)"/g)].map((m) => m[1]);
const fnName = Object.fromEntries([...routes.matchAll(/\{ slug: "([^"]+)", name: "([^"]+)"/g)].map((m) => [m[1], m[2].replace(/[^A-Za-z0-9]/g, '') + 'Screen']));

async function launch() {
  // Chrome first: Edge's SmartScreen can block a new github.io site with a warning page (seen 2026-10-25).
  for (const channel of ['chrome', 'msedge', undefined]) {
    try { return await chromium.launch(channel ? { channel } : {}); } catch (e) { /* next */ }
  }
  throw new Error('No Chromium-based browser found');
}
const browser = await launch();
const problems = [];
const sizes = { desktop: { width: 1280, height: 900 }, phone: { width: 390, height: 844 } };
let pages = 0;
let codeViews = 0;
let docks = 0;
const fit = {};
const fitNotes = new Set();
const arDict = await fetch(`${URL}strings/ar.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
if (!Object.keys(arDict).length) problems.push('strings/ar.json missing or empty: the AR switch cannot translate');
for (const [device, viewport] of Object.entries(sizes)) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: device === 'phone', permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  if (!CODE_ONLY) for (const slug of slugs) for (const mode of ['Light', 'Dark']) for (const lang of ['en', 'ar']) {
    errors.length = 0;
    await page.goto(`${URL}#/${slug}?mode=${mode}&lang=${lang}`);
    try { await page.waitForSelector('.fp-screen [data-component]', { timeout: 20000 }); } catch (e) { problems.push(`${device} ${slug} ${mode} ${lang}: no DS component rendered`); continue; }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(lang === 'ar' ? 600 : 300);
    const r = await page.evaluate((dict) => ({
      // AR: UI strings still in English (should be 0), and text that does not fit (ellipsis or clamped) per component
      english: (() => {
        const left = [];
        const w = document.createTreeWalker(document.querySelector('.fp-screen'), NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.data.trim(); if (t && dict[t] && n.parentElement.closest('[dir="rtl"]')) left.push(t); }
        return left;
      })(),
      clipped: (() => {
        const out = {};
        for (const el of document.querySelectorAll('.fp-screen [data-component] *')) {
          if (!el.childNodes.length || ![...el.childNodes].some((c) => c.nodeType === 3 && c.data.trim())) continue;
          if (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 2) {
            const cs = getComputedStyle(el);
            if (cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis') continue;
            const c = el.closest('[data-component]').dataset.component;
            out[c] = (out[c] || 0) + 1;
          }
        }
        return out;
      })(),
      comps: document.querySelectorAll('.fp-screen [data-component]').length,
      broken: [...document.querySelectorAll('.fp-screen img')].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')),
      dir: document.querySelector('.fp-screen')?.getAttribute('dir'),
      mode: document.querySelector('.fp-screen')?.getAttribute('data-semantic'),
      gone: !document.querySelector('.fp-screen'),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    }), lang === 'ar' ? arDict : {});
    // the screen unmounted after it rendered (e.g. a lazy screen chunk failed to load)
    if (r.gone) { problems.push(`${device} ${slug} ${mode} ${lang}: screen disappeared ${errors[0] ? '- ' + errors[0].slice(0, 120) : ''}`); continue; }
    pages++;
    if (r.broken.length) problems.push(`${device} ${slug} ${mode} ${lang}: ${r.broken.length} broken image(s), e.g. ${r.broken[0]}`);
    if (r.dir !== (lang === 'ar' ? 'rtl' : 'ltr') || r.mode !== mode) problems.push(`${device} ${slug} ${mode} ${lang}: mode/dir not applied`);
    if (device === 'phone' && r.overflowX) problems.push(`${device} ${slug} ${mode} ${lang}: horizontal page scroll`);
    if (errors.length) problems.push(`${device} ${slug} ${mode} ${lang}: console error ${errors[0].slice(0, 120)}`);
    if (lang === 'ar' && r.english.length) problems.push(`${device} ${slug} ${mode} ar: ${r.english.length} UI string(s) still in English, e.g. "${r.english[0]}"`);
    fit[`${device} ${slug} ${mode} ${lang}`] = r.clipped;
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${device}-${slug}-${mode}-${lang}.png`) });
  }
  // AR fit: components whose text is cut more often in Arabic than in English (a note for the report, not a failure)
  if (!CODE_ONLY) for (const slug of slugs) for (const mode of ['Light', 'Dark']) {
    const en = fit[`${device} ${slug} ${mode} en`] || {}, ar = fit[`${device} ${slug} ${mode} ar`] || {};
    for (const c of Object.keys(ar)) if ((ar[c] || 0) > (en[c] || 0)) fitNotes.add(`${device} ${slug}: ${c} cuts ${ar[c]} text(s) in AR vs ${en[c] || 0} in EN`);
  }
  if (!CODE_ONLY) {
    // Pinned bars (Figma fixed / absolute at the bottom edge): visible while scrolling, and they hide no content at the end
    for (const slug of slugs) {
      await page.goto(`${URL}#/${slug}?mode=Dark&lang=en`);
      await page.waitForSelector('.fp-screen [data-component]');
      await page.waitForTimeout(300);
      const d = await page.evaluate(async () => {
        const sc = document.querySelector('.fp-screen');
        const dock = sc.querySelector('[data-dock="bottom"]');
        if (!dock) return null;
        if (sc.scrollHeight <= sc.clientHeight + 1) {
          // a static (Viewport) screen: no scrolling, the bar at the bottom over the content, as in Figma
          const a = sc.getBoundingClientRect(), r = dock.getBoundingClientRect();
          return { mid: Math.abs(r.bottom - a.bottom) <= 2, end: true, hidden: false, fixed: true };
        }
        const at = () => { const a = sc.getBoundingClientRect(), r = dock.getBoundingClientRect(); return Math.abs(r.bottom - a.bottom) <= 2; };
        sc.scrollTop = (sc.scrollHeight - sc.clientHeight) / 2;
        await new Promise((r) => setTimeout(r, 150));
        const mid = at();
        sc.scrollTop = sc.scrollHeight;
        await new Promise((r) => setTimeout(r, 150));
        const top = dock.getBoundingClientRect().top;
        const hidden = [...sc.querySelectorAll('[data-component]')].filter((e) => !dock.contains(e)).some((e) => e.getBoundingClientRect().bottom > top + 1);
        return { mid, end: at(), hidden };
      });
      if (d && (!d.mid || !d.end)) problems.push(`${device} ${slug}: pinned bottom bar not at the bottom while scrolling (${JSON.stringify(d)})`);
      if (d && d.hidden) problems.push(`${device} ${slug}: content hidden behind the pinned bottom bar at the end of the scroll`);
      if (d) docks++;
      const fixedScreen = await page.evaluate(() => !!document.querySelector('.fp-screen [data-fixed-screen]'));
      const scrolls = await page.evaluate(() => { const s = document.querySelector('.fp-screen'); return s.scrollHeight > s.clientHeight + 1 && getComputedStyle(s).overflowY !== 'hidden'; });
      if (fixedScreen && scrolls) problems.push(`${device} ${slug}: a Viewport (one-screen) frame scrolls`);
    }
    // AR: directional icons mirror, media controls stay left to right
    await page.goto(`${URL}#/now-playing?mode=Dark&lang=ar`);
    await page.waitForSelector('.fp-screen [data-component]');
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({
      controls: getComputedStyle(document.querySelector('.fp-screen [data-component="Playback Controls"]') || document.body).direction,
      mirrored: [...document.querySelectorAll('.fp-screen svg[data-icon="queue_music"], .fp-screen svg[data-icon="lyrics"]')].map((s) => getComputedStyle(s).transform),
    }));
    if (m.controls !== 'ltr') problems.push(`${device} now-playing ar: Playback Controls direction ${m.controls}, expected ltr`);
    if (!m.mirrored.length || m.mirrored.some((t) => !t.startsWith('matrix(-1'))) problems.push(`${device} now-playing ar: directional icons not mirrored (${m.mirrored.join(', ')})`);
  }

  // Navigation and Inspect (Dark, EN).
  const at = async () => (await page.evaluate(() => location.hash)).replace(/^#\/?/, '').split('?')[0];
  const step = async (label, click, want) => {
    await click();
    await page.waitForTimeout(500);
    const now = await at();
    if (now !== want) problems.push(`${device} navigation: ${label} went to "${now}", expected "${want}"`);
  };
  await page.goto(`${URL}#/explore-viewport?mode=Dark&lang=en`);
  await page.waitForSelector('.fp-screen [data-component]');
  await step('Bottom Navigation > Search', () => page.locator('.fp-screen nav[aria-label="Main"] button').nth(1).click(), 'search-discover-viewport');
  await step('Mini Player', () => page.locator('.fp-screen .nav-mini-player').first().click({ position: { x: 60, y: 20 } }), 'now-playing');
  await step('Player Utility Bar > Lyrics', () => page.locator('.fp-screen .nav-utility-bar__action').first().click(), 'lyrics');
  await step('Collapse (back)', () => page.locator('.fp-screen [data-component="Icon Button"] button').first().click(), 'now-playing');
  await page.goto(`${URL}#/library-music?mode=Dark&lang=en`);
  await page.waitForSelector('.fp-screen [data-component]');
  await step('Primary Tabs > Podcasts', () => page.locator('.fp-screen [role="tab"]').nth(1).click(), 'library-podcasts');
  // Inspect
  await page.getByRole('button', { name: 'Inspect' }).click();
  const before = await at();
  await page.locator('.fp-screen [data-component="Mini Player"]').first().click({ position: { x: 60, y: 20 } });
  await page.waitForTimeout(300);
  const label = await page.locator('text=/· \\d/').first().textContent().catch(() => '');
  if (!/Mini Player · /.test(label || '')) problems.push(`${device} Inspect: shows "${label}", expected "Mini Player · <node>"`);
  if ((await at()) !== before) problems.push(`${device} Inspect: the tap navigated`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${device}-inspect.png`) });

  // Code panel: every screen x every platform tab.
  const panel = '[data-code-panel]';
  const codeText = () => page.evaluate((sel) => document.querySelector(`${sel} code`)?.textContent || '', panel);
  await page.goto(`${URL}#/explore-viewport?mode=Dark&lang=en`);
  await page.reload();
  await page.waitForSelector('.fp-screen [data-component]');
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  const kind = await page.locator(panel).getAttribute('data-code-panel').catch(() => null);
  if (kind !== (device === 'phone' ? 'sheet' : 'side')) problems.push(`${device} code panel: shown as "${kind}"`);
  const panelText = await page.locator(panel).textContent();
  if (!/Reference code/.test(panelText) || !/Not production/.test(panelText)) problems.push(`${device} code panel: "Reference code / Not production" label missing`);
  for (const slug of slugs) {
    await page.goto(`${URL}#/${slug}?mode=Dark&lang=en`);
    await page.waitForSelector('.fp-screen [data-component]');
    const tabs = page.locator(`${panel} [role="tab"]`);
    const n = await tabs.count();
    if (n !== 6) problems.push(`${device} code ${slug}: ${n} tabs, expected 5 platforms + Strings`);
    for (let i = 0; i < n; i++) {
      await tabs.nth(i).click();
      const platform = await tabs.nth(i).getAttribute('data-platform');
      const want = platform === 'strings' ? '"ar"' : fnName[slug];
      try {
        await page.waitForFunction(([sel, fn]) => (document.querySelector(`${sel} code`)?.textContent || '').includes(fn), [panel, want], { timeout: 10000 });
      } catch (e) { problems.push(`${device} code ${slug} ${platform}: no code for ${fnName[slug]}`); continue; }
      const lines = await page.locator(`${panel} [data-line]`).count();
      if (lines < (platform === 'strings' ? 5 : 20)) problems.push(`${device} code ${slug} ${platform}: only ${lines} lines`);
      codeViews++;
    }
    await tabs.first().click();
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) problems.push(`${device} code ${slug}: horizontal page scroll`);
  }

  // Inspect -> highlight: pick the Mini Player (before the sheet covers it on a phone), then open the panel.
  await page.goto(`${URL}#/explore-viewport?mode=Dark&lang=en`);
  await page.waitForSelector('.fp-screen [data-component]');
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await page.getByRole('button', { name: 'Inspect' }).click();
  await page.locator('.fp-screen [data-component="Mini Player"]').first().click({ position: { x: 60, y: 20 } });
  await page.getByRole('button', { name: 'Code', exact: true }).click();
  await page.waitForSelector(`${panel} [data-line]`);
  const tabs = page.locator(`${panel} [role="tab"]`);
  for (let i = 0; i < await tabs.count(); i++) {
    await tabs.nth(i).click();
    const platform = await tabs.nth(i).getAttribute('data-platform');
    if (platform === 'strings') continue;
    await page.waitForTimeout(400);
    const hl = (await page.locator(`${panel} [data-hl]`).allTextContents()).join(' ');
    if (!/MiniPlayer/.test(hl)) problems.push(`${device} highlight ${platform}: Mini Player lines not highlighted ("${hl.slice(0, 60)}")`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${device}-code-${platform}.png`) });
  }
  // Copy
  await tabs.first().click();
  await page.locator(`${panel} button`, { hasText: 'Copy' }).click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e));
  if (!clip.includes('MiniPlayer') || !clip.includes('Reference code')) problems.push(`${device} copy: clipboard has "${clip.slice(0, 60)}"`);
  if (!(await page.locator(`${panel} button`, { hasText: 'Copied' }).count())) problems.push(`${device} copy: no "Copied" feedback`);
  // Light / Dark and EN / AR: the panel follows the shell theme and the code stays left to right.
  const bgs = {};
  for (const [mode, lang] of [['Light', 'ar'], ['Dark', 'ar'], ['Light', 'en']]) {
    await page.goto(`${URL}#/explore-viewport?mode=${mode}&lang=${lang}`);
    await page.waitForTimeout(400);
    const r = await page.evaluate((sel) => ({
      bg: getComputedStyle(document.querySelector(sel)).backgroundColor,
      dir: getComputedStyle(document.querySelector(`${sel} pre`)).direction,
      code: !!document.querySelector(`${sel} [data-line]`),
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1
        || (() => { const m = document.querySelector('main'); return m.scrollWidth > m.clientWidth + 1; })(),
    }), panel);
    bgs[mode] = r.bg;
    if (!r.code || r.dir !== 'ltr' || r.overflowX) problems.push(`${device} code ${mode} ${lang}: code ${r.code}, direction ${r.dir}, horizontal scroll ${r.overflowX}`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${device}-code-${mode}-${lang}.png`) });
  }
  if (bgs.Light === bgs.Dark) problems.push(`${device} code panel: same background in Light and Dark (${bgs.Light})`);

  // Comments (only with --comments: it posts one real test comment per device to the prototype's store).
  if (COMMENTS) {
    const cp = '[data-comments-panel]';
    const note = `Live check (${device}) ${new Date().toISOString().slice(0, 19)}`;
    await page.goto(`${URL}#/explore-viewport?mode=Dark&lang=ar`);
    await page.reload();
    await page.waitForSelector('.fp-screen [data-component]');
    await page.getByRole('button', { name: 'Comment', exact: true }).click();
    const kind2 = await page.locator(cp).getAttribute('data-comments-panel').catch(() => null);
    if (kind2 !== (device === 'phone' ? 'sheet' : 'side')) problems.push(`${device} comments panel: shown as "${kind2}"`);
    const store = await page.locator(`${cp} [data-store]`).getAttribute('data-store');
    commentStore = store;
    // tap the Top App Bar (top of the screen, never under the phone sheet)
    await page.locator('.fp-screen [data-component="Top App Bar"]').first().click({ position: { x: 40, y: 20 } });
    if (!(await page.locator(`${cp} [data-comment-form]`).count())) problems.push(`${device} comments: no form after a tap on the screen`);
    if (!(await page.locator('.fp-screen [data-pin="pending"]').count())) problems.push(`${device} comments: no pending pin`);
    if ((await at()) !== 'explore-viewport') problems.push(`${device} comments: the tap navigated`);
    if (await page.locator(`${cp} [data-comment-list] li`, { hasText: '· resolved' }).count()) problems.push(`${device} comments: resolved comments shown by default`);
    await page.locator(`${cp} [data-comment-form] input[name="reviewer"]`).fill('Atomica check');
    await page.locator(`${cp} [data-comment-form] textarea`).fill(note);
    // images: one picked with +, one pasted with Ctrl+V; a text file is refused
    const png = (() => { const p = new PNG({ width: 64, height: 40 }); for (let i = 0; i < p.data.length; i += 4) p.data.set([99, 102, 241, 255], i); return PNG.sync.write(p); })();
    await page.locator(`${cp} [data-image-picker]`).setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: png });
    try { await page.waitForSelector(`${cp} [data-attachments] img`, { timeout: 10000 }); } catch (e) { problems.push(`${device} comments: picked image not shown`); }
    await page.locator(`${cp} [data-image-picker]`).setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image') });
    try { await page.waitForSelector(`${cp} [data-image-error]`, { timeout: 5000 }); } catch (e) { problems.push(`${device} comments: a text file was not refused`); }
    await page.evaluate(async (sel) => {
      const c = document.createElement('canvas'); c.width = 50; c.height = 30;
      const g = c.getContext('2d'); g.fillStyle = '#e11d48'; g.fillRect(0, 0, 50, 30);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
      document.querySelector(`${sel} textarea`).dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, cp);
    try { await page.waitForFunction((sel) => document.querySelectorAll(`${sel} [data-attachments] img`).length === 2, cp, { timeout: 10000 }); } catch (e) { problems.push(`${device} comments: pasted image not shown`); }
    await page.locator(`${cp} button[type="submit"]`).click();
    try {
      await page.waitForFunction(([sel, t]) => document.querySelector(`${sel} [data-comment-list]`)?.textContent.includes(t), [cp, note], { timeout: 30000 });
    } catch (e) { problems.push(`${device} comments: posted comment not in the list (${await page.locator(`${cp} [role="alert"]`).textContent().catch(() => '')})`); }
    const posted = await page.evaluate(([sel, t]) => {
      const b = [...document.querySelectorAll(`${sel} [data-comment-id]`)].find((x) => x.textContent.includes(t));
      return b ? { id: b.dataset.commentId, meta: b.textContent } : null;
    }, [cp, note]);
    if (posted) {
      postedIds.push(posted.id);
      if (!/Top App Bar/.test(posted.meta) || !/Dark \/ AR/.test(posted.meta)) problems.push(`${device} comments: metadata missing (${posted.meta.slice(0, 120)})`);
      if (!(await page.locator(`.fp-screen [data-pin="${posted.id}"]`).count())) problems.push(`${device} comments: no pin for the posted comment`);
      // the two images are in the thread and open full size
      const li = page.locator(`${cp} li`, { has: page.locator(`[data-comment-id="${posted.id}"]`) });
      try { await page.waitForFunction(([sel, id]) => document.querySelector(`${sel} [data-comment-id="${id}"]`)?.closest('li')?.querySelectorAll('[data-comment-image] img').length === 2, [cp, posted.id], { timeout: 15000 }); }
      catch (e) { problems.push(`${device} comments: the comment does not show its 2 images`); }
      if (await li.locator('[data-comment-image]').count()) {
        await li.locator('[data-comment-image]').first().click();
        const ok = await page.waitForFunction(() => { const i = document.querySelector('[data-lightbox] img'); return i && i.complete && i.naturalWidth > 0; }, null, { timeout: 15000 }).then(() => true).catch(() => false);
        if (!ok) problems.push(`${device} comments: image did not open full size`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${device}-comments-image.png`) });
        await page.keyboard.press('Escape');
      }
      // from the list to the pin: scroll the screen away, click the comment, the pin comes back into view
      await page.evaluate(() => { const s = document.querySelector('.fp-screen'); s.scrollTop = s.scrollHeight; });
      await page.locator(`${cp} [data-comment-id="${posted.id}"]`).click();
      await page.waitForTimeout(1200);
      const nav = await page.evaluate((id) => {
        const s = document.querySelector('.fp-screen').getBoundingClientRect(), pin = document.querySelector(`.fp-screen [data-pin="${id}"]`)?.getBoundingClientRect();
        return { hash: location.hash, inView: !!pin && pin.top >= s.top - 1 && pin.bottom <= s.bottom + 1 };
      }, posted.id);
      if (!nav.hash.includes(`comment=${posted.id}`) || !nav.inView) problems.push(`${device} comments: clicking the comment did not bring its pin into view (${JSON.stringify(nav)})`);
      // a link to the comment opens its screen, theme and language with the panel and the comment selected
      const other = await browser.newContext({ viewport });
      const p3 = await other.newPage();
      await p3.goto(`${URL}#/explore-viewport?mode=Light&lang=en&comment=${posted.id}`);
      const linked = await p3.waitForFunction((id) => document.querySelector(`[data-comment-id="${id}"]`)?.closest('li')?.className.includes('bg-indigo') && location.hash.includes('mode=Dark') && location.hash.includes('lang=ar'), posted.id, { timeout: 30000 }).then(() => true).catch(() => false);
      if (!linked) problems.push(`${device} comments: the link to the comment did not open it (${await p3.evaluate(() => location.hash)})`);
      if (SHOTS) await p3.screenshot({ path: path.join(SHOTS, `${device}-comments-link.png`) });
      await other.close();
    }
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1 || (() => { const m = document.querySelector('main'); return m.scrollWidth > m.clientWidth + 1; })()))
      problems.push(`${device} comments: horizontal scroll`);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${device}-comments.png`) });
    // shared store: a fresh browser sees it after a reload
    if (store === 'shared' && posted) {
      const other = await browser.newContext({ viewport });
      const p2 = await other.newPage();
      await p2.goto(`${URL}#/explore-viewport?mode=Light&lang=en`);
      await p2.waitForSelector('.fp-screen [data-component]');
      await p2.getByRole('button', { name: 'Comment', exact: true }).click();
      try { await p2.waitForSelector(`[data-comment-id="${posted.id}"]`, { timeout: 15000 }); } catch (e) { problems.push(`${device} comments: another browser does not see the comment`); }
      if (SHOTS) await p2.screenshot({ path: path.join(SHOTS, `${device}-comments-other-browser-light-en.png`) });
      await other.close();
    }
  }
  await context.close();
}
await browser.close();
console.log(`${pages} screen views checked (${slugs.length} screens x Light/Dark x EN/AR x desktop/phone) + navigation + Inspect`);
if (!CODE_ONLY) console.log(`${docks} pinned bottom bars checked while scrolling (screen x desktop/phone)`);
console.log(`${codeViews} code views checked (${slugs.length} screens x (5 platforms + Strings) x desktop/phone) + highlight + Copy + Light/Dark + EN/AR`);
if (COMMENTS) console.log(`Comments (${commentStore} store): posted ${postedIds.length} test comment(s): ${postedIds.join(', ')}`);
if (fitNotes.size) console.log(`Arabic fit notes (${fitNotes.size}):\n` + [...fitNotes].join('\n'));
console.log(problems.length ? `${problems.length} problem(s):\n` + problems.join('\n') : 'No problems');
process.exit(problems.length ? 1 : 0);

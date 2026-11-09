#!/usr/bin/env node
// Stock photos for placeholders and hero images (Design_System_Intake_Skill/steps/images.md).
// Unsplash search when UNSPLASH_ACCESS_KEY is set (free key), otherwise Lorem Picsum (Unsplash photos, no key, no search).
// Downloads each photo cropped to --size, records the credit in <out>/credits.json and prints the files.
//   node tools/stock_image.cjs "<query>" --size 1440x900 [--count 3] [--out <folder>] [--name hero]
// Node 18+, no packages. The key is read from the environment only and never printed.
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const query = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!query) {
  console.log('Usage: node tools/stock_image.cjs "<query>" --size 1440x900 [--count 3] [--out <folder>] [--name hero]');
  process.exit(1);
}
const [w, h] = (opt('size', '1440x900')).split('x').map(Number);
const count = Math.min(Number(opt('count', 3)), 10);
const out = opt('out', '.claude/.state/stock_images');
const base = (opt('name', query)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const key = process.env.UNSPLASH_ACCESS_KEY;
const orientation = w > h * 1.2 ? 'landscape' : h > w * 1.2 ? 'portrait' : 'squarish';
const UTM = 'utm_source=ai_ready_design_systems&utm_medium=referral';

async function save(url, file) {
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${file}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return res;
}

async function fromUnsplash() {
  const u = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=${count}&orientation=${orientation}&content_filter=high`;
  const res = await fetch(u, { headers: { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' } });
  if (!res.ok) throw new Error(`Unsplash search failed: HTTP ${res.status}`);
  const photos = (await res.json()).results || [];
  const items = [];
  for (const [i, p] of photos.entries()) {
    const file = path.join(out, `${base}-${i + 1}.jpg`);
    const sized = `${p.urls.raw}&w=${w}&h=${h}&fit=crop&crop=entropy&fm=jpg&q=80`;
    await save(sized, file);
    // Unsplash API guidelines: count the download through its endpoint, credit the photographer.
    await fetch(p.links.download_location, { headers: { Authorization: `Client-ID ${key}` } }).catch(() => {});
    items.push({
      file, source: 'Unsplash', id: p.id, description: p.alt_description || p.description || '',
      hotlink: sized, page: `${p.links.html}?${UTM}`,
      credit: `Photo by ${p.user.name} on Unsplash`, author_url: `${p.user.links.html}?${UTM}`,
    });
  }
  return items;
}

async function fromPicsum() {
  const items = [];
  for (let i = 0; i < count; i++) {
    const file = path.join(out, `${base}-${i + 1}.jpg`);
    const res = await save(`https://picsum.photos/seed/${encodeURIComponent(base + '-' + (i + 1))}/${w}/${h}.jpg`, file);
    const id = res.headers.get('picsum-id');
    let info = {};
    if (id) info = await fetch(`https://picsum.photos/id/${id}/info`).then(r => r.json()).catch(() => ({}));
    items.push({
      file, source: 'Lorem Picsum (Unsplash photo)', id, description: '(random photo, no search without an Unsplash key)',
      hotlink: id ? `https://picsum.photos/id/${id}/${w}/${h}` : null, page: info.url || null,
      credit: info.author ? `Photo by ${info.author} on Unsplash` : 'Photo from Unsplash via Lorem Picsum', author_url: null,
    });
  }
  return items;
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const items = key ? await fromUnsplash() : await fromPicsum();
  if (!items.length) { console.log(`No photos found for "${query}". Try a simpler query.`); process.exit(2); }
  const creditsFile = path.join(out, 'credits.json');
  const credits = fs.existsSync(creditsFile) ? JSON.parse(fs.readFileSync(creditsFile, 'utf8')) : [];
  const date = new Date().toISOString().slice(0, 10);
  for (const it of items) {
    const rec = { ...it, file: path.basename(it.file), query, size: `${w}x${h}`, date };
    const at = credits.findIndex(c => c.file === rec.file);
    if (at >= 0) credits[at] = rec; else credits.push(rec);
  }
  fs.writeFileSync(creditsFile, JSON.stringify(credits, null, 2) + '\n');
  console.log(`${key ? 'Unsplash' : 'Lorem Picsum (no UNSPLASH_ACCESS_KEY: random photos, no search)'}: ${items.length} photo(s), ${w}x${h}`);
  for (const it of items) console.log(`  ${it.file}  |  ${it.credit}${it.description ? '  |  ' + it.description : ''}`);
  console.log(`Credits: ${creditsFile}`);
})().catch(e => { console.error(e.message); process.exit(1); });

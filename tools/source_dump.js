// Source dump for the screen fidelity check (Design_System_Intake_Skill/steps/screens.md 7f step 4).
// Run inside the running app at the screen size (1440 x 900+), e.g. pasted into the built-in browser's
// javascript tool or Playwright `page.evaluate`. Returns JSON: every visible text with its real
// computed style and box, plus boxes with a visible background, border or radius. Coordinates are
// relative to the screen's top-left, so they compare 1:1 with a 1440-wide Figma frame.
// Usage: copy the whole file, evaluate it, save the returned string as audits/<date>-<screen>-source.json.
(() => {
  const hex = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    const a = p.length > 3 ? p[3] : 1;
    if (a === 0) return null;
    return '#' + p.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('') + (a < 1 ? '@' + Math.round(a * 100) : '');
  };
  const visible = (el, r, cs) => r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.05 && r.bottom > 0 && r.right > 0;
  const texts = [], boxes = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode, s = node.textContent.replace(/\s+/g, ' ').trim();
    if (!s) continue;
    const el = node.parentElement; if (!el || seen.has(el)) continue;
    const cs = getComputedStyle(el), range = document.createRange(); range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (!visible(el, r, cs)) continue;
    seen.add(el);
    const full = el.innerText ? el.innerText.replace(/\s+/g, ' ').trim() : s;
    texts.push({ text: full.length <= 120 ? full : s, x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height),
      size: parseFloat(cs.fontSize), weight: Number(cs.fontWeight), family: cs.fontFamily.split(',')[0].replace(/["']/g, ''), color: hex(cs.color),
      transform: cs.textTransform !== 'none' ? cs.textTransform : undefined, lineHeight: cs.lineHeight });
  }
  for (const el of document.body.querySelectorAll('*')) {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (!visible(el, r, cs) || r.width < 12 || r.height < 8) continue;
    const bg = hex(cs.backgroundColor), bw = parseFloat(cs.borderTopWidth) || 0, border = bw ? hex(cs.borderTopColor) : null, radius = parseFloat(cs.borderTopLeftRadius) || 0;
    if (!bg && !border && !radius) continue;
    boxes.push({ tag: el.tagName.toLowerCase(), cls: (el.className && el.className.baseVal === undefined ? String(el.className) : '').slice(0, 80), x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height),
      bg, border, borderWidth: bw || undefined, radius: radius || undefined,
      padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat).join(','), gap: cs.gap !== 'normal' ? cs.gap : undefined });
  }
  return JSON.stringify({ url: location.href, viewport: [innerWidth, innerHeight], scrollHeight: document.documentElement.scrollHeight, texts, boxes });
})();

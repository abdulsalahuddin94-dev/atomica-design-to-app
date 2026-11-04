// Figma side of the screen fidelity check (Design_System_Intake_Skill/steps/screens.md 7f step 4).
// Read-only. Set SCREEN_ID to the screen frame id, run through FigCli eval (wrap in an async IIFE) or
// figma_execute. Returns JSON with every visible text (characters, size, weight, resolved color, box
// relative to the frame) and every visible frame / rectangle with a fill, stroke or radius, so
// tools/fidelity_diff.py can compare it with tools/source_dump.js output.
(async () => {
  const SCREEN_ID = '__SCREEN_ID__';
  const screen = await figma.getNodeByIdAsync(SCREEN_ID);
  if (!screen) return JSON.stringify({ error: 'screen not found ' + SCREEN_ID });
  const ox = screen.absoluteTransform[0][2], oy = screen.absoluteTransform[1][2];
  const hex = (p, op) => p && p.color ? '#' + [p.color.r, p.color.g, p.color.b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('') + (op < 0.99 ? '@' + Math.round(op * 100) : '') : null;
  const weightOf = (style) => { const s = (style || '').toLowerCase(); return s.includes('black') ? 900 : s.includes('extrabold') ? 800 : s.includes('semibold') ? 600 : s.includes('bold') ? 700 : s.includes('medium') ? 500 : s.includes('light') ? 300 : 400; };
  const shown = (n) => { for (let p = n; p && p.id !== screen.id; p = p.parent) { if (p.visible === false) return false; if ('opacity' in p && p.opacity === 0) return false; } return true; };
  const opacityChain = (n) => { let o = 1; for (let p = n; p && p.id !== screen.id; p = p.parent) if ('opacity' in p) o *= p.opacity; return o; };
  const texts = [], boxes = [];
  const all = screen.findAll((n) => n.type === 'TEXT' || ((n.type === 'FRAME' || n.type === 'RECTANGLE' || n.type === 'INSTANCE' || n.type === 'COMPONENT') && n.width >= 12 && n.height >= 8));
  for (const n of all) {
    let ok = false; try { ok = shown(n); } catch (e) { ok = false; }
    if (!ok) continue;
    let b; try { b = n.absoluteBoundingBox; } catch (e) { continue; }
    if (!b) continue;
    const x = Math.round(b.x - ox), y = Math.round(b.y - oy), w = Math.round(b.width), h = Math.round(b.height);
    if (n.type === 'TEXT') {
      let fill = null; try { const f = Array.isArray(n.fills) ? n.fills.find((p) => p.visible !== false && p.type === 'SOLID') : null; fill = f ? hex(f, (f.opacity ?? 1) * opacityChain(n)) : null; } catch (e) {}
      const fn = n.fontName === figma.mixed ? null : n.fontName;
      texts.push({ text: n.characters.replace(/\s+/g, ' ').trim(), x, y, w, h, size: n.fontSize === figma.mixed ? null : n.fontSize, weight: fn ? weightOf(fn.style) : null, family: fn ? fn.family : null, color: fill, upper: n.textCase === 'UPPER' || undefined, id: n.id });
    } else {
      let bg = null, border = null, radius = 0;
      try { const f = Array.isArray(n.fills) ? n.fills.find((p) => p.visible !== false && p.type === 'SOLID') : null; bg = f ? hex(f, (f.opacity ?? 1) * opacityChain(n)) : null; } catch (e) {}
      try { const s = Array.isArray(n.strokes) && n.strokeWeight ? n.strokes.find((p) => p.visible !== false && p.type === 'SOLID') : null; border = s ? hex(s, (s.opacity ?? 1) * opacityChain(n)) : null; } catch (e) {}
      try { radius = typeof n.cornerRadius === 'number' ? n.cornerRadius : (n.topLeftRadius || 0); } catch (e) {}
      if (!bg && !border && !radius) continue;
      boxes.push({ name: n.name, type: n.type, x, y, w, h, bg, border, radius: radius || undefined, padding: n.layoutMode && n.layoutMode !== 'NONE' ? [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft].join(',') : undefined, id: n.id });
    }
  }
  return JSON.stringify({ screen: screen.name, size: [Math.round(screen.width), Math.round(screen.height)], texts, boxes });
})();

// read-only
// Screens export for the Live Prototype trial (Screens_Handoff_Skill). Run through tools/screens_export.cjs, which
// replaces __OPTS__ and calls FigCli eval once per screen (FigCli output stops at 20,000 characters).
// OPTS.mode = 'list'   -> the screen frames of OPTS.page (inside sections too), with their pinned Semantic mode.
// OPTS.mode = 'screen' -> one frame (OPTS.id) as a tree: frames with auto layout, DS instances (component, variant and
//                         component properties, text and nested swap overrides, image layers), texts, prototype reactions.
// Keys are short to stay under the output limit: n name, t type (F frame, I instance, T text, R shape), c component,
// v variant, p properties, tx texts, ni nested instances, img image layers, l layout, s sizing, f fill token, ch children.
(async (OPTS) => {
  await figma.loadAllPagesAsync();
  const varName = new Map();
  async function tokenOf(id) {
    if (!id) return null;
    if (!varName.has(id)) {
      const v = await figma.variables.getVariableByIdAsync(id);
      varName.set(id, v ? v.name : null);
    }
    return varName.get(id);
  }
  const collName = new Map();
  async function modesOf(node) {
    const out = {};
    const m = node.explicitVariableModes || {};
    for (const cid of Object.keys(m)) {
      if (!collName.has(cid)) {
        const c = await figma.variables.getVariableCollectionByIdAsync(cid);
        collName.set(cid, c ? { name: c.name, modes: Object.fromEntries(c.modes.map((x) => [x.modeId, x.name])) } : null);
      }
      const c = collName.get(cid);
      if (c) out[c.name] = c.modes[m[cid]] || m[cid];
    }
    return out;
  }
  const r1 = (x) => Math.round(x * 10) / 10;

  if (OPTS.mode === 'list') {
    const page = figma.root.children.find((p) => p.name === OPTS.page);
    if (!page) return JSON.stringify({ error: 'page not found: ' + OPTS.page, pages: figma.root.children.map((p) => p.name) });
    await page.loadAsync();
    const frames = [];
    const visit = async (n, section) => {
      if (n.type === 'SECTION') { for (const c of n.children) await visit(c, n.name); return; }
      if (n.type !== 'FRAME') return;
      let modes = await modesOf(n);
      if (!Object.keys(modes).length && n.parent && n.parent.type === 'SECTION') modes = await modesOf(n.parent);
      frames.push({ id: n.id, n: n.name, section, w: r1(n.width), h: r1(n.height), modes, reactions: (n.reactions || []).length });
    };
    for (const c of page.children) await visit(c, null);
    return JSON.stringify({ file: figma.root.name, page: page.name, frames });
  }

  // OPTS.mode = 'img' / 'chunk': one image layer exported (JPG at OPTS.scale), kept in the page between calls and
  // returned as base64 in slices (FigCli's export command does not reach layers inside instances).
  // OPTS.mode = 'crops': for each image layer (OPTS.ids) the visible image paint's hash, scale mode and transform, so
  // the runner can cut every crop from its source image locally (Figma screenshots often use one image cropped many times).
  if (OPTS.mode === 'crops') {
    const out = {};
    for (const id of OPTS.ids) {
      const n = await figma.getNodeByIdAsync(id);
      if (!n) continue;
      const all = [n].concat('findAll' in n ? n.findAll((x) => x.visible !== false) : []);
      const x = all.find((y) => Array.isArray(y.fills) && y.fills.some((f) => f.type === 'IMAGE' && f.imageHash && f.visible !== false));
      if (!x) continue;
      const p = x.fills.filter((f) => f.type === 'IMAGE' && f.imageHash && f.visible !== false).pop();
      out[id] = { hash: p.imageHash, mode: p.scaleMode, t: p.imageTransform ? [].concat(...p.imageTransform) : null, w: x.width, h: x.height };
    }
    return JSON.stringify({ crops: out });
  }
  if (OPTS.mode === 'img' && OPTS.hash) {
    const bytes = await figma.getImageByHash(OPTS.hash).getBytesAsync();
    globalThis.__fpImg = globalThis.__fpImg || {};
    globalThis.__fpImg[OPTS.id] = figma.base64Encode(bytes);
    return JSON.stringify({ id: OPTS.id, len: globalThis.__fpImg[OPTS.id].length });
  }
  if (OPTS.mode === 'img') {
    const n = await figma.getNodeByIdAsync(OPTS.id);
    if (!n) return JSON.stringify({ error: 'node not found: ' + OPTS.id });
    let bytes;
    if (OPTS.original) {
      // A layer clipped by its parent exports only its visible part: take the image fill's own bytes instead.
      // The topmost visible image paint (a layer can keep hidden image paints under the one that shows).
      const shown = (x) => Array.isArray(x.fills) ? x.fills.filter((f) => f.type === 'IMAGE' && f.imageHash && f.visible !== false) : [];
      const withImg = [n].concat('findAll' in n ? n.findAll((x) => x.visible !== false) : []).find((x) => shown(x).length);
      const paint = withImg && shown(withImg).pop();
      if (!paint) return JSON.stringify({ error: 'no image fill: ' + OPTS.id });
      bytes = await figma.getImageByHash(paint.imageHash).getBytesAsync();
    } else {
      bytes = await n.exportAsync({ format: OPTS.format || 'JPG', constraint: { type: 'SCALE', value: OPTS.scale || 2 } });
    }
    globalThis.__fpImg = globalThis.__fpImg || {};
    globalThis.__fpImg[OPTS.id] = figma.base64Encode(bytes);
    return JSON.stringify({ id: OPTS.id, len: globalThis.__fpImg[OPTS.id].length });
  }
  if (OPTS.mode === 'chunk') {
    const s = (globalThis.__fpImg || {})[OPTS.id] || '';
    const part = s.slice(OPTS.off, OPTS.off + 18000);
    if (OPTS.off + 18000 >= s.length && !OPTS.keep) delete globalThis.__fpImg[OPTS.id];
    return JSON.stringify({ d: part });
  }

  const root = await figma.getNodeByIdAsync(OPTS.id);
  if (!root) return JSON.stringify({ error: 'node not found: ' + OPTS.id });

  async function fillToken(n) {
    const b = n.boundVariables && n.boundVariables.fills;
    if (b && b[0]) return tokenOf(b[0].id);
    return null;
  }
  const hasImage = (n) => Array.isArray(n.fills) && n.fills.some((f) => f.type === 'IMAGE' && f.visible !== false);
  async function reactionsOf(n) {
    const out = [];
    for (const r of n.reactions || []) {
      const acts = r.actions || (r.action ? [r.action] : []);
      for (const a of acts) {
        if (!a) continue;
        const rec = { on: r.trigger ? r.trigger.type : null, a: a.type };
        if (a.type === 'NODE') {
          rec.nav = a.navigation;
          if (a.destinationId) {
            const d = await figma.getNodeByIdAsync(a.destinationId);
            rec.to = a.destinationId; rec.toName = d ? d.name : null;
          }
        }
        out.push(rec);
      }
    }
    return out.length ? out : undefined;
  }
  // Auto layout; gt / pt hold the Spacing token names bound to the gap and to each padding (null = raw value).
  async function layoutOf(n) {
    if (!('layoutMode' in n) || n.layoutMode === 'NONE') return undefined;
    const bv = n.boundVariables || {};
    const tok = async (k) => (bv[k] ? tokenOf(bv[k].id) : null);
    const pt = [await tok('paddingTop'), await tok('paddingRight'), await tok('paddingBottom'), await tok('paddingLeft')];
    return {
      m: n.layoutMode, g: n.itemSpacing, gt: (await tok('itemSpacing')) || undefined,
      p: [n.paddingTop, n.paddingRight, n.paddingBottom, n.paddingLeft], pt: pt.some(Boolean) ? pt : undefined,
      pa: n.primaryAxisAlignItems, ca: n.counterAxisAlignItems, wr: n.layoutWrap === 'WRAP' ? n.counterAxisSpacing : undefined,
      wt: n.layoutWrap === 'WRAP' ? (await tok('counterAxisSpacing')) || undefined : undefined,
    };
  }
  function sizingOf(n) {
    const s = {};
    if ('layoutSizingHorizontal' in n) { s.h = n.layoutSizingHorizontal; s.v = n.layoutSizingVertical; }
    if (n.layoutPositioning === 'ABSOLUTE') s.abs = true;
    if (n.scrollBehavior && n.scrollBehavior !== 'SCROLLS') s.sb = n.scrollBehavior; // Figma "Fix position when scrolling"
    if (n.layoutGrow) s.grow = n.layoutGrow;
    return s;
  }
  // A swap holds a component id: it is given as that component's name (Icon/expand_more) or, inside a set, its
  // variant name (Value=10), the way the Figma swap menu and the Storybook components name it.
  const swapName = new Map();
  async function swapOf(id) {
    if (!swapName.has(id)) {
      const c = await figma.getNodeByIdAsync(id);
      swapName.set(id, !c ? null : c.parent && c.parent.type === 'COMPONENT_SET' ? { set: c.parent.name, name: c.name } : { name: c.name });
    }
    return swapName.get(id);
  }
  async function propsOf(inst) {
    const v = {}, p = {};
    const cp = inst.componentProperties || {};
    for (const k of Object.keys(cp)) {
      const name = k.replace(/#[^#]*$/, '');
      const prop = cp[k];
      if (prop.type === 'VARIANT') v[name] = prop.value;
      else if (prop.type === 'INSTANCE_SWAP') p[name] = Object.assign({ swap: prop.value }, await swapOf(prop.value));
      else p[name] = prop.value;
    }
    return { v, p };
  }
  async function compName(inst) {
    const main = await inst.getMainComponentAsync();
    if (!main) return { c: null, variant: null };
    const set = main.parent && main.parent.type === 'COMPONENT_SET' ? main.parent : null;
    return { c: set ? set.name : main.name, variant: set ? main.name : null, key: main.key, remote: main.remote };
  }

  // Inside an instance: visible texts by layer name, nested instances (their component + variant), image layers.
  // Also, for overrides the Storybook component takes as extra props: text style (ts) and max lines (ml) per text
  // layer, and the names of hidden nested layers (hid).
  const styleName = new Map();
  async function textStyleOf(t) {
    if (typeof t.textStyleId !== 'string' || !t.textStyleId) return null;
    if (!styleName.has(t.textStyleId)) { const st = await figma.getStyleByIdAsync(t.textStyleId); styleName.set(t.textStyleId, st ? st.name : null); }
    return styleName.get(t.textStyleId);
  }
  async function instanceContent(inst) {
    const tx = {}, ni = {}, img = [], ts = {}, ml = {}, hid = [];
    const seen = {};
    const walk = async (n, path) => {
      for (const c of n.children || []) {
        if (c.visible === false) { hid.push(c.name); continue; }
        const key = c.name;
        if (c.type === 'TEXT') {
          const k = seen[key] ? key + '#' + (++seen[key]) : (seen[key] = 1, key);
          tx[k] = c.characters;
          const st = await textStyleOf(c);
          if (st) ts[k] = st;
          if (c.maxLines) ml[k] = c.maxLines;
        } else if (c.type === 'INSTANCE') {
          const info = await compName(c);
          const k = ni[key] ? key + '#' + Object.keys(ni).filter((x) => x.split('#')[0] === key).length : key;
          ni[k] = { id: c.id, c: info.c, v: info.variant, f: await fillToken(c) || undefined };
        }
        if (hasImage(c)) img.push({ id: c.id, n: c.name, w: r1(c.width), h: r1(c.height) });
        if ('children' in c) await walk(c, path + '/' + c.name);
      }
    };
    await walk(inst, '');
    if (hasImage(inst)) img.push({ id: inst.id, n: inst.name, w: r1(inst.width), h: r1(inst.height) });
    return { tx, ni, img, ts, ml, hid };
  }

  async function nodeOf(n, stubKids) {
    if (n.visible === false) return null;
    const base = { id: n.id, n: n.name, x: r1(n.x), y: r1(n.y), w: r1(n.width), h: r1(n.height) };
    const s = sizingOf(n); if (Object.keys(s).length) base.s = s;
    const re = await reactionsOf(n); if (re) base.re = re;
    if (n.opacity !== undefined && n.opacity < 1) base.o = r1(n.opacity);
    if (n.type === 'INSTANCE') {
      const info = await compName(n);
      const { v, p } = await propsOf(n);
      const content = await instanceContent(n);
      return Object.assign(base, {
        t: 'I', c: info.c, v, p,
        tx: Object.keys(content.tx).length ? content.tx : undefined,
        ni: Object.keys(content.ni).length ? content.ni : undefined,
        img: content.img.length ? content.img : undefined,
        ts: Object.keys(content.ts).length ? content.ts : undefined,
        ml: Object.keys(content.ml).length ? content.ml : undefined,
        hid: content.hid.length ? content.hid : undefined,
        il: await layoutOf(n),
        f: (await fillToken(n)) || undefined,
      });
    }
    if (n.type === 'TEXT') {
      let style = null;
      if (typeof n.textStyleId === 'string' && n.textStyleId) {
        const st = await figma.getStyleByIdAsync(n.textStyleId); style = st ? st.name : null;
      }
      return Object.assign(base, { t: 'T', chars: n.characters, st: style, f: await fillToken(n), al: n.textAlignHorizontal });
    }
    if ('children' in n) {
      const ch = [];
      for (const c of n.children) {
        if (stubKids) { if (c.visible !== false) ch.push({ id: c.id, stub: true }); continue; }
        const r = await nodeOf(c); if (r) ch.push(r);
      }
      const rad = n.boundVariables && (n.boundVariables.topLeftRadius || n.boundVariables.cornerRadius);
      return Object.assign(base, {
        t: 'F', l: await layoutOf(n), f: (await fillToken(n)) || undefined, clip: n.clipsContent || undefined,
        r: typeof n.cornerRadius === 'number' && n.cornerRadius ? n.cornerRadius : undefined,
        rt: rad ? await tokenOf(rad.id) : undefined, img: hasImage(n) || undefined, ch,
      });
    }
    return Object.assign(base, { t: 'R', f: (await fillToken(n)) || undefined, img: hasImage(n) || undefined });
  }

  // OPTS.shallow: the frame with its children as stubs ({id, stub}); the runner then reads each child on its own.
  if (OPTS.shallow) {
    const tree = await nodeOf(root, true);
    if (OPTS.mode === 'node') return JSON.stringify({ tree });
    let modes = await modesOf(root);
    if (!Object.keys(modes).length && root.parent && root.parent.type === 'SECTION') modes = await modesOf(root.parent);
    return JSON.stringify({ id: root.id, n: root.name, modes, tree });
  }
  const tree = await nodeOf(root);
  if (OPTS.mode === 'node') return JSON.stringify({ tree });
  let modes = await modesOf(root);
  if (!Object.keys(modes).length && root.parent && root.parent.type === 'SECTION') modes = await modesOf(root.parent);
  return JSON.stringify({ id: root.id, n: root.name, modes, tree });
})(__OPTS__)

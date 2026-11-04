"""Live Prototype trial (Screens_Handoff_Skill): generate a clickable prototype from an exported Design file.

Usage (from the Root):
  python tools/build_prototype.py "My Projects/<Project>" [--screens <path to screens.json>] [--flow "Listen"] [--refresh]

Reads   <project>/prototype/data/screens.json  (tools/screens_export.cjs)
        <project>/prototype/adapters.json      (optional: how nested texts, images and events reach each React component)
        <project>/storybook/component-map.json (Figma component name -> Storybook React export)
        <project>/storybook/src/tokens/tokens.css, styles/text-styles.css (CSS names of tokens and text styles)
Writes  <project>/prototype/ (a copy of Screens_Handoff_Skill/templates/prototype/ on the first run or with --refresh,
        node_modules kept), src/generated/screens/*.tsx, routes.ts, theme.css, ds.config.json, public/figma-img/,
        and the Code panel's reference code through tools/screen_code.py (public/code/, data/code_map.json).

The prototype reuses the project's Storybook components through the @ds alias; it never re-creates a component.
Every element carries data-figma-node (Figma node id); every DS instance also data-component (its Figma name).
A Figma component without a Storybook export renders as a dashed box with its name and is listed as missing.
"""
import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / 'Screens_Handoff_Skill' / 'templates' / 'prototype'
MODE_SUFFIX = re.compile(r'\s*[/\-–—|(]\s*(Dark|Light)\)?\s*$', re.I)


def load_screens(path):
    """data/screens.json (the pure Figma export, never edited) with the prototype's own changes from data/overrides.json
    applied on top, for changes made code-first (e.g. an approved review comment) before they are synced to Figma.
    overrides.json: {"changes": [{"id", "comment", "screen", "op": "remove", "nodes": [Figma ids], "close_gap": true,
    "description"}]}. remove deletes the nodes; close_gap on a child of the screen frame moves the later children up and
    makes the frame shorter by its height, so bars pinned at the bottom stay at the bottom. A change whose nodes are no
    longer in the export is reported as already in Figma (synced) and does nothing. data["_overrides"] lists the result.
    op "duplicate": {"nodes": [source ids], "after": [anchor ids, one per source]} copies each source node (with its
    instances and their content) and inserts the copy right after its anchor sibling; copied ids get the suffix
    "~<change id>" (images still come from the source node), later siblings move down and the screen frame grows by
    the copy's height, so bars pinned at the bottom stay at the bottom. Synced when the anchor is gone from the export
    or a sibling after the anchor already has the source's name and size (the copy exists in Figma).
    op "add_screen": {"frames": [{"id", "n", "modes", "section", "w", "h", "tree" | "from": frame id, "add": [nodes],
    "re": [reactions]}]} adds a new screen frame (e.g. a sheet or a confirmation of a new flow), its tree written in the
    export's own node format (DS instances, tokens) or copied from another frame ("from", ids suffixed "~<change id>")
    with "add" children on top and "re" reactions on its root. Synced when a frame with that name is in the export.
    op "link": {"nodes": [ids], "re": [reactions]} gives nodes the Figma prototype reactions they have no export for yet
    ({"on": "ON_CLICK", "a": "NODE", "to": frame id, "nav": "NAVIGATE" | "OVERLAY"} or {"a": "BACK"}). Synced when the
    nodes already have reactions in the export."""
    import copy as _copy
    path = Path(path)
    data = json.loads(path.read_text(encoding='utf-8'))
    ov_path = path.parent / 'overrides.json'
    changes = (json.loads(ov_path.read_text(encoding='utf-8')) if ov_path.exists() else {}).get('changes', [])
    index = {}

    def walk(n, parent, screen):
        index[n['id']] = (n, parent, screen)
        for c in n.get('ch') or []:
            walk(c, n, screen)
    for scr in data['screens']:
        walk(scr['tree'], None, scr)
    def grow(parent, scr, at_y, h):
        for sib in parent['ch']:
            # absolute bars pinned to the bottom (Mini Player, Bottom Navigation) follow the frame's bottom edge
            pinned = parent is scr['tree'] and (sib.get('s') or {}).get('abs') and sib['y'] > parent['h'] / 2
            if sib['y'] >= at_y or pinned:
                sib['y'] += h
        if parent is scr['tree']:
            parent['h'] += h
            if isinstance(scr.get('h'), (int, float)) and scr is not parent:
                scr['h'] += h

    def suffix_ids(n, sfx):
        n['id'] = n['id'] + sfx
        for c in n.get('ch') or []:
            suffix_ids(c, sfx)

    result = []
    for ch in changes:
        done = []
        if ch.get('op') == 'add_screen':
            names = {s['n'] for s in data['screens']}
            for fr in ch.get('frames', []):
                if fr['n'] in names:
                    continue  # already in Figma
                if fr.get('from'):
                    src = index.get(fr['from'])
                    if not src:
                        continue
                    tree = _copy.deepcopy(src[0])
                    suffix_ids(tree, '~' + ch.get('id', 'copy'))
                    tree.update(id=fr['id'], n=fr['n'])
                else:
                    tree = _copy.deepcopy(fr['tree'])
                    tree.update(id=fr['id'], n=fr['n'])
                tree['ch'] = (tree.get('ch') or []) + _copy.deepcopy(fr.get('add') or [])
                if fr.get('re'):
                    tree['re'] = fr['re']
                scr = {k: fr[k] for k in ('id', 'n', 'modes', 'section') if k in fr}
                scr.update(w=tree['w'], h=tree['h'], tree=tree)
                data['screens'].append(scr)
                walk(tree, None, scr)
                done.append(fr['id'])
            result.append(dict(ch, applied=done, status='applied' if done else 'synced (not in the Figma export any more)'))
            continue
        if ch.get('op') == 'link':
            for nid in ch.get('nodes', []):
                hit = index.get(nid)
                if not hit or hit[0].get('re'):
                    continue  # gone, or Figma has its own reactions now
                hit[0]['re'] = _copy.deepcopy(ch.get('re') or [])
                done.append(nid)
            result.append(dict(ch, applied=done, status='applied' if done else 'synced (not in the Figma export any more)'))
            continue
        if ch.get('op') == 'duplicate':
            for nid, anchor_id in zip(ch.get('nodes', []), ch.get('after', [])):
                src, anchor = index.get(nid), index.get(anchor_id)
                if not src or not anchor or not anchor[1] or anchor[1] is not src[1]:
                    continue
                node, parent, scr = anchor
                later = parent['ch'][parent['ch'].index(node) + 1:]
                if any(s['n'] == src[0]['n'] and s['h'] == src[0]['h'] for s in later):
                    continue  # already copied in Figma
                dup = _copy.deepcopy(src[0])
                suffix_ids(dup, '~' + ch.get('id', 'copy'))
                dup['y'] = node['y'] + node['h']
                grow(parent, scr, dup['y'], dup['h'])
                parent['ch'].insert(parent['ch'].index(node) + 1, dup)
                done.append(nid)
            result.append(dict(ch, applied=done, status='applied' if done else 'synced (not in the Figma export any more)'))
            continue
        for nid in ch.get('nodes', []):
            hit = index.get(nid)
            if not hit or not hit[1]:
                continue
            node, parent, scr = hit
            if ch.get('op') == 'remove':
                parent['ch'] = [c for c in parent['ch'] if c is not node]
                if ch.get('close_gap') and parent is scr['tree']:
                    for sib in parent['ch']:
                        if sib['y'] > node['y']:
                            sib['y'] -= node['h']
                    parent['h'] -= node['h']
                    if isinstance(scr.get('h'), (int, float)) and scr is not parent:
                        scr['h'] -= node['h']  # the frame entry keeps its own size next to its tree
                done.append(nid)
        result.append(dict(ch, applied=done, status='applied' if done else 'synced (not in the Figma export any more)'))
    data['_overrides'] = result
    return data


def slugify(s):
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') or 'screen'


def base_name(name):
    return MODE_SUFFIX.sub('', name).strip()


def parse_css_names(path, pattern):
    """CSS name per Figma name from the comments the Storybook generators write next to each rule."""
    out = {}
    if not path.exists():
        return out
    for m in re.finditer(pattern, path.read_text(encoding='utf-8')):
        out[m.group(2).strip()] = m.group(1)
    return out


class Ctx:
    def __init__(self, project, data, adapters, cmap, var_css, text_css):
        self.project, self.data, self.adapters, self.cmap = project, data, adapters, cmap
        self.var_css, self.text_css = var_css, text_css
        self.by_id = {}           # any mode's frame id -> slug
        self.missing = {}         # Figma component name -> count
        self.raw = []             # values without a token, for the report
        self.imports = {}         # module -> set(exports)
        self.uses_nav = set()

    # ---- tokens ----
    def has_var(self, token):
        return any(k.split('::', 1)[-1] == token for k in self.var_css)

    def var(self, token):
        """Figma variable name -> CSS custom property (from tokens.css), e.g. md/sys/color/surface -> --md-sys-color-surface."""
        if not token:
            return None
        for key in (token, 'Semantic::' + token):
            if key in self.var_css:
                return self.var_css[key]
        hit = [v for k, v in self.var_css.items() if k.split('::', 1)[-1] == token]
        return hit[0] if hit else '--' + token.replace('/', '-')

    def text_class(self, style):
        return self.text_css.get(style) if style else None


ASSETS = set()  # exported image files; an image without one is left to the component's own placeholder


def asset_url(node_id):
    name = re.sub(r'[:;]', '-', node_id.split('~')[0]) + '.png'  # a code-first copy ("id~change") uses its source's image
    # Relative to the page, so the same build works at / (dev) and under a sub-path (GitHub Pages).
    return 'figma-img/' + name if name in ASSETS else None


# ---------- adapter specs ----------
def tx_list(node, name):
    tx = node.get('tx') or {}
    keys = [k for k in tx if k == name or re.fullmatch(re.escape(name) + r'#\d+', k)]
    keys.sort(key=lambda k: int(k.split('#')[1]) if '#' in k else 1)
    return [tx[k] for k in keys]


def ni_list(node, name):
    ni = node.get('ni') or {}
    keys = [k for k in ni if k == name or re.fullmatch(re.escape(name) + r'#\d+', k)]
    keys.sort(key=lambda k: int(k.split('#')[1]) if '#' in k else 0)
    return [ni[k] for k in keys]


def ni_field(item, field):
    if item is None:
        return None
    return {'v': item.get('v'), 'c': item.get('c'), 'f': item.get('f')}.get(field or 'v')


def spec_value(spec, node):
    """Small mapping language of adapters.json (documented in Screens_Handoff_Skill/README.md)."""
    if isinstance(spec, dict):
        if 'const' in spec:
            return spec['const']
        if 'zip' in spec:
            cols = {k: spec_value(v, node) or [] for k, v in spec['zip'].items()}
            n = max((len(v) for v in cols.values()), default=0)
            return [{k: (v[i] if i < len(v) else None) for k, v in cols.items()} for i in range(n)]
        if 'eq' in spec:
            a, b = spec['eq']
            return spec_value(a, node) == b
        if 'index' in spec:
            lst, val = spec['index']
            lst = spec_value(lst, node) or []
            return next((i for i, x in enumerate(lst) if x == val or (isinstance(x, str) and val in x)), -1)
        if 'first' in spec:
            for s in spec['first']:
                v = spec_value(s, node)
                if v not in (None, '', []):
                    return v
            return None
        return None
    if not isinstance(spec, str):
        return spec
    kind, _, arg = spec.partition(':')
    if kind == 'tx':
        return (node.get('tx') or {}).get(arg)
    if kind == 'tx*':
        return tx_list(node, arg)
    if kind == 'img':
        imgs = node.get('img') or []
        i = int(arg) if arg else 0
        return asset_url(imgs[i]['id']) if i < len(imgs) else None
    if kind == 'img*':
        return [u for u in (asset_url(i['id']) for i in node.get('img') or []) if u]
    if kind in ('ni', 'ni*'):
        name, _, field = arg.partition('.')
        items = ni_list(node, name)
        if kind == 'ni':
            return ni_field(items[0] if items else None, field)
        return [ni_field(i, field) for i in items]
    if kind in ('w', 'h') and not arg:
        return round(node[kind])
    if kind == 'ts':  # text style of a nested text layer
        return (node.get('ts') or {}).get(arg)
    if kind == 'ml':  # max lines of a nested text layer
        return (node.get('ml') or {}).get(arg)
    if kind == 'hid':  # is a nested layer hidden in this instance
        return arg in (node.get('hid') or [])
    if kind == 'v':
        return (node.get('v') or {}).get(arg)
    if kind == 'p':
        return (node.get('p') or {}).get(arg)
    return spec


# ---------- JSX ----------
IDENT = re.compile(r'^[A-Za-z_$][A-Za-z0-9_$]*$')


def js(v):
    return json.dumps(v, ensure_ascii=False)


def jsx_props(props, raw=None):
    """props: name -> python value; raw: name -> JS expression. Names with spaces go through a spread, as in Storybook."""
    simple, spread = [], {}
    for k, v in props.items():
        if v is None:
            continue
        if IDENT.match(k):
            plain = isinstance(v, str) and '\\' not in js(v)  # JSX attribute strings take no escapes
            simple.append('%s=%s' % (k, js(v)) if plain else '%s={%s}' % (k, js(v)))
        else:
            spread[k] = v
    for k, expr in (raw or {}).items():
        simple.append('%s={%s}' % (k, expr))
    if spread:
        simple.append('{...%s}' % js(spread))
    return ' '.join(simple)


def style_attr(style):
    if not style:
        return ''
    parts = []
    for k, v in style.items():
        key = k if IDENT.match(k) else js(k)  # CSS custom properties ("--fp-pad") need quotes
        if isinstance(v, (int, float)):
            parts.append('%s: %s' % (key, round(v, 1)))
        else:
            parts.append('%s: %s' % (key, js(v)))
    return ' style={{ %s }}' % ', '.join(parts)


JUSTIFY = {'MIN': 'justify-start', 'CENTER': 'justify-center', 'MAX': 'justify-end', 'SPACE_BETWEEN': 'justify-between'}
ALIGN = {'MIN': 'items-start', 'CENTER': 'items-center', 'MAX': 'items-end', 'BASELINE': 'items-baseline'}
SIDES = ['pt', 'pr', 'pb', 'pl']


def pins(root):
    """Children of a screen frame that stay in place while the screen scrolls, from Figma: scroll behaviour FIXED
    (Fix position when scrolling), or positioned absolutely against the frame's bottom or top edge, together with the
    absolute children stacked on them (a Mini Player above a Bottom Navigation). Returns {'top': [...], 'bottom': [...]},
    each in screen order, with 'gap' = the Figma distance to the previous child of the group."""
    kids = root.get('ch') or []
    out = {'top': [], 'bottom': []}
    H = root['h']
    fixed = [c for c in kids if (c.get('s') or {}).get('abs') or (c.get('s') or {}).get('sb') == 'FIXED']
    edge = H
    for c in sorted(fixed, key=lambda c: -(c['y'] + c['h'])):
        if c['y'] + c['h'] >= edge - 16:   # touches the frame's bottom, or the bottom group within 16
            out['bottom'].insert(0, c)
            edge = c['y']
    edge = 0
    for c in sorted((c for c in fixed if c not in out['bottom']), key=lambda c: c['y']):
        if c['y'] <= edge + 16:
            out['top'].append(c)
            edge = c['y'] + c['h']
    for side in out.values():
        for prev, c in zip([None] + side[:-1], side):
            c['_gap'] = max(0, round(c['y'] - (prev['y'] + prev['h']))) if prev else 0
    return out


def fixed_screen(root, ctx):
    """A screen frame no taller than the device (adapters.json viewport, default 812) is one static screen in Figma
    (e.g. "Explore - Viewport"): the prototype shows it at its Figma height without scrolling, the content clipped
    under its pinned bars as in Figma. Taller frames ("Full") scroll, with the pinned bars docked."""
    return root['h'] <= (ctx.adapters.get('viewport', 812) if isinstance(ctx.adapters, dict) else 812) + 1


def spacing_class(prefix, value, token, ctx):
    if token:
        return '%s-(%s)' % (prefix, ctx.var(token))
    if value:
        ctx.raw.append('%s %s' % (prefix, value))
        return '%s-[%spx]' % (prefix, round(value, 1))
    return None


def sizing(node, parent_layout, ctx, cls, style, attrs):
    """Width / height of a node inside its parent, the way Figma sizes it."""
    # parent_layout: 'ROOT' for the screen frame, None for a child of a frame without auto layout, else the parent's layout.
    s = node.get('s') or {}
    if parent_layout == 'ROOT':
        if fixed_screen(node, ctx):  # one device screen in Figma (a Viewport frame): its height, no scrolling
            style.update({'width': node['w'], 'height': node['h'], 'position': 'relative'})
            attrs['data-fixed-screen'] = ''
        else:
            style.update({'width': node['w'], 'minHeight': node['h'], 'position': 'relative'})
        return
    absolute = not parent_layout or s.get('abs')
    if absolute:
        style.update({'position': 'absolute', 'left': node['x'], 'top': node['y']})
    horiz = bool(parent_layout) and parent_layout.get('m') == 'HORIZONTAL'
    for axis, dim in (('h', 'width'), ('v', 'height')):
        mode = s.get(axis, 'FIXED')
        size = node['w'] if dim == 'width' else node['h']
        if mode == 'FIXED' or absolute:
            style[dim] = size
        elif mode == 'FILL':
            along = (axis == 'h') == bool(horiz)
            if along:
                cls.append('flex-1 min-w-0' if axis == 'h' else 'flex-1 min-h-0')
            else:
                cls.append('self-stretch')
            attrs['data-fill-' + ('w' if axis == 'h' else 'h')] = ''


def emit(node, parent_layout, ctx, ind=2):
    pad = ' ' * ind
    t = node.get('t')
    cls, style, attrs = [], {}, {'data-figma-node': node['id']}
    sizing(node, parent_layout, ctx, cls, style, attrs)
    if node.get('o') is not None:
        style['opacity'] = node['o']
    click = reaction_handler(node, ctx)

    if t == 'I':
        # Figma is the source of the instance's box: a hugging instance keeps the height Figma measured, so a
        # component whose CSS differs (e.g. a min-height) cannot push the rest of the screen down.
        if (node.get('s') or {}).get('v') == 'HUG' and 'height' not in style:
            style['height'] = node['h']
            attrs['data-fill-h'] = ''
        return emit_instance(node, ctx, cls, style, attrs, click, pad)

    attrs['data-figma-name'] = node.get('n')
    if t == 'T':
        tc = ctx.text_class(node.get('st'))
        if tc:
            cls.append(tc)
        elif node.get('st') is None:
            ctx.raw.append('text without style: %s' % node.get('n'))
        if node.get('f'):
            style['color'] = 'var(%s)' % ctx.var(node['f'])
        al = {'CENTER': 'center', 'RIGHT': 'end', 'JUSTIFIED': 'justify'}.get(node.get('al'))
        if al:
            style['textAlign'] = al
        cls += ['m-0', 'whitespace-pre-wrap']  # no browser margin on <p>: Figma text boxes have none
        return '%s<p className=%s%s%s>%s</p>' % (pad, js(' '.join(cls)), attr_str(attrs), style_attr(style), jsx_text(node.get('chars', '')))

    if t == 'R':
        if node.get('img') and asset_url(node['id']):
            return '%s<img className=%s src=%s alt=""%s%s />' % (pad, js(' '.join(cls + ['fp-img'])), js(asset_url(node['id'])), attr_str(attrs), style_attr(style))
        if node.get('f'):
            style['background'] = 'var(%s)' % ctx.var(node['f'])
        return '%s<div className=%s%s%s />' % (pad, js(' '.join(cls)), attr_str(attrs), style_attr(style))

    # Frame
    cls.insert(0, 'fp-frame')
    lay = node.get('l')
    if lay:
        cls += ['flex', 'flex-col' if lay['m'] == 'VERTICAL' else 'flex-row']
        if lay.get('wr') is not None:
            cls.append('flex-wrap')
        cls += [c for c in (JUSTIFY.get(lay.get('pa')), ALIGN.get(lay.get('ca'))) if c]
        horiz = lay['m'] == 'HORIZONTAL'
        g = spacing_class('gap-x' if horiz else 'gap-y', lay.get('g') if lay.get('pa') != 'SPACE_BETWEEN' else 0, lay.get('gt'), ctx)
        if g:
            cls.append(g)
        if lay.get('wr'):  # wrapped rows: Figma's counter-axis spacing
            cls.append(spacing_class('gap-y', lay['wr'], lay.get('wt'), ctx))
        pt = lay.get('pt') or [None] * 4
        for side, value, token in zip(SIDES, lay.get('p') or [0] * 4, pt):
            c = spacing_class(side, value, token, ctx)
            if c:
                cls.append(c)
    elif node.get('ch') and 'position' not in style:
        style['position'] = 'relative'
    if node.get('f'):
        style['background'] = 'var(%s)' % ctx.var(node['f'])
    if node.get('img') and asset_url(node['id']):
        style['backgroundImage'] = 'url(%s)' % asset_url(node['id'])
        style['backgroundSize'] = 'cover'
    if node.get('clip'):
        if parent_layout == 'ROOT':
            style['overflow'] = 'clip'  # clip, not hidden: hidden would stop the pinned dock from sticking to the screen
        else:
            cls.append('overflow-hidden')
    if node.get('rts'):  # per corner [top-left, top-right, bottom-right, bottom-left], a token or 0
        style['borderRadius'] = ' '.join('var(%s)' % ctx.var(t) if t else '0' for t in node['rts'])
    elif node.get('rt'):
        style['borderRadius'] = 'var(%s)' % ctx.var(node['rt'])
    elif node.get('r'):
        style['borderRadius'] = node['r']
    if click:
        attrs['onClick'] = click
        cls.append('cursor-pointer')
    pinned = pins(node) if parent_layout == 'ROOT' else {'top': [], 'bottom': []}
    pinned_ids = {c['id'] for side in pinned.values() for c in side}
    kids = [emit(c, lay, ctx, ind + 2) for c in node.get('ch') or [] if c['id'] not in pinned_ids]
    for side, at in (('top', 0), ('bottom', None)):
        if not pinned[side]:
            continue
        # The dock stays at the top / bottom of the screen while the content scrolls, and takes its own height, so
        # nothing ends up hidden behind it.
        dock = []
        for c in pinned[side]:
            c2 = dict(c, s={k: v for k, v in (c.get('s') or {}).items() if k not in ('abs', 'sb')})
            if c['_gap']:
                tok = 'md/sys/spacing/%d' % c['_gap']
                dock.append('%s  <div aria-hidden="true" className=%s />' % (pad, js(spacing_class('h', c['_gap'], tok if ctx.has_var(tok) else None, ctx))))
            dock.append(emit(c2, {'m': 'VERTICAL'}, ctx, ind + 4))
        if fixed_screen(node, ctx):  # a static screen: the bars sit over the content, where Figma puts them
            dstyle = {'position': 'absolute', 'left': 0, 'right': 0, 'zIndex': 10, ('top' if side == 'top' else 'bottom'): 0}
        else:
            dstyle = {'position': 'sticky', 'zIndex': 10, ('top' if side == 'top' else 'bottom'): 0}
            if side == 'bottom':
                dstyle['marginTop'] = 'auto'
        tag = '%s<div className="fp-dock flex flex-col items-center self-stretch" data-dock=%s%s>' % (pad + '  ', js(side), style_attr(dstyle))
        block = [tag] + dock + ['%s  </div>' % pad]
        kids = (block + kids) if side == 'top' else (kids + block)
    open_tag = '%s<div className=%s%s%s>' % (pad, js(' '.join(cls)), attr_str(attrs), style_attr(style))
    if not kids:
        return open_tag[:-1] + ' />'
    return '\n'.join([open_tag] + kids + ['%s</div>' % pad])


def jsx_text(s):
    return '{%s}' % js(s)


def attr_str(attrs):
    out = []
    for k, v in attrs.items():
        if k == 'onClick':
            out.append(' onClick={%s}' % v)
        elif v == '':
            out.append(' %s=""' % k)
        elif '\\' in js(v):
            out.append(' %s={%s}' % (k, js(v)))
        else:
            out.append(' %s=%s' % (k, js(v)))
    return ''.join(out)


def target_expr(target, ctx):
    """'screen:<name>' / 'overlay:<name>' / 'back' -> a JS call."""
    if target == 'back':
        ctx.uses_nav.add('back')
        return 'back()'
    kind, _, name = target.partition(':')
    slug = ctx.slug_of_name(name)
    if not slug:
        print('  ! adapters.json points to an unknown screen:', name)
        return 'undefined'
    fn = 'overlay' if kind == 'overlay' else 'go'
    ctx.uses_nav.add(fn)
    return '%s(%s)' % (fn, js(slug))


def reaction_handler(node, ctx):
    for r in node.get('re') or []:
        if r.get('on') not in ('ON_CLICK', 'ON_PRESS', None):
            continue
        if r.get('a') == 'BACK':
            ctx.uses_nav.add('back')
            return '() => back()'
        if r.get('a') == 'NODE' and r.get('to'):
            slug = ctx.by_id.get(r['to'])
            if not slug:
                continue
            fn = 'overlay' if r.get('nav') in ('OVERLAY', 'SWAP') else 'go'
            ctx.uses_nav.add(fn)
            return '() => %s(%s)' % (fn, js(slug))
    return None


def emit_instance(node, ctx, cls, style, attrs, click, pad):
    name = node.get('c') or node.get('n')
    attrs['data-component'] = name
    entry = ctx.cmap.get(name)
    # A component's adapter, then the adapter of this layer name (e.g. "Collapse Button") on top of it.
    adapter = dict((ctx.adapters.get('components') or {}).get(name, {}))
    for k, v in ((ctx.adapters.get('instances') or {}).get(node.get('n'), {})).items():
        adapter[k] = dict(adapter.get(k) or {}, **v) if isinstance(v, dict) else v
    cls.insert(0, 'fp-inst')
    if not entry or adapter.get('render') == 'image':
        if adapter.get('render') == 'image' or (not entry and node.get('img')):
            src = spec_value(adapter.get('image', 'img'), node)
            if src:
                attrs['data-component'] = name
                return '%s<img className=%s src=%s alt=""%s%s />' % (pad, js(' '.join(cls + ['fp-img'])), js(src), attr_str(attrs), style_attr(style))
        ctx.missing[name] = ctx.missing.get(name, 0) + 1
        attrs['data-missing'] = ''
        style.update({'outline': '1px dashed #e11d48', 'fontSize': 10})
        return '%s<div className=%s%s%s>%s</div>' % (pad, js(' '.join(cls)), attr_str(attrs), style_attr(style), jsx_text(name))

    module, export = entry['module'], entry['export']
    ctx.imports.setdefault(module, set()).add(export)
    props = {}
    drop = set(adapter.get('drop', []))
    for k, v in (node.get('v') or {}).items():
        if k not in drop:
            props[k] = v
    for k, v in (node.get('p') or {}).items():
        if k in drop:
            continue
        if isinstance(v, dict) and 'swap' in v:
            # Storybook takes a swap as the component's name (Icon/share) or, in a set, its variant name (Value=40).
            if v.get('name'):
                props[k] = v['name']
            continue
        props[k] = v
    for k, spec in (adapter.get('props') or {}).items():
        val = spec_value(spec, node)
        if val is not None:
            props[k] = val
    raw = {}
    for ev, spec in (adapter.get('events') or {}).items():
        if isinstance(spec, dict) and 'by_index' in spec:
            table = {str(i): target_expr(t, ctx) for i, t in spec['by_index'].items()}
            body = ', '.join('%s: () => %s' % (js(i), e) for i, e in table.items())
            raw[ev] = '(i: unknown) => (({%s}) as Record<string, () => void>)[String(i)]?.()' % body
        elif isinstance(spec, str):
            raw[ev] = '() => %s' % target_expr(spec, ctx)
    if click:
        raw[adapter.get('click', 'onClick')] = click
    pad_override(node, ctx, style, attrs)
    inner = '<%s %s />' % (export, jsx_props(props, raw))
    return '%s<div className=%s%s%s>\n%s  %s\n%s</div>' % (pad, js(' '.join(cls)), attr_str(attrs), style_attr(style), pad, inner, pad)


def main_style(ctx, name, variant):
    """The main component's values (data/figma-styles.json, Light) for this variant, or None."""
    entry = ctx.figma_styles.get(name)
    if not entry:
        return None
    for key, modes in entry.items():
        pairs = dict(p.split('=', 1) for p in key.split(', ') if '=' in p)
        if pairs and all(variant.get(k) == v for k, v in pairs.items()):
            return modes.get('Light') or next(iter(modes.values()))
    first = entry.get('Default') or next(iter(entry.values()))
    return first.get('Light') or next(iter(first.values()))


def pad_override(node, ctx, style, attrs):
    """An instance whose padding differs from its main component (an instance override, e.g. the Player Utility Bar
    padded 24 in screens) passes it to the component's root through --fp-pad, with the bound Spacing tokens."""
    il = node.get('il')
    main = main_style(ctx, node.get('c'), node.get('v') or {})
    if not il or not main or main.get('paddingTop') is None:
        return
    mine = il.get('p') or [0, 0, 0, 0]
    theirs = [main.get('paddingTop'), main.get('paddingRight'), main.get('paddingBottom'), main.get('paddingLeft')]
    if [round(v or 0) for v in mine] == [round(v or 0) for v in theirs]:
        return
    toks = il.get('pt') or [None] * 4
    style['--fp-pad'] = ' '.join('var(%s)' % ctx.var(t) if t else '%spx' % round(v) for v, t in zip(mine, toks))
    attrs['data-pad'] = ''


# ---------- build ----------
def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')


# Shell motion roles (src/shell/motion.tsx, styles.css) -> the DS motion token that fills each one, matched on the
# token's last name segment (Material 3 md.sys.motion names; "-" or "_"). A role with no token stays at the shell
# default (0ms, linear): no animation rather than invented values.
MOTION_ROLES = [
    ('--fp-dur-press', 'duration', 'short2'), ('--fp-dur-exit', 'duration', 'short4'),
    ('--fp-dur-fade', 'duration', 'medium2'), ('--fp-dur-screen', 'duration', 'medium4'),
    ('--fp-dur-expand', 'duration', 'long2'),
    ('--fp-ease-standard', 'easing', 'standard'), ('--fp-ease-in', 'easing', 'standard_decelerate'),
    ('--fp-ease-out', 'easing', 'standard_accelerate'), ('--fp-ease-enter', 'easing', 'emphasized_decelerate'),
    ('--fp-ease-exit', 'easing', 'emphasized_accelerate'),
]


def has_tab_bar(tree):
    """True when a screen shows a bottom navigation / tab bar (shell/motion.tsx fades between such screens)."""
    pat = re.compile(r'(?i)bottom ?nav|navigation ?bar|tab ?bar')
    stack = [tree]
    while stack:
        n = stack.pop()
        if n.get('t') == 'I' and pat.search(str(n.get('c') or '')):
            return True
        stack.extend(n.get('ch') or [])
    return False


def motion_css(var_css):
    lines = ['/* Generated by tools/build_prototype.py: the shell motion roles filled from the DS motion tokens. */', ':root {']
    found = []
    for role, group, last in MOTION_ROLES:
        hit = next((css for figma, css in sorted(var_css.items())
                    if re.search(r'(?i)(^|/)motion/', figma) and re.search(r'(?i)(^|/)%s/' % group, figma)
                    and figma.split('/')[-1].replace('-', '_').lower() == last), None)
        if hit:
            lines.append('  %s: var(%s);' % (role, hit))
            found.append(role)
    lines.append('}')
    return '\n'.join(lines) + '\n', found


def theme_css(var_css):
    lines = ['/* Generated by tools/build_prototype.py from the project tokens. Tailwind names for the DS tokens:',
             '   bg-<color>, text-<color>, rounded-<shape>. Values stay the DS CSS variables, so Light/Dark follow data-semantic. */',
             '@theme {']
    for figma, css in sorted(var_css.items()):
        coll, _, name = figma.partition('::')
        last = name.split('/')[-1].replace('_', '-')
        if coll == 'Semantic' and '/color/' in name:
            lines.append('  --color-%s: var(%s);' % (last, css))
        elif coll == 'Shape' and '/corner/' in name:
            lines.append('  --radius-%s: var(%s);' % (last, css))
    lines.append('}')
    return '\n'.join(lines) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('project')
    ap.add_argument('--screens')
    ap.add_argument('--flow')
    ap.add_argument('--refresh', action='store_true', help='copy the template again (node_modules and data kept)')
    a = ap.parse_args()

    project = (ROOT / a.project).resolve() if not os.path.isabs(a.project) else Path(a.project)
    app = project / 'prototype'
    screens_path = Path(a.screens) if a.screens else app / 'data' / 'screens.json'
    if not screens_path.exists():
        sys.exit('No %s. Run tools/screens_export.cjs first.' % screens_path)
    data = load_screens(screens_path)  # the Figma export + data/overrides.json (code-first changes)
    make_crops(screens_path.parent)
    src_assets = screens_path.parent / 'assets'
    if src_assets.exists():
        ASSETS.update(f.name for f in src_assets.glob('*.png'))

    if a.refresh or not (app / 'package.json').exists():
        for src in TEMPLATE.rglob('*'):
            rel = src.relative_to(TEMPLATE)
            if src.is_file() and 'node_modules' not in rel.parts:
                dst = app / rel
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)

    sb = project / 'storybook'
    cmap = {k: v for k, v in json.loads((sb / 'component-map.json').read_text(encoding='utf-8')).items() if isinstance(v, dict)}
    var_css = parse_css_names(sb / 'src' / 'tokens' / 'tokens.css', r'(--[\w-]+):[^;]*;\s*/\*\s*([^*]+?)\s*\*/')
    text_css = {}
    for m in re.finditer(r'\.(ts-[\w-]+)\s*\{\s*/\*\s*([^*]+?)\s*\*/', (sb / 'src' / 'styles' / 'text-styles.css').read_text(encoding='utf-8')):
        text_css[m.group(2)] = m.group(1)
    adapters_path = app / 'adapters.json'
    adapters = json.loads(adapters_path.read_text(encoding='utf-8')) if adapters_path.exists() else {}
    ctx = Ctx(project, data, adapters, cmap, var_css, text_css)
    styles_path = project / 'data' / 'figma-styles.json'
    ctx.figma_styles = json.loads(styles_path.read_text(encoding='utf-8')).get('components', {}) if styles_path.exists() else {}

    # One prototype screen per Figma screen; its Light and Dark frames become the mode switch.
    groups = {}
    prefix = (data.get('page') or '') + ' / '
    for s in data['screens']:
        b = base_name(s['n'])
        if b.startswith(prefix):
            b = b[len(prefix):]
        g = groups.setdefault(b, {'name': b, 'frames': {}, 'section': s.get('section')})
        mode = (s.get('modes') or {}).get('Semantic') or ('Dark' if 'dark' in s['n'].lower() else 'Light')
        g['frames'][mode] = s
    for g in groups.values():
        g['slug'] = slugify(g['name'])
        for s in g['frames'].values():
            ctx.by_id[s['id']] = g['slug']
    ctx.slug_of_name = lambda n: next((g['slug'] for g in groups.values() if g['name'] == n or g['slug'] == slugify(n)), None)

    out_dir = app / 'src' / 'generated'
    screens_dir = out_dir / 'screens'
    if screens_dir.exists():
        shutil.rmtree(screens_dir)
    report = {'screens': [], 'missing': {}, 'raw': 0, 'structure_differs': []}
    route_lines = []
    for g in groups.values():
        frames = g['frames']
        primary = frames.get('Dark') or next(iter(frames.values()))
        if len(frames) > 1:
            sigs = {m: signature(f['tree']) for m, f in frames.items()}
            if len(set(sigs.values())) > 1:
                report['structure_differs'].append(g['name'])
        ctx.imports, ctx.uses_nav = {}, set()
        body = emit(primary['tree'], 'ROOT', ctx, 4)
        comp = re.sub(r'[^A-Za-z0-9]', '', g['name'].title()) or 'Screen'
        imports = ["import React from 'react';"]
        for module, names in sorted(ctx.imports.items()):
            imports.append("import { %s } from '@ds/components/%s';" % (', '.join(sorted(names)), module))
        if ctx.uses_nav:
            imports.append("import { %s } from '../../shell/nav';" % ', '.join(sorted(ctx.uses_nav)))
        src = '\n'.join([
            '// Generated by tools/build_prototype.py from Figma "%s" > %s. Do not edit: change Figma and rebuild.' % (data['file'], primary['n']),
            '// Figma frames: %s' % ', '.join('%s %s' % (m, f['id']) for m, f in frames.items()),
            *imports, '',
            'export default function %s() {' % comp,
            '  return (',
            body,
            '  );',
            '}', ''])
        write(screens_dir / ('%s.tsx' % g['slug']), src)
        route_lines.append('  { slug: %s, name: %s, w: %s, h: %s, scroll: %s, nav: %s, figma: %s, Component: lazy(() => import(%s)) },' % (
            js(g['slug']), js(g['name']), round(primary['w']), round(primary['h']), js(not fixed_screen(primary['tree'], ctx)),
            js(has_tab_bar(primary['tree'])), js({m: f['id'] for m, f in frames.items()}), js('./screens/%s' % g['slug'])))
        report['screens'].append({'slug': g['slug'], 'name': g['name'], 'modes': sorted(frames), 'w': primary['w'], 'h': primary['h']})

    flow = a.flow or data.get('page') or 'Flow'
    modes = sorted({m for g in groups.values() for m in g['frames']}, key=lambda m: ['Light', 'Dark'].index(m) if m in ('Light', 'Dark') else 9)
    routes = '\n'.join([
        '// Generated by tools/build_prototype.py. Do not edit.',
        "import React from 'react';",
        'const loaders: (() => Promise<unknown>)[] = [];',
        'const lazy = (f: () => Promise<{ default: React.FC }>) => { loaders.push(f); const C = React.lazy(f); return () => <React.Suspense fallback={null}><C /></React.Suspense>; };',
        '/** Loads every screen once (the shell calls it when idle), so a first visit animates a drawn screen, not an empty one. */',
        'export const preloadScreens = () => Promise.all(loaders.map((f) => f().catch(() => null)));',
        'export type ScreenDef = { slug: string; name: string; w: number; h: number; scroll: boolean; nav?: boolean; figma: Record<string, string>; Component: React.FC };',
        'export const PROJECT = %s;' % js({'name': project.name.replace('_', ' '), 'figmaFile': data['file'], 'exportedAt': data.get('exported_at', '')}),
        'export const DEVICE = { viewport: %d };' % adapters.get('viewport', 812),
        'export const MODES: string[] = %s;' % js(modes),
        'export const SCREENS: ScreenDef[] = [', *route_lines, '];',
        'export const FLOWS: { name: string; slugs: string[] }[] = [{ name: %s, slugs: %s }];' % (js(flow), js([g['slug'] for g in groups.values()])),
        ''])
    write(out_dir / 'routes.tsx', routes)
    write(out_dir / 'theme.css', theme_css(var_css))
    mcss, mfound = motion_css(var_css)
    write(out_dir / 'motion.css', mcss)
    print('  Motion: %d/%d shell roles from DS tokens%s' % (len(mfound), len(MOTION_ROLES), '' if mfound else ' (no motion tokens: screens change without animation)'))
    # mobile: the brief says so (intake 1.1), or every screen is narrower than 600. Mobile has no hover (Abdul,
    # 2026-10-28): vite.config.ts then drops the DS styles' :hover rules inside the device; Pressed (:active) stays.
    brief = (project / 'Project_Brief.md').read_text(encoding='utf-8') if (project / 'Project_Brief.md').exists() else ''
    m11 = re.search(r'\|\s*1\.1\s*\|[^|]*\|\s*([^|\n]*)\|', brief)
    widths = [s.get('w', 0) for s in data['screens'] if s.get('w')]
    mobile = bool(re.search(r'mobile|android|ios', m11.group(1), re.I)) if m11 and m11.group(1).strip() else bool(widths) and all(w < 600 for w in widths)
    write(app / 'ds.config.json', json.dumps({'storybookSrc': os.path.relpath(sb / 'src', app).replace('\\', '/'), 'mobile': mobile}, indent=1) + '\n')

    # Fonts of the Storybook preview, images from the export.
    head = sb / '.storybook' / 'preview-head.html'
    idx = app / 'index.html'
    if head.exists() and '<!--FONTS-->' in idx.read_text(encoding='utf-8'):
        write(idx, idx.read_text(encoding='utf-8').replace('<!--FONTS-->', head.read_text(encoding='utf-8').strip()))
    if '<!--PROJECT-->' in idx.read_text(encoding='utf-8'):
        write(idx, idx.read_text(encoding='utf-8').replace('<!--PROJECT-->', project.name.replace('_', ' ')))
    if src_assets.exists():
        dst = app / 'public' / 'figma-img'
        dst.mkdir(parents=True, exist_ok=True)
        for f in src_assets.glob('*.png'):
            shutil.copy2(f, dst / f.name)

    report['overrides'] = data.get('_overrides', [])
    report['code_ahead'] = sorted({slugify(o['screen']) for o in report['overrides'] if o.get('applied')})
    report['missing'] = ctx.missing
    report['raw'] = len(ctx.raw)
    report['raw_values'] = ctx.raw[:50]
    write(app / 'data' / 'build-report.json', json.dumps(report, indent=1, ensure_ascii=False) + '\n')
    print('Prototype: %s (%d screens, modes %s)' % (app, len(groups), '/'.join(modes)))
    if ctx.missing:
        print('  Components without a Storybook export (dashed boxes): ' + ', '.join('%s x%d' % kv for kv in ctx.missing.items()))
    if report['structure_differs']:
        print('  Light and Dark frames differ in structure: ' + ', '.join(report['structure_differs']))
    print('  Raw values (no token): %d' % len(ctx.raw))
    for o in report['overrides']:
        print('  Override %s (%s): %s' % (o.get('id'), o['status'], o.get('description', '')))
    if report['code_ahead']:
        print('  Code ahead of Figma (pending sync): ' + ', '.join(report['code_ahead']))
    # Reference code for the Code panel (deterministic, DS names only; its check must report 0 / 0).
    import screen_code
    screen_code.run(project)
    print('Run: npm --prefix "%s" install (first time), then npm --prefix "%s" run dev' % (app, app))


def make_crops(data_dir):
    """Cut every image layer from its source image (data/crops.json + data/sources/, tools/screens_export.cjs), at 2x
    the layer size: CROP uses the paint's transform, FILL a centred cover crop. Needs Pillow; without it the layers
    keep whatever Figma export exists."""
    crops_path = data_dir / 'crops.json'
    if not crops_path.exists():
        return
    try:
        from PIL import Image
    except ImportError:
        print('  ! Pillow is not installed: image crops skipped (pip install pillow)')
        return
    crops = json.loads(crops_path.read_text(encoding='utf-8'))
    out_dir = data_dir / 'assets'
    out_dir.mkdir(exist_ok=True)
    sources, made = {}, 0
    for node_id, c in crops.items():
        src = data_dir / 'sources' / c['hash']
        if not src.exists() or c.get('mode') not in ('CROP', 'FILL'):
            continue
        if c['hash'] not in sources:
            sources[c['hash']] = Image.open(src).convert('RGB')
        im = sources[c['hash']]
        W, H = im.size
        w, h = max(1, round(c['w'] * 2)), max(1, round(c['h'] * 2))
        if c['mode'] == 'CROP' and c.get('t'):
            a, _, x0, _, e, y0 = c['t']
            box = (x0 * W, y0 * H, (x0 + a) * W, (y0 + e) * H)
        else:  # FILL: cover, centred
            scale = max(c['w'] / W, c['h'] / H)
            cw, ch = c['w'] / scale, c['h'] / scale
            box = ((W - cw) / 2, (H - ch) / 2, (W + cw) / 2, (H + ch) / 2)
        im.crop(tuple(round(v) for v in box)).resize((w, h), Image.LANCZOS).save(out_dir / (re.sub(r'[:;]', '-', node_id) + '.png'))
        made += 1
    print('  %d image crops cut from %d source image(s)' % (made, len(sources)))


def signature(n):
    return (n.get('t'), n.get('c'), json.dumps(n.get('v'), sort_keys=True), tuple(signature(c) for c in n.get('ch') or []))


if __name__ == '__main__':
    main()

"""Live Prototype (Screens_Handoff_Skill): reference code per screen for the prototype's code panel.

Usage (from the Root, after tools/build_prototype.py, which also runs it):
  python tools/screen_code.py "My Projects/<Project>"

Reads   <project>/prototype/data/screens.json      (tools/screens_export.cjs)
        <project>/data/component-registry.json, data/tokens.json
        <project>/prototype/adapters.json           (extra props, nested texts, images and links of each component)
        <project>/storybook/component-map.json, src/tokens/tokens.css, src/styles/text-styles.css (Web names)
        <project>/data/code-connect.json            (optional: {"<Figma component>": {"compose": "Name", ...}}; a
                                                     Code Connect map wins over the derived names)
Writes  <project>/data/code_map.json                (DS component, token, text style and icon -> name per platform)
        <project>/prototype/public/code/<slug>.json  (code per platform + the line range of every Figma node)
        <project>/prototype/data/code-report.json   (the check)

Deterministic: no LLM, the same export always gives the same code. Platforms: Jetpack Compose, SwiftUI, Flutter,
React Native and React (Web, inline styles with the DS CSS variables, no Tailwind). Names come from
tools/platform_names.py, so they match Figma and the Storybook. The check fails (exit 1) when the code uses a name
that is not in the DS (unknown names) or a raw colour / size (raw values); both must be 0.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import platform_names as pn  # noqa: E402
from build_prototype import base_name, slugify, parse_css_names, tx_list, pins, load_screens  # noqa: E402
import prototype_strings  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PLATFORMS = pn.SCREEN_PLATFORMS
INDENT = {"compose": "    ", "swiftui": "    ", "flutter": "  ", "react-native": "  ", "web": "  "}
WIDTH = 96


# ------------------------------------------------------------------ inputs
def load(path, default=None):
    p = Path(path)
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def parse_variant(s):
    """'Selected=True, State=Enabled' -> {'Selected': 'True', 'State': 'Enabled'}."""
    if isinstance(s, dict):
        return s
    out = {}
    for part in (s or "").split(","):
        k, _, v = part.partition("=")
        if v:
            out[k.strip()] = v.strip()
    return out


class DS:
    """Everything the generator may name: components, tokens, text styles, icons (= data/code_map.json)."""

    def __init__(self, project, screens):
        self.project = project
        reg = load(project / "data" / "component-registry.json", {})
        tok = load(project / "data" / "tokens.json", {})
        sb = project / "storybook"
        self.cmap = {k: v for k, v in (load(sb / "component-map.json", {}) or {}).items() if isinstance(v, dict)}
        self.adapters = (load(project / "prototype" / "adapters.json", {}) or {}).get("components", {})
        self.code_connect = load(project / "data" / "code-connect.json", {}) or {}
        self.components = {c["name"]: c for c in reg.get("components", [])}
        self.text_styles = {s["name"]: s for s in reg.get("text_styles", [])}
        self.variables = tok.get("variables", {})
        self.roles = {k: v.get("role", "") for k, v in tok.get("collections", {}).items()}
        self.by_name = {v["name"]: k for k, v in self.variables.items()}
        css_path = sb / "src" / "tokens" / "tokens.css"
        self.var_css = parse_css_names(css_path, r"(--[\w-]+):[^;]*;\s*/\*\s*([^*]+?)\s*\*/") if css_path.exists() else {}
        self.text_css = {}
        ts_path = sb / "src" / "styles" / "text-styles.css"
        if ts_path.exists():
            for m in re.finditer(r"\.(ts-[\w-]+)\s*\{\s*/\*\s*([^*]+?)\s*\*/", ts_path.read_text(encoding="utf-8")):
                self.text_css[m.group(2)] = m.group(1)
        # Icons: the registry's list plus every Icon/<name> component the screens use (instances of the DS icon set).
        self.icons = {"Icon/" + n for n in (reg.get("icons") or {}).get("names", [])}

        def walk(n):
            for item in (n.get("ni") or {}).values():
                if str(item.get("c", "")).startswith("Icon/"):
                    self.icons.add(item["c"])
            for pv in (n.get("p") or {}).values():
                if isinstance(pv, dict) and str(pv.get("name", "")).startswith("Icon/"):
                    self.icons.add(pv["name"])
            for c in n.get("ch", []):
                walk(c)
        for s in screens:
            walk(s["tree"])
        self.zero_spacing = next((k for k, v in self.variables.items() if pn.token_group(v, self.roles.get(v["collection"], "")) == "spacing"
                                  and v["values"].get(next(iter(v["values"]))) in (0, 0.0)), None)
        self.map = self.build_map()

    def key(self, name):
        """tokens.json key of a Figma variable name (md/sys/spacing/16 -> Spacing::md/sys/spacing/16)."""
        if not name:
            return None
        return name if name in self.variables else self.by_name.get(name)

    def token(self, key, platform):
        v = self.variables[key]
        return pn.screen_token(v, platform, self.roles.get(v["collection"], ""), self.var_css.get(key, ""))

    def value(self, key):
        v = self.variables[key]
        val = v["values"].get(next(iter(v["values"])))
        return val if isinstance(val, (int, float)) else None

    def comp(self, name, platform):
        return (self.code_connect.get(name) or {}).get(platform) or pn.screen_component(name, platform, (self.cmap.get(name) or {}).get("export", ""))

    def build_map(self):
        comps = {}
        for name, c in self.components.items():
            variants = c.get("variants") or {}
            props = c.get("properties") or {}
            extra = list((self.adapters.get(name) or {}).get("props", {})) + list((self.adapters.get(name) or {}).get("events", {}))
            entry = {"tier": c.get("tier"), "group": c.get("group"),
                     "figma": {"variants": variants, "properties": props}, "platforms": {}}
            if name in self.code_connect:
                entry["code_connect"] = True
            for p in PLATFORMS:
                entry["platforms"][p] = {
                    "name": self.comp(name, p),
                    "props": {k: pn.screen_prop(k, p) for k in list(variants) + list(props) + extra},
                    "values": {ax: {v: pn.screen_enum(name, ax, v, p) for v in (vals if isinstance(vals, list) else [])}
                               for ax, vals in variants.items()},
                }
                if p == "web" and name in self.cmap:
                    entry["platforms"][p]["import"] = "@ds/components/" + self.cmap[name]["module"]
            comps[name] = entry
        tokens = {k: {"group": pn.token_group(v, self.roles.get(v["collection"], "")),
                      "platforms": {p: self.token(k, p) for p in PLATFORMS}} for k, v in self.variables.items()}
        styles = {n: {p: pn.screen_text_style(n, p, self.text_css.get(n, "")) for p in PLATFORMS} for n in self.text_styles}
        icons = {n: {p: pn.screen_icon(n, p) for p in PLATFORMS} for n in sorted(self.icons)}
        return {"_note": "Generated by tools/screen_code.py from the DS data files. Figma name -> what developers type per platform. Do not edit.",
                "platforms": {p: pn.SCREEN_LABEL[p] for p in PLATFORMS},
                "components": comps, "tokens": tokens, "text_styles": styles, "icons": icons}


# ------------------------------------------------------------------ intermediate tree (platform neutral)
class Ctx:
    def __init__(self, ds, slug_by_id, slug_by_name):
        self.ds, self.slug_by_id, self.slug_by_name = ds, slug_by_id, slug_by_name
        self.unknown, self.raw, self.snapped = [], [], []

    def tok(self, name, where):
        if not name:
            return None
        k = self.ds.key(name)
        if not k:
            self.unknown.append(f"token {name} ({where})")
        return k


def fill_of(node, parent_axis):
    """(stretch, grow): fill across / along the parent's axis."""
    s = node.get("s") or {}
    h, v = s.get("h") == "FILL", s.get("v") == "FILL"
    if parent_axis == "col":
        return h, v
    if parent_axis == "row":
        return v, h
    return False, False


def ir_frame(node, ctx, parent_axis, root=False):
    l = node.get("l") or {}
    axis = "row" if l.get("m") == "HORIZONTAL" else "col"
    where = node.get("n", "")
    gap = None
    if l.get("g"):
        gap = ctx.tok(l.get("gt"), where)
        if not gap:
            ctx.raw.append(f"gap {l.get('g')} without a token ({where})")
    pad = []
    for i, pv in enumerate(l.get("p") or [0, 0, 0, 0]):
        t = (l.get("pt") or [None] * 4)[i]
        k = ctx.tok(t, where) if t else None
        if pv and not k:
            ctx.raw.append(f"padding {pv} without a token ({where})")
        pad.append(k if pv and k else None)
    fill = ctx.tok(node.get("f"), where) if isinstance(node.get("f"), str) else None
    dock, pinned_ids = [], set()
    if root:
        for c in pins(node)["bottom"]:
            pinned_ids.add(c["id"])
            if c["_gap"]:
                dock.append(("gap", ctx.tok("md/sys/spacing/%d" % c["_gap"], where)))
            item = ir_node(dict(c, s={k: v for k, v in (c.get("s") or {}).items() if k not in ("abs", "sb")}), ctx, "col")
            if item:
                dock.append(("node", item))
    kids = [ir_node(c, ctx, axis) for c in node.get("ch", []) if c["id"] not in pinned_ids]
    kids = [k for k in kids if k]
    overflow = axis == "row" and node.get("clip") and sum(c.get("w", 0) for c in node.get("ch", [])) > node.get("w", 0) + 1
    stretch, grow = fill_of(node, parent_axis)
    return {"kind": "stack", "id": node["id"], "name": where, "axis": axis, "gap": gap, "gap_figma": l.get("gt"),
            "pad": pad, "main": l.get("pa") or "MIN", "cross": l.get("ca") or "MIN", "fill": fill,
            "scroll": "v" if root else ("h" if overflow else None), "root": root,
            "stretch": stretch, "grow": grow, "children": kids,
            "space": space_token(node, ctx, parent_axis) if not kids else None, "dock": dock}


def space_token(node, ctx, parent_axis):
    """An empty fixed frame only holds space: the DS spacing (else size) token of its width in a row, height in a column."""
    s = node.get("s") or {}
    if parent_axis == "row" and s.get("h") != "FILL":
        val = node.get("w")
    elif parent_axis == "col" and s.get("v") != "FILL":
        val = node.get("h")
    else:
        return None
    if not val:
        return None
    for group in ("spacing", "size"):
        for k, v in ctx.ds.variables.items():
            if pn.token_group(v, ctx.ds.roles.get(v["collection"], "")) == group and ctx.ds.value(k) is not None                     and abs(ctx.ds.value(k) - val) < 0.5:
                return k
    # a one-off size snaps to the nearest spacing step (Scenario C rule), within 4
    near = sorted((abs(ctx.ds.value(k) - val), k) for k, v in ctx.ds.variables.items()
                  if pn.token_group(v, ctx.ds.roles.get(v["collection"], "")) == "spacing" and ctx.ds.value(k) is not None)
    if near and near[0][0] <= 4:
        ctx.snapped.append(f"empty frame {round(val)} -> {ctx.ds.variables[near[0][1]]['name']} ({node.get('n', '')})")
        return near[0][1]
    ctx.raw.append(f"empty frame {round(val)} without a spacing token ({node.get('n', '')})")
    return None


def ir_node(node, ctx, parent_axis):
    if node.get("t") == "I":
        return ir_inst(node, ctx, parent_axis)
    if node.get("t") == "F":
        return ir_frame(node, ctx, parent_axis)
    return None


def spec_val(spec, node):
    """adapters.json mapping language, reduced to what reference code shows (no pixel sizes)."""
    if isinstance(spec, dict):
        if "eq" in spec:
            a, b = spec["eq"]
            return ("bool", spec_val(a, node) == b) if spec_val(a, node) is not None or b is None else ("bool", False)
        if "const" in spec:
            return ("lit", spec["const"])
        return None
    if not isinstance(spec, str):
        return None
    kind, _, arg = spec.partition(":")
    if kind == "tx":
        v = (node.get("tx") or {}).get(arg)
        return ("str", v) if v is not None else None
    if kind == "img":
        imgs = node.get("img") or []
        i = int(arg) if arg else 0
        return ("image", imgs[i]["id"]) if i < len(imgs) else None
    if kind == "ni":
        name, _, field = arg.partition(".")
        item = next((v for k, v in (node.get("ni") or {}).items() if re.sub(r"#\d+$", "", k) == name), None)
        return (item or {}).get(field or "v")
    if kind == "ml":
        v = (node.get("ml") or {}).get(arg)
        return ("int", v) if v else None
    if kind == "hid":
        return ("bool", arg in (node.get("hid") or []))
    if kind == "ts":
        v = (node.get("ts") or {}).get(arg)
        return ("style", v) if v else None
    if kind == "p":
        v = (node.get("p") or {}).get(arg)
        return ("str", v) if isinstance(v, str) else None
    return None  # w:, h: and other pixel specs stay inside the component


def sub_node(node, item, k, n):
    """The k-th nested item (e.g. Navigation Item) of an instance as its own node: its texts, icons and images."""
    pid = item["id"] + ";"
    ni = {re.sub(r"#\d+$", "", key): v for key, v in (node.get("ni") or {}).items() if str(v.get("id", "")).startswith(pid)}
    tx = {}
    for base in {re.sub(r"#\d+$", "", key) for key in (node.get("tx") or {})}:
        lst = tx_list(node, base)
        if len(lst) == n:
            tx[base] = lst[k]
    img = [i for i in node.get("img") or [] if str(i.get("id", "")).startswith(pid)]
    return {"id": item["id"], "c": item["c"], "v": parse_variant(item.get("v")), "p": {}, "tx": tx, "ni": ni, "img": img}


def target(action, ctx):
    if action == "back":
        return ("back",)
    if isinstance(action, str) and action.startswith("screen:"):
        slug = ctx.slug_by_name(action[7:])
        if not slug:
            ctx.unknown.append(f"screen {action[7:]}")
        return ("nav", slug or slugify(action[7:]))
    return None


def ir_inst(node, ctx, parent_axis, nested=False):
    ds, name = ctx.ds, node.get("c", "")
    if name.startswith("Icon/"):
        if name not in ds.icons:
            ctx.unknown.append(f"icon {name}")
        return {"kind": "icon", "id": node["id"], "icon": name}
    reg = ds.components.get(name)
    if not reg:
        ctx.unknown.append(f"component {name}")
        return None
    args = []
    variants = node.get("v") if isinstance(node.get("v"), dict) else parse_variant(node.get("v"))
    for ax, vals in (reg.get("variants") or {}).items():
        val = variants.get(ax)
        if val is None:
            continue
        vals = vals if isinstance(vals, list) else []
        if {x.lower() for x in vals} == {"true", "false"}:
            if val.lower() == "true":
                args.append((ax, ("bool", True)))
            continue
        if vals and val == vals[0]:
            continue  # the default variant
        args.append((ax, ("enum", ax, val)))
    props = node.get("p") or {}
    swaps = [k for k, t in (reg.get("properties") or {}).items() if t == "INSTANCE_SWAP"]
    for pname, ptype in (reg.get("properties") or {}).items():
        pv = props.get(pname)
        if ptype == "TEXT" and isinstance(pv, str):
            args.append((pname, ("str", pv)))
        elif ptype == "BOOLEAN" and isinstance(pv, bool):
            args.append((pname, ("bool", pv)))
        elif ptype == "INSTANCE_SWAP" and isinstance(pv, dict) and str(pv.get("name", "")).startswith("Icon/"):
            args.append((pname, ("icon", pv["name"])))
    if nested:  # a nested item has no Figma props of its own here: its texts and icon fill its TEXT / icon props
        texts = [k for k, t in (reg.get("properties") or {}).items() if t == "TEXT"]
        if len(texts) == 1 and len(node.get("tx") or {}) == 1:
            args.append((texts[0], ("str", next(iter(node["tx"].values())))))
        icon = next((v["c"] for v in (node.get("ni") or {}).values() if str(v.get("c", "")).startswith("Icon/")), None)
        icon_prop = next((k for k in swaps if "icon" in k.lower()), None)
        if icon and icon_prop:
            args.append((icon_prop, ("icon", icon)))
    # nested items: INSTANCE_SWAP props that hold a variant of another DS component (First Item, Second Tab ...)
    set_props = [k for k in swaps if isinstance(props.get(k), dict) and props[k].get("set")]
    if set_props and not nested:
        sets = {props[k]["set"] for k in set_props}
        items = [v for v in (node.get("ni") or {}).values() if v.get("c") in sets]
        for i, pname in enumerate(set_props):
            if i < len(items):
                sub = ir_inst(sub_node(node, items[i], i, len(items)), ctx, None, nested=True)
                if sub:
                    args.append((pname, ("item", sub)))
    ad = ds.adapters.get(name) or {}
    for pname, spec in (ad.get("props") or {}).items():
        v = spec_val(spec, node)
        if v is None or v == ("bool", False):
            continue
        if v[0] == "style" and v[1] not in ds.text_styles:
            ctx.unknown.append(f"text style {v[1]}")
            continue
        args.append((pname, v))
    events = []
    for ename, action in (ad.get("events") or {}).items():
        if isinstance(action, dict) and "by_index" in action:
            events.append((ename, ("by_index", {k: target(a, ctx) for k, a in action["by_index"].items()})))
        else:
            t = target(action, ctx)
            if t:
                events.append((ename, t))
    if not events:
        for r in node.get("re") or []:
            if r.get("nav") == "BACK":
                events.append(("onClick", ("back",)))
            elif r.get("to") in ctx.slug_by_id:
                events.append(("onClick", ("nav", ctx.slug_by_id[r["to"]])))
            break
    stretch, grow = fill_of(node, parent_axis)
    return {"kind": "inst", "id": node["id"], "comp": name, "args": args, "events": events,
            "stretch": stretch, "grow": grow}


# ------------------------------------------------------------------ rendering
class Writer:
    def __init__(self, platform):
        self.p, self.ind, self.lines, self.ranges = platform, INDENT[platform], [], {}

    def add(self, depth, text, node_id=None):
        for i, t in enumerate(text.split("\n")):
            self.lines.append((self.ind * depth + t) if t else "")
        return len(self.lines)

    def mark(self, node_id, start):
        if node_id:
            self.ranges.setdefault(node_id, [start + 1, len(self.lines)])

    def text(self):
        return "\n".join(self.lines) + "\n"


def q(s, platform):
    s = str(s)
    if platform == "flutter":
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'").replace("$", "\\$") + "'"
    if platform in ("react-native", "web"):
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"
    out = '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'
    return out.replace("$", "\\$") if platform == "compose" else out


def image_ref(node_id, p):
    f = re.sub(r"[:;]", "-", node_id)
    return {"compose": f"painterResource(R.drawable.{pn.snake('img ' + f)})", "swiftui": f'Image("{f}")',
            "flutter": f"const AssetImage('assets/figma-img/{f}.png')",
            "react-native": f"require('./assets/figma-img/{f}.png')", "web": f"'figma-img/{f}.png'"}[p]


def event_code(ev, p):
    kind = ev[0]

    def nav(slug):
        return f"navigate({q(slug, p)})"
    if kind in ("nav", "back"):
        call = nav(ev[1]) if kind == "nav" else nav("back")
        return {"compose": f"{{ {call} }}", "swiftui": f"{{ {call} }}", "flutter": f"() => {call}"}.get(p, f"() => {call}")
    cases = [(k, t) for k, t in ev[1].items() if t]
    lit = (lambda k: k if re.fullmatch(r"\d+", str(k)) else q(k, p))
    if p == "compose":
        body = "; ".join(f"{lit(k)} -> {nav(t[1]) if t[0] == 'nav' else nav('back')}" for k, t in cases)
        return f"{{ index -> when (index) {{ {body} }} }}"
    if p == "swiftui":
        body = " ".join(f"case {lit(k)}: {nav(t[1]) if t[0] == 'nav' else nav('back')};" for k, t in cases)
        return f"{{ index in switch index {{ {body} default: break }} }}"
    if p == "flutter":
        body = " ".join(f"case {lit(k)}: {nav(t[1]) if t[0] == 'nav' else nav('back')};" for k, t in cases)
        return f"(index) {{ switch (index) {{ {body} }} }}"
    obj = ", ".join(f"{lit(k)}: {q(t[1] if t[0] == 'nav' else 'back', p)}" for k, t in cases)
    return f"(index) => navigate({{ {obj} }}[index])"


class Renderer:
    def __init__(self, ds, platform, refs):
        self.ds, self.p, self.refs = ds, platform, refs
        self.used = set()

    # --- values
    def tok(self, key):
        self.refs.add(("token", key, self.p))
        return self.ds.token(key, self.p)

    def val(self, v, depth):
        p, kind = self.p, v[0]
        if kind == "str":
            return q(v[1], p)
        if kind == "res":
            self.refs.add(("string", v[1], p))
            return {"compose": f"stringResource(R.string.{v[1]})", "swiftui": f'String(localized: "{v[1]}")',
                    "flutter": f"AppLocalizations.of(context)!.{pn.camel(v[1], dedupe=False)}"}.get(p, f"t('{v[1]}')")
        if kind == "bool":
            return "true" if v[1] else "false"
        if kind in ("int", "lit"):
            return json.dumps(v[1])
        if kind == "enum":
            return q(pn.screen_enum(self.cur, v[1], v[2], p), p) if p in ("web", "react-native") else pn.screen_enum(self.cur, v[1], v[2], p)
        if kind == "icon":
            self.refs.add(("icon", v[1], p))
            ic = pn.screen_icon(v[1], p)
            return q(ic, p) if p in ("web", "react-native") else ic
        if kind == "image":
            return image_ref(v[1], p)
        if kind == "style":
            self.refs.add(("text_style", v[1], p))
            s = pn.screen_text_style(v[1], p, self.ds.text_css.get(v[1], ""))
            return q(s, p) if p == "web" else s
        if kind == "item":
            return self.call(v[1], depth)
        return "null"

    # --- an instance as an expression (Compose / SwiftUI / Flutter) or a JSX element (RN / Web)
    def call(self, node, depth, modifier=None, style=None):
        p = self.p
        if node["kind"] == "icon":
            self.refs.add(("icon", node["icon"], p))
            ic = pn.screen_icon(node["icon"], p)
            return {"compose": f"Icon({ic}, contentDescription = null)", "swiftui": f"{ic}.image",
                    "flutter": f"Icon({ic})"}.get(p, f"<Icon name={q(ic, p)} />")
        comp = node["comp"]
        self.refs.add(("component", comp, p))
        name = self.ds.comp(comp, p)
        self.used.add(comp)
        prev, self.cur = getattr(self, "cur", None), comp
        res = lambda v: ("res", self.ds.string_keys[v[1]]) if v[0] == "str" and v[1] in self.ds.string_keys else v  # noqa: E731
        args = [(pn.screen_prop(k, p), self.val(res(v), depth + 1), res(v)) for k, v in node["args"]]
        args += [(pn.screen_prop(k, p), event_code(e, p), None) for k, e in node["events"]]
        self.cur = prev
        if p in ("compose", "swiftui", "flutter"):
            if p == "compose" and modifier:
                args.append(("modifier", modifier, None))
            sep = " = " if p == "compose" else ": "
            parts = [f"{k}{sep}{v}" for k, v, _ in args]
            one = f"{name}({', '.join(parts)})"
            if len(one) + depth * len(INDENT[p]) <= WIDTH and "\n" not in one:
                return one
            inner = INDENT[p]
            body = ",\n".join(inner + x.replace("\n", "\n" + inner) for x in parts)
            return f"{name}(\n{body},\n)"
        # JSX
        attrs, spread = [], []
        for k, v, raw in args:
            if p == "web" and not re.fullmatch(r"[A-Za-z_$][\w$]*", k):
                spread.append(f"{q(k, p)}: {v}")
                continue
            if raw and raw[0] == "bool" and raw[1]:
                attrs.append(k)
            elif raw and raw[0] in ("str", "enum", "icon") or (raw and raw[0] in ("style", "image") and p == "web"):
                s = v[1:-1].replace("\\'", "'")
                attrs.append(f"{k}=\"{s}\"" if '"' not in s and "\\" not in s else f"{k}={{{v}}}")
            else:
                attrs.append(f"{k}={{{v}}}")
        if spread:
            attrs.append("{...{ " + ", ".join(spread) + " }}")
        if style:
            attrs.append(f"style={{{{ {style} }}}}")
        one = f"<{name}{''.join(' ' + a for a in attrs)} />"
        if len(one) + depth * len(INDENT[p]) <= WIDTH and "\n" not in one:
            return one
        inner = INDENT[p]
        return f"<{name}\n" + "\n".join(inner + a.replace("\n", "\n" + inner) for a in attrs) + "\n/>"

    # --- layout
    def pad_parts(self, pad):
        t, r, b, l = pad
        if t and t == r == b == l:
            return [("all", t)]
        out = []
        if l and l == r:
            out.append(("horizontal", l))
            l = r = None
        if t and t == b:
            out.append(("vertical", t))
            t = b = None
        out += [(side, k) for side, k in (("top", t), ("end", r), ("bottom", b), ("start", l)) if k]
        return out

    def dock_items(self, w, dock, depth, start=None):
        """The pinned bottom group (Mini Player, Bottom Navigation ...) with its Figma gaps as spacing tokens."""
        for kind, item in dock:
            if kind == "gap":
                if not item:
                    continue
                t = self.tok(item)
                w.add(depth, {"compose": f"Spacer(modifier = Modifier.height({t}))", "swiftui": f"Spacer().frame(height: {t})",
                              "flutter": f"SizedBox(height: {t}),", "react-native": f"<View style={{{{ height: {t} }}}} />",
                              "web": f"<div style={{{{ height: {q(t, 'web')} }}}} />"}[self.p])
            elif item["kind"] == "stack":  # a pinned frame (e.g. a Mini Player Dock with its own padding)
                self.emit(w, item, depth, "col")
            else:
                s0 = len(w.lines)
                self.child_inst(w, item, depth, "col", {"_stretch_default": False}) if self.p in ("react-native", "web") \
                    else self.child_inst(w, item, depth, "col")
                w.mark(item["id"], s0)

    def spacer(self, w, node, depth, parent=None):
        """An empty frame: a flexible Spacer when it fills its row / column, a fixed one with the DS spacing token
        of its width (in a row) or height (in a column), else nothing."""
        if not node.get("grow"):
            k = node.get("space")
            if not k:
                return
            t = self.tok(k)
            row = parent == "row"
            line = {
                "compose": f"Spacer(modifier = Modifier.{'width' if row else 'height'}({t}))",
                "swiftui": f"Spacer().frame({'width' if row else 'height'}: {t})",
                "flutter": f"SizedBox({'width' if row else 'height'}: {t}),",
                "react-native": f"<View style={{{{ {'width' if row else 'height'}: {t} }}}} />",
                "web": f"<div style={{{{ {'width' if row else 'height'}: {q(t, 'web')}, flexShrink: 0 }}}} />",
            }[self.p]
            w.add(depth, line)
            return
        w.add(depth, {"compose": "Spacer(modifier = Modifier.weight(1f))", "swiftui": "Spacer()", "flutter": "const Spacer(),",
                      "react-native": "<View style={{ flex: 1 }} />", "web": "<div style={{ flex: 1 }} />"}[self.p])

    def emit(self, w, node, depth, parent=None):
        start = len(w.lines)
        if node["kind"] == "stack" and not node["children"] and not node.get("root"):
            self.spacer(w, node, depth, parent)
        elif node["kind"] == "stack":
            getattr(self, "stack_" + self.p.replace("-", "_"))(w, node, depth, parent)
        else:
            self.child_inst(w, node, depth, parent)
        w.mark(node["id"], start)

    # Compose -----------------------------------------------------------------------------------------
    def compose_mods(self, node, parent):
        m = []
        if node.get("root"):
            m.append(".fillMaxSize()")
            if node.get("dock"):
                m.append(".padding(innerPadding)")
        elif node["grow"]:
            m.append(".weight(1f)")
        if node["stretch"]:
            m.append(".fillMaxWidth()" if parent == "col" else ".fillMaxHeight()")
        if node.get("fill"):
            m.append(f".background({self.tok(node['fill'])})")
        if node.get("scroll") == "v":
            m.append(".verticalScroll(rememberScrollState())")
        if node.get("scroll") == "h":
            m.append(".horizontalScroll(rememberScrollState())")
        pads = self.pad_parts(node.get("pad") or [None] * 4)
        if any(s in ("top", "bottom", "start", "end") for s, _ in pads):
            # Compose has padding(horizontal, vertical) or padding(start, top, end, bottom), never both in one call
            t, r, b, l = node["pad"]
            pads = [(s, k) for s, k in (("start", l), ("top", t), ("end", r), ("bottom", b)) if k]
        if pads:
            m.append(".padding(" + ", ".join(self.tok(k) if s == "all" else f"{s} = {self.tok(k)}" for s, k in pads) + ")")
        if not m:
            return None
        return "Modifier" + m[0] if len(m) == 1 else "Modifier\n" + "\n".join(m)

    def stack_compose(self, w, n, depth, parent):
        if n.get("root") and n.get("dock"):
            # pinned bottom group from Figma -> Scaffold bottomBar; the content scrolls above it
            w.add(depth, "Scaffold(")
            w.add(depth + 1, "bottomBar = {")
            w.add(depth + 2, "Column(horizontalAlignment = Alignment.CenterHorizontally) {")
            self.dock_items(w, n["dock"], depth + 3)
            w.add(depth + 2, "}")
            w.add(depth + 1, "},")
            w.add(depth, ") { innerPadding ->")
            self._stack_compose(w, n, depth + 1, parent)
            w.add(depth, "}")
            return
        self._stack_compose(w, n, depth, parent)

    def _stack_compose(self, w, n, depth, parent):
        col = n["axis"] == "col"
        params = []
        mods = self.compose_mods(n, parent)
        if mods:
            params.append("modifier = " + mods)
        gap = n["gap"] if n["gap"] and self.ds.value(n["gap"]) != 0 else None
        main, cross = n["main"], n["cross"]
        arr = None
        if main == "SPACE_BETWEEN":
            arr = "Arrangement.SpaceBetween"
        elif gap:
            al = {"CENTER": "Alignment.CenterVertically" if col else "Alignment.CenterHorizontally",
                  "MAX": "Alignment.Bottom" if col else "Alignment.End"}.get(main)
            arr = f"Arrangement.spacedBy({self.tok(gap)}{', ' + al if al else ''})"
        elif main in ("CENTER", "MAX"):
            arr = "Arrangement.Center" if main == "CENTER" else ("Arrangement.Bottom" if col else "Arrangement.End")
        if arr:
            params.append(("verticalArrangement = " if col else "horizontalArrangement = ") + arr)
        ca = {"CENTER": "Alignment.CenterHorizontally" if col else "Alignment.CenterVertically",
              "MAX": "Alignment.End" if col else "Alignment.Bottom"}.get(cross)
        if ca:
            params.append(("horizontalAlignment = " if col else "verticalAlignment = ") + ca)
        kind = "Column" if col else "Row"
        if not n.get("root"):
            w.add(depth, f"// {n['name']}")
        one = f"{kind}({', '.join(params)}) {{"
        if len(one) + depth * 4 <= WIDTH and "\n" not in one:
            w.add(depth, one)
        else:
            w.add(depth, f"{kind}(")
            for prm in params:
                w.add(depth + 1, prm.replace("\n", "\n" + INDENT["compose"]) + ",")
            w.add(depth, ") {")
        for c in n["children"]:
            self.emit(w, c, depth + 1, n["axis"])
        w.add(depth, "}")

    # SwiftUI -----------------------------------------------------------------------------------------
    def swift_mods(self, n, parent):
        m = []
        for s, k in self.pad_parts(n.get("pad") or [None] * 4):
            side = {"all": "", "horizontal": ".horizontal, ", "vertical": ".vertical, ", "top": ".top, ",
                    "bottom": ".bottom, ", "start": ".leading, ", "end": ".trailing, "}[s]
            m.append(f".padding({side}{self.tok(k)})")
        h = (n["stretch"] and parent == "col") or (n["grow"] and parent == "row")
        v = (n["stretch"] and parent == "row") or (n["grow"] and parent == "col")
        if h or v:
            m.append(".frame(" + ", ".join(x for x in ("maxWidth: .infinity" if h else "", "maxHeight: .infinity" if v else "") if x) + ")")
        if n.get("fill"):
            m.append(f".background({self.tok(n['fill'])})")
        return m

    def stack_swiftui(self, w, n, depth, parent):
        col = n["axis"] == "col"
        gap = n["gap"] or self.ds.zero_spacing
        al = ({"CENTER": ".center", "MAX": ".trailing"} if col else {"CENTER": ".center", "MAX": ".bottom"}).get(n["cross"], ".leading" if col else ".top")
        head = f"{'VStack' if col else 'HStack'}(alignment: {al}{', spacing: ' + self.tok(gap) if gap else ''}) {{"
        mods = self.swift_mods(n, parent)
        if not n.get("root"):
            w.add(depth, f"// {n['name']}")
        d = depth
        if n.get("scroll"):
            w.add(d, "ScrollView {" if n["scroll"] == "v" else "ScrollView(.horizontal, showsIndicators: false) {")
            d += 1
        inner_mods = [x for x in mods if x.startswith(".padding")] if n.get("scroll") else mods
        outer_mods = [x for x in mods if not x.startswith(".padding")] if n.get("scroll") else []
        w.add(d, head)
        kids = n["children"]
        for i, c in enumerate(kids):
            if n["main"] == "SPACE_BETWEEN" and i:
                w.add(d + 1, "Spacer(minLength: 0)")
            self.emit(w, c, d + 1, n["axis"])
        w.add(d, "}")
        for x in inner_mods:
            w.add(d, x)
        if n.get("scroll"):
            w.add(depth, "}")
            for x in outer_mods:
                w.add(depth, x)
        if n.get("root") and n.get("dock"):
            # pinned bottom group from Figma: stays above the home indicator while the content scrolls
            w.add(depth, ".safeAreaInset(edge: .bottom, spacing: 0) {")
            w.add(depth + 1, "VStack(spacing: 0) {")
            self.dock_items(w, n["dock"], depth + 2)
            w.add(depth + 1, "}")
            w.add(depth, "}")

    # Flutter -----------------------------------------------------------------------------------------
    def edge(self, pad):
        parts = self.pad_parts(pad)
        if not parts:
            return None
        if parts[0][0] == "all":
            return f"EdgeInsets.all({self.tok(parts[0][1])})"
        if all(s in ("horizontal", "vertical") for s, _ in parts):
            return "EdgeInsets.symmetric(" + ", ".join(f"{s}: {self.tok(k)}" for s, k in parts) + ")"
        flat = []
        for s, k in parts:
            flat += [("start", k), ("end", k)] if s == "horizontal" else [("top", k), ("bottom", k)] if s == "vertical" else [(s, k)]
        return "EdgeInsetsDirectional.only(" + ", ".join(f"{s}: {self.tok(k)}" for s, k in flat) + ")"

    def wrappers_flutter(self, n, parent):
        out = []
        if n["grow"]:
            out.append("Expanded(")
        elif n["stretch"]:
            out.append("SizedBox(width: double.infinity," if parent == "col" else "SizedBox(height: double.infinity,")
        if n.get("fill"):
            out.append(f"ColoredBox(color: {self.tok(n['fill'])},")
        if n.get("scroll"):
            out.append("SingleChildScrollView(" if n["scroll"] == "v" else "SingleChildScrollView(scrollDirection: Axis.horizontal,")
        e = self.edge(n.get("pad") or [None] * 4) if n["kind"] == "stack" else None
        if e:
            out.append(f"Padding(padding: {e},")
        return out

    def stack_flutter(self, w, n, depth, parent, trailing=","):
        col = n["axis"] == "col"
        if not n.get("root"):
            w.add(depth, f"// {n['name']}")
        wraps = self.wrappers_flutter(n, parent)
        docked = n.get("root") and n.get("dock")
        if docked:
            # pinned bottom group from Figma -> Scaffold bottomNavigationBar; the background moves to the Scaffold
            wraps = [x for x in wraps if not x.startswith("ColoredBox(")]
            w.add(depth, "Scaffold(")
            if n.get("fill"):
                w.add(depth + 1, f"backgroundColor: {self.tok(n['fill'])},")
            depth += 1
            trailing = ","
        # each wrapper opens a call whose child is the next wrapper, then the Row / Column
        d = depth
        for i, x in enumerate(wraps):
            w.add(d, ("child: " if i else ("body: " if docked else "")) + x)
            d += 1
        params = []
        gap = n["gap"] if n["gap"] and self.ds.value(n["gap"]) != 0 else None
        if gap:
            params.append(f"spacing: {self.tok(gap)}")
        ma = {"CENTER": "MainAxisAlignment.center", "MAX": "MainAxisAlignment.end", "SPACE_BETWEEN": "MainAxisAlignment.spaceBetween"}.get(n["main"])
        if ma:
            params.append(f"mainAxisAlignment: {ma}")
        ca = {"MIN": "CrossAxisAlignment.start", "CENTER": "CrossAxisAlignment.center", "MAX": "CrossAxisAlignment.end"}.get(n["cross"])
        if ca and ca != "CrossAxisAlignment.center":
            params.append(f"crossAxisAlignment: {ca}")
        if not col and n.get("scroll") == "h" or col and n.get("scroll") == "v":
            params.append("mainAxisSize: MainAxisSize.min")
        prefix = "child: " if wraps else ("body: " if docked else "")
        w.add(d, f"{prefix}{'Column' if col else 'Row'}(")
        for prm in params:
            w.add(d + 1, prm + ",")
        w.add(d + 1, "children: [")
        for c in n["children"]:
            self.emit(w, c, d + 2, n["axis"])
        w.add(d + 1, "],")
        w.add(d, ")" + ("," if wraps or trailing else ""))
        for i in range(len(wraps)):
            d -= 1
            w.add(d, ")" + ("," if i < len(wraps) - 1 or trailing else ""))
        if docked:
            w.add(depth, "bottomNavigationBar: Column(")
            w.add(depth + 1, "mainAxisSize: MainAxisSize.min,")
            w.add(depth + 1, "children: [")
            self.dock_items(w, n["dock"], depth + 2)
            w.add(depth + 1, "],")
            w.add(depth, "),")
            w.add(depth - 1, ")")

    # React Native / Web --------------------------------------------------------------------------------
    def style_items(self, n, parent, web):
        s = []
        col = n["axis"] == "col"
        if web:
            s.append("display: 'flex'")
        if not col:
            s.append("flexDirection: 'row'")
        elif web:
            s.append("flexDirection: 'column'")
        gap = n["gap"] if n["gap"] and self.ds.value(n["gap"]) != 0 else None
        if gap:
            s.append(f"gap: {self.jsv(gap, web)}")
        jc = {"CENTER": "'center'", "MAX": "'flex-end'", "SPACE_BETWEEN": "'space-between'"}.get(n["main"])
        if jc:
            s.append(f"justifyContent: {jc}")
        stretch_kids = sum(1 for c in n["children"] if c.get("stretch"))
        n["_stretch_default"] = stretch_kids * 2 >= len(n["children"]) and n["cross"] == "MIN"
        ai = "'stretch'" if n["_stretch_default"] else {"MIN": "'flex-start'", "CENTER": "'center'", "MAX": "'flex-end'"}.get(n["cross"])
        if ai and not (ai == "'stretch'" and not web):
            s.append(f"alignItems: {ai}")
        names = {"all": "padding", "horizontal": "paddingHorizontal", "vertical": "paddingVertical", "top": "paddingTop",
                 "bottom": "paddingBottom", "start": "paddingStart", "end": "paddingEnd"}
        webnames = {"all": "padding", "horizontal": "paddingInline", "vertical": "paddingBlock", "top": "paddingTop",
                    "bottom": "paddingBottom", "start": "paddingInlineStart", "end": "paddingInlineEnd"}
        for side, k in self.pad_parts(n.get("pad") or [None] * 4):
            s.append(f"{(webnames if web else names)[side]}: {self.jsv(k, web)}")
        if n.get("fill"):
            s.append(f"{'background' if web else 'backgroundColor'}: {self.jsv(n['fill'], web)}")
        if web and n.get("scroll"):
            s.append("overflowY: 'auto'" if n["scroll"] == "v" else "overflowX: 'auto'")
        return s

    def self_style(self, n, parent, parent_node):
        s = []
        if n.get("grow"):
            s.append("flex: 1")
        elif n.get("stretch") and parent_node is not None and not parent_node.get("_stretch_default"):
            s.append("alignSelf: 'stretch'")
        elif not n.get("stretch") and parent_node is not None and parent_node.get("_stretch_default"):
            s.append("alignSelf: 'flex-start'")
        return s

    def jsv(self, key, web):
        t = self.tok(key)
        return q(t, "web") if web else t

    def stack_jsx(self, w, n, depth, parent, web, parent_node=None):
        items = self.self_style(n, parent, parent_node) + self.style_items(n, parent, web)
        if not n.get("root"):
            w.add(depth, f"{{/* {n['name']} */}}")
        style = "{{ " + ", ".join(items) + " }}" if items else ""
        if web:
            tag = "div"
            open_ = f"<div style={style}>" if style else "<div>"
        elif n.get("scroll"):
            tag = "ScrollView"
            outer = [x for x in items if x.startswith(("flex:", "alignSelf", "backgroundColor"))]
            inner = [x for x in items if x not in outer]
            attrs = ("horizontal showsHorizontalScrollIndicator={false} " if n["scroll"] == "h" else "")
            attrs += ("style={{ " + ", ".join(outer) + " }} " if outer else "")
            open_ = f"<ScrollView {attrs}contentContainerStyle={{{{ {', '.join(inner)} }}}}>"
        else:
            tag = "View"
            open_ = f"<View style={style}>" if style else "<View>"
        if len(open_) + depth * 2 > WIDTH:
            if web or not n.get("scroll"):
                open_ = f"<{tag}\n  style={{{{\n" + "".join(f"    {x},\n" for x in items) + "  }}\n>"
        w.add(depth, open_)
        for c in n["children"]:
            start = len(w.lines)
            if c["kind"] == "stack" and not c["children"]:
                self.spacer(w, c, depth + 1, n["axis"])
            elif c["kind"] == "stack":
                self.stack_jsx(w, c, depth + 1, n["axis"], web, n)
            else:
                self.child_inst(w, c, depth + 1, n["axis"], n)
            w.mark(c["id"], start)
        w.add(depth, f"</{tag}>")

    def stack_react_native(self, w, n, depth, parent):
        self.jsx_root(w, n, depth, parent, False)

    def stack_web(self, w, n, depth, parent):
        self.jsx_root(w, n, depth, parent, True)

    def jsx_root(self, w, n, depth, parent, web):
        if not (n.get("root") and n.get("dock")):
            return self.stack_jsx(w, n, depth, parent, web)
        # pinned bottom group from Figma: the screen is a column; the content scrolls, the dock stays under it
        bg = f"{'background' if web else 'backgroundColor'}: {self.jsv(n['fill'], web)}" if n.get("fill") else ""
        outer = ", ".join(x for x in (("display: 'flex', flexDirection: 'column', height: '100%'" if web else "flex: 1"), bg) if x)
        tag = "div" if web else "View"
        w.add(depth, f"<{tag} style={{{{ {outer} }}}}>")
        inner = dict(n, fill=None)
        if web:
            w.add(depth + 1, "<div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>")
            self.stack_jsx(w, dict(inner, scroll=None), depth + 2, parent, web)
            w.add(depth + 1, "</div>")
        else:
            self.stack_jsx(w, inner, depth + 1, parent, web)
        w.add(depth + 1, f"<{tag} style={{{{ {'display: ' + chr(39) + 'flex' + chr(39) + ', flexDirection: ' + chr(39) + 'column' + chr(39) + ', ' if web else ''}alignItems: 'center' }}}}>")
        self.dock_items(w, n["dock"], depth + 2)
        w.add(depth + 1, f"</{tag}>")
        w.add(depth, f"</{tag}>")

    # instances inside a stack ----------------------------------------------------------------------
    def child_inst(self, w, n, depth, parent, parent_node=None):
        p = self.p
        if p == "compose":
            mod = None
            if n.get("grow"):
                mod = "Modifier.weight(1f)"
            elif n.get("stretch"):
                mod = "Modifier.fillMaxWidth()" if parent == "col" else "Modifier.fillMaxHeight()"
            w.add(depth, self.call(n, depth, modifier=mod))
        elif p == "swiftui":
            w.add(depth, self.call(n, depth))
            h = (n.get("stretch") and parent == "col") or (n.get("grow") and parent == "row")
            if h:
                w.add(depth + 1, ".frame(maxWidth: .infinity)")
        elif p == "flutter":
            expr = self.call(n, depth)
            if n.get("grow"):
                expr = f"Expanded(child: {expr})"
            elif n.get("stretch") and parent == "col":
                expr = f"SizedBox(width: double.infinity, child: {expr})"
            w.add(depth, expr + ",")
        else:
            st = self.self_style(n, parent, parent_node)
            if p == "react-native":
                w.add(depth, self.call(n, depth, style=", ".join(st) if st else None))
            else:
                if st:
                    w.add(depth, f"<div style={{{{ {', '.join(st)} }}}}>")
                    w.add(depth + 1, self.call(n, depth + 1))
                    w.add(depth, "</div>")
                else:
                    w.add(depth, self.call(n, depth))


# ------------------------------------------------------------------ files
def screen_file(ds, platform, ir, screen, figma_file, refs):
    r = Renderer(ds, platform, refs)
    fn = re.sub(r"[^A-Za-z0-9]", "", screen["name"].title()) + "Screen"
    note = f'Reference code (not production): generated from Figma "{figma_file}" > {screen["name"]} by tools/screen_code.py.'
    note2 = f"DS names only ({ds.project.name.replace('_', ' ')} design system); colors follow the Light / Dark theme."
    body = Writer(platform)
    if platform == "compose":
        r.emit(body, ir, 1)
        head = ["// " + note, "// " + note2, "",
                "import androidx.compose.foundation.*", "import androidx.compose.foundation.layout.*",
                "import androidx.compose.material3.*", "import androidx.compose.runtime.Composable",
                "import androidx.compose.ui.*", "import androidx.compose.ui.res.stringResource", "", "@Composable", f"fun {fn}(navigate: (String) -> Unit) {{"]
        tail = ["}"]
    elif platform == "swiftui":
        r.emit(body, ir, 2)
        head = ["// " + note, "// " + note2, "", "import SwiftUI", "", f"struct {fn}: View {{",
                "    let navigate: (String) -> Void", "", "    var body: some View {"]
        tail = ["    }", "}"]
    elif platform == "flutter":
        r.stack_flutter(body, ir, 2, None, trailing="")
        body.ranges.setdefault(ir["id"], [1, len(body.lines)])
        body.lines[0] = "  " * 2 + "return " + body.lines[0].lstrip()
        body.lines[-1] += ";"
        head = ["// " + note, "// " + note2, "", "import 'package:flutter/material.dart';",
                "import 'package:flutter_gen/gen_l10n/app_localizations.dart';", "",
                f"class {fn} extends StatelessWidget {{", f"  const {fn}({{super.key, required this.navigate}});", "",
                "  final void Function(String screen) navigate;", "", "  @override",
                "  Widget build(BuildContext context) {"]
        tail = ["  }", "}"]
    else:
        r.emit(body, ir, 2)
        head = ["// " + note, "// " + note2, "", "import React from 'react';"]
        if platform == "react-native":
            head += ["import { ScrollView, View } from 'react-native';"]
        head += ["__IMPORTS__", "import { t } from '@/i18n';", "", f"export function {fn}({{ navigate }}: {{ navigate: (screen: string) => void }}) {{", "  return ("]
        tail = ["  );", "}"]
    if "__IMPORTS__" in head:
        i = head.index("__IMPORTS__")
        if platform == "web":
            mods = {}
            for c in sorted(r.used):
                mods.setdefault(ds.map["components"][c]["platforms"]["web"].get("import", "@ds/components"), []).append(ds.comp(c, "web"))
            if any(x for x in body.lines if "<Icon " in x):
                mods.setdefault("@ds/components/Icon", []).append("Icon")
            lines = [f"import {{ {', '.join(sorted(v))} }} from '{k}';" for k, v in sorted(mods.items())]
        else:
            names = sorted(ds.comp(c, platform) for c in r.used) + (["Icon"] if any("<Icon " in x for x in body.lines) else [])
            styles = ", textStyles" if any("textStyles." in x for x in body.lines) else ""
            lines = [f"import {{ {', '.join(names)} }} from '@/design-system';", f"import {{ tokens{styles} }} from '@/design-system/tokens';"]
        head[i:i + 1] = lines
    off = len(head)
    ranges = {k: [a + off, b + off] for k, (a, b) in body.ranges.items()}
    code = "\n".join(head + body.lines + tail) + "\n"
    return code, ranges


ALLOWED = {
    "compose": {"Column", "Row", "Modifier", "Arrangement", "Alignment", "Icon", "MaterialTheme", "AppTheme", "AppIcons",
                "Composable", "R", "Spacer", "Scaffold"},
    "swiftui": {"VStack", "HStack", "ScrollView", "Spacer", "Image", "View", "DS", "SwiftUI", "String"},
    "flutter": {"Column", "Row", "Padding", "EdgeInsets", "EdgeInsetsDirectional", "SizedBox", "Expanded", "ColoredBox",
                "SingleChildScrollView", "Axis", "MainAxisAlignment", "CrossAxisAlignment", "MainAxisSize", "Icon",
                "AssetImage", "Theme", "AppColors", "AppSpacing", "AppRadius", "AppSizes", "AppIcons", "AppTextStyles",
                "StatelessWidget", "Widget", "BuildContext", "String", "Function", "Spacer", "AppLocalizations", "Scaffold"},
    "react-native": {"ScrollView", "View", "React", "Icon"},
    "web": {"React", "Icon"},
}
TOKEN_REF = {
    "compose": r"\b(?:MaterialTheme\.(?:colorScheme|shapes|typography)|AppTheme\.\w+)\.\w+",
    "swiftui": r"\bDS\.(?:Colors|Spacing|Radius|Size|Typography|Tokens)\.\w+",
    "flutter": r"\b(?:Theme\.of\(context\)\.(?:colorScheme|textTheme)|App(?:Colors|Spacing|Radius|Sizes|Tokens|TextStyles))\.\w+",
    "react-native": r"\b(?:tokens\.\w+|textStyles)\.\w+",
    "web": r"var\(--[\w-]+\)",
}
RAW = re.compile(r"#[0-9A-Fa-f]{3,8}\b|\b0x[0-9A-Fa-f]{6,8}\b|\b\d+(?:\.\d+)?\s*(?:dp|px|pt|sp)\b|\.(?:dp|sp)\b|\bColor\(")


def check(code, platform, ds):
    """Names in the code that the DS (code_map) does not have, and raw values."""
    allowed_tokens = {t["platforms"][platform] for t in ds.map["tokens"].values()} | \
                     {s[platform] for s in ds.map["text_styles"].values()}
    icons = {i[platform] for i in ds.map["icons"].values()}
    comps = {c["platforms"][platform]["name"] for c in ds.map["components"].values()}
    enums = {v.split(".")[0] for c in ds.map["components"].values() for ax in c["platforms"][platform]["values"].values() for v in ax.values()}
    code_only = "\n".join(l for l in code.split("\n") if not l.lstrip().startswith(("//", "import ", "{/*")))
    unknown = []
    for m in re.finditer(TOKEN_REF[platform], code_only):  # before strings are blanked: Web refs are 'var(--...)'
        if m.group(0) not in allowed_tokens:
            unknown.append(m.group(0))
    icon_names = re.findall(r"<Icon name=\"([\w-]+)\"", code_only)
    keys = set(ds.string_keys.values())
    camels = {pn.camel(k, dedupe=False) for k in keys}
    res_pat = {"compose": r"R\.string\.(\w+)", "swiftui": r'String\(localized: "(\w+)"\)',
               "flutter": r"AppLocalizations\.of\(context\)!\.(\w+)"}.get(platform, r"\bt\('(\w+)'\)")
    for m in re.finditer(res_pat, code_only):
        if m.group(1) not in (camels if platform == "flutter" else keys):
            unknown.append("string " + m.group(1))
    # texts are content, not names: a track called "Pt. 2 | #149" is neither a component nor a raw colour
    code_only = re.sub(r'"(?:\\.|[^"\\\n])*"|\'(?:\\.|[^\'\\\n])*\'', '""', code_only)
    if platform in ("compose", "swiftui", "flutter"):
        for m in re.finditer(r"(?<![\w.])([A-Z][A-Za-z0-9]*)\s*[(.]", code_only):
            n = m.group(1)
            if n not in comps and n not in ALLOWED[platform] and n not in enums and not n.endswith("Screen"):
                unknown.append(n)
        for m in re.finditer(r"\b(?:AppIcons|DS\.Icons)\.\w+", code_only):
            if m.group(0) not in icons:
                unknown.append(m.group(0))
    else:
        for m in re.finditer(r"<([A-Z]\w*)", code_only):
            if m.group(1) not in comps and m.group(1) not in ALLOWED[platform]:
                unknown.append(m.group(1))
        unknown += ["icon " + n for n in icon_names if n not in icons]
    raw = [m.group(0) for m in RAW.finditer(code_only)]
    return sorted(set(unknown)), raw


def run(project):
    project = Path(project).resolve()
    app = project / "prototype"
    data = load_screens(app / "data" / "screens.json") if (app / "data" / "screens.json").exists() else None
    if not data:
        sys.exit(f"No {app / 'data' / 'screens.json'}. Run tools/screens_export.cjs first.")
    ds = DS(project, data["screens"])
    strings = prototype_strings.build(project)
    ds.string_keys = strings["keys"]
    groups = {}
    prefix = (data.get("page") or "") + " / "
    for s in data["screens"]:
        b = base_name(s["n"])
        b = b[len(prefix):] if b.startswith(prefix) else b
        g = groups.setdefault(b, {"name": b, "slug": slugify(b), "frames": {}})
        g["frames"][(s.get("modes") or {}).get("Semantic") or ("Dark" if "dark" in s["n"].lower() else "Light")] = s
    slug_by_id = {f["id"]: g["slug"] for g in groups.values() for f in g["frames"].values()}

    def slug_by_name(n):
        return next((g["slug"] for g in groups.values() if g["name"] == n or g["slug"] == slugify(n)), None)

    # the project's own platform first (folder suffix: <Project>_Android / _iOS / _Web), then the others
    first = next((p for key, p in (("android", "compose"), ("ios", "swiftui"), ("web", "web"), ("flutter", "flutter"))
                  if key in project.name.lower()), PLATFORMS[0])
    order = [first] + [p for p in PLATFORMS if p != first]
    out = app / "public" / "code"
    out.mkdir(parents=True, exist_ok=True)
    report = {"screens": [], "unknown": [], "raw": [], "code_connect": bool(ds.code_connect)}
    for g in groups.values():
        frame = g["frames"].get("Dark") or next(iter(g["frames"].values()))
        ctx = Ctx(ds, slug_by_id, slug_by_name)
        ir = ir_frame(frame["tree"], ctx, None, root=True)
        refs = set()
        entry = {"screen": g["name"], "slug": g["slug"], "figma": {m: f["id"] for m, f in g["frames"].items()},
                 "label": "Reference code", "order": order + ["strings"], "platforms": {}}
        unknown, raw = list(ctx.unknown), list(ctx.raw)
        for p in PLATFORMS:
            code, ranges = screen_file(ds, p, ir, g, data["file"], refs)
            u, rw = check(code, p, ds)
            unknown += [f"{p}: {x}" for x in u]
            raw += [f"{p}: {x}" for x in rw]
            entry["platforms"][p] = {"label": pn.SCREEN_LABEL[p], "ext": pn.SCREEN_EXT[p], "code": code, "ranges": ranges}
        used = sorted({name for kind, name, _ in refs if kind == "string"})
        table = {k: {"en": strings["en"][k], "ar": strings["ar"].get(k)} for k in used}
        entry["platforms"]["strings"] = {
            "label": "Strings (EN/AR)", "ext": "json", "ranges": {},
            "code": "// UI strings of this screen: data/strings/en.json and ar.json (keys used by the code tabs).\n"
                    "// Content (song, artist, playlist names) is not translated and stays in the code as data.\n"
                    + json.dumps(table, ensure_ascii=False, indent=2) + "\n"}
        missing_ar = [k for k in used if not strings["ar"].get(k)]
        # node ids of the other mode's frames point at the same lines (Light frames have their own ids)
        for m, f in g["frames"].items():
            if f is not frame:
                entry["alias_root"] = {f["id"]: frame["id"]}
        for kind, name, p in refs:
            if kind == "token" and name not in ds.variables or kind == "component" and name not in ds.components \
                    or kind == "icon" and name not in ds.icons or kind == "text_style" and name not in ds.text_styles:
                unknown.append(f"{p}: {kind} {name}")
        entry["check"] = {"unknown": len(set(unknown)), "raw": len(raw), "untranslated": len(missing_ar)}
        (out / f"{g['slug']}.json").write_text(json.dumps(entry, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        report["snapped"] = report.get("snapped", []) + ctx.snapped
        report["screens"].append({"slug": g["slug"], "unknown": sorted(set(unknown)), "raw": raw, "untranslated": missing_ar,
                                  "lines": {p: entry["platforms"][p]["code"].count("\n") for p in PLATFORMS}})
        report["unknown"] += sorted(set(unknown))
        report["raw"] += raw
    (project / "data" / "code_map.json").write_text(json.dumps(ds.map, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (app / "data" / "code-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Reference code: {len(groups)} screens x {len(PLATFORMS)} platforms -> {out}")
    print(f"  code_map: {len(ds.map['components'])} components, {len(ds.map['tokens'])} tokens, {len(ds.map['icons'])} icons"
          + (" (Code Connect map used)" if ds.code_connect else " (no Code Connect map: names derived from Figma)"))
    print(f"  Strings: {len(strings['en'])} UI strings as resources, Arabic {len(strings['en']) - len(strings['missing'])}, untranslated {len(strings['missing'])}; {len(strings['content'])} content texts kept as data")
    for x in sorted(set(report.get("snapped", []))):
        print("  Snapped to the nearest spacing step: " + x)
    print(f"  Check: unknown names {len(report['unknown'])}, raw values {len(report['raw'])}")
    for x in (report["unknown"] + report["raw"])[:20]:
        print("   - " + x)
    return 0 if not report["unknown"] and not report["raw"] else 1


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    arg = Path(sys.argv[1])
    sys.exit(run(arg if arg.is_absolute() else ROOT / arg))

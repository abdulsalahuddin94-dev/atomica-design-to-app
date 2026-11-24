"""Measured screen fidelity check (Design_System_Intake_Skill/steps/screens.md 7f step 4).

Compares what the running app renders (tools/source_dump.js) with what the Figma screen holds
(tools/figma_text_dump.figma.js), number by number, instead of judging two screenshots by eye.

Usage:
  python tools/fidelity_diff.py <source.json> <figma.json> [--out report.md] [--pos 4] [--de 3] [--figma-x0 256] [--figma-y0 60] [--source-y0 N] [--bg #12131a] [--accept accepted.json]

Checks, per text matched by its content (nearest position when a text repeats):
  - font size (> 0.5 px), weight (different weight class), color (OKLab deltaE > --de, default 3),
    line height (text box height differs by > 2 px at the same size),
    position (> --pos px, default 4), all caps in Figma (flagged for the project's text rules);
  - texts in the source that are missing in Figma, and Figma texts that are not in the source.
Per box with a background (best overlap with a Figma frame): background color, border color, radius.
Exit code 0 always; the report's "Open differences" count must be 0 (or each one explained) before a
screen is called done.

Verdict and coverage (idea from its-magdy/design-twin, MIT; our own code): nothing left unmeasured
counts as a match.
  - Verdict: Fail (an open size, weight, color, missing text or missing background), Incomplete (only
    position, line height, box size, radius or border open, or something could not be compared),
    Pass with accepted differences, or Pass.
  - "Not compared" lists source boxes with no Figma frame on top of them and texts the dump gave no
    size or color for, so a gap in the measurement is never read as "no difference".
  - --accept <file.json>: differences the user accepted, each with who and why:
      {"accepted": [{"key": "text:save changes", "reason": "...", "by": "Abdul", "date": "2026-11-24"}]}
    The key of every difference is printed in the report. An entry without reason or by is ignored,
    and an entry that matches nothing is listed as stale. Accepted ones are written "- Explained: N",
    which the done gate (.claude/hooks/session_gate.cjs) does not count as open.
"""
import json
import os
import math
import re
import sys


def parse_hex(h):
    if not h:
        return None, 1.0
    m = re.match(r"#([0-9a-fA-F]{6})(?:@(\d+))?", h)
    if not m:
        return None, 1.0
    v = m.group(1)
    return tuple(int(v[i:i + 2], 16) / 255 for i in (0, 2, 4)), (int(m.group(2)) / 100 if m.group(2) else 1.0)


def oklab(rgb):
    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(c) for c in rgb)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l, m, s = (x ** (1 / 3) for x in (l, m, s))
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


BG = (0.07, 0.075, 0.1)  # surface used to flatten alpha; --bg #rrggbb for Light screens


def delta_e(a, b, bg=None):
    """deltaE*100 in OKLab after flattening alpha on the screen surface (BG)."""
    bg = bg or BG
    (ca, aa), (cb, ab) = parse_hex(a), parse_hex(b)
    if ca is None or cb is None:
        return None
    ca = tuple(c * aa + k * (1 - aa) for c, k in zip(ca, bg))
    cb = tuple(c * ab + k * (1 - ab) for c, k in zip(cb, bg))
    return math.dist(oklab(ca), oklab(cb)) * 100


def norm(t):
    return re.sub(r"\s+", " ", (t or "").replace("â†’", "->")).strip().lower()


def weight_class(w):
    if w is None:
        return None
    return 400 if w < 450 else 500 if w < 550 else 600 if w < 650 else 700


def iou(a, b):
    x1, y1 = max(a["x"], b["x"]), max(a["y"], b["y"])
    x2, y2 = min(a["x"] + a["w"], b["x"] + b["w"]), min(a["y"] + a["h"], b["y"] + b["h"])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    union = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / union if union else 0


HIGH = ("size", "weight", "color", "background")  # kinds that make the verdict Fail


def load_accepted(path):
    """Accepted differences by key; entries without a reason or a name are not accepted."""
    if not path:
        return {}, []
    data = json.load(open(path, encoding="utf-8-sig"))
    good, bad = {}, []
    for e in data.get("accepted", []) if isinstance(data, dict) else data:
        if e.get("key") and str(e.get("reason", "")).strip() and str(e.get("by", "")).strip():
            good[e["key"]] = e
        else:
            bad.append(e.get("key") or "(no key)")
    return good, bad


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 0
    src, fig = (json.load(open(p, encoding="utf-8-sig")) for p in argv[1:3])
    out = argv[argv.index("--out") + 1] if "--out" in argv else None
    accepted, bad_accept = load_accepted(argv[argv.index("--accept") + 1] if "--accept" in argv else None)
    global BG
    if "--bg" in argv:
        BG = parse_hex(argv[argv.index("--bg") + 1])[0] or BG
    pos_tol = float(argv[argv.index("--pos") + 1]) if "--pos" in argv else 4
    de_tol = float(argv[argv.index("--de") + 1]) if "--de" in argv else 3
    # --figma-x0 / --figma-y0: ignore Figma texts left of / above this point (e.g. sidebar 256, top bar 60)
    fx0 = float(argv[argv.index("--figma-x0") + 1]) if "--figma-x0" in argv else 0
    fy0 = float(argv[argv.index("--figma-y0") + 1]) if "--figma-y0" in argv else 0
    fig["texts"] = [t for t in fig["texts"] if t["x"] >= fx0 and t["y"] >= fy0]
    # the same shell area is skipped in the source (--source-y0 when its top bar has another height)
    sy0 = float(argv[argv.index("--source-y0") + 1]) if "--source-y0" in argv else fy0
    src["texts"] = [t for t in src["texts"] if t["x"] >= fx0 and t["y"] >= sy0]

    ftexts = list(fig["texts"])
    # first pass: median offset between exact text matches, so a different sidebar / top bar does not
    # turn every text into a position difference
    offs = []
    for s0 in src["texts"]:
        k = norm(s0["text"])
        m = [f for f in ftexts if norm(f["text"]) == k]
        if len(m) == 1 and len(k) >= 4:
            offs.append((m[0]["x"] - s0["x"], m[0]["y"] - s0["y"]))
    offs.sort(key=lambda o: o[0]); mx = offs[len(offs) // 2][0] if offs else 0
    offs.sort(key=lambda o: o[1]); my = offs[len(offs) // 2][1] if offs else 0
    used = set()
    rows, missing, unmeasured = [], [], []
    for s in src["texts"]:
        key = norm(s["text"])
        cands = [(i, f) for i, f in enumerate(ftexts) if i not in used and norm(f["text"]) == key]
        if not cands:
            cands = [(i, f) for i, f in enumerate(ftexts) if i not in used and key and (key in norm(f["text"]) or norm(f["text"]) in key) and min(len(key), len(norm(f["text"]))) >= 4]
        if not cands:
            missing.append(s)
            continue
        i, f = min(cands, key=lambda c: abs(c[1]["x"] - mx - s["x"]) + abs(c[1]["y"] - my - s["y"]))
        used.add(i)
        issues = []
        if s.get("size") and f.get("size") and abs(s["size"] - f["size"]) > 0.5:
            issues.append(f"size {f['size']} vs {s['size']}")
        if weight_class(s.get("weight")) and weight_class(f.get("weight")) and weight_class(s["weight"]) != weight_class(f["weight"]):
            issues.append(f"weight {f['weight']} vs {s['weight']}")
        de = delta_e(f.get("color"), s.get("color"))
        if de is not None and de > de_tol:
            issues.append(f"color {f['color']} vs {s['color']} (dE {de:.1f})")
        if s.get("h") and f.get("h") and abs(s["h"] - f["h"]) > 2 and abs(s["size"] - f["size"]) <= 0.5:
            issues.append(f"line height {f['h']} vs {s['h']} px")
        dx, dy = round(f["x"] - mx - s["x"]), round(f["y"] - my - s["y"])
        if abs(dx) > pos_tol or abs(dy) > pos_tol:
            issues.append(f"position {dx:+d},{dy:+d} px")
        if f.get("upper"):
            issues.append("all caps in Figma")
        gaps = [k for k in ("size", "color") if not s.get(k) or not f.get(k)]
        if gaps:
            unmeasured.append(f"text \"{s['text'][:40]}\": no {' or '.join(gaps)} in the dumps")
        if issues:
            rows.append((s["text"][:50], issues, f.get("id"), "text:" + key))
    extra = [f for i, f in enumerate(ftexts) if i not in used and f["text"]]

    box_rows = []
    boxes_seen = boxes_matched = 0
    fboxes = fig.get("boxes", [])
    for s in src.get("boxes", []):
        if not s.get("bg") and not s.get("border"):
            continue
        boxes_seen += 1
        s = dict(s, x=s["x"] + mx, y=s["y"] + my)
        best = max(fboxes, key=lambda f: iou(s, f), default=None)
        if not best or iou(s, best) < 0.5:
            unmeasured.append(f"box {s['tag']} {round(s['x'])},{round(s['y'])} {round(s['w'])}x{round(s['h'])} ({s.get('bg') or s.get('border')}): no Figma frame on top of it")
            continue
        boxes_matched += 1
        issues = []
        de = delta_e(best.get("bg"), s.get("bg"))
        if s.get("bg") and best.get("bg") and de is not None and de > de_tol:
            issues.append(f"background {best['bg']} vs {s['bg']} (dE {de:.1f})")
        if s.get("bg") and not best.get("bg"):
            issues.append(f"background missing (source {s['bg']})")
        deb = delta_e(best.get("border"), s.get("border"))
        if s.get("border") and best.get("border") and deb is not None and deb > de_tol:
            issues.append(f"border {best['border']} vs {s['border']} (dE {deb:.1f})")
        if s.get("radius") is not None and best.get("radius") is not None and abs((s.get("radius") or 0) - (best.get("radius") or 0)) > 1 and (s.get("radius") or 0) < 500:
            issues.append(f"radius {best.get('radius')} vs {s.get('radius')}")
        if abs(best["w"] - s["w"]) > pos_tol or abs(best["h"] - s["h"]) > pos_tol:
            issues.append(f"size {best['w']}x{best['h']} vs {s['w']}x{s['h']}")
        if issues:
            box_rows.append((f"{s['tag']} {s['x']},{s['y']} {s['w']}x{s['h']}", best.get("name"), issues, best.get("id"), "box:" + str(best.get("id") or best.get("name"))))

    # Accepted differences (--accept): listed with who and why, never silently dropped.
    keys = [r[3] for r in rows] + ["missing:" + norm(m["text"]) for m in missing] + [b[4] for b in box_rows]
    hit = [k for k in dict.fromkeys(keys) if k in accepted]
    stale = [k for k in accepted if k not in keys]
    is_open = lambda k: k not in accepted
    open_rows = [r for r in rows if is_open(r[3])]
    open_missing = [m for m in missing if is_open("missing:" + norm(m["text"]))]
    open_boxes = [b for b in box_rows if is_open(b[4])]
    kind = lambda i: i.split(" ")[0] if not i.startswith("line height") else "line height"
    high = len(open_missing) + sum(1 for r in open_rows if any(kind(i) in HIGH for i in r[1])) \
        + sum(1 for b in open_boxes if any(kind(i) in HIGH for i in b[2]))
    medium = len(open_rows) + len(open_boxes) + len(open_missing) - high
    if high:
        verdict = "Fail"
    elif medium or unmeasured:
        verdict = "Incomplete"
    elif hit:
        verdict = "Pass with accepted differences"
    else:
        verdict = "Pass"

    total = len(rows) + len(missing) + len(box_rows)
    kinds = {}
    for _, iss, _, _ in open_rows:
        for i in iss:
            k = kind(i)
            kinds[k] = kinds.get(k, 0) + 1
    lines = [f"# Fidelity: {fig.get('screen')} vs {src.get('url')}", "",
             f"- Verdict: **{verdict}** (texts measured {len(src['texts']) - len(missing)}/{len(src['texts'])}, boxes measured {boxes_matched}/{boxes_seen}; open {high} high, {medium} medium; not compared {len(unmeasured)}; accepted {len(hit)})",
             f"- Inputs: {os.path.basename(argv[1])} (source), {os.path.basename(argv[2])} (Figma)",
             f"- Texts matched: {len(src['texts']) - len(missing)} / {len(src['texts'])}; Figma-only texts: {len(extra)}",
             f"- Open differences: **{total}** (texts {len(rows)}, missing {len(missing)}, boxes {len(box_rows)})",
             f"- Explained: {len(hit)}",
             f"- Figma frame {fig.get('size')}; source viewport {src.get('viewport')}, page height {src.get('scrollHeight')}; offset Figma - source {mx:+.0f},{my:+.0f} px",
             "- By kind: " + (", ".join(f"{k} {v}" for k, v in sorted(kinds.items(), key=lambda kv: -kv[1])) or "none"),
             "- Position drift that grows down the page usually comes from line heights or gaps; fix those first, then re-run.", ""]
    if open_rows:
        lines += ["## Text differences", "| Text | Differences | Figma node | Key |", "|---|---|---|---|"]
        lines += [f"| {t} | {'; '.join(i)} | {nid} | `{k}` |" for t, i, nid, k in open_rows] + [""]
    if open_missing:
        lines += ["## In the source, missing in Figma"] + [f"- \"{m['text'][:60]}\" at {m['x']},{m['y']} ({m['size']} px, {m['weight']}) `missing:{norm(m['text'])}`" for m in open_missing] + [""]
    if open_boxes:
        lines += ["## Box differences", "| Source box | Figma node | Differences | Key |", "|---|---|---|---|"]
        lines += [f"| {s} | {n} ({nid}) | {'; '.join(i)} | `{k}` |" for s, n, i, nid, k in open_boxes] + [""]
    if unmeasured:
        lines += ["## Not compared (check each one; a gap is not a match)"] + [f"- {u}" for u in unmeasured[:80]] + [""]
    if hit or stale or bad_accept:
        lines += ["## Accepted differences", "| Key | Why | By | Date |", "|---|---|---|---|"]
        lines += [f"| `{k}` | {accepted[k].get('reason')} | {accepted[k].get('by')} | {accepted[k].get('date', '')} |" for k in hit]
        lines += [f"- Stale, matches nothing now (drop it): `{k}`" for k in stale]
        lines += [f"- Ignored, no reason or no name: `{k}`" for k in bad_accept] + [""]
    if extra:
        lines += ["## In Figma, not in the source (check)"] + [f"- \"{e['text'][:60]}\" ({e.get('id')})" for e in extra[:60]] + [""]
    report = "\n".join(lines)
    if out:
        open(out, "w", encoding="utf-8").write(report)
    print(report if not out else "\n".join(lines[:8]))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

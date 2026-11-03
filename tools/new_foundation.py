"""Generate a new project's color foundation: ramps, Semantic mapping per mode, paired-token and contrast checks.

Usage (from the Root):
  python tools/new_foundation.py "My Projects/<Project>" --brand "#299B48" --modes Light,Dark
  python tools/new_foundation.py "My Projects/<Project>" --brand "#299B48" --modes Dark --check-only
Options:
  --modes Light,Dark | Light | Dark     Semantic modes (intake 0.4); single-mode systems get one mode.
  --fill-step 600                        Light mode: brand step for filled buttons and bg/brand (default 700);
                                         hover and active take the next two darker steps. Use it when the
                                         approved direction keeps the brand color itself on filled buttons.
  --check-only                          only print the brand contrast pre-check (intake 3.3), write nothing.

Writes <folder>/data/source/foundation-spec.json (used by the Figma build scripts) and prints every failure.
Brand ramp: the brand hex lands on the step of the Tailwind green curve with the nearest lightness, and the
ramp keeps that curve (recorded in the spec; put it in config.json > ramp.base_steps for build_tokens.py).
Web naming (color/{group}/{role}); iOS and Android projects map the same ramps to their own role names.
"""
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools'))
import ds_color as d  # noqa: E402

STEPS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

# Tailwind v3 reference ramps: their OKLCH curves are the shape every ramp keeps.
TW = {
    'slate': '#F8FAFC #F1F5F9 #E2E8F0 #CBD5E1 #94A3B8 #64748B #475569 #334155 #1E293B #0F172A #020617',
    'green': '#F0FDF4 #DCFCE7 #BBF7D0 #86EFAC #4ADE80 #22C55E #16A34A #15803D #166534 #14532D #052E16',
    'emerald': '#ECFDF5 #D1FAE5 #A7F3D0 #6EE7B7 #34D399 #10B981 #059669 #047857 #065F46 #064E3B #022C22',
    'red': '#FEF2F2 #FEE2E2 #FECACA #FCA5A5 #F87171 #EF4444 #DC2626 #B91C1C #991B1B #7F1D1D #450A0A',
    'amber': '#FFFBEB #FEF3C7 #FDE68A #FCD34D #FBBF24 #F59E0B #D97706 #B45309 #92400E #78350F #451A03',
    'blue': '#EFF6FF #DBEAFE #BFDBFE #93C5FD #60A5FA #3B82F6 #2563EB #1D4ED8 #1E40AF #1E3A8A #172554',
}
TW = {k: dict(zip(STEPS, v.split())) for k, v in TW.items()}

SINGLES = {'white': '#FFFFFF', 'black': '#000000'}
ALPHAS = {'alpha/black-50': ('#000000', 0.5), 'alpha/black-70': ('#000000', 0.7), 'alpha/white-10': ('#FFFFFF', 0.1)}

# Semantic mapping per mode (values are Primitive names). Dark = the mapping approved in the first Web trial.
SEMANTIC = {
    'Light': {
        'text': {'primary': 'gray/900', 'secondary': 'gray/700', 'muted': 'gray/600', 'placeholder': 'gray/500',
                 'disabled': 'gray/400', 'inverse': 'white', 'link': 'brand/700', 'link-hover': 'brand/800',
                 'error': 'red/700', 'warning': 'yellow/800', 'success': 'green/700', 'info': 'blue/700',
                 'on-brand': 'white'},
        'bg': {'primary': 'white', 'secondary': 'gray/50', 'subtle': 'gray/100', 'muted': 'gray/200',
               'inverse': 'gray/900', 'overlay': 'alpha/black-50', 'error': 'red/50', 'warning': 'yellow/50',
               'success': 'green/50', 'info': 'blue/50', 'brand': 'brand/700', 'brand-hover': 'brand/800',
               'brand-active': 'brand/900'},
        'border': {'default': 'gray/200', 'muted': 'gray/100', 'strong': 'gray/600', 'input': 'gray/500',
                   'inverse': 'gray/900', 'focus': 'brand/600', 'error': 'red/600', 'warning': 'yellow/600',
                   'success': 'green/600', 'brand': 'brand/600'},
        'icon': {'default': 'gray/700', 'strong': 'gray/900', 'muted': 'gray/500', 'brand': 'brand/600',
                 'inverse': 'white', 'error': 'red/600', 'warning': 'yellow/600', 'success': 'green/600',
                 'info': 'blue/600'},
        'action': {'primary/bg': 'brand/700', 'primary/bg-hover': 'brand/800', 'primary/bg-active': 'brand/900',
                   'primary/text': 'white', 'primary/border': 'brand/700',
                   'secondary/bg': 'white', 'secondary/bg-hover': 'gray/50', 'secondary/bg-active': 'gray/100',
                   'secondary/text': 'gray/900', 'secondary/border': 'gray/500',
                   'danger/bg': 'red/600', 'danger/bg-hover': 'red/700', 'danger/bg-active': 'red/800',
                   'danger/text': 'white', 'danger/border': 'red/600'},
    },
    'Dark': {
        'text': {'primary': 'gray/50', 'secondary': 'gray/300', 'muted': 'gray/400', 'placeholder': 'gray/400',
                 'disabled': 'gray/500', 'inverse': 'gray/950', 'link': 'brand/400', 'link-hover': 'brand/300',
                 'error': 'red/400', 'warning': 'yellow/400', 'success': 'green/400', 'info': 'blue/400',
                 'on-brand': 'gray/950'},
        'bg': {'primary': 'gray/950', 'secondary': 'gray/900', 'subtle': 'gray/800', 'muted': 'gray/700',
               'inverse': 'gray/50', 'overlay': 'alpha/black-70', 'error': 'red/950', 'warning': 'yellow/950',
               'success': 'green/950', 'info': 'blue/950', 'brand': 'brand/600', 'brand-hover': 'brand/500',
               'brand-active': 'brand/400'},
        'border': {'default': 'gray/700', 'muted': 'gray/800', 'strong': 'gray/400', 'input': 'gray/500',
                   'inverse': 'gray/50', 'focus': 'brand/400', 'error': 'red/500', 'warning': 'yellow/500',
                   'success': 'green/500', 'brand': 'brand/500'},
        'icon': {'default': 'gray/300', 'strong': 'gray/50', 'muted': 'gray/400', 'brand': 'brand/400',
                 'inverse': 'gray/950', 'error': 'red/400', 'warning': 'yellow/400', 'success': 'green/400',
                 'info': 'blue/400'},
        'action': {'primary/bg': 'brand/600', 'primary/bg-hover': 'brand/500', 'primary/bg-active': 'brand/400',
                   'primary/text': 'gray/950', 'primary/border': 'brand/600',
                   'secondary/bg': 'gray/800', 'secondary/bg-hover': 'gray/700', 'secondary/bg-active': 'gray/900',
                   'secondary/text': 'gray/50', 'secondary/border': 'gray/500',
                   'danger/bg': 'red/600', 'danger/bg-hover': 'red/700', 'danger/bg-active': 'red/800',
                   'danger/text': 'white', 'danger/border': 'red/600'},
    },
}

SCOPES = {'text': ['TEXT_FILL'], 'bg': ['FRAME_FILL', 'SHAPE_FILL'], 'border': ['STROKE_COLOR'],
          'icon': ['FRAME_FILL', 'SHAPE_FILL', 'STROKE_COLOR']}

# State pairs that must alias different steps, or the state is invisible (trial finding 34).
DISTINCT = [('border/input', 'border/strong'), ('border/default', 'border/focus'), ('border/input', 'border/focus'),
            ('bg/brand', 'bg/brand-hover'), ('bg/brand-hover', 'bg/brand-active'), ('bg/brand', 'bg/brand-active')]
for _a in ('primary', 'secondary', 'danger'):
    DISTINCT += [('action/%s/bg' % _a, 'action/%s/bg-hover' % _a), ('action/%s/bg-hover' % _a, 'action/%s/bg-active' % _a),
                 ('action/%s/bg' % _a, 'action/%s/bg-active' % _a)]


def nearest_step(ref, hex_):
    L = d.hex_to_oklch(hex_)[0]
    return min(STEPS, key=lambda s: abs(d.hex_to_oklch(ref[s])[0] - L))


def ramp_from(ref_name, base_hex=None):
    ref = TW[ref_name]
    if base_hex is None:
        return {'values': dict(ref), 'base_step': '500', 'base_hex': ref['500'], 'reference': 'tailwind-' + ref_name,
                'curve': d.capture_curve(ref, '500')}
    step = nearest_step(ref, base_hex)
    curve = d.capture_curve(ref, step)
    values = d.regenerate_ramp(curve, base_hex, STEPS)
    return {'values': values, 'base_step': step, 'base_hex': values[step], 'reference': 'tailwind-' + ref_name,
            'curve': curve}


def action_scope(role):
    if role.endswith('/text'):
        return ['TEXT_FILL']
    if role.endswith('/border'):
        return ['STROKE_COLOR']
    return ['FRAME_FILL', 'SHAPE_FILL']


def pairs():
    out = []
    for surf in ('bg/primary', 'bg/secondary'):
        for t in ('primary', 'secondary', 'muted', 'placeholder', 'link', 'error', 'warning', 'success', 'info'):
            out.append(('text/' + t, surf, 4.5))
        for b in ('input', 'strong', 'focus', 'error', 'success', 'brand'):
            out.append(('border/' + b, surf, 3.0))
        for i in ('default', 'muted', 'brand', 'error', 'warning', 'success', 'info'):
            out.append(('icon/' + i, surf, 3.0))
        for a in ('primary', 'secondary', 'danger'):  # Outline / button borders (trial finding 34)
            out.append(('action/%s/border' % a, surf, 3.0))
    for s in ('error', 'warning', 'success', 'info'):
        out.append(('text/' + s, 'bg/' + s, 4.5))
    for a in ('primary', 'secondary', 'danger'):
        for bgk in ('bg', 'bg-hover', 'bg-active'):
            out.append(('action/%s/text' % a, 'action/%s/%s' % (a, bgk), 4.5))
    out += [('text/on-brand', 'bg/brand', 4.5), ('text/on-brand', 'bg/brand-hover', 4.5),
            ('text/on-brand', 'bg/brand-active', 4.5), ('text/inverse', 'bg/inverse', 4.5),
            ('action/primary/bg', 'bg/primary', 3.0), ('action/primary/bg', 'bg/secondary', 3.0)]
    return out


def brand_check(brand, modes):
    """Intake 3.3: the brand color against white, black and each mode's base surface."""
    surfaces = {'white': '#FFFFFF', 'black': '#000000'}
    gray = TW['slate']
    if 'Light' in modes:
        surfaces['Light bg/primary (white)'] = '#FFFFFF'
    if 'Dark' in modes:
        surfaces['Dark bg/primary (gray/950)'] = gray['950']
    rows = []
    for name, hx in surfaces.items():
        c = d.contrast(brand, hx)
        rows.append((name, round(c, 2), 'text ok' if c >= 4.5 else ('UI/large text only' if c >= 3 else 'fails')))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('folder')
    ap.add_argument('--brand', required=True)
    ap.add_argument('--modes', default='Light,Dark')
    ap.add_argument('--check-only', action='store_true')
    ap.add_argument('--fill-step', default=None, help='Light mode brand fill step (default 700)')
    a = ap.parse_args()
    modes = [m.strip().capitalize() for m in a.modes.split(',') if m.strip()]
    bad = [m for m in modes if m not in SEMANTIC]
    if bad:
        raise SystemExit('Unknown mode(s) %s; use Light and/or Dark' % bad)
    brand = a.brand.upper()

    print('Brand %s contrast pre-check:' % brand)
    for name, c, verdict in brand_check(brand, modes):
        print('  vs %-28s %5.2f:1  %s' % (name, c, verdict))
    if a.check_only:
        return 0

    if a.fill_step and 'Light' in SEMANTIC:
        i = STEPS.index(a.fill_step)
        if i + 2 >= len(STEPS):
            raise SystemExit('--fill-step %s leaves no darker hover/active steps' % a.fill_step)
        f, h, x = ('brand/' + STEPS[i + k] for k in range(3))
        L = SEMANTIC['Light']
        L['bg'].update({'brand': f, 'brand-hover': h, 'brand-active': x})
        L['action'].update({'primary/bg': f, 'primary/bg-hover': h, 'primary/bg-active': x, 'primary/border': f})

    ramps = {'gray': ramp_from('slate'), 'brand': ramp_from('green', brand), 'green': ramp_from('emerald'),
             'red': ramp_from('red'), 'yellow': ramp_from('amber'), 'blue': ramp_from('blue')}

    def prim_hex(name):
        if name in SINGLES:
            return SINGLES[name]
        if name in ALPHAS:
            return ALPHAS[name][0]
        ramp, step = name.split('/')
        return ramps[ramp]['values'][step]

    results, distinct_fail = [], []
    for mode in modes:
        m = SEMANTIC[mode]

        def alias(path):
            g, r = path.split('/', 1)
            return m[g][r]
        for fg, bg, mn in pairs():
            c = d.contrast(prim_hex(alias(fg)), prim_hex(alias(bg)))
            results.append({'mode': mode, 'fg': 'Semantic::color/' + fg, 'bg': 'Semantic::color/' + bg, 'min': mn,
                            'ratio': round(c, 2), 'pass': c >= mn})
        for x, y in DISTINCT:
            if alias(x) == alias(y):
                distinct_fail.append({'mode': mode, 'a': x, 'b': y, 'alias': alias(x)})

    semantic = []
    for g, roles in SEMANTIC[modes[0]].items():
        for r in roles:
            semantic.append({'name': 'color/%s/%s' % (g, r),
                             'aliases': {mode: SEMANTIC[mode][g][r] for mode in modes},
                             'scopes': action_scope(r) if g == 'action' else SCOPES[g]})

    folder = ROOT / a.folder
    out = folder / 'data' / 'source' / 'foundation-spec.json'
    out.parent.mkdir(parents=True, exist_ok=True)
    spec = {'project': folder.name, 'modes': modes, 'brand': brand,
            'brand_check': [{'against': n, 'ratio': c, 'verdict': v} for n, c, v in brand_check(brand, modes)],
            'ramps': {k: v for k, v in ramps.items()}, 'singles': SINGLES,
            'alphas': {k: {'hex': v[0], 'alpha': v[1]} for k, v in ALPHAS.items()},
            'semantic': semantic, 'contrast': results, 'paired_tokens_same_step': distinct_fail}
    out.write_text(json.dumps(spec, indent=1), encoding='utf-8')

    fails = [r for r in results if not r['pass']]
    print('brand ramp (base step %s):' % ramps['brand']['base_step'],
          ' '.join(ramps['brand']['values'][s] for s in STEPS))
    print('config.json > ramp.base_steps: {"brand": "%s"}' % ramps['brand']['base_step'])
    if 'Light' in modes:
        fill = SEMANTIC['Light']['action']['primary/bg'].split('/')[1]
        base = ramps['brand']['base_step']
        if fill != base and d.contrast(ramps['brand']['values'][base], '#FFFFFF') >= 4.5:
            print('NOTE: filled buttons use brand/%s, but the brand color itself (brand/%s) passes white text; '
                  'add --fill-step %s if the direction keeps the brand color on buttons' % (fill, base, base))
    print('contrast pairs %d, failing %d' % (len(results), len(fails)))
    for r in fails:
        print('  FAIL [%s] %s on %s %.2f < %s' % (r['mode'], r['fg'], r['bg'], r['ratio'], r['min']))
    for f in distinct_fail:
        print('  SAME STEP [%s] %s and %s both alias %s (state would be invisible)' % (f['mode'], f['a'], f['b'], f['alias']))
    print('wrote', out.relative_to(ROOT).as_posix())
    return 1 if (fails or distinct_fail) else 0


if __name__ == '__main__':
    sys.exit(main())

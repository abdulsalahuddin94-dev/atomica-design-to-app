// Prototype navigation from the Figma reactions: NAVIGATE -> go(screen), OVERLAY -> overlay(screen), BACK -> back().
// State lives in the URL hash (#/<slug>?mode=Dark&lang=ar&bare=1) so every view can be opened and captured directly.
// embed=1: shown inside the Atomica dashboard, which has its own screen picker (no side list, banner or picker here),
// and its toolbar picks the tool (tool=comment | code | inspect) and the frame (device=phone | desktop).
import React from 'react';

export type Route = { slug: string; mode: string; lang: string; bare: boolean; embed: boolean; tool: string | null; device: string | null; overlay: string | null; comment: string | null };

export function parse(): Route {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [slug, q = ''] = h.split('?');
  const p = new URLSearchParams(q);
  return { slug, mode: p.get('mode') || 'Dark', lang: p.get('lang') || 'en', bare: p.get('bare') === '1', embed: p.get('embed') === '1', tool: p.get('tool'), device: p.get('device'), overlay: p.get('overlay'), comment: p.get('comment') };
}

export function href(r: Partial<Route>): string {
  const c = { ...parse(), ...r };
  const p = new URLSearchParams({ mode: c.mode, lang: c.lang });
  if (c.bare) p.set('bare', '1');
  if (c.embed) p.set('embed', '1');
  if (c.tool) p.set('tool', c.tool);
  if (c.device) p.set('device', c.device);
  if (c.overlay) p.set('overlay', c.overlay);
  if (c.comment) p.set('comment', c.comment); // a link to one comment: #/<screen>?comment=<id>
  return `#/${c.slug}?${p.toString()}`;
}

// How the last screen change was asked for (read by shell/motion.tsx to pick the transition): go = forward,
// back = back. A hash change with no recent intent (browser buttons, the screen list) gets no animation.
export const navIntent = { kind: 'none' as 'forward' | 'back' | 'none', at: 0 };
const intend = (kind: 'forward' | 'back') => { navIntent.kind = kind; navIntent.at = Date.now(); };

export const go = (slug: string) => { if (slug) { intend('forward'); window.location.hash = href({ slug, overlay: null, comment: null }); } };
// Overlays replace the history entry instead of adding one, so the browser's Back after closing a sheet goes to the
// previous screen, never back into the sheet (location.replace still fires hashchange).
const replaceHash = (h: string) => window.location.replace(window.location.href.split('#')[0] + h);
export const overlay = (slug: string) => { replaceHash(href({ overlay: slug })); };
export const back = () => {
  const r = parse();
  if (r.overlay) replaceHash(href({ overlay: null }));
  else { intend('back'); window.history.back(); }
};

export function useRoute(): Route {
  const [r, setR] = React.useState(parse);
  React.useEffect(() => {
    const on = () => setR(parse());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

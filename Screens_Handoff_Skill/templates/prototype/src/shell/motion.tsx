// Screen and overlay motion for the prototype shell. The timings come from the project's DS motion tokens through
// src/generated/motion.css (tools/build_prototype.py); with no motion tokens every role is 0ms and screens just switch.
// The transition is picked from the screens themselves, so it works for any project:
//   fade   both screens have a Bottom Navigation (tabs): fade through
//   rise   forward from a tap on the Mini Player: the new screen rises from the bottom (player opens)
//   fall   back from a player screen (no Bottom Navigation, entered by rise / player) to a screen with one: it slides down
//   player between player screens (Now Playing <-> Lyrics...): fade through
//   push / pop  any other forward / back: shared axis X from the end / start side (mirrored in RTL)
// Overlays: the scrim fades and a Sheet slides up; closing reverses it. Reduce motion (OS setting) turns it all off.
import React from 'react';
import { navIntent } from './nav';
import { preloadScreens, SCREENS } from '../generated/routes';

type Kind = 'push' | 'pop' | 'fade' | 'rise' | 'fall' | 'player' | 'none';

const hasNav = (el: Element | null | undefined) => !!el?.querySelector('[data-component="Bottom Navigation"]');
// The build marks screens with a bottom navigation (routes nav); the DOM is the fallback for older builds.
const navFlag = (slug: string) => { const d = SCREENS.find((x) => x.slug === slug); return d && typeof d.nav === 'boolean' ? d.nav : undefined; };
const navOf = (slug: string, el?: Element | null) => navFlag(slug) ?? hasNav(el);
const entered: Record<string, Kind> = {}; // how each screen was last entered
let lastTap = { at: 0, mini: false, fromNav: false };
if (typeof window !== 'undefined') {
  // Load every screen once the page is idle, so a first visit animates a drawn screen, not an empty one.
  const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback || ((f: () => void) => window.setTimeout(f, 300));
  idle(() => { void preloadScreens(); });
  window.addEventListener('pointerdown', (e) => {
    const t = e.target as Element | null;
    // Read the screen being left now, while it is drawn (it may still have been loading when it was entered).
    const cur = document.querySelector('.fp-m-stage > .fp-m-enter .fp-screen');
    lastTap = { at: Date.now(), mini: !!t?.closest?.('[data-component="Mini Player"]'), fromNav: hasNav(cur) };
  }, true);
}

function pick(prev: string, fromNav: boolean, toNav: boolean): Kind {
  const recent = Date.now() - navIntent.at < 1500;
  const intent = recent ? navIntent.kind : 'none';
  navIntent.kind = 'none';
  if (intent === 'none') return 'none';
  const prevKind = entered[prev];
  const fromPlayer = !fromNav && (prevKind === 'rise' || prevKind === 'player');
  if (fromNav && toNav) return 'fade';
  if (intent === 'forward' && Date.now() - lastTap.at < 1500 && lastTap.mini && !toNav) return 'rise';
  if (fromPlayer && toNav) return 'fall';
  if (fromPlayer && !toNav) return 'player';
  return intent === 'forward' ? 'push' : 'pop';
}

/** Renders the current screen; while a transition runs, the previous one stays on stage (inert) until it ends. */
export function MotionStage({ slug, rtl, render }: { slug: string; rtl: boolean; render: (slug: string) => React.ReactNode }) {
  const stage = React.useRef<HTMLDivElement>(null);
  const shown = React.useRef({ slug, nav: false, scroll: 0 });
  const [leaving, setLeaving] = React.useState<{ slug: string; kind: Kind; scroll: number; n: number } | null>(null);
  const [kind, setKind] = React.useState<Kind>('none');
  const [n, setN] = React.useState(0);

  React.useLayoutEffect(() => {
    const cur = stage.current?.querySelector(':scope > .fp-m-enter .fp-screen') as HTMLElement | null;
    if (shown.current.slug !== slug) {
      const prev = shown.current;
      const toNav = navOf(slug, cur);
      // the build's flag wins; the last tap's reading of the DOM is only for older builds without one
      const fromNav = navFlag(prev.slug) ?? (Date.now() - lastTap.at < 1500 ? lastTap.fromNav : prev.nav);
      const k = pick(prev.slug, fromNav, toNav);
      entered[slug] = k === 'none' ? (entered[slug] || 'none') : k;
      setKind(k);
      setN((x) => x + 1);
      setLeaving(k === 'none' ? null : { slug: prev.slug, kind: k, scroll: prev.scroll, n: n + 1 });
      shown.current = { slug, nav: toNav, scroll: 0 };
    } else {
      shown.current.nav = navOf(slug, cur);
    }
  }, [slug]);

  // Remember the scroll position, so the leaving copy starts where the user was.
  React.useEffect(() => {
    const cur = stage.current?.querySelector(':scope > .fp-m-enter .fp-screen') as HTMLElement | null;
    if (!cur) return;
    const on = () => { shown.current.scroll = cur.scrollTop; };
    cur.addEventListener('scroll', on, { passive: true });
    return () => cur.removeEventListener('scroll', on);
  }, [slug, n]);

  // Fallback: drop the leaving copy even if animationend never fires (hidden tab, 0ms roles).
  React.useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), 1200);
    return () => window.clearTimeout(t);
  }, [leaving]);

  const done = (e: React.AnimationEvent) => { if (e.target === e.currentTarget) setLeaving(null); };
  return (
    <div ref={stage} className="fp-m-stage" data-dir={rtl ? 'rtl' : 'ltr'}>
      <div key={slug + ':' + n} className={`fp-m-enter fp-m-${leaving ? kind : 'none'}`}>{render(slug)}</div>
      {leaving && (
        <LeavingCopy key={'l' + leaving.n} scroll={leaving.scroll} className={`fp-m-leave fp-m-${leaving.kind}`} onDone={done}>
          {render(leaving.slug)}
        </LeavingCopy>
      )}
    </div>
  );
}

function LeavingCopy({ children, scroll, className, onDone }: { children: React.ReactNode; scroll: number; className: string; onDone: (e: React.AnimationEvent) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const s = ref.current?.querySelector('.fp-screen') as HTMLElement | null;
    if (s) s.scrollTop = scroll;
    ref.current?.setAttribute('inert', '');
  }, [scroll]);
  return <div ref={ref} aria-hidden="true" className={className} onAnimationEnd={onDone}>{children}</div>;
}

/** An overlay screen that animates in, and stays mounted while it animates out after it was closed. */
export function OverlayStage({ overlay, className, render }: { overlay: string | null; className: string; render: (slug: string) => React.ReactNode }) {
  const [shown, setShown] = React.useState<string | null>(overlay);
  const [closing, setClosing] = React.useState(false);
  React.useEffect(() => {
    if (overlay) { setShown(overlay); setClosing(false); }
    else if (shown) setClosing(true);
  }, [overlay]);
  React.useEffect(() => {
    if (!closing) return;
    const t = window.setTimeout(() => { setShown(null); setClosing(false); }, 800);
    return () => window.clearTimeout(t);
  }, [closing]);
  if (!shown) return null;
  const end = (e: React.AnimationEvent) => { if (closing && e.target === e.currentTarget) { setShown(null); setClosing(false); } };
  return (
    <div className={`${className} fp-ov ${closing ? 'fp-ov-out' : 'fp-ov-in'}`} onAnimationEnd={end} inert={closing || undefined}>
      {render(shown)}
    </div>
  );
}

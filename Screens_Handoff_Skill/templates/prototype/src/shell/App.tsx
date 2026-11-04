// Prototype shell: flow list on the left, the screen inside a phone frame, Light/Dark and EN/AR switches, Inspect,
// the Code panel (reference code per platform; an element picked with Inspect highlights its lines) and Comments
// (a tap drops a pin with the element's Figma node; comments are shared through Supabase or kept locally).
// The shell is chrome only (neutral colors); everything inside the phone comes from the generated screens, which use
// the project's DS components and tokens. ?bare=1 renders the screen alone at its Figma size (fidelity captures),
// without motion; elsewhere screens and overlays animate with the DS motion tokens (shell/motion.tsx).
import React from 'react';
import { SCREENS, FLOWS, MODES, DEVICE, PROJECT } from '../generated/routes';
import { useRoute, href, go } from './nav';
import { MotionStage, OverlayStage } from './motion';
import { CodePanel } from './CodePanel';
import { useScreenLanguage } from './i18n';
import { CommentsPanel, type Pending } from './CommentsPanel';
import { listComments, addComment, type Comment } from './comments';

// Toolbar (shell chrome, the same dark bar in Light and Dark): segmented Light/Dark and EN/AR, Inspect and Code toggles.
const ICONS: Record<string, React.ReactNode> = {
  Light: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  Dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  Inspect: <><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
  Code: <path d="m8 7-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" />,
  Comment: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />,
};
function Icon({ name }: { name: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}
const CONTROL = 'inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400';
const IDLE = 'bg-transparent text-neutral-400 hover:bg-white/10 hover:text-neutral-100';

function Segmented({ value, options, onChange, label, icons, compact }: {
  value: string; options: string[]; onChange: (v: string) => void; label: string; icons?: boolean; compact?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} title={`${label}: ${o}`} onClick={() => onChange(o)}
          className={`${CONTROL} ${value === o ? 'bg-neutral-100 text-neutral-900' : IDLE}`}>
          {icons && ICONS[o] ? <Icon name={o} /> : null}
          <span className={icons && compact ? 'sr-only' : ''}>{o}</span>
        </button>
      ))}
    </div>
  );
}

function Toggle({ label, icon, pressed, onClick, hint, compact }: {
  label: string; icon: string; pressed: boolean; onClick: () => void; hint: string; compact?: boolean;
}) {
  return (
    <button type="button" aria-pressed={pressed} title={hint} onClick={onClick}
      className={`${CONTROL} ${pressed ? 'bg-indigo-400/15 text-indigo-200 ring-1 ring-inset ring-indigo-400' : IDLE}`}>
      <Icon name={icon} />
      <span className={compact ? 'sr-only' : ''}>{label}</span>
    </button>
  );
}

const Divider = () => <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-[#333]" />;

// Said on every page: browsers flag look-alike app screens on new URLs as phishing; this is a design preview.
const BANNER_H = 28;

type Pin = { id: string; n: number; x: number; y: number; resolved: boolean; pending?: boolean; status?: string };
// Progress the Atomica dashboard reports for a comment it sent to Claude (embed only).
const PIN_STATUS: Record<string, [string, string]> = {
  queued: ['bg-amber-500', 'Queued'], 'in-progress': ['bg-sky-500 animate-pulse', 'In progress'], applied: ['bg-emerald-600', 'Applied'], 'needs-ok': ['bg-pink-600', 'Plan ready'],
};

function ScreenView({ slug, mode, lang, bare, height, pins, selected, onPin }: {
  slug: string; mode: string; lang: string; bare: boolean; height?: number; pins?: Pin[]; selected?: string | null; onPin?: (id: string) => void;
}) {
  const def = SCREENS.find((s) => s.slug === slug) || SCREENS[0];
  const Comp = def.Component;
  const ref = React.useRef<HTMLDivElement>(null);
  useScreenLanguage(ref, lang, def.slug);
  return (
    <div ref={ref} className="fp-screen" data-semantic={mode} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} data-screen={def.slug}
      style={{ width: def.w, height: bare ? def.h : Math.min(def.h, height ?? DEVICE.viewport), overflowY: bare || !def.scroll ? 'hidden' : 'auto' }}>
      <Comp />
      {pins && pins.length > 0 && (
        <div className="fp-pins" aria-label="Comment pins" style={{ position: 'absolute', left: 0, top: 0, width: def.w, height: def.h, pointerEvents: 'none' }}>
          {pins.map((p) => (
            <button key={p.id} type="button" data-pin={p.id} title={p.pending ? 'New comment' : `Comment ${p.n}${p.status && PIN_STATUS[p.status] ? ` · ${PIN_STATUS[p.status][1]}` : ''}`} onClick={() => onPin?.(p.id)}
              style={{ position: 'absolute', left: p.x, top: p.y, transform: 'translate(-50%, -100%)', pointerEvents: 'auto' }}
              className={`flex h-6 min-w-6 items-center justify-center rounded-full rounded-bl-none border-2 border-white px-1 text-[11px] font-semibold text-white shadow-md ${p.pending ? 'bg-indigo-400 animate-pulse' : p.status && PIN_STATUS[p.status] ? PIN_STATUS[p.status][0] : p.resolved ? 'bg-neutral-500' : 'bg-indigo-500'} ${selected === p.id ? 'fp-pin-selected ring-2 ring-indigo-300' : ''}`}>
              {p.pending ? '+' : p.n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Comment mode: a tap on the screen (not on a pin) gives the pin position in Figma pixels and the element it is on. */
function useCommentTap(on: boolean, width: number, onTap: (p: Pending) => void) {
  React.useEffect(() => {
    if (!on) return;
    const tap = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const screen = target.closest('.fp-screen') as HTMLElement | null;
      if (!screen || target.closest('[data-pin]')) return;
      e.preventDefault();
      e.stopPropagation();
      const r = screen.getBoundingClientRect();
      const scale = r.width / width || 1;
      const el = target.closest('[data-component], [data-figma-node]') as HTMLElement | null;
      onTap({
        x: Math.round((e.clientX - r.left) / scale + screen.scrollLeft),
        y: Math.round((e.clientY - r.top) / scale + screen.scrollTop),
        figma_node: el?.dataset.figmaNode || null,
        component: el?.dataset.component || el?.dataset.figmaName || null,
      });
    };
    document.addEventListener('click', tap, true);
    return () => document.removeEventListener('click', tap, true);
  }, [on, width, onTap]);
}

/** Window size, for the phone-width layout (no phone frame, screen scaled to the width). */
function useWindowSize() {
  const get = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [s, setS] = React.useState(get);
  React.useEffect(() => {
    const on = () => setS(get());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return s;
}

/** Inspect: hover (desktop) or tap (touch) an element to see its DS component and Figma node; a tap does not navigate.
 *  A tap also reports the element's Figma node and its parents' nodes, so the Code panel can highlight its lines. */
function Inspector({ onPick }: { onPick: (ids: string[]) => void }) {
  const [hit, setHit] = React.useState<{ c: string; id: string } | null>(null);
  React.useEffect(() => {
    const read = (e: Event) => {
      const el = (e.target as HTMLElement).closest('[data-component], [data-figma-node]') as HTMLElement | null;
      if (!el || !el.closest('.fp-screen')) return null;
      return { c: el.dataset.component || el.dataset.figmaName || 'Frame', id: el.dataset.figmaNode || '', el };
    };
    const chain = (el: HTMLElement) => {
      const ids: string[] = [];
      for (let n: HTMLElement | null = el; n && !n.classList.contains('fp-screen'); n = n.parentElement) {
        if (n.dataset.figmaNode) ids.push(n.dataset.figmaNode);
      }
      return ids;
    };
    const over = (e: MouseEvent) => { const h = read(e); setHit(h && { c: h.c, id: h.id }); };
    const tap = (e: MouseEvent) => {
      const h = read(e);
      if (h) { e.preventDefault(); e.stopPropagation(); setHit({ c: h.c, id: h.id }); onPick(chain(h.el)); }
    };
    document.addEventListener('mouseover', over);
    document.addEventListener('click', tap, true);
    return () => { document.removeEventListener('mouseover', over); document.removeEventListener('click', tap, true); };
  }, []);
  return <div className="h-5 px-3 text-center text-xs font-mono opacity-80">{hit ? `${hit.c} · ${hit.id}` : 'Hover or tap an element'}</div>;
}

export function App() {
  const r = useRoute();
  const win = useWindowSize();
  const [inspect, setInspect] = React.useState(false);
  const [code, setCode] = React.useState(false);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [commenting, setCommenting] = React.useState(false);
  const [comments, setComments] = React.useState<Comment[]>([]);
  const [pending, setPending] = React.useState<Pending | null>(null);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [commentError, setCommentError] = React.useState<string | null>(null);
  const [pinStatus, setPinStatus] = React.useState<Record<string, string>>({});
  // The floating controls at the bottom (Lovable-like pill); collapsed to a round button, remembered per browser.
  const [pillOpen, setPillOpen] = React.useState(() => { try { return localStorage.getItem('fpPill') !== 'closed'; } catch { return true; } });
  const setPill = (open: boolean) => { setPillOpen(open); try { localStorage.setItem('fpPill', open ? 'open' : 'closed'); } catch { /* private window */ } };
  React.useEffect(() => { setPicked([]); setPending(null); setSelected(null); }, [r.slug]);
  const curSlug = r.slug || SCREENS[0]?.slug || '';
  const curDef = SCREENS.find((s) => s.slug === curSlug) || SCREENS[0];
  // Comments of this screen: loaded when the screen changes (the Comment button shows the open count), refreshed every
  // 20 s while the panel is open.
  React.useEffect(() => {
    if (!curSlug) return;
    let live = true;
    // A refresh that started before a post finished must not drop the new comment: keep this browser's recent posts.
    const load = () => listComments(curSlug).then((c) => {
      if (!live) return;
      const ids = new Set(c.map((x) => x.id));
      setComments((prev) => [...c, ...prev.filter((x) => !ids.has(x.id) && Date.now() - Date.parse(x.created_at) < 120000)]);
      setCommentError(null);
    })
      .catch((e) => { if (live) setCommentError(String(e.message || e)); });
    load();
    const t = commenting ? window.setInterval(load, 20000) : 0;
    return () => { live = false; window.clearInterval(t); };
  }, [commenting, curSlug]);
  const onTap = React.useCallback((p: Pending) => { setPending(p); setSelected(null); }, []);
  useCommentTap(commenting && !inspect && !r.embed, curDef?.w || 375, onTap); // embedded: review only, no new pins
  // Inside the Atomica dashboard (embed=1) its toolbar picks the tool through the URL, and it is told which pin was
  // picked and where the pin is, so it can show the comment and its actions next to it (postMessage, any origin).
  React.useEffect(() => {
    if (!r.embed) return;
    setCommenting(r.tool === 'comment'); setCode(r.tool === 'code'); setInspect(r.tool === 'inspect');
    if (r.tool !== 'comment') setSelected(null);
  }, [r.embed, r.tool]);
  React.useEffect(() => {
    if (r.embed && commenting) window.parent.postMessage({ type: 'atomica:comments', screen: curSlug, items: comments.map((c, i) => ({ id: c.id, n: i + 1, status: c.status })) }, '*');
  }, [r.embed, commenting, comments, curSlug]);
  React.useEffect(() => {
    if (!r.embed) return;
    const on = (e: MessageEvent) => { if (e.source === window.parent && e.data?.type === 'atomica:pin-status') setPinStatus(e.data.map || {}); };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, [r.embed]);
  React.useEffect(() => {
    if (!r.embed || !selected) return;
    const post = () => {
      const b = (document.querySelector(`[data-pin="${selected}"]`) as HTMLElement | null)?.getBoundingClientRect();
      window.parent.postMessage({ type: 'atomica:comment', id: selected, rect: b ? { x: b.left, y: b.top, w: b.width, h: b.height } : null }, '*');
    };
    const t = window.setTimeout(post, 700); // after focusComment's smooth scroll
    const screen = document.querySelector('.fp-screen');
    screen?.addEventListener('scroll', post, { passive: true });
    return () => { window.clearTimeout(t); screen?.removeEventListener('scroll', post); };
  }, [r.embed, selected]);
  // Code and Comments share the side of the screen: opening one closes the other.
  const toggleCode = () => { setCode(!code); if (!code) setCommenting(false); };
  // A comment from the list or a link: switch to the theme and language it was made in, scroll its pin into view
  // inside the device and flash the element it is on.
  const focusComment = React.useCallback((c: Comment) => {
    setSelected(c.id);
    const target = href({ mode: c.theme, lang: c.lang, comment: c.id });
    if (window.location.hash !== target) window.history.replaceState(null, '', target), window.dispatchEvent(new HashChangeEvent('hashchange'));
    window.setTimeout(() => {
      const screen = document.querySelector('.fp-screen') as HTMLElement | null;
      if (!screen) return;
      const visible = narrowRef.current ? screen.clientHeight * 0.4 : screen.clientHeight; // a phone sheet covers the bottom
      screen.scrollTo({ top: Math.max(0, c.y - visible / 2), behavior: 'smooth' });
      const el = c.figma_node ? screen.querySelector(`[data-figma-node="${c.figma_node}"]`) as HTMLElement | null : null;
      el?.classList.add('fp-flash');
      window.setTimeout(() => el?.classList.remove('fp-flash'), 1900);
    }, 250);
  }, []);
  const narrowRef = React.useRef(false);
  const focused = React.useRef<string | null>(null);
  React.useEffect(() => { if (r.comment && !commenting) { setCommenting(true); setCode(false); setInspect(false); } }, [r.comment]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const c = r.comment && comments.find((x) => x.id === r.comment);
    if (c && focused.current !== c.id) { focused.current = c.id; focusComment(c); }
  }, [r.comment, comments, focusComment]);
  const toggleComments = () => {
    setCommenting(!commenting); setPending(null);
    if (!commenting) { setCode(false); setInspect(false); }
    else if (r.comment) window.history.replaceState(null, '', href({ comment: null }));
  };
  React.useEffect(() => { if (!r.slug && SCREENS[0]) go(SCREENS[0].slug); }, [r.slug]);
  React.useEffect(() => { document.documentElement.dataset.shell = r.mode === 'Dark' ? 'dark' : 'light'; }, [r.mode]);
  React.useEffect(() => { if (r.embed) document.documentElement.dataset.embed = ''; else delete document.documentElement.dataset.embed; }, [r.embed]);
  if (!SCREENS.length) return <p className="p-6">No screens generated yet. Run tools/build_prototype.py.</p>;
  const slug = r.slug || SCREENS[0].slug;
  const def = SCREENS.find((s) => s.slug === slug) || SCREENS[0];

  if (r.bare) return (
    <div data-inspect="off" style={{ width: def.w }}>
      <ScreenView slug={slug} mode={r.mode} lang={r.lang} bare />
      {r.overlay && <div style={{ position: 'absolute', inset: 0 }}><ScreenView slug={r.overlay} mode={r.mode} lang={r.lang} bare /></div>}
    </div>
  );

  // Phone width: no side list (a screen picker instead), no phone frame, the screen scaled to the window width.
  const narrow = win.w < 768;
  narrowRef.current = narrow;
  const embed = r.embed; // inside the Atomica dashboard: no banner, side list or screen picker (the dashboard has them)
  // Embedded, the frame follows the screen: a phone for mobile screens, a browser window for web ones (or device=).
  const device = embed ? (r.device === 'phone' || r.device === 'desktop' ? r.device : def.w >= 600 ? 'desktop' : 'phone') : null;
  const PILL_H = 72; // room kept free for the floating controls at the bottom
  // embedded, the canvas fills the dashboard preview and its controls float on top: keep the device clear of them
  const EMBED_TOP = 24, EMBED_BOTTOM = 80;
  const toolbarH = embed ? 0 : BANNER_H + PILL_H;
  const BAR = 36; // browser frame top bar
  const phoneH = def.scroll ? DEVICE.viewport : def.h;
  // Desktop: the phone frame shrinks when the side list and the Code panel leave less room (no sideways scroll).
  const room = win.w - (embed ? 0 : 256) - (code ? 440 : commenting ? 360 : 0) - 32;
  // a static (one-screen) frame never scrolls, so at phone width it also fits the height left under the toolbar
  // the phone fills the height it has (up or down, limited only by the width); a long screen scrolls inside it
  const zoom = device === 'phone' ? Math.min((win.w - 24) / (def.w + 24), (win.h - EMBED_TOP - EMBED_BOTTOM) / (phoneH + 24))
    : device === 'desktop' ? Math.min(1, (win.w - 32) / def.w)
    : narrow ? Math.min(1, win.w / def.w, def.scroll ? 1 : (win.h - toolbarH) / def.h)
    : Math.min(room / (def.w + 24), (win.h - toolbarH - 32) / (DEVICE.viewport + 24)); // 32: the spacer above and the frame margin
  const screenH = device === 'phone' ? phoneH
    : device === 'desktop' ? Math.floor((win.h - EMBED_TOP - EMBED_BOTTOM) / zoom) - BAR
    : narrow ? (def.scroll ? Math.floor((win.h - toolbarH) / zoom) : def.h) : DEVICE.viewport;
  const openCount = comments.filter((c) => c.status !== 'resolved').length;
  const pill = !embed && !((code || commenting) && narrow) && (pillOpen ? (
    <div role="toolbar" aria-label="Prototype controls" data-toolbar=""
      className="fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-24px)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto whitespace-nowrap rounded-2xl border border-[#2A2E36] bg-[#17191E] p-1.5 text-neutral-200 shadow-[0_8px_28px_rgba(0,0,0,0.3)]">
      <label className="shrink-0">
        <span className="sr-only">Screen</span>
        <select value={slug} onChange={(e) => go(e.target.value)}
          className="h-8 max-w-[150px] rounded-lg bg-[#23262D] px-2 text-[12.5px] font-medium text-neutral-100 [&>option]:bg-[#23262D]">
          {SCREENS.map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
        </select>
      </label>
      <Divider />
      <Segmented label="Color mode" value={r.mode} options={MODES} icons compact onChange={(m) => { window.location.hash = href({ mode: m }); }} />
      <Divider />
      <Segmented label="Language" value={r.lang === 'ar' ? 'AR' : 'EN'} options={['EN', 'AR']} onChange={(l) => { window.location.hash = href({ lang: l.toLowerCase() }); }} />
      <Divider />
      <Toggle label="Inspect" icon="Inspect" pressed={inspect} onClick={() => setInspect(!inspect)} compact
        hint="Inspect: hover or tap an element to see its DS component and Figma node" />
      <Toggle label="Code" icon="Code" pressed={code} onClick={toggleCode} compact
        hint="Code: reference code of this screen per platform" />
      <span className="relative inline-flex">
        <Toggle label="Comment" icon="Comment" pressed={commenting} onClick={toggleComments} compact
          hint="Comment: tap an element to leave a comment for the design team" />
        {openCount > 0 && <span aria-label={`${openCount} open comments`} className="pointer-events-none absolute -right-1 -top-1 min-w-4 rounded-full bg-pink-600 px-1 text-center text-[10px] font-bold leading-4 text-white">{openCount}</span>}
      </span>
      <Divider />
      <button type="button" aria-label="Hide the controls" title="Hide the controls" onClick={() => setPill(false)} className={`${CONTROL} ${IDLE}`}>
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
      </button>
    </div>
  ) : (
    <button type="button" data-toolbar="" aria-label="Show the prototype controls" title="Show the prototype controls" onClick={() => setPill(true)}
      className="fixed bottom-4 right-4 z-40 grid h-10 w-10 place-items-center rounded-full border border-[#2A2E36] bg-[#17191E] text-neutral-100 shadow-[0_8px_28px_rgba(0,0,0,0.3)]">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6" /></svg>
    </button>
  ));
  const screen = (
    <>
      <MotionStage slug={slug} rtl={r.lang === 'ar'} render={(s) => s !== slug ? <ScreenView slug={s} mode={r.mode} lang={r.lang} bare={false} height={screenH} /> : (
      <ScreenView slug={slug} mode={r.mode} lang={r.lang} bare={false} height={screenH} selected={selected}
        pins={commenting ? [
          ...comments.filter((c) => c.status !== 'resolved' || c.id === selected).map((c) => ({ id: c.id, n: comments.indexOf(c) + 1, x: (c.lang === 'ar') !== (r.lang === 'ar') ? def.w - c.x : c.x, y: c.y, resolved: c.status === 'resolved', status: pinStatus[c.id] })), // RTL mirrors the layout, so the pin mirrors too
          ...(pending ? [{ id: 'pending', n: 0, x: pending.x, y: pending.y, resolved: false, pending: true }] : []),
        ] : undefined}
        onPin={(id) => { const c = comments.find((x) => x.id === id); if (c) focusComment(c); }} />)} />
      <OverlayStage overlay={r.overlay} className="absolute inset-0 bg-black/40"
        render={(s) => <ScreenView slug={s} mode={r.mode} lang={r.lang} bare={false} height={screenH} />} />
    </>
  );

  return (
    <div className="flex h-full flex-col">
    {!embed && <div role="note" data-banner="" style={{ height: BANNER_H }}
      className="box-border flex shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap bg-neutral-800 px-4 text-center text-xs text-neutral-100">
      <span className="font-semibold">Design prototype by Atomica</span>
      <span className="opacity-80 md:hidden">· not a real app · no login</span>
      <span className="hidden opacity-80 md:inline">· not a real app · no login · comments go to the design team</span>
    </div>}
    <div className={`flex min-h-0 flex-1 ${r.mode === 'Dark' ? 'dark' : ''}`}>
      {!embed && <aside className="dark hidden w-64 shrink-0 overflow-y-auto border-r border-white/10 bg-[#2a2a2d] p-4 text-neutral-100 md:block">{/* same in Light and Dark */}
        <div className="mb-1 text-xs uppercase tracking-wide opacity-60">Live prototype</div>
        <div className="mb-4 text-lg font-semibold">{PROJECT.name}</div>
        {FLOWS.map((f) => (
          <nav key={f.name} aria-label={f.name} className="mb-4">
            <div className="mb-1 text-sm font-medium opacity-70">{f.name}</div>
            <ul className="space-y-0.5">
              {f.slugs.map((s) => {
                const d = SCREENS.find((x) => x.slug === s)!;
                return (
                  <li key={s}>
                    <a href={href({ slug: s, overlay: null })} aria-current={s === slug ? 'page' : undefined}
                      className={`block rounded-md px-2 py-1 text-sm ${s === slug ? 'bg-black/10 font-medium dark:bg-white/15' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
                      {d.name}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        ))}
        <div className="mt-6 text-xs opacity-60">Figma: {PROJECT.figmaFile}<br />Exported {PROJECT.exportedAt.slice(0, 10)}</div>
      </aside>}
      <main className={`flex min-w-0 flex-1 flex-col items-center overflow-x-hidden ${embed ? 'justify-center overflow-y-hidden' : 'overflow-y-auto'}`} style={embed ? { paddingTop: EMBED_TOP, paddingBottom: EMBED_BOTTOM, boxSizing: 'border-box' } : undefined}>
        {!embed && <div aria-hidden="true" className="h-3 shrink-0" />}
        {inspect && narrow && <Inspector onPick={setPicked} />}
        {device === 'desktop' ? (
          <div data-inspect={inspect ? 'on' : 'off'} className="fp-web relative shrink-0 overflow-hidden rounded-[10px] border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.14)] dark:border-white/10 dark:bg-[#1b1d22]" style={{ zoom, width: def.w }} aria-label="Browser window">
            <div className="box-border flex items-center gap-2 border-b border-black/10 bg-neutral-100 px-3 dark:border-white/10 dark:bg-[#23262d]" style={{ height: BAR }}>
              <span aria-hidden="true" className="flex gap-1.5">{['#ff5f57', '#febc2e', '#28c840'].map((c) => <i key={c} className="block h-2.5 w-2.5 rounded-full" style={{ background: c }} />)}</span>
              <span className="mx-auto max-w-[60%] truncate rounded-md bg-white px-3 py-0.5 text-[11px] text-neutral-500 dark:bg-white/10 dark:text-neutral-300">{PROJECT.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.app/{slug}</span>
            </div>
            {screen}
          </div>
        ) : narrow && !embed ? (
          <div data-inspect={inspect ? 'on' : 'off'} className="relative" style={{ zoom }} aria-label="Screen">{screen}</div>
        ) : (
          <div data-inspect={inspect ? 'on' : 'off'} className={`relative shrink-0 rounded-[44px] bg-neutral-900 p-3 shadow-2xl ring-1 ring-black/40 dark:ring-white/15 ${embed ? '' : 'my-2'}`} style={{ zoom }} aria-label="Android phone">
            <div className="relative overflow-hidden rounded-[32px]">
              {screen}
              <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-2.5 h-3 w-3 -translate-x-1/2 rounded-full bg-black" />
            </div>
          </div>
        )}
        {inspect && !narrow && <Inspector onPick={setPicked} />}
        {(code || commenting) && narrow && <div aria-hidden="true" className="h-[60vh] shrink-0" />}
        {!embed && <div aria-hidden="true" className="shrink-0" style={{ height: PILL_H }} />}
      </main>
      {pill}
      {code && <CodePanel slug={slug} picked={picked} narrow={narrow} onClose={() => setCode(false)} />}
      {commenting && !embed && (
        <CommentsPanel comments={comments} pending={pending} narrow={narrow} selected={selected} error={commentError}
          onCancel={() => setPending(null)} onClose={toggleComments}
          onSelect={(id) => { const c = comments.find((x) => x.id === id); if (c) focusComment(c); }}
          onSubmit={async (body, author, images) => {
            if (!pending) return;
            try {
              const made = await addComment({
                screen: slug, figma_node: pending.figma_node, component: pending.component, theme: r.mode, lang: r.lang,
                viewport: `${narrow ? 'phone' : 'desktop'} ${win.w}x${win.h}`, x: pending.x, y: pending.y, author: author || null, body,
              }, images);
              setComments((c) => [...c, made]);
              setPending(null);
              setSelected(made.id);
              focused.current = made.id;
              setCommentError(null);
            } catch (e) { setCommentError(String((e as Error).message || e)); throw e; }
          }} />
      )}
    </div>
    </div>
  );
}

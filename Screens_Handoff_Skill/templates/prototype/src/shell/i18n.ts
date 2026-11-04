// AR switch: the screens are generated from the English Figma frames, so in Arabic the prototype swaps every UI
// string for its translation (public/strings/ar.json, written by tools/prototype_strings.py from data/strings/ar.json).
// Content (song, artist, playlist and podcast names) is not in that file and stays as it is. The swap happens on the
// rendered text, so the DS components need no language prop; switching back to EN restores the original text.
import React from 'react';

let dict: Record<string, string> | null = null;
let loading: Promise<Record<string, string>> | null = null;
function loadDict() {
  if (dict) return Promise.resolve(dict);
  loading ??= fetch(`${import.meta.env.BASE_URL}strings/ar.json`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((d) => (dict = d));
  return loading;
}

const original = new WeakMap<Text, string>(); // the English text React rendered
const shown = new WeakMap<Text, string>(); // what the swap wrote, to notice when React re-renders a text node
const ATTRS = ['placeholder', 'aria-label', 'title'] as const;

function translate(root: HTMLElement, d: Record<string, string>) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (original.has(t) && t.data !== shown.get(t)) original.set(t, t.data); // React changed it since
    const src = original.get(t) ?? t.data;
    const key = src.trim();
    const ar = key && d[key];
    if (!ar) continue;
    original.set(t, src);
    const next = src.replace(key, ar);
    shown.set(t, next);
    if (t.data !== next) t.data = next;
  }
  for (const el of root.querySelectorAll<HTMLElement>('[placeholder], [aria-label], [title]')) {
    for (const a of ATTRS) {
      const src = el.dataset[`en${a.replace('-', '')}`] ?? el.getAttribute(a);
      const ar = src && d[src.trim()];
      if (!ar) continue;
      el.dataset[`en${a.replace('-', '')}`] = src;
      if (el.getAttribute(a) !== ar) el.setAttribute(a, ar);
    }
  }
}

function restore(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    const src = original.get(t);
    if (src !== undefined && t.data === shown.get(t)) t.data = src;
    original.delete(t);
    shown.delete(t);
  }
  for (const el of root.querySelectorAll<HTMLElement>('[placeholder], [aria-label], [title]')) {
    for (const a of ATTRS) {
      const k = `en${a.replace('-', '')}`;
      if (el.dataset[k] !== undefined) { el.setAttribute(a, el.dataset[k]!); delete el.dataset[k]; }
    }
  }
}

/** Keeps the screen under `ref` in the chosen language, also after lazy screens and state changes render. */
export function useScreenLanguage(ref: React.RefObject<HTMLElement | null>, lang: string, slug: string) {
  React.useEffect(() => {
    const root = ref.current;
    if (!root || lang !== 'ar') return;
    let obs: MutationObserver | null = null;
    let live = true;
    loadDict().then((d) => {
      if (!live || !Object.keys(d).length) return;
      const run = () => { obs?.disconnect(); translate(root, d); obs?.observe(root, { subtree: true, childList: true, characterData: true }); };
      obs = new MutationObserver(run);
      run();
    });
    return () => { live = false; obs?.disconnect(); restore(root); };
  }, [ref, lang, slug]);
}

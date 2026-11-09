// Comments panel: the comments of the current screen (resolved ones hidden unless asked) and the form for a new one.
// With Comment on, a tap on the screen drops a pin there and opens the form; the comment keeps the element's Figma node,
// DS component, theme, language and viewport, and up to 4 reference images (paste with Ctrl+V or pick with +).
// A comment in the list takes you to its pin (onSelect). Desktop: a side panel. Phone width: a bottom sheet.
import React from 'react';
import type { Comment } from './comments';
import { storeKind, prepareImage, imageUrl, IMAGE_TYPES, MAX_IMAGES } from './comments';

export type Pending = { x: number; y: number; figma_node: string | null; component: string | null };
type Attached = { blob: Blob; url: string };

function remembered(): string {
  try { return window.localStorage.getItem('fp-comment-author') || ''; } catch { return ''; }
}

/** Full-size view of an attached image; a click or Esc closes it. */
function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div role="dialog" aria-label="Attached image" data-lightbox="" onClick={onClose}
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-black/80 p-6">
      <img src={src} alt="Attached to the comment" className="max-h-full max-w-full rounded-lg shadow-2xl" />
    </div>
  );
}

export function CommentsPanel({ comments, pending, narrow, selected, error, onSubmit, onCancel, onSelect, onClose }: {
  comments: Comment[]; pending: Pending | null; narrow: boolean; selected: string | null; error: string | null;
  onSubmit: (body: string, author: string, images: Blob[]) => Promise<void>; onCancel: () => void; onSelect: (id: string) => void; onClose: () => void;
}) {
  const [body, setBody] = React.useState('');
  const [author, setAuthor] = React.useState(remembered);
  const [busy, setBusy] = React.useState(false);
  const [showResolved, setShowResolved] = React.useState(false);
  const [attached, setAttached] = React.useState<Attached[]>([]);
  const [imageError, setImageError] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);
  const text = React.useRef<HTMLTextAreaElement>(null);
  const picker = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (pending) text.current?.focus(); }, [pending]);
  React.useEffect(() => { if (!pending) { attached.forEach((a) => URL.revokeObjectURL(a.url)); setAttached([]); setImageError(null); } }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const addImages = async (files: Blob[]) => {
    setImageError(null);
    const room = MAX_IMAGES - attached.length;
    if (files.length > room) setImageError(`Up to ${MAX_IMAGES} images per comment.`);
    for (const f of files.slice(0, Math.max(0, room))) {
      try {
        const blob = await prepareImage(f);
        setAttached((a) => (a.length < MAX_IMAGES ? [...a, { blob, url: URL.createObjectURL(blob) }] : a));
      } catch (e) { setImageError(String((e as Error).message || e)); }
    }
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const files = [...e.clipboardData.items].filter((i) => i.kind === 'file' && i.type.startsWith('image/')).map((i) => i.getAsFile()).filter(Boolean) as Blob[];
    if (files.length) { e.preventDefault(); addImages(files); }
  };

  const shown = comments.filter((c) => showResolved || c.status !== 'resolved');
  const resolved = comments.length - comments.filter((c) => c.status !== 'resolved').length;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      try { window.localStorage.setItem('fp-comment-author', author.trim()); } catch { /* ignore */ }
      await onSubmit(body.trim(), author.trim(), attached.map((a) => a.blob));
      setBody('');
    } finally { setBusy(false); }
  };
  const copyLink = async (id: string) => {
    const url = new URL(window.location.href);
    url.hash = url.hash.replace(/([?&])comment=[^&]*&?/, '$1').replace(/[?&]$/, '') + (url.hash.includes('?') ? '&' : '?') + `comment=${id}`;
    try { await navigator.clipboard.writeText(url.toString()); setCopied(id); window.setTimeout(() => setCopied(null), 1500); } catch { window.prompt('Link to this comment', url.toString()); }
  };

  const frame = narrow
    ? 'fixed inset-x-0 bottom-0 z-30 flex h-[60vh] flex-col rounded-t-2xl border-t border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-neutral-900'
    : 'flex w-[360px] shrink-0 flex-col border-l border-black/10 bg-white dark:border-white/10 dark:bg-neutral-900';
  const field = 'box-border w-full rounded-md border border-black/15 bg-transparent px-2.5 py-1.5 text-sm text-inherit dark:border-white/15';

  return (
    <aside className={frame} aria-label="Comments" data-comments-panel={narrow ? 'sheet' : 'side'}>
      {narrow && <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-black/20 dark:bg-white/25" />}
      <div className="flex items-start gap-2 px-4 pb-2 pt-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Comments <span className="opacity-60">({shown.length})</span></div>
          <div className="text-xs opacity-60" data-store={storeKind}>
            {storeKind === 'shared' ? 'Shared with everyone who opens this link.' : 'Local test store: only in this browser.'}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close comments"
          className="rounded-md bg-transparent px-2 py-1 text-xs opacity-70 hover:bg-black/5 dark:hover:bg-white/10">✕</button>
      </div>

      {pending ? (
        <form onSubmit={submit} onPaste={onPaste} className="mx-4 mb-3 rounded-lg border border-indigo-400/60 p-3" data-comment-form="">
          <div className="mb-1 text-sm font-semibold">Design feedback</div>
          <div className="mb-2 text-xs opacity-70">On <b>{pending.component || 'Frame'}</b> · {pending.figma_node || '-'}. No login; only your comment, the optional name and images are saved.</div>
          <label className="mb-2 block text-xs">
            <span className="mb-1 block opacity-70">Name (optional)</span>
            <input value={author} maxLength={80} onChange={(e) => setAuthor(e.target.value)} className={field} name="reviewer" autoComplete="off" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block opacity-70">Comment</span>
            <textarea ref={text} name="feedback" value={body} required maxLength={2000} rows={3} onChange={(e) => setBody(e.target.value)} className={field}
              placeholder="Paste a screenshot with Ctrl+V, or add one with +" />
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2" data-attachments="">
            {attached.map((a, i) => (
              <span key={a.url} className="relative inline-block">
                <img src={a.url} alt={`Attachment ${i + 1}`} className="h-14 w-14 rounded-md object-cover ring-1 ring-black/10 dark:ring-white/15" />
                <button type="button" aria-label={`Remove image ${i + 1}`} onClick={() => { URL.revokeObjectURL(a.url); setAttached((x) => x.filter((y) => y !== a)); }}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-[10px] text-white">✕</button>
              </span>
            ))}
            {attached.length < MAX_IMAGES && (
              <button type="button" aria-label="Add an image" title="Add an image (PNG, JPG, WebP or GIF, up to 5 MB)" onClick={() => picker.current?.click()}
                className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-black/25 bg-transparent text-xl opacity-70 hover:opacity-100 dark:border-white/25">+</button>
            )}
            <input ref={picker} type="file" accept={IMAGE_TYPES.join(',')} multiple hidden data-image-picker=""
              onChange={(e) => { const f = [...(e.target.files || [])]; e.target.value = ''; addImages(f); }} />
          </div>
          {imageError && <div role="alert" data-image-error="" className="mt-2 text-xs text-red-500">{imageError}</div>}
          {error && <div role="alert" className="mt-2 text-xs text-red-500">{error}</div>}
          <div className="mt-2 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-md bg-transparent px-3 py-1 text-xs hover:bg-black/5 dark:hover:bg-white/10">Cancel</button>
            <button type="submit" disabled={!body.trim() || busy}
              className="rounded-md bg-indigo-500 px-3 py-1 text-xs font-medium text-white disabled:opacity-40">{busy ? 'Posting…' : 'Post'}</button>
          </div>
        </form>
      ) : (
        <div className="mx-4 mb-3 rounded-lg bg-black/5 px-3 py-2 text-xs opacity-80 dark:bg-white/10">Tap an element on the screen to leave design feedback on it.</div>
      )}

      <div className="flex items-center justify-between border-t border-black/10 px-4 py-2 text-xs dark:border-white/10">
        <span className="opacity-60">This screen</span>
        {resolved > 0 && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} /> Show resolved ({resolved})
          </label>
        )}
      </div>
      <ol className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0 pb-3" data-comment-list="">
        {!shown.length && <li className="px-4 py-2 text-xs opacity-60">No comments on this screen yet.</li>}
        {shown.map((c) => {
          const n = comments.indexOf(c) + 1;
          return (
            <li key={c.id} className={`px-4 py-2 ${selected === c.id ? 'bg-indigo-400/15' : 'hover:bg-black/5 dark:hover:bg-white/5'}`}>
              <button type="button" onClick={() => onSelect(c.id)} data-comment-id={c.id} title="Show on the screen"
                className="box-border flex w-full gap-3 bg-transparent p-0 text-left">
                <span className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${c.status === 'resolved' ? 'bg-neutral-500' : 'bg-indigo-500'}`}>{n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs opacity-60">{c.author || 'Anonymous'} · {new Date(c.created_at).toLocaleString()}</span>
                  <span className="block whitespace-pre-wrap break-words text-sm" dir="auto">{c.body}</span>
                  <span className="block text-[11px] opacity-50">{c.component || 'Frame'} · {c.figma_node} · {c.theme} / {c.lang.toUpperCase()} · {c.viewport}{c.status === 'resolved' ? ' · resolved' : ''}</span>
                </span>
              </button>
              {c.reply && (
                <div className="ms-8 mt-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs" data-comment-reply="" dir="auto">
                  <span className="font-semibold">Design team:</span> {c.reply}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 ps-8">
                {(c.images || []).map((p, i) => (
                  <button key={p} type="button" onClick={() => setZoom(imageUrl(p))} aria-label={`Open image ${i + 1}`} data-comment-image=""
                    className="cursor-zoom-in rounded-md bg-transparent p-0">
                    <img src={imageUrl(p)} alt={`Image ${i + 1} of comment ${n}`} loading="lazy" className="h-12 w-12 rounded-md object-cover ring-1 ring-black/10 dark:ring-white/15" />
                  </button>
                ))}
                <button type="button" onClick={() => copyLink(c.id)} className="rounded bg-transparent px-1 text-[11px] opacity-60 hover:opacity-100">
                  {copied === c.id ? 'Link copied' : 'Copy link'}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </aside>
  );
}

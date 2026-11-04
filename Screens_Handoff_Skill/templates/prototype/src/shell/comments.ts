// Review comments of the prototype. With VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time (the public anon /
// publishable key, from the shared ~/.atomica/supabase.env or the project's git-ignored prototype/.env.local) comments
// go to the Supabase table prototype_comments, shared by every reviewer, through its REST API (no client library), and
// reference images to the public Storage bucket prototype-comments. Without them the prototype keeps comments in this
// browser only ("local test store"), so the overlay works before Supabase exists. Reviewers need no account.
import { PROJECT } from '../generated/routes';

export type Comment = {
  id: string;
  project: string;
  screen: string;
  figma_node: string | null;
  component: string | null;
  theme: string;
  lang: string;
  viewport: string;
  x: number;
  y: number;
  author: string | null;
  body: string;
  reply?: string | null; // the design team's answer (written with --resolve --reply)
  images?: string[] | null; // storage paths (<project>/<comment id>/<n>.webp), or data: URLs in the local store
  status: 'open' | 'resolved';
  created_at: string;
};
export type NewComment = Omit<Comment, 'id' | 'project' | 'status' | 'created_at' | 'images' | 'reply'>;

const env = import.meta.env;
const URL_ = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = env.VITE_SUPABASE_ANON_KEY || '';
export const COMMENTS_PROJECT: string = env.VITE_COMMENTS_PROJECT
  || PROJECT.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const storeKind: 'shared' | 'local' = URL_ && KEY ? 'shared' : 'local';

const api = `${URL_}/rest/v1/prototype_comments`;
const BUCKET = 'prototype-comments';
// Legacy anon keys are JWTs and also go in Authorization; the newer publishable keys (sb_publishable_...) only in apikey.
const auth: Record<string, string> = { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}) };
const headers: Record<string, string> = { ...auth, 'content-type': 'application/json' };
const LOCAL = `fp-comments-${COMMENTS_PROJECT}`;

// Reference images: png / jpeg / webp / gif, downscaled to at most 2000 px and sent as WebP, at most 5 MB, 4 per comment.
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
export const MAX_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_SIDE = 2000;

/** Checks and downscales one image; throws a message for the reviewer when it cannot be used. */
export async function prepareImage(file: Blob): Promise<Blob> {
  if (!IMAGE_TYPES.includes(file.type)) throw new Error('Only PNG, JPG, WebP or GIF images can be attached.');
  if (file.size > 25 * 1024 * 1024) throw new Error('That image is too large (over 25 MB).');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const out = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.85));
  if (!out) throw new Error('That image could not be read.');
  if (out.size > MAX_IMAGE_BYTES) throw new Error('That image is still over 5 MB after resizing.');
  return out;
}

/** A link to an attached image (public Storage URL, or the data: URL of the local store). */
export function imageUrl(p: string): string {
  return p.startsWith('data:') ? p : `${URL_}/storage/v1/object/public/${BUCKET}/${p}`;
}

function readLocal(): Comment[] {
  try { return JSON.parse(window.localStorage.getItem(LOCAL) || '[]'); } catch { return []; }
}
function writeLocal(list: Comment[]) {
  try { window.localStorage.setItem(LOCAL, JSON.stringify(list)); } catch { throw new Error('This browser has no room left for local comments.'); }
}
let memory: Comment[] | null = null;
const toDataUrl = (b: Blob) => new Promise<string>((res) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(b); });

export async function listComments(screen: string): Promise<Comment[]> {
  if (storeKind === 'local') return (memory ??= readLocal()).filter((c) => c.screen === screen);
  const q = `?select=*&project=eq.${encodeURIComponent(COMMENTS_PROJECT)}&screen=eq.${encodeURIComponent(screen)}&order=created_at.asc`;
  const r = await fetch(api + q, { headers });
  if (!r.ok) throw new Error(`Could not load comments (HTTP ${r.status})`);
  return r.json();
}

export async function addComment(c: NewComment, images: Blob[] = []): Promise<Comment> {
  const id = crypto.randomUUID();
  if (storeKind === 'local') {
    const made: Comment = { ...c, id, project: COMMENTS_PROJECT, status: 'open', created_at: new Date().toISOString(), images: await Promise.all(images.map(toDataUrl)) };
    memory = [...(memory ??= readLocal()), made];
    writeLocal(memory);
    return made;
  }
  // images first, under the comment's id, then the comment that lists them
  const paths: string[] = [];
  for (const [i, img] of images.slice(0, MAX_IMAGES).entries()) {
    const path = `${COMMENTS_PROJECT}/${id}/${i + 1}.webp`;
    const r = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', headers: { ...auth, 'content-type': img.type || 'image/webp' }, body: img });
    if (!r.ok) throw new Error(`Could not upload image ${i + 1} (HTTP ${r.status})`);
    paths.push(path);
  }
  const row = { ...c, id, project: COMMENTS_PROJECT, status: 'open' as const, ...(paths.length ? { images: paths } : {}) };
  const r = await fetch(api, { method: 'POST', headers: { ...headers, Prefer: 'return=representation' }, body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`Could not post the comment (HTTP ${r.status})`);
  return (await r.json())[0];
}

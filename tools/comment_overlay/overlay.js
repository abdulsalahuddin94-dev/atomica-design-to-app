// Review comments on ANY web app (Abdul, 2026-11-09): an imported Lovable / v0 / Bolt / Figma Make app, or a Vibe code
// app, gets the same pins as the Atomica prototype without a line of it in the app's repo. tools/comment_overlay/run.mjs
// injects this file into the app's own Vite dev server. Comments go to the same Supabase table (prototype_comments,
// same project slug), so the dashboard's Review page and `tools/prototype_comments.cjs --pull` triage them as usual.
// Without Supabase keys they stay in this browser ("local test store"). Reviewers need no account.
// A pin is kept on its element (a short CSS path) and the page route; the page position is the fallback.
(() => {
  if (window.__atomicaOverlay) return;
  window.__atomicaOverlay = true;
  const cfg = window.__ATOMICA_COMMENTS__ || {};
  const URL_ = String(cfg.url || '').replace(/\/$/, '');
  const KEY = String(cfg.key || '');
  const PROJECT = String(cfg.project || 'app').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
  const shared = !!(URL_ && KEY);
  const api = `${URL_}/rest/v1/prototype_comments`;
  const auth = { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: `Bearer ${KEY}` } : {}) };
  const LOCAL = `fp-comments-${PROJECT}`;

  // the page = the route (hash routers included), as a slug: "/" -> home, "/settings/profile" -> settings-profile
  const screen = () => {
    const route = (location.hash.startsWith('#/') ? location.hash.slice(1).split('?')[0] : location.pathname) || '/';
    return route.replace(/^\/+|\/+$/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'home';
  };
  const theme = () => (document.documentElement.classList.contains('dark') || document.body.classList.contains('dark') ? 'Dark' : 'Light');
  const lang = () => ((document.documentElement.lang || '').startsWith('ar') || document.documentElement.dir === 'rtl' ? 'ar' : 'en');
  // a short, stable CSS path for an element: id or data-testid when there is one, else tag + nth-of-type up to 4 levels
  function cssPath(el) {
    const parts = [];
    for (let n = el, i = 0; n && n.nodeType === 1 && n !== document.body && i < 6; n = n.parentElement, i++) {
      if (n.id && !/\d{3,}/.test(n.id)) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      const t = n.getAttribute('data-testid');
      if (t) { parts.unshift(`[data-testid="${t}"]`); break; }
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      parts.unshift(same.length > 1 ? `${n.tagName.toLowerCase()}:nth-of-type(${same.indexOf(n) + 1})` : n.tagName.toLowerCase());
    }
    return parts.join(' > ').slice(0, 300);
  }
  const label = (el) => {
    const txt = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${txt ? ` "${txt}"` : ''}`;
  };

  // ----- store -----
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(LOCAL) || '[]'); } catch { return []; } };
  async function list() {
    if (!shared) return readLocal().filter((c) => c.screen === screen());
    const r = await fetch(`${api}?select=*&project=eq.${encodeURIComponent(PROJECT)}&screen=eq.${encodeURIComponent(screen())}&order=created_at.asc`, { headers: auth });
    if (!r.ok) throw new Error(`Could not load comments (HTTP ${r.status})`);
    return r.json();
  }
  async function add(row) {
    const full = { ...row, id: crypto.randomUUID(), project: PROJECT, status: 'open' };
    if (!shared) { const all = readLocal(); const made = { ...full, created_at: new Date().toISOString() }; all.push(made); localStorage.setItem(LOCAL, JSON.stringify(all)); return made; }
    const r = await fetch(api, { method: 'POST', headers: { ...auth, 'content-type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(full) });
    if (!r.ok) throw new Error(`Could not post the comment (HTTP ${r.status})`);
    return (await r.json())[0];
  }

  // ----- UI (in a shadow root, so the app's CSS and ours never mix) -----
  const host = document.createElement('div');
  host.setAttribute('data-atomica-overlay', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    :host{all:initial}
    *{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .bar[hidden],.count[hidden]{display:none}.bar{position:fixed;inset-inline-end:16px;bottom:16px;z-index:2147483646;display:flex;gap:8px;align-items:center}
    .btn{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 14px;border-radius:999px;border:1px solid #c9cdd5;background:#fff;color:#14171c;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 4px 18px rgb(0 0 0/.18)}
    .btn.on{background:#14171c;color:#fff;border-color:#14171c}
    .btn:focus-visible,.pin:focus-visible,button:focus-visible,textarea:focus-visible,input:focus-visible{outline:3px solid #00a3e0;outline-offset:2px}
    .count{min-width:20px;height:20px;border-radius:999px;background:#db2777;color:#fff;font-size:11px;display:grid;place-items:center;padding:0 5px}
    .hint{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483646;background:#14171c;color:#fff;padding:8px 14px;border-radius:999px;font-size:13px}
    .hl{position:fixed;z-index:2147483645;pointer-events:none;border:2px solid #00a3e0;border-radius:4px;background:rgb(0 163 224/.08)}
    .pin{position:absolute;z-index:2147483645;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50% 50% 50% 0;background:#db2777;color:#fff;border:2px solid #fff;font-size:12px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgb(0 0 0/.3)}
    .pin.new{background:#00a3e0}
    .card{position:absolute;z-index:2147483647;width:300px;max-width:calc(100vw - 24px);background:#fff;color:#14171c;border:1px solid #c9cdd5;border-radius:12px;padding:12px;box-shadow:0 10px 30px rgb(0 0 0/.22);display:grid;gap:8px;font-size:14px}
    .card b{font-size:13px}.card .muted{color:#5b616e;font-size:12px}
    .card input,.card textarea{width:100%;border:1px solid #c9cdd5;border-radius:8px;padding:8px;font-size:14px;color:#14171c;background:#fff}
    .card textarea{min-height:80px;resize:vertical;unicode-bidi:plaintext}
    .row{display:flex;gap:8px;justify-content:flex-end}
    .row button{height:34px;padding:0 12px;border-radius:8px;border:1px solid #c9cdd5;background:#fff;color:#14171c;font-weight:600;cursor:pointer}
    .row .primary{background:#14171c;color:#fff;border-color:#14171c}
    .err{color:#b42318;font-size:12px}
    .body{white-space:pre-wrap;unicode-bidi:plaintext}
    .reply{border-inline-start:3px solid #00a3e0;padding-inline-start:8px}
    @media (prefers-reduced-motion:no-preference){.card{animation:in .12s ease-out}@keyframes in{from{opacity:0;transform:translateY(4px)}}}
  </style>
  <div class="bar" role="toolbar" aria-label="Review comments"><button class="btn" id="toggle" type="button" aria-pressed="false"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span id="tlabel">Comment</span><span class="count" id="count" hidden></span></button></div>
  <div id="layer"></div>`;
  const $ = (s) => root.querySelector(s);
  const layer = $('#layer');
  let on = false, comments = [], hl = null, hint = null, open = null;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // where a comment's pin goes: its element when it still exists, else its saved page position
  function spot(c) {
    let el = null;
    try { el = c.component && c.component.startsWith('css:') ? document.querySelector(c.component.slice(4).split(' | ')[0]) : null; } catch {}
    if (el) { const b = el.getBoundingClientRect(); return { x: b.left + scrollX + Math.min(b.width, 24), y: b.top + scrollY + 6 }; }
    return { x: c.x, y: c.y };
  }
  function drawPins() {
    layer.querySelectorAll('.pin:not(.new)').forEach((p) => p.remove());
    const openOnes = comments.filter((c) => c.status !== 'resolved');
    $('#count').hidden = !openOnes.length; $('#count').textContent = String(openOnes.length);
    if (!on) return;
    openOnes.forEach((c, i) => {
      const p = spot(c);
      const b = document.createElement('button');
      b.className = 'pin'; b.type = 'button'; b.textContent = String(i + 1);
      b.style.left = `${p.x}px`; b.style.top = `${p.y}px`;
      b.setAttribute('aria-label', `Comment ${i + 1} by ${c.author || 'Anonymous'}`);
      b.onclick = (e) => { e.stopPropagation(); showComment(c, p); };
      layer.append(b);
    });
  }
  function closeCard() { open?.remove(); open = null; layer.querySelector('.pin.new')?.remove(); }
  function place(card, p) {
    card.style.left = `${Math.max(scrollX + 12, Math.min(p.x + 18, scrollX + innerWidth - 312))}px`;
    card.style.top = `${Math.max(scrollY + 12, p.y - 10)}px`;
  }
  function showComment(c, p) {
    closeCard();
    const card = document.createElement('div');
    card.className = 'card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Comment');
    card.innerHTML = `<b>${esc(c.author || 'Anonymous')}</b><span class="muted">${esc(new Date(c.created_at).toLocaleString())}${c.component ? ` \u00b7 ${esc(String(c.component).split(' | ')[1] || '')}` : ''}</span><div class="body">${esc(c.body)}</div>${c.reply ? `<div class="reply"><span class="muted">Reply</span><div class="body">${esc(c.reply)}</div></div>` : ''}<div class="row"><button type="button" id="x">Close</button></div>`;
    place(card, p); layer.append(card); open = card;
    card.querySelector('#x').onclick = closeCard; card.querySelector('#x').focus();
  }
  function newComment(target, p) {
    closeCard();
    const pin = document.createElement('div'); pin.className = 'pin new'; pin.style.left = `${p.x}px`; pin.style.top = `${p.y}px`; pin.textContent = '+';
    layer.append(pin);
    const card = document.createElement('form');
    card.className = 'card'; card.setAttribute('aria-label', 'New comment');
    let name = ''; try { name = localStorage.getItem('atomica-reviewer') || ''; } catch {}
    card.innerHTML = `<b>Comment on ${esc(label(target))}</b><input id="n" maxlength="80" placeholder="Your name (optional)" aria-label="Your name (optional)" value="${esc(name)}"><textarea id="t" maxlength="2000" required placeholder="What should change? (Arabic or English)" aria-label="Comment"></textarea><span class="err" id="e" hidden></span><div class="row"><button type="button" id="c">Cancel</button><button class="primary" type="submit" id="s">Post</button></div><span class="muted">${shared ? 'Shared with everyone who opens this preview and the design team.' : 'Local test store: only this browser sees it until Supabase is set up.'}</span>`;
    place(card, p); layer.append(card); open = card;
    card.querySelector('#c').onclick = closeCard;
    card.onsubmit = async (e) => {
      e.preventDefault();
      const body = card.querySelector('#t').value.trim(); if (!body) return;
      const author = card.querySelector('#n').value.trim() || null;
      try { if (author) localStorage.setItem('atomica-reviewer', author); } catch {}
      card.querySelector('#s').disabled = true;
      try {
        const made = await add({ screen: screen(), figma_node: null, component: `css:${cssPath(target)} | ${label(target)}`.slice(0, 400), theme: theme(), lang: lang(), viewport: `${innerWidth < 700 ? 'phone' : 'desktop'} ${innerWidth}x${innerHeight}`, x: Math.round(p.x), y: Math.round(p.y), author, body });
        comments.push(made); closeCard(); drawPins(); tellParent();
      } catch (err) { const m = card.querySelector('#e'); m.hidden = false; m.textContent = err.message; card.querySelector('#s').disabled = false; }
    };
    setTimeout(() => card.querySelector('#t').focus(), 0);
  }

  // comment mode: hover outlines the element, a click on it drops a pin there (the app itself gets no click)
  const isOurs = (e) => e.composedPath().includes(host);
  function onMove(e) {
    if (isOurs(e)) { if (hl) hl.style.display = 'none'; return; }
    const b = e.target.getBoundingClientRect();
    if (!hl) { hl = document.createElement('div'); hl.className = 'hl'; layer.append(hl); }
    Object.assign(hl.style, { display: 'block', left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
  }
  function onClick(e) {
    if (isOurs(e)) return;
    e.preventDefault(); e.stopPropagation();
    newComment(e.target, { x: e.pageX, y: e.pageY });
  }
  function setOn(v) {
    on = v;
    $('#toggle').classList.toggle('on', on); $('#toggle').setAttribute('aria-pressed', String(on));
    $('#tlabel').textContent = on ? 'Done' : 'Comment';
    for (const [t, f] of [['mousemove', onMove], ['click', onClick]]) document[on ? 'addEventListener' : 'removeEventListener'](t, f, true);
    if (on) { hint = document.createElement('div'); hint.className = 'hint'; if (window.parent !== window) hint.style.top = '64px'; hint.textContent = 'Click any element to comment on it. Esc to stop.'; layer.append(hint); setTimeout(() => hint?.remove(), 3500); }
    else { hl?.remove(); hl = null; hint?.remove(); closeCard(); }
    drawPins();
  }
  $('#toggle').onclick = () => setOn(!on);
  // Inside the dashboard's Design page the page's own Comment button drives this (its toolbar would hide ours).
  const embedded = window.parent !== window;
  if (embedded) $('.bar').hidden = true;
  addEventListener('message', (e) => {
    if (e.source !== window.parent || !e.data || e.data.type !== 'atomica:tool') return;
    if ((e.data.tool === 'comment') !== on) setOn(e.data.tool === 'comment');
  });
  const tellParent = () => { if (embedded) window.parent.postMessage({ type: 'atomica:overlay', screen: screen(), open: comments.filter((c) => c.status !== 'resolved').length }, '*'); };
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && on) { if (open) closeCard(); else setOn(false); } });

  async function refresh() { try { comments = await list(); } catch (e) { comments = []; console.warn('[atomica comments]', e.message); } drawPins(); tellParent(); }
  // single-page apps change the route without a reload
  let last = location.href;
  setInterval(() => { if (location.href !== last) { last = location.href; closeCard(); refresh(); } }, 500);
  addEventListener('resize', () => drawPins());
  const mount = () => { document.body.append(host); refresh(); };
  if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);
})();

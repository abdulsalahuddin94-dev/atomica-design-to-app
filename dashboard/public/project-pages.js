// Project pages: Pipeline, Plan, Design, Review, Sync, Connect services (#/project/<folder>/<page>), and the
// collapsible side menu. Uses app.js helpers ($, el, api, icon, start, showError, PROMPTS), so it loads before
// app.js and only runs once app.js has defined them.
"use strict";

const PROJECT_PAGES = [
  ["pipeline", "Pipeline", "i-pipe"],
  ["plan", "Plan", "i-docs"],
  ["design", "Design", "i-phone"],
  ["review", "Review", "i-message"],
  ["sync", "Sync", "i-refresh"],
  ["storybook", "Storybook", "i-book"],
  ["github", "GitHub", "i-branch"],
  ["connect", "Connect services", "i-plug"],
];

// ---------- side menu: collapse to an icon rail ----------
function initRail() {
  const btn = document.getElementById("collapse");
  if (!btn) return;
  const set = (on) => {
    document.body.classList.toggle("rail", on);
    btn.setAttribute("aria-label", on ? "Expand the menu" : "Collapse the menu");
    btn.title = btn.getAttribute("aria-label");
    try { localStorage.setItem("menuRail", on ? "1" : "0"); } catch {}
  };
  let saved = null;
  try { saved = localStorage.getItem("menuRail"); } catch {}
  set(saved === "1");
  btn.addEventListener("click", () => set(!document.body.classList.contains("rail")));
  // tooltips for the rail: the label of each menu link
  for (const a of document.querySelectorAll(".side-nav a")) if (!a.dataset.tip) a.dataset.tip = a.textContent.trim();
}

// The project's pages in the side menu, under its name (only while a project page is open).
function drawProjectNav(name, title, page, counts = {}) {
  const box = document.getElementById("project-nav");
  if (!box) return;
  box.hidden = false;
  box.replaceChildren(
    el("h2", { class: "side-title" }, title),
    el("nav", { class: "side-nav project-nav", "aria-label": title },
      PROJECT_PAGES.map(([key, label, ic]) => el("a", { href: `#/project/${encodeURIComponent(name)}/${key}`, class: key === page ? "on" : null, "data-tip": label, "aria-current": key === page ? "page" : null },
        icon(ic), el("span", { class: "label" }, label),
        counts[key] ? el("span", { class: `count${key === "review" ? "" : " y"}` }, String(counts[key])) : null))));
}
function hideProjectNav() {
  const box = document.getElementById("project-nav");
  if (box) box.hidden = true;
}

const stateLabel = { done: "Done", wait: "Waiting on you", run: "Working…", prob: "Needs a look" };
const stateDot = { done: null, wait: "bad", run: "run", prob: "wait" };
const fmtDate = (s) => (s ? String(s).slice(0, 16).replace("T", " ") : "not recorded");

async function renderProjectPage(name, page) {
  const app = $("#app");
  const projectsList = await api("/api/projects").catch(() => ({ projects: [] }));
  const found = projectsList.projects.find((x) => x.name === name);
  const p = found && { ...found, title: String(found.title).replace(/_/g, " ") };
  if (!p) { app.replaceChildren(el("main", { class: "project" }, el("p", { class: "p-empty" }, "This project is not in My Projects."))); return; }
  let data = null;
  try { data = await api(`/api/project/${encodeURIComponent(name)}/overview`); } catch (e) { showError(e); }
  const o = data?.overview;
  drawProjectNav(name, p.title, page, o ? { review: o.comments.open, sync: o.pendingFigmaSync.length + (o.storybook.unsynced ? 1 : 0) } : {});
  const main = el("main", { class: "project" });
  app.replaceChildren(main);
  editorBanner(main, p); // who is editing, on every project page (shared projects only)
  if (page === "pipeline") return drawPipeline(main, p, o, data?.pipeline);
  if (page === "review") return drawReview(main, p, o);
  if (page === "sync") return drawSync(main, p);
  if (page === "design") return drawDesign(main, p);
  if (page === "connect") return drawConnect(main, p);
  if (page === "plan") return drawPlan(main, p);
  if (page === "storybook") return drawStorybook(main, p);
  if (page === "github") return drawGithub(main, p);
  main.append(el("p", { class: "p-empty" }, "Unknown page."));
}

function head(p, title, sub, right = []) {
  return el("div", {},
    el("div", { class: "crumbs" }, el("a", { href: "#/projects" }, "Projects"), ` / ${p.title}`),
    el("header", { class: "p-head" },
      el("div", {}, el("h1", {}, title), el("p", { class: "sub" }, sub)),
      el("div", { class: "right" }, right)));
}

function drawPipeline(main, p, o, pl) {
  const chat = el("button", { class: "ghost sm", type: "button", onclick: () => start({ prompt: PROMPTS.project(p.name), project: p.name, title: p.title }).catch(showError) }, icon("i-message"), "Continue in chat");
  const live = o?.publish?.url ? el("a", { class: "ghost sm", href: o.publish.url, target: "_blank", rel: "noopener" }, icon("i-external"), "Open live prototype") : null;
  main.append(head(p, "Pipeline", "Where the project is, and the one thing to do next.", [live, chat]));
  if (!o || !pl) { main.append(el("p", { class: "p-empty" }, "Could not read this project's files.")); return; }
  main.append(el("div", { class: "pipe" }, pl.steps.map((s, i) => el("div", { class: `step ${s.state}`, "data-step": s.key },
    el("span", { class: "n" }, String(i + 1).padStart(2, "0")), el("h3", {}, s.title),
    el("span", { class: "st" }, s.state === "done" ? icon("i-check", "ic") : el("span", { class: `dot ${stateDot[s.state]}` }), stateLabel[s.state]),
    el("p", {}, s.text)))));
  const ok = pl.next.go === "design" && pl.next.title.startsWith("Everything");
  main.append(el("div", { class: `next-step${ok ? " ok" : ""}` },
    el("div", { class: "t" }, el("span", { class: "kicker" }, "Next step"), el("b", {}, pl.next.title), el("span", { class: "muted small" }, pl.next.text)),
    el("button", { class: "primary", type: "button", onclick: () => { location.hash = `#/project/${encodeURIComponent(p.name)}/${pl.next.go}`; } }, pl.next.label, icon("i-right"))));
  main.append(el("dl", { class: "p-tally" },
    el("div", {}, el("dt", {}, "Fidelity"), el("dd", {}, o.fidelity != null ? `${o.fidelity}%` : "–")),
    el("div", { class: "mag" }, el("dt", {}, "Open comments"), el("dd", {}, String(o.comments.open))),
    el("div", { class: "warn" }, el("dt", {}, "Pending Figma sync"), el("dd", {}, String(o.pendingFigmaSync.length))),
    el("div", { class: "live" }, el("dt", {}, "Code check"), el("dd", {}, o.code ? `${o.code.unknown}/${o.code.raw}` : "–"))));
  const kv = [
    ["Live link", o.publish?.url ? el("a", { href: o.publish.url, target: "_blank", rel: "noopener", class: "mono" }, o.publish.url.replace(/^https?:\/\//, "")) : "not published"],
    ["Last publish", fmtDate(o.publish?.at)],
    ["Local preview", el("span", {}, el("span", { class: `dot ${o.local.running ? "good" : "wait"}` }), o.local.running ? ` running · ${o.local.url}` : " not running", o.unpublished ? el("span", { class: "unpub", style: "margin-left:6px" }, "unpublished changes") : null)],
    ["Screens", o.screens ? `${o.screens.count} from "${o.screens.file}"` : "none yet"],
    ["Code ahead of Figma", o.build.codeAhead.length ? o.build.codeAhead.join(", ") : "none"],
  ];
  main.append(el("div", { class: "grid2" },
    el("section", { class: "p-panel" }, el("h2", { class: "section-title" }, "Project status"),
      el("dl", { class: "p-kv" }, kv.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
      el("div", { class: "p-actions" },
        el("button", { class: "primary sm", type: "button", onclick: () => { location.hash = `#/project/${encodeURIComponent(p.name)}/design`; } }, "Open Design"),
        el("button", { class: "ghost sm", type: "button", onclick: () => { location.hash = `#/project/${encodeURIComponent(p.name)}/review`; } }, "Review"),
        el("button", { class: "ghost sm", type: "button", onclick: () => { location.hash = `#/project/${encodeURIComponent(p.name)}/sync`; } }, "Sync"))),
    el("section", { class: "p-panel" }, el("h2", { class: "section-title" }, "Activity"),
      el("div", { class: "p-feed" }, o.activity.length ? o.activity.map((a) => el("div", {}, el("time", {}, a.date), el("span", {}, a.title))) : el("p", { class: "muted" }, "No changelog entries yet.")))));
}

// ---------- Review: comments from the live prototype ----------
// Pull from Supabase, triage with Claude, decide here, reply and close. Changes are applied online in the
// prototype first (overrides); Figma sync is asked at the end, on the Sync page.
const REVIEW_PROMPTS = {
  triage: (p) => `Triage the open prototype comments of "${p}" (My Projects/${p}/prototype/comments/inbox.json). For each open comment write an entry in prototype/comments/triage.json: {"<id>": {"kind": "fix" | "flow" | "decision" | "info", "proposal": "<what to change, DS components and tokens only>", "affects": ["<screen slugs>"], "status": "proposed"}}. Use "flow" when a comment asks for a new flow or new screens: its proposal is a short flow map, and applying it starts with a screen spec and a mini checkpoint, never a direct build. Keep existing decisions. Do not change the prototype or Figma yet.`,
  apply: (p, c) => `Apply this approved prototype comment of "${p}" online in the prototype first (prototype/data/overrides.json, DS components and tokens only, then rebuild and check), and add it to status.json > prototype.pending_figma_sync. Do not touch Figma. Comment ${c.id} on ${c.screen}${c.component ? ` (${c.component})` : ""} by ${c.author || "Anonymous"}: "${c.body}"${c.triage?.proposal ? `. Proposal: ${c.triage.proposal}` : ""}. When done, tell me the reply to close it with.`,
  ask: (p, c) => `Help me decide on this prototype comment of "${p}" before anything changes. Comment ${c.id} on ${c.screen}${c.component ? ` (${c.component})` : ""} by ${c.author || "Anonymous"}: "${c.body}"${c.triage?.proposal ? `. Current proposal: ${c.triage.proposal}` : ""}. Give me the options with a recommendation.`,
};
const kindLabel = { fix: "Fix", flow: "New flow", decision: "Decision", info: "Info" };
const decisionLabel = { proposed: "Proposed", approved: "Approved", rejected: "Rejected", asked: "Asked in chat", queued: "Queued", "in-progress": "In progress", applied: "Applied", "needs-ok": "Plan ready: answer in chat" };

async function drawReview(main, p, o) {
  const enc = encodeURIComponent(p.name);
  let filter = "open";
  let data = await api(`/api/project/${enc}/comments`).catch((e) => { showError(e); return { comments: [] }; });
  const notice = el("div", { class: "p-notice", role: "status", hidden: true });
  const showSchemaNotice = () => {
    notice.hidden = false;
    notice.replaceChildren(icon("i-alert"), el("span", {}, el("b", {}, "Supabase schema update needed: "), "replies and images need the current schema. "),
      el("a", { href: `#/project/${enc}/connect` }, "Open Connect services"));
  };
  const pull = el("button", { class: "ghost sm", type: "button" }, icon("i-download"), "Pull comments");
  pull.onclick = async () => {
    pull.disabled = true;
    try { data = await api(`/api/project/${enc}/comments/pull`, {}); toast(data.message || "Pulled."); draw(); }
    catch (e) { showError(e); }
    finally { pull.disabled = false; }
  };
  const triage = el("button", { class: "primary sm", type: "button", onclick: () => start({ prompt: REVIEW_PROMPTS.triage(p.name), project: p.name, title: `Triage comments: ${p.title}` }).catch(showError) }, icon("i-sparkles"), "Triage open comments");
  main.append(head(p, "Review", "Comments from the live prototype: decide, apply online, reply and close.", [pull, triage]), notice);
  const tabs = el("div", { class: "p-seg", role: "tablist", "aria-label": "Filter comments" });
  const pulled = el("span", { class: "muted small" });
  const list = el("div", { class: "rv-list" });
  main.append(el("div", { class: "rv-bar" }, tabs, pulled), list);

  // Where "Show on screen" opens: the local preview when it runs, else the live link.
  const base = o?.local?.running ? o.local.url : o?.publish?.url;
  const screenLink = (c) => base && c.screen ? `${base.replace(/\/?$/, "/")}#/${c.screen}?${new URLSearchParams({ mode: c.theme || "Dark", lang: c.lang || "en", comment: c.id })}` : null;

  async function closeWith(c, decision) {
    const reply = await askText({ title: "Reply & close", help: `The reply shows under ${c.author || "this"} comment in the prototype.`, okLabel: "Reply & close", placeholder: decision === "rejected" ? "Why it stays as it is…" : "What changed…" });
    if (!reply) return;
    try { data = await api(`/api/project/${enc}/comments/resolve`, { id: c.id, reply, decision }); notice.hidden = true; toast("Comment closed."); draw(); }
    catch (e) { if (/schema update needed/i.test(e.message)) showSchemaNotice(); else showError(e); }
  }
  async function setDecision(c, decision) {
    try { const r = await api(`/api/project/${enc}/comments/decide`, { id: c.id, decision }); c.triage = { ...(c.triage || {}), ...r.triage }; draw(); }
    catch (e) { showError(e); }
  }

  function card(c) {
    const t = c.triage;
    const open = c.status !== "resolved";
    const link = screenLink(c);
    const chat = (kind) => start({ prompt: REVIEW_PROMPTS[kind](p.name, c), project: p.name, title: `${kind === "apply" ? "Apply" : "Ask"}: ${c.screen}` }).catch(showError);
    const img = (f) => `/api/project/${enc}/comment-image?f=${encodeURIComponent(f)}`;
    return el("article", { class: `rv-card${open ? "" : " done"}`, "data-id": c.id },
      el("header", {},
        el("span", { class: "avatar", "aria-hidden": "true" }, (c.author || "?").trim().charAt(0).toUpperCase()),
        el("div", { class: "who" }, el("b", {}, c.author || "Anonymous"), el("span", { class: "muted small" }, `${fmtDate(c.created_at)} · ${c.theme || "-"} / ${(c.lang || "-").toUpperCase()} · ${c.viewport || "-"}`)),
        t?.kind ? el("span", { class: `tag k-${t.kind}` }, kindLabel[t.kind] || t.kind) : null,
        el("span", { class: `tag ${open ? "open" : "res"}` }, open ? (t?.status && t.status !== "proposed" ? decisionLabel[t.status] : "Open") : "Resolved")),
      el("div", { class: "where mono" }, c.screen || "-", c.component ? ` › ${c.component}` : "", c.figma_node ? ` · ${c.figma_node}` : ""),
      el("p", { class: "body", dir: "auto" }, c.body),
      c.localImages?.length ? el("div", { class: "thumbs" }, c.localImages.map((f, i) => el("a", { href: img(f), target: "_blank", rel: "noopener" },
        el("img", { src: img(f), alt: `Reference image ${i + 1}`, loading: "lazy" })))) : null,
      t?.proposal ? el("div", { class: "triage" }, el("span", { class: "kicker" }, "Proposal"), el("p", {}, t.proposal),
        t.affects?.length ? el("span", { class: "muted small" }, `Affects: ${t.affects.join(", ")}`) : null) : null,
      c.reply ? el("div", { class: "reply" }, el("span", { class: "kicker" }, "Reply"), el("p", { dir: "auto" }, c.reply)) : null,
      el("div", { class: "p-actions" },
        open ? [
          // Apply opens the Design workspace on this comment: its screen, its pin, and the request waiting in the chat box.
          el("button", { class: "primary sm", type: "button", onclick: async () => { await setDecision(c, "approved"); location.hash = `#/project/${enc}/design?comment=${c.id}&apply=1`; } }, icon("i-check"), "Apply online"),
          el("button", { class: "ghost sm", type: "button", onclick: () => setDecision(c, "rejected") }, icon("i-x"), "Reject"),
          el("button", { class: "ghost sm", type: "button", onclick: async () => { await setDecision(c, "asked"); chat("ask"); } }, icon("i-message"), "Ask"),
          el("button", { class: "ghost sm", type: "button", onclick: () => closeWith(c, t?.status && t.status !== "proposed" ? t.status : null) }, icon("i-send"), "Reply & close"),
        ] : null,
        el("a", { class: "ghost sm", href: `#/project/${enc}/design?comment=${c.id}` }, icon("i-phone"), "Show on screen"),
        link ? el("a", { class: "ghost sm", href: link, target: "_blank", rel: "noopener", title: "Open in the prototype (new tab)" }, icon("i-external")) : null));
  }

  function draw() {
    const all = data.comments || [];
    const openN = all.filter((c) => c.status !== "resolved").length;
    tabs.replaceChildren(...[["open", `Open ${openN}`], ["resolved", `Resolved ${all.length - openN}`], ["all", `All ${all.length}`]].map(([k, label]) =>
      el("button", { type: "button", role: "tab", class: k === filter ? "on" : null, "aria-selected": String(k === filter), onclick: () => { filter = k; draw(); } }, label)));
    pulled.textContent = data.pulledAt ? `Pulled ${fmtDate(data.pulledAt)}` : "Not pulled yet";
    const shown = all.filter((c) => filter === "all" || (filter === "open") === (c.status !== "resolved")).reverse();
    list.replaceChildren(...(shown.length ? shown.map(card)
      : [el("p", { class: "p-empty" }, all.length ? (filter === "open" ? "No open comments. Everything is answered." : "Nothing here.") : "No comments yet. Pull comments to fetch them from the live prototype.")]));
  }
  draw();
}

// ---------- Sync: prototype <-> Figma <-> Storybook ----------
// Push / Pull only queue a request (data/sync-queue.json); "Run the queue in chat" hands the queued requests to
// Claude, who does the Figma and Storybook work with the workflow's rules and asks before each write.
const SYNC_PROMPT = (p, queue) => `Work through the queued sync requests of "${p}" (My Projects/${p}/data/sync-queue.json), one at a time, with the workflow's rules: open the right Figma file with the saved tool, ask me before each Figma write, audit after each change, then re-export so the prototype override reports "synced", update status.json > prototype.pending_figma_sync, the CHANGELOG and the Storybook as needed, and mark each request done in the queue. Requests:\n${queue.map((q, i) => `${i + 1}. [${q.kind}] ${q.title || q.ref}`).join("\n")}`;

async function drawSync(main, p) {
  const enc = encodeURIComponent(p.name);
  const pill = el("span", { class: "p-pill", role: "status" });
  const runBtn = el("button", { class: "primary sm", type: "button" }, icon("i-message"), "Run the queue in chat");
  main.append(head(p, "Sync", "What differs between the prototype, Figma and Storybook. Nothing moves without your click.", [pill, runBtn]));
  const body = el("div", {}, el("p", { class: "p-empty" }, "Reading the project and Figma's version history…"));
  main.append(body);
  let s;
  const load = async () => { s = await api(`/api/project/${enc}/sync`); draw(); };
  const act = async (url, item) => {
    try { s = await api(`/api/project/${enc}/${url}`, { ref: item.ref, title: item.title }); draw(); }
    catch (e) { showError(e); }
  };
  runBtn.onclick = () => s?.queue.length && start({ prompt: SYNC_PROMPT(p.name, s.queue), project: p.name, title: `Sync: ${p.title}` }).catch(showError);

  const row = (item, verb) => el("div", { class: `srow${item.queued ? " queued" : ""}`, "data-ref": item.ref },
    el("div", {}, el("b", {}, item.title),
      el("div", { class: "cmeta" }, (item.meta || [item.screen, item.comment ? "from a review comment" : null, item.approved ? `approved: ${item.approved}` : null, item.file ? `Figma: ${item.file}` : null]).filter(Boolean).map((t) => el("span", {}, t)))),
    item.queued
      ? el("div", { class: "p-actions" }, el("span", { class: "tag k-decision" }, "Queued"), el("button", { class: "ghost sm", type: "button", onclick: () => act("sync/unqueue", item) }, icon("i-undo"), "Undo"))
      : el("button", { class: "ghost sm", type: "button", onclick: () => act("sync/queue", item) }, verb));

  const side = (title, items, verb, allVerb, empty) => el("section", { class: "sheet sync-side" },
    el("div", { class: "shead" }, el("h3", {}, title),
      items.some((x) => !x.queued) ? el("button", { class: "ghost sm", type: "button", onclick: async () => { for (const x of items.filter((y) => !y.queued)) await act("sync/queue", x); } }, allVerb) : null),
    items.length ? items.map((x) => row(x, verb)) : el("p", { class: "muted srow-empty" }, empty));

  function draw() {
    pill.replaceChildren(el("span", { class: `dot ${s.figma.figcli ? "good" : "wait"}` }),
      s.figma.figcli ? ` FigCli connected${s.figma.designFiles[0] ? ` · ${s.figma.designFiles[0]}` : ""}` : " Figma not connected (FigCli port closed)");
    runBtn.disabled = !s.queue.length;
    runBtn.title = s.queue.length ? `${s.queue.length} queued request${s.queue.length > 1 ? "s" : ""}` : "Queue a push or pull first";
    body.replaceChildren(...[
      el("div", { class: "sync" },
        side("In the prototype, not in Figma", s.push, "Push to Figma", "Push all to Figma", "Nothing pending: every prototype change is in Figma."),
        side("In Figma, not in Storybook", s.pull, "Pull from Figma", "Pull all",
          s.figma.versionsError === "no-token" ? "No Figma token on this computer, so Figma's version history was not read. CHANGELOG shows nothing pending." : "Nothing pending: Storybook matches the DS file.")),
      s.queue.length ? el("p", { class: "note" }, `${s.queue.length} request${s.queue.length > 1 ? "s" : ""} queued. Nothing has changed in Figma or Storybook yet: run the queue in chat when you are ready.`) : null,
      s.rules.length ? el("section", { class: "p-panel", style: "margin-top:16px" }, el("h2", { class: "section-title" }, "Prototype rules (no Figma change)"),
        s.rules.map((r) => el("p", { class: "small" }, r.rule))) : null,
      el("p", { class: "note" }, "After a push: Figma audit, re-export, the override reports \"synced\" and the screen's source goes back to Figma.")].filter(Boolean));
  }
  await load().catch((e) => { body.replaceChildren(el("p", { class: "p-empty" }, "Could not read the sync state.")); showError(e); });
}

// ---------- Design: Lovable-like workspace ----------
// Left: this project's design conversation (the same chat as everywhere, mounted in a panel). Right: the prototype,
// local (Vite on this computer) or live (the published link). Publish runs tools/publish_prototype.cjs; Push to Figma
// only queues a request for the Sync page. Code first / Figma first is asked once per project. Figma first shows the
// chat only, no preview (Abdul, 2026-11-04): the dashboard often takes a third of the screen beside Figma.
const MODE_TEXT = {
  "code-first": ["Code first", "New screens and changes are built in the prototype first; Figma follows when you sync. This page shows the chat and a live preview."],
  "figma-first": ["Figma first", "Changes are designed in the Figma Design file first, then the prototype is rebuilt from it. This page shows the chat only: you see the design in Figma, so the dashboard can take a third of the screen beside it."],
};
// Sent to Claude with the first message but not shown in the conversation (only the typed request is).
const DESIGN_CONTEXT = (p, mode, screen, where) => `Design workspace for "${p}" (My Projects/${p}), ${MODE_TEXT[mode][0].toLowerCase()}. ${mode === "code-first"
  ? "Build each change in the prototype first (prototype/data/overrides.json, or a code-first screen), rebuild and check it, and add it to status.json > prototype.pending_figma_sync. Do not touch Figma."
  : "Design each change in the Figma Design file first with the saved tool (ask me before each write), audit it, then re-export and rebuild the prototype."} Rules: only the project's design-system components and tokens (its Storybook React components and data/tokens.json), never raw values; a missing component or size is a DS gap: tell me and give me the options, never invent one. ${mode === "code-first" ? `The preview shows "${screen}" (${where}).` : "The dashboard shows no preview here (I look at Figma)."} My request follows.`;
const designKey = (name) => `designChat:${name}`;
const readStore = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const writeStore = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

async function drawDesign(main, p) {
  const enc = encodeURIComponent(p.name);
  main.classList.add("design-ws");
  let st = await api(`/api/project/${enc}/design`).catch((e) => { showError(e); return null; });
  if (!st) { main.append(el("p", { class: "p-empty" }, "Could not read this project's prototype.")); return; }
  // device: the frame (a phone for mobile screens, a browser window for web ones); the prototype fits it to the canvas
  const view = { where: st.local.running ? "local" : "live", device: (st.screens[0]?.w || 375) >= 600 ? "desktop" : "phone", screen: st.screens[0]?.slug || "", mode: "Dark" };
  try { Object.assign(view, JSON.parse(localStorage.getItem(`designView:${p.name}`) || "{}")); } catch {}
  if (!st.screens.some((s) => s.slug === view.screen)) view.screen = st.screens[0]?.slug || "";
  // the frame follows the screen (phone for mobile, browser window for web); the toolbar toggle overrides it for now
  const autoDevice = () => ((st.screens.find((s) => s.slug === view.screen)?.w || 375) >= 600 ? "desktop" : "phone");
  view.device = autoDevice();
  const saveView = () => { try { localStorage.setItem(`designView:${p.name}`, JSON.stringify(view)); } catch {} };

  // ----- left: chat -----
  const modeSeg = el("div", { class: "p-seg", role: "radiogroup", "aria-label": "How changes start" });
  const chatBody = el("div", { class: "ws-chat" });
  const chatCol = el("section", { class: "ws-col", "aria-label": "Design conversation" },
    el("div", { class: "ws-head" },
      el("div", { class: "crumbs" }, el("a", { href: "#/projects" }, "Projects"), ` / ${p.title}`),
      el("div", { class: "row" }, el("h1", {}, "Design"), modeSeg),
      el("p", { class: "muted small" }, "Only design-system components and tokens. A missing component becomes a DS gap first.")),
    chatBody);

  const setMode = async (mode) => {
    try { st = await api(`/api/project/${enc}/design/mode`, { mode }); drawMode(); drawBar(); loadFrame(); if (!sessionId()) drawStarter(); if (pendingApply) { const c = pendingApply; pendingApply = null; applyNow(c); } }
    catch (e) { showError(e); }
  };
  // The preview is shown only for Code first; Figma first (and before the mode is picked) is chat only. The stage stays
  // built but hidden and empty, so picking Code first shows it at once.
  const chatOnly = () => st.designMode !== "code-first";
  function drawMode() {
    main.classList.toggle("chat-only", chatOnly());
    modeSeg.replaceChildren(...Object.entries(MODE_TEXT).map(([k, [label, d]]) => el("button", { type: "button", role: "radio", class: st.designMode === k ? "on" : null, "aria-checked": String(st.designMode === k), title: d, onclick: () => setMode(k) }, label)));
  }
  const sessionId = () => readStore(designKey(p.name))?.id || null;
  // A request waiting for the chat box (Apply online / Ask on a comment): filled in, never sent; the user presses Send.
  let pendingPrefill = null;
  let pendingApply = null; // an Apply pressed before Code first / Figma first was picked
  let applyOnLoad = null; // Apply online pressed on the Review page
  function prefill(text) {
    const ta = chatBody.querySelector("#input") || chatBody.querySelector(".ws-start textarea");
    if (!ta) { pendingPrefill = text; return; }
    pendingPrefill = null;
    ta.value = text; ta.dispatchEvent(new Event("input", { bubbles: true })); ta.focus();
  }
  const screenName = () => st.screens.find((s) => s.slug === view.screen)?.name || view.screen || "no screen";

  // No conversation yet: ask Code first / Figma first (once per project), then a composer that starts one.
  function drawStarter() {
    if (!st.designMode) {
      chatBody.replaceChildren(el("div", { class: "ws-ask sheet" },
        el("span", { class: "kicker" }, "Before the first change"),
        el("h4", {}, "How should new screens and changes start in this project?"),
        el("div", { class: "opts-list" }, Object.entries(MODE_TEXT).map(([k, [label, d]]) =>
          el("button", { type: "button", class: "opt-btn", onclick: () => setMode(k) }, el("span", { class: "l" }, label), el("span", { class: "d" }, d)))),
        el("p", { class: "muted small" }, "You can switch it any time at the top of this panel; the layout follows (Figma first: chat only, Code first: chat and preview).")));
      return;
    }
    const images = [];
    const thumbs = el("div", { class: "attachments" });
    const drawThumbs = () => thumbs.replaceChildren(...images.map((src, i) => el("figure", {}, el("img", { src, alt: "Image to send" }),
      el("button", { type: "button", "aria-label": "Remove", onclick: () => { images.splice(i, 1); drawThumbs(); } }, icon("i-x")))));
    const addFiles = (files) => { for (const f of files) { if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) continue; const r = new FileReader(); r.onload = () => { images.push(r.result); drawThumbs(); }; r.readAsDataURL(f); } };
    const ta = el("textarea", { rows: "3", dir: "auto", "aria-label": "Describe a screen, a flow or a change", placeholder: "Describe a screen, a flow or a change… (Arabic or English). Ctrl+V pastes a screenshot." });
    const file = el("input", { type: "file", accept: "image/png,image/jpeg,image/gif,image/webp", multiple: true, hidden: true, onchange: (ev) => { addFiles(ev.target.files); ev.target.value = ""; } });
    const go = el("button", { class: "primary sm", type: "submit" }, icon("i-send"), "Build");
    ta.addEventListener("paste", (ev) => { const f = [...(ev.clipboardData?.files || [])]; if (f.length) { ev.preventDefault(); addFiles(f); } });
    ta.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); form.requestSubmit(); } });
    const form = el("form", { class: "ws-start", onsubmit: async (ev) => {
      ev.preventDefault();
      const text = ta.value.trim();
      if (!text && !images.length) return;
      go.disabled = true;
      try {
        const s = await api("/api/sessions", { prompt: text || "See the attached image.", context: DESIGN_CONTEXT(p.name, st.designMode, screenName(), view.where === "local" ? "local preview" : "live link"), images, project: p.name, title: `Design: ${p.title}` });
        writeStore(designKey(p.name), { id: s.id, claudeSessionId: s.claudeSessionId || null });
        mountChat(s.id);
      } catch (e) { showError(e); go.disabled = false; }
    } },
      thumbs, ta,
      el("div", { class: "row" },
        el("label", { class: "addimg", title: "Add an image (or paste one with Ctrl+V)" }, file, icon("i-plus"), el("span", { class: "sr" }, "Add an image")),
        el("span", { class: "muted small" }, "Ctrl+V to paste a screenshot"), el("span", { style: "flex:1" }), go));
    form.addEventListener("dragover", (ev) => ev.preventDefault());
    form.addEventListener("drop", (ev) => { ev.preventDefault(); addFiles(ev.dataTransfer.files); });
    queueMicrotask(() => { if (pendingPrefill) prefill(pendingPrefill); });
    chatBody.replaceChildren(el("div", { class: "ws-empty" },
      el("p", {}, el("b", {}, MODE_TEXT[st.designMode][0]), `: ${MODE_TEXT[st.designMode][1]}`),
      chatOnly() ? null : el("p", { class: "muted small" }, `Claude sees which screen the preview shows ("${screenName()}").`)), form);
    ta.focus();
  }
  function mountChat(id) {
    chatBody.replaceChildren();
    renderChat(id, chatBody);
    // Lovable-like composer for the narrow panel: the text box on top, then one row with attach, tool and model, and
    // a single Send / Stop button; the status sits on its own line above the composer. Same elements, only moved.
    const form = chatBody.querySelector("#composer");
    const row = form.querySelector(".composer-row");
    row.append(el("div", { class: "ws-cbar" }, row.querySelector(".attach"), form.querySelector("#agent-wrap"), form.querySelector("#model-wrap"), el("span", { class: "sp" }), row.querySelector("#stop"), row.querySelector("#send")));
    const status = form.querySelector("#status-line");
    status.classList.add("ws-status");
    form.before(status);
    form.querySelector(".composer-foot")?.remove();
    if (pendingPrefill) prefill(pendingPrefill);
    chatBody.append(el("div", { class: "ws-chat-foot" }, el("button", { type: "button", class: "textbtn", onclick: () => {
      try { localStorage.removeItem(designKey(p.name)); } catch {}
      if (current?.es) { current.es.close(); current.cleanup?.(); current = null; }
      drawStarter();
    } }, icon("i-plus"), "New design conversation")));
  }
  // The dashboard restarted mid-conversation: the chat found (or continued) it under a new id; mount that one here.
  const onReconnect = (ev) => {
    if (!chatBody.isConnected) { window.removeEventListener("chat-reconnect", onReconnect); return; }
    if (ev.detail.from !== sessionId()) return;
    ev.preventDefault();
    writeStore(designKey(p.name), { id: ev.detail.to, claudeSessionId: ev.detail.claudeSessionId });
    mountChat(ev.detail.to);
  };
  window.addEventListener("chat-reconnect", onReconnect);
  // Reuse this project's design conversation: still running, or continued from its Claude session after a restart.
  async function openChat() {
    const saved = readStore(designKey(p.name));
    if (!saved) return drawStarter();
    try {
      const { live, past } = await api("/api/sessions");
      let s = live.find((x) => x.id === saved.id) || (saved.claudeSessionId && live.find((x) => x.claudeSessionId === saved.claudeSessionId));
      if (!s && saved.claudeSessionId && past.some((x) => x.claudeSessionId === saved.claudeSessionId))
        s = await api("/api/sessions", { resume: saved.claudeSessionId, project: p.name, title: `Design: ${p.title}` });
      if (!s) { try { localStorage.removeItem(designKey(p.name)); } catch {} return drawStarter(); }
      writeStore(designKey(p.name), { id: s.id, claudeSessionId: s.claudeSessionId || saved.claudeSessionId || null });
      mountChat(s.id);
    } catch (e) { showError(e); drawStarter(); }
  }

  // ----- right: preview -----
  // Controls float at the bottom of the canvas (Lovable-like pill, collapsible to a round button); Publish sits at the
  // top right. Comments are reviewed on the design itself: the prototype (embed=1, tool=comment) draws the pins and
  // tells this page which pin was picked and where, and the comment opens here with its actions.
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  Object.assign(view, { tool: null, comment: null });
  let collapsed = false;
  try { collapsed = localStorage.getItem("designPill") === "closed"; } catch {}
  const frame = el("iframe", { title: "Prototype preview", class: "ws-frame" });
  const canvas = el("div", { class: "ws-canvas" });
  const badge = el("span", { class: "tag k-decision srcbadge", hidden: true });
  const pill = el("div", { class: "ws-pill", role: "toolbar", "aria-label": "Preview controls" });
  const openPill = el("button", { class: "ws-pill-open", type: "button", "aria-label": "Show the preview controls", title: "Show the preview controls", onclick: () => setCollapsed(false) }, icon("i-left"));
  const pubBox = el("div", { class: "ws-publish" });
  const list = el("aside", { class: "ws-clist", "aria-label": "Comments on this screen", hidden: true });
  const pop = el("div", { class: "ws-pop", role: "dialog", "aria-label": "Comment", hidden: true });
  const menu = el("div", { class: "ws-menu", role: "menu", hidden: true });
  const screensMenu = el("div", { class: "ws-menu ws-screens", hidden: true });
  const pubPop = el("div", { class: "ws-pubpop", role: "dialog", "aria-label": "Publish", hidden: true });
  const syncPop = el("div", { class: "ws-pubpop ws-syncpop", role: "dialog", "aria-label": "Sync with Figma", hidden: true });
  let syncSt = null; // tools/figma_sync.cjs state: pending (prototype -> Figma) and the last Figma check
  let pubCheck = null; // null | "running" | the preflight result (tools/publish_checks.cjs)
  async function runPublishCheck() {
    pubCheck = "running"; drawPubPop();
    try { pubCheck = await api(`/api/project/${enc}/publish-check`); } catch (e) { pubCheck = { ok: false, checks: [{ label: "Publish check", ok: false, reason: e.message, fix: "Try again." }] }; }
    drawPubPop();
  }
  // A new project: create its repo (public, GitHub Pages) only on this explicit click.
  function createRepoBlock(chk) {
    const input = el("input", { class: "mono", value: chk.repo, "aria-label": "New repo (owner/name)", spellcheck: "false" });
    return el("div", { class: "pub-url" }, el("span", { class: "kicker" }, "No repo yet"),
      el("p", { class: "small" }, "This prototype has no GitHub repo. Atomica can create a public one and publish to it:"),
      el("div", { class: "row" }, input,
        el("button", { class: "primary sm", type: "button", disabled: !chk.gh?.signedIn || null, title: chk.gh?.signedIn ? "" : "Sign in with GitHub first (Connect services)", onclick: () => doPublish(input.value.trim()) }, "Create the repo and publish")));
  }
  let publishError = null; // the last publish failure, shown in the panel until the next try
  let liveState = null; // null | "waiting" | "live": after a publish, until GitHub Pages serves the new build
  const stage = el("section", { class: "ws-stage", "aria-label": "Prototype preview" }, canvas, pubBox, pubPop, syncPop, list, pop, menu, screensMenu, pill, openPill);
  main.append(chatCol, stage);

  let comments = []; // from the dashboard (pulled from Supabase): author, body, images, triage
  let pins = []; // from the prototype: the open comments of this screen, numbered as their pins
  const setCollapsed = (on) => { collapsed = on; try { localStorage.setItem("designPill", on ? "closed" : "open"); } catch {} drawBar(); };
  const baseUrl = () => (view.where === "local" ? st.local.url : st.publish?.url) || null;
  // embed=1: the prototype hides its own screen list, banner, picker and toolbar (this page has them); a new tab shows
  // it whole. tool and comment drive its comment, code and inspect modes.
  const screenUrl = (embed = true) => {
    const b = baseUrl();
    if (!b || !view.screen) return b;
    const p = new URLSearchParams({ mode: view.mode, lang: "en" });
    if (embed) { p.set("embed", "1"); p.set("device", view.device); if (view.tool) p.set("tool", view.tool); if (view.tool === "comment" && view.comment) p.set("comment", view.comment); }
    return `${b.replace(/\/?$/, "/")}#/${view.screen}?${p}`;
  };
  function loadFrame(force) {
    if (chatOnly()) { canvas.replaceChildren(); frame.removeAttribute("src"); delete frame.dataset.src; return; }
    const url = screenUrl();
    const sc = st.screens.find((s) => s.slug === view.screen);
    badge.hidden = !(sc?.source === "code");
    badge.textContent = `${sc?.name || ""} · code ahead of Figma`;
    if (view.where === "local" && !st.local.running) {
      canvas.replaceChildren(el("div", { class: "p-empty ws-off" },
        el("p", {}, el("b", {}, "The local preview is not running.")),
        st.installed ? el("button", { class: "primary sm", type: "button", onclick: startLocal }, icon("i-zap"), "Start local preview")
          : el("p", { class: "muted small" }, "Its packages are not installed: ask in the chat to install them (npm install in the prototype folder)."),
        st.publish?.url ? el("button", { class: "ghost sm", type: "button", onclick: () => { view.where = "live"; saveView(); drawBar(); loadFrame(); } }, "Show the live link") : null));
      return;
    }
    if (!url) { canvas.replaceChildren(el("p", { class: "p-empty ws-off" }, "Not published yet. Publish once from the chat to get a live link.")); return; }
    // The frame is another origin, so a refresh reloads it with a cache-busting query; anything else only changes the hash.
    if (force) { const u = new URL(url); u.searchParams.set("r", Date.now()); frame.src = u.href; frame.dataset.src = url; }
    else if (frame.dataset.src !== url) { frame.dataset.src = url; frame.src = url; }
    if (!canvas.contains(frame)) canvas.replaceChildren(badge, el("div", { class: "ws-device" }, frame));
  }
  async function startLocal(ev) {
    const b = ev.currentTarget; b.disabled = true; b.lastChild.textContent = "Starting…";
    try { st = await api(`/api/project/${enc}/preview/start`, {}); drawBar(); loadFrame(); }
    catch (e) { showError(e); b.disabled = false; b.lastChild.textContent = "Start local preview"; }
  }

  const seg = (label, items, cur, pick, icons) => el("div", { class: `ws-seg${icons ? " icons" : ""}`, role: "radiogroup", "aria-label": label },
    items.map(([k, text, ic]) => el("button", { type: "button", role: "radio", class: cur === k ? "on" : null, "aria-checked": String(cur === k), "aria-label": text, title: text, onclick: () => pick(k) },
      ic ? icon(ic) : null, icons ? null : text)));
  const tool = (k, label, ic, count) => el("button", { type: "button", class: `ws-tool${view.tool === k ? " on" : ""}`, "aria-pressed": String(view.tool === k), title: label, "aria-label": label,
    onclick: () => setTool(view.tool === k ? null : k) }, icon(ic), count ? el("span", { class: "ws-count" }, String(count)) : null);
  const openOnScreen = () => comments.filter((c) => c.status !== "resolved" && c.screen === view.screen).length;
  // The screen picker: a list with search, grouped by module (a project can have 100+ screens).
  const goScreen = (slug) => { view.screen = slug; view.device = autoDevice(); view.comment = null; pop.hidden = true; screensMenu.hidden = true; saveView(); loadFrame(); drawBar(); };
  function openScreens(anchor) {
    if (!screensMenu.hidden) { screensMenu.hidden = true; return; }
    const b = anchor.getBoundingClientRect(), s2 = stage.getBoundingClientRect();
    screensMenu.style.left = `${Math.max(8, Math.min(b.left - s2.left, s2.width - 330))}px`;
    screensMenu.style.bottom = `${s2.bottom - b.top + 10}px`;
    const search = el("input", { type: "search", placeholder: `Search ${st.screens.length} screens…`, "aria-label": "Search screens" });
    const list = el("div", { class: "ws-slist", role: "listbox", "aria-label": "Screens" });
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const groups = {};
      for (const sc of st.screens) if (!q || sc.name.toLowerCase().includes(q) || (sc.group || "").toLowerCase().includes(q)) (groups[sc.group || "Other"] ||= []).push(sc);
      const many = Object.keys(groups).length > 1;
      list.replaceChildren(...(Object.keys(groups).length ? Object.entries(groups).flatMap(([g, items]) => [
        many ? el("div", { class: "ws-sgroup" }, g, el("span", {}, String(items.length))) : null,
        ...items.map((sc) => el("button", { type: "button", role: "option", class: sc.slug === view.screen ? "on" : null, "aria-selected": String(sc.slug === view.screen), onclick: () => goScreen(sc.slug) },
          sc.name, sc.source === "code" ? el("span", { class: "ws-scode" }, "code") : null)),
      ].filter(Boolean)) : [el("p", { class: "ws-snone" }, "No screen matches.")]));
    };
    search.addEventListener("input", draw);
    search.addEventListener("keydown", (e) => { if (e.key === "Enter") { const first = list.querySelector("button"); if (first) first.click(); } if (e.key === "Escape") screensMenu.hidden = true; });
    draw();
    screensMenu.replaceChildren(search, list);
    screensMenu.hidden = false;
    search.focus();
  }
  function drawBar() {
    const curScreen = st.screens.find((s) => s.slug === view.screen);
    const screenPick = el("button", { class: "ws-screenbtn", type: "button", "aria-haspopup": "listbox", "aria-label": "Screen", title: curScreen?.group ? `${curScreen.group} · ${curScreen.name}` : curScreen?.name, onclick: (ev) => openScreens(ev.currentTarget) },
      el("span", {}, curScreen?.name || "Screen"), icon("i-down"));
    // "…": a menu above the pill (outside it, so the pill's scrolling never clips it)
    menu.replaceChildren(
      el("button", { type: "button", onclick: () => { menu.hidden = true; pushToFigma(); } }, icon("i-upload"), "Add this screen to Figma sync"),
      el("a", { href: screenUrl(false) || "#", target: "_blank", rel: "noopener", onclick: () => { menu.hidden = true; } }, icon("i-external"), "Open in a new tab"),
      el("a", { href: `#/project/${enc}/review` }, icon("i-message"), "All comments (Review)"));
    const more = el("button", { class: "ws-tool", type: "button", "aria-label": "More", title: "More", "aria-expanded": String(!menu.hidden), onclick: (ev) => {
      const b = ev.currentTarget.getBoundingClientRect(), s2 = stage.getBoundingClientRect();
      menu.style.left = `${Math.min(b.left - s2.left, s2.width - 250)}px`; menu.style.bottom = `${s2.bottom - b.top + 10}px`;
      menu.hidden = !menu.hidden; ev.currentTarget.setAttribute("aria-expanded", String(!menu.hidden));
    } }, el("b", {}, "…"));
    pill.hidden = collapsed; openPill.hidden = !collapsed;
    pill.replaceChildren(
      seg("Preview", [["local", "Local"], ["live", "Live"]], view.where, (k) => { view.where = k; saveView(); drawBar(); loadFrame(); }),
      screenPick,
      el("span", { class: "ws-div" }),
      seg("Device", [["phone", "Phone", "i-phone"], ["desktop", "Desktop", "i-monitor"]], view.device, (k) => { view.device = k; saveView(); drawBar(); loadFrame(); }, true),
      seg("Color mode", [["Light", "Light", "i-sun"], ["Dark", "Dark", "i-moon"]], view.mode, (k) => { view.mode = k; saveView(); drawBar(); loadFrame(); }, true),
      el("span", { class: "ws-div" }),
      tool("comment", "Comments", "i-message", openOnScreen()),
      tool("inspect", "Inspect", "i-search"),
      tool("code", "Code", "i-terminal"),
      el("span", { class: "ws-div" }),
      el("button", { class: "ws-tool", type: "button", "aria-label": "Refresh", title: "Refresh", onclick: () => loadFrame(true) }, icon("i-refresh")),
      more,
      el("button", { class: "ws-tool", type: "button", "aria-label": "Hide the controls", title: "Hide the controls", onclick: () => setCollapsed(true) }, icon("i-right")));
    const pub = el("button", { class: "primary sm", type: "button", "aria-expanded": String(!pubPop.hidden), "aria-haspopup": "dialog", onclick: async () => {
      pubPop.hidden = !pubPop.hidden;
      drawPubPop();
      // the page may have been open while Claude changed the prototype: read the publish state again
      if (!pubPop.hidden && !st.publishing) {
        try { const fresh = await api(`/api/project/${enc}/design`); Object.assign(st, { unpublished: fresh.unpublished, publish: fresh.publish, repo: fresh.repo }); drawBar(); } catch {}
        runPublishCheck();
      }
    } },
      st.unpublished ? el("span", { class: "dot bad", "aria-hidden": "true" }) : null, st.publishing ? "Publishing…" : "Publish");
    const pendingN = syncSt ? syncSt.pending.length + ((syncSt.lastCheck?.rows || []).filter((r) => ["figma-changed", "new-in-figma", "conflict", "removed-in-figma"].includes(r.status)).length) + (syncSt.watch && !syncSt.watch.seen ? 1 : 0) + (syncSt.lastCheck?.code?.items?.length || 0) : 0;
    const syncBtn = el("button", { class: "ghost sm ws-syncbtn", type: "button", "aria-haspopup": "dialog", "aria-expanded": String(!syncPop.hidden), title: "What differs between the prototype and Figma", onclick: () => { syncPop.hidden = !syncPop.hidden; pubPop.hidden = true; if (!syncPop.hidden) loadSync(); drawSyncPop(); } },
      icon("i-refresh"), "Sync with Figma", pendingN ? el("span", { class: "ws-count rel" }, String(pendingN)) : null);
    pubBox.replaceChildren(syncBtn, pub);
    drawPubPop();
    drawList();
  }

  async function loadComments(pull) {
    try { comments = (await api(`/api/project/${enc}/comments${pull ? "/pull" : ""}`, pull ? {} : undefined)).comments || []; }
    catch (e) { showError(e); }
    drawBar();
  }
  async function setTool(k) {
    view.tool = k; view.comment = null; pop.hidden = true;
    loadFrame(); drawBar();
    if (k === "comment") await loadComments(true);
  }
  const byId = (id) => comments.find((c) => c.id === id);
  function drawList() {
    list.hidden = view.tool !== "comment";
    if (list.hidden) return;
    const open = comments.filter((c) => c.status !== "resolved" && c.screen === view.screen);
    const n = (c) => pins.find((x) => x.id === c.id)?.n;
    list.replaceChildren(el("h3", {}, `Comments on this screen · ${open.length}`),
      ...(open.length ? open.map((c) => el("button", { type: "button", class: view.comment === c.id ? "on" : null, onclick: () => focusComment(c.id) },
        el("span", { class: "pin" }, String(n(c) || "•")),
        el("span", { class: "t" }, el("b", {}, c.author || "Anonymous", c.triage?.status && decisionLabel[c.triage.status] && c.triage.status !== "proposed" ? el("span", { class: `st st-${c.triage.status}` }, decisionLabel[c.triage.status]) : null), el("span", { class: "tb", dir: "auto" }, c.body))))
        : [el("p", { class: "muted small" }, "No open comments on this screen.")]),
      el("a", { class: "small", href: `#/project/${enc}/review` }, "All comments"));
  }
  function focusComment(id) {
    view.comment = id; pop.hidden = true;
    loadFrame(); drawList();
  }

  // The prototype says which pin was picked and where it is (in the frame's own coordinates).
  const onMessage = (ev) => {
    if (!canvas.isConnected) { window.removeEventListener("message", onMessage); return; }
    if (ev.source !== frame.contentWindow || !ev.data || typeof ev.data !== "object") return;
    if (ev.data.type === "atomica:comments") { pins = ev.data.items || []; if (pins.some((x) => !byId(x.id))) loadComments(true); else drawList(); postStatuses(); }
    if (ev.data.type === "atomica:comment") { view.comment = ev.data.id; showPop(ev.data.id, ev.data.rect); drawList(); }
  };
  window.addEventListener("message", onMessage);

  function showPop(id, rect) {
    const c = byId(id);
    if (!c || !rect) { pop.hidden = true; return; }
    const f = frame.getBoundingClientRect(), s = stage.getBoundingClientRect();
    const x = f.left - s.left + rect.x + rect.w, y = f.top - s.top + rect.y;
    const w = 320, right = x + 12 + w <= s.width - 12;
    pop.style.left = `${right ? x + 12 : Math.max(12, x - rect.w - 12 - w)}px`;
    pop.hidden = false;
    const t = c.triage;
    const img = (f2) => `/api/project/${enc}/comment-image?f=${encodeURIComponent(f2)}`;
    pop.replaceChildren(...[
      el("header", {}, el("span", { class: "avatar", "aria-hidden": "true" }, (c.author || "?").trim().charAt(0).toUpperCase()),
        el("div", { class: "who" }, el("b", {}, c.author || "Anonymous"), el("span", { class: "muted small" }, `${fmtDate(c.created_at)} · ${c.component || "Frame"}`)),
        t?.status && t.status !== "proposed" ? el("span", { class: "tag open" }, decisionLabel[t.status]) : null,
        el("button", { class: "iconbtn sq", type: "button", "aria-label": "Close", onclick: () => { pop.hidden = true; } }, icon("i-x"))),
      el("div", { class: "pop-body" }, el("p", { class: "body", dir: "auto" }, c.body),
        c.localImages?.length ? el("div", { class: "thumbs" }, c.localImages.map((f2, i) => el("a", { href: img(f2), target: "_blank", rel: "noopener" }, el("img", { src: img(f2), alt: `Reference image ${i + 1}` })))) : null,
        t?.proposal ? el("div", { class: "triage" }, el("span", { class: "kicker" }, "Claude's proposal"), el("p", { dir: "auto" }, t.proposal)) : null),
      el("div", { class: "p-actions" },
        el("button", { class: "primary sm", type: "button", disabled: ["queued", "in-progress"].includes(t?.status) || null, onclick: () => { pop.hidden = true; applyNow(c); } }, icon("i-check"), t?.status === "queued" ? "Queued" : t?.status === "in-progress" ? "In progress…" : "Apply online"),
        el("button", { class: "ghost sm", type: "button", onclick: () => act(c, "rejected") }, icon("i-x"), "Reject"),
        el("button", { class: "ghost sm", type: "button", onclick: () => act(c, "asked", ASK_TEXT(c, screenName())) }, icon("i-message"), "Ask"),
        el("button", { class: "ghost sm", type: "button", onclick: () => replyClose(c) }, icon("i-send"), "Reply & close"))].filter(Boolean));
    // next to the pin, kept clear of the controls at the bottom
    pop.style.top = `${Math.max(12, Math.min(y - 8, s.height - pop.offsetHeight - 84))}px`;
  }
  async function act(c, decision, text) {
    try { const r = await api(`/api/project/${enc}/comments/decide`, { id: c.id, decision }); c.triage = { ...(c.triage || {}), ...r.triage }; }
    catch (e) { showError(e); return; }
    if (text) { prefill(text); toast("The request is in the chat box: check it, then press Send."); }
    else toast(decision === "rejected" ? "Marked as rejected. Reply & close tells the reviewer why." : "Saved.");
    if (!pop.hidden) showPop(c.id, null);
    pop.hidden = true;
  }
  // Apply online sends at once: the chat shows a short line, the full instructions go to Claude as hidden context.
  // Progress shows on the comment and its pin: Queued (Claude is busy), In progress, then Applied, or "Plan ready" for a
  // new flow, which stops for the user's OK in the chat first.
  async function setStatus(c, status) {
    try { const r = await api(`/api/project/${enc}/comments/decide`, { id: c.id, decision: status }); c.triage = { ...(c.triage || {}), ...r.triage }; }
    catch (e) { showError(e); }
    drawList(); postStatuses();
  }
  // Sends a task to the Design chat: a short visible line, the full instructions as hidden context. Returns "queued"
  // (Claude is busy and takes it next) or "in-progress".
  async function sendToDesign(short, hidden, screenName) {
    let live = null;
    if (sessionId()) live = (await api("/api/sessions")).live.find((x) => x.id === sessionId());
    if (!live && sessionId()) { await openChat(); live = (await api("/api/sessions")).live.find((x) => x.id === sessionId()); }
    if (live) {
      await api(`/api/sessions/${live.id}/message`, { text: short, context: hidden });
      return live.busy ? "queued" : "in-progress";
    }
    const s = await api("/api/sessions", { prompt: short, context: `${DESIGN_CONTEXT(p.name, st.designMode || "code-first", screenName || "", view.where === "local" ? "local preview" : "live link")}\n\n${hidden}`, project: p.name, title: `Design: ${p.title}` });
    writeStore(designKey(p.name), { id: s.id, claudeSessionId: s.claudeSessionId || null });
    mountChat(s.id);
    return "in-progress";
  }
  async function applyNow(c) {
    if (!st.designMode) { pendingApply = c; toast("Pick Code first or Figma first above; the comment goes to Claude right after."); return; }
    const screen = st.screens.find((s) => s.slug === c.screen)?.name || c.screen;
    const short = `Apply ${c.author || "a reviewer"}'s comment on ${screen}${c.component ? ` · ${c.component}` : ""}: «${c.body}»`;
    const hidden = APPLY_CONTEXT(c, screen);
    try {
      const status = await sendToDesign(short, hidden, screen);
      await setStatus(c, status);
      toast(status === "queued" ? "Queued: Claude takes it right after the current task." : "Sent to Claude.");
      watchApply(c, sessionId(), c.triage?.kind === "flow" || /\bflow\b|فلو|\bnew (screen|page)\b|(صمم|اعمل) (صفحة|شاشة)|(صفحة|شاشة) جديدة/i.test(c.body));
    } catch (e) { showError(e); }
  }
  async function watchApply(c, id, planFirst) {
    const t0 = Date.now();
    let sawBusy = false;
    while (Date.now() - t0 < 45 * 60000) {
      await new Promise((r) => setTimeout(r, 3000));
      if (!canvas.isConnected) return;
      let s;
      try { s = (await api("/api/sessions")).live.find((x) => x.id === id); } catch { continue; }
      if (!s) return;
      if (s.busy) { sawBusy = true; if (c.triage?.status === "queued" && Date.now() - t0 > 4000) { /* still the earlier task, or ours: keep Queued until Claude is idle */ } continue; }
      if (sawBusy || Date.now() - t0 > 12000) {
        await setStatus(c, planFirst ? "needs-ok" : "applied");
        loadFrame(true);
        toast(planFirst ? "Claude has a plan for this comment: answer it in the chat." : "Applied in the prototype. Reply & close when you are happy with it.");
        return;
      }
    }
  }
  // the pins in the prototype show the same progress (queued, in progress, applied, plan ready)
  function postStatuses() {
    const map = Object.fromEntries(comments.filter((x) => ["queued", "in-progress", "applied", "needs-ok"].includes(x.triage?.status)).map((x) => [x.id, x.triage.status]));
    try { frame.contentWindow?.postMessage({ type: "atomica:pin-status", map }, "*"); } catch {}
  }
  // ----- Sync with Figma: prototype -> Figma, Figma -> prototype, conflicts -----
  const SYNC_LABEL = { "figma-changed": "Changed in Figma", "new-in-figma": "New in Figma", "removed-in-figma": "Removed in Figma", conflict: "Changed on both sides", "prototype-changed": "Changed in the prototype", "prototype-only": "Only in the prototype", "in-sync": "In sync", baseline: "First check" };
  let syncChecking = false;
  const pushPicked = new Set(), pullPicked = new Set(), conflictPick = {};
  const pushSeen = new Set(); // every newly listed item starts ticked; the user's untick is kept
  const codePicked = new Set();
  async function loadSync() {
    try { syncSt = await api(`/api/project/${enc}/figma-sync`); for (const i of syncSt.pending) if (!pushSeen.has(i.id)) { pushSeen.add(i.id); pushPicked.add(i.id); } } catch (e) { showError(e); }
    drawBar(); drawSyncPop();
  }
  async function checkFigma() {
    syncChecking = true; drawSyncPop();
    try {
      const r = await api(`/api/project/${enc}/figma-sync/check`, {});
      if (r.error) toast(r.error); else syncSt = { ...syncSt, pending: r.pending, lastCheck: { at: r.checkedAt, rows: r.rows, baseline: r.baseline, code: r.code } };
      for (const it of syncSt.lastCheck?.code?.items || []) codePicked.add(it.sha);
      for (const row of syncSt.lastCheck?.rows || []) if (["figma-changed", "new-in-figma"].includes(row.status)) pullPicked.add(row.slug);
    } catch (e) { showError(e); }
    syncChecking = false; drawBar(); drawSyncPop();
  }
  const figmaToolNow = () => (figmaToolsCache ? figmaToolName(figmaToolsCache.default) : "the saved Figma tool");
  function drawSyncPop() {
    if (syncPop.hidden) return;
    if (!syncSt) { syncPop.replaceChildren(el("p", { class: "small muted" }, "Reading the sync state…")); return; }
    const status = st.designMode ? null : null;
    const rows = syncSt.lastCheck?.rows || [];
    const pull = rows.filter((r) => ["figma-changed", "new-in-figma", "removed-in-figma"].includes(r.status));
    const conflicts = rows.filter((r) => r.status === "conflict");
    for (const r of conflicts) if (r.proposal && conflictPick[r.slug] === undefined) conflictPick[r.slug] = r.proposal.side === "figma" ? "figma" : "prototype";
    const inSync = rows.filter((r) => r.status === "in-sync").length;
    const nameOf = (slug, fallback) => syncSt.screens?.find((x) => x.slug === slug)?.name || fallback || slug;
    const check = (set, id) => el("input", { type: "checkbox", checked: set.has(id) || null, onchange: (ev) => { ev.target.checked ? set.add(id) : set.delete(id); drawSyncPop(); } });
    const ds = syncSt.pending.filter((i) => i.kind === "ds"), scr = syncSt.pending.filter((i) => i.kind !== "ds");
    const itemRow = (i) => el("label", { class: "srow2" }, check(pushPicked, i.id), el("span", {}, el("b", {}, i.screen || (i.kind === "ds" ? "Design system" : "Screen")), el("span", { class: "small muted" }, ` · ${i.file || ""}`), el("p", { class: "small", dir: "auto" }, String(i.title).slice(0, 180))));
    const pushN = syncSt.pending.filter((i) => pushPicked.has(i.id)).length;
    const pullN = pull.filter((r) => pullPicked.has(r.slug)).length + conflicts.filter((r) => conflictPick[r.slug]).length;
    syncPop.replaceChildren(...[
      el("header", {}, el("span", { class: "dot run" }), el("b", {}, "Sync with Figma"),
        el("button", { class: "iconbtn sq", type: "button", "aria-label": "Close", onclick: () => { syncPop.hidden = true; drawBar(); } }, icon("i-x"))),
      el("p", { class: "muted small" }, `Figma tool: ${figmaToolNow()}. Nothing is written to Figma until you press Sync.`),
      syncSt.watch && !syncSt.watch.seen ? el("div", { class: "watchnote" }, icon("i-clock"), el("span", { class: "small" }, el("b", {}, "Daily check: "), syncSt.watch.summary), el("button", { class: "ghost sm", type: "button", onclick: async () => { await api(`/api/project/${enc}/figma-sync/watch-seen`, {}).catch(() => {}); syncSt.watch.seen = true; drawBar(); drawSyncPop(); } }, "Got it")) : null,
      // prototype -> Figma
      el("div", { class: "pub-url" }, el("span", { class: "kicker" }, `Prototype → Figma · ${syncSt.pending.length}`),
        syncSt.pending.length ? el("div", { class: "slist" },
          ds.length ? el("p", { class: "small muted" }, "1. Design system first (then publish the library):") : null, ...ds.map(itemRow),
          scr.length ? el("p", { class: "small muted" }, `${ds.length ? "2. " : ""}Screens in the Design file:`) : null, ...scr.map(itemRow))
          : el("p", { class: "small muted" }, "Nothing waiting: Figma has every prototype change."),
        syncSt.pending.length ? el("div", { class: "row" }, el("span", { style: "flex:1" }), el("button", { class: "primary sm", type: "button", disabled: !pushN || null, onclick: syncToFigma }, `Sync ${pushN} item${pushN === 1 ? "" : "s"} to Figma`)) : null),
      // Figma -> prototype
      el("div", { class: "pub-url" }, el("span", { class: "kicker" }, "Figma → Prototype"),
        el("div", { class: "row" }, el("span", { class: "small muted", style: "flex:1" }, syncSt.lastCheck?.at ? `Last checked ${fmtDate(syncSt.lastCheck.at)}${inSync ? ` · ${inSync} in sync` : ""}` : "Not checked yet."),
          el("button", { class: "ghost sm", type: "button", disabled: syncChecking || null, onclick: checkFigma }, icon("i-refresh"), syncChecking ? "Checking…" : "Check Figma for changes")),
        syncSt.lastCheck?.baseline ? el("p", { class: "small muted" }, "First check: this is now the starting point; later Figma edits show here.") : null,
        pull.length ? el("div", { class: "slist" }, pull.map((r) => el("label", { class: "srow2" }, check(pullPicked, r.slug), el("span", {}, el("b", {}, r.name || nameOf(r.slug)), el("span", { class: "small muted" }, ` · ${SYNC_LABEL[r.status]}`))))) : syncSt.lastCheck ? el("p", { class: "small muted" }, "No new Figma changes for the prototype.") : null,
        conflicts.length ? el("div", { class: "slist" }, el("p", { class: "small conflict" }, "Changed on both sides since the last sync: choose what wins."),
          conflicts.map((r) => el("div", { class: "srow2" }, el("span", {}, el("b", {}, nameOf(r.slug)), r.proposal ? el("p", { class: "small muted" }, `Proposed: ${r.proposal.why}.`) : el("p", { class: "small muted" }, "No owner in sync-rules.json: your choice.")),
            el("select", { "aria-label": `Which wins for ${nameOf(r.slug)}`, onchange: (ev) => { conflictPick[r.slug] = ev.target.value || null; drawSyncPop(); } },
              el("option", { value: "" }, "Decide…"), el("option", { value: "figma", selected: conflictPick[r.slug] === "figma" || null }, "Figma wins"), el("option", { value: "prototype", selected: conflictPick[r.slug] === "prototype" || null }, "Prototype wins"), el("option", { value: "both", selected: conflictPick[r.slug] === "both" || null }, "Keep both"))))) : null,
        pull.length || conflicts.length ? el("div", { class: "row" }, el("span", { style: "flex:1" }), el("button", { class: "primary sm", type: "button", disabled: !pullN || null, onclick: pullFromFigma }, `Pull ${pullN} into the prototype`)) : null),
      codeSection(),
      settingsSection(),
    ].filter(Boolean));
  }
  // The code repo as a third side: new commits become "add to Figma?" items; Figma changes can become a PR there.
  function codeSection() {
    const repo = syncSt.codeRepo;
    if (!repo) return null;
    const url = repo.url || repo;
    const code = syncSt.lastCheck?.code;
    const figmaChanged = (syncSt.lastCheck?.rows || []).filter((r) => ["figma-changed", "new-in-figma"].includes(r.status));
    const n = (code?.items || []).filter((i) => codePicked.has(i.sha)).length;
    return el("div", { class: "pub-url" }, el("span", { class: "kicker" }, "Code repo"),
      el("p", { class: "small muted" }, el("a", { href: String(url).replace(/\.git$/, ""), target: "_blank", rel: "noopener" }, String(url).replace(/^https:\/\//, "").replace(/\.git$/, "")), repo.branch ? ` · ${repo.branch}` : ""),
      code?.error ? el("p", { class: "small conflict" }, code.error) : null,
      code && !code.error && code.items.length ? el("div", { class: "slist" }, el("p", { class: "small muted" }, "New in the code since the last sync: add to Figma?"),
        code.items.map((it) => el("label", { class: "srow2" }, el("input", { type: "checkbox", checked: codePicked.has(it.sha) || null, onchange: (ev) => { ev.target.checked ? codePicked.add(it.sha) : codePicked.delete(it.sha); drawSyncPop(); } }), el("span", {}, el("b", { dir: "auto" }, it.subject), el("span", { class: "small muted mono" }, ` · ${it.sha}`))))) : code && !code.error ? el("p", { class: "small muted" }, "No new code changes since the last sync.") : el("p", { class: "small muted" }, "Check Figma for changes to read the code repo too."),
      el("div", { class: "row" }, el("span", { style: "flex:1" }),
        figmaChanged.length ? el("button", { class: "ghost sm", type: "button", onclick: () => prepareCodePr(figmaChanged) }, `Prepare a PR for ${figmaChanged.length} Figma change${figmaChanged.length === 1 ? "" : "s"}`) : null,
        code?.items?.length ? el("button", { class: "primary sm", type: "button", disabled: !n || null, onclick: () => codeToFigma(code.items.filter((i) => codePicked.has(i.sha)), code.repo) }, `Add ${n} to Figma`) : null));
  }
  async function codeToFigma(items, repoUrl) {
    const short = `Add ${items.length} code change${items.length === 1 ? "" : "s"} to Figma`;
    const hidden = `The user pressed "Add to Figma" for these commits of the code repo ${repoUrl} (that press approves adding them to Figma). For each one, read the commit, say in one line what it changes in the design (component, state, prop or screen), then add it in Figma with ${figmaToolNow()}: design-system changes first (then remind to publish the library), then screens; DS components and variables only; audit after each. If a commit has no design effect, say so and skip it. Commits:\n${items.map((i) => `- ${i.sha} ${i.subject}`).join("\n")}\nAfterwards add a CHANGELOG entry and record the code side as synced (node tools/figma_sync.cjs "My Projects/${p.name}" --mark <slugs> for the screens you touched).`;
    try { const st2 = await sendToDesign(short, hidden); toast(st2 === "queued" ? "Queued after the current task." : "Sent to Claude: the code changes go to Figma in the chat."); syncPop.hidden = true; drawBar(); } catch (e) { showError(e); }
  }
  async function prepareCodePr(rows) {
    const repo = syncSt.codeRepo; const url = repo.url || repo;
    const names = rows.map((r) => r.name || syncSt.screens?.find((x) => x.slug === r.slug)?.name || r.slug);
    const short = `Prepare a PR in the code repo for ${rows.length} Figma change${rows.length === 1 ? "" : "s"}`;
    const hidden = `The user pressed "Prepare a PR" in the Design page. In the code repo ${url}${repo.branch ? ` (branch ${repo.branch})` : ""}: clone it outside the workflow folder, make one short branch (atomica/figma-sync-<date>), implement only these Figma changes with the code's existing components and tokens: ${names.join(", ")}. Push the branch and open ONE draft pull request with a clear summary and before/after notes, assigned to the user for review. Never merge it, never push to the default branch. Report the PR link.`;
    try { const st2 = await sendToDesign(short, hidden); toast(st2 === "queued" ? "Queued after the current task." : "Sent to Claude: it prepares a draft PR for your review."); syncPop.hidden = true; drawBar(); } catch (e) { showError(e); }
  }
  // Settings: the code repo link, the ownership rules, the daily check.
  function settingsSection() {
    const repo = syncSt.codeRepo || {};
    const urlIn = el("input", { class: "mono", placeholder: "https://github.com/owner/repo", value: repo.url || (typeof repo === "string" ? repo : ""), "aria-label": "Code repo link" });
    const brIn = el("input", { class: "mono", placeholder: "branch (optional)", value: repo.branch || "", "aria-label": "Branch", style: "max-width:120px" });
    const rulesIn = el("textarea", { class: "mono", rows: "7", "aria-label": "Ownership rules (sync-rules.json)" });
    rulesIn.value = JSON.stringify({ screens: syncSt.rules?.screens || {}, categories: syncSt.rules?.categories || {} }, null, 2);
    const sch = syncSt.schedule || {};
    const time = el("input", { type: "time", value: "09:00", "aria-label": "Daily check time" });
    return el("details", { class: "pub-url sync-settings" }, el("summary", { class: "kicker" }, "Settings"),
      el("p", { class: "small" }, el("b", {}, "Code repo"), " (a third side: its new commits show above; Figma changes can become a PR there)"),
      el("div", { class: "row" }, urlIn, brIn, el("button", { class: "ghost sm", type: "button", onclick: async () => {
        try { const r = await api(`/api/project/${enc}/figma-sync/code-repo`, { url: urlIn.value.trim(), branch: brIn.value.trim() }); syncSt.codeRepo = r.codeRepo; toast(r.codeRepo ? "Code repo linked." : "Code repo removed."); drawSyncPop(); } catch (e) { showError(e); }
      } }, "Save")),
      el("p", { class: "small" }, el("b", {}, "Who owns what"), " (sync-rules.json: \"figma\", \"code\" or null to ask; an owned conflict is proposed for the owner, still applied only on your press)"),
      rulesIn,
      el("div", { class: "row" }, el("span", { style: "flex:1" }), el("button", { class: "ghost sm", type: "button", onclick: async () => {
        let parsed; try { parsed = JSON.parse(rulesIn.value); } catch { toast("The rules are not valid JSON."); return; }
        try { const r = await api(`/api/project/${enc}/figma-sync/rules`, { rules: parsed }); syncSt.rules = r.rules; toast("Ownership rules saved."); drawSyncPop(); } catch (e) { showError(e); }
      } }, "Save rules")),
      el("p", { class: "small" }, el("b", {}, "Daily check"), " (a small script, no AI: it compares the Figma file and the code repo with the last sync and only leaves a note here when something moved)"),
      sch.supported === false ? el("p", { class: "small muted" }, "Windows only from here; on a Mac run node tools/sync_watch.cjs --all from cron.") :
        el("div", { class: "row" }, el("span", { class: "small" }, el("span", { class: `dot ${sch.on ? "good" : "wait"}` }), sch.on ? ` On${sch.next ? ` · next ${sch.next}` : ""}` : " Off"), el("span", { style: "flex:1" }), sch.on ? null : time,
          el("button", { class: sch.on ? "ghost sm" : "primary sm", type: "button", onclick: async () => {
            try { const r = await api(`/api/project/${enc}/sync-schedule`, { on: !sch.on, time: time.value }); syncSt.schedule = r.schedule; toast(r.schedule.on ? "Daily check on (Windows Task Scheduler: Atomica sync check)." : "Daily check off."); drawSyncPop(); } catch (e) { showError(e); }
          } }, sch.on ? "Turn off" : "Turn on (creates a Windows task)")));
  }
  async function syncToFigma() {
    const items = syncSt.pending.filter((i) => pushPicked.has(i.id));
    if (!items.length) return;
    const short = `Sync ${items.length} prototype change${items.length === 1 ? "" : "s"} to Figma`;
    const hidden = `The user pressed "Sync to Figma" in the Design page (that press is the approval to write to Figma for these items only). Figma tool: ${figmaToolNow()} (status.json > figma.tool and the workflow's tool rules). Do them in this order: design-system changes first in the DS file (then remind the user to publish the library and Accept updates in the Design file), then screens in the Design file, built only from library instances and variables. Items:\n${items.map((i, n) => `${n + 1}. [${i.kind}] ${i.screen || ""} · ${i.file || ""} · ${i.title}`).join("\n")}\nAfter each item: audit it, run the fidelity check, remove it from status.json > prototype.pending_figma_sync (and data/sync-queue.json), record the screen as in sync with: node tools/figma_sync.cjs "My Projects/${p.name}" --mark <slug>, and add a CHANGELOG entry. Stop and ask before anything outside these items.`;
    try { const s = await sendToDesign(short, hidden); toast(s === "queued" ? "Queued: Claude takes the sync after the current task." : "Sent to Claude: the sync is running in the chat."); syncPop.hidden = true; drawBar(); }
    catch (e) { showError(e); }
  }
  async function pullFromFigma() {
    const rows = syncSt.lastCheck?.rows || [];
    const take = rows.filter((r) => ["figma-changed", "new-in-figma", "removed-in-figma"].includes(r.status) && pullPicked.has(r.slug));
    const conf = rows.filter((r) => r.status === "conflict" && conflictPick[r.slug]);
    if (!take.length && !conf.length) return;
    const nameOf = (r) => r.name || syncSt.screens?.find((x) => x.slug === r.slug)?.name || r.slug;
    const lines = [...take.map((r) => `- ${nameOf(r)}: ${SYNC_LABEL[r.status]}${r.id ? ` (Figma ${r.id})` : ""}`), ...conf.map((r) => `- ${nameOf(r)}: changed on both sides; the user chose: ${{ figma: "Figma wins (the prototype's code-first change for it is dropped)", prototype: "the prototype wins (keep the code-first change; it stays pending for Figma)", both: "keep both (the Figma version becomes a second screen next to the prototype's)" }[conflictPick[r.slug]]}`)];
    const short = `Pull ${lines.length} Figma change${lines.length === 1 ? "" : "s"} into the prototype`;
    const hidden = `The user pressed "Pull into the prototype" in the Design page. Bring these Figma changes into the prototype:\n${lines.join("\n")}\nRe-export the screens from the Design file (tools/screens_export.cjs with --only for these screens; new frames become new prototype screens), rebuild with tools/build_prototype.py (DS components and tokens only, 0 raw values, 0 unknown names), run the prototype's checks and the fidelity check, then record them as in sync: node tools/figma_sync.cjs "My Projects/${p.name}" --mark <slugs>. Never overwrite a screen changed on both sides except as the user chose above. Write nothing to Figma.`;
    try { const s = await sendToDesign(short, hidden); toast(s === "queued" ? "Queued: Claude pulls after the current task." : "Sent to Claude: the pull is running in the chat."); syncPop.hidden = true; drawBar(); }
    catch (e) { showError(e); }
  }
  async function replyClose(c) {
    const reply = await askText({ title: "Reply & close", help: `The reply shows under ${c.author || "this"} comment in the prototype.`, okLabel: "Reply & close", placeholder: "What changed…" });
    if (!reply) return;
    try {
      const r = await api(`/api/project/${enc}/comments/resolve`, { id: c.id, reply, decision: c.triage?.status && c.triage.status !== "proposed" ? c.triage.status : null });
      comments = r.comments || comments; pop.hidden = true; view.comment = null; toast("Comment closed."); loadFrame(true); drawBar();
    } catch (e) { showError(e); }
  }

  async function pushToFigma() {
    const sc = st.screens.find((s) => s.slug === view.screen);
    if (!sc) return;
    try { await api(`/api/project/${enc}/sync/queue`, { ref: `push:screen:${sc.slug}`, title: `Push screen "${sc.name}" from the prototype to Figma` }); toast(`"${sc.name}" is queued for Figma. Nothing changed in Figma yet: run the queue on the Sync page.`, { label: "Open Sync", icon: "i-refresh", run: () => { location.hash = `#/project/${enc}/sync`; } }); }
    catch (e) { showError(e); }
  }
  // GitHub Pages serves a new build about a minute after the push (and caches the old page meanwhile): poll the live
  // index for the build that was just published, then reload the Live preview so it never shows the old one.
  async function waitForLive(build) {
    const url = st.publish?.url;
    if (!build || !url) return;
    for (let i = 0; i < 36; i++) {
      await new Promise((r) => setTimeout(r, 5000));
      if (!canvas.isConnected) return;
      try {
        const html = await (await fetch(`${url}?r=${Date.now()}`, { cache: "no-store" })).text();
        if (html.includes(`index-${build}.js`)) {
          liveState = "live";
          if (view.where === "live") loadFrame(true);
          toast("Live: the link now shows the new version.");
          drawBar();
          return;
        }
      } catch {}
    }
  }
  // Publish popover: status, the live link (copy / open), share it, and Publish changes.
  const shareText = () => `${p.title} prototype (design preview, not a real app): ${st.publish?.url || ""}`;
  function drawPubPop() {
    if (pubPop.hidden) return;
    const url = st.publish?.url;
    const published = !!url;
    // a failure shows the script's own reason (without its "Building ..." progress line)
    const status = publishError && !st.publishing ? publishError.replace(/^Building .*?\.\.\.\s*/s, "") : st.publishing ? "Publishing…" : liveState === "waiting" ? "Published · waiting for the live link to update" : st.unpublished ? "Unpublished changes" : published ? "Up to date" : "Not published yet";
    const copy = async (text, done) => toast((await copyText(text)) ? done : "Could not copy. Select the text instead.");
    pubPop.replaceChildren(...[
      el("header", {}, el("span", { class: `dot ${publishError && !st.publishing ? "bad" : !published ? "wait" : st.unpublished || st.publishing || liveState === "waiting" ? "wait" : "good"}` }),
        el("b", { class: publishError && !st.publishing ? "failed" : null }, publishError && !st.publishing ? "Publish failed" : st.publishing ? "Publishing…" : published ? "Published" : "Not published"),
        el("button", { class: "iconbtn sq", type: "button", "aria-label": "Close", onclick: () => { pubPop.hidden = true; drawBar(); } }, icon("i-x"))),
      el("p", { class: "muted small" }, status, st.publish?.at ? ` · last published ${fmtDate(st.publish.at)}` : ""),
      pubCheck === "running" ? el("p", { class: "small muted" }, "Checking the publish setup…") : pubCheck ? publishChecksList(pubCheck, { onlyProblems: true }) : null,
      !st.repo && pubCheck && pubCheck !== "running" && pubCheck.repo ? createRepoBlock(pubCheck) : null,
      published ? el("div", { class: "pub-url" },
        el("span", { class: "kicker" }, "Website URL"),
        el("div", { class: "row" }, el("a", { class: "mono", href: url, target: "_blank", rel: "noopener" }, url.replace(/^https?:\/\//, "")),
          el("button", { class: "iconbtn sq", type: "button", "aria-label": "Copy the link", title: "Copy the link", onclick: () => copy(url, "Link copied.") }, icon("i-copy")),
          el("a", { class: "iconbtn sq", href: url, target: "_blank", rel: "noopener", "aria-label": "Open the live link", title: "Open the live link" }, icon("i-external")))) : null,
      published ? el("div", { class: "pub-share" },
        el("span", { class: "kicker" }, "Share"),
        el("div", { class: "row" },
          el("button", { class: "ghost sm", type: "button", onclick: () => copy(shareText(), "Message with the link copied.") }, icon("i-copy"), "Copy message"),
          navigator.share ? el("button", { class: "ghost sm", type: "button", onclick: () => navigator.share({ title: `${p.title} prototype`, text: shareText(), url }).catch(() => {}) }, icon("i-send"), "Share…") : null,
          el("a", { class: "ghost sm", href: `mailto:?subject=${encodeURIComponent(`${p.title} prototype`)}&body=${encodeURIComponent(shareText())}` }, "Email"),
          el("a", { class: "ghost sm", href: `https://wa.me/?text=${encodeURIComponent(shareText())}`, target: "_blank", rel: "noopener" }, "WhatsApp"))) : null,
      published ? el("p", { class: "pub-note small" }, icon("i-shield"), el("span", {}, "Visible to anyone with the link. Until it moves to its own domain, some browsers may show a safety warning on first open; reviewers can continue to the site.")) : null,
      // Never stuck: when nothing new is detected it still publishes ("Publish again").
      el("button", { class: "primary", type: "button", disabled: st.publishing || !st.repo || (pubCheck && pubCheck !== "running" && !pubCheck.ok) || null, onclick: () => doPublish(),
        title: st.repo ? `Build and publish to ${st.repo} (GitHub Pages)` : "Publish once from the chat first" },
        st.publishing ? "Publishing…" : !published ? "Publish" : st.unpublished ? "Publish changes" : "Publish again"),
    ].filter(Boolean));
  }
  async function doPublish(create = null) {
    publishError = null;
    st.publishing = true; drawBar();
    try {
      st = await api(`/api/project/${enc}/publish`, create ? { create: true, repo: create } : {});
      liveState = "waiting";
      waitForLive(st.publish?.build);
    }
    catch (e) { showError(e); st.publishing = false; publishError = e.message; pubPop.hidden = false; }
    drawBar();
  }

  // Opened from Review (Apply online / Show on screen): that comment's screen, comments on, its pin focused, and for
  // Apply the request waiting in the chat box.
  if (q.get("comment")) {
    await loadComments(false);
    const c = byId(q.get("comment"));
    if (c) {
      if (st.screens.some((s) => s.slug === c.screen)) view.screen = c.screen;
      if (c.theme) view.mode = c.theme;
      view.tool = "comment"; view.comment = c.id;
      if (q.get("apply")) applyOnLoad = c;
    }
    history.replaceState(null, "", `#/project/${enc}/design`);
  }
  drawMode(); drawBar(); loadFrame();
  api(`/api/project/${enc}/figma-sync`).then((r) => { syncSt = r; drawBar(); }).catch(() => {});
  getFigmaTools().catch(() => {});
  await openChat();
  if (applyOnLoad) applyNow(applyOnLoad);
}

// Hidden instructions sent with an Apply (the chat shows only the short line).
const APPLY_CONTEXT = (c, screen) => `The user pressed Apply online on a prototype review comment. Comment id ${c.id} by ${c.author || "a reviewer"} on ${screen}${c.component ? ` (${c.component}${c.figma_node ? ` ${c.figma_node}` : ""})` : ""}: "${c.body}".${c.triage?.proposal ? ` Approved proposal: ${c.triage.proposal}` : ""} If it asks for a new flow, new screens or an IA change, plan it first (flow map and screen spec), show it and stop for the user's OK before building. Otherwise make the change in the prototype now with DS components and tokens only, rebuild and check it, and add it to status.json > prototype.pending_figma_sync. End with the reply to close the comment with.`;
// What Ask puts in the Design chat box (the user checks it and presses Send).
const ASK_TEXT = (c, screen) => `Help me decide on ${c.author || "a reviewer"}'s comment on ${screen}${c.component ? ` (${c.component})` : ""} before anything changes: "${c.body}". Give me the options with a recommendation (comment id ${c.id}).`;

// ---------- Connect services: status lights and the one-time Supabase setup ----------
async function copyText(text) {
  try { await Promise.race([navigator.clipboard.writeText(text), new Promise((_, no) => setTimeout(no, 1000))]); return true; } catch {
    const t = el("textarea", { style: "position:fixed;opacity:0;pointer-events:none" });
    t.value = text; document.body.append(t); t.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch {}
    t.remove(); return ok;
  }
}

async function drawConnect(main, p) {
  const enc = encodeURIComponent(p.name);
  const recheck = el("button", { class: "ghost sm", type: "button" }, icon("i-refresh"), "Check again");
  main.append(head(p, "Connect services", "What this computer is connected to. Set up once per computer; every project uses it.", [recheck]));
  const body = el("div", {}, el("p", { class: "p-empty" }, "Checking…"));
  main.append(body);
  let c;
  const load = async () => { body.replaceChildren(el("p", { class: "p-empty" }, "Checking…")); c = await api(`/api/project/${enc}/connect`); draw(); };
  recheck.onclick = () => load().catch(showError);

  const light = (state) => el("span", { class: `dot ${state === "ok" ? "good" : state === "warn" ? "wait" : "bad"}` });
  const card = (title, state, summary, ...rest) => el("section", { class: "p-panel svc", "data-svc": title },
    el("header", {}, light(state), el("h2", {}, title), el("span", { class: `tag ${state === "ok" ? "res" : state === "warn" ? "k-decision" : "open"}` }, state === "ok" ? "Connected" : state === "warn" ? "Needs a look" : "Not connected")),
    el("p", { class: "small" }, summary), ...rest.filter(Boolean));
  const copyBtn = (label, get) => el("button", { class: "ghost sm", type: "button", onclick: async () => { toast((await copyText(await get())) ? "Copied." : "Could not copy. Select the text instead."); } }, icon("i-copy"), label);
  // "Check Storybook": is it on for this project, what is selected, is it built, running and published
  const storybookCheck = () => {
    const box = el("div", { class: "small" });
    const btn = el("button", { class: "ghost sm", type: "button", onclick: async () => {
      btn.disabled = true;
      try {
        const r = await api(`/api/project/${enc}/storybook`);
        const c = r.config, s = r.state;
        box.replaceChildren(el("dl", { class: "p-kv" },
          el("dt", {}, "Storybook"), el("dd", {}, c.enabled ? "on" : "off (optional)"),
          el("dt", {}, "Selected"), el("dd", {}, c.enabled ? `${c.sections.length} sections · ${c.components === "all" ? "all components" : `${c.components.length} components`}` : "–"),
          el("dt", {}, "Built"), el("dd", {}, s.exists ? `${s.stories} stories${s.running ? " · running" : ""}` : "not yet"),
          el("dt", {}, "Public link"), el("dd", {}, s.url || "none")));
      } catch (e) { showError(e); }
      btn.disabled = false;
    } }, icon("i-refresh"), "Check Storybook");
    return el("div", { class: "p-actions" }, btn, el("a", { class: "ghost sm", href: `#/project/${enc}/storybook` }, "Storybook settings"), box);
  };

  function supabaseCard() {
    const s = c.supabase;
    const sc = s.schema;
    const keysOk = s.url && s.anon && s.service;
    const state = keysOk && sc?.upToDate ? "ok" : keysOk ? "warn" : "bad";
    const summary = !keysOk ? "Prototype comments need a free Supabase project. Paste its three values once; they are saved on this computer only."
      : sc?.error ? `Supabase did not answer the check: ${sc.error}`
      : sc?.upToDate ? `Comments, replies and images work (${s.host}).`
      : `Connected to ${s.host}, but the database needs the current schema: ${[!sc?.table && "the comments table", !sc?.reply && "replies", !sc?.images && "images", !sc?.bucket && "the image bucket"].filter(Boolean).join(", ")} missing.`;
    const kv = el("dl", { class: "p-kv" },
      ...[["Project URL", s.url], ["Public key", s.anon], ["Secret key", s.service]].flatMap(([k, ok]) => [el("dt", {}, k), el("dd", {}, light(ok ? "ok" : "bad"), ok ? " saved" : " missing")]),
      el("dt", {}, "Schema"), el("dd", {}, sc ? [light(sc.upToDate ? "ok" : "warn"), sc.upToDate ? " up to date" : " update needed"] : "–"),
      el("dt", {}, "Saved in"), el("dd", { class: "mono" }, s.file, s.projectOverride ? " (this project's prototype/.env.local overrides it)" : ""));
    const steps = keysOk && sc && !sc.upToDate && !sc.error ? el("ol", { class: "small steps" },
      el("li", {}, "Copy the schema SQL."),
      el("li", {}, "Open the Supabase SQL Editor, paste it and press Run. It is safe to run again: it only adds what is missing."),
      el("li", {}, "Press Check again.")) : null;
    const form = el("form", { class: "svc-form", autocomplete: "off" },
      el("label", {}, "Project URL", el("input", { name: "url", type: "url", placeholder: "https://<ref>.supabase.co", spellcheck: "false" })),
      el("label", {}, "Public key (publishable or anon)", el("input", { name: "anon", type: "password", placeholder: "sb_publishable_…", spellcheck: "false", autocomplete: "off" })),
      el("label", {}, "Secret key (secret or service_role)", el("input", { name: "service", type: "password", placeholder: "sb_secret_…", spellcheck: "false", autocomplete: "new-password" })),
      el("p", { class: "muted small" }, "Supabase > Project Settings > API Keys. Leave a field empty to keep what is saved. The secret key never leaves this computer and is never shown again."),
      el("div", { class: "p-actions" }, el("button", { class: "primary sm", type: "submit" }, "Save keys")));
    form.onsubmit = async (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      try { c = await api(`/api/project/${enc}/connect/supabase`, { url: f.get("url"), anon: f.get("anon"), service: f.get("service") }); form.reset(); toast("Saved on this computer."); draw(); }
      catch (e) { showError(e); }
    };
    const details = el("details", { class: "svc-more", open: !keysOk || null }, el("summary", {}, keysOk ? "Change the keys" : "Set up Supabase"), form);
    return card("Supabase (comments)", state, summary, kv, steps,
      el("div", { class: "p-actions" },
        copyBtn("Copy schema SQL", () => fetch(`/api/project/${enc}/schema-sql`).then((r) => r.text())),
        s.sqlEditor ? el("a", { class: "ghost sm", href: s.sqlEditor, target: "_blank", rel: "noopener" }, icon("i-external"), "Open SQL Editor") : null,
        el("button", { class: "ghost sm", type: "button", onclick: () => load().catch(showError) }, icon("i-refresh"), "Schema status")),
      details);
  }

  // Figma: the three tools (dot each; click for details, Connect, setup and "Use for this project")
  const figmaCard = el("section", { class: "p-panel svc", "data-svc": "Figma" }, el("header", {}, el("h2", {}, "Figma")), el("p", { class: "small muted" }, "Checking the Figma tools…"));
  const fillFigma = () => {
    const st = figmaToolsCache;
    if (!st || !figmaCard.isConnected) return;
    const def = st.tools[st.default];
    figmaCard.replaceChildren(
      el("header", {}, el("span", { class: `dot ${def.connected ? "good" : "bad"}` }), el("h2", {}, "Figma"), el("span", { class: `tag ${def.connected ? "res" : "open"}` }, def.connected ? "Connected" : "Needs setup")),
      el("p", { class: "small" }, `Default: ${figmaToolName(st.default)}. ${def.reason}`),
      figmaToolRows(st, { project: p.name }),
      el("p", { class: "muted small" }, "Click a tool for what it does, a comparison, Connect and setup."));
  };
  getFigmaTools().then(() => { fillFigma(); refreshFigmaToolsLater(fillFigma); }).catch(() => {});
  function draw() {
    const g = c.github, sb = c.storybook, pw = c.playwright;
    body.replaceChildren(el("div", { class: "svc-grid" },
      figmaCard,
      (() => {
        const box = el("div", {}, el("p", { class: "small muted" }, "Checks Git, the GitHub repo, write access and Pages for this project's prototype."));
        const btn = el("button", { class: "ghost sm", type: "button", onclick: async () => {
          btn.disabled = true; btn.textContent = "Checking…";
          try { const r = await api(`/api/project/${enc}/publish-check`); box.replaceChildren(publishChecksList(r)); } catch (e) { showError(e); }
          btn.disabled = false; btn.textContent = "Check publish setup";
        } }, icon("i-refresh"), "Check publish setup");
        return el("section", { class: "p-panel svc", "data-svc": "Publishing" }, el("header", {}, el("h2", {}, "Publishing (live link)")), box, el("div", { class: "p-actions" }, btn));
      })(),
      card("GitHub", g?.signedIn ? "ok" : g?.cli ? "warn" : "bad",
        g?.signedIn ? `Signed in as ${g.account}. Publishing the prototype and team projects use it.` : g?.cli ? "GitHub CLI is installed but not signed in." : "GitHub CLI (gh) is not installed.",
        !g?.signedIn && g?.cli ? el("div", { class: "p-actions" }, el("button", { class: "ghost sm", type: "button", onclick: async () => { try { toast((await api("/api/github/login", {})).ok ? "GitHub sign-in opened in a new window." : "Could not open it."); } catch (e) { showError(e); } } }, icon("i-login"), "Sign in with GitHub")) : null),
      supabaseCard(),
      sb ? card("Storybook MCP", sb.running ? "ok" : "warn",
        sb.running ? `Storybook runs on port ${sb.port}; its MCP is at ${sb.mcp}.` : `Storybook is not running (port ${sb.port}). Start it to give Claude the components' docs and props.`,
        el("p", { class: "muted small" }, "Register it once on this computer (local scope, never committed):"),
        el("pre", { class: "mono svc-cmd" }, sb.add),
        el("div", { class: "p-actions" }, copyBtn("Copy command", () => sb.add)), storybookCheck())
        : card("Storybook MCP", "warn", "This project has no Storybook yet.", storybookCheck()),
      card("Playwright (checks)", pw.core && pw.chrome ? "ok" : "warn",
        pw.core && pw.chrome ? "Ready: fidelity and live checks run in Chrome." : [!pw.core && "the prototype's playwright-core is not installed (npm install in the prototype folder)", !pw.chrome && "Google Chrome is not installed"].filter(Boolean).join("; ") + ".")));
    fillFigma(); // the tools may have arrived before this card was on the page
  }
  await load().catch((e) => { body.replaceChildren(el("p", { class: "p-empty" }, "Could not run the checks.")); showError(e); });
}

// ---------- Plan: Planning/ steps, documents and the three light checkpoints ----------
const PLAN_PROMPTS = {
  start: (p) => `Plan the next work of "${p}" (My Projects/${p}) before anything is built: read its Inputs (PRD, research, meeting notes, screenshots) and write the Planning/ folder, one NN-<step>.md per step (00 Input digest, 01 Users and jobs, 02 Information architecture, 03 Flows, 04 Screen specs, 05 Gaps and plan, 06 Usability pre-check), each with front matter "status: draft | waiting | done". If there is no PRD, draft one from a short brief and mark every assumption. Stop at the three checkpoints (02, 03, 05) with "status: waiting" for my approval. Screen specs use only DS components; missing ones are DS gaps.`,
  next: (p, step) => `Continue the plan of "${p}" (My Projects/${p}/Planning): step ${step.no} ${step.title}. Keep the same file format and stop at the next checkpoint for my approval.`,
  change: (p, name, text) => `Change the planning document My Projects/${p}/Planning/${name} as follows, then set it back to "status: waiting" for my approval: ${text}`,
};
const planStatus = { todo: ["", "not started"], draft: ["k-decision", "draft"], waiting: ["open", "waiting on you"], done: ["res", "done"] };

async function drawPlan(main, p) {
  const enc = encodeURIComponent(p.name);
  let st = await api(`/api/project/${enc}/plan`).catch((e) => { showError(e); return null; });
  if (!st) { main.append(el("p", { class: "p-empty" }, "Could not read the Planning folder.")); return; }
  const inputs = Object.entries(st.inputs).filter(([, n]) => n).map(([k, n]) => `${n} ${k === "Other" ? "other" : k}`);
  const chatBtn = el("button", { class: "primary sm", type: "button" }, icon("i-message"), st.exists ? "Continue the plan in chat" : "Start planning in chat");
  main.append(head(p, "Plan", "From PRD and research to approved flows and screen specs, before anything is built.", [
    el("span", { class: "p-pill" }, `Inputs: ${inputs.length ? inputs.join(", ") : "none yet"}`), chatBtn]));
  const list = el("div", { class: "sheet plan-steps" });
  const doc = el("article", { class: "sheet plan-doc" });
  main.append(el("div", { class: "plan" }, list, doc));
  let open = null;
  chatBtn.onclick = () => {
    const step = st.steps.find((x) => x.no === st.next);
    start({ prompt: st.exists && step ? PLAN_PROMPTS.next(p.name, step) : PLAN_PROMPTS.start(p.name), project: p.name, title: `Plan: ${p.title}` }).catch(showError);
  };

  function drawList() {
    list.replaceChildren(...st.steps.map((x) => {
      const [cls, label] = planStatus[x.status];
      const sel = open && x.docs.some((d) => d.file === open);
      return el("button", { type: "button", class: `pstep${sel ? " on" : ""}`, disabled: !x.docs.length || null, onclick: () => x.docs[0] && showDoc(x.docs[0].file) },
        el("span", { class: "no" }, x.no),
        el("span", {}, el("b", {}, x.title), el("small", {}, x.docs.length > 1 ? `${x.docs.length} documents` : x.hint)),
        x.checkpoint ? el("span", { class: `cp${x.status === "done" ? " ok" : ""}` }, x.status === "done" ? "checkpoint ✓" : "checkpoint") : el("span", { class: `tag ${cls}` }, label));
    }));
  }
  async function showDoc(file) {
    open = file; drawList();
    let d;
    try { d = await api(`/api/project/${enc}/plan-file?f=${encodeURIComponent(file)}`); } catch (e) { showError(e); return; }
    const step = st.steps.find((x) => x.docs.some((y) => y.file === file));
    const meta = step.docs.find((y) => y.file === file);
    const waiting = !meta.approved && meta.status !== "done";
    doc.replaceChildren(...[
      el("header", {}, el("h3", {}, `${step.no} · ${meta.title}`),
        step.checkpoint ? el("span", { class: `cp${waiting ? "" : " ok"}` }, waiting ? (meta.status === "waiting" ? "checkpoint: waiting on you" : "checkpoint: draft") : `approved ${meta.approved || ""}`) : null),
      step.docs.length > 1 ? el("div", { class: "p-seg" }, step.docs.map((y) => el("button", { type: "button", class: y.file === file ? "on" : null, onclick: () => showDoc(y.file) }, y.title))) : null,
      el("div", { class: "md", dir: "auto", html: markdown(d.body) }),
      el("div", { class: "p-actions" },
        waiting ? el("button", { class: "primary sm", type: "button", onclick: async () => { try { st = await api(`/api/project/${enc}/plan/approve`, { file }); toast("Approved."); showDoc(file); } catch (e) { showError(e); } } }, icon("i-check"), step.checkpoint ? "Approve" : "Mark done") : null,
        el("button", { class: "ghost sm", type: "button", onclick: async () => {
          const t = await askText({ title: "Ask for changes", help: `What should change in ${d.name}? Claude edits it and sends it back for approval.`, okLabel: "Send to chat" });
          if (t) start({ prompt: PLAN_PROMPTS.change(p.name, d.name, t), project: p.name, title: `Plan: ${d.name}` }).catch(showError);
        } }, icon("i-message"), "Ask for changes"),
        el("button", { class: "ghost sm", type: "button", onclick: async () => { toast((await copyText(d.path)) ? `Copied: ${d.path}` : d.path); } }, icon("i-copy"), "Copy file path"))].filter(Boolean));
  }

  drawList();
  const first = st.steps.find((x) => x.no === st.next && x.docs.length) || st.steps.filter((x) => x.docs.length).pop();
  if (first) showDoc(first.docs[0].file);
  else doc.replaceChildren(el("div", { class: "p-empty plan-none" },
    el("p", {}, el("b", {}, "No plan yet.")),
    el("p", { class: "small" }, "Claude reads the Inputs (or drafts a PRD from a short brief, with every assumption marked), then writes users and jobs, the information architecture, flows with every state, screen specs from DS components and the gap list. It stops at three checkpoints for your approval."),
    el("button", { class: "primary sm", type: "button", onclick: () => chatBtn.click() }, icon("i-message"), "Start planning in chat")));
}

// ---------- Figma tools: the three ways to reach Figma (Home tile and Connect services) ----------
// Each tool has a dot (green connected, red not), a popup with what it is, a comparison, Connect (check), Set up and
// "Use this tool" (this computer's default, or this project's in status.json > figma.tool).
const FIGMA_TOOLS = [
  ["official", "Official Figma MCP", null, "Easiest to set up, no Figma Desktop needed, but has a daily limit based on your Figma plan."],
  ["bridge", "Desktop Bridge plugin", null, "If the plugin is all you have; it must be open inside the file."],
  ["figcli", "FigCli", "Recommended", "No limits or tokens, works offline, but needs Figma Desktop and a reconnect after every Figma update."],
];
const FIGMA_COMPARE = [
  // [row, official, bridge, figcli]
  ["Reads files and screenshots", "✓", "✓", "✓"],
  ["Writes (builds, fixes)", "✓", "✓", "✓"],
  ["Slots", "–", "✓", "–"],
  ["Comments", "–", "✓", "–"],
  ["Full audits (every variant)", "–", "✓", "✓"],
  ["Speed", "Slower", "Medium", "Fast"],
  ["Limits", "Daily, by plan", "None", "None"],
  ["Needs installing", "No", "Plugin", "FigCli"],
  ["Patches Figma Desktop", "No", "No", "Yes (admin)"],
];
const figmaToolName = (k) => FIGMA_TOOLS.find((t) => t[0] === k)?.[1] || k;
let figmaToolsCache = null;
async function getFigmaTools(fresh) {
  figmaToolsCache = await api(`/api/figma-tools${fresh ? "?fresh=1" : ""}`);
  return figmaToolsCache;
}
// Claude Code's connector list takes ~20 s: the official tool shows "checking" first, then this fills it in.
function refreshFigmaToolsLater(redraw) {
  if (!figmaToolsCache?.tools?.official?.checking) return;
  getFigmaTools(true).then(redraw).catch(() => {});
}
function figmaToolRows(st, { project } = {}) {
  const box = el("div", { class: "ftools", role: "list" });
  for (const [k, name, tag] of FIGMA_TOOLS) {
    const t = st.tools[k];
    box.append(el("button", { type: "button", class: "ftool", role: "listitem", "data-tool": k, title: t.reason, onclick: (ev) => { ev.stopPropagation(); openFigmaTool(k, { project, onChange: () => box.replaceWith(figmaToolRows(figmaToolsCache, { project })) }); } },
      el("span", { class: `dot ${t.checking ? "wait" : t.connected ? "good" : "bad"}`, "aria-hidden": "true" }),
      el("span", { class: "n" }, name),
      tag ? el("span", { class: "rec" }, tag) : null,
      st.default === k ? el("span", { class: "def" }, "Default") : null));
  }
  // the default is down but another tool works: say so
  const def = st.tools[st.default];
  const alt = FIGMA_TOOLS.map((x) => x[0]).find((k) => k !== st.default && st.tools[k].connected);
  if (def && !def.connected && !def.checking && alt) box.append(el("p", { class: "fhint" }, `${figmaToolName(st.default)} is off · ${figmaToolName(alt)} is ready`));
  return box;
}

function openFigmaTool(key, { project, onChange } = {}) {
  let dlg = document.getElementById("figma-tool-dialog");
  if (!dlg) { dlg = el("dialog", { id: "figma-tool-dialog", class: "fdialog" }); document.body.append(dlg); }
  const [, name, tag, line] = FIGMA_TOOLS.find((t) => t[0] === key);
  const col = { official: 1, bridge: 2, figcli: 3 }[key];
  const status = el("p", { class: "fstatus", role: "status" });
  const extra = el("div", { class: "fextra" });
  const drawStatus = () => {
    const t = figmaToolsCache.tools[key];
    status.replaceChildren(el("span", { class: `dot ${t.checking ? "wait" : t.connected ? "good" : "bad"}` }), el("b", {}, t.checking ? "Checking…" : t.connected ? "Connected" : "Needs setup"), el("span", { class: "why" }, t.reason));
    setup.hidden = !!t.connected;
    setup.textContent = key === "figcli" ? (t.installed ? "Connect as administrator" : "Set up FigCli") : key === "bridge" ? (t.installed ? "Show the plugin steps" : "Add the Desktop Bridge") : t.configured ? "Sign in with Figma" : "Add and sign in with Figma";
    useBtn.textContent = figmaToolsCache.default === key ? "Default on this computer" : "Use this tool";
    useBtn.disabled = figmaToolsCache.default === key;
  };
  const connect = el("button", { class: "ghost sm", type: "button", onclick: async () => {
    connect.disabled = true; connect.textContent = "Checking…";
    try { const r = await api("/api/figma-tools/connect", { tool: key }); figmaToolsCache = r; drawStatus(); onChange?.(); toast(r.result.connected ? `${name}: Connected.` : `${name}: needs setup. ${r.result.reason}`); }
    catch (e) { showError(e); }
    connect.disabled = false; connect.textContent = "Connect";
  } }, "Connect");
  const setup = el("button", { class: "primary sm", type: "button", onclick: async () => {
    setup.disabled = true;
    try {
      const r = await api("/api/figma-tools/setup", { tool: key });
      extra.replaceChildren(el("p", { class: "small" }, r.message || ""));
      if (r.manifest || key === "bridge") extra.append(el("ol", { class: "small fsteps" },
        el("li", {}, "In Figma Desktop: Plugins > Development > Import plugin from manifest…, and pick:",
          r.manifest ? el("div", { class: "frow" }, el("code", {}, r.manifest), el("button", { class: "iconbtn sq", type: "button", "aria-label": "Copy the path", onclick: async () => toast((await copyText(r.manifest)) ? "Path copied." : r.manifest) }, icon("i-copy"))) : el("div", { class: "muted" }, "(it appears after the first Claude conversation with the Bridge)")),
        el("li", {}, "Open your file, then Plugins > Development > Figma Desktop Bridge > Run. Keep it open while you work."),
        el("li", {}, "Press Connect here.")));
      if (r.job) pollJob(r.job);
    } catch (e) { extra.replaceChildren(el("p", { class: "small err" }, e.message)); }
    setup.disabled = false;
  } });
  async function pollJob(job) {
    const log = el("pre", { class: "flog" });
    extra.append(log);
    for (;;) {
      await new Promise((r) => setTimeout(r, 1500));
      if (!dlg.open) return;
      const j = await api(`/api/figma-tools/job?name=${job}`).catch(() => null);
      if (!j) return;
      log.textContent = j.lines.join("\n"); log.scrollTop = log.scrollHeight;
      if (j.done) { extra.append(el("p", { class: `small ${j.ok ? "" : "err"}` }, j.ok ? "FigCli is installed. Now press Connect as administrator." : "The setup stopped; see the log above.")); await getFigmaTools(); drawStatus(); onChange?.(); return; }
    }
  }
  const useBtn = el("button", { class: "ghost sm", type: "button", onclick: async () => {
    try { figmaToolsCache = await api("/api/figma-tools/default", { tool: key }); drawStatus(); onChange?.(); toast(`${name} is now the default on this computer.`); }
    catch (e) { showError(e); }
  } });
  const useProject = project ? el("button", { class: "ghost sm", type: "button", onclick: async () => {
    try { figmaToolsCache = await api("/api/figma-tools/default", { tool: key, project }); toast(`${name} is set for this project (status.json, logged in its CHANGELOG).`); onChange?.(); }
    catch (e) { showError(e); }
  } }, "Use for this project") : null;
  dlg.replaceChildren(
    el("header", {}, el("h3", {}, name), tag ? el("span", { class: "rec" }, tag) : null,
      el("button", { class: "iconbtn sq", type: "button", "aria-label": "Close", onclick: () => dlg.close() }, icon("i-x"))),
    status,
    el("p", { class: "fline" }, line),
    el("table", { class: "fcompare" },
      el("thead", {}, el("tr", {}, el("th", {}, ""), ...["Official MCP", "Desktop Bridge", "FigCli"].map((h, i) => el("th", { class: i + 1 === col ? "on" : null }, h)))),
      el("tbody", {}, FIGMA_COMPARE.map((r) => el("tr", {}, el("th", {}, r[0]), ...r.slice(1).map((v, i) => el("td", { class: i + 1 === col ? "on" : null }, v)))))),
    key === "figcli" ? el("p", { class: "muted small" }, "The administrator step patches Figma Desktop so it opens a local debugging port (9222, no password, this computer only). You confirm it in a Windows prompt; Atomica never runs it on its own. Repeat it after a Figma update.") : null,
    extra,
    el("footer", {}, connect, setup, el("span", { style: "flex:1" }), useProject, useBtn));
  drawStatus();
  if (!dlg.open) dlg.showModal();
  dlg.onclose = () => onChange?.();
  if (figmaToolsCache.tools.official.checking) refreshFigmaToolsLater(() => { if (dlg.open) drawStatus(); onChange?.(); });
}

// The publish preflight as a list: what works, and for each problem its reason and the exact fix.
function publishChecksList(chk, { onlyProblems = false } = {}) {
  const rows = (chk.checks || []).filter((c) => !onlyProblems || !c.ok);
  if (onlyProblems && !rows.length) return el("p", { class: "small pchk-ok" }, icon("i-check"), " Ready to publish: Git, the repo and write access are fine.");
  return el("ul", { class: "pchk" }, rows.map((c) => el("li", { class: c.ok ? "ok" : c.optional ? "warn" : "bad" },
    el("span", { class: `dot ${c.ok ? "good" : c.optional ? "wait" : "bad"}` }),
    el("div", {}, el("b", {}, c.label), c.ok ? null : el("p", { class: "small" }, c.reason), c.ok ? null : el("p", { class: "small muted" }, "Fix: ", c.fix)))));
}

// ---------- Storybook: opt-in, by sections (tools/storybook_sections.cjs) ----------
// One switch per project (off by default, Code first or Figma first) and a checklist of what goes up; only the checked
// sections are built. Building and publishing go through the chat (the Storybook skill reads the same choices).
const SB_PROMPT = (p, plan, mode) => `Build or update the Storybook of "${p}" (My Projects/${p}) with ONLY the sections checked in status.json > storybook (tools/storybook_sections.cjs "My Projects/${p}" prints the plan); leave every other section out of the files and the navigation. Source: ${mode === "code-first" ? "the code (Code first): read the linked repo / prototype for tokens (Tailwind config, CSS variables) and components with their props; the stories import the real components, never copies" : "the Figma design system (data/tokens.json, the registry, the DS file)"}. Follow Storybook_Design_System_Skill (section 0, opt-in and sections). Sections: ${plan.build.map((b) => b.label).join(", ")}. Components: ${plan.components.length ? plan.components.join(", ") : "none"}${plan.componentDetail.length ? ` (with: ${plan.componentDetail.join(", ")})` : ""}. Do not publish it anywhere unless "Public link" is checked AND I confirm.`;

async function drawStorybook(main, p) {
  const enc = encodeURIComponent(p.name);
  let d = await api(`/api/project/${enc}/storybook?components=1`).catch((e) => { showError(e); return null; });
  if (!d) { main.append(el("p", { class: "p-empty" }, "Could not read the Storybook settings.")); return; }
  let cfg = { ...d.config };
  let dirty = false;
  const saveBtn = el("button", { class: "primary sm", type: "button" }, "Save");
  const buildBtn = el("button", { class: "ghost sm", type: "button" }, icon("i-message"), "Build / update in chat");
  main.append(head(p, "Storybook", "Optional: a live design system for developers, with only the parts you choose.", [buildBtn, saveBtn]));
  const body = el("div", { class: "sb-page" });
  main.append(body);
  const comps = d.components?.components || [];
  let compQuery = "";

  const set = (fn) => { fn(); dirty = true; draw(); };
  const has = (id) => cfg.sections.includes(id);
  const toggleSection = (id) => set(() => { cfg.sections = has(id) ? cfg.sections.filter((x) => x !== id) : [...cfg.sections, id]; cfg.preset = null; });
  const applyPreset = (k) => set(() => { const pr = d.presets[k]; cfg.sections = [...pr.sections]; cfg.components = pr.components === "all" ? "all" : [...pr.components]; cfg.preset = k; });

  function draw() {
    const st = d.state;
    const status = el("section", { class: "p-panel sb-status" },
      el("label", { class: "sb-switch" }, el("input", { type: "checkbox", role: "switch", checked: cfg.enabled || null, onchange: (ev) => set(() => { cfg.enabled = ev.target.checked; if (cfg.enabled && !cfg.sections.length) { const pr = d.presets.developer; cfg.sections = [...pr.sections]; cfg.components = "all"; cfg.preset = "developer"; } }) }),
        el("span", { class: "track", "aria-hidden": "true" }), el("b", {}, "Enable Storybook design system")),
      el("p", { class: "small muted" }, `Off by default. Works with Code first and Figma first${st.mode ? ` (this project: ${st.mode === "code-first" ? "Code first" : "Figma first"})` : ""}. Only the checked parts are built; you can change it any time.`),
      el("dl", { class: "p-kv" },
        el("dt", {}, "Storybook"), el("dd", {}, st.exists ? `${st.stories} stories${st.port ? ` · port ${st.port}` : ""}${st.running ? " · running" : ""}` : "not built yet"),
        el("dt", {}, "Public link"), el("dd", {}, st.url ? el("a", { href: st.url, target: "_blank", rel: "noopener" }, st.url.replace(/^https?:\/\//, "")) : "none"),
        el("dt", {}, "Selected"), el("dd", {}, cfg.enabled ? `${cfg.sections.length} sections · ${cfg.components === "all" ? "all components" : `${cfg.components.length} components`}` : "nothing (off)")),
      // "Public link" checked: publish to the project's own repo at /storybook/ (tools/publish_storybook.cjs), on this click only
      cfg.enabled && has("pages") && !dirty ? el("div", { class: "p-actions" }, el("button", { class: "ghost sm", type: "button", onclick: async (ev) => {
        const btn = ev.currentTarget; btn.disabled = true;
        try {
          const c = await api(`/api/project/${enc}/storybook/publish-check`);
          if (!c.ok) { showError(new Error((c.checks || []).filter((x) => !x.ok).map((x) => `${x.reason} ${x.fix}`).join("\n") || c.error)); return; }
          const yes = await askText({ title: "Publish the Storybook", help: `It goes public at ${c.plan.storybook.url} (the project's repo, next to the prototype). Type publish to go ahead.`, placeholder: "publish", okLabel: "Publish" });
          if (!yes || yes.toLowerCase() !== "publish") return;
          toast("Building and publishing the Storybook…");
          const r = await api(`/api/project/${enc}/storybook/publish`, {});
          d.state = r.state; draw(); toast("Published. The link works in about a minute.");
        } catch (e) { showError(e); } finally { btn.disabled = false; }
      } }, icon("i-upload"), "Publish Storybook")) : null);
    if (!cfg.enabled) { body.replaceChildren(status); syncButtons(); return; }
    const presets = el("div", { class: "sb-presets" }, Object.entries(d.presets).map(([k, pr]) => el("button", { type: "button", class: `sb-preset${cfg.preset === k ? " on" : ""}`, onclick: () => applyPreset(k) },
      el("b", {}, pr.label), pr.recommended ? el("span", { class: "rec" }, "Recommended") : null, el("span", { class: "small muted" }, pr.note))));
    const groups = d.groups.map((g, gi) => el("section", { class: "p-panel sb-group" },
      el("h2", { class: "section-title" }, `${gi + 1}. ${g.label}`),
      g.id === "components" ? componentPicker() : null,
      el("div", { class: "sb-items" }, g.items.map(([id, label, note]) => el("label", { class: "sb-item" },
        el("input", { type: "checkbox", checked: has(id) || null, onchange: () => toggleSection(id) }),
        el("span", {}, label, note ? el("span", { class: "small muted" }, ` · ${note}`) : null))))));
    body.replaceChildren(status, el("h2", { class: "section-title" }, "Quick start"), presets, ...groups);
    syncButtons();
  }
  function componentPicker() {
    const all = cfg.components === "all";
    const picked = new Set(all ? comps.map((c) => c.name) : cfg.components);
    const byGroup = {};
    for (const c of comps) (byGroup[c.group || "Other"] ||= []).push(c);
    const q = compQuery.trim().toLowerCase();
    const search = el("input", { type: "search", class: "sb-search", placeholder: `Search ${comps.length} components…`, value: compQuery, "aria-label": "Search components",
      oninput: (ev) => { compQuery = ev.target.value; const pos = ev.target.selectionStart; draw(); const n = document.querySelector(".sb-search"); n?.focus(); n?.setSelectionRange(pos, pos); } });
    const setPicked = (names, on) => set(() => { const s = new Set(cfg.components === "all" ? comps.map((c) => c.name) : cfg.components); for (const n of names) on ? s.add(n) : s.delete(n); cfg.components = s.size === comps.length && comps.length ? "all" : [...s]; cfg.preset = null; });
    return el("div", { class: "sb-comps" },
      d.components?.error ? el("p", { class: "small conflict" }, d.components.error) : null,
      !comps.length ? el("p", { class: "small muted" }, d.components?.source === null ? "No components found yet: Figma first projects list their registry; Code first projects list the components of the linked code repo (Sync with Figma > Settings)." : "No components found.") : null,
      comps.length ? el("div", { class: "row" },
        el("label", { class: "sb-item" }, el("input", { type: "checkbox", checked: all || null, onchange: (ev) => set(() => { cfg.components = ev.target.checked ? "all" : []; cfg.preset = null; }) }), el("b", {}, `All components (${comps.length})`)),
        el("span", { style: "flex:1" }), search) : null,
      comps.length ? el("div", { class: "sb-compgroups" }, Object.entries(byGroup).map(([g, list]) => {
        const shown = list.filter((c) => !q || c.name.toLowerCase().includes(q));
        if (!shown.length) return null;
        const allIn = list.every((c) => picked.has(c.name));
        return el("div", { class: "sb-compgroup" },
          el("label", { class: "sb-item gh" }, el("input", { type: "checkbox", checked: allIn || null, onchange: (ev) => setPicked(list.map((c) => c.name), ev.target.checked) }), el("b", {}, g), el("span", { class: "small muted" }, ` · ${list.length}`)),
          el("div", { class: "sb-compnames" }, shown.map((c) => el("label", { class: "sb-item" }, el("input", { type: "checkbox", checked: picked.has(c.name) || null, onchange: (ev) => setPicked([c.name], ev.target.checked) }), el("span", {}, c.name)))));
      })) : null);
  }
  function syncButtons() {
    saveBtn.disabled = !dirty || null;
    saveBtn.textContent = dirty ? "Save" : "Saved";
    buildBtn.disabled = (!cfg.enabled || dirty) || null;
    buildBtn.title = !cfg.enabled ? "Turn Storybook on first" : dirty ? "Save first" : "Claude builds only the checked parts";
  }
  saveBtn.onclick = async () => {
    try { const r = await api(`/api/project/${enc}/storybook`, { config: cfg }); cfg = { ...r.config }; d.state = r.state; dirty = false; draw(); toast(cfg.enabled ? "Saved: only the checked parts will be built." : "Storybook is off for this project."); }
    catch (e) { showError(e); }
  };
  buildBtn.onclick = async () => {
    const avail = comps;
    const plan = { build: d.groups.flatMap((g) => g.items).filter((i) => cfg.sections.includes(i[0])).map((i) => ({ id: i[0], label: i[1] })), components: cfg.components === "all" ? avail.map((c) => c.name) : cfg.components, componentDetail: cfg.sections.filter((s) => d.groups[1].items.some((i) => i[0] === s)) };
    start({ prompt: SB_PROMPT(p.name, plan, d.state.mode), project: p.name, title: `Storybook: ${p.title}` }).catch(showError);
  };
  draw();
}

// ---------- GitHub: one repo per project (tools/project_repo.cjs) ----------
// Who is editing (a banner on every project page), the repo and its live links, the files a second designer would miss,
// what this computer needs, and edit access. Project repos are always public; keys never go in (the guard blocks them).
async function editorBanner(main, p) {
  const enc = encodeURIComponent(p.name);
  let e;
  try { e = await api(`/api/project/${enc}/github/editor`); } catch { return; }
  if (!e || e.off) return;
  let box;
  // Not signed in to GitHub: Start editing / Take over opens the GitHub sign-in (gh auth login --web, browser) and
  // waits for it, then takes the project, instead of an error dialog.
  const signInThenTake = async (action) => {
    try {
      const r = await api("/api/github/login", {});
      if (!r.ok) { toast(r.message || "Could not open the GitHub sign-in."); return; }
    } catch (err) { showError(err); return; }
    let stop = false;
    const wait = el("div", { class: "ed-banner free", role: "status" }, icon("i-login"),
      el("span", {}, "Finish signing in to GitHub in your browser (press Enter in the window that opened, then paste the code it shows). You become the editor right after."),
      el("button", { class: "ghost sm", type: "button", onclick: () => { stop = true; wait.replaceWith(box); } }, "Cancel"));
    box.replaceWith(wait);
    for (const until = Date.now() + 5 * 60e3; !stop && Date.now() < until;) {
      await new Promise((ok) => setTimeout(ok, 3000));
      let s; try { s = await api(`/api/project/${enc}/github/editor`); } catch { continue; }
      if (s?.me) { e.me = s.me; if (!stop) { wait.replaceWith(box); act(action); } return; }
    }
    if (!stop) { wait.replaceWith(box); toast("GitHub sign-in did not finish. Try Start editing again."); }
  };
  const act = async (action, extra = {}) => {
    if (!e.me && action === "take") return signInThenTake(action);
    try {
      const r = await api(`/api/project/${enc}/github/editor`, { action, ...extra });
      toast(r.asked ? `Asked ${r.asked} to hand over. You can edit once they do.` : r.fromStale ? `${r.fromStale} had not edited for a while; you are the editor now.` : action === "take" ? "You are the editor now." : action === "handover" ? "Handed over." : "You keep editing.");
      if (r.note) toast(r.note);
      renderProjectPage(p.name, decodeURIComponent(location.hash.split("/")[3] || "pipeline"));
    } catch (err) { if (err.code === "github_signin") return signInThenTake(action); showError(err); }
  };
  const when = (t) => (t ? fmtDate(t) : "");
  if (e.mine && e.request) box = el("div", { class: "ed-banner ask", role: "status" }, icon("i-users"),
    el("span", {}, el("b", {}, e.request.by), ` asks to take over this project (${when(e.request.at)}).`),
    el("button", { class: "primary sm", type: "button", onclick: () => act("handover", { toRequester: true }) }, `Hand over to ${e.request.by}`),
    el("button", { class: "ghost sm", type: "button", onclick: () => act("keep") }, "Keep editing"));
  else if (e.mine) box = el("div", { class: "ed-banner mine", role: "status" }, icon("i-pen"), el("span", {}, "You are editing this project. Others see it and wait."),
    el("button", { class: "ghost sm", type: "button", onclick: () => act("handover") }, "Hand over"));
  else if (e.editor) box = el("div", { class: `ed-banner other${e.stale ? " stale" : ""}`, role: "status" }, icon("i-alert"),
    el("span", {}, el("b", {}, e.editor.login), e.stale ? ` was editing, but not for over ${e.staleHours} hours.` : ` is editing this project since ${when(e.editor.since)}. Edits by two people at once can overwrite each other.`),
    e.request?.by && e.request.by !== e.editor.login ? el("span", { class: "small muted" }, `${e.request.by} asked to take over.`) : null,
    el("button", { class: e.stale ? "primary sm" : "ghost sm", type: "button", onclick: () => act("take") }, e.stale ? "Take over" : "Ask to take over"));
  else box = el("div", { class: "ed-banner free", role: "status" }, icon("i-users"), el("span", {}, "Nobody is editing this project right now."),
    el("button", { class: "ghost sm", type: "button", onclick: () => act("take") }, "Start editing"));
  main.prepend(box);
}

async function drawGithub(main, p) {
  const enc = encodeURIComponent(p.name);
  const recheck = el("button", { class: "ghost sm", type: "button" }, icon("i-refresh"), "Check again");
  main.append(head(p, "GitHub", "One repo holds the whole project, so the next designer opens it and continues.", [recheck]));
  const body = el("div", { class: "gh-page" }, el("p", { class: "p-empty" }, "Reading the repo…"));
  main.append(body);
  let g, files = null;
  const load = async (withFiles) => { g = await api(`/api/project/${enc}/github${withFiles ? "?files=1" : ""}`); if (withFiles) files = g.files; draw(); };
  recheck.onclick = () => load(!!files).catch(showError);
  const post = async (action, payload, okMsg) => { try { const r = await api(`/api/project/${enc}/github/${action}`, payload || {}); if (r.repo !== undefined) { g = r; if (r.files) files = r.files; } if (okMsg) toast(typeof okMsg === "function" ? okMsg(r) : okMsg); draw(); return r; } catch (e) { showError(e); return null; } };
  const row = (ok, label, fix, optional) => el("li", {}, el("span", { class: `dot ${ok ? "good" : optional ? "wait" : "bad"}` }), el("span", {}, el("b", {}, label), ok ? null : el("span", { class: "small muted" }, ` · ${fix}`)));

  function draw() {
    const a = g.access || {};
    const site = g.plan?.mode === "project-repo" ? g.plan.site : null;
    // 1. the repo and its links
    const repoPanel = el("section", { class: "p-panel" },
      el("h2", { class: "section-title" }, "Repo and live links"),
      g.repo ? el("dl", { class: "p-kv" },
        el("dt", {}, "Repo"), el("dd", {}, el("a", { href: `https://github.com/${g.repo}`, target: "_blank", rel: "noopener" }, g.repo)),
        el("dt", {}, "You"), el("dd", {}, !a.signedIn ? "not signed in to GitHub" : a.admin ? `${a.login} (owner)` : a.push ? `${a.login} (can edit)` : `${a.login} (can view)`),
        el("dt", {}, "Live links"), el("dd", {}, site ? el("span", {}, el("a", { href: site, target: "_blank", rel: "noopener" }, site.replace(/^https:\/\//, "")), " → /prototype/ and /storybook/") : "each part has its own link (as before)"))
        : el("p", { class: "small muted" }, "This project has no GitHub repo yet. It gets one the first time you publish or share it."),
      g.repo ? el("label", { class: "gh-field" }, el("span", {}, "Publish to"),
        el("select", { "aria-label": "Publish to", onchange: (ev) => post("settings", { pages: ev.target.value }, "Saved. The next Publish uses it.") },
          el("option", { value: "project-repo", selected: g.settings.pages === "project-repo" || null }, "This repo: /prototype/ and /storybook/ (one link page)"),
          el("option", { value: "separate", selected: g.settings.pages !== "project-repo" || null }, "As now: each part keeps its own link"))) : null,
      el("p", { class: "small muted" }, "Project repos are public: anyone with the link can see the designs, so the links stay inside the company. Keys and tokens never go in; the guard below blocks them."));

    // 2. files
    const f = files;
    const filesPanel = el("section", { class: "p-panel" },
      el("h2", { class: "section-title" }, "Files a second designer needs"),
      !g.isRepo ? el("p", { class: "small muted" }, "The project folder is not a Git repo yet.") : !f ? el("p", { class: "small muted" }, "Check which project files are not on GitHub yet, and which stay on this computer.")
        : el("div", { class: "gh-files" },
          f.secrets.length ? el("p", { class: "small conflict" }, `Keys or tokens in ${f.secrets.length} place(s): ${f.secrets.slice(0, 4).map((x) => `${x.file}:${x.line} (${x.kind})`).join(", ")}. Remove them before uploading.`) : null,
          el("p", { class: "small" }, el("b", {}, `${f.notCommitted.length} not uploaded yet`), f.notCommitted.length ? ` · ${f.notCommitted.slice(0, 6).map((x) => x.file).join(", ")}${f.notCommitted.length > 6 ? "…" : ""}` : " · everything is on GitHub"),
          f.localOnly.length ? el("ul", { class: "pchk" }, f.localOnly.map((x) => el("li", {}, el("span", { class: `dot ${x.upload ? "wait" : "good"}` }), el("span", {}, el("b", {}, x.file), el("span", { class: "small muted" }, ` · ${x.reason || "ignored by .gitignore: check whether the next designer needs it"}`))))) : null,
          f.keptSecret.length ? el("p", { class: "small muted" }, `Stay on this computer (keys): ${f.keptSecret.join(", ")}.`) : null,
          el("p", { class: "small muted" }, `${f.machine} machine files (packages, builds) are left out on purpose; each computer makes its own.`)),
      g.isRepo ? el("div", { class: "p-actions" },
        el("button", { class: "ghost sm", type: "button", onclick: () => load(true).catch(showError) }, icon("i-search"), "Check files"),
        a.push && f && f.notCommitted.length && !f.secrets.length ? el("button", { class: "primary sm", type: "button", onclick: async (ev) => {
          const msg = await askText({ title: "Upload project files", help: `${f.notCommitted.length} file(s) go to ${g.repo}. The comments' public Supabase key goes with them; secret keys never do.`, placeholder: "What changed (e.g. Profile screen and new Badge)", okLabel: "Upload" });
          if (!msg) return; ev.target.disabled = true; await post("upload", { message: msg }, "Uploaded to GitHub.");
        } }, icon("i-upload"), "Upload to GitHub") : null) : null);

    // 3. this computer
    const setup = el("section", { class: "p-panel" },
      el("h2", { class: "section-title" }, "On this computer"),
      el("ul", { class: "pchk" }, g.setup.map((s) => row(s.ok, s.label, s.fix, s.optional))),
      el("p", { class: "small muted" }, g.comments.inProject ? "Comments: the Supabase URL and public key come with the project." : "Comments: the Supabase URL and public key go with the project at the next upload or publish."),
      g.isRepo && !g.guard ? el("div", { class: "p-actions" }, el("button", { class: "ghost sm", type: "button", onclick: () => post("guard", {}, "The secrets guard is on for this project on this computer.").then(() => load(!!files)) }, icon("i-shield"), "Turn on the secrets guard")) : null);

    // 4. access
    const access = g.repo ? el("section", { class: "p-panel" },
      el("h2", { class: "section-title" }, "Edit access"),
      !a.signedIn ? el("p", { class: "small" }, "Sign in with GitHub (Connect services) to edit or request access.")
        : !a.push ? el("div", { class: "p-actions" }, el("p", { class: "small" }, "You can view and comment. To change the project, ask its owner."),
          el("button", { class: "primary sm", type: "button", onclick: () => post("request-access", {}, (r) => r.manual ? "Opened a prefilled request; send it on GitHub." : r.already ? "Your request is already open." : "Request sent to the owner.").then((r) => { if (r?.manual) window.open(r.url, "_blank", "noopener"); }) }, icon("i-send"), "Request edit access"))
        : null,
      a.admin ? el("div", { class: "gh-requests" },
        el("p", { class: "small" }, el("b", {}, g.requests.length ? `${g.requests.length} request(s) to edit` : "No open requests to edit.")),
        ...g.requests.map((r) => el("div", { class: "p-actions" }, el("span", {}, el("b", {}, r.login), el("span", { class: "small muted" }, ` · ${fmtDate(r.at)}`)),
          el("a", { href: r.url, target: "_blank", rel: "noopener", class: "small" }, "request"),
          el("button", { class: "primary sm", type: "button", onclick: () => post("approve", { number: r.number }, `${r.login} can edit now (GitHub sends them an invitation).`) }, icon("i-plus"), "Add as collaborator"))),
        el("label", { class: "gh-field" }, el("span", {}, "Who merges changes"),
          el("select", { "aria-label": "Who merges changes", onchange: (ev) => post("settings", { merge_policy: ev.target.value }, "Saved.") },
            el("option", { value: "owner", selected: g.settings.merge_policy !== "editors" || null }, "Only the owner (editors send a review)"),
            el("option", { value: "editors", selected: g.settings.merge_policy === "editors" || null }, "Editors may merge their own changes")))) : null,
      a.push && !a.admin ? el("div", { class: "p-actions" }, el("p", { class: "small" }, g.mayMerge ? "You can edit and merge your own changes." : "You can edit; the owner merges your changes."),
        el("button", { class: "ghost sm", type: "button", onclick: async () => {
          const t = await askText({ title: "Send my changes for review", help: "Your changes go to a branch of your own and a pull request for the owner.", placeholder: "What changed", okLabel: "Send" });
          if (t) post("review", { title: t }, (r) => (r.url ? "Pull request opened." : "Sent on your branch.")).then((r) => { if (r?.url) window.open(r.url, "_blank", "noopener"); });
        } }, icon("i-branch"), "Send my changes for review")) : null) : null;

    body.replaceChildren(repoPanel, filesPanel, setup, access || "");
  }
  try { await load(false); } catch (e) { body.replaceChildren(el("p", { class: "p-empty" }, e.message)); }
}

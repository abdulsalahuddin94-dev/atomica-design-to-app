// Dashboard front end: plain JavaScript, no build step. Talks to server.mjs on this computer.
"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "html") n.innerHTML = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid.nodeType ? kid : String(kid));
  return n;
};
const api = async (url, body, method) => {
  const r = await fetch(url, body === undefined && !method ? {} : { method: method || "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ago = (ms) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

// ---------- theme ----------
(() => {
  let saved = null;
  try { saved = localStorage.getItem("theme"); } catch {}
  if (saved) document.documentElement.dataset.theme = saved;
  $("#theme").addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme
      ? document.documentElement.dataset.theme === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("theme", document.documentElement.dataset.theme); } catch {}
  });
})();

// ---------- tiny Markdown (what Claude's replies use: headings, lists, bold, code, links, tables) ----------
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}
function markdown(src) {
  const lines = String(src).replace(/\r/g, "").split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre><code>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || "")) {
      const row = (l) => l.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = row(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(row(lines[i++]));
      out.push(`<div class="tablewrap"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length > 2 ? 4 : 3}>${inline(h[2])}</h${h[1].length > 2 ? 4 : 3}>`); i++; continue; }
    if (/^\s*([-*•]|\d+[.)])\s+/.test(line)) {
      const ordered = /^\s*\d+[.)]/.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*•]|\d+[.)])\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*•]|\d+[.)])\s+/, ""));
        i++;
      }
      out.push(`<${ordered ? "ol" : "ul"}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${ordered ? "ol" : "ul"}>`);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|\s*([-*•]|\d+[.)])\s+)/.test(lines[i]) && !/^\s*\|.*\|\s*$/.test(lines[i])) para.push(lines[i++]);
    out.push(`<p>${para.map(inline).join("<br>")}</p>`);
  }
  return out.join("");
}

// ---------- update banner ----------
async function checkUpdates(fetchRemote) {
  const box = $("#update");
  try {
    const info = await api(`/api/workflow?fetch=${fetchRemote ? 1 : 0}`);
    if (!info.git || !info.behind) { if (!box.classList.contains("ok")) box.hidden = true; return; }
    box.className = "update";
    box.replaceChildren(
      icon("i-download"),
      el("div", { class: "what" },
        el("b", {}, `A new workflow update is ready (${info.behind} change${info.behind > 1 ? "s" : ""}).`),
        info.changes.length ? el("ul", {}, info.changes.slice(0, 6).map((c) => el("li", {}, c))) : null),
      el("button", { class: "ghost", type: "button", onclick: () => { box.hidden = true; } }, "Later"),
      el("button", { class: "primary", type: "button", onclick: runUpdate }, "Update now"),
    );
    box.hidden = false;
  } catch { box.hidden = true; }
}
async function runUpdate() {
  const box = $("#update");
  box.replaceChildren(el("div", { class: "what" }, "Updating the workflow…"));
  try {
    const r = await api("/api/workflow/update", {});
    box.className = "update " + (r.ok ? "ok" : "err");
    box.replaceChildren(
      el("div", { class: "what" }, el("b", {}, r.message),
        r.ok ? el("div", { class: "note" }, r.needsInstall
          ? "The dashboard itself changed: close its window and open Start-Dashboard again."
          : "New skills and rules apply from your next request.") : null),
      el("button", { class: "ghost", type: "button", onclick: () => { box.hidden = true; box.className = "update"; } }, "Close"),
    );
  } catch (e) {
    box.className = "update err";
    box.replaceChildren(el("div", { class: "what" }, "The update failed: " + e.message));
  }
}

// ---------- router ----------
let current = null; // { id, es }
let projects = [];
window.addEventListener("hashchange", route);
function route() {
  const m = location.hash.match(/^#\/chat\/([\w-]+)/);
  const pm = location.hash.match(/^#\/project\/([^/]+)(?:\/([\w-]+))?/); // project pages (project-pages.js)
  const page = m ? "chat" : pm ? "project" : /^#\/settings/.test(location.hash) ? "settings" : /^#\/projects/.test(location.hash) ? "projects" : /^#\/styles/.test(location.hash) ? "styles" : "home";
  for (const a of document.querySelectorAll("[data-nav]")) a.classList.toggle("on", a.dataset.nav === (page === "project" ? "projects" : page));
  if (page !== "project") hideProjectNav();
  // Inside a project the conversation gets the whole width: the app sidebar steps aside.
  document.body.classList.toggle("focus", page === "chat");
  if (current?.es) { current.es.close(); current.cleanup?.(); current = null; }
  if (page === "chat") renderChat(m[1]); else if (page === "project") renderProjectPage(decodeURIComponent(pm[1]), pm[2] || "pipeline"); else if (page === "settings") renderSettings(); else if (page === "projects") renderProjects(); else if (page === "styles") renderStyles(); else renderHome();
}

// ---------- Settings ----------
const fmtTokens = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : String(n || 0);
// Each tool's own mark (brand symbols in index.html), in its brand colour where it has one.
const TOOL_ICON = { claude: "b-claude", codex: "b-openai", gemini: "b-gemini", cursor: "b-cursor", copilot: "b-copilot", antigravity: "b-antigravity" };
const brandIcon = (id) => icon(id, `ic brand-fill ${id.slice(2)}`);
const figmaIcon = () => { const s = icon("b-figma-color", "logo-ic"); s.setAttribute("viewBox", "0 0 256 384"); return s; };

async function renderSettings() {
  const app = $("#app");
  app.replaceChildren($("#tpl-settings").content.cloneNode(true));
  $("#s-refresh").addEventListener("click", () => loadTools(true));
  loadTools(false);
  loadAwake();
  loadUsage();
  loadIntegrations();
}

async function loadTools(fresh) {
  const list = $("#s-tool-list");
  let data;
  try { data = await api(`/api/tools${fresh ? "?fresh=1" : ""}`); } catch (e) { list?.replaceChildren(el("p", { class: "muted" }, e.message)); return; }
  if (!$("#s-tool-list")) return;
  const pick = $("#s-fallback-pick");
  pick.value = data.settings.fallbackTool;
  pick.onchange = () => api("/api/settings", { fallbackTool: pick.value }).catch(showError);
  list.replaceChildren(...data.tools.map((t) => toolCard(t, data.settings)));
}

async function loadAwake() {
  const pick = $("#s-awake-pick");
  const show = (st) => {
    if (!$("#s-awake-pick")) return;
    pick.checked = !!st.keepAwake;
    const err = st.keepAwake && st.awake && !st.awake.on ? st.awake.error || "Keep awake could not start on this computer." : "";
    $("#s-awake-note").classList.toggle("warn-text", !!err);
    if (err) $("#s-awake-note").textContent = err;
  };
  try { show(await api("/api/settings")); } catch (e) { showError(e); }
  pick.onchange = async () => {
    try {
      const st = await api("/api/settings", { keepAwake: pick.checked });
      show(st);
      toast(st.keepAwake ? (st.awake?.on ? "This computer stays awake while the dashboard runs." : "Keep awake could not start.") : "Normal sleep is back.");
    } catch (e) { pick.checked = !pick.checked; showError(e); }
  };
}

function toolCard(t, settings) {
  const state = !t.installed ? ["off", "Not installed"] : t.signedIn === true ? ["ok", t.account ? `Signed in · ${t.account}` : "Signed in"] : t.signedIn === false ? ["warn", "Not signed in"] : ["idle", t.app ? "Installed" : "Sign in once if asked"];
  const act = async (url, body = {}) => { try { const r = await api(url, body); toast(r.message || (r.ok ? "Opened in a new window." : "Could not open it.")); } catch (e) { showError(e); } };
  const actions = [];
  if (!t.installed) actions.push(el("a", { class: "ghost", href: t.install, target: "_blank", rel: "noopener" }, icon("i-download"), "How to install"));
  else {
    if (t.id === "claude") actions.push(el("button", { type: "button", class: "ghost", onclick: () => openSignIn() }, icon("i-login"), "Sign in again"));
    else if (!t.app) actions.push(el("button", { type: "button", class: "ghost", onclick: () => act(`/api/tools/${t.id}/login`) }, icon("i-login"), t.signedIn ? "Sign in again" : "Sign in"));
    if (t.id !== "claude" && (t.run || t.app)) actions.push(el("button", { type: "button", class: "ghost", onclick: () => act(`/api/tools/${t.id}/open`) }, icon("i-external"), "Open"));
  }
  let model = null;
  if (t.installed && t.run && t.id !== "claude") {
    const listId = `models-${t.id}`;
    const input = el("input", { type: "text", list: listId, value: settings.models?.[t.id] || "", placeholder: "The tool's own default", autocomplete: "off", spellcheck: "false" });
    input.addEventListener("change", () => api("/api/settings", { models: { [t.id]: input.value } }).then(() => toast("Model saved.")).catch(showError));
    model = el("label", { class: "field compact" }, el("span", {}, "Model"), input, el("datalist", { id: listId }, (t.models || []).map((m) => el("option", { value: m }))));
  }
  return el("article", { class: "sheet tool" + (t.installed ? "" : " missing") },
    el("div", { class: "tool-head" },
      el("span", { class: "tool-ic" }, TOOL_ICON[t.id] ? brandIcon(TOOL_ICON[t.id]) : icon("i-blocks")),
      el("div", { class: "tool-name" }, el("h3", {}, t.name), el("span", { class: "meta" }, [t.company, t.version].filter(Boolean).join(" · "))),
      t.id === "claude" ? el("span", { class: "tag main" }, "Runs here") : null),
    el("div", { class: `state ${state[0]}` }, state[1]),
    t.note ? el("p", { class: "note" }, t.note) : null,
    t.loginHint && t.installed && t.signedIn !== true && t.id !== "claude" ? el("p", { class: "note" }, t.loginHint) : null,
    model,
    actions.length ? el("div", { class: "tool-actions" }, actions) : null);
}

async function loadUsage() {
  const box = $("#s-usage-body");
  let u;
  try { u = await api("/api/usage"); } catch (e) { box?.replaceChildren(el("p", { class: "muted" }, e.message)); return; }
  if (!$("#s-usage-body")) return;
  const tools = Object.keys(u.byTool);
  if (!tools.length) { box.replaceChildren(el("p", { class: "muted" }, "No usage yet. It is counted from your next conversation in the dashboard.")); return; }
  const row = (id) => {
    const t = u.byTool[id];
    return el("tr", {}, el("th", { scope: "row" }, id === "claude" ? "Claude Code" : id),
      el("td", {}, fmtTokens(t.today.input + t.today.output)), el("td", {}, String(t.today.turns)),
      el("td", {}, fmtTokens(t.week.input + t.week.output)), el("td", {}, String(t.week.turns)),
      el("td", {}, t.week.cost ? `$${t.week.cost.toFixed(2)}` : "–"));
  };
  const projects = Object.entries(u.byProject).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0)).slice(0, 6);
  box.replaceChildren(
    el("div", { class: "tablewrap" }, el("table", {},
      el("thead", {}, el("tr", {}, el("th", {}, "Tool"), el("th", {}, "Tokens today"), el("th", {}, "Turns today"), el("th", {}, "Tokens, 7 days"), el("th", {}, "Turns, 7 days"), el("th", {}, "Cost estimate, 7 days"))),
      el("tbody", {}, tools.map(row)))),
    projects.length ? el("div", { class: "chips usage-projects" }, projects.map(([name, per]) => el("span", { class: "chip" }, `${name} · ${fmtTokens(Object.values(per).reduce((x, y) => x + y, 0))}`))) : null,
    u.limits.length ? el("p", { class: "note warn-line" }, icon("i-alert"), `Last limit: ${new Date(u.limits[0].at).toLocaleString()} · ${u.limits[0].limit}`) : null);
}

async function loadIntegrations() {
  let d;
  try { d = await api("/api/integrations"); } catch (e) { return; }
  const gh = $("#s-github-body");
  if (!gh) return;
  const kv = (k, v) => el("div", { class: "kv-row" }, el("span", {}, k), el("b", {}, v));
  gh.replaceChildren(
    kv("Account", d.github.signedIn ? d.github.account : d.github.cli ? "Not signed in" : "GitHub CLI not installed"),
    d.github.repo ? kv("Workflow repo", el("a", { href: d.github.repo.replace(/^git@github\.com:/, "https://github.com/"), target: "_blank", rel: "noopener" }, d.github.repo.replace(/^https:\/\/github\.com\//, ""))) : null,
    el("p", { class: "note" }, "Used to update the workflow, share team projects and send contributions for review."),
    el("button", { type: "button", class: "ghost", onclick: async () => { try { toast((await api("/api/github/login", {})).ok ? "GitHub sign-in opened in a new window. Finish it in the browser." : "Could not open it."); } catch (e) { showError(e); } } }, icon("i-login"), d.github.signedIn ? "Sign in again" : "Sign in with GitHub"));
  $("#s-figma-body").replaceChildren(
    ...(d.figma.lines.length ? d.figma.lines.map((l) => { const [k, ...v] = l.split(":"); return kv(k.trim(), v.join(":").trim() || "–"); }) : [el("p", { class: "muted" }, "Python is needed for the Figma tools check.")]),
    el("p", { class: "note" }, "FigCli Yolo is the main Figma tool; the Desktop Bridge is used for slots. Setup: Figma_Tools/README.md."));
  const mode = $("#perm")?.dataset.mode || "auto";
  $("#s-prefs-body").replaceChildren(
    kv("Permissions", mode === "default" ? "Ask every time" : "Auto"),
    el("button", { type: "button", class: "ghost", onclick: openPerm }, icon("i-shield"), "Change"),
    kv("Node.js", d.machine.node), kv("Python", d.machine.python || "missing"), kv("Git", d.machine.git || "missing"));
}

function toast(text, action, ms = 6000) {
  document.querySelector(".toast")?.remove();
  const t = el("div", { class: "toast", role: "status" }, el("span", {}, text),
    action ? el("button", { type: "button", class: "toast-btn", onclick: () => { t.remove(); action.run(); } }, action.icon ? icon(action.icon) : null, action.label) : null);
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
  return t;
}

// Hands a conversation to another tool (writes the note, opens the tool in its own window).
async function openToolPicker(sessionId, onDone) {
  let dlg = $("#toolpick");
  if (!dlg) { document.body.append($("#tpl-toolpick").content.cloneNode(true)); dlg = $("#toolpick"); }
  const list = $("#toolpick-list");
  list.replaceChildren(el("p", { class: "muted" }, "Checking which tools are installed…"));
  dlg.showModal();
  let data;
  try { data = await api("/api/tools"); } catch (e) { list.replaceChildren(el("p", { class: "muted" }, e.message)); return; }
  const usable = data.tools.filter((t) => t.id !== "claude" && t.installed && (t.run || t.app));
  if (!usable.length) { list.replaceChildren(el("p", { class: "muted" }, "No other tool is installed. See Settings.")); return; }
  // Gemini CLI answers inside this conversation (ACP); the others open in their own window with the handoff note.
  list.replaceChildren(...usable.map((t) => el("button", { type: "button", class: "opt-btn" + (t.id === data.settings.fallbackTool ? " rec" : ""), onclick: async () => {
    dlg.close();
    try {
      if (t.id === "gemini") await api(`/api/sessions/${sessionId}/agent`, { agent: "gemini" });
      else { const r = await api(`/api/sessions/${sessionId}/handoff`, { tool: t.id }); onDone?.(r); }
    } catch (e) { showError(e); }
  } }, el("span", { class: "l" }, `${t.id === "gemini" ? "Gemini CLI, here in this conversation" : t.name}${t.id === data.settings.fallbackTool ? " (your choice in Settings)" : ""}`),
    el("span", { class: "d" }, t.id === "gemini" ? "Answers in this window and asks before every edit or command. Switch back to Claude any time from the Tool menu."
      : t.app ? "Opens the app on this folder; ask it to read the handoff note." : `Opens in its own window${data.settings.models?.[t.id] ? ` with ${data.settings.models[t.id]}` : ""}.`))));
}

// ---------- start a conversation ----------
const PROMPTS = {
  new: "Start the intake (Design_System_Intake_Skill). I want to start a new project.",
  join: "Start the intake (Design_System_Intake_Skill). I want to join a team project.",
  project: (p) => `Start the intake (Design_System_Intake_Skill). Work on the existing project "${p}" (My Projects/${p}).`,
};

async function start(body) {
  const s = await api("/api/sessions", body);
  location.hash = `#/chat/${s.id}`;
}

function askText({ title, help, okLabel = "Start", placeholder = "" }) {
  return new Promise((resolve) => {
    let dlg = $("#ask");
    if (!dlg) { document.body.append($("#tpl-dialog").content.cloneNode(true)); dlg = $("#ask"); }
    $("#ask-title").textContent = title;
    $("#ask-help").textContent = help || "";
    $("#ask-ok").textContent = okLabel;
    const input = $("#ask-input");
    input.value = "";
    input.placeholder = placeholder;
    dlg.onclose = () => resolve(dlg.returnValue === "ok" && input.value.trim() ? input.value.trim() : null);
    dlg.showModal();
    input.focus();
  });
}

async function startKind(kind) {
  if (kind === "new") return start({ prompt: PROMPTS.new, title: "New project" });
  if (kind === "join") return start({ prompt: PROMPTS.join, title: "Join a team project" });
  if (kind === "quick") {
    const t = await askText({ title: "Quick task", help: "One component, an audit or one fix on a live Figma file.", placeholder: "e.g. Audit the Buttons page of the open file" });
    if (t) start({ prompt: `/ds-quick ${t}`, title: `Quick: ${t}` });
    return;
  }
  const t = await askText({ title: "Ask Claude", help: "Anything you would type in the terminal.", placeholder: "Write your request…" });
  if (t) start({ prompt: t, title: t });
}

// ---------- Add to the workflow ----------
// Each kind runs /contribute (CONTRIBUTING.md), which does the work on a branch and opens a pull request for review.
const ADD = {
  reference: {
    title: "Add a reference design system",
    need: [
      "The Figma link of the design system file. Use a file that is published, or one the company allows you to study (the repo is public).",
      "The company name and the platform. One platform per run.",
      "Figma Desktop open with that file, connected with FigCli Yolo or the Desktop Bridge.",
    ],
    steps: [
      "Claude studies the file read only; the original is never changed.",
      "The Setup group first (variables, text styles, icons), then every component with Light and Dark screenshots.",
      "It writes Reference_Library/<Company>/<Platform>/ and the entry in references.json.",
      "It shows you the result, then sends it as a pull request. After it is merged, new projects can start from it.",
    ],
    note: "This takes a whole session for one platform.",
    fields: [
      { name: "company", label: "Company name", placeholder: "e.g. Acme" },
      { name: "platform", label: "Platform", options: ["Web", "iOS", "Android", "Cross-platform"] },
      { name: "link", label: "Figma link", placeholder: "https://www.figma.com/design/…", pattern: "https://(www\\.)?figma\\.com/.+" },
    ],
    prompt: (v) => `/contribute Add a reference design system: company "${v.company}", platform ${v.platform}, Figma link ${v.link}. Study it with /study-reference-ds (References.md > "Adding a design system to the library").`,
    title2: (v) => `Add reference: ${v.company} ${v.platform}`,
  },
  icons: {
    title: "Add an icon library",
    need: [
      "The library's name.",
      "Its website, GitHub or npm link.",
    ],
    steps: [
      "Claude checks the license: free, SVG, allowed in commercial work.",
      "It finds the library's Iconify prefix and its styles (outline, filled…).",
      "It adds an entry to tools/icon_libraries.json, shows it to you, then sends it as a pull request.",
      "After it is merged, the intake offers it at the icon question. Nothing is installed on your computer.",
    ],
    note: "",
    fields: [
      { name: "name", label: "Library name", placeholder: "e.g. Iconoir" },
      { name: "link", label: "Link", placeholder: "https://…", pattern: "https://.+" },
    ],
    prompt: (v) => `/contribute Add an icon library: "${v.name}" (${v.link}).`,
    title2: (v) => `Add icons: ${v.name}`,
  },
  skill: {
    title: "Add a skill from GitHub",
    need: [
      "The GitHub link of the skill: its repository, or the folder that has its SKILL.md.",
      "Optional: what it should help with.",
    ],
    steps: [
      "Claude reads it without installing it and checks the license (MIT or similar).",
      "It compares it with what the workflow already does and tells you what it would add, before changing anything.",
      "If you agree, the useful parts are added as an adopted guide (credited, in Workflow_References/) or as a new skill or step.",
      "It shows you the change, then sends it as a pull request.",
    ],
    note: "",
    fields: [
      { name: "link", label: "GitHub link", placeholder: "https://github.com/…", pattern: "https://github\\.com/.+" },
      { name: "why", label: "What should it help with? (optional)", placeholder: "e.g. better iOS screens", optional: true },
    ],
    prompt: (v) => `/contribute Add a skill from GitHub: ${v.link}.${v.why ? ` It should help with: ${v.why}.` : ""} Read it without installing it, check its license, compare it with what the workflow already covers and show me what it would add before changing anything; then adopt the useful parts (CONTRIBUTING.md section 1: adopted guide or new skill).`,
    title2: (v) => `Add skill: ${v.link.replace(/^https:\/\/github\.com\//, "")}`,
  },
  style: {
    title: "Add a style",
    need: [
      "The style's name and a link to where it comes from: a public style guide, a repository or a site.",
      "Its license must allow reuse (MIT or similar), or it is your own style.",
    ],
    steps: [
      "Claude checks the license.",
      "It writes Style_Library/<slug>/DESIGN.md in the same shape as the others: colors with hex, typography, components, spacing, radius, elevation, do's and don'ts.",
      "It rebuilds the index (tools/build_style_index.py), shows you the result, then sends it as a pull request.",
      "After it is merged, the intake and the Style library page offer it to new projects.",
    ],
    note: "A style is a look only: components keep the reference structure. A style named after a company says \"inspired by\" and never copies its logo or identity.",
    fields: [
      { name: "name", label: "Style name", placeholder: "e.g. Soft Pastel" },
      { name: "link", label: "Link to the source", placeholder: "https://…", pattern: "https://.+" },
    ],
    prompt: (v) => `/contribute Add a style to the Style library: "${v.name}" (${v.link}). Check its license, write Style_Library/<slug>/DESIGN.md in the same shape as the other styles, run python tools/build_style_index.py and follow Style_Library/README.md > "Adding or updating styles".`,
    title2: (v) => `Add style: ${v.name}`,
  },
};

function openAdd(kind) {
  const spec = ADD[kind];
  let dlg = $("#adddlg");
  if (!dlg) { document.body.append($("#tpl-add").content.cloneNode(true)); dlg = $("#adddlg"); }
  $("#add-title").textContent = spec.title;
  $("#add-need").replaceChildren(...spec.need.map((t) => el("li", {}, t)));
  $("#add-steps").replaceChildren(...spec.steps.map((t) => el("li", {}, t)));
  $("#add-note").textContent = spec.note;
  const inputs = spec.fields.map((f) => {
    const input = f.options
      ? el("select", { name: f.name }, f.options.map((o) => el("option", { value: o }, o)))
      : el("input", { name: f.name, type: "text", placeholder: f.placeholder, required: !f.optional, pattern: f.pattern, autocomplete: "off", dir: "auto" });
    return { f, input, row: el("label", { class: "field" }, el("span", {}, f.label), input) };
  });
  $("#add-fields").replaceChildren(...inputs.map((i) => i.row));
  dlg.onclose = () => {
    if (dlg.returnValue !== "ok") return;
    const v = Object.fromEntries(inputs.map((i) => [i.f.name, i.input.value.trim()]));
    start({ prompt: spec.prompt(v), title: spec.title2(v) }).catch(showError);
  };
  dlg.returnValue = "";
  dlg.showModal();
  inputs[0]?.input.focus();
}

// ---------- permission mode ----------
const MODE_LABEL = { auto: "Auto", default: "Ask every time" };
async function refreshPerm() {
  const btn = $("#perm");
  try {
    const st = await api("/api/settings");
    btn.hidden = false;
    btn.textContent = `Permissions: ${MODE_LABEL[st.permissionMode] || st.permissionMode}`;
    btn.dataset.mode = st.permissionMode;
  } catch { btn.hidden = true; }
}

function openPerm() {
  let dlg = $("#permdlg");
  if (!dlg) { document.body.append($("#tpl-perm").content.cloneNode(true)); dlg = $("#permdlg"); }
  const mode = $("#perm").dataset.mode || "auto";
  for (const r of dlg.querySelectorAll("input[name=mode]")) r.checked = r.value === mode;
  dlg.onclose = async () => {
    if (dlg.returnValue !== "ok") return;
    const picked = dlg.querySelector("input[name=mode]:checked")?.value;
    if (picked && picked !== mode) { try { await api("/api/settings", { permissionMode: picked }); } catch (e) { showError(e); } refreshPerm(); }
  };
  dlg.returnValue = "";
  dlg.showModal();
}

// ---------- Home ----------
async function renderHome() {
  const app = $("#app");
  app.replaceChildren($("#tpl-home").content.cloneNode(true));
  for (const b of app.querySelectorAll("[data-start]")) b.addEventListener("click", () => startKind(b.dataset.start).catch(showError));
  fetchProjects().then(() => {
    setTally("jobs", projects.length);
    setTally("sync", projects.filter((p) => p.unsynced).length);
    loadInsights();
  }).catch(() => {});
  loadRecent();
  loadFigmaTally();
}

async function fetchProjects() {
  ({ projects } = await api("/api/projects"));
  return projects;
}

// ---------- Projects ----------
let projectView = "cards";
try { projectView = localStorage.getItem("projectView") === "table" ? "table" : "cards"; } catch {}

function renderProjects() {
  const app = $("#app");
  app.replaceChildren($("#tpl-projects").content.cloneNode(true));
  $("#refresh").addEventListener("click", () => { loadProjects(); checkUpdates(true); });
  $("#add-project").addEventListener("click", () => openProjectForm());
  $("#open-github").addEventListener("click", () => openFromGitHub());
  for (const b of app.querySelectorAll("[data-view]")) {
    b.setAttribute("aria-pressed", String(b.dataset.view === projectView));
    b.addEventListener("click", () => {
      projectView = b.dataset.view;
      try { localStorage.setItem("projectView", projectView); } catch {}
      for (const x of app.querySelectorAll("[data-view]")) x.setAttribute("aria-pressed", String(x.dataset.view === projectView));
      drawProjects();
    });
  }
  loadProjects();
}

// A project opens on its Pipeline page; "Continue in chat" there starts the conversation (project-pages.js).
const openProject = (p) => { location.hash = `#/project/${encodeURIComponent(p.name)}/pipeline`; };

function rowActions(p) {
  return el("span", { class: "row-actions" },
    el("button", { type: "button", class: "iconbtn sq", title: `Rename ${p.title}`, "aria-label": `Rename ${p.title}`, onclick: () => openProjectForm(p) }, icon("i-edit")),
    el("button", { type: "button", class: "iconbtn sq danger", title: `Delete ${p.title}`, "aria-label": `Delete ${p.title}`, onclick: () => openDelete(p) }, icon("i-trash")));
}

// Add (a folder from the project template) or rename (the display name in status.json; the folder keeps its name).
function openProjectForm(p) {
  let dlg = $("#projdlg");
  if (!dlg) { document.body.append($("#tpl-project-form").content.cloneNode(true)); dlg = $("#projdlg"); }
  const edit = !!p;
  const input = $("#proj-name");
  $("#proj-title").textContent = edit ? `Rename ${p.title}` : "Add a project";
  $("#proj-help").textContent = edit ? "Only the name shown here changes. The folder keeps its name, so links and paths keep working." : "A folder is made in My Projects from the project template. The intake then asks the rest, one question at a time.";
  $("#proj-ok").textContent = edit ? "Save" : "Add project";
  $("#proj-start-row").hidden = edit;
  input.value = edit ? p.title : "";
  const folder = () => { $("#proj-folder").textContent = edit ? `Folder: My Projects/${p.name}` : (input.value.trim() ? `Folder: My Projects/${input.value.trim().normalize("NFC").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "")}` : ""); };
  input.oninput = folder;
  folder();
  dlg.onclose = async () => {
    if (dlg.returnValue !== "ok" || !input.value.trim()) return;
    try {
      if (edit) {
        await api(`/api/projects/${encodeURIComponent(p.name)}`, { title: input.value.trim() }, "PATCH");
        toast("Renamed.");
        return loadProjects();
      }
      const r = await api("/api/projects", { title: input.value.trim() });
      if ($("#proj-start").checked) return start({ prompt: `Start the intake (Design_System_Intake_Skill). I want to start a new project named "${r.title}". Its folder already exists: My Projects/${r.name} (made from the template by the dashboard), so skip creating it and continue from the next question.`, project: r.name, title: r.title });
      toast(`Added ${r.title}.`);
      loadProjects();
    } catch (e) { showError(e); }
  };
  dlg.returnValue = "";
  dlg.showModal();
  input.focus();
  input.select();
}

function openDelete(p) {
  let dlg = $("#deldlg");
  if (!dlg) { document.body.append($("#tpl-delete").content.cloneNode(true)); dlg = $("#deldlg"); }
  const input = $("#del-confirm");
  const ok = $("#del-ok");
  $("#del-name").textContent = p.title;
  $("#del-folder").textContent = `My Projects/${p.name}`;
  $("#del-team").hidden = !p.team;
  input.value = "";
  ok.disabled = true;
  input.oninput = () => { ok.disabled = input.value.trim() !== "Delete"; };
  dlg.onclose = async () => {
    if (dlg.returnValue !== "ok" || input.value.trim() !== "Delete") return;
    try {
      const r = await api(`/api/projects/${encodeURIComponent(p.name)}`, undefined, "DELETE");
      loadProjects();
      toast(`${p.title} was deleted.`, { label: "Undo", icon: "i-undo", run: async () => {
        try { await api(`/api/projects/${encodeURIComponent(r.id)}/restore`, {}); toast(`${p.title} is back.`); loadProjects(); } catch (e) { showError(e); }
      } }, r.undoMs - 2000);
    } catch (e) { showError(e); }
  };
  dlg.returnValue = "";
  dlg.showModal();
  input.focus();
}

// Files for a project's Inputs folders (intake 0.3b): Brand, Inspiration, Screens, Research.
const INPUT_TABS = [
  { kind: "Brand", icon: "i-palette", text: "Logo, brand book, brand colors, fonts." },
  { kind: "Inspiration", icon: "i-sparkles", text: "Reference designs, competitor apps, screenshots or links you like." },
  { kind: "Screens", icon: "i-monitor", text: "Screenshots of the existing product, if there is one." },
  { kind: "Research", icon: "i-docs", text: "Research, personas, PRDs, any notes about the product." },
];
const fmtSize = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;

function openInputs(p, onRead) {
  let dlg = $("#inputsdlg");
  if (!dlg) { document.body.append($("#tpl-inputs").content.cloneNode(true)); dlg = $("#inputsdlg"); }
  const base = `/api/projects/${encodeURIComponent(p.name)}/inputs`;
  let tab = "Brand";
  let files = {};
  const added = [];
  const readBtn = $("#inputs-read");
  readBtn.hidden = true;
  const tabs = $("#inputs-tabs");
  const panel = $("#inputs-panel");
  const drawTabs = () => tabs.replaceChildren(...INPUT_TABS.map((t) => el("button", { type: "button", role: "tab", "aria-selected": String(t.kind === tab), onclick: () => { tab = t.kind; drawTabs(); drawPanel(); } },
    icon(t.icon), t.kind, files[t.kind]?.length ? el("span", { class: "count" }, String(files[t.kind].length)) : null)));
  const upload = async (list) => {
    for (const f of list) {
      if (f.size > 50 * 1048576) { toast(`${f.name} is over 50 MB; copy it into the folder by hand.`); continue; }
      const row = el("li", { class: "uploading" }, el("span", { class: "fname" }, f.name), el("span", { class: "note" }, "Adding…"));
      panel.querySelector(".file-list")?.prepend(row);
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      try { const r = await api(base, { kind: tab, name: f.name, data }); added.push(`${tab}/${r.name}`); } catch (e) { toast(`${f.name}: ${e.message}`); }
    }
    readBtn.hidden = !added.length || !onRead;
    await refresh();
  };
  const drawPanel = () => {
    const t = INPUT_TABS.find((x) => x.kind === tab);
    const picker = el("input", { type: "file", multiple: true, hidden: true, onchange: (ev) => { upload([...ev.target.files]); ev.target.value = ""; } });
    const zone = el("div", { class: "dropzone", tabindex: "0", role: "button", "aria-label": `Add files to ${tab}`,
      onclick: () => picker.click(), onkeydown: (k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); picker.click(); } } },
      icon("i-upload"), el("b", {}, "Drop files here"), el("span", {}, "or ", el("u", {}, "browse"), " your computer"), el("small", {}, t.text), picker);
    zone.addEventListener("dragover", (ev) => { ev.preventDefault(); zone.classList.add("over"); });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (ev) => { ev.preventDefault(); zone.classList.remove("over"); upload([...ev.dataTransfer.files]); });
    const list = el("ul", { class: "file-list" }, (files[tab] || []).map((f) => el("li", {},
      el("span", { class: "fname", title: f.name }, f.name), el("span", { class: "note" }, fmtSize(f.size)),
      el("button", { type: "button", class: "iconbtn sq", "aria-label": `Remove ${f.name}`, title: "Remove", onclick: async () => {
        try { await api(`${base}?kind=${encodeURIComponent(tab)}&file=${encodeURIComponent(f.name)}`, undefined, "DELETE"); await refresh(); } catch (e) { showError(e); }
      } }, icon("i-x")))));
    panel.replaceChildren(zone, (files[tab] || []).length ? el("p", { class: "col-title" }, `In Inputs/${tab}`) : null, list);
  };
  const refresh = async () => { try { files = (await api(base)).inputs; } catch {} drawTabs(); drawPanel(); };
  dlg.onclose = () => {
    if (dlg.returnValue === "read" && added.length) onRead?.(added);
    else if (added.length) toast(`${added.length} file${added.length > 1 ? "s" : ""} added to Inputs.`);
    p.onInputs?.();
  };
  dlg.returnValue = "";
  drawTabs(); drawPanel();
  refresh();
  dlg.showModal();
}

// Inline icon from the sprite in index.html.
const icon = (name, cls = "ic") => {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${name}`);
  svg.append(use);
  return svg;
};

function linkChip(l) {
  const mark = l.kind === "figma" ? figmaIcon() : l.kind === "github" ? brandIcon("b-github") : l.kind === "storybook" ? brandIcon("b-storybook") : l.kind === "prototype" ? icon("i-phone") : icon("i-external");
  return el("a", { class: "chip", href: l.url, target: "_blank", rel: "noopener", title: l.url }, mark, l.kind === "figma" ? `Figma · ${l.label}` : l.label);
}

// The proof sign-offs every project moves through (Intake section 8 checkpoints, then the final audit).
const STAGES = ["Intake", "Foundation", "Components", "Screens", "Audit"];
// Reads where a project stands from its brief and changelog text; -1 when nothing says.
function stageIndex(p) {
  const text = [p.phase, p.next, p.last?.title].filter(Boolean).join(" ").toLowerCase();
  const next = text.match(/next (?:phase|step)[:\s]+(\w+)/);
  const at = next ? STAGES.findIndex((s) => next[1].startsWith(s.toLowerCase().slice(0, 5))) : -1;
  if (at >= 0) return at;
  let best = -1;
  STAGES.forEach((s, i) => { if (text.includes(s.toLowerCase().slice(0, 5))) best = i; });
  if (best >= 0 && /(done|approved|finished|complete)/.test(text) && best < STAGES.length - 1) best += 1;
  return best;
}
function track(p) {
  const at = stageIndex(p);
  return el("div", { class: "stage" },
    el("div", { class: "stage-now" + (at >= 0 ? "" : " unknown") }, at >= 0 ? STAGES[at] : "Stage not recorded", at >= 0 ? el("span", {}, `${at + 1} of ${STAGES.length}`) : null),
    el("ol", { class: "track", "aria-hidden": "true" },
      STAGES.map((s, i) => el("li", { class: i < at ? "done" : i === at ? "now" : "" }, el("span", {}, s)))));
}
const jobNo = (i) => `No.${String(i + 1).padStart(3, "0")}`;

// Figma connection for the Home counter: FigCli Yolo answers on port 9222 when Figma Desktop runs patched.
let integrationsCache = null;
const getIntegrations = () => (integrationsCache ||= api("/api/integrations").catch(() => null));
// The Figma tile: the default tool and its state, then the three tools with a dot each (click one for details and setup).
async function loadFigmaTally() {
  const dd = $("#t-figma");
  if (!dd) return;
  let st;
  try { st = await getFigmaTools(); } catch { dd.textContent = "–"; return; }
  const draw = () => {
    if (!dd.isConnected) return;
    const def = figmaToolsCache.tools[figmaToolsCache.default];
    dd.classList.add("ftile");
    dd.replaceChildren(el("span", { class: "fnow" }, `${figmaToolName(figmaToolsCache.default)} · ${def.checking ? "checking" : def.connected ? "Connected" : "Needs setup"}`), figmaToolRows(figmaToolsCache));
    dd.parentElement.classList.toggle("off", !def.connected);
    dd.parentElement.title = def.reason;
  };
  draw();
  refreshFigmaToolsLater(draw);
}

// "Worth a look": facts from the projects, usage and workflow, each with one action. Nothing is invented.
async function loadInsights() {
  const list = $("#insight-list");
  if (!list) return;
  const items = [];
  const day = 864e5;
  const [usage, wf, integ] = await Promise.all([api("/api/usage").catch(() => null), api("/api/workflow").catch(() => null), getIntegrations()]);
  const unsynced = projects.filter((p) => p.unsynced);
  if (unsynced.length) {
    const p = unsynced[0];
    items.push({ tone: "warn", icon: brandIcon("b-storybook"), title: `${unsynced.length} project${unsynced.length > 1 ? "s have" : " has"} Figma changes not in Storybook`,
      text: unsynced.map((x) => `${x.title} (${x.unsynced})`).join(", "), action: `Update ${p.title}`, run: () => start({ prompt: `Update the Storybook of the project "${p.name}" from Figma.`, project: p.name, title: `Storybook: ${p.title}` }) });
  }
  const idle = projects.filter((p) => p.last?.date && Date.now() - Date.parse(p.last.date) > 7 * day).sort((a, b) => Date.parse(a.last.date) - Date.parse(b.last.date));
  if (idle.length) {
    const p = idle[0];
    const days = Math.round((Date.now() - Date.parse(p.last.date)) / day);
    items.push({ tone: "idle", icon: icon("i-clock"), title: `${p.title} has been quiet for ${days} days`, text: p.next ? `Next: ${p.next}` : "No next step recorded.", action: "Continue", run: () => start({ prompt: PROMPTS.project(p.name), project: p.name, title: p.title }) });
  }
  const stageCounts = {};
  for (const p of projects) { const i = stageIndex(p); if (i >= 0) stageCounts[STAGES[i]] = (stageCounts[STAGES[i]] || 0) + 1; }
  const stageLine = STAGES.filter((s) => stageCounts[s]).map((s) => `${stageCounts[s]} at ${s}`).join(" · ");
  if (stageLine) items.push({ tone: "info", icon: icon("i-pen"), title: "Where the jobs stand", text: stageLine });
  const c = usage?.byTool?.claude;
  if (c && (c.today.turns || c.week.turns)) {
    items.push({ tone: "info", icon: brandIcon("b-claude"), title: `Claude used ${fmtTokens(c.today.input + c.today.output)} tokens today`, text: `${c.today.turns} turns today · ${fmtTokens(c.week.input + c.week.output)} over 7 days. Details in Settings.`, action: "Usage", run: () => { location.hash = "#/settings"; } });
  }
  const lastLimit = usage?.limits?.[0];
  if (lastLimit && Date.now() - lastLimit.at < day) {
    items.push({ tone: "warn", icon: icon("i-alert"), title: "Claude reached its usage limit today", text: lastLimit.limit, action: "Fallback tool", run: () => { location.hash = "#/settings"; } });
  }
  const yolo = (integ?.figma?.lines || []).find((l) => /yolo/i.test(l)) || "";
  if (integ && !/port 9222 open/i.test(yolo)) {
    items.push({ tone: "warn", icon: figmaIcon(), title: "Figma is not connected", text: "Open Figma Desktop (patched for FigCli Yolo) before Claude works on a file.", action: "Check", run: () => { location.hash = "#/settings"; } });
  }
  if (wf?.git && wf.behind) items.push({ tone: "warn", icon: icon("i-download"), title: `A workflow update is ready (${wf.behind})`, text: wf.changes?.[0] || "New skills and rules.", action: "Update now", run: runUpdate });
  if (!items.length) { $("#insights-wrap").hidden = true; return; }
  $("#insights-wrap").hidden = false;
  list.replaceChildren(...items.slice(0, 6).map((it) => el("article", { class: `insight ${it.tone}` },
    el("span", { class: "insight-ic" }, it.icon),
    el("div", { class: "insight-body" }, el("h3", {}, it.title), el("p", { dir: "auto" }, it.text)),
    it.action ? el("button", { type: "button", class: "ghost", onclick: () => Promise.resolve(it.run()).catch(showError) }, it.action, icon("i-right")) : null)));
}

function setTally(key, value) {
  const n = $(`#t-${key}`);
  if (n) n.textContent = String(value);
}

async function loadProjects() {
  const list = $("#project-list");
  if (!list) return;
  try { await fetchProjects(); } catch (e) { list.replaceChildren(el("p", { class: "muted" }, e.message)); return; }
  drawProjects();
}

function drawProjects() {
  const list = $("#project-list");
  if (!list) return;
  if (!projects.length) {
    list.className = "tickets";
    list.replaceChildren(el("div", { class: "sheet empty" },
      el("h3", {}, "No projects yet"),
      el("p", { class: "muted" }, "Add a project, or start one with the intake from the Dashboard. It appears here with its stage and next step."),
      el("button", { class: "primary", type: "button", onclick: () => openProjectForm() }, icon("i-plus"), "Add project")));
    return;
  }
  if (projectView === "table") {
    list.className = "project-table tablewrap";
    list.replaceChildren(el("table", {},
      el("thead", {}, el("tr", {}, ["Project", "Platform", "Stage", "Last change", "Next step", "Updated", ""].map((h) => el("th", { scope: "col" }, h)))),
      el("tbody", {}, projects.map((p) => {
        const at = stageIndex(p);
        return el("tr", {},
          el("th", { scope: "row" }, el("div", { class: "name-cell" }, el("button", { type: "button", class: "link strong", onclick: () => openProject(p) }, p.title), p.team ? el("span", { class: "tag team" }, "Team") : null, p.unsynced ? el("span", { class: "chip warn" }, `${p.unsynced} not in Storybook`) : null)),
          el("td", { class: "mono" }, p.platform || "–"),
          el("td", {}, at >= 0 ? el("span", { class: "stage-pill" }, el("i", { style: `--at:${(at + 1) / STAGES.length}` }), STAGES[at]) : el("span", { class: "muted" }, "Not recorded")),
          el("td", {}, p.last ? [el("time", { class: "mono" }, p.last.date), el("div", { class: "note clamp", title: p.last.title }, p.last.title)] : el("span", { class: "muted" }, "–")),
          el("td", { title: p.next || "", dir: "auto" }, el("div", { class: "clamp-cell" }, p.next || el("span", { class: "muted" }, "–"))),
          el("td", { class: "mono nowrap" }, p.updated ? ago(p.updated) : "–"),
          el("td", { class: "nowrap" }, el("span", { class: "row-actions" },
            el("button", { type: "button", class: "ghost sm", onclick: () => openProject(p) }, "Open", icon("i-right")),
            rowActions(p))));
      }))));
    return;
  }
  list.className = "tickets" + (projects.length < 3 ? " few" : "");
  list.replaceChildren(...projects.map((p, i) => el("article", { class: "sheet ticket" },
    el("div", { class: "ticket-head" },
      el("span", { class: "jobno" }, jobNo(i)),
      el("div", { style: "flex:1;min-width:0" },
        el("h3", {}, p.title),
        p.platform ? el("div", { class: "meta" }, p.platform) : null),
      p.team ? el("span", { class: "tag team" }, "Team") : null,
      rowActions(p)),
    track(p),
    p.last
      ? el("div", { class: "last" }, icon("i-clock"), el("span", {}, el("time", {}, p.last.date), " · ", p.last.title))
      : el("div", { class: "last" }, icon("i-clock"), el("span", {}, "Intake not finished")),
    p.next ? el("div", { class: "next", dir: "auto", title: p.next }, el("b", {}, "Next"), el("span", {}, p.next)) : null,
    (p.unsynced || p.links.length) ? el("div", { class: "chips" },
      p.unsynced ? el("span", { class: "chip warn" }, icon("i-alert"), `${p.unsynced} change${p.unsynced > 1 ? "s" : ""} not in Storybook`) : null,
      p.links.map(linkChip)) : null,
    el("div", { class: "go" },
      el("span", { class: "note" }, p.updated ? `updated ${ago(p.updated)}` : ""),
      el("button", { class: "primary", type: "button", onclick: () => openProject(p) }, "Open", icon("i-right")),
    ),
  )));
}

// Recent conversations: the first thing the user wrote is the title (several conversations of one project would
// otherwise all read as the project name), with the project as a tag. Search and Show all reach the last 40.
const recent = { rows: [], all: false, q: "" };
async function loadRecent() {
  try {
    const { live, past } = await api("/api/sessions");
    setTally("live", live.length);
    recent.rows = [...live.map((s) => ({ ...s, live: true })), ...past];
    if (!$("#recent-wrap")) return;
    $("#recent-wrap").hidden = !recent.rows.length;
    const search = $("#recent-search");
    search.hidden = recent.rows.length <= 8;
    search.oninput = () => { recent.q = search.value.trim().toLowerCase(); drawRecent(); };
    drawRecent();
  } catch {}
}
function drawRecent() {
  const list = $("#recent-list");
  if (!list) return;
  const label = (r) => r.preview || (r.project && r.title === r.project ? "Project work" : r.title) || "Conversation";
  const match = (r) => !recent.q || `${label(r)} ${r.project || ""} ${r.title || ""}`.toLowerCase().includes(recent.q);
  const found = recent.rows.filter(match);
  const rows = recent.all || recent.q ? found : found.slice(0, 8);
  const hide = async (r) => {
    try {
      await api("/api/sessions/hide", { claudeSessionId: r.claudeSessionId });
      loadRecent();
      toast("Removed from the list. Claude still has the conversation.", { label: "Undo", icon: "i-undo", run: () => api("/api/sessions/hide", { claudeSessionId: r.claudeSessionId, hidden: false }).then(loadRecent).catch(showError) });
    } catch (e) { showError(e); }
  };
  list.replaceChildren(...(rows.length ? rows.map((r) => el("li", {},
    el("time", { title: new Date(r.updated || r.started).toLocaleString() }, ago(r.updated || r.started)),
    el("span", { class: "dot" + (r.live ? " live" : ""), title: r.live ? "Running" : "Finished" }),
    el("span", { class: "title" },
      r.project ? el("span", { class: "proj" }, r.project.replace(/_/g, " ")) : null,
      el("span", { class: "text", dir: "auto", title: label(r) }, label(r))),
    el("span", { class: "row-actions" },
      r.live
        ? el("button", { class: "ghost", type: "button", onclick: () => { location.hash = `#/chat/${r.id}`; } }, "Open")
        : el("button", { class: "ghost", type: "button", onclick: () => start({ resume: r.claudeSessionId, project: r.project, title: r.title }).catch(showError) }, "Continue"),
      r.live ? null : el("button", { class: "icon-btn", type: "button", title: "Remove from the list", "aria-label": "Remove from the list", onclick: () => hide(r) }, icon("i-x"))),
  )) : [el("li", { class: "empty" }, el("span", { class: "note" }, "No conversation matches."))]));
  const more = $("#recent-more");
  more.hidden = !!recent.q || found.length <= 8;
  more.textContent = recent.all ? "Show fewer" : `Show all ${found.length}`;
  more.onclick = () => { recent.all = !recent.all; drawRecent(); };
}

function showError(e) {
  alert(e.message || String(e));
}

// ---------- Chat ----------
let knownModels = [];
const modelName = (v) => knownModels.find((m) => m.value === v)?.name || v || "Default";
const fmtTime = (ms) => {
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + (sameDay ? "" : ` ${d.toLocaleDateString([], { weekday: "short" })}`);
};
const QUICK = [
  { label: "Continue", hint: "Resume from the project's next step", prompt: (p) => PROMPTS.project(p) },
  { label: "Run an audit", hint: "ds-auditor on the DS and Design files", prompt: (p) => `Run the audit (ds-auditor) on the project "${p}" and report the numbers.` },
  { label: "Add or change a component", hint: "Describe it, Claude follows the atomic rules", ask: "Which component, and what should change?", prompt: (p, t) => `In the project "${p}": ${t}` },
  { label: "Change a token", hint: "A color, spacing, radius or type value", ask: "Which token and what value?", prompt: (p, t) => `In the project "${p}", change this token: ${t}` },
  { label: "Update Storybook", hint: "Resync from the Figma DS file", prompt: (p) => `Update the Storybook of the project "${p}" from Figma.` },
  { label: "Project status", hint: "Checkpoints, to-dos, what is next", prompt: (p) => `Show the status of the project "${p}": checkpoints, user to-dos and the next step. Do not change anything.` },
];

// mount: where the conversation goes (the whole page, or the Design workspace's chat panel in project-pages.js).
function renderChat(id, mount) {
  const app = mount || $("#app");
  app.replaceChildren($("#tpl-chat").content.cloneNode(true));
  const log = $("#log");
  const input = $("#input");
  const state = { id, busy: false, pending: new Set(), images: [], lastShots: [], shotRows: [], toolRow: null, live: null, session: null };
  current = { id, state };

  const scroll = () => { log.scrollTop = log.scrollHeight; };
  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 160;
  // Jump to latest: shown while the user reads further up, with how many messages arrived meanwhile.
  const jump = $("#jump");
  let unread = 0;
  const syncJump = () => {
    const away = !nearBottom();
    if (!away) unread = 0;
    jump.hidden = !away;
    jump.querySelector("span").textContent = unread ? `${unread} new` : "Latest";
    jump.style.bottom = `${$("#composer").offsetHeight + 12}px`;
  };
  jump.addEventListener("click", () => { log.scrollTo({ top: log.scrollHeight, behavior: "smooth" }); unread = 0; });
  log.addEventListener("scroll", syncJump, { passive: true });
  const add = (node) => {
    const stick = nearBottom(); removeTyping(); log.append(node);
    if (stick) scroll(); else if (node.classList?.contains("msg") || node.classList?.contains("qcard") || node.classList?.contains("pcard")) unread++;
    updateTyping(); syncJump(); return node;
  };
  // A line with the date and time when more than 30 minutes passed between messages (continued conversations).
  let lastAt = 0;
  const stamp = (at) => {
    if (at && lastAt && at - lastAt > 30 * 60000) add(el("div", { class: "sys time-sep" }, new Date(at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })));
    if (at) lastAt = at;
  };
  const timeTitle = (at) => at ? new Date(at).toLocaleString() : null;
  // Copy buttons: one per Claude reply (its Markdown) and one per code block.
  const copyBtn = (get, label = "Copy") => el("button", { type: "button", class: "copy", title: label, "aria-label": label, onclick: async (ev) => {
    ev.stopPropagation();
    const b = ev.currentTarget;
    const text = get();
    let ok = false;
    // Some embedded browsers leave the clipboard call waiting for a permission that never comes: give up after 1 s.
    try { await Promise.race([navigator.clipboard.writeText(text), new Promise((_, no) => setTimeout(no, 1000))]); ok = true; } catch {
      // Older or locked-down browsers: copy through a hidden text box.
      const t = el("textarea", { style: "position:fixed;opacity:0;pointer-events:none" });
      t.value = text; document.body.append(t); t.select();
      try { ok = document.execCommand("copy"); } catch {}
      t.remove();
    }
    if (ok) { b.classList.add("done"); setTimeout(() => b.classList.remove("done"), 1400); } else toast("Could not copy. Select the text instead.");
  } }, icon("i-copy"), icon("i-check", "ic ok"));
  const finishReply = (node, raw) => {
    node.dataset.raw = raw;
    for (const pre of node.querySelectorAll("pre")) pre.append(copyBtn(() => pre.querySelector("code")?.textContent || pre.textContent, "Copy code"));
    node.append(el("div", { class: "msg-foot" }, copyBtn(() => node.dataset.raw, "Copy reply")));
    return node;
  };
  // Folds long rows of tool steps: the newest 5 stay visible, the earlier ones open with one click.
  const foldTools = (row) => {
    const chips = [...row.querySelectorAll(".t")];
    let btn = row.querySelector(".more");
    if (row.dataset.open || chips.length <= 6) { btn?.remove(); chips.forEach((c) => { c.hidden = false; }); return; }
    chips.forEach((c, i) => { c.hidden = i < chips.length - 5; });
    if (!btn) btn = el("button", { type: "button", class: "more", onclick: () => { row.dataset.open = "1"; foldTools(row); } });
    btn.textContent = `+${chips.length - 5} earlier steps`;
    row.prepend(btn);
  };
  // Browser tab title: says when Claude needs an answer or finished while you were in another tab.
  const openedAt = Date.now();
  const baseTitle = "Atomica";
  const attention = (text, at) => { if (document.hidden && (at || 0) >= openedAt) document.title = `${text} · ${baseTitle}`; };
  const clearAttention = () => { if (!document.hidden) document.title = baseTitle; };
  document.addEventListener("visibilitychange", clearAttention);
  current.cleanup = () => { document.removeEventListener("visibilitychange", clearAttention); document.title = baseTitle; };
  let typing = null;
  const removeTyping = () => { typing?.remove(); typing = null; };
  const updateTyping = () => {
    removeTyping();
    const who = state.agent === "gemini" ? "Gemini" : "Claude";
    if (state.busy && !state.pending.size) { typing = el("div", { class: "typing" + (state.agent === "gemini" ? " gemini" : ""), "aria-label": `${who} is working` }, el("i"), el("i"), el("i")); log.append(typing); }
    $("#stop").hidden = !state.busy;
    $("#status-line").textContent = state.limit && state.agent !== "gemini" ? (state.limit.resetsAt ? `Claude is over its usage limit until ${fmtTime(state.limit.resetsAt)}. Messages you send now wait and go out then, or switch the tool to Gemini.` : "Claude is over its usage limit. Messages you send now wait until it is back.") :
      state.pending.size ? `${who} is waiting for your answer above.` : state.busy ? `${who} is working…` :
      state.agent === "gemini" ? "Gemini CLI answers in this conversation. It asks before every edit or command." :
      state.session?.ended ? "Ready. Your next message continues this same conversation." : "Ready.";
  };

  // Sidebar
  const fillSide = (session) => {
    const p = projects.find((x) => x.name === session.project);
    $("#side-kicker").textContent = p ? `${jobNo(projects.indexOf(p))} · ${p.platform || p.name}` : "Conversation";
    $("#side-title").textContent = p ? p.title : session.title;
    $("#side-meta").textContent = p && p.next ? `Next: ${p.next}` : "";
    $("#side-track").replaceChildren(...(p ? [track(p)] : []));
    $("#side-links").replaceChildren(...(p ? p.links.map(linkChip) : []));
    const inputsBtn = $("#add-inputs");
    inputsBtn.hidden = !p;
    if (p) {
      const count = () => api(`/api/projects/${encodeURIComponent(p.name)}/inputs`).then((r) => {
        const n = Object.values(r.inputs).reduce((a, l) => a + l.length, 0);
        $("#inputs-count").textContent = n ? `${n} file${n > 1 ? "s" : ""}` : "";
      }).catch(() => {});
      count();
      inputsBtn.onclick = () => openInputs({ ...p, onInputs: count }, (added) =>
        send(`I added these files to the project's Inputs folder: ${added.map((a) => `Inputs/${a}`).join(", ")}. Read them and use them (intake 0.3b / 0.3c: Brand for colors and fonts, Inspiration and Research for the direction, Screens for the existing product).`));
    }
    const actions = $("#side-actions");
    actions.replaceChildren();
    if (p) {
      actions.append(el("p", { class: "sub" }, "Quick actions"));
      for (const q of QUICK) {
        actions.append(el("button", { type: "button", onclick: async () => {
          let text = "";
          if (q.ask) { text = await askText({ title: q.label, help: q.ask, okLabel: "Send" }); if (!text) return; }
          send(q.prompt(p.name, text));
        } }, q.label, el("small", {}, q.hint)));
      }
    }
  };
  if (!projects.length) api("/api/projects").then((r) => { projects = r.projects; if (state.session) fillSide(state.session); }).catch(() => {});

  // Events from Claude
  const es = new EventSource(`/api/sessions/${id}/events`);
  current.es = es;
  // The dashboard restarted (or the stream dropped): reconnect by itself. A conversation that is no longer running
  // is continued from its Claude session (same history); the page that hosts it is told the new id ("chat-reconnect").
  let reconnecting = null;
  es.onerror = () => {
    if (es.readyState !== EventSource.CLOSED || reconnecting) return;
    reconnecting = add(el("div", { class: "sys reconnecting" }, "Reconnecting…"));
    reconnect();
  };
  async function reconnect() {
    const sess = state.session || {};
    for (let i = 0; i < 60; i++) {
      if (current?.es !== es) return; // the user left this conversation
      try {
        const { live, past } = await api("/api/sessions");
        let to = live.find((x) => x.id === id) || (sess.claudeSessionId && live.find((x) => x.claudeSessionId === sess.claudeSessionId));
        if (!to && sess.claudeSessionId && past.some((x) => x.claudeSessionId === sess.claudeSessionId))
          to = await api("/api/sessions", { resume: sess.claudeSessionId, project: sess.project, title: sess.title });
        if (to) {
          current.cleanup?.(); current = null;
          const ev = new CustomEvent("chat-reconnect", { cancelable: true, detail: { from: id, to: to.id, claudeSessionId: to.claudeSessionId || sess.claudeSessionId || null } });
          if (!window.dispatchEvent(ev)) return; // a host page (the Design workspace) mounts it again itself
          if (to.id !== id) location.hash = `#/chat/${to.id}`; else renderChat(id, mount);
          return;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 1500));
    }
    reconnecting.textContent = "Lost the connection to the dashboard. Is its window still open?";
    reconnecting.classList.add("err");
  }
  es.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    switch (e.type) {
      case "hello":
        log.replaceChildren();
        Object.assign(state, { busy: false, pending: new Set(), lastShots: [], shotRows: [], toolRow: null, live: null, firstPrompt: null, session: e.session, limit: null, limitCard: null, agent: e.session.agent || "claude" });
        fillSide(e.session);
        setAgent(state.agent);
        loadAgents();
        break;
      case "user":
        if (!state.firstPrompt) state.firstPrompt = e.text;
        state.toolRow = null; state.live = null; state.lastShots = []; state.shotRows = [];
        stamp(e.at);
        add(el("div", { class: "msg user", dir: "auto", title: timeTitle(e.at) }, e.text, (e.images || []).map((src) => el("img", { src, alt: "Attached image" }))));
        break;
      case "delta":
        state.toolRow = null;
        if (!state.live) state.live = add(el("div", { class: "msg claude" + (e.agent === "gemini" ? " gemini" : ""), dir: "auto" }));
        state.live.dataset.raw = (state.live.dataset.raw || "") + e.text;
        state.live.innerHTML = markdown(state.live.dataset.raw);
        if (nearBottom()) scroll();
        break;
      case "text":
        state.toolRow = null;
        if (state.live && e.streamed) { state.live.innerHTML = markdown(e.text); state.live.title = timeTitle(e.at) || ""; finishReply(state.live, e.text); state.live = null; }
        else { state.live = null; stamp(e.at); add(finishReply(el("div", { class: "msg claude" + (e.agent === "gemini" ? " gemini" : ""), dir: "auto", title: timeTitle(e.at), html: markdown(e.text) }), e.text)); }
        break;
      case "tool":
        state.live = null;
        if (!state.toolRow) state.toolRow = add(el("div", { class: "tools" }));
        state.toolRow.append(el("span", { class: "t" + (e.sub ? " sub" : ""), title: `${e.name} ${e.detail}` }, el("b", {}, e.name), e.detail ? ` ${e.detail}` : ""));
        foldTools(state.toolRow);
        break;
      case "image": {
        state.toolRow = null;
        const shot = shotNode(e.src);
        state.lastShots.push(e.src);
        let last = log.lastElementChild?.classList?.contains("shots") ? log.lastElementChild : null;
        if (!last) { last = add(el("div", { class: "shots" })); state.shotRows.push(last); }
        last.append(shot);
        last.classList.toggle("compare", last.children.length === 2);
        break;
      }
      case "question": {
        state.pending.add(e.requestId);
        attention("Waiting for your answer", e.at);
        const shots = state.lastShots.slice(-4);
        // The screenshots move into the approval card instead of showing twice.
        if (shots.length) for (const row of state.shotRows) row.remove();
        state.shotRows = [];
        add(questionCard(e, shots));
        break;
      }
      case "permission":
        state.pending.add(e.requestId);
        attention("Waiting for your OK", e.at);
        state.toolRow = null; state.live = null;
        add(permissionCard(e));
        break;
      case "answered": {
        state.pending.delete(e.requestId);
        const card = log.querySelector(`[data-request="${e.requestId}"]`);
        if (card) closeCard(card, e);
        state.lastShots = []; state.shotRows = [];
        break;
      }
      case "busy":
        state.busy = e.busy;
        break;
      case "result":
        state.toolRow = null; state.live = null;
        // a new conversation gets its Claude session id with the first reply: keep it, so a reconnect can continue it
        if (state.session && !state.session.claudeSessionId) api("/api/sessions").then((r) => { const me = r.live.find((x) => x.id === id); if (me?.claudeSessionId) state.session.claudeSessionId = me.claudeSessionId; }).catch(() => {});
        attention(e.ok ? "Done" : "Stopped", e.at);
        if (!e.ok && e.error) add(el("div", { class: "sys err" }, e.error));
        break;
      case "error":
        add(el("div", { class: "sys err" }, e.message));
        break;
      case "auth":
        state.live = null; state.toolRow = null;
        add(authCard(e));
        break;
      case "limit":
        state.live = null; state.toolRow = null;
        state.limit = e;
        // One card per limit: a second signal for the same limit updates it instead of stacking another.
        if (state.limitCard?.isConnected && !state.limitCard.classList.contains("done")) state.limitCard.replaceWith(state.limitCard = limitCard(e));
        else state.limitCard = add(limitCard(e));
        break;
      case "held":
        add(el("div", { class: "sys" }, e.resetsAt ? `Held until Claude is back at ${fmtTime(e.resetsAt)}.` : "Held until Claude is back."));
        break;
      case "resumed":
        state.limit = null;
        if (state.limitCard) { state.limitCard.classList.add("done"); state.limitCard.querySelector(".foot")?.remove(); }
        add(el("div", { class: "sys ok" }, e.other ? `Claude is back. Gemini keeps answering until you switch the tool to Claude.` : e.auto ? "Claude is back. This conversation continues from where it stopped." : "Claude is back. Write your next message to continue."));
        break;
      case "autoresume":
        if (state.limit) state.limit.autoResume = e.on;
        break;
      case "model":
        if ($("#model")) $("#model").value = e.model;
        add(el("div", { class: "sys" }, `Model: ${modelName(e.model)}. ${e.agent === "gemini" ? "Gemini" : "Claude"} continues with the same conversation.`));
        break;
      case "agent":
        state.live = null; state.toolRow = null;
        setAgent(e.agent);
        state.limitCard?.querySelector(".to-gemini")?.toggleAttribute("hidden", e.agent === "gemini");
        add(el("div", { class: "sys agent" }, e.agent === "gemini"
          ? "Gemini CLI answers from here, in this same conversation. It reads the conversation so far first and asks before every edit or command."
          : "Claude answers from here. It reads what Gemini did and checks that work first."));
        loadModels();
        break;
      case "ended":
        if (state.session) state.session.ended = true;
        break;
      case "restored":
        // Continue after a restart: the messages above are the earlier window, Claude remembers all of it.
        state.live = null; state.toolRow = null; state.lastShots = []; state.shotRows = [];
        add(el("div", { class: "sys ok" }, e.since ? `Earlier messages up to ${fmtTime(e.since)}. Claude continues from here with the whole conversation in mind.` : "Earlier messages above. Claude continues from here with the whole conversation in mind."));
        break;
    }
    updateTyping();
  };

  function shotNode(src) {
    return el("figure", { class: "shot", onclick: () => lightbox(src) }, el("img", { src, alt: "Screenshot from Claude", loading: "lazy" }));
  }

  function questionCard(e, shots) {
    const card = el("div", { class: "qcard sheet" + (shots.length ? " proof" : ""), "data-request": e.requestId });
    if (shots.length) {
      const wrap = el("div", { class: "shots" + (shots.length === 2 ? " compare" : "") }, shots.map(shotNode));
      card.append(wrap);
    }
    const answers = {};
    const multi = e.questions.some((q) => q.multiSelect) || e.questions.length > 1;
    const submit = () => {
      for (const q of e.questions) if (!answers[q.question]) return;
      api(`/api/sessions/${id}/answer`, { requestId: e.requestId, answers }).catch(showError);
    };
    for (const q of e.questions) {
      const box = el("div", { class: "q" }, el("h4", { dir: "auto" }, q.question));
      const list = el("div", { class: "opts-list" });
      const picked = new Set();
      for (const o of q.options || []) {
        const isBack = /^back$/i.test(o.label);
        const btn = el("button", {
          type: "button", class: "opt-btn" + (/\(recommended\)/i.test(o.label) ? " rec" : "") + (isBack ? " back" : ""), "aria-pressed": "false",
          onclick: () => {
            if (q.multiSelect) {
              picked.has(o.label) ? picked.delete(o.label) : picked.add(o.label);
              btn.setAttribute("aria-pressed", String(picked.has(o.label)));
              answers[q.question] = [...picked].join(", ");
              if (!picked.size) delete answers[q.question];
            } else {
              for (const b of list.children) b.setAttribute("aria-pressed", "false");
              btn.setAttribute("aria-pressed", "true");
              answers[q.question] = o.label;
              if (!multi) submit();
            }
          },
        }, el("span", { class: "l" }, o.label), o.description ? el("span", { class: "d" }, o.description) : null,
          o.preview ? el("pre", {}, o.preview) : null);
        list.append(btn);
      }
      const other = el("input", { type: "text", placeholder: "Other: type your own answer", dir: "auto" });
      const otherSend = el("button", { type: "button", class: "ghost", onclick: () => {
        if (!other.value.trim()) return;
        for (const b of list.children) b.setAttribute("aria-pressed", "false");
        answers[q.question] = other.value.trim();
        if (!multi) submit();
      } }, multi ? "Use this" : "Send");
      other.addEventListener("keydown", (k) => { if (k.key === "Enter") { k.preventDefault(); otherSend.click(); } });
      box.append(list, el("div", { class: "other" }, other, otherSend));
      card.append(box);
    }
    if (multi) card.append(el("div", { class: "foot" }, el("button", { type: "button", class: "primary", onclick: submit }, "Send answers")));
    return card;
  }

  function authCard(e) {
    const note = el("p", { class: "note" }, "Your Claude Code sign-in expired. Sign in here, then press Try again.");
    refreshAccount(true);
    return el("div", { class: "qcard perm" },
      el("h4", {}, e.message),
      note,
      el("div", { class: "foot" },
        el("button", { type: "button", class: "ghost", onclick: () => openSignIn() }, "Sign in"),
        el("button", { type: "button", class: "primary", onclick: () => {
          const sess = state.session || {};
          start({ prompt: state.firstPrompt || "", project: sess.project, title: sess.title }).catch(showError);
        } }, "Try again"),
      ),
    );
  }

  // Claude's plan or rate limit ran out: the conversation waits here and continues by itself when the limit resets.
  // Another tool can take over meanwhile (the tool picked in Settings, or the picker).
  function limitCard(e) {
    const names = { codex: "Codex", gemini: "Gemini CLI" };
    const geminiHere = e.fallback === "gemini" || state.geminiReady;
    const handoffTo = async (tool) => {
      try { const r = await api(`/api/sessions/${id}/handoff`, { tool }); add(el("div", { class: "sys" }, r.message)); } catch (err) { showError(err); }
    };
    const auto = el("input", { type: "checkbox", onchange: () => api(`/api/sessions/${id}/autoresume`, { on: auto.checked }).catch(showError) });
    auto.checked = e.autoResume !== false;
    return el("div", { class: "qcard perm limit" },
      el("h4", {}, e.resetsAt ? `Claude is back at ${fmtTime(e.resetsAt)}` : "Claude hit its usage limit"),
      el("p", { class: "note" }, e.message),
      el("label", { class: "check" }, auto, el("span", {}, "Continue this conversation by itself when Claude is back. It reads what happened meanwhile (the CHANGELOG and any other tool's work) first.")),
      el("div", { class: "foot" },
        el("button", { type: "button", class: "ghost", title: "If your limit was reset early", onclick: () => api(`/api/sessions/${id}/resume-now`, {}).catch(showError) }, icon("i-refresh"), "Try now"),
        el("button", { type: "button", class: "ghost", onclick: () => openToolPicker(id, (r) => add(el("div", { class: "sys" }, r.message))) }, "Another tool"),
        geminiHere ? el("button", { type: "button", class: "primary to-gemini", hidden: state.agent === "gemini", onclick: () => switchAgent("gemini") }, icon("i-swap"), "Continue with Gemini here")
          : names[e.fallback] ? el("button", { type: "button", class: "primary", onclick: () => handoffTo(e.fallback) }, icon("i-swap"), `Continue with ${names[e.fallback]}`) : null));
  }

  // Tool picker under the composer: Claude or Gemini CLI answer in this same conversation.
  function setAgent(agent) {
    state.agent = agent;
    if ($("#agent")) $("#agent").value = agent;
    const ic = $("#model-icon");
    if (ic) { ic.setAttribute("class", `ic brand-fill ${agent}`); ic.querySelector("use").setAttribute("href", `#b-${agent}`); }
    input.placeholder = `Write to ${agent === "gemini" ? "Gemini" : "Claude"} (Arabic or English). Paste or drop screenshots here.`;
  }
  async function switchAgent(agent) {
    const pick = $("#agent");
    if (pick) pick.disabled = true;
    try { await api(`/api/sessions/${id}/agent`, { agent }); }
    catch (err) { showError(err); setAgent(state.agent); }
    finally { if (pick) pick.disabled = false; }
  }
  async function loadAgents() {
    loadModels();
    try {
      const r = await api("/api/tools");
      const gem = r.tools.find((t) => t.id === "gemini");
      state.geminiReady = !!gem?.installed;
      if (!$("#agent-wrap")) return;
      $("#agent-wrap").hidden = !state.geminiReady && state.agent !== "gemini";
      $("#agent").onchange = () => switchAgent($("#agent").value);
    } catch {}
  }

  // Model picker under the composer: switches this conversation's model in place (setModel), same history.
  async function loadModels() {
    const wrap = $("#model-wrap");
    const pick = $("#model");
    try {
      const r = await api(`/api/sessions/${id}/models`);
      if (!$("#model")) return;
      if (!r.models.length) { wrap.hidden = true; return; }
      knownModels = r.models;
      pick.replaceChildren(...r.models.map((m) => el("option", { value: m.value, title: m.description || "" }, m.name || m.value)));
      if (!r.models.some((m) => m.value === r.current)) pick.prepend(el("option", { value: r.current }, r.current ? modelName(r.current) : "Default"));
      pick.value = r.current;
      wrap.hidden = false;
      pick.onchange = () => api(`/api/sessions/${id}/model`, { model: pick.value }).catch((err) => { showError(err); pick.value = r.current; });
    } catch {}
  }

  function permissionCard(e) {
    const card = el("div", { class: "qcard perm" + (e.agent === "gemini" ? " gemini" : ""), "data-request": e.requestId },
      el("h4", {}, e.title || `Claude wants to use: ${e.tool}`),
      e.detail ? el("div", { class: "detail" }, e.detail) : null,
      e.reason ? el("p", { class: "note" }, e.reason) : null,
    );
    const reply = (body) => api(`/api/sessions/${id}/answer`, { requestId: e.requestId, ...body }).catch(showError);
    card.append(el("div", { class: "foot" },
      el("button", { type: "button", class: "ghost danger", onclick: () => reply({ allow: false }) }, "No"),
      e.canAlways ? el("button", { type: "button", class: "ghost", onclick: () => reply({ allow: true, always: true }) }, "Yes, don't ask again") : null,
      el("button", { type: "button", class: "primary", onclick: () => reply({ allow: true }) }, "Yes"),
    ));
    return card;
  }

  function closeCard(card, e) {
    card.classList.add("done");
    for (const b of card.querySelectorAll("button, input")) b.disabled = true;
    for (const n of card.querySelectorAll(".foot, .other")) n.remove();
    let text;
    if (e.answers) text = e.cancel ? "Closed without an answer" : Object.values(e.answers).join(" · ");
    else text = e.allow ? (e.always ? "Allowed (and from now on)" : "Allowed") : "Not allowed";
    card.append(el("div", { class: "picked" }, "Your answer: ", el("b", { dir: "auto" }, text)));
  }

  // Composer
  const attachments = $("#attachments");
  const renderAttachments = () => attachments.replaceChildren(...state.images.map((src, i) =>
    el("figure", {}, el("img", { src, alt: "Image to send" }), el("button", { type: "button", "aria-label": "Remove", onclick: () => { state.images.splice(i, 1); renderAttachments(); } }, icon("i-x")))));
  const addFiles = (files) => {
    for (const f of files) {
      if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) continue;
      const r = new FileReader();
      r.onload = () => { state.images.push(r.result); renderAttachments(); };
      r.readAsDataURL(f);
    }
  };
  $("#file").addEventListener("change", (ev) => { addFiles(ev.target.files); ev.target.value = ""; });
  input.addEventListener("paste", (ev) => { const files = [...(ev.clipboardData?.files || [])]; if (files.length) { ev.preventDefault(); addFiles(files); } });
  $("#composer").addEventListener("dragover", (ev) => ev.preventDefault());
  $("#composer").addEventListener("drop", (ev) => { ev.preventDefault(); addFiles(ev.dataTransfer.files); });
  // Unsent text is kept per conversation, so leaving the page (or a reload) does not lose it.
  const draftKey = `draft:${id}`;
  const fit = () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 200) + "px"; };
  try { input.value = localStorage.getItem(draftKey) || ""; } catch {}
  if (input.value) fit();
  input.addEventListener("input", () => {
    fit();
    try { input.value ? localStorage.setItem(draftKey, input.value) : localStorage.removeItem(draftKey); } catch {}
  });
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); $("#composer").requestSubmit(); } });

  async function send(text) {
    if (!text && !state.images.length) return;
    const images = state.images.splice(0);
    renderAttachments();
    try { await api(`/api/sessions/${id}/message`, { text, images }); }
    catch (e) { add(el("div", { class: "sys err" }, e.message)); }
  }
  $("#composer").addEventListener("submit", (ev) => {
    ev.preventDefault();
    const text = input.value.trim();
    input.value = ""; input.style.height = "auto";
    try { localStorage.removeItem(draftKey); } catch {}
    send(text);
  });
  $("#stop").addEventListener("click", () => api(`/api/sessions/${id}/stop`, {}).catch(showError));
  $("#to-tool").addEventListener("click", () => openToolPicker(id, (r) => add(el("div", { class: "sys" }, r.message))));
  $("#to-terminal").addEventListener("click", async () => {
    try { const r = await api(`/api/sessions/${id}/terminal`, {}); add(el("div", { class: "sys" }, r.message)); }
    catch (e) { showError(e); }
  });
  input.focus();
}

// ---------- account / sign-in ----------
async function refreshAccount(fresh) {
  const btn = $("#account");
  try {
    const a = await api(`/api/auth${fresh ? "?fresh=1" : ""}`);
    btn.hidden = false;
    btn.className = "pill account " + (a.loggedIn ? "ok" : "off");
    btn.textContent = a.loggedIn ? (a.email || "Signed in") : "Sign in";
    btn.title = a.loggedIn ? "Signed in to Claude. Click to sign in again." : (a.error || "Not signed in");
    return a;
  } catch { btn.hidden = true; return null; }
}

function openSignIn(onDone) {
  let dlg = $("#signin");
  if (!dlg) { document.body.append($("#tpl-signin").content.cloneNode(true)); dlg = $("#signin"); }
  const body = $("#signin-body");
  const startBtn = $("#signin-start");
  let timer = null;
  body.replaceChildren();
  startBtn.hidden = false;
  startBtn.disabled = false;
  const stop = () => { clearInterval(timer); timer = null; };
  $("#signin-close").onclick = () => { stop(); dlg.close(); };
  dlg.onclose = stop;

  let startedAt = Date.now();
  const terminalFallback = (lead) => el("div", { class: "linkbox" }, lead ? el("span", { class: "note" }, lead) : null,
    el("button", { type: "button", class: "ghost", onclick: async () => {
      try { const r = await api("/api/login", {}); body.append(el("p", { class: "note" }, r.message)); } catch (e) { showError(e); }
    } }, "Use a terminal instead"));
  const render = (st) => {
    const kids = [];
    if (st.running) kids.push(el("p", {}, "Waiting for you to finish signing in in your browser…"));
    if (st.running && !st.url && Date.now() - startedAt > 15000) kids.push(terminalFallback("Nothing opened?"));
    if (st.url) kids.push(el("div", { class: "linkbox" }, el("a", { class: "primary", href: st.url, target: "_blank", rel: "noopener", style: "text-decoration:none" }, "Open the sign-in page"), el("span", { class: "note" }, "if the browser did not open by itself")));
    if (st.needsCode) {
      const input = el("input", { type: "text", placeholder: "Paste the code from the sign-in page", autocomplete: "off" });
      const go = el("button", { type: "button", class: "ghost", onclick: async () => {
        if (!input.value.trim()) return;
        try { render(await api("/api/auth/login/code", { code: input.value })); } catch (e) { showError(e); }
      } }, "Send code");
      kids.push(el("div", { class: "other" }, input, go));
    }
    if (!st.running && st.exitCode != null) {
      stop();
      if (st.exitCode === 0 || st.status?.loggedIn) {
        kids.push(el("p", { class: "ok-line" }, "Signed in. You can close this window (in a conversation, press Try again)."));
        startBtn.hidden = true;
        refreshAccount(true);
        onDone?.();
      } else {
        kids.push(el("p", { class: "err-line" }, "Sign-in did not finish."));
        kids.push(terminalFallback(""));
        startBtn.disabled = false;
        startBtn.textContent = "Try again";
      }
    }
    if (st.output) kids.push(el("details", {}, el("summary", { class: "note" }, "Details"), el("pre", {}, st.output)));
    body.replaceChildren(...kids);
  };

  startBtn.textContent = "Sign in";
  startBtn.onclick = async () => {
    startBtn.disabled = true;
    startedAt = Date.now();
    try {
      render(await api("/api/auth/login", {}));
      stop();
      timer = setInterval(async () => {
        try { render(await api("/api/auth/login")); } catch { stop(); }
      }, 1500);
    } catch (e) { startBtn.disabled = false; showError(e); }
  };
  dlg.showModal();
}

function lightbox(src) {
  const box = el("div", { class: "lightbox", role: "dialog", "aria-label": "Screenshot", onclick: () => box.remove() }, el("img", { src, alt: "Screenshot, full size" }));
  const onKey = (k) => { if (k.key === "Escape") { box.remove(); removeEventListener("keydown", onKey); } };
  addEventListener("keydown", onKey);
  document.body.append(box);
}

$("#account").addEventListener("click", () => openSignIn());
$("#perm").addEventListener("click", openPerm);
refreshPerm();
// The sidebar's Add to the workflow buttons live outside the page templates, so they are bound once.
for (const b of document.querySelectorAll(".sidenav [data-add]")) b.addEventListener("click", () => openAdd(b.dataset.add));
initRail();
route();
checkUpdates(true);
refreshAccount();

// ---------- Open a shared project from GitHub (tools/project_repo.cjs) ----------
// The repo is cloned into My Projects as it is; the project's GitHub page then lists what this computer still needs.
async function openFromGitHub() {
  const link = await askText({ title: "Open a project from GitHub", help: "Paste the project's GitHub link. It is copied into My Projects with everything in it; nothing on GitHub changes.", placeholder: "https://github.com/owner/project", okLabel: "Open" });
  if (!link) return;
  toast("Copying the project from GitHub…");
  try {
    const r = await api("/api/projects/open-github", { url: link });
    const todo = (r.setup || []).filter((s) => !s.ok && !s.optional).length;
    toast(todo ? `Opened ${r.name}. ${todo} thing(s) to set up on this computer: see its GitHub page.` : `Opened ${r.name}.`);
    location.hash = `#/project/${encodeURIComponent(r.name)}/${todo ? "github" : "pipeline"}`;
  } catch (e) { showError(e); }
}

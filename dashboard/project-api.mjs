// Project pages (Pipeline, Review, Sync, Design, Connect, Plan): what one project's files say, for the dashboard.
// Read-only facts from the project folder (status.json, CHANGELOG.md, the live prototype's reports, the comment inbox);
// every action that changes something runs the workflow's own tools or starts a Claude conversation.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const { userEnv } = createRequire(import.meta.url)("../tools/publish_checks.cjs");
const figmaSync = createRequire(import.meta.url)("../tools/figma_sync.cjs");
const sbSections = createRequire(import.meta.url)("../tools/storybook_sections.cjs");
const projectRepo = createRequire(import.meta.url)("../tools/project_repo.cjs");
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const versions = createRequire(import.meta.url)("../tools/versions.cjs");
// a tool run to completion, its JSON answer (or the error text)
function runTool(root, tool, args, json) {
  const r = spawnSync(process.execPath, [path.join(root, "tools", tool), ...args], { cwd: root, encoding: "utf8", windowsHide: true, timeout: 60000, env: userEnv() });
  const out = (r.stdout || "") + (r.stderr || "");
  if (!json) return out;
  try { return JSON.parse(out.slice(out.indexOf("{"))); } catch { return { ok: false, error: out.trim().slice(-300) }; }
}

// Storybook (opt-in, by sections): the components a project offers for the checklist. Figma first: its registry;
// Code first without a registry: the component files of the linked code repo (read from a local cache clone).
function storybookComponents(dir) {
  const reg = readJson(path.join(dir, "data", "component-registry.json"), null);
  const fromReg = sbSections.componentsFromRegistry(reg);
  if (fromReg.length) return { source: "registry", components: fromReg };
  const status = readJson(path.join(dir, "status.json"), {});
  const r = status.code_repo;
  if (!r) return { source: null, components: [] };
  const url = /\.git$/.test(r.url || r) ? (r.url || r) : String(r.url || r).replace(/\/+$/, "") + ".git";
  const lg = figmaSync.codeLog({ url, branch: r.branch || null }, null); // clones or fetches the cache
  if (lg.error) return { source: "code", error: lg.error, components: [] };
  const cache = path.join(os.homedir(), ".atomica", "repos", crypto.createHash("sha1").update(url).digest("hex").slice(0, 16));
  const out = spawnSync("git", ["-C", cache, "ls-tree", "-r", "--name-only", lg.head], { encoding: "utf8", windowsHide: true, maxBuffer: 32 << 20 });
  return { source: "code", components: sbSections.componentsFromFiles((out.stdout || "").split(/\r?\n/)) };
}
// What "Check Storybook" reports: the switch, the choices, whether a Storybook exists, runs and is published.
async function storybookState(dir) {
  const status = readJson(path.join(dir, "status.json"), {});
  const sbDir = path.join(dir, "storybook");
  const pkg = readText(path.join(sbDir, "package.json"));
  const port = +((pkg.match(/storybook dev[^"]*-p\s*(\d+)/) || [])[1] || 0) || null;
  let running = false;
  if (port) { try { await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) }); running = true; } catch {} }
  const stories = (() => { let n = 0; const walk = (d) => { let e = []; try { e = fs.readdirSync(d, { withFileTypes: true }); } catch { return; } for (const x of e) { if (x.name === "node_modules") continue; const p = path.join(d, x.name); if (x.isDirectory()) walk(p); else if (/\.stories\.(t|j)sx?$|\.mdx$/.test(x.name)) n++; } }; walk(path.join(sbDir, "src")); return n; })();
  return { exists: !!pkg, port, running, stories, url: status.storybook_url || null, plan: status.storybook_plan || null, mode: status.prototype?.design_mode || null };
}
const figmaToken = () => { try { return createRequire(import.meta.url)("../tools/figma_versions.cjs").token(); } catch { return null; } };

const readJson = (file, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};
const readText = (file) => {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
};
const mtime = (file) => {
  try { return fs.statSync(file).mtimeMs; } catch { return 0; }
};
// A project's links, from its own config first (status.json > figma, prototype.url, storybook_url; the last publish),
// then any other GitHub Pages link in its brief: one with "storybook" or "design-system" in it is the Storybook,
// anything else a plain site link. Works for any project naming.
export function projectLinks(status, brief, folder) {
  const out = [];
  const norm = (u) => String(u || "").replace(/\/+$/, "").toLowerCase();
  const ds = status?.figma?.design_system;
  if (ds?.url) out.push({ kind: "figma", label: ds.name || "Design System", url: ds.url });
  for (const f of status?.figma?.design_files || []) if (f?.url) out.push({ kind: "figma", label: f.name || "Design file", url: f.url });
  if (status?.team?.repo) out.push({ kind: "github", label: "Team repo", url: status.team.repo });
  const proto = status?.prototype?.url || (folder ? readJson(path.join(folder, "prototype", "data", "publish.json"), {})?.url : null);
  if (proto) out.push({ kind: "prototype", label: "Prototype · Live", url: proto });
  const sb = status?.storybook_url || status?.storybook?.url || null;
  if (sb) out.push({ kind: "storybook", label: "Storybook", url: sb });
  const seen = new Set([norm(proto), norm(sb)]);
  const pages = (JSON.stringify(status || {}) + "\n" + (brief || "")).match(/https:\/\/[\w.-]+\.github\.io\/[^\s"')>\]|]*/g) || [];
  for (const url of new Set(pages)) {
    if (seen.has(norm(url))) continue;
    seen.add(norm(url));
    if (/storybook|design-system/i.test(url) && !sb) out.push({ kind: "storybook", label: "Storybook", url });
    else if (!/storybook|design-system/i.test(url)) out.push({ kind: "link", label: "Site", url });
  }
  return out;
}

// The newest change to what a publish builds: the prototype's source (generated screens, shell, strings), its data
// (overrides, screens, strings) and public files. node_modules and dist are skipped.
export function newestPrototypeChange(proto) {
  let newest = 0;
  const walk = (d, depth = 0) => {
    let entries = [];
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name === "dist" || e.name.startsWith(".")) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 6) walk(p, depth + 1); }
      else if (!/publish\.json$|build-report\.json$|code-report\.json$/.test(e.name)) newest = Math.max(newest, mtime(p));
    }
  };
  for (const sub of ["src", "data", "public"]) walk(path.join(proto, sub));
  return newest;
}

// CHANGELOG entries, newest first: "## 2026-10-25 · title" or "## 2026-10-25 - title" (the format example is skipped).
export function changelogEntries(text, limit = 6) {
  const body = text.replace(/```[\s\S]*?```/g, "");
  const out = [];
  for (const m of body.matchAll(/^## (\d{4}-\d{2}-\d{2})\s*[·-]\s*(.+)$/gm)) {
    out.push({ date: m[1], title: m[2].trim() });
    if (out.length >= limit) break;
  }
  return out;
}

// Is the prototype's local dev server answering (Vite, port 5190 by default)?
async function localPreview(port = 5190) {
  // Vite started with `npm run dev` may listen on ::1 only (Node 17+ on Windows), so both addresses are tried.
  for (const host of ["127.0.0.1", "[::1]"]) {
    try {
      const r = await fetch(`http://${host}:${port}/`, { signal: AbortSignal.timeout(400) });
      if (r.ok) return { running: true, url: `http://localhost:${port}/` };
    } catch {}
  }
  return { running: false, url: `http://localhost:${port}/` };
}

export async function projectOverview(folder) {
  const status = readJson(path.join(folder, "status.json"), {});
  const proto = path.join(folder, "prototype");
  const has = fs.existsSync(path.join(proto, "package.json"));
  const registry = readJson(path.join(folder, "data", "component-registry.json"), {});
  const tokens = readJson(path.join(folder, "data", "tokens.json"), {});
  const screens = readJson(path.join(proto, "data", "screens.json"), null);
  const build = readJson(path.join(proto, "data", "build-report.json"), {});
  const code = readJson(path.join(proto, "data", "code-report.json"), null);
  const overrides = readJson(path.join(proto, "data", "overrides.json"), { changes: [] });
  const publish = readJson(path.join(proto, "data", "publish.json"), null);
  const inbox = readJson(path.join(proto, "comments", "inbox.json"), null);
  const fidelity = readJson(path.join(proto, "fidelity", "report.json"), []);
  const changelog = readText(path.join(folder, "CHANGELOG.md"));
  const scored = (Array.isArray(fidelity) ? fidelity : []).filter((r) => r.score1px != null && !r.codeAhead);
  const comments = inbox?.comments || [];
  const open = comments.filter((c) => c.status !== "resolved");
  const pending = status.prototype?.pending_figma_sync || [];
  const built = newestPrototypeChange(proto);
  const unpublished = publish && built > Date.parse(publish.at || 0) ? 1 : 0;
  const unsyncedStorybook = Number(status.unsynced_entries || 0);
  return {
    hasPrototype: has,
    scope: status.scope || null,
    backend: status.backend ? { plan: status.backend.plan || null, ref: status.backend.project_ref || null, step: status.backend.step || 0, checkedAt: status.backend.checked_at || null } : null,
    ds: { components: (registry.components || []).length, tokens: Object.keys(tokens.variables || {}).length, storybook: !!status.has_storybook },
    screens: screens ? { count: new Set(screens.screens.map((s) => s.n.replace(/\s*\/\s*(Dark|Light)$/i, ""))).size, exportedAt: screens.exported_at, file: screens.file } : null,
    build: { screens: (build.screens || []).length, codeAhead: build.code_ahead || [], raw: build.raw || 0, missing: Object.keys(build.missing || {}).length },
    code: code ? { unknown: (code.unknown || []).length, raw: (code.raw || []).length } : null,
    fidelity: scored.length ? Math.round(scored.reduce((a, r) => a + r.score1px, 0) / scored.length * 100) / 100 : null,
    fidelityRows: Array.isArray(fidelity) ? fidelity.length : 0,
    comments: { pulledAt: inbox?.pulled_at || null, open: open.length, resolved: comments.length - open.length, byAuthor: open.reduce((m, c) => ({ ...m, [c.author || "Anonymous"]: (m[c.author || "Anonymous"] || 0) + 1 }), {}) },
    overrides: (overrides.changes || []).map((c) => ({ id: c.id, screen: c.screen, description: c.description, comment: c.comment })),
    pendingFigmaSync: pending,
    rules: status.prototype?.rules || [],
    publish: publish || (status.prototype?.url ? { url: status.prototype.url, at: null } : null),
    unpublished,
    local: has ? await localPreview() : { running: false },
    storybook: { unsynced: unsyncedStorybook },
    activity: changelogEntries(changelog),
    figma: status.figma ? { designSystem: status.figma.design_system?.name, designFiles: (status.figma.design_files || []).map((f) => f.name) } : null,
  };
}

// The five pipeline steps and the one next step, from the overview.
export function pipeline(o) {
  const steps = [];
  steps.push(o.ds.components
    ? { key: "ds", title: "Design System", state: "done", text: `${o.ds.components} components, ${o.ds.tokens} tokens${o.ds.storybook ? ". Storybook built." : "."}` }
    : { key: "ds", title: "Design System", state: "wait", text: "No components recorded yet." });
  steps.push(o.screens
    ? { key: "screens", title: "Screens (Figma)", state: "done", text: `${o.screens.count} screens, exported ${String(o.screens.exportedAt || "").slice(0, 10)}.` }
    : { key: "screens", title: "Screens (Figma)", state: "wait", text: "No screens exported to the prototype yet." });
  const codeBad = o.code && (o.code.unknown || o.code.raw);
  steps.push(!o.hasPrototype
    ? { key: "proto", title: "Live Prototype", state: "wait", text: "No prototype yet." }
    : codeBad ? { key: "proto", title: "Live Prototype", state: "prob", text: `Code check: ${o.code.unknown} unknown names, ${o.code.raw} raw values.` }
    : o.unpublished ? { key: "proto", title: "Live Prototype", state: "wait", text: "Built locally, not published yet." }
    : { key: "proto", title: "Live Prototype", state: "done", text: o.publish?.at ? `Published ${String(o.publish.at).slice(0, 16).replace("T", " ")}.` : "Published." });
  steps.push(o.comments.open
    ? { key: "review", title: "Review (Comments)", state: "wait", text: `${o.comments.open} open comment${o.comments.open > 1 ? "s" : ""}.` }
    : { key: "review", title: "Review (Comments)", state: "done", text: o.comments.pulledAt ? `No open comments (pulled ${String(o.comments.pulledAt).slice(0, 10)}).` : "No comments pulled yet." });
  if (o.scope === "all" || o.backend) {
    const b = o.backend || {};
    steps.push(b.checkedAt ? { key: "backend", title: "Backend (optional)", state: "done", text: `Supabase connected (${b.ref}).` }
      : { key: "backend", title: "Backend (optional)", state: "wait", text: b.plan === "stage-8" ? `Supabase wizard: step ${b.step || 1} of 5.` : "Sample data for now. Connect a database any time." });
  }
  const syncN = o.pendingFigmaSync.length + (o.storybook.unsynced ? 1 : 0);
  steps.push(syncN
    ? { key: "sync", title: "Sync", state: "prob", text: [o.pendingFigmaSync.length ? `${o.pendingFigmaSync.length} change${o.pendingFigmaSync.length > 1 ? "s" : ""} in the prototype, not in Figma.` : "", o.storybook.unsynced ? `${o.storybook.unsynced} Figma change${o.storybook.unsynced > 1 ? "s" : ""} not in Storybook.` : ""].filter(Boolean).join(" ") }
    : { key: "sync", title: "Sync", state: "done", text: "Prototype, Figma and Storybook agree." });
  let next = { title: "Everything is up to date", text: "Write in Design to change a screen, or wait for new comments.", go: "design", label: "Open Design" };
  if (o.comments.open) next = { title: `Triage ${o.comments.open} open comment${o.comments.open > 1 ? "s" : ""}`, text: "Claude proposes a change for each one; nothing is applied without your OK.", go: "review", label: "Open Review" };
  else if (codeBad) next = { title: "Fix the code check", text: "The reference code uses a name or value outside the design system.", go: "design", label: "Open Design" };
  else if (o.unpublished) next = { title: "Publish the prototype", text: "The local build has changes the live link does not have yet.", go: "design", label: "Open Design" };
  else if (o.pendingFigmaSync.length) next = { title: "Decide the Figma sync", text: "Changes made in the prototype are not in Figma yet.", go: "sync", label: "Open Sync" };
  return { steps, next };
}

// ---------- Review: comments from the live prototype ----------
// The workflow's own tool talks to Supabase (keys stay in ~/.atomica/supabase.env); the dashboard only runs it.
function commentsTool(root, dir, ...args) {
  const r = spawnSync(process.execPath, [path.join(root, "tools", "prototype_comments.cjs"), dir, ...args], { encoding: "utf8", timeout: 60000 });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const triageFile = (dir) => path.join(dir, "prototype", "comments", "triage.json");

export function readComments(dir) {
  const inbox = readJson(path.join(dir, "prototype", "comments", "inbox.json"), null);
  const triage = readJson(triageFile(dir), {});
  const imgDir = path.join(dir, "prototype", "comments", "images");
  let files = [];
  try { files = fs.readdirSync(imgDir); } catch {}
  const comments = (inbox?.comments || []).map((c) => ({
    ...c,
    localImages: files.filter((f) => f.startsWith(c.id + "-")).sort(),
    triage: triage[c.id] || null,
  }));
  return { pulledAt: inbox?.pulled_at || null, project: inbox?.project || null, comments };
}

function decide(dir, id, decision, note) {
  const file = triageFile(dir);
  const all = readJson(file, {});
  all[id] = { ...(all[id] || {}), status: decision, note: note || all[id]?.note || null, decidedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 1) + "\n");
  return all[id];
}

// ---------- Sync: what differs between the prototype, Figma and Storybook ----------
// Nothing moves from here: Push / Pull only add a request to data/sync-queue.json, which a chat run then works
// through with the workflow's own rules (FigCli, audit, the user's approvals).
const queueFile = (dir) => path.join(dir, "data", "sync-queue.json");

// Changelog entries still marked "Storybook synced: no".
export function unsyncedEntries(text) {
  const body = text.replace(/```[\s\S]*?```/g, "");
  const parts = body.split(/^(?=## \d{4}-\d{2}-\d{2})/m).slice(1);
  return parts.filter((e) => /Storybook synced:\s*no\b/i.test(e)).map((e) => {
    const m = e.match(/^## (\d{4}-\d{2}-\d{2})\s*[·-]\s*(.+)$/m);
    return { date: m?.[1] || null, title: (m?.[2] || "").trim() };
  });
}

// Is Figma open with FigCli Yolo's debugging port (9222)? Read-only, no token.
async function figcliPort() {
  try {
    const r = await fetch("http://127.0.0.1:9222/json/version", { signal: AbortSignal.timeout(500) });
    return r.ok;
  } catch { return false; }
}

const versionsCache = new Map();
async function syncState(root, dir) {
  const status = readJson(path.join(dir, "status.json"), {});
  const overrides = readJson(path.join(dir, "prototype", "data", "overrides.json"), { changes: [] });
  const queue = readJson(queueFile(dir), { requests: [] }).requests || [];
  const queued = (ref) => queue.find((q) => q.ref === ref && q.status === "queued") || null;
  const push = (status.prototype?.pending_figma_sync || []).map((c) => {
    const ov = (overrides.changes || []).find((o) => o.id === c.override);
    const ref = `push:${c.override || c.comment || c.change}`;
    return { ref, title: ov?.description || c.change, change: c.change, file: c.file, screen: ov?.screen || null, comment: c.comment || null, approved: ov?.approved || null, queued: queued(ref) };
  });
  const pull = [];
  let versions = null;
  try {
    // tools/figma_versions.cjs: the DS file's Figma history since the last Storybook sync (at most ~3 s, skipped offline).
    const fv = createRequire(import.meta.url)(path.join(root, "tools", "figma_versions.cjs"));
    const hit = versionsCache.get(dir);
    if (hit && Date.now() - hit.at < 60000) versions = hit.value; // Queue / Undo clicks reuse the last read
    else if (fv.checkFolder) { versions = await fv.checkFolder(dir); versionsCache.set(dir, { at: Date.now(), value: versions }); }
  } catch {}
  if (versions?.changed) {
    const ref = `pull:figma-versions:${versions.latest}`;
    pull.push({ ref, title: `DS file: ${versions.changed} Figma version${versions.changed > 1 ? "s" : ""} since the last Storybook sync`, meta: ["Figma version history", `${String(versions.latest).slice(0, 16).replace("T", " ")}${versions.editors?.length ? ` · ${versions.editors.join(", ")}` : ""}`], queued: queued(ref) });
  }
  for (const e of unsyncedEntries(readText(path.join(dir, "CHANGELOG.md")))) {
    const ref = `pull:changelog:${e.date}:${e.title}`;
    pull.push({ ref, title: e.title, meta: ["CHANGELOG, Storybook synced: no", e.date], queued: queued(ref) });
  }
  return {
    push, pull,
    rules: status.prototype?.rules || [],
    queue: queue.filter((q) => q.status === "queued"),
    figma: { designSystem: status.figma?.design_system?.name || null, designFiles: (status.figma?.design_files || []).map((f) => f.name), figcli: await figcliPort(), versionsChecked: versions !== null, versionsError: versions?.error || null },
  };
}

function queueRequest(dir, item) {
  const file = queueFile(dir);
  const all = readJson(file, { requests: [] });
  all.requests ||= [];
  if (!all.requests.some((q) => q.ref === item.ref && q.status === "queued")) all.requests.push({ ...item, status: "queued", at: new Date().toISOString() });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(all, null, 1) + "\n");
}
function unqueueRequest(dir, ref) {
  const file = queueFile(dir);
  const all = readJson(file, { requests: [] });
  all.requests = (all.requests || []).filter((q) => !(q.ref === ref && q.status === "queued"));
  fs.writeFileSync(file, JSON.stringify(all, null, 1) + "\n");
}

// ---------- Design: the prototype workspace (chat on the left, preview on the right) ----------
// Screens come from the generated routes (the same slugs the prototype uses). The local preview is the prototype's
// own Vite dev server on 5190; the dashboard starts and stops only the one it started itself.
const PREVIEW_PORT = 5190;
const previews = new Map(); // project dir -> child process started here
const publishing = new Set();

function designScreens(dir) {
  const routes = readText(path.join(dir, "prototype", "src", "generated", "routes.tsx"));
  const status = readJson(path.join(dir, "status.json"), {});
  const build = readJson(path.join(dir, "prototype", "data", "build-report.json"), {});
  const ahead = new Set(build.code_ahead || []);
  // the module of a screen, for the screen picker of a big project: its Figma section, else the start of its name
  const shot = readJson(path.join(dir, "prototype", "data", "screens.json"), {}) || {};
  const sectionOf = {};
  for (const s of shot.screens || []) if (s.section) sectionOf[String(s.n).replace(/\s*[/\-–—|(]\s*(Dark|Light)\)?\s*$/i, "").replace(/^.*\/\s*/, "").trim()] = s.section;
  return [...routes.matchAll(/\{\s*slug:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*w:\s*(\d+),\s*h:\s*(\d+)/g)].map((m) => ({
    slug: m[1], name: m[2], w: +m[3], h: +m[4],
    source: status.prototype?.screens?.[m[2]]?.source || (ahead.has(m[2]) ? "code" : "figma"),
    group: screenGroup(m[2], sectionOf[m[2]]),
  }));
}
export function screenGroup(name, section) {
  if (section && typeof section === "string") return section.replace(/^.*\/\s*/, "").trim() || section;
  const m = String(name).match(/^(.+?)\s+[-–—/]\s+/);
  return m ? m[1].trim() : "Other";
}

async function designState(dir) {
  const status = readJson(path.join(dir, "status.json"), {});
  const proto = path.join(dir, "prototype");
  const publish = readJson(path.join(proto, "data", "publish.json"), null) || (status.prototype?.url ? { url: status.prototype.url, at: null } : null);
  const built = newestPrototypeChange(proto);
  const ours = previews.get(dir);
  return {
    hasPrototype: fs.existsSync(path.join(proto, "package.json")),
    installed: fs.existsSync(path.join(proto, "node_modules", "vite", "bin", "vite.js")),
    screens: designScreens(dir),
    designMode: status.prototype?.design_mode || null,
    local: { ...(await localPreview(PREVIEW_PORT)), ours: !!(ours && ours.exitCode === null) },
    publish,
    unpublished: publish?.at ? built > Date.parse(publish.at) : false,
    publishing: publishing.has(dir),
    repo: publishRepo(publish, status),
  };
}

// owner/name from publish.json, or from the GitHub Pages link.
function publishRepo(publish, status) {
  if (publish?.repo) return publish.repo;
  if (status?.prototype?.repo) return status.prototype.repo;
  const m = String(publish?.url || "").match(/^https:\/\/([\w-]+)\.github\.io\/([\w.-]+)\/?$/);
  return m ? `${m[1]}/${m[2]}` : null;
}

function setDesignMode(dir, mode) {
  const file = path.join(dir, "status.json");
  const status = readJson(file, {});
  status.prototype = { ...(status.prototype || {}), design_mode: mode };
  fs.writeFileSync(file, JSON.stringify(status, null, 2) + "\n");
}

// The public Supabase keys for comments (VITE_ only, as publish_prototype.cjs does); never the service key. The
// project's own pair comes first (status.json > comments, it travels with the repo), then this computer's shared file.
function previewEnv(dir) {
  const env = { ...process.env };
  const pub = dir ? projectRepo.publicSupabase(dir) : {};
  if (pub.url && pub.anonKey && !env.VITE_SUPABASE_URL) { env.VITE_SUPABASE_URL = pub.url; env.VITE_SUPABASE_ANON_KEY = pub.anonKey; }
  const shared = readText(path.join(os.homedir(), ".atomica", "supabase.env"));
  for (const m of shared.matchAll(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.*?)\s*$/gm)) if (!env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  delete env.SUPABASE_SERVICE_KEY;
  return env;
}

async function startPreview(dir) {
  if ((await localPreview(PREVIEW_PORT)).running) return { ok: true };
  const proto = path.join(dir, "prototype");
  const vite = path.join(proto, "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(vite)) return { ok: false, error: "The prototype's packages are not installed (npm install in its prototype folder)." };
  // An imported or Vibe code app (no generated prototype shell) runs with the review comment overlay injected
  // (tools/comment_overlay/run.mjs): pins on any element, same Supabase table and project slug, nothing added to its repo.
  const imported = !fs.existsSync(path.join(proto, "src", "generated", "routes.tsx"));
  const slug = path.basename(dir).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const cmd = imported ? [path.join(ROOT_DIR, "tools", "comment_overlay", "run.mjs"), proto, "--project", slug, "--port", String(PREVIEW_PORT)]
    : [vite, "--port", String(PREVIEW_PORT), "--strictPort", "--host", "127.0.0.1"];
  const child = spawn(process.execPath, cmd, { cwd: proto, env: previewEnv(dir), stdio: "ignore", windowsHide: true });
  previews.set(dir, child);
  child.on("exit", () => { if (previews.get(dir) === child) previews.delete(dir); });
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if ((await localPreview(PREVIEW_PORT)).running) return { ok: true };
    if (child.exitCode !== null) break;
  }
  return { ok: false, error: "The local preview did not start (is port 5190 used by another program?)." };
}

function stopPreview(dir) {
  const child = previews.get(dir);
  if (!child) return { ok: false, error: "This preview was not started from the dashboard; stop it where it runs." };
  child.kill();
  previews.delete(dir);
  return { ok: true };
}

// ---------- Version history (code projects, tools/versions.cjs) ----------
// Every finished request in a code project becomes a version; an old version is viewed read only from a separate copy
// on its own port (5191), so the working preview on 5190 keeps running.
const VIEW_PORT = 5191;
let viewing = null; // { dir, sha, child }
export function autoVersion(dir, message) {
  try { return versions.enabled(dir) && versions.locate(dir).exists ? versions.snapshot(dir, message) : { ok: true, created: false }; } catch (e) { return { ok: false, error: e.message }; }
}
function stopView() {
  if (viewing?.child && viewing.child.exitCode === null) viewing.child.kill();
  viewing = null;
}
async function startView(dir, sha) {
  if (viewing?.dir === dir && viewing.sha.startsWith(sha) && viewing.child.exitCode === null) return { ok: true, url: `http://localhost:${VIEW_PORT}/` };
  stopView();
  const w = versions.view(dir, sha);
  if (!w.ok) return w;
  const vite = path.join(w.app, "node_modules", "vite", "bin", "vite.js");
  if (!fs.existsSync(vite)) return { ok: false, error: "The app's packages are not installed, so an old version cannot be shown (npm install in its prototype folder first)." };
  const child = spawn(process.execPath, [vite, "--port", String(VIEW_PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: w.app, env: previewEnv(dir), stdio: "ignore", windowsHide: true });
  viewing = { dir, sha: w.sha, child };
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if ((await localPreview(VIEW_PORT)).running) return { ok: true, url: `http://localhost:${VIEW_PORT}/`, sha: w.sha };
    if (child.exitCode !== null) break;
  }
  stopView();
  return { ok: false, error: `The old version did not start (is port ${VIEW_PORT} used by another program?).` };
}
async function versionsState(dir) {
  return { enabled: versions.enabled(dir), ...versions.list(dir, 100), viewing: viewing?.dir === dir ? viewing.sha : null };
}

// The daily sync check as a Windows scheduled task ("Atomica sync check"): it runs tools/sync_watch.cjs for every project
// (no AI, no tokens; a change only writes a short note for the Sync badge). Created and removed only from the user's
// click. The command lives in ~/.atomica/sync-check.cmd so paths with spaces stay safe.
const TASK = "Atomica sync check";
function syncSchedule() {
  if (process.platform !== "win32") return { supported: false };
  const r = spawnSync("schtasks", ["/Query", "/TN", TASK, "/FO", "LIST"], { encoding: "utf8", windowsHide: true, timeout: 15000 });
  if (r.status !== 0) return { supported: true, on: false };
  const next = (r.stdout.match(/Next Run Time:\s*(.+)/i) || [])[1]?.trim() || null;
  return { supported: true, on: true, next };
}
function setSyncSchedule(on, root, projectsDir, time) {
  if (process.platform !== "win32") return { ok: false, error: "The daily check is a Windows scheduled task; on a Mac run node tools/sync_watch.cjs --all from cron." };
  if (!on) {
    const r = spawnSync("schtasks", ["/Delete", "/TN", TASK, "/F"], { encoding: "utf8", windowsHide: true, timeout: 15000 });
    return r.status === 0 || /cannot find/i.test(r.stderr) ? { ok: true } : { ok: false, error: (r.stderr || r.stdout).trim() };
  }
  const at = /^\d{2}:\d{2}$/.test(String(time || "")) ? time : "09:00";
  const dir = path.join(os.homedir(), ".atomica");
  fs.mkdirSync(dir, { recursive: true });
  const cmd = path.join(dir, "sync-check.cmd");
  fs.writeFileSync(cmd, `@echo off\r\nrem Atomica daily sync check (no AI): Figma and code repo versions against the last sync.\r\n"${process.execPath}" "${path.join(root, "tools", "sync_watch.cjs")}" --all --projects "${projectsDir}" >> "${path.join(dir, "sync-check.log")}" 2>&1\r\n`);
  const r = spawnSync("schtasks", ["/Create", "/TN", TASK, "/TR", `"${cmd}"`, "/SC", "DAILY", "/ST", at, "/F"], { encoding: "utf8", windowsHide: true, timeout: 15000 });
  return r.status === 0 ? { ok: true } : { ok: false, error: (r.stderr || r.stdout).trim() };
}

// A new project's suggested repo: <GitHub login>/<project-slug>-prototype (created only after the user's click).
function suggestRepo(dir) {
  const r = spawnSync("gh", ["api", "user", "--jq", ".login"], { encoding: "utf8", windowsHide: true, timeout: 15000, env: userEnv() });
  const login = (r.stdout || "").trim();
  return /^[\w-]+$/.test(login) ? `${login}/${path.basename(dir).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-prototype` : null;
}
// Publish = tools/publish_prototype.cjs to the project's repo; a new repo only after the user's click.
function publishPrototype(root, dir, repo, create = false) {
  return new Promise((resolve) => {
    publishing.add(dir);
    const child = spawn(process.execPath, [path.join(root, "tools", "publish_prototype.cjs"), dir, "--repo", repo, ...(create ? ["--create"] : [])], { cwd: root, windowsHide: true, env: userEnv() });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", (code) => { publishing.delete(dir); resolve({ ok: code === 0, output: out.trim().split(/\r?\n/).slice(-6).join("\n") }); });
  });
}

// ---------- GitHub: one repo per project (tools/project_repo.cjs) ----------
// Settings live in status.json > github { repo, pages, merge_policy } and current_editor. Project repos are always public
// (Abdul, 2026-11-02); nothing here changes a repo's visibility. Uploads, requests, approvals and reviews run only from
// the user's click.
const git = (dir, args, timeout = 20000) => { const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8", windowsHide: true, timeout, env: userEnv() }); return { ok: !r.error && r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).trim() }; };
// The editor others see: the shared copy's status.json when it is newer (read after a quiet fetch, nothing merged).
function sharedEditor(dir, status) {
  if (!fs.existsSync(path.join(dir, ".git"))) return status;
  git(dir, ["fetch", "-q"], 6000);
  const r = git(dir, ["show", "@{u}:status.json"]);
  if (!r.ok) return status;
  let remote; try { remote = JSON.parse(r.out); } catch { return status; }
  const t = (s) => Math.max(Date.parse(s?.current_editor?.seen || 0) || 0, Date.parse(s?.takeover_request?.at || 0) || 0, Date.parse(s?.editor_changed_at || 0) || 0);
  return t(remote) > t(status) ? { ...status, current_editor: remote.current_editor, takeover_request: remote.takeover_request, editor_changed_at: remote.editor_changed_at } : status;
}
// the GitHub login, kept 10 minutes (every project page shows who is editing)
let loginCache = { v: null, at: 0 };
// Signed-in login cached 10 min; "not signed in" only 5 s, so a sign-in started from the editor banner is seen at once.
function myLogin() { if (Date.now() - loginCache.at > (loginCache.v ? 600e3 : 5e3)) loginCache = { v: projectRepo.ghLogin(), at: Date.now() }; return loginCache.v; }
async function githubState(dir, withFiles) {
  const status = projectRepo.readStatus(dir);
  const plan = projectRepo.pagesPlan(dir, status);
  const a = plan.repo ? projectRepo.access(plan.repo) : { login: projectRepo.ghLogin(), push: false, admin: false };
  const shared = sharedEditor(dir, status);
  return {
    repo: plan.repo, isRepo: fs.existsSync(path.join(dir, ".git")),
    settings: { pages: status.github?.pages || "separate", merge_policy: status.github?.merge_policy || "owner" },
    plan, access: a, mayMerge: projectRepo.mayMerge(status, a),
    editor: projectRepo.editorState(shared, a.login),
    requests: a.admin && plan.repo ? projectRepo.pendingRequests(plan.repo) : [],
    guard: projectRepo.hookOn(dir),
    comments: (() => { const p = projectRepo.publicSupabase(dir); return { url: !!p.url, publicKey: !!p.anonKey, inProject: !!status.comments?.anon_key }; })(),
    setup: projectRepo.setupCheck(dir),
    files: withFiles ? projectRepo.auditFiles(dir) : null,
  };
}
// Commits status.json alone and shares it (editor changes); a rejected push is retried once on top of the shared copy.
function shareStatus(dir, message) {
  if (!fs.existsSync(path.join(dir, ".git"))) return { shared: false, note: "Saved on this computer (the project has no repo yet)." };
  git(dir, ["add", "status.json"]);
  if (!git(dir, ["commit", "-q", "-m", message, "--", "status.json"]).ok) return { shared: false, note: "Nothing to share." };
  for (let i = 0; i < 2; i++) {
    if (git(dir, ["push", "-q"], 30000).ok) return { shared: true };
    git(dir, ["pull", "-q", "--rebase", "--autostash"], 30000);
  }
  return { shared: false, note: "Saved here; it reaches the others with the next upload (GitHub refused the push)." };
}

// ---------- Connect services: what this computer is connected to ----------
// Read-only checks, except the Supabase form, which writes only ~/.atomica/supabase.env (one Supabase project for
// every Atomica project on this computer). Key values are never sent back to the page or printed.
const SUPABASE_ENV = () => path.join(os.homedir(), ".atomica", "supabase.env");
const envKeys = (text) => Object.fromEntries([...text.matchAll(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/gm)].filter((m) => !m[0].trim().startsWith("#")).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]));

async function answers(url, ms = 500) {
  try { const r = await fetch(url, { signal: AbortSignal.timeout(ms) }); return r.status < 500; } catch { return false; }
}

async function connectState(root, dir, integrations) {
  const shared = envKeys(readText(SUPABASE_ENV()));
  const project = envKeys(readText(path.join(dir, "prototype", ".env.local")));
  const env = { ...shared, ...project };
  const ref = (String(env.VITE_SUPABASE_URL || "").match(/^https:\/\/([a-z0-9]+)\.supabase\.co\/?$/) || [])[1] || null;
  let schema = null;
  if (env.VITE_SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    const r = commentsTool(root, dir, "--schema-status");
    try { schema = JSON.parse(r.out); } catch { schema = { error: (r.err || r.out || "").slice(0, 200) }; }
  }
  // Storybook: the port from the project's storybook/package.json ("storybook dev -p 6009").
  const sbPkg = readText(path.join(dir, "storybook", "package.json"));
  const sbPort = +((sbPkg.match(/storybook dev[^"]*-p\s*(\d+)/) || [])[1] || 0) || null;
  const sbRunning = sbPort ? await answers(`http://127.0.0.1:${sbPort}/`) || await answers(`http://[::1]:${sbPort}/`) : false;
  const sbName = `${path.basename(dir).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-storybook`;
  // Playwright: the prototype's playwright-core and an installed Chrome (the fidelity and live checks use them).
  const pw = fs.existsSync(path.join(dir, "prototype", "node_modules", "playwright-core", "package.json"));
  const chrome = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean)
    .some((d) => fs.existsSync(path.join(d, "Google", "Chrome", "Application", "chrome.exe"))) || fs.existsSync("/Applications/Google Chrome.app");
  const integ = integrations ? integrations() : null;
  return {
    figcli: { port: await answers("http://127.0.0.1:9222/json/version"), lines: integ?.figma?.lines || [] },
    github: integ ? { cli: integ.github.cli, signedIn: integ.github.signedIn, account: integ.github.account } : null,
    supabase: {
      file: "~/.atomica/supabase.env",
      url: !!env.VITE_SUPABASE_URL, anon: !!env.VITE_SUPABASE_ANON_KEY, service: !!env.SUPABASE_SERVICE_KEY,
      projectOverride: Object.keys(project).some((k) => /SUPABASE/.test(k)),
      ref, host: ref ? `${ref}.supabase.co` : null,
      sqlEditor: ref ? `https://supabase.com/dashboard/project/${ref}/sql/new` : null,
      schema,
    },
    storybook: sbPort ? { port: sbPort, running: sbRunning, mcp: `http://localhost:${sbPort}/mcp`, name: sbName, add: `claude mcp add --transport http ${sbName} http://localhost:${sbPort}/mcp --scope local` } : null,
    playwright: { core: pw, chrome },
  };
}

// The Supabase form: only fields the user filled are written; the rest of the file is kept.
function saveSupabase(b) {
  const url = String(b.url || "").trim().replace(/\/$/, "");
  const anon = String(b.anon || "").trim();
  const service = String(b.service || "").trim();
  if (url && !/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) return "The Project URL looks like https://<ref>.supabase.co.";
  if (anon && !/^(eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_publishable_[\w-]+)$/.test(anon)) return "The public key starts with sb_publishable_ (or eyJ for an older anon key).";
  if (service && !/^(eyJ[\w-]+\.[\w-]+\.[\w-]+|sb_secret_[\w-]+)$/.test(service)) return "The secret key starts with sb_secret_ (or eyJ for an older service_role key).";
  if (service && anon && service === anon) return "The secret key and the public key are the same; paste the secret one in its own field.";
  if (/^sb_publishable_/.test(service)) return "That is the public (publishable) key; the secret key starts with sb_secret_.";
  if (!url && !anon && !service) return "Nothing to save.";
  const file = SUPABASE_ENV();
  const lines = readText(file).split(/\r?\n/).filter((l) => l.trim() !== "");
  const set = (k, v) => { if (!v) return; const i = lines.findIndex((l) => new RegExp(`^\\s*${k}\\s*=`).test(l)); if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`); };
  if (!lines.length) lines.push("# Atomica: one Supabase project for every Atomica project on this computer (prototype comments).", "# The secret key stays on this computer; only tools/prototype_comments.cjs reads it.");
  set("VITE_SUPABASE_URL", url); set("VITE_SUPABASE_ANON_KEY", anon); set("SUPABASE_SERVICE_KEY", service);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
  return null;
}

// ---------- Plan: from PRD and research to approved flows and screen specs ----------
// Reads <project>/Planning/: one NN-<step>.md per step, with a short front matter (status: draft | waiting | done,
// approved: <date>). Three light checkpoints (IA, Flows, Gaps and plan). Read-only, except Approve, which writes
// only that step's front matter.
const PLAN_STEPS = [
  ["00", "Input digest", "PRD, research, meetings read", false],
  ["01", "Users and jobs", "personas and jobs to be done", false],
  ["02", "Information architecture", "sitemap, navigation", true],
  ["03", "Flows", "every screen, state and decision", true],
  ["04", "Screen specs", "DS components per section", false],
  ["05", "Gaps and plan", "DS gaps, Code first or Figma first", true],
  ["06", "Usability pre-check", "Nielsen heuristics", false],
];
function frontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  const front = {};
  if (m) for (const l of m[1].split(/\r?\n/)) { const kv = l.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/); if (kv) front[kv[1]] = kv[2].replace(/^["']|["']$/g, ""); }
  return { front, body: m ? text.slice(m[0].length) : text };
}
function planState(dir) {
  const pdir = path.join(dir, "Planning");
  let files = [];
  try { files = fs.readdirSync(pdir).filter((f) => /^\d\d-.*\.md$/i.test(f)).sort(); } catch {}
  const inputs = {};
  for (const k of ["Brand", "Inspiration", "Screens", "Research"]) { try { inputs[k] = fs.readdirSync(path.join(dir, "Inputs", k)).filter((f) => !f.startsWith(".")).length; } catch { inputs[k] = 0; } }
  try { inputs.Other = fs.readdirSync(path.join(dir, "Inputs"), { withFileTypes: true }).filter((e) => e.isFile() && !e.name.startsWith(".")).length; } catch { inputs.Other = 0; }
  const steps = PLAN_STEPS.map(([no, title, hint, checkpoint]) => {
    const mine = files.filter((f) => f.startsWith(no + "-"));
    const docs = mine.map((f) => {
      const { front, body } = frontMatter(readText(path.join(pdir, f)));
      return { file: f, title: front.title || (body.match(/^#\s+(.+)$/m) || [])[1] || f, status: front.status || "draft", approved: front.approved || null };
    });
    const status = !docs.length ? "todo" : docs.every((d) => d.approved || d.status === "done") ? "done" : docs.some((d) => d.status === "waiting") ? "waiting" : "draft";
    return { no, title, hint, checkpoint, docs, status };
  });
  const next = steps.find((x) => x.status !== "done");
  return { exists: files.length > 0, folder: "Planning/", inputs, steps, next: next ? next.no : null };
}
function planFile(dir, f) {
  const name = path.basename(String(f || ""));
  if (!/^\d\d-[\w .-]+\.md$/i.test(name)) return null;
  const file = path.join(dir, "Planning", name);
  if (!fs.existsSync(file)) return null;
  return { file, name, ...frontMatter(readText(file)) };
}
function approvePlan(dir, f) {
  const doc = planFile(dir, f);
  if (!doc) return false;
  const front = { ...doc.front, status: "done", approved: `${new Date().toISOString().slice(0, 10)} (dashboard)` };
  const fm = Object.entries(front).map(([k, v]) => `${k}: ${v}`).join("\n");
  fs.writeFileSync(doc.file, `---\n${fm}\n---\n${doc.body.replace(/^\n+/, "")}`);
  return true;
}

const MIME = { ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif" };

// ---------- Backend (stage 8): the app's own Supabase project, set up with the 5-step wizard ----------
// One Supabase project per app (decision 3A; the comments project only when the free plan is full). The link and
// the publishable key travel with the project (status.json > backend); the secret key stays on this computer in
// ~/.atomica/backend/<project folder>.env and is never sent back to the page.
const backendSecretFile = (dir) => path.join(os.homedir(), ".atomica", "backend", `${path.basename(dir)}.env`);
const backendSqlFile = (dir) => path.join(dir, "backend", "setup.sql");
export function supabaseRef(link) {
  const t = String(link || "").trim();
  const m = t.match(/supabase\.com\/dashboard\/project\/([a-z0-9]{8,40})(?:[/?#]|$)/i) || t.match(/^https?:\/\/([a-z0-9]{8,40})\.supabase\.co\/?$/i);
  return m ? m[1].toLowerCase() : null;
}
export function backendKeyError(kind, value, other) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (kind === "publishable") {
    if (/^sb_secret_/.test(v)) return "That is the secret key. Paste the publishable key here (it starts with sb_publishable_); the secret one goes in step 4.";
    if (!/^(sb_publishable_[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)$/.test(v)) return "The publishable key starts with sb_publishable_ (or eyJ for an older anon key).";
  } else {
    if (/^sb_publishable_/.test(v)) return "That is the publishable key. The secret key starts with sb_secret_ (Secret keys > Reveal > Copy).";
    if (!/^(sb_secret_[\w-]+|eyJ[\w-]+\.[\w-]+\.[\w-]+)$/.test(v)) return "The secret key starts with sb_secret_ (or eyJ for an older service_role key).";
    if (other && v === other) return "The secret key and the publishable key are the same; paste the secret one here.";
  }
  return null;
}
const readSecret = (dir) => (readText(backendSecretFile(dir)).match(/^\s*SUPABASE_SECRET_KEY\s*=\s*(\S+)/m) || [])[1] || "";
export function backendTables(sql) {
  return [...new Set([...String(sql || "").matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?public"?\.)?"?(\w+)"?/gi)].map((m) => m[1].toLowerCase()))];
}
function backendState(dir) {
  const st = readJson(path.join(dir, "status.json"), {});
  const b = st.backend || {};
  const commentsRef = supabaseRef(projectRepo.publicSupabase(dir).url || "");
  const sql = readText(backendSqlFile(dir));
  return {
    plan: b.plan || null, step: b.step || 1, done: b.done || [], ref: b.project_ref || null,
    url: b.project_ref ? `https://${b.project_ref}.supabase.co` : null, publishable: !!b.publishable_key, secret: !!readSecret(dir),
    secretFile: `~/.atomica/backend/${path.basename(dir)}.env`, setupSql: !!sql, tables: backendTables(sql), check: b.check || null,
    name: path.basename(dir).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), sameAsComments: !!(commentsRef && commentsRef === b.project_ref),
  };
}
function saveBackend(dir, body) {
  const st = readJson(path.join(dir, "status.json"), {});
  const b = { ...(st.backend || {}) };
  if (body.link !== undefined && String(body.link).trim()) {
    const ref = supabaseRef(body.link);
    if (!ref) return "Paste the link from your browser while the project is open: https://supabase.com/dashboard/project/<id>.";
    b.project_ref = ref;
  }
  const pubErr = backendKeyError("publishable", body.publishable);
  if (pubErr) return pubErr;
  if (body.publishable && String(body.publishable).trim()) b.publishable_key = String(body.publishable).trim();
  const secErr = backendKeyError("secret", body.secret, b.publishable_key);
  if (secErr) return secErr;
  if (body.secret && String(body.secret).trim()) {
    const file = backendSecretFile(dir);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `# Atomica: the secret key of this app's Supabase project. Stays on this computer.\nSUPABASE_SECRET_KEY=${String(body.secret).trim()}\n`, { mode: 0o600 });
  }
  if (Number.isInteger(body.step) && body.step >= 1 && body.step <= 5) b.step = body.step;
  if (Number.isInteger(body.done) && body.done >= 1 && body.done <= 5) b.done = [...new Set([...(b.done || []), body.done])].sort();
  st.backend = b;
  fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify(st, null, 2) + "\n");
  return null;
}
// Check: which tables answer through the API (secret key) and whether email sign-in is on (publishable key).
async function checkBackend(dir) {
  const st = readJson(path.join(dir, "status.json"), {});
  const b = st.backend || {};
  const secret = readSecret(dir);
  if (!b.project_ref || !secret) return { ok: false, error: "Finish steps 3 and 4 first (the link and both keys)." };
  const base = `https://${b.project_ref}.supabase.co`;
  const head = (key) => ({ apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}) });
  let tables = [];
  try {
    const r = await fetch(`${base}/rest/v1/`, { headers: head(secret), signal: AbortSignal.timeout(8000) });
    if (r.status === 401 || r.status === 403) return { ok: false, error: "Supabase refused the secret key. Copy it again in step 4." };
    if (!r.ok) return { ok: false, error: `Supabase answered ${r.status}. Is the project paused? Open it in Supabase and press Restore.` };
    const spec = await r.json();
    tables = Object.keys(spec.paths || {}).filter((k) => k !== "/" && !k.startsWith("/rpc/")).map((k) => k.slice(1));
  } catch (e) { return { ok: false, error: `Could not reach ${base} (${e.name === "TimeoutError" ? "timed out" : "no connection"}).` }; }
  let signIn = null;
  if (b.publishable_key) {
    try {
      const r = await fetch(`${base}/auth/v1/settings`, { headers: head(b.publishable_key), signal: AbortSignal.timeout(8000) });
      if (r.ok) { const a = await r.json(); signIn = !!a.external?.email; }
    } catch {}
  }
  const expected = backendTables(readText(backendSqlFile(dir)));
  const missing = expected.filter((t) => !tables.includes(t));
  const check = { at: new Date().toISOString(), tables, missing, signIn, ok: !!tables.length && !missing.length };
  st.backend = { ...b, check, ...(check.ok ? { checked_at: check.at, done: [...new Set([...(b.done || []), 5])].sort() } : {}) };
  fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify(st, null, 2) + "\n");
  return { ok: true, check };
}

export async function handleProjectApi(req, res, url, { send, projectDir, readBody, root, integrations }) {
  const m = url.pathname.match(/^\/api\/project\/([^/]+)\/([\w-]+(?:\/[\w-]+)?)$/);
  if (!m) return false;
  const dir = projectDir(decodeURIComponent(m[1]));
  if (!dir) { send(res, 404, { error: "unknown project" }); return true; }
  if (req.method === "GET" && m[2] === "overview") {
    const o = await projectOverview(dir);
    send(res, 200, { overview: o, pipeline: pipeline(o) });
    return true;
  }
  if (req.method === "GET" && m[2] === "comments") { send(res, 200, readComments(dir)); return true; }
  if (req.method === "POST" && m[2] === "comments/pull") {
    const r = commentsTool(root, dir, "--pull");
    if (r.code !== 0) { send(res, 400, { error: r.err || "Pull failed", detail: r.out }); return true; }
    send(res, 200, { message: r.out, ...readComments(dir) });
    return true;
  }
  if (req.method === "POST" && m[2] === "comments/resolve") {
    const b = await readBody(req);
    if (!/^[0-9a-f-]{36}$/i.test(String(b.id || ""))) { send(res, 400, { error: "bad comment id" }); return true; }
    const args = ["--resolve", b.id];
    if (b.reply) args.push("--reply", String(b.reply).slice(0, 2000));
    const r = commentsTool(root, dir, ...args);
    if (/SCHEMA_UPDATE_NEEDED/.test(r.err)) { send(res, 409, { error: "Supabase schema update needed: open Connect services.", schema: true }); return true; }
    if (r.code !== 0) { send(res, 400, { error: r.err || "Could not close the comment" }); return true; }
    if (b.decision) decide(dir, b.id, b.decision, b.reply);
    commentsTool(root, dir, "--pull");
    send(res, 200, { message: r.out, ...readComments(dir) });
    return true;
  }
  if (req.method === "POST" && m[2] === "comments/decide") {
    const b = await readBody(req);
    if (!/^[0-9a-f-]{36}$/i.test(String(b.id || "")) || !["approved", "rejected", "asked", "proposed", "queued", "in-progress", "applied", "needs-ok"].includes(b.decision)) { send(res, 400, { error: "bad decision" }); return true; }
    send(res, 200, { triage: decide(dir, b.id, b.decision, b.note) });
    return true;
  }
  if (req.method === "GET" && m[2] === "comment-image") {
    const f = path.basename(String(url.searchParams.get("f") || ""));
    const file = path.join(dir, "prototype", "comments", "images", f);
    if (!f || !MIME[path.extname(f).toLowerCase()] || !fs.existsSync(file)) { send(res, 404, { error: "no image" }); return true; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(f).toLowerCase()], "Cache-Control": "no-store" });
    res.end(fs.readFileSync(file));
    return true;
  }
  if (req.method === "GET" && m[2] === "schema-status") {
    const r = commentsTool(root, dir, "--schema-status");
    if (r.code !== 0) { send(res, 200, { keys: false, upToDate: false, error: r.err }); return true; }
    try { send(res, 200, JSON.parse(r.out)); } catch { send(res, 200, { keys: false, upToDate: false, error: r.out }); }
    return true;
  }
  if (req.method === "GET" && m[2] === "sync") { send(res, 200, await syncState(root, dir)); return true; }
  if (req.method === "POST" && (m[2] === "sync/queue" || m[2] === "sync/unqueue")) {
    const b = await readBody(req);
    const ref = String(b.ref || "");
    if (!/^(push|pull):/.test(ref) || ref.length > 600) { send(res, 400, { error: "bad request" }); return true; }
    if (m[2] === "sync/queue") queueRequest(dir, { ref, kind: ref.startsWith("push:") ? "push-figma" : "pull-figma", title: String(b.title || "").slice(0, 400) });
    else unqueueRequest(dir, ref);
    send(res, 200, await syncState(root, dir));
    return true;
  }
  if (req.method === "GET" && m[2] === "design") { send(res, 200, await designState(dir)); return true; }
  if (req.method === "POST" && m[2] === "design/mode") {
    const b = await readBody(req);
    if (!["code-first", "figma-first"].includes(b.mode)) { send(res, 400, { error: "bad mode" }); return true; }
    setDesignMode(dir, b.mode);
    send(res, 200, await designState(dir));
    return true;
  }
  if (req.method === "GET" && m[2] === "versions") { send(res, 200, await versionsState(dir)); return true; }
  if (req.method === "POST" && m[2].startsWith("versions/")) {
    const b = await readBody(req);
    const sha = String(b.sha || "");
    const act = m[2].slice(9);
    if (act !== "snapshot" && act !== "view-stop" && !/^[0-9a-f]{7,40}$/i.test(sha)) { send(res, 400, { error: "bad version" }); return true; }
    let r;
    if (act === "snapshot") r = versions.snapshot(dir, String(b.message || "Saved by hand").slice(0, 120));
    else if (act === "revert") { if (viewing?.dir === dir) stopView(); r = versions.revert(dir, sha); }
    else if (act === "bookmark") r = versions.bookmark(dir, sha, String(b.label || "Bookmark").slice(0, 80));
    else if (act === "unbookmark") r = versions.unbookmark(dir, sha);
    else if (act === "view") r = await startView(dir, sha);
    else if (act === "view-stop") { stopView(); versions.clearViews(dir); r = { ok: true }; }
    else { send(res, 404, { error: "unknown" }); return true; }
    send(res, r.ok === false ? 400 : 200, r.ok === false ? r : { ...r, state: await versionsState(dir) });
    return true;
  }
  if (req.method === "POST" && m[2] === "preview/start") { const r = await startPreview(dir); send(res, r.ok ? 200 : 400, r.ok ? await designState(dir) : r); return true; }
  if (req.method === "POST" && m[2] === "preview/stop") { const r = stopPreview(dir); send(res, r.ok ? 200 : 400, r.ok ? await designState(dir) : r); return true; }
  // Two-way Figma sync (tools/figma_sync.cjs): what waits for Figma, and what changed in Figma since the last sync.
  if (req.method === "GET" && m[2] === "figma-sync") {
    const snap = readJson(figmaSync.snapFile(dir), { screens: {} });
    const status = readJson(path.join(dir, "status.json"), {});
    send(res, 200, {
      pending: figmaSync.pendingToFigma(dir), lastCheck: snap.lastCheck || null, screens: figmaSync.screenDefs(dir).map((x) => ({ slug: x.slug, name: x.name })),
      rules: figmaSync.readRules(dir), codeRepo: status.code_repo || null,
      watch: readJson(path.join(dir, "prototype", "data", "sync-watch.json"), null), schedule: syncSchedule(),
    });
    return true;
  }
  // Storybook, opt-in by sections (tools/storybook_sections.cjs)
  if (req.method === "GET" && m[2] === "storybook") {
    const comps = url.searchParams.get("components") === "1" ? storybookComponents(dir) : null;
    send(res, 200, { config: sbSections.readConfig(dir), groups: sbSections.GROUPS, presets: sbSections.PRESETS, state: await storybookState(dir), ...(comps ? { components: comps } : {}) });
    return true;
  }
  if (req.method === "POST" && m[2] === "storybook") {
    const b = await readBody(req);
    const config = sbSections.saveConfig(dir, b.config || {});
    send(res, 200, { config, state: await storybookState(dir) });
    return true;
  }
  // One repo per project: settings, files check, secrets guard, access, review, editor (tools/project_repo.cjs)
  if (req.method === "GET" && m[2] === "github") { send(res, 200, await githubState(dir, url.searchParams.get("files") === "1")); return true; }
  if (req.method === "GET" && m[2] === "github/editor") { const st = projectRepo.readStatus(dir); send(res, 200, st.collaboration === "team" || st.current_editor || st.github?.repo ? { ...projectRepo.editorState(sharedEditor(dir, st), myLogin()), me: myLogin() || null } : { off: true }); return true; }
  if (req.method === "POST" && m[2] === "github/settings") {
    const b = await readBody(req);
    const s = projectRepo.readStatus(dir);
    const g = { ...(s.github || {}) };
    if (["project-repo", "separate"].includes(b.pages)) g.pages = b.pages;
    if (["owner", "editors"].includes(b.merge_policy)) g.merge_policy = b.merge_policy;
    if (!g.repo) { const r = projectRepo.projectRepo(dir, s); if (r) g.repo = r; }
    s.github = g;
    projectRepo.writeStatus(dir, s);
    send(res, 200, await githubState(dir, false));
    return true;
  }
  if (req.method === "POST" && m[2] === "github/guard") { const r = projectRepo.installHook(dir); send(res, r.ok ? 200 : 400, r.ok ? r : { error: r.reason }); return true; }
  if (req.method === "POST" && m[2] === "github/upload") {
    // the project's files to its repo (people with write access): the comments' public Supabase pair goes with them,
    // the secrets guard is turned on, everything is scanned, then one commit and a push
    const b = await readBody(req);
    if (!fs.existsSync(path.join(dir, ".git"))) { send(res, 400, { error: "This project folder is not a Git repo yet." }); return true; }
    projectRepo.recordPublicSupabase(dir);
    const audit = projectRepo.auditFiles(dir);
    if (audit.secrets.length) { send(res, 400, { error: projectRepo.secretsMessage({ items: audit.secrets, commit: true }) }); return true; }
    projectRepo.installHook(dir);
    git(dir, ["add", "-A"]);
    const c = git(dir, ["commit", "-q", "-m", String(b.message || "Update project files").slice(0, 200)]);
    if (!c.ok && !/nothing to commit/.test(c.out)) { send(res, 400, { error: c.out.split("\n").slice(-4).join("\n") }); return true; }
    let p = git(dir, ["push", "-q"], 60000);
    if (!p.ok) { git(dir, ["pull", "-q", "--rebase", "--autostash"], 60000); p = git(dir, ["push", "-q"], 60000); }
    send(res, p.ok ? 200 : 400, p.ok ? await githubState(dir, true) : { error: `Committed here, not uploaded: ${p.out.split("\n").pop()}` });
    return true;
  }
  if (req.method === "POST" && m[2] === "github/request-access") {
    const plan = projectRepo.pagesPlan(dir);
    if (!plan.repo) { send(res, 400, { error: "This project has no GitHub repo." }); return true; }
    const r = projectRepo.requestAccess(plan.repo, path.basename(dir));
    send(res, r.ok ? 200 : 400, r.ok ? r : { error: r.error });
    return true;
  }
  if (req.method === "POST" && m[2] === "github/approve") {
    const b = await readBody(req);
    const plan = projectRepo.pagesPlan(dir);
    // only a request that is really open on the repo, and only by its owner (admin)
    const a = plan.repo ? projectRepo.access(plan.repo) : {};
    const reqd = a.admin ? projectRepo.pendingRequests(plan.repo).find((x) => x.number === b.number) : null;
    if (!reqd) { send(res, 400, { error: a.admin ? "That request is no longer open." : "Only the repo owner adds collaborators." }); return true; }
    try { projectRepo.approveRequest(plan.repo, reqd); send(res, 200, await githubState(dir, false)); } catch (e) { send(res, 400, { error: String(e.stderr || e.message).trim().split("\n").pop() }); }
    return true;
  }
  if (req.method === "POST" && m[2] === "github/review") {
    const b = await readBody(req);
    const plan = projectRepo.pagesPlan(dir);
    const a = plan.repo ? projectRepo.access(plan.repo) : {};
    if (!a.push) { send(res, 400, { error: "You need edit access first (Request edit access)." }); return true; }
    try { const r = projectRepo.sendForReview(dir, { login: a.login, title: String(b.title || "").slice(0, 120) }); send(res, r.ok ? 200 : 400, r.ok ? r : { error: r.error }); }
    catch (e) { send(res, 400, { error: String(e.stderr || e.message).trim().split("\n").pop() }); }
    return true;
  }
  if (req.method === "POST" && m[2] === "github/editor") {
    const b = await readBody(req);
    const me = myLogin();
    if (!me) { send(res, 401, { error: "Sign in with GitHub first, so the others see who is editing.", code: "github_signin" }); return true; }
    const local = projectRepo.readStatus(dir);
    const s = sharedEditor(dir, local);
    for (const k of ["current_editor", "takeover_request"]) { if (s[k]) local[k] = s[k]; else delete local[k]; }
    let r;
    if (b.action === "take") r = projectRepo.requestTakeover(local, me);
    else if (b.action === "handover") r = projectRepo.handOver(local, me, !!b.toRequester);
    else if (b.action === "keep") { if (local.current_editor?.login === me) { delete local.takeover_request; r = { ok: true }; } else r = { ok: false, error: "Only the current editor answers a request." }; }
    else r = { ok: false, error: "Unknown action." };
    if (!r.ok) { send(res, 400, { error: r.error }); return true; }
    local.editor_changed_at = new Date().toISOString();
    projectRepo.writeStatus(dir, local);
    const sh = shareStatus(dir, b.action === "take" ? (r.asked ? `Take-over request (${me})` : `Editing: ${me}`) : b.action === "handover" ? `Handed over (${me})` : `Kept editing (${me})`);
    send(res, 200, { ...r, ...sh, state: await githubState(dir, false) });
    return true;
  }
  if (req.method === "GET" && m[2] === "storybook/publish-check") { send(res, 200, runTool(root, "publish_storybook.cjs", [dir, "--check"], true)); return true; }
  if (req.method === "POST" && m[2] === "storybook/publish") {
    const r = await new Promise((resolve) => {
      const child = spawn(process.execPath, [path.join(root, "tools", "publish_storybook.cjs"), dir], { cwd: root, windowsHide: true, env: userEnv() });
      let out = ""; child.stdout.on("data", (d) => { out += d; }); child.stderr.on("data", (d) => { out += d; });
      child.on("close", (code) => resolve({ ok: code === 0, output: out.trim().split(/\r?\n/).slice(-6).join("\n") }));
    });
    send(res, r.ok ? 200 : 400, r.ok ? { ...r, state: await storybookState(dir) } : { error: r.output || "Publish failed" });
    return true;
  }
  // ownership rules (sync-rules.json), the linked code repo (status.json > code_repo), the daily check's note
  if (req.method === "POST" && m[2] === "figma-sync/rules") { const b = await readBody(req); send(res, 200, { rules: figmaSync.saveRules(dir, b.rules || {}) }); return true; }
  if (req.method === "POST" && m[2] === "figma-sync/code-repo") {
    const b = await readBody(req);
    const url = String(b.url || "").trim();
    if (url && !/^(https:\/\/[\w.-]+\/[\w./-]+|git@[\w.-]+:[\w./-]+)$/.test(url)) { send(res, 400, { error: "That does not look like a repo link (https://github.com/owner/name)." }); return true; }
    const f = path.join(dir, "status.json"); const s = readJson(f, {});
    if (url) s.code_repo = { url, branch: String(b.branch || "").trim() || null }; else delete s.code_repo;
    fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n");
    send(res, 200, { codeRepo: s.code_repo || null });
    return true;
  }
  if (req.method === "POST" && m[2] === "figma-sync/watch-seen") {
    const f = path.join(dir, "prototype", "data", "sync-watch.json"); const w = readJson(f, null);
    if (w) { w.seen = true; fs.writeFileSync(f, JSON.stringify(w, null, 1) + "\n"); }
    send(res, 200, { ok: true });
    return true;
  }
  // the daily check (tools/sync_watch.cjs, no AI): a Windows scheduled task the user turns on or off here
  if (req.method === "POST" && m[2] === "sync-schedule") {
    const b = await readBody(req);
    const r = setSyncSchedule(!!b.on, root, path.dirname(dir), b.time);
    send(res, r.ok ? 200 : 400, r.ok ? { schedule: syncSchedule() } : { error: r.error });
    return true;
  }
  if (req.method === "POST" && m[2] === "figma-sync/check") { send(res, 200, await figmaSync.check(dir, figmaToken())); return true; }
  if (req.method === "POST" && m[2] === "figma-sync/mark") {
    const b = await readBody(req);
    const slugs = (Array.isArray(b.slugs) ? b.slugs : []).filter((x) => /^[\w-]+$/.test(x));
    await figmaSync.mark(dir, slugs, figmaToken());
    send(res, 200, { ok: true, marked: slugs });
    return true;
  }
  if (req.method === "GET" && m[2] === "publish-check") {
    // the preflight for this project's repo (or the repo it would create), in the user's full environment
    const st = await designState(dir);
    const repo = st.repo || url.searchParams.get("repo") || suggestRepo(dir);
    if (!repo) { send(res, 200, { ok: false, repo: null, checks: [{ key: "repo", label: "GitHub repo", ok: false, reason: "No repo is recorded for this prototype, and the GitHub account could not be read.", fix: "Sign in with GitHub (Connect services > GitHub), then check again." }] }); return true; }
    const r = await new Promise((resolve) => {
      let out = "";
      const child = spawn(process.execPath, [path.join(root, "tools", "publish_prototype.cjs"), dir, "--repo", repo, "--check"], { cwd: root, windowsHide: true, env: userEnv() });
      child.stdout.on("data", (x) => { out += x; }); child.stderr.on("data", (x) => { out += x; });
      child.on("close", () => resolve(out));
    });
    try { send(res, 200, { ...JSON.parse(r.slice(r.indexOf("{"))), recorded: !!st.repo }); } catch { send(res, 200, { ok: false, repo, checks: [{ key: "check", label: "Publish check", ok: false, reason: r.trim().slice(-300) || "The check did not run.", fix: "Run node tools/publish_prototype.cjs with --check in a terminal to see why." }] }); }
    return true;
  }
  if (req.method === "POST" && m[2] === "publish") {
    const st = await designState(dir);
    const b = await readBody(req);
    // a new repo only with the user's explicit click (create: true) and a valid owner/name
    const create = !st.repo && b.create === true && /^[\w.-]+\/[\w.-]+$/.test(String(b.repo || ""));
    const repo = st.repo || (create ? b.repo : null);
    if (!repo) { send(res, 400, { error: "No GitHub repo is recorded for this prototype yet: create one from the Publish panel." }); return true; }
    if (st.publishing) { send(res, 409, { error: "Already publishing." }); return true; }
    const r = await publishPrototype(root, dir, repo, create);
    if (r.ok && create) { const sf = path.join(dir, "status.json"); const s2 = readJson(sf, {}); s2.prototype = { ...(s2.prototype || {}), url: `https://${repo.split("/")[0]}.github.io/${repo.split("/")[1]}/`, repo }; fs.writeFileSync(sf, JSON.stringify(s2, null, 2) + "\n"); }
    send(res, r.ok ? 200 : 400, r.ok ? { ...(await designState(dir)), output: r.output } : { error: r.output || "Publish failed" });
    return true;
  }
  if (req.method === "GET" && m[2] === "connect") { send(res, 200, await connectState(root, dir, integrations)); return true; }
  if (req.method === "POST" && m[2] === "connect/supabase") {
    const err = saveSupabase(await readBody(req));
    if (err) { send(res, 400, { error: err }); return true; }
    send(res, 200, await connectState(root, dir, integrations));
    return true;
  }
  if (req.method === "GET" && m[2] === "backend") { send(res, 200, backendState(dir)); return true; }
  if (req.method === "POST" && m[2] === "backend/save") {
    const err = saveBackend(dir, await readBody(req));
    if (err) { send(res, 400, { error: err }); return true; }
    send(res, 200, backendState(dir));
    return true;
  }
  if (req.method === "POST" && m[2] === "backend/check") {
    const r = await checkBackend(dir);
    if (!r.ok) { send(res, 400, { error: r.error }); return true; }
    send(res, 200, backendState(dir));
    return true;
  }
  if (req.method === "GET" && m[2] === "backend/setup-sql") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(readText(backendSqlFile(dir)));
    return true;
  }
  if (req.method === "GET" && m[2] === "schema-sql") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end(readText(path.join(root, "Screens_Handoff_Skill", "templates", "supabase", "schema.sql")));
    return true;
  }
  if (req.method === "GET" && m[2] === "plan") { send(res, 200, planState(dir)); return true; }
  if (req.method === "GET" && m[2] === "plan-file") {
    const doc = planFile(dir, url.searchParams.get("f"));
    if (!doc) { send(res, 404, { error: "no such planning file" }); return true; }
    send(res, 200, { name: doc.name, front: doc.front, body: doc.body, path: `My Projects/${path.basename(dir)}/Planning/${doc.name}` });
    return true;
  }
  if (req.method === "POST" && m[2] === "plan/approve") {
    const b = await readBody(req);
    if (!approvePlan(dir, b.file)) { send(res, 404, { error: "no such planning file" }); return true; }
    send(res, 200, planState(dir));
    return true;
  }
  send(res, 404, { error: "unknown project action" });
  return true;
}

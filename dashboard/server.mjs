// Local dashboard for the workflow. It runs Claude Code in the Root through the Claude Agent SDK,
// so every skill, rule, hook and memory file works exactly as in the terminal. The browser only
// shows the conversation: AskUserQuestion menus become buttons, permission prompts become cards,
// screenshots Claude reads are shown inline.
//
//   node dashboard/server.mjs            (or double-click Start-Dashboard.cmd / Start-Dashboard.command)
//   http://localhost:4777                listens on this computer only
//
// Nothing here changes how the workflow behaves; it is a window onto the same Claude Code session.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { TOOLS, toolStatus, loginCommand, antigravityPath, usageStore, handoffCommand, LIMIT_RE, which } from "./tools.mjs";
import { startAcp } from "./acp.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PROJECTS = path.join(ROOT, "My Projects");
const PUBLIC = path.join(HERE, "public");
const STATE = path.join(ROOT, ".claude", ".state");
const HISTORY = path.join(STATE, "dashboard-sessions.json");
const LOGS = path.join(STATE, "dashboard-logs"); // one file per Claude session: what the window showed, for Continue
const SETTINGS = path.join(STATE, "dashboard-settings.json");
const PORT = Number(process.env.DASHBOARD_PORT || 4777);
const HOST = "127.0.0.1";

// ---------- small helpers ----------
const readJson = (file, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
};
const readText = (file) => {
  try { return fs.readFileSync(file, "utf8"); } catch { return ""; }
};
const send = (res, code, body, type = "application/json; charset=utf-8") => {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readBody = (req, limit = 25e6) => new Promise((resolve) => {
  let data = "";
  req.on("data", (c) => { data += c; if (data.length > limit) req.destroy(); });
  req.on("end", () => { try { resolve(JSON.parse(data || "{}")); } catch { resolve({}); } });
});
const git = (args, timeout = 20000) => {
  const r = spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8", timeout, windowsHide: true });
  return { ok: !r.error && r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).trim() };
};

// ---------- projects ----------
// Folders listed in private/dashboard-hidden.txt (one name per line, git-ignored) never appear.
function hiddenProjects() {
  return new Set(readText(path.join(ROOT, "private", "dashboard-hidden.txt"))
    .split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter((s) => s && !s.startsWith("#")));
}

function briefLine(brief, label) {
  const m = brief.match(new RegExp(`^\\s*-?\\s*${label}:\\s*(.+)$`, "mi"));
  const v = m ? m[1].trim() : "";
  return v && !v.startsWith("<") ? v : "";
}

function latestChange(changelog) {
  const m = changelog.match(/^## (\d{4}-\d{2}-\d{2})\s*-?\s*(.*)$/m);
  if (!m || m[2].startsWith("<")) return null;
  return { date: m[1], title: m[2].replace(/^[\s\-\u2013\u2014:]+/, "").trim() };
}

function unsynced(changelog) {
  return (changelog.match(/^\s*-\s*Storybook synced:\s*no\b/gim) || []).length;
}

function links(status, brief) {
  const out = [];
  const ds = status?.figma?.design_system;
  if (ds?.url) out.push({ kind: "figma", label: ds.name || "Design System", url: ds.url });
  for (const f of status?.figma?.design_files || []) if (f?.url) out.push({ kind: "figma", label: f.name || "Design file", url: f.url });
  const team = status?.team?.repo;
  if (team) out.push({ kind: "github", label: "Team repo", url: team });
  const pages = (JSON.stringify(status || {}) + "\n" + brief).match(/https:\/\/[\w.-]+\.github\.io\/[^\s"')>\]]*/g) || [];
  for (const url of new Set(pages)) out.push({ kind: "storybook", label: "Storybook", url });
  return out;
}

function listProjects() {
  const hidden = hiddenProjects();
  let dirs = [];
  try {
    dirs = fs.readdirSync(PROJECTS, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith(".") && !hidden.has(d.name.toLowerCase()));
  } catch { return []; }
  return dirs.map((d) => {
    const folder = path.join(PROJECTS, d.name);
    const status = readJson(path.join(folder, "status.json"), {});
    const brief = readText(path.join(folder, "Project_Brief.md"));
    // Fenced blocks hold the entry format example, not real entries.
    const changelog = readText(path.join(folder, "CHANGELOG.md")).replace(/```[\s\S]*?```/g, "");
    let mtime = 0;
    for (const f of ["CHANGELOG.md", "status.json", "Project_Brief.md"]) {
      try { mtime = Math.max(mtime, fs.statSync(path.join(folder, f)).mtimeMs); } catch {}
    }
    return {
      name: d.name,
      title: (status.project && !String(status.project).startsWith("<")) ? status.project : d.name.replace(/_/g, " "),
      platform: briefLine(brief, "Platform").split("->")[0].trim(),
      phase: briefLine(brief, "Phase"),
      next: briefLine(brief, "Next step \\(the next session starts here, Intake section 0c\\)") || briefLine(brief, "Next step"),
      last: latestChange(changelog),
      unsynced: unsynced(changelog),
      team: String(status.collaboration || "").toLowerCase() === "team",
      storybook: !!status.has_storybook,
      links: links(status, brief),
      updated: mtime,
    };
  }).sort((a, b) => b.updated - a.updated);
}

// ---------- project files: add, rename, delete (with Undo), inputs ----------
// Only folders the list shows can be changed: never the template, a hidden project or a path outside My Projects.
const TEMPLATE = path.join(PROJECTS, "_Project_Template");
const TRASH = path.join(STATE, "trash");
const INPUT_KINDS = ["Brand", "Inspiration", "Screens", "Research"];
const UNDO_MS = 30000;
const deleted = new Map(); // trash id -> { name, timer }

function projectDir(name) {
  const n = String(name || "");
  if (!n || n !== path.basename(n) || n.startsWith("_") || n.startsWith(".") || hiddenProjects().has(n.toLowerCase())) return null;
  const dir = path.join(PROJECTS, n);
  try { return fs.statSync(dir).isDirectory() ? dir : null; } catch { return null; }
}

const folderName = (title) => String(title || "").normalize("NFC").trim().replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_+|_+$/g, "").slice(0, 60);
const busyMessage = (e) => /EBUSY|EPERM|EACCES/.test(e?.code || "")
  ? "Windows is still using a file in this folder. Close anything open from it (Storybook, File Explorer, an editor) and try again."
  : String(e?.message || e);

function writeStatusTitle(dir, title) {
  const file = path.join(dir, "status.json");
  const status = readJson(file, {}) || {};
  status.project = title;
  fs.writeFileSync(file, JSON.stringify(status, null, 2) + "\n");
}

function createProject(title) {
  const t = String(title || "").trim().slice(0, 80);
  const name = folderName(t);
  if (!name) return { ok: false, message: "Give the project a name with at least one letter or number." };
  if (!fs.existsSync(TEMPLATE)) return { ok: false, message: "My Projects/_Project_Template is missing, so a project folder cannot be made." };
  if (fs.existsSync(path.join(PROJECTS, name))) return { ok: false, message: `A project folder named "${name}" already exists.` };
  const dir = path.join(PROJECTS, name);
  fs.cpSync(TEMPLATE, dir, { recursive: true });
  writeStatusTitle(dir, t);
  return { ok: true, name, title: t };
}

function renameProject(name, title) {
  const dir = projectDir(name);
  const t = String(title || "").trim().slice(0, 80);
  if (!dir) return { ok: false, message: "That project was not found." };
  if (!t) return { ok: false, message: "The name cannot be empty." };
  // Only the display name changes: the folder keeps its name, so paths in the brief, status, repo and Storybook stay valid.
  writeStatusTitle(dir, t);
  return { ok: true };
}

function deleteProject(name) {
  const dir = projectDir(name);
  if (!dir) return { ok: false, message: "That project was not found." };
  if ([...sessions.values()].some((s) => s.project === name && !s.ended)) return { ok: false, message: "A conversation on this project is still running. Close it first." };
  const id = `${name}-${Date.now()}`;
  try { fs.mkdirSync(TRASH, { recursive: true }); fs.renameSync(dir, path.join(TRASH, id)); } catch (e) { return { ok: false, message: busyMessage(e) }; }
  // Kept for the Undo window only, then removed for good.
  const timer = setTimeout(() => purgeTrash(id), UNDO_MS);
  deleted.set(id, { name, timer });
  return { ok: true, id, undoMs: UNDO_MS };
}

function purgeTrash(id) {
  deleted.delete(id);
  try { fs.rmSync(path.join(TRASH, id), { recursive: true, force: true, maxRetries: 3 }); } catch {}
}

function restoreProject(id) {
  const d = deleted.get(id);
  if (!d) return { ok: false, message: "It is too late to undo; the folder was already removed." };
  const dest = path.join(PROJECTS, d.name);
  if (fs.existsSync(dest)) return { ok: false, message: `A new folder named "${d.name}" exists now, so the old one cannot come back.` };
  try { fs.renameSync(path.join(TRASH, id), dest); } catch (e) { return { ok: false, message: busyMessage(e) }; }
  clearTimeout(d.timer);
  deleted.delete(id);
  return { ok: true, name: d.name };
}

// Folders left in the trash by a dashboard that was closed during the Undo window.
try { for (const f of fs.readdirSync(TRASH)) fs.rmSync(path.join(TRASH, f), { recursive: true, force: true }); } catch {}

function listInputs(name) {
  const dir = projectDir(name);
  if (!dir) return null;
  const out = {};
  for (const kind of INPUT_KINDS) {
    try {
      out[kind] = fs.readdirSync(path.join(dir, "Inputs", kind), { withFileTypes: true })
        .filter((f) => f.isFile() && !f.name.startsWith("."))
        .map((f) => ({ name: f.name, size: fs.statSync(path.join(dir, "Inputs", kind, f.name)).size }));
    } catch { out[kind] = []; }
  }
  return out;
}

const safeFileName = (n) => path.basename(String(n || "")).replace(/[\x00-\x1f<>:"/\\|?*]+/g, "_").replace(/^[.\s]+/, "").slice(0, 120) || "file";

function addInput(name, kind, fileName, data) {
  const dir = projectDir(name);
  if (!dir) return { ok: false, message: "That project was not found." };
  if (!INPUT_KINDS.includes(kind)) return { ok: false, message: "Unknown inputs folder." };
  const base64 = String(data || "").replace(/^data:[^,]*,/, "");
  if (!base64) return { ok: false, message: "The file was empty." };
  const folder = path.join(dir, "Inputs", kind);
  fs.mkdirSync(folder, { recursive: true });
  const clean = safeFileName(fileName);
  const ext = path.extname(clean);
  let target = clean;
  for (let i = 2; fs.existsSync(path.join(folder, target)); i++) target = `${path.basename(clean, ext)} (${i})${ext}`;
  fs.writeFileSync(path.join(folder, target), Buffer.from(base64, "base64"));
  return { ok: true, name: target };
}

function removeInput(name, kind, fileName) {
  const dir = projectDir(name);
  if (!dir || !INPUT_KINDS.includes(kind)) return { ok: false, message: "Not found." };
  const file = path.join(dir, "Inputs", kind, path.basename(String(fileName || "")));
  try { fs.rmSync(file); return { ok: true }; } catch (e) { return { ok: false, message: busyMessage(e) }; }
}

// ---------- workflow updates (git) ----------
function workflowInfo(fetch) {
  if (!fs.existsSync(path.join(ROOT, ".git"))) return { git: false };
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).out;
  if (fetch) git(["fetch", "--quiet", "origin", "master"], 15000);
  const behind = git(["rev-list", "--count", "HEAD..origin/master"]);
  // One line per merged pull request: "#51 · <its title>".
  const changes = git(["log", "--first-parent", "--format=%s%x1f%b%x1e", "-n", "15", "HEAD..origin/master"]).out
    .split("\x1e").map((r) => r.trim()).filter(Boolean)
    .map((r) => {
      const [subject, body = ""] = r.split("\x1f");
      const pr = subject.match(/^Merge pull request (#\d+)/);
      return pr ? `${pr[1]} · ${body.trim().split("\n")[0] || "update"}` : subject;
    });
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]).out.split("\n").filter(Boolean)
    .map((l) => l.slice(3));
  return { git: true, branch, behind: behind.ok ? Number(behind.out) : 0, changes, dirty, head: git(["log", "-1", "--format=%h %cs"]).out };
}

function updateWorkflow() {
  const info = workflowInfo(true);
  if (!info.git) return { ok: false, message: "This folder is not a Git clone, so it cannot update itself." };
  if (info.branch !== "master") return { ok: false, message: `The workflow folder is on the branch "${info.branch}", not master. Switch to master first (ask Claude).` };
  const r = git(["pull", "--ff-only", "origin", "master"], 60000);
  if (!r.ok) {
    return { ok: false, message: "The update stopped without changing anything. Your local edits in these files touch the same lines: " + (info.dirty.join(", ") || "see details") + ". Ask Claude to help.", details: r.out };
  }
  return { ok: true, message: "Workflow updated.", details: r.out, needsInstall: /dashboard\/package(-lock)?\.json/.test(r.out) };
}

// ---------- Claude sessions ----------
// ---------- settings (permission mode) ----------
// auto: Claude Code's auto mode approves routine steps by itself and asks only for risky ones (Recommended).
// default: asks before every step that needs permission.
const MODES = ["auto", "default"];
// fallbackTool: the tool offered first when Claude hits its usage limit (see handoff below).
// models: an optional model per tool (empty = the tool's own default).
const RUNNABLE = TOOLS.filter((t) => t.run && t.id !== "claude").map((t) => t.id);
function getSettings() {
  const saved = readJson(SETTINGS, {}) || {};
  return {
    permissionMode: MODES.includes(saved.permissionMode) ? saved.permissionMode : "auto",
    fallbackTool: [...RUNNABLE, "ask"].includes(saved.fallbackTool) ? saved.fallbackTool : "ask",
    models: { ...(saved.models || {}) },
    // The Claude model picked last in a conversation; new conversations start on it (empty = Claude Code's default).
    claudeModel: typeof saved.claudeModel === "string" ? saved.claudeModel : "",
    // Keep the computer awake while the dashboard runs (see keepAwake below). Off unless the user turns it on.
    keepAwake: saved.keepAwake === true,
  };
}
function setSettings(body) {
  const next = { ...getSettings() };
  if (MODES.includes(body.permissionMode)) next.permissionMode = body.permissionMode;
  if (typeof body.claudeModel === "string" && /^[\w.:\[\]-]{0,80}$/.test(body.claudeModel)) next.claudeModel = body.claudeModel;
  if ([...RUNNABLE, "ask"].includes(body.fallbackTool)) next.fallbackTool = body.fallbackTool;
  if (typeof body.keepAwake === "boolean") next.keepAwake = body.keepAwake;
  if (body.models && typeof body.models === "object") {
    for (const [k, v] of Object.entries(body.models)) if (RUNNABLE.includes(k)) next.models[k] = String(v || "").trim().slice(0, 80);
  }
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(next, null, 2));
  for (const s of sessions.values()) if (!s.ended) s.query?.setPermissionMode(next.permissionMode).catch(() => {});
  keepAwake(next.keepAwake);
  return { ...next, awake: awakeState() };
}

// ---------- keep awake ----------
// While on, the computer does not go to sleep, so a long build, a usage-limit wait or an overnight resume is not cut
// off. The screen may still turn off and lock; Figma keeps working behind it. A small helper process holds the
// request and ends with the dashboard (it watches this process), so sleep comes back as soon as the dashboard closes.
// Windows: SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED). macOS: caffeinate -i.
let awake = null;
let awakeError = "";
function keepAwake(on) {
  if (!on) { if (awake) { try { awake.kill(); } catch {} awake = null; } return; }
  if (awake && awake.exitCode === null) return;
  awakeError = "";
  let cmd, args;
  if (process.platform === "win32") {
    const ps = [
      "Add-Type -Namespace Atomica -Name Power -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern uint SetThreadExecutionState(uint f);'",
      "if ([Atomica.Power]::SetThreadExecutionState([uint32]2147483649) -eq 0) { exit 3 }",
      `Wait-Process -Id ${process.pid}`,
    ].join("; ");
    cmd = "powershell.exe";
    args = ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(ps, "utf16le").toString("base64")];
  } else if (process.platform === "darwin") {
    cmd = "caffeinate"; args = ["-i", "-w", String(process.pid)];
  } else { awakeError = "Keep awake works on Windows and macOS only."; return; }
  try {
    awake = spawn(cmd, args, { stdio: "ignore", windowsHide: true });
    const child = awake;
    child.on("error", (e) => { awakeError = String(e.message || e); if (awake === child) awake = null; });
    child.on("exit", (code) => {
      if (awake !== child) return;
      awake = null;
      if (code) awakeError = "The computer did not accept the keep-awake request.";
    });
  } catch (e) { awakeError = String(e.message || e); awake = null; }
}
const awakeState = () => ({ on: !!(awake && awake.exitCode === null), error: awakeError });
keepAwake(getSettings().keepAwake);
process.on("exit", () => { if (awake) try { awake.kill(); } catch {} });
const modeFlag = (mode) => `--permission-mode ${mode === "default" ? "manual" : mode}`;

const sessions = new Map(); // id -> session
const usage = usageStore(STATE);

function saveHistory(s) {
  const all = readJson(HISTORY, []);
  // A continued conversation keeps one row (same Claude session), so the list never shows it twice.
  const same = (r) => r.id === s.id || (s.claudeSessionId && r.claudeSessionId === s.claudeSessionId);
  const old = all.find(same);
  // preview = the first thing the user wrote, so conversations of the same project can be told apart in the list.
  const row = { id: s.id, claudeSessionId: s.claudeSessionId, project: s.project, title: s.title, preview: old?.preview || s.preview || "", started: old?.started || s.started, updated: Date.now() };
  const next = [row, ...all.filter((r) => !same(r))].slice(0, 40);
  try { fs.mkdirSync(STATE, { recursive: true }); fs.writeFileSync(HISTORY, JSON.stringify(next, null, 2)); } catch {}
  pruneLogs(next);
}

// ---------- conversation titles ----------
// The first thing the user typed names a conversation in the recent list. The dashboard's own start prompts are skipped
// (every project conversation begins with the same one), so the title is what the user actually asked.
const AUTO_PROMPT = /^Start the intake \(Design_System_Intake_Skill\)\./;
const previewOf = (text) => {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return !t || AUTO_PROMPT.test(t) || t.startsWith("<") || t.startsWith("[Request interrupted") ? "" : t.slice(0, 160);
};

// Conversations saved before titles existed: read the first typed message from Claude Code's own transcript once.
function transcriptPreview(claudeSessionId) {
  if (!/^[\w-]{8,}$/.test(String(claudeSessionId || ""))) return "";
  const base = path.join(os.homedir(), ".claude", "projects");
  let dirs = [];
  try { dirs = fs.readdirSync(base); } catch { return ""; }
  for (const d of dirs) {
    const file = path.join(base, d, `${claudeSessionId}.jsonl`);
    let fd;
    try { fd = fs.openSync(file, "r"); } catch { continue; }
    try {
      const buf = Buffer.alloc(2 * 1024 * 1024);
      const n = fs.readSync(fd, buf, 0, buf.length, 0);
      for (const line of buf.subarray(0, n).toString("utf8").split("\n")) {
        if (!line.includes('"type":"user"')) continue;
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        if (m.type !== "user" || m.isSidechain || m.isMeta) continue;
        const c = m.message?.content;
        const text = typeof c === "string" ? c : Array.isArray(c) ? c.filter((x) => x.type === "text").map((x) => x.text).join(" ") : "";
        const p = previewOf(text);
        if (p) return p;
      }
    } finally { fs.closeSync(fd); }
    return "";
  }
  return "";
}

function fillPreviews() {
  const all = readJson(HISTORY, []);
  let changed = false;
  for (const r of all) {
    if ((r.preview && previewOf(r.preview)) || (!r.preview && r.previewChecked) || !r.claudeSessionId) continue;
    r.preview = transcriptPreview(r.claudeSessionId);
    r.previewChecked = true;
    changed = true;
  }
  if (changed) { try { fs.writeFileSync(HISTORY, JSON.stringify(all, null, 2)); } catch {} }
}

// ---------- saved conversation windows ----------
// Each conversation's events are saved under its Claude session id, so Continue (after the dashboard or the computer
// was restarted) shows the earlier messages again and the user can scroll back. Claude's own memory is Claude Code's
// transcript; this file is only what the window showed.
const logFile = (claudeSessionId) => /^[\w-]{8,}$/.test(String(claudeSessionId || "")) ? path.join(LOGS, `${claudeSessionId}.json`) : null;
const SKIP_SAVE = new Set(["delta", "busy", "hello"]);
const KEEP_IMAGES = 60; // screenshots are large; older ones are left out of the saved file

function saveLog(s) {
  clearTimeout(s.saveTimer); s.saveTimer = null;
  const file = logFile(s.claudeSessionId);
  if (!file) return;
  let images = 0;
  const events = [];
  for (let i = s.log.length - 1; i >= 0; i--) {
    const e = s.log[i];
    if (SKIP_SAVE.has(e.type)) continue;
    if (e.type === "image" && ++images > KEEP_IMAGES) continue;
    events.push(e);
  }
  events.reverse();
  try { fs.mkdirSync(LOGS, { recursive: true }); fs.writeFileSync(file, JSON.stringify(events)); } catch {}
}

function scheduleSave(s) {
  if (!s.saveTimer) s.saveTimer = setTimeout(() => saveLog(s), 1500);
}

// The earlier window of a continued conversation. Cards that can no longer be answered (an open question or permission,
// a limit or sign-in card from the old run) are left out, so nothing old looks clickable.
function loadLog(claudeSessionId) {
  const file = logFile(claudeSessionId);
  const events = file ? readJson(file, []) : [];
  if (!Array.isArray(events) || !events.length) return [];
  const answered = new Set(events.filter((e) => e.type === "answered").map((e) => e.requestId));
  const stale = new Set(["limit", "held", "resumed", "auth", "autoresume", "ended", "busy", "delta", "hello", "restored"]);
  const kept = events.filter((e) => !stale.has(e.type) && !((e.type === "question" || e.type === "permission") && !answered.has(e.requestId)));
  return kept.length ? [...kept, { type: "restored", at: Date.now(), since: kept[kept.length - 1].at || null }] : [];
}

function pruneLogs(rows) {
  const keep = new Set(rows.map((r) => r.claudeSessionId).filter(Boolean).map((id) => `${id}.json`));
  let names = [];
  try { names = fs.readdirSync(LOGS); } catch { return; }
  for (const n of names) if (n.endsWith(".json") && !keep.has(n)) { try { fs.unlinkSync(path.join(LOGS, n)); } catch {} }
}

function emit(s, event) {
  event.at = Date.now();
  s.log.push(event);
  if (s.log.length > 4000) s.log.splice(0, s.log.length - 4000);
  if (!SKIP_SAVE.has(event.type)) scheduleSave(s);
  if (event.type === "user" && !s.preview) s.preview = previewOf(event.text);
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of s.clients) res.write(line);
}

// A queue the SDK reads user messages from, so one Claude session lasts the whole conversation.
function inbox() {
  const items = [];
  let wake = null;
  let closed = false;
  return {
    push(msg) { items.push(msg); wake?.(); },
    close() { closed = true; wake?.(); },
    async *[Symbol.asyncIterator]() {
      while (true) {
        while (items.length) yield items.shift();
        if (closed) return;
        await new Promise((r) => { wake = r; });
        wake = null;
      }
    },
  };
}

function userMessage(text, images = []) {
  const content = [];
  for (const img of images) {
    const m = String(img).match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);
    if (m) content.push({ type: "image", source: { type: "base64", media_type: m[1], data: m[2] } });
  }
  if (text) content.push({ type: "text", text });
  return { type: "user", message: { role: "user", content }, parent_tool_use_id: null, session_id: "" };
}

function toolSummary(name, input = {}) {
  const short = (v, n = 90) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
  const rel = (p) => { try { return path.relative(ROOT, String(p)).split(path.sep).join("/") || String(p); } catch { return String(p); } };
  switch (name) {
    case "Bash": return input.description || short(input.command);
    case "Read": case "Write": case "Edit": case "NotebookEdit": return rel(input.file_path || input.notebook_path || "");
    case "Glob": case "Grep": return short(input.pattern);
    case "Skill": return input.skill || "";
    case "Agent": case "Task": return input.description || short(input.prompt);
    case "WebFetch": return short(input.url);
    case "WebSearch": return short(input.query);
    case "TodoWrite": return "Updated the plan";
    default: return short(Object.values(input).find((v) => typeof v === "string") || "");
  }
}

function friendlyTool(name) {
  if (name.startsWith("mcp__")) {
    const [, server, tool] = name.split("__");
    return `${server}: ${(tool || "").replace(/_/g, " ")}`;
  }
  return { Bash: "Ran a command", Read: "Read", Write: "Wrote", Edit: "Edited", Glob: "Looked for files", Grep: "Searched",
    Skill: "Loaded skill", Agent: "Started a helper", Task: "Started a helper", WebFetch: "Opened", WebSearch: "Searched the web",
    TodoWrite: "Plan" }[name] || name;
}

// The installed Claude Code is preferred, so the dashboard uses the same version and login as the terminal.
function claudeExecutable() {
  if (process.env.CLAUDE_CODE_PATH) return process.env.CLAUDE_CODE_PATH;
  const r = spawnSync(process.platform === "win32" ? "where" : "which", ["claude"], { encoding: "utf8", windowsHide: true });
  const found = (r.stdout || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  // A Windows .cmd shim cannot be started directly; the SDK's own copy is used then.
  return found.find((p) => process.platform !== "win32" || /\.exe$/i.test(p));
}

// ---------- sign-in (claude auth) ----------
// The dashboard signs in with Claude Code's own commands, so the login is the same one the terminal uses.
function claudeCommand(args) {
  const exe = claudeExecutable();
  if (exe) return { cmd: exe, args, shell: false };
  return { cmd: "claude", args, shell: process.platform === "win32" };
}

let authCache = null;
function authStatus(force) {
  if (!force && authCache && Date.now() - authCache.at < 30000) return authCache.value;
  const c = claudeCommand(["auth", "status", "--json"]);
  const r = spawnSync(c.cmd, c.args, { encoding: "utf8", timeout: 15000, windowsHide: true, shell: c.shell });
  let value;
  try {
    const j = JSON.parse((r.stdout || "").trim());
    value = { known: true, loggedIn: !!j.loggedIn, method: j.authMethod || "", email: j.email || j.account?.email || "" };
  } catch {
    value = { known: false, loggedIn: false, error: r.error ? "Claude Code was not found on this computer." : ((r.stderr || r.stdout || "").trim().slice(0, 300) || "Could not read the sign-in status.") };
  }
  authCache = { at: Date.now(), value };
  return value;
}

const stripAnsi = (t) => String(t).replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
let login = null; // { proc, output, exitCode, startedAt }

function startLogin(method) {
  if (login && login.exitCode === null) return loginState();
  const args = ["auth", "login"];
  if (method === "console") args.push("--console");
  const c = claudeCommand(args);
  const proc = spawn(c.cmd, c.args, { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], windowsHide: true, shell: c.shell });
  login = { proc, output: "", exitCode: null, startedAt: Date.now() };
  const onData = (d) => { login.output = (login.output + stripAnsi(d.toString())).slice(-8000); };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  proc.on("error", (e) => { login.output += `\n${e.message}`; login.exitCode = -1; });
  proc.on("exit", (code) => { login.exitCode = code ?? -1; authCache = null; });
  setTimeout(() => { if (login?.proc === proc && login.exitCode === null) proc.kill(); }, 10 * 60 * 1000);
  return loginState();
}

function loginState() {
  if (!login) return { running: false };
  const url = (login.output.match(/https:\/\/[^\s"'<>]+/g) || []).find((u) => /claude\.ai|anthropic\.com|oauth|login/i.test(u)) || "";
  return {
    running: login.exitCode === null,
    exitCode: login.exitCode,
    output: login.output.trim().split(/\r?\n/).slice(-12).join("\n"),
    url,
    needsCode: login.exitCode === null && /paste|code/i.test(login.output),
    status: login.exitCode === null ? null : authStatus(true),
  };
}

function sendLoginCode(code) {
  if (!login || login.exitCode !== null) return false;
  login.proc.stdin.write(String(code).trim() + "\n");
  return true;
}

function cancelLogin() {
  if (login && login.exitCode === null) login.proc.kill();
  return { ok: true };
}

function startSession({ prompt, project, title, images, resume }) {
  const id = crypto.randomUUID();
  const s = {
    id, project: project || null, title: title || (prompt || "").slice(0, 60) || "Conversation",
    started: Date.now(), log: resume ? loadLog(resume) : [], clients: new Set(), pending: new Map(),
    busy: true, claudeSessionId: resume || null, ended: false,
    model: getSettings().claudeModel, limit: null, held: [], autoResume: true,
    agent: "claude", gemini: null, geminiNote: "",
  };
  if (resume) s.preview = readJson(HISTORY, []).find((r) => r.claudeSessionId === resume)?.preview || "";
  sessions.set(id, s);
  runQuery(s, resume);
  if (prompt || (images && images.length)) {
    s.inbox.push(userMessage(prompt, images));
    emit(s, { type: "user", text: prompt || "", images: images || [] });
  } else {
    s.busy = false;
  }
  emit(s, { type: "busy", busy: s.busy });
  saveHistory(s);
  return s;
}

// One Claude Code run for a conversation. It is started again with resume (same session id, full history) when
// the conversation ended (usage limit, an error, a lost sign-in), so the user keeps writing in the same window.
function runQuery(s, resume) {
  s.inbox = inbox();
  s.abort = new AbortController();
  s.ended = false;
  const canUseTool = (toolName, input, opts) => new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const done = (result) => { s.pending.delete(requestId); resolve(result); };
    s.pending.set(requestId, { toolName, input, resolve: done });
    opts.signal?.addEventListener("abort", () => done({ behavior: "deny", message: "Stopped by the user." }));
    if (toolName === "AskUserQuestion") {
      emit(s, { type: "question", requestId, questions: input.questions || [] });
    } else {
      emit(s, {
        type: "permission", requestId, tool: friendlyTool(toolName), detail: toolSummary(toolName, input),
        title: opts.title || "", reason: opts.decisionReason || "", canAlways: !!(opts.suggestions && opts.suggestions.length),
        suggestions: opts.suggestions || [],
      });
    }
  });

  const exe = claudeExecutable();
  const q = query({
    prompt: s.inbox,
    options: {
      cwd: ROOT,
      settingSources: ["user", "project", "local"],
      includePartialMessages: true,
      abortController: s.abort,
      canUseTool,
      permissionMode: getSettings().permissionMode,
      ...(s.model ? { model: s.model } : {}),
      ...(resume ? { resume } : {}),
      ...(exe ? { pathToClaudeCodeExecutable: exe } : {}),
    },
  });
  s.query = q;
  s.models = null;
  const run = q;
  pump(s).catch((err) => {
    const message = explainError(err);
    if (message !== AUTH_MESSAGE && LIMIT_RE.test(message)) return hitLimit(s, message);
    emit(s, message === AUTH_MESSAGE ? { type: "auth", message } : { type: "error", message });
  }).finally(() => {
    if (s.query !== run) return; // already replaced by a newer run of the same conversation
    s.ended = true; s.busy = false;
    emit(s, { type: "busy", busy: false });
    emit(s, { type: "ended" });
  });
}

// ---------- usage limit: hold, then continue in the same conversation ----------
// The reset time comes from Claude Code's rate-limit event, or from its message ("resets 1:40pm (Africa/Cairo)").
function resetFromText(text) {
  const m = String(text || "").match(/resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*([ap]m)?/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (!m[3]) h = Number(m[1]);
  else if (/pm/i.test(m[3])) h += 12;
  const d = new Date();
  d.setHours(h, Number(m[2] || 0), 0, 0);
  if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate() + 1);
  return d.getTime();
}

function hitLimit(s, message, resetsAt) {
  // An exact time (rate-limit event) wins over one read from a message; a known time is kept for the same limit.
  const at = resetsAt || s.limit?.at || resetFromText(message) || null;
  const first = !s.limit;
  s.limit = { at, message: String(message || "").slice(0, 300) };
  if (first) usage.add({ tool: "claude", project: s.project, limit: s.limit.message.slice(0, 200), input: 0, output: 1 });
  clearTimeout(s.limitTimer);
  // Wake one minute after the reset; setTimeout cannot wait more than about 24 days.
  if (at) s.limitTimer = setTimeout(() => limitOver(s), Math.min(Math.max(at - Date.now() + 60000, 5000), 2 ** 31 - 1));
  emit(s, { type: "limit", tool: "claude", message: s.limit.message, resetsAt: at, autoResume: s.autoResume, fallback: getSettings().fallbackTool });
}

const RESUME_PROMPT = "Claude's usage limit has reset. Continue this conversation from where it stopped. If another tool worked on the project meanwhile (CHANGELOG.md entries with a Tool: line, or .claude/.state/handoff.md written after your last message), read that first and audit it as CLAUDE.md > Handoff from other tools says, then go on.";

function limitOver(s) {
  if (!s.limit || !sessions.has(s.id)) return;
  s.limit = null;
  clearTimeout(s.limitTimer);
  // Gemini is answering in this conversation: Claude waits until the user switches back.
  if (s.agent === "gemini") { emit(s, { type: "resumed", auto: false, other: AGENTS.gemini }); return; }
  const held = s.held.splice(0);
  emit(s, { type: "resumed", auto: s.autoResume });
  if (!s.autoResume && !held.length) return;
  const text = held.length ? [RESUME_PROMPT, ...held.map((h) => h.text).filter(Boolean)].join("\n\n") : RESUME_PROMPT;
  const images = held.flatMap((h) => h.images || []);
  deliver(s, text, images);
}

// Sends a message into the running conversation, starting it again (resume) when it had ended.
function deliver(s, text, images) {
  if (s.ended) {
    if (!s.claudeSessionId) return false;
    runQuery(s, s.claudeSessionId);
  }
  s.busy = true;
  emit(s, { type: "busy", busy: true });
  s.inbox.push(userMessage(withGeminiNote(s, text), images));
  return true;
}

async function sessionModels(s) {
  if (s.agent === "gemini") {
    const g = await startGemini(s).catch(() => null);
    return { agent: "gemini", current: g?.current || "", models: g?.models || [] };
  }
  if (!s.models) s.models = s.query.supportedModels().catch(() => []);
  const list = await Promise.race([s.models, new Promise((r) => setTimeout(() => r([]), 15000))]);
  return { current: s.model || "", models: list.map((m) => ({ value: m.value, name: m.displayName, description: m.description })) };
}

async function switchModel(s, model) {
  const m = String(model || "");
  if (!/^[\w.:\[\]-]{0,80}$/.test(m)) return { ok: false, message: "Unknown model." };
  if (s.agent === "gemini") {
    const g = await startGemini(s);
    await g.client.request("session/set_model", { sessionId: g.sessionId, modelId: m });
    g.current = m;
    setSettings({ models: { gemini: m } });
    emit(s, { type: "model", model: m, agent: "gemini" });
    return { ok: true };
  }
  if (!s.ended) await s.query.setModel(m || undefined);
  s.model = m;
  setSettings({ claudeModel: m });
  emit(s, { type: "model", model: m });
  return { ok: true };
}

// Claude Code's sign-in expired or is missing: shown as a card with a Sign in button, not as a reply.
const AUTH_RE = /failed to authenticate|oauth session|not logged in|please run \/login|invalid api key|authentication_error|credentials? (?:expired|not found)/i;
const AUTH_MESSAGE = "Claude Code needs you to sign in again on this computer.";

function explainError(err) {
  const msg = String(err?.message || err);
  if (AUTH_RE.test(msg)) return AUTH_MESSAGE;
  if (/ENOENT|spawn/i.test(msg)) return "Claude Code could not be started. Install it (https://claude.com/claude-code) or run Setup again.";
  return msg;
}

async function pump(s) {
  let liveText = false;
  for await (const m of s.query) {
    if (m.session_id && !s.claudeSessionId) { s.claudeSessionId = m.session_id; saveHistory(s); saveLog(s); }
    // Claude Code reports plan limits with the exact reset time; "rejected" means this conversation must wait.
    if (m.type === "rate_limit_event") {
      const info = m.rate_limit_info || {};
      if (info.status === "rejected") hitLimit(s, `Claude's ${String(info.rateLimitType || "usage").replace(/_/g, " ")} limit is reached.`, info.resetsAt ? info.resetsAt * 1000 : null);
      continue;
    }
    if (m.type === "stream_event" && !m.parent_tool_use_id) {
      const ev = m.event;
      if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        liveText = true;
        emit(s, { type: "delta", text: ev.delta.text });
      }
      continue;
    }
    if (m.type === "assistant") {
      const sub = !!m.parent_tool_use_id;
      for (const block of m.message?.content || []) {
        if (block.type === "text" && !sub && block.text.length < 400 && AUTH_RE.test(block.text)) {
          emit(s, { type: "auth", message: AUTH_MESSAGE, detail: block.text });
          liveText = false;
        } else if (block.type === "text" && !sub && block.text.length < 300 && (m.error === "rate_limit" || (m.message?.model === "<synthetic>" && /usage limit|session limit|limit reached|out of (?:extra )?usage/i.test(block.text)))) {
          hitLimit(s, block.text);
          liveText = false;
        } else if (block.type === "text" && !sub && block.text.trim()) {
          emit(s, { type: "text", text: block.text, streamed: liveText });
          liveText = false;
        } else if (block.type === "tool_use" && block.name !== "AskUserQuestion") {
          emit(s, { type: "tool", id: block.id, name: friendlyTool(block.name), detail: toolSummary(block.name, block.input), sub });
        }
      }
      continue;
    }
    if (m.type === "user") {
      // Tool results: only images are shown (screenshots, exported frames), text stays out of the way.
      const content = Array.isArray(m.message?.content) ? m.message.content : [];
      for (const block of content) {
        if (block.type !== "tool_result" || !Array.isArray(block.content)) continue;
        for (const part of block.content) {
          if (part.type === "image" && part.source?.type === "base64") {
            emit(s, { type: "image", toolId: block.tool_use_id, src: `data:${part.source.media_type};base64,${part.source.data}` });
          }
        }
      }
      continue;
    }
    if (m.type === "result") {
      s.busy = false;
      const error = m.subtype !== "success" ? (m.errors || []).join(" ") || m.subtype : "";
      const u = m.usage || {};
      // New input and output only: cache re-reads repeat the same context every turn and would read as millions of tokens.
      usage.add({ tool: "claude", project: s.project, input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0), output: u.output_tokens || 0, cached: u.cache_read_input_tokens || 0, cost: m.total_cost_usd || 0 });
      if (error && LIMIT_RE.test(error)) hitLimit(s, error);
      if (AUTH_RE.test(error)) emit(s, { type: "auth", message: AUTH_MESSAGE, detail: error });
      emit(s, { type: "result", ok: m.subtype === "success", turns: m.num_turns, ms: m.duration_ms, error: AUTH_RE.test(error) ? "" : error });
      emit(s, { type: "busy", busy: false });
      saveHistory(s);
    }
  }
}

function sendMessage(s, text, images) {
  if (s.agent === "gemini") {
    emit(s, { type: "user", text, images: images || [] });
    geminiSend(s, text, images);
    return true;
  }
  if (s.ended && !s.claudeSessionId) return false;
  emit(s, { type: "user", text, images: images || [] });
  // While Claude is over its limit, messages wait here and go out together when it is back.
  if (s.limit) {
    s.held.push({ text, images: images || [] });
    emit(s, { type: "held", count: s.held.length, resetsAt: s.limit.at });
    return true;
  }
  return deliver(s, text, images);
}

function setAutoResume(s, on) {
  s.autoResume = !!on;
  emit(s, { type: "autoresume", on: s.autoResume });
  return { ok: true };
}

// ---------- Gemini CLI in the same conversation (Agent Client Protocol) ----------
// The tool picker under the message box switches who answers: Claude Code (Agent SDK) or Gemini CLI (`gemini --acp`).
// The conversation, its window and its history stay the same. Gemini asks before every edit or command, shown as the
// same Yes / No cards, so it never runs unattended. Each switch passes the other tool's part of the conversation on:
// Gemini starts from .claude/.state/handoff.md, and Claude gets Gemini's part with the instruction to audit that work.
const AGENTS = { claude: "Claude", gemini: "Gemini CLI" };
const GEMINI_INTRO = (note) => [
  "You are Gemini CLI, continuing a conversation the user started with Claude Code in the Atomica dashboard. The user switched tools in the same window.",
  `Before anything else read AGENTS.md and ${note} (the conversation so far), then answer the user's message below.`,
  "Follow AGENTS.md: log every change in the project's CHANGELOG.md with a `Tool: Gemini CLI` line, commit with a `[Gemini]` prefix, and ask the user before any Figma write, publish, push or delete.",
].join("\n");
const KIND = { read: "Read", edit: "Edited", delete: "Deleted", move: "Moved", search: "Searched", execute: "Ran a command", think: "Thought", fetch: "Opened", switch_mode: "Mode", other: "Tool" };

function geminiFlush(s) {
  const g = s.gemini;
  if (!g?.text) return;
  emit(s, { type: "text", text: g.text, streamed: true, agent: "gemini" });
  g.transcript.push(`**Gemini:** ${g.text}`);
  g.text = "";
}

function geminiNotify(s, method, params) {
  if (method !== "session/update") return;
  const u = params.update || {};
  const g = s.gemini;
  if (u.sessionUpdate === "agent_message_chunk" && u.content?.type === "text") {
    g.text += u.content.text;
    emit(s, { type: "delta", text: u.content.text, agent: "gemini" });
  } else if (u.sessionUpdate === "tool_call") {
    geminiFlush(s);
    // A pending call is followed by a permission card that names it; the chip comes when it runs.
    if (u.status !== "pending") emit(s, { type: "tool", id: u.toolCallId, name: KIND[u.kind] || "Tool", detail: u.title || "" });
    g.transcript.push(`- Gemini: ${u.title || u.kind}`);
  } else if (u.sessionUpdate === "tool_call_update" && u.status === "in_progress" && g.asked.has(u.toolCallId)) {
    g.asked.delete(u.toolCallId);
    emit(s, { type: "tool", id: u.toolCallId, name: KIND[u.kind] || "Tool", detail: u.title || "" });
  } else if (u.sessionUpdate === "usage_update" && typeof u.used === "number") {
    g.used = u.used;
  }
}

function geminiRequest(s, method, params) {
  if (method !== "session/request_permission") return Promise.reject(new Error(`Not supported: ${method}`));
  geminiFlush(s);
  const options = params.options || [];
  const call = params.toolCall || {};
  const detail = (call.content || []).map((c) => c.content?.text || (c.path ? `${c.path}` : "")).filter(Boolean).join("\n").slice(0, 600);
  s.gemini.asked.add(call.toolCallId);
  return new Promise((resolve) => {
    const requestId = crypto.randomUUID();
    const pick = (kinds) => options.find((o) => kinds.includes(o.kind));
    s.pending.set(requestId, { toolName: "gemini", options, resolve: (body) => {
      s.pending.delete(requestId);
      if (body === "cancel") return resolve({ outcome: { outcome: "cancelled" } });
      const o = body.allow ? (body.always ? pick(["allow_always"]) || pick(["allow_once"]) : pick(["allow_once"])) : pick(["reject_once", "reject_always"]);
      resolve(o ? { outcome: { outcome: "selected", optionId: o.optionId } } : { outcome: { outcome: "cancelled" } });
    } });
    emit(s, { type: "permission", requestId, agent: "gemini", tool: KIND[call.kind] || "a tool",
      title: `Gemini wants to: ${call.title || KIND[call.kind] || "use a tool"}`, detail, canAlways: !!pick(["allow_always"]) });
  });
}

// Open Gemini permission cards are closed as "No" when its turn is stopped or the tool exits.
function cancelGeminiAsks(s) {
  for (const [requestId, p] of [...s.pending]) {
    if (p.toolName !== "gemini") continue;
    p.resolve("cancel");
    emit(s, { type: "answered", requestId, allow: false });
  }
}

const GEMINI_AUTH = "Gemini CLI is not signed in on this computer. Open Settings, press Sign in next to Gemini CLI, then pick Gemini here again.";

async function startGemini(s) {
  if (s.gemini?.ready && !s.gemini.client.closed) return s.gemini.ready;
  const exe = which("gemini");
  if (!exe) throw new Error("Gemini CLI is not installed on this computer. See Settings.");
  const g = s.gemini = { text: "", transcript: [], asked: new Set(), used: 0, sessionId: null, models: [], current: "", introduced: false, busy: false };
  g.client = startAcp({
    exe, args: ["--acp"], cwd: ROOT,
    onNotify: (method, params) => geminiNotify(s, method, params),
    onRequest: (method, params) => geminiRequest(s, method, params),
    onExit: () => {
      cancelGeminiAsks(s);
      if (s.gemini === g && g.busy) { g.busy = false; s.busy = false; emit(s, { type: "busy", busy: false }); }
      if (s.gemini === g) g.ready = null;
    },
  });
  g.ready = (async () => {
    await g.client.request("initialize", { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false } });
    let r;
    try {
      r = await g.client.request("session/new", { cwd: ROOT, mcpServers: [] });
    } catch (e) {
      if (e.code === -32000) throw new Error(GEMINI_AUTH);
      throw e;
    }
    g.sessionId = r.sessionId;
    g.models = (r.models?.availableModels || []).map((m) => ({ value: m.modelId, name: m.name || m.modelId, description: m.description || "" }));
    g.current = r.models?.currentModelId || "";
    // The model chosen for Gemini in Settings (or here last time) is applied when it is not the default.
    const want = getSettings().models.gemini;
    if (want && want !== g.current && want !== "auto") {
      try { await g.client.request("session/set_model", { sessionId: g.sessionId, modelId: want }); g.current = want; } catch {}
    }
    return g;
  })();
  g.ready.catch(() => { g.client.kill(); if (s.gemini === g) s.gemini = null; });
  return g.ready;
}

function imageBlocks(images = []) {
  const out = [];
  for (const img of images) {
    const m = String(img).match(/^data:(image\/(?:png|jpeg|gif|webp));base64,(.+)$/);
    if (m) out.push({ type: "image", mimeType: m[1], data: m[2] });
  }
  return out;
}

async function geminiSend(s, text, images) {
  s.busy = true;
  emit(s, { type: "busy", busy: true });
  let g;
  try {
    g = await startGemini(s);
    let prompt = text;
    if (!g.introduced) {
      writeHandoff(s);
      prompt = `${GEMINI_INTRO(HANDOFF_NOTE)}\n\nThe user's message:\n${text}`;
      g.introduced = true;
    }
    g.busy = true;
    g.transcript.push(`**User:** ${text}`);
    const r = await g.client.request("session/prompt", { sessionId: g.sessionId, prompt: [...imageBlocks(images), { type: "text", text: prompt }] });
    geminiFlush(s);
    if (g.used) usage.add({ tool: "gemini", project: s.project, input: g.used, output: 0 });
    g.used = 0;
    emit(s, { type: "result", ok: r?.stopReason !== "refusal", agent: "gemini", error: r?.stopReason === "refusal" ? "Gemini refused this request." : "" });
  } catch (e) {
    if (g) geminiFlush(s);
    const msg = String(e?.message || e);
    if (LIMIT_RE.test(msg) || /quota|429|resource.?exhausted/i.test(msg)) usage.add({ tool: "gemini", project: s.project, limit: msg.slice(0, 200), input: 0, output: 1 });
    emit(s, { type: "error", agent: "gemini", message: /quota|429|resource.?exhausted/i.test(msg) ? `Gemini hit its limit: ${msg.slice(0, 240)}` : msg.slice(0, 400) });
  } finally {
    if (g) g.busy = false;
    s.busy = false;
    emit(s, { type: "busy", busy: false });
  }
  return true;
}

// Switches who answers in this conversation. Gemini starts in the background so its models are ready to pick.
async function switchAgent(s, agent) {
  if (!AGENTS[agent]) return { ok: false, message: "Unknown tool." };
  if (agent === s.agent) return { ok: true, agent };
  if (agent === "gemini") {
    try { await startGemini(s); } catch (e) { return { ok: false, message: String(e.message || e) }; }
  } else if (s.gemini?.busy) {
    s.gemini.client.notify("session/cancel", { sessionId: s.gemini.sessionId });
    cancelGeminiAsks(s);
  }
  const from = s.agent;
  s.agent = agent;
  emit(s, { type: "agent", agent, name: AGENTS[agent], from });
  if (agent === "claude" && s.gemini?.transcript.length) s.geminiNote = s.gemini.transcript.splice(0).join("\n\n");
  // Messages that waited for Claude's limit go to Gemini at once.
  if (agent === "gemini" && s.held.length) {
    const held = s.held.splice(0);
    geminiSend(s, held.map((h) => h.text).filter(Boolean).join("\n\n"), held.flatMap((h) => h.images || []));
  }
  return { ok: true, agent };
}

// Claude's first message after Gemini worked: Gemini's part of the conversation, to read and audit first.
function withGeminiNote(s, text) {
  if (!s.geminiNote) return text;
  let note = s.geminiNote;
  s.geminiNote = "";
  if (note.length > 12000) note = "…\n\n" + note.slice(-12000);
  return `The user switched to Gemini CLI for part of this conversation and is back with you. Gemini's part (its replies and the steps it ran):\n\n${note}\n\nCheck the CHANGELOG.md entries with a \`Tool: Gemini CLI\` line and audit that work as CLAUDE.md > Handoff from other tools says, then answer:\n\n${text}`;
}

function answer(s, requestId, body) {
  const p = s.pending.get(requestId);
  if (!p) return false;
  if (p.toolName === "gemini") {
    p.resolve(body);
    emit(s, { type: "answered", requestId, allow: !!body.allow, always: !!body.always });
    return true;
  }
  if (p.toolName === "AskUserQuestion") {
    if (body.cancel) {
      p.resolve({ behavior: "deny", message: "The user closed the question without answering." });
    } else {
      const annotations = {};
      for (const [q, note] of Object.entries(body.notes || {})) if (note) annotations[q] = { notes: note };
      p.resolve({ behavior: "allow", updatedInput: { ...p.input, answers: body.answers || {}, ...(Object.keys(annotations).length ? { annotations } : {}) } });
    }
    emit(s, { type: "answered", requestId, answers: body.answers || {}, cancel: !!body.cancel });
  } else {
    if (body.allow) {
      p.resolve({ behavior: "allow", updatedInput: p.input, ...(body.always ? { updatedPermissions: s.log.find((e) => e.requestId === requestId)?.suggestions || [] } : {}) });
    } else {
      p.resolve({ behavior: "deny", message: body.message || "The user said no." });
    }
    emit(s, { type: "answered", requestId, allow: !!body.allow, always: !!body.always });
  }
  return true;
}

// Opens the same conversation in a terminal (claude --resume), for work that is easier there.
function openInTerminal(s) {
  if (!s.claudeSessionId) return { ok: false, message: "The conversation has not started yet." };
  const mode = modeFlag(getSettings().permissionMode);
  const r = runInTerminal(`claude --resume ${s.claudeSessionId} ${mode}`);
  return r.ok ? { ...r, message: "Opened in a terminal. Stop here first so both do not answer at once." } : r;
}

// ---------- Settings: GitHub, Figma, machine (read only; tokens are never read or shown) ----------
let integCache = null;
function integrations(force) {
  if (!force && integCache && Date.now() - integCache.at < 60000) return integCache.value;
  const sh = (cmd, args, timeout = 15000) => {
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", timeout, windowsHide: true });
    return { ok: !r.error && r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).trim() };
  };
  const ghs = sh("gh", ["auth", "status", "--hostname", "github.com"]);
  const account = (ghs.out.match(/account (\S+)/) || [])[1] || "";
  const origin = git(["remote", "get-url", "origin"]).out;
  const pyCmd = ["python", "py", "python3"].find((c) => sh(c, ["--version"], 5000).ok);
  const py = pyCmd ? sh(pyCmd, ["--version"], 5000) : null;
  const figma = pyCmd ? sh(pyCmd, ["tools/figma_tools_check.py"], 20000).out : "";
  const value = {
    github: { cli: !/not recognized|ENOENT/i.test(ghs.out) && ghs.out !== "", signedIn: !!account, account, repo: origin.replace(/\.git$/, "") },
    figma: { lines: figma.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/token/i.test(l)).slice(0, 6) },
    machine: {
      node: process.version,
      python: py ? py.out.replace(/^Python\s*/, "") : "",
      git: (sh("git", ["--version"], 5000).out.match(/\d+\.\d+(\.\d+)?/) || [""])[0],
    },
  };
  integCache = { at: Date.now(), value };
  return value;
}

// ---------- handoff to another tool ----------
// Writes what this conversation was doing to .claude/.state/handoff.md, then opens the chosen tool in its own
// window on that note. The tool works there with its own approvals and logs in CHANGELOG.md with a Tool: line
// (AGENTS.md); Claude audits that work at the start of its next session (CLAUDE.md > Handoff from other tools).
const HANDOFF_NOTE = ".claude/.state/handoff.md";
function writeHandoff(s) {
  const lines = [];
  for (const e of s?.log || []) {
    if (e.type === "user" && e.text) lines.push(`**User:** ${e.text}`);
    else if (e.type === "text" && e.text) lines.push(`**${e.agent === "gemini" ? "Gemini" : "Claude"}:** ${e.text}`);
    else if (e.type === "answered" && e.answers) lines.push(`**User picked:** ${Object.values(e.answers).join(" · ")}`);
  }
  let convo = lines.join("\n\n");
  if (convo.length > 12000) convo = "…\n\n" + convo.slice(-12000);
  const body = [
    "# Handoff from the dashboard",
    "",
    `Written ${new Date().toISOString()}. Claude Code stopped (usage limit or the user's choice) and another tool continues.`,
    "",
    s?.project ? `Project: \`My Projects/${s.project}\`. Read its Project_Brief.md (Next step), status.json and the last CHANGELOG.md entry first.` : "No project was selected in this conversation.",
    "",
    "Rules: follow AGENTS.md. Log every change in the project's CHANGELOG.md with a `Tool:` line and commit with a `[Tool]` prefix. Ask the user before any Figma write, publish, push or delete.",
    "",
    "## Conversation so far",
    "",
    convo || "(nothing yet)",
    "",
  ].join("\n");
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(path.join(ROOT, HANDOFF_NOTE), body);
}

function handoff(s, tool) {
  // From a conversation: write the note. From Settings (no conversation): just open the tool on AGENTS.md.
  if (s) writeHandoff(s);
  const note = s ? HANDOFF_NOTE : null;
  if (tool === "antigravity") {
    const app = antigravityPath();
    if (!app) return { ok: false, message: "Antigravity is not installed on this computer." };
    try { spawn(app, [ROOT], { detached: true, stdio: "ignore" }).unref(); } catch (e) { return { ok: false, message: e.message }; }
    return { ok: true, message: note ? `Antigravity opened on the workflow folder. Ask it: "Read ${note} and AGENTS.md, then continue."` : "Antigravity opened on the workflow folder." };
  }
  const cmd = handoffCommand(tool, getSettings().models[tool], note);
  if (!cmd) return { ok: false, message: "This tool cannot take over yet." };
  const r = runInTerminal(cmd);
  const name = TOOLS.find((t) => t.id === tool)?.name || tool;
  if (!r.ok) return r;
  return { ...r, message: note
    ? `${name} opened in its own window with the handoff note. It asks its own approvals there. When Claude is back, start a new conversation: it reads what ${name} did and audits it first.`
    : `${name} opened in its own window in the workflow folder.` };
}

function closeSession(s) {
  clearTimeout(s.limitTimer);
  s.gemini?.client.kill();
  s.inbox.close(); s.abort.abort(); sessions.delete(s.id);
}

// Opens Claude Code in a terminal so the user can type /login (the sign-in needs their browser).
function openSignIn() {
  const r = runInTerminal("claude");
  return r.ok ? { ...r, message: "A terminal opened with Claude Code. Type /login there, finish in the browser, close it, then press Try again." } : r;
}

function runInTerminal(cmd) {
  try {
    if (process.platform === "win32") {
      // One verbatim command line: Node's own quoting (\") is not understood by cmd, which broke the cd and the tool.
      // The window starts in the Root (cwd), so no cd is needed; /s keeps the quotes inside cmd as typed.
      spawn("cmd.exe", ["/d", "/s", "/c", `"start "" cmd.exe /k ${cmd}"`], { cwd: ROOT, detached: true, stdio: "ignore", windowsHide: false, windowsVerbatimArguments: true }).unref();
    } else if (process.platform === "darwin") {
      const script = `tell application "Terminal" to do script "cd ${JSON.stringify(ROOT).slice(1, -1).replace(/"/g, '\\"')} && ${cmd}"`;
      spawn("osascript", ["-e", script, "-e", 'tell application "Terminal" to activate'], { detached: true, stdio: "ignore" }).unref();
    } else {
      return { ok: false, message: `Run this in a terminal in the workflow folder: ${cmd}` };
    }
    return { ok: true, command: cmd };
  } catch (e) {
    return { ok: false, message: `Run this in a terminal in the workflow folder: ${cmd}` };
  }
}

function sessionSummary(s) {
  return { id: s.id, project: s.project, title: s.title, preview: s.preview || "", started: s.started, busy: s.busy, ended: s.ended, live: true, claudeSessionId: s.claudeSessionId,
    model: s.model || "", limit: s.limit, held: s.held.length, autoResume: s.autoResume, agent: s.agent };
}

// ---------- Style library (Style_Library/styles.json, intake 0.3e) ----------
const STYLE_DIR = path.join(ROOT, "Style_Library");
function readStyles() {
  try { return JSON.parse(fs.readFileSync(path.join(STYLE_DIR, "styles.json"), "utf8")); }
  catch { return { count: 0, categories: [], styles: [] }; }
}
function readStyle(slug) {
  const s = readStyles().styles.find((x) => x.slug === slug);
  if (!s) return null;
  try { return { ...s, markdown: fs.readFileSync(path.join(STYLE_DIR, s.slug, "DESIGN.md"), "utf8") }; } catch { return null; }
}

// ---------- HTTP ----------
const MIME = { ".jpg": "image/jpeg", ".webp": "image/webp", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2" };

function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  let base = PUBLIC;
  if (rel.startsWith("/docs/")) { base = path.join(ROOT, "docs"); rel = rel.slice("/docs".length); }
  const file = path.resolve(base, "." + rel);
  if (!file.startsWith(base)) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    send(res, 200, data, MIME[path.extname(file)] || "application/octet-stream");
  });
}

const server = http.createServer(async (req, res) => {
  // Local only: refuse requests that come from another site in the browser.
  const origin = req.headers.origin;
  if (origin && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return send(res, 403, { error: "forbidden" });
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  try {
    if (req.method === "GET" && p === "/api/projects") return send(res, 200, { projects: listProjects() });
    if (req.method === "POST" && p === "/api/projects") { const b = await readBody(req); const r = createProject(b.title); return send(res, r.ok ? 200 : 400, r); }
    const pr = p.match(/^\/api\/projects\/([^/]+)(\/inputs|\/restore)?$/);
    if (pr) {
      const name = decodeURIComponent(pr[1]);
      if (pr[2] === "/restore" && req.method === "POST") { const r = restoreProject(name); return send(res, r.ok ? 200 : 409, r); }
      if (pr[2] === "/inputs") {
        if (req.method === "GET") { const r = listInputs(name); return send(res, r ? 200 : 404, r ? { inputs: r } : { error: "That project was not found." }); }
        if (req.method === "POST") { const b = await readBody(req, 80e6); const r = addInput(name, b.kind, b.name, b.data); return send(res, r.ok ? 200 : 400, r); }
        if (req.method === "DELETE") { const r = removeInput(name, url.searchParams.get("kind"), url.searchParams.get("file")); return send(res, r.ok ? 200 : 400, r); }
      }
      if (!pr[2] && req.method === "PATCH") { const b = await readBody(req); const r = renameProject(name, b.title); return send(res, r.ok ? 200 : 400, r); }
      if (!pr[2] && req.method === "DELETE") { const r = deleteProject(name); return send(res, r.ok ? 200 : 409, r); }
    }
    if (req.method === "GET" && p === "/api/workflow") return send(res, 200, workflowInfo(url.searchParams.get("fetch") === "1"));
    if (req.method === "GET" && p === "/api/styles") return send(res, 200, readStyles());
    const sm = req.method === "GET" && p.match(/^\/api\/styles\/([a-z0-9-]+)$/);
    if (sm) { const s = readStyle(sm[1]); return send(res, s ? 200 : 404, s || { error: "Style not found" }); }
    if (req.method === "POST" && p === "/api/workflow/update") return send(res, 200, updateWorkflow());
    if (req.method === "GET" && p === "/api/settings") return send(res, 200, { ...getSettings(), awake: awakeState() });
    if (req.method === "POST" && p === "/api/settings") { const b = await readBody(req); return send(res, 200, setSettings(b)); }
    if (req.method === "GET" && p === "/api/tools") return send(res, 200, { tools: toolStatus(url.searchParams.get("fresh") === "1", () => authStatus(false)), settings: getSettings() });
    if (req.method === "GET" && p === "/api/usage") return send(res, 200, usage.summary());
    if (req.method === "GET" && p === "/api/integrations") return send(res, 200, integrations(url.searchParams.get("fresh") === "1"));
    if (req.method === "POST" && p === "/api/github/login") return send(res, 200, runInTerminal("gh auth login --web --hostname github.com"));
    const tl = p.match(/^\/api\/tools\/(\w+)\/(login|open)$/);
    if (req.method === "POST" && tl) {
      if (tl[2] === "open") return send(res, 200, handoff(null, tl[1]));
      const cmd = loginCommand(tl[1]);
      return send(res, cmd ? 200 : 404, cmd ? runInTerminal(cmd) : { ok: false, message: "Unknown tool." });
    }
    if (req.method === "POST" && p === "/api/login") return send(res, 200, openSignIn());
    if (req.method === "GET" && p === "/api/auth") return send(res, 200, authStatus(url.searchParams.get("fresh") === "1"));
    if (req.method === "POST" && p === "/api/auth/login") { const b = await readBody(req); return send(res, 200, startLogin(b.method)); }
    if (req.method === "GET" && p === "/api/auth/login") return send(res, 200, loginState());
    if (req.method === "POST" && p === "/api/auth/login/code") { const b = await readBody(req); return send(res, sendLoginCode(b.code) ? 200 : 409, loginState()); }
    if (req.method === "POST" && p === "/api/auth/login/cancel") return send(res, 200, cancelLogin());
    if (req.method === "GET" && p === "/api/sessions") {
      const live = [...sessions.values()].map(sessionSummary);
      const liveIds = new Set(live.map((s) => s.id));
      fillPreviews();
      const past = readJson(HISTORY, []).filter((r) => !liveIds.has(r.id) && r.claudeSessionId && !r.hidden);
      return send(res, 200, { live, past });
    }
    // Hide a past conversation from the recent list (Undo shows it again). Nothing is deleted: Claude Code keeps its
    // transcript, and the row drops out with the oldest ones after 40 conversations.
    if (req.method === "POST" && p === "/api/sessions/hide") {
      const body = await readBody(req);
      const all = readJson(HISTORY, []);
      const row = all.find((r) => r.claudeSessionId && r.claudeSessionId === body.claudeSessionId);
      if (!row) return send(res, 404, { error: "That conversation is not in the list." });
      if (body.hidden === false) delete row.hidden; else row.hidden = true;
      try { fs.writeFileSync(HISTORY, JSON.stringify(all, null, 2)); } catch {}
      return send(res, 200, { ok: true });
    }
    if (req.method === "POST" && p === "/api/sessions") {
      const body = await readBody(req);
      const s = startSession(body);
      return send(res, 200, sessionSummary(s));
    }
    const m = p.match(/^\/api\/sessions\/([\w-]+)(\/[\w-]+)?$/);
    if (m) {
      const s = sessions.get(m[1]);
      if (!s) return send(res, 404, { error: "This conversation is no longer running. Open it again from Home." });
      const action = m[2] || "";
      if (req.method === "GET" && action === "/events") {
        res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
        res.write(`data: ${JSON.stringify({ type: "hello", session: sessionSummary(s) })}\n\n`);
        for (const e of s.log) res.write(`data: ${JSON.stringify(e)}\n\n`);
        s.clients.add(res);
        const ping = setInterval(() => res.write(": ping\n\n"), 20000);
        req.on("close", () => { clearInterval(ping); s.clients.delete(res); });
        return;
      }
      const body = req.method === "POST" ? await readBody(req) : {};
      if (action === "/message") return send(res, sendMessage(s, body.text || "", body.images) ? 200 : 409, { ok: !s.ended });
      if (action === "/answer") return send(res, answer(s, body.requestId, body) ? 200 : 404, { ok: true });
      if (action === "/stop") {
        if (s.agent === "gemini" && s.gemini?.sessionId) { s.gemini.client.notify("session/cancel", { sessionId: s.gemini.sessionId }); cancelGeminiAsks(s); }
        else { try { await s.query.interrupt(); } catch {} }
        return send(res, 200, { ok: true });
      }
      if (action === "/agent") { const r = await switchAgent(s, String(body.agent || "")); return send(res, r.ok ? 200 : 400, r); }
      if (action === "/close") { closeSession(s); return send(res, 200, { ok: true }); }
      if (action === "/terminal") return send(res, 200, openInTerminal(s));
      if (action === "/handoff") return send(res, 200, handoff(s, String(body.tool || "")));
      if (action === "/models") return send(res, 200, await sessionModels(s));
      if (action === "/model") { const r = await switchModel(s, body.model); return send(res, r.ok ? 200 : 400, r); }
      if (action === "/autoresume") return send(res, 200, setAutoResume(s, body.on));
      if (action === "/resume-now") { limitOver(s); return send(res, 200, { ok: true }); }
      return send(res, 404, { error: "unknown action" });
    }
    if (req.method === "GET" && !p.startsWith("/api/")) return serveStatic(req, res, p);
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: String(err?.message || err) });
  }
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`The dashboard is already running: http://localhost:${PORT}`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Design systems Ai Ready - dashboard\n  http://localhost:${PORT}\n\n  Keep this window open while you use it. Close it to stop.\n`);
  if (process.argv.includes("--open")) {
    const url = `http://localhost:${PORT}`;
    const opener = process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
    try { spawn(opener[0], opener[1], { detached: true, stdio: "ignore" }).unref(); } catch {}
  }
});

// Closing the dashboard window saves what each conversation window showed, so Continue brings it back.
process.on("exit", () => { for (const s of sessions.values()) if (s.saveTimer) saveLog(s); });
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, () => process.exit(0));

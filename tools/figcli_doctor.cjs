#!/usr/bin/env node
// FigCli Yolo connection doctor: finds why Figma Desktop does not answer on its debugging port (9222) and fixes it.
//
//   node tools/figcli_doctor.cjs                    diagnose only (read-only)
//   node tools/figcli_doctor.cjs --fix              fix what needs no Figma restart (patch, port holder, daemon)
//   node tools/figcli_doctor.cjs --fix --restart-figma   also close and reopen Figma with the port flag
//   add --json for machine output, --figcli <dir> to name the figma-cli folder (for the daemon restart)
//
// Causes it checks, in order:
//   1. Another program listens on 9222 (not Figma)              -> that program is stopped
//   2. The Figma version that RUNS is not patched                -> its app.asar is patched (same bytes as figma-cli)
//      figma-cli sorts version folders as text, so after an update from app-126.11.9 to app-126.11.11 it keeps
//      patching the old folder and says "already patched" (lessons 2026-11-23). Here folders sort as numbers and
//      the folder of the running Figma.exe wins.
//   3. Figma runs without --remote-debugging-port, or as administrator -> close and reopen it (needs --restart-figma;
//      a Figma started as administrator can only be closed by the user or an admin window)
//   4. The FigCli daemon is stale                                -> `node src/index.js daemon restart`
// The patch needs no administrator on Windows (Figma lives in %LOCALAPPDATA%). Nothing here reads a token.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const PORT = Number(process.env.FIGMA_PORT) || 9222;
const BLOCK = Buffer.from('removeSwitch("remote-debugging-port")');
const PATCH = Buffer.from('removeSwitch("remote-debugXing-port")');
const WIN = process.platform === "win32";
const figmaBase = () => path.join(process.env.LOCALAPPDATA || "", "Figma");

// "app-126.11.11" -> [126, 11, 11]; newest first by number, never by text.
const versionOf = (name) => (name.match(/^app-(\d+(?:\.\d+)*)$/) || [, ""])[1].split(".").filter(Boolean).map(Number);
function sortFolders(names) {
  return names.filter((n) => versionOf(n).length).sort((a, b) => {
    const x = versionOf(a), y = versionOf(b);
    for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
    return 0;
  });
}
const asarState = (buf) => (buf.includes(PATCH) ? "patched" : buf.includes(BLOCK) ? "blocked" : "unknown");

const ps = (cmd, timeout = 15000) => {
  const r = spawnSync("powershell", ["-NoProfile", "-Command", cmd], { encoding: "utf8", timeout, windowsHide: true });
  return (r.stdout || "").trim();
};
const portOpen = async () => { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(800) }); return r.ok; } catch { return false; } };

// Every Figma.exe: its folder and command line. A process started as administrator shows no path to a normal user.
function figmaProcesses() {
  if (!WIN) return [];
  const out = ps("Get-CimInstance Win32_Process -Filter \"Name='Figma.exe'\" | ForEach-Object { [pscustomobject]@{ id=$_.ProcessId; parent=$_.ParentProcessId; exe=$_.ExecutablePath; cmd=$_.CommandLine } } | ConvertTo-Json -Compress");
  try { const j = JSON.parse(out || "[]"); return Array.isArray(j) ? j : [j]; } catch { return []; }
}
function portHolder() {
  if (!WIN) return null;
  const out = ps(`$c = Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue; "$($c.OwningProcess)|$($p.ProcessName)" }`);
  if (!out) return null;
  const [pid, name] = out.split("|");
  return { pid: Number(pid), name: name || "unknown" };
}

function folders() {
  const base = figmaBase();
  let names = [];
  try { names = sortFolders(fs.readdirSync(base)); } catch {}
  return names.map((n) => {
    const asar = path.join(base, n, "resources", "app.asar");
    let state = "missing";
    try { state = asarState(fs.readFileSync(asar)); } catch {}
    return { name: n, asar, state };
  }).filter((f) => f.state !== "missing");
}

async function diagnose() {
  const procs = figmaProcesses();
  const running = procs.length > 0;
  const readable = procs.filter((p) => p.exe);
  const runFolder = readable.map((p) => path.basename(path.dirname(p.exe))).find((n) => versionOf(n).length) || null;
  const all = folders();
  const target = all.find((f) => f.name === runFolder) || all[0] || null;
  // The main process is the one whose parent is not a Figma.exe; it alone carries the launch flags.
  const ids = new Set(procs.map((p) => p.id));
  const main = procs.filter((p) => !ids.has(p.parent));
  const elevated = running && main.length > 0 && main.every((p) => !p.exe);
  const withFlag = procs.some((p) => p.cmd && /--remote-debugging-port=/.test(p.cmd) && !/--type=/.test(p.cmd));
  const holder = portHolder();
  const open = await portOpen();
  const causes = [];
  if (!open) {
    if (holder && !/^figma$/i.test(holder.name)) causes.push({ code: "port-taken", fix: "auto", message: `${holder.name} (process ${holder.pid}) holds port ${PORT}, so Figma cannot open it.` });
    if (!target) causes.push({ code: "no-figma", fix: "user", message: "Figma Desktop is not installed in the usual place (%LOCALAPPDATA%\\Figma)." });
    else if (target.state === "blocked") causes.push({ code: "not-patched", fix: "auto", message: `Figma ${target.name.slice(4)} (the version that runs) is not patched; a Figma update replaced it.` });
    else if (target.state === "unknown") causes.push({ code: "unknown-figma", fix: "user", message: `Figma ${target.name.slice(4)} has a new start-up code that FigCli cannot patch yet. Use the Desktop Bridge until figma-cli is updated.` });
    if (!running) causes.push({ code: "not-running", fix: "auto", message: "Figma Desktop is not running." });
    else if (elevated) causes.push({ code: "elevated", fix: "restart", message: "Figma was started as administrator (by an administrator window), so it cannot be reached or closed from here." });
    else if (!withFlag || target?.state === "blocked") causes.push({ code: "no-flag", fix: "restart", message: `Figma is open without its debugging port; it has to close and reopen with --remote-debugging-port=${PORT}.` });
  }
  return { ok: open, port: PORT, running, runFolder, target, folders: all.map(({ name, state }) => ({ name, state })), holder, elevated, causes };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitPort(ms) { const end = Date.now() + ms; while (Date.now() < end) { if (await portOpen()) return true; await sleep(1000); } return false; }

function patch(f) {
  const buf = fs.readFileSync(f.asar);
  const i = buf.indexOf(BLOCK);
  if (i < 0) return buf.includes(PATCH);
  PATCH.copy(buf, i);
  fs.writeFileSync(f.asar, buf);
  return asarState(fs.readFileSync(f.asar)) === "patched";
}
function launchFigma() {
  const stub = path.join(figmaBase(), "Figma.exe");
  const exe = fs.existsSync(stub) ? stub : null;
  if (!exe) return false;
  spawn(exe, [`--remote-debugging-port=${PORT}`], { detached: true, stdio: "ignore", windowsHide: false }).unref();
  return true;
}
function restartDaemon(dir) {
  if (!dir || !fs.existsSync(path.join(dir, "src", "index.js"))) return { ok: false, out: "figma-cli folder not given" };
  const r = spawnSync(process.execPath, ["src/index.js", "daemon", "restart"], { cwd: dir, encoding: "utf8", timeout: 60000, windowsHide: true });
  return { ok: r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).trim().slice(-300) };
}

async function fix({ restartFigma = false, figcliDir = null } = {}) {
  const steps = [];
  let d = await diagnose();
  if (d.ok) return { ...d, steps };
  if (!WIN) return { ...d, steps, message: "Automatic repair runs on Windows. On macOS: in the figma-cli folder run sudo node src/index.js connect, then node src/index.js daemon restart." };
  const has = (c) => d.causes.some((x) => x.code === c);
  if (has("port-taken")) {
    const r = spawnSync("taskkill", ["/PID", String(d.holder.pid), "/F"], { encoding: "utf8", windowsHide: true });
    steps.push(r.status === 0 ? `Stopped ${d.holder.name} (process ${d.holder.pid}), which held port ${PORT}.` : `Could not stop ${d.holder.name} (process ${d.holder.pid}); close it yourself.`);
  }
  if (has("not-patched")) {
    try { steps.push(patch(d.target) ? `Patched Figma ${d.target.name.slice(4)}.` : `Could not patch Figma ${d.target.name.slice(4)}.`); }
    catch (e) { steps.push(`Could not patch Figma ${d.target.name.slice(4)} (${e.code || e.message}).`); return { ...(await diagnose()), steps, needsAdmin: e.code === "EPERM" || e.code === "EACCES" }; }
  }
  const needsRestart = d.running && (has("no-flag") || has("elevated") || has("not-patched"));
  if (needsRestart && !restartFigma) {
    return { ...(await diagnose()), steps, needsRestart: true, confirm: "Figma has to close and reopen to open its port. Files in Figma are saved to the cloud; finish any text you are typing first." };
  }
  if (needsRestart) {
    const r = spawnSync("taskkill", ["/IM", "Figma.exe", "/F"], { encoding: "utf8", windowsHide: true });
    await sleep(2000);
    if (figmaProcesses().length) {
      steps.push("Figma could not be closed from here (it was started as administrator).");
      return { ...(await diagnose()), steps, needsUser: "Close Figma yourself (File > Quit, or Task Manager > Figma > End task), then press Connect again." };
    }
    steps.push(r.status === 0 ? "Closed Figma." : "Figma was already closed.");
  }
  if (needsRestart || has("not-running")) {
    steps.push(launchFigma() ? `Opened Figma with --remote-debugging-port=${PORT}.` : "Could not find Figma.exe to open it.");
    const up = await waitPort(45000);
    steps.push(up ? `Figma answers on port ${PORT}.` : `Figma did not open port ${PORT} within 45 s.`);
  }
  if (await portOpen()) { const r = restartDaemon(figcliDir); steps.push(r.ok ? "Restarted the FigCli daemon." : `FigCli daemon not restarted (${r.out}).`); }
  d = await diagnose();
  return { ...d, steps, message: d.ok ? "Connected." : d.causes.map((c) => c.message).join(" ") || "Still not connected." };
}

module.exports = { sortFolders, versionOf, asarState, patch, diagnose, fix, BLOCK, PATCH };

if (require.main === module) {
  const a = process.argv.slice(2);
  const dirAt = a.indexOf("--figcli");
  const opts = { restartFigma: a.includes("--restart-figma"), figcliDir: dirAt >= 0 ? a[dirAt + 1] : null };
  (a.includes("--fix") ? fix(opts) : diagnose()).then((r) => {
    if (a.includes("--json")) return console.log(JSON.stringify(r, null, 1));
    console.log(r.ok ? `FigCli Yolo: connected (port ${r.port}).` : `FigCli Yolo: not connected (port ${r.port} closed).`);
    console.log("Figma versions:", r.folders.map((f) => `${f.name.slice(4)} ${f.state}`).join(", ") || "none", "| running:", r.runFolder || (r.running ? "yes (as administrator?)" : "no"));
    for (const s of r.steps || []) console.log("-", s);
    for (const c of r.causes) console.log(`* ${c.message}`);
    if (r.confirm) console.log("Next: run again with --restart-figma.", r.confirm);
    if (r.needsUser) console.log("Next:", r.needsUser);
    process.exitCode = r.ok ? 0 : 1;
  });
}

// Figma tools for the dashboard: the three ways the workflow reaches Figma, their status, setup and the default choice.
//   FigCli Yolo (Recommended) - figma-cli on this computer; connected when Figma answers on its debugging port 9222.
//   Desktop Bridge plugin     - figma-console-mcp; connected when the plugin inside a Figma file holds its websocket.
//   Official Figma MCP        - Figma's own server (https://mcp.figma.com/mcp); connected once signed in with Figma.
// Setup never runs anything hidden: installs and sign-ins start from the user's click, the Yolo patch runs in an
// elevated terminal the user confirms (UAC), and nothing here reads or prints a token.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const STATE = path.join(os.homedir(), ".atomica");
const DEFAULT_FILE = path.join(STATE, "figma-tool.json");
const TOOLS = ["figcli", "bridge", "official"];
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const sh = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", timeout: 15000, windowsHide: true, shell: process.platform === "win32" && /^(claude|npm|npx)$/.test(cmd), ...opts });
  return { ok: !r.error && r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).trim() };
};
const answers = async (url, ms = 500) => { try { await fetch(url, { signal: AbortSignal.timeout(ms) }); return true; } catch { return false; } };

// FigCli: where it is (the Figma tools check names its folder), and whether Figma answers on 9222.
function figcliPath(root) {
  const py = ["python", "py", "python3"].find((c) => sh(c, ["--version"], { timeout: 5000 }).ok);
  const out = py ? sh(py, [path.join(root, "tools", "figma_tools_check.py")], { cwd: root, timeout: 20000 }).out : "";
  const m = out.match(/FigCli \(figma-cli\): installed ([\d.]+) - (.+)$/m);
  const bridge = /Desktop Bridge \(figma-console-mcp\): installed/i.test(out);
  return { version: m?.[1] || null, dir: m?.[2]?.trim() || null, bridgeRegistered: bridge };
}
const figmaRunning = () => process.platform === "win32" ? /figma\.exe/i.test(sh("tasklist", ["/FI", "IMAGENAME eq Figma.exe", "/NH"], { timeout: 5000 }).out) : sh("pgrep", ["-x", "Figma"], { timeout: 5000 }).ok;

// Desktop Bridge: the plugin connects to figma-console-mcp's websocket (ports 9223-9232) while a Claude session runs.
function bridgeConnected() {
  const out = process.platform === "win32" ? sh("netstat", ["-ano", "-p", "TCP"], { timeout: 8000 }).out : sh("sh", ["-c", "netstat -an 2>/dev/null || ss -tan"], { timeout: 8000 }).out;
  return out.split(/\r?\n/).some((l) => /ESTABLISHED/i.test(l) && /[:.](922[3-9]|923[0-2])\s/.test(l));
}

// Official: what `claude mcp list` says about Figma's server (about 20 s, so it is cached and refreshed in the background).
let mcpCache = { at: 0, text: "", running: null };
function mcpList(force) {
  if (mcpCache.running) return mcpCache.running;
  if (!force && mcpCache.text && Date.now() - mcpCache.at < 120000) return Promise.resolve(mcpCache.text);
  mcpCache.running = new Promise((resolve) => {
    let out = "";
    const child = spawn("claude", ["mcp", "list"], { shell: process.platform === "win32", windowsHide: true, cwd: os.homedir() });
    const done = () => { mcpCache = { at: Date.now(), text: out, running: null }; resolve(out); };
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    child.on("close", done);
    child.on("error", done);
    setTimeout(() => { try { child.kill(); } catch {} }, 45000);
  });
  return mcpCache.running;
}
function officialFrom(text) {
  const lines = text.split(/\r?\n/);
  // Every entry pointing at Figma's own server (figma-official, the Claude plugin's plugin:figma:figma, older names):
  // connected if any of them is signed in; otherwise the one named figma-official speaks for them.
  const all = lines.filter((l) => /mcp\.figma\.com\/mcp/i.test(l));
  const ok = all.find((l) => /✔|connected/i.test(l) && !/needs auth|failed/i.test(l));
  const line = ok || all.find((l) => /^figma-official:/i.test(l)) || all[0];
  // A community server also called "figma" (figma-developer-mcp, needs a key) failing is what /mcp reports as
  // "Failed to reconnect to figma: CONNECTION_CLOSED"; it is not the official one.
  const community = lines.find((l) => /^figma:\s/i.test(l) && !/mcp\.figma\.com/i.test(l) && /failed|closed/i.test(l));
  const note = community ? ' The "Failed to reconnect to figma: CONNECTION_CLOSED" message comes from another server also called "figma" (figma-developer-mcp), not from this one; it can be removed with: claude mcp remove figma -s user' : "";
  if (!line) return { configured: false, connected: false, name: null, reason: "Not added to Claude Code yet." + note };
  const name = line.split(/:\s+https?:/)[0].trim();
  if (ok) return { configured: true, connected: true, name, reason: "Signed in with Figma." };
  if (/needs auth/i.test(line)) return { configured: true, connected: false, name, reason: `Added (${name}), but not signed in with Figma yet.` + note };
  return { configured: true, connected: false, name, reason: (line.split(" - ").pop() || "Could not connect.").replace(/^[^\w]+/, "") + note };
}

export async function figmaToolsState(root, { fresh } = {}) {
  const fc = figcliPath(root);
  const port = await answers("http://127.0.0.1:9222/json/version");
  const running = figmaRunning();
  const manifest = path.join(os.homedir(), ".figma-console-mcp", "plugin", "manifest.json");
  const text = fresh ? await mcpList(true) : mcpCache.text || (mcpList(false), "");
  const official = text ? officialFrom(text) : { configured: null, connected: false, name: null, reason: "Checking Claude Code's connectors…", checking: true };
  const bridgeOn = bridgeConnected();
  const tools = {
    figcli: {
      installed: !!fc.dir, version: fc.version, dir: fc.dir, connected: port,
      reason: port ? "Connected: Figma answers on port 9222." : !fc.dir ? "FigCli is not installed on this computer." : running ? "Figma is open, but not connected (port 9222 closed). After a Figma update, connect again as administrator." : "Figma Desktop is not running.",
    },
    bridge: {
      installed: fc.bridgeRegistered, manifest: fs.existsSync(manifest) ? manifest : null, connected: bridgeOn,
      reason: bridgeOn ? "Connected: the plugin is open in a Figma file." : !fc.bridgeRegistered ? "figma-console-mcp is not added to Claude Code yet." : "Added. Run the Desktop Bridge plugin inside your Figma file to connect.",
    },
    official,
  };
  const saved = readJson(DEFAULT_FILE, {});
  return { tools, default: TOOLS.includes(saved.tool) ? saved.tool : "figcli", recommended: "figcli", figmaRunning: running };
}

// Setup jobs that take a while (FigCli download + npm install) report their progress here.
const jobs = new Map();
function runJob(name, steps) {
  const job = { name, lines: [], done: false, ok: null };
  jobs.set(name, job);
  (async () => {
    for (const [cmd, args, cwd] of steps) {
      job.lines.push(`> ${cmd} ${args.join(" ")}`);
      const ok = await new Promise((resolve) => {
        const child = spawn(cmd, args, { cwd, shell: process.platform === "win32", windowsHide: true });
        const add = (d) => { for (const l of String(d).split(/\r?\n/)) if (l.trim()) job.lines.push(l.slice(0, 200)); if (job.lines.length > 200) job.lines.splice(0, job.lines.length - 200); };
        child.stdout.on("data", add); child.stderr.on("data", add);
        child.on("close", (code) => resolve(code === 0)); child.on("error", () => resolve(false));
      });
      if (!ok) { job.done = true; job.ok = false; return; }
    }
    job.done = true; job.ok = true;
  })();
  return job;
}

function elevated(dir, commands) {
  // Windows: a short script run by a PowerShell started with "Run as administrator" (the user confirms the UAC prompt).
  const script = path.join(os.tmpdir(), "atomica-figcli-connect.ps1");
  fs.writeFileSync(script, [`Set-Location -LiteralPath '${dir.replace(/'/g, "''")}'`, ...commands, "Write-Host ''", "Write-Host 'Done. You can close this window and press Connect in Atomica.'"].join("\r\n"));
  const r = spawnSync("powershell", ["-NoProfile", "-Command", `Start-Process powershell -Verb RunAs -ArgumentList '-NoExit','-ExecutionPolicy','Bypass','-File','${script.replace(/'/g, "''")}'`], { windowsHide: true, encoding: "utf8", timeout: 120000 });
  return !r.error && r.status === 0;
}

export async function handleFigmaTools(req, res, url, { send, readBody, runInTerminal, root, projectDir }) {
  const p = url.pathname;
  if (!p.startsWith("/api/figma-tools")) return false;
  if (req.method === "GET" && p === "/api/figma-tools") { send(res, 200, await figmaToolsState(root, { fresh: url.searchParams.get("fresh") === "1" })); return true; }
  if (req.method === "GET" && p === "/api/figma-tools/job") { const j = jobs.get(url.searchParams.get("name")); send(res, 200, j ? { ...j, lines: j.lines.slice(-40) } : { done: true, ok: null, lines: [] }); return true; }
  const b = req.method === "POST" ? await readBody(req) : {};
  if (req.method === "POST" && p === "/api/figma-tools/connect") {
    if (!TOOLS.includes(b.tool)) { send(res, 400, { error: "unknown tool" }); return true; }
    const st = await figmaToolsState(root, { fresh: b.tool === "official" });
    send(res, 200, { ...st, tool: b.tool, result: st.tools[b.tool] });
    return true;
  }
  if (req.method === "POST" && p === "/api/figma-tools/setup") {
    const st = await figmaToolsState(root);
    if (b.tool === "figcli") {
      const t = st.tools.figcli;
      if (!t.installed) {
        // README: download into <drive>:\Tools\figma-cli, then npm install (never -g).
        const base = process.platform === "win32" ? path.join(path.parse(root).root, "Tools") : path.join(os.homedir(), "Tools");
        const dir = path.join(base, "figma-cli");
        if (fs.existsSync(dir) && fs.readdirSync(dir).length) { send(res, 409, { error: `${dir} already exists but FigCli was not found in it.` }); return true; }
        fs.mkdirSync(base, { recursive: true });
        runJob("figcli", [["git", ["clone", "--depth", "1", "https://github.com/silships/figma-cli", dir], base], ["npm", ["install"], dir]]);
        send(res, 200, { job: "figcli", message: `Downloading FigCli into ${dir} and installing its packages…` });
        return true;
      }
      if (process.platform !== "win32") { send(res, 200, { message: `In a terminal in ${t.dir}: sudo node src/index.js connect, then node src/index.js daemon restart` }); return true; }
      const ok = elevated(t.dir, ["node src/index.js connect", "node src/index.js daemon restart"]);
      send(res, ok ? 200 : 400, ok ? { message: "Confirm the Windows prompt (Run as administrator). The window patches Figma, reopens it with port 9222 and restarts the daemon; then press Connect." } : { error: "Could not open the administrator window." });
      return true;
    }
    if (b.tool === "bridge") {
      if (!st.tools.bridge.installed) {
        const r = sh("claude", ["mcp", "add", "figma-console", "-s", "user", "-e", "ENABLE_MCP_APPS=true", "--", "npx", "-y", "figma-console-mcp@latest"], { cwd: os.homedir(), timeout: 60000 });
        mcpCache.at = 0;
        send(res, r.ok ? 200 : 400, r.ok ? { message: "figma-console-mcp added to Claude Code. Start a new Claude conversation once, then import the plugin in Figma." } : { error: r.out.slice(0, 300) || "Could not add figma-console-mcp." });
        return true;
      }
      send(res, 200, { message: "Import the plugin once, then run it inside your file.", manifest: st.tools.bridge.manifest });
      return true;
    }
    if (b.tool === "official") {
      if (!st.tools.official.configured) {
        const r = sh("claude", ["mcp", "add", "--transport", "http", "figma-official", "https://mcp.figma.com/mcp", "-s", "user"], { cwd: os.homedir(), timeout: 60000 });
        mcpCache.at = 0;
        if (!r.ok) { send(res, 400, { error: r.out.slice(0, 300) || "Could not add Figma's server." }); return true; }
      }
      // Sign-in happens in Claude Code (OAuth in the browser). It opens plainly: passing /mcp as an argument only
      // reconnects the servers and shows errors from others (e.g. a community server also called "figma").
      const t = runInTerminal("claude");
      const name = st.tools.official.name || "figma-official";
      send(res, 200, { message: t.ok ? `Claude Code opened. Type /mcp, press Enter, pick "${name}" (mcp.figma.com), choose Authenticate and allow access in the browser. Then press Connect here.` : t.message });
      return true;
    }
    send(res, 400, { error: "unknown tool" });
    return true;
  }
  if (req.method === "POST" && p === "/api/figma-tools/default") {
    if (!TOOLS.includes(b.tool)) { send(res, 400, { error: "unknown tool" }); return true; }
    if (b.project) {
      // Per project: status.json > figma.tool, logged in the project's CHANGELOG (the workflow's own record).
      const dir = projectDir(b.project);
      if (!dir) { send(res, 404, { error: "unknown project" }); return true; }
      const file = path.join(dir, "status.json");
      const s = readJson(file, {});
      const name = { figcli: "figcli", bridge: "desktop-bridge", official: "figma-mcp" }[b.tool];
      s.figma = { ...(s.figma || {}), tool: name };
      fs.writeFileSync(file, JSON.stringify(s, null, 2) + "\n");
      const cl = path.join(dir, "CHANGELOG.md");
      if (fs.existsSync(cl)) {
        const text = fs.readFileSync(cl, "utf8");
        const entry = `## ${new Date().toISOString().slice(0, 10)} · Figma tool: ${name} (Tool: Atomica dashboard)\n- Default Figma tool for this project set to ${name} from Connect services.\n- Storybook synced: n/a (no Figma change).\n\n`;
        const at = text.search(/^## \d{4}-\d{2}-\d{2}/m);
        fs.writeFileSync(cl, at >= 0 ? text.slice(0, at) + entry + text.slice(at) : text + "\n" + entry);
      }
    } else {
      fs.mkdirSync(STATE, { recursive: true });
      fs.writeFileSync(DEFAULT_FILE, JSON.stringify({ tool: b.tool, at: new Date().toISOString() }, null, 1) + "\n");
    }
    send(res, 200, await figmaToolsState(root));
    return true;
  }
  send(res, 404, { error: "unknown figma-tools action" });
  return true;
}

// Session gates, in two parts (any project, any user; state per session in .claude/.state/, git-ignored).
//
//   node session_gate.cjs mark   PostToolUse on Figma writes and Bash / PowerShell. Records:
//                                - folders this session created (mkdir, md, New-Item -ItemType Directory,
//                                  git clone), so guard_commands.cjs lets it delete only those without asking;
//                                - Figma writes to a project's DS file (Publish / Accept updates reminder);
//                                - code -> Figma screen work: writes to the screens file of a Code to Design
//                                  project, or any Figma write in a session that ran the fidelity tools.
//   node session_gate.cjs stop   Stop hook:
//                                - fidelity gate: code -> Figma screen work cannot end the turn as done
//                                  until a measured fidelity report written after the last write
//                                  (`audits/*fidelity*.md`, tools/fidelity_diff.py) scores >= 98%;
//                                - after DS file changes, once per project per session: ask the user to
//                                  Publish the library and Accept updates in its Design files.
// Each gate blocks at most once per batch of new Figma writes, so a turn never loops.
const fs = require("fs");
const path = require("path");
const { readInput, WRITE, figcliCode } = require("./_common.cjs");
const { PROJECTS, targetOf, projectFor } = require("./_projects.cjs");

const STATE = path.join(__dirname, "..", ".state");
const MIN_FIDELITY = 98;

function load(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return {}; }
}
function save(file, s) {
  fs.mkdirSync(STATE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(s), "utf8");
}

function createdDirs(cmd, cwd) {
  const out = [];
  const words = (s) => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((w) => w.replace(/^["']|["']$/g, ""));
  for (const part of cmd.split(/&&|\|\||;|\|/)) {
    const w = words(part.trim());
    if (!w.length) continue;
    if (/^(mkdir|md)$/i.test(w[0])) out.push(...w.slice(1).filter((x) => !/^-|^\/[a-z]$/i.test(x)));
    if (/^New-Item$/i.test(w[0]) && /-ItemType\s+Directory/i.test(part)) {
      const p = part.match(/-(Path|LiteralPath)\s+("([^"]+)"|'([^']+)'|(\S+))/i);
      const pos = w.slice(1).find((x, i, a) => !/^-/.test(x) && !/^-/.test(a[i - 1] || ""));
      if (p || pos) out.push(p ? (p[3] || p[4] || p[5]) : pos);
    }
    const g = w.indexOf("clone");
    if (w[0] === "git" && g > 0) {
      const rest = w.slice(g + 1).filter((x, i, a) => !/^-/.test(x) && !/^-(b|-branch|-depth|-origin)$/.test(a[i - 1] || ""));
      if (rest.length >= 2) out.push(rest[1]);
      else if (rest.length === 1) out.push(path.basename(rest[0]).replace(/\.git$/, ""));
    }
  }
  return out.map((p) => path.resolve(cwd, p));
}

// Score of one fidelity_diff.py report: its "Fidelity: N%" line when present, else texts without an
// open difference / texts in the source. "- Explained: N" (differences the user accepted) are not open.
function score(text) {
  const f = text.match(/Fidelity:\s*\**\s*([\d.]+)\s*%/i);
  if (f) return +f[1];
  const open = text.match(/Open differences:\s*\**\s*(\d+)/i);
  if (!open) return null;
  const explained = +((text.match(/Explained:\s*\**\s*(\d+)/i) || [])[1] || 0);
  const n = Math.max(0, +open[1] - explained);
  const t = text.match(/Texts matched:\s*(\d+)\s*\/\s*(\d+)/i);
  const total = t ? +t[2] : 0;
  if (!total) return n === 0 ? 100 : 0;
  return Math.max(0, Math.round(((total - Math.min(n, total)) / total) * 1000) / 10);
}

function reports(folders, since) {
  const out = [];
  for (const folder of folders) {
    let files = [];
    try { files = fs.readdirSync(path.join(folder, "audits")); } catch (e) { continue; }
    for (const f of files) {
      if (!/fidelity/i.test(f) || !/\.md$/i.test(f)) continue;
      const p = path.join(folder, "audits", f);
      try {
        if (fs.statSync(p).mtimeMs < since) continue;
        out.push({ file: path.relative(path.join(__dirname, "..", ".."), p).replace(/\\/g, "/"), score: score(fs.readFileSync(p, "utf8")) });
      } catch (e) { /* unreadable */ }
    }
  }
  return out;
}

function main() {
  const mode = process.argv[2] || "";
  const data = readInput() || {};
  const FILE = path.join(STATE, `session-${String(data.session_id || "default")}.json`);
  const s = load(FILE);
  const now = Date.now();

  if (mode === "mark") {
    const tool = data.tool_name || "";
    const ti = data.tool_input || {};
    let code = ti.code || ti.javascript || "";
    if (tool === "Bash" || tool === "PowerShell") {
      const cmd = String(ti.command || "");
      const made = createdDirs(cmd, data.cwd || process.cwd());
      if (made.length) s.created = [...new Set((s.created || []).concat(made))];
      if (/source_dump\.js|figma_text_dump\.figma\.js|fidelity_diff\.py/.test(cmd)) s.fidelityTools = true;
      if (!/index\.js["']?\s+eval\b/.test(cmd)) { if (made.length || s.fidelityTools) save(FILE, s); return 0; }
      code = figcliCode(cmd, data.cwd);
    }
    if (!code || !WRITE.test(code) || /globalThis\.DS\s*=/.test(code) || /^\s*\/\/ read-only/.test(code)) {
      if (s.fidelityTools || s.created) save(FILE, s);
      return 0;
    }
    const project = projectFor(targetOf(ti));
    if (project && project.role === "ds" && ((project.status.figma || {}).layout !== "single-file")) {
      s.dsChanged = s.dsChanged || {};
      s.dsChanged[project.folder] = s.dsChanged[project.folder] || now;
    }
    if ((project && project.role === "screens" && project.codeToDesign) || s.fidelityTools) {
      s.screens = s.screens || { since: now, folders: [] };
      s.screens.lastWrite = now;
      if (project && !s.screens.folders.includes(project.folder)) s.screens.folders.push(project.folder);
    }
    save(FILE, s);
    return 0;
  }

  if (mode === "stop") {
    if (data.stop_hook_active) return 0;
    const reasons = [];
    const sc = s.screens;
    if (sc && sc.lastWrite > (sc.blockedAt || 0)) {
      let folders = sc.folders;
      if (!folders.length) {
        try { folders = fs.readdirSync(PROJECTS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(PROJECTS, d.name)); }
        catch (e) { folders = []; }
      }
      const found = reports(folders, sc.lastWrite - 1000);
      const low = found.filter((r) => r.score === null || r.score < MIN_FIDELITY);
      if (!found.length || low.length) {
        sc.blockedAt = now;
        reasons.push(
          (found.length ? `Fidelity below ${MIN_FIDELITY}%: ` + low.map((r) => `${r.file} ${r.score === null ? "(no score)" : r.score + "%"}`).join(", ") + "."
                        : "Screens were built from code in Figma, and no measured fidelity report was written after the last change.") +
          " Before calling the screen done, run the measured check (Design_System_Intake_Skill/steps/screens.md 7f step 4b: " +
          "tools/source_dump.js in the running source, tools/figma_text_dump.figma.js on the frame, tools/fidelity_diff.py " +
          `--out <project>/audits/<date>-fidelity-<screen>.md) and fix until it scores ${MIN_FIDELITY}% or more. ` +
          "Differences the user accepted go in the report as \"- Explained: N\". If this turn only asks the user something, say the screen is not done yet and why.");
      }
    }
    const pending = Object.keys(s.dsChanged || {}).filter((f) => !(s.reminded || {})[f]);
    if (pending.length) {
      s.reminded = s.reminded || {};
      const lines = pending.map((f) => {
        s.reminded[f] = now;
        const st = load(path.join(f, "status.json"));
        const fig = st.figma || {};
        const files = (fig.design_files || []).filter((d) => d.role !== "reference").map((d) => `"${d.name}"`);
        return `"${(fig.design_system || {}).name || path.basename(f)}" (${path.basename(f)})` +
               (files.length ? `, then Accept updates in ${files.join(", ")}` : "");
      });
      reasons.push("The DS file changed in this session. In your reply, ask the user to Publish the library " + lines.join("; ") +
        ". Set library_updates_accepted to false for those Design files in status.json and log the change in CHANGELOG.md " +
        "(Intake checkpoint to-do list). Skip this if the user already published in this session.");
    }
    save(FILE, s);
    if (reasons.length) process.stdout.write(JSON.stringify({ decision: "block", reason: reasons.join("\n\n") }) + "\n");
    return 0;
  }
  return 0;
}

try { process.exitCode = main(); } catch (e) { process.exitCode = 0; }

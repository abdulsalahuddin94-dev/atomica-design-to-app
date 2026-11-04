// Which project and Figma file a write targets, read from My Projects/*/status.json (fast: a few small
// JSON files, no Figma call). Used by figma_quality.cjs (platform rules) and session_gate.cjs (fidelity
// gate, Publish / Accept updates reminder). Works for any project and any user: nothing is hardcoded.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const PROJECTS = path.join(ROOT, "My Projects");

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

// The Figma file a tool call writes to: FigCli `FIGMA_FILE=...` (Bash or PowerShell) or a fileKey.
function targetOf(ti) {
  const cmd = String((ti && ti.command) || "");
  const m = cmd.match(/FIGMA_FILE\s*=\s*("([^"]+)"|'([^']+)'|(\S+))/);
  return {
    name: m ? (m[2] || m[3] || m[4]) : (process.env.FIGMA_FILE || ""),
    key: (ti && (ti.fileKey || ti.file_key)) || "",
  };
}

function platformOf(folder, status) {
  if (status && status.mobile_setup) return "mobile";
  let brief = "";
  try { brief = fs.readFileSync(path.join(folder, "Project_Brief.md"), "utf8"); } catch (e) { /* none */ }
  const row = brief.match(/^\|[^|\n]*\|?\s*Platform\s*\|\s*([^|\n]+)/im);
  const v = (row ? row[1] : "") + " " + path.basename(folder);
  if (/\bweb\b/i.test(v)) return "web";
  if (/\b(ios|android|mobile)\b|_iOS|_Android|_Mobile/i.test(v)) return "mobile";
  return "";
}

// { folder, name, role: "ds" | "screens" | "reference" | ..., platform, status, codeToDesign } or null.
function projectFor(target) {
  if (!target || (!target.name && !target.key)) return null;
  let dirs = [];
  try { dirs = fs.readdirSync(PROJECTS, { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== "_Project_Template"); }
  catch (e) { return null; }
  const all = dirs.map((d) => ({ d, folder: path.join(PROJECTS, d.name) }))
    .map((p) => Object.assign(p, { s: readJson(path.join(p.folder, "status.json")) })).filter((p) => p.s);
  // exact name or key first, then a part of the name (FIGMA_FILE may hold only a part only that file has)
  for (const exact of [true, false]) {
    const hit = (f) => f && ((target.key && f.file_key === target.key) ||
      (target.name && f.name && (exact ? f.name === target.name : f.name.includes(target.name))));
    for (const { d, folder, s } of all) {
      const fig = s.figma || {};
      let role = hit(fig.design_system) ? "ds" : "";
      if (!role) for (const f of fig.design_files || []) if (hit(f)) { role = f.role || "screens"; break; }
      if (!role) continue;
      return { folder, name: d.name, role, platform: platformOf(folder, s), status: s,
               codeToDesign: !!(s.code_to_design || s.source_code) };
    }
  }
  return null;
}

module.exports = { ROOT, PROJECTS, targetOf, projectFor, readJson };

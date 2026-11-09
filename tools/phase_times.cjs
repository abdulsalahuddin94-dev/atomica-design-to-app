#!/usr/bin/env node
// How long each phase usually takes, from the "Phase:" and "Time:" lines that every phase session writes into its
// project's CHANGELOG.md (python tools/session_cost.py, Intake section 0c). Reads local files only.
// CLI: node tools/phase_times.cjs [Root]   -> one line per phase: "<Phase>: about <median> active (<n> sessions)"
// Module: require("./phase_times.cjs").phaseTimes(root) -> { Intake: { minutes, median, sessions }, ... }
"use strict";
const fs = require("fs");
const path = require("path");

const PHASES = ["Intake", "Foundation", "Components", "Screens", "Storybook", "Quick task"];

// "47m active (2h 03m total)", "1h 05m active", "20m" -> active minutes
function minutes(text) {
  const active = String(text).split("(")[0];
  const h = active.match(/(\d+)\s*h/);
  const m = active.match(/(\d+)\s*m(?!s)/);
  if (!h && !m) return null;
  return (h ? +h[1] * 60 : 0) + (m ? +m[1] : 0);
}

function phaseOf(text) {
  const t = String(text).trim().toLowerCase();
  return PHASES.find((p) => t.startsWith(p.toLowerCase())) || null;
}

function entriesOf(changelog) {
  const out = [];
  // Fenced blocks hold the entry format example, not real entries.
  const body = changelog.replace(/```[\s\S]*?```/g, "");
  let phase = null;
  for (const line of body.split(/\r?\n/)) {
    if (/^#{1,3}\s/.test(line)) phase = null;
    const p = line.match(/^[-*]\s*\**Phase:?\**:?\s*(.+)$/i);
    if (p) { phase = phaseOf(p[1]); continue; }
    const t = line.match(/^[-*]\s*\**Time:?\**:?\s*(.+)$/i);
    if (t && phase) {
      const min = minutes(t[1]);
      if (min) out.push({ phase, minutes: min });
      phase = null;
    }
  }
  return out;
}

const median = (list) => {
  const s = [...list].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

function phaseTimes(root) {
  const dir = path.join(root, "My Projects");
  const all = {};
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name); } catch { return {}; }
  for (const name of names) {
    let text = "";
    try { text = fs.readFileSync(path.join(dir, name, "CHANGELOG.md"), "utf8"); } catch { continue; }
    for (const e of entriesOf(text)) (all[e.phase] ||= []).push(e.minutes);
  }
  const out = {};
  for (const p of PHASES) if (all[p]?.length) out[p] = { median: median(all[p]), sessions: all[p].length };
  return out;
}

const fmt = (min) => (min >= 60 ? `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m` : `${min}m`);

module.exports = { phaseTimes, fmt, minutes, entriesOf };

if (require.main === module) {
  const root = process.argv[2] || path.join(__dirname, "..");
  const t = phaseTimes(root);
  const lines = PHASES.map((p) => (t[p] ? `${p}: about ${fmt(t[p].median)} active (${t[p].sessions} session${t[p].sessions > 1 ? "s" : ""})` : `${p}: no data yet`));
  console.log(lines.join("\n"));
}

// SessionStart hook: machine setup check, once per machine.
//
// Checks every dependency in tools/dependencies.json (version commands, or app paths for Figma Desktop).
// All found -> records them in .claude/.state/machine-setup.json (git-ignored) and stays silent; later
// sessions only compare that record with the list and skip the checks. Something missing -> nothing is
// recorded, and Claude is told what is missing and the install command for this OS, to offer the setup
// (Design_System_Intake_Skill/steps/machine-setup.md). Editing dependencies.json, or running
// `node .claude/hooks/run.cjs setup_check --force`, checks again. Never fails the session.
//   --force   ignore the record and check again
//   --report  print a plain-text table instead of hook JSON (for a manual run)
// Entries with "optional": true (Claude Code plugins the workflow recommends) never block the record: a missing one
// is offered once, with the first record, and then stays quiet until dependencies.json changes.
const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const LIST = path.join(ROOT, "tools", "dependencies.json");
const STATE = path.join(__dirname, "..", ".state", "machine-setup.json");
const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const REPORT = args.includes("--report");

function versionAtLeast(found, min) {
  const a = (found.match(/\d+(\.\d+)*/) || [""])[0].split(".").map(Number);
  const b = String(min).split(".").map(Number);
  for (let i = 0; i < b.length; i++) {
    if ((a[i] || 0) !== b[i]) return (a[i] || 0) > b[i];
  }
  return true;
}

function expand(p) {
  return p.replace(/^~(?=[\\/])/, os.homedir()).replace(/%([^%]+)%/g, (m, v) => process.env[v] || m);
}

// Claude Code plugins installed for this user (~/.claude/plugins/installed_plugins.json, keys "name@marketplace").
function installedPlugins() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
  const j = readJson(path.join(base, "plugins", "installed_plugins.json")) || {};
  return new Set(Object.keys(j.plugins || j));
}

// One line per missing item, with this OS's install command (or the command for every OS).
function line(r) {
  const d = r.dep;
  const plat = process.platform;
  const cmd = d.install[plat] || d.install.all;
  return `- ${d.name}${r.reason ? " (" + r.reason + ": " + r.found + ")" : ""}, ${d.optional ? "recommended" : "needed"} for ${d.why}. ` +
    (cmd ? `Install: \`${cmd}\`` : `Install by hand: ${d.install.manual}`) +
    (d[`note_${plat}`] ? ` ${d[`note_${plat}`]}` : "");
}

function check(dep) {
  const c = dep.check || {};
  if (c.plugins) {
    const hit = c.plugins.find((id) => installedPlugins().has(id));
    return hit ? { ok: true, found: hit } : { ok: false };
  }
  for (const [cmd, ...a] of c.commands || []) {
    const r = spawnSync(cmd, a, { encoding: "utf8", timeout: 10000, windowsHide: true });
    const out = ((r.stdout || "") + (r.stderr || "")).trim();
    // The Windows Store "python" alias exits non-zero and prints no version, so it never counts.
    if (!r.error && r.status === 0 && /\d+\.\d+/.test(out)) {
      if (dep.min_version && !versionAtLeast(out, dep.min_version)) {
        return { ok: false, found: out.split("\n")[0], reason: `older than ${dep.min_version}` };
      }
      return { ok: true, found: out.split("\n")[0] };
    }
  }
  const paths = (c.paths || {})[process.platform];
  if (paths) {
    const hit = paths.map(expand).find((p) => fs.existsSync(p));
    if (hit) return { ok: true, found: hit };
  } else if (c.paths && !c.commands) {
    return { ok: true, found: "not checked on " + process.platform };
  }
  return { ok: false };
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

function emit(text) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text } }) + "\n");
}

function main() {
  let raw;
  try { raw = fs.readFileSync(LIST, "utf8"); } catch (e) { return; }
  const hash = crypto.createHash("sha256").update(raw).digest("hex").slice(0, 16);
  const deps = JSON.parse(raw).dependencies || [];
  const saved = readJson(STATE);
  if (!FORCE && !REPORT && saved && saved.list_hash === hash && saved.platform === process.platform && saved.all_ok) return;

  const results = deps.map((d) => ({ dep: d, ...check(d) }));
  const missing = results.filter((r) => !r.ok && !r.dep.optional);
  const optionalMissing = results.filter((r) => !r.ok && r.dep.optional);
  if (REPORT) {
    for (const r of results) process.stdout.write(`${r.ok ? "OK     " : r.dep.optional ? "OPTIONAL" : "MISSING"} ${r.dep.name}${r.found ? " (" + r.found + ")" : ""}${r.reason ? " - " + r.reason : ""}\n`);
  }
  if (!missing.length) {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify({
      list_hash: hash, platform: process.platform, all_ok: true, checked_at: new Date().toISOString(),
      found: Object.fromEntries(results.filter((r) => r.ok).map((r) => [r.dep.id, r.found])),
      optional_missing: optionalMissing.map((r) => r.dep.id),
    }, null, 2) + "\n");
    // Recommended plugins are offered once, with the first record; the record keeps later sessions quiet.
    if (optionalMissing.length && !REPORT) {
      emit("Machine setup: everything the workflow needs is installed. Recommended Claude Code plugins that are missing " +
        "(optional, asked once on this machine):\n" + optionalMissing.map(line).join("\n") + "\n" +
        "In the first reply, mention them in one line and Ask (choice) once: \"Install them now (Recommended)\" / \"Not now\" " +
        "(Design_System_Intake_Skill/steps/machine-setup.md step 8). Run the commands only after the user's yes, then restart Claude Code.\n");
    }
    return;
  }
  try { fs.unlinkSync(STATE); } catch (e) { /* no record yet */ } // a missing tool cancels an old record
  if (REPORT) return;
  emit(
    "Machine setup: this computer is missing workflow dependencies (from tools/dependencies.json):\n" +
    missing.map(line).join("\n") + "\n" +
    "Before the intake's first question, follow Design_System_Intake_Skill/steps/machine-setup.md: say in one line what is " +
    "missing and offer to set it up (one menu for all of them). Run the install commands only after the user's yes. " +
    "Nothing is recorded until everything is found, so this check repeats at each session start until then; once all are " +
    "installed it is recorded in .claude/.state/machine-setup.json and never runs again on this machine.\n"
  );
}

try { main(); } catch (e) { /* never fail the session */ }
process.exitCode = 0;

// PreToolUse hook for Figma write tools: enforces rules.json > off_limits.
//
// - no-detach: blocks scripts that call detachInstance().
// - originals-untouched: asks the user before any write script runs in an original reference
//   template (file keys come from references.json and every */data/rules.json >
//   off_limits.original_template_file_keys).
// - read-only: denies write APIs in scripts that start with "// read-only" or run inside a read-only
//   agent (ds-auditor, token-extractor, docs-writer), so auditors can use figma_execute safely.
// - FigCli (Bash): the same checks run on `node src/index.js eval "<code>"` / `eval --file <script>`.
//   Inside a read-only agent only the FigCli read commands are allowed (eval of read-only code,
//   verify, check, snapshot, daemon status/restart, --version); any other FigCli command is denied.
// Reads the rules at run time, so editing rules.json changes what is enforced.
const fs = require("fs");
const path = require("path");
const { readInput, WRITE: ANY_WRITE, figcliCode } = require("./_common.cjs"); // broad write-API pattern

const ROOT = path.join(__dirname, "..", "..");
const WRITE = new RegExp(
  String.raw`\.(remove|setValueForMode|setBoundVariable|setProperties|appendChild|insertChild|resize|swapComponent)\s*\(|` +
  String.raw`\.(name|fills|strokes|characters|cornerRadius|itemSpacing|description)\s*=[^=]|` +
  String.raw`figma\.(create\w+|variables\.create\w+)\s*\(`
);
const READ_ONLY_AGENTS = new Set(["ds-auditor", "token-extractor", "docs-writer"]);
const FIGCLI = /\bsrc[\\/]index\.js\b/;
const FIGCLI_READ = /\bsrc[\\/]index\.js\s+(eval|verify|check|snapshot|daemon\s+(status|restart)|--version)\b/;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function subdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(dir, d.name));
  } catch (e) {
    return [];
  }
}

function originals() {
  const keys = {};
  try { // every reference library entry's original file is off-limits too (references.json)
    for (const e of readJson(path.join(ROOT, "references.json")).entries || []) {
      if (e.figma_file_key) keys[e.figma_file_key] = e.name || e.id;
    }
  } catch (e) { /* no references.json */ }
  // */data/rules.json and Reference_Library/*/*/data/rules.json
  const folders = subdirs(ROOT).concat(...subdirs(path.join(ROOT, "Reference_Library")).map(subdirs));
  for (const f of folders) {
    try {
      Object.assign(keys, ((readJson(path.join(f, "data", "rules.json")).off_limits || {}).original_template_file_keys) || {});
    } catch (e) { /* no rules.json here */ }
  }
  return keys;
}

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason } }) + "\n");
  return 0;
}

function main() {
  const data = readInput();
  if (!data) return 0;
  const ti = data.tool_input || {};
  let code = ti.code || ti.javascript || "";
  if (typeof ti.command === "string") { // Bash: only FigCli commands are checked
    if (!FIGCLI.test(ti.command)) return 0;
    if (READ_ONLY_AGENTS.has(data.agent_type) && !FIGCLI_READ.test(ti.command)) {
      return decide("deny", "read-only agent: only FigCli read commands (eval of read-only code, verify, check, " +
                            "snapshot, daemon status/restart) are allowed here. Report the fix to the caller.");
    }
    code = figcliCode(ti.command, data.cwd);
  }
  if (code.includes("detachInstance(")) {
    return decide("deny", "off_limits no-detach: never detach instances. Use instance swaps, slots or exposed " +
                          "properties (component-registry.json > slots); if a swap is missing, fix the component.");
  }
  const readonly = code.trimStart().startsWith("// read-only") || READ_ONLY_AGENTS.has(data.agent_type);
  if (readonly && ANY_WRITE.test(code)) {
    return decide("deny", "read-only script: this script is marked '// read-only' (or runs in a read-only agent " +
                          "such as ds-auditor) but calls a write API. Auditors never edit Figma; report the " +
                          "issue to the caller instead.");
  }
  const keys = originals();
  const targets = [ti.fileKey].concat(ti.fileKeys || []).filter(Boolean);
  const hit = targets.filter((k) => k in keys).map((k) => keys[k]);
  if (hit.length && WRITE.test(code)) {
    return decide("ask", "off_limits originals-untouched: this script writes to the original template " +
                         `'${hit[0]}'. Work in a duplicate unless the user asked for this change in the original.`);
  }
  return 0;
}

try { process.exitCode = main(); } catch (e) { process.exitCode = 0; }

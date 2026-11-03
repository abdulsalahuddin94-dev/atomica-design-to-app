// PreToolUse hook (Bash): before a FigCli write script or screenshot, bring the target file's tab to the front.
//
// A background Figma tab throttles async Plugin API calls to about 30 s, so writes and screenshots stall
// (memory/lessons.md, 2026-10-13). When the command sets FIGMA_FILE, tools/figma_focus.cjs switches Figma to that
// tab through FigCli Yolo's debugging port. Read-only evals are left alone, so the user's view only changes when
// the work needs it. The hook never blocks: when the tab cannot be brought back it tells Claude to ask the user.
const path = require("path");
const { readInput, WRITE, figcliCode } = require("./_common.cjs");

const FIGCLI = /\bsrc[\\/]index\.js\s+(\S+)/;
const FILE = /\bFIGMA_FILE\s*=\s*("([^"]*)"|'([^']*)'|([^\s;&|]+))/;

async function main() {
  const data = readInput();
  const cmd = data && data.tool_input && data.tool_input.command;
  if (typeof cmd !== "string") return;
  const sub = (cmd.match(FIGCLI) || [])[1];
  if (!sub) return;
  const code = sub === "eval" ? figcliCode(cmd, data.cwd) : "";
  const needsFront = sub === "verify" || sub === "export" || (sub === "eval" && WRITE.test(code) && !code.trimStart().startsWith("// read-only"));
  if (!needsFront) return;
  const m = cmd.match(FILE);
  const want = m && (m[2] ?? m[3] ?? m[4]);
  if (!want) return;
  const { focus } = require(path.join(__dirname, "..", "..", "tools", "figma_focus.cjs"));
  const r = await Promise.race([focus(want), new Promise((res) => setTimeout(() => res(null), 5000))]);
  let note = "";
  if (r && r.status === "visible" && r.switched) note = `Figma tab "${r.file}" was in the background; it was brought to the front before this command.`;
  else if (r && r.status === "hidden") note = `Figma file "${r.file}" is still a background tab (${r.message || "hidden"}). Async writes and screenshots will stall: ask the user to bring it to the front (figma-files.md step 8) before more writes.`;
  if (note) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: note } }) + "\n");
}

main().catch(() => {}).finally(() => { process.exitCode = 0; });

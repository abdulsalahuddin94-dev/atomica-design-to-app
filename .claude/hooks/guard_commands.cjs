// PreToolUse hook for Bash and PowerShell commands (any project, any user):
//
// - secrets: `git commit` is denied when the changes it would commit contain a key or token (Figma figd_,
//   GitHub ghp_ / github_pat_, Anthropic / OpenAI sk-, AWS AKIA, Google AIza, Slack xox, private keys,
//   `password = "..."`) or a secrets file (.env, *.pem, id_rsa, settings.local.json, .mcp.json).
//   The secret itself is never printed.
// - dangerous commands: wiping a disk is denied; deleting a folder recursively, `git reset --hard`,
//   `git clean -f`, discarding all changes, force-deleting a branch, dropping stashes and force pushes
//   without --force-with-lease ask the user first. A delete inside a temp / scratchpad / .claude/.state
//   folder, or of a folder this session created (session_gate.cjs records mkdir / New-Item / git clone),
//   runs without asking (memory/lessons.md: never delete a folder Claude did not create).
// Fast: only `git commit` runs git (one diff); everything else is a regex on the command.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { readInput } = require("./_common.cjs");

const STATE = path.join(__dirname, "..", ".state");

const SECRETS = [
  ["Figma token", /\bfigd_[A-Za-z0-9_-]{20,}/],
  ["GitHub token", /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{20,}/],
  ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ["OpenAI-style key", /\bsk-(proj-)?[A-Za-z0-9]{32,}/],
  ["AWS key", /\bAKIA[0-9A-Z]{16}\b/],
  ["Google API key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["Slack token", /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["password or secret value", /\b(password|passwd|secret|api[_-]?key|access[_-]?token)\b\s*["']?\s*[:=]\s*["'](?![<$({]|your|example|xxx|changeme|\*{3})[^"'\s]{12,}["']/i],
];
const SECRET_FILES = /(^|[\\/])(\.env(\.[\w.-]+)?|[^\\/]*\.pem|[^\\/]*\.p12|id_rsa|id_ed25519|settings\.local\.json|\.mcp\.json|credentials\.json)$/i;

function decide(decision, reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: {
    hookEventName: "PreToolUse", permissionDecision: decision, permissionDecisionReason: reason } }) + "\n");
  return 0;
}

function git(args, cwd) {
  try { return execFileSync("git", args, { cwd, encoding: "utf8", timeout: 4000, maxBuffer: 32 << 20, stdio: ["ignore", "pipe", "ignore"] }); }
  catch (e) { return ""; }
}

// What a commit would contain. `git add ... && git commit` stages files after this hook runs, so when
// the command also adds (or uses -a), every change against HEAD plus untracked files is checked.
function commitFindings(cmd, cwd) {
  const c = cmd.match(/\bgit\s+-C\s+("([^"]+)"|'([^']+)'|(\S+))/);
  if (c) cwd = path.resolve(cwd, c[2] || c[3] || c[4]);
  const wide = /\bgit\s+(-C\s+\S+\s+)?add\b|\bcommit\b[^\n;&|]*\s-[a-zA-Z]*a/.test(cmd);
  const files = (wide ? git(["diff", "HEAD", "--name-only"], cwd) + git(["ls-files", "--others", "--exclude-standard"], cwd)
                      : git(["diff", "--cached", "--name-only"], cwd)).split(/\r?\n/).filter(Boolean);
  const found = [];
  for (const f of files) if (SECRET_FILES.test(f)) found.push(`${f} (secrets file)`);
  let added = (wide ? git(["diff", "HEAD", "-U0", "--no-color"], cwd) : git(["diff", "--cached", "-U0", "--no-color"], cwd))
    .split(/\r?\n/).filter((l) => l.startsWith("+") && !l.startsWith("+++"));
  if (wide) {
    for (const f of git(["ls-files", "--others", "--exclude-standard"], cwd).split(/\r?\n/).filter(Boolean)) {
      try {
        const p = path.join(cwd, f);
        if (fs.statSync(p).size < 512 * 1024) added = added.concat(fs.readFileSync(p, "utf8").split(/\r?\n/).map((l) => "+" + l));
      } catch (e) { /* unreadable */ }
    }
  }
  const text = added.join("\n");
  for (const [label, re] of SECRETS) if (re.test(text)) found.push(label);
  return found;
}

function createdThisSession(session) {
  try { return JSON.parse(fs.readFileSync(path.join(STATE, `session-${session}.json`), "utf8")).created || []; }
  catch (e) { return []; }
}

// Targets of a recursive delete, best effort (quotes removed, flags skipped).
function deleteTargets(cmd) {
  const out = [];
  const words = (s) => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((w) => w.replace(/^["']|["']$/g, ""));
  for (const part of cmd.split(/&&|\|\||;|\|/)) {
    const w = words(part.trim());
    const i = w.findIndex((x) => /^(rm|rmdir|rd|Remove-Item|ri|del|erase)$/i.test(x));
    if (i < 0) continue;
    for (const x of w.slice(i + 1)) {
      if (/^-/.test(x) || /^\/[a-z]$/i.test(x)) continue; // -rf, -Recurse, /s /q
      out.push(x);
    }
  }
  return out;
}

function isSafePlace(p, cwd, created) {
  const abs = path.resolve(cwd, p.replace(/^~(?=[\\/])/, process.env.USERPROFILE || process.env.HOME || "~"));
  const n = abs.replace(/\\/g, "/").toLowerCase();
  if (/\/(temp|tmp)\/|\/scratchpad\/|\/\.claude\/\.state\/|\/node_modules(\/|$)|\/storybook-static(\/|$)/.test(n + "/")) return true;
  return created.some((c) => {
    const cn = c.replace(/\\/g, "/").toLowerCase();
    return n === cn || n.startsWith(cn + "/");
  });
}

function main() {
  const data = readInput();
  if (!data) return 0;
  const cmd = String((data.tool_input || {}).command || "");
  if (!cmd) return 0;
  const cwd = data.cwd || process.cwd();

  if (/\bformat\s+[a-z]:|\bdiskpart\b|\bmkfs(\.\w+)?\b|\brm\s+-[a-z]*r[a-z]*\s+(\/|~|\/\*|[a-z]:[\\/]?)(\s|$)|Remove-Item\b[^\n]*\s[a-z]:\\?\s*(-|$)/i.test(cmd)) {
    return decide("deny", "dangerous command: this would wipe a disk, the home folder or a drive root. Never run it; " +
                          "tell the user what you wanted to do.");
  }

  if (/\bgit\b[^\n;&|]*\bcommit\b/.test(cmd) && !/--dry-run/.test(cmd)) {
    const found = commitFindings(cmd, cwd);
    if (found.length) {
      return decide("deny", `secret check: this commit would include ${[...new Set(found)].join(", ")}. ` +
        "Remove the value (keep it in an untracked file or environment variable, .gitignore it) and unstage it; " +
        "never print the secret. If it is a false alarm (an example value), tell the user and ask them to commit it.");
    }
  }

  const risky = [];
  if (/\bgit\b[^\n;&|]*\breset\b[^\n;&|]*--hard/.test(cmd)) risky.push("git reset --hard (drops uncommitted work)");
  if (/\bgit\b[^\n;&|]*\bclean\b[^\n;&|]*\s-[a-zA-Z]*f/.test(cmd)) risky.push("git clean -f (deletes untracked files)");
  if (/\bgit\b[^\n;&|]*\b(checkout|restore)\b(?![^\n;&|]*--staged)[^\n;&|]*\s(--\s+)?\.(\s|$)/.test(cmd)) risky.push("discarding every local change");
  if (/\bgit\b[^\n;&|]*\bbranch\b[^\n;&|]*\s-D\b/.test(cmd)) risky.push("force-deleting a branch");
  if (/\bgit\b[^\n;&|]*\bstash\s+(drop|clear)\b/.test(cmd)) risky.push("dropping stashed work");
  if (/\bgit\b[^\n;&|]*\bpush\b[^\n;&|]*(\s--force(?!-with-lease)\b|\s-f\b)/.test(cmd)) risky.push("force push without --force-with-lease");
  const recursive = /\brm\s+-[a-zA-Z]*[rR]|\b(rmdir|rd)\b[^\n;&|]*\/s\b|\bRemove-Item\b[^\n;&|]*-Recurse|\bdel\b[^\n;&|]*\/s\b|shutil\.rmtree|fs\.rmSync\([^)]*recursive/i.test(cmd);
  if (recursive) {
    const created = createdThisSession(String(data.session_id || "default"));
    const targets = deleteTargets(cmd);
    const unsafe = targets.length ? targets.filter((t) => !isSafePlace(t, cwd, created)) : ["(unknown target)"];
    if (unsafe.length) risky.push(`deleting ${unsafe.slice(0, 3).join(", ")} recursively (not created in this session)`);
  }
  if (risky.length) {
    return decide("ask", "Atomica safety check: " + risky.join("; ") + ". List what is there first and delete " +
                         "only what this session made; the user confirms.");
  }
  return 0;
}

try { process.exitCode = main(); } catch (e) { process.exitCode = 0; }

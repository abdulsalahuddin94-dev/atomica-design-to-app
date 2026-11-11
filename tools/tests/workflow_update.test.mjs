// node --test tools/tests/workflow_update.test.mjs
// The dashboard's "Update now" on real temporary git repos (no network): lessons 2026-11-11.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { updateWorkflow } from "../../dashboard/workflow-update.mjs";

const run = (cwd, ...args) => {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, encoding: "utf8" });
  if (r.status !== 0) throw new Error(args.join(" ") + "\n" + r.stdout + r.stderr);
  return r.stdout.trim();
};
const gitIn = (cwd) => (args) => {
  const r = spawnSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" });
  return { ok: r.status === 0, out: ((r.stdout || "") + (r.stderr || "")).trim() };
};
const write = (dir, f, s) => fs.writeFileSync(path.join(dir, f), s);

// origin (bare) with master; root = a clone of it; dev = another clone that merges a thread branch on "GitHub".
function setup() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "wf-update-"));
  const origin = path.join(base, "origin.git");
  run(base, "init", "-q", "--bare", "-b", "master", origin);
  const dev = path.join(base, "dev");
  run(base, "clone", "-q", origin, dev);
  write(dev, "a.md", "one\n"); run(dev, "add", "."); run(dev, "commit", "-qm", "start"); run(dev, "push", "-q", "origin", "master");
  const root = path.join(base, "root");
  run(base, "clone", "-q", origin, root);
  return { base, origin, dev, root };
}

test("on master behind origin: fast-forwards", () => {
  const { dev, root } = setup();
  write(dev, "b.md", "new\n"); run(dev, "add", "."); run(dev, "commit", "-qm", "update"); run(dev, "push", "-q", "origin", "master");
  const r = updateWorkflow(gitIn(root), { today: "2026-11-11" });
  assert.equal(r.ok, true, r.message);
  assert.ok(fs.existsSync(path.join(root, "b.md")));
});

test("on a merged thread branch with only a merge of master: backs up, switches to master, keeps local edits", () => {
  const { dev, root } = setup();
  // Thread branch in root, pushed and merged on GitHub.
  run(root, "switch", "-qc", "thread");
  write(root, "t.md", "thread\n"); run(root, "add", "."); run(root, "commit", "-qm", "thread work"); run(root, "push", "-q", "origin", "thread");
  run(dev, "fetch", "-q"); write(dev, "m.md", "master\n"); run(dev, "add", "."); run(dev, "commit", "-qm", "master work"); run(dev, "push", "-q", "origin", "master");
  // Root merges master into its branch locally (never pushed): the case that blocked "Update now".
  run(root, "fetch", "-q"); run(root, "merge", "-q", "--no-edit", "origin/master");
  run(dev, "pull", "-q"); run(dev, "merge", "-q", "--no-ff", "--no-edit", "origin/thread"); run(dev, "push", "-q", "origin", "master");
  write(root, "a.md", "one\nlocal edit\n"); // uncommitted edit in a file the update does not touch
  const r = updateWorkflow(gitIn(root), { today: "2026-11-11" });
  assert.equal(r.ok, true, r.message);
  const g = gitIn(root);
  assert.equal(g(["rev-parse", "--abbrev-ref", "HEAD"]).out, "master");
  assert.equal(g(["rev-parse", "HEAD"]).out, g(["rev-parse", "origin/master"]).out);
  assert.ok(g(["rev-parse", "--verify", "refs/heads/backup/thread-2026-11-11"]).ok, "backup branch kept");
  assert.equal(fs.readFileSync(path.join(root, "a.md"), "utf8").replace(/\r/g, ""), "one\nlocal edit\n");
});

test("on a branch with unmerged commits: stays on it, keeps a backup and merges the update in", () => {
  const { dev, root } = setup();
  run(root, "switch", "-qc", "open-pr");
  write(root, "x.md", "x\n"); run(root, "add", "."); run(root, "commit", "-qm", "not merged");
  write(dev, "b.md", "new\n"); run(dev, "add", "."); run(dev, "commit", "-qm", "update"); run(dev, "push", "-q", "origin", "master");
  const g = gitIn(root);
  const before = g(["rev-parse", "HEAD"]).out;
  const r = updateWorkflow(g, { today: "2026-11-11" });
  assert.equal(r.ok, true, r.message);
  assert.equal(g(["rev-parse", "--abbrev-ref", "HEAD"]).out, "open-pr");
  assert.ok(fs.existsSync(path.join(root, "b.md")) && fs.existsSync(path.join(root, "x.md")));
  assert.equal(g(["rev-parse", "backup/open-pr-before-update-2026-11-11"]).out, before);
});

test("own commits that clash with the update: merge aborted, nothing changed, local edit kept", () => {
  const { dev, root } = setup();
  write(root, "a.md", "mine\n"); run(root, "commit", "-qam", "local only");
  write(root, "c.md", "c\n"); run(root, "add", "c.md"); run(root, "commit", "-qm", "c");
  write(dev, "a.md", "theirs\n"); run(dev, "commit", "-qam", "update"); run(dev, "push", "-q", "origin", "master");
  write(root, "c.md", "c edited\n");
  const g = gitIn(root);
  const before = g(["rev-parse", "HEAD"]).out;
  const r = updateWorkflow(g, { today: "2026-11-11" });
  assert.equal(r.ok, false);
  assert.match(r.message, /clash/);
  assert.equal(g(["rev-parse", "HEAD"]).out, before);
  assert.equal(fs.readFileSync(path.join(root, "c.md"), "utf8").replace(/\r/g, ""), "c edited\n");
  assert.ok(!g(["rev-parse", "-q", "--verify", "MERGE_HEAD"]).ok);
  assert.equal(g(["stash", "list"]).out, "");
});

test("an untracked file where the update adds one: set aside in the stash, update goes through", () => {
  const { dev, root } = setup();
  write(dev, "n.md", "from github\n"); run(dev, "add", "."); run(dev, "commit", "-qm", "add n"); run(dev, "push", "-q", "origin", "master");
  write(root, "n.md", "my own\n"); write(root, "keep.txt", "untouched\n");
  const g = gitIn(root);
  const r = updateWorkflow(g, { today: "2026-11-11" });
  assert.equal(r.ok, true, r.message);
  assert.equal(g(["rev-parse", "HEAD"]).out, g(["rev-parse", "origin/master"]).out);
  assert.equal(fs.readFileSync(path.join(root, "n.md"), "utf8").replace(/\r/g, ""), "from github\n");
  assert.match(g(["stash", "list"]).out, /Update now 2026-11-11/);
  assert.ok(fs.existsSync(path.join(root, "keep.txt")), "other untracked files stay in place");
});

test("detached HEAD: switches to master and updates", () => {
  const { dev, root } = setup();
  run(root, "switch", "-q", "--detach");
  write(dev, "b.md", "new\n"); run(dev, "add", "."); run(dev, "commit", "-qm", "update"); run(dev, "push", "-q", "origin", "master");
  const g = gitIn(root);
  const r = updateWorkflow(g, { today: "2026-11-11" });
  assert.equal(r.ok, true, r.message);
  assert.equal(g(["rev-parse", "--abbrev-ref", "HEAD"]).out, "master");
  assert.ok(fs.existsSync(path.join(root, "b.md")));
});

test("a local lesson in a file the update also changes: both lessons kept (union merge)", () => {
  const { dev, root } = setup();
  const head = "# Lessons\n\nIntro.\n\n## Old\nold\n";
  write(dev, ".gitattributes", "lessons.md merge=union\n"); write(dev, "lessons.md", head);
  run(dev, "add", "."); run(dev, "commit", "-qm", "lessons"); run(dev, "push", "-q", "origin", "master");
  run(root, "pull", "-q", "--ff-only", "origin", "master");
  write(dev, "lessons.md", head.replace("## Old", "## From GitHub\ngh\n\n## Old")); run(dev, "commit", "-qam", "gh lesson"); run(dev, "push", "-q", "origin", "master");
  write(root, "lessons.md", head.replace("## Old", "## From a local session\nlocal\n\n## Old"));
  const r = updateWorkflow(gitIn(root), { today: "2026-11-11" });
  assert.equal(r.ok, true, r.message);
  assert.match(r.message, /were kept/);
  const text = fs.readFileSync(path.join(root, "lessons.md"), "utf8");
  assert.match(text, /From GitHub/); assert.match(text, /From a local session/); assert.doesNotMatch(text, /<<<<<<<|>>>>>>>/);
  const g = gitIn(root);
  assert.equal(g(["rev-parse", "HEAD"]).out, g(["rev-parse", "origin/master"]).out);
  assert.equal(g(["stash", "list"]).out, "");
});

test("a local edit that cannot be put back: updates, keeps the edit in a named stash, no conflict markers", () => {
  const { dev, root } = setup();
  write(dev, "a.md", "from github\n"); run(dev, "commit", "-qam", "change a"); run(dev, "push", "-q", "origin", "master");
  write(root, "a.md", "local change\n");
  const r = updateWorkflow(gitIn(root), { today: "2026-11-11" });
  assert.equal(r.ok, true, r.message);
  assert.match(r.message, /kept in the git stash/);
  const g = gitIn(root);
  assert.equal(g(["rev-parse", "HEAD"]).out, g(["rev-parse", "origin/master"]).out);
  assert.equal(fs.readFileSync(path.join(root, "a.md"), "utf8").replace(/\r/g, ""), "from github\n");
  assert.match(g(["stash", "list"]).out, /Update now 2026-11-11: local edits in a\.md/);
  assert.equal(g(["status", "--porcelain", "--untracked-files=no"]).out, "");
});

test("local master with its own commits: keeps them (backup) and merges the update in", () => {
  const { dev, root } = setup();
  write(root, "l.md", "l\n"); run(root, "add", "."); run(root, "commit", "-qm", "local only");
  write(dev, "b.md", "new\n"); run(dev, "add", "."); run(dev, "commit", "-qm", "update"); run(dev, "push", "-q", "origin", "master");
  write(root, "a.md", "one\nlocal edit\n");
  const g = gitIn(root);
  const r = updateWorkflow(g, { today: "2026-11-11" });
  assert.equal(r.ok, true, r.message);
  assert.ok(fs.existsSync(path.join(root, "b.md")) && fs.existsSync(path.join(root, "l.md")));
  assert.ok(g(["merge-base", "--is-ancestor", "origin/master", "HEAD"]).ok);
  assert.ok(g(["rev-parse", "--verify", "refs/heads/backup/master-before-update-2026-11-11"]).ok);
  assert.equal(fs.readFileSync(path.join(root, "a.md"), "utf8").replace(/\r/g, ""), "one\nlocal edit\n");
});

// "Update now": bring the workflow folder (Root) up to date with origin/master for anyone who cloned it,
// whatever state the folder is in, without losing anything (lessons 2026-11-11).
// `git` is (args, timeout) => { ok, out }, run in the Root.
//
// - Local edits (often a lesson another session added to memory/lessons.md) are set aside in a named stash,
//   the update runs, then they are put back. memory/lessons.md merges with `merge=union` (.gitattributes).
//   A file that cannot go back cleanly takes the updated version; its edit stays in the stash, named.
// - Untracked files in the way of a file the update adds go into the same stash.
// - On an already merged thread branch (no commits master lacks): the tip is kept as backup/<branch>-<date>
//   and the Root switches to master. On a detached HEAD the same, as backup/detached-<date>.
// - On a branch, or a local master, with commits of its own: a backup branch is kept and origin/master is
//   merged in, so the user's commits stay and the updates arrive. A merge conflict is aborted: nothing changes.
// Nothing is ever reset, deleted or force-pushed.

const lines = (r) => (r.ok ? r.out.split("\n").map((s) => s.trim()).filter(Boolean) : []);
const count = (git, range, ...extra) => {
  const r = git(["rev-list", "--count", ...extra, range]);
  return r.ok ? Number(r.out) || 0 : NaN;
};
const safe = (s) => s.replace(/[^\w./-]+/g, "-");

function keepBackup(git, name) {
  if (git(["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]).ok) return true;
  return git(["branch", name, "HEAD"]).ok;
}

export function updateWorkflow(git, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const branchR = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branchR.ok) return { ok: false, message: "This folder is not a Git clone, so it cannot update itself." };
  let branch = branchR.out;
  const fetched = git(["fetch", "--quiet", "origin", "master"], 30000);
  if (!fetched.ok) return { ok: false, message: "Could not reach GitHub to check for updates. Nothing was changed.", details: fetched.out };
  if (git(["rev-parse", "-q", "--verify", "MERGE_HEAD"]).ok || git(["rev-parse", "-q", "--verify", "REBASE_HEAD"]).ok) {
    return { ok: false, message: "A Git merge or rebase is still in progress in the workflow folder. Nothing was changed. Ask Claude to finish it first." };
  }
  const before = git(["rev-parse", "HEAD"]).out;
  const notes = [];

  // 1. Set local edits aside (tracked changes + untracked files that a new file of the update would overwrite).
  const dirtyFiles = lines(git(["diff", "--name-only", "HEAD"]));
  const untracked = new Set(lines(git(["ls-files", "--others", "--exclude-standard"])));
  const blocking = lines(git(["diff", "--name-only", "--diff-filter=A", "HEAD", "origin/master"])).filter((f) => untracked.has(f));
  const kept = [...dirtyFiles, ...blocking];
  const stashName = `Update now ${today}: local edits in ${kept.slice(0, 5).join(", ")}${kept.length > 5 ? ` and ${kept.length - 5} more` : ""}`;
  let stashed = false;
  if (dirtyFiles.length || blocking.length) {
    const args = ["stash", "push", "-m", stashName];
    if (blocking.length) args.push("--include-untracked", "--", ...blocking, ...dirtyFiles);
    if (!git(args).ok) return { ok: false, message: "Could not set your local edits aside before updating. Nothing was changed. Ask Claude to help." };
    stashed = true;
  }
  const putBack = () => {
    if (!stashed) return;
    stashed = false;
    const pop = git(["stash", "pop"]);
    if (pop.ok) { git(["reset", "-q"]); notes.push("Your local edits were kept."); return; }
    const stuck = lines(git(["diff", "--name-only", "--diff-filter=U"]));
    if (stuck.length) git(["checkout", "HEAD", "--", ...stuck]);
    git(["reset", "-q"]);
    notes.push(`Your local edits${stuck.length ? " in " + stuck.join(", ") : ""} could not all be put back; they are kept in the git stash "${stashName}". Ask Claude to put them back.`);
  };
  const fail = (message, details) => { putBack(); return { ok: false, message: message + " Nothing was changed.", details, notes }; };

  // 2. Get onto the branch that should receive the update.
  if (branch !== "master") {
    const own = count(git, "origin/master..HEAD", "--no-merges");
    if (Number.isNaN(own)) return fail("Could not compare this folder with GitHub.");
    if (branch === "HEAD" || own === 0) {
      if (count(git, "origin/master..HEAD") > 0) {
        const backup = `backup/${branch === "HEAD" ? "detached" : safe(branch)}-${today}`;
        if (!keepBackup(git, backup)) return fail("Could not save a backup of the current branch.");
        notes.push(`The old ${branch === "HEAD" ? "position" : "branch tip"} is kept as "${backup}".`);
      }
      const hasMaster = git(["rev-parse", "--verify", "--quiet", "refs/heads/master"]).ok;
      const sw = hasMaster ? git(["switch", "master"]) : git(["switch", "-c", "master", "--track", "origin/master"]);
      if (!sw.ok) return fail(`Could not switch from "${branch}" to master.`, sw.out);
      notes.push(branch === "HEAD" ? "Switched to master." : `Switched from "${branch}" (already merged) to master.`);
      branch = "master";
    }
  }

  // 3. Update: fast-forward when possible, otherwise merge master in and keep the user's own commits.
  const ahead = count(git, "origin/master..HEAD");
  let r;
  if (ahead > 0) {
    const backup = `backup/${safe(branch)}-before-update-${today}`;
    if (!keepBackup(git, backup)) return fail("Could not save a backup before updating.");
    r = git(["merge", "--no-edit", "-m", "Update the workflow from GitHub (Update now)", "origin/master"], 60000);
    if (!r.ok) {
      git(["merge", "--abort"]);
      return fail(`Your ${branch === "master" ? "local master" : `branch "${branch}"`} has its own commits that clash with the update. Ask Claude to help merge them.`, r.out);
    }
    notes.push(`Your own commits on "${branch}" were kept (backup "${backup}") and the update was merged in.`);
    if (branch !== "master") notes.push(`The folder stays on "${branch}".`);
  } else {
    r = git(["merge", "--ff-only", "origin/master"], 60000);
    if (!r.ok) return fail("The update stopped.", r.out);
  }
  putBack();

  const changed = lines(git(["diff", "--name-only", before, "HEAD"]));
  const needsInstall = changed.some((f) => /^dashboard\/package(-lock)?\.json$/.test(f));
  const needsRestart = changed.some((f) => /^dashboard\/(?!public\/).+\.(mjs|cjs|js)$/.test(f) && f !== "dashboard/workflow-update.mjs");
  return { ok: true, message: ["Workflow updated.", ...notes].join(" "), details: r.out, notes, needsInstall, needsRestart };
}

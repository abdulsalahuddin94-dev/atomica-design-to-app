// "Update now": bring the workflow folder (Root) to the latest origin/master without losing anything.
// `git` is (args, timeout) => { ok, out }, run in the Root.
//
// A Root left on a thread branch whose pull request is already merged (lessons 2026-11-11) is handled here:
// when the branch has no commits of its own that master lacks (only merges of master into it), the branch
// tip is kept as a backup branch and the Root switches to master, then fast-forwards. Local edits move along
// with the switch; git refuses (and nothing changes) when they would be overwritten.
// A branch or a local master with real unmerged commits is never switched or rewritten: the user is told why.

const count = (git, range, ...extra) => {
  const r = git(["rev-list", "--count", ...extra, range]);
  return r.ok ? Number(r.out) || 0 : NaN;
};

export function updateWorkflow(git, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const branchR = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branchR.ok) return { ok: false, message: "This folder is not a Git clone, so it cannot update itself." };
  const branch = branchR.out;
  const fetched = git(["fetch", "--quiet", "origin", "master"], 30000);
  if (!fetched.ok) return { ok: false, message: "Could not reach GitHub to check for updates. Nothing was changed.", details: fetched.out };

  const notes = [];
  if (branch !== "master") {
    const own = count(git, "origin/master..HEAD", "--no-merges");
    if (own !== 0) {
      return {
        ok: false,
        message: `The workflow folder is on the branch "${branch}", which has ${Number.isNaN(own) ? "commits" : own + " commit(s)"} not in master yet (its pull request may still be open). Nothing was changed. Ask Claude to merge or back up that branch first.`,
      };
    }
    // Only merges of master into the branch (or nothing) are missing from master: safe to leave it.
    if (count(git, "origin/master..HEAD") > 0) {
      const backup = `backup/${branch.replace(/[^\w./-]+/g, "-")}-${today}`;
      const exists = git(["rev-parse", "--verify", "--quiet", `refs/heads/${backup}`]).ok;
      if (!exists && !git(["branch", backup, "HEAD"]).ok) return { ok: false, message: "Could not save a backup of the current branch. Nothing was changed." };
      notes.push(`The old branch tip is kept as "${backup}".`);
    }
    const sw = git(["switch", "master"]);
    if (!sw.ok) {
      return { ok: false, message: `The workflow folder is on the merged branch "${branch}" and could not switch to master because local edits would be overwritten. Nothing was changed. Ask Claude to help.`, details: sw.out };
    }
    notes.push(`Switched from "${branch}" (already merged) to master.`);
  }

  const ahead = count(git, "origin/master..HEAD");
  if (ahead > 0) {
    return { ok: false, message: `Your local master has ${ahead} commit(s) that are not on GitHub, so it cannot fast-forward. Nothing more was changed. Ask Claude to help.`, notes };
  }
  // Local edits in files the update also changes (often a lesson another session added to memory/lessons.md)
  // would stop the fast-forward. They are set aside in a named stash, the update runs, then they are put back.
  // If they cannot go back cleanly, those files take the updated version and the edits stay in the stash.
  const lines = (r) => (r.ok ? r.out.split("\n").map((s) => s.trim()).filter(Boolean) : []);
  const dirty = lines(git(["diff", "--name-only", "HEAD"]));
  const incoming = new Set(lines(git(["diff", "--name-only", "HEAD", "origin/master"])));
  const overlap = dirty.filter((f) => incoming.has(f));
  const stashName = `Update now ${today}: local edits in ${overlap.join(", ")}`;
  if (overlap.length && !git(["stash", "push", "-m", stashName, "--", ...overlap]).ok) {
    return { ok: false, message: "Could not set your local edits aside before updating. Nothing was changed. Ask Claude to help.", notes };
  }
  const r = git(["pull", "--ff-only", "origin", "master"], 60000);
  if (!r.ok) {
    if (overlap.length) git(["stash", "pop"]);
    return { ok: false, message: "The update stopped without changing anything. Ask Claude to help.", details: r.out, notes };
  }
  if (overlap.length) {
    const pop = git(["stash", "pop"]);
    if (!pop.ok) {
      git(["checkout", "HEAD", "--", ...overlap]);
      git(["reset", "-q"]);
      notes.push(`Your local edits in ${overlap.join(", ")} could not be put back automatically; they are kept in the git stash "${stashName}". Ask Claude to put them back.`);
      return { ok: true, message: ["Workflow updated.", ...notes].join(" "), details: r.out + "\n" + pop.out, needsInstall: /dashboard\/package(-lock)?\.json/.test(r.out) };
    }
    git(["reset", "-q"]);
    notes.push(`Your local edits in ${overlap.join(", ")} were kept.`);
  }
  return { ok: true, message: ["Workflow updated.", ...notes].join(" "), details: r.out, needsInstall: /dashboard\/package(-lock)?\.json/.test(r.out) };
}

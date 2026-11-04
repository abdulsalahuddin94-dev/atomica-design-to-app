# 15. Team collaboration (opt-in, Abdul, 2026-10-11)

Load when 0.3d is answered "Team", when 0.0 is "Join a team project", or when a project with `status.json > collaboration = team` is picked. Solo projects never load this file: nothing below runs for them, no repo is created and nothing is pushed.

## 15.1 One repo per project
- The project folder (`My Projects/<Project folder>/`) is the repo: `Project_Brief.md`, `CHANGELOG.md`, `status.json`, `Inputs/`, `Foundation_Skill/`, `Component_Skills/`, `data/`, `docs/`, `audits/` and `storybook/` all live in it. There is never a separate Storybook repo: publishing the Storybook (Storybook_Design_System_Skill section 4 step 9) uses this same repo, so the team shares one log, one status and one Storybook.
- The folder always sits in `My Projects/` under the same name on every machine: the hooks and tools only look there. The user never places it by hand; the intake creates it (0.3) or clones it (15.3). `My Projects/*` is git-ignored by the workflow repo, so the nested repo does not clash with it.

## 15.2 Setup (once per project, after "Team")
1. Repo already there (`git -C "<folder>" remote get-url origin` works, e.g. a Storybook published earlier): use it. Say its name in one line; nothing else is created.
2. No repo: Ask (choice): "Create a GitHub repo for '<Project>'?" "Create <owner>/<project>-design-system (Recommended)" (description: public, like every project repo (Abdul, 2026-11-02): it holds the project folder, its prototype and its Storybook; the links stay inside the company; keys never go in) / "I'll give an existing repo URL" (description: type it in Other) / "Back". Only after that answer: `git init` in the folder, a `.gitignore` (`node_modules/`, `storybook/storybook-static/`, `.env`), a first commit, then `gh repo create <owner>/<project>-design-system --public --source . --remote origin --push` (or `git remote add origin <url>` + `git push -u origin HEAD`). Turn the secrets guard on first (`node tools/project_repo.cjs --install-hook "<folder>"`): it blocks any commit with a key or token.
3. When the project has a Storybook (now or later, Storybook skill section 4), copy `Storybook_Design_System_Skill/templates/storybook-check.yml` to `.github/workflows/` and commit `data/figma-styles.json`: every teammate's push then runs the Figma name check, the build and the style check on GitHub, and a red check is fixed before more Storybook work.
4. Record `collaboration: "team"` and `team.repo` (the repo URL) in `status.json`, log it in `CHANGELOG.md`, push.
5. Tell the user in one line how teammates join: they start a session in the workflow Root, pick "Join a team project" and paste the repo link. A teammate without write access uses Request edit access (dashboard, project > GitHub); the owner approves with Add as collaborator there. Claude never invites anyone on its own.

## 15.3 Joining a team project (0.0 "Join a team project")
1. Typed: "Paste the project's GitHub repo link."
2. `node tools/team_sync.cjs --join <link>`: clones into `My Projects/`, then names the folder from the repo's `status.json > project` so it matches the teammates' folder. A folder with that name already there -> nothing is overwritten; say so and Ask (choice): "Use the existing folder (Recommended)" / "Back".
3. Clone failed (no access, wrong link): one line to the user (ask the repo owner to add them as a collaborator) and Ask (choice): "Try again" / "Back".
4. Then continue as for an existing project at 0.0 (resume line, preflight checks 3-4 pick the Figma tool installed on this machine, no question, Figma connection to the same DS file from `status.json > figma`).

## 15.4 Every session (team projects only)
- **Start:** the SessionStart hook runs `tools/team_sync.cjs` (fast-forward pull of each team project, local edits stashed and restored, at most 6 s each, quiet offline) and lists pulled commits by author and components locked by teammates. Read teammates' new `CHANGELOG.md` entries before building on their work; work from another tool still gets the CLAUDE.md handoff audit.
- **Not pulled** (diverged, or a pull error): tell the user in one line and Ask (choice): "Show me the differences (Recommended)" / "Continue without pulling" / "Back". Never force-push, reset or discard to fix it.
- **Before editing a component** (in Figma, or its skill / registry entry): `node tools/team_sync.cjs "<folder>" --lock "<Category / Component>"`; foundations (variables, styles) lock as `Foundation`. Exit 1 = a teammate holds it: tell the user who and since when, then Ask (choice): "Work on something else (Recommended)" / "Wait" / "Take over" (description: only when the teammate agreed or the lock is stale, over 2 days) / "Back". Take over = the user's word, then edit that lock entry in `status.json` and push.
- **After each step** (every `CHANGELOG.md` entry: a build step, an audit, a fix, a Storybook update): `node tools/team_sync.cjs "<folder>" --push "<the entry title>"`, then `--unlock` each finished component. A push that cannot be rebased stops with nothing pushed: tell the user and resolve it with them.
- **End of a phase:** push, and say in one line which locks are still held.
- `node tools/team_sync.cjs "<folder>" --status` shows the locks and whether the folder is ahead of or behind GitHub.
- The Figma edit check (0b check 6) covers manual Figma edits by any teammate, since it reads the shared DS file's history.

## 15.5 Switching
- Solo -> Team: run 15.2 any time the user asks. Team -> Solo: set `collaboration: "solo"`; the repo stays as it is (deleting a repo is the user's step).

## 15.6 Hand-off in the dashboard (Abdul, 2026-11-02)
One repo per project holds everything a second designer needs; `tools/project_repo.cjs` has the logic, the dashboard's project **GitHub** page the buttons. Project repos are always public (the links stay inside the company), so nothing secret goes in.
- **Live links:** "Publish to: This repo" (`status.json > github.pages = "project-repo"`) puts the prototype at `/<repo>/prototype/` and the Storybook at `/<repo>/storybook/` (`tools/publish_storybook.cjs`, only when its checklist has "Public link"), with a link page at `/<repo>/`. Projects keep their older links until the user switches.
- **Files:** Check files lists what is not uploaded, what stays on this computer on purpose (comment cache, packages, builds) and key files; Upload to GitHub records the comments' public Supabase pair in `status.json > comments`, scans, commits and pushes.
- **Secrets guard:** a pre-commit hook per computer (`--install-hook`) and the same scan before every publish block GitHub, Figma, Supabase secret and other keys; the Supabase public key is allowed. Keys stay in `~/.atomica` on each computer.
- **Comments:** the Supabase URL and public key travel with the project, so the next designer sees the comments with no setup (reading is allowed to the public key by row level security). Resolving and replying need the secret key, pasted once per computer (Connect services > Supabase); the public key is never given update rights, because anyone with the live link has it.
- **Open from GitHub** (Projects page): clones the repo into `My Projects/`, then the project's GitHub page lists what this computer still needs (packages, Figma token, the guard).
- **Access:** without write access, Request edit access opens an issue on the repo (or a prefilled link); the owner sees it on the GitHub page and clicks Add as collaborator. Editors send their work with "Send my changes for review" (branch `edit/<login>` + pull request); `github.merge_policy` = `owner` (default) or `editors`.
- **One editor at a time:** `status.json > current_editor`, shown as a banner on every project page. Start editing / Hand over / Ask to take over; a request appears on the editor's banner (Hand over / Keep editing); after 12 hours without activity Take over works directly.

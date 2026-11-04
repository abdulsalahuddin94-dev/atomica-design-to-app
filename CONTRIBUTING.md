# Improving the workflow (contributions)

Anyone on the team can improve the workflow: share a lesson, add a reference design system or an icon library, improve a skill, step or tool, or add a new one. Claude does the git work; you only describe what you want. Abdul reviews every change before it reaches `master`, so the workflow everyone uses stays stable.

In Claude Code: run `/contribute` (or say "share a lesson", "add a reference design system", "add an icon library", "improve the workflow"). Other AI tools follow this file directly. Without any AI tool: open an issue with the **Lesson** or **Rule or improvement** form on GitHub, or a pull request by hand.

## 1. What you can add, and where it goes

| Kind | How Claude builds it | Files it changes |
|---|---|---|
| Lesson (a mistake and its fix) | asks what broke, the cause, the rule, the check | `memory/lessons.md` + the skill or tool that now prevents it |
| Rule or decision | asks the rule, why, and where it applies | `memory/decisions.md` + the skill that applies it |
| Reference design system (any company, one platform per run) | runs `/study-reference-ds` (`References.md` > "Adding a design system to the library", scaffold with `tools/add_reference.py`) | `references.json`, `Reference_Library/<Company>/<Platform>/`, `memory/references.md` |
| Style (a look for new projects) | checks the license of its source, writes `Style_Library/<slug>/DESIGN.md` in the shape of the others (`# <title>`, `> Category:`, a one-line `> ` description, colors with hex, typography, components, spacing, radius, elevation, do's and don'ts), runs `python tools/build_style_index.py` | `Style_Library/<slug>/DESIGN.md` + `styles.json`; intake 0.3e and the dashboard's Style library then offer it |
| Icon library | checks the license (free, SVG, commercial use, from its npm package or site), the Iconify prefix and its styles | a new entry in `tools/icon_libraries.json` (same fields as the others); intake 0.6b then offers it |
| Improvement to a skill, step or tool | reads the file, makes the change, runs the tool's own check | that file, plus `docs/` when users would see it |
| New skill, step, tool or subagent | follows the layout of the closest existing one (`.claude/skills/*/SKILL.md` points to a Root file, steps in `Design_System_Intake_Skill/steps/`, tools in `tools/`) | the new files, the map that lists them (`CLAUDE.md`, `AGENTS.md`, `README.md`, Intake section 0c, `tools/README.md`) |
| Adopted guide from a public repo | checks the license (MIT or similar) and credits it | `Workflow_References/` + its `README.md` and `licenses/` |

Every change keeps the workflow's own rules: `memory/decisions.md` wins, platforms stay independent, no company name hardcoded in skills, paths relative to the Root, hooks in Node.js, nothing installed for the user, choice questions as Ask (choice) with Back. A change that breaks one of these says so and why, and Abdul decides.

## 2. Steps (Claude Code `/contribute`, any other tool the same way)
Every question with options is an Ask (choice) (other tools: a numbered list, recommended first). Every menu after the first ends with "Back" (Intake section 0).

1. **Kind**, Ask (choice): "What do you want to add?" "A lesson from a mistake (Recommended)" / "A reference design system or icon library" / "An improvement to a skill, step or tool" (description: a better way to do an existing step, or a new one) / "A rule or decision". Skip the question when the request already says it; after a fixed mistake it is a lesson, prefilled from the session.
2. **Start from the latest workflow:** `git pull --ff-only` on `master` (uncommitted changes -> ask first: "Keep them aside, then pull (Recommended)" / "Stop"), then a branch `contrib/<YYYY-MM-DD>-<short-name>`. Never work or push on `master`.
3. **The facts**, one question at a time, skipping anything already known (section 1 lists what each kind needs).
4. **Check it is new:** search `memory/`, `references.json`, `tools/icon_libraries.json` and the named skill for the same thing. Already covered -> say where in one line and Ask (choice) "Add it anyway as more evidence" / "Drop it" / "Back". Conflicts with a standing decision -> say which; it is still sent, marked `Conflicts with: <decision>`, and Abdul decides.
5. **Build it** as section 1 says, in the exact format of the file it goes into (a lesson: numbered item, bold title, `Cause:`, `Rule:`, `Check:`; a decision: one bullet with `(<name>, <date>)`; JSON entries with the same fields as their neighbours). Run the checks that apply: `node tools/lint_token_names.cjs` on a new reference folder, `python -m json.tool` on edited JSON, a tool's own run on a sample. Lessons and decisions written by a teammate carry `(contributed by <GitHub login>)`.
6. **Make it safe for a public repo.** This repo is public. Remove client and product names, private Figma file keys and links, people's names other than the contributor, tokens, emails and machine paths. A reference design system is added only from a file that is published or that its company allows to be studied; say which in the PR.
7. **Show the result** (the diff, or the text for a lesson) and Ask (choice): "Send it for review (Recommended)" (description: opens a pull request; Abdul reviews it) / "Change something" / "Keep it on this machine" (description: the branch stays local, nothing sent) / "Back". Nothing leaves the machine without "Send it for review".
8. **Send it**, the first way that works:
   - **Pull request** (default): one commit, push the branch, `gh pr create --draft --label contribution` with a title starting `[Lesson]`, `[Rule]`, `[Reference]`, `[Icons]` or `[Improvement]` and a body: what it adds, why, the checks run. A contributor who cannot push to the repo gets a fork first (`gh repo fork --remote`, then push to the fork and open the PR against `abdulsalahuddin94-dev/atomica-design-to-app`), so anyone with a GitHub account can contribute without an invitation. If the label is refused, run it again without `--label`.
   - **Issue** (a lesson or rule with no file changes the contributor wants to make): `gh issue create --label contribution` with the same title prefix.
   - **No GitHub CLI or not signed in:** keep the branch, save the text in `contributions/<YYYY-MM-DD>-<short-name>.md` (git-ignored) and give the link `https://github.com/abdulsalahuddin94-dev/atomica-design-to-app/issues/new/choose`. Never put the text in a URL.
9. **Confirm** in one line with the link; Abdul reviews it before it reaches everyone. Switch back to `master`, so the contributor keeps working on the shared workflow; their change arrives with the next pull once it is merged.

## 3. Review (Abdul only: `/contribute review`)
Only the repo owner runs this (the `gh api user` login matches the owner in `git remote get-url origin`); anyone else is told that reviews are Abdul's.

1. List open contributions: `gh pr list --label contribution --state open` and `gh issue list --label contribution --state open` (also titles starting `[Lesson]`, `[Rule]`, `[Reference]`, `[Icons]`, `[Improvement]` without the label). None -> say so and stop.
2. For each one, oldest first: read the diff, check it against section 1 and the rules there (duplicates, conflicts with `memory/decisions.md`, private data, a lesson without its skill or tool fix, a new file missing from its map, a reference without its data files), run its checks again. Show in a few lines what it adds, what is right and what is missing. Then Ask (choice): "Accept (Recommended)" (description: merge it) / "Fix, then accept" (description: Claude adds the missing parts on the same branch first) / "Ask the contributor for changes" (description: posts your notes on the PR) / "Decline" (description: closes it with your reason) / "Back". Recommend another option when the check found a problem.
3. **Accept:** mark the PR ready and merge it (`gh pr merge --squash`); for an issue, build it on a branch as in section 2 step 5 and open a PR that says `Closes #<n>`. Update `docs/` (FAQ, getting started, workflow map) when users would see the change. Then pull `master` into the Root.
4. **Ask for changes / Decline:** the notes or the reason are typed by Abdul, then posted on the PR or issue (and closed for Decline). Comments, merges and closing happen only after Abdul's choice in step 2.
5. End with one line per contribution: merged, waiting for the contributor, declined, or skipped.

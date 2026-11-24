# 18. Live prototype, Backend and Handoff (All the way, after Screens)

Part of `Design_System_Intake_Skill`. Loaded right after the Screens checkpoint is approved when `status.json > scope` = `all` and the project started in Figma (`start` = `figma`, or none). Vibe code and Code first projects skip 18.1-18.3: their app is the prototype (`steps/vibe-code.md`); Scenario D skips them too, its repo is the prototype. Every `Ask (choice)` here also gets a "Back" option (`SKILL.md` section 0); progress lines are `Live prototype <n>/<total>`, `Backend <n>/5` and `Handoff`, so the dashboard shows the stage. Say the usual time first (`node tools/phase_times.cjs`, phase `Live prototype`).

The tools and their details live in `Screens_Handoff_Skill/README.md` (read its "How step 1 runs" and "Step 4: comments" when a step below needs more); this file is the order the stage runs in. One phase, one session (`SKILL.md` 0c); Backend and Handoff may follow in the same session when they are short.

## 18.0 Before the build

1. **Storybook components are needed.** The prototype reuses the project's Storybook React components (`storybook/component-map.json`, tokens CSS); it never re-creates one, and a Figma component with no Storybook export shows as a dashed box. If `storybook/` is missing or the screens use components it does not export: say so in one line, then Ask (choice): "Build the components Storybook first (Recommended)" (description: the components the screens use, local only, nothing published; `steps/finish.md` section 12 with the preset What the developer needs) / "Build the prototype anyway" (description: missing components show as dashed boxes) / "Stop here for now" / Back. Turning it on records `status.json > storybook` as at 0.7.
2. **Packages:** the first build needs `npm --prefix "My Projects/<Project>/prototype" install`. Show the command and Ask (choice): "Yes, install (Recommended)" / "Not now" / Back.
3. Heavy-step warning (0c) before 18.1.

## 18.1 Export and build (local)

1. Export each approved screen of the flow from the Design file (read only): `node tools/screens_export.cjs --file "<Design file>" --page <page> --png --out "My Projects/<Project>/prototype/data"`. Background tab: bring it to the front first (`figma-files.md` step 8); a screen built in a slot stays code-first (lessons, 2026-11-01).
2. Build: `python tools/build_prototype.py "My Projects/<Project>" --flow "<flow name>"` (flows and routes from `Planning/07-flows/` when Discover ran; navigation names from `Planning/06-ia.md`). It prints missing Storybook components, raw values and untranslated strings: each must be 0 or listed for the checkpoint.
3. Run it: `npm --prefix "My Projects/<Project>/prototype" run dev` (http://localhost:5190; a dashboard project opens it in the Design page preview).

## 18.2 Check

- **Fidelity:** `node scripts/fidelity.mjs --shots <folder>` in the prototype folder while dev runs: 98% or more per screen (1px-tolerant score, strict score shown next to it), every mode and language, up to 3 fix rounds. A difference inside a Storybook component is fixed in the Storybook (`tools/style_parity.py` back to 0), never patched in the prototype.
- **Live check:** `node scripts/check_live.mjs --url http://localhost:5190` (every screen x mode x language, desktop and phone, navigation, Inspect, Code panel). Code panel check: unknown names 0, raw values 0.
- The images go in `audits/` through ds-auditor (0c); the main session opens the flagged ones before the checkpoint.

## 18.3 Checkpoint 4: Live prototype

Show numbered screenshots (each screen, Light and Dark, EN and AR when RTL = Yes), the fidelity table and the check numbers. Ask (choice): "Live prototype is ready. Approve it?" "Approve, publish it (Recommended)" (description: a public GitHub Pages link that reviewers open and comment on with no account) / "Request changes" / "Keep it local for now" / Back. Checkpoints in `Project_Brief.md` follow section 8 (`Ready for review` until the user answers).

## 18.4 Publish and comments

1. **Repo:** from `prototype/data/publish.json`, else `status.json > prototype.repo`, else the project repo (`github.pages = "project-repo"`, `steps/team.md` 15.6). None yet: Ask (choice) "Create the repo and publish (Recommended)" (description: a public repo `<owner>/<project>-prototype` with a short README; the link stays inside your company) / "Use a repo I name" (typed in Other) / Back. `--create` runs only after this yes.
2. **Preflight, then publish:** `node tools/publish_prototype.cjs "My Projects/<Project>" --repo <owner>/<name> --check` (packages, Git, repo, write access, Pages; each problem with its plain fix), then the same command without `--check` (add `--create` only after step 1's yes). Save the printed URL in `status.json > prototype.url` and give it to the user.
3. **Comments:** with the shared `~/.atomica/supabase.env` (or the project's `prototype/.env.local`) the link stores comments for everyone; without it they stay in each browser ("Local test store") and the user is told so in one line. Keys are typed by the user into those files, never into the chat. Triage later with `node tools/prototype_comments.cjs "My Projects/<Project>" --pull` (one fix list, approved before any change, then `--resolve <id>`), as in the README's comment loop.

## 18.5 Backend (optional, `status.json > backend.plan`)

- `sample` (or none): say in one line that the prototype runs on sample data and the database can be connected later (dashboard Backend page, or ask). Go to 18.6.
- `stage-8` or `unsure`: Ask (choice) "Connect a database now?" "Later (Recommended)" (description: keep sample data; nothing to set up) / "Set it up now" (description: a free Supabase project in 5 steps, about 15 minutes) / Back.
- **Set it up now** follows the dashboard's 5 steps (`dashboard/public/project-pages.js > drawBackend`), one step per message with the link to the right Supabase page: (1) Account (supabase.com sign-up, the user signs in), (2) Create the project (one per app, decision 3A; free plan allows 2), (3) Link and public key (the user types the project link and the publishable key; both are public, saved in `status.json > backend`), (4) Secret key (the user pastes it only into `~/.atomica/backend/<project folder>.env` themselves; Claude never reads, prints or commits it), (5) Start the database (Claude writes `backend/setup.sql` from the screens and `Planning/06-ia.md`'s object model, safe to run again, RLS on; the user runs it in the SQL Editor). Then check the tables through the public API and record `backend.step` = 5.

## 18.6 Handoff (one repo for developers)

1. Write the developer files: `python tools/design_md.py "My Projects/<Project>"` (DESIGN.md and the AGENTS.md block), the project skills and final audit if `steps/finish.md` section 11 has not run yet.
2. The project folder is one public GitHub repo (`steps/team.md` 15.6): install the secrets guard once per computer (`node tools/project_repo.cjs --install-hook "My Projects/<Project>"`), list what is not uploaded (`--audit`), then Ask (choice) "Upload the project to GitHub (Recommended)" / "Not now" / Back; on yes commit and push the project folder (the guard blocks keys). The dashboard's GitHub page does the same with buttons.
3. Live links: prototype at `/<repo>/prototype/`, Storybook at `/<repo>/storybook/` (`tools/publish_storybook.cjs`, only when its checklist has "Public link"), link page at `/<repo>/`.

## 18.7 Log

`CHANGELOG.md` entry `Phase: Live prototype` (what was built, fidelity average, the URL, Backend step, Handoff repo) with the `python tools/session_cost.py` `Tokens:` / `Time:` lines, `Project_Brief.md` (Checkpoint 4, `Next step:`), `python tools/project_status.py "My Projects/<Project>"`. Then tell the user the project has gone all the way, with its links.

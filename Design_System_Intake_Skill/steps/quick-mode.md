# Quick mode: one task on a live file, no intake

Part of `Design_System_Intake_Skill` (section 13; map in `SKILL.md` section 0c). Load when the user runs `/ds-quick`, says "quick mode", or asks for one specific task on a file that is already in use (Abdul, 2026-10-01). Every `Ask (choice)` / `Ask (multi)` here also gets a "Back" option, except the first question of the quick task (`SKILL.md` section 0, Back on every menu).

## 13. Quick mode

For real projects that are already running: the user opens the workflow and asks for **one thing**, for example "build the Pricing Card from this live website" (screens captured from the site or a GitHub project into Figma with the html-to-Figma Chrome plugin), "audit this page", or "add a Danger variant to Button". Quick mode uses the workflow's skills and rules, but skips the project setup around them.

**Skipped:** intake questions 0.1-0.8 and 2.x, the Intake Summary, the `My Projects/` folder and `Project_Brief.md`, phases and the Foundation / Components / Screens checkpoints, project skills (section 11), Storybook questions.

**Kept (never skipped):** tools preflight (section 0b checks 1-5), the file check before any write, the rules in `memory/decisions.md`, atomic tiers, real icons, the guard hook on original reference templates, the audit after every change, and no self-approval.

### 13.1 Questions (only what is missing, one per message)

Read what the user already said first; ask nothing it answers. Every question with options is an Ask (choice) or Ask (multi) (section 0).
1. **The task**, if it is not one clear thing, Ask (choice): "What exactly should I do?" "Build one component" / "Audit a file or page" / "Fix one thing".
2. **The file:** if a file is connected, Ask (choice): "Figma is connected to '<file name>'. Should I work in this file?" "Yes, this file" / "No, another file" (description: paste its link in Other). For a component, also ask where the component goes if the connected file is not the DS, Ask (choice): "Which file holds the design system for this component?" "This file" / "Another file" (description: paste its link in Other).
3. **The tool:** no question (Abdul, 2026-10-11). Both installed -> FigCli Yolo, the Desktop Bridge only for slots; one installed -> that one. Say which in one line.
4. **The platform**, Ask (choice): "Web" / "iOS" / "Android", only when the file does not make it obvious (frame widths, names, `md.sys` or iOS semantic variables). It picks which Main Skill sections apply.
5. **The source** for a component (typed): the live URL, or the captured frame in Figma (name or selection). If the source shows only one state, Ask (multi): "Which states should it have?" with the platform's usual states (Web: Hover, Focus, Disabled, Pressed; group the rest in Other).

If the file belongs to a project in `My Projects/` (its key or exact name is in a `status.json`), say so in one line and reuse that project's files: `data/*.json`, `Component_Skills/`, the saved tool. Quick mode still applies; only the logging changes (13.4).

### 13.2 Load only what the task needs

- Platform Main Skill: the matching sections only (Web: 3 Token architecture, 5 Icons, 6 Component conventions, 9 Mistakes; the same sections in the iOS / Android skills).
- Build: figma-use + figma-generate-library (figma-swiftui for iOS), plus Impeccable / ui-ux-pro-max for visual quality (and section 11 of the iOS/Android Main Skill: `references/ios-polish.md` on iOS, material-design-3-ui on Android when installed). Audit: audit-design-system through `ds-auditor`.
- `tools/figma_helpers.figma.js` once per file, as usual (section 0c).

### 13.3 Steps

**Build one component**
1. Look at the source at full size (the live site in the browser, or a screenshot of the captured frame). List its parts, variants and states, texts and icons.
2. Read the target file before writing: variables, text and effect styles, existing components and icons. Reuse what exists; never duplicate a component that is already there.
3. Post the plan in one message: tier, atomic map, lower-tier components that exist or are missing, tokens it binds to, and any missing token as a proposal. Then Ask (choice): "Build it (Recommended)" / "Change the plan".
   - Missing lower-tier components are built first as their own main components (atomic rule). If more than two are missing, say so and Ask (choice): "Build them too" / "Stop here".
   - Missing tokens are never added without approval (Ask (multi): one option per proposed token); a near-miss value uses the nearest token.
   - The target file has no variables at all: quick mode cannot build a tokenized component. Ask (choice): "Propose minimal tokens" (description: a minimal Primitive + Semantic set for this component, approved first) / "Run the full intake" (description: Brownfield type 1).
4. Build fresh from variables and styles. **Captured frames are a reference only:** never turn captured layers into the component (they hold raw hex, px and fonts, default names and no Auto Layout).
5. Naming, component properties, Auto Layout, meaningful layer names, icon swap properties and the Figma description (Purpose, Usage Rules, Accessibility) follow the platform Main Skill.
6. `ds-auditor`: audit plus screenshots of every variant in Light and Dark. Fix what it finds.
   When the source runs (a live site, or code run locally) and the task builds or changes a screen, popup or component from it, the measured fidelity check of `steps/screens.md` 7f step 4b also runs (`tools/source_dump.js`, `tools/figma_text_dump.figma.js`, `tools/fidelity_diff.py`): Open differences 0 or each one explained; screens never below 1440 x 900 (Desktop) or 375 x 812 (Mobile).
7. Show the result as `Ready for review` with the screenshots and audit numbers. Only the user approves. Then Ask (choice): "Approve (Recommended)" / "Request changes". If the file is a published library, ask to publish (Ask (choice): "Done" / "Not yet") and say which files need Accept updates.

**Audit only**
1. Agree the scope, Ask (choice): "The whole file" / "One page" (description: name it in Other if it is not the current page) / "The current selection".
   When the scope holds screens (not only components or foundations), Ask (multi): "What should the audit cover?" "Design system use (Recommended)" (description: components, variables, styles, fidelity) / "Usability" (description: Nielsen's 10 heuristics and Krug, each issue rated 0-4; `Workflow_References/ux-heuristics/README.md`) / "Back". Default: both ticked.
2. Run `ds-auditor` (audit-design-system; screens mode for screen frames, plus `usability` mode when ticked). Read-only: nothing in Figma changes.
3. Report the numbers and the issues, each with a proposed fix. Ask (multi): "Which issues should I fix?" one option per issue, or per issue type when there are more than 4. Fix only what the user ticks, then audit again.

**App icon** ("add an App Icon page", "present my app icon"): follow section 7h (`steps/app-icon.md`) in the target DS file; the platform comes from 13.1 step 4. Without a project there is no `status.json`: the page's `App Icon Status` text is the only record, and the Storybook step is skipped.

**Fix one thing** (one variant, one state, one binding, one rename): steps 2, 5, 6 and 7 of Build.

Comments: if the user asks to read the file's Figma comments or act on them, follow `steps/figma-comments.md` (section 14); never otherwise.

### 13.4 Logging and handoff

- Unregistered file: no folder, no files. The result and the audit numbers stay in the chat. If the user wants the report saved, ask where (typed).
- File of a registered project: append a `CHANGELOG.md` entry (`Quick mode: <task>`, `Storybook synced: no`), save the audit in its `audits/`, run `python tools/project_status.py "My Projects/<Project>"`, and update its `Component_Skills/` entry if a component was added or changed.
- Commit only what changed in the repo, as usual.

### 13.5 When quick mode is the wrong tool

Say so in one line and offer the full intake (Ask (choice): "Switch to the full intake (Recommended)" / "Stay in quick mode") when the request grows into a whole foundation, more than about three new components, a multi-screen flow (section 7e) or a Scenario C refactor. The full intake can reuse what quick mode already learned (file, platform, tool), so nothing is asked twice.

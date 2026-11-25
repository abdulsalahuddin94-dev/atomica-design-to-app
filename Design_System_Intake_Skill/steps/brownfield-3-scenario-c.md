# Brownfield type 3: imperfect DS + Design file (Scenario C)

Part of `Design_System_Intake_Skill` (sections keep their original numbers, so "section 7c" etc. still resolve; the map is in `SKILL.md` section 0c). Load when 2.2 = 3. Also load figma-files.md, fix-on-create.md and screens.md. When 2.3 = "Inside the Design file", also load `single-file-ds.md` (section 7g): it sets up the file first, splits the Variable Map's "Used in" column into DS pages and screen pages, asks the path (2.4) after step 1, and says which publish steps change. Every `Ask (choice)` / `Ask (multi)` here also gets a "Back" option (`SKILL.md` section 0, Back on every menu).

## 7. Step 6 - Brownfield type 3: imperfect DS + Design file (Scenario C)

Use this path when a design system already exists but is not AI-ready (missing scopes, unclear names, no descriptions, gaps) and one or more Design files follow it only partially or not at all. Six steps, in order. Nothing in the Design files is changed before step 5, and nothing new is added to the DS without Abdul's approval. Load audit-design-system for steps 3 and 6, and figma-use + figma-generate-library for DS changes.

**Before step 1:** ask "Please share the design system Figma link and the link of every Design file (each with a name)." (Single file, 2.3: ask for that one link and follow section 7g "Before anything".) Register them in `status.json > figma` (section 7c). Then Ask (choice): "Do you have any reference for the tokens?" "Yes, I will share them" (description: developer token files, docs, a Storybook, a style guide; paste links or paths in Other) / "No references" Any reference found is read first and wins over inference.

### Step 1 - Understand the DS (Variable Map)
1. Study the DS file (⭐Setup or its foundation pages first, then component groups; screenshot every variant in each mode).
2. Read **every variable**: collection, modes, scopes, value per mode (Light / Dark), alias target (which Primitive it points to), description, and **where it is used** inside the DS components (which component, which layer, which property: fill, stroke, text, gap, radius...). Export them first (section 7b step 1) so the data is in `data/source/`. Then read **how every linked Design file uses it** (read only, nothing is changed): on how many screens and layers, and on which property (e.g. `color/surface/raised` as the fill of card frames on 38 screens). The Design files show what the live product really does with each variable.
3. Infer each variable's purpose from, in this order: the user's references, its name and group, its scopes, where DS components use it, where the Design files use it, and its values across modes. A variable used for one clear purpose across the screens gains confidence even with an unclear name; one used for conflicting purposes across the screens loses confidence and is noted for the step 3 audit.
4. Write the **Variable Map** to `<Project folder>/audits/<date>-variable-map.md`, one row per variable:

   | Variable | Collection / modes | Value (Light / Dark) | Alias | Scopes | Used in (component > layer > property) | Used in Design files (screens / layers > property) | Inferred usage | Confidence |
   |---|---|---|---|---|---|---|---|---|

   Confidence: **high** (name, scope and usage agree), **medium** (two of three agree), **low** (unclear name, no scope, unused or used for conflicting purposes). Usage means the DS components and the Design files together; when they disagree, the row says so.
   Then confirm the intake answers it holds (0.3c): post the color modes, RTL and fonts found in the DS (its variable modes, Arabic or RTL components, the font families of its text styles), then Ask (choice): "Use these (Recommended)" / "Change something". Record them in `Project_Brief.md` with their source.
5. Show the summary (counts per confidence) and ask Abdul **only about the low-confidence names**, up to 4 per AskUserQuestion call (more in further calls), one Ask (choice) per variable: "What is `<name>` for?" with the guess first, "<guess> (Recommended)" (description: <what I found>, including its Design file usage, e.g. "fill of card frames on 38 screens"), then up to 2 other plausible usages; the real purpose is typed in Other. Record the answers in the map and in `docs/decisions.md`. Then Ask (choice): "Approve the Variable Map?" "Approve (Recommended)" / "Request changes". Abdul approves the Variable Map before step 2.
6. Single file (section 7g): ask 2.4 now. "Split into a library" runs the 7g migration before step 2; "Keep it in one file" runs steps 2-6 with the 7g path 1 changes (history versions instead of Publish and Accept updates).

### Step 2 - Fix the DS itself (after approval)
1. Propose the DS fixes as one list: missing or wrong **scopes** (from the approved map, e.g. a border color scoped to STROKE_COLOR only), **descriptions** for every variable (its usage from the map) and every component (Purpose, Usage Rules, Accessibility), bad names (section 7b renames), failing contrast pairs, and **gaps** (missing tokens, states or components the Design files will need). Gaps are flagged, never filled silently.
2. Apply the fixes in the DS file only (section 7b steps 2-4), split by risk, because this DS is already used by live Design files:
   - **Fix on create, without asking** (nothing visible changes in the screens): descriptions for variables and components, scopes for **high-confidence** variables, typo / spacing / case renames (bindings are kept), missing states added to components.
   - **Approval first** (can change how existing screens look or break bindings): any change to a value or alias (including contrast fixes), scopes for medium / low-confidence variables, merging or deleting variables or components, renaming a variable to a different meaning.
   Show both lists together; the first is already applied. The second is an Ask (multi): "Which of these fixes should I apply?" one option per fix (more than 4: one option per group, e.g. "Contrast fixes (5)", "Scopes, medium confidence (12)", or several calls); unticked fixes are not applied.
3. Run audit-design-system on the DS, then ask Abdul to **publish** the library (section 7c) and wait for his confirmation (Ask (choice): "Done" / "Not yet").

### Step 3 - Audit the Design file, screen by screen
Run audit-design-system (ds-auditor, `screens` mode) on each Design file, one screen at a time. Per screen, find:
- **Raw values:** hardcoded hex colors, px spacing / radius / sizes, fonts and text properties not using a text style.
- **Misused variables:** a variable used against its scope or its Variable Map purpose (e.g. a border color used as a fill, a text color on a background, a spacing token used as a radius).
- **Detached instances** and local copies of DS components; hand-drawn elements that match a DS component.
- **Frames without Auto Layout** and **default layer names** (Frame 124, Rectangle 23).

**Usability (optional, 2026-10-13):** before the audit, Ask (choice): "Also review the screens' usability?" "Yes (Recommended)" (description: Nielsen's 10 heuristics and Krug per screen and per flow, each issue rated 0-4; `Workflow_References/ux-heuristics/README.md`) / "No, DS audit only" / "Back". Yes -> ds-auditor `usability` mode writes its own report `<Project folder>/audits/<date>-usability-<file>.md`. Usability issues are listed after the DS issues and are never fixed with the approval below: they change how the screens work, so they get their own Ask (multi) after step 5, one option per issue (or per heuristic when more than 4). **AI review (optional, on request only):** the user can also ask for Review design or Challenge the plan (`Workflow_References/ai-review/README.md`).

Write the report to `<Project folder>/audits/<date>-screens-<file>.md`: per screen, one row per issue with the layer, the current value, the problem and a **proposed fix** (the variable, style or component to use, following step 4). Show totals per screen and per issue type, then Ask (choice): "Approve the report and fix the screens?" "Approve (Recommended)" / "Request changes".

### Step 4 - Raw values with no matching Semantic variable
For each raw value the report cannot map directly, decide by this rule and write the decision in the report:
- **Near-miss of an existing token** (e.g. `#1B74E9` next to `color/action/primary` `#1A73E8`, 15px next to `space/4` 16px) -> use the nearest token.
- **Repeated new value** (the same value used on several screens or many layers, with a clear purpose) -> propose a **new Primitive + Semantic** pair (name, value per mode, Primitive it aliases, scope). Never added without Abdul's approval (Ask (multi): "Which new tokens should I add?" one option per proposed pair, name and value in the description); once approved it is added in the DS file, the library is published, then the screens are bound to it.
- **One-off off-scale value** (e.g. 13px gap, 7px radius) -> snap to the nearest step of the scale.
- **Unsure** -> mark `needs decision` and ask Abdul, Ask (choice) per value: the 2-3 nearest tokens (closest first, deltaE or px difference in the description) / "Keep the raw value"; another token or a new one is typed in Other.
- **Alpha colors** (raw color with opacity < 100%, from the hex alpha or the fill/layer opacity; the single source of this rule, Main Skills point here): find the real background under the layer, flatten `result = color*alpha + bg*(1-alpha)`, and match the result to the nearest opaque Semantic token by OKLCH deltaE. Repeat against the background in the other mode (Light and Dark). Same token in both modes with deltaE < 2 -> bind it (opaque); otherwise `needs decision`. Helper: `python tools/flatten_alpha.py <folder> --color "#RRGGBBAA" --bg <bg token>`. **Exceptions stay transparent:** scrims and overlays over content, elements over images, hover/pressed state layers; bind them to an existing alpha token, or propose a new one (e.g. `overlay/scrim`) only with Abdul's approval.

### Step 5 - Fix the screens (after the report is approved)
1. Abdul approves the report (and any new tokens from step 4). Add approved tokens to the DS file first, publish (section 7c), and have Abdul run **Accept updates** in the Design file before binding.
2. Fix **screen by screen**: bind raw values to variables and styles, replace misused variables, swap detached copies and hand-drawn parts for library instances, add Auto Layout, rename default layers. Missing components are built in the DS file first (by tier, section 7e step 2), never in the Design file.
3. On any ambiguous case not decided in the report, stop and ask Abdul before changing it (Ask (choice) with the candidate fixes, the closest first).
4. **Keep the existing screen sizes** (section 7d Brownfield exception).
5. Re-run the Design file audit after each screen and report the before / after numbers.

### Step 6 - Log, publish, update every Design file
Append the `CHANGELOG.md` entry (Variable Map, DS fixes, tokens added, screens fixed, audit numbers, `Storybook synced: no`), run `tools/project_status.py`, make sure the last DS change is published (section 7c), and list every linked Design file that still needs **Accept updates**; Ask (multi): "Which files have you updated?" one option per file; mark each ticked one. Then Ask (choice) about the Storybook update: "Update Storybook now" / "Later".

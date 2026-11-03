# Scenario D: Code to Design

Part of `Design_System_Intake_Skill` (sections keep their original numbers, so "section 7c" etc. still resolve; the map is in `SKILL.md` section 0c). Load when 2.1 = "Code to Design". Also load figma-files.md and screens.md; branch b also loads fix-on-create.md at its last foundation step. Every `Ask (choice)` / `Ask (multi)` here also gets a "Back" option (`SKILL.md` section 0, Back on every menu).

## 6. Step 5 - Scenario D: Code to Design (coded app -> Figma screens)

The source is a **coded app** (a GitHub repo or a local path, for example a React + Tailwind app made with an AI app builder or by hand). The goal is Figma screens and popups that match the app and are built from a design system, so designers and developers work from Figma instead of the code. (Formerly Brownfield type 2, now branch b.)

### 6.0 Which branch (question 2.5)

Ask (choice): "Which design system should the screens use?" "An existing DS" (description: a shared DS library already exists; only missing components are added to it) / "Build a new DS from the code" (description: tokens come from the code's Tailwind config, CSS variables and theme files). Put first the answer the user's message points to; nothing is marked recommended.
- An existing DS -> 6a. Build a new DS -> 6b. Record `code_to_design: existing-ds | new-ds` in `status.json` and `Project_Brief.md > Path`.

### Shared for both branches: read the code first

1. Ask, typed: "Please share the GitHub repository link (and branch) or the local path of the app." Optional, typed in the same message: a live preview link of the app. Record them in `status.json > source_code` (`repo`, `branch`, `path`, `preview_url`).
2. **Read the code (read only, never run installs without a yes):**
   - Tokens: `tailwind.config.*` (theme, extend), CSS variables (`globals.css`, `index.css`, shadcn `:root` / `.dark`), theme files (`theme.ts`, `colors.ts`, SCSS variables). Mobile code: iOS `Assets.xcassets` and Color / Font extensions, Android `colors.xml`, `themes.xml`, `Theme.kt` / `Color.kt` / `Type.kt`, Flutter `ThemeData`.
   - Screens: every route / page = one screen; every Dialog, Sheet, Drawer, Popover, Toast and Dropdown = a popup with the screen that opens it.
   - Per screen and popup: sections top to bottom, every state the code renders (loading, empty, error, disabled, hover, selected, validation), exact texts, icons (by library and name, e.g. Lucide), item counts, responsive breakpoints.
   - Components used (shared UI folder, e.g. `components/ui/`) and where each is used.
   Save `[Project folder]\Inputs\Code_Inventory.md` (screens, popups, states, components, grouped by module) and `Inputs\Extracted_Tokens.md` (every token with its source file and line).
   Then confirm the intake answers it holds (0.3c): post the color modes, RTL and fonts found in the code (`:root` / `.dark` or a theme switch, `dir="rtl"` or Arabic strings, the font setup), then Ask (choice): "Use these (Recommended)" / "Change something". Record them in `Project_Brief.md` with their source.
3. The code is the source of truth for structure, texts and states. A live preview or captures of it are the **visual reference** only, never the frames: screens are always rebuilt from DS instances (section 7f). If the code has no tokens, ask for screenshots of the live app and extract from them (Brownfield type 1, section 5 step 2).

**Preview recovery:** a failed remote browser session does not block reading the source, mapping tokens or inspecting the library. Use the fetched source locally for visual references when the user authorizes dependency installation; use the repository's actual package manager and lockfile (npm ci needs an npm lockfile, not bun.lock). Confirm React/native hydration and completed chart animation before capture; exported table row counts and non-empty chart geometry provide evidence that the source is fully rendered. Do not ask the user to repeatedly repair a remote browser when the authorized local source can provide the same reference. Required spec/gap approvals and fidelity comparisons still apply.

### 6a. Branch a: existing DS (only missing components go into the DS)

The DS is an existing library, usually shared with other products and other designers. The screens go in a **Design file** linked to that library.

1. **Links**, typed in one message: "Please share the Figma link of the design system, the link of the Design file for this app's screens, and, if you have one, the link of another file that uses this DS well (optional, helps me read how it is used)." Register them in `status.json > figma` (section 7c): `design_system` with `shared: true`, the Design file in `design_files` (role `screens`), the optional file as role `reference` (read only).
2. **Editable page (question 2.6).** Read the DS file's page names (read only). Ask (choice): "Which DS page may I add the new components to?" up to 3 likely pages (a page named after this product first); a new page name is typed in Other (then ask the user to create it, or create only that empty page after a yes). Save it in `status.json > figma.design_system.editable_pages`. **Every other DS page is read only.**
3. **Shared-DS safety rules (all of 6a):**
   - Never change anything that already exists in the DS: no edits to its variables, values, aliases, scopes, modes, styles, components, descriptions or pages. Fix on create (section 7b) and Scenario C step 2 do **not** run on this file.
   - Writes go only to the editable page(s). Before every write: the file check (section 7c step 3), then confirm in the script that `figma.currentPage.name` is in `editable_pages`; otherwise write nothing.
   - DS problems found (wrong scopes, contrast, naming, missing states) go to `[Project folder]\audits\<date>-ds-issues.md` for the DS owner, never fixed.
   - A missing token is proposed (name, value, the Primitive it aliases, why no existing token fits) and added only after the user approves it (Ask (multi), one option per token), in a clearly named group for this product.
   - Publishing reaches every file that uses the library. Before each publish, say which components and tokens it adds, then Ask (choice): "Publish now" / "Not yet".
4. **Study the DS (read only).** Setup / foundation first, then the component groups; screenshots of every variant in each mode (in ds-auditor, section 0c). Variable Map as in Scenario C step 1 (`steps/brownfield-3-scenario-c.md`), saved in `audits/`. Write the DS's Foundation_Skill, Component_Skills and `data/*.json` in the project folder so later sessions read files, not Figma. If a reference file was given, read it to see how the DS is really used; it settles low-confidence variables before asking the user.
5. **Token map, code -> DS.** Every value in `Extracted_Tokens.md` maps to the nearest DS variable (OKLCH deltaE for colors, px for sizes) with the Scenario C step 4 rules (near-miss -> nearest token, repeated new value -> proposed token per item 3, one-off -> nearest scale step, unsure -> `needs decision`) and the alpha rule (`tools/flatten_alpha.py`). Save it in `audits/<date>-token-map.md`. Ask (choice): "Approve the token map?" "Approve (Recommended)" / "Request changes".
6. **Gap table + screen specs** for the whole app (sections 7e and 7f): every section of every screen and popup is an existing DS component (reused, with the variant and properties to set) or `missing` (tier + atomic map). Reuse first: a DS component with a close variant is used and its difference noted, not rebuilt. Specs come from `Code_Inventory.md`. Approved together before any build (Ask (choice): "Approve (Recommended)" / "Request changes").
7. **Build missing components** on the editable page only, lowest tier first, from existing DS variables, styles and atoms (nested as instances), each with its description (Purpose, Usage Rules, Accessibility), Component_Skill + registry entry and an audit (ds-auditor). Then ask to publish (item 3) and, after the user runs Accept updates in the Design file, verify the new components appear there (section 7c).
8. **Build screens and popups one by one** in the Design file from library instances and variables only, section by section, at the sizes of screens already in the file (else Mobile 375 x 812 / Desktop 1440 x 1024, height at least 900, section 7d), with Impeccable `shape` before and `critique` + `polish` after each screen (section 7e); every text, state and icon from the spec; side-by-side with the app preview (or its captures), the measured fidelity check against the running app (section 7f step 4b, Open differences 0) and a Design file audit after each screen (section 7d, ds-auditor screens mode). Popups sit next to the screen that opens them, over a scrim from the DS.
9. **Handoff:** `CHANGELOG.md` entry, the DS issues report, the list of components added to the DS, then offer figma-code-connect, Ask (choice): "Map to code now" / "Later".

**Respect the user's manual edits (6a and 6b).** People may edit the Design file or the editable page between sessions.
- Before the first write of each session, compare the target page with the last state Claude left (FigCli `snapshot` + `check` baseline, Figma version history, or the last `CHANGELOG.md` entry). List what changed since Claude's last write in one line.
- A node a person changed is theirs: never overwrite, rebuild, rename, re-bind or delete it to match the code or the spec. Build around it, and update the screen spec to match the edit.
- When a planned change would touch an edited node, Ask (choice): "Keep their edit (Recommended)" / "Apply my change" (description: say exactly what changes).
- Log it in the changelog (`Manual edits kept: <screens / components>`) and regenerate the FigCli baseline after the session.

**Audit after (6a).** After each component and each screen: ds-auditor (screens mode for screens). The final audit also confirms that nothing outside the editable page(s) changed in the DS file (variables, styles, components and pages compared with the start of the session) and reports that count; it must be 0.

### 6b. Branch b: new DS built from the code

No DS exists. The DS is built from the code's own tokens, then the screens are built from it.

1. **Merge summary.** From `Extracted_Tokens.md`, show near-duplicate values (colors within deltaE 2, sizes 1px apart) and the proposed merges, then Ask (choice), as Brownfield type 1 step 3: "Approve the merges (Recommended)" / "Keep every value".
2. **Files.** Ask, typed: "Please create two Figma design files in the same Figma project folder: '<Project>' (screens) and '<Project> Design System' (library). Send me both links." Register both in `status.json > figma` (section 7c).
3. **Build the full DS** per the platform Main Skill and the build order: Primitives (raw values from the code), Semantic variables aliasing them (the code's Light / Dark, e.g. shadcn `:root` and `.dark`), Spacing / Radius / Typography variables, text and effect styles, icons (the code's icon library, e.g. Lucide for Web), then the components the code uses: Atoms, Molecules, Organisms, Patterns, with every state the code renders. Keep the code's token and component names where they are sensible, and record the code -> Figma name mapping in `data/tokens.json` and `data/component-registry.json` for Code Connect. Fix on create (section 7b) runs at the last foundation step. Checkpoints 1 and 2 (section 8).
4. Ask the user to publish the library and enable it in '<Project>', then Ask (choice): "Done" / "Not yet".
5. **Build the screens** in '<Project>', **one page per module** (e.g. `Auth`, `Dashboard`, `Settings`), from the screen specs, one by one, assembled only from DS instances and variables, popups next to their screen; side-by-side, the measured fidelity check (section 7f step 4b) and a Design file audit after each (sections 7d-7f). The manual-edits rule above applies from the second session on. Checkpoint 3.
6. Offer figma-code-connect, Ask (choice): "Map to code now" / "Later".

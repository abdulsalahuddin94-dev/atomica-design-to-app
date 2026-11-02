---
name: storybook-design-system
description: Generates a living Storybook for a finished Figma design system (Web, iOS or Android) so developers can browse every component, try its variants and properties with controls, read its use cases and jump back to Figma. Tokens come from the Figma variables, one story file per component set, controls mirror Figma properties with exactly the same names, and the Storybook MCP addon lets AI agents query it. Documentation only, not production code. Load after the Components checkpoint is approved (or for any existing DS folder with data/ files).
---

# Storybook Design System (Main Skill)

Root: the folder that contains `CLAUDE.md`. All paths are relative to it.
Toolkit: **Claude -> MCP -> Figma + Storybook + GitHub.** Figma is the source of truth; Storybook is the live, browsable documentation that developers and AI agents read; GitHub hosts it when the user asks.
Questions: every `Ask (choice)` / `Ask (multi)` in this skill is an AskUserQuestion menu that also gets a "Back" option to the previous question or step (Intake section 0, Back on every menu).

---

## 0. Opt-in and sections (Abdul, 2026-11-02)

Storybook is optional and off by default for every project. It runs only when `status.json > storybook.enabled` is `true` (intake 0.7, the dashboard's project Storybook page, or the user asks), for Code first and Figma first projects alike.
1. **Read the plan first:** `node tools/storybook_sections.cjs "My Projects/<Project>"` prints `build` (the checked sections), `components` and `componentDetail` (what each component page shows) and `skip`. Not enabled -> build nothing and say how to turn it on.
2. **Build only the checked sections.** A skipped section has no story, no docs page, no file to download and no sidebar entry (e.g. Tokens only = Colors, Typography, Spacing, CSS variables, Light/Dark). Component pages show only the checked details (Variants and states, Playground, Show code, Usage, Accessibility, Figma link); `components` limits which components get a page.
3. **Code first:** tokens come from the code (Tailwind config, CSS variables, theme files) and the stories import the real components of the linked repo or the prototype with their props; Show code prints the real usage, never a copy of the component. **Figma first:** tokens from `data/tokens.json`, components from the registry and the DS file (sections 2-4).
4. **Publishing stays opt-in:** "Public link" (GitHub Pages), "Storybook MCP" and "Auto-update" are built only when checked, and a public link still needs the user's yes at that moment. With the one-repo layout (`status.json > github.pages = "project-repo"`) the public link is `/<repo>/storybook/` of the project's own repo, next to the prototype: `node tools/publish_storybook.cjs "My Projects/<Project>"` (the dashboard's Publish Storybook button), never a second repo.
5. Changing the checklist later rebuilds only what changed: add the new sections, remove the unchecked ones (files and navigation). The quality bar below applies to every section that is built.

---

## 1. Principles (non-negotiable)

1. **Documentation, not production code.** Components are faithful visual replicas for browsing and trying. No business logic, no data fetching, no app routing.
2. **Names match Figma exactly.** Story titles, component names, variant names and values, property names, and token names are copied from Figma character for character (case, spaces, slashes). Never rename to "clean" code style. Where code cannot hold a character (CSS variable names), the mapping is mechanical and shown next to the Figma name in the docs.
3. **Tokens only.** Every color, space, radius, font value and shadow in a component comes from the generated token CSS. Zero raw hex or px in component styles.
4. **One platform per Storybook.** Web, iOS and Android each get their own Storybook inside their own folder. Nothing shared or merged.
5. **Default stack for every platform: React + Vite + TypeScript + Storybook (latest).** Mobile components are React components styled to look like their iOS / Android counterparts, shown inside a device frame.
6. **Never install without asking.** Show the exact packages and commands, then Ask (choice) (AskUserQuestion, Intake section 0): "Yes, install" / "Not now", before `npm create`, `npm install` or `npx storybook add`.
7. **iOS and Android projects get a web Storybook (for now).** Every new iOS or Android design system gets its own Storybook rendered as web: React + CSS components styled to look like the native iOS (HIG) or Android (Material 3) components, in a device frame, built from that platform's own tokens. Same setup and quality bar as Web. This is the interim choice until a native Storybook (SwiftUI / Compose) is decided; it applies to future projects, not to the custom-built reference folders.
8. **Quality bar for every new Storybook.**
   - Components really work, not just look right: typing, checking, toggling, opening, closing, selecting and dismissing all behave.
   - The left sidebar navigates Foundations and every component group, in the same order as the Figma ⭐ groups.
   - Each component page shows its Figma component description and its use cases (when to use, when not to).
   - Every property in Figma's right panel (variants, booleans, text, instance swaps) is a control with the same name and the Figma default.
   - Every variant and state can be seen in each mode the project has (Light and Dark, or its single mode; an "All variants" story plus one story per state).
   - The component description is always written during the build: in Figma (the component's description / Component documentation) and in Storybook, with the same text.
9. **Docs pages for every new Storybook (Abdul, 2026-10-05).** Generated by `tools/storybook_docs.py`, same structure for every design system and platform:
   - **Welcome** (the first page that opens): DS name and one-line summary, the product overview, version / updated / platform / font / modes pills, stat cards (tokens, components, variants, rules, text styles, icons), "Start here" cards (Foundations, then each tier), live samples of real components, what is inside each group, and how to read the Storybook.
   - **Foundations** shown visually, live from the tokens: Colors (brand anchors as large cards, one row per semantic role: Brand, Accent, Success, Error, Warning, Info, with subtle and solid fills, the on-solid text sample, text, border and icon colors; neutral surfaces, text, borders and icons as cards; Primitive ramps as continuous strips; mode tabs; the full variable table folded below), Typography (a Headline scale and a Body scale card, one row per size with class and px on the right, then every text style rendered at its real size with style name, class and the measured px size / line height, updating with the mode toolbar), Sizing (spacing, radius and other dimensions per mode), Effects (effect styles + opacity) and Icons (searchable gallery).
   - **Platform names (Abdul, 2026-10-05).** An iOS or Android Storybook is rendered with React + CSS, but developers never see CSS names: every token, text style and component property is shown with the name they type, derived from the Figma name by `tools/platform_names.py` (Figma name always next to it). iOS: SwiftUI (`Color.textPrimary`, `Spacing.md`, `.font(.body)`, UIKit asset name). Android: Jetpack Compose (`MaterialTheme.colorScheme.onSurface` / `md.sys.color.on-surface` for M3 roles, `AppTheme.colors.textPrimary` / `@color/text_primary` otherwise, `MaterialTheme.typography.bodyLarge`, `MaterialTheme.shapes.medium`). Web keeps CSS variables and classes. `tools/tokens_to_css.py` also writes `DesignTokens.swift` / `DesignTokens.kt` (Light/Dark values, M3 color schemes, shapes, type), offered on **Foundations › Code** with download, copy and a Figma → code table. Component pages add an "In SwiftUI / In Jetpack Compose" table (suggested parameter names and enum values) and hide the React source. When a variable has Figma **Code syntax** for the platform (`data/tokens.json > code_syntax`, kept by `tools/build_tokens.py`), that is the name shown; the derived name follows as the DesignTokens file name.
   - **Mobile Adaptive (Abdul, 2026-10-05).** A project with `status.json > mobile_setup: mobile-adaptive` (iOS + Android in one Figma file, OS collection iOS / Android) gets ONE Storybook with a **Platform** switch in the toolbar that mirrors the Figma OS mode, next to Color and Language switches (every collection with more than one mode is a toolbar, exact Figma names). The switch changes the components (anatomy and values from the OS mode, platform-only parts from `Platform/Is iOS|Is Android`) and every docs page: each token and text style shows the selected platform's code name and resolved value (`Font Size/Body`: `.font(.body)` 17 on iOS, `MaterialTheme.typography.bodyLarge` 16 on Android), Sizing shows the value on the selected platform, component pages show a per-platform code table, and **Foundations › Code** shows `DesignTokens.swift` on iOS and `DesignTokens.kt` on Android (both files are generated). **One platform at a time (Abdul, 2026-10-05):** a page never shows iOS and Android together (no side-by-side panels, no two-platform columns or tabs); the user switches Platform to see the difference. Language AR sets `dir="rtl"` (from `Direction/Is RTL`) and the Arabic font. **Translated docs (Abdul, 2026-10-05):** a Language mode other than the default (AR) shows the docs in that language from `src/i18n/<mode>.json` (created empty by `tools/storybook_docs.py`, filled from the `untranslated` list of `mode_check.js`; a value equal to its key keeps the text on purpose). Figma names, code names and component texts are never translated. Past mistakes and their checks: `memory/lessons.md`. Details: section 6b.
   - **One Docs page per component**, modeled on a mature public DS component page: Overview + use cases, When to use / Do not use, Anatomy (numbered parts), Variants (each value rendered with its meaning), Sizes, States (variant x state grid in every Semantic mode side by side, Light and Dark), Icons (start / end / both rendered per size, plus the swap slots), Right to left (mirrored examples, only when the brief says Arabic / RTL), Do and don't pairs, Content, Accessibility, Properties (Figma names and defaults), Playground with controls, and the Figma description. Stories under it: Playground, one per main variant, States, Sizes, Icons, All variants, In use.

---

## 2. Inputs

What to update: the project's `CHANGELOG.md` entries marked `Storybook synced: no` (list them with `python tools/project_status.py`), plus any manual Figma edits the session-start Figma edit check reported (`node tools/figma_versions.cjs` lists DS files with history versions newer than `status.json > figma.design_system.storybook_synced_version`; they may have no changelog entry, so compare the re-exported `data/` with the last sync). After the update is verified, run `python tools/project_status.py "<platform folder>" --mark-synced` (it also records the DS file's latest Figma version as synced).

From the platform folder (`My Projects/<Project>/`, `<Project>_iOS/`, `<Project>_Android/`, or a reference folder from `references.json`):
- `data/tokens.json`: every variable with its Figma name (`<Collection>::<name>`), per-mode values and aliases.
- `data/component-registry.json`: components with group, page, tier, variants, properties, use, nests; text and effect styles; icons.
- `data/rules.json`: contrast, touch targets, focus, disabled opacity.
- `Component_Skills/*/references/components.md` and `screens/`: exact use cases and Light/Dark screenshots for visual matching.
- The Figma file link (from `Project_Brief.md` or `References.md`).

If `data/` says `needs_resync: true` and the Figma file is open in the Desktop Bridge, run the **token-extractor** subagent first so the Storybook is built from live names.

---

## 3. Output layout

Reference build: the default Web reference's Storybook (`references.json`, today `Reference_Library/Library/Web/storybook/`, 28 component sets, 2026-09-30). Copy its structure.

```
<platform folder>/storybook/
├─ package.json, tsconfig.json, README.md
├─ component-map.json           (Figma component name -> React export; by hand)
├─ figma-links.json             (Figma file + node ids for "Open in Figma"; export with figma_execute, original file only)
├─ .storybook/
│  ├─ main.ts                   (react-vite; addons: docs, a11y, designs, mcp; telemetry off)
│  ├─ preview.tsx               (imports tokens + styles; toolbars from src/docs/Modes.tsx: one per multi-mode Figma collection; template templates/preview.tsx)
│  ├─ preview-head.html         (web font)
│  └─ manager.ts                (brand title = Figma file name)
└─ src/
   ├─ tokens/tokens.css, tokens.ts   (generated: tools/tokens_to_css.py)
   ├─ styles/text-styles.css         (Figma text styles as classes: "sm/Semi Bold" -> .ts-sm-semi-bold)
   ├─ styles/effects.css             (Figma effect styles: --shadow-*, --focus-ring*)
   ├─ styles/components.css          (component styles, var(--...) only)
   ├─ lib/Icon.tsx                   (the file's icon set, color = currentColor)
   ├─ components/<Group>.tsx         (replicas grouped like the Figma ⭐ groups; props = Figma names)
   ├─ docs/DocBlocks.tsx, Modes.tsx, docs.css   (copied from Storybook_Design_System_Skill/templates/docs/ by tools/storybook_docs.py)
   ├─ docs/Welcome.mdx               (generated: first page)
   ├─ stories/<Group>/<Name>.stories.tsx  (generated: tools/storybook_stories.py)
   ├─ stories/<Group>/<Name>.mdx     (generated Docs page attached to the stories: tools/storybook_docs.py)
   └─ foundations/{Colors,Typography,Sizing,Effects,Icons}.mdx  (generated; live from tokens.ts and the text style CSS), plus App Icon.mdx when ➜ App Icon exists
public/app-icon/                    (App Icon PNG/SVG files exported from the ➜ App Icon size frames; only when the icon is presented)
```
Also in the Root: `.claude/launch.json` (preview entry). The Storybook MCP is registered per machine (local scope, step 8), never in a committed `.mcp.json`.

Optional `storybook/welcome.json` (hand-written, per project): `name`, `summary`, `product` (what the product is and does), `audience`, `version`, `stack` (extra pills), `samples` (component names for Live samples). Without it the product text comes from a `## Product` section in `Project_Brief.md`; ask the user for one line about the product at intake 0.7 when neither exists.

Story titles follow the Figma groups: `Foundations/Colors`, `Form Elements/Input / Text`, `Navigation/Button`, `Data Display/Badge`. Sidebar order (`preview.tsx > storySort`): Welcome, Foundations (Colors, Typography, Sizing, Effects, Icons), Form Elements, Navigation, Data Display, Patterns. Inside a group, order by tier (Atoms, Molecules, Organisms).

---

## 4. Build steps

1. **Checkpoint.** Confirm the Components checkpoint in Figma is approved (or, if it is not, Ask (choice): "Wait for the checkpoint (Recommended)" / "Build from the current state"). State the platform folder and Figma link.
2. **Ask to install.** Show: `npm create storybook@latest` (React + Vite + TS) in `<folder>/storybook/`, then `npx storybook add @storybook/addon-mcp` and `@storybook/addon-a11y`. Optional: `@storybook/addon-designs` (embeds the Figma frame in each story). Then Ask (choice): "Yes, install (Recommended)" / "Install without the optional addon" / "Not now".
3. **Tokens.** Run `python tools/tokens_to_css.py <folder>`: writes `src/tokens/tokens.css` and `tokens.ts` from `data/tokens.json`.
   - CSS name rule: take the Figma variable name, lowercase, replace `/` and spaces with `-`, drop other characters, prefix with `--` (e.g. `Semantic::color/text/primary` -> `--color-text-primary`). Collisions are reported, never silently merged.
   - Aliases stay aliases (`var(--gray-900)`), so the Primitive -> Semantic chain is visible.
   - Each mode becomes a selector: `[data-theme="Dark"]`, `[data-typography="Mobile"]`, using the exact Figma mode names.
4. **Welcome and Foundations docs.** `python tools/storybook_docs.py <folder>` copies the doc blocks and writes Welcome plus the Colors, Typography, Sizing, Effects and Icons pages, all rendered live from `tokens.ts` and the text style CSS (swatch, Figma name, CSS variable, value per mode; type at real size). Same rule as Figma: docs are linked to tokens, never static. On an older Storybook, `--replace` regenerates hand-written foundation pages and removes Introduction, Spacing, Radius and Shadows (their content moved to Welcome, Sizing and Effects).
   - **App Icon** (`Foundations/App Icon`, only in a Storybook the user chose to create; Intake section 7h-5): when `status.json > app_icon.status` is `presented`, export each size frame of ➜ App Icon with its own export setting into `storybook/public/app-icon/` (file names from `tools/app_icon_specs.json`), then render the same blocks as the Figma page: the platform's masks and contexts (CSS `border-radius` / `clip-path`, never edited images), the size ladder at real size, each appearance in each mode the project has, and the specs table with the code snippet (Xcode asset catalog, `ic_launcher.xml`, or the `<link>` tags and manifest entries). While it is `waiting`, the page shows the platform guidelines and says the icon is not in Figma yet. The ds-auditor drift mode checks that the exported files match the Figma frames' sizes.
5. **Components.** For each registry entry, tier by tier (Atoms first, so Molecules reuse them exactly like Figma nesting):
   - `argTypes` keys = Figma property and variant names exactly (`"Show optional"`, `"Leading icon"`, `State`, `Type`, `Size`). Variant options = Figma values exactly. Booleans -> boolean control, TEXT -> text control, INSTANCE_SWAP -> select of icon names.
   - Visuals match the Light and Dark screenshots in `references/screens/`. Use only token variables.
   - Interactive states (Hover on Web only, Focus, Pressed, Disabled) also work for real (CSS :hover/:focus-visible/:active), and the `State` control forces them for review. A mobile Storybook (Android, iOS, cross-platform, Mobile Adaptive) has no Hover state and no `:hover` rule: Pressed (`:active`) is the tap feedback (Abdul, 2026-10-28; `tools/check_no_hover.cjs`).
   - `parameters.design = { type: "figma", url: "<Figma link to the component set>" }` and an "Open in Figma" link at the top of the MDX.
   - Usage docs: each component gets a generated Docs page (principle 9). Content, first match wins: the registry entry's optional `docs` block (section 4b), then the Figma description (Purpose / Usage rules / Accessibility), `components.md` lines (`- Use:`, `- Do not use:`, `- Sizes:`, `- Content:`, `- Accessibility:`) and `rules.json` (touch target, contrast). Anatomy, variants, sizes, states and icon slots come from the Figma properties. Missing content shows as a missing section, never as invented text: fill the gap in the registry `docs` block (docs-writer) or the Figma description, then regenerate.
   - Read exact specs first with a read-only `figma_execute` walk (layout, padding, gap, radius, fills/strokes as variable names, text style names, effect styles) of each component set, then write the replica. Screenshots in `references/screens/` are the visual check.
   - Generate the stories: `python tools/storybook_stories.py <folder>` (Playground, one story per value of the main variant property, States and Sizes rows, an "All variants" grid, and an interactive "In use" example when `component-map.json` has one). When `src/docs/DocBlocks.tsx` exists it also writes each component's Docs page and turns autodocs off for those stories.

### 4b. Registry `docs` block (the one docs source per component)
Written once, while the component is built (before its Figma description), and the source for everything else: `python tools/component_docs.py <folder> figma` generates the Figma description (written by `tools/apply_descriptions.figma.js`), `... skills` refreshes the usage lines in `components.md`, and `storybook_docs.py` reads it first. `... check` lists components missing a required key (`overview`, `when_to_use`, `when_not_to_use`, `accessibility`, `keywords`; plus `anatomy` from Molecule up). For a DS documented before this block existed, docs-writer fills it from the Figma description and Component_Skills. Every key overrides the derived value:
```json
"docs": {
  "overview": "One sentence: what it is for.",
  "use_cases": ["Save a form", "Confirm a dialog"],
  "when_to_use": ["..."], "when_not_to_use": ["... (use <Other component>)"],
  "anatomy": [{ "part": "Container", "detail": "..." }, { "part": "Label", "detail": "..." }],
  "variants": [{ "value": "<Figma value>", "meaning": "..." }],
  "sizes": [{ "value": "sm", "meaning": "36px, dense tables" }],
  "states": [{ "value": "Disabled", "meaning": "..." }],
  "guidelines": [{ "do": "...", "dont": "...", "do_args": { "Type": "Filled" }, "dont_args": { "Type": "Danger" } }],
  "content": ["Sentence case", "Start with a verb", "At most 3 words"],
  "accessibility": [
    { "part": "Label", "criterion": "1.4.3", "requirement": "4.5:1", "states": ["Default", "Hover", "Pressed"], "detail": "Measure on the final fill." },
    "Touch target at least 44px"
  ],
  "keywords": ["button", "btn", "cta", "submit", "action"],
  "behavior": ["Enter and Space activate it", "Loading keeps its width and blocks a second press", "Focus ring on keyboard focus only"],
  "avoid": ["Two Primary buttons in one view", "An icon-only button without an accessible name"],
  "code": "components/ui/button.tsx",
  "props_map": { "Type": "variant", "Size": "size", "Label": "children", "Show Icon": "leadingIcon" }
}
```
`accessibility` items are a sentence or a row per part (WCAG criterion, required ratio, the states it is checked in); rows make the audit's contrast check per state explicit. `keywords` are the words people and agents search with (synonyms, abbreviations, the old name), so a search for "cta" or "btn" finds Button. `when_not_to_use` items name the component to use instead in brackets. `code` (only when a code counterpart exists) becomes the description's `Code:` line, followed by `props_map` (Figma property -> code prop). Optional, added 2026-10-11 from natdexterra's component-description template and the design-system-ops AI component description (both MIT): `behavior` (interaction, keyboard, state changes, motion) and `avoid` (the misuse agents and people get wrong) become the description's `Behavior:` and `Avoid:` lines, so an agent reading it over MCP knows how the component acts and what not to do; fill them for every interactive component. After the Storybook is generated, `tools/storybook_parity.py` checks that every Docs page shows these sections.
`do_args` / `dont_args` render the component with those Figma property values next to the guideline. Keep the wording brand-neutral; product-specific examples go in `use_cases`.
6b. **Mobile Adaptive (one Storybook, Platform switch).** For `mobile_setup: mobile-adaptive` (Intake `steps/mobile-adaptive.md`):
   - `data/tokens.json > meta.platform` and the registry's `meta.platform` are `Mobile Adaptive`; collections carry roles (`primitive`, `semantic` = Color, `language`, `os`, `component`) and Figma's default mode. Export the variables with their Code syntax (token-extractor, or a read-only FigCli eval) so `code_syntax` is filled.
   - `tools/tokens_to_css.py` writes `tokens.css` (one selector per mode, plus `[data-mode-scope]` so Component Specific aliases re-resolve inside any panel), `tokens.ts` (`platforms`, `os_collection`, per token `codes: { ios, android }`), both `DesignTokens.swift` and `DesignTokens.kt` (values resolved per OS mode; the app tokens named in the Code syntax, e.g. `Spacing.screenMargin`, are declared so that code compiles), and `styles/text-styles.css` / `effects.css` from the styles' bound variables.
   - `preview.tsx`: copy `templates/preview.tsx` (decorator `withModes`, `globalTypes: modeGlobalTypes`, `docs.container: ModesDocsContainer`); fonts in `preview-head.html` (Roboto, the Arabic font of the Language mode).
   - Components: one React component per Figma component, no Platform prop. Read OS values from CSS variables; show platform-only parts with `isTrue(useToken('Platform/Is iOS'))`; pick a private platform anatomy from `useToken('Platform/Name')` (the Figma wrapper binding); RTL comes from `dir`, never from duplicate rows. Icons render the SF Symbol or Material Symbol glyph by platform (paths exported from the Figma icon layers) and the RTL glyph when `Direction/Is RTL`.
   - Verify: switch Platform, Color and Language in the toolbar on Typography, Sizing, Code and a component page; values and names change without reload; no console errors; parity 0.
6. **Mobile (iOS / Android), rendered as web.** Same React + CSS setup as Web (principle 7). Wrap stories in `DeviceFrame` (iOS 393x852, Android 412x915 by default) with the platform's system font stack, safe areas and status bar. `DeviceFrame` marks its content area (where the story renders) with `data-figma-root`, so the style check measures the component, not the frame. iOS: HIG semantic names and Dynamic Type sizes from tokens. Android: md.sys tokens and M3 elevation from tokens.
7. **Verify.**
   - `npm run build-storybook` passes with no errors.
   - Parity check: every registry component has a story file; every Figma variant and property appears in `argTypes` with the identical name (`python tools/storybook_parity.py <folder>`; report any mismatch). The same tool checks docs completeness: every component Docs page needs Overview, Use cases, When to use, Do not use, Do and don't (with rendered examples), Accessibility and the Figma description, on every platform; fill a gap in the registry `docs` block (section 4b), never in the generated .mdx.
   - **Style check, numbers not eyes (Abdul, 2026-10-11, idea from storysync).** The name check proves the names match; this proves the values do. Run `tools/figma_styles.figma.js` on the DS file (FigCli Yolo eval or `figma_execute`, read-only) and save its result as `data/figma-styles.json`: every variant's fill, stroke, radius, padding, gap, size, opacity and first text's color, font, size, weight and line height, resolved for each Light / Dark mode. Then `node tools/storybook_snap.cjs "<folder>"` (Storybook running) opens each variant's story with those args and mode and writes what it really renders to `data/storybook-styles.json`, and `python tools/style_parity.py "<folder>"` prints `Fidelity: 97.5% (390/400 properties)` and every difference (`~ Button > Type=Primary, State=Hover [Dark]  fill: Figma #1E7A3AFF, Storybook #299B48FF`). Fix the Storybook component or token until it reports 0 differences and 0 unmeasured; a difference that cannot be matched in CSS (Figma text metrics, an effect) is listed in the Storybook README with the reason. `storybook_snap.cjs` needs Playwright in the Storybook folder: it prints the install command when missing; Ask (choice) "Install Playwright (Recommended)" / "Skip the style check" / "Back" before running it. A component whose root the tool picks wrong gets `data-figma-component` on its root element (or `--selector`).
   - Visual check: then look at the stories of the changed components in Light and Dark next to the Figma screenshots (layout and composition, which numbers cannot judge).
   - a11y addon: no contrast or role violations.
   - **Every mode, every page (Abdul, 2026-10-05: Dark and Arabic were broken in the first pilot build).** Open each docs page with every combination of the toolbar modes (`iframe.html?id=<id>&viewMode=docs&globals=<key>:<mode>;...`, e.g. iOS/Android x Light/Dark x EN/AR) and run `Storybook_Design_System_Skill/templates/mode_check.js` on it (Playwright `evaluate`, or paste in the console). `unreadableCount` (text below 3:1 against its real background, Storybook's own tables included) and `ltrInRtl` must be 0, `bothPlatforms` false and `untranslated` empty everywhere; then look at a Dark and an AR screenshot. Never report a Storybook as done with a mode that was not checked.
   - Dark and RTL rules the doc blocks already follow, keep them when editing the templates: every docs color comes from `--dsd-*` (mixed from text + background when the DS has no token for the role), MDX prose and Storybook ArgTypes tables take the DS colors, an RTL Language mode makes docs pages and examples right to left (code names, hex values and Figma names stay isolated LTR) and type samples switch to Arabic text.
8. **MCP.** With Storybook running, the addon serves an MCP endpoint at `http://localhost:<port>/mcp`. Ask before registering it (Ask (choice): "Register it on this machine (Recommended)" / "Not now"): `claude mcp add --transport http <project>-<platform>-storybook http://localhost:<port>/mcp --scope local` (e.g. `acme-web-storybook`, port 6007). Local scope stays on this machine and out of git, so people who clone the repo are never prompted to enable it. Never use `--scope project` and never commit a root `.mcp.json` (it is git-ignored; `.mcp.example.json` is the template). Record the server name and port in `Project_Brief.md`. After that, agents can list components, read their docs and props, and preview stories before building UI.
9. **GitHub (only when asked).** A team project (`status.json > collaboration = team`) already has its repo: publish from it, never a second repo (`Design_System_Intake_Skill/steps/team.md` 15.1). Push the Storybook with the repo and publish the static build (`storybook-static/`) with GitHub Pages or Chromatic. Never create a remote or push without the user's word. Ask (choice) first: "Public repo with GitHub Pages (Recommended: a link developers open, free)" / "Private repo with Chromatic (private link, needs the user's Chromatic token)" / "Private repo only (developers run it locally)". GitHub Pages steps (2026-10-05):
   - Copy `Storybook_Design_System_Skill/templates/storybook-pages.yml` and `templates/storybook-check.yml` (name check, build and style check on every push, 2026-10-11) to the project's `.github/workflows/`, commit `data/figma-styles.json`, add a `.gitignore` (`node_modules/`, `storybook/storybook-static/`), and scan the repo for secrets before a public push.
   - `gh repo create <owner>/<project>-design-system --public --source . --remote origin --push`, then `gh api -X POST repos/<owner>/<repo>/pages -f build_type=workflow`.
   - If the deploy job says the branch "is not allowed to deploy to github-pages", allow it: `gh api -X POST repos/<owner>/<repo>/environments/github-pages/deployment-branch-policies -f name=master -f type=branch`, then rerun the failed job.
   - Open the live link, check Welcome and one component page, and record the repo and link in `Project_Brief.md` (0.7).
10. **Record.** Add the Storybook path, run command and MCP status to `Project_Brief.md` and the Foundation_Skill; the ds-auditor drift mode then also checks Storybook names against Figma.

---

## 5. Keeping it in sync

- Figma changes -> token-extractor re-exports `data/` -> rerun `tools/tokens_to_css.py` -> parity check lists stories to update.

### "Update from Figma" procedure
Tell the user up front which file to open: "Please open '<DS file name>' in Figma Desktop and run the Desktop Bridge plugin in it.", then Ask (choice): "Done, plugin running" / "Not yet". The file is the project's `status.json > figma.design_system` (Web Library: the key in `memory/references.md`). Then:
1. **Confirm the source file:** `figma_get_status` / `figma_list_open_files`; the connected file key must match. If several files are connected, pin it with `figma_navigate` (`lock: true`). An original reference template may be read freely; writing to it is guarded by `guard_figma.cjs` and never needed here.
2. **Tokens:** run the token-extractor agent (writes `data/source/` and `data/tokens.json`; fallback export: `tools/export_variables.figma.js`).
3. `python tools/tokens_to_css.py "<folder>"` (regenerates `storybook/src/tokens/*`).
4. `python tools/storybook_docs.py "<folder>"` (Welcome, Foundations, doc blocks), then `python tools/storybook_stories.py "<folder>"` (stories and component Docs pages from `data/component-registry.json`; refresh the registry with docs-writer first if components changed). When ➜ App Icon changed, re-export `public/app-icon/` as in section 4 step 4.
5. `python tools/storybook_parity.py "<folder>"` (names must match Figma exactly; fix every mismatch).
6. `npm --prefix "<folder>/storybook" run build-storybook`, then the style check (section 4 step 7: `tools/figma_styles.figma.js` -> `data/figma-styles.json`, `node tools/storybook_snap.cjs`, `python tools/style_parity.py`, 0 differences) and a visual check of the changed components in each mode against the Figma screenshots.
7. `python tools/project_status.py "<folder>" --mark-synced` (marks the changelog and records the DS file's latest Figma version, so the next session's Figma edit check starts from here).
8. If the project is published (`status.json > storybook_publish` = `pages` or `chromatic`): commit and push the project repo so the same link redeploys, wait for the deploy, and tell the user in one line that the link is updated.
- Never edit `src/tokens/*` by hand; they are generated.
- A rename in Figma is a rename in Storybook (same day), because names must match.

---

## 6. Related tools

- figma-console `figma_ds_*` tools (`figma_ds_analyze`, `figma_ds_scaffold`, `figma_ds_setup_storybook`, `figma_ds_verify`) go the other way: they extract a design system from an existing **code** app into a Storybook workshop. Use them for Code to Design with a new DS (Scenario D branch b), not for Figma-first systems.
- Storybook MCP docs: https://storybook.js.org/docs/ai/mcp/overview

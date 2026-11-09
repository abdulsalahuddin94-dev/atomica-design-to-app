---
name: android-design-system-builder
description: Main skill for building a new Android design system in Figma from scratch (Scenario A), from existing Android UI (Scenario B) or for an AI-ready refactor (Scenario C), or for Code to Design from a coded app into an existing or a new DS (Scenario D). Defines the file structure, build order, Material Design 3 token architecture (tonal palettes, md.sys.color schemes, state layers, md.sys.typescale, md.sys.shape, elevation levels, window size classes), Material Symbols icon rules, required components and states, and the mistakes to avoid - learned from studying the default Android reference design system (`references.json`). Independent from the Web and iOS skills. Load with figma-use and figma-generate-library before creating anything; save the project's skills under [Root]\My Projects\[Project]_Android\.
---

# Android Design System Builder (Main Skill)

Reference implementation studied: the platform's default entry in `references.json` (`default.android`; its folder, Figma link and name are there; human list in `References.md`). Other companies' Android systems can be added as entries; when the project picked one (`status.json > reference`), use that entry's folder instead. Today the default is the only Android entry, and section 9 below was learned from it.
It is the Google Material 3 (Expressive) Design Kit re-themed with the company's own palettes. Copy its **structure, M3 component coverage and property conventions**. Do **not** copy its mistakes (section 9).
Platform: Android, Material Design 3 Expressive, Jetpack Compose, dp / sp.
Node IDs quoted in a reference entry's skills are valid in that entry's original file only. In a duplicated template or any other file, find pages, component sets, styles and variables by **name**.

**Questions.** Every question with options in this skill (component scope, approvals, publish and Accept updates confirmations, recolor or token proposals) is an AskUserQuestion choice (`Ask (choice)` / `Ask (multi)`, Intake section 0); typed answers go in its Other field. Every menu also gets a "Back" option to the previous question or step (Intake section 0, Back on every menu).

**Tools and generic skills (figma-console).** The Figma tool (Desktop Bridge or FigCli) is picked in Intake section 0b (`status.json > figma.tool`), which also says when to suggest the other one. Work runs through figma-console `figma_execute` (plain Plugin API) when the official `use_figma` server is not connected. figma-use and figma-generate-library are still loaded for their rules, but their helper APIs (`figma.createAutoLayout`, `node.set`, `node.query`) do not exist in figma-console and fail with "not a function": use `figma.createFrame()` + `layoutMode`, `appendChild`, `setBoundVariable` directly. Call `resize()` before setting auto layout sizing to AUTO/HUG (resize resets it to FIXED), and re-apply `componentPropertyReferences` after cloning a variant. The reference page layout (section 1) and the intake checkpoints (Design_System_Intake_Skill section 8) override figma-generate-library's page skeleton and its per-phase checklist posts.

**Knowledge base (JSON, source of truth for exact values):** every DS folder has `data/tokens.json` (variables per mode, aliases, shade-scale curves, recolor readiness), `data/component-registry.json` (components, variants, properties, tiers), `data/rules.json` (numeric rules: contrast, touch targets, icon sizes, spacing, recolor) and `data/screen-templates.json` (Login, Sign up, OTP, List, Detail, Form, Settings, Empty state), plus `docs/decisions.md`. Read values from these files instead of copying numbers into skills; the reference versions are in the default Android entry's `data/` (`references.json`, today `Reference_Library/Library/Android/data/`). Tools: `tools/build_tokens.py`, `tools/recolor.py` (see `tools/README.md`).

---

## 0. Both + Native projects (Abdul, 2026-09-30)

When intake 1.3 answers **Native** for Both, this skill builds only the Android half: `<Project> Android Design System` in `My Projects/<Project>_Android/`, with `md.sys.color` roles, the M3 type scale, state layers, elevation levels, Material Symbols and dp/sp units. The iOS half is a separate system built with `iOS_Design_System_Skill` in `<Project>_iOS/`; never reuse its names, files or components.
- Optional Brand Foundation (`<Project> Brand Foundation`, Primitives only): copy its Primitives into this file's local tonal palettes / Primitives collection (same values), never enable it as a library. A brand change goes into the Brand Foundation first, then `tools/recolor.py` on this folder.
- The Android Design file (`<Project> Android`) enables only the Android DS library. The file check rejects the iOS library in it.
- `status.json`: `mobile_setup: native`, `sibling_project: My Projects/<Project>_iOS/`, `figma.brand_foundation` when used.
- Mobile Adaptive (Native, one file; intake 1.3, `mobile_setup: mobile-adaptive`): this skill is the platform reference for the OS-mode values in a shared iOS + Android file; build rules in `Design_System_Intake_Skill/steps/mobile-adaptive.md`.
- **Cross-platform** (Flutter / React Native, one shared design): one DS and one Design file in `<Project>_Mobile/`; this skill is the base when intake 1.5 chose Material 3 or a custom brand UI.

## 1. File structure (pages, in this order)

```
Cover
-
⭐Setup
➜ Color                  (tonal palettes + scheme Light/Dark (+ contrast) swatches, all bound)
➜ Typography             (type scale specimens, bound styles)
➜ Shape                  (corner scale + expressive shape set)
➜ Spacing                (4dp scale)
➜ Elevation              (levels 0-5, tone + shadow)
➜ State Layers           (focus/pressed/dragged recipe; no hover on mobile)
➜ Icons                  (Material Symbols)
➜ App Icon               (adaptive icon layers, themed icon, Play Store 512; section 5b)
➜ Layout                 (window size classes, grids, example layouts)
➜ Utilities              (status bar, gesture bar, keyboard, scrim, focus indicator)
-
⭐Form Elements
➜ Text Fields            (filled, outlined, exposed dropdown, multiline)
➜ Checkbox · ➜ Radio · ➜ Switch
➜ Search                 (search bar, docked / full-screen views)
➜ Sliders
➜ Date & Time Pickers
-----
⭐Navigation
➜ Buttons                (common buttons, toggle, icon, FAB, extended FAB, FAB menu, groups, split)
➜ App Bar
➜ Navigation             (nav bar, nav rail, expanded rail)
➜ Toolbar
➜ Tabs
➜ Menu
-----
⭐Data display
➜ Cards · ➜ Lists · ➜ Chips · ➜ Badges · ➜ Avatars · ➜ Dividers
➜ Dialogs · ➜ Sheets · ➜ Snackbar · ➜ Tooltips
➜ Carousel · ➜ Progress & Loading
-----
```
Keep research boards out of the DS file (the reference has a 12800px ➜ Research page in Setup). XR variants go in their own `... for XR` sections.

### Group routing rule
| Request is about... | Goes under | Android examples |
|---|---|---|
| Tokens, type, shape, elevation, state layers, grids, icons, app icon, utilities | **⭐Setup** | new scheme role, typescale change, window class grid |
| Anything the user **enters or chooses data** with | **⭐Form Elements** | text field, dropdown, checkbox, radio, switch, slider, search, pickers |
| Any **action** or **movement between destinations** | **⭐Navigation** | buttons, FAB, app bar, nav bar/rail, toolbar, tabs, menus |
| Anything that **displays information** | **⭐Data display** | cards, lists, chips, badges, dialogs, sheets, snackbar, tooltip, carousel, progress |

Page convention (from the kit): one Section per family with `Header`, the public set(s), a `Building Blocks` frame for private parts (`.Building Blocks/...`), `Note` sections, and **Light + Dark preview frames** of instances (missing in the reference - add them).

## 2. Build order (each layer only uses the layers before it)
1. **Primitives** = tonal palettes (tones 0, 4, 6, 10, 12, 17, 20, 22, 24, 30, 40, 50, 60, 70, 80, 87, 90, 92, 94, 95, 96, 98, 99, 100) per key color, generated with Material Color Utilities (HCT) from the brand seeds. 1 mode.
2. **Semantic** = md.sys.color scheme roles aliased to palette tones, modes **Light / Dark** (+ **Light Medium/High Contrast**, **Dark Medium/High Contrast** when required); **state layers** as aliases + opacity variables.
3. **Spacing, Shape (+ role aliases), Size, Typography** variables (md.sys.typescale: font, size, line height, tracking, weight per role/size).
4. **Styles**: text styles bound to the typescale variables; **Elevation 1-5** effect styles; grid styles per window size class.
5. **Icons** (Material Symbols, atoms) and the **➜ App Icon** page (section 5b), then components **Atoms -> Molecules -> Organisms -> Patterns**.
6. **Documentation pages** linked. 7. **Audit** + write the project skills.
Before each component: state tier, list dependencies, build lower tiers first, post the atomic structure map.

## 3. Token architecture (md.sys naming)

### Palettes (primitives, 1 mode, no scopes, hidden)
`palette/{primary, secondary, tertiary, error, neutral, neutral-variant}/{tone}` + custom `palette/{success, warning, info}/{tone}`. Generate with HCT so tone = perceptual lightness (the reference hand-picked tones: uneven steps).

### Schemes (modes Light / Dark / contrast) - `md.sys.color` roles, Figma path `Schemes/<Group>/<Role>`
| Role family | Light tone | Dark tone |
|---|---|---|
| primary / on-primary / primary-container / on-primary-container | 40 / 100 / 90 / 10 (30 in Expressive light) | 80 / 20 / 30 / 90 |
| secondary..., tertiary..., error... | same pattern | same |
| custom success / warning / info (+ containers) | same pattern | same |
| surface / surface-dim / surface-bright | 98 / 87 / 98 (N) | 6 / 6 / 24 |
| surface-container-lowest / low / (default) / high / highest | 100 / 96 / 94 / 92 / 90 | 4 / 10 / 12 / 17 / 22 |
| on-surface / on-surface-variant | N10 / NV30 | N90 / NV80 |
| outline / outline-variant | NV50 / NV80 | NV60 / NV30 |
| inverse-surface / inverse-on-surface / inverse-primary | N20 / N95 / P80 | N90 / N20 / P40 |
| primary-fixed / -fixed-dim / on-primary-fixed / on-primary-fixed-variant (and secondary, tertiary) | 90 / 80 / 10 / 30 | same |
| shadow, scrim | N0 | N0 |
- Scopes per role (TEXT_FILL for on-*, FRAME/SHAPE_FILL for containers/surfaces, STROKE for outline) - **never ALL_SCOPES**.
- Code syntax **Android** on every variable: `MaterialTheme.colorScheme.primary` (Compose) / `?attr/colorPrimary`; description with the md.sys token name.
- Drop deprecated roles (background, surface-variant) or mark them deprecated.

### State layers
- Opacity variables `state/focus 0.10`, `state/pressed 0.10`, `state/dragged 0.16`, `state/disabled-container 0.12`, `state/disabled-content 0.38`.
- State layer color = the **content (on-) role alias** (e.g. `State Layers/On Primary` -> Schemes/On Primary) with the opacity applied on the layer, not raw RGBA copies (reference: 180 raw RGBA values, several stale).

### Typography (md.sys.typescale) - 1 mode (add a Large-screen mode only if needed)
`typescale/{display,headline,title,label,body}-{large,medium,small}/{size, line-height, tracking, weight}` + `font/{brand, plain}`.
M3 values: display 57/64 -0.25, 45/52, 36/44 · headline 32/40, 28/36, 24/32 · title 22/28, 16/24 +0.15, 14/20 +0.1 · label 14/20 +0.1, 12/16 +0.5, 11/16 +0.5 · body 16/24 +0.5, 14/20 +0.25, 12/16 +0.4. Emphasized variants (Expressive) use a heavier weight (Medium 500 / Bold for display).
Font: Roboto Flex by default, or the brand font (the reference uses Google Sans Flex - confirm licensing).

### Shape (md.sys.shape.corner) - `Corner/{None 0, Extra-small 4, Small 8, Medium 12, Large 16, Large-increased 20, Extra-large 28, Extra-large-increased 32, Extra-extra-large 48, Full}`, CORNER_RADIUS scope, usage descriptions (text field top XS, chip S, card M, FAB L, dialog/sheet XL, button Full).
- **Role radius (Abdul, 2026-10-06, from Astryx):** `radius/role/inner` -> `Corner/Extra-small` (text field top, parts inside a control), `radius/role/element` -> `Corner/Small` (chips, menus), `radius/role/container` -> `Corner/Medium` (cards), `radius/role/page` -> `Corner/Extra-large` (dialogs, bottom sheets), `radius/role/full` -> `Corner/Full` (buttons, FAB pills, avatars). Components bind the role alias; the md.sys.shape names stay the scale.
### Size (dp, 1 mode, Abdul, 2026-10-06, from Astryx) - `size/control/{xsmall 32, small 40, medium 56, large 96, xlarge 136}` (M3 button heights), `size/text-field 56`, `size/list-item/{one-line 56, two-line 72, three-line 88}`, `size/touch-target 48`. Scope WIDTH_HEIGHT. Buttons, fields and list items bind their height to these.
### Spacing (dp) - `space/{0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64}` + `space/margin-compact 16`, `space/margin-medium 24`, `space/gutter`. Scopes GAP + WIDTH_HEIGHT. (Missing entirely in the reference.)
### Elevation - `elevation/level-{0..5}` = 0, 1, 3, 6, 8, 12 dp (documented), effect styles Elevation 1-5.

## 3b. Recolor-ready colors (Abdul's rule: a color change must update every shade cleanly)

Build rules (every new DS):
- Primitives hold the only raw colors. Each hue is a full shade scale with fixed step names (M3 tones 0 ... 100); a brand color is a ramp, never a single swatch.
- Generate each ramp from one base color with a stored curve (M3 tonal palette: HCT / tone = L*; key color at tone 40), not by hand-picking steps. Record the base and the curve in `data/tokens.json > ramps` (run `python tools/build_tokens.py <folder>` after exporting variables).
- Semantic (and Brand) tokens **only alias** Primitives. Zero raw hex outside Primitives; `tokens.json > recolor_readiness.ready` must be `true`.
- Components use Semantic tokens only, never Primitives directly and never raw colors.
- Colors that need alpha (scrims, state layers, tints) use alpha Primitives, or are listed as **derived tokens** in `data/rules.json > recolor.derived_tokens` so the recolor script regenerates them.
- Never rename a Primitive during a recolor: names are the contract that keeps every alias linked.

Recolor procedure (when the user asks to change a color):
1. Find the ramp in `data/tokens.json > ramps` and which Semantic tokens alias it.
2. Run `python tools/recolor.py <folder> --ramp "<ramp>" --base "#hex"`. It regenerates every step with the ramp's curve, recomputes derived tokens, and re-checks every contrast pair in `data/rules.json` in Light and Dark (pairs that were already failing are reported separately).
3. Fix any NEW contrast failure by re-pointing that Semantic alias to another step (never a raw hex), then run the script again.
4. Apply the generated `data/recolor/<date>-<ramp>.figma.js` with figma_execute: it sets values into the SAME variables by name and never creates, renames or deletes.
5. Re-export variables and run `tools/build_tokens.py` (or re-run recolor with `--write-tokens`) so `tokens.json` matches Figma.
6. Screenshot ➜ Colors and every component page in Light and Dark; compare with the previous screenshots.
7. Log it in `docs/decisions.md`.

**Fix on create:** when a DS starts from an existing file or a reference template, run `tools/fix_tokens.py` and apply its plan before building anything (Design_System_Intake_Skill section 7b). New builds run it as the last foundation step; its plan must come back empty.

## 4. Styles
- **Text styles** `{role}/{size}` and `{role}/{size}-emphasized` (30), all properties bound to **local** typescale variables. Description `16sp / 24sp / 400 / +0.5 · MaterialTheme.typography.bodyLarge`.
- **Effect styles** `Elevation/1..5` (key + ambient shadows; one set - Light and Dark are identical in M3), colors bound to `Schemes/Shadow` if export allows.
- **Grid styles** per window size class: Compact 0-599 (4 col, 16 margin, 16 gutter), Medium 600-839 (8, 24-32, 16-24), Expanded 840-1199 (12, 24, 24), Large 1200-1599, Extra-large 1600+ (+ layout region variants).
- No color styles (utility paint styles only if needed).

## 5. Icons
- **Which set (intake 0.6b, Abdul 2026-10-06):** use the library in `status.json > icons` (ids, licenses and fetch ids in `tools/icon_libraries.json`). No answer recorded (quick mode, an old project): the file's own icon components if it has any, else the platform default below. `existing` = reuse the icon components found in the DS file or its linked libraries as they are; missing icons are drawn in the same style. Another library (Phosphor, Tabler, Heroicons, Remix Icon) keeps every rule in this section: same `Icon/<Name>` names, sizes, swap properties and token binding; its line / fill pair becomes the outline / fill variant.
- Material Symbols (Rounded or Outlined - pick one), weight 400, grade 0, optical size 24; names snake_case as in Google Fonts (`arrow_back`, `more_vert`), filled versions with `_filled` suffix (never two components with the same name).
- 24dp default (18 chips, 20 small buttons, 36 large FAB), single vector bound to `Schemes/On Surface` and recolored per component with on-roles.
- Exposed as INSTANCE_SWAP `Icon` / `Icon (selected)` with `Show icon` booleans (M3 kit convention). Components use the **local** icon set only (reference uses remote kit icons).

## 5b. App Icon page (➜ App Icon, always created)
Flow (create, notice a drop, check, present, Storybook): Design_System_Intake_Skill section 7h (`steps/app-icon.md`). Exact sizes and file names: `tools/app_icon_specs.json > android`.
- **Adaptive icon:** each layer is 108 x 108 dp (drop zones at 432 px = xxxhdpi). Launchers show the inner 72 dp through their mask; key shapes stay inside the **66 dp safe circle**; the outer 18 dp per side is reserved for motion. Drop zones: Foreground (required, transparent background), Background (optional, opaque; a Palette or Scheme color when empty), Monochrome (optional, one flat color on transparent; Android 13+ themed icons use only its shape), Play Store (optional, 512 full square; made from the layers when empty).
- **Component:** `App Icon` set with `Layer = Foreground | Background | Monochrome | Adaptive` (Adaptive stacks the other three as instances); previews are instances.
- **Masks (preview only):** Circle, Squircle, Rounded Square, each with a safe-zone overlay (108 / 72 / 66 dp) that can be hidden.
- **Themed icon preview:** the Monochrome shape on Light and Dark frames using `Schemes/Secondary Container` and `Schemes/On Secondary Container` (the system picks the real colors from the wallpaper; the docs frame says so).
- **Sizes:** layers 108 / 162 / 216 / 324 / 432 px (mdpi to xxxhdpi); legacy `ic_launcher` 48 / 72 / 96 / 144 / 192 px (minSdk < 26 only); Google Play 512 x 512, 32-bit PNG, up to 1024 KB, full square with no rounded corners or shadow (Play applies them).
- **Checks:** Foreground shapes inside 66 dp; Background opaque; Monochrome one color; legible at 48 px.
- **Docs:** the specs table points to `res/mipmap-anydpi-v26/ic_launcher.xml` (adaptive-icon with background, foreground and monochrome), the foreground as a vector drawable when the art is vector, the legacy mipmaps and the Play Store PNG.

## 6. Component conventions (M3 kit)
- Public names match M3 (`Button`, `Button - tonal`, `Icon button - outline`, `Navigation Rail`); private parts start with `.Building Blocks/` and live in the Building Blocks frame.
- **No Hover on mobile (Abdul, 2026-10-28):** phones and tablets have no pointer, so mobile components (Android, iOS, cross-platform, Mobile Adaptive) have no Hover / Hovered state or variant; tap feedback is the Pressed state (Android: state layer / ripple; iOS: highlighted, pressed opacity), plus Focused where the platform has keyboard focus. Hover is for Web (and desktop pointers) only. Check: `node tools/check_no_hover.cjs "My Projects/<Project>"` (0 findings).
- Properties: `State` = Enabled, Pressed, Focused, (Dragged), Disabled (no Hovered) · `Selected` · `Size` XSmall, Small, Medium, Large, XLarge · `Type`/`Style`/`Color`/`Configuration` · BOOLEAN `Show ...` and `Show focus indicator` · TEXT `Label text`, `Supporting text`, `Headline` · INSTANCE_SWAP `Icon`, `Icon (selected)` · SLOT `Content`.
- Anatomy: container > `State-layer` frame (state overlay) > content; ripple only in Pressed; focus indicator 3dp outline offset (Utilities).
- 100% bound: fills, strokes, **padding/gap (spacing)**, **radius (Shape)**, text styles, effect styles; 0 remote variables/styles/components.
- Touch target 48x48dp (visual 40dp controls inside 48 targets).
- Disabled per M3 recipe: container on-surface 12%, content on-surface 38%.
- Descriptions on every set (M3 kit text is fine) + when to use / not use. Component docs are written once: the `docs` block of its `data/component-registry.json` entry (Storybook_Design_System_Skill/SKILL.md section 4b: overview, when to use / not use, anatomy, do/don't, accessibility rows, keywords), filled when the component is built; `python tools/component_docs.py <folder> figma` turns it into the description (Purpose / Usage rules / Accessibility / Keywords) and `tools/apply_descriptions.figma.js` writes it to the set. Never type a description by hand.
- **Description format:** `Purpose:` / `Usage rules:` / `Accessibility:` / `Keywords:`, plus `Code:` (the docs block's `code` key) when the component has a code counterpart (Scenario D, code sync or Code Connect): the import or file path and the main prop names, e.g. `Code: ui/components/AppButton.kt (style, size)`. Name the tokens it uses in Usage rules when a choice depends on them. Agents read the description to go from Figma to code (Abdul, 2026-10-06, from Astryx).
- **Slots, not variant matrices (Abdul, 2026-10-06, from Astryx):** a content area that holds other components (card body and footer, dialog / modal body and actions, list item leading and trailing, toolbar and top bar actions, sidebar sections, popover and sheet content) is a SLOT property, with its accepted components listed in `data/component-registry.json > slots`. Variants stay for what changes the anatomy or the state, never for "which content is inside" (Astryx's Toolbar dropped 48 variants for 3 slots). Slots are created with the Desktop Bridge (`figma_add_slot_property`); everything else stays on FigCli Yolo. M3 sets already expose SLOT `Content`.

### Required inventory and states (Android)
| Tier | Component | Variants / states |
|---|---|---|
| Atom | Button (filled, tonal, outlined, elevated, text) | XSmall-XLarge · Round/Square · icon optional · Enabled, Pressed, Focused, Disabled |
| Atom | Toggle button, Icon button (standard, filled, tonal, outlined; togglable) | + Selected · Width Narrow/Default/Wide |
| Atom | FAB, Extended FAB | Default/Medium/Large · 6 colors · Enabled, Pressed, Focused |
| Atom | Checkbox (incl. error), Radio, Switch (icon optional) | Selected x 5 states |
| Atom | Chips (assist, filter, input, suggestion), Badge (small/large), Avatar, Divider, Nav item, Tab item, Menu item, Progress / Loading indicator | M3 states |
| Molecule | Text field (filled/outlined, leading/trailing icon, supporting text, error, prefix/suffix, counter), Exposed dropdown, Search bar, Button groups (standard/connected), Split button, List item, Snackbar, Tooltips, Slider | |
| Organism | App bar (small, center, medium, large, search), Navigation bar / rail / expanded rail, Toolbar (docked/floating), Tabs, Menu, Dialog (basic, list, full-screen), Bottom / side sheet, Card (elevated, filled, outlined), Date/time pickers, Carousel, FAB menu | |
| Pattern | Screens per window size class (compact list-detail, expanded two-pane), sign-in, OTP, settings | |

## 7. Theming and adaptivity
- Dark mode = `m3` Dark mode on the frame; contrast modes as extra modes; dynamic color (Material You) documented as a runtime option.
- **Single-mode systems** (intake 0.4 = Light only or Dark only): the Semantic collection has one mode named after the answer (`Light` or `Dark`). Every "Light and Dark" requirement in this skill, the intake checkpoints, the audits, the docs pages and the Storybook quality bar means "each mode the project has": no second preview frame, one swatch frame per collection, screenshots in that mode only, contrast checked against that mode's surfaces only.
- Adaptive layout: Compact -> Navigation bar; Medium -> Navigation rail; Expanded+ -> Expanded rail / two panes; grids per window class.

## 8. Documentation pages (linked, never static)
- ➜ Color: palettes and schemes (Light and Dark) with every swatch bound (the reference does this well: ~97% bound).
- ➜ Typography: every specimen uses its local style; table values from variables.
- ➜ Shape: swatches bound to Shape variables (reference: unbound). ➜ Elevation: local styles, Dark frame on the local mode.

## 9. Mistakes found in the default Android reference - never repeat them
1. No spacing variables - every padding and gap raw.
2. Typography sizes/line heights bound to **remote** M3 kit `Static/*` variables; display/headline raw; tracking 0; sizes off the M3 scale.
3. ALL_SCOPES on palettes and schemes; no code syntax; almost no descriptions.
4. State layers as ~180 **raw RGBA** copies, several stale vs the brand scheme.
5. Components still using **remote M3 kit** icons, text styles (`M3/body/large`...), effect styles, scheme variables and nested components (Button - text, Icon button - standard, dividers).
6. Hand-picked tonal palettes (not HCT); Dark surface = pure black; surface container tiers off the M3 tones.
7. Deprecated roles left in (`Background (Deprecated)` with a remote Dark alias, `Surface Variant??`), typos (`Sucess Container`, `Presssed`, `Hovere`, `Time PIcker`, `Accordion buttton`), `Property 1` and an empty property name.
8. Shape collection underused - radii raw; FAB bound to a remote corner variable.
9. Duplicate icon names without `_filled`; no dark previews; baseline and expressive generations mixed without deprecation notes; research board inside the DS file.


## Screens (Design files)
- Screens are built only from the published DS library, section by section (figma-generate-design + figma-use + ui-ux-pro-max, plus the platform quality skill in section 11 when installed), at the sizes in Design_System_Intake_Skill section 7d (Mobile 375 x 812 (a reference's own template frames are not used for project screens); Brownfield keeps designed sizes). Impeccable leads the screen design: `shape` plans each screen before it is built, `critique` + `polish` (and `layout` / `typeset` / `colorize` when needed) run after it; ui-ux-pro-max is a second reference; figma-generate-design + figma-use do the Figma work; every decision snaps to DS components and variables (Design_System_Intake_Skill section 7e).
- **Screen fidelity (Abdul's rule):** follow Design_System_Intake_Skill section 7f (`Design_System_Intake_Skill/steps/screens.md`): screen spec from every source image first, real content in every instance, one section per script, side-by-side check after each screen (run in ds-auditor), `tools/check_screens.figma.js`, checkpoint stays `Ready for review` until the user approves.
- **Multi-screen flows (Abdul's rule):** follow Design_System_Intake_Skill section 7e (`steps/screens.md`) in order: approved gap table, missing components in the DS file, publish + Accept updates + verify, screens one by one with a Design file audit after each, changelog + Storybook question.
- **Scenario C, imperfect DS + Design file (Abdul's rule):** follow Design_System_Intake_Skill section 7 (`steps/brownfield-3-scenario-c.md`) in order: Variable Map, DS fixes (safe ones as Fix on create, the rest after approval) + publish, screen-by-screen audit report, raw-value rules, fixes after approval, log + Accept updates. Android mapping: colors map to `md.sys.color` roles (section 3), text to `md.sys.typescale`, radius to `md.sys.shape.corner`, shadows to the elevation levels; raw overlay colors on pressed/hover map to state layers.
- **Scenario D, Code to Design (Abdul's rule, 2026-10-05):** follow Design_System_Intake_Skill section 6 (`steps/code-to-design.md`). The code (repo routes, popups, states, texts, icons) is the source of the screens; a live preview is a visual reference only. Branch a, existing DS: the DS is read only except the editable page the user names; reuse its components and variables first, map every code value to the nearest DS token, add only missing components on that page (lowest tier first), report DS issues instead of fixing them, ask before each publish, build screens in the linked Design file, keep the user's manual edits, audit after each step. Branch b, new DS: Primitives and Semantics from the code's tokens, then this skill's build order and components, then screens per module. Android mapping: `colors.xml`, `themes.xml`, `Color.kt` / `Theme.kt` / `Type.kt` (or a web codebase's CSS variables) map to tonal-palette Primitives and `md.sys.color` roles, text to `md.sys.typescale`, shapes to `md.sys.shape.corner`, shadows to the elevation levels, pressed / hover overlays to state layers, Material Symbols names to the Icon set.
- **Design file audit (Abdul's rule, every time screens are built or changed):** run audit-design-system (ds-auditor, `screens` mode) on that Design file to confirm it really uses the DS: library components only (no local copies, detached instances or hand-drawn parts), library variables and styles only (no raw values, no variables used for the wrong purpose), latest library version. Fix what it finds, save the report in `<Project folder>/audits/`, and log the result in `CHANGELOG.md` (`Design file audit: <numbers>, report <path>`).

## 10. Final QA checklist
- [ ] 0 remote variables, styles and components; 0 raw fills/strokes/padding/gap/radius/effects.
- [ ] Palettes HCT-generated; schemes follow M3 tones; contrast modes if required.
- [ ] Every variable: scope, Android code syntax, description (md.sys name). Every set: description, M3 property names, wired props.
- [ ] State layers = alias + opacity; disabled per M3 recipe; focus indicator on every interactive component.
- [ ] Typescale local and bound (size, line height, tracking, weight); Shape and Spacing bound everywhere.
- [ ] Icons local Material Symbols instances with swap properties.
- [ ] ➜ App Icon exists in ⭐Setup (drop zones, or the presented adaptive icon with masks, themed preview, Play Store 512 and export settings).
- [ ] Targets >= 48dp; contrast text >= 4.5:1, UI >= 3:1 in each mode the project has.
- [ ] Light and Dark preview frames per family; Color/Typography/Shape docs linked.
- [ ] Screenshot every variant (light + dark) and compare with the description.
- [ ] Save a version after each phase; write Foundation_Skill and Component_Skills per group.
- [ ] `tokens.json > recolor_readiness.ready` is true (0 raw hex in Semantic/Brand tokens) and a test run of `tools/recolor.py` on the brand ramp shows no NEW contrast failures.
- [ ] `data/tokens.json`, `component-registry.json`, `rules.json`, `screen-templates.json` and `docs/decisions.md` are generated for the new DS.
- [ ] `python tools/fix_tokens.py <folder>` returns an empty plan (0 operations).
- [ ] When the platform quality skill (section 11) is installed, its accessibility and anti-patterns references pass on the components and screens.

## 11. Platform quality skill (optional, Material 3)

Impeccable stays the general quality reference. For Android the workflow adds **material-design-3-ui** (skydashnet, MIT, https://github.com/skydashnet/material-design-3-ui-skill): a decision system for M3 and M3 Expressive (component choice by behavior, states, adaptive layouts, accessibility, anti-patterns). Abdul approved it on 2026-10-05 after comparing six public iOS/Android repos; none of them is a Figma kit, so they guide decisions and never replace the reference entry, this skill's structure or the intake answers.
- **Install (never on the user's behalf; show the steps):** clone https://github.com/skydashnet/material-design-3-ui-skill, then run `./install.sh --agent claude --agent codex --agent antigravity` (macOS/Linux) or `Set-ExecutionPolicy -Scope Process Bypass -Force; .\install.ps1 -Agent claude,codex,antigravity` (Windows PowerShell; the Process scope only lasts for that window) from the clone. Never `powershell -File install.ps1 -Agent a,b,c`: `-File` passes the list as one string and the installer rejects it (2026-10-06), so it goes only to the agents this workflow supports (without `--agent` it installs into seven agents). It installs per user (every project on the machine), but its main file is small (about 12 KB) and it loads one reference at a time, so the token cost is low. When it is not installed, say so once at the first build step and continue without it.
- **Which reference, when** (it loads its references one at a time; load only the row you need):
  - Component scope approval and each component build: `component-selection.md`, `navigation.md`, `forms-and-input.md`, `feedback-and-overlays.md` (which component, which states, error recovery). Write the result into the component description (Purpose, Usage Rules).
  - Foundation: `color-system.md`, `typography.md`, `shape-and-elevation.md`, `spacing-and-layout.md`, and `m3-expressive.md` when the project uses Expressive.
  - Screens: `adaptive-design.md` (window size classes, list-detail, foldables) plus the component references.
  - Before every checkpoint and in Scenario C/D audits: `accessibility.md` and `anti-patterns.md` ("fake Material": cards everywhere, max radius everywhere, chips as buttons, FAB for minor actions).
- **Android only:** its description matches any UI, design system or Figma task, so it may load in Web or iOS work. There it is ignored: Web follows Tailwind conventions, iOS follows Apple HIG and `references/ios-polish.md`, and no Material component, name or rule enters those systems. It never triggers web searches for values that `data/*.json`, this skill or `references.json` already hold.
- **Where it does not apply:** its token hierarchy ends in component tokens; this workflow keeps Primitives + Semantics only (no Component-specific tier unless the user asks, or Mobile Adaptive). Intake answers (fonts, modes, brand color, RTL) and this skill's md.sys names always win.
- **Exact M3 values:** check numbers against the official `tokens.xml` files in material-components-android (`lib/java/com/google/android/material/<component>/res/values/tokens.xml`, color in `color/res/values*/tokens.xml`). That library (Views) is in maintenance mode since Google I/O 2026; Compose Material 3 is the current implementation, so new components and Expressive changes come from Compose Material 3 docs and m3.material.io first.

---
name: web-design-system-builder
description: Main skill for building a new Web design system in Figma from scratch (Scenario A) or from existing UI (Scenario B) or for an AI-ready refactor of an imperfect DS and its Design files (Scenario C), or for Code to Design from a coded app into an existing or a new DS (Scenario D). Defines the file structure, build order, token architecture, style, icon and component conventions, required states per component, and the mistakes to avoid - learned from studying the default Web reference design system (`references.json`). Load it with figma-use and figma-generate-library before creating anything; save the project's own skills under [Root]\My Projects\[Project]\.
---

# Web Design System Builder (Main Skill)

Reference implementation studied: the platform's default entry in `references.json` (`default.web`; its folder, Figma link and name are there; human list in `References.md`). Other companies' Web systems can be added as entries; when the project picked one (`status.json > reference`), use that entry's folder instead. Today the default is the only Web entry, and the values, layout and section 9 below were learned from it.
Copy its **structure**. Do **not** copy its mistakes: every item in section 9 must be done correctly from the start.
Platform: Web, Tailwind conventions (scale names, breakpoints, hover/focus/active states).
Node IDs quoted in a reference entry's skills are valid in that entry's original file only. In a duplicated template or any other file, find pages, component sets, styles and variables by **name**.

**Questions.** Every question with options in this skill (component scope, approvals, publish and Accept updates confirmations, recolor or token proposals) is an AskUserQuestion choice (`Ask (choice)` / `Ask (multi)`, Intake section 0); typed answers go in its Other field. Every menu also gets a "Back" option to the previous question or step (Intake section 0, Back on every menu).

**Tools and generic skills (figma-console).** The Figma tool (Desktop Bridge or FigCli) is picked in Intake section 0b (`status.json > figma.tool`), which also says when to suggest the other one. Work runs through figma-console `figma_execute` (plain Plugin API) when the official `use_figma` server is not connected. figma-use and figma-generate-library are still loaded for their rules, but their helper APIs (`figma.createAutoLayout`, `node.set`, `node.query`) do not exist in figma-console and fail with "not a function": use `figma.createFrame()` + `layoutMode`, `appendChild`, `setBoundVariable` directly. The reference page layout (section 1) and the intake checkpoints (Design_System_Intake_Skill section 8) override figma-generate-library's page skeleton (Cover / Getting Started / Foundations / Components) and its per-phase checklist posts; report progress in the thread's status checklist instead.

**Knowledge base (JSON, source of truth for exact values):** every DS folder has `data/tokens.json` (variables per mode, aliases, shade-scale curves, recolor readiness), `data/component-registry.json` (components, variants, properties, tiers), `data/rules.json` (numeric rules: contrast, touch targets, icon sizes, spacing, recolor) and `data/screen-templates.json` (Login, Sign up, OTP, List, Detail, Form, Settings, Empty state), plus `docs/decisions.md`. Read values from these files instead of copying numbers into skills; the reference versions are in the default Web entry's `data/` (`references.json`, today `Reference_Library/Library/Web/data/`). Tools: `tools/build_tokens.py`, `tools/recolor.py` (see `tools/README.md`).

---

## 1. File structure (pages, in this order)

```
Cover
-----------------------------
⭐Setup
➜ Layout Grid
➜ Typography
➜ Colors
➜ Shadows
➜ Corner Radius & Spacing
➜ Icons
➜ App Icon                     (favicon, apple-touch, PWA and maskable icons; section 5b)
-----
⭐Form Elements
➜ Input Fields and Dropdown      (Input / Text, URL, Card Number, Select / Dropdown, OTP, Stepper, Upload Field, Search)
➜ Text Area
➜ Checkboxes
➜ Toggles
➜ Radio Buttons
-----
⭐Navigation
➜ Buttons & Links
➜ Pagination, Tabs & Breadcrumb
➜ Menus                          (Menu / Item, Menu: actions, per memory/decisions.md group placement)
➜ Navigation Bars                (Nav Item, Top Bar, Sidebar)
-----
⭐Data Display
➜ Avatars & Upload Image
➜ Tooltips
➜ Dividers
➜ Banners, Badges & Toasts
➜ Popups
-----
```
### Where a new request goes (group routing rule)
| Request is about... | Goes under | Examples |
|---|---|---|
| Foundations: tokens, colors, typography, spacing, radius, shadows, grid, icons, app icon | **⭐Setup** | new color, text style, grid, icon, favicon |
| Any component the user **enters data** with | **⭐Form Elements** | input, select, date picker, checkbox, radio, toggle, slider, upload, search field, OTP, stepper |
| Any **action** or anything that **moves the user from place to place** | **⭐Navigation** | button, link, tabs, pagination, breadcrumb, navbar, sidebar, menu, stepper-wizard |
| Any component that **displays information** | **⭐Data Display** | avatar, badge, tooltip, alert, toast, card, table, list, popup, empty state, progress |

Create a new `➜` page inside the matching group when no existing page fits, and put the component skill in the matching Component_Skills file (Form_Elements_Skill, Navigation_Skill, Data_Display_Skill); foundation rules go in Foundation_Skill.

- `⭐` pages are empty group headers; `➜` pages hold one topic; separators are empty pages.
- No stray spaces or typos in page names.
- On each component page: one documentation frame per component family (title in `2xl/Semi Bold`, short description, the component set inside). Next to it a **dark preview frame** with `Semantic` mode = Dark containing **instances** of the light master (never a duplicate component set). Single-mode systems skip the preview frame (section 7).
- Popups and every other family also get a documentation frame (no loose sets on the page).

## 2. Build order (each layer only uses the layers before it)

1. **Primitives** - raw values.
2. **Semantic** variables aliased to Primitives (Light / Dark).
3. **Spacing, Radius (+ role aliases), Size, Typography** variables (Desktop / iPad / Mobile where responsive).
4. **Styles** from those variables: text styles, effect styles, grid styles.
5. **Icons** (atoms) bound to icon tokens, and the **➜ App Icon** page (section 5b).
6. **Components**: Atoms -> Molecules -> Organisms -> Patterns.
7. **Documentation pages** linked to variables and styles (section 8).
8. **Audit** (audit-design-system) + write the project skills (Foundation_Skill + Component_Skills per group).

Before each component: state its tier, list dependencies, build missing lower tiers first. **Then ask before building it** (Design_System_Intake_Skill section 8, "Per-component confirmation inside Components", contributed by EmG38, 2026-10-20): show the variant/state table it will produce and get an Ask (choice) approval before writing it to Figma — one component per approval, never batched. The same applies to each Primitive ramp and token table in section 3 below ("Per-table confirmation inside Foundation").

## 3. Token architecture

### Primitives (1 mode "Value", scopes `[]`, published hidden)
- `white`, `black`; hue ramps `gray, blue, red, yellow, green, orange, purple` with steps `0, 50, 100 ... 900, 950`.
- **Alpha primitives** for scrims: `alpha/black-50`, `alpha/black-70` (and white alphas if needed).
- Lowercase names, no spaces (`black-and-white/white` is wrong, use `white`). Say in descriptions if values deviate from Tailwind.

### Semantic (modes Light / Dark) - naming `color/{group}/{role}`, lowercase, no numeric suffixes
| Group | Roles | Scope |
|---|---|---|
| text | primary, secondary, muted, placeholder, disabled, inverse, link, link-hover, error, warning, success, info, on-brand | TEXT_FILL |
| bg | primary, secondary, muted, subtle, inverse, overlay (alpha), error, warning, success, info, brand, brand-hover, brand-active | FRAME_FILL, SHAPE_FILL |
| border | default, muted, strong, input, inverse, focus, error, warning, success, brand | STROKE_COLOR |
| icon | default, strong, muted, brand, inverse, error, warning, success, info | FRAME_FILL, SHAPE_FILL, STROKE_COLOR |
| action (buttons) | `action/{primary,secondary,danger}/{bg,bg-hover,bg-active,text,border}` | per role |

- Status UI (alerts, badges, toasts) uses `bg/{status}`, `text/{status}`, `border/{status}`, `icon/{status}` - never button tokens.
- **Paired state tokens alias different steps:** `border/input` vs `border/strong` (Hover), `bg/brand` vs `bg/brand-hover` vs `bg/brand-active`, `action/*/bg` vs `bg-hover` vs `bg-active`, `border/default` vs `border/focus`. Two roles on the same step make the state invisible (a trial had an invisible input Hover). `tools/new_foundation.py` checks this.
- `data/rules.json > contrast_pairs` always includes the `action/{primary,secondary,danger}/border` pairs against `bg/primary` and `bg/secondary` (>= 3:1), so a faint Outline border fails at foundation level, not at component level.
- Contrast targets decided at token level: `text/muted` and `text/placeholder` >= 4.5:1 on `bg/primary` (gray-500 light, gray-400 dark); `border/input` >= 3:1 (gray-400/500); status text on status bg >= 4.5:1 (use 700 shades for warning/success text).
- **Every variable** gets explicit scopes (never ALL_SCOPES), WEB code syntax `var(--color-text-primary)`, and a description.

### Typography (modes Desktop / iPad / Mobile)
- `font-family/base` (Poppins by default for this org, or the brand font), `font-weight/{regular,medium,semibold,bold}` (FONT_STYLE scope).
- `font-size/{xs,sm,base,lg,xl,2xl,3xl,4xl,5xl,6xl}` (FONT_SIZE), `line-height/{same keys}` (LINE_HEIGHT), `letter-spacing/{same keys}` (LETTER_SPACING).
- Default reference values: sizes 12/14/16/18/20/24/28/32/40/48 (Desktop); line heights 16/20/24/28/28/32/36/40/48/60; tracking +0.2, 0, 0, -0.2, -0.2, -0.4, -0.6, -0.8, -1, -1.2.
- **Responsive rule (default for new systems):** `xs` to `lg` (12-18) stay the same on Desktop, iPad and Mobile, so body text never drops below 16px; only `xl` and up compress on iPad/Mobile. (The default reference shrinks from `sm` up, which puts body text at 14px on mobile; do not copy that.)

### Spacing (modes Desktop / iPad / Mobile) - `space/{0,1,2,3,4,5,6,7,8,9,10,11,12,14,16,20,24,28,32,36,40,48,56,64}` = n x 4px on Desktop; 0-4 fixed across modes, 5+ compress on iPad/Mobile. Scopes GAP (+ WIDTH_HEIGHT).
### Radius (1 mode) - `radius/{none 0, sm 2, base 4, md 6, lg 8, xl 12, 2xl 16, 3xl 24, full 9999}` with usage descriptions (base default, lg inputs/cards, xl panels, 2xl modals, full pills/avatars).
- **Role radius (Abdul, 2026-10-06, from Astryx):** aliases named by where they go, so an agent never guesses a step: `radius/role/inner` -> `radius/base` (parts inside a control: checkbox box, chip inside a field), `radius/role/element` -> `radius/lg` (buttons, inputs, selects), `radius/role/container` -> `radius/xl` (cards, panels, menus, popovers), `radius/role/page` -> `radius/2xl` (modals, drawers, sheets), `radius/role/full` -> `radius/full` (pills, avatars). Components bind the role alias, not the scale step; changing a role re-points one alias. Same collection, scope CORNER_RADIUS.
### Size (1 mode, Abdul, 2026-10-06, from Astryx) - `size/control/{xs 32, sm 36, base 40, lg 48, xl 56}` (the Button heights) + `size/icon/{xs 12, sm 16, base 18, lg 20}`. Scope WIDTH_HEIGHT. Button, Icon Button, Input, Select, Search and every control of the same size bind their height to `size/control/*`, so a field and a button next to it always line up and a density change is one edit.
### Opacity - `opacity/disabled` = 0.5 (use for all disabled states).

## 3b. Recolor-ready colors (Abdul's rule: a color change must update every shade cleanly)

Build rules (every new DS):
- Primitives hold the only raw colors. Each hue is a full shade scale with fixed step names (0, 50, 100 ... 900, 950); a brand color is a ramp, never a single swatch.
- Generate each ramp from one base color with a stored curve (OKLCH curve: steps keep their lightness and chroma ratio, hue follows the base), not by hand-picking steps. Record the base and the curve in `data/tokens.json > ramps` (run `python tools/build_tokens.py <folder>` after exporting variables).
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

- **Text styles**: `{size}/{weight}` (40 styles: 10 sizes x Regular, Medium, Semi Bold, Bold). Bind font family, weight, size, **line height and letter spacing** to variables. Description: `14px / 20px / 500 · Tailwind text-sm font-medium` - must match the real values.
- **Effect styles** (exact Tailwind): `shadow-2xs, shadow-xs, shadow-sm, shadow-md, shadow-lg, shadow-xl, shadow-2xl, inset-shadow-2xs/xs/sm`, plus `focus-ring` (inputs: inset 2px `border/focus`) and `focus-ring-offset` (buttons/controls: 2px bg gap + 4px focus ring). Use raw colors in effect styles (binding effect colors to variables made plugin exports hang).
- **focus-ring-offset renders only on a clipping, filled frame.** It is built from spread drop shadows, and Figma draws spread only when the frame has `clipsContent = true` and a fill. Set both on every Focus variant that uses it (Button Focus variants need `clipsContent = true`; transparent types such as Outline and Link need a `color/bg/primary` fill in Focus), then screenshot to confirm the ring shows.
- **Grid styles**: `Grid/Desktop 1440` 12 col / 80 margin / 24 gutter, `Grid/iPad 768` 8 / 32 / 16, `Grid/Mobile 375` 4 / 16 / 16.
- No color styles (color = variables only).

## 5. Icons

- **Which set (intake 0.6b, Abdul 2026-10-06):** use the library in `status.json > icons` (ids, licenses and fetch ids in `tools/icon_libraries.json`). No answer recorded (quick mode, an old project): the file's own icon components if it has any, else the platform default below. `existing` = reuse the icon components found in the DS file or its linked libraries as they are; missing icons are drawn in the same style. Another library (Phosphor, Tabler, Heroicons, Remix Icon) keeps every rule in this section: same `Icon/<Name>` names, sizes, swap properties and token binding; its line / fill pair becomes the outline / fill variant.
- One component per icon, named `Icon/<Name>` in Title Case (Icon/Chevron Down, Icon/Close, Icon/Search, Icon/Info, Icon/Alert Circle, Icon/Warning, Icon/Check, Icon/Check Circle, Icon/Add, Icon/Minus, Icon/Edit, Icon/Delete, Icon/Upload, Icon/File, Icon/User, Icon/Arrow Left/Right...). 24x24, one consistent set (Lucide for Web by default; the intake 0.6b library or an existing set otherwise).
- Fetch Lucide icons (better-icons or Iconify) **without the `color` parameter**: it injects `fill="#000000"` into stroke-only paths and circles, which renders filled shapes. Use the raw SVG, keep `fill="none"` and bind the stroke to the icon token.
- Fill/stroke bound to `color/icon/default`; recolor instances with other `color/icon/*` tokens.
- Components **only** use Icon instances (never drawn vectors or text glyphs like ← →), exposed through INSTANCE_SWAP properties (leading/trailing icon on buttons, inputs, menu items, list items).

## 5b. App Icon page (➜ App Icon, always created)
Flow (create, notice a drop, check, present, Storybook): Design_System_Intake_Skill section 7h (`steps/app-icon.md`). Exact sizes and file names: `tools/app_icon_specs.json > web`. On the Web the app icon is the favicon set plus the home-screen and PWA icons; it lives in ⭐Setup, never in ⭐Data Display (some references keep a `➜ Favicon` page there; Fix on create moves it).
- **Drop zones:** Icon (512, SVG preferred, transparency allowed, required), Dark (optional, used inside `icon.svg` with `prefers-color-scheme: dark`), Maskable (optional, opaque full-bleed, made from Icon when empty).
- **Sizes and files:** `favicon.ico` (32, may hold 16/32/48), `favicon-16.png`, `favicon-48.png`, `icon.svg`, `apple-touch-icon.png` 180 (opaque, square; iOS rounds the corners), `icon-192.png` and `icon-512.png` (manifest `purpose: any`), `icon-512-maskable.png` (`purpose: maskable`, key shapes inside the central 80% circle).
- **Previews:** browser tab bar in Light and Dark with the favicon at real size (16 and 32), bookmark list, iOS Home Screen with the apple-touch icon rounded, PWA on Android with the maskable icon in Circle and Squircle, the full size ladder.
- **Checks:** readable at 16 px on both tab colors (a thin or low-contrast mark gets a Dark version or a simplified small version, asked first); apple-touch and maskable icons opaque.
- **Docs:** the specs table lists each file with its size and the `<link>` tags and manifest entries from the spec file, so developers copy them as they are.

## 6. Component conventions

- Names: `Family / Variant` (Input / Text, OTP / Cell, Menu / Item, Tabs / Item — Underline). Unique set names.
- Variant properties in Title Case: `State`, `Type`, `Size`, `Status`, `Open`; values Title Case (`Default, Hover, Focus, Filled, Error, Success, Disabled`). Never `Property 1`, `Variant5`, `Status4`, `folled`, `dimmed`.
- Every set: description with tier + purpose + when to use / not use. Component docs are written once: the `docs` block of its `data/component-registry.json` entry (Storybook_Design_System_Skill/SKILL.md section 4b: overview, when to use / not use, anatomy, do/don't, accessibility rows, keywords), filled when the component is built; `python tools/component_docs.py <folder> figma` turns it into the description (Purpose / Usage rules / Accessibility / Keywords) and `tools/apply_descriptions.figma.js` writes it to the set. Never type a description by hand.
- **Description format:** `Purpose:` / `Usage rules:` / `Accessibility:` / `Keywords:`, plus `Code:` (the docs block's `code` key) when the component has a code counterpart (Scenario D, code sync or Code Connect): the import or file path and the main prop names, e.g. `Code: components/ui/button.tsx (variant, size)`. Name the tokens it uses in Usage rules when a choice depends on them. Agents read the description to go from Figma to code (Abdul, 2026-10-06, from Astryx).
- **Slots, not variant matrices (Abdul, 2026-10-06, from Astryx):** a content area that holds other components (card body and footer, dialog / modal body and actions, list item leading and trailing, toolbar and top bar actions, sidebar sections, popover and sheet content) is a SLOT property, with its accepted components listed in `data/component-registry.json > slots`. Variants stay for what changes the anatomy or the state, never for "which content is inside" (Astryx's Toolbar dropped 48 variants for 3 slots). Slots are created with the Desktop Bridge (`figma_add_slot_property`); everything else stays on FigCli Yolo.
- TEXT properties for every visible string (label, hint, error, title, message, placeholder where constant), BOOLEAN for optional parts (show hint, show optional, show tooltip, show close, show icon), INSTANCE_SWAP for icons. Every property must be wired to a layer (no dead properties, no property that hides the wrong layer).
- 100% bound: fills, strokes, padding, gap, radius, text styles, effect styles. No raw values, no remote variables/styles.
- Auto layout everywhere; instances set to Fill container in forms.
- Disabled = the component's own look at `opacity/disabled` (never recolor all types the same).
- Molecules/organisms nest atom instances and expose nested properties (`isExposedInstance`).
- Keep variant matrices sane: Button is **Type x Size x State** (5 x 5 x 6 = 150) with `Show Leading Icon` / `Show Trailing Icon` booleans and icon swaps; icon-only buttons are a separate **Icon Button** set. Never a variant per icon.
- **Property defaults overwrite variant content.** Binding a TEXT or INSTANCE_SWAP property resets that layer in every variant to the property default, so a variant-specific label or icon (Menu Item Danger "Delete", Badge status words, a Danger icon) is lost. Pick a default that suits every variant, or leave the variant-specific layer unbound (like the Button Loading spinner) and say so in the component description.
- **After cloning a variant inside a set** (to add a state), re-apply `componentPropertyReferences` on the clone's layers: clones silently lose their links to TEXT/BOOLEAN/INSTANCE_SWAP properties, and the dead-property scan still shows 0 because other variants use the property. Check property coverage per variant with `tools/check_bindings.figma.js`.

### Build notes (Plugin API)
- **`resize()` resets auto layout sizing to FIXED.** Call `resize()` first, then set `primaryAxisSizingMode` / `counterAxisSizingMode` (or `layoutSizingHorizontal/Vertical`) back to AUTO/HUG. Otherwise Toasts, Modals and other hug-height frames get a fixed height and cut text.
- Screenshot every set after building it; structure reads miss invisible states and cut text.

### Required inventory and states (Web)
| Tier | Component | Required variants / states |
|---|---|---|
| Atom | Button | Type Filled, Outline, Pill, Link, **Danger** · Size xs 32, sm 36, base 40, lg 48, xl 56 · State Default, Hover, Pressed, Focus, Disabled, Loading (150 variants) · icons via `Show Leading Icon` / `Show Trailing Icon` booleans + swaps, not a variant |
| Atom | Icon Button | icon-only buttons: Type x Size x State as Button, one Icon swap, accessible label in the description |
| Atom | Divider | Orientation Horizontal / Vertical · optional label (`Show Label` + Label text, e.g. "or") · bound to `border/default` |
| Atom | Checkbox, Radio | Unchecked, Checked, (Indeterminate), Hover, Focus, Error, Disabled (+ checked variants) · Radio groups hold 2 to 6 options; 7 or more -> Select / Dropdown (same number in both descriptions) |
| Atom | Toggle | On/Off x Default, Hover, Focus, Disabled |
| Atom | Badge | Info, Success, Warning, Error, Neutral · optional icon · sm/md |
| Atom | Avatar | Photo, Initials, Icon · 24, 32, 40, 60, 100 · optional status dot. Photo needs a sample image the user supplies (intake section 8); until then build Initials and Icon and list Photo as open |
| Atom | Tooltip | Arrow Up/Down/Left/Right · Small/Large (dark and light style) |
| Atom | Tabs / Item, Pagination / Item, Breadcrumb / Item, Menu / Item, OTP / Cell | Default, Hover, Active/Selected/Current, Focus, Disabled |
| Molecule | Input / Text (+ URL, Card Number, Password, Date, Phone) | Default, Hover, Focus, Filled, Error, Success, Disabled · label, optional, tooltip, hint, error |
| Molecule | Textarea, Search, Upload Field, OTP / Field, Stepper | same state set where applicable; Stepper uses Button instances |
| Molecule | Alert, Toast, Menu, Tab bar, Pagination bar, Breadcrumb, Avatar Upload | Status variants; built from atoms |
| Molecule | Nav Item | Icon + Label + optional Badge · Default, Hover, Active, Focus, Disabled · built before Sidebar and Top Bar (⭐Navigation > ➜ Navigation Bars) |
| Organism | Select / Dropdown, Confirmation Popup / Modal, Top bar, Sidebar | open/closed; exposed nested props; Top bar and Sidebar nest Nav Item |

Optional, built when the product needs them (Abdul, 2026-10-06, missing from the default reference, seen in Astryx). Ask at the gap table; never added silently:

| Tier | Component | Required variants / states |
|---|---|---|
| Molecule | Metadata List | label / value rows built from one `List / Item` row (the same row behind Menu and List): Default, Hover, Selected, Disabled · optional leading icon and trailing action slot |
| Organism | Tree List | nested rows with Expand / Collapse · Default, Hover, Selected, Focus, Disabled · indent per level from `space/*` |
| Organism | Command Palette | Search input + grouped results (`List / Item`) + keyboard hints · Empty, Loading, Results, No results |
| Molecule | Chat / Message | Role User / Assistant / System · State Default, Streaming, Error · slots for attachments and actions (copy, retry) |
| Molecule | Chat / Prompt Input | Textarea + attach + send; Send becomes Stop while streaming · Default, Focus, Disabled, Sending |
| Pattern | Chat / Thread | Message list + Prompt Input + suggestion chips (Filter Chip) · Empty (with suggestions), Conversation, Loading |

Required states follow this table, not a blanket rule: Pressed and Loading are required on Button (and Icon Button) only; other interactive atoms need Default, Hover, Focus, Disabled (+ Selected/Error where listed). Keep the project's `data/rules.json > components.required_states_interactive` in line with this table.

Hint text sits between label and field; error text below the field (12px), same in every input.

## 7. Theming and responsive
- Dark mode = switch the `Semantic` mode on the frame. No duplicate dark components.
- **Single-mode systems** (intake 0.4 = Light only or Dark only): the Semantic collection has one mode named after the answer (`Light` or `Dark`). Every "Light and Dark" requirement in this skill, the intake checkpoints, the audits, the docs pages and the Storybook quality bar means "each mode the project has": no dark preview frames, one swatch frame per collection on ➜ Colors, screenshots in that mode only, and contrast checked against that mode's surfaces only. For Dark only, the Dark mode is the master.
- Responsive = switch Typography/Spacing modes (Desktop/iPad/Mobile) + grid style.

## 8. Documentation pages (linked, never static)
- ➜ Colors: Primitive Light/Dark and Semantic Light/Dark frames; every swatch bound to its variable, card named with the variable path, hex label matching the resolved value. Add a card whenever a variable is added.
- ➜ Typography: every sample uses its text style (variables bound through the style); responsive table shows the real mode values.
- Shadows, Radius & Spacing, Grid, Icons pages show the real styles/variables with Tailwind class names.

## 9. Mistakes found in the default reference - never repeat them
1. Variables bound to other libraries (remote spacing, radius, colors, text styles, effect styles).
2. Raw values: radius 8/20, padding 8/12, gaps 6/10, hard-coded shadows and focus rings.
3. Generic or broken naming: `Property 1`, `Variant5`, `Status4`, `folled`, `Meduim`, `Large` + `large`, 4 variants all named `Default`, 3 sets with the same name, " 2" suffixes on tokens, mixed case.
4. Dead or mis-wired properties (Upload/Search props wired to nothing; a boolean hiding the whole input).
5. No descriptions on components or variables; no code syntax.
6. Icons drawn as vectors or text glyphs instead of Icon instances; no icon tokens; icon library bound to a border token.
7. Dark mode shipped as duplicate component sets.
8. Missing states: no hover/focus/error on checkbox, radio, toggle; no pressed/loading on buttons; no success on inputs; disabled buttons all pale blue with white text.
9. Weak focus (same-hue border on filled buttons).
10. Low contrast: muted/placeholder gray-400 (2.5:1), input borders gray-200/300, warning text yellow-500 on yellow-50.
11. Status components colored with button tokens.
12. Line height and letter spacing not bound in text styles; wrong sizes in style descriptions and on the Typography page.
13. Grid documented but no grid styles; `bg/overlay` opaque.
14. Molecules not built from atoms (stepper buttons, avatar upload, tab bars as plain frames); example bars not components.
15. Component using a different font (Inter) than the system font.
16. Missing components: danger button, dropdown menu, toast, breadcrumb, password/date fields, navbar/sidebar.

## Screens (Design files)
- Screens are built only from the published DS library, section by section (figma-generate-design + figma-use + ui-ux-pro-max), at the sizes in Design_System_Intake_Skill section 7d (Desktop 1440 wide, height at least 900, default 1024; Mobile 375 x 812; Brownfield keeps designed sizes). Impeccable leads the screen design: `shape` plans each screen before it is built, `critique` + `polish` (and `layout` / `typeset` / `colorize` when needed) run after it; ui-ux-pro-max is a second reference; figma-generate-design + figma-use do the Figma work; every decision snaps to DS components and variables (Design_System_Intake_Skill section 7e).
- **Screen fidelity (Abdul's rule):** follow Design_System_Intake_Skill section 7f (`Design_System_Intake_Skill/steps/screens.md`): screen spec from every source image first, real content in every instance, one section per script, side-by-side check after each screen (run in ds-auditor), `tools/check_screens.figma.js`, checkpoint stays `Ready for review` until the user approves.
- **Multi-screen flows (Abdul's rule):** follow Design_System_Intake_Skill section 7e (`steps/screens.md`) in order: approved gap table, missing components in the DS file, publish + Accept updates + verify, screens one by one with a Design file audit after each, changelog + Storybook question.
- **Scenario C, imperfect DS + Design file (Abdul's rule):** follow Design_System_Intake_Skill section 7 (`steps/brownfield-3-scenario-c.md`) in order: Variable Map, DS fixes (safe ones as Fix on create, the rest after approval) + publish, screen-by-screen audit report, raw-value rules, fixes after approval, log + Accept updates. Web mapping: raw values map to the Tailwind-style scales in section 3 (`space/*` n x 4px, `radius/*`), colors to `color/{group}/{role}`; states (hover, focus, active) found as raw colors map to their state tokens.
- **Scenario D, Code to Design (Abdul's rule, 2026-10-05):** follow Design_System_Intake_Skill section 6 (`steps/code-to-design.md`). The code (repo routes, popups, states, texts, icons) is the source of the screens; a live preview is a visual reference only. Branch a, existing DS: the DS is read only except the editable page the user names; reuse its components and variables first, map every code value to the nearest DS token, add only missing components on that page (lowest tier first), report DS issues instead of fixing them, ask before each publish, build screens in the linked Design file, keep the user's manual edits, audit after each step. Branch b, new DS: Primitives and Semantics from the code's tokens, then this skill's build order and components, then screens per module. Web mapping: Tailwind config and CSS variables (shadcn `:root` / `.dark`) map to Primitives and `color/{group}/{role}` Semantics, Tailwind spacing and radius to `space/*` and `radius/*`, `hover:` / `focus-visible:` / `active:` / `disabled:` classes to the component states, Lucide icons to the Icon set; routes are Desktop 1440 / Mobile 375 screens, Dialog / Sheet / Popover are popups.
- **Design file audit (Abdul's rule, every time screens are built or changed):** run audit-design-system (ds-auditor, `screens` mode) on that Design file to confirm it really uses the DS: library components only (no local copies, detached instances or hand-drawn parts), library variables and styles only (no raw values, no variables used for the wrong purpose), latest library version. Fix what it finds, save the report in `<Project folder>/audits/`, and log the result in `CHANGELOG.md` (`Design file audit: <numbers>, report <path>`).

## 10. Final QA checklist (run before handing over)
- [ ] 0 remote variables/styles; 0 raw fills/strokes/padding/gap/radius in components.
- [ ] Every variable: scope, code syntax, description. Every set: description, Title Case properties, wired props.
- [ ] Every component has Hover/Focus/Disabled (+ Error/Success where relevant); focus visible (focus-ring styles).
- [ ] Contrast: text >= 4.5:1, UI boundaries >= 3:1, in each mode (Light and Dark, or the single mode).
- [ ] Icons are instances with swap properties; icon colors from `color/icon/*`.
- [ ] ➜ App Icon exists in ⭐Setup (drop zones, or the presented icon with every size frame exporting its file).
- [ ] Dark previews are instances in Dark-mode frames; Colors/Typography docs linked.
- [ ] Screenshot every variant (light + dark) and compare against the description.
- [ ] Save a version in history after each phase; write Foundation_Skill and Component_Skills per group.
- [ ] `tokens.json > recolor_readiness.ready` is true (0 raw hex in Semantic/Brand tokens) and a test run of `tools/recolor.py` on the brand ramp shows no NEW contrast failures.
- [ ] `data/tokens.json`, `component-registry.json`, `rules.json`, `screen-templates.json` and `docs/decisions.md` are generated for the new DS.
- [ ] `python tools/fix_tokens.py <folder>` returns an empty plan (0 operations).

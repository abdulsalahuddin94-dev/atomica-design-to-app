# Screens Handoff Skill (trial: The Live Prototype)

Status: **trial, not part of the workflow yet**. Nothing here is loaded by the intake, the Main Skills or the dashboard until Abdul approves the trial.

Goal: turn the finished screens of a Design file into a live, clickable prototype that a developer can open, built only from the project's own design system (its tokens and its Storybook React components), and carry review comments back into Figma.

Trial project: Music App (Android, Brownfield), flow **Listen**.

## Steps (go / no-go after each)

Each step ends with a report to Abdul and a go / no-go answer. Nothing moves to the next step without his go. No self-approval.

1. **Local prototype from Figma.** `tools/screens_export.figma.js` (read-only) exports each screen of the flow as a tree of DS instances (main component, variant properties, text overrides, auto layout, sizes) plus its prototype reactions (routes, overlays) into `data/screens.json`. `tools/build_prototype.py` generates the screens and routes into a copy of `templates/prototype/` (Vite + React + TypeScript + Tailwind v4, `@theme` from the project's `data/tokens.json`, the project's Storybook components reused, never re-created). Android device frame, Light/Dark and EN/AR toggles, flow list on the left; every element carries `data-figma-node` and `data-component`. Fidelity check: each prototype screen against the Figma export of the same frame, Light and Dark, up to 3 fix rounds. Runs locally only; nothing is published.
2. **Every mode.** All screens of the flow in Light/Dark and EN/AR (RTL), with the prototype interactions from Figma (navigate, overlays, back).
3. **Code handoff.** A Code panel per screen with reference code for Jetpack Compose, SwiftUI, Flutter, React Native and React (Web), using only the real DS names (component, property and token names derived from Figma, as in the Storybook). Generated, never written by an LLM at runtime.
4. **Comment round trip.** A reviewer comments on an element in the prototype; the comment lands in Figma on the matching node (`data-figma-node`), and a fix in Figma regenerates the prototype.
5. **Decide.** Measure tokens and time, compare with building the same screens by hand, and decide whether this becomes a workflow step (intake, decisions, dashboard).

## Success criteria

- Fidelity **>= 98%** per screen on the Music App Listen screens (prototype vs Figma export, same size and mode), measured with the **1px-tolerant score** (Abdul, 2026-10-22): a pixel matches when the prototype has a close colour within 1px, so browser text anti-aliasing and sub-pixel line placement do not count as design differences. The strict score (pixelmatch, threshold 0.1) is always reported next to it. Both come from `scripts/fidelity.mjs`.
- Light and Dark, EN and AR (RTL) all render correctly.
- The reference code (every platform) uses only names that exist in the DS and no raw values: the check reports unknown names 0 and raw values 0.
- One comment completes the round trip prototype -> Figma -> prototype.

## How step 1 runs

```
node tools/screens_export.cjs --file "<Design file>" --page <page> --png --out "My Projects/<Project>/prototype/data"
python tools/build_prototype.py "My Projects/<Project>" --flow <flow name>
npm --prefix "My Projects/<Project>/prototype" install      (first time)
npm --prefix "My Projects/<Project>/prototype" run dev       (http://localhost:5190)
node scripts/fidelity.mjs --shots <folder>                   (in the prototype folder, while dev runs)
node scripts/check_live.mjs --url <local or live URL>         (every screen x mode x language, desktop + phone, navigation, Inspect, Code panel; --code-only for the panel alone)
node tools/publish_prototype.cjs "My Projects/<Project>" --repo <owner>/<name> [--create]
node tools/prototype_comments.cjs "My Projects/<Project>" --schema | --pull | --resolve <id>
```

Step 2 (publish): `tools/publish_prototype.cjs` builds for the repo's sub-path, refuses to publish anything that looks like a secret, pushes the build to the `gh-pages` branch (normal commit, never a force push; no Actions workflow, so no `workflow` token scope), turns Pages on and prints the URL. `--create` makes a public repo with a short README, only after the user's yes. At phone width the prototype drops the phone frame, shows a screen picker and scales the screen to the width; Inspect works by tap.

Step 3 (code panel): `tools/build_prototype.py` ends by running `tools/screen_code.py` (also runnable alone). It is deterministic: the same `data/screens.json` always gives the same code, no LLM is called.
- `data/code_map.json` in the project: every DS component (name, properties, variant values), token, text style and icon -> what developers type per platform. Names come from `tools/platform_names.py` (`screen_component`, `screen_prop`, `screen_enum`, `screen_token`, `screen_text_style`, `screen_icon`; Flutter and React Native added there). A Code Connect map in `data/code-connect.json` (`{"<Figma component>": {"compose": "Name", ...}}`) wins over the derived component names when it exists.
- `prototype/public/code/<slug>.json`: per platform the code and the line range of every Figma node. Layout comes from the Figma auto layout (Column / Row, VStack / HStack, flex) with spacing, padding and colours as DS tokens; instances become DS component calls with their variant, property, nested item (First Item, Second Tab ...) and adapter values; links from `adapters.json` / the Figma reactions become `navigate("<screen>")`.
- Platform names: Compose `MaterialTheme.colorScheme.surface`, `AppTheme.spacing.spacing16`, `MaterialTheme.shapes.medium`, enums `MediaCardSize.Large`; SwiftUI `DS.Colors.surface`, `DS.Spacing.spacing16`, `.large`; Flutter `Theme.of(context).colorScheme.surface`, `AppSpacing.spacing16`; React Native `tokens.color.surface`; React (Web) the Storybook components with their Figma property names and the DS CSS variables (`var(--md-sys-spacing-16)`), no Tailwind classes.
- Check (fails the build step when not 0 / 0): every component, token, text style and icon the generator used exists in the DS, and a scan of the finished code finds no name outside `code_map` plus each platform's layout primitives (Column, VStack, View ...) and no raw colour or size (hex, `0x`, `dp` / `px` / `pt` / `sp` literals). Texts are content and are skipped.
- Toolbar (shell chrome, 2026-10-25, Abdul): one dark floating bar above the device (#1E1E1E, 1px #333 border, radius 12, 32px controls, 13px medium, thin dividers): Light/Dark (sun / moon) and EN/AR as segmented controls with a filled active segment, Inspect and Code as toggles with an icon, an accent outline when on, tooltips, `aria-pressed` and a keyboard focus ring; icon-only at phone width. The phone frame scales down when the side list and the Code panel leave less room, so the canvas never scrolls sideways.
- Arabic (2026-10-25, Abdul: AR must translate, not only flip): `tools/prototype_strings.py` (run by `screen_code.py`) collects every UI string of the export into the project's `data/strings/en.json` (readable keys: `your_library`, `explore_caps` ...; the screens that use each key). `data/strings/content.json` lists what is content (song, artist, playlist and podcast names, episode descriptions): it stays as it is in every language. `data/strings/ar.json` holds the translations by key; people edit it, the tool never overwrites it and lists missing keys. The prototype swaps the rendered UI strings for Arabic (`src/shell/i18n.ts`, `public/strings/ar.json`), so the DS components need no language prop; EN restores the text. Western digits as in the design. Directional icons (`arrow_back`, `queue_music`, `lyrics`, `sort`) mirror in RTL; Playback Controls and Playback Progress stay left to right (media controls follow the tape, not the text). The Storybook `Icon` carries `data-icon` for this. Figma stays the English source for now; a Language variable collection in Figma can later make Figma the source of the translations.
- Reference code uses string resources for UI strings (Compose `stringResource(R.string.key)`, SwiftUI `String(localized: "key")`, Flutter `AppLocalizations.of(context)!.key`, React Native / React `t('key')`); content stays a literal (the app gets it from its data). The check also fails on a resource key that is not in `en.json`. A sixth tab, **Strings (EN/AR)**, shows the keys of the screen with both languages.
- Code view: a string literal with Arabic is isolated (`<bdi>`) so its quotes and punctuation stay in place in the left-to-right line; Copy takes the code text unchanged (no control characters).
- Empty frames that only hold space become Spacers with the DS spacing token of their width (row) or height (column); a one-off size snaps to the nearest spacing step within 4 (reported as "Snapped"), else it counts as a raw value.
- Panel: **Code** button in the toolbar; platform tabs (the project's platform first), **Copy**, the label "Reference code, not production code"; with Inspect on, a tapped element highlights its lines (the element's Figma node, else its nearest parent's). Side panel on desktop, bottom sheet at phone width; follows Light/Dark; the code stays left to right in AR; long lines wrap, so nothing scrolls sideways.

`<Project>/prototype/adapters.json` (optional, project-specific) maps what the Storybook components take beyond the Figma properties (photos, nested texts) and the links between screens when the Figma file has no prototype reactions. Spec language: `tx:<layer>`, `tx*:<layer>` (all numbered copies), `img`, `ni:<layer>.c|v`, `v:<variant>`, `p:<property>`, `w:` / `h:`, `{"eq": [spec, value]}`, `{"const": x}`, `{"zip": {...}}`; events `"screen:<name>"`, `"overlay:<name>"`, `"back"`, `{"by_index": {...}}`; `instances` adapts one layer name.

## Step 1 results (Music App, Listen, 2026-10-22)

8 screens x Light/Dark, 0 components missing from Storybook, 0 raw values, Light and Dark frames identical in structure. Fidelity = matching pixels (pixelmatch, threshold 0.1) on the Figma frame's size:

| Screen | Dark | Light |
|---|---|---|
| Explore - Full | 97.64% | 97.09% |
| Explore - Viewport | 97.65% | 97.31% |
| Search & Discover - Full | 97.95% | 97.99% |
| Search & Discover - Viewport | 97.98% | 97.92% |
| Library - Music | 97.99% | 97.79% |
| Library - Podcasts | 94.42% | 93.97% |
| Now Playing | 98.22% | 98.19% |
| Lyrics | 96.68% | 96.55% |
| **Average** | | **97.21%** |

Round 1 was about 85% (missing photos, Section Header height). Every remaining difference is inside a Storybook component, i.e. the project's Storybook drifted from Figma; the fix belongs in the Storybook, not in the prototype:
1. Player Utility Bar: Figma pads it 24 and aligns items to the top when it is 375 wide; Storybook centres with no padding (Now Playing, Lyrics).
2. Track Metadata and Library Shortcut Tile: Figma wraps titles to 2 lines, Storybook truncates to 1 (Podcasts).
3. Progress Indicator inside Podcast Episode Card: Figma shows the grey track, Storybook the lime fill.
4. Section Header: Storybook min-height 36; Figma hugs to 24 when More is off (the prototype now takes Figma's height for every hugging instance).
5. Top App Bar: no image prop for the profile Avatar.
6. Now Playing title: a larger text style on a nested layer, an override the Storybook component cannot take.

### After fixing the 6 gaps in the project Storybook (2026-10-22, Abdul's choice)

Main-component gaps fixed in the Storybook (Utility Bar items at the top, Tile label wraps, Section Header hugs, Top App Bar `image`); instance overrides carried by the export (`ts` text styles, `ml` max lines, `hid` hidden layers, `il` the instance's own auto layout) and taken by new lower-case override props, or, for padding, applied by the prototype when it differs from the main component in `data/figma-styles.json`. Storybook style check 100% (0 differences; Button strokes are now inset rings, and `tools/storybook_snap.cjs` reads such a ring as the stroke).

| Screen | Dark | Light | Dark, 1px-tolerant | Light, 1px-tolerant |
|---|---|---|---|---|
| Explore - Full | 97.77% | 96.97% | 98.99% | 98.22% |
| Explore - Viewport | 97.91% | 97.58% | 99.10% | 98.74% |
| Search & Discover - Full | 97.95% | 97.99% | 99.28% | 99.27% |
| Search & Discover - Viewport | 97.98% | 97.92% | 99.20% | 99.15% |
| Library - Music | 98.19% | 97.97% | 98.90% | 98.65% |
| Library - Podcasts | 94.98% | 94.65% | 97.72% | 97.30% |
| Now Playing | 98.75% | 98.67% | 99.29% | 99.20% |
| Lyrics | 97.84% | 97.70% | 98.61% | 98.37% |
| **Average** | | **97.55%** | | **98.75%** |

What is left is no longer a component difference: text anti-aliasing (the browser and Figma rasterize glyphs differently) and 1-2px sub-pixel line placement, which the strict score counts on every glyph edge, so text-dense screens score lowest (Library - Podcasts). The 1px-tolerant score counts a pixel as matching when the prototype has a close colour within 1px.

## Step 3 results (Music App, Listen, 2026-10-25)

8 screens x 5 platforms, `data/code_map.json` with 40 components, 255 tokens and 38 icons (no Code Connect map in this project, so names are derived from Figma). Check: unknown names 0, raw values 0. Live check: 80 code views (8 screens x 5 platforms x desktop and phone), Inspect -> highlight on every platform, Copy, Light/Dark, EN/AR, no sideways scroll.

## Fixed bars and the Top App Bar (2026-10-25, Abdul)

- **Fixed elements come from Figma, never from CSS picked by hand.** `screens_export.figma.js` records each node's scroll behaviour (`sb`: FIXED = "Fix position when scrolling") next to absolute positioning (`abs`). `build_prototype.py` (`pins()`) pins the children of a screen frame that Figma fixes or positions absolutely against the frame's bottom (or top) edge, plus the absolute children stacked on them within 16px (the Mini Player above the Bottom Navigation). They render as a sticky dock that stays at the bottom of the screen while the content scrolls; the dock takes its own height, so nothing ends up behind it at the end of the scroll, and the gap between its items is the Figma distance as a spacing token (4 -> `spacing4`). The screen frame clips with `overflow: clip` (hidden would stop the dock from sticking). The Code panel follows: Compose `Scaffold(bottomBar)` with the content in a scrolling column padded by `innerPadding`, SwiftUI `.safeAreaInset(edge: .bottom)`, Flutter `Scaffold(bottomNavigationBar:)`, React Native / React a column with a scrolling area and the dock under it. `check_live.mjs` scrolls every screen with a dock to the middle and the end (dock at the bottom, no content hidden).
- **Top App Bar drift (the prototype showed it):** Abdul's reference is the Figma Explore Full Light frame, whose Top App Bar instance aligns the actions at the right edge (`SPACE_BETWEEN`). The Top App Bar main component and the other Explore frames pack the actions after the title (`MIN`), and the Storybook copied the main component. Before: title x16, Notifications 121, Community 173, Profile 225 (48 boxes, 4 apart). After (Storybook `justify-content: space-between`): Notifications 207, Community 259, Profile 311, avatar right edge 359 = 375 - 16, the reference frame's positions. Top-bar fidelity on that frame: 91.03% -> 98.24%; the three frames that still pack the actions in Figma score about 91% against their own exports. Abdul's decision (2026-10-25): Figma stays as it is; those three frames (Explore Full Dark, Explore Viewport Dark and Light) are a known, accepted design difference and are left out of the fidelity failure count, with this note. Lesson: a per-frame instance override that differs between the Light and Dark frames is invisible in a prototype that renders one tree; the build report should list layout overrides that differ between modes.

## Step 4: comments (2026-10-25, in progress)

- **Overlay:** a **Comment** toggle in the toolbar (it closes Code and Inspect). A tap on the screen drops a pin and opens a small form (name optional, text); the comment keeps the screen, the element's `data-figma-node` and DS component, theme, language, viewport and the pin position in Figma pixels. The Comments panel lists the screen's comments (resolved ones hidden unless "Show resolved"); pins mirror when the comment was made in the other text direction. Side panel on desktop, bottom sheet at phone width. Reviewers need no account.
- **Store:** with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (shared `~/.atomica/supabase.env`, or the project's git-ignored `prototype/.env.local`) the page talks to the Supabase REST API with the public anon key (no client library); without them it keeps comments in the browser ("Local test store"), so the overlay works before Supabase exists.
- **Supabase:** `node tools/prototype_comments.cjs "My Projects/<Project>" --schema` writes `prototype/supabase/schema.sql` from `templates/supabase/schema.sql` (table `prototype_comments` for every project; RLS: anon may read and add open comments with a valid project slug; no anon update or delete). Run it once in the Supabase SQL Editor; running it again only replaces the policies.
- **Triage:** `--pull` writes `prototype/comments/inbox.json` and `inbox.md` (open comments by screen, then component and Figma node; each with its id and "Triage: fix / decision / info"); `--resolve <id>` marks one resolved. Both use `SUPABASE_SERVICE_KEY` from the same `.env.local`; it is never printed, never committed, and `publish_prototype.cjs` refuses to publish a build that contains it (Vite only exposes `VITE_*` values). Nothing is applied to Figma without the owner's approval of the triage.
- **Test before Supabase:** `node tools/mock_supabase.cjs --project <slug> [--store <file>]` is a local stand-in for the REST API with the same rules (test keys `mock-anon-key` / `mock-service-key`); build with `vite build --mode mock` and a `.env.mock` pointing at it. `check_live.mjs --comments` posts one test comment per device and checks the form, pin, metadata, the shared list in a second browser and the layout.
- **Workflow (the loop):**
  1. *Setup, once per device (not per project):* one free Supabase project serves every Atomica project; rows are kept apart by the project slug. The owner creates it, runs `schema.sql` (from `--schema`) once in its SQL Editor and types the keys into `%USERPROFILE%\.atomica\supabase.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` = the publishable key, `SUPABASE_SERVICE_KEY` = the secret key; the new `sb_publishable_` / `sb_secret_` keys and the legacy JWT keys both work). Keys are never pasted in a chat, a thread or a commit. **New projects need zero Supabase steps:** `publish_prototype.cjs` builds with the shared public URL and key and `prototype_comments.cjs` reads the shared file; a project's own `prototype/.env.local` overrides it when a project needs its own Supabase. The panel then says "Shared with everyone who opens this link".
  2. *Review (anyone with the link, no account):* Comment, tap the element, write, Post. Pins stay on the element in both text directions.
  3. *Triage (Claude, in the owner's session):* `--pull`, then one table per comment: screen, component and Figma node, what was said, the proposed answer (fix in the DS, fix in the screen, decision for the owner, or info only) and where it changes (DS file, Design file, Storybook, prototype data). The owner approves or edits the list; nothing is changed before that.
  4. *Fix:* approved items are fixed at the source (Figma through the usual build rules and audit; a Storybook gap in the Storybook), then the prototype is rebuilt and republished.
  5. *Close:* `--resolve <id>` for each comment that was fixed, after the fix is live; resolved comments leave the reviewers' list (still under "Show resolved").
- **Applying approved comments, code-first (Abdul, 2026-10-25):** an approved change can land in the prototype before Figma. `data/screens.json` stays the pure Figma export; the change goes into `prototype/data/overrides.json` (`op: remove` with Figma node ids, `close_gap` to shorten the frame so pinned bars stay at the bottom; each change names its comment and is described in words), which `load_screens()` applies for the generator, the Code panel and the strings. `status.json > prototype` marks the screen `source: "code"` and lists the change in `pending_figma_sync`; the build prints "Code ahead of Figma (pending sync)" and `fidelity.mjs` reports those screens as such, not as failures. **Sync to Figma** (on the owner's word): apply the listed changes in Figma (FigCli), re-export; the override's nodes are then gone from the export and it reports "synced"; set `source` back to "figma" and empty the list. The comment is resolved with `--resolve <id> --reply "..."` (the reply shows under the comment for the reviewer).
- **Static Viewport frames:** a screen frame no taller than the device (`adapters.json` viewport, 812) is one static screen in Figma; the prototype shows it at its Figma height without scrolling, bars over the content as in Figma (at phone width it scales to fit). Taller ("Full") frames scroll with the docked bars. From Ahmed's comment on Explore - Viewport; Viewport fidelity 98.23% / 97.85% (Dark / Light, 1px-tolerant).
- Results on Supabase (Music App, 2026-10-25): the published prototype posts to the test project from desktop and phone (Dark / AR), a second browser sees the comments, `--pull` writes the inbox, `--resolve` closes a comment; with the publishable key an update, a delete or a resolved insert is refused (401 / RLS) and the row stays open; the secret key is not in the bundle. A refresh that started before a post finished used to drop the new pin for up to 20 s; the page now keeps its own recent posts when a refresh returns.
- Results with the mock: comments posted and read back on desktop and phone (Dark / AR), a second browser sees them, `--pull` and `--resolve` work, resolved comments are hidden by default; the anon key cannot update, delete, post to another project or post a resolved comment (403), no key is refused (401); the service key is not in the bundle.

## Lessons from step 1
- FigCli eval output stops at 20,000 characters: big screens are read shallow, then child by child (Explore Full = 14 calls).
- FigCli `export node` hangs on layers inside instances, and every export (FigCli or `exportAsync`) cuts a layer at its clipping parent. Screens rebuilt from screenshots use one source image cropped many times (`scaleMode CROP`): read each layer's hash and transform, fetch each source once by hash, cut the crops locally (Pillow). Never take "the first image paint": hidden paints sit under the visible one.
- A hidden Figma tab (another window on top, or minimized) makes node and image reads fail with "Unable to establish connection to Figma after 10 seconds"; reading image bytes by hash still works. Ask for the tab in front before image work.
- JSX attribute strings take no escapes: strings with quotes go in `{...}`.
- Git Bash rewrites an argument that starts with `/` into a Windows path (`--base /name/` became `C:/Program Files/Git/name/`). Run Vite from Node (`tools/publish_prototype.cjs`) or set `MSYS_NO_PATHCONV=1`; check the built `index.html` asset paths.
- Running `npx` through `execFileSync(..., { shell: true })` prints Node's DEP0190 warning; call `node node_modules/vite/bin/vite.js` with `process.execPath` instead (no shell).
- Step 3: the prototype has no Tailwind preflight, so new shell buttons keep the browser's grey background and black text (unreadable in Dark). Reset them in `@layer base`, never unlayered (an unlayered rule beats the Tailwind size classes).
- No preflight also means no `box-sizing: border-box`: a `w-full` row with padding is wider than its parent and gives the canvas a sideways scrollbar. Shell rows that are `w-full` and padded take `box-border`; the check compares `main.scrollWidth` with its width.
- Edge's SmartScreen blocked the new github.io site with "Reported Unsafe Site" a day after publishing, while Chrome opened it. `check_live.mjs` uses Chrome first; the owner reports the false positive to Microsoft.
- The reference-code tree is shared by the five renderers: platform details (a Compose modifier, an RN style) are passed as arguments, never stored on the tree, or they leak into the next platform.

## Rules for the trial
- No hover on mobile (Abdul, 2026-10-28): for a mobile project the prototype drops every `:hover` rule of the DS styles inside the device (Vite step in `templates/prototype/vite.config.ts`, from `ds.config.json > mobile`); Pressed (`:active`) stays the tap feedback. The shell's own controls keep hover (desktop pointer). Check: `node tools/check_no_hover.cjs "My Projects/<Project>"`.

- All work happens in this branch's worktree; the Root stays on `master`.
- Generated output for a real project stays outside the repo's tracked files (in the project's own folder under `My Projects/`, or in the git-ignored `.trial/`).
- Figma is read only in step 1 (FigCli Yolo, `FIGMA_FILE` set to the exact file name).
- `memory/decisions.md`, the intake files and the dashboard are not changed until the trial is approved.

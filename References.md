# References

## Reference library (duplicate, never edit the originals)

The workflow learns from studied design systems and can start a project from one of them. They are listed in `references.json` (Root): one entry per company and platform (`web`, `ios`, `android`, `cross-platform`), each with its folder of study skills, Figma link and optional Storybook. `default` picks the entry used per platform when the user does not choose. Skills, the intake and tools read `references.json`; they never name a company.

Current entries (from `references.json`):

| Entry | Platform | Figma file | Study folder |
|---|---|---|---|
| Web Library | Web | https://www.figma.com/design/7qsOqckanKwGDbkljD3rb9/Web-Library | `Reference_Library/Library/Web/` |
| iOS Library | iOS | https://www.figma.com/design/q5nQHGEGzZ94WN0wilJwLW/iOS-Library | `Reference_Library/Library/iOS/` |
| Android Library | Android (M3) | https://www.figma.com/design/JUs2c8IO6ybFcGRZjcQzr9/Android-Library | `Reference_Library/Library/Android/` |
| Astryx Library DS | Web (second template, not default) | https://www.figma.com/design/kiygMAdfsXmLfxlP8i7ueN/Astryx-Library-DS | `Reference_Library/Astryx/Web/` |

How to start from a reference template:
1. Open the link and choose **Duplicate** (the copy lands in your drafts).
2. Move the copy to your project folder in Figma and rename it `<Project> Design System`.
3. Give the link to Claude in the intake (Greenfield > "Start from a reference template").

Rules:
- Each entry's skills describe what is in its file and list its known gaps (`references/gaps.md`). Fix those gaps in your copy.
- Node IDs written in a reference's skills belong to its original file only. A duplicate gets new IDs, so Claude finds everything by component, style and variable **name**.
- You need view access to the originals to duplicate them.

## Adding a design system to the library (`/study-reference-ds`)
Say "study this design system" with the company name, the platform(s) and the Figma link(s).

**Figma required, code optional (Abdul, 2026-11-10):**
- An entry needs a public Figma file; the Figma link is required. Figma gives the structure: page layout, component and variant split, properties and slots, docs, and screenshots of every variant.
- A GitHub (code) link is optional and asked for after the Figma link. When given, it enriches the study: exact token values, prop names for the description `Code:` line, states and behavior, accessibility rules. Figma wins on structure; code wins on exact values when they differ (note each difference in `docs/decisions.md`).
- A design system with no public Figma file is not added here as a structure reference. It can still be a code reference (`tokens.json` / `AGENTS.md` for Code first, or a source for Scenario D, Code to Design). If a Figma file is ever built from its code, its entry gets `"source": "built-from-code"`: it is our interpretation, not the original team's structure.
 One run per platform; a company with Web, iOS, Android and cross-platform files gets four entries, studied one per session (token budget). Nothing here touches the original Figma file: it is read only, and the guard hook asks before any write to it.
1. **Register and scaffold.** `python tools/add_reference.py --company "<Company>" --platform <web|ios|android|cross-platform> --name "<Figma file name>" --figma-url <link> [--github-url <repo link>] [--source built-from-code] [--default]`. It creates `Reference_Library/<Company>/<Platform>/` (Foundation_Skill, Component_Skills for Form Elements, Navigation and Data Display, `data/`, `docs/`), marks the original file key off-limits and adds the entry to `references.json` with `status: "studying"`.
2. **Open the file.** The user opens it in Figma Desktop with FigCli Yolo (`FIGMA_FILE` set to its exact name) or the Desktop Bridge; confirm the file key (or, when FigCli cannot read it, the exact name) matches the entry.
3. **Code (only with a GitHub link):** read the repo's token files and component props first, so the Figma study can compare against them; it never replaces the Figma study.
4. **Study the Setup group first:** page structure, variables (`token-extractor` -> `data/source/figma-variables.dtcg.json`, `data/source/config.json`, then `python tools/build_tokens.py <folder>`), text and effect styles, icons. Write `Foundation_Skill` (SKILL.md, references/variables.md, gaps.md).
5. **Study each component group** (⭐Form Elements, ⭐Navigation, ⭐Data Display): every component's purpose, variants, properties, states, nesting and tier, with Light and Dark screenshots of every variant (in `ds-auditor` / `docs-writer` so images stay out of the main session). Write each Component_Skill (SKILL.md, references/components.md, gaps.md) and `data/component-registry.json`, `data/rules.json`, `data/screen-templates.json`, `docs/decisions.md`.
6. **Compare with the platform Main Skill.** Mistakes the file makes go into its `gaps.md`; a lesson that applies to every project goes into the Main Skill (section 9 or 10) without the company name.
7. **Ready.** Set the entry's `status` to `"ready"` (and `default` if it should be the platform default), update `memory/references.md`, log it and commit.

**A user's own design system (Abdul, 2026-11-09):** a company DS that is not public is studied the same way but into `My References/<Company>/<Platform>/` with its own `My References/references.json` (git-ignored, this repo is public), never into `Reference_Library/`. Every project on that computer can use it (intake 16.2, Greenfield 3.1 / 3.2). It moves to the public library only after the user confirms it may be shared. Details: `Design_System_Intake_Skill/steps/vibe-code.md` 16.3.

What users see afterwards: Greenfield 3.1 offers "Start from a reference template"; when a platform has more than one ready entry, a menu lists them by `name` with the default first (Recommended). Entries still `studying` are never offered.

Rules: platforms stay independent (one entry per platform, nothing shared or merged between entries); a cross-platform entry (one shared design for Flutter / React Native custom UI) is offered when intake 1.3 picks cross-platform; never edit the original file.

## Code references and the study queue (Abdul, 2026-11-10)
- `Reference_Library/code_references.json`: a catalog of public design systems with a GitHub repo (repo links, license, platforms, whether a public Figma file exists). Not studied and never offered in the intake menus. Used for exact token values, prop names, states, accessibility and AGENTS.md ideas in Code first and Scenario D. Only `license_ok: true` repos are read for values; a brand look is never copied.
- `Reference_Library/study_queue.md`: the systems with a public Figma file, in study order (mobile first). Abdul opens one link every day or two; Claude studies it with `/study-reference-ds` and marks the row `studied`.

## Platform quality skills (optional)
Not Figma kits: agent skills that guide decisions (component choice, states, accessibility, polish). Values they suggest still map to the project's tokens. How each is used: section 11 of the iOS and Android Main Skills.
- iOS: heyimjames iOS Design Engineering Skills (MIT): https://github.com/heyimjames/ios-design-skills. Its Figma-relevant rules are already in `iOS_Design_System_Skill/references/ios-polish.md`; the plugin is optional.
- Android: material-design-3-ui (MIT): https://github.com/skydashnet/material-design-3-ui-skill
- Android exact M3 values: material-components-android `tokens.xml` files: https://github.com/material-components/material-components-android (Views, maintenance mode; Compose Material 3 is current)

## Adopted agent-skill guides (2026-10-11)
Parts of public MIT agent-skill repos, adapted and kept in this repo (no install needed). Index: `Workflow_References/README.md`; licenses: `Workflow_References/licenses/`.
- schudarin/chudarin-figma-skills: https://github.com/schudarin/chudarin-figma-skills (Plugin API rules, fix variable bindings, user flows, UX rules)
- natdexterra/work-with-design-systems: https://github.com/natdexterra/work-with-design-systems (readiness score, component description template, AGENTS.md export)
- murphytrueman/design-system-ops: https://github.com/murphytrueman/design-system-ops (deprecation, decision records, AI readiness)
- MUZEEBURRAHAMAN/design-system-skills: https://github.com/MUZEEBURRAHAMAN/design-system-skills (DESIGN.md, drift score)
- michaelwnau/figma-design-system-engineering: https://github.com/michaelwnau/figma-design-system-engineering (token name linter)
- Seen but not adopted: senlindesign/claude2figma (its post-write hook only echoes a reminder; our `DS.readBack` check replaces it), lifesized/figma-design-sync and christinevall/skills (code to Figma; our Figma is the source).

## Figma tooling
Setup guide, which tool fits which step, Yolo setup and risks, switching: `Figma_Tools/README.md`.
- figma-console-mcp: https://github.com/southleft/figma-console-mcp
- figma-cli: https://github.com/silships/figma-cli

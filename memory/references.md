---
name: references
description: Reference library of studied design systems (references.json): entries, Figma file keys, folders, known open items
type: reference
updated: 2026-10-06
---

# Reference library

Studied design systems live in one library indexed by `references.json` (Root): one entry per company and platform (`web`, `ios`, `android`, `cross-platform`), with folder, Figma file key and link, Storybook and a per-platform `default`. Skills, intake and docs read the entry and never hardcode a company name (Abdul, 2026-10-01: more companies' systems, for all three platforms and cross-platform, will be studied later). Human list and "how to add one": `References.md`. Never edit the originals; duplicate them.

Current entries (the Library entries are the default for all three platforms; Astryx is a second Web template):

| Entry id | Figma file key | Folder |
|---|---|---|
| `web-library` | `7qsOqckanKwGDbkljD3rb9` | `Reference_Library/Library/Web/` |
| `ios-library` | `q5nQHGEGzZ94WN0wilJwLW` | `Reference_Library/Library/iOS/` |
| `android-library` | `JUs2c8IO6ybFcGRZjcQzr9` | `Reference_Library/Library/Android/` |
| `astryx-web` | `kiygMAdfsXmLfxlP8i7ueN` (Abdul's duplicate of the Astryx community file) | `Reference_Library/Astryx/Web/` |

Each folder has `Foundation_Skill/` and `Component_Skills/{Form_Elements,Navigation,Data_Display}_Skill/` (SKILL.md, references/components.md, gaps.md, screens/), plus `data/` (tokens.json, component-registry.json, rules.json, screen-templates.json, source/). Tools: `tools/build_tokens.py`, `tools/recolor.py` (see `tools/README.md`). New companies go in `Reference_Library/<Company>/<Platform>/` (`tools/add_reference.py`); the custom-built folders moved there on 2026-10-01 (Abdul).

Figma required, code optional (Abdul, 2026-11-10): an entry needs a public Figma file; `github_url` and `source` (`figma` / `built-from-code`) are optional fields. Code-only systems: `Reference_Library/code_references.json` (68, licenses checked 2026-11-10; NL Design System added 2026-11-12). Study order for new entries: `Reference_Library/study_queue.md` (mark each row `studied` with the date).

Astryx (studied 2026-10-06, read only, FigCli Yolo): code-first library (React + StyleX) synced to Figma by an agent; best for coverage, slots, AI chat kit, multi-brand themes (extended collections). No Primitives, ALL_SCOPES, Dark broken on 10 components, so always Fix on create. Lessons for our workflow are proposals in `Reference_Library/Astryx/Web/docs/decisions.md` (not yet adopted). No Dark screenshots: Abdul decided they are not needed (2026-10-06); Dark is inferred from the computed contrast in `component-registry.json`.

Open items:
- `data/` files were built from the skill reference files, not a live export (`needs_resync: true`). Re-export with figma-console `figma_export_tokens` when the file is open in the Desktop Bridge (token-extractor subagent).
- `gaps.md` in each skill is the refactor backlog for that entry's file.

Storybook (Web proof, 2026-09-30): `web-library` entry, `Reference_Library/Library/Web/storybook/` (Storybook 10.6, React + Vite). Run `npm --prefix Reference_Library/Library/Web/storybook run storybook` or the `web-library-storybook` preview; MCP at `http://localhost:6006/mcp` (registered per machine, local scope; root `.mcp.json` is git-ignored since 2026-10-01). Generators: `tools/tokens_to_css.py`, `tools/storybook_stories.py`, `tools/storybook_parity.py`.

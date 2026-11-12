---
name: study-reference-ds
description: Study another company's design system (Web, iOS, Android or cross-platform) from its Figma file and add it to the reference library (references.json) so the intake can offer it as a starting template.
---

Read and follow `References.md` > "Adding a design system to the library" in the repo root (the folder that contains `.claude/`). That section is the source of truth; this entry only makes it available as `/study-reference-ds`.

Ask for the company name, the platform (Ask (choice): Web / iOS / Android / Cross-platform; later menus in the run also end with "Back", Intake section 0) and the Figma link if they were not given. One platform per run.

The Figma link is required: a design system with no public Figma file is not added as a structure reference (code reference only; `References.md`). After the Figma link, ask once for an optional GitHub (code) link (typed; "No code link" via the menu): Figma wins on structure, code wins on exact values.

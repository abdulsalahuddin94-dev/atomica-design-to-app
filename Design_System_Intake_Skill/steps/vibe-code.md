# Vibe code start (section 16)

Part of `Design_System_Intake_Skill` (map in `SKILL.md` section 0c). Load when 0.0s = "Vibe code". Every `Ask (choice)` here also gets a "Back" option (`SKILL.md` section 0).

**Why (Abdul, 2026-11-09):** a user who wants to build in code (vibe coding) should not be asked for Figma links, a Figma plan or a Figma tool before anything else. The first question says where the work starts; Figma questions come only when Figma is really used.

## 16.0 What changes for a Vibe code project

- **Not asked:** 0.2 (Figma links), 0.2b (Figma plan), 2.1 (Greenfield / Brownfield / Code to Design) and 2.1c (Figma first or Code first: the answer is Code first). Record `status.json > start = "vibe-code"` and `status.json > prototype.design_mode = "code-first"`, the value the dashboard's Design page reads (chat + live preview).
- **Preflight (0b):** the Figma tool checks (installed? connected?) do **not** block a Vibe code project. Run them only at the first step that needs Figma: 16.2 "My design system on Figma", or a later "Sync with Figma" / Code to Design (Scenario D) request. Machine setup (check 0) still runs.
- **Still asked, same as always:** 0.1 name, the platform (1.1-1.6), 0.3 / 0.3d / 0.3b folder and Inputs, 2.1b how far, 2.1d data (All the way only), the 0.3s setup card (Vibe code lists 0.4-0.6b only when 16.2 did not already answer them).
- **Order:** 0.0s -> 16.1 -> 0.1 -> platform -> 0.3, 0.3d, 0.3b -> 16.2 -> 2.1b -> 2.1d -> 0.3c / 0.3s -> Intake Summary.
- **Figma later:** Figma is never required. When the user wants Figma screens, run Code to Design (`steps/code-to-design.md`) on the project's code; its 0.2-style link questions are asked then. Each component keeps one owner (`code` / `figma`) in `status.json`, as in Code first (`memory/decisions.md` > 5A).

## 16.1 Start fresh or continue existing work

Ask (choice): "Are you starting fresh, or continuing work you already made?" "Start fresh (Recommended)" (description: a new app built in code from a design system you pick next) / "Continue existing work" (description: an app or design made in Lovable, v0, Bolt, Figma Make, Cursor or by hand; I read it, show it to you and we keep building on it) / "Back"

**Continue existing work** -> ask, typed (one message): "Where is your existing work? Send any of these: the GitHub repo link and branch (Lovable: Settings > GitHub sync; v0: Push to GitHub or Download ZIP), a local folder or ZIP path, the live preview link, or the Figma Make link (figma.com/make/...)." The dashboard shows this question as a card with one field per source (its text starts with "Where is your existing work?"). Record in `status.json > source_code` (`repo`, `branch`, `path`, `preview_url`, `figma_make_url`, `tool`: `lovable` / `v0` / `bolt` / `figma-make` / `other`).

- **Repo, folder or ZIP:** read the code with the "read the code first" step of `steps/code-to-design.md` (read only, no installs without a yes): tokens, routes = screens, popups, states, components, icons -> `Inputs/Code_Inventory.md` and `Inputs/Extracted_Tokens.md`. Build on the user's repo in a branch; never push to their default branch without a yes.
- **Figma Make link:** read its code through the official Figma MCP (`figma.com/make/:makeFileKey/...` -> `makeFileKey`; read only). If the code cannot be read, ask the user to export it (Figma Make: download the code or connect GitHub) and continue as a repo or folder.
- **Live link only:** a visual reference, never the source. Ask for the code (repo or ZIP) before any build; until then only screenshots and an extract from them (Brownfield type 1 extract rules) are possible.
- **Show it to the user:** after the read, post one line per screen (route, popups, states found) and show the app in the dashboard's Design page preview (Code first layout): the live preview link, or the local dev server after a yes to install and run. Then Ask (choice): "Is this everything you made?" "Yes, continue (Recommended)" / "Something is missing" (description: type what in Other).
- **Comments:** today the user comments in the Design page chat on what the preview shows (screen + element in words). Pins on the imported app (the prototype comment overlay) are a separate change, not available yet; say so if the user asks.
- The modes, RTL, fonts and icons found in the code are confirmed once (0.3c rule): "Use these (Recommended)" / "Change something".

## 16.2 Which design system the code uses

Asked after 0.3b. Ask (choice): "Which design system should the code use?"
- "The one already in my code" (description: the tokens and components found in your existing work become the design system) - only after "Continue existing work"; then it goes first and is Recommended.
- "Pick one from the library" (description: a ready design system or a style we have; Recommended when starting fresh) -> one menu with the ready entries of `references.json` for the platform (default first), the ready entries of `My References/references.json` (the user's own, 16.3), and "A style from the Style Library" (`steps/style-library.md` 0.3e.2-0.3e.3, look only).
- "My design system on Figma" (description: your own DS file in Figma; I study it read only and keep it on this computer for any future project)
- "Back"

Then:
- **The one already in my code:** the merge summary of `steps/code-to-design.md` 6b step 1 (near-duplicate values), then `data/tokens.json`, `DESIGN.md` and `AGENTS.md` written from the code's tokens. Missing tiers (for example no Semantic layer, only raw hex) are proposed as Primitives + Semantics and approved before any code change.
- **Pick one from the library:** `data/tokens.json`, `DESIGN.md` and `AGENTS.md` from the chosen entry or style before coding (Code first rule, `memory/decisions.md` > 5A). With existing work, the code's tokens are mapped to the picked DS (token map rules of `steps/code-to-design.md` 6a step 5) and the map is approved before the code is changed.
- **My design system on Figma:** run the Figma tool checks now (0b checks 1-5, read only). Ask, typed: "Please send the link of your design system file in Figma." (worded without "Figma link" so the dashboard shows one link field, not the 0.2 card) Study it with `/study-reference-ds` (`References.md` > "Adding a design system to the library") into **`My References/<Company>/<Platform>/`**, registered in `My References/references.json`, not in `Reference_Library/`. Then use it as in "Pick one from the library".

Record `Project_Brief.md > 16.2` and `status.json > design_system_source` (`code` / `library:<entry id>` / `style:<slug>` / `my-reference:<entry id>`).

## 16.3 My References (the user's own design systems, local only)

- `My References/` sits in the Root next to `Reference_Library/`, with the same layout (`<Company>/<Platform>/` + its own `references.json`). It is **git-ignored**: the workflow repo is public, so a company's design system never goes into it.
- Every later project on this computer offers its ready entries in 16.2 and in Greenfield 3.1 / 3.2, after the public library entries.
- An entry moves to the public `Reference_Library/` only when the user says the DS is public or they are allowed to share it, and after their yes at that moment (then `/contribute`).
- The original Figma file stays read only (the guard hook asks before any write, as for every reference).

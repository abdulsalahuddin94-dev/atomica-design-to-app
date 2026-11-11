# 17. Discover: research to user flows

Part of `Design_System_Intake_Skill` (Abdul, 2026-11-11). Loaded after the approved Intake Summary when the project has screens (`status.json > scope` = `all` or `ds-screens`, or Vibe code), before Foundation (Figma) or before the first screen in code (Vibe code / Code first). A design-system-only project (`scope = ds`) never runs it. Every `Ask (choice)` here also gets a "Back" option (`SKILL.md` section 0), and every question carries the progress line `Discover <n>/<total>` so the dashboard shows the stage.

**Why (Abdul, 2026-11-10):** screens were planned from the brief alone. Discover turns research into decisions, then into an Information Architecture, then into user flows, and Abdul approves each one before the next starts. The approved flows give the screen list and the gap table, so the components built afterwards are the ones the product needs.

Ideas adapted (our own words, nothing installed; credits in `Workflow_References/README.md`): ghaida/intent (CC0), miguelclavel/ux-research-skills, JacobLinCool/ux-discovery-interviewer-skill, cuellarfr/design-skills, ipavelm/ultimate-product-discovery-skill (MIT).

## 17.0 Intake questions (D0)

| # | Question | Notes |
|---|---|---|
| D0.1 | Ask (choice): "Do you have research files for this product?" "Yes, I'll add them" (description: interviews, transcripts, surveys, analytics, support tickets, PRDs, competitor notes; they go in `Inputs/Research/`) / "No, start new research" (description: describe the idea and add any helpful documents; I research it) / "Skip research for now" (description: plan from the brief; everything is marked as an assumption) / "Back". Recommended: "Yes" when `Inputs/Research/` already has files, "Skip" for a Quick task, otherwise "No, start new research". | **Yes:** if `Inputs/Research/` is empty, show its full path (as in 0.3b) and wait for "I added files, read them". Read every file and list them with counts before D0.2. **No:** ask the typed question exactly: "Start new research: describe the product idea, who it is for, the market or country, and what you want to learn. You can attach documents that help (a brief, a pitch deck, notes, competitor links)." Put the progress line (`Discover 2/<total>`) on its own first line, so the dashboard shows it as a text box with an attach button (files land in `Inputs/Research/`). Save the answer as `Research/00-request.md`. **Skip:** go to 17.6 (IA) with `depth = skip`; every line there is tagged `[A]`. |
| D0.2 | Ask (choice): "How deep should the research go?" "Light" (description: 1 to 3 flows or an idea check: desk research, up to 5 competitors and about 10 sources, two approvals) / "Full" (description: a new product or a big feature: every step and every approval, two sessions) / "Back". Recommended: Full when the request is a new product, Light otherwise. | Record `status.json > discover = { depth: light / full / skip, research_files: <n>, notebook: null, checkpoints: {} }` and `Project_Brief.md > D0`. |

Light runs D1 to D7 with two approvals: Decisions (17.5) and IA + Flows together (17.6 + 17.7). Full stops at all four ✋ points. Full is two sessions (Research = D1-D4, Planning = D5-D7); Light is one.

## 17.1 D1 Research brief -> `Research/00-brief.md`

1. Restate the idea in 2 to 3 sentences in the user's words.
2. Ask what the files and the request do not answer, 3 to 5 questions per round, at most 2 rounds, each an `Ask (choice)` with typed answers through Other: who the user is, what they do today (the workaround), what breaks, what success looks like, constraints (platform, languages, deadline, budget, regulation). Summarise what you learned after each round.
3. Write the brief on the five foundational questions: (1) is the problem real and how painful, (2) who exactly has it, (3) is this the right kind of product (web, app, both, adaptive), (4) which features matter, (5) what already exists.
4. List the research questions. Each names the decision it informs (`-> D5.3`); a question that informs no decision is dropped.

No approval here; the brief is shown with the Research checkpoint (Full) or the Decisions checkpoint (Light).

## 17.2 D2 Secondary and market research -> `Research/01-secondary.md`, `Research/02-market.md`

Say in one line that this step uses many tokens before it starts (heavy-step warning, `SKILL.md` 0c).

**Tool:** Gemini Notebook through `gemini-notebook-mcp-cli` (17.9) when it is connected, otherwise Claude's web search and page reading. Never stop because the notebook tool is missing.

- **Secondary:** studies, industry reports, articles, regulations and accessibility rules for the domain and country. Every claim gets `[S<n>]` and a Sources list at the end of the file (title, link, publisher, date read).
- **Market:** 5 to 8 products (Light: up to 5): direct competitors, indirect ones (including "do nothing" and spreadsheets), and one best-in-class product from another industry. Compare each key flow on the same criteria: how it starts, steps to the first useful result, data asked and why, errors and edge cases, trust signals, accessibility basics, Arabic / RTL support, mobile experience. Write "not visible" for anything you could not see; never invent a feature. Screenshots you take go in `Research/market/`.
- Split the result into **conventions** (most do it, users expect it), **differentiators** (one does it well) and **gaps** (nobody does it well).
- **Store reviews:** group complaints and praise from app store or marketplace reviews by theme, with counts and short quotes (`[M<n>]`).
- Market size and trends only from a real source; otherwise leave them out and add an open question.

## 17.3 D3 Primary research -> `Research/03-primary.md`

- **With files:** thematic synthesis. Read everything twice, code observations close to the data ("P3 keeps a paper list of refills"), group codes into themes, check each theme against the data, name it in one sentence. Write each insight as observation, inference, implication, with its breadth as a number and its source: "6 of 9 participants [I4]". Findings that contradict the brief come first.
- **Without files:** a research plan (decision, questions, method, participants, what done looks like), an interview guide (opening, 3 themes, closing, no leading questions), a screener and a 5-question survey, ready for the user to run. Synthetic users may sharpen these questions only; every synthetic output is tagged `[Syn]` and never counts as evidence.
- Participants are codes (P1, P2) in every file, never names.

## 17.4 D4 Users, jobs and journeys -> `Research/04-users.md` ✋ Research checkpoint (Full)

- 3 to 5 personas named by behaviour ("The cautious comparer"), never a stock photo or an invented biography. Each: goal and job, how they do it today, top frustrations with a short quote and its tag, what makes them trust or leave, context (devices, time, who else is involved), and how many participants it rests on. With no research data they are **proto personas** tagged `[A]`, each with "What would confirm this".
- Job statements ("When <situation>, I want to <motivation>, so I can <outcome>") and the four forces per main job: push of the current situation, pull of the new product, anxiety about switching, habit of the present way.
- A current-state journey per main job (stages, doing, thinking, feeling, what breaks), with the pain points from D2 and D3.
- **Full:** Ask (choice) "Research is ready. Approve it?" "Approve, go to decisions (Recommended)" / "Request changes" / "Back". Show the brief, the top 5 insights with their tags and the personas.

## 17.5 D5 Decisions -> `Research/05-decisions.md` ✋ Decisions checkpoint

Claude does not just list findings: it draws conclusions, recommends one option per decision and asks.

1. **Opportunities:** turn the insights into opportunity statements in the user's words ("I can't tell which plan fits me"), grouped under one product outcome as a tree: outcome -> opportunities -> 2 to 3 solution ideas each.
2. **Decision list,** in this order (each changes the next): D5.1 Is the problem worth solving (go / narrow the scope / stop; red flags: no evidence of pain, a market too small to matter, a required licence the client lacks) · D5.2 Primary audience (which persona the first release serves) · D5.3 Product form (Web, mobile app, both, adaptive) · D5.4 MVP scope (keep / cut / add / defer per feature) · D5.5 Positioning (the 1 or 2 gaps from D2 the product wins on) · D5.6 Key UX choices (e.g. guest checkout or sign-up first). Skip a decision the Intake already settled (e.g. the platform) and say so.
3. **One decision per question.** Before each: the 2 to 3 options, the recommendation, the evidence for and against with tags and counts ("4 of 6 competitors [M2]; 31 store reviews [M5]"), the risk and how to validate it later (a test on the prototype, 5 interviews). Then Ask (choice): recommended option first, the others, "Change something" (Other) and Back. An answer against the evidence is fine; log it with the reason.
4. **Challenge:** run the devils-advocate review on the decision list (the dashboard Audit "Challenge the plan", or the same skill in the terminal when installed; otherwise reread it as a sceptical outsider). Name the weakest assumption and add a fix or an open question.
5. **Decision log:** one row per decision: ID, choice, why, evidence tags, owner (the user), date. IA, flows and screen specs cite these IDs.
6. Write `Research/research.md`, a one-page summary (top insights, decisions, open questions) that later phases read instead of the long files.
7. Ask (choice) "Decisions are ready. Approve them?" "Approve, go to the IA (Recommended)" / "Request changes" / "Back".

## 17.6 D6 Information Architecture -> `Planning/06-ia.md` ✋ IA checkpoint

- Sitemap as a Mermaid diagram, every screen or view once.
- Navigation model per platform: bottom navigation of at most 5 items on mobile (iOS Tab Bar / M3 Navigation Bar), sidebar or top bar on Web; what lives in a menu, a sheet or settings.
- Object model: entities, their fields and relations (feeds the sample data and the Backend stage).
- Content priority per screen: what must show first.
- Naming glossary in English and Arabic (Arabic when RTL = Yes), using the words users used in the research. One name per concept from here to Figma and code.
- Optional tree test plan when the navigation is risky (many sections, unclear labels).
- Ask (choice) "Approve the IA?" "Approve, go to the flows (Recommended)" / "Request changes" / "Back". Light: shown together with the flows, one approval.

## 17.7 D7 User flows -> `Planning/07-flows/<flow>.md` ✋ Flows checkpoint

- One file per flow in the flow map format of `steps/plan-user-flows.md` (7e.0): overview, screen map, decision points, not designed now, Figma placement. Load that file for the format.
- The state matrix lists 9 states per screen: default, loading, empty, error, partial (some data), offline, no permission, first use, long content and RTL. A state that cannot happen is written "n/a" with the reason.
- Checks before showing: the usability pre-check of 7e.0 (Nielsen 3, 4, 5, 9), the dark pattern check (no confirmshaming, hidden costs, forced continuity, pre-ticked consent, fake urgency, roach-motel cancellation), and each flow cites the decision IDs it comes from.
- Each flow gets 1 to 3 success measures (goal -> signal -> metric) and one usability task for the prototype later.
- Ask (choice) per flow "Approve the <flow> flow?" "Approve (Recommended)" / "Request changes" / "Back". Light: one approval for the IA and all flows.

## 17.8 After Discover

- The approved flows are the screen list: 7e step 1 (gap table) reads `Planning/07-flows/` instead of re-mapping them, and 7e.0 is skipped for those flows. Screen specs (7f) list their states from the matrix and cite the decision IDs.
- Vibe code / Code first: the prototype builder reads `07-flows/` for routes and `06-ia.md` for navigation and names.
- Handoff: `Project_Brief.md` (Checkpoints `Discover: Approved <date>` only after the user's answer, `Next step:`), a `CHANGELOG.md` entry with `Phase: Discover` and the `session_cost.py` lines, `status.json > discover.checkpoints`. Then tell the user the phase is done and the next session starts Foundation (or the code).

## 17.9 Gemini Notebook (NotebookLM) through gemini-notebook-mcp-cli

Abdul's pick (2026-11-11): [jacob-bd/gemini-notebook-mcp-cli](https://github.com/jacob-bd/gemini-notebook-mcp-cli), MIT, PyPI `notebooklm-mcp-cli`, pinned to 0.16.2. A command line tool `nlm` plus an MCP server (`gemini-notebook-mcp`). It uses Google's internal APIs, so it can break and may not fit Google's terms: use it with a separate Google account, keep the version pinned (it only shows an update notice), and fall back to web search when it fails.

**Setup, once per computer, only after the user's yes** (Claude never types a password):
```
uv tool install notebooklm-mcp-cli==0.16.2
nlm login                        # the user signs in with a separate Google account
nlm auth storage set protected   # the login is encrypted in the OS keychain
nlm setup add claude-code
nlm doctor
```
Then restart Claude Code. A session without the MCP tools says so in one line and uses web search.

**Use in Discover:**
1. One notebook per project, named `<Project> Research` (`notebook_create`); its id goes in `status.json > discover.notebook`.
2. D2: one Deep Research per research question (`research_start` with mode `deep`, then `research_status` with auto import). Fast mode for Light.
3. D3: upload the user's research files (`source_add`, file); files with personal data are uploaded only after the user's yes.
4. Ask the notebook (`notebook_query`, or `notebook_query_start` / `notebook_query_status` for long questions) and copy each answer into the Research files with its citation, tagged `[S]` or `[I]` by the kind of source. An answer with no citation is not evidence.
5. Never share a notebook publicly or invite anyone unless the user asks (`notebook_share_*`).

## 17.10 Evidence rules (every Discover file)

| Tag | Means |
|---|---|
| `[S<n>]` | Secondary source, in the file's Sources list with its link and date |
| `[M<n>]` | Market source (a competitor walkthrough, store reviews) |
| `[I<n>]` | Primary research from the user's files (interview, survey question, analytics export) |
| `[A]` | Assumption waiting for evidence (proto personas, Skip) |
| `[Syn]` | Synthetic user output, never counted as evidence |

- Breadth as a number ("6 of 9 participants"), never "users want". One quote is an anecdote.
- What was observed is written apart from what it suggests.
- No invented quotes, demographics, market numbers or competitor features; "not visible" or an open question instead.
- Surprises first: findings against the brief lead.
- Bias check before D5: leading questions, samples of happy users only, a story too clean to be true.
- Privacy: participant codes only; client research stays in the project folder (`My Projects/` is git-ignored), never in the workflow repo.

## Files

```
Inputs/Research/          files the user adds (D0.1)
Research/
  00-request.md           the "Start new research" text (D0.1 = No)
  00-brief.md
  01-secondary.md         + Sources list
  02-market.md            + market/ screenshots
  03-primary.md           synthesis, or the research plan and interview guide
  04-users.md             personas, jobs, current journeys
  05-decisions.md         decision log (IDs used everywhere after)
  research.md             one-page summary for later sessions
Planning/
  06-ia.md                sitemap, navigation, object model, glossary
  07-flows/<flow>.md      flow maps with the 9-state matrix
```

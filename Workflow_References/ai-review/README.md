# AI review (on request)

Two skills from [alfaris/Design-AI-Skills](https://github.com/alfaris/Design-AI-Skills) (CC BY 4.0, (c) 2026 Ahmed Faris / فارس المجرة, copied 2026-11-09; credit in `../licenses/alfaris_Design-AI-Skills.txt`), kept in `.claude/skills/` so no install is needed.

**On request only.** Neither one is a build step, a checkpoint or a gate, and neither is offered unasked. They run when the user asks, or from **Audit** in the dashboard. An ordinary "audit" of a file still means audit-design-system (ds-auditor).

| Mode | Skill | Runs on |
|---|---|---|
| **Review design** | `design-audit-panel` | Screens, the prototype, a Figma link or screenshots |
| **Challenge the plan** | `devils-advocate-and-convincer` | What the user is about to approve: `Project_Brief.md`, a flow map, a screen spec, a component list, a foundation plan, or any decision |

## Review design

1. Panel: **Frustrated User, Accessibility Expert, UI/UX Expert** by default. Optional: Stakeholder, Developer, Competitor, Growth Marketing. The user's choice wins; all seven only when asked.
2. Open every screen under review (the tool saved for the file, or the attached screenshots). A source that cannot be opened is reported as such, never reviewed from memory.
3. Follow the skill's finding contract; every finding is tagged **Observed**, **Inferred** or **To verify**.

What this review adds is the product and business lenses and the evidence tags. It does not replace the existing checks:

| Question | Still answered by |
|---|---|
| Contrast and touch size facts | ds-auditor contrast and touch checks, `../ux/accessibility.md` (the Accessibility Expert cites them, or marks the point To verify) |
| Are DS components, variables and styles used? | audit-design-system (ds-auditor) |
| Visual quality | Impeccable (`critique`, `polish`) |
| Nielsen and Krug usability score | `../ux-heuristics/README.md` |

## Challenge the plan

1. Read the subject first and state the skill's context profile (decision, stage, reversibility, evidence, audience authority). Unless the user names someone else, the audience is the person approving this project.
2. Run **Phase 1** (objections) and **Phase 2** (solutions) on every Critical and Major objection.
3. The **Final narrative** is optional: write it only when the user asks for it.
4. Project files are facts; anything else is a claim, labeled as the skill says. No invented data or references.

## Our rules win

- **Fixes use the DS only.** A fix is a different DS component, variant, state, text or token. A missing component goes through the 7e gap table; a new token is proposed and approved. Plan objections that change the plan go back to the matching approval step.
- **Report first.** Save it to `<Project folder>/audits/<date>-<review-design|challenge>-<subject>.md`, and show the summary and the path in the conversation.
- **The user picks.** Show the fixes as an Ask (multi), one option per issue (one per theme when more than 3, because Back takes the fourth option). Nothing changes in Figma, code or project files until the user picks.
- **Each fix follows its normal path**, including the Design file audit and the fidelity check after a screen changes.
- **Language.** Menus stay in English; the report is written in the user's language.
- **The skills never approve anything.** A report does not count as a checkpoint.
- **Log it** in the project's `CHANGELOG.md`: `AI review: <mode>, <subject>, <n> findings (<c> critical), report <path>`.

# 7e.0 Flow map: plan the screens and states before any spec

Part of `Design_System_Intake_Skill` (loaded with `steps/screens.md` when a flow of two or more screens is requested, before 7e step 1). Adapted from [schudarin/chudarin-figma-skills](https://github.com/schudarin/chudarin-figma-skills) `skills/plan-user-flows` (MIT). Every `Ask (choice)` here also gets a "Back" option (`SKILL.md` section 0).

**Why (Abdul, 2026-10-11):** the per-screen spec (7f) describes one screen well, but missing screens and states (forgot password, account locked, empty list, offline) were found only mid-build. The flow map lists every screen and state of the flow first, so the gap table (7e step 1) and the specs cover all of them.

## When

- Every new flow (sign-up, checkout, booking, settings...) in Greenfield, Brownfield and Code to Design.
- Brownfield / Code to Design: the screens that exist come from the source (screenshots, frames, routes in `Inputs/Code_Inventory.md`); the map adds the states and branches the source does not show and marks them `not in source`, so the user decides whether to design them.
- Skip it for a single screen or a change to one existing screen.
- Skip it when Discover (`steps/discover.md` 17.7) already wrote and approved `Planning/07-flows/<flow>.md` for this flow; that file uses this same format.

## Inputs

Feature or task, who does it, platform (from the Brief), where the user starts, known edge cases (ask once in one Ask (choice) only if the Brief and the source do not say: "Any edge cases I should know?" "No, map the usual ones (Recommended)" / "Yes, I'll list them" typed in Other).

## Output: `<Project folder>/audits/<date>-flow-map-<flow>.md`

1. **Flow overview**: feature, user, goal, entry points (every realistic way in: tab bar, deep link, notification, empty state CTA), success exit, failure exits.
2. **Screen map**

   | # | Screen | Type | Opened by | Notes |
   |---|---|---|---|---|
   | 1 | Sign In | Screen / Modal / Sheet / Drawer / Toast | App start, Sign out | ... |

   Cover: entry, happy path, loading, success, errors (network, validation, permission), empty, first time / onboarding, edge cases.
3. **State matrix**, one table per screen:

   | State | Trigger | What changes | What the user can do |
   |---|---|---|---|
   | Default | Screen opens | ... | ... |
   | Loading | Taps Sign in | Button shows loading | Nothing |
   | Error | Wrong password | Inline error under the field | Retry, Forgot password |
   | Empty | No data yet | Empty state | Primary CTA |

4. **Decision points**: `Decision: <name>` with where each branch goes (`yes -> 4`, `no -> 6`).
5. **Not designed now**: what is explicitly out of scope, so it does not creep in.
6. **Figma placement**: which Design file page each screen goes on (our file structure, not a new one) and the frame names (`<Flow> / <Screen> / <State>`).

## Checks before showing it

- Loading, error and empty are covered on every screen that loads data or submits.
- Every decision has both branches mapped.
- Every screen in the map appears in the gap table later (7e step 1); every state becomes a frame or a component state there.
- **Usability pre-check (2026-10-13, text only, no question):** read the map against `Workflow_References/ux-heuristics/framework.md` > Quick Diagnostic and Nielsen 3 (an exit or back from every screen and overlay), 5 (destructive or irreversible steps have a confirm or undo), 9 (every error state says how to recover) and 4 (one name per concept across screens). Add what is missing to the map, or list it under "Not designed now" if the user should decide. **AI review (optional, on request only):** the user can also ask for Challenge the plan on this map (`Workflow_References/ai-review/README.md`).

## Approval

Show the map and Ask (choice): "Approve the flow map?" "Approve (Recommended)" / "Request changes". Then 7e step 1 (gap table) uses it as the screen list, and each screen's spec (7f) lists its states from the matrix. The map is linked in the flow's `CHANGELOG.md` entry. The prototype (7e step 5) wires the decision points from it.

# Product

<!-- impeccable:product-schema 1 -->

Scope: the local workflow dashboard in `dashboard/` (not the Figma design systems the workflow builds). Facts below come from the repo and Abdul's request of 2026-10-14; items marked (inferred) were not confirmed in an interview because Abdul was answering from his phone.

## Platform

web

## Users
- Abdul (owner) and teammates: product designers who build AI-ready design systems in Figma with Claude Code. They are not developers; the dashboard exists so they do not need the terminal.
- They use it on their own computer (localhost), next to Figma Desktop, often for long sessions; a conversation can run for hours with screenshots to approve. (inferred: wide desktop screen, Figma open in another window)

## Product Purpose
A local control panel for the "Design systems Ai Ready" workflow. It starts Claude Code in the workflow folder (Agent SDK) and shows the conversation: AskUserQuestion menus become buttons, permission prompts become cards, screenshots appear inline for approval. Home lists the user's projects (phase, last change, next step, Figma / Storybook links, unsynced Storybook changes), starts new work (new project, join a team project, quick task, ask anything, work from phone), adds to the workflow (reference design system, icon library, skill from GitHub), and shows workflow updates, sign-in and permission mode.
Success: a designer opens it, sees at a glance where each project stands, and starts or resumes the right task in one click.

## Positioning
It is a cockpit for one specific pipeline (intake -> Foundation -> Components -> Screens -> audit -> Storybook), not a generic chat UI. Its distinctive facts: checkpoint approvals with Light/Dark screenshots, atomic-tier build order, Figma + Storybook links per project.

## Operating Context
- Runs on localhost:4777 from `Start-Dashboard.cmd`; plain HTML/CSS/JS, no build step, served by `dashboard/server.mjs`.
- Has its own stylesheet since the 2026-10-14 redesign (no longer imports `docs/assets/docs.css`); fonts Archivo + Red Hat Mono from Google Fonts (self-hosting pending Abdul's OK to download the font files). Light and dark.
- Conversations in Arabic or English (dir="auto").

## Capabilities and Constraints
- No new dependencies, no bundler, no external images; icons must be inline SVG drawn for the dashboard or from a permissive icon set (Lucide, ISC) reproduced inline.
- All existing behavior, endpoints and element ids used by app.js must keep working.
- Light and dark themes both required; phone width must work (no horizontal scroll).

## Brand Commitments
- Name: "AI-Ready Design Systems" workflow. No existing logo (inferred: a logo may be authored for the dashboard).
- Abdul's feedback (2026-10-14): the current look is "very basic", with no UX, no icons, no images or logo; it must look like a real dashboard / control panel and be creative.

## Evidence on Hand
- Real project data comes from `My Projects/*/status.json`, `Project_Brief.md`, `CHANGELOG.md`. No usage stats, customers or metrics exist; do not invent any.

## Product Principles
1. Where each project stands, and what to do next, is the first thing on screen.
2. Every action names what will happen before it happens.
3. The conversation and its approvals are the work surface; chrome stays out of their way.
4. Same names as the workflow (intake, checkpoints, ds-auditor, Storybook), never generic AI wording.

## Accessibility & Inclusion
WCAG AA contrast in both themes, keyboard-reachable actions, visible focus, RTL-safe text (Arabic).

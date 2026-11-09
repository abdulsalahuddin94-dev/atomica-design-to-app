# Weekly Figma drift audit (scheduled agent definition)

Not enabled. This file only defines the job; turn it on yourself with one of the options below.

## What it does
Once a week, Claude opens this folder, checks each design system's Figma file against its saved skills and data files, and writes a drift report. It never edits Figma or the skills; it only reports.

## Prompt (paste this as the scheduled task's prompt)
```
Work in the Root folder of "Atomica Studio" (the folder with CLAUDE.md).
Read memory/MEMORY.md first. Do not run the intake questions; this is a scheduled read-only job.
1. Call figma_get_status. If the Desktop Bridge is not connected, write
   audits/<today>-drift-skipped.md saying so and stop.
2. For each platform folder that has data/tokens.json and whose Figma file is open in the bridge
   (figma_list_open_files), run the ds-auditor subagent in "drift" mode for that folder.
3. Write audits/<today>-weekly-summary.md in the Root: one line per folder with the numbers,
   and links to each folder's report.
Never edit Figma, skills or data files. Never install anything.
```

## Schedule
Monday 09:00, local time (cron `0 9 * * 1`).

## Why it must run on this computer
The audit reads Figma through the figma-console Desktop Bridge, which only exists while Figma Desktop is open on this machine with the bridge plugin running. A cloud routine (`/schedule`) cannot reach it, so use a local option.

## How to enable (pick one)
1. **Claude desktop app, scheduled task (recommended).** Open this folder in the Code tab and say: "Create a weekly scheduled task from .claude/scheduled/weekly-drift-audit.md, Mondays 9am." Claude will show the task for you to approve. Keep Figma Desktop open with the bridge plugin running at that time.
2. **Windows Task Scheduler + Claude Code CLI.** Create a basic task (weekly, Monday 09:00) whose action runs, in this folder:
   `claude -p "<the prompt above>" --permission-mode acceptEdits`
   The figma read tools and the report writes are already allowed in `.claude/settings.json`.

To turn it off, delete the scheduled task (desktop app) or disable the Task Scheduler entry.

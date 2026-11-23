# Figma tools: FigCli (Yolo mode) and Desktop Bridge

This workflow reaches Figma Desktop through one of two tools. **A new user needs at least one.** The recommended setup is **FigCli in Yolo mode**. FigCli runs in Yolo mode only: its Safe-mode plugin was not stable in the 2026-10-04 trial, so this workflow does not use it. Install the Desktop Bridge as well only if you need slots (FigCli cannot create them) or cannot patch Figma.

| Tool | Biggest advantage | Best for |
|---|---|---|
| **FigCli, Yolo mode** (figma-cli, Recommended) | Stable, no plugin to keep open, Figma can stay minimized, switches between open files per command; about 20–30× fewer tokens for checks, extract and measure | Everything by default: builds and checks through `eval` (the same `tools/*.figma.js` scripts), full-file extract (tokens 100%), `snapshot` / `rules gen` / `check` regression gates (about 16 s and 300 tokens per file), `verify --measure` on screens (under 1 s and about 500 tokens per frame) |
| **Figma Desktop Bridge** (figma-console-mcp + its Figma plugin) | Full build and audit with the Figma skills' MCP tools, and it catches everything | Only what Yolo cannot do: creating slots (`figma_add_slot_property`). Also the fallback when Yolo is not allowed on the machine. When both are installed, Yolo is the main tool for everything else, screenshots and audits included (Abdul, 2026-10-05). With only the Desktop Bridge installed, it does all the work and you are never pushed to add Yolo |

Trial details (2026-10-01, duplicate of a trial DS):
- **FigCli `check`** caught 4 of 5 defects. Across all variants it checks only fill binding and the variant matrix; strokes, padding and size are checked on one sample variant per set, so it missed a Button height change. The extract also skips standalone components that are not component sets. The mandatory audit-design-system step at the end of every build covers this whichever tool is used.
- **Desktop Bridge** scans every variant. It took about 52 s and 6–10K tokens, with one false positive that was dismissed after a second read.
- FigCli has no knowledge of the official Figma skills. Our skills and data files still apply to it.

Check what is installed (read-only; it also says whether Yolo's port 9222 is open):
```
python tools/figma_tools_check.py
```

## Where to install
Install the tools **outside this workflow folder**, in a `Tools` folder at the root of a drive (`<drive>:\Tools`, for example on drive D), so every workflow copy and every project can use them. Keep each tool's folder name: `figma-cli...` and `figma-console-mcp...`. The check script also finds a `Tools` folder next to the workflow, a `Tools` folder in your home folder, or a folder set in the `FIGMA_CLI_DIR` environment variable.

Do not copy either tool into this repo. Update them from their GitHub pages:
- figma-cli: https://github.com/silships/figma-cli
- figma-console-mcp: https://github.com/southleft/figma-console-mcp

Claude only installs after you say yes, and you can do it in the same session as the intake. Restart Claude Code after adding an MCP server, so its tools load.

## Install FigCli (figma-cli)
1. You need Node.js 18+ and Figma Desktop.
2. Download or clone https://github.com/silships/figma-cli into `<drive>:\Tools\figma-cli`.
3. Inside that folder run `npm install`. **Never `npm install -g`.**
4. Check it: `node src/index.js --version`.
5. Do **not** run `figma-cli init-agent` inside this workflow folder, because it writes its own `AGENTS.md` and Cursor rules over ours. Do **not** install its Claude Code plugin (`/plugin install figma-cli...`). Our skills drive it.
6. Connect in Yolo mode, below.

### Yolo mode (the only FigCli mode used here)
**What it does, plainly:** Yolo patches the Figma Desktop app file `app.asar` (Windows: `%LOCALAPPDATA%\Figma\app-<version>\resources`) so Figma starts with a remote debugging port (**9222**) open on your machine. FigCli runs code in your files through that port. No plugin is needed.

**Risks (decide once per machine):**
- Your Figma app is modified. Figma support and company IT policies may not accept a patched app; use Yolo on a machine you control. Where patching is not allowed, use the Desktop Bridge instead.
- Port 9222 has **no password**. While Figma runs patched, any program on your computer can read and change every open Figma file through it. It listens on your own machine only, not the network.
- A Figma update replaces the app, so the patch is lost and has to be applied again.
- The Desktop Bridge plugin may lose its connection when Figma restarts after the patch; run it again if you use both tools.
- To undo it all: `node src/index.js unpatch` (Figma goes back to normal).

**Set up (you run the patch yourself):**
1. Open a terminal **as administrator** in the figma-cli folder and run `node src/index.js connect`. It patches `app.asar`, closes Figma and reopens it with port 9222. Files that were open come back.
2. Start or restart the daemon: `node src/index.js daemon restart` (if the first command after the patch fails, this fixes it; usually the daemon is still loading open files).
3. Test it: `node src/index.js eval "figma.root.name"` prints the file name.
4. Figma can stay minimized while you work; there is no plugin to keep open.

**After a Figma update:** press **Connect** on the FigCli card in the Atomica dashboard, or run `node tools/figcli_doctor.cjs --fix --restart-figma --figcli <figma-cli folder>` at the workflow Root in a normal terminal (no administrator needed). Plain `node src/index.js connect` can patch the old version folder after an update (it sorts 126.11.9 above 126.11.11).

**Several files open: always say which file.** Each command takes the target file from the `FIGMA_FILE` environment variable. Without it, the command goes to the **last connected file**, not the file on your screen. So:
- Set `FIGMA_FILE` on **every** command whenever more than one file is open.
  - Git Bash: `FIGMA_FILE="Design System -" node src/index.js eval "figma.root.name"`
  - PowerShell: `$env:FIGMA_FILE="Design System -"; node src/index.js eval "figma.root.name"`
- `FIGMA_FILE` matches **part** of the file name, so use a part that only that file has. With `Design System` and `Design System (Copy)` both open, `"Design System"` can pick the copy; `"Design System -"` (or the full name) picks the original.
- Claude saves the exact file name in `status.json > figma` and uses it as `FIGMA_FILE`. Every command prints or checks `figma.root.name` before the first write to a file, and writes nothing if the name is not the expected one.

### Modes this workflow does not use
- **Safe mode** (`connect --safe` + the FigCli plugin): not stable in the 2026-10-04 trial. Do not use it; on a machine where Yolo's patch is not allowed, use the Desktop Bridge.
- **Browser mode** (Figma in a separate Chromium over the same debugging port, outside Figma Desktop).

## Install the Figma Desktop Bridge (figma-console-mcp)
1. You need Node.js 18+ (`node --version`) and Figma Desktop (the web app is not enough).
2. Create a Figma personal access token (Figma > Settings > Security > Personal access tokens) with these scopes: File content (Read), File versions (Read), Variables (Read), Comments (Read and write). Never paste the token into the chat.
3. Add the server yourself, in your own terminal:
   `claude mcp add figma-console -s user -e FIGMA_ACCESS_TOKEN=figd_YOUR_TOKEN_HERE -e ENABLE_MCP_APPS=true -- npx -y figma-console-mcp@latest`
   For other AI tools, see `AGENTS.md` > Figma setup for other tools.
4. In Figma Desktop, go to Plugins > Development > Import plugin from manifest... and pick `~/.figma-console-mcp/plugin/manifest.json` (it is created the first time the server starts). If you downloaded the source into `Tools`, pick its `figma-desktop-bridge/manifest.json` instead.
5. Restart Claude Code, run the **Figma Desktop Bridge** plugin in your file, and say "Check Figma status".

## Switching any time
- You can use any tool on any file at any time: mid-project, days later, or one tool per file (for example FigCli Yolo on the DS file and the Desktop Bridge on a Design file). Just tell Claude.
- Claude saves the tool used on each file in the project's `status.json` logs every switch in `CHANGELOG.md`, re-checks the connection and the file, and reloads its helper script.
- Nothing in Figma or in the project files belongs to one tool, so switching never needs rework. The one thing that gets refreshed is FigCli's saved baseline (`snapshot` + `rules gen`): Claude regenerates it after a switch, after changes made through the Desktop Bridge, and after each approved checkpoint, so `check` does not report your own changes as drift.
- File check: the Desktop Bridge confirms the file by its key. FigCli confirms it by the exact name through `FIGMA_FILE` (and the key when `figma.fileKey` returns one) and writes nothing if it does not match.
- Steps that touch two files (publish, Accept updates, checking the library) need both files connected. With FigCli both are reachable at once; pass the right `FIGMA_FILE` on each command.

## Notes
- The Desktop Bridge plugin shows in Figma Desktop under Plugins > Development as **Figma Desktop Bridge**. FigCli (Yolo) needs no plugin, so it can run next to the Desktop Bridge plugin.
- Claude Code auto mode may block `figma-cli eval` commands that write. Allow the command when asked, or run it yourself.
- After a switch, Claude re-checks the connection and confirms the file name before any work.

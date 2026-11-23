# Install steps for the Figma tools

Part of `Design_System_Intake_Skill` (sections keep their original numbers, so "section 7c" etc. still resolve; the map is in `SKILL.md` section 0c). Load only when preflight (section 0b) finds no tool installed or none connected. The full guide for new users (both tools, where to install, Yolo setup and risks, switching) is `Figma_Tools/README.md`. Every `Ask (choice)` / `Ask (multi)` here also gets a "Back" option (`SKILL.md` section 0, Back on every menu).

**figma-console-mcp install steps** (from its README):
1. Prerequisites: Node.js 18+ (`node --version`), Figma Desktop (not the web app), an MCP client such as Claude Code.
2. Create a Figma personal access token (Figma > Settings > Security > Personal access tokens), description `Figma Console MCP`, scopes: File content (Read), File versions (Read), Variables (Read), Comments (Read and write). It starts with `figd_`.
3. Add the server to Claude Code (the user runs this in their own terminal, with their own token):
   `claude mcp add figma-console -s user -e FIGMA_ACCESS_TOKEN=figd_YOUR_TOKEN_HERE -e ENABLE_MCP_APPS=true -- npx -y figma-console-mcp@latest`
   (Claude Desktop / Cursor: add the same `npx -y figma-console-mcp@latest` server with those env values to the client's MCP config file.)
4. Desktop Bridge: in Figma Desktop go to Plugins > Development > Import plugin from manifest..., select `~/.figma-console-mcp/plugin/manifest.json`, then run the plugin inside the file you will work on. It connects over WebSocket.
5. Restart the MCP client and say "Check Figma status"; it should show the Desktop Bridge connected.

**figma-cli (FigCli) install steps** (Recommended; details in `Figma_Tools/README.md`):
1. Prerequisites: Figma Desktop installed and open, Node.js 18+.
2. The user downloads https://github.com/silships/figma-cli into a `Tools` folder at a drive root (`<drive>:\Tools\figma-cli`), outside the Root.
3. Inside that folder: `npm install` (with the user's yes; never `-g`). Check: `node src/index.js --version`.
4. Connect in **Yolo mode** (the only FigCli mode used; Safe mode was not stable). First say the risks in two lines: it patches the Figma app (`app.asar` in `Figma\app-<version>`), and Figma then opens debugging port 9222 with no password, so any program on this computer can drive open Figma files (local only); undo with `node src/index.js unpatch`. Then the **user** runs, in a terminal opened as administrator in the figma-cli folder: `node src/index.js connect`. Figma closes and reopens with port 9222; open files come back. Then `node src/index.js daemon restart` and test with `node src/index.js eval "figma.root.name"`. No plugin is needed and Figma can stay minimized. After a Figma update (port 9222 closed): the user presses **Connect** on the FigCli card in the dashboard, or runs `node tools/figcli_doctor.cjs --fix --restart-figma --figcli <figma-cli folder>` in a normal (not administrator) terminal at the Root. It finds the cause (port held by another program, the running Figma version unpatched, Figma started without the port or as administrator, stale daemon) and repairs it; `figma-cli connect` alone is not enough, because it sorts version folders as text and re-patches the old one (126.11.9 above 126.11.11).
   - Never Safe mode (`connect --safe`) or Browser mode. Where patching is not allowed, install the Desktop Bridge instead.
5. Several files open (Yolo): set `FIGMA_FILE="<exact name or a part only that file has>"` on every command; without it, commands go to the last connected file (Intake section 0b, Yolo rules).
6. Do not run `figma-cli init-agent` in the Root and do not install its Claude Code plugin.
7. Done when `node src/index.js daemon status` reports it running and `python tools/figma_tools_check.py` lists it with port 9222 open.

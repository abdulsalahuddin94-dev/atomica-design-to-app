// Figma edit check: has a project's DS file changed in Figma since its Storybook was last synced?
//
// Reads the file's version history (Figma REST `GET /v1/files/:key/versions`, scope file_versions:read)
// and compares it with `status.json > figma.design_system.storybook_synced_version` ({id, created_at}).
// Figma saves a history version on every publish, named version and editing session (autosave), so
// manual edits made in Figma between Claude sessions show up here even when no CHANGELOG.md entry
// mentions them.
//
// Used by the SessionStart hook (.claude/hooks/storybook_notice.cjs) and from the command line:
//   node tools/figma_versions.cjs                         list projects whose DS file changed since the last sync
//   node tools/figma_versions.cjs "My Projects/<P>" --record
//                                                         record the latest version as synced (after a
//                                                         Storybook update, or when the user says no resync is needed)
// `python tools/project_status.py "<folder>" --mark-synced` runs --record itself.
//
// Token: FIGMA_ACCESS_TOKEN, read the way figma-console-mcp gets it (environment, then the figma-console
// entry in ~/.claude.json or the Root .mcp.json). The token is only sent to api.figma.com: never
// printed, logged or written anywhere. No token, offline, slow or rejected -> the check is skipped,
// never an error, and startup waits at most TOTAL_MS.
const fs = require("fs");
const https = require("https");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const REQUEST_MS = 2500;
const TOTAL_MS = 3000;

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch (e) { return null; }
}

function samePath(a, b) {
  const n = (p) => path.resolve(p).replace(/[\\/]+$/, "").toLowerCase();
  return n(a) === n(b);
}

function tokenFrom(servers) {
  if (!servers || typeof servers !== "object") return null;
  for (const [name, s] of Object.entries(servers)) {
    const t = s && s.env && s.env.FIGMA_ACCESS_TOKEN;
    if (/figma/i.test(name) && t && !/YOUR_TOKEN/i.test(t)) return t;
  }
  return null;
}

function token() {
  if (process.env.FIGMA_ACCESS_TOKEN) return process.env.FIGMA_ACCESS_TOKEN;
  const user = readJson(path.join(os.homedir(), ".claude.json")) || {};
  const local = Object.entries(user.projects || {}).find(([dir]) => samePath(dir, ROOT));
  return tokenFrom(local && local[1].mcpServers) ||
    tokenFrom(user.mcpServers) ||
    tokenFrom((readJson(path.join(ROOT, ".mcp.json")) || {}).mcpServers);
}

function subdirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => path.join(dir, d.name)).sort();
  } catch (e) {
    return [];
  }
}

function rel(folder) {
  return path.relative(ROOT, folder).split(path.sep).join("/");
}

// Projects with a built Storybook and a DS file key. Storybook plan "no" is skipped.
function projects() {
  return subdirs(path.join(ROOT, "My Projects"))
    .filter((d) => path.basename(d) !== "_Project_Template")
    .map((folder) => ({ folder, status: readJson(path.join(folder, "status.json")) }))
    .filter(({ folder, status }) => status &&
      fs.existsSync(path.join(folder, "storybook", "package.json")) &&
      String(status.storybook_plan || "").toLowerCase() !== "no" &&
      ((status.figma || {}).design_system || {}).file_key);
}

function versions(key, tok) {
  return new Promise((resolve) => {
    const req = https.get({
      host: "api.figma.com",
      path: `/v1/files/${encodeURIComponent(key)}/versions?page_size=50`,
      headers: { "X-Figma-Token": tok },
      timeout: REQUEST_MS,
    }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        if (res.statusCode === 401 || res.statusCode === 403) return resolve({ error: "denied", code: res.statusCode });
        if (res.statusCode === 404) return resolve({ error: "not-found", code: 404 });
        if (res.statusCode !== 200) return resolve({ error: "http", code: res.statusCode });
        try {
          resolve({ versions: (JSON.parse(body).versions || []).filter((v) => v && v.created_at) });
        } catch (e) {
          resolve({ error: "http" });
        }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve({ error: "offline" }); });
    req.on("error", () => resolve({ error: "offline" }));
  });
}

function withTimeout(promise, ms, fallback) {
  let t;
  return Promise.race([promise, new Promise((r) => { t = setTimeout(() => r(fallback), ms); })])
    .finally(() => clearTimeout(t));
}

function writeBaseline(folder, status, latest) {
  status.figma.design_system.storybook_synced_version = latest
    ? { id: latest.id, created_at: latest.created_at }
    : { id: null, created_at: new Date().toISOString() };
  fs.writeFileSync(path.join(folder, "status.json"), JSON.stringify(status, null, 2) + "\n", "utf8");
}

// Compare one project's DS file history with its synced version.
// -> {rel, changed, since, latest, editors} | {rel, error} | null (nothing new)
function compare({ folder, status }, result) {
  if (result.error) return { rel: rel(folder), error: result.error, code: result.code };
  const list = result.versions;
  if (!list.length) return null;
  const ds = status.figma.design_system;
  const base = ds.storybook_synced_version;
  let newer;
  let since;
  if (base && base.created_at) {
    newer = list.filter((v) => v.created_at > base.created_at && v.id !== base.id);
    since = base.created_at.slice(0, 10);
  } else if (status.last_storybook_sync) {
    // No version recorded yet: anything saved on a later day than the last sync counts.
    newer = list.filter((v) => v.created_at.slice(0, 10) > status.last_storybook_sync);
    since = status.last_storybook_sync;
    if (!newer.length) writeBaseline(folder, status, list[0]); // nothing new: start tracking from here
  } else {
    newer = list;
    since = null;
  }
  if (!newer.length) return null;
  const editors = [...new Set(newer.map((v) => (v.user && v.user.handle) || "").filter(Boolean))];
  return { rel: rel(folder), changed: newer.length, since, latest: newer[0].created_at, editors, capped: newer.length === list.length && list.length >= 50 };
}

// For the SessionStart hook: {tok: bool, eligible: n, changed: [...], errors: [...]}. Never throws.
async function check() {
  const list = projects();
  const tok = list.length ? token() : null;
  if (!list.length || !tok) return { tok: !!tok, eligible: list.length, changed: [], errors: [] };
  const fallback = list.map(() => ({ error: "offline" }));
  const results = await withTimeout(
    Promise.all(list.map((p) => versions(p.status.figma.design_system.file_key, tok))), TOTAL_MS, fallback);
  const rows = list.map((p, i) => { try { return compare(p, results[i]); } catch (e) { return null; } }).filter(Boolean);
  return {
    tok: true,
    eligible: list.length,
    changed: rows.filter((r) => !r.error),
    errors: rows.filter((r) => r.error && r.error !== "offline"),
  };
}

async function record(folderArg) {
  const folder = path.resolve(ROOT, folderArg);
  const status = readJson(path.join(folder, "status.json"));
  const key = status && ((status.figma || {}).design_system || {}).file_key;
  if (!key) {
    console.log(`${rel(folder)}: no figma.design_system.file_key in status.json, nothing recorded.`);
    return;
  }
  const tok = token();
  const result = tok ? await withTimeout(versions(key, tok), TOTAL_MS, { error: "offline" }) : { error: "no-token" };
  const latest = result.versions && result.versions[0];
  writeBaseline(folder, status, latest);
  console.log(latest
    ? `${rel(folder)}: Storybook synced with Figma version ${latest.id} (${latest.created_at}).`
    : `${rel(folder)}: Figma history not reachable (${result.error}); recorded the current time as the sync point.`);
}

function describe(r) {
  const since = r.since ? ` since ${r.since}` : " (no Storybook sync recorded yet)";
  const by = r.editors.length ? ` by ${r.editors.join(", ")}` : "";
  return `- \`${r.rel}\`: ${r.capped ? "50+" : r.changed} Figma version(s)${since}, latest ${r.latest.slice(0, 16).replace("T", " ")} UTC${by}`;
}

async function main(args) {
  if (args[0] && args.includes("--record")) return record(args[0]);
  const res = await check();
  if (!res.eligible) return console.log("No project has both a Storybook and a DS file key.");
  if (!res.tok) return console.log("No Figma token found (FIGMA_ACCESS_TOKEN in the figma-console MCP config); check skipped.");
  res.changed.forEach((r) => console.log(describe(r).slice(2)));
  res.errors.forEach((r) => console.log(`${r.rel}: Figma refused the version history (${r.code}).`));
  if (!res.changed.length && !res.errors.length) console.log("No DS file changed in Figma since its last Storybook sync (or Figma was not reachable).");
}

// For the dashboard's Sync page: one project folder -> compare() result, null (nothing new or no key / token),
// or {error}. Never throws; waits at most TOTAL_MS.
async function checkFolder(folder) {
  const status = readJson(path.join(folder, "status.json"));
  const key = status && status.figma && status.figma.design_system && status.figma.design_system.file_key;
  if (!key) return null;
  const tok = token();
  if (!tok) return { error: "no-token" };
  const result = await withTimeout(versions(key, tok), TOTAL_MS, { error: "offline" });
  try { return compare({ folder, status }, result); } catch (e) { return null; }
}

// token() is shared with tools/figma_sync.cjs; it is never printed or written.
module.exports = { check, describe, checkFolder, token };

if (require.main === module) {
  main(process.argv.slice(2)).catch(() => {}).finally(() => { process.exitCode = 0; });
}

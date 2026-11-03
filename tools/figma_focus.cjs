// Brings a Figma Desktop file tab to the front before FigCli work that needs it visible.
//
// Figma throttles a background tab: async Plugin API calls (fonts, text styles, exportAsync) take about 30 s each,
// so write batches and screenshots stall (memory/lessons.md, 2026-10-13). This switches Figma to the target tab
// through the debugging port that FigCli Yolo already opens (127.0.0.1:9222): it clicks that file's tab in Figma's
// own tab bar, the same as the user clicking it. Nothing in the file is read or changed.
//
//   node tools/figma_focus.cjs "<FIGMA_FILE>"     exit 0 = visible, 2 = still hidden, 3 = not found, 4 = no port
//
// Limits (best effort): needs FigCli Yolo (port 9222) and Node 22+ (built-in WebSocket); a minimized Figma window
// stays hidden until the user restores it; the name must match one open file only; if Figma renames its tab bar
// classes the click finds no tab and the caller falls back to asking the user. The pre-tool hook
// (.claude/hooks/figma_focus.cjs) runs this before FigCli write scripts and screenshots.
const PORT = 9222;
const TITLE_END = /\s+[–-]\s+Figma$/;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 1500);
  try {
    return await (await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: ctl.signal })).json();
  } finally { clearTimeout(t); }
}

// One Runtime.evaluate on a page target; resolves to the returned value (or undefined after the timeout).
function evaluate(target, expression, timeout = 2000) {
  return new Promise((resolve) => {
    let ws;
    const done = (v) => { clearTimeout(timer); try { ws.close(); } catch (e) { /* closed */ } resolve(v); };
    const timer = setTimeout(() => done(undefined), timeout);
    try { ws = new WebSocket(target.webSocketDebuggerUrl); } catch (e) { return done(undefined); }
    ws.onerror = () => done(undefined);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
    ws.onmessage = (m) => {
      const d = JSON.parse(m.data);
      if (d.id === 1) done(d.result && d.result.result ? d.result.result.value : undefined);
    };
  });
}

// The file tab whose name matches `want` the way FigCli matches FIGMA_FILE: an exact name wins, else a part that
// only one open file has.
function pick(files, want) {
  const exact = files.filter((f) => f.name === want);
  if (exact.length) return { file: exact[0] };
  const part = files.filter((f) => f.name.includes(want));
  if (part.length === 1) return { file: part[0] };
  return { error: part.length ? `"${want}" matches ${part.length} open files (${part.map((f) => f.name).join(", ")})` : `no open Figma file matches "${want}"` };
}

async function focus(want) {
  if (typeof WebSocket === "undefined") return { status: "no-port", message: "Node 22+ is needed to switch Figma tabs." };
  let list;
  try { list = await targets(); } catch (e) {
    return { status: "no-port", message: "Figma's debugging port 9222 is closed (FigCli Yolo not connected)." };
  }
  const pages = list.filter((t) => t.type === "page");
  const shell = pages.find((t) => /shell\.html/.test(t.url));
  const files = pages.filter((t) => /figma\.com\/(design|board|slides|proto)\//.test(t.url))
    .map((t) => ({ name: t.title.replace(TITLE_END, ""), target: t }));
  const hit = pick(files, want);
  if (!hit.file) return { status: "not-found", message: hit.error };
  const name = hit.file.name;
  const state = () => evaluate(hit.file.target, "document.visibilityState");
  const before = await state();
  if (before === "visible") return { status: "visible", file: name, switched: false };
  if (!shell) return { status: "hidden", file: name, message: "Figma's tab bar was not found." };
  const clicked = await evaluate(shell, `(() => {
    const tab = [...document.querySelectorAll('[role=tab]')].find((b) => (b.textContent || '').trim() === ${JSON.stringify(name)});
    if (!tab) return false;
    tab.click();
    return true;
  })()`);
  if (!clicked) return { status: "hidden", file: name, message: `No tab named "${name}" in Figma's tab bar.` };
  for (let i = 0; i < 10; i++) {
    await sleep(300);
    if (await state() === "visible") return { status: "visible", file: name, switched: true };
  }
  return { status: "hidden", file: name, switched: true,
    message: "The tab was selected but the file is still hidden: Figma is probably minimized or behind a full-screen window." };
}

module.exports = { focus, pick };

if (require.main === module) {
  const want = process.argv[2] || process.env.FIGMA_FILE;
  if (!want) { console.log('Usage: node tools/figma_focus.cjs "<Figma file name>"'); process.exit(1); }
  focus(want).then((r) => {
    console.log(JSON.stringify(r));
    process.exit({ visible: 0, hidden: 2, "not-found": 3, "no-port": 4 }[r.status] ?? 1);
  });
}

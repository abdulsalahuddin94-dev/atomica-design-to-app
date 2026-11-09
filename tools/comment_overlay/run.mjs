#!/usr/bin/env node
// Runs any Vite app (Lovable, Bolt, Figma Make, a Vibe code app) with the review comment overlay injected, without
// changing a file in the app: its own vite.config is loaded as usual and one extra plugin adds overlay.js to the page.
//   node tools/comment_overlay/run.mjs <app folder> --project <slug> [--port 5190]
// Supabase: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from the environment (the dashboard passes the project's public
// pair, never the secret key). Without them comments stay in the reviewer's browser.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const app = path.resolve(args[0] || ".");
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const port = Number(opt("--port", 5190));
const project = String(opt("--project", path.basename(app)));

const viteEntry = path.join(app, "node_modules", "vite", "dist", "node", "index.js");
if (!fs.existsSync(viteEntry)) { console.error(`No Vite in ${app}: install the app's packages first (npm install).`); process.exit(2); }
const { createServer } = await import(pathToFileURL(viteEntry).href);

const overlay = fs.readFileSync(path.join(here, "overlay.js"), "utf8");
const settings = { url: process.env.VITE_SUPABASE_URL || "", key: process.env.VITE_SUPABASE_ANON_KEY || "", project };
const { isPublicKey } = createRequire(import.meta.url)("../project_repo.cjs");
if (settings.key && !isPublicKey(settings.key)) { console.error("Refused: that is not a public Supabase key; the overlay takes only the anon / publishable key."); process.exit(2); }

const plugin = {
  name: "atomica-comment-overlay",
  apply: "serve",
  configureServer(server) {
    server.middlewares.use("/@atomica/overlay.js", (_req, res) => { res.setHeader("content-type", "text/javascript; charset=utf-8"); res.end(overlay); });
  },
  transformIndexHtml() {
    return [
      { tag: "script", children: `window.__ATOMICA_COMMENTS__=${JSON.stringify(settings).replace(/</g, "\\u003c")};`, injectTo: "body" },
      { tag: "script", attrs: { src: "/@atomica/overlay.js", defer: true }, injectTo: "body" },
    ];
  },
};

const server = await createServer({ root: app, plugins: [plugin], server: { port, strictPort: true, host: "127.0.0.1" } });
await server.listen();
console.log(`Preview with comments: http://localhost:${port}/ (project "${project}", ${settings.url && settings.key ? "shared through Supabase" : "local test store"})`);

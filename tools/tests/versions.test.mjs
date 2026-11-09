// Version history (tools/versions.cjs): a version per change, revert as a new version, bookmarks, the published mark,
// a read-only copy for viewing, and the app folder only (never the brief or status). Real git, temp folders, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const v = require("../versions.cjs");
process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-home-"));
process.env.USERPROFILE = process.env.HOME;

function project() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-versions-"));
  fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify({ start: "vibe-code" }));
  fs.writeFileSync(path.join(dir, "Project_Brief.md"), "brief v1\n");
  fs.mkdirSync(path.join(dir, "prototype", "src"), { recursive: true });
  fs.mkdirSync(path.join(dir, "prototype", "node_modules", "vite"), { recursive: true });
  fs.writeFileSync(path.join(dir, "prototype", "src", "App.tsx"), "export const title = 'One';\n");
  return dir;
}
const read = (dir, f) => fs.readFileSync(path.join(dir, f), "utf8");

test("a change becomes a version; no change makes none; packages stay out", () => {
  const dir = project();
  const a = v.snapshot(dir, "First screen");
  assert.equal(a.ok, true); assert.equal(a.created, true);
  assert.equal(v.snapshot(dir, "Nothing").created, false);
  const l = v.list(dir);
  assert.equal(l.versions.length, 1);
  assert.equal(l.versions[0].message, "First screen");
  assert.equal(l.versions[0].current, true);
  assert.match(read(dir, ".gitignore"), /node_modules\//);
});

test("revert is a new version with the old content, and removes files added later", () => {
  const dir = project();
  v.snapshot(dir, "One");
  const first = v.list(dir).versions[0].sha;
  fs.writeFileSync(path.join(dir, "prototype", "src", "App.tsx"), "export const title = 'Two';\n");
  fs.writeFileSync(path.join(dir, "prototype", "src", "New.tsx"), "x\n");
  v.snapshot(dir, "Two");
  fs.writeFileSync(path.join(dir, "prototype", "src", "App.tsx"), "export const title = 'Unsaved';\n");
  const r = v.revert(dir, first);
  assert.equal(r.ok, true, r.error);
  assert.equal(read(dir, "prototype/src/App.tsx"), "export const title = 'One';\n");
  assert.equal(fs.existsSync(path.join(dir, "prototype", "src", "New.tsx")), false);
  const msgs = v.list(dir).versions.map((x) => x.message);
  assert.match(msgs[0], /^Reverted to /);
  assert.equal(msgs[1], "Before revert (unsaved changes)");
  assert.equal(msgs.length, 4); // nothing lost: One, Two, Before revert, Reverted
});

test("only the app folder is versioned and reverted, never the brief", () => {
  const dir = project();
  v.snapshot(dir, "One");
  const first = v.list(dir).versions[0].sha;
  fs.writeFileSync(path.join(dir, "Project_Brief.md"), "brief v2\n");
  fs.writeFileSync(path.join(dir, "prototype", "src", "App.tsx"), "export const title = 'Two';\n");
  v.snapshot(dir, "Two");
  v.revert(dir, first);
  assert.equal(read(dir, "Project_Brief.md"), "brief v2\n");
});

test("bookmarks and the published mark", () => {
  const dir = project();
  v.snapshot(dir, "One");
  const one = v.list(dir).versions[0].sha;
  assert.equal(v.bookmark(dir, one, "Before the redesign").ok, true);
  fs.mkdirSync(path.join(dir, "prototype", "data"), { recursive: true });
  fs.writeFileSync(path.join(dir, "prototype", "data", "publish.json"), JSON.stringify({ url: "https://x.github.io/y/", commit: one.slice(0, 7) }));
  fs.writeFileSync(path.join(dir, "prototype", "src", "App.tsx"), "export const title = 'Two';\n");
  v.snapshot(dir, "Two");
  const l = v.list(dir).versions;
  const old = l.find((x) => x.sha === one);
  assert.equal(old.bookmark, "Before the redesign");
  assert.equal(old.published, true);
  assert.equal(l[0].published, false);
  v.unbookmark(dir, one);
  assert.equal(v.list(dir).versions.find((x) => x.sha === one).bookmark, null);
});

test("view makes a read-only copy of the old version without touching the working folder", () => {
  const dir = project();
  v.snapshot(dir, "One");
  const one = v.list(dir).versions[0].sha;
  fs.writeFileSync(path.join(dir, "prototype", "src", "App.tsx"), "export const title = 'Two';\n");
  v.snapshot(dir, "Two");
  const w = v.view(dir, one);
  assert.equal(w.ok, true, w.error);
  assert.equal(fs.readFileSync(path.join(w.app, "src", "App.tsx"), "utf8"), "export const title = 'One';\n");
  assert.equal(fs.existsSync(path.join(w.app, "node_modules", "vite")), true);
  assert.equal(read(dir, "prototype/src/App.tsx"), "export const title = 'Two';\n");
  v.clearViews(dir);
  assert.equal(fs.existsSync(w.app), false);
  assert.equal(fs.existsSync(path.join(dir, "prototype", "node_modules", "vite")), true); // the shared packages survive
});

test("a key in the app stops the version", () => {
  const dir = project();
  fs.writeFileSync(path.join(dir, "prototype", "src", "keys.ts"), `export const k = "sb_secret_${"a".repeat(20)}";\n`);
  const r = v.snapshot(dir, "Leak");
  assert.equal(r.ok, false);
  assert.match(r.error, /keys\.ts/);
});

test("bad input is refused", () => {
  const dir = project();
  v.snapshot(dir, "One");
  assert.equal(v.revert(dir, "HEAD; rm -rf /").ok, false);
  assert.equal(v.view(dir, "--help").ok, false);
});

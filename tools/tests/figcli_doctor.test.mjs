// FigCli doctor: the Figma version that runs is the one patched, folders sort as numbers (lessons 2026-11-23).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const d = createRequire(import.meta.url)("../figcli_doctor.cjs");

test("version folders sort as numbers, newest first", () => {
  assert.deepEqual(d.sortFolders(["app-126.11.9", "packages", "app-126.11.11", "app-126.11.8"]), ["app-126.11.11", "app-126.11.9", "app-126.11.8"]);
  assert.deepEqual(d.sortFolders(["app-99.0.0", "app-100.0.0"]), ["app-100.0.0", "app-99.0.0"]);
});

test("asar state and patch", () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "figdoc-")), "app.asar");
  fs.writeFileSync(f, Buffer.concat([Buffer.from("head "), d.BLOCK, Buffer.from(" tail")]));
  assert.equal(d.asarState(fs.readFileSync(f)), "blocked");
  assert.equal(d.patch({ asar: f }), true);
  assert.equal(d.asarState(fs.readFileSync(f)), "patched");
  assert.equal(fs.readFileSync(f).length, Buffer.byteLength("head  tail") + d.BLOCK.length, "same size, bytes swapped in place");
  assert.equal(d.patch({ asar: f }), true, "already patched is fine");
  assert.equal(d.asarState(Buffer.from("new figma code")), "unknown");
});

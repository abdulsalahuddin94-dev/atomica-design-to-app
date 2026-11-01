// Publishing and dashboard checks that must hold for every project and every computer (node --test tools/tests).
// Covers the 2026-10-28 problems: an auth or gh failure read as "repo does not exist", a stale "up to date" state that
// disabled Publish, and the live prototype shown as a second Storybook. No network: git and gh are faked.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { classifyError, runChecks, userEnv } = require("../publish_checks.cjs");
const { projectLinks, newestPrototypeChange } = await import("../../dashboard/project-api.mjs");

// A prototype folder that looks built (the preflight's package check passes).
function fakeApp() {
  const app = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-app-"));
  fs.mkdirSync(path.join(app, "node_modules", "vite", "bin"), { recursive: true });
  fs.writeFileSync(path.join(app, "node_modules", "vite", "bin", "vite.js"), "");
  return app;
}
// git and gh, faked: each rule is [command matcher, result]; a string result is stdout, an Error is a failure.
const fail = (stderr) => Object.assign(new Error("Command failed"), { stderr });
function fakeRun(rules) {
  return (cmd, args) => {
    const line = `${cmd} ${args.join(" ")}`;
    for (const [re, out] of rules) if (re.test(line)) { if (out instanceof Error) throw out; return out; }
    return "";
  };
}

test("errors: an auth problem is never read as not-found", () => {
  assert.equal(classifyError("remote: Invalid username or password. fatal: Authentication failed for 'https://github.com/a/b.git/'"), "auth");
  assert.equal(classifyError("fatal: could not read Username for 'https://github.com': terminal prompts disabled"), "auth");
  assert.equal(classifyError("To get started with GitHub CLI, please run:  gh auth login"), "auth");
  assert.equal(classifyError("remote: Repository not found. fatal: repository 'https://github.com/a/b.git/' not found"), "not-found");
  assert.equal(classifyError("GraphQL: Could not resolve to a Repository with the name 'a/b'."), "not-found");
  assert.equal(classifyError("fatal: unable to access 'https://github.com/a/b.git/': Could not resolve host: github.com"), "network");
  assert.equal(classifyError("spawnSync gh ENOENT"), "missing-tool");
});

test("preflight: gh missing or signed out does not block publishing to an existing repo", () => {
  const r = runChecks({ repo: "owner/site", app: fakeApp(), siteHead: true, run: fakeRun([
    [/^git --version/, "git version 2.46"],
    [/^gh /, fail("spawnSync gh ENOENT")],
    [/^git ls-remote/, "abc\trefs/heads/gh-pages\n"],
  ]) });
  assert.equal(r.repoState, "exists");
  assert.equal(r.ok, true);
  assert.equal(r.checks.find((c) => c.key === "gh").ok, false);
  assert.equal(r.checks.find((c) => c.key === "gh").optional, true);
});

test("preflight: an auth failure says sign in, never 'does not exist'", () => {
  const r = runChecks({ repo: "owner/site", app: fakeApp(), run: fakeRun([
    [/^git --version/, "git version 2.46"],
    [/^gh auth status/, fail("You are not logged into any GitHub hosts. To log in, run: gh auth login")],
    [/^git ls-remote/, fail("fatal: Authentication failed for 'https://github.com/owner/site.git/'")],
  ]) });
  const repo = r.checks.find((c) => c.key === "repo");
  assert.equal(r.repoState, "auth");
  assert.equal(r.ok, false);
  assert.doesNotMatch(repo.reason, /does not exist/);
  assert.match(repo.fix, /sign in/i);
});

test("preflight: a missing repo is confirmed (gh signed in) and asks for the create step", () => {
  const r = runChecks({ repo: "owner/new-site", app: fakeApp(), run: fakeRun([
    [/^git --version/, "git version 2.46"],
    [/^gh --version|^gh auth status/, "ok"],
    [/^git ls-remote/, fail("remote: Repository not found.")],
    [/^gh repo view/, fail("GraphQL: Could not resolve to a Repository with the name 'owner/new-site'.")],
  ]) });
  assert.equal(r.repoState, "missing");
  assert.match(r.checks.find((c) => c.key === "repo").fix, /Create/);
});

test("preflight: not-found without gh is reported as missing-or-private, not as missing", () => {
  const r = runChecks({ repo: "owner/maybe-private", app: fakeApp(), run: fakeRun([
    [/^git --version/, "git version 2.46"],
    [/^gh /, fail("spawnSync gh ENOENT")],
    [/^git ls-remote/, fail("remote: Repository not found.")],
  ]) });
  assert.equal(r.repoState, "missing-or-private");
  assert.match(r.checks.find((c) => c.key === "repo").reason, /private/);
});

test("environment: home folders and prompts are set however the caller started", () => {
  const env = userEnv({ PATH: "" });
  assert.ok(env.HOME && env.USERPROFILE);
  assert.equal(env.GIT_TERMINAL_PROMPT, "0");
});

test("change detection: any prototype file newer than the last publish counts (not only routes.tsx)", () => {
  const proto = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-proto-"));
  for (const d of ["src/generated/screens", "data", "public"]) fs.mkdirSync(path.join(proto, d), { recursive: true });
  const old = new Date(Date.now() - 3600_000);
  for (const f of ["src/generated/routes.tsx", "data/overrides.json", "public/x.png"]) { fs.writeFileSync(path.join(proto, f), "x"); fs.utimesSync(path.join(proto, f), old, old); }
  const publishedAt = Date.now() - 1800_000;
  assert.ok(newestPrototypeChange(proto) < publishedAt, "nothing changed since the publish");
  fs.writeFileSync(path.join(proto, "src/generated/screens/profile.tsx"), "new screen");
  assert.ok(newestPrototypeChange(proto) > publishedAt, "a new screen file is an unpublished change");
  fs.writeFileSync(path.join(proto, "data/publish.json"), "{}"); // the publish record itself never counts
});

test("links: a second project with its own names is classified from its config", () => {
  const status = {
    figma: { design_system: { name: "Acme DS", url: "https://www.figma.com/design/AAA/Acme-DS" }, design_files: [{ name: "Acme App", url: "https://www.figma.com/design/BBB/Acme-App" }] },
    prototype: { url: "https://acme-team.github.io/acme-review/" },
    storybook_url: "https://acme-team.github.io/acme-components/",
  };
  const brief = "Docs: https://acme-team.github.io/acme-review/ and the marketing site https://acme-team.github.io/acme-landing/";
  const links = projectLinks(status, brief, null);
  const kinds = Object.fromEntries(links.map((l) => [l.url, l.kind]));
  assert.equal(kinds["https://acme-team.github.io/acme-review/"], "prototype");
  assert.equal(kinds["https://acme-team.github.io/acme-components/"], "storybook");
  assert.equal(kinds["https://acme-team.github.io/acme-landing/"], "link");
  assert.equal(links.filter((l) => l.kind === "storybook").length, 1);
  assert.equal(links.filter((l) => l.kind === "figma").length, 2);
});

test("links: an older project without storybook_url still finds its Storybook by name", () => {
  const links = projectLinks({}, "Storybook: https://someone.github.io/shop-design-system/", null);
  assert.deepEqual(links.map((l) => l.kind), ["storybook"]);
});

// No hover on mobile (2026-10-28): the check flags a mobile project's Hover and leaves a Web project alone.
const { isMobileProject, findHover } = require("../check_no_hover.cjs");
function fakeProject(platform, css, states) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-hover-"));
  fs.writeFileSync(path.join(dir, "Project_Brief.md"), `| # | Question | Answer |\n|---|---|---|\n| 1.1 | Web / Mobile | ${platform} |\n`);
  fs.mkdirSync(path.join(dir, "storybook", "src", "styles"), { recursive: true });
  fs.writeFileSync(path.join(dir, "storybook", "src", "styles", "nav.css"), css);
  fs.mkdirSync(path.join(dir, "data"));
  fs.writeFileSync(path.join(dir, "data", "component-registry.json"), JSON.stringify({ components: [{ name: "Button", variants: { State: states } }] }));
  return dir;
}
test("no hover: a mobile project's Hover is found (registry and styles), Pressed is fine", () => {
  const dir = fakeProject("Mobile (Android)", ".btn:hover { opacity: .88 }\n.btn:active { opacity: .82 }\n", ["Enabled", "Hovered", "Pressed"]);
  assert.equal(isMobileProject(dir), true);
  const f = findHover(dir);
  assert.equal(f.filter((x) => x.where === "registry").length, 1);
  assert.equal(f.filter((x) => x.where === "storybook").length, 1);
});
test("no hover: a Web project may keep its hover", () => {
  const dir = fakeProject("Web", ".btn:hover { opacity: .88 }\n", ["Enabled", "Hovered"]);
  assert.equal(isMobileProject(dir), false);
});

// Two-way Figma sync (tools/figma_sync.cjs): the comparison never hides a change and never overwrites silently.
const { diffSync, stripPage } = require("../figma_sync.cjs");
const snap = { screens: { home: { figmaHash: "f1", codeHash: "c1", figmaMethod: "figcli" }, cart: { figmaHash: "f2", codeHash: "c2", figmaMethod: "figcli" }, about: { figmaHash: "f3", codeHash: "c3", figmaMethod: "figcli" } } };
test("sync: changed on one side, on both sides (conflict), in sync", () => {
  const rows = diffSync({ snapshot: snap, figma: { method: "figcli", screens: { home: { exists: true, hash: "F1" }, cart: { exists: true, hash: "F2" }, about: { exists: true, hash: "f3" } } }, code: { home: "c1", cart: "C2", about: "c3" } });
  const by = Object.fromEntries(rows.map((r) => [r.slug, r.status]));
  assert.equal(by.home, "figma-changed");
  assert.equal(by.cart, "conflict");
  assert.equal(by.about, "in-sync");
});
test("sync: a pending code-first change counts as a prototype change even before a snapshot", () => {
  const rows = diffSync({ snapshot: { screens: {} }, figma: { method: "figcli", screens: { home: { exists: true, hash: "x" } } }, code: { home: "c" }, pendingSlugs: ["home"] });
  assert.equal(rows[0].status, "prototype-changed");
});
test("sync: new frames, removed frames and code-only screens", () => {
  const rows = diffSync({ snapshot: snap, figma: { method: "figcli", screens: { home: { exists: false }, draft: { codeOnly: true } }, newFrames: [{ id: "9:1", name: "Settings" }] }, code: { home: "c1", draft: "d" } });
  const by = Object.fromEntries(rows.map((r) => [r.slug, r.status]));
  assert.equal(by.home, "removed-in-figma");
  assert.equal(by.draft, "prototype-only");
  assert.equal(by.settings, "new-in-figma");
});
test("sync: another reading method (REST vs FigCli) re-baselines instead of reporting a fake Figma change", () => {
  const rows = diffSync({ snapshot: snap, figma: { method: "rest", screens: { home: { exists: true, hash: "different" } } }, code: { home: "c1" } });
  assert.equal(rows[0].status, "baseline");
  assert.equal(rows[0].rebaseline, true);
});
test("sync: page prefixes are dropped only when they are a real prefix", () => {
  assert.equal(stripPage("Listen / Explore - Full", "Listen"), "Explore - Full");
  assert.equal(stripPage("Listening Room", "Listen"), "Listening Room");
});

// Add-ons (2026-11-01): the daily check, ownership rules, the code repo as a third side.
const { compareWatch, codeRepoOf } = require("../sync_watch.cjs");
const { proposalFor, codeItems, saveRules, readRules, DEFAULT_RULES } = require("../figma_sync.cjs");
test("daily check: no change means nothing to say; a new Figma version or commit is a change", () => {
  const prev = { figmaVersion: "v1", codeCommit: "c1" };
  assert.equal(compareWatch(prev, { figmaVersion: "v1", codeCommit: "c1" }).changed, false);
  assert.equal(compareWatch(prev, { figmaVersion: null, codeCommit: null }).changed, false, "a failed read is not a change");
  assert.equal(compareWatch(null, { figmaVersion: "v1" }).first, true, "the first run only records");
  assert.equal(compareWatch(null, { figmaVersion: "v1" }).changed, false);
  const r = compareWatch(prev, { figmaVersion: "v2", codeCommit: "c2" });
  assert.deepEqual(r.changes.map((c) => c.side), ["figma", "code"]);
});
test("daily check: a linked code repo is read from status.json in either form", () => {
  assert.equal(codeRepoOf({ code_repo: "https://github.com/o/app" }).url, "https://github.com/o/app.git");
  assert.equal(codeRepoOf({ code_repo: { url: "https://github.com/o/app.git", branch: "main" } }).branch, "main");
  assert.equal(codeRepoOf({}), null);
});
test("ownership: an owned conflict gets the owner's side; mixed owners stay a question; a screen rule wins", () => {
  assert.equal(proposalFor("home", DEFAULT_RULES, ["Primary color changed to green"]).side, "figma");
  assert.equal(proposalFor("home", DEFAULT_RULES, ["New status filter on the list"]).side, "code");
  assert.equal(proposalFor("home", DEFAULT_RULES, ["New filter", "and a new color"]), null);
  assert.equal(proposalFor("home", { ...DEFAULT_RULES, screens: { home: "code" } }, ["color"]).side, "code");
});
test("ownership: saved rules keep only figma, code or null", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-rules-"));
  saveRules(dir, { screens: { home: "figma", bad: "everyone" }, categories: { colors: "code", "x y": "figma" } });
  const r = readRules(dir);
  assert.equal(r.screens.home, "figma");
  assert.equal(r.screens.bad, undefined);
  assert.equal(r.categories.colors, "code");
  assert.equal(r.categories["x y"], undefined);
});
test("code repo: new commits become items; merges and housekeeping are left out", () => {
  const items = codeItems("a1\tAdd status filter to Action Tracker\nb2\tchore: bump deps\nc3\tMerge pull request #4\nd4\tFix copy on the empty state");
  assert.deepEqual(items.map((i) => i.sha), ["a1", "d4"]);
});

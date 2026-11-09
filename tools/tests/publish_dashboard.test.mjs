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

// ---------- Storybook: opt-in by sections ----------
const sb = require("../storybook_sections.cjs");
const { screenGroup } = await import("../../dashboard/project-api.mjs");

test("storybook: off by default; unknown sections and empty names are dropped", () => {
  assert.equal(sb.normalize({}).enabled, false);
  assert.equal(sb.normalize({ enabled: "yes" }).enabled, false);
  const c = sb.normalize({ enabled: true, sections: ["colors-semantic", "nope", "colors-semantic"], components: ["Button", " ", "Button"] });
  assert.deepEqual(c.sections, ["colors-semantic"]);
  assert.deepEqual(c.components, ["Button"]);
  assert.equal(sb.plan({ sections: ["typography"] }).build.length, 0, "nothing is built while it is off");
});

test("storybook: the plan builds only what is checked, and skips the rest", () => {
  const avail = [{ name: "Button" }, { name: "Badge" }];
  const p = sb.plan({ enabled: true, sections: sb.PRESETS.tokens.sections, components: [] }, avail);
  assert.deepEqual(p.build.map((b) => b.id), sb.PRESETS.tokens.sections);
  assert.deepEqual(p.components, []);
  assert.ok(p.skip.includes("variants") && p.skip.includes("pages"));
  const d = sb.plan({ enabled: true, sections: sb.PRESETS.developer.sections, components: "all" }, avail);
  assert.deepEqual(d.components, ["Button", "Badge"]);
  assert.ok(d.componentDetail.includes("show-code") && !d.componentDetail.includes("figma-link"));
  assert.ok(!sb.PRESETS.developer.sections.includes("pages"), "the recommended preset never publishes");
  assert.deepEqual(sb.plan({ enabled: true, sections: [], components: ["Button", "Gone"] }, avail).components, ["Button"]);
});

test("storybook: code first lists component files, not stories, tests or index files", () => {
  const files = ["src/components/ui/button.tsx", "src/components/ui/button.stories.tsx", "src/components/ui/index.ts", "src/components/ui/index.tsx",
    "src/components/layout/top-bar.tsx", "src/components/Card.tsx", "src/pages/Home.tsx", "src/components/ui/input.test.tsx"];
  const c = sb.componentsFromFiles(files);
  assert.deepEqual(c.map((x) => x.name), ["Button", "Card", "TopBar"]);
  assert.equal(c.find((x) => x.name === "TopBar").group, "layout");
  assert.equal(c.find((x) => x.name === "Card").group, null);
});

test("storybook: saving keeps the project's other Storybook facts and follows the switch", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-sb-"));
  fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify({ storybook_plan: "later", storybook: { synced: "2026-10-01" } }));
  sb.saveConfig(dir, { enabled: true, sections: ["typography"], components: "all", preset: "nope" });
  const s = JSON.parse(fs.readFileSync(path.join(dir, "status.json"), "utf8"));
  assert.equal(s.storybook.synced, "2026-10-01");
  assert.equal(s.storybook.enabled, true);
  assert.equal(s.storybook.preset, null);
  assert.equal(s.storybook_plan, "yes");
  assert.deepEqual(sb.readConfig(dir).sections, ["typography"]);
});

test("screen picker: screens group by Figma section, else by the start of their name", () => {
  assert.equal(screenGroup("Login", "Flows / Auth"), "Auth");
  assert.equal(screenGroup("Checkout - Payment", null), "Checkout");
  assert.equal(screenGroup("Home", null), "Other");
});

// ---------- One repo per project (tools/project_repo.cjs); GitHub is mocked, nothing leaves this computer ----------
const pr = require("../project_repo.cjs");
const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url")}.c2lnbmF0dXJlLXZhbHVlLWhlcmU`;
const tmpProject = (status = {}) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-proj-")); fs.writeFileSync(path.join(d, "status.json"), JSON.stringify(status)); return d; };

test("secrets: tokens and the Supabase secret key are found; the public key and placeholders are not", () => {
  const kinds = (t) => pr.scanText(t, "f").map((x) => x.kind);
  assert.ok(kinds(`key: "${jwt("service_role")}"`).includes("Supabase service key"));
  assert.deepEqual(kinds(`VITE_SUPABASE_ANON_KEY=${jwt("anon")}`), []);
  assert.deepEqual(kinds("VITE_SUPABASE_ANON_KEY=sb_publishable_abcdefghijklmnop"), []);
  assert.ok(kinds("SUPABASE_SERVICE_KEY=sb_secret_abcdefghijklmnop").includes("Supabase secret key"));
  assert.ok(kinds("token figd_abcdefghijklmnopqrstuvwxyz0123").includes("Figma token"));
  assert.ok(kinds("ghp_abcdefghijklmnopqrstuvwxyz0123456789").includes("GitHub token"));
  assert.deepEqual(kinds("FIGMA_ACCESS_TOKEN=<your token here>\nGITHUB_TOKEN=${GITHUB_TOKEN}"), []);
  const found = pr.scanText("x\nSUPABASE_SERVICE_KEY=sb_secret_abcdefghijklmnop", "a.env");
  assert.equal(found[0].line, 2);
  assert.ok(!JSON.stringify(found).includes("sb_secret_abc"), "a finding never carries the value");
});

test("secrets: the pre-commit hook is added once and keeps an existing hook", () => {
  const d = tmpProject();
  assert.equal(pr.installHook(d).ok, false, "not a repo yet");
  fs.mkdirSync(path.join(d, ".git", "hooks"), { recursive: true });
  fs.writeFileSync(path.join(d, ".git", "hooks", "pre-commit"), "#!/bin/sh\necho mine\n");
  assert.equal(pr.installHook(d).appended, true);
  assert.equal(pr.installHook(d).already, true);
  const h = fs.readFileSync(path.join(d, ".git", "hooks", "pre-commit"), "utf8");
  assert.ok(h.includes("echo mine") && h.includes("--scan-staged") && pr.hookOn(d));
});

test("files: not uploaded, kept on purpose, keys and machine files are told apart", () => {
  const d = tmpProject();
  fs.mkdirSync(path.join(d, ".git"));
  fs.writeFileSync(path.join(d, "notes.md"), "SUPABASE_SERVICE_KEY=sb_secret_abcdefghijklmnop\n");
  const out = ["?? notes.md", " M data/tokens.json", "!! prototype/node_modules/", "!! prototype/.env.local", "!! prototype/comments/", "!! exports/old.fig", "!! storybook/storybook-static/"].join("\n");
  const a = pr.auditFiles(d, fakeRun([[/status/, out]]));
  assert.deepEqual(a.notCommitted.map((x) => x.file), ["notes.md", "data/tokens.json"]);
  assert.deepEqual(a.keptSecret, ["prototype/.env.local"]);
  assert.equal(a.machine, 2);
  assert.deepEqual(a.localOnly.map((x) => [x.file, x.upload]), [["prototype/comments/", false], ["exports/old.fig", true]]);
  assert.equal(a.secrets[0].file, "notes.md");
});

test("pages: the older setup stays until the project switches; then one repo with two links", () => {
  const d = tmpProject({ github: { repo: "https://github.com/acme/shop" } });
  assert.equal(pr.pagesPlan(d).mode, "separate");
  const s = pr.readStatus(d); s.github.pages = "project-repo"; pr.writeStatus(d, s);
  const p = pr.pagesPlan(d);
  assert.equal(p.repo, "acme/shop");
  assert.equal(p.prototype.base, "/shop/prototype/");
  assert.equal(p.storybook.url, "https://acme.github.io/shop/storybook/");
  assert.equal(pr.repoFromUrl("git@github.com:acme/shop.git"), "acme/shop");
  assert.equal(pr.repoFromUrl("https://example.com/x"), null);
});

test("pages: publishing one part keeps the other and refreshes the link page; never a force push", () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-dist-"));
  fs.writeFileSync(path.join(dist, "index.html"), "<p>prototype</p>");
  const calls = [];
  let page = null;
  const run = (cmd, args) => {
    calls.push(args.join(" "));
    if (args[0] === "clone") { const t = args[args.length - 1]; fs.mkdirSync(path.join(t, "storybook"), { recursive: true }); fs.writeFileSync(path.join(t, "storybook", "index.html"), "sb"); return ""; }
    if (args.includes("add")) page = fs.readFileSync(path.join(args[1], "index.html"), "utf8");
    return "";
  };
  const r = pr.pushPages({ repo: "acme/shop", subdir: "prototype", dist, title: "Shop", run });
  assert.deepEqual(r.parts, ["prototype", "storybook"]);
  assert.ok(page.includes("./prototype/") && page.includes("./storybook/") && page.includes(pr.LINK_MARK));
  assert.ok(calls.some((c) => c.includes("push") && c.includes("HEAD:gh-pages")));
  assert.ok(!calls.some((c) => /--force|\s-f\b/.test(c)));
});

test("access: a request is an issue; an open one is not repeated; no issues -> a prefilled link", () => {
  const login = [/api user/, "dana\n"];
  const created = pr.requestAccess("acme/shop", "Shop", fakeRun([login, [/issue list/, "[]"], [/issue create/, "https://github.com/acme/shop/issues/7\n"]]));
  assert.deepEqual([created.ok, created.url], [true, "https://github.com/acme/shop/issues/7"]);
  const again = pr.requestAccess("acme/shop", "Shop", fakeRun([login, [/issue list/, JSON.stringify([{ title: `${pr.REQUEST_TITLE}dana`, url: "u" }])]]));
  assert.equal(again.already, true);
  const manual = pr.requestAccess("acme/shop", "Shop", fakeRun([login, [/issue list/, "[]"], [/issue create/, fail("issues are disabled")]]));
  assert.ok(manual.manual && manual.url.startsWith("https://github.com/acme/shop/issues/new?"));
  assert.equal(pr.requestAccess("acme/shop", "Shop", fakeRun([[/api user/, fail("not logged in")]])).ok, false);
});

test("access: the owner sees only real requests and approving adds write access, then closes the request", () => {
  const list = JSON.stringify([
    { number: 7, title: `${pr.REQUEST_TITLE}dana`, author: { login: "dana" }, createdAt: "2026-11-02T09:00:00Z", url: "u7" },
    { number: 8, title: `${pr.REQUEST_TITLE}admin-bot`, author: { login: "mallory" }, createdAt: "2026-11-02T09:00:00Z", url: "u8" },
    { number: 9, title: "Bug: Badge", author: { login: "dana" }, createdAt: "2026-11-02T09:00:00Z", url: "u9" },
  ]);
  const reqs = pr.pendingRequests("acme/shop", fakeRun([[/issue list/, list]]));
  assert.deepEqual(reqs.map((r) => r.login), ["dana"], "someone asking for another person is left out");
  const calls = [];
  pr.approveRequest("acme/shop", reqs[0], (c, a) => { calls.push(a.join(" ")); return ""; });
  assert.ok(calls[0].includes("PUT repos/acme/shop/collaborators/dana") && calls[0].includes("permission=push"));
  assert.ok(calls[1].startsWith("issue close 7"));
  assert.equal(pr.approveRequest("acme/shop", { login: "bad name; rm" }, () => "").ok, false);
  assert.equal(pr.mayMerge({}, { push: true }), false);
  assert.equal(pr.mayMerge({ github: { merge_policy: "editors" } }, { push: true }), true);
  assert.equal(pr.mayMerge({}, { admin: true }), true);
});

test("review: an editor's changes go to edit/<login> and a pull request; a key stops it", () => {
  const d = tmpProject();
  const calls = [];
  const run = (c, a) => { calls.push(`${c} ${a.join(" ")}`); if (a.includes("status")) return " M status.json"; if (a[0] === "pr") return "https://github.com/acme/shop/pull/3\n"; return ""; };
  const r = pr.sendForReview(d, { login: "Dana", title: "Profile", run });
  assert.deepEqual([r.ok, r.branch, r.url], [true, "edit/dana", "https://github.com/acme/shop/pull/3"]);
  assert.ok(calls.some((c) => c.includes("push -q -u origin edit/dana")));
  fs.writeFileSync(path.join(d, "status.json"), "SUPABASE_SERVICE_KEY=sb_secret_abcdefghijklmnop");
  assert.equal(pr.sendForReview(d, { login: "dana", run }).ok, false);
});

test("editor: free -> mine; someone active -> a request; stale -> taken with a note; hand over to the asker", () => {
  const t0 = new Date("2026-11-02T08:00:00Z");
  const s = {};
  assert.equal(pr.requestTakeover(s, "abdul", t0).took, true);
  assert.equal(pr.editorState(s, "abdul", t0.getTime()).mine, true);
  const r = pr.requestTakeover(s, "dana", new Date("2026-11-02T09:00:00Z"));
  assert.equal(r.asked, "abdul");
  assert.equal(s.current_editor.login, "abdul");
  assert.equal(pr.handOver(s, "dana").ok, false, "only the editor hands over");
  pr.handOver(s, "abdul", true, new Date("2026-11-02T09:30:00Z"));
  assert.equal(s.current_editor.login, "dana");
  assert.equal(s.takeover_request, undefined);
  const late = new Date(t0.getTime() + (pr.STALE_HOURS + 15) * 3600e3);
  const st = pr.requestTakeover(s, "abdul", late);
  assert.deepEqual([st.took, st.fromStale], [true, "dana"]);
  pr.handOver(s, "abdul");
  assert.equal(pr.editorState(s, "x").free, true);
});

test("open: a shared project is copied into My Projects; an existing folder is never overwritten", () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-mp-"));
  const clone = (status) => (c, a) => { if (a[0] === "clone") { const t = a[a.length - 1]; fs.mkdirSync(t, { recursive: true }); if (status) fs.writeFileSync(path.join(t, "status.json"), JSON.stringify(status)); } return ""; };
  const r = pr.openFromGitHub("https://github.com/acme/shop", { base, run: clone({ project: "Shop App" }) });
  assert.deepEqual([r.ok, r.name, r.repo], [true, "Shop App", "acme/shop"]);
  assert.ok(fs.existsSync(path.join(base, "Shop App", "status.json")));
  assert.equal(pr.openFromGitHub("https://github.com/acme/shop", { base, run: clone({ project: "Shop App" }) }).ok, false);
  assert.match(pr.openFromGitHub("https://github.com/acme/notes", { base, run: clone(null) }).error, /not an Atomica project/);
  assert.match(pr.openFromGitHub("acme", { base, run: clone({}) }).error, /GitHub link/);
  assert.match(pr.openFromGitHub("https://github.com/acme/secret", { base, run: () => { throw fail("remote: Repository not found."); } }).error, /private/);
  assert.equal(fs.readdirSync(base).filter((n) => n.startsWith(".open-")).length, 0, "no half-copied folders left");
});

test("comments: the public Supabase pair travels with the project; a secret key is never written there", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-home-"));
  fs.mkdirSync(path.join(home, ".atomica"));
  fs.writeFileSync(path.join(home, ".atomica", "supabase.env"), "VITE_SUPABASE_URL=https://abc.supabase.co\nVITE_SUPABASE_ANON_KEY=sb_publishable_abcdefghijk\nSUPABASE_SERVICE_KEY=sb_secret_abcdefghijklmnop\n");
  const d = tmpProject({});
  fs.mkdirSync(path.join(d, "prototype"));
  fs.writeFileSync(path.join(d, "prototype", "package.json"), "{}");
  assert.equal(pr.recordPublicSupabase(d, home), true);
  const st = pr.readStatus(d);
  assert.deepEqual(st.comments, { supabase_url: "https://abc.supabase.co", anon_key: "sb_publishable_abcdefghijk" });
  assert.ok(!JSON.stringify(st).includes("sb_secret"));
  // the next designer has no ~/.atomica: the project still knows its comments
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-home2-"));
  assert.equal(pr.publicSupabase(d, empty).anonKey, "sb_publishable_abcdefghijk");
  const steps = pr.setupCheck(d, { home: empty, env: {}, run: () => "dana" });
  assert.equal(steps.find((s) => s.key === "supabase").ok, true);
  assert.deepEqual([steps.find((s) => s.key === "supabase-secret").ok, steps.find((s) => s.key === "supabase-secret").optional], [false, true]);
  assert.equal(steps.find((s) => s.key === "prototype").ok, false, "packages still need npm install");
  // a secret key put where the public one belongs is refused
  const bad = tmpProject({ comments: { supabase_url: "https://abc.supabase.co", anon_key: jwt("service_role") } });
  assert.equal(pr.publicSupabase(bad, empty).anonKey, null);
});

test("pages: an older single-site publish at the root gives way to the link page; the other part stays", () => {
  const dist = fs.mkdtempSync(path.join(os.tmpdir(), "atomica-test-dist-"));
  fs.writeFileSync(path.join(dist, "index.html"), "<p>sb</p>");
  let left = null;
  const run = (cmd, args) => {
    if (args[0] === "clone") { const t = args[args.length - 1]; fs.mkdirSync(path.join(t, "prototype"), { recursive: true }); fs.writeFileSync(path.join(t, "prototype", "index.html"), "p"); fs.writeFileSync(path.join(t, "index.html"), "<html>old storybook</html>"); fs.writeFileSync(path.join(t, "iframe.html"), "x"); return ""; }
    if (args.includes("add")) left = { names: fs.readdirSync(args[1]).sort(), root: fs.readFileSync(path.join(args[1], "index.html"), "utf8") };
    return "";
  };
  pr.pushPages({ repo: "acme/shop", subdir: "storybook", dist, run });
  assert.deepEqual(left.names, [".nojekyll", "index.html", "prototype", "storybook"]);
  assert.ok(left.root.includes(pr.LINK_MARK));
});

// Pipeline page (dashboard/project-api.mjs): a project that has built nothing yet must not look finished.
import test from "node:test";
import assert from "node:assert/strict";
import { pipeline, briefState } from "../../dashboard/project-api.mjs";

const base = { ds: { components: 0, tokens: 0, storybook: false }, screens: null, hasPrototype: false, code: null, unpublished: 0,
  comments: { open: 0 }, pendingFigmaSync: [], storybook: { unsynced: 0 }, scope: "all", backend: null };

test("intake not approved: every step not started, next is the intake", () => {
  const pl = pipeline({ ...base, intake: briefState("## Intake Summary (approved: <date>)\n- Next step (x): ") });
  assert.ok(pl.steps.every((s) => s.state === "todo"));
  assert.equal(pl.next.title, "Finish the intake");
  assert.equal(pl.next.go, "chat");
});

test("intake approved, nothing built: next phase from the brief's Next step", () => {
  const pl = pipeline({ ...base, intake: briefState("## Intake Summary (approved: 2026-11-25)\n- Next step (the next session starts here): Discover D0") });
  assert.equal(pl.next.title, "Start the next phase");
  assert.equal(pl.next.text, "Discover D0");
});

test("DS built, no screens or prototype: not up to date, review not done", () => {
  const pl = pipeline({ ...base, ds: { components: 12, tokens: 80 }, intake: { done: true, next: null } });
  assert.equal(pl.next.title, "Continue the build");
  assert.equal(pl.steps.find((s) => s.key === "review").state, "todo");
});

test("DS-only project with components is up to date", () => {
  const pl = pipeline({ ...base, scope: "ds", ds: { components: 12, tokens: 80 }, intake: { done: true, next: null } });
  assert.equal(pl.next.title, "Everything is up to date");
});

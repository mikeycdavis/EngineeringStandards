import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REUSABLE = path.join(ROOT, ".github/workflows/standards-validate.yml");
const DOGFOOD = path.join(ROOT, ".github/workflows/standards-dogfood.yml");
const read = (p) => readFile(p, "utf8");

// These are text assertions over YAML rather than assertions over a parsed workflow, because
// scripts/yaml.mjs supports a deliberately small subset and GitHub's schema is well outside it.
// That is a real limitation and it is stated rather than hidden: these checks can confirm that a
// line is present and that a prohibited one is absent, and they cannot confirm that the workflow
// executes as intended. Only running it establishes that, which is what dogfooding is for.

test("the reusable workflow is callable and requires an immutable revision", async () => {
  const text = await read(REUSABLE);
  assert.match(text, /^\s*workflow_call:/m, "the workflow is not reusable");
  assert.match(text, /standards-ref:/, "it does not take a standards revision");
  assert.match(text, /required: true/, "the revision is optional — a check may then run against anything");
  // The refusal must be mechanical, not documentary. A branch name here is a mandatory check whose
  // framework can change under it without anyone deciding to.
  assert.match(text, /\[0-9a-f\]\{40\}/, "nothing enforces that the revision is a full commit SHA");
});

test("validate is the gate and audit cannot become one", async () => {
  // ADR 0004: two commands with different exit-code contracts. A survey finding that can fail the
  // job makes audit a second verdict, and the framework then has two authorities.
  const text = await read(REUSABLE);
  const auditStep = text.slice(text.indexOf("Audit ("), text.indexOf("Validate ("));
  assert.match(auditStep, /continue-on-error: true/, "the audit step can fail the job");
  assert.match(text, /standards\.mjs validate/, "the workflow never runs validate");
  assert.match(text, /Propagate the validator's exit status/, "nothing propagates the verdict");
});

test("the three exit codes stay distinguishable", async () => {
  // Turning 0, 1, and 2 into generic red destroys the distinction between "this project is
  // non-compliant" and "no verdict was produced" — which is the distinction the version-identity
  // guard and the unreadable-policy path both depend on.
  const text = await read(REUSABLE);
  const tail = text.slice(text.indexOf("Propagate the validator's exit status"));
  for (const code of ["0)", "1)", "2)"]) {
    assert.ok(tail.includes(code), `the exit-status step does not handle ${code}`);
  }
  assert.match(tail, /exit 1/, "non-compliance does not exit 1");
  assert.match(tail, /exit 2/, "a configuration failure does not exit 2");
});

test("the workflow never repairs the project it validates", async () => {
  // CI validates; it does not create policy, attestations, exceptions, or scaffolding, and it never
  // self-attests. The prohibition is asserted here and proved at run time by the clean-tree check.
  const text = await read(REUSABLE);
  assert.doesNotMatch(text, /standards\.mjs init/, "the workflow runs init against the consumer");
  assert.doesNotMatch(text, /--force-overwrite/);
  assert.match(text, /git -C project status --porcelain/, "nothing proves the project was left unmodified");
});

test("the workflow does not override the consumer's declared version", async () => {
  // The consumer's project-policy.yml is the only declaration of what governs it. A workflow that
  // wrote or rewrote it would make the CI configuration the policy.
  const text = await read(REUSABLE);
  assert.doesNotMatch(text, /standardVersion:\s*["']?\d/, "the workflow states a standardVersion of its own");
  assert.doesNotMatch(text, />\s*project\/.*project-policy\.yml/, "the workflow writes the consumer policy");
});

test("the dogfood caller pins a full commit SHA rather than a branch", async (t) => {
  // There is no released tag, so the only immutable reference available is a commit SHA. Pinning to
  // develop would mean the check could change what it enforces between two runs of the same commit.
  // Skipped rather than passed while the caller does not exist. A guard that returns early reports
  // green for a check it never made — the vacuous-test shape this repository has caught twice.
  if (!existsSync(DOGFOOD)) {
    t.skip("the dogfood caller does not exist yet; it is added once there is a revision to pin to");
    return;
  }
  const text = await read(DOGFOOD);
  const uses = text.match(/uses:\s*\S+standards-validate\.yml@(\S+)/);
  assert.ok(uses, "the caller does not use the reusable workflow");
  assert.match(uses[1], /^[0-9a-f]{40}$/, `the caller pins '${uses[1]}', which is not a commit SHA`);

  const input = text.match(/standards-ref:\s*([0-9a-f]{40})/);
  assert.ok(input, "the caller passes no standards-ref");
  assert.equal(
    input[1],
    uses[1],
    "the workflow file and the framework it executes are pinned to different revisions",
  );
});

// --- The gate runs the whole suite, on the Node the runner actually has ------------------------

test("the test command needs no shell globbing and no Node newer than engines declares", async () => {
  // `node --test "test/*.test.mjs"` worked on the author's machine and nowhere else: Node did not
  // expand a glob passed to --test until 22, CI pins 20, and package.json declares engines >=18. The
  // first CI job that ever started died before running a single test. The unquoted form would have
  // worked by accident — bash expands it on the runner, Node expands it on Windows — which is a
  // command whose meaning depends on who invoked it.
  const pkg = JSON.parse(await read(path.join(ROOT, "package.json")));
  assert.doesNotMatch(pkg.scripts.test, /\*/, "the test command still relies on glob expansion");
  assert.match(pkg.scripts.test, /scripts\/test\.mjs/);
});

test("the runner collects every suite file and no fixture", async () => {
  // Node's own directory discovery matches test/fixtures/compliant/tests/routes.test.js — a fixture,
  // deliberately not a test of this repository, excluded from the self-audit for the same reason.
  // Running the repository's fixtures as its suite would be that category error one level up.
  const { readdirSync } = await import("node:fs");
  const top = readdirSync(path.join(ROOT, "test"), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".test.mjs"))
    .map((e) => e.name);

  assert.ok(top.length >= 11, `only ${top.length} suite files found - has the layout moved?`);
  assert.ok(
    top.includes(path.basename(fileURLToPath(import.meta.url))),
    "this file is not in the set the runner would run",
  );

  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)],
    );
  const fixtureTests = walk(path.join(ROOT, "test/fixtures")).filter((f) =>
    /\.test\.[cm]?js$/.test(f),
  );
  assert.ok(
    fixtureTests.length > 0,
    "no fixture test file exists - this guard is now vacuous, delete it or repoint it",
  );
  for (const f of fixtureTests) {
    assert.ok(!top.includes(path.basename(f)), `a fixture would be run as a suite file: ${f}`);
  }
});

// --- The required job and the authoritative one are different jobs -----------------------------

const CI = path.join(ROOT, ".github/workflows/ci.yml");

/** The body of one top-level job in ci.yml, from its key to the next one or the end of the file. */
function jobBody(text, name) {
  const at = text.search(new RegExp(`^  ${name}:$`, "m"));
  if (at === -1) return "";
  const after = text.slice(at + 1).search(/^  [a-z][\w-]*:$/m);
  return after === -1 ? text.slice(at) : text.slice(at, at + 1 + after);
}

test("the required job never invokes the validator", async () => {
  // `test` is what branch protection requires, so it must be able to pass. While `npm run validate`
  // lived in it the required check could never be green — the repository is intentionally
  // NON_COMPLIANT — and with PR-only protection that left no legal path to change develop. The
  // separation is the fix; the validator's behaviour is untouched.
  const testJob = jobBody(await read(CI), "test");
  assert.ok(testJob.length > 0, "the ci workflow no longer declares a test job");
  assert.doesNotMatch(testJob, /npm run validate|standards\.mjs validate/, "the required job runs the validator");
  // The checks that must stay merge-blocking.
  for (const step of [
    "npm run inventory",
    "npm run fidelity",
    "npm run policy",
    "npm run diagrams",
    "npm test",
    "npm run audit",
  ]) {
    assert.ok(testJob.includes(step), `the required job no longer runs ${step}`);
  }
});

test("the validate job runs the authoritative command and propagates its status", async () => {
  // Visible and not required is a branch-protection setting. It must not become a workflow that
  // reports something softer: the verdict still runs on every push and pull request, and a failure
  // still turns the run red.
  const validateJob = jobBody(await read(CI), "validate");
  assert.ok(validateJob.length > 0, "the ci workflow declares no validate job");
  assert.match(validateJob, /npm run validate/, "the validate job does not run the validator");
  assert.doesNotMatch(validateJob, /continue-on-error/, "the validate job cannot report a failure");
  assert.doesNotMatch(validateJob, /\|\| true|exit 0/, "the validate job suppresses its exit status");
  // Independent on purpose: one pull request should be able to expose both classes of defect, and
  // making the verdict conditional on green tests would suppress it exactly when something is wrong.
  assert.doesNotMatch(validateJob, /needs:/, "compliance evaluation is suppressed when tests fail");
});

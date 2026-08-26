/**
 * Issue #38: unavailable content evidence must never be read as content.
 *
 * THE INVARIANT UNDER TEST. A check whose required content evidence was not obtained may produce
 * neither a satisfaction claim nor a violation finding about that content. It is `UNKNOWN`, and the
 * rule it feeds reports `not-evaluated` rather than `passed` or `failed`.
 *
 * WHY THIS IS NOT A SENSITIVITY BUG. `contents.get(f) ?? ""` coerces *unread* into *empty*, and empty
 * is meaningful evidence in both polarities: a README under 400 characters is a finding, and a plan
 * file with no items is silence. So the coercion does not lose coverage, it manufactures a verdict —
 * the run reports a result it does not have. That is why the fixtures below are built so the
 * fabrication is visible as a lie rather than as a gap: the README this suite writes is ~200 KB of
 * genuine prose, and the baseline run calls it "under 400 characters".
 *
 * HOW EVIDENCE IS MADE UNAVAILABLE, AND WHY THIS WAY. The aggregate read budget (`--max-total-read-
 * bytes`, ADR 0014's per-invocation configuration) is the only loss mechanism that is injectable,
 * deterministic and already shipped. The target file is written LARGER THAN THE WHOLE BUDGET, so the
 * outcome does not depend on directory walk order: whenever its turn comes it cannot be retained,
 * and `budget.exhausted` is sticky, so a target reached after some other file tripped the bound is
 * equally unread. Every test asserts that precondition from the run's own accounting rather than
 * assuming it — a falsifier that stopped making the evidence unavailable would otherwise start
 * passing vacuously, which is the failure mode this whole item is about.
 *
 * BOTH POLARITIES, AND A CONTROL EACH. Three of the five fabricate a FAILURE and two fabricate a
 * PASS. Each falsifier is paired with a full-coverage control on the SAME fixture asserting the rule
 * still reaches its correct verdict when the evidence is read, and each control points the opposite
 * way from its falsifier. A suppression mechanism that suppressed everything would pass all five
 * falsifiers and fail all five controls; a mechanism that did nothing would do the reverse.
 *
 * RED-FIRST. Every falsifier here fails on `99952bd`, which is the point of writing them first.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");

/** Smaller than any target file below, so the target can never be retained. */
const BUDGET = 32 * 1024;

/** Comfortably above the whole fixture, so the control run reads everything. */
const AMPLE = 64 * 1024 * 1024;

/** ~200 KB, over the budget and under the 400 KB per-file cap, so it is unread rather than truncated. */
const bulk = (line) => `${line}\n`.repeat(Math.ceil((200 * 1024) / (line.length + 1)));

const tmp = () => mkdtemp(path.join(os.tmpdir(), "evidence-availability-"));

/**
 * A committed, first-party repository nothing can exclude.
 *
 * Tracked and committed so `ignoredEntries()` cannot claim it, no vendor marker, no `SKIP_DIRS`
 * name: if the exclusion boundary regressed to excluding too much, these tests would fail rather
 * than quietly pass for the wrong reason.
 */
async function fixture(root, files) {
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");

  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  await writeFile(path.join(root, "project-policy.yml"), POLICY);
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
}

/** Declares exactly the rules under test. A rule a policy omits takes the framework default. */
const POLICY = [
  'standardVersion: "2.0.0"',
  'project: "Evidence availability fixture"',
  "rules:",
  "  documentation.architecture:",
  "    level: required",
  "  planning.breakdown-directory:",
  "    level: required",
  "  planning.item-fields:",
  "    level: required",
  "  planning.plan-code-consistency:",
  "    level: required",
  "  reconstruction.baseline-artifacts:",
  "    level: required",
  "  reconstruction.open-questions:",
  "    level: required",
  "",
].join("\n");

function run(command, dir, budget) {
  const r = spawnSync(
    process.execPath,
    [CLI, command, `--dir=${dir}`, "--json", `--max-total-read-bytes=${budget}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    assert.fail(`${command} stdout was not JSON.\nstatus: ${r.status}\nstderr: ${r.stderr.slice(0, 2000)}`);
  }
  return json;
}

/**
 * Assert the run genuinely failed to read `target`, then return the verdict over the same evidence.
 *
 * The precondition is asserted rather than assumed, because every falsifier below is only meaningful
 * over evidence that is actually absent — a fixture that stopped aiming the budget at the file under
 * test would otherwise start passing vacuously.
 *
 * It is taken from an `audit` run because `validate --json` does not report an evidence surface at
 * all: its envelope carries the verdict and nothing about what the run could not read. The two
 * commands walk the same tree under the same budget by the same code, so the surface `audit`
 * measures is the surface `validate` had. That `validate` cannot say so itself is an observation
 * about the envelope, recorded here and deliberately not repaired by these tests.
 */
function unreadRun(command, dir, target) {
  const s = run("audit", dir, BUDGET).evidenceSurface;
  assert.equal(s.readBudget.exhausted, true, "the budget was not exhausted, so nothing went unread");
  assert.ok(s.readBudget.unreadFiles > 0, "the budget was exhausted but no file was reported unread");
  assert.equal(s.complete, false, "the surface claimed completeness while eligible files went unread");
  assert.ok(
    s.readBudget.sample.includes(target),
    `${target} is not among the unread sample ${JSON.stringify(s.readBudget.sample)}; ` +
      "the fixture stopped aiming the budget at the file under test",
  );
  return run(command, dir, BUDGET);
}

const resultFor = (json, ruleId) => {
  const r = (json.results ?? []).find((x) => x.ruleId === ruleId);
  assert.ok(r, `no result for ${ruleId}; the policy fixture did not declare it`);
  return r;
};

const findingsFor = (json, ruleId) => (json.findings ?? []).filter((f) => f.rule === ruleId);

/** The disposition the invariant requires when a check's own evidence was not obtained. */
function assertNotEvaluated(json, ruleId) {
  const r = resultFor(json, ruleId);
  assert.equal(
    r.disposition,
    "not-evaluated",
    `${ruleId} reported disposition "${r.disposition}" (status ${r.status}) over content the run never read`,
  );
  assert.equal(r.status, "skipped", `${ruleId} must not carry a scored status when its evidence is unavailable`);
}

// --- Fabricated failures ------------------------------------------------------------------------

const README_PROSE = bulk("This README is real, substantive, committed prose about the fixture project.");

test("documentation.architecture cannot report a short README it never opened", async () => {
  const root = await tmp();
  try {
    await fixture(root, {
      "README.md": README_PROSE,
      "docs/architecture.md": "# Architecture\n\nReal content.\n",
    });
    const json = unreadRun("validate", root, "README.md");

    // The lie, stated as an assertion: the file is ~200 KB and the baseline calls it under 400 bytes.
    assert.deepEqual(
      findingsFor(json, "documentation.architecture"),
      [],
      "a finding was emitted about the content of a file the run never read",
    );
    assertNotEvaluated(json, "documentation.architecture");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("documentation.architecture still passes on the same fixture when the README is read", async () => {
  const root = await tmp();
  try {
    await fixture(root, {
      "README.md": README_PROSE,
      "docs/architecture.md": "# Architecture\n\nReal content.\n",
    });
    assert.equal(run("audit", root, AMPLE).evidenceSurface.complete, true, "the control run did not achieve full coverage");
    const json = run("validate", root, AMPLE);
    const r = resultFor(json, "documentation.architecture");
    assert.equal(r.disposition, "evaluated", "full coverage must reach a real disposition, not a withdrawal");
    assert.equal(r.status, "passed", "a 200 KB README with an architecture document must satisfy the rule");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const OVERVIEW = bulk("Real overview body text, outside any heading, describing the plan.");

test("planning.breakdown-directory cannot report an empty overview it never opened", async () => {
  const root = await tmp();
  try {
    await fixture(root, { "artifacts/project-plan-breakdown/00-overview.md": `# Overview\n\n${OVERVIEW}` });
    const json = unreadRun("validate", root, "artifacts/project-plan-breakdown/00-overview.md");

    assert.deepEqual(
      findingsFor(json, "planning.breakdown-directory"),
      [],
      "a finding was emitted about the body of a file the run never read",
    );
    assertNotEvaluated(json, "planning.breakdown-directory");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("planning.breakdown-directory still passes on the same fixture when the overview is read", async () => {
  const root = await tmp();
  try {
    await fixture(root, { "artifacts/project-plan-breakdown/00-overview.md": `# Overview\n\n${OVERVIEW}` });
    const json = run("validate", root, AMPLE);
    const r = resultFor(json, "planning.breakdown-directory");
    assert.equal(r.disposition, "evaluated");
    assert.equal(r.status, "passed", "an overview with real body content must satisfy the rule");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const PROMPT_OK = `# Reconstructed prompt\n\nThis was reconstructed from the existing codebase.\n\n${bulk("Supporting detail.")}`;

test("reconstruction.baseline-artifacts cannot report a missing declaration it never opened", async () => {
  const root = await tmp();
  try {
    await fixture(root, {
      "artifacts/project-baseline/reconstructed-baseline.md": "# Baseline\n\nReal content.\n",
      "artifacts/project-baseline/RECONSTRUCTED-PROMPT.md": PROMPT_OK,
    });
    const json = unreadRun("validate", root, "artifacts/project-baseline/RECONSTRUCTED-PROMPT.md");

    assert.deepEqual(
      findingsFor(json, "reconstruction.baseline-artifacts"),
      [],
      "an error-severity violation was asserted about text the run never read",
    );
    assertNotEvaluated(json, "reconstruction.baseline-artifacts");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reconstruction.baseline-artifacts still passes on the same fixture when the prompt is read", async () => {
  const root = await tmp();
  try {
    await fixture(root, {
      "artifacts/project-baseline/reconstructed-baseline.md": "# Baseline\n\nReal content.\n",
      "artifacts/project-baseline/RECONSTRUCTED-PROMPT.md": PROMPT_OK,
    });
    const json = run("validate", root, AMPLE);
    const r = resultFor(json, "reconstruction.baseline-artifacts");
    assert.equal(r.disposition, "evaluated");
    assert.equal(r.status, "passed", "a prompt declaring itself reconstructed must satisfy R6");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- Fabricated passes --------------------------------------------------------------------------
//
// The quieter half, and the more dangerous one. Silence over unread evidence is indistinguishable
// from a clean result, so these two fixtures are built to CONTAIN a real violation: the control must
// report `failed`, which is what proves the falsifier suppressed a fabrication rather than a finding.

const QUESTIONS_BAD = `# Open questions\n\n- **Q:** Something. CONFIRMED_BY_OWNER\n\n${bulk("Padding prose.")}`;

test("reconstruction.open-questions cannot report a clean document it never opened", async () => {
  const root = await tmp();
  try {
    await fixture(root, { "artifacts/project-baseline/open-questions.md": QUESTIONS_BAD });
    const json = unreadRun("validate", root, "artifacts/project-baseline/open-questions.md");
    assertNotEvaluated(json, "reconstruction.open-questions");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reconstruction.open-questions still fails on the same fixture when the document is read", async () => {
  const root = await tmp();
  try {
    await fixture(root, { "artifacts/project-baseline/open-questions.md": QUESTIONS_BAD });
    const json = run("validate", root, AMPLE);
    const r = resultFor(json, "reconstruction.open-questions");
    assert.equal(r.disposition, "evaluated");
    assert.equal(
      r.status,
      "failed",
      "the control fixture carries an undated CONFIRMED_BY_OWNER; if it passes, the falsifier above proves nothing",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/** An executable plan item missing `Deliverables`, which planning.item-fields requires. */
const PLAN_BAD = [
  "# Plan",
  "",
  "### An item that is missing a required field",
  "",
  "- **Status:** READY",
  "- **Purpose:** To be incomplete on purpose.",
  "",
  bulk("Padding prose that keeps this file over the budget."),
].join("\n");

test("planning.item-fields cannot report complete items in a file it never opened", async () => {
  const root = await tmp();
  try {
    await fixture(root, { "artifacts/project-plan-breakdown/01-plan.md": PLAN_BAD });
    const json = unreadRun("validate", root, "artifacts/project-plan-breakdown/01-plan.md");
    assertNotEvaluated(json, "planning.item-fields");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("planning.item-fields still fails on the same fixture when the plan is read", async () => {
  const root = await tmp();
  try {
    await fixture(root, { "artifacts/project-plan-breakdown/01-plan.md": PLAN_BAD });
    const json = run("validate", root, AMPLE);
    const r = resultFor(json, "planning.item-fields");
    assert.equal(r.disposition, "evaluated");
    assert.equal(
      r.status,
      "failed",
      "the control fixture carries an item missing Deliverables; if it passes, the falsifier above proves nothing",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- The two structural cases the rule-level table cannot express -------------------------------

test("two rules read from one site behave identically under identical evidence loss", async () => {
  // `planning.item-fields` and `planning.plan-code-consistency` are emitted by detectPlanDiscrepancies
  // from the SAME read. One is in CONTENT_DERIVED_RULES and one is not, so byte-identical evidence
  // produces withdrawal for one and fabrication for the other. No entry added to a recognition table
  // fixes that, because the table is not addressing the thing that varies — which is why the check,
  // not the rule, has to be the unit.
  const root = await tmp();
  try {
    await fixture(root, { "artifacts/project-plan-breakdown/01-plan.md": PLAN_BAD });
    const json = unreadRun("validate", root, "artifacts/project-plan-breakdown/01-plan.md");

    const fields = resultFor(json, "planning.item-fields");
    const consistency = resultFor(json, "planning.plan-code-consistency");
    assert.equal(
      fields.disposition,
      consistency.disposition,
      `one read produced disposition "${fields.disposition}" for planning.item-fields and ` +
        `"${consistency.disposition}" for planning.plan-code-consistency`,
    );
    assert.equal(fields.status, consistency.status);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an established violation survives beside an unknown check on the same rule", async () => {
  // The mixed case, and the reason the CHECK rather than the RULE is the unit. Under
  // reconstruction.baseline-artifacts, R4 is structural — the baseline directory exists without
  // reconstructed-baseline.md — and needs no content at all. R6 is a content test on a prompt this
  // run cannot afford to read. Withdrawing the whole rule would erase a failure that was genuinely
  // established; reporting both would fabricate the second. Exactly one finding is correct.
  const root = await tmp();
  try {
    await fixture(root, {
      // R4 fails structurally: the directory exists, reconstructed-baseline.md does not.
      "artifacts/project-baseline/RECONSTRUCTED-PROMPT.md": bulk("A prompt that never declares itself."),
    });
    const json = unreadRun("validate", root, "artifacts/project-baseline/RECONSTRUCTED-PROMPT.md");

    const found = findingsFor(json, "reconstruction.baseline-artifacts");
    assert.equal(found.length, 1, `expected only the structural R4 finding, got ${JSON.stringify(found.map((f) => f.message))}`);
    assert.match(found[0].message, /R4/, "the surviving finding must be the structural one");

    const r = resultFor(json, "reconstruction.baseline-artifacts");
    assert.equal(r.status, "failed", "a confirmed violation must still fail the rule");
    assert.equal(r.disposition, "evaluated", "a rule with a confirmed violation is not withdrawn");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the mechanism is inert when nothing is lost", async () => {
  // The other direction, and the acceptance criterion that keeps this from being a suppression
  // switch: with full coverage, no rule may be withdrawn for lack of evidence at all.
  const root = await tmp();
  try {
    await fixture(root, {
      "README.md": README_PROSE,
      "docs/architecture.md": "# Architecture\n\nReal content.\n",
      "artifacts/project-plan-breakdown/00-overview.md": `# Overview\n\n${OVERVIEW}`,
    });
    assert.equal(run("audit", root, AMPLE).evidenceSurface.complete, true, "the fixture did not achieve full coverage");
    const json = run("validate", root, AMPLE);

    const withdrawn = (json.results ?? [])
      .filter((r) => r.disposition === "not-evaluated" && POLICY.includes(r.ruleId))
      .map((r) => r.ruleId);
    assert.deepEqual(withdrawn, [], "a declared rule was withdrawn on a run that read everything");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

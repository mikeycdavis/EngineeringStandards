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
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
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

// --- The other way content goes unobtained -------------------------------------------------------
//
// Everything above makes evidence unavailable through the read BUDGET, which is the injectable and
// deterministic mechanism. It is not the only one, and the seam covered only that one: on a failed
// read, `readText` returns `{ ok: false, text: "" }` and the loop stored that empty string, so
// `contents.has(f)` answered yes and `contentOf` called it available. A file the process could not
// open produced the identical fabrication — a ~200 KB README reported as "under 400 characters" —
// by a different route, and no falsifier above could see it, because they all vary the budget.
//
// The permission manipulation is real and is VERIFIED to have bitten before anything is asserted,
// following test/audit.test.mjs; a test that quietly skipped when it could not restrict a path
// would be exactly the false green this item is about.

const IS_WINDOWS = process.platform === "win32";

async function denyRead(file) {
  if (IS_WINDOWS) spawnSync("icacls", [file, "/deny", `${process.env.USERNAME}:R`], { encoding: "utf8" });
  else await chmod(file, 0o000);
}

async function restoreRead(file) {
  if (IS_WINDOWS) spawnSync("icacls", [file, "/remove:d", process.env.USERNAME], { encoding: "utf8" });
  else await chmod(file, 0o644);
}

/** Prove the denial actually took effect. Returns true only if the read really fails. */
function reallyUnreadable(file) {
  try {
    readFileSync(file);
    return false;
  } catch {
    return true;
  }
}

test("an unreadable file is not content either", async () => {
  const root = await tmp();
  const readme = path.join(root, "README.md");
  try {
    await fixture(root, {
      "README.md": README_PROSE,
      "docs/architecture.md": "# Architecture\n\nReal content.\n",
    });
    await denyRead(readme);
    assert.ok(
      reallyUnreadable(readme),
      "could not make the README unreadable, so this test would prove nothing — fix the harness rather than skipping",
    );

    // Full budget on purpose: the loss here is the read failing, not the budget being spent, and
    // pinning that separately is what keeps this from being a second copy of the falsifiers above.
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.deepEqual(surface.unreadableFiles, ["README.md"], "the fixture stopped producing a read failure");
    assert.equal(surface.readBudget.exhausted, false, "the budget was spent, so this is not the loss mode under test");

    const json = run("validate", root, AMPLE);
    assert.deepEqual(
      findingsFor(json, "documentation.architecture"),
      [],
      "a finding was emitted about the length of a file the process could not open",
    );
    assertNotEvaluated(json, "documentation.architecture");
  } finally {
    await restoreRead(readme);
    await rm(root, { recursive: true, force: true });
  }
});

test("a rule reading a derived view is withdrawn when a file could not be read", async () => {
  // The nine rules already covered by the coarse surface-level withdrawal reach content through
  // `sourceOf`/`structureOf`, which resolve `sources.get(f)?.code ?? ""` — the same coercion one
  // indirection away. That withdrawal fired on the file cap and on budget exhaustion and not on a
  // read failure, so those nine kept scanning a blank derived view of a file nobody could open and
  // reporting the clean result as evidence.
  const root = await tmp();
  const locked = path.join(root, "src", "app.js");
  try {
    await fixture(root, {
      "README.md": "# Small\n\nDeliberately short, and irrelevant to this test.\n",
      "src/app.js": "export function go() {\n  return 1;\n}\n",
    });
    await denyRead(locked);
    assert.ok(reallyUnreadable(locked), "could not make the source file unreadable");

    const json = run("validate", root, AMPLE);
    for (const id of ["quality.dead-code", "security.no-secrets-in-artifacts", "errors.no-swallowed-exceptions"]) {
      const r = (json.results ?? []).find((x) => x.ruleId === id);
      if (!r) continue; // not declared by this fixture's policy; the assertion below is what matters
      assert.notEqual(
        r.status,
        "passed",
        `${id} reported a clean result over a file the process could not open`,
      );
    }
  } finally {
    await restoreRead(locked);
    await rm(root, { recursive: true, force: true });
  }
});

test("a starved run reaches no verdict that needed content, in either polarity", async () => {
  // Acceptance criterion 3 stated over the whole result set rather than per rule. The falsifiers
  // above can only catch a fabrication somebody wrote them to name; this catches any rule that
  // still reaches a verdict when the run read nothing, including one added by work not yet written.
  //
  // THE CRITERION IS NARROWED HERE, AND THE NARROWING IS THE POINT. #38 asks for an assertion that
  // the starved run "reports no rule at disposition: evaluated in either polarity". Taken literally
  // that is wrong, and this test failed against it before the wording was corrected: this fixture
  // omits reconstructed-baseline.md, so reconstruction.baseline-artifacts fails R4 — a structural
  // check over a directory listing, needing no file content at all. It is established, and a
  // criterion that withdrew it would be demanding the mirror-image fabrication: discarding a real
  // violation because a DIFFERENT check went unread. What the invariant actually forbids is a
  // verdict that needed content, so that is what is asserted — no rule reaches passed at all, and
  // the one rule that stays evaluated carries only its content-free finding.
  const root = await tmp();
  try {
    await fixture(root, {
      "README.md": README_PROSE,
      "docs/architecture.md": `# Architecture\n\n${bulk("Real architecture prose.")}`,
      "artifacts/project-plan-breakdown/00-overview.md": `# Overview\n\n${OVERVIEW}`,
      "artifacts/project-plan-breakdown/01-plan.md": PLAN_BAD,
      "artifacts/project-baseline/open-questions.md": QUESTIONS_BAD,
      "artifacts/project-baseline/RECONSTRUCTED-PROMPT.md": PROMPT_OK,
    });

    // A budget of 1 byte: nothing is retained at all, so no content evidence exists for anything.
    const surface = run("audit", root, 1).evidenceSurface;
    assert.equal(surface.readBudget.exhausted, true, "a one-byte budget did not exhaust");
    assert.equal(surface.readBudget.retainedBytes, 0, "something was retained under a one-byte budget");

    const json = run("validate", root, 1);
    const declared = (json.results ?? []).filter((r) => POLICY.includes(r.ruleId));

    // The fabricated-pass direction, wholesale. Nothing was read, so nothing is clean.
    assert.deepEqual(
      declared.filter((r) => r.status === "passed").map((r) => r.ruleId),
      [],
      "a rule reported a clean result on a run that read nothing",
    );

    // The fabricated-failure direction, allowing exactly what a content-free check established.
    assert.deepEqual(
      declared.filter((r) => r.disposition === "evaluated").map((r) => r.ruleId),
      ["reconstruction.baseline-artifacts"],
      "a rule reached a verdict that required content the run never obtained",
    );
    const survived = findingsFor(json, "reconstruction.baseline-artifacts");
    assert.equal(survived.length, 1, `expected only the structural R4 finding, got ${JSON.stringify(survived.map((f) => f.message))}`);
    assert.match(survived[0].message, /R4/, "the surviving finding must be the one that needed no content");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- The class the read seam structurally cannot reach --------------------------------------------
//
// Everything above loses content that WAS collected: the budget spent it, or the read failed. A
// framework-excluded file is never collected at all, so it never enters `contents`, no accessor is
// ever called for it, and no check ever asks — `unknownChecks` cannot record what nobody looked up.
// Measured before these were written: with tracked committed bait behind a SKIP_DIRS name and a full
// budget, security.no-sql-concat and security.no-cert-bypass both reported passed/evaluated. Two
// FORBIDDEN rules reporting clean over tracked first-party code the tool refused to read.
//
// THE CONTROL IS THE AUTHORITY OF THE EXCLUSION, NOT ITS EXISTENCE. A repository that declares its
// own ignore set has narrowed what its project is, which is a legitimate answer and leaves the run
// complete. A framework that drops tracked code by matching a directory name has lost evidence. And
// `.git` is neither — `not-project-evidence` — so if mere exclusion counted, every run in every
// repository would withdraw these rules forever. Specimens 2 and 4 are the guards that make that
// distinction load-bearing rather than decorative: the blanket fix passes specimen 1 and fails both.

/**
 * One file tripping three content-derived rules at once, so one specimen covers all three.
 *
 * Read from `test/fixtures/` rather than written inline, and the reason is this suite's own
 * subject: that directory is excluded by name, so nothing inside it is ever scanned. Inline, the
 * SQL interpolation in it is a real finding against THIS repository — `security.no-sql-concat`
 * reads `sourceOf`, where string contents stay intact, so bait sitting in a test file is
 * indistinguishable from the construct it imitates. That is not a use/mention question, and
 * blanking it would be evading the detector rather than satisfying it. It cost a red self-audit to
 * learn, which is the right way to learn it: the detector was correct and the test was wrong.
 */
const CONTENT_BAIT = readFileSync(
  path.join(HERE, "fixtures", "evidence-availability-bait", "bait.js"),
  "utf8",
);

const CONTENT_POLICY = [
  'standardVersion: "2.0.0"',
  'project: "Framework exclusion specimen"',
  "rules:",
  "  security.no-sql-concat:",
  "    level: forbidden",
  "  security.no-cert-bypass:",
  "    level: forbidden",
  "  quality.dead-code:",
  "    level: recommended",
  "",
].join("\n");

const BAITED_RULES = ["security.no-sql-concat", "security.no-cert-bypass", "quality.dead-code"];

/**
 * A committed repository with the bait in `dir`, optionally ignored, optionally left untracked.
 *
 * `untracked` writes the bait AFTER the commit, so it is present on disk, absent from the index and
 * matched by no ignore rule — the state a build directory is in, and the one that separates "the
 * repository disclaimed this" from "this tool dropped it".
 */
async function excludedFixture({ dir, ignore = null, untracked = false }) {
  const root = await tmp();
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");

  await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, "README.md"), `# Specimen\n\n${"substantive prose ".repeat(60)}\n`);
  await writeFile(path.join(root, "project-policy.yml"), CONTENT_POLICY);
  if (ignore) await writeFile(path.join(root, ".gitignore"), `${ignore}\n`);
  if (!untracked) await writeFile(path.join(root, dir, "bait.js"), CONTENT_BAIT);

  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "specimen");
  if (untracked) await writeFile(path.join(root, dir, "bait.js"), CONTENT_BAIT);
  return root;
}

/** Each baited rule as "status/disposition", at full budget so nothing is lost to capacity. */
function baitedVerdicts(root) {
  const json = run("validate", root, AMPLE);
  return BAITED_RULES.map((id) => {
    const r = (json.results ?? []).find((x) => x.ruleId === id);
    assert.ok(r, `no result for ${id}`);
    return `${r.status}/${r.disposition}`;
  });
}

test("framework-excluded tracked content withdraws the rules it would have fed", async () => {
  const root = await excludedFixture({ dir: "fixtures" });
  try {
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.deepEqual(surface.frameworkExcludedDirectories, ["fixtures"], "the fixture stopped being framework-excluded");
    assert.equal(surface.complete, false);
    assert.equal(surface.readBudget.exhausted, false, "budget loss would make this a duplicate of the falsifiers above");

    assert.deepEqual(
      baitedVerdicts(root),
      ["skipped/not-evaluated", "skipped/not-evaluated", "skipped/not-evaluated"],
      "a rule reported a verdict over tracked committed code this tool refused to read",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GUARD: repository-ignored content is a narrowing, not a loss", async () => {
  // The repository was asked and answered. Withdrawing here would make every project with a
  // .gitignore permanently unable to establish a content rule, which is the blanket fix.
  //
  // THE THIRD RULE IS EXEMPT FROM THAT EXPECTATION, AND FOR A REASON UNRELATED TO THE IGNORE
  // DECLARATION. `quality.dead-code` withdraws on this fixture because the fixture contains a
  // `.gitignore` — an extensionless file the read loop never opens, sitting in the reference space
  // an absence claim has to search whole. Measured by isolation: adding a `.gitignore` to a
  // repository with no exclusions at all withdraws it just the same, while `surface.complete` stays
  // true. So the declaration is not what withdrew it, and the proposition this guard exists for is
  // untouched — which is why the two presence-based rules below are still asserted exactly.
  //
  // The cost is accepted rather than overlooked: nearly every real repository holds a `.gitignore`
  // or an image, so this rule reaches a verdict in nearly none of them. A rule claiming absence
  // cannot honestly pass or fail without searching the whole domain it claims over, and preserving
  // its verdict because most repositories contain a non-text file would preserve it over a search
  // that did not happen.
  const root = await excludedFixture({ dir: "thirdparty", ignore: "thirdparty/" });
  try {
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.equal(surface.complete, true, "a repository-authorized exclusion made the surface incomplete");
    assert.deepEqual(surface.frameworkExcludedDirectories, []);

    assert.deepEqual(
      baitedVerdicts(root),
      ["passed/evaluated", "passed/evaluated", "skipped/not-evaluated"],
      "a repository's own ignore declaration withdrew rules it should not have",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("untracked content the repository does not disclaim is still a framework loss", async () => {
  // No ignore rule covers it, so the repository never said this was not its code; the tool dropped
  // it on a name match. That is the same loss as specimen one, reached without the index.
  const root = await excludedFixture({ dir: "coverage", untracked: true });
  try {
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.deepEqual(surface.frameworkExcludedDirectories, ["coverage"]);
    assert.equal(surface.complete, false);

    assert.deepEqual(
      baitedVerdicts(root),
      ["skipped/not-evaluated", "skipped/not-evaluated", "skipped/not-evaluated"],
      "unignored content dropped by this tool was treated as evidence of a clean result",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GUARD: governed content still reaches its real verdict, and .git never counts", async () => {
  // Nothing is excluded here but `.git`, which is `not-project-evidence` and present in every
  // repository. If it counted as loss, no run anywhere could ever establish these rules again — so
  // this specimen failing means the authority filter has collapsed into "was anything excluded".
  const root = await excludedFixture({ dir: "src" });
  try {
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.equal(surface.complete, true, ".git or another benign exclusion is being counted as evidence loss");
    assert.deepEqual(surface.frameworkExcludedDirectories, []);

    assert.deepEqual(
      baitedVerdicts(root),
      ["failed/evaluated", "failed/evaluated", "warning/evaluated"],
      "governed first-party code did not reach its real verdict",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- The reference space of an absence claim ----------------------------------------------------
//
// `quality.dead-code` is the only rule in CONTENT_DERIVED_RULES whose proposition is an ABSENCE:
// "this name is referenced nowhere else". Every other rule there reports something it FOUND, so a
// file it could not search costs it a finding — it under-reports, and the coarse withdrawal is a
// sufficient boundary. This one concludes from what it did not find, so an unsearched file lets it
// name a live file as dead. It over-reports, and over-reporting is the polarity a compliance tool
// must never reach from missing evidence.
//
// Each falsifier below removes the reference through a DIFFERENT door, and they are separate tests
// deliberately: a fix that special-cased any one of them would pass that one and fail the others.
// The GUARD tests are what stop "withdraw whenever anything is missing" from being a passing answer.

const DEAD_CODE_POLICY = [
  'standardVersion: "2.0.0"',
  'project: "Dead code reference space specimen"',
  "rules:",
  "  quality.dead-code:",
  "    level: required",
  "",
].join("\n");

/** The reference itself, in whatever syntax the host file takes. */
const REFERENCE = "widgetrenderer is used here";

/** The orphan candidate, plus a reference to it placed wherever the caller chooses. */
async function deadCodeFixture(extra) {
  const root = await tmp();
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "README.md"), `# Specimen\n\n${"substantive prose ".repeat(60)}\n`);
  await writeFile(path.join(root, "project-policy.yml"), DEAD_CODE_POLICY);
  // Named so no other file mentions the stem by accident, and not ENTRYISH.
  await writeFile(path.join(root, "src", "widgetrenderer.js"), "export function render() { return 1; }\n");
  for (const [rel, body] of Object.entries(extra)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "specimen");
  return root;
}

const orphanNames = (json) => findingsFor(json, "quality.dead-code").flatMap((f) => f.evidence ?? []);

test("GUARD: a genuine orphan is still established when the reference space is complete", async () => {
  // The anti-vacuity control. Without it, every falsifier below is satisfied by a detector that
  // withdraws unconditionally, which would report no dead code anywhere and pass this file.
  const root = await deadCodeFixture({ "src/other.js": "export const x = 1;\n" });
  try {
    const json = run("validate", root, AMPLE);
    assert.ok(
      orphanNames(json).includes("src/widgetrenderer.js"),
      "a genuine orphan went unreported over a reference space that was read whole",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GUARD: a reference the run actually read clears the orphan", async () => {
  // The other half of the control, and the one that makes each falsifier a one-variable experiment:
  // the fixture below differs from this one only in WHERE the reference sits.
  const root = await deadCodeFixture({ "src/uses.js": `// ${REFERENCE}\n` });
  try {
    const json = run("validate", root, AMPLE);
    assert.ok(
      !orphanNames(json).includes("src/widgetrenderer.js"),
      "a file with a plainly readable reference was named as dead code",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a reference past the per-file read cap cannot establish dead code", async () => {
  // DOOR ONE. The file is a recognised text type, it is opened, and the budget is ample — it is
  // simply larger than MAX_READ_BYTES, so only its first 400 KB are retained and the reference sits
  // past that boundary. `contentOf` answers `available`, correctly: a prefix is content. What it
  // cannot say is that there was more, which is exactly what this claim needed to know.
  const padding = `// ${"padding ".repeat(9)}\n`;
  const overCap = padding.repeat(Math.ceil(420_000 / padding.length)) + `// ${REFERENCE}\n`;
  const root = await deadCodeFixture({ "src/uses.js": overCap });
  try {
    const json = run("validate", root, AMPLE);
    assert.ok(
      !orphanNames(json).includes("src/widgetrenderer.js"),
      "a file whose only reference sits past the read cap was named as dead code",
    );
    assertNotEvaluated(json, "quality.dead-code");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a reference in a file the read loop never opens cannot establish dead code", async () => {
  // DOOR TWO, and the specimen the whole defect was found on. The extension is not a recognised text
  // type, so the read loop never offers to open it and `contentOf` answers unavailable-but-not-lost
  // — a correct answer to a different question. Nothing was lost in the run's accounting, and the
  // search still did not cover the file the reference is in.
  const root = await deadCodeFixture({
    "assets/diagram.svg": `<svg><title>${REFERENCE}</title></svg>\n`,
  });
  try {
    const json = run("validate", root, AMPLE);
    assert.ok(
      !orphanNames(json).includes("src/widgetrenderer.js"),
      "a file whose only reference sits in an unopened file was named as dead code",
    );
    assertNotEvaluated(json, "quality.dead-code");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a reference in a file the budget could not reach cannot establish dead code", async () => {
  // DOOR THREE. Recognised extension, opened, and not truncated — the run simply ran out of budget
  // before reaching it. Separate from the two above because a fix that special-cased extensions or
  // the read cap would pass both and leave this one standing.
  const filler = `// ${"filler ".repeat(9)}\n`.repeat(1500);
  const root = await deadCodeFixture({
    "src/aaa-filler.js": filler,
    "src/uses.js": `// ${REFERENCE}\n`,
  });
  try {
    const json = run("validate", root, 32 * 1024);
    assert.ok(
      !orphanNames(json).includes("src/widgetrenderer.js"),
      "a file whose only reference sits beyond the read budget was named as dead code",
    );
    assertNotEvaluated(json, "quality.dead-code");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- The domain the absence claim is made over --------------------------------------------------
//
// ADJUDICATED 2026-08-28 against the normative text rather than against convenience. Two questions
// had to be answered in order, and the second only had one available answer once the first was:
//
//   Where is `quality.dead-code` defined?   `rules/verification.json` and nowhere else. All 53
//                                           standards were searched; none mentions dead code, and
//                                           the three that say "entry point" say it about manifests,
//                                           dogfooding, and documentation.
//   What does that text claim?              "Code no longer reachable from any entry point." That is
//                                           a property of the whole program. It names no file kind,
//                                           no extension set, and no searchable subset.
//
// So the domain is REPOSITORY-WIDE, and completeness is computed over every collected file. The
// alternative — bounding the search to the extensions this tool happens to read — would be the
// reference space defined by the walker's convenience rather than by the rule, and Standard 24 R2
// names that failure exactly: a check may not report outside the scope its evidence supports.
// Narrowing the domain to fit what was searched reports a repository-wide absence from a subset.
//
// The cost is accepted and is not a regression. Standard 24 R4 settles that directly: a rule may be
// catalogued `code-analysis` while the validator reports `not-evaluated` because no analyzer exists,
// and "that is the correct behaviour, not a gap to paper over". The catalog says the same thing
// about this rule in its own words — `assurance: "none"`, and reachability is not computed.

const CATALOG = JSON.parse(readFileSync(path.join(HERE, "..", "rules", "verification.json"), "utf8"));

test("the reference space is every collected file, not the subset the read loop opens", async () => {
  // THE ANTI-DRIFT FALSIFIER for the domain choice, and the case that separates the two candidate
  // definitions. A `.png` is not a recognised text type, so the read loop never offers to open it
  // and the evidence surface — correctly — reports itself COMPLETE: nothing eligible was lost.
  //
  // Dead-code withdraws anyway, and the gap between those two answers is the whole point. The
  // surface asks "did this run lose evidence it was owed"; an absence claim asks "was every file
  // searched". A file nobody was owed is still a file nobody searched, and the reference that would
  // clear an orphan does not care which of the two it was.
  //
  // Re-scoping completeness to TEXT_EXT would make this test pass a verdict again, which is why it
  // asserts the surface is complete rather than ignoring it: the two must be allowed to disagree.
  const root = await deadCodeFixture({
    "src/other.js": "export const x = 1;\n",
    "assets/logo.png": "not really a png, and deliberately unreadable as text\n",
  });
  try {
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.equal(
      surface.complete,
      true,
      "the fixture lost eligible evidence, so this no longer isolates the domain question",
    );

    const json = run("validate", root, AMPLE);
    assert.ok(
      !orphanNames(json).includes("src/widgetrenderer.js"),
      "an orphan was established over a reference space containing an unsearched file",
    );
    assertNotEvaluated(json, "quality.dead-code");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the domain is anchored to the catalog text it was adjudicated from", async () => {
  // The decision above is only as good as the sentence it was read out of, and that sentence lives
  // in a file this repository edits. Binding them here means a later narrowing of the rule — to a
  // file kind, a language, or a directory — fails at the point where the reasoning would have had to
  // change, rather than silently leaving code that was correct for text nobody has read since.
  //
  // Deliberately not a snapshot of the whole entry: the fields asserted are the two the adjudication
  // actually turned on, and pinning more would make routine wording edits look like a scope change.
  const rule = CATALOG.rules.find((r) => r.id === "quality.dead-code");
  assert.ok(rule, "quality.dead-code left the catalog, so the domain rests on nothing");
  assert.match(
    rule.description,
    /reachable from any entry point/,
    "the catalog no longer claims entry-point reachability; the repository-wide domain must be re-adjudicated",
  );
  assert.equal(
    rule.assurance,
    "none",
    "the rule now claims assurance it did not before; whether withdrawal is still correct must be re-decided",
  );
});


// --- Evidence loss bounds silence; it does not unfind what was found -----------------------------
//
// Four guards, and the pairing is the point. Two of them withdraw a rule over evidence the run did
// not have; two of them refuse to withdraw a rule whose evidence it did have. A mechanism answering
// "withdraw whenever the surface is imperfect" passes the first pair and fails the second, and a
// mechanism that does nothing passes the second pair and fails the first. Neither pair is evidence
// on its own.
//
// They exist because a falsifier vanished. The truncation and unlistable-directory cases were
// present on a parallel branch for this issue and absent from this one, and the aggregate gate was
// green throughout: a passing suite is not evidence for a property whose test is not in it.

/** Prove a directory really cannot be listed, for the same reason `reallyUnreadable` exists. */
function reallyUnlistable(dir) {
  try {
    readdirSync(dir);
    return false;
  } catch {
    return true;
  }
}

/**
 * Restore a DIRECTORY, which is not the same call as restoring a file.
 *
 * `0o644` on a directory leaves it without the execute bit, so nothing can traverse it and the
 * recursive cleanup fails with EACCES — the test then fails in its own `finally`, having already
 * proved what it set out to prove.
 */
async function restoreListing(dir) {
  if (IS_WINDOWS) spawnSync("icacls", [dir, "/remove:d", process.env.USERNAME], { encoding: "utf8" });
  else await chmod(dir, 0o755);
}

/** A committed repository carrying the content policy, plus whatever else the caller needs. */
async function baitedFixture(extra = {}) {
  const root = await tmp();
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  await writeFile(path.join(root, "README.md"), `# Specimen\n\n${"substantive prose ".repeat(60)}\n`);
  await writeFile(path.join(root, "project-policy.yml"), CONTENT_POLICY);
  for (const [name, body] of Object.entries(extra)) {
    const full = path.join(root, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "specimen");
  return root;
}

const statusOf = (json, id) => {
  const r = resultFor(json, id);
  return `${r.status}/${r.disposition}`;
};

/** Padding that is unambiguously not a violation, sized to push whatever follows past the read cap. */
const PAST_CAP = `${"// padding\n".repeat(Math.ceil(400_000 / 11) + 1000)}\n`;

test("a retained prefix is not the file, and cannot establish a clean result", async () => {
  // `readText` caps each read at MAX_READ_BYTES and the read loop stores the prefix, so
  // `contents.has(f)` answers yes and `contentOf` answers `available`. There is no moment inside a
  // detector where the missing tail is visible: the seam is handed a string and has no way to know
  // it is short. That is what puts truncation in the coarse predicate rather than in the per-check
  // record — the per-check record can only carry what some check was able to notice.
  //
  // Measured before the fix: the surface reported `truncatedFiles`, `complete: false`, and
  // `security.no-sql-concat: passed/evaluated` in the SAME run — a clean forbidden rule over four
  // hundred kilobytes of a file whose violation is past the boundary.
  const root = await baitedFixture({ "src/big.js": `${PAST_CAP}${CONTENT_BAIT}` });
  try {
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.ok(surface.truncatedFiles.length > 0, "the fixture stopped producing a truncated read");
    assert.equal(surface.readBudget.exhausted, false, "budget loss would make this a duplicate of another falsifier");
    assert.equal(surface.fileCapReached, false, "the file cap would make this a duplicate of another falsifier");
    assert.deepEqual(surface.unreadableFiles, [], "a read failure would make this a duplicate of another falsifier");
    assert.deepEqual(
      surface.frameworkExcludedDirectories,
      [],
      "an exclusion would make this a duplicate of another falsifier",
    );

    const json = run("validate", root, AMPLE);
    assert.deepEqual(
      findingsFor(json, "security.no-sql-concat"),
      [],
      "the bait was supposed to sit past the cap; if the run can see it this test proves nothing",
    );
    assertNotEvaluated(json, "security.no-sql-concat");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("GUARD: a violation found in a read file survives truncation elsewhere in the tree", async () => {
  // The other direction, and the reason the repair is a sixth term rather than "an incomplete
  // surface withdraws everything". The bait sits in a small file the run reads completely; an
  // unrelated file is truncated. Silence about that file's tail is real, and it does not unfind what
  // the small file established: aggregation keeps the rule FAILED, carrying only the known finding.
  const root = await baitedFixture({ "src/bait.js": CONTENT_BAIT, "docs/big.md": PAST_CAP });
  try {
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.ok(surface.truncatedFiles.length > 0, "the fixture stopped producing a truncated read");

    const json = run("validate", root, AMPLE);
    assert.ok(
      findingsFor(json, "security.no-sql-concat").length > 0,
      "the bait stopped producing a finding, so this test would prove nothing",
    );
    assert.equal(
      statusOf(json, "security.no-sql-concat"),
      "failed/evaluated",
      "a violation established by a check that ran was withdrawn because a different file was truncated",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a directory that could not be listed withdraws the rules its contents would have fed", async (t) => {
  // The never-collected analogue of a framework-excluded tree. Nothing beneath an unlistable
  // directory enters the walk, so nothing enters `contents`, so no accessor is ever called for it
  // and `unknownChecks` records nothing. An absence-based rule iterates over what it does have and
  // reports "found nothing" about files it never had the chance to see.
  //
  // It needs no authority filter of its own: the walk consults the repository's ignore set and
  // `SKIP_DIRS` before it recurses, so a `readdir` failure is always over a directory nobody
  // declared disposable.
  const root = await baitedFixture();
  const hidden = path.join(root, "src");
  try {
    await mkdir(hidden, { recursive: true });
    await writeFile(path.join(hidden, "inner.js"), "const x = 1;\n");
    await denyRead(hidden);
    if (!reallyUnlistable(hidden)) {
      t.skip("this host refuses to make a directory unlistable; the boundary runs on the Linux image");
      return;
    }

    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.ok(surface.unreadableDirectories.length > 0, "the fixture stopped producing an unlistable directory");
    assert.equal(surface.readBudget.exhausted, false, "budget loss would make this a duplicate of another falsifier");
    assert.deepEqual(surface.truncatedFiles, [], "truncation would make this a duplicate of the falsifier above");

    assertNotEvaluated(run("validate", root, AMPLE), "security.no-sql-concat");
  } finally {
    await restoreListing(hidden);
    await rm(root, { recursive: true, force: true });
  }
});

test("GUARD: a violation found in a listed directory survives an unlistable one beside it", async (t) => {
  // The anti-vacuity control for the falsifier above, and it is not redundant with the truncation
  // pair: these are two different terms in the predicate, and a repair that applied the precedence
  // rule to one and not to the other would pass one pair and fail this.
  const root = await baitedFixture({ "src/bait.js": CONTENT_BAIT });
  const hidden = path.join(root, "hidden");
  try {
    await mkdir(hidden, { recursive: true });
    await writeFile(path.join(hidden, "inner.js"), "const x = 1;\n");
    await denyRead(hidden);
    if (!reallyUnlistable(hidden)) {
      t.skip("this host refuses to make a directory unlistable; the boundary runs on the Linux image");
      return;
    }

    const json = run("validate", root, AMPLE);
    assert.ok(
      findingsFor(json, "security.no-sql-concat").length > 0,
      "the bait stopped producing a finding, so this test would prove nothing",
    );
    assert.equal(
      statusOf(json, "security.no-sql-concat"),
      "failed/evaluated",
      "a violation established in a directory the run listed was withdrawn because another could not be listed",
    );
  } finally {
    await restoreListing(hidden);
    await rm(root, { recursive: true, force: true });
  }
});


// --- One rule, two independent checks, and only one of them went dark ----------------------------
//
// `documentation.code-consistency` is established by two checks that share a README and nothing
// else: every backticked path in it, answered by the filesystem; and every `npm run` in it, answered
// by `package.json`. The manifest branch recorded its unknown and then RETURNED, discarding entries
// the path check had already established from a README the run did read — so the rule reported
// `not-evaluated` while a conclusively-found violation sat in the array it had just abandoned.
//
// This is the truth table this issue wrote, inverted at a call site:
//
//   known violation + unknown sibling  ->  FAILED, carrying only the known finding
//   no violation    + unknown sibling  ->  NOT_EVALUATED
//
// Both rows are asserted, over one fixture differing in one respect, because either alone admits a
// wrong answer: dropping the `return` outright satisfies the first row and breaks the second by
// letting the manifest check reappear, and leaving it satisfies the second and breaks the first.

const DOC_POLICY = [
  'standardVersion: "2.0.0"',
  'project: "Sibling check specimen"',
  "rules:",
  "  documentation.code-consistency:",
  "    level: required",
  "",
].join("\n");

const MANIFEST = `${JSON.stringify({ name: "specimen", private: true, scripts: { build: "node build.mjs" } }, null, 2)}\n`;

/**
 * A committed repository whose README names a command the manifest answers for, and — when
 * `brokenPath` is set — a repository path the FILESYSTEM answers for, with no manifest involved.
 */
async function siblingFixture({ brokenPath }) {
  const root = await tmp();
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  await writeFile(
    path.join(root, "README.md"),
    `# Specimen\n\n${"substantive prose ".repeat(60)}\n\n` +
      "Build it with `npm run build`.\n" +
      (brokenPath ? "The entry point is `src/missing-entry.js`.\n" : "") +
      `\n${"more substantive prose ".repeat(40)}\n`,
  );
  await writeFile(path.join(root, "project-policy.yml"), DOC_POLICY);
  await writeFile(path.join(root, "package.json"), MANIFEST);
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "specimen");
  return root;
}

/** Deny the manifest, prove the denial took, and return the verdict over that evidence. */
async function withUnreadableManifest(root, t, body) {
  const manifest = path.join(root, "package.json");
  try {
    await denyRead(manifest);
    if (!reallyUnreadable(manifest)) {
      t.skip("this host refuses to make a file unreadable; the boundary runs on the Linux image");
      return;
    }
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.ok(
      surface.unreadableFiles.includes("package.json"),
      `package.json is not among the unreadable files ${JSON.stringify(surface.unreadableFiles)}`,
    );
    await body(run("validate", root, AMPLE));
  } finally {
    await restoreRead(manifest);
    await rm(root, { recursive: true, force: true });
  }
}

test("a README violation survives an unread manifest, and only the known finding is emitted", async (t) => {
  const root = await siblingFixture({ brokenPath: true });
  await withUnreadableManifest(root, t, (json) => {
    const findings = findingsFor(json, "documentation.code-consistency");
    assert.ok(findings.length > 0, "the established README violation was discarded with the unknown sibling check");
    assert.equal(
      statusOf(json, "documentation.code-consistency"),
      "failed/evaluated",
      "a violation the filesystem conclusively established was withdrawn because a DIFFERENT check went unread",
    );

    const evidence = findings.flatMap((f) => f.evidence ?? []);
    assert.ok(
      evidence.some((e) => e.includes("src/missing-entry.js")),
      `the README path violation is not in the evidence ${JSON.stringify(evidence)}`,
    );
    assert.deepEqual(
      evidence.filter((e) => e.includes("npm run")),
      [],
      "the unread manifest produced a command finding; only the KNOWN check may contribute evidence",
    );
  });
});

test("a clean README with an unread manifest establishes nothing", async (t) => {
  // The same specimen with the broken path removed. Nothing is left for the path check to find, the
  // command check cannot answer, and the honest disposition is silence rather than a pass. This is
  // also the row that fails if the fix simply deletes the `return`: `JSON.parse` over an unavailable
  // manifest would fabricate an empty script list and report `npm run build` as broken.
  const root = await siblingFixture({ brokenPath: false });
  await withUnreadableManifest(root, t, (json) => {
    assert.deepEqual(
      findingsFor(json, "documentation.code-consistency"),
      [],
      "a command was reported broken against a manifest the run never read",
    );
    assertNotEvaluated(json, "documentation.code-consistency");
  });
});

test("GUARD: both checks answerable is still a real verdict, in both polarities", async () => {
  // The anti-vacuity control for the pair above. Nothing is denied, so both checks have their
  // evidence: the clean specimen must PASS rather than sit in the withdrawn state the falsifiers
  // produce, and the broken-path specimen must FAIL for the ordinary reason.
  const clean = await siblingFixture({ brokenPath: false });
  const broken = await siblingFixture({ brokenPath: true });
  try {
    assert.equal(
      statusOf(run("validate", clean, AMPLE), "documentation.code-consistency"),
      "passed/evaluated",
      "a fully-answerable rule did not reach a verdict; the withdrawal machinery is firing over nothing",
    );
    assert.equal(
      statusOf(run("validate", broken, AMPLE), "documentation.code-consistency"),
      "failed/evaluated",
      "the fixture stopped producing a real violation, so the falsifiers above would prove nothing",
    );
  } finally {
    await rm(clean, { recursive: true, force: true });
    await rm(broken, { recursive: true, force: true });
  }
});

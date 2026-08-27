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

/**
 * Restore a DIRECTORY, which is not the same call.
 *
 * `0o644` on a directory leaves it without the execute bit, so nothing can traverse it and the
 * recursive cleanup fails with EACCES -- the test then fails in its own `finally`, having already
 * proved what it set out to prove. Found in the gate's Linux image, where the permission bits are
 * real; on Windows the icacls path made it invisible.
 */
async function restoreListing(dir) {
  if (IS_WINDOWS) spawnSync("icacls", [dir, "/remove:d", process.env.USERNAME], { encoding: "utf8" });
  else await chmod(dir, 0o755);
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
 * indistinguishable from the construct it imitates. That is not a use/mention question and
 * blanking it would be evading the detector rather than satisfying it.
 *
 * It cost a red self-audit to learn, which is the right way to learn it: the detector was correct
 * and the test was wrong.
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
  const root = await excludedFixture({ dir: "thirdparty", ignore: "thirdparty/" });
  try {
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.equal(surface.complete, true, "a repository-authorized exclusion made the surface incomplete");
    assert.deepEqual(surface.frameworkExcludedDirectories, []);

    // The two security rules are the load-bearing entries: they are the ones the ignore declaration
    // would withdraw if a narrowing were being counted as a loss, and they stay evaluated.
    //
    // `quality.dead-code` moved to withdrawn for an unrelated and correct reason, and this fixture
    // is where that first shows. Its proposition is repository-wide absence, so its reference space
    // is every collected file — and `.gitignore` is extensionless, so `TEXT_EXT` skips it and it is
    // never searched. The ignore declaration is not the cause: the specimen below with no
    // `.gitignore` at all reaches `warning/evaluated` on the same rule.
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

/** Prove a directory really cannot be listed, for the same reason `reallyUnreadable` exists. */
function reallyUnlistable(dir) {
  try {
    readdirSync(dir);
    return false;
  } catch {
    return true;
  }
}

// --- Evidence loss bounds silence; it does not unfind what was found -----------------------------
//
// Three boundaries raised in review of this branch. Each is a way for the withdrawal machinery to
// give a wrong answer, and the first two point in opposite directions: one withdraws a rule that was
// established, the other keeps a rule that was not.

/** A committed repository carrying the bait, plus whatever else the caller needs. */
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
  for (const [rel, body] of Object.entries(extra)) {
    const full = path.join(root, rel);
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

test("a confirmed violation survives an unrelated file going unreadable", async () => {
  // Evidence loss bounds what a run may conclude from SILENCE. It cannot unfind what the run already
  // found, and the surface-level branch did not honour that: one unreadable file anywhere withdrew
  // every rule in CONTENT_DERIVED_RULES, so a violation detected in a file that WAS read came back
  // `skipped / not-evaluated`. The finding stayed in the report while the rule reported nothing —
  // the two halves of one run disagreeing about whether a secret had been found.
  const root = await baitedFixture({ "src/bait.js": CONTENT_BAIT });
  const spare = path.join(root, "docs", "spare.md");
  try {
    await mkdir(path.join(root, "docs"), { recursive: true });
    await writeFile(spare, "# Spare\n\nUnrelated to the bait.\n");
    await denyRead(spare);
    assert.ok(reallyUnreadable(spare), "could not make the spare file unreadable; fix the harness rather than skipping");

    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.ok(surface.unreadableFiles.length > 0, "the fixture stopped producing a read failure");

    const json = run("validate", root, AMPLE);
    assert.ok(
      findingsFor(json, "security.no-sql-concat").length > 0,
      "the bait stopped producing a finding, so this test would prove nothing",
    );
    assert.equal(
      statusOf(json, "security.no-sql-concat"),
      "failed/evaluated",
      "a violation found in a file that was read must survive an unrelated file being unreadable",
    );
  } finally {
    await restoreRead(spare);
    await rm(root, { recursive: true, force: true });
  }
});

test("a directory that could not be listed withdraws the rules its contents would have fed", async (t) => {
  // Nothing beneath an unlistable directory is ever collected, so an absence-based rule reports
  // "found nothing" over files it never had the chance to see. The surface recorded the loss as an
  // `evidence-unreadable-dir` finding and the trigger ignored it, so the verdict stayed clean beside
  // a finding saying the run could not look.
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
    assert.equal(surface.readBudget.exhausted, false, "the budget was spent, so this is not the loss mode under test");

    const json = run("validate", root, AMPLE);
    assert.equal(
      statusOf(json, "security.no-sql-concat"),
      "skipped/not-evaluated",
      "an absence-based rule must not pass over a directory the run could not list",
    );
  } finally {
    await restoreListing(hidden);
    await rm(root, { recursive: true, force: true });
  }
});

test("a retained prefix is not the file, and cannot establish a clean result", async () => {
  // The third loss mode the item names and the first implementation ignored. `readText` caps each
  // read at MAX_READ_BYTES, so a large file is retained IN PART while `contents.has(f)` answers yes.
  // The bait here sits after the cap: every byte of the violation is outside what the run holds, so
  // the rule reported `passed` over a file it had read four hundred kilobytes of.
  const CAP = 400_000;
  const padded = `${"// padding\n".repeat(Math.ceil(CAP / 10) + 1000)}\n${CONTENT_BAIT}`;
  const root = await baitedFixture({ "src/big.js": padded });
  try {
    assert.ok(Buffer.byteLength(padded, "utf8") > CAP, "the specimen must exceed the per-file cap");

    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.ok(surface.truncatedFiles.length > 0, "the fixture stopped producing a truncated read");
    assert.equal(surface.readBudget.exhausted, false, "the budget was spent, so this is not the loss mode under test");

    const json = run("validate", root, AMPLE);
    assert.deepEqual(
      findingsFor(json, "security.no-sql-concat"),
      [],
      "the bait was supposed to be past the cap; if it is visible this test proves nothing",
    );
    assert.equal(
      statusOf(json, "security.no-sql-concat"),
      "skipped/not-evaluated",
      "a clean result over a prefix is a statement about the prefix, not about the file",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- The reference space of an absence claim ------------------------------------------------------
//
// `quality.dead-code` is the one detector whose SEARCH spans every file rather than a filtered
// subset: its candidates are code files, but `files.some((other) => ...)` looks for a reference in
// anything. That makes it the only site where a file the run never opened can decide a verdict, and
// it reaches a mode none of the six recorded loss conditions cover.
//
// A file outside `TEXT_EXT` is collected into `files` and skipped by the read loop with a bare
// `continue`. It is absent from `contents` exactly as an unread file is, but nothing was lost —
// nothing was ever going to be read — so `filesWentUnsearched` is false and no withdrawal fires.
//
// WHAT THE RULE CLAIMS, MEASURED RATHER THAN ASSUMED. `rules/verification.json` says *"Code no
// longer reachable from any entry point"*, and the finding says *"referenced nowhere else in the
// repository"*. Both are repository-wide absence claims. Nothing in the catalogue defines a narrower
// searchable-text universe, so "anywhere" may not be quietly read as "in the files we happened to
// open": when the reference space is incomplete the proposition is not evaluable, and the rule is
// withdrawn rather than restated.

/** The orphan candidate, plus a reference to it placed where the caller chooses. */
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

const orphanNames = (json) =>
  findingsFor(json, "quality.dead-code").flatMap((f) => f.evidence ?? []);

test("GUARD: a genuine orphan is still established when the reference space is complete", async () => {
  // The anti-vacuity control, and the one that stops "withdraw whenever anything is missing" from
  // being a passing answer to the falsifiers below. Every file here is TEXT_EXT, every one is read,
  // and nothing references the candidate: the absence claim has its whole reference space, so the
  // rule must reach a scored verdict and name the file.
  const root = await deadCodeFixture({ "src/other.js": "export const other = 2;\n" });
  try {
    const surface = run("audit", root, AMPLE).evidenceSurface;
    assert.equal(surface.complete, true, "the fixture stopped presenting a complete surface");

    const json = run("validate", root, AMPLE);
    assert.equal(
      statusOf(json, "quality.dead-code"),
      "failed/evaluated",
      "a complete search that found no reference must still be able to say so",
    );
    assert.ok(
      orphanNames(json).includes("src/widgetrenderer.js"),
      `the orphan was not named; findings were ${JSON.stringify(orphanNames(json))}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CONTROL: a reference the run can read produces no orphan", async () => {
  // The same specimen, differing in one respect: the reference lives in a file the run opens. This
  // is the polarity the falsifier is measured against — a mechanism that suppressed everything
  // would pass the falsifier and the GUARD above would catch it, and a mechanism that did nothing
  // would pass this and fail the falsifier.
  const root = await deadCodeFixture({ "src/uses.js": `// ${REFERENCE}\n` });
  try {
    // Only the candidate under test is asserted about: `src/uses.js` is itself a candidate whose
    // own stem nothing references, so it is a legitimate orphan and its presence here is correct.
    assert.ok(
      !orphanNames(run("validate", root, AMPLE)).includes("src/widgetrenderer.js"),
      "a reference in a readable file must not leave the candidate looking orphaned",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a reference living outside the searched extensions cannot establish dead code", async () => {
  // THE DEFECT. `docs.svg` is committed, first-party, matched by no ignore rule and excluded by no
  // framework directory name. It is simply not in `TEXT_EXT`, so the read loop skips it without
  // recording anything, and the absence of its text is read as the absence of a reference. The rule
  // reached `failed / evaluated` naming a file that is not dead — over content the run never
  // obtained, with no budget spent, no read failed, no directory unlisted, nothing truncated.
  const root = await deadCodeFixture({ "docs.svg": `<svg><title>${REFERENCE}</title></svg>\n` });
  try {
    const json = run("validate", root, AMPLE);
    assert.ok(
      !orphanNames(json).includes("src/widgetrenderer.js"),
      "a file whose only reference sits in an unsearched file was named as dead code",
    );
    assertNotEvaluated(json, "quality.dead-code");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a reference past the per-file read cap cannot establish dead code either", async () => {
  // The THIRD door, and the one the other two do not cover. The file is TEXT_EXT, it is opened, and
  // the budget is ample -- it is simply larger than MAX_READ_BYTES, so only its first 400 KB are
  // retained and the reference sits past that boundary. `available` is true and `partial` is what
  // says the search did not cover the file.
  //
  // Written because mutation testing found `partial` folded into `available` survived the suite.
  // The route it reopens is precise: the completeness guard stops flagging the file, the detector
  // judges a candidate over a reference space it did not finish reading, emits an orphan, and the
  // `confirmed` exemption in aggregation then KEEPS that verdict -- the coarse `truncatedFiles`
  // trigger cannot withdraw a rule that already has a confirmed violation. A retained prefix is not
  // the file, and a clean result over the first bytes is a statement about those bytes.
  const padding = `// ${"padding ".repeat(9)}
`;
  const overCap = padding.repeat(Math.ceil(420_000 / padding.length)) + `// ${REFERENCE}
`;
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

test("a reference in a file the budget could not reach cannot establish dead code either", async () => {
  // The same proposition losing its reference space through a DIFFERENT door, and the reason this
  // is a separate test: a fix that special-cased the extension check would pass the falsifier above
  // and fail here. What matters is not which mechanism dropped the file but that the search did not
  // cover it, so the predicate has to be measured over the reference space itself.
  const root = await deadCodeFixture({ "src/uses.js": `// ${REFERENCE}\n${bulk("padding")}` });
  try {
    const json = unreadRun("validate", root, "src/uses.js");
    assert.ok(
      !orphanNames(json).includes("src/widgetrenderer.js"),
      "a file whose only reference sits in an unread file was named as dead code",
    );
    assertNotEvaluated(json, "quality.dead-code");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});


// --- The boundary is the mechanism ----------------------------------------------------------------
//
// Criterion 1 of #38 is typed, and it is deliberately not the same requirement as the verdict-level
// invariant every falsifier above measures: *a content lookup for a file the run did not obtain
// cannot return a string. No call site can reach `""` or `"{}"` for unread content, and THE
// MECHANISM ENFORCES THIS RATHER THAN A COMMENT ASSERTING IT.*
//
// The behavioural tests above cannot establish that clause. They prove that the sites which exist
// today behave, one site at a time, which is exactly the property that decays: the seam was opt-in
// at the call site, so a new detector inherited nothing and the next `contents.get(f) ?? ""` was one
// line of ordinary-looking code away. This test is the enforcement, and it is a source-level
// assertion on purpose — the criterion asks for a mechanism, and the mechanism is that the raw map
// is not reachable from a detector at all.
//
// It is written to fail on the parent commit, where every detector took `contents` as a parameter.

const SOURCE = readFileSync(CLI, "utf8");

/**
 * The source with comment lines dropped, because this file scans for a coercion by shape.
 *
 * Written after the first run of the last test below failed on a sentence in a comment describing
 * the coercion it was looking for. That is the criterion's own distinction arriving as a bug: a
 * comment naming `?? ""` is not a call site reaching for it, and a test that cannot tell them apart
 * is asserting about prose. It is also the fifth time this repository has confused a mention for a
 * use, which is why the split is a named helper rather than an inline filter.
 */
const codeOnly = (text) =>
  text
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");

/** Each detector's parameter list and body, taken from the source rather than by calling it. */
const detectorBodies = () => {
  const found = [...SOURCE.matchAll(/^(?:async )?function (detect[A-Za-z]+)\(([^)]*)\)\s*\{([\s\S]*?)^\}/gm)];
  assert.ok(
    found.length >= 15,
    `only ${found.length} detectors were parsed out of the source; the matcher has drifted from the code`,
  );
  return found;
};

test("no detector can be handed the raw content map", () => {
  // The structural half. A detector receives `run`, and `run` exposes views; there is no parameter
  // through which the map arrives, so the expression that caused this defect cannot be written.
  for (const [, name, params] of detectorBodies()) {
    assert.ok(
      !/\bcontents\b/.test(params),
      `${name} still takes the raw contents map as a parameter, so the seam is opt-in again`,
    );
  }
});

test("no detector reads the raw content map, and no lookup is coerced to a string", () => {
  // The reachability half, for the map arriving by some route other than a parameter — a closure, a
  // property off `run`, a module-level binding. And the coercion itself: a view returns a record, so
  // `?? ""` after one is not a fallback, it is a type error waiting to read as an empty file.
  // `[, name, , rawBody]`: the third capture is the parameter list and the fourth is the body. The
  // first version of this loop took the third, so every assertion below was scanning a parameter
  // list and passing vacuously — found by mutating a detector to destructure `contents` off `run`
  // and watching nothing fail. A test that cannot fail is the same defect as a rule that cannot.
  for (const [, name, , rawBody] of detectorBodies()) {
    const body = codeOnly(rawBody);
    // The identifier at all, not just `.get`/`.has`: a detector that destructures `contents` off
    // `run`, or closes over it, has reopened the same door by a route a method-name check misses.
    assert.ok(
      !/\bcontents\b/.test(body),
      `${name} reaches the raw contents map`,
    );
    assert.ok(
      !/\w+Of\([^)]*\)\s*\?\?/.test(body),
      `${name} coerces the result of a content view, which is the defect one indirection away`,
    );
    assert.ok(
      !/\?\?\s*"\{\}"/.test(body),
      `${name} falls back to "{}" — an unread manifest is not an empty manifest`,
    );
  }
});

test("every content view answers with a record, and the four are the only route", () => {
  // The type itself, asserted where it is defined. `available` and `partial` are separate fields
  // because their two directions are not symmetric: a violation found in a retained prefix was
  // genuinely found, while a clean result over that prefix says nothing about the bytes after it.
  const views = ["textOf", "sourceOf", "structureOf", "commentsOf"];
  for (const v of views) {
    assert.match(
      SOURCE,
      new RegExp(`${v}: \\(f\\) => viewOf\\(f, (null|"code"|"structure"|"comments")\\)`),
      `${v} is not defined as a view over the shared lookup, so it may answer with something else`,
    );
  }
  for (const field of ["available", "partial", "text", "reason"]) {
    assert.ok(SOURCE.includes(`${field}:`), `the content record no longer carries ${field}`);
  }
  // Any coercion of a missing split-source entry, not one spelling of it. The first version of
  // this assertion pinned the exact `?? ""` the defect had been written as, and a mutant supplying
  // `?? { code: "", structure: "", comments: "" }` walked straight through it -- the same shape of
  // hole as the criterion itself, in the test meant to hold the criterion.
  assert.ok(
    !/sources\.get\([^)]*\)[^;\n]*\?\?/.test(codeOnly(SOURCE)),
    "a derived view coerces a missing split-source entry into a value a caller can read as text",
  );
});

/**
 * Rule-bound content detectors, and the rule each must record its own losses against.
 *
 * WHY THIS IS A SOURCE-LEVEL ASSERTION AND NOT A BEHAVIOURAL ONE. Mutation testing found that
 * deleting the `run.unknown(...)` call from these detectors changes no verdict this suite can
 * observe, and the reason is measured rather than assumed: `CONFIG_EXT` and `CODE_EXT` are both
 * subsets of `TEXT_EXT`, so every file these detectors read is one the read loop attempts, so any
 * unavailability is already one of the recorded loss conditions, so the coarse
 * `filesWentUnsearched` trigger withdraws the rule regardless. The per-detector call is redundant
 * TODAY, and only today.
 *
 * That is exactly the situation where a boundary rots. `quality.dead-code` is the proof: its
 * reference space reaches files outside `TEXT_EXT`, the coarse trigger does not cover it, and the
 * rule fabricated a verdict for as long as nobody looked. Leaving these detectors depending on a
 * condition that happens to subsume them means the next detector to read outside that set fails the
 * same way — silently, and with a green suite.
 *
 * So the requirement is asserted where it is actually made: a detector that binds a rule and reads
 * content must record its own loss against its own rule, and must treat a retained prefix as one.
 */
const RULE_BOUND_CONTENT_DETECTORS = [
  ["detectDeadCode", "quality.dead-code"],
  ["detectDocDiscrepancies", "documentation.code-consistency"],
  ["detectSecretsInArtifacts", "security.no-secrets-in-artifacts"],
  ["detectSwallowedExceptions", "errors.no-swallowed-exceptions"],
  ["detectUnfinished", "quality.unfinished-work"],
  ["detectCertBypass", "security.no-cert-bypass"],
  ["detectSqlConcat", "security.no-sql-concat"],
  ["detectOpenQuestions", "reconstruction.open-questions"],
];

test("a rule-bound detector records its own evidence loss, against its own rule", () => {
  const bodies = new Map(detectorBodies().map(([, name, , body]) => [name, codeOnly(body)]));
  for (const [name, rule] of RULE_BOUND_CONTENT_DETECTORS) {
    const body = bodies.get(name);
    assert.ok(body, `${name} was not found in the source; the table has drifted from the code`);
    // Whitespace-tolerant: the call is wrapped across lines wherever the reason is composed.
    assert.ok(
      new RegExp(`run\\.unknown\\(\\s*"${rule}"`).test(body),
      `${name} reads content and binds ${rule}, but records no loss against it — it is relying on ` +
        "the coarse surface trigger, which is exactly what quality.dead-code fell out of",
    );
    assert.ok(
      /\.partial\b/.test(body),
      `${name} does not distinguish a retained prefix from the file; a clean result over the first ` +
        "bytes is a statement about those bytes",
    );
  }
});

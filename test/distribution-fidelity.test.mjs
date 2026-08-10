import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The distribution-fidelity invariant.
 *
 * A framework validating itself and the same framework validating an identical checkout as a target
 * must evaluate the same repository surface, and therefore reach the same verdict. Everything the
 * reusable CI workflow distributes depends on it: a required check that reproduces a *different*
 * verdict than the local run is mechanically authoritative and epistemically unreliable, which is
 * the combination this framework exists to prevent (ADR 0013).
 *
 * It was not true. `scripts/standards.mjs` excluded its own source file from the content scan by
 * absolute path, so the file was skipped when the framework audited its own directory and scanned
 * when it audited a copy — 25 passed / 3 failed one way, 23 / 4 the other, for identical content.
 * Asserting that both runs merely exit 1 would not have caught it, so this compares the full result
 * set rather than the exit code.
 *
 * Two clones rather than "the worktree versus a clone", deliberately: the worktree carries whatever
 * is uncommitted at the moment the suite runs, so comparing against it would make the test pass or
 * fail on working-tree state rather than on the invariant. Two checkouts of one commit are
 * identical by construction, which is exactly the subject.
 */
function clone(into, dir) {
  const r = spawnSync("git", ["clone", "--quiet", "--no-hardlinks", REPO, dir], { cwd: into, encoding: "utf8" });
  return r.status === 0;
}

function validate(cliRoot, target) {
  const r = spawnSync(
    process.execPath,
    [path.join(cliRoot, "scripts/standards.mjs"), "validate", target, "--json"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  return { code: r.status, report: JSON.parse(r.stdout) };
}

test("the same commit evaluates identically from inside and from outside", (t) => {
  const work = mkdtempSync(path.join(tmpdir(), "standards-fidelity-"));
  try {
    // A clean clone is required; without git, or without a committed HEAD, the comparison would be
    // between two things that are not the same content and the result would mean nothing.
    if (!clone(work, "a") || !clone(work, "b")) {
      t.skip("git could not clone this repository; the invariant cannot be established here");
      return;
    }
    const target = path.join(work, "a");

    const inside = validate(target, target); //   framework living in the tree it validates
    const outside = validate(path.join(work, "b"), target); // identical framework, different tree

    assert.equal(
      inside.report.status,
      outside.report.status,
      "the verdict depends on whether the evaluator lives inside the repository being evaluated",
    );
    assert.deepEqual(inside.report.summary, outside.report.summary, "the counts differ");
    assert.equal(inside.code, outside.code, "the exit codes differ");

    // The whole result set, not just the totals: two runs can agree on how many rules passed while
    // disagreeing about which ones, and that would be the same defect wearing a different number.
    const shape = (r) =>
      r.report.results
        .map((x) => `${x.ruleId}:${x.status}:${x.disposition ?? ""}`)
        .sort();
    assert.deepEqual(shape(inside), shape(outside), "the per-rule results differ");

    // And the evidence beneath the verdict. A detector that fires on one arrangement and not the
    // other is the exact defect this test was written for, and it is visible here before it has
    // moved a single rule.
    const findings = (r) => r.report.findings.map((x) => `${x.id}:${(x.evidence ?? []).join("|")}`).sort();
    assert.deepEqual(findings(inside), findings(outside), "the findings differ");
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});

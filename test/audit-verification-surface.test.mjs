/**
 * Tests for the two audit-only observations restored by ST-14 (#64): a repository with no test
 * surface, and a repository with no CI configuration.
 *
 * The withdrawn `detectMissingAuditInfrastructure` made both observations as one message bound to
 * `audit.business-state`, a rule whose subject is whether business mutations are recorded. #62
 * removed it. The observation was true; the binding was the defect. The owner decided (2026-10-01)
 * that the observations return as two separate findings with no compliance effect, so what is pinned
 * here is as much what they must NOT do as what they report:
 *
 *   - two findings, never merged, each firing on its own condition only;
 *   - `rule: null`, so no catalog rule can fail or pass because of them;
 *   - `info` severity, so `audit --strict` does not start failing over them;
 *   - `audit.business-state` stays not-evaluated, and `verification.before-completion` is not widened;
 *   - `validate` reaches the same verdict with or without them.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const fixture = (name) => path.join(HERE, "fixtures", name);

const NO_TESTS = "no-test-surface";
const NO_CI = "no-ci-configuration";

function cli(command, dir, extra = []) {
  const r = spawnSync(process.execPath, [CLI, command, `--dir=${dir}`, "--json", ...extra], { encoding: "utf8" });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  try {
    return { code: r.status, json: JSON.parse(r.stdout) };
  } catch {
    return assert.fail(`stdout was not JSON.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  }
}

/** A throwaway repository: a little real source, plus whichever of tests and CI the case names. */
async function withRepo({ tests, ci }, body) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-vsurface-"));
  try {
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "index.js"), "export const add = (a, b) => a + b;\n");
    if (tests) {
      await mkdir(path.join(dir, "test"), { recursive: true });
      await writeFile(path.join(dir, "test", "index.test.js"), "// covers add\n");
    }
    if (ci) {
      await mkdir(path.join(dir, ".github", "workflows"), { recursive: true });
      await writeFile(path.join(dir, ".github", "workflows", "ci.yml"), "name: ci\non: [push]\njobs: {}\n");
    }
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const observed = (dir) => cli("audit", dir).json.findings.filter((f) => f.id === NO_TESTS || f.id === NO_CI);
const idsOf = (findings) => findings.map((f) => f.id).sort();

test("a repository with tests and CI is not reported", () =>
  withRepo({ tests: true, ci: true }, (dir) => {
    assert.deepEqual(idsOf(observed(dir)), []);
  }));

test("a repository with neither is reported as two separate findings", () =>
  withRepo({ tests: false, ci: false }, (dir) => {
    const found = observed(dir);
    assert.deepEqual(idsOf(found), [NO_CI, NO_TESTS].sort(), "the two observations must not be merged");
    for (const f of found) {
      // Test files are recognised by naming convention, so their absence is inferred; a CI file at a
      // defined path is observed. Standard 44 R2: a heuristic is never reported as observed.
      assert.equal(f.label, f.id === NO_TESTS ? "INFERRED" : "OBSERVED", `${f.id} label`);
      assert.match(f.standardRef, /44.*#r10--definition-of-done$/, `${f.id} should cite Standard 44 R10`);
      assert.ok(f.message.length > 0 && f.evidence.length > 0, `${f.id} needs a message and evidence`);
    }
    const [tests, ci] = [NO_TESTS, NO_CI].map((id) => found.find((f) => f.id === id));
    assert.doesNotMatch(tests.message, /CI/i, "the test finding must not speak for CI");
    assert.doesNotMatch(ci.message, /test/i, "the CI finding must not speak for tests");
  }));

test("a repository with only tests is reported for CI alone", () =>
  withRepo({ tests: true, ci: false }, (dir) => {
    assert.deepEqual(idsOf(observed(dir)), [NO_CI]);
  }));

test("a repository with only CI is reported for tests alone", () =>
  withRepo({ tests: false, ci: true }, (dir) => {
    assert.deepEqual(idsOf(observed(dir)), [NO_TESTS]);
  }));

test("neither observation carries a rule binding", () =>
  withRepo({ tests: false, ci: false }, (dir) => {
    const found = observed(dir);
    assert.equal(found.length, 2);
    for (const f of found) assert.equal(f.rule, null, `${f.id} must be audit-only, got rule ${f.rule}`);
  }));

test("neither observation is a warning or error, so audit --strict is not newly failed by them", () =>
  withRepo({ tests: false, ci: false }, (dir) => {
    const found = observed(dir);
    assert.equal(found.length, 2);
    for (const f of found) assert.equal(f.severity, "info", `${f.id} has no compliance effect`);
    const strict = cli("audit", dir, ["--strict"]);
    const nonInfo = strict.json.findings.filter((f) => f.severity !== "info");
    assert.equal(strict.code, nonInfo.length ? 1 : 0, "strict must fail only on non-info findings");
  }));

test("audit.business-state stays not-evaluated and unbound when the observations fire", () =>
  withRepo({ tests: false, ci: false }, (dir) => {
    assert.equal(observed(dir).length, 2, "the observations must be firing for this test to mean anything");
    const audit = cli("audit", dir).json;
    assert.deepEqual(audit.findings.filter((f) => f.rule === "audit.business-state"), []);
    const rule = cli("validate", dir).json.results.find((r) => r.ruleId === "audit.business-state");
    assert.ok(rule, "audit.business-state missing from the result set");
    assert.equal(rule.status, "skipped");
    assert.equal(rule.disposition, "not-evaluated");
    assert.deepEqual(rule.evidence, []);
  }));

test("verification.before-completion is not widened by the observations", () =>
  withRepo({ tests: false, ci: false }, (dir) => {
    assert.equal(observed(dir).length, 2);
    const audit = cli("audit", dir).json;
    assert.equal(audit.findings.filter((f) => f.rule === "verification.before-completion").length, 0);
    assert.ok(!audit.findings.some((f) => f.id === "unverified-functionality"));
  }));

test("validate reaches the same verdict with and without the CI observation", async () => {
  // Two copies of one repository that differ only in the CI workflow, so the only audit difference
  // is the observation under test. Any result that moved would be that observation leaking into the
  // verdict.
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-vsurface-pair-"));
  try {
    const withCi = path.join(root, "with-ci");
    const withoutCi = path.join(root, "without-ci");
    await cp(fixture("audit-audited-with-infrastructure"), withCi, { recursive: true });
    await cp(fixture("audit-audited-with-infrastructure"), withoutCi, { recursive: true });
    await rm(path.join(withoutCi, ".github"), { recursive: true, force: true });

    assert.deepEqual(idsOf(observed(withCi)), [], "control copy must not carry the observation");
    assert.deepEqual(idsOf(observed(withoutCi)), [NO_CI], "variant copy must carry it");

    const [a, b] = [cli("validate", withCi), cli("validate", withoutCi)];
    const shape = (r) => ({
      code: r.code,
      status: r.json.status,
      score: r.json.score,
      summary: r.json.summary,
      results: r.json.results.map((x) => [x.ruleId, x.status, x.disposition, x.evidence]),
    });
    assert.deepEqual(shape(b), shape(a), "the CI observation changed the validate verdict");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("validate yields no verdict from the no-test-surface observation", () =>
  withRepo({ tests: false, ci: true }, (dir) => {
    assert.deepEqual(idsOf(observed(dir)), [NO_TESTS], "the observation must be firing");
    const v = cli("validate", dir).json;
    // The finding may be listed as evidence, but no rule result may rest on it.
    for (const r of v.results) {
      assert.ok(
        !JSON.stringify(r).includes(NO_TESTS),
        `${r.ruleId} rests on the no-test-surface observation, which has no rule binding`,
      );
    }
    assert.deepEqual(v.findings.filter((f) => f.id === NO_TESTS && f.rule), []);
  }));

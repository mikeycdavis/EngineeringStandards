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
import { readdirSync, statSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm, cp, chmod, symlink } from "node:fs/promises";
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

// ---------------------------------------------------------------------------------------------
// Codex review of #83. Two absence claims were stronger than the evidence under them.
// ---------------------------------------------------------------------------------------------

/** A repository with source and nothing else, for building the incomplete-walk cases by hand. */
async function bare(body) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-vsurface-gap-"));
  try {
    await mkdir(path.join(dir, "src"), { recursive: true });
    await writeFile(path.join(dir, "src", "index.js"), "export const add = (a, b) => a + b;\n");
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("no-test-surface is withheld when a framework-excluded directory holds the tests", () =>
  bare(async (dir) => {
    // `fixtures` is in SKIP_DIRS: the walk never enters it, so a test there is invisible to `files`.
    await mkdir(path.join(dir, "fixtures", "test"), { recursive: true });
    await writeFile(path.join(dir, "fixtures", "test", "a.test.js"), "// real tests live here\n");
    const audit = cli("audit", dir).json;
    assert.equal(audit.evidenceSurface.complete, false, "precondition: the surface must report itself incomplete");
    assert.deepEqual(idsOf(audit.findings.filter((f) => f.id === NO_TESTS)), [], "a categorical no-tests claim over an incomplete walk");
  }));

// The same real-permission harness `audit.test.mjs` uses, verified to bite rather than skipped.
const denyListing = async (target) => {
  if (process.platform === "win32") spawnSync("icacls", [target, "/deny", `${process.env.USERNAME}:(OI)(CI)(RD,RX)`], { encoding: "utf8" });
  else await chmod(target, 0o000);
};
const restoreListing = async (target) => {
  if (process.platform === "win32") spawnSync("icacls", [target, "/remove:d", process.env.USERNAME], { encoding: "utf8" });
  else await chmod(target, 0o755);
};

test("no-test-surface is withheld when a directory cannot be listed", () =>
  bare(async (dir) => {
    const locked = path.join(dir, "locked");
    await mkdir(path.join(locked, "test"), { recursive: true });
    await writeFile(path.join(locked, "test", "a.test.js"), "//\n");
    await denyListing(locked);
    try {
      assert.throws(() => readdirSync(locked), "could not make the directory unlistable; this test would prove nothing");
      const audit = cli("audit", dir).json;
      assert.deepEqual(audit.evidenceSurface.unreadableDirectories, ["locked"], "precondition: the directory is reported unlistable");
      assert.deepEqual(audit.findings.filter((f) => f.id === NO_TESTS), []);
    } finally {
      await restoreListing(locked);
    }
  }));

test("no-test-surface is withheld when the walk stopped at the file cap", () =>
  bare(async (dir) => {
    // MAX_FILES is 20000; the cap is reached only by really creating that many files.
    const many = path.join(dir, "docs");
    await mkdir(many);
    for (let start = 0; start < 20010; start += 1000) {
      await Promise.all(Array.from({ length: 1000 }, (_, i) => writeFile(path.join(many, `f${start + i}.txt`), "x")));
    }
    const audit = cli("audit", dir).json;
    assert.equal(audit.evidenceSurface.fileCapReached, true, "precondition: the cap must be hit");
    assert.deepEqual(audit.findings.filter((f) => f.id === NO_TESTS), []);
  }));

test("no-test-surface still fires when the only loss is a repository-declared exclusion", () =>
  bare(async (dir) => {
    // Content the project itself marked ignored was never owed to the run (see `complete`).
    spawnSync("git", ["init", "-q"], { cwd: dir });
    await writeFile(path.join(dir, ".gitignore"), "generated/\n");
    await mkdir(path.join(dir, "generated"), { recursive: true });
    await writeFile(path.join(dir, "generated", "x.test.js"), "//\n");
    const audit = cli("audit", dir).json;
    assert.equal(audit.evidenceSurface.complete, true, "precondition: a repository-declared exclusion is not incompleteness");
    assert.deepEqual(idsOf(audit.findings.filter((f) => f.id === NO_TESTS)), [NO_TESTS]);
  }));

const WORKFLOW = ["name: ci", "on: [push]", "jobs: {}", ""].join(String.fromCharCode(10));

const ciOnly = async (dir, files) => {
  await mkdir(path.join(dir, ".github", "workflows"), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(path.join(dir, ".github", "workflows", name), text);
  return cli("audit", dir).json.findings.filter((f) => f.id === NO_CI);
};

test("no-ci-configuration fires when .github/workflows holds no workflow file", () =>
  bare(async (dir) => {
    assert.deepEqual(idsOf(await ciOnly(dir, { "README.md": "# not a workflow\n" })), [NO_CI]);
  }));

test("no-ci-configuration fires for an empty .github/workflows directory", () =>
  bare(async (dir) => {
    assert.deepEqual(idsOf(await ciOnly(dir, {})), [NO_CI]);
  }));

test("no-ci-configuration is withheld for a lowercase .yml or .yaml workflow", async () => {
  for (const name of ["ci.yml", "ci.yaml"]) {
    await bare(async (dir) => {
      assert.deepEqual(await ciOnly(dir, { [name]: WORKFLOW }), [], name);
    });
  }
});

test("an uppercase or mixed-case extension is not a GitHub workflow", async () => {
  // GitHub requires the literal `.yml`/`.yaml`; `CI.YML` is not runnable on a case-sensitive path.
  for (const name of ["CI.YML", "ci.YML", "ci.Yaml", "ci.yAml"]) {
    await bare(async (dir) => {
      assert.deepEqual(idsOf(await ciOnly(dir, { [name]: WORKFLOW })), [NO_CI], name);
    });
  }
});

test("a lowercase workflow beside an uppercase one still counts", () =>
  bare(async (dir) => {
    assert.deepEqual(await ciOnly(dir, { "CI.YML": WORKFLOW, "real.yml": WORKFLOW }), []);
  }));

test("no-ci-configuration is withheld when a candidate workflow is listable but cannot be statted", () =>
  bare(async (dir) => {
    if (process.platform === "win32") return; // no read-without-search directory mode to apply here
    const workflows = path.join(dir, ".github", "workflows");
    await mkdir(workflows, { recursive: true });
    await writeFile(path.join(workflows, "ci.yml"), WORKFLOW);
    await chmod(workflows, 0o444); // read, no search: names are listed, entries cannot be statted
    try {
      assert.deepEqual(readdirSync(workflows), ["ci.yml"], "precondition: the directory must still list");
      let statted = true;
      try { statSync(path.join(workflows, "ci.yml")); } catch { statted = false; }
      if (statted) return; // privileges that ignore the mode (root): this test would prove nothing
      assert.deepEqual(cli("audit", dir).json.findings.filter((f) => f.id === NO_CI), [], "absence claimed over an entry nobody could inspect");
    } finally {
      await chmod(workflows, 0o755);
    }
  }));

test("a dangling workflow symlink is a real absence, not an unknown", () =>
  bare(async (dir) => {
    if (process.platform === "win32") return; // symlink creation needs privileges there
    const workflows = path.join(dir, ".github", "workflows");
    await mkdir(workflows, { recursive: true });
    await symlink(path.join(dir, "nowhere.yml"), path.join(workflows, "ci.yml"));
    assert.deepEqual(idsOf(cli("audit", dir).json.findings.filter((f) => f.id === NO_CI)), [NO_CI]);
  }));

test("a file that merely ends in yml, without the dot, is not a workflow", () =>
  bare(async (dir) => {
    assert.deepEqual(idsOf(await ciOnly(dir, { xyml: "name: ci\n", notyaml: "name: ci\n" })), [NO_CI]);
  }));

test("a workflow-named directory is not a workflow file", () =>
  bare(async (dir) => {
    await mkdir(path.join(dir, ".github", "workflows", "nested.yml"), { recursive: true });
    assert.deepEqual(idsOf(cli("audit", dir).json.findings.filter((f) => f.id === NO_CI)), [NO_CI]);
  }));

test("another CI system's file still suppresses no-ci-configuration alongside an empty workflows directory", () =>
  bare(async (dir) => {
    await mkdir(path.join(dir, ".github", "workflows"), { recursive: true });
    await writeFile(path.join(dir, "Jenkinsfile"), "pipeline {}\n");
    assert.deepEqual(cli("audit", dir).json.findings.filter((f) => f.id === NO_CI), []);
  }));

test("no-ci-configuration is withheld when .github/workflows exists but cannot be listed", () =>
  bare(async (dir) => {
    const workflows = path.join(dir, ".github", "workflows");
    await mkdir(workflows, { recursive: true });
    await writeFile(path.join(workflows, "ci.yml"), "name: ci\non: [push]\njobs: {}\n");
    await denyListing(workflows);
    try {
      assert.throws(() => readdirSync(workflows), "could not make the directory unlistable; this test would prove nothing");
      assert.deepEqual(cli("audit", dir).json.findings.filter((f) => f.id === NO_CI), [], "absence claimed over a directory nobody could read");
    } finally {
      await restoreListing(workflows);
    }
  }));

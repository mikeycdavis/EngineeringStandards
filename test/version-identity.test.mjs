/**
 * Tests for the version-identity guard in `standards validate`.
 *
 * The invariant under test: a verdict may not be reported for standards version X unless the
 * framework executing the run identifies itself as X. `standardVersion` is declared by the project
 * and nothing resolves it (Standard 21 R5 is unimplemented), so before this guard a policy pinned
 * to one version could be evaluated by another and the envelope would carry the declared version
 * beside a verdict that version never produced.
 *
 * These run the real CLI as a subprocess, because the guard lives at the invocation boundary rather
 * than inside evaluate(). That placement is deliberate and is itself asserted below: the ten policy
 * fixtures under test/fixtures/policies/ declare 1.0.0 and are fed to the evaluator directly, so a
 * guard inside evaluate() would have made them unusable and conflated framework identity with rule
 * evaluation. Version identity is a precondition for a run being meaningful, not evidence about a
 * project.
 *
 * The assertions pin semantic consequences, not labels. A test that only checked for the string
 * "VERSION_MISMATCH" would still pass if the guard printed a warning and then emitted a verdict
 * anyway, which is the exact failure being prevented.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const REPO = path.join(HERE, "..");
const FRAMEWORK_VERSION = readFileSync(path.join(REPO, "VERSION"), "utf8").trim();

/** A minimal schema-valid policy, parameterised only by the version line under test. */
const policyDeclaring = (version) =>
  `standardVersion: "${version}"\nproject: "VersionGuardFixture"\n\nrules:\n  planning.acceptance-criteria:\n    level: required\n`;

async function inTempRepo(policyText, fn) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-version-"));
  try {
    if (policyText !== null) await writeFile(path.join(dir, "project-policy.yml"), policyText);
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const run = (dir, command, extra = []) =>
  spawnSync(process.execPath, [CLI, command, `--dir=${dir}`, ...extra], { encoding: "utf8" });

test("validate proceeds when the policy version matches the executing framework", async () => {
  await inTempRepo(policyDeclaring(FRAMEWORK_VERSION), (dir) => {
    const r = run(dir, "validate", ["--json"]);
    const json = JSON.parse(r.stdout);

    // The guard must be silent, and — the part that matters — a verdict must actually be reached.
    assert.equal(json.error, undefined, "matching versions must not raise VERSION_MISMATCH");
    assert.ok(json.status, "a verdict envelope must be emitted when versions agree");
    assert.equal(json.standardVersion, FRAMEWORK_VERSION);
    assert.notEqual(r.status, 2, "a matching version must not exit as a configuration error");
  });
});

test("validate refuses to produce a verdict when the policy declares a different version", async () => {
  const declared = "1.0.0";
  assert.notEqual(declared, FRAMEWORK_VERSION, "fixture only tests anything while these differ");

  await inTempRepo(policyDeclaring(declared), (dir) => {
    const r = run(dir, "validate", ["--json"]);
    const json = JSON.parse(r.stdout);

    assert.equal(r.status, 2, "a version disagreement is a configuration error, not a rule failure");
    assert.equal(json.error, "VERSION_MISMATCH");
    assert.equal(json.policyStandardVersion, declared);
    assert.equal(json.frameworkVersion, FRAMEWORK_VERSION);

    // The semantic consequence: no verdict, under either version. An envelope that merely reported
    // NOT_EVALUATED would still label its evidence with the declared version, which is the lie.
    assert.equal(json.status, undefined, "no compliance status may be emitted");
    assert.equal(json.summary, undefined, "no summary may be emitted");
    assert.equal(json.results, undefined, "no rule results may be emitted");
    assert.equal(json.standardVersion, undefined, "evidence must not be labelled with either version");
  });
});

test("the human diagnostic names both versions and disclaims historical resolution", async () => {
  await inTempRepo(policyDeclaring("1.0.0"), (dir) => {
    const r = run(dir, "validate");
    const out = r.stderr;

    assert.match(out, /VERSION_MISMATCH/);
    assert.match(out, /1\.0\.0/, "the declared version must be named");
    assert.ok(out.includes(FRAMEWORK_VERSION), "the executing framework version must be named");
    assert.match(out, /Standard 21 R5/, "the diagnostic must say historical resolution is unimplemented");

    // A refusal that produced a verdict on stdout would defeat the guard regardless of the message.
    assert.equal(r.stdout.trim(), "", "no report may be written to stdout");
  });
});

test("a malformed or absent standardVersion is owned by the policy path, not the version guard", async () => {
  // The schema makes standardVersion required and pins it to a semver triple, so neither state can
  // reach the guard. Both are already exit-2 configuration errors; this asserts the guard does not
  // duplicate that handling and does not mislabel a broken policy as a version disagreement.
  const cases = [
    ['standardVersion: "1.0"\nproject: "Malformed"\n', "malformed version"],
    ['project: "NoVersion"\n', "absent version"],
  ];
  for (const [policyText, label] of cases) {
    await inTempRepo(policyText, (dir) => {
      const r = run(dir, "validate", ["--json"]);
      assert.equal(r.status, 2, `${label} must remain a configuration error`);
      assert.doesNotMatch(
        r.stdout + r.stderr,
        /VERSION_MISMATCH/,
        `${label} must not be reported as a version disagreement`,
      );
    });
  }
});

test("audit is unaffected by a version disagreement", async () => {
  // Deliberate scoping: audit reports evidence and claims no standards version, so attaching a
  // version precondition to it would gate a command whose contract does not depend on one.
  await inTempRepo(policyDeclaring("1.0.0"), (dir) => {
    const r = run(dir, "audit", ["--json"]);
    assert.doesNotMatch(r.stdout + r.stderr, /VERSION_MISMATCH/);
    const json = JSON.parse(r.stdout);
    assert.ok(Array.isArray(json.findings), "audit must still produce an evidence survey");
    assert.notEqual(r.status, 2);
  });
});

test("this repository's own policy declares the version it ships", async () => {
  // Without this, bumping VERSION without updating project-policy.yml would turn the repository's
  // own CI gate into a silent exit 2 — the guard firing on its author.
  const policy = readFileSync(path.join(REPO, "project-policy.yml"), "utf8");
  const declared = policy.match(/^standardVersion:\s*"([^"]+)"/m)?.[1];
  assert.equal(declared, FRAMEWORK_VERSION);
});

/**
 * ST-15: the Engineering adapter release candidate (`standards-adapter.json`).
 *
 * WHAT THIS PROVES, AND WHAT IT CANNOT. The adapter is a declaration read by a consumer
 * (StandardsEnforcer) that this repository does not contain. Three kinds of check live here and they
 * are kept apart on purpose:
 *
 *   1. PRODUCER facts, always run: the declaration says what this repository's CLI actually does
 *      (the literal argv, the four native verdicts, the one policy filename), and a mediated
 *      invocation built from the declaration agrees with a direct one over a declared matrix.
 *   2. CONSUMER conformance, run only when STANDARDS_ENFORCER_DIR points at a StandardsEnforcer
 *      checkout. The consumer's schema and contract code are NOT copied here: a copy would be a
 *      second interpretation of a contract the consumer owns, and would drift. Without the variable
 *      these tests are reported as skipped with the reason, never as passed.
 *   3. What is the consumer's alone: its refusal of an invocation that returns no status
 *      (scripts/enforce.mjs, "does not declare" branch) is consumer behaviour. This file cannot
 *      prove it; the candidate evidence cites the consumer's own test run for it.
 *
 * Every temporary target is assembled from fragments: this file is scanned by the detectors it
 * exercises (see test/fixture-exemptions.test.mjs).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { STATUS } from "../scripts/compliance.mjs";
import { contentDigest } from "../scripts/fixture-exemptions.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADAPTER_FILE = path.join(ROOT, "standards-adapter.json");
const NL = "\n";
const adapter = JSON.parse(await readFile(ADAPTER_FILE, "utf8"));

// ---- 1. producer facts -----------------------------------------------------------------------

test("criterion 1: the declared invocation is exactly `validate {target} --json` on the shipped CLI", () => {
  assert.equal(adapter.evaluation.entrypoint, "scripts/standards.mjs");
  assert.deepEqual(adapter.evaluation.arguments, ["validate", "{target}", "--json"]);
  assert.ok(existsSync(path.join(ROOT, adapter.evaluation.entrypoint)), "the entrypoint is not in this repository");
});

test("criterion 2: project-policy.yml is the only declared policy input", () => {
  assert.deepEqual(adapter.adoption.policyFiles, ["project-policy.yml"]);
  assert.equal(adapter.schemaVersion, "1.2.0", "adoption is admitted from schemaVersion 1.2.0");
});

test("criterion 2: the CLI honours that one name only (a .yaml spelling is not a policy)", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-adapter-yaml-"));
  roots.push(root);
  await writeFile(path.join(root, "project-policy.yaml"), `standardVersion: "2.0.0"${NL}project: "yaml spelling"${NL}`);
  const r = await run(process.execPath, [path.join(ROOT, "scripts/standards.mjs"), "validate", root, "--json"]);
  assert.equal(JSON.parse(r.stdout).status, STATUS.NOT_EVALUATED);
  assert.equal(r.code, 2);
});

test("criterion 3: all four native verdicts are declared and the passing set is a declared subset", () => {
  assert.deepEqual([...adapter.result.statuses].sort(), Object.values(STATUS).sort());
  assert.deepEqual([...adapter.result.passing].sort(), [STATUS.COMPLIANT, STATUS.COMPLIANT_WITH_EXCEPTIONS].sort());
  for (const s of adapter.result.passing) assert.ok(adapter.result.statuses.includes(s), `${s} is passing but not declared`);
  assert.equal(adapter.result.passing.includes(STATUS.NON_COMPLIANT), false);
  assert.equal(adapter.result.passing.includes(STATUS.NOT_EVALUATED), false, "an unknown must never be a pass");
});

// ---- 2. consumer conformance (conditional) ---------------------------------------------------

const ENFORCER = process.env.STANDARDS_ENFORCER_DIR;
const consumerSkip = ENFORCER
  ? false
  : "STANDARDS_ENFORCER_DIR is not set: the consumer schema/contract is not in this repository, so criteria 4 and 5 are NOT evaluated here";

async function consumer(rel) {
  return import(pathToFileURL(path.join(ENFORCER, rel)).href);
}

test("criterion 4: the declaration validates against the consumer adapter schema", { skip: consumerSkip }, async () => {
  const { validateAdapter } = await consumer("scripts/contracts/adapter.mjs");
  assert.deepEqual(validateAdapter(adapter), []);
});

test("criterion 4 control: the consumer validator rejects a broken copy (the check can fail)", { skip: consumerSkip }, async () => {
  const { validateAdapter } = await consumer("scripts/contracts/adapter.mjs");
  const broken = structuredClone(adapter);
  broken.result.passing.push("BLOCKED_BY_INVARIANT"); // passing outside the declared vocabulary
  assert.ok(validateAdapter(broken).length > 0);
  const old = structuredClone(adapter);
  old.schemaVersion = "1.0.0"; // adoption is not admitted below 1.2.0
  assert.ok(validateAdapter(old).length > 0);
});

// ---- the declared supported matrix -----------------------------------------------------------

const roots = [];
test.after(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true });
});

const CERT = `const agent = { ${"rejectUnauthorized"}: ${"false"} };${NL}module.exports = { agent };${NL}`;
const CLEAN = `export const ok = 1;${NL}`;
const CERT_RULE = "security.no-cert-bypass";
const FOUR_FAILING = ["architecture.project-manifest", "architecture.adr", "documentation.architecture", "planning.breakdown-directory"];
const UNESTABLISHED = ("ai.no-fabricated-capabilities ai.no-safety-bypass architecture.no-hidden-global-state architecture.no-boundary-bypass " +
  "architecture.no-duplicate-implementations concurrency.no-unmanaged-shared-state data.migration-rollback data.no-silent-discard " +
  "data.no-audit-corruption data.no-prod-data-in-dev errors.no-false-success errors.no-unbounded-retry observability.no-silenced-failures " +
  "meta.standards-not-weakened scm.no-shared-history-rewrite security.no-disabled-access-controls security.no-untrusted-exec " +
  "testing.no-weakening-to-pass testing.no-fabricated-results").split(" ");

// Targets are repository ROOTS outside this checkout. A positional target is resolved upward to the
// nearest .git or package.json (findRoot in scripts/standards.mjs), so a directory nested inside this
// repository would be evaluated as THIS repository: that is the CLI's documented behaviour, and it is
// why no in-tree fixture directory is used as a target here.
async function noPolicyRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-adapter-nopolicy-"));
  roots.push(root);
  await writeFile(path.join(root, "README.md"), "specimen" + NL);
  return root;
}

async function violatingRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-adapter-violating-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "src/bypass.js"), CERT);
  await writeFile(path.join(root, "project-policy.yml"), ['standardVersion: "2.0.0"', 'project: "adapter candidate violating specimen"'].join(NL) + NL);
  return root;
}

/** A committed repository whose only exception is an exactly pinned deliberately violating fixture. */
async function exceptionsRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-adapter-candidate-"));
  roots.push(root);
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "test/fixtures/bad"), { recursive: true });
  await writeFile(path.join(root, "src/ok.js"), CLEAN);
  await writeFile(path.join(root, "test/fixtures/bad/bypass.js"), CERT);
  const na = UNESTABLISHED.concat(FOUR_FAILING)
    .map((id) => `  ${id}:${NL}    status: not-applicable${NL}    reason: "none here"${NL}    revisitWhen: "later"${NL}`)
    .join("");
  const policy = [
    'standardVersion: "2.0.0"',
    'project: "adapter candidate specimen"',
    "fixtureExemptions:",
    '  - path: "test/fixtures/bad/bypass.js"',
    `    sha256: ${JSON.stringify(contentDigest(Buffer.from(CERT)))}`,
    `    rule: ${JSON.stringify(CERT_RULE)}`,
    '    reason: "deliberately violating fixture"',
    '    owner: "project-owner"',
    '    reviewWhen: "the fixture is rewritten"',
    "applicability:",
  ].join(NL) + NL + na;
  await writeFile(path.join(root, "project-policy.yml"), policy);
  const git = (...args) =>
    run("git", ["-C", root, ...args]).then((r) => assert.equal(r.code, 0, `git ${args.join(" ")}: ${r.stderr}`));
  await git("init", "-q");
  await git("config", "user.email", "t@example.invalid");
  await git("config", "user.name", "t");
  await git("add", "-A", "-f");
  await git("-c", "commit.gpgsign=false", "commit", "-qm", "specimen");
  return root;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** The documented direct form. */
const direct = (target) =>
  run(process.execPath, [path.join(ROOT, "scripts/standards.mjs"), "validate", `--dir=${target}`, "--json"]);

/** The adapter-mediated form: argv exactly as declared, `{target}` substituted and nothing else. */
const mediated = (target) => {
  const argv = adapter.evaluation.arguments.map((a) => a.split("{target}").join(target));
  return run(process.execPath, [path.join(ROOT, adapter.evaluation.entrypoint), ...argv]);
};

const parse = (r) => {
  try {
    return JSON.parse(r.stdout);
  } catch {
    return null;
  }
};

// The one field that legitimately differs between two runs of the same target is the wall-clock stamp.
// Nothing else is excluded: an equivalence that dropped fields it found inconvenient would prove less.
const stable = ({ auditedAt, ...rest }) => (typeof auditedAt === "string" ? rest : { auditedAt, ...rest });

const MATRIX = [
  { name: "no-policy target", expect: STATUS.NOT_EVALUATED, code: 2, target: noPolicyRepo },
  { name: "violating target", expect: STATUS.NON_COMPLIANT, code: 1, target: violatingRepo },
  { name: "pinned-exception target", expect: STATUS.COMPLIANT_WITH_EXCEPTIONS, code: 0, target: exceptionsRepo },
];

for (const row of MATRIX) {
  test(`criterion 6/7: direct and adapter-mediated agree, and a status is always returned (${row.name} -> ${row.expect})`, async () => {
    const target = await row.target();
    const [d, m] = await Promise.all([direct(target), mediated(target)]);
    const dj = parse(d);
    const mj = parse(m);
    assert.ok(dj && mj, `no JSON: direct ${d.stderr.slice(0, 200)} / mediated ${m.stderr.slice(0, 200)}`);
    // Criterion 7, producer side: even exit 1 and exit 2 carry a status in the declared vocabulary,
    // so the status key (not the exit code) is a usable signal for every native outcome.
    assert.equal(typeof dj.status, "string");
    assert.ok(adapter.result.statuses.includes(dj.status), `${dj.status} is outside the declared vocabulary`);
    assert.equal(dj.status, row.expect);
    assert.equal(d.code, row.code);
    assert.equal(m.code, d.code, "exit codes differ between the direct and the mediated invocation");
    assert.deepEqual(stable(mj), stable(dj), "the mediated report differs from the direct one");
  });
}

test("criterion 6 (consumer path): the consumer's own runner returns the same report as a direct run", { skip: consumerSkip }, async () => {
  const { runOfficialEvaluator } = await consumer("scripts/enforce.mjs");
  const target = await violatingRepo();
  const viaConsumer = runOfficialEvaluator(ROOT, { target, policyPath: path.join(target, "project-policy.yml"), expectStandardId: "engineering" });
  assert.equal(viaConsumer.ok, true, viaConsumer.why);
  assert.ok(adapter.result.statuses.includes(viaConsumer.report.status), "outside the declared vocabulary (criterion 5)");
  const d = parse(await direct(target));
  assert.deepEqual(stable(viaConsumer.report), stable(d));
});

test("criterion 5 control: a wrong-pack expectation is refused by the consumer, so the identity above is real", { skip: consumerSkip }, async () => {
  const { runOfficialEvaluator } = await consumer("scripts/enforce.mjs");
  const target = await violatingRepo();
  const r = runOfficialEvaluator(ROOT, { target, policyPath: path.join(target, "project-policy.yml"), expectStandardId: "betting" });
  assert.equal(r.ok, false);
  assert.equal(r.identityMismatch, true);
});

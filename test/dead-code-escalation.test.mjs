/**
 * Issue #46 (ST-08): `quality.dead-code` is advisory at its catalogued level, and a project policy
 * may escalate it.
 *
 * THE CONTRACT, per the owner decision recorded 2026-10-01 on #46: policy escalation is preserved and
 * no severity cap is added. The catalogue's assurance statement is therefore narrowed to what is true
 * ("never a failure at its catalogued level"), and the mechanism is pinned so a later change cannot
 * quietly make either half untrue:
 *
 *   * at the catalogued `optional` level an orphan is SILENT: Standard 18 R3 defines the outcome of an
 *     `optional` violation as silence, so it is neither a failure nor a warning (owner decision A;
 *     the optional-versus-required matrix is test/optional-silent.test.mjs);
 *   * the same fixture under a policy that changes ONLY the level to `required` is a `failed` that
 *     decides the run's status. That is a feature of the contract, not a defect, so a severity cap
 *     must break this suite.
 *
 * The wording is asserted too: the unconditional phrase was false, and a test of the mechanism alone
 * would not stop it returning.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const RULE = "quality.dead-code";
const AMPLE = 64 * 1024 * 1024;

const policy = (level) =>
  [
    'standardVersion: "2.0.0"',
    'project: "Dead code escalation specimen"',
    "rules:",
    `  ${RULE}:`,
    `    level: ${level}`,
    "",
  ].join("\n");

/** One orphan, referenced nowhere; the policy level is the only thing the caller varies. */
async function specimen(level) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dead-code-escalation-"));
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "README.md"), `# Specimen\n\n${"substantive prose ".repeat(60)}\n`);
  await writeFile(path.join(root, "project-policy.yml"), policy(level));
  await writeFile(path.join(root, "src", "widgetrenderer.js"), "export function render() { return 1; }\n");
  await writeFile(path.join(root, "src", "other.js"), "export const x = 1;\n");
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "specimen");
  return root;
}

function validate(root) {
  const r = spawnSync(
    process.execPath,
    [CLI, "validate", `--dir=${root}`, "--json", `--max-total-read-bytes=${AMPLE}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    assert.fail(`stdout was not JSON.\nstatus: ${r.status}\nstderr: ${r.stderr.slice(0, 2000)}`);
  }
  return { json, exit: r.status };
}

const failedRules = (json) => (json.results ?? []).filter((x) => x.status === "failed").map((x) => x.ruleId);

async function resultAt(level) {
  const root = await specimen(level);
  try {
    const { json, exit } = validate(root);
    const result = (json.results ?? []).find((x) => x.ruleId === RULE);
    assert.ok(result, `no result for ${RULE}`);
    const orphans = (json.findings ?? [])
      .filter((f) => f.rule === RULE)
      .flatMap((f) => f.evidence ?? []);
    assert.ok(
      orphans.includes("src/widgetrenderer.js"),
      "precondition: the specimen orphan must be established, or the level comparison is vacuous",
    );
    return { json, exit, result };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("at the catalogued optional level an orphan is silent: not a failure and not a warning", async () => {
  const { result, json } = await resultAt("optional");
  assert.notEqual(result.status, "failed", `optional orphan reported status "${result.status}"`);
  assert.notEqual(result.status, "warning", "an optional orphan was reported as a warning; Standard 18 R3 says silent");
  assert.equal(result.status, "passed");
  assert.ok(!failedRules(json).includes(RULE), "an optional orphan was counted as a failed rule");
});

test("the same specimen at required is a failure: escalation is not capped", async () => {
  const { result, json, exit } = await resultAt("required");
  assert.equal(result.status, "failed", `required orphan reported status "${result.status}"; a severity cap was added`);
  assert.equal(json.status, "NON_COMPLIANT");
  assert.equal(exit, 1, "a required-level failure must exit 1");
  // The specimen has unrelated failures of its own, so the run is NON_COMPLIANT at both levels and
  // the status alone cannot show the escalation. The failed-rule set can: it gains exactly this rule.
  const base = failedRules((await resultAt("optional")).json);
  assert.deepEqual(
    failedRules(json).filter((id) => !base.includes(id)),
    [RULE],
    "escalating the level did not add exactly this rule to the failed set",
  );
});

test("the level is the only variable: the finding is identical at both levels", async () => {
  const a = await resultAt("optional");
  const b = await resultAt("required");
  const msg = (r) => (r.json.findings ?? []).filter((f) => f.rule === RULE).map((f) => f.evidence);
  assert.deepEqual(msg(a), msg(b), "the evidence differed, so the level was not the only variable");
});

test("the catalogue does not claim the rule is unconditionally never a failure", () => {
  const catalog = JSON.parse(readFileSync(path.join(HERE, "..", "rules", "verification.json"), "utf8"));
  const rule = catalog.rules.find((r) => r.id === RULE);
  assert.ok(rule, `${RULE} left the catalog`);
  const note = rule.$assuranceNote;
  assert.equal(rule.level, "optional", "the wording below is only true of an optional catalogue level");
  assert.match(note, /never a failure at its catalogued level/i, "the assurance note must be scoped to the catalogued level");
  assert.doesNotMatch(
    note.replace(/never a failure at its catalogued level/i, ""),
    /never a failure/i,
    "an unconditional \"never a failure\" remains in the assurance note",
  );
});

/**
 * Tests for the binding between a catalog rule and the detector that evaluates it.
 *
 * `audit.business-state` was bound to `detectMissingAuditInfrastructure`, which consumed only the
 * presence of a test suite and a CI configuration. It never read a mutation, an actor, or an audit
 * call, so its verdicts tracked test/CI presence and were insensitive to whether the repository
 * audited anything. Two specific defective verdicts followed, and the fixtures below are those two
 * cases held apart from each other rather than a claim about repositories in general:
 *
 *   A  infrastructure, no audit path   -> passed   false assurance
 *   C  audit path, no infrastructure   -> failed   false violation
 *
 * A and B differ only in whether an audit path exists, and shared a verdict. B and C share their
 * source and differ only in infrastructure, and had opposite verdicts. That is the rule reporting on
 * a subject that is not its own — the assurance elevation Standard 24 R2 forbids, whose remedy
 * Standard 24 R4 supplies: with no analyzer, report not-evaluated rather than passing.
 *
 * The normative requirement is untouched. Standard 3 R1 still requires business-state changes to be
 * auditable, and the rule keeps its `remediation`. What was removed is a claim to have checked it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CLI = path.join(ROOT, "scripts", "standards.mjs");
const fixture = (name) => path.join(HERE, "fixtures", name);

function run(command, dir) {
  const r = spawnSync(process.execPath, [CLI, command, `--dir=${dir}`, "--json"], { encoding: "utf8" });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    return assert.fail(`stdout was not JSON.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  }
}

/**
 * The three fixtures share one domain — an orders service that changes order status, issues refunds
 * and, unaudited, grants permissions. Standard 3 R1's own test names exactly those as auditable, so
 * the rule plainly applies to all three and none of them is out of scope by the core rule.
 */
const FIXTURES = [
  ["audit-unaudited-with-infrastructure", "tests and CI, no audit path — used to pass falsely"],
  ["audit-audited-with-infrastructure", "tests and CI with a conformant audit path"],
  ["audit-audited-without-infrastructure", "a conformant audit path, no tests and no CI — used to fail falsely"],
];

for (const [name, description] of FIXTURES) {
  test(`audit.business-state is not evaluated: ${description}`, () => {
    const result = run("validate", fixture(name));
    const rule = result.results.find((r) => r.ruleId === "audit.business-state");
    assert.ok(rule, "audit.business-state is missing from the result set entirely");
    assert.equal(rule.status, "skipped", `${name}: expected skipped, got ${rule.status} — ${rule.message}`);
    assert.equal(rule.disposition, "not-evaluated");
    assert.deepEqual(rule.evidence, [], "a rule nothing evaluated must rest on no evidence");
  });

  test(`no finding is bound to audit.business-state: ${description}`, () => {
    const bound = (run("audit", fixture(name)).findings ?? []).filter((f) => f.rule === "audit.business-state");
    assert.deepEqual(bound, [], `${name} produced ${bound.length} finding(s) for a rule with no evaluator`);
  });
}

test("the audited and unaudited fixtures differ in exactly the thing under test", async () => {
  // Guards the guard. If a refactor collapsed the fixtures into each other the tests above would
  // still pass while testing one repository three times, and the discrimination would be fictional.
  const read = (f) => readFile(path.join(fixture(f[0]), f[1]), "utf8");
  const auditedOrders = await read(["audit-audited-with-infrastructure", "src/orders.js"]);
  const unauditedOrders = await read(["audit-unaudited-with-infrastructure", "src/orders.js"]);

  assert.match(auditedOrders, /recordAuditEvent/, "the audited fixture records no audit events");
  assert.doesNotMatch(unauditedOrders, /recordAuditEvent/, "the unaudited fixture records audit events");
  assert.equal(existsSync(path.join(fixture("audit-unaudited-with-infrastructure"), "src/audit.js")), false,
    "the unaudited fixture has an audit module");
  assert.ok(existsSync(path.join(fixture("audit-audited-with-infrastructure"), "src/audit.js")),
    "the audited fixture has no audit module");
  assert.match(unauditedOrders, /grantAdmin|refund/, "the unaudited fixture mutates no business state");

  // B and C share a source tree and differ only in test/CI infrastructure — the pair that used to
  // produce opposite verdicts.
  const withoutInfra = await read(["audit-audited-without-infrastructure", "src/orders.js"]);
  assert.equal(withoutInfra, auditedOrders, "B and C must differ only in infrastructure");
});

test("the normative auditing requirement and its remediation survive", async () => {
  // Withdrawing an evaluator withdraws a claim to have checked something. It must not quietly
  // withdraw the requirement, which is Standard 3 R1 and is not this change's to weaken.
  const catalog = JSON.parse(await readFile(path.join(ROOT, "rules", "audit.json"), "utf8"));
  const rules = Array.isArray(catalog) ? catalog : catalog.rules;
  const rule = rules.find((r) => r.id === "audit.business-state");
  assert.equal(rule.level, "required");
  assert.equal(rule.severity, "error");
  assert.equal(rule.remediation, "Record business mutations through an audit path that captures what changed.");
  assert.equal(rule.assurance, "none", "a rule with no evaluator claims no assurance (Standard 27 R3)");
});

/**
 * The falsifier.
 *
 * Removing the detector and removing the EVALUATED_RULES membership are one change, not two. Doing
 * only the first is worse than doing neither: the rule stays in the evaluated set with nothing able
 * to produce a finding for it, so it reports `passed / No violation was observed` on every
 * repository in the world, including the ones it used to catch. That is a silent false green, and it
 * is invisible to every other test in this file — all three fixtures would still be non-failing.
 *
 * The existing agreement test in compliance.test.mjs checks that every bound detector is declared.
 * This checks the other direction, which is the one that was open.
 */
test("every rule in EVALUATED_RULES has a detector that can produce a finding for it", async () => {
  const source = await readFile(path.join(ROOT, "scripts", "standards.mjs"), "utf8");
  const block = source.match(/const EVALUATED_RULES = \[([\s\S]*?)\];/);
  assert.ok(block, "EVALUATED_RULES not found");
  const declared = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const bound = new Set([...source.matchAll(/^\s*rule: "([^"]+)"/gm)].map((m) => m[1]));

  const unbacked = declared.filter((id) => !bound.has(id));
  assert.deepEqual(
    unbacked,
    [],
    `declared evaluated with no detector, so ${unbacked.join(", ")} would report passed on every ` +
      "repository without anything having looked (Standard 24 R4)",
  );
});

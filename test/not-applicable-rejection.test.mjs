/**
 * ST-47: a recorded rejection on a rule declared not-applicable is flagged by a policy-compliance
 * finding, and nothing else changes (owner decision "Finding only", 2026-10-14).
 *
 * Reviewer strings in this file are synthetic structural fixtures, not authenticated identities.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate } from "../scripts/compliance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STANDARDS = path.join(ROOT, "scripts/standards.mjs");
const RULE_ID = "testing.synthetic";
const RULE = {
  id: RULE_ID,
  level: "required",
  severity: "error",
  validationType: "manual-review",
  attestable: true,
  nonExemptible: false,
};
const NOT_APPLICABLE = { status: "not-applicable", reason: "none here" };
const rev = (over) => ({
  status: "approved",
  reviewedBy: "synthetic-reviewer",
  reviewedAt: "2026-08-01",
  evidence: "synthetic",
  ...over,
});
const REJECTION = rev({ id: "r1", status: "rejected" });
// Duplicate id: a malformed chain, in which the rejection is still written down.
const MALFORMED = [REJECTION, rev({ id: "r1", supersedes: "nope" })];

const verdict = ({ applicability, reviews }) =>
  evaluate({
    catalog: { rules: new Map([[RULE_ID, RULE]]), aliases: new Map() },
    policy: {
      ...(applicability ? { applicability: { [RULE_ID]: applicability } } : {}),
      ...(reviews ? { attestations: { [RULE_ID]: { reviews } } } : {}),
    },
    findings: [],
    evaluated: [],
    today: "2026-10-12",
    freshness: new Map(),
  });
const strip = ({ policyFindings, silencedRules, ...rest }) => rest;

for (const [name, reviews] of [
  ["well-formed history", [REJECTION]],
  ["malformed history", MALFORMED],
]) {
  test(`(a)(b) a rejection on a not-applicable rule (${name}) leaves the result and verdict unchanged and is flagged`, () => {
    const without = verdict({ applicability: NOT_APPLICABLE });
    const withRejection = verdict({ applicability: NOT_APPLICABLE, reviews });

    assert.deepEqual(strip(withRejection), strip(without), "the rejection changed the verdict or a result");
    const result = withRejection.results.find((r) => r.ruleId === RULE_ID);
    assert.equal(withRejection.status, "COMPLIANT");
    assert.equal(result.status, "skipped");
    assert.equal(result.disposition, "not-applicable");

    assert.equal(withRejection.policyFindings.length, 1);
    const [finding] = withRejection.policyFindings;
    assert.equal(finding.category, "policy-compliance");
    assert.equal(finding.ruleId, RULE_ID);
    assert.equal(finding.rule, null, "the finding must not be evidence for a rule");
    assert.match(finding.standardRef ?? "", /^standards\/20-exceptions\.md#r1--/);
    assert.match(finding.message, /declared not-applicable/);
    assert.match(finding.message, /rejection is recorded/);
    assert.match(finding.message, /"r1"/);
  });
}

test("(c) a not-applicable rule with no rejection, or only an approval, emits no finding", () => {
  assert.deepEqual(verdict({ applicability: NOT_APPLICABLE }).policyFindings, []);
  assert.deepEqual(
    verdict({ applicability: NOT_APPLICABLE, reviews: [rev({ id: "a1" })] }).policyFindings,
    [],
  );
});

test("(d) an applicable rule with a rejection behaves as before and emits no finding", () => {
  const v = verdict({ reviews: [REJECTION] });
  const result = v.results.find((r) => r.ruleId === RULE_ID);
  assert.equal(result.disposition, "attested-rejected");
  assert.equal(v.status, "NON_COMPLIANT");
  assert.deepEqual(v.policyFindings, []);

  const malformed = verdict({ reviews: MALFORMED });
  assert.equal(malformed.results.find((r) => r.ruleId === RULE_ID).disposition, "invalid-attestation");
  assert.deepEqual(malformed.policyFindings, []);
});

test("(b) the rejection identity is display-safe: control characters are escaped, never raw", () => {
  const chars = (...codes) => String.fromCharCode(...codes);
  const esc = chars(27);
  const hostile = "a" + chars(10) + "b" + chars(0x2028) + "c" + chars(0x202e) + "d" + chars(0x85);
  const v = verdict({
    applicability: NOT_APPLICABLE,
    reviews: [rev({ id: "r" + esc + "[31m1", status: "rejected", reviewedBy: hostile })],
  });
  const message = v.policyFindings[0].message;
  for (const cp of [27, 10, 13, 0x85, 0x2028, 0x2029, 0x202e]) {
    assert.ok(!message.includes(chars(cp)), `raw code point ${cp.toString(16)} reached the message`);
  }
  for (const escaped of ["u001b", "n", "u2028", "u202e", "u0085"]) {
    assert.ok(message.toLowerCase().includes("\\" + escaped), `${escaped} was not shown escaped: ${message}`);
  }
});

// --- The CLI: the finding reaches the JSON findings and the human report, and the verdict does not move.

function policyYaml({ withRejection }) {
  const lines = [
    'standardVersion: "2.0.0"',
    'project: "st47 fixture"',
    "applicability:",
    "  ai.propose-execute:",
    "    status: not-applicable",
    '    reason: "No AI agents in this fixture."',
    '    reviewedAt: "2026-10-01"',
    '    revisitWhen: "An agent is added."',
  ];
  if (withRejection) {
    lines.push(
      "attestations:",
      "  ai.propose-execute:",
      "    reviews:",
      '      - id: "p1"',
      "        status: rejected",
      `        reviewedBy: "synthetic${String.fromCharCode(27)}reviewer"`,
      '        reviewedAt: "2026-10-01"',
      '        evidence: "synthetic rejection"',
    );
  }
  return lines.join("\n") + "\n";
}

function validate(dir) {
  const r = spawnSync(process.execPath, [STANDARDS, "validate", dir, "--json"], { encoding: "utf8", windowsHide: true });
  return { exit: r.status, stdout: r.stdout, report: JSON.parse(r.stdout), stderr: r.stderr };
}
function validateText(dir) {
  return spawnSync(process.execPath, [STANDARDS, "validate", dir], { encoding: "utf8", windowsHide: true });
}

test("CLI: validate emits the policy-compliance finding and the verdict equals the run without the rejection", async () => {
  const withDir = await mkdtemp(path.join(os.tmpdir(), "st47-with-"));
  const withoutDir = await mkdtemp(path.join(os.tmpdir(), "st47-without-"));
  try {
    await writeFile(path.join(withDir, "project-policy.yml"), policyYaml({ withRejection: true }));
    await writeFile(path.join(withoutDir, "project-policy.yml"), policyYaml({ withRejection: false }));
    const a = validate(withDir);
    const b = validate(withoutDir);

    const pick = ({ status, score, summary, assurance, denominator, unestablishedProhibitions, results }) => ({
      status, score, summary, assurance, denominator, unestablishedProhibitions, results,
    });
    assert.deepEqual(pick(a.report), pick(b.report));
    assert.equal(a.exit, b.exit);
    const na = a.report.results.find((r) => r.ruleId === "ai.propose-execute");
    assert.equal(na.disposition, "not-applicable");

    const found = a.report.findings.filter((f) => f.category === "policy-compliance");
    assert.equal(found.length, 1);
    assert.equal(found[0].ruleId, "ai.propose-execute");
    assert.equal(found[0].rule, null);
    // Every finding carries a standardRef that resolves to a heading in the file it names.
    assert.equal(typeof found[0].standardRef, "string", "the policy finding carries no standardRef");
    const [refFile, refAnchor] = found[0].standardRef.split("#");
    const md = await readFile(path.join(ROOT, refFile), "utf8");
    const anchors = md
      .split(/\r?\n/)
      .filter((l) => /^#{2,3} /.test(l))
      .map((l) => l.replace(/^#+ /, "").toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-"));
    assert.ok(anchors.includes(refAnchor), `${found[0].standardRef} is not a heading`);
    assert.ok(!a.stdout.includes(String.fromCharCode(27)), "raw ESC reached the JSON output");
    assert.match(found[0].message, /\\u001b/);
    assert.deepEqual(b.report.findings.filter((f) => f.category === "policy-compliance"), []);

    const human = validateText(withDir);
    assert.match(human.stdout, /Policy findings/);
    assert.match(human.stdout, /ai\.propose-execute is declared not-applicable but a rejection is recorded/);
    assert.ok(!human.stdout.includes(String.fromCharCode(27)), "raw ESC reached the human report");
    assert.ok(!/Policy findings/.test(validateText(withoutDir).stdout));
  } finally {
    await rm(withDir, { recursive: true, force: true });
    await rm(withoutDir, { recursive: true, force: true });
  }
});

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

// --- Remediation must not advise rewriting append-only history (Codex P2, compliance.mjs remediation).

const remediationOf = (establishedRejections) =>
  evaluate({
    catalog: { rules: new Map([[RULE_ID, RULE]]), aliases: new Map() },
    policy: { applicability: { [RULE_ID]: NOT_APPLICABLE }, attestations: { [RULE_ID]: { reviews: [REJECTION] } } },
    findings: [],
    evaluated: [],
    today: "2026-10-12",
    freshness: new Map(),
    ...(establishedRejections === undefined ? {} : { establishedRejections }),
  }).policyFindings[0].remediation;

test("remediation: a rejection recorded at the trusted base is never advised to be deleted", () => {
  for (const established of [new Set([RULE_ID])]) {
    const text = remediationOf(established);
    assert.ok(!/remove the stray review record/.test(text), `advised deletion: ${text}`);
    assert.match(text, /without rewriting history/);
    assert.ok(!/not recorded at the trusted base/.test(text));
    assert.match(text, /ADR 0005/);
    assert.match(text, /immediate predecessor/);
    assert.ok(!/supersedes the rejection/.test(text));
  }
});

test("remediation: a rejection that is not at the trusted base may be removed, and says why", () => {
  const text = remediationOf(new Set(["some.other.rule"]));
  assert.match(text, /remove the stray review record/);
  assert.match(text, /not recorded at the trusted base/);
  assert.ok(!/append-only \(ADR/.test(text));
});

test("remediation: with the base unknown, neither deletion nor a base-enforced removal claim is made", () => {
  for (const unknown of [null, undefined]) {
    const text = remediationOf(unknown);
    assert.ok(!/remove the stray review record/.test(text), `advised deletion: ${text}`);
    assert.ok(!/stays effective/.test(text), `claimed base enforcement: ${text}`);
    assert.ok(!/is reported as review-history-append-only/.test(text));
    assert.ok(!/is recorded at the trusted base/.test(text));
    assert.match(text, /no trusted base could be read/);
    assert.match(text, /cannot be verified/);
    assert.match(text, /append-only once committed/);
    assert.match(text, /immediate predecessor/);
    assert.ok(!/supersedes\s+the rejection/.test(text));
  }
});

// Codex P2 (compliance.mjs lookup): an older rejection followed by an approval is still a rejection
// recorded on the rule, so it is found even when no base filters the evaluated document.
test("a rejection followed by an approval on a not-applicable rule is flagged with no trusted base", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "st47-superseded-"));
  try {
    const yaml =
      policyYaml({ withRejection: true }) +
      [
        '      - id: "p2"',
        "        status: approved",
        '        supersedes: "p1"',
        '        reviewedBy: "synthetic-reviewer"',
        '        reviewedAt: "2026-10-02"',
        '        evidence: "synthetic approval"',
        '        reviewerRole: "synthetic-role"',
        "        reviewedAgainst:",
        '          revision: "1111111111111111111111111111111111111111"',
        '          tree: "2222222222222222222222222222222222222222"',
        '          digest: "abcdef1234567890"',
        '          digestAlgorithm: "git-blob-set-sha256-v1"',
        "          source: git",
        "          paths:",
        '            - "synthetic.txt"',
      ].join(String.fromCharCode(10)) +
      String.fromCharCode(10);
    await writeFile(path.join(dir, "project-policy.yml"), yaml);
    const { report } = validate(dir);
    const stray = report.findings.find((f) => f.id === "rejection-on-not-applicable-rule");
    assert.ok(stray, "an older rejection followed by an approval vanished from the lookup");
    assert.match(stray.message, /"p1"/);
    assert.ok(!/remove the stray review record/.test(stray.remediation));
    assert.match(stray.remediation, /no trusted base could be read/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// CLI: the base is read from git, so the same rejection gets the right advice in each position.
function git(dir, ...args) {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", "-c", "commit.gpgsign=false", ...args], {
    cwd: dir,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}
async function repoWith({ committedRejection, headRejection }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "st47-git-"));
  git(dir, "init", "-q", "-b", "main");
  await writeFile(path.join(dir, "project-policy.yml"), policyYaml({ withRejection: committedRejection }));
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "base");
  git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  await writeFile(path.join(dir, "project-policy.yml"), policyYaml({ withRejection: headRejection }));
  return dir;
}
const strayRemediation = (dir) =>
  validate(dir).report.findings.find((f) => f.id === "rejection-on-not-applicable-rule")?.remediation;

test("CLI: a rejection committed at the merge base gets the append-only advice, and deleting it does not clear the finding", async () => {
  const kept = await repoWith({ committedRejection: true, headRejection: true });
  const deleted = await repoWith({ committedRejection: true, headRejection: false });
  try {
    assert.match(strayRemediation(kept), /without rewriting history/);
    assert.ok(!/remove the stray review record/.test(strayRemediation(kept)));
    // The advice the old text gave: deleting it. The finding stays and a history violation is added.
    const after = validate(deleted).report;
    const stray = after.findings.find((f) => f.id === "rejection-on-not-applicable-rule");
    assert.ok(stray, "deleting an established rejection cleared the finding");
    assert.equal(after.findings.find((f) => f.id === "review-history-append-only")?.severity, "error");
    assert.match(stray.remediation, /without rewriting history/);
    assert.ok(!/not recorded at the trusted base/.test(stray.remediation));
  } finally {
    await rm(kept, { recursive: true, force: true });
    await rm(deleted, { recursive: true, force: true });
  }
});

test("CLI: an established rejection edited into a different one names the base record, not the replacement", async () => {
  const dir = await repoWith({ committedRejection: true, headRejection: true });
  try {
    const file = path.join(dir, "project-policy.yml");
    const edited = (await readFile(file, "utf8")).replace('id: "p1"', 'id: "p9"');
    assert.ok(edited.includes('"p9"'));
    await writeFile(file, edited);
    const stray = validate(dir).report.findings.find((f) => f.id === "rejection-on-not-applicable-rule");
    assert.ok(stray);
    assert.match(stray.message, /"p1"/);
    assert.ok(!/p9/.test(stray.message), stray.message);
    assert.match(stray.remediation, /without rewriting history/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

const APPROVAL_LINES = [
  '      - id: "p2"',
  "        status: approved",
  '        supersedes: "p1"',
  '        reviewedBy: "synthetic-reviewer"',
  '        reviewedAt: "2026-10-02"',
  '        evidence: "synthetic approval"',
  '        reviewerRole: "synthetic-role"',
  "        reviewedAgainst:",
  '          revision: "1111111111111111111111111111111111111111"',
  '          tree: "2222222222222222222222222222222222222222"',
  '          digest: "abcdef1234567890"',
  '          digestAlgorithm: "git-blob-set-sha256-v1"',
  "          source: git",
  "          paths:",
  '            - "synthetic.txt"',
];
test("CLI: a base chain of rejection then approval whose rejection the head removes or edits still names the base rejection", async () => {
  for (const mutate of [
    (y) => y.replace('id: "p1"', 'id: "p9"'),
    (y) => {
      const lines = y.split(String.fromCharCode(10));
      const i = lines.findIndex((l) => l.includes('id: "p1"'));
      return lines.filter((_, k) => k < i || k >= i + 5).join(String.fromCharCode(10));
    },
  ]) {
    const nl = String.fromCharCode(10);
    const full = policyYaml({ withRejection: true }) + APPROVAL_LINES.join(nl) + nl;
    const dir = await mkdtemp(path.join(os.tmpdir(), "st47-baseapproved-"));
    try {
      git(dir, "init", "-q", "-b", "main");
      await writeFile(path.join(dir, "project-policy.yml"), full);
      git(dir, "add", ".");
      git(dir, "commit", "-q", "-m", "base");
      git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
      git(dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
      await writeFile(path.join(dir, "project-policy.yml"), mutate(full));
      const { report } = validate(dir);
      assert.equal(report.findings.find((f) => f.id === "review-history-append-only")?.severity, "error");
      const stray = report.findings.find((f) => f.id === "rejection-on-not-applicable-rule");
      assert.ok(stray, "base rejection vanished from the lookup");
      assert.match(stray.message, /"p1"/);
      assert.ok(!/p9/.test(stray.message));
      assert.match(stray.remediation, /without rewriting history/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("CLI: an unverified comparison with a readable base still names a removed base rejection", async () => {
  const nl = String.fromCharCode(10);
  const withRejection = policyYaml({ withRejection: true });
  // Another rule's base record is null, so the append-only comparison cannot run (unverified).
  // It sorts first in the mapping, so the comparison stops there before it reaches the removal.
  const base = withRejection.replace("attestations:" + nl, "attestations:" + nl + "  testing.no-fabricated-results: null" + nl);
  const head = policyYaml({ withRejection: false }) + "attestations:" + nl + "  testing.no-fabricated-results:" + nl +
    ["    reviews:", '      - id: "q1"', "        status: rejected", '        reviewedBy: "synthetic-reviewer"', '        reviewedAt: "2026-10-01"', '        evidence: "synthetic"'].join(nl) + nl;
  const dir = await mkdtemp(path.join(os.tmpdir(), "st47-unverified-"));
  try {
    git(dir, "init", "-q", "-b", "main");
    await writeFile(path.join(dir, "project-policy.yml"), base);
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "base");
    git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    await writeFile(path.join(dir, "project-policy.yml"), head);
    const { report } = validate(dir);
    const history = report.findings.find((f) => f.id === "review-history-append-only");
    assert.ok(history && history.severity !== "error", "fixture did not produce an unverified comparison: " + JSON.stringify(history));
    const stray = report.findings.find((f) => f.id === "rejection-on-not-applicable-rule");
    assert.ok(stray, "a removed base rejection was not named when the comparison was unverified");
    assert.match(stray.message, /"p1"/);
    assert.match(stray.remediation, /without rewriting history/);
    assert.ok(!/remove the stray review record/.test(stray.remediation));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("CLI: a head that deletes the whole attestations section names a base rejection (finding only) when the comparison is unverified", async () => {
  const nl = String.fromCharCode(10);
  const base = policyYaml({ withRejection: true }).replace("attestations:" + nl, "attestations:" + nl + "  testing.no-fabricated-results: null" + nl);
  const head = policyYaml({ withRejection: false });
  const dir = await mkdtemp(path.join(os.tmpdir(), "st47-emptyhead-"));
  try {
    git(dir, "init", "-q", "-b", "main");
    await writeFile(path.join(dir, "project-policy.yml"), base);
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "base");
    git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    git(dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
    await writeFile(path.join(dir, "project-policy.yml"), head);
    const { report } = validate(dir);
    const history = report.findings.find((f) => f.id === "review-history-append-only");
    assert.ok(history && /NOT_EVALUATED/.test(history.message), "the unverified-history warning was suppressed");
    assert.notEqual(history.severity, "error");
    const stray = report.findings.find((f) => f.id === "rejection-on-not-applicable-rule");
    assert.ok(stray, "the removed base rejection was not named");
    assert.match(stray.message, /"p1"/);
    assert.match(stray.remediation, /when the comparison cannot run/);
    assert.match(history.message, /1 attestation\(s\)/, "the disregarded count ignored the base records: " + history.message);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Owner decision "Finding only" (ST-47): the base histories feed the finding lookup, never the verdict.
test("CLI: an APPLICABLE rule's verdict is unaffected by a base rejection when the head deletes the attestations section (unverified comparison)", async () => {
  const nl = String.fromCharCode(10);
  const applicable = (y) => {
    const lines = y.split(nl);
    const i = lines.indexOf("applicability:");
    return [...lines.slice(0, i), ...lines.slice(i + 6)].join(nl);
  };
  const withNull = (y) => y.replace("attestations:" + nl, "attestations:" + nl + "  testing.no-fabricated-results: null" + nl);
  const noRejectionBase = applicable(policyYaml({ withRejection: false })) + "attestations:" + nl + "  testing.no-fabricated-results: null" + nl;
  const rejectionBase = withNull(applicable(policyYaml({ withRejection: true })));
  const head = applicable(policyYaml({ withRejection: false }));
  const run = async (base) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "st47-applicable-"));
    try {
      git(dir, "init", "-q", "-b", "main");
      await writeFile(path.join(dir, "project-policy.yml"), base);
      git(dir, "add", ".");
      git(dir, "commit", "-q", "-m", "base");
      git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
      git(dir, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
      await writeFile(path.join(dir, "project-policy.yml"), head);
      const r = validate(dir);
      const { status, score, summary, denominator, results } = r.report;
      return { exit: r.exit, compliance: JSON.stringify({ status, score, summary, denominator, results }) };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  const without = await run(noRejectionBase);
  const withRej = await run(rejectionBase);
  assert.ok(JSON.parse(withRej.compliance).results?.length > 0, "fixture produced no results to compare");
  assert.equal(withRej.exit, without.exit);
  assert.equal(withRej.compliance, without.compliance, "a base rejection changed the verdict of an applicable rule");
});

test("CLI: a rejection added only after the merge base may be removed", async () => {
  const added = await repoWith({ committedRejection: false, headRejection: true });
  try {
    const text = strayRemediation(added);
    assert.match(text, /remove the stray review record/);
    assert.match(text, /not recorded at the trusted base/);
  } finally {
    await rm(added, { recursive: true, force: true });
  }
});

test("CLI: with no trusted base the advice says removal cannot be verified", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "st47-nobase-"));
  try {
    await writeFile(path.join(dir, "project-policy.yml"), policyYaml({ withRejection: true }));
    const text = strayRemediation(dir);
    assert.ok(!/remove the stray review record/.test(text));
    assert.ok(!/stays effective/.test(text));
    assert.match(text, /cannot be verified/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

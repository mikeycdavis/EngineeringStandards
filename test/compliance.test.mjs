import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, resolve, assertBindings, coverage, CatalogError } from "../scripts/catalog.mjs";
import { evaluate, envelope, STATUS } from "../scripts/compliance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TODAY = "2026-08-08";

const catalog = await loadCatalog();
const ALL = [...catalog.rules.keys()];

const policy = (over = {}) => ({ standardVersion: "1.0.0", project: "Fixture", rules: {}, ...over });
const run = (opts) =>
  evaluate({ catalog, findings: [], evaluated: ALL, today: TODAY, ...opts });

// --- The catalog ---------------------------------------------------------------------------------

test("the catalog loads and every rule id is canonical", () => {
  assert.ok(catalog.rules.size >= 20, "catalog is suspiciously small");
  for (const id of catalog.rules.keys()) {
    assert.match(id, /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/, `non-canonical id: ${id}`);
  }
});

test("every legacy alias resolves to a canonical rule and is never itself a rule", () => {
  for (const [alias, id] of catalog.aliases) {
    assert.ok(catalog.rules.has(id), `alias ${alias} points at unknown rule ${id}`);
    assert.ok(!catalog.rules.has(alias), `${alias} is both an alias and a rule`);
    assert.equal(resolve(catalog, alias).id, id);
  }
});

test("lifecycle fields are present on every rule, even when empty", () => {
  // Adding them later means every existing rule silently lacks them, and consumers treat their
  // absence as meaningful (Standard 27 R2).
  for (const rule of catalog.rules.values()) {
    for (const field of ["deprecatedIn", "supersededBy", "removedIn", "aliases", "introducedIn"]) {
      assert.ok(field in rule, `${rule.id} is missing ${field}`);
    }
  }
});

test("a rule claiming full assurance is not a code-analysis or manual-review rule", () => {
  // Standard 24 R2: assurance may never exceed what the validation type can establish.
  for (const rule of catalog.rules.values()) {
    if (rule.assurance === "full") {
      assert.notEqual(rule.validationType, "manual-review", `${rule.id} claims full assurance from human judgement`);
      assert.notEqual(rule.validationType, "code-analysis", `${rule.id} claims full assurance from static analysis`);
    }
  }
});

test("every catalog rule names a standard document that exists", async () => {
  const docs = await readdir(path.join(ROOT, "standards"));
  for (const rule of catalog.rules.values()) {
    const prefix = String(rule.standard).padStart(2, "0") + "-";
    assert.ok(docs.some((d) => d.startsWith(prefix)), `${rule.id} names missing standard ${rule.standard}`);
  }
});

// --- The binding between evaluator and catalog ---------------------------------------------------

test("every rule the audit binds a finding to exists in the catalog", async () => {
  // The mechanical guard on the architectural rule: an evaluator may not grow its own vocabulary.
  const source = await readFile(path.join(ROOT, "scripts/standards.mjs"), "utf8");
  const bound = [...source.matchAll(/^\s*rule: "([^"]+)"/gm)].map((m) => m[1]);
  assert.ok(bound.length >= 10, "found suspiciously few rule bindings");
  assert.doesNotThrow(() => assertBindings(catalog, bound));
});

test("the evaluated-rules set and the bound detectors agree", async () => {
  const source = await readFile(path.join(ROOT, "scripts/standards.mjs"), "utf8");
  const bound = new Set([...source.matchAll(/^\s*rule: "([^"]+)"/gm)].map((m) => m[1]));
  const block = source.match(/const EVALUATED_RULES = \[([\s\S]*?)\];/);
  assert.ok(block, "EVALUATED_RULES not found");
  const declared = new Set([...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));

  for (const id of bound) {
    assert.ok(declared.has(id), `${id} has a detector but is not in EVALUATED_RULES — it would report as not-evaluated`);
  }
  for (const id of declared) {
    assert.ok(catalog.rules.has(id), `EVALUATED_RULES names unknown rule ${id}`);
  }
});

test("an unknown rule id is rejected rather than silently ignored", () => {
  assert.throws(() => assertBindings(catalog, ["planning.made-up-rule"]), CatalogError);
});

// --- Verdict states -------------------------------------------------------------------------------

test("no policy means NOT_EVALUATED, never NON_COMPLIANT", () => {
  // Could-not-evaluate and checked-and-failed are different facts (Standard 30 R1).
  const verdict = run({ policy: null });
  assert.equal(verdict.status, STATUS.NOT_EVALUATED);
});

test("a clean project with a policy is COMPLIANT", () => {
  assert.equal(run({ policy: policy() }).status, STATUS.COMPLIANT);
});

test("one failed required rule is NON_COMPLIANT even at a high score", () => {
  // Standard 30 R2, the central rule of the scoring model.
  const findings = [{ rule: "architecture.project-manifest", message: "missing", evidence: ["PROJECT.md"] }];
  const verdict = run({ policy: policy(), findings });
  assert.equal(verdict.status, STATUS.NON_COMPLIANT);
  assert.ok(verdict.score >= 90, `expected a high score alongside the failure, got ${verdict.score}`);
});

test("a failure covered by a live exception is COMPLIANT_WITH_EXCEPTIONS", () => {
  const verdict = run({
    policy: policy({
      exceptions: [
        { rule: "architecture.project-manifest", reason: "r", approvedBy: "owner", approvedAt: "2026-01-01", expires: "2027-01-01" },
      ],
    }),
    findings: [{ rule: "architecture.project-manifest", message: "missing", evidence: [] }],
  });
  assert.equal(verdict.status, STATUS.COMPLIANT_WITH_EXCEPTIONS);
});

test("an expired exception is a failure, not a resolution", () => {
  const verdict = run({
    policy: policy({
      exceptions: [
        { rule: "architecture.project-manifest", reason: "r", approvedBy: "owner", approvedAt: "2020-01-01", expires: "2021-01-01" },
      ],
    }),
    findings: [{ rule: "architecture.project-manifest", message: "missing", evidence: [] }],
  });
  assert.equal(verdict.status, STATUS.NON_COMPLIANT);
  assert.ok(verdict.results.some((r) => r.disposition === "expired-exception"));
});

test("a not-applicable rule is skipped and stays visible", () => {
  const verdict = run({
    policy: policy({
      applicability: { "audit.business-state": { status: "not-applicable", reason: "no state" } },
    }),
  });
  const result = verdict.results.find((r) => r.ruleId === "audit.business-state");
  assert.equal(result.status, "skipped");
  assert.equal(result.disposition, "not-applicable");
  assert.equal(result.message, "no state");
});

// --- The properties that stop false green ----------------------------------------------------------

test("an unevaluated rule is skipped, never passed", () => {
  // Unknown is not a pass. This is the loophole Standard 38 R3 closes.
  const verdict = evaluate({ catalog, policy: policy(), findings: [], evaluated: [], today: TODAY });
  assert.equal(verdict.summary.passed, 0, "rules nothing examined were reported as passing");
  assert.equal(verdict.summary.skipped, catalog.rules.size);
  for (const r of verdict.results) assert.equal(r.disposition, "not-evaluated");
});

test("skipped rules never inflate the score's denominator or its numerator", () => {
  const full = run({ policy: policy() });
  const partial = evaluate({
    catalog,
    policy: policy(),
    findings: [],
    evaluated: ["architecture.adr"],
    today: TODAY,
  });
  assert.equal(partial.score, 100, "one passing rule out of one evaluated is 100%");
  assert.equal(partial.denominator.scored, 1, "skipped rules leaked into the denominator");
  assert.ok(full.denominator.scored > partial.denominator.scored);
});

test("the assurance breakdown accounts for every applicable rule", () => {
  // Standard 30 R4: a breakdown that does not sum invites arithmetic producing a wrong answer
  // confidently.
  const verdict = run({
    policy: policy({ applicability: { "audit.actor-attribution": { status: "not-applicable", reason: "x" } } }),
  });
  const { automated, manualReview, notEvaluated } = verdict.assurance;
  assert.equal(automated + manualReview + notEvaluated, verdict.denominator.applicable);
  assert.equal(verdict.denominator.applicable, catalog.rules.size - 1);
});

test("a skipped rule never claims assurance", () => {
  const verdict = evaluate({ catalog, policy: policy(), findings: [], evaluated: [], today: TODAY });
  for (const r of verdict.results) assert.equal(r.assurance, "none");
});

test("no result claims assurance its rule does not carry", () => {
  const verdict = run({ policy: policy() });
  for (const r of verdict.results) {
    if (r.status === "skipped" || r.disposition === "expired-exception") continue;
    assert.equal(r.assurance, catalog.rules.get(r.ruleId).assurance);
  }
});

// --- The Standard 25 envelope -----------------------------------------------------------------------

test("the envelope carries every field Standard 31 R2 guarantees", () => {
  const report = envelope({
    verdict: run({ policy: policy() }),
    project: "Fixture",
    standardVersion: "1.0.0",
    auditedAt: "2026-08-08T00:00:00.000Z",
  });
  for (const field of ["schemaVersion", "standardVersion", "project", "status", "score", "summary", "assurance", "results"]) {
    assert.ok(field in report, `envelope is missing ${field}`);
  }
  for (const field of ["passed", "failed", "warnings", "skipped"]) {
    assert.ok(field in report.summary, `summary is missing ${field}`);
  }
  const sample = report.results[0];
  for (const field of ["ruleId", "status", "severity", "validationType", "message", "evidence", "files", "remediation"]) {
    assert.ok(field in sample, `result is missing ${field}`);
  }
});

test("every result carries a ruleId, including passes and skips", () => {
  // Standard 31 R4: a consumer cannot compute "which rules stopped failing" from failures alone.
  for (const r of run({ policy: policy() }).results) {
    assert.ok(r.ruleId, "a result has no ruleId");
    assert.ok(catalog.rules.has(r.ruleId));
  }
});

test("status comes from the closed enumeration", () => {
  const allowed = new Set(Object.values(STATUS));
  for (const p of [null, policy(), policy({ exceptions: [] })]) {
    assert.ok(allowed.has(run({ policy: p }).status));
  }
});

// --- Non-exemptible rules (Standard 20 R4) --------------------------------------------------------

test("the catalog declares at least one non-exemptible rule", () => {
  const rules = [...catalog.rules.values()].filter((r) => r.nonExemptible);
  assert.ok(rules.length > 0, "nothing is non-exemptible, so the enforcement below proves nothing");
  assert.ok(rules.some((r) => r.id === "security.no-secrets-in-artifacts"));
});

test("an exception against a non-exemptible rule is rejected, not applied", () => {
  // A mechanism a project can switch off is not a prohibition. The waiver must fail deterministically
  // whether or not the underlying rule is currently violated.
  const verdict = run({
    policy: policy({
      exceptions: [
        {
          rule: "security.no-secrets-in-artifacts",
          reason: "legacy bundle",
          approvedBy: "owner",
          approvedAt: "2026-01-01",
          expires: "2027-01-01",
        },
      ],
    }),
    findings: [{ rule: "security.no-secrets-in-artifacts", message: "token found", evidence: ["config.json"] }],
  });
  assert.equal(verdict.status, STATUS.NON_COMPLIANT, "a non-exemptible rule was waived");
  const rejected = verdict.results.find((r) => r.disposition === "rejected-exception");
  assert.ok(rejected, "no rejected-exception result was produced");
  assert.equal(rejected.ruleId, "security.no-secrets-in-artifacts");
  assert.equal(
    verdict.results.filter((r) => r.disposition === "excepted").length,
    0,
    "the waiver was applied despite being rejected",
  );
});

test("a non-exemptible waiver is rejected even when it has also expired", () => {
  // Order matters: rejection is checked first, because an invalid waiver is invalid whether or not
  // it has lapsed. Reporting it only as expired would imply renewing it would work.
  const verdict = run({
    policy: policy({
      exceptions: [
        { rule: "security.no-secrets-in-artifacts", reason: "x", approvedBy: "owner", approvedAt: "2020-01-01", expires: "2021-01-01" },
      ],
    }),
  });
  assert.ok(verdict.results.some((r) => r.disposition === "rejected-exception"));
  assert.ok(!verdict.results.some((r) => r.disposition === "expired-exception"));
});

test("an exemptible rule is still waivable — the check is not blanket", () => {
  const verdict = run({
    policy: policy({
      exceptions: [
        { rule: "architecture.adr", reason: "x", approvedBy: "owner", approvedAt: "2026-01-01", expires: "2027-01-01" },
      ],
    }),
    findings: [{ rule: "architecture.adr", message: "no adr dir", evidence: [] }],
  });
  assert.equal(verdict.status, STATUS.COMPLIANT_WITH_EXCEPTIONS);
});

// --- Framework coverage ---------------------------------------------------------------------------

test("coverage counts rules and standards without touching the verdict", () => {
  const c = coverage(catalog, { evaluated: ALL, totalStandards: 44 });
  assert.equal(c.cataloguedRules, catalog.rules.size);
  assert.equal(c.standards, 44);
  assert.ok(c.standardsWithRules > 0 && c.standardsWithRules <= 44);
  assert.ok(c.fullyMachineRepresentedStandards <= c.standardsWithRules);
});

test("coverage is absent from the verdict and present in the envelope", () => {
  // Framework maturity must never combine with compliance into one number: a coverage improvement
  // would otherwise read as a compliance improvement.
  const verdict = run({ policy: policy() });
  assert.ok(!("frameworkCoverage" in verdict), "coverage leaked into the verdict");
  assert.ok(!("coverage" in verdict.summary));
  const report = envelope({ verdict, frameworkCoverage: coverage(catalog, { totalStandards: 44 }) });
  assert.ok(report.frameworkCoverage);
  assert.equal(report.score, verdict.score, "coverage altered the score");
});

test("fully-machine-represented is strict about assurance and evaluation", () => {
  // A standard whose rules are catalogued but unevaluated is represented on paper, not in practice.
  const none = coverage(catalog, { evaluated: [], totalStandards: 44 });
  assert.equal(none.fullyMachineRepresentedStandards, 0);
  assert.equal(none.evaluatedRules, 0);

  // And a rule with assurance "none" cannot make its standard count, even when fully evaluated.
  const noneAssurance = [...catalog.rules.values()].filter((r) => r.assurance === "none");
  assert.ok(noneAssurance.length > 0, "no assurance-none rule exists, so this exclusion is untested");

  const tainted = new Set(noneAssurance.map((r) => r.standard));
  const all = coverage(catalog, { evaluated: ALL, totalStandards: 44 });

  // With everything evaluated, the only standards that can fail to count are the tainted ones — so
  // the represented count is exactly the standards that have rules, minus those.
  assert.equal(
    all.fullyMachineRepresentedStandards,
    all.standardsWithRules - tainted.size,
    "a standard containing an assurance-none rule was counted as fully machine-represented",
  );
  assert.ok(tainted.size > 0);
});

// --- Attestations (ADR 0005) ------------------------------------------------------------------

const attest = (over = {}) => ({
  status: "approved",
  reviewedBy: "project-owner",
  reviewedAt: "2026-08-09",
  evidence: "Reviewed the implementation and its tests.",
  ...over,
});

test("the catalog marks manual-review rules attestable and others not", () => {
  for (const rule of catalog.rules.values()) {
    if (rule.validationType === "manual-review") assert.equal(rule.attestable, true, rule.id);
    else assert.equal(rule.attestable, false, `${rule.id} is attestable but is not manual-review`);
  }
});

test("an attested manual-review rule passes, and counts as manual review", () => {
  const verdict = run({ policy: policy({ attestations: { "ai.propose-execute": attest() } }) });
  const result = verdict.results.find((r) => r.ruleId === "ai.propose-execute");
  assert.equal(result.status, "passed");
  assert.equal(result.disposition, "attested");
  assert.equal(result.validationType, "manual-review");
  assert.ok(verdict.assurance.manualReview >= 1, "an attested rule must count as manual review");
});

test("an attested rule does NOT make the project COMPLIANT_WITH_EXCEPTIONS", () => {
  // Nothing was waived. Collapsing attestation into exception semantics would make every
  // human-verified rule look like a waived one (ADR 0005).
  const verdict = run({ policy: policy({ attestations: { "ai.propose-execute": attest() } }) });
  assert.equal(verdict.status, STATUS.COMPLIANT);
});

test("an attestation cannot override an automated failure", () => {
  // Evidence outranks assertion (Standard 38 R4). This is also why an attestation cannot bypass a
  // nonExemptible rule — not a separate prohibition, the automated failure simply survives.
  // ai.destructive-approval is both manual-review (so genuinely attestable) and nonExemptible, so
  // this case covers both prohibitions at once.
  const rule = catalog.rules.get("ai.destructive-approval");
  assert.equal(rule.attestable, true);
  assert.equal(rule.nonExemptible, true);

  const verdict = run({
    policy: policy({ attestations: { "ai.destructive-approval": attest() } }),
    findings: [{ rule: "ai.destructive-approval", message: "delete runs unguarded", evidence: ["cli.js"] }],
  });
  assert.equal(verdict.status, STATUS.NON_COMPLIANT);
  assert.ok(
    verdict.results.some((r) => r.disposition === "contradicted-attestation"),
    "an attestation cleared an automated failure on a nonExemptible rule",
  );
});

test("a rule the catalog does not mark attestable cannot be attested", () => {
  const verdict = run({ policy: policy({ attestations: { "architecture.adr": attest() } }) });
  assert.ok(
    verdict.results.some((r) => r.disposition === "invalid-attestation"),
    "a structural rule was satisfied by assertion",
  );
  assert.equal(verdict.status, STATUS.NON_COMPLIANT);
});

test("a rejected attestation is a failure, not silence", () => {
  const verdict = run({
    policy: policy({ attestations: { "ai.propose-execute": attest({ status: "rejected" }) } }),
  });
  assert.equal(verdict.status, STATUS.NON_COMPLIANT);
  assert.ok(verdict.results.some((r) => r.disposition === "attested-rejected"));
});

test("an expired attestation returns the rule to not-evaluated, not to failure", () => {
  const verdict = run({
    policy: policy({ attestations: { "ai.propose-execute": attest({ expires: "2021-01-01" }) } }),
  });
  const result = verdict.results.find((r) => r.ruleId === "ai.propose-execute");
  assert.equal(result.status, "skipped");
  assert.equal(result.disposition, "not-evaluated");
  assert.equal(verdict.status, STATUS.COMPLIANT, "a lapsed review is unreviewed, not known-bad");
});

test("a stale attestation returns the rule to not-evaluated", () => {
  // What was reviewed is not what is there now, so the review establishes nothing.
  const verdict = evaluate({
    catalog,
    policy: policy({
      attestations: {
        "ai.propose-execute": attest({
          reviewedAgainst: { paths: ["scripts/init.mjs"], digest: "0000000000000000" },
        }),
      },
    }),
    findings: [],
    evaluated: ALL,
    today: TODAY,
    digests: new Map([["ai.propose-execute", "ffffffffffffffff"]]),
  });
  assert.equal(
    verdict.results.find((r) => r.ruleId === "ai.propose-execute").disposition,
    "not-evaluated",
  );
});

test("a matching digest keeps the attestation valid — the known-negative for staleness", () => {
  const verdict = evaluate({
    catalog,
    policy: policy({
      attestations: {
        "ai.propose-execute": attest({
          reviewedAgainst: { paths: ["scripts/init.mjs"], digest: "abcdef1234567890" },
        }),
      },
    }),
    findings: [],
    evaluated: ALL,
    today: TODAY,
    digests: new Map([["ai.propose-execute", "abcdef1234567890"]]),
  });
  assert.equal(verdict.results.find((r) => r.ruleId === "ai.propose-execute").disposition, "attested");
});

test("this repository's own attestation is live, not stale", async () => {
  // The dogfooding case: ai.destructive-approval moved not-applicable -> not-evaluated -> attested.
  const { parseYaml } = await import("../scripts/yaml.mjs");
  const doc = parseYaml(await readFile(path.join(ROOT, "project-policy.yml"), "utf8"));
  const attestation = doc.attestations?.["ai.destructive-approval"];
  assert.ok(attestation, "the dogfooded attestation is missing");
  assert.equal(attestation.status, "approved");
  assert.ok(attestation.reviewedAgainst?.digest, "no digest recorded — staleness would be undetectable");
  assert.ok(attestation.reviewedAgainst.paths.includes("scripts/init.mjs"));
});

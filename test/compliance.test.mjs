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

/**
 * Every forbidden rule a human evaluates, declared not-applicable.
 *
 * Standard 45 R6 caps the verdict at NOT_EVALUATED when an applicable forbidden rule has been
 * neither evaluated, attested, nor declared not-applicable — so from 2.0.0 a fixture that declares
 * nothing is not a "clean project", it is a project over which nobody looked for 19 prohibitions.
 * These declarations are what make the fixture honest, and the tests that specifically exercise the
 * cap remove the one they are testing rather than the helper omitting them for everyone.
 *
 * DO NOT COPY THIS BLOCK INTO A REAL POLICY. It is truthful only because this fixture is a bare
 * policy object with `rules: {}`, no source tree, and no findings — a project with no contents has
 * no subject for any of these rules. One declaration is fixture-only in a stronger sense:
 *
 *   `meta.standards-not-weakened` — its subject is the project's OWN standards and tests. Every
 *   real project under this framework has those by definition, so `not-applicable` against it is
 *   false for any real adopter, and writing it would be exactly the self-exemption
 *   Standard 34 R3 abolishes. This fixture gets away with it only by having no standards and no
 *   tests of its own to weaken.
 *
 * The repository's own policy does not make this declaration — `meta.standards-not-weakened` sits
 * at `level: forbidden` with no applicability entry, and is resolved by owner attestation instead.
 * Neither does `templates/project-policy.yml`, which an adopter copies. This shape lives here, in a
 * test fixture, and nowhere else.
 */
const establishedProhibitions = () =>
  Object.fromEntries(
    [...catalog.rules.values()]
      .filter((r) => r.level === "forbidden" && r.validationType === "manual-review")
      .map((r) => [
        r.id,
        {
          status: "not-applicable",
          reason: "Fixture project; the rule has no subject here.",
          reviewedAt: TODAY,
          revisitWhen: "The fixture gains the capability this rule governs.",
        },
      ]),
  );

const policy = (over = {}) => ({
  standardVersion: "1.0.0",
  project: "Fixture",
  rules: {},
  ...over,
  applicability: { ...establishedProhibitions(), ...(over.applicability ?? {}) },
});

/** No prohibitions established at all — for tests asserting a property over every catalog rule. */
const bare = (over = {}) => ({ standardVersion: "1.0.0", project: "Fixture", rules: {}, ...over });

/** The same fixture with one prohibition left unestablished, for the tests that exercise the cap. */
const unestablishing = (ruleId, over = {}) => {
  const p = policy(over);
  delete p.applicability[ruleId];
  return p;
};
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
  // `bare` rather than `policy`: this asserts a property of EVERY rule, so the fixture must not
  // pre-declare any of them not-applicable.
  const verdict = evaluate({ catalog, policy: bare(), findings: [], evaluated: [], today: TODAY });
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
    policy: bare({ applicability: { "audit.actor-attribution": { status: "not-applicable", reason: "x" } } }),
  });
  const { automated, manualReview, notEvaluated } = verdict.assurance;
  assert.equal(automated + manualReview + notEvaluated, verdict.denominator.applicable);
  assert.equal(verdict.denominator.applicable, catalog.rules.size - 1);
});

test("a skipped rule never claims assurance", () => {
  const verdict = evaluate({ catalog, policy: bare(), findings: [], evaluated: [], today: TODAY });
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

// --- Standard 45 R6: an unestablished prohibition blocks COMPLIANT -------------------------------
//
// A `forbidden` rule is satisfied by the ABSENCE of a violation, so a rule nothing examined has
// established nothing. Reporting COMPLIANT over it is a false green at the verdict level. Every row
// of the standard's semantics table has a test here, and the two boundary tests below are the ones
// that matter most: the cap must not intercept the exception machinery, which has been looked at.

const FORBIDDEN = "errors.no-swallowed-exceptions";   // forbidden, code-analysis, exemptible
const FORBIDDEN_MANUAL = "data.no-prod-data-in-dev";  // forbidden, manual-review, exemptible
const FORBIDDEN_LOCKED = "data.no-silent-discard";    // forbidden, manual-review, nonExemptible

test("forbidden + automated + no violation is satisfied, and the verdict stands", () => {
  const verdict = run({ policy: policy({ rules: { [FORBIDDEN]: { level: "forbidden" } } }) });
  assert.equal(verdict.results.find((r) => r.ruleId === FORBIDDEN).status, "passed");
  assert.equal(verdict.status, STATUS.COMPLIANT);
  assert.deepEqual(verdict.unestablishedProhibitions, []);
});

test("forbidden + automated + a violation is NON_COMPLIANT", () => {
  const verdict = run({
    policy: policy({ rules: { [FORBIDDEN]: { level: "forbidden" } } }),
    findings: [{ rule: FORBIDDEN, message: "empty catch", evidence: ["src/a.js"] }],
  });
  assert.equal(verdict.status, STATUS.NON_COMPLIANT);
  assert.deepEqual(verdict.unestablishedProhibitions, [], "a failure is examined, not unestablished");
});

test("forbidden + manual-review + a valid attestation is satisfied", () => {
  const verdict = run({
    policy: unestablishing(FORBIDDEN_MANUAL, {
      rules: { [FORBIDDEN_MANUAL]: { level: "forbidden" } },
      attestations: { [FORBIDDEN_MANUAL]: attest() },
    }),
  });
  assert.equal(verdict.results.find((r) => r.ruleId === FORBIDDEN_MANUAL).disposition, "attested");
  assert.equal(verdict.status, STATUS.COMPLIANT);
  assert.deepEqual(verdict.unestablishedProhibitions, []);
});

test("forbidden + manual-review + no attestation caps the verdict at NOT_EVALUATED", () => {
  const verdict = run({
    policy: unestablishing(FORBIDDEN_MANUAL, { rules: { [FORBIDDEN_MANUAL]: { level: "forbidden" } } }),
  });
  assert.equal(verdict.status, STATUS.NOT_EVALUATED);
  assert.deepEqual(verdict.unestablishedProhibitions, [FORBIDDEN_MANUAL]);
});

test("forbidden + declared not-applicable is excluded, and does not cap the verdict", () => {
  // Start from the fixture with this one rule REMOVED, then declare it explicitly — so the
  // declaration under test is the one doing the work rather than the helper's default.
  const p = unestablishing(FORBIDDEN_MANUAL, { rules: { [FORBIDDEN_MANUAL]: { level: "forbidden" } } });
  p.applicability[FORBIDDEN_MANUAL] = {
    status: "not-applicable",
    reason: "This project holds no production data.",
    reviewedAt: TODAY,
    revisitWhen: "Any environment receives a production dataset.",
  };
  const verdict = run({ policy: p });
  assert.equal(verdict.status, STATUS.COMPLIANT, "declaring it not-applicable IS looking at it");
  assert.deepEqual(verdict.unestablishedProhibitions, []);
});

test("the cap does not intercept a valid exception on an exemptible forbidden rule", () => {
  // The precedence boundary. Standard 20's semantics must survive Standard 45 R6 unchanged:
  // an excepted rule has been examined and decided about, which is the opposite of unestablished.
  const verdict = run({
    policy: policy({
      rules: { [FORBIDDEN]: { level: "forbidden" } },
      exceptions: [
        {
          rule: FORBIDDEN,
          reason: "Vendor SDK throws on a path we cannot influence; removal is tracked.",
          approvedBy: "project-owner",
          approvedAt: TODAY,
          expires: "2027-01-01",
        },
      ],
    }),
    findings: [{ rule: FORBIDDEN, message: "empty catch", evidence: ["src/vendor.js"] }],
  });
  assert.equal(verdict.status, STATUS.COMPLIANT_WITH_EXCEPTIONS);
  assert.deepEqual(verdict.unestablishedProhibitions, []);
});

test("the cap does not intercept a rejected exception on a non-exemptible forbidden rule", () => {
  // The other boundary, and the more dangerous direction: if the cap ran first, a rejected
  // exception would be downgraded from NON_COMPLIANT to NOT_EVALUATED — turning a refusal into
  // a shrug.
  assert.equal(resolve(catalog, FORBIDDEN_LOCKED).nonExemptible, true);
  const verdict = run({
    policy: policy({
      rules: { [FORBIDDEN_LOCKED]: { level: "forbidden" } },
      exceptions: [
        {
          rule: FORBIDDEN_LOCKED,
          reason: "Attempting to waive a non-exemptible rule.",
          approvedBy: "project-owner",
          approvedAt: TODAY,
        },
      ],
    }),
  });
  assert.equal(verdict.status, STATUS.NON_COMPLIANT);
  assert.ok(verdict.results.some((r) => r.disposition === "rejected-exception"));
});

test("a required manual-review rule without an attestation still yields COMPLIANT", () => {
  // The negative control. Only `forbidden` gets the cap: for a required rule, not-evaluated means
  // "we did not check that you did the thing", and that has always been reported as a coverage
  // number rather than a verdict. If this test ever fails, the cap has widened beyond its rule.
  const verdict = run({ policy: policy({ rules: { "ai.propose-execute": { level: "required" } } }) });
  const result = verdict.results.find((r) => r.ruleId === "ai.propose-execute");
  assert.equal(result.disposition, "not-evaluated");
  assert.equal(verdict.status, STATUS.COMPLIANT);
});

// --- Level propagation (the catalog owns a rule's level, and so does every result) --------------
//
// Four result constructors used to hardcode `level: "required"`: both exception failure paths and
// both outcomes of judgeAttestation. That is the evaluator restating catalog metadata, which the
// three-way separation forbids — and because summarise() scores on `level === "required"`, every
// attested or excepted FORBIDDEN rule was silently counted into the required-rule score. These
// tests pin the semantic consequence, not the label: a wrong level that changed no number would
// still be wrong, but a wrong level that moves the score is how it stayed invisible.

const FORBIDDEN_APPROVED = "data.no-audit-corruption"; // forbidden, manual-review, attestable
const REQUIRED_MANUAL = "ai.propose-execute";                 // required, manual-review, attestable
const REQUIRED_LOCKED = "security.no-secrets-in-artifacts";   // required, nonExemptible

const levelIn = (verdict, ruleId) => verdict.results.find((r) => r.ruleId === ruleId)?.level;
const inDenominator = (verdict, ruleId) =>
  verdict.results.some((r) => r.ruleId === ruleId && r.status !== "skipped" && r.level === "required");

test("no result anywhere carries a level the catalog and policy did not give it", () => {
  // The categorical one. It pins the architecture rather than four instances, so a fifth
  // constructor added later cannot reintroduce the defect quietly.
  // Every constructor must be reached, or the backstop backs nothing up: a rejected attestation
  // and an APPROVED one on forbidden rules, a rejected exception, an expired exception, and the
  // required-level equivalents beside them. An earlier version of this test omitted the approved
  // case and did not catch a mutation of the pass path.
  const p = unestablishing(FORBIDDEN_MANUAL, {
    rules: {
      [FORBIDDEN_MANUAL]: { level: "forbidden" },
      [FORBIDDEN_LOCKED]: { level: "forbidden" },
      [FORBIDDEN_APPROVED]: { level: "forbidden" },
    },
    attestations: {
      [FORBIDDEN_MANUAL]: attest({ status: "rejected" }),
      [FORBIDDEN_APPROVED]: attest(),
      [REQUIRED_MANUAL]: attest(),
    },
    exceptions: [
      { rule: FORBIDDEN_LOCKED, reason: "waiving the unwaivable", approvedBy: "owner", approvedAt: TODAY },
      { rule: REQUIRED_LOCKED, reason: "also unwaivable", approvedBy: "owner", approvedAt: TODAY },
      // Expired on an exemptible FORBIDDEN rule specifically. Pointing it at a required rule would
      // make a mislabelled `required` indistinguishable from the truth, and the mutation would pass.
      { rule: FORBIDDEN, reason: "lapsed", approvedBy: "owner", approvedAt: "2020-01-01", expires: "2021-01-01" },
    ],
  });
  delete p.applicability[FORBIDDEN_APPROVED];
  const verdict = run({ policy: p });
  assert.ok(verdict.results.length > 0);
  for (const d of ["attested", "attested-rejected", "rejected-exception", "expired-exception"]) {
    assert.ok(verdict.results.some((r) => r.disposition === d), `no ${d} result — the test proves less than it claims`);
  }
  for (const r of verdict.results) {
    const expected = p.rules[r.ruleId]?.level ?? resolve(catalog, r.ruleId).level;
    assert.equal(r.level, expected, `${r.ruleId} (${r.disposition}) reports ${r.level}, catalog says ${expected}`);
  }
});

test("a rejected attestation on a forbidden rule fails as forbidden, outside the required score", () => {
  const verdict = run({
    policy: unestablishing(FORBIDDEN_MANUAL, {
      rules: { [FORBIDDEN_MANUAL]: { level: "forbidden" } },
      attestations: { [FORBIDDEN_MANUAL]: attest({ status: "rejected" }) },
    }),
  });
  const result = verdict.results.find((r) => r.ruleId === FORBIDDEN_MANUAL);
  assert.equal(result.disposition, "attested-rejected");
  assert.equal(result.status, "failed");
  assert.equal(result.level, "forbidden");
  assert.equal(verdict.status, STATUS.NON_COMPLIANT);
  assert.equal(inDenominator(verdict, FORBIDDEN_MANUAL), false, "a forbidden failure entered the required score");
  assert.deepEqual(verdict.unestablishedProhibitions, [], "a reviewed rule is not unestablished");
});

test("an approved attestation on a forbidden rule passes as forbidden, outside the required score", () => {
  // The pass path had the same defect, and it inflated BOTH halves of the fraction.
  const verdict = run({
    policy: unestablishing(FORBIDDEN_MANUAL, {
      rules: { [FORBIDDEN_MANUAL]: { level: "forbidden" } },
      attestations: { [FORBIDDEN_MANUAL]: attest() },
    }),
  });
  assert.equal(levelIn(verdict, FORBIDDEN_MANUAL), "forbidden");
  assert.equal(inDenominator(verdict, FORBIDDEN_MANUAL), false, "an attested forbidden rule entered the required score");
});

test("a rejected exception on a forbidden non-exemptible rule stays forbidden", () => {
  const verdict = run({
    policy: policy({
      rules: { [FORBIDDEN_LOCKED]: { level: "forbidden" } },
      exceptions: [{ rule: FORBIDDEN_LOCKED, reason: "x", approvedBy: "owner", approvedAt: TODAY }],
    }),
  });
  const rejected = verdict.results.find((r) => r.disposition === "rejected-exception");
  assert.equal(rejected.ruleId, FORBIDDEN_LOCKED);
  assert.equal(rejected.level, "forbidden");
  assert.equal(verdict.status, STATUS.NON_COMPLIANT);
});

test("an expired exception on a forbidden rule stays forbidden", () => {
  const verdict = run({
    policy: unestablishing(FORBIDDEN_MANUAL, {
      rules: { [FORBIDDEN_MANUAL]: { level: "forbidden" } },
      exceptions: [
        { rule: FORBIDDEN_MANUAL, reason: "x", approvedBy: "owner", approvedAt: "2020-01-01", expires: "2021-01-01" },
      ],
    }),
  });
  const expired = verdict.results.find((r) => r.disposition === "expired-exception");
  assert.equal(expired.ruleId, FORBIDDEN_MANUAL);
  assert.equal(expired.level, "forbidden");
});

test("the required cases still report required — the fix did not invert the defect", () => {
  // The negative control. Reading the level from the catalog has to keep saying "required" for the
  // rules that are required, or the constructors have merely acquired a different wrong answer.
  const rejectedAttestation = run({
    policy: policy({ attestations: { [REQUIRED_MANUAL]: attest({ status: "rejected" }) } }),
  });
  const attested = rejectedAttestation.results.find((r) => r.ruleId === REQUIRED_MANUAL);
  assert.equal(attested.level, "required");
  assert.equal(inDenominator(rejectedAttestation, REQUIRED_MANUAL), true, "a required failure left the required score");

  const rejectedException = run({
    policy: policy({
      exceptions: [{ rule: REQUIRED_LOCKED, reason: "x", approvedBy: "owner", approvedAt: TODAY }],
    }),
  });
  assert.equal(rejectedException.results.find((r) => r.disposition === "rejected-exception").level, "required");

  const expiredException = run({
    policy: policy({
      exceptions: [
        { rule: "architecture.adr", reason: "x", approvedBy: "owner", approvedAt: "2020-01-01", expires: "2021-01-01" },
      ],
    }),
  });
  assert.equal(expiredException.results.find((r) => r.disposition === "expired-exception").level, "required");

  const approved = run({ policy: policy({ attestations: { [REQUIRED_MANUAL]: attest() } }) });
  assert.equal(levelIn(approved, REQUIRED_MANUAL), "required");
  assert.equal(inDenominator(approved, REQUIRED_MANUAL), true);
});

test("a forbidden failure changes the verdict and leaves the required score untouched", () => {
  // Status is computed from rules and never from the score (Standard 30 R2). The two runs differ
  // only in whether a forbidden rule has been reviewed and rejected, so the fraction must not move.
  const baseline = run({
    policy: unestablishing(FORBIDDEN_MANUAL, { rules: { [FORBIDDEN_MANUAL]: { level: "forbidden" } } }),
  });
  const withFailure = run({
    policy: unestablishing(FORBIDDEN_MANUAL, {
      rules: { [FORBIDDEN_MANUAL]: { level: "forbidden" } },
      attestations: { [FORBIDDEN_MANUAL]: attest({ status: "rejected" }) },
    }),
  });
  assert.equal(baseline.status, STATUS.NOT_EVALUATED);
  assert.equal(withFailure.status, STATUS.NON_COMPLIANT, "the verdict must follow the failure");
  assert.equal(withFailure.score, baseline.score, "a forbidden failure moved the required-rule score");
  assert.equal(withFailure.denominator.scored, baseline.denominator.scored, "it moved the denominator");
});

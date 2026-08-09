import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog, resolve, assertBindings, CatalogError } from "../scripts/catalog.mjs";
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

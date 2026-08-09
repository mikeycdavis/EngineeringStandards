/**
 * The compliance engine: catalog + policy + observed findings → a verdict.
 *
 *   observed finding + applicability + exceptions + assurance
 *       → COMPLIANT | COMPLIANT_WITH_EXCEPTIONS | NON_COMPLIANT | NOT_EVALUATED
 *
 * This is where Standard 30 stops being documentation. Three properties of it are load-bearing:
 *
 *   1. Status is computed from rules, never from the score. There is no threshold at which a
 *      percentage grants or withdraws compliance (Standard 30 R2).
 *   2. A rule nothing evaluated is `skipped`, never `passed`. Unknown is not a pass — it is what
 *      Standard 38 R3 refuses to let satisfy completion.
 *   3. The score's denominator is the rules that were actually evaluated, and the assurance
 *      breakdown ships beside it so the number cannot imply coverage it does not have
 *      (Standard 30 R3, R4).
 */

import { resolve } from "./catalog.mjs";

export const STATUS = {
  COMPLIANT: "COMPLIANT",
  COMPLIANT_WITH_EXCEPTIONS: "COMPLIANT_WITH_EXCEPTIONS",
  NON_COMPLIANT: "NON_COMPLIANT",
  NOT_EVALUATED: "NOT_EVALUATED",
};

const RESULT = { passed: "passed", failed: "failed", warning: "warning", skipped: "skipped" };

/**
 * @param catalog   from loadCatalog()
 * @param policy    a validated project-policy document, or null when the project declares none
 * @param findings  evaluator findings, each optionally carrying `rule` (a canonical id)
 * @param evaluated the set of rule ids the evaluator actually examined — the crucial input.
 *                  A rule absent from this set was not checked, and reporting it as passing
 *                  because nothing failed is the false green this whole framework exists to stop.
 * @param today     ISO date, for exception expiry
 */
export function evaluate({ catalog, policy, findings, evaluated, today }) {
  const declaredRules = policy?.rules ?? {};
  const applicability = policy?.applicability ?? {};
  const exceptions = Array.isArray(policy?.exceptions) ? policy.exceptions : [];
  const examined = new Set(evaluated ?? []);

  const byRule = new Map();
  for (const finding of findings) {
    if (!finding.rule) continue;
    const rule = resolve(catalog, finding.rule);
    if (!rule) continue;
    if (!byRule.has(rule.id)) byRule.set(rule.id, []);
    byRule.get(rule.id).push(finding);
  }

  const activeExceptions = new Map();
  const expiredExceptions = [];
  const rejectedExceptions = [];
  for (const entry of exceptions) {
    const rule = resolve(catalog, entry.rule);
    if (!rule) continue;
    // A non-exemptible rule admits no exception. The waiver is REJECTED, not honoured and not
    // quietly ignored: an exception engine that can waive a rule its standard declared
    // non-exemptible has made the prohibition optional, which is not a prohibition
    // (Standard 20 R4). Order matters — this is checked before expiry, because a non-exemptible
    // waiver is invalid whether or not it has lapsed.
    if (rule.nonExemptible) {
      rejectedExceptions.push({ ...entry, rule: rule.id });
      continue;
    }
    if (entry.expires && entry.expires < today) expiredExceptions.push({ ...entry, rule: rule.id });
    else activeExceptions.set(rule.id, entry);
  }

  const results = [];
  for (const rule of catalog.rules.values()) {
    const declared = declaredRules[rule.id];
    const level = declared?.level ?? rule.level;
    const applies = applicability[rule.id];

    // Not applicable: the rule's subject does not exist here. Visible, never a silent exclusion.
    if (applies?.status === "not-applicable") {
      results.push(base(rule, level, RESULT.skipped, "not-applicable", applies.reason));
      continue;
    }

    // Not evaluated: nothing examined it. Distinct from "examined and found nothing wrong".
    if (!examined.has(rule.id)) {
      results.push(
        base(rule, level, RESULT.skipped, "not-evaluated", `No implemented check evaluates ${rule.id}.`),
      );
      continue;
    }

    const hits = byRule.get(rule.id) ?? [];
    if (hits.length === 0) {
      results.push(base(rule, level, RESULT.passed, "evaluated", `No violation of ${rule.id} was observed.`));
      continue;
    }

    const exception = activeExceptions.get(rule.id);
    const outcome = level === "required" || level === "forbidden" ? RESULT.failed : RESULT.warning;
    const result = base(rule, level, outcome, exception ? "excepted" : "evaluated", hits[0].message);
    result.evidence = hits.flatMap((h) => h.evidence ?? []);
    result.files = result.evidence;
    if (exception) {
      result.exception = {
        reason: exception.reason,
        approvedBy: exception.approvedBy,
        approvedAt: exception.approvedAt,
        expires: exception.expires ?? null,
        reference: exception.reference ?? null,
      };
    }
    results.push(result);
  }

  for (const entry of rejectedExceptions) {
    results.push({
      ruleId: entry.rule,
      status: RESULT.failed,
      severity: "error",
      level: "required",
      validationType: "configuration",
      assurance: "full",
      disposition: "rejected-exception",
      message: `${entry.rule} is non-exemptible; the exception against it is rejected, not applied.`,
      evidence: ["project-policy.yml"],
      files: ["project-policy.yml"],
      remediation:
        "Remove the exception and satisfy the rule. If the rule genuinely has no subject in this project, declare it not-applicable instead.",
    });
  }

  for (const entry of expiredExceptions) {
    results.push({
      ruleId: entry.rule,
      status: RESULT.failed,
      severity: "error",
      level: "required",
      validationType: "configuration",
      assurance: "full",
      disposition: "expired-exception",
      message: `The exception for ${entry.rule} expired on ${entry.expires}.`,
      evidence: ["project-policy.yml"],
      files: ["project-policy.yml"],
      remediation: "Renew the exception with a new approval, or satisfy the rule.",
    });
  }

  return summarise(results, policy);
}

function base(rule, level, status, disposition, message) {
  return {
    ruleId: rule.id,
    status,
    severity: rule.severity,
    level,
    validationType: rule.validationType,
    assurance: status === RESULT.skipped ? "none" : rule.assurance,
    disposition,
    message,
    evidence: [],
    files: [],
    remediation: rule.remediation,
  };
}

function summarise(results, policy) {
  const counts = { passed: 0, failed: 0, warnings: 0, skipped: 0 };
  for (const r of results) {
    if (r.status === RESULT.passed) counts.passed++;
    else if (r.status === RESULT.failed) counts.failed++;
    else if (r.status === RESULT.warning) counts.warnings++;
    else counts.skipped++;
  }

  // Assurance accounts for every applicable rule, and the three MUST sum (Standard 30 R4).
  const assurance = { automated: 0, manualReview: 0, notEvaluated: 0 };
  for (const r of results) {
    if (r.disposition === "not-applicable") continue;
    if (r.status === RESULT.skipped) assurance.notEvaluated++;
    else if (r.validationType === "manual-review") assurance.manualReview++;
    else assurance.automated++;
  }

  const applicable = results.filter((r) => r.disposition !== "not-applicable");
  const scored = applicable.filter((r) => r.status !== RESULT.skipped && r.level === "required");
  const scoredPassed = scored.filter((r) => r.status === RESULT.passed).length;
  const score = scored.length === 0 ? null : Math.round((scoredPassed / scored.length) * 100);

  const requiredFailures = results.filter(
    (r) => r.status === RESULT.failed && !(r.disposition === "excepted"),
  );
  const excepted = results.filter((r) => r.disposition === "excepted");

  let status;
  if (!policy) status = STATUS.NOT_EVALUATED;
  else if (requiredFailures.length > 0) status = STATUS.NON_COMPLIANT;
  else if (excepted.length > 0) status = STATUS.COMPLIANT_WITH_EXCEPTIONS;
  else status = STATUS.COMPLIANT;

  return {
    status,
    score,
    summary: counts,
    assurance,
    denominator: {
      total: results.length,
      applicable: applicable.length,
      scored: scored.length,
      basis: "required-level rules that were evaluated",
    },
    results,
  };
}

/** The Standard 25 envelope. `schemaVersion` versions this format, independent of the others. */
export function envelope({ verdict, project, standardVersion, auditedAt, repo, frameworkCoverage }) {
  return {
    schemaVersion: "1.0",
    standardVersion: standardVersion ?? null,
    project: project ?? repo ?? null,
    status: verdict.status,
    score: verdict.score,
    summary: verdict.summary,
    assurance: verdict.assurance,
    denominator: verdict.denominator,
    // Framework maturity, sitting outside the verdict on purpose. It says how much of the framework
    // has been turned into rules — never how compliant this project is.
    frameworkCoverage: frameworkCoverage ?? null,
    auditedAt,
    results: verdict.results,
  };
}

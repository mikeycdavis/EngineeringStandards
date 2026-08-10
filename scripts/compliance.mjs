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
import { currentReview, reviewProblems } from "./reviews.mjs";

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
export function evaluate({ catalog, policy, findings, evaluated, today, freshness }) {
  const declaredRules = policy?.rules ?? {};
  const applicability = policy?.applicability ?? {};
  const exceptions = Array.isArray(policy?.exceptions) ? policy.exceptions : [];
  const attestations = policy?.attestations ?? {};
  const examined = new Set(evaluated ?? []);
  const attestationFreshness = freshness ?? new Map();

  // The single owner of rule-metadata resolution. A result constructor never invents a field the
  // catalog owns: `level` belongs to the catalog and the policy may restate it for this project,
  // and severity belongs to the catalog outright — `ruleSetting` in the schema accepts `level` and
  // `note` and nothing else, so there is no project override to consult.
  //
  // This exists because the failure constructors hardcoded both. The level was not cosmetic:
  // summarise() scores on `level === "required"`, so every attested or excepted FORBIDDEN rule was
  // silently counted into the required-rule score. The hardcoded severity moves no number, which is
  // exactly why it outlived the level fix by one review — an invented field that changes nothing
  // visible is the one that survives. Neither is reviewable against the catalog, because neither is
  // reporting what the catalog says.
  //
  // `validationType` and `assurance` are deliberately NOT resolved here. On a configuration failure
  // they describe how THIS RESULT was obtained — a policy file was read and found
  // self-contradictory — not how the rule is validated. They are result provenance rather than rule
  // identity, and collapsing the two would have a rejected exception claim it was manual-reviewed.
  const levelOf = (rule) => declaredRules[rule.id]?.level ?? rule.level;
  const metaOf = (rule) => ({ level: levelOf(rule), severity: rule.severity });

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
      rejectedExceptions.push({ ...entry, rule: rule.id, ...metaOf(rule) });
      continue;
    }
    if (entry.expires && entry.expires < today)
      expiredExceptions.push({ ...entry, rule: rule.id, ...metaOf(rule) });
    else activeExceptions.set(rule.id, entry);
  }

  const results = [];
  for (const rule of catalog.rules.values()) {
    const level = levelOf(rule);
    const applies = applicability[rule.id];

    // Not applicable: the rule's subject does not exist here. Visible, never a silent exclusion.
    if (applies?.status === "not-applicable") {
      results.push(base(rule, level, RESULT.skipped, "not-applicable", applies.reason));
      continue;
    }

    // A recorded human judgement (ADR 0005). Checked BEFORE not-evaluated, because an attestation
    // is precisely what turns "nobody looked" into "somebody looked" — but AFTER the automated
    // findings are collected, because it may never override one.
    // An attestation is an append-only sequence of review events; what may establish the rule is
    // the newest one. History stays visible in the policy and in `npm run attestations`, so the two
    // questions — what happened historically, and what currently establishes this rule — are
    // answered independently rather than by one mutable record that the latest review overwrites.
    const record = attestations[rule.id];
    const structural = reviewProblems(rule.id, record);
    if (structural.length > 0) {
      // A malformed history establishes nothing rather than establishing whatever happens to be
      // last. Selecting by position from a sequence whose order is unverified would make the file's
      // layout the chronology.
      results.push({
        ruleId: rule.id,
        status: RESULT.failed,
        severity: rule.severity,
        level,
        validationType: "configuration",
        assurance: "full",
        disposition: "invalid-attestation",
        message: `${rule.id} has a malformed review history: ${structural.join("; ")}.`,
        evidence: ["project-policy.yml"],
        files: ["project-policy.yml"],
        remediation: "Give every review a unique id and record them in chronological order.",
      });
      continue;
    }
    const attestation = currentReview(rule.id, record);
    if (attestation) {
      const hits = byRule.get(rule.id) ?? [];
      const verdict = judgeAttestation(rule, level, attestation, hits, today, attestationFreshness);
      if (verdict) {
        results.push(verdict);
        continue;
      }
      // Falls through: the attestation did not establish the requirement, so the rule is evaluated
      // normally and typically lands on not-evaluated. Silently ignoring it would be worse.
    }

    // A manual-review rule is never established by an automated run. Without a valid attestation it
    // is not-evaluated, even if the evaluator claims to have examined it and found nothing —
    // "no automated finding" is not evidence for a requirement whose evaluator is a human. Reaching
    // `passed` that way was possible before attestations existed, and it is the false green
    // Standard 24 R2 forbids.
    if (rule.validationType === "manual-review" || !examined.has(rule.id)) {
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
      severity: entry.severity,
      level: entry.level,
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
      severity: entry.severity,
      level: entry.level,
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

/**
 * Decide what an attestation establishes. Returns a result, or null to fall through to normal
 * evaluation — never a silent success.
 *
 * The rules are ADR 0005's, and the ordering is the interesting part: contradiction is checked
 * first, because a human saying a rule is satisfied does not change what a check observed. Evidence
 * outranks assertion (Standard 38 R4), and that is also why an attestation cannot bypass a
 * nonExemptible rule — not as a separate prohibition, but because the automated failure survives.
 */
function judgeAttestation(rule, level, attestation, hits, today, freshness) {
  const fail = (disposition, message, remediation) => ({
    ruleId: rule.id,
    status: RESULT.failed,
    severity: rule.severity,
    level,
    validationType: "configuration",
    assurance: "full",
    disposition,
    message,
    evidence: ["project-policy.yml"],
    files: ["project-policy.yml"],
    remediation,
  });

  if (!rule.attestable) {
    return fail(
      "invalid-attestation",
      `${rule.id} is not attestable; the catalog says it is evaluated by ${rule.validationType}, not by human review.`,
      "Remove the attestation. A rule the catalog does not mark attestable cannot be satisfied by assertion.",
    );
  }

  if (hits.length > 0) {
    return fail(
      "contradicted-attestation",
      `${rule.id} is attested as approved, but an automated check found: ${hits[0].message}`,
      "Fix the finding. An attestation records human evidence; it never overrides what a check observed.",
    );
  }

  if (attestation.status === "rejected") {
    return fail(
      "attested-rejected",
      `${rule.id} was reviewed by ${attestation.reviewedBy} and found unmet.`,
      "Satisfy the rule, then re-attest. A recorded rejection is a failure, not silence.",
    );
  }

  if (attestation.expires && attestation.expires < today) {
    return null; // Expired: back to not-evaluated. It is not a failure, it is unreviewed again.
  }

  const against = attestation.reviewedAgainst;

  /**
   * Freshness is a separate axis from what the human decided.
   *
   * `approved` records a decision; freshness records whether that decision can still be established
   * against the present repository. Only their conjunction establishes a rule — and when it fails,
   * the *reason* is carried rather than collapsed. "The reviewed file changed", "the digest predates
   * a mechanism that cannot be reproduced", and "the comparison could not be performed at all" are
   * three different statements, and rendering the second or third as the first would be the same
   * class of error the mechanism exists to prevent. Returning null here, as this once did, said
   * "nobody looked" about a rule a human demonstrably reviewed.
   *
   * The result stays `skipped` / `not-evaluated` so the Standard 45 R6 cap keeps firing over it
   * unchanged: an unestablished prohibition is unestablished however it got there. `freshness` is
   * the new axis and the message names it. Only `unrecorded` still establishes, preserving the
   * documented first-pass workflow where the digest is omitted so the validator can report it.
   */
  const fresh = freshness.get(rule.id) ?? { state: "unrecorded", detail: null };
  if (fresh.state !== "fresh" && fresh.state !== "unrecorded") {
    return {
      ruleId: rule.id,
      status: RESULT.skipped,
      severity: rule.severity,
      level,
      validationType: "manual-review",
      assurance: "none",
      disposition: "not-evaluated",
      freshness: fresh.state,
      message:
        `${rule.id} was reviewed by ${attestation.reviewedBy} on ${attestation.reviewedAt}, but that ` +
        `review does not establish the current state: ${fresh.detail}.`,
      evidence: against?.paths ?? ["project-policy.yml"],
      files: against?.paths ?? ["project-policy.yml"],
      remediation:
        fresh.state === "legacy-unverifiable"
          ? "Re-review against current committed content and record a new digest with its digestAlgorithm. The recorded value is historical evidence: it must not be recomputed into a new one."
          : fresh.state === "evidence-unavailable"
            ? "Repository content could not be identified for the reviewed paths. Make it available, or record the review against paths the repository tracks."
            : "Review the changed paths again and record the new digest.",
    };
  }

  return {
    ruleId: rule.id,
    status: RESULT.passed,
    severity: rule.severity,
    level,
    validationType: "manual-review",
    // Human judgement establishes the requirement, and does so without a machine. `manualReview` in
    // the assurance breakdown is the honest home for it — never `automated`.
    assurance: "full",
    disposition: "attested",
    message: `Attested by ${attestation.reviewedBy} on ${attestation.reviewedAt}: ${attestation.evidence}`,
    evidence: against?.paths ?? [],
    files: against?.paths ?? [],
    remediation: rule.remediation,
    attestation: {
      reviewedBy: attestation.reviewedBy,
      reviewedAt: attestation.reviewedAt,
      evidence: attestation.evidence,
      reference: attestation.reference ?? null,
      expires: attestation.expires ?? null,
    },
  };
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

  /**
   * Standard 45 R6 — an applicable `forbidden` rule that nobody established caps the verdict.
   *
   * For a `required` rule, not-evaluated means "we did not check that you did the thing". For a
   * `forbidden` rule it means "nobody looked for the prohibited behaviour", and reporting COMPLIANT
   * over an unexamined prohibition is a false green at the verdict level — Standard 38 R3's
   * principle applied to the verdict itself.
   *
   * Placed AFTER the NON_COMPLIANT and COMPLIANT_WITH_EXCEPTIONS determinations on purpose, so it
   * cannot intercept the exception machinery. A rule that was excepted, rejected, or declared
   * not-applicable has been LOOKED AT; the cap exists only for the case where nothing has happened
   * at all. `not-applicable` results are already excluded, and an excepted or failed rule is not
   * `skipped`, so neither can reach this list.
   */
  const unestablished = applicable.filter(
    (r) => r.level === "forbidden" && r.status === RESULT.skipped && r.disposition === "not-evaluated",
  );

  let status;
  if (!policy) status = STATUS.NOT_EVALUATED;
  else if (requiredFailures.length > 0) status = STATUS.NON_COMPLIANT;
  else if (excepted.length > 0) status = STATUS.COMPLIANT_WITH_EXCEPTIONS;
  else if (unestablished.length > 0) status = STATUS.NOT_EVALUATED;
  else status = STATUS.COMPLIANT;

  return {
    status,
    unestablishedProhibitions: unestablished.map((r) => r.ruleId),
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
    // Standard 45 R6. Present on every run, empty when nothing is unestablished, so a consumer can
    // distinguish "no prohibitions went unexamined" from "this validator predates the rule".
    unestablishedProhibitions: verdict.unestablishedProhibitions ?? [],
    auditedAt,
    results: verdict.results,
  };
}

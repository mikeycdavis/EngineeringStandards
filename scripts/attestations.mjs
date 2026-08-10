#!/usr/bin/env node
/**
 * Attestation provenance inventory — a read-only report, never a migration that runs.
 *
 * A digest-algorithm change makes every previously recorded digest well-formed and meaningless, and
 * the tempting response is to recompute each one from the revision it names. That would prove only
 * "this was the repository content at that revision". It would not prove "this is the surface the
 * reviewer examined", because the superseded mechanism hashed bytes the commit did not uniquely
 * determine — which is the defect being migrated away from. Recomputation would launder
 * unverifiable provenance into verified provenance, so this tool deliberately cannot do it: it
 * reports `0 safely auto-upgradable` as a structural fact about the migration, not as a count that
 * might one day be higher.
 *
 * **A digest-algorithm migration may classify existing provenance. It may not upgrade the
 * evidentiary strength of that provenance without a new review.**
 *
 * The report is the deterministic inventory that prevents "we think we migrated them all".
 *
 * Usage: node scripts/attestations.mjs [--dir=<path>] [--json]
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./yaml.mjs";
import {
  classifyFreshness,
  repositoryAvailable,
  DIGEST_ALGORITHM,
  LEGACY_ALGORITHM,
  FRESHNESS,
} from "./repository.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const dirArg = args.find((a) => a.startsWith("--dir="));
const root = path.resolve(dirArg ? dirArg.slice("--dir=".length) : ".");

let document;
try {
  document = parseYaml(await readFile(path.join(root, "project-policy.yml"), "utf8"));
} catch (error) {
  process.stderr.write(`project-policy.yml could not be read: ${error.message}\n`);
  process.exit(EXIT_INVOCATION);
}

const repo = repositoryAvailable(root);
const entries = Object.entries(document?.attestations ?? {});

const rows = entries.map(([ruleId, attestation]) => {
  const against = attestation?.reviewedAgainst;
  const algorithm = against?.digestAlgorithm ?? (against?.digest ? LEGACY_ALGORITHM : null);
  const freshness = against?.paths?.length
    ? classifyFreshness(root, against, repo).state
    : FRESHNESS.unrecorded;
  return {
    rule: ruleId,
    disposition: attestation?.status ?? null,
    algorithm,
    freshness,
    reviewedAt: attestation?.reviewedAt ?? null,
    revision: against?.revision ?? null,
    paths: against?.paths ?? [],
    // The only value this column ever takes. Stated per row rather than once at the bottom, so a
    // reader scanning for something to automate finds the refusal beside every candidate for it.
    autoUpgradable: false,
    action:
      freshness === FRESHNESS.fresh
        ? "none"
        : freshness === FRESHNESS.legacyUnverifiable
          ? "human re-review required — record a new digest, never recompute the old one"
          : freshness === FRESHNESS.stale
            ? "human re-review required — reviewed content changed"
            : freshness === FRESHNESS.evidenceUnavailable
              ? "repository evidence unavailable — establish it, then re-review"
              : "no digest recorded — record one to make staleness detectable",
  };
});

/**
 * Post-migration invariants. Each is a state the migration exists to make impossible, so each is
 * asserted rather than assumed — "we think we migrated them all" is exactly what an inventory is
 * for. A violation exits 1: the policy is internally inconsistent about its own provenance.
 */
const violations = [];
for (const r of rows) {
  if (r.algorithm === null && r.paths.length > 0 && r.freshness !== FRESHNESS.unrecorded) {
    violations.push(`${r.rule}: a recorded digest carries no digestAlgorithm`);
  }
  if (r.algorithm && r.algorithm !== DIGEST_ALGORITHM && r.algorithm !== LEGACY_ALGORITHM) {
    violations.push(`${r.rule}: unknown digestAlgorithm ${r.algorithm}`);
  }
  if (r.algorithm === DIGEST_ALGORITHM && r.freshness === FRESHNESS.legacyUnverifiable) {
    violations.push(`${r.rule}: a deterministic digest classified as legacy — algorithm substitution`);
  }
}

const counts = rows.reduce((acc, r) => ((acc[r.freshness] = (acc[r.freshness] ?? 0) + 1), acc), {});
const legacy = rows.filter((r) => r.algorithm === LEGACY_ALGORITHM);

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify(
      {
        repository: { available: repo.available, reason: repo.reason },
        total: rows.length,
        counts,
        safelyAutoUpgradable: 0,
        requireReEstablishment: rows.filter((r) => r.freshness !== FRESHNESS.fresh).length,
        violations,
        attestations: rows,
      },
      null,
      2,
    ) + "\n",
  );
} else {
  const out = [];
  out.push(`${rows.length} attestation(s) in ${root}`);
  if (!repo.available) out.push(`  repository content unavailable: ${repo.reason}`);
  out.push("");
  for (const [status, n] of Object.entries(
    rows.reduce((a, r) => ((a[r.disposition] = (a[r.disposition] ?? 0) + 1), a), {}),
  )) {
    out.push(`  ${n} ${status}`);
  }
  out.push("");
  out.push(`  ${legacy.length} recorded under ${LEGACY_ALGORITHM}`);
  out.push(`  0 safely auto-upgradable`);
  out.push(`  ${rows.filter((r) => r.freshness !== FRESHNESS.fresh).length} require provenance re-establishment`);
  out.push("");
  for (const r of rows) {
    out.push(`  ${r.rule}`);
    out.push(`    disposition: ${r.disposition}`);
    out.push(`    algorithm:   ${r.algorithm ?? "(none recorded)"}`);
    out.push(`    freshness:   ${r.freshness}`);
    out.push(`    reviewed:    ${r.reviewedAt ?? "?"}${r.revision ? ` at ${r.revision}` : ""}`);
    out.push(`    action:      ${r.action}`);
    out.push("");
  }
  if (violations.length) {
    out.push("  Invariant violations:");
    for (const v of violations) out.push(`    ${v}`);
    out.push("");
  }
  out.push("  A digest-algorithm migration may classify existing provenance. It may not upgrade the");
  out.push("  evidentiary strength of that provenance without a new review — which is why no digest");
  out.push("  here is recomputed, and why nothing is ever auto-upgradable.");
  process.stdout.write(out.join("\n") + "\n");
}

process.exit(violations.length ? EXIT_FINDINGS : EXIT_OK);

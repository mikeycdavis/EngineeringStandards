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

import { humanErr, humanOut } from "./display-safe.mjs";
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
import { currentReview, reviewsOf, reviewProblems, isLegacyShape } from "./reviews.mjs";
import { reviewHistoryPreflight, IDENTITY_NOTE } from "./review-history.mjs";
import { displaySafe } from "./display-safe.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const args = process.argv.slice(2);
const JSON_OUT = args.includes("--json");
const MIGRATE = args.includes("--migrate");
const dirArg = args.find((a) => a.startsWith("--dir="));
const root = path.resolve(dirArg ? dirArg.slice("--dir=".length) : ".");

let document;
try {
  document = parseYaml(await readFile(path.join(root, "project-policy.yml"), "utf8"));
} catch (error) {
  // A policy that no longer exists at its path (deleted, moved, renamed) is a violation when the
  // trusted base recorded attestations; it is not merely "could not be read".
  const missing = await reviewHistoryPreflight({ repositoryPath: root, policyPath: "project-policy.yml" });
  if (missing.status === "violated") {
    const report = {
      historyIntegrity: {
        status: "violated",
        effective: false,
        reason: missing.reason,
        baseCommit: missing.baseCommit ?? null,
        ref: missing.ref ?? null,
      },
      identityNote: IDENTITY_NOTE,
      total: 0,
      attestations: [],
      violations: [`review history: ${missing.reason}`],
    };
    if (JSON_OUT) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    else {
      humanErr(
        `history integrity: VIOLATED - ${displaySafe(missing.reason)}\nNo attestation is created, listed as valid or renewed.\n`,
      );
    }
    process.exit(EXIT_FINDINGS);
  }
  humanErr(`project-policy.yml could not be read: ${displaySafe(error.message)}\n`);
  process.exit(EXIT_INVOCATION);
}

/**
 * Wrap each single-record attestation as the first event in its own history.
 *
 * This is a *shape* migration and nothing else. It adds the identity the event model needs and
 * leaves every substantive field exactly as written: status, reviewer, timestamp, evidence,
 * reference, expiry, reviewed paths, revision, and digest value. No judgement is created by a
 * schema migration, and none is altered — the legacy event stays `legacy-unverifiable` afterwards,
 * which is the point. It is idempotent: a record already in event form is returned untouched, so
 * running it twice cannot append a duplicate of history.
 *
 * The edit is textual rather than a YAML re-serialisation. The evidence fields are long prose
 * paragraphs carrying the actual review record, and round-tripping them through a writer this
 * repository does not have would reflow or re-escape the very text the migration exists to
 * preserve. Reindenting known-good lines and inserting two of them changes nothing else.
 */
function migrateText(text) {
  const lines = text.split("\n");
  const out = [];
  let inAttestations = false;
  let pending = null; // Rule whose body we are reindenting.
  const flush = () => (pending = null);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^attestations:\s*$/.test(line)) {
      inAttestations = true;
      out.push(line);
      continue;
    }
    if (inAttestations && /^[a-zA-Z]/.test(line)) {
      inAttestations = false;
      flush();
    }
    if (!inAttestations) {
      out.push(line);
      continue;
    }

    const ruleStart = line.match(/^ {2}([a-z][\w.-]*):\s*$/);
    if (ruleStart) {
      flush();
      // Already migrated? Look ahead for `reviews:` before the next rule key.
      let already = false;
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^ {2}\S/.test(lines[j]) || /^[a-zA-Z]/.test(lines[j])) break;
        if (/^ {4}reviews:\s*$/.test(lines[j])) {
          already = true;
          break;
        }
      }
      out.push(line);
      if (already) continue;

      pending = ruleStart[1];
      out.push("    reviews:");
      out.push(`      - id: "review-${pending.replace(/\./g, "-")}-001"`);
      continue;
    }

    if (pending && /^ {4}\S/.test(line)) {
      // First body line becomes part of the `- id:` block; every line gains four spaces of indent.
      out.push(`    ${line}`);
      continue;
    }
    if (pending && /^ {6,}/.test(line)) {
      out.push(`    ${line}`);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

// The same history-integrity preflight `standards validate` runs, before anything is created, listed as
// valid or migrated. An attestation is only as good as the history it sits in: when that history was
// rewritten (violated) or could not be compared with a trusted base (not-evaluated), no event is
// listed as current, and the migration refuses to write.
const preflight = await reviewHistoryPreflight({ repositoryPath: root, policyPath: "project-policy.yml" });

if (MIGRATE) {
  if (!preflight.effective) {
    humanErr(
      `Refusing to migrate: review-history integrity is ${preflight.status.toUpperCase()}: ${displaySafe(preflight.reason)}
` +
        `No attestation is created, listed as valid or renewed until the history is verified.
`,
    );
    process.exit(preflight.status === "violated" ? EXIT_FINDINGS : EXIT_INVOCATION);
  }
  const file = path.join(root, "project-policy.yml");
  const original = await readFile(file, "utf8");
  const migrated = migrateText(original);
  if (migrated === original) {
    humanOut("Already in review-event form; nothing to migrate.\n");
    process.exit(EXIT_OK);
  }
  const { writeFile } = await import("node:fs/promises");
  await writeFile(file, migrated);
  humanOut("project-policy.yml migrated to review events. Verify with npm run policy.\n");
  process.exit(EXIT_OK);
}

const repo = repositoryAvailable(root);
const entries = Object.entries(document?.attestations ?? {});

// One row per review EVENT, not per rule. Two events for one rule stay independently inspectable,
// which is the whole point of an append-only history: "what happened" and "what establishes this
// now" are different questions and a report that only showed the current event could answer just
// one of them.
const rows = entries.flatMap(([ruleId, record]) => {
  const reviews = reviewsOf(record);
  const current = currentReview(ruleId, record);
  return reviews.map((attestation) => {
    const against = attestation?.reviewedAgainst;
    const algorithm = against?.digestAlgorithm ?? (against?.digest ? LEGACY_ALGORITHM : null);
    const freshness = against?.paths?.length
      ? classifyFreshness(root, against, repo).state
      : FRESHNESS.unrecorded;
    const paths = against?.paths ?? [];
    return {
      rule: ruleId,
      id: attestation?.id ?? null,
      current: preflight.effective && attestation === current,
      identity: "asserted, not authenticated",
      rejectionEffective: !preflight.effective && attestation === current && attestation?.status === "rejected",
      shape: isLegacyShape(record) ? "single-record (pre-migration)" : "review-event",
      predecessor: attestation?.supersedes ?? null,
      supersedes: attestation?.supersedes ?? null,
      status: attestation?.status ?? null,
      disposition: attestation?.status ?? null,
      reviewedBy: attestation?.reviewedBy ?? null,
      reviewerRole: attestation?.reviewerRole ?? null,
      reviewedAt: attestation?.reviewedAt ?? null,
      evidence: attestation?.evidence ?? null,
      reference: attestation?.reference ?? null,
      reviewedCommit: against?.revision ?? null,
      revision: against?.revision ?? null,
      reviewedTree: against?.tree ?? null,
      tree: against?.tree ?? null,
      digest: against?.digest ?? null,
      digestAlgorithm: algorithm,
      algorithm,
      source: against?.source ?? (against ? "git" : null),
      reviewedPaths: paths,
      scope: paths,
      paths,
      freshness,
      // The only value this column ever takes. Stated per row rather than once at the bottom, so a
      // reader scanning for something to automate finds the refusal beside every candidate for it.
      autoUpgradable: false,
      action:
        freshness === FRESHNESS.fresh
          ? "none"
          : freshness === FRESHNESS.legacyUnverifiable
            ? "human re-review required - record a new digest, never recompute the old one"
            : freshness === FRESHNESS.stale
              ? "human re-review required - reviewed content changed"
              : freshness === FRESHNESS.evidenceUnavailable
                ? "repository evidence unavailable - establish it, then re-review"
                : "no digest recorded - record one to make staleness detectable",
    };
  });
});

/**
 * Post-migration invariants. Each is a state the migration exists to make impossible, so each is
 * asserted rather than assumed — "we think we migrated them all" is exactly what an inventory is
 * for. A violation exits 1: the policy is internally inconsistent about its own provenance.
 */
const violations = [];
if (preflight.status === "violated") violations.push(`review history: ${preflight.reason}`);
for (const [ruleId, record] of entries) violations.push(...reviewProblems(ruleId, record));
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
        historyIntegrity: {
          status: preflight.status,
          effective: preflight.effective,
          reason: preflight.reason ?? null,
          baseCommit: preflight.baseCommit ?? null,
          ref: preflight.ref ?? null,
        },
        identityNote: IDENTITY_NOTE,
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
  out.push(`${rows.length} attestation(s) in ${displaySafe(root)}`);
  if (!repo.available) out.push(`  repository content unavailable: ${displaySafe(repo.reason)}`);
  out.push(`  history integrity: ${preflight.status.toUpperCase()}${preflight.reason ? ` - ${displaySafe(preflight.reason)}` : ""}`);
  if (!preflight.effective) out.push("  No attestation is listed as current or valid while history integrity is not verified.");
  out.push(`  ${IDENTITY_NOTE}`);
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
    out.push(`  ${displaySafe(r.rule)}`);
    out.push(`    disposition: ${displaySafe(r.disposition)}`);
    out.push(`    reviewer:    ${displaySafe(r.reviewedBy ?? "?")} (asserted, not authenticated)`);
    out.push(`    algorithm:   ${displaySafe(r.algorithm ?? "(none recorded)")}`);
    out.push(`    freshness:   ${displaySafe(r.freshness)}`);
    out.push(`    reviewed:    ${displaySafe(r.reviewedAt ?? "?")}${r.revision ? ` at ${displaySafe(r.revision)}` : ""}`);
    out.push(`    action:      ${displaySafe(r.action)}`);
    out.push("");
  }
  if (violations.length) {
    out.push("  Invariant violations:");
    for (const v of violations) out.push(`    ${displaySafe(v)}`);
    out.push("");
  }
  out.push("  A digest-algorithm migration may classify existing provenance. It may not upgrade the");
  out.push("  evidentiary strength of that provenance without a new review — which is why no digest");
  out.push("  here is recomputed, and why nothing is ever auto-upgradable.");
  humanOut(out.join("\n") + "\n");
}

process.exit(violations.length ? EXIT_FINDINGS : EXIT_OK);

/**
 * A review is an event, not mutable state.
 *
 * An attestation used to be one record that re-review overwrote. That made the act of recording new
 * provenance destroy the record proving the new provenance was needed — the exact operation the
 * digest migration forbids, performed by the mechanism meant to complete it. So an attestation is
 * now an append-only sequence of immutable review events, and "current" is derived rather than
 * stored.
 *
 * There is deliberately no `current:` / `history:` split. Moving a record from one to the other is
 * itself a mutation, and it invites two schemas for what is one kind of thing. One homogeneous
 * sequence, one set of semantics, no second source of truth.
 *
 * `supersedes` means *this is the successor review record*, never *the previous judgement was
 * false*. A rejected historical review remains a rejected historical review forever, which is what
 * lets the model eventually express "a violation was found at revision X" and "remediation was
 * reviewed and accepted at revision Y" without pretending the first never happened.
 *
 * This module is pure — no filesystem, no Git — so the compliance engine can consume it without
 * acquiring either.
 */

/**
 * Every review event for a rule, oldest first.
 *
 * The single-record shape is accepted and normalised into a one-event sequence for the migration
 * window only. Supporting two shapes indefinitely is how a migration format becomes permanent
 * architecture, so this is a ramp with an end, not a compatibility layer.
 */
export function reviewsOf(record) {
  if (!record) return [];
  if (Array.isArray(record.reviews)) return record.reviews;
  return [record]; // Legacy single-record shape.
}

/** True when the record still uses the pre-migration single-record shape. */
export function isLegacyShape(record) {
  return Boolean(record) && !Array.isArray(record.reviews);
}

/**
 * Structural problems that must fail rather than be resolved silently at evaluation time.
 *
 * Ordering is validated rather than assumed because selecting "latest" by array position alone
 * would make the file's layout the chronology — reorder two lines and the established review
 * changes with nothing recording that it did. Validating that the stored order already agrees with
 * `reviewedAt` is what makes taking the last element safe, and equal timestamps are permitted since
 * several reviews genuinely land on one day; `id` is what disambiguates them, not the date.
 */
export function reviewProblems(ruleId, record) {
  const problems = [];
  const reviews = reviewsOf(record);
  if (reviews.length === 0) return problems;

  if (!isLegacyShape(record)) {
    const seen = new Set();
    for (const [i, review] of reviews.entries()) {
      if (!review?.id) {
        problems.push(`${ruleId}: review at position ${i} has no id`);
        continue;
      }
      if (seen.has(review.id)) problems.push(`${ruleId}: duplicate review id ${review.id}`);
      seen.add(review.id);
    }
    for (let i = 1; i < reviews.length; i += 1) {
      const prev = reviews[i - 1]?.reviewedAt;
      const next = reviews[i]?.reviewedAt;
      if (prev && next && prev > next) {
        problems.push(
          `${ruleId}: reviews are not in chronological order (${prev} precedes ${next} in the file, ` +
            `but is later in time)`,
        );
      }
    }
    for (const review of reviews) {
      if (!review?.supersedes) continue;
      if (!seen.has(review.supersedes)) {
        problems.push(`${ruleId}: review ${review.id} supersedes ${review.supersedes}, which is not recorded here`);
      }
    }
  }
  return problems;
}

/**
 * The review eligible to establish current state: the newest one.
 *
 * Returns null when the sequence is structurally invalid, so a malformed history establishes
 * nothing rather than establishing whatever happens to be last. The caller reports that as an
 * invalid attestation — a failure, not silence.
 */
export function currentReview(ruleId, record) {
  const reviews = reviewsOf(record);
  if (reviews.length === 0) return null;
  if (reviewProblems(ruleId, record).length > 0) return null;
  return reviews[reviews.length - 1];
}

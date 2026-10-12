import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Review histories are immutable, rule-scoped event chains.
 *
 * This module reads one pinned, repository-shipped legacy-prefix manifest once, at import. It invokes no provider,
 * has no mutable process state, and never mutates the supplied record. `reviewerRole` is structural
 * provenance only. Neither it nor any other field in a local policy authenticates a person or
 * authorizes a governance role.
 */

/** True when a value can be a rule's attestation record: a mapping, not null, a list or a scalar. */
export function isReviewRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Every review event for a rule, oldest first. Anything that is not a record has no events. */
export function reviewsOf(record) {
  if (!isReviewRecord(record)) return [];
  if (Array.isArray(record.reviews)) return record.reviews;
  if (Object.hasOwn(record, "reviews")) return []; // `reviews` present but not a list: no events, and a problem.
  return [record]; // Legacy single-record shape.
}

/** True when the record still uses the pre-migration single-record shape. */
export function isLegacyShape(record) {
  return isReviewRecord(record) && !Object.hasOwn(record, "reviews");
}

const nonEmptyString = (value) => typeof value === "string" && value.length > 0;
const REVIEW_DIGEST = /^[0-9a-f]{16,64}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const GIT_OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const CANONICALIZATION = "recursive-key-sorted-json-utf8-sha256-v1";

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function loadLegacyPrefixManifest() {
  const source = readFileSync(new URL("./review-history-legacy-prefixes.json", import.meta.url), "utf8");
  const manifest = JSON.parse(source);
  if (
    manifest?.schemaVersion !== "1.0.0" ||
    !GIT_OBJECT_ID.test(manifest?.baseCommit ?? "") ||
    !GIT_OBJECT_ID.test(manifest?.baseTree ?? "") ||
    manifest?.eventCanonicalization !== CANONICALIZATION ||
    !manifest?.histories ||
    typeof manifest.histories !== "object" ||
    Array.isArray(manifest.histories)
  ) {
    throw new Error("review-history legacy-prefix manifest has an invalid envelope");
  }
  for (const [ruleId, entry] of Object.entries(manifest.histories)) {
    if (!nonEmptyString(ruleId) || !Array.isArray(entry?.events) || entry.events.length === 0) {
      throw new Error(`review-history legacy-prefix manifest has an invalid history for ${ruleId}`);
    }
    const ids = new Set();
    for (const event of entry.events) {
      if (!nonEmptyString(event?.id) || !SHA256.test(event?.sha256 ?? "") || ids.has(event.id)) {
        throw new Error(`review-history legacy-prefix manifest has an invalid event for ${ruleId}`);
      }
      ids.add(event.id);
    }
  }
  return deepFreeze(manifest);
}

/** Immutable compatibility evidence anchored to one reviewed Git base. */
export const LEGACY_REVIEW_PREFIX_MANIFEST = loadLegacyPrefixManifest();

function canonicalJson(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("review event is not canonical JSON data");
}

function eventSha256(event) {
  try {
    return createHash("sha256").update(canonicalJson(event), "utf8").digest("hex");
  } catch {
    return null;
  }
}


const STATUS = new Set(["approved", "rejected"]);
const DATE_ONLY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * Structural field problems for one event that is NOT part of a trusted or anchored prefix.
 *
 * Every such event, genesis or successor, carries what the policy schema requires of a review
 * event: a status from the closed set, reviewer identity, a date-only timestamp and evidence. When
 * `reviewedAgainst` is present its scope must be a non-empty list. A successor additionally carries
 * the renewal contract: reviewer role, reviewed commit, reviewed tree, a schema-valid digest and
 * scope. A genesis event is not required to carry `reviewedAgainst`, because recording a first
 * review without a digest and having `validate` print the digest to record is the documented
 * workflow (ADR 0005); requiring it would make the digest hint unreachable.
 */
function eventFieldProblems(ruleId, review, { successor }) {
  const problems = [];
  const label = `${ruleId}: ${successor ? "successor review" : "review"} ${review?.id ?? "(missing id)"}`;
  if (!isReviewRecord(review)) return [`${label} is not a mapping`];
  if (!STATUS.has(review.status)) problems.push(`${label} has no status of approved or rejected`);
  if (!nonEmptyString(review.reviewedBy)) problems.push(`${label} has no reviewedBy identity`);
  if (!nonEmptyString(review.reviewedAt)) {
    problems.push(`${label} has no reviewedAt timestamp`);
  } else if (!DATE_ONLY.test(review.reviewedAt)) {
    problems.push(`${label} has a reviewedAt that is not a YYYY-MM-DD date`);
  }
  if (!nonEmptyString(review.evidence)) problems.push(`${label} has no evidence`);
  const against = review.reviewedAgainst;
  if (against !== undefined && !isReviewRecord(against)) {
    problems.push(`${label} has a reviewedAgainst that is not a mapping`);
  } else if (against !== undefined) {
    if (!Array.isArray(against.paths) || against.paths.length === 0) {
      problems.push(`${label} has no reviewedAgainst.paths scope`);
    }
    if (against.digest !== undefined && !REVIEW_DIGEST.test(String(against.digest))) {
      problems.push(`${label} has invalid reviewedAgainst.digest`);
    }
  }
  if (successor) {
    if (!nonEmptyString(review.reviewerRole)) problems.push(`${label} has no reviewerRole`);
    if (!nonEmptyString(against?.revision)) problems.push(`${label} has no reviewedAgainst.revision`);
    if (!nonEmptyString(against?.tree)) problems.push(`${label} has no reviewedAgainst.tree`);
    if (!nonEmptyString(against?.digest)) problems.push(`${label} has no reviewedAgainst.digest`);
    if (against === undefined) problems.push(`${label} has no reviewedAgainst.paths scope`);
  }
  return problems;
}

/** Canonical SHA-256 of one review event, as recorded in the legacy-prefix manifest. */
export function reviewEventSha256(event) {
  return eventSha256(event);
}

/**
 * Resolve and validate one rule's review history.
 *
 * `trustedPrefixLength` is only for a prefix already read from a trusted immutable source, such as
 * a named Git commit or the pinned manifest. Events inside it are not re-validated field by field
 * (they predate the field contract) but remain part of the chain. Every event at or after the
 * boundary is validated structurally; every successor must carry the renewal contract. The default
 * is strict for every event. A caller must never derive the boundary from proposed input, because
 * doing so would grandfather the very append being validated.
 */
export function resolveReviewHistory(ruleId, record, { trustedPrefixLength = 0 } = {}) {
  const none = (problems) => ({ reviews: [], problems, current: null, currentIndex: -1 });
  if (record === undefined) return none([]);
  if (!isReviewRecord(record)) {
    return none([`${ruleId}: attestation record is not a mapping`]);
  }
  if (Object.hasOwn(record, "reviews") && !Array.isArray(record.reviews)) {
    return none([`${ruleId}: reviews is not a list of review events`]);
  }

  const reviews = [...reviewsOf(record)];
  const problems = [];

  if (reviews.length === 0) {
    problems.push(`${ruleId}: review history has no genesis event`);
    return { reviews, problems, current: null, currentIndex: -1 };
  }

  const idPositions = new Map();
  for (const [index, review] of reviews.entries()) {
    if (!nonEmptyString(review?.id)) {
      // The pre-migration single-record shape carries no id; every event of a list must.
      if (!(isLegacyShape(record) && index === 0)) problems.push(`${ruleId}: review at position ${index} has no id`);
      continue;
    }
    const positions = idPositions.get(review.id) ?? [];
    positions.push(index);
    idPositions.set(review.id, positions);
    if (positions.length > 1) problems.push(`${ruleId}: duplicate review id ${review.id}`);
  }

  const genesis = reviews[0];
  if (genesis?.supersedes !== undefined && genesis?.supersedes !== null) {
    problems.push(`${ruleId}: genesis review ${genesis?.id ?? "(missing id)"} has a predecessor`);
  }

  const successorCounts = new Map();
  for (let index = 1; index < reviews.length; index += 1) {
    const review = reviews[index];
    const predecessor = reviews[index - 1];
    const supersedes = review?.supersedes;

    if (!nonEmptyString(supersedes)) {
      problems.push(`${ruleId}: successor review ${review?.id ?? "(missing id)"} has no predecessor`);
    } else {
      successorCounts.set(supersedes, (successorCounts.get(supersedes) ?? 0) + 1);
      if (supersedes === review?.id) {
        problems.push(`${ruleId}: review ${review.id} has a self-reference`);
      } else if (supersedes !== predecessor?.id) {
        const positions = idPositions.get(supersedes) ?? [];
        if (positions.some((position) => position > index)) {
          problems.push(`${ruleId}: review ${review?.id ?? "(missing id)"} has a forward reference to ${supersedes}`);
        } else if (positions.some((position) => position < index)) {
          problems.push(
            `${ruleId}: review ${review?.id ?? "(missing id)"} skipped predecessor ${predecessor?.id ?? "(missing id)"} and references ${supersedes}`,
          );
        } else {
          problems.push(
            `${ruleId}: review ${review?.id ?? "(missing id)"} supersedes ${supersedes}, which is not recorded here (disconnected)`,
          );
        }
      }
    }

    const previousTime = predecessor?.reviewedAt;
    const nextTime = review?.reviewedAt;
    if (previousTime && nextTime && previousTime > nextTime) {
      problems.push(
        `${ruleId}: reviews are not in chronological order (${previousTime} precedes ${nextTime} in the file, but is later in time)`,
      );
    }
  }

  for (const [predecessor, count] of successorCounts) {
    if (count > 1) problems.push(`${ruleId}: fork from predecessor ${predecessor} has ${count} successors`);
  }

  if (!Number.isInteger(trustedPrefixLength) || trustedPrefixLength < 0 || trustedPrefixLength > reviews.length) {
    problems.push(`${ruleId}: trustedPrefixLength is outside the review history`);
  }
  const strictStart = Number.isInteger(trustedPrefixLength) && trustedPrefixLength >= 0 ? trustedPrefixLength : 0;
  for (let index = strictStart; index < reviews.length; index += 1) {
    problems.push(...eventFieldProblems(ruleId, reviews[index], { successor: index > 0 }));
  }

  const currentIndex = problems.length === 0 ? reviews.length - 1 : -1;
  return {
    reviews,
    problems,
    current: currentIndex >= 0 ? reviews[currentIndex] : null,
    currentIndex,
  };
}

function anchorProblem(ruleId, why) {
  return (
    `${ruleId}: ${why}; the history must carry the complete ordered prefix anchored at ` +
    `${LEGACY_REVIEW_PREFIX_MANIFEST.baseCommit} (tree ${LEGACY_REVIEW_PREFIX_MANIFEST.baseTree})`
  );
}

/**
 * Resolve a supplied policy record against the pinned legacy-prefix manifest.
 *
 * The outer caller supplies `ruleId`; record contents never choose their rule. For any rule key in
 * the manifest, the history MUST carry every anchored event, in order, hash-equal, regardless of
 * what ids the record uses. A missing prefix, a pre-migration single-record shape, a non-list
 * `reviews`, or a replacement history that merely starts afresh is a problem and selects no current
 * review. A rule key that is not in the manifest is resolved strictly with no exemption.
 */
export function resolveRecordedReviewHistory(ruleId, record) {
  assertRuleId("resolveRecordedReviewHistory", ruleId);
  const anchor = LEGACY_REVIEW_PREFIX_MANIFEST.histories[ruleId];
  if (!anchor || record === undefined) return resolveReviewHistory(ruleId, record);

  const strict = resolveReviewHistory(ruleId, record);
  const reviews = reviewsOf(record);
  if (!isReviewRecord(record) || !Array.isArray(record.reviews)) {
    return {
      ...strict,
      problems: [...strict.problems, anchorProblem(ruleId, "the anchored history is not in review-event form")],
      current: null,
      currentIndex: -1,
    };
  }
  const mismatch = anchor.events.findIndex(
    (expected, index) => reviews[index]?.id !== expected.id || eventSha256(reviews[index]) !== expected.sha256,
  );
  if (reviews.length < anchor.events.length || mismatch !== -1) {
    const why =
      reviews.length < anchor.events.length
        ? `the anchored history has ${reviews.length} of ${anchor.events.length} required events`
        : `anchored event ${anchor.events[mismatch].id} is missing, altered or out of order`;
    return {
      ...strict,
      problems: [...strict.problems, anchorProblem(ruleId, why)],
      current: null,
      currentIndex: -1,
    };
  }
  return resolveReviewHistory(ruleId, record, { trustedPrefixLength: anchor.events.length });
}

function assertRuleId(fn, ruleId) {
  if (!nonEmptyString(ruleId)) {
    const kind = ruleId === null ? "null" : Array.isArray(ruleId) ? "array" : typeof ruleId;
    throw new TypeError(
      `${fn}(ruleId, record): ruleId must be a non-empty string, got ${kind}; ` +
        `the rule id is the first argument and the record the second`,
    );
  }
}

/** Every structural problem in a rule's history; empty only for a single valid terminal chain. */
export function reviewProblems(ruleId, record) {
  assertRuleId("reviewProblems", ruleId);
  return resolveRecordedReviewHistory(ruleId, record).problems;
}

/** The single chain-derived terminal event, or null when none can be established. */
export function currentReview(ruleId, record) {
  assertRuleId("currentReview", ruleId);
  return resolveRecordedReviewHistory(ruleId, record).current;
}

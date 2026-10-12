import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Review histories are immutable, rule-scoped event chains.
 *
 * This module reads one fixed, repository-shipped legacy-prefix manifest. It invokes no provider,
 * has no mutable process state, and never mutates the supplied record. `reviewerRole` is structural
 * provenance only. Neither it nor any other field in a local policy authenticates a person or
 * authorizes a governance role.
 */

/** Every review event for a rule, oldest first. */
export function reviewsOf(record) {
  if (!record) return [];
  if (Array.isArray(record.reviews)) return record.reviews;
  return [record]; // Legacy single-record shape.
}

/** True when the record still uses the pre-migration single-record shape. */
export function isLegacyShape(record) {
  return Boolean(record) && !Array.isArray(record.reviews);
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

function successorFieldProblems(ruleId, review) {
  const problems = [];
  const label = `${ruleId}: successor review ${review?.id ?? "(missing id)"}`;
  if (!nonEmptyString(review?.reviewedBy)) problems.push(`${label} has no reviewedBy identity`);
  if (!nonEmptyString(review?.reviewerRole)) problems.push(`${label} has no reviewerRole`);
  if (!nonEmptyString(review?.reviewedAt)) problems.push(`${label} has no reviewedAt timestamp`);
  if (!nonEmptyString(review?.evidence)) problems.push(`${label} has no evidence`);
  if (!nonEmptyString(review?.reviewedAgainst?.revision)) {
    problems.push(`${label} has no reviewedAgainst.revision`);
  }
  if (!nonEmptyString(review?.reviewedAgainst?.tree)) {
    problems.push(`${label} has no reviewedAgainst.tree`);
  }
  if (!nonEmptyString(review?.reviewedAgainst?.digest)) {
    problems.push(`${label} has no reviewedAgainst.digest`);
  } else if (!REVIEW_DIGEST.test(review.reviewedAgainst.digest)) {
    problems.push(`${label} has invalid reviewedAgainst.digest`);
  }
  if (!Array.isArray(review?.reviewedAgainst?.paths) || review.reviewedAgainst.paths.length === 0) {
    problems.push(`${label} has no reviewedAgainst.paths scope`);
  }
  return problems;
}

/**
 * Resolve and validate one rule's review history.
 *
 * `trustedPrefixLength` is only for a prefix already read from a trusted immutable source, such as
 * a named Git commit. Historical events in that prefix predate the successor field contract and
 * remain readable; every successor at or after the boundary must carry the new structural fields.
 * The default is strict for every successor. A caller must never derive the boundary from proposed
 * input, because doing so would grandfather the very append being validated.
 */
export function resolveReviewHistory(ruleId, record, { trustedPrefixLength = 0 } = {}) {
  const reviews = [...reviewsOf(record)];
  const problems = [];

  if (reviews.length === 0) {
    if (record) problems.push(`${ruleId}: review history has no genesis event`);
    return { reviews, problems, current: null, currentIndex: -1 };
  }

  // The pre-migration single-record shape is one genesis event and has no predecessor contract.
  if (isLegacyShape(record)) return { reviews, problems, current: reviews[0], currentIndex: 0 };

  const idPositions = new Map();
  for (const [index, review] of reviews.entries()) {
    if (!nonEmptyString(review?.id)) {
      problems.push(`${ruleId}: review at position ${index} has no id`);
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
  const strictStart = Math.max(
    1,
    Number.isInteger(trustedPrefixLength) && trustedPrefixLength >= 0 ? trustedPrefixLength : 0,
  );
  for (let index = strictStart; index < reviews.length; index += 1) {
    problems.push(...successorFieldProblems(ruleId, reviews[index]));
  }

  const currentIndex = problems.length === 0 ? reviews.length - 1 : -1;
  return {
    reviews,
    problems,
    current: currentIndex >= 0 ? reviews[currentIndex] : null,
    currentIndex,
  };
}

function withLegacyAnchorProblem(ruleId, resolution) {
  return {
    ...resolution,
    problems: [
      ...resolution.problems,
      `${ruleId}: legacy review prefix does not match the complete ordered prefix anchored at ` +
        `${LEGACY_REVIEW_PREFIX_MANIFEST.baseCommit} (tree ${LEGACY_REVIEW_PREFIX_MANIFEST.baseTree})`,
    ],
    current: null,
    currentIndex: -1,
  };
}

/**
 * Resolve a supplied policy record against the fixed legacy-prefix manifest.
 *
 * The outer caller supplies `ruleId`; record contents never choose their rule. A compatibility
 * boundary exists only when every event in that rule's complete anchored prefix matches its ordered
 * canonical hash. A partial or altered anchored history fails closed. An unrelated strict history
 * under the same canonical rule id remains valid and receives no compatibility exemption.
 */
export function resolveRecordedReviewHistory(record, ruleId) {
  const label = nonEmptyString(ruleId) ? ruleId : "(unanchored review)";
  const strict = () => resolveReviewHistory(label, record);
  if (!nonEmptyString(ruleId)) return strict();

  const anchor = LEGACY_REVIEW_PREFIX_MANIFEST.histories[ruleId];
  if (!anchor) return strict();
  const reviews = reviewsOf(record);
  const anchoredIds = new Set(anchor.events.map((event) => event.id));
  const mentionsAnchoredEvent = reviews.some((review) => anchoredIds.has(review?.id));
  const completePrefix =
    Array.isArray(record?.reviews) &&
    reviews.length >= anchor.events.length &&
    anchor.events.every(
      (expected, index) =>
        reviews[index]?.id === expected.id && eventSha256(reviews[index]) === expected.sha256,
    );

  if (completePrefix) {
    return resolveReviewHistory(ruleId, record, { trustedPrefixLength: anchor.events.length });
  }
  const resolution = strict();
  return mentionsAnchoredEvent ? withLegacyAnchorProblem(ruleId, resolution) : resolution;
}

/** One argument is intentionally strict and unanchored; the rule id must come from an outer key. */
export function reviewProblems(record, ruleId) {
  return resolveRecordedReviewHistory(record, ruleId).problems;
}

/** Compatibility wrapper returning the sole resolver-derived terminal event. */
export function currentReview(record, ruleId) {
  return resolveRecordedReviewHistory(record, ruleId).current;
}

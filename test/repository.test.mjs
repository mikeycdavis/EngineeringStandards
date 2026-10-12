/**
 * Tests for repository content as an evidence source.
 *
 * The defect these exist for: attestation freshness was computed by hashing working-tree bytes,
 * while Git's identity for a commit is normalised repository content. Git converts line endings on
 * the way in and materialises them per platform on the way out, so two clean checkouts of one
 * commit can hold different bytes and both report unmodified. Three materialisations of commit
 * 5b4b917 in this repository produced three different freshness answers, and the pristine one is
 * what `ubuntu-latest` + `actions/checkout` hands a CI runner. A mandatory merge gate whose
 * attestation freshness depends on checkout line endings would be mechanically authoritative and
 * epistemically unreliable.
 *
 * The invariant under test: for a clean checkout of commit C, the digest for a reviewed path set is
 * identical in every checkout of C, regardless of platform line-ending materialisation.
 *
 * These drive real Git rather than a mock. The bug lived in the gap between what Git stores and
 * what it materialises, and a mock of Git is written from the same misunderstanding that produced
 * the bug — it would have agreed with the broken implementation.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
import {
  repositoryDigest,
  repositoryAvailable,
  classifyFreshness,
  DIGEST_ALGORITHM,
  LEGACY_ALGORITHM,
  FRESHNESS,
} from "../scripts/repository.mjs";
import {
  reviewsOf,
  resolveReviewHistory,
  resolveRecordedReviewHistory,
  LEGACY_REVIEW_PREFIX_MANIFEST,
  currentReview,
  reviewProblems,
  isLegacyShape,
} from "../scripts/reviews.mjs";
import { checkPolicy } from "../scripts/policy.mjs";
import { evaluate } from "../scripts/compliance.mjs";
import { parseYaml } from "../scripts/yaml.mjs";

const git = (cwd, ...args) => {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
};

/** A repository with one committed file whose content contains several lines. */
async function repoWith(content = "alpha\nbeta\ngamma\n", name = "reviewed.txt") {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-repo-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.invalid");
  git(dir, "config", "user.name", "Test");
  git(dir, "config", "commit.gpgsign", "false");
  await writeFile(path.join(dir, name), content);
  git(dir, "add", name);
  git(dir, "commit", "-q", "-m", "initial");
  return dir;
}

const cleanup = (dir) => rm(dir, { recursive: true, force: true });
const byteHash = async (dir, rel) =>
  createHash("sha256").update(rel).update(await readFile(path.join(dir, rel), "utf8")).digest("hex").slice(0, 32);

test("the digest survives a line-ending re-materialisation that changes every byte", async () => {
  // This is the defect, reproduced end to end. The commit does not change; only how Git writes it
  // into the working tree does. The old mechanism's answer changes, the new one's must not.
  const dir = await repoWith();
  try {
    const before = repositoryDigest(dir, ["reviewed.txt"]);
    const bytesBefore = await byteHash(dir, "reviewed.txt");

    // Re-materialise with CRLF, the way a Windows checkout would.
    git(dir, "config", "core.autocrlf", "true");
    await rm(path.join(dir, "reviewed.txt"));
    git(dir, "checkout", "--", "reviewed.txt");

    const after = repositoryDigest(dir, ["reviewed.txt"]);
    const bytesAfter = await byteHash(dir, "reviewed.txt");

    assert.equal(git(dir, "status", "--porcelain").trim(), "", "the re-materialised tree must be clean");
    assert.equal(after.digest, before.digest, "committed identity must not depend on materialisation");

    // The known-positive for the defect: without this, the test above could pass because nothing
    // actually changed on disk, and the regression it guards would be untested.
    assert.notEqual(bytesAfter, bytesBefore, "the working-tree bytes must genuinely have changed");
  } finally {
    await cleanup(dir);
  }
});

test("the digest does not depend on the order paths were written in the policy", async () => {
  const dir = await repoWith();
  try {
    await writeFile(path.join(dir, "second.txt"), "two\n");
    git(dir, "add", "second.txt");
    git(dir, "commit", "-q", "-m", "second");
    const a = repositoryDigest(dir, ["reviewed.txt", "second.txt"]);
    const b = repositoryDigest(dir, ["second.txt", "reviewed.txt"]);
    assert.equal(a.digest, b.digest);
  } finally {
    await cleanup(dir);
  }
});

test("a modified tracked file is stale, and reverting it is fresh again", async () => {
  const dir = await repoWith();
  try {
    const against = {
      paths: ["reviewed.txt"],
      digestAlgorithm: DIGEST_ALGORITHM,
      digest: repositoryDigest(dir, ["reviewed.txt"]).digest,
    };
    const avail = repositoryAvailable(dir);
    assert.equal(classifyFreshness(dir, against, avail).state, FRESHNESS.fresh);

    // HEAD still matches, but the tree being validated does not. Stale, not fresh — otherwise
    // editing a reviewed file locally would keep its approval alive.
    await writeFile(path.join(dir, "reviewed.txt"), "alpha\nbeta\nDELTA\n");
    const dirty = classifyFreshness(dir, against, avail);
    assert.equal(dirty.state, FRESHNESS.stale);
    assert.match(dirty.detail, /modified in the working tree/);

    git(dir, "checkout", "--", "reviewed.txt");
    assert.equal(classifyFreshness(dir, against, avail).state, FRESHNESS.fresh, "reverting restores freshness");
  } finally {
    await cleanup(dir);
  }
});

test("committing a change to a reviewed path is stale", async () => {
  const dir = await repoWith();
  try {
    const against = {
      paths: ["reviewed.txt"],
      digestAlgorithm: DIGEST_ALGORITHM,
      digest: repositoryDigest(dir, ["reviewed.txt"]).digest,
    };
    await writeFile(path.join(dir, "reviewed.txt"), "alpha\nbeta\nEPSILON\n");
    git(dir, "commit", "-q", "-a", "-m", "change");
    const r = classifyFreshness(dir, against, repositoryAvailable(dir));
    assert.equal(r.state, FRESHNESS.stale);
    assert.match(r.detail, /committed content changed/);
  } finally {
    await cleanup(dir);
  }
});

test("a deleted reviewed path is stale, but a never-tracked one is evidence-unavailable", async () => {
  // The distinction the user of this output has to act on. A path that was reviewed and is now gone
  // is an observable content change. A path the repository never tracked has no identity to compare
  // against at all, and calling that "changed" would assert something nothing established.
  const dir = await repoWith();
  try {
    const avail = repositoryAvailable(dir);
    const tracked = {
      paths: ["reviewed.txt"],
      digestAlgorithm: DIGEST_ALGORITHM,
      digest: repositoryDigest(dir, ["reviewed.txt"]).digest,
    };
    git(dir, "rm", "-q", "reviewed.txt");
    git(dir, "commit", "-q", "-m", "remove the reviewed file");
    const deleted = classifyFreshness(dir, tracked, avail);
    assert.equal(deleted.state, FRESHNESS.stale, "a reviewed path that was deleted is a content change");

    const untracked = {
      paths: ["never-committed.txt"],
      digestAlgorithm: DIGEST_ALGORITHM,
      digest: "abcdef1234567890",
    };
    await writeFile(path.join(dir, "never-committed.txt"), "present but untracked\n");
    const missing = classifyFreshness(dir, untracked, avail);
    assert.equal(missing.state, FRESHNESS.evidenceUnavailable);
    assert.match(missing.detail, /no committed identity/);
  } finally {
    await cleanup(dir);
  }
});

test("a directory that is not a repository yields evidence-unavailable, never fresh or stale", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-norepo-"));
  try {
    await writeFile(path.join(dir, "reviewed.txt"), "alpha\nbeta\ngamma\n");
    const avail = repositoryAvailable(dir);
    assert.equal(avail.available, false);

    const r = classifyFreshness(
      dir,
      { paths: ["reviewed.txt"], digestAlgorithm: DIGEST_ALGORITHM, digest: "abcdef1234567890" },
      avail,
    );
    assert.equal(r.state, FRESHNESS.evidenceUnavailable);
    assert.notEqual(r.state, FRESHNESS.stale, "inability to compare must never be reported as a change");
    assert.notEqual(r.state, FRESHNESS.fresh, "and must never establish anything");
  } finally {
    await cleanup(dir);
  }
});

test("a legacy digest is classified, never compared — whatever the content is now", async () => {
  // The migration rule: a record produced by the superseded mechanism cannot establish freshness,
  // and cannot be rescued by recomputation. Asserting this against BOTH unchanged and changed
  // content is the point — the classification must not depend on content, because the old digest
  // is not a comparable identity in the first place.
  const dir = await repoWith();
  try {
    const avail = repositoryAvailable(dir);
    const legacy = { paths: ["reviewed.txt"], digest: "abcdef1234567890" }; // no digestAlgorithm
    assert.equal(classifyFreshness(dir, legacy, avail).state, FRESHNESS.legacyUnverifiable);

    await writeFile(path.join(dir, "reviewed.txt"), "totally different\n");
    git(dir, "commit", "-q", "-a", "-m", "change");
    assert.equal(
      classifyFreshness(dir, legacy, avail).state,
      FRESHNESS.legacyUnverifiable,
      "a legacy record does not become stale; it was never verifiable",
    );

    const explicit = { ...legacy, digestAlgorithm: LEGACY_ALGORITHM };
    assert.equal(classifyFreshness(dir, explicit, avail).state, FRESHNESS.legacyUnverifiable);
  } finally {
    await cleanup(dir);
  }
});

test("an unknown digestAlgorithm is evidence-unavailable rather than assumed", async () => {
  const dir = await repoWith();
  try {
    const r = classifyFreshness(
      dir,
      { paths: ["reviewed.txt"], digestAlgorithm: "something-invented-later", digest: "abcdef1234567890" },
      repositoryAvailable(dir),
    );
    assert.equal(r.state, FRESHNESS.evidenceUnavailable);
  } finally {
    await cleanup(dir);
  }
});

test("this repository's digests are identical in two divergent materialisations of one commit", async () => {
  // The integration case that started this: two worktrees of the same commit whose working-tree
  // bytes genuinely differ. Skipped rather than failed where the sibling worktree does not exist,
  // because its absence is a fact about this machine, not about the mechanism.
  const a = REPO_ROOT;
  const b = path.resolve(REPO_ROOT, "..", "EngineeringStandards-reconcile");
  if (!repositoryAvailable(a).available || !repositoryAvailable(b).available) return;

  // The property is "one commit, every checkout". Where the two worktrees have diverged the
  // precondition does not hold, and the test states that rather than comparing unrelated commits
  // and reporting a failure of the mechanism. The synthetic re-materialisation test above covers
  // the mechanism deterministically; this one only adds real-world corroboration when it can.
  const head = (dir) => git(dir, "rev-parse", "HEAD").trim();
  if (head(a) !== head(b)) return;

  const paths = ["test/audit.test.mjs", "test/compliance.test.mjs"];
  const da = repositoryDigest(a, paths);
  const db = repositoryDigest(b, paths);
  if (!da.ok || !db.ok) return;
  assert.equal(da.digest, db.digest, "the same commit must digest identically in every checkout");
});

// --- The migration inventory ---------------------------------------------------------------------

test("the inventory reports every attestation and refuses to auto-upgrade any of them", () => {
  // "0 safely auto-upgradable" is a structural fact about a digest-algorithm migration, not a count
  // that might one day be higher. Recomputing an old digest from the revision it names would prove
  // the content at that revision, never the surface the reviewer examined, because the superseded
  // mechanism hashed bytes the commit did not uniquely determine.
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "attestations.mjs"), `--dir=${REPO_ROOT}`, "--json"],
    { encoding: "utf8" },
  );
  const json = JSON.parse(r.stdout);

  assert.equal(json.safelyAutoUpgradable, 0);
  assert.ok(json.total > 0, "this repository has attestations to report on");
  assert.deepEqual(json.violations, [], "the policy must satisfy its own post-migration invariants");
  for (const a of json.attestations) {
    assert.equal(a.autoUpgradable, false, `${a.rule} must never be marked auto-upgradable`);
    assert.ok(a.disposition, `${a.rule} must report what the human decided`);
    assert.ok(a.id, `${a.rule} must report which review event this is`);
    assert.ok(a.freshness, `${a.rule} must report whether that decision establishes current state`);
  }
});

test("every recorded digest names the algorithm that produced it", () => {
  // The post-migration invariant: a legacy digest without algorithm metadata is impossible, because
  // an unlabelled digest is indistinguishable from a deterministic one and would be compared as if
  // it were reproducible.
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "attestations.mjs"), `--dir=${REPO_ROOT}`, "--json"],
    { encoding: "utf8" },
  );
  for (const a of JSON.parse(r.stdout).attestations) {
    if (a.paths.length === 0) continue;
    assert.ok(
      a.algorithm === "git-blob-set-sha256-v1" || a.algorithm === "working-tree-bytes-sha256-v1",
      `${a.rule} records a digest under an unnamed algorithm: ${a.algorithm}`,
    );
  }
});

// --- Reviews are events, not mutable state ------------------------------------------------------
//
// The invariant, stronger and simpler than talking about digests specifically:
//
//   No operation that records a new review may alter or delete any previously recorded review event.
//
// Re-review appends provenance; it never rewrites it. That is what keeps the record proving a
// migration was necessary alive through the migration that answers it.

const review = (over = {}) => ({
  id: "review-001",
  status: "approved",
  reviewedBy: "owner",
  reviewerRole: "synthetic-role",
  reviewedAt: "2026-08-01",
  evidence: "looked at it",
  reviewedAgainst: {
    revision: "1111111111111111111111111111111111111111",
    tree: "2222222222222222222222222222222222222222",
    digest: "abcdef1234567890",
    digestAlgorithm: DIGEST_ALGORITHM,
    source: "git",
    paths: ["a.mjs"],
  },
  ...over,
});

test("the newest review is the one eligible to establish, and earlier ones stay inspectable", () => {
  const record = {
    reviews: [
      review({ id: "r1", reviewedAt: "2026-08-01", status: "rejected" }),
      review({ id: "r2", reviewedAt: "2026-08-09", supersedes: "r1" }),
    ],
  };
  assert.equal(currentReview(record, "x.y").id, "r2");
  assert.equal(reviewsOf(record).length, 2, "history remains fully readable");
  assert.equal(reviewsOf(record)[0].status, "rejected", "a rejected review stays rejected forever");
});

test("appending a review leaves every earlier event byte-identical", () => {
  // The migration invariant, asserted directly. Appending is the only way to record a new judgement,
  // so the operation that records one cannot be the operation that destroys the last one.
  const first = review({
    id: "r1",
    reviewedAgainst: { ...review().reviewedAgainst, paths: ["a.mjs"], digest: "abcdef1234567890" },
  });
  const snapshot = JSON.stringify(first);
  const record = { reviews: [first] };

  record.reviews.push(review({ id: "r2", reviewedAt: "2026-08-09", supersedes: "r1" }));

  assert.equal(JSON.stringify(record.reviews[0]), snapshot, "the predecessor must be untouched");
  assert.equal(currentReview(record, "x.y").id, "r2");
});

test("a malformed history establishes nothing rather than establishing the last element", () => {
  // Selecting by array position from an unvalidated sequence would make the file's layout the
  // chronology: reorder two lines and the established review changes with nothing recording it.
  const duplicate = { reviews: [review({ id: "r1" }), review({ id: "r1", reviewedAt: "2026-08-09" })] };
  assert.match(reviewProblems(duplicate, "x.y").join(), /duplicate review id/);
  assert.equal(currentReview(duplicate, "x.y"), null);

  const misordered = {
    reviews: [review({ id: "r1", reviewedAt: "2026-08-09" }), review({ id: "r2", reviewedAt: "2026-08-01" })],
  };
  assert.match(reviewProblems(misordered, "x.y").join(), /chronological order/);
  assert.equal(currentReview(misordered, "x.y"), null);

  const anonymous = { reviews: [{ status: "approved", reviewedBy: "o", reviewedAt: "2026-08-01", evidence: "e" }] };
  assert.match(reviewProblems(anonymous, "x.y").join(), /has no id/);

  const dangling = { reviews: [review({ id: "r1" }), review({ id: "r2", reviewedAt: "2026-08-09", supersedes: "nope" })] };
  assert.match(reviewProblems(dangling, "x.y").join(), /supersedes nope, which is not recorded/);
});

test("the legacy single-record shape is still readable during the migration window", () => {
  const legacy = { status: "approved", reviewedBy: "owner", reviewedAt: "2026-08-01", evidence: "e" };
  assert.equal(isLegacyShape(legacy), true);
  assert.equal(reviewsOf(legacy).length, 1);
  assert.equal(currentReview(legacy, "x.y").status, "approved");
  assert.deepEqual(reviewProblems(legacy, "x.y"), [], "an unmigrated record is not itself an error");
});

test("strict wrappers reject an incomplete appended successor and select no current review", () => {
  const successor = review({ id: "r2", supersedes: "r1", reviewedAt: "2026-08-09" });
  delete successor.reviewedAgainst.digest;
  const record = { reviews: [review({ id: "r1" }), successor] };
  assert.match(reviewProblems(record, "x.y").join("\n"), /reviewedAgainst\.digest/);
  assert.equal(currentReview(record, "x.y"), null);
});

test("attestation inventory marks no event current when an appended successor is incomplete", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-invalid-review-inventory-"));
  const source = `standardVersion: "2.0.0"
attestations:
  testing.synthetic:
    reviews:
      - id: "r1"
        status: "rejected"
        reviewedBy: "synthetic-reviewer"
        reviewedAt: "2026-10-01"
        evidence: "synthetic genesis"
      - id: "r2"
        supersedes: "r1"
        status: "approved"
        reviewedBy: "synthetic-reviewer"
        reviewedAt: "2026-10-02"
        evidence: "synthetic incomplete successor"
        reviewedAgainst:
          revision: "1111111111111111111111111111111111111111"
          tree: "2222222222222222222222222222222222222222"
          digest: "abcdef1234567890"
          digestAlgorithm: "git-blob-set-sha256-v1"
          source: "git"
          paths:
            - "synthetic.txt"
`;
  try {
    await writeFile(path.join(dir, "project-policy.yml"), source);
    const result = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, "scripts", "attestations.mjs"), `--dir=${dir}`, "--json"],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stderr);
    const inventory = JSON.parse(result.stdout);
    assert.match(inventory.violations.join("\n"), /reviewerRole/);
    assert.equal(inventory.attestations.filter((entry) => entry.current).length, 0);
  } finally {
    await cleanup(dir);
  }
});

test("the compliance call path cannot accept a rule through an incomplete appended successor", () => {
  const rule = {
    id: "testing.synthetic",
    level: "required",
    severity: "error",
    validationType: "manual-review",
    attestable: true,
    nonExemptible: false,
  };
  const successor = review({ id: "r2", supersedes: "r1", reviewedAt: "2026-08-09" });
  delete successor.reviewerRole;
  const verdict = evaluate({
    catalog: { rules: new Map([[rule.id, rule]]), aliases: new Map() },
    policy: { attestations: { [rule.id]: { reviews: [review({ id: "r1" }), successor] } } },
    findings: [],
    evaluated: [],
    today: "2026-10-12",
    freshness: new Map([[rule.id, { state: "fresh", detail: null }]]),
  });
  const result = verdict.results.find((entry) => entry.ruleId === rule.id);
  assert.equal(result.status, "failed");
  assert.equal(result.disposition, "invalid-attestation");
  assert.ok(!verdict.results.some((entry) => entry.disposition === "attested"));
});

test("this repository's own policy is fully migrated and every event carries provenance metadata", () => {
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "attestations.mjs"), `--dir=${REPO_ROOT}`, "--json"],
    { encoding: "utf8" },
  );
  const json = JSON.parse(r.stdout);
  assert.deepEqual(json.violations, []);
  for (const a of json.attestations) {
    assert.equal(a.shape, "review-event", `${a.rule} is still in the pre-migration shape`);
    assert.ok(a.id, `${a.rule} has an event without an id`);
  }
});

// These deterministic actor and role values are synthetic structural fixtures. They do not
// represent authenticated people or an authorization decision.
const structuralReview = (over = {}) => ({
  id: "r1",
  status: "approved",
  reviewedBy: "synthetic-reviewer",
  reviewerRole: "synthetic-role",
  reviewedAt: "2026-10-01",
  evidence: "synthetic structural evidence",
  reviewedAgainst: {
    revision: "1111111111111111111111111111111111111111",
    tree: "2222222222222222222222222222222222222222",
    paths: ["synthetic.txt"],
    digest: "abcdef1234567890",
    digestAlgorithm: DIGEST_ALGORITHM,
    source: "git",
  },
  ...over,
});

test("the policy schema accepts optional structural reviewerRole and reviewedAgainst.tree fields", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-review-schema-"));
  const policyPath = path.join(dir, "project-policy.yml");
  const schemaPath = path.join(REPO_ROOT, "schemas", "project-policy.schema.json");
  const source = `standardVersion: "2.0.0"
attestations:
  testing.synthetic:
    reviews:
      - id: "synthetic-genesis"
        status: "approved"
        reviewedBy: "synthetic-reviewer"
        reviewerRole: "synthetic-role"
        reviewedAt: "2026-10-01"
        evidence: "synthetic structural evidence"
        reviewedAgainst:
          revision: "1111111111111111111111111111111111111111"
          tree: "2222222222222222222222222222222222222222"
          paths:
            - "synthetic.txt"
`;
  try {
    await writeFile(policyPath, source);
    const valid = await checkPolicy(policyPath, schemaPath, "2026-10-12");
    assert.deepEqual(valid.errors, []);

    await writeFile(policyPath, source.replace("2222222222222222222222222222222222222222", "not-a-tree"));
    const invalid = await checkPolicy(policyPath, schemaPath, "2026-10-12");
    assert.equal(invalid.status, "invalid");
    assert.ok(invalid.errors.length > 0, "the invalid tree must produce a schema error");
  } finally {
    await cleanup(dir);
  }
});

test("the shared resolver accepts legacy and new genesis records and derives one terminal event", () => {
  const legacy = { status: "approved", reviewedBy: "legacy", reviewedAt: "2026-08-01", evidence: "legacy" };
  const legacyResult = resolveReviewHistory("x.legacy", legacy);
  assert.deepEqual(legacyResult.problems, []);
  assert.equal(legacyResult.current, legacy);
  assert.equal(legacyResult.currentIndex, 0);

  const genesis = structuralReview();
  const modernResult = resolveReviewHistory("x.modern", { reviews: [genesis] });
  assert.deepEqual(modernResult.problems, []);
  assert.equal(modernResult.current, genesis);
  assert.equal(modernResult.currentIndex, 0);
});

test("the shared resolver accepts one linear successor chain, equal timestamps, and rule-scoped ids", () => {
  const record = {
    reviews: [
      structuralReview({ id: "shared", reviewedAt: "2026-10-01" }),
      structuralReview({ id: "r2", supersedes: "shared", reviewedAt: "2026-10-01" }),
      structuralReview({ id: "r3", supersedes: "r2", reviewedAt: "2026-10-02" }),
    ],
  };
  const snapshot = JSON.stringify(record);
  const first = resolveReviewHistory("x.first", record);
  const second = resolveReviewHistory("x.second", { reviews: [structuralReview({ id: "shared" })] });
  assert.deepEqual(first.problems, []);
  assert.deepEqual(second.problems, [], "the same event id is valid in another rule");
  assert.equal(first.current.id, "r3");
  assert.equal(first.currentIndex, 2);
  assert.equal(JSON.stringify(record), snapshot, "resolution must not mutate the supplied history");
});

test("the fixed Git-base manifest recognizes all eight complete legacy prefixes without mutating them", async () => {
  const policy = parseYaml(await readFile(path.join(REPO_ROOT, "project-policy.yml"), "utf8"));
  const manifestRules = Object.entries(LEGACY_REVIEW_PREFIX_MANIFEST.histories);
  assert.equal(LEGACY_REVIEW_PREFIX_MANIFEST.baseCommit, "1e22c3a12bc42fb299712176c597b7498e944ec2");
  assert.equal(LEGACY_REVIEW_PREFIX_MANIFEST.baseTree, "3d00e25613cdf4517d725c0d2229f92f6718543b");
  assert.equal(manifestRules.length, 8);
  assert.equal(manifestRules.reduce((total, [, entry]) => total + entry.events.length, 0), 46);

  for (const [ruleId, anchor] of manifestRules) {
    const record = policy.attestations[ruleId];
    const snapshot = JSON.stringify(record);
    const resolution = resolveRecordedReviewHistory(record, ruleId);
    assert.deepEqual(resolution.problems, [], ruleId);
    assert.equal(resolution.current?.id, anchor.events.at(-1).id, ruleId);
    assert.equal(JSON.stringify(record), snapshot, `${ruleId} was mutated`);
  }
});

test("legacy compatibility requires the complete exact rule-scoped prefix and keeps every append strict", async () => {
  const policy = parseYaml(await readFile(path.join(REPO_ROOT, "project-policy.yml"), "utf8"));
  const ruleId = "ai.destructive-approval";
  const original = policy.attestations[ruleId];
  const expectAnchorFailure = (record, label) => {
    const resolution = resolveRecordedReviewHistory(record, ruleId);
    assert.match(resolution.problems.join("\n"), /legacy review prefix does not match the complete ordered prefix/, label);
    assert.equal(resolution.current, null, label);
  };

  const truncated = structuredClone(original);
  truncated.reviews.pop();
  expectAnchorFailure(truncated, "truncation");

  const deleted = structuredClone(original);
  deleted.reviews.splice(1, 1);
  expectAnchorFailure(deleted, "deletion");

  const mutated = structuredClone(original);
  mutated.reviews[1].evidence += " altered";
  expectAnchorFailure(mutated, "mutation");

  const reordered = structuredClone(original);
  [reordered.reviews[1], reordered.reviews[2]] = [reordered.reviews[2], reordered.reviews[1]];
  expectAnchorFailure(reordered, "reordering");

  const relabeled = structuredClone(original);
  relabeled.reviews[1].id = "relabeled-event";
  relabeled.reviews[2].supersedes = "relabeled-event";
  expectAnchorFailure(relabeled, "relabeling");

  const wrongRule = resolveRecordedReviewHistory(original, "meta.standards-not-weakened");
  assert.ok(wrongRule.problems.length > 0, "content from another rule received compatibility");
  assert.equal(wrongRule.current, null);

  const independent = {
    reviews: [
      structuralReview({ id: "independent-1" }),
      structuralReview({ id: "independent-2", supersedes: "independent-1", reviewedAt: "2026-10-02" }),
    ],
  };
  assert.deepEqual(
    resolveRecordedReviewHistory(independent, ruleId).problems,
    [],
    "a complete strict history must not be forced to impersonate this repository's legacy prefix",
  );

  const appended = structuredClone(original);
  const incomplete = structuralReview({
    id: "appended-review",
    supersedes: appended.reviews.at(-1).id,
    reviewedAt: "2099-01-01",
  });
  delete incomplete.reviewerRole;
  delete incomplete.reviewedAgainst.tree;
  delete incomplete.reviewedAgainst.digest;
  appended.reviews.push(incomplete);
  const appendProblems = resolveRecordedReviewHistory(appended, ruleId).problems.join("\n");
  assert.match(appendProblems, /reviewerRole/);
  assert.match(appendProblems, /reviewedAgainst\.tree/);
  assert.match(appendProblems, /reviewedAgainst\.digest/);

  assert.match(reviewProblems(original).join("\n"), /reviewerRole/, "one-argument calls must stay strict");
  assert.equal(currentReview(original), null, "one-argument calls must never apply a manifest anchor");
});

test("new successors require reviewer role, reviewed commit, tree, scope, evidence, and reviewer identity", () => {
  const incomplete = {
    reviews: [
      structuralReview({ id: "r1" }),
      { id: "r2", supersedes: "r1", status: "approved", reviewedAt: "2026-10-02", reviewedAgainst: {} },
    ],
  };
  const problems = resolveReviewHistory("x.required", incomplete).problems.join("\n");
  assert.match(problems, /reviewedBy identity/);
  assert.match(problems, /reviewerRole/);
  assert.match(problems, /evidence/);
  assert.match(problems, /reviewedAgainst\.revision/);
  assert.match(problems, /reviewedAgainst\.tree/);
  assert.match(problems, /reviewedAgainst\.digest/);
  assert.match(problems, /reviewedAgainst\.paths scope/);
  assert.match(
    resolveReviewHistory("x.timestamp", {
      reviews: [structuralReview({ id: "r1" }), structuralReview({ id: "r2", supersedes: "r1", reviewedAt: undefined })],
    }).problems.join("\n"),
    /reviewedAt timestamp/,
  );
  assert.match(resolveReviewHistory("x.empty", { reviews: [] }).problems.join("\n"), /no genesis event/);
});

test("strict resolution requires a present schema-valid successor digest", () => {
  const missing = structuralReview({ id: "r2", supersedes: "r1" });
  delete missing.reviewedAgainst.digest;
  assert.match(
    resolveReviewHistory("x.digest", { reviews: [structuralReview({ id: "r1" }), missing] }).problems.join("\n"),
    /has no reviewedAgainst\.digest/,
  );

  const invalid = structuralReview({
    id: "r2",
    supersedes: "r1",
    reviewedAgainst: { ...structuralReview().reviewedAgainst, digest: "not-a-digest" },
  });
  assert.match(
    resolveReviewHistory("x.digest", { reviews: [structuralReview({ id: "r1" }), invalid] }).problems.join("\n"),
    /invalid reviewedAgainst\.digest/,
  );
});

test("the shared resolver rejects every non-linear chain shape and timestamp regression", () => {
  const problems = (reviews) => resolveReviewHistory("x.chain", { reviews }).problems.join("\n");

  assert.match(problems([structuralReview({ id: "r1", supersedes: "r0" })]), /genesis review r1 has a predecessor/);
  assert.match(
    problems([structuralReview({ id: "r1" }), structuralReview({ id: "r1", supersedes: "r1" })]),
    /duplicate review id/,
  );
  assert.match(problems([structuralReview({ id: "r1" }), structuralReview({ id: "r2" })]), /no predecessor/);
  assert.match(
    problems([
      structuralReview({ id: "r1" }),
      structuralReview({ id: "r2", supersedes: "r1" }),
      structuralReview({ id: "r3", supersedes: "r1" }),
    ]),
    /skipped predecessor/,
  );
  assert.match(
    problems([
      structuralReview({ id: "r1" }),
      structuralReview({ id: "r2", supersedes: "r3" }),
      structuralReview({ id: "r3", supersedes: "r2" }),
    ]),
    /forward reference/,
  );
  assert.match(
    problems([structuralReview({ id: "r1" }), structuralReview({ id: "r2", supersedes: "r2" })]),
    /self-reference/,
  );
  assert.match(
    problems([
      structuralReview({ id: "r1" }),
      structuralReview({ id: "r2", supersedes: "r1" }),
      structuralReview({ id: "r3", supersedes: "r1" }),
    ]),
    /fork from predecessor r1/,
  );
  assert.match(
    problems([structuralReview({ id: "r1" }), structuralReview({ id: "r2", supersedes: "absent" })]),
    /disconnected/,
  );
  assert.match(
    problems([
      structuralReview({ id: "r1", reviewedAt: "2026-10-02" }),
      structuralReview({ id: "r2", supersedes: "r1", reviewedAt: "2026-10-01" }),
    ]),
    /chronological order/,
  );
});

test("the attestation query retains every governed field and one resolver-derived current marker per rule", () => {
  const r = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "attestations.mjs"), `--dir=${REPO_ROOT}`, "--json"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const rows = JSON.parse(r.stdout).attestations;
  assert.ok(rows.length > 1);
  const fields = [
    "rule",
    "id",
    "status",
    "disposition",
    "predecessor",
    "supersedes",
    "reviewedBy",
    "reviewerRole",
    "reviewedAt",
    "evidence",
    "reference",
    "reviewedCommit",
    "reviewedTree",
    "digest",
    "digestAlgorithm",
    "source",
    "reviewedPaths",
    "scope",
    "current",
  ];
  for (const row of rows) for (const field of fields) assert.ok(Object.hasOwn(row, field), `${field} is missing`);
  for (const rule of new Set(rows.map((row) => row.rule))) {
    assert.equal(rows.filter((row) => row.rule === rule && row.current).length, 1, `${rule} must have one current event`);
  }
});

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
import { reviewsOf, currentReview, reviewProblems, isLegacyShape } from "../scripts/reviews.mjs";

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
  reviewedAt: "2026-08-01",
  evidence: "looked at it",
  ...over,
});

test("the newest review is the one eligible to establish, and earlier ones stay inspectable", () => {
  const record = {
    reviews: [
      review({ id: "r1", reviewedAt: "2026-08-01", status: "rejected" }),
      review({ id: "r2", reviewedAt: "2026-08-09", supersedes: "r1" }),
    ],
  };
  assert.equal(currentReview("x.y", record).id, "r2");
  assert.equal(reviewsOf(record).length, 2, "history remains fully readable");
  assert.equal(reviewsOf(record)[0].status, "rejected", "a rejected review stays rejected forever");
});

test("appending a review leaves every earlier event byte-identical", () => {
  // The migration invariant, asserted directly. Appending is the only way to record a new judgement,
  // so the operation that records one cannot be the operation that destroys the last one.
  const first = review({ id: "r1", reviewedAgainst: { paths: ["a.mjs"], digest: "abcdef1234567890" } });
  const snapshot = JSON.stringify(first);
  const record = { reviews: [first] };

  record.reviews.push(review({ id: "r2", reviewedAt: "2026-08-09", supersedes: "r1" }));

  assert.equal(JSON.stringify(record.reviews[0]), snapshot, "the predecessor must be untouched");
  assert.equal(currentReview("x.y", record).id, "r2");
});

test("a malformed history establishes nothing rather than establishing the last element", () => {
  // Selecting by array position from an unvalidated sequence would make the file's layout the
  // chronology: reorder two lines and the established review changes with nothing recording it.
  const duplicate = { reviews: [review({ id: "r1" }), review({ id: "r1", reviewedAt: "2026-08-09" })] };
  assert.match(reviewProblems("x.y", duplicate).join(), /duplicate review id/);
  assert.equal(currentReview("x.y", duplicate), null);

  const misordered = {
    reviews: [review({ id: "r1", reviewedAt: "2026-08-09" }), review({ id: "r2", reviewedAt: "2026-08-01" })],
  };
  assert.match(reviewProblems("x.y", misordered).join(), /chronological order/);
  assert.equal(currentReview("x.y", misordered), null);

  const anonymous = { reviews: [{ status: "approved", reviewedBy: "o", reviewedAt: "2026-08-01", evidence: "e" }] };
  assert.match(reviewProblems("x.y", anonymous).join(), /has no id/);

  const dangling = { reviews: [review({ id: "r1" }), review({ id: "r2", reviewedAt: "2026-08-09", supersedes: "nope" })] };
  assert.match(reviewProblems("x.y", dangling).join(), /supersedes nope, which is not recorded/);
});

test("the legacy single-record shape is still readable during the migration window", () => {
  const legacy = { status: "approved", reviewedBy: "owner", reviewedAt: "2026-08-01", evidence: "e" };
  assert.equal(isLegacyShape(legacy), true);
  assert.equal(reviewsOf(legacy).length, 1);
  assert.equal(currentReview("x.y", legacy).status, "approved");
  assert.deepEqual(reviewProblems("x.y", legacy), [], "an unmigrated record is not itself an error");
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

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
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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
  assert.equal(currentReview("x.y", record).id, "r2");
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

test("strict wrappers reject an incomplete appended successor and select no current review", () => {
  const successor = review({ id: "r2", supersedes: "r1", reviewedAt: "2026-08-09" });
  delete successor.reviewedAgainst.digest;
  const record = { reviews: [review({ id: "r1" }), successor] };
  assert.match(reviewProblems("x.y", record).join("\n"), /reviewedAgainst\.digest/);
  assert.equal(currentReview("x.y", record), null);
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

test("the pinned Git-base manifest anchors all eleven repository histories and recognizes them unmutated", async () => {
  const policy = parseYaml(await readFile(path.join(REPO_ROOT, "project-policy.yml"), "utf8"));
  const manifestRules = Object.entries(LEGACY_REVIEW_PREFIX_MANIFEST.histories);
  assert.equal(LEGACY_REVIEW_PREFIX_MANIFEST.baseCommit, "1e22c3a12bc42fb299712176c597b7498e944ec2");
  assert.equal(LEGACY_REVIEW_PREFIX_MANIFEST.baseTree, "3d00e25613cdf4517d725c0d2229f92f6718543b");
  assert.equal(manifestRules.length, 11);
  assert.equal(manifestRules.reduce((total, [, entry]) => total + entry.events.length, 0), 49);
  assert.deepEqual(
    manifestRules.map(([ruleId]) => ruleId).sort(),
    Object.keys(policy.attestations).sort(),
    "every rule that has a history in the committed policy is anchored, including single-event rejections",
  );

  for (const [ruleId, anchor] of manifestRules) {
    const record = policy.attestations[ruleId];
    const snapshot = JSON.stringify(record);
    const resolution = resolveRecordedReviewHistory(ruleId, record);
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
    const resolution = resolveRecordedReviewHistory(ruleId, record);
    assert.match(resolution.problems.join("\n"), /the history must carry the complete ordered prefix anchored at/, label);
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

  const wrongRule = resolveRecordedReviewHistory("meta.standards-not-weakened", original);
  assert.ok(wrongRule.problems.length > 0, "content from another rule received compatibility");
  assert.equal(wrongRule.current, null);

  const independent = {
    reviews: [
      structuralReview({ id: "independent-1" }),
      structuralReview({ id: "independent-2", supersedes: "independent-1", reviewedAt: "2026-10-02" }),
    ],
  };
  // A fresh, internally valid history is NOT an acceptable replacement for an anchored rule: the
  // anchored prefix is mandatory whatever ids the replacement uses.
  const replacement = resolveRecordedReviewHistory(ruleId, independent);
  assert.match(replacement.problems.join("\n"), /the history must carry the complete ordered prefix anchored at/);
  assert.equal(replacement.current, null);
  const singleGenesis = {
    reviews: [structuralReview({ id: "fresh-genesis", reviewedAt: "2026-10-12", status: "approved" })],
  };
  for (const [name, candidate] of [
    ["fresh single genesis", singleGenesis],
    ["legacy single-record shape", { ...structuralReview({ id: undefined }), id: undefined }],
    ["non-list reviews", { reviews: "x" }],
    ["empty reviews", { reviews: [] }],
    ["null record", null],
  ]) {
    const resolved = resolveRecordedReviewHistory(ruleId, candidate);
    assert.ok(resolved.problems.length > 0, `${name} replaced an anchored history without a problem`);
    assert.equal(resolved.current, null, name);
  }
  for (const anchoredRule of Object.keys(LEGACY_REVIEW_PREFIX_MANIFEST.histories)) {
    const resolved = resolveRecordedReviewHistory(anchoredRule, singleGenesis);
    assert.ok(resolved.problems.length > 0, `${anchoredRule}: fresh genesis replaced an anchored history`);
    assert.equal(resolved.current, null, anchoredRule);
  }

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
  const appendProblems = resolveRecordedReviewHistory(ruleId, appended).problems.join("\n");
  assert.match(appendProblems, /reviewerRole/);
  assert.match(appendProblems, /reviewedAgainst\.tree/);
  assert.match(appendProblems, /reviewedAgainst\.digest/);

  // Argument-order mistakes cannot pass silently: the rule id is first and must be a string.
  for (const wrong of [original, null, undefined, [], 7, ""]) {
    assert.throws(() => reviewProblems(wrong, ruleId), TypeError);
    assert.throws(() => currentReview(wrong, ruleId), TypeError);
    assert.throws(() => resolveRecordedReviewHistory(wrong, ruleId), TypeError);
  }
  // A non-mapping record fails closed rather than resolving to an empty or accepted history.
  for (const badRecord of ["x", null, [], 7]) {
    assert.ok(reviewProblems("x.y", badRecord).length > 0, `record ${JSON.stringify(badRecord)}`);
    assert.equal(currentReview("x.y", badRecord), null);
  }
});

test("genesis and legacy-shape events outside the anchored manifest are structurally validated", () => {
  const bad = [
    ["bare genesis with only an id and status", { reviews: [{ id: "x1", status: "approved" }] }],
    ["reviews that is not a list", { reviews: "x" }],
    ["reviews that is a mapping", { reviews: { id: "x1" } }],
    ["unknown status", { reviews: [structuralReview({ id: "x1", status: "bogus" })] }],
    ["null status", { reviews: [structuralReview({ id: "x1", status: null })] }],
    ["non-date reviewedAt", { reviews: [structuralReview({ id: "x1", reviewedAt: "yesterday" })] }],
    ["missing evidence", { reviews: [structuralReview({ id: "x1", evidence: "" })] }],
    ["legacy shape missing identity", { status: "approved", reviewedAt: "2026-08-01", evidence: "e" }],
    ["scope present but empty", { reviews: [structuralReview({ id: "x1", reviewedAgainst: { paths: [] } })] }],
  ];
  for (const [name, record] of bad) {
    assert.ok(reviewProblems("x.y", record).length > 0, `${name} resolved without a problem`);
    assert.equal(currentReview("x.y", record), null, name);
  }
  const good = { reviews: [structuralReview({ id: "x1" })] };
  assert.deepEqual(reviewProblems("x.y", good), []);
  assert.equal(currentReview("x.y", good)?.id, "x1");
  const legacyGood = { status: "approved", reviewedBy: "o", reviewedAt: "2026-08-01", evidence: "e" };
  assert.deepEqual(reviewProblems("x.y", legacyGood), []);
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
  const parsed = JSON.parse(r.stdout);
  const rows = parsed.attestations;
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
  // With a determinable trusted base every rule has one current event. Without one (a shallow or
  // remote-less checkout) the preflight is NOT_EVALUATED and no event may be listed as current.
  const expectedCurrent = parsed.historyIntegrity.status === "verified" ? 1 : 0;
  for (const rule of new Set(rows.map((row) => row.rule))) {
    assert.equal(
      rows.filter((row) => row.rule === rule && row.current).length,
      expectedCurrent,
      `${rule}: current events with history integrity ${parsed.historyIntegrity.status}`,
    );
  }
});

// ---------------------------------------------------------------------------------------------
// validate-level behaviour through scripts/standards.mjs. These drive the real CLI over a real
// Git repository, because a unit test of the resolver cannot notice a consumer that passes its
// arguments in the wrong order (the reviewer's mutation kept every other test green).
// ---------------------------------------------------------------------------------------------

const STANDARDS_CLI = path.join(REPO_ROOT, "scripts", "standards.mjs");
const RULE = "architecture.dependency-evaluation";

async function validateFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-validate-history-"));
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.email", "synthetic@example.invalid");
  git(dir, "config", "user.name", "Synthetic Fixture");
  git(dir, "config", "commit.gpgsign", "false");
  await writeFile(path.join(dir, "reviewed.txt"), "one\n");
  return dir;
}

function policyText(events) {
  const version = readFileSync(path.join(REPO_ROOT, "VERSION"), "utf8").trim();
  const lines = [
    `standardVersion: "${version}"`,
    `project: "synthetic"`,
    `rules:`,
    `  ${RULE}:`,
    `    level: required`,
    `attestations:`,
    `  ${RULE}:`,
    `    reviews:`,
  ];
  for (const e of events) {
    lines.push(`      - id: "${e.id}"`);
    if (e.supersedes) lines.push(`        supersedes: "${e.supersedes}"`);
    lines.push(`        status: ${e.status ?? "approved"}`);
    lines.push(`        reviewedBy: "synthetic-reviewer"`);
    if (e.reviewerRole) lines.push(`        reviewerRole: "${e.reviewerRole}"`);
    lines.push(`        reviewedAt: "${e.reviewedAt}"`);
    lines.push(`        evidence: "${e.evidence ?? "synthetic evidence"}"`);
    lines.push(`        reviewedAgainst:`);
    if (e.revision) lines.push(`          revision: "${e.revision}"`);
    if (e.tree) lines.push(`          tree: "${e.tree}"`);
    if (e.digest) lines.push(`          digestAlgorithm: "${DIGEST_ALGORITHM}"`);
    if (e.digest) lines.push(`          digest: "${e.digest}"`);
    lines.push(`          source: git`);
    lines.push(`          paths:`);
    lines.push(`            - "reviewed.txt"`);
  }
  return `${lines.join("\n")}\n`;
}

function runValidate(dir) {
  const result = spawnSync(process.execPath, [STANDARDS_CLI, "validate", dir, "--json"], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const report = JSON.parse(result.stdout);
  return {
    report,
    rule: report.results.find((entry) => entry.ruleId === RULE),
    finding: report.findings.find((entry) => entry.id === "review-history-append-only"),
  };
}

test("validate reports a changed reviewed path as stale, through the real consumer wiring", async () => {
  const dir = await validateFixture();
  try {
    git(dir, "add", "reviewed.txt");
    git(dir, "commit", "-qm", "reviewed content");
    const digest = repositoryDigest(dir, ["reviewed.txt"]).digest;
    assert.ok(digest, "digest could not be computed");
    await writeFile(
      path.join(dir, "project-policy.yml"),
      policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]),
    );
    git(dir, "add", "project-policy.yml");
    git(dir, "commit", "-qm", "policy");
    git(dir, "update-ref", "refs/remotes/origin/main", "HEAD"); // a base exists: history is verifiable

    const fresh = runValidate(dir);
    assert.equal(fresh.rule.disposition, "attested", JSON.stringify(fresh.rule));
    assert.notEqual(fresh.rule.freshness, "stale");

    await writeFile(path.join(dir, "reviewed.txt"), "one\ntwo\n");
    git(dir, "add", "reviewed.txt");
    git(dir, "commit", "-qm", "reviewed content changed");

    const stale = runValidate(dir);
    assert.equal(stale.rule.freshness, "stale", JSON.stringify(stale.rule));
    assert.equal(stale.rule.disposition, "not-evaluated");
    assert.notEqual(stale.rule.status, "passed");
  } finally {
    await cleanup(dir);
  }
});

test("validate compares review history with the repository's own merge-base and reports each outcome", async () => {
  const dir = await validateFixture();
  try {
    git(dir, "add", "reviewed.txt");
    git(dir, "commit", "-qm", "reviewed content");
    const digest = repositoryDigest(dir, ["reviewed.txt"]).digest;
    const genesis = { id: "r1", reviewedAt: "2026-10-01", digest };
    const policyFile = path.join(dir, "project-policy.yml");
    await writeFile(policyFile, policyText([genesis]));
    git(dir, "add", "project-policy.yml");
    git(dir, "commit", "-qm", "policy with one review");

    // 1. No remote default-branch ref: the history cannot be compared with a trusted base, so the
    //    result is NOT_EVALUATED and the attestation is disregarded rather than staying effective.
    const noRemote = runValidate(dir);
    assert.equal(noRemote.finding?.severity, "warning", JSON.stringify(noRemote.finding));
    assert.match(noRemote.finding.message, /NOT_EVALUATED/);
    assert.match(noRemote.finding.message, /ASSERTED by the policy text, not authenticated/);
    assert.notEqual(noRemote.rule.disposition, "attested", "an attestation stayed effective without a base");
    assert.notEqual(noRemote.rule.disposition, "attested-rejected");

    // 2. A remote default-branch ref at the current commit makes the base determinable.
    git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    const verified = runValidate(dir);
    assert.equal(verified.finding?.severity, "info", JSON.stringify(verified.finding));
    assert.match(verified.finding.message, /append-only relative to/);

    // 3. A valid appended successor is verified.
    const tree = git(dir, "rev-parse", "HEAD^{tree}").trim();
    const revision = git(dir, "rev-parse", "HEAD").trim();
    const successor = {
      id: "r2",
      supersedes: "r1",
      reviewedAt: "2026-10-02",
      reviewerRole: "synthetic-role",
      revision,
      tree,
      digest,
    };
    await writeFile(policyFile, policyText([genesis, successor]));
    const appended = runValidate(dir);
    assert.equal(appended.finding?.severity, "info", JSON.stringify(appended.finding));
    assert.equal(appended.rule.disposition, "attested");

    // 4. Rewriting the recorded event while keeping the chain internally valid is a violation, and
    //    the attestation stops establishing the rule.
    await writeFile(policyFile, policyText([{ ...genesis, status: "rejected" }]));
    const rewritten = runValidate(dir);
    assert.equal(rewritten.finding?.severity, "error", JSON.stringify(rewritten.finding));
    assert.match(rewritten.finding.message, /was rewritten/);
    assert.notEqual(rewritten.rule.disposition, "attested");

    // 5. Replacing the history with a fresh genesis is also a violation.
    await writeFile(policyFile, policyText([{ ...genesis, id: "fresh-genesis" }]));
    const replaced = runValidate(dir);
    assert.equal(replaced.finding?.severity, "error", JSON.stringify(replaced.finding));
    assert.notEqual(replaced.rule.disposition, "attested");
  } finally {
    await cleanup(dir);
  }
});

test("the repository's own policy keeps every anchored history and validates its current events", () => {
  const result = spawnSync(process.execPath, [STANDARDS_CLI, "validate", REPO_ROOT, "--json"], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  const report = JSON.parse(result.stdout);
  assert.ok(!report.results.some((entry) => entry.disposition === "invalid-attestation"));
  const attested = report.results.filter((entry) => ["attested", "attested-rejected"].includes(entry.disposition));
  const integrity = report.findings.find((entry) => entry.id === "review-history-append-only");
  if (integrity?.severity === "warning") {
    // No determinable base in this checkout: attestations are disregarded, which is the contract.
    assert.equal(attested.length, 0, "an attestation stayed effective without a trusted base");
  } else {
    assert.ok(attested.length > 0, "anchored histories must still establish or reject rules");
  }
});

// ---------------------------------------------------------------------------------------------
// The base is derived from the repository: merge-base(HEAD, origin default branch). These tests use
// a real bare origin, a real clone and real commits, because a comparison against HEAD itself (the
// working tree against its own commit) passes every uncommitted-only test and misses a committed
// rewrite entirely.
// ---------------------------------------------------------------------------------------------

async function originFixture(policySource) {
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-origin-history-"));
  const origin = path.join(root, "origin.git");
  const seed = path.join(root, "seed");
  const work = path.join(root, "work");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  await mkdir(seed);
  git(seed, "init", "-q", "-b", "main");
  for (const [key, value] of [
    ["user.email", "synthetic@example.invalid"],
    ["user.name", "Synthetic Fixture"],
    ["commit.gpgsign", "false"],
  ]) {
    git(seed, "config", key, value);
  }
  await writeFile(path.join(seed, "reviewed.txt"), "one\n");
  git(seed, "add", "reviewed.txt");
  git(seed, "commit", "-qm", "reviewed content");
  const digest = repositoryDigest(seed, ["reviewed.txt"]).digest;
  await writeFile(path.join(seed, "project-policy.yml"), policySource(digest));
  git(seed, "add", "project-policy.yml");
  git(seed, "commit", "-qm", "policy");
  git(seed, "remote", "add", "origin", origin);
  git(seed, "push", "-q", "origin", "main");
  git(root, "clone", "-q", origin, work);
  for (const [key, value] of [
    ["user.email", "synthetic@example.invalid"],
    ["user.name", "Synthetic Fixture"],
    ["commit.gpgsign", "false"],
  ]) {
    git(work, "config", key, value);
  }
  return { root, origin, seed, work, digest };
}

const commitAll = (dir, message) => {
  git(dir, "add", "-A");
  git(dir, "commit", "-qm", message);
  return git(dir, "rev-parse", "HEAD").trim();
};

test("a COMMITTED rewrite of an unanchored history on a feature branch is a violation", async () => {
  const fx = await originFixture((digest) =>
    policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]),
  );
  try {
    git(fx.work, "checkout", "-q", "-b", "feature/rewrite");
    await writeFile(
      path.join(fx.work, "project-policy.yml"),
      policyText([{ id: "r1", reviewedAt: "2026-10-01", digest: fx.digest, status: "rejected" }]),
    );
    const head = commitAll(fx.work, "rewrite recorded review");
    const base = git(fx.work, "merge-base", "HEAD", "origin/main").trim();
    assert.notEqual(base, head, "the fixture must have a committed difference between HEAD and the base");
    // The working tree is clean: only the committed rewrite distinguishes this from a valid run.
    assert.equal(git(fx.work, "status", "--porcelain").trim(), "");
    const run = runValidate(fx.work);
    assert.equal(run.finding?.severity, "error", JSON.stringify(run.finding));
    assert.match(run.finding.message, /was rewritten/);
    assert.ok(run.finding.message.includes(base), "the finding must name the merge-base commit");
    assert.notEqual(run.rule.disposition, "attested");
  } finally {
    await cleanup(fx.root);
  }
});

test("a COMMITTED rewrite of an anchored event on a feature branch is a violation", async () => {
  const source = readFileSync(path.join(REPO_ROOT, "project-policy.yml"), "utf8");
  const needle = "review-ai-no-safety-bypass-001";
  assert.ok(source.includes(needle));
  const fx = await originFixture(() => source);
  try {
    git(fx.work, "checkout", "-q", "-b", "feature/rewrite-anchored");
    const edited = source.replace(/(id: "review-ai-no-safety-bypass-001"[\s\S]*?status: )rejected/, "$1approved");
    assert.notEqual(edited, source, "the fixture must change the recorded rejection");
    await writeFile(path.join(fx.work, "project-policy.yml"), edited);
    const head = commitAll(fx.work, "relabel a recorded rejection as an approval");
    const base = git(fx.work, "merge-base", "HEAD", "origin/main").trim();
    assert.notEqual(base, head);
    const run = runValidate(fx.work);
    assert.equal(run.finding?.severity, "error", JSON.stringify(run.finding));
    assert.match(run.finding.message, /was rewritten/);
    const safety = run.report.results.find((entry) => entry.ruleId === "ai.no-safety-bypass");
    assert.notEqual(safety.disposition, "attested", "a relabelled rejection must never read as an acceptance");
  } finally {
    await cleanup(fx.root);
  }
});

test("a committed valid append is verified against the merge-base, and a rebase onto a moved default branch stays verified", async () => {
  const fx = await originFixture((digest) =>
    policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]),
  );
  try {
    const mainTipBefore = git(fx.work, "rev-parse", "origin/main").trim();
    git(fx.work, "checkout", "-q", "-b", "feature/append");
    const tree = git(fx.work, "rev-parse", "HEAD^{tree}").trim();
    const revision = git(fx.work, "rev-parse", "HEAD").trim();
    await writeFile(
      path.join(fx.work, "project-policy.yml"),
      policyText([
        { id: "r1", reviewedAt: "2026-10-01", digest: fx.digest },
        {
          id: "r2",
          supersedes: "r1",
          reviewedAt: "2026-10-02",
          reviewerRole: "synthetic-role",
          revision,
          tree,
          digest: fx.digest,
        },
      ]),
    );
    const head = commitAll(fx.work, "append a renewal");

    const appended = runValidate(fx.work);
    assert.equal(appended.finding?.severity, "info", JSON.stringify(appended.finding));
    assert.ok(appended.finding.message.includes(mainTipBefore), "the base is the merge-base, not HEAD");
    assert.ok(!appended.finding.message.includes(head), "HEAD must never be the base of a committed change");
    assert.equal(appended.rule.disposition, "attested");

    // The default branch moves on (an unrelated commit), and the feature branch is rebased onto it.
    await writeFile(path.join(fx.seed, "unrelated.txt"), "x\n");
    git(fx.seed, "add", "unrelated.txt");
    git(fx.seed, "commit", "-qm", "unrelated change on main");
    git(fx.seed, "push", "-q", "origin", "main");
    const mainTipAfter = git(fx.seed, "rev-parse", "HEAD").trim();
    git(fx.work, "fetch", "-q", "origin");
    git(fx.work, "rebase", "-q", "origin/main");
    assert.equal(git(fx.work, "merge-base", "HEAD", "origin/main").trim(), mainTipAfter);

    const rebased = runValidate(fx.work);
    assert.equal(rebased.finding?.severity, "info", JSON.stringify(rebased.finding));
    assert.ok(rebased.finding.message.includes(mainTipAfter), "after the rebase the base is the moved tip");
    assert.equal(rebased.rule.disposition, "attested");
  } finally {
    await cleanup(fx.root);
  }
});

test("a committed rewrite stays a violation after a rebase onto a moved default branch", async () => {
  const fx = await originFixture((digest) =>
    policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]),
  );
  try {
    git(fx.work, "checkout", "-q", "-b", "feature/rewrite-then-rebase");
    await writeFile(
      path.join(fx.work, "project-policy.yml"),
      policyText([{ id: "r1", reviewedAt: "2026-10-01", digest: fx.digest, evidence: "altered" }]),
    );
    commitAll(fx.work, "alter the recorded evidence");
    await writeFile(path.join(fx.seed, "unrelated.txt"), "x\n");
    git(fx.seed, "add", "unrelated.txt");
    git(fx.seed, "commit", "-qm", "unrelated change on main");
    git(fx.seed, "push", "-q", "origin", "main");
    git(fx.work, "fetch", "-q", "origin");
    git(fx.work, "rebase", "-q", "origin/main");
    const run = runValidate(fx.work);
    assert.equal(run.finding?.severity, "error", JSON.stringify(run.finding));
    assert.match(run.finding.message, /was rewritten/);
  } finally {
    await cleanup(fx.root);
  }
});

test("the digest hint for an unrecorded-freshness attestation is reached through validate with the rule id first", async () => {
  const dir = await validateFixture();
  try {
    git(dir, "add", "reviewed.txt");
    git(dir, "commit", "-qm", "reviewed content");
    const digest = repositoryDigest(dir, ["reviewed.txt"]).digest;
    assert.ok(digest);
    // No digest recorded: the documented first-pass workflow. validate must print the digest to record.
    await writeFile(path.join(dir, "project-policy.yml"), policyText([{ id: "r1", reviewedAt: "2026-10-01" }]));
    git(dir, "add", "project-policy.yml");
    git(dir, "commit", "-qm", "policy without a digest");
    git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
    const result = spawnSync(process.execPath, [STANDARDS_CLI, "validate", dir], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.match(result.stdout, new RegExp(`attestation ${RULE.replace(/\./g, "\\.")}: current digest is ${digest}`), result.stderr);
  } finally {
    await cleanup(dir);
  }
});

// ---------------------------------------------------------------------------------------------
// `npm run attestations` runs the same history-integrity preflight as `validate`, before listing
// anything as valid and before the migration writes.
// ---------------------------------------------------------------------------------------------

const runAttestations = (dir, ...extra) => {
  const result = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", "attestations.mjs"), `--dir=${dir}`, "--json", ...extra],
    { encoding: "utf8", windowsHide: true },
  );
  let json = null;
  try {
    json = JSON.parse(result.stdout);
  } catch {
    // --migrate refusals write to stderr and no JSON.
  }
  return { ...result, json };
};

test("attestations lists a verified history as current and labels identity as asserted", async () => {
  const fx = await originFixture((digest) => policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]));
  try {
    const run = runAttestations(fx.work);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.json.historyIntegrity.status, "verified");
    assert.equal(run.json.attestations.filter((row) => row.current).length, 1);
    assert.match(run.json.identityNote, /ASSERTED by the policy text, not authenticated/);
    for (const row of run.json.attestations) assert.equal(row.identity, "asserted, not authenticated");
    const text = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "attestations.mjs"), `--dir=${fx.work}`], {
      encoding: "utf8",
    });
    assert.match(text.stdout, /asserted, not authenticated/i);
  } finally {
    await cleanup(fx.root);
  }
});

test("attestations lists nothing as current and exits 1 after a committed rewrite, and refuses to migrate", async () => {
  const fx = await originFixture((digest) => policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]));
  try {
    git(fx.work, "checkout", "-q", "-b", "feature/rewrite");
    const rewritten = policyText([{ id: "r1", reviewedAt: "2026-10-01", digest: fx.digest, status: "rejected" }]);
    await writeFile(path.join(fx.work, "project-policy.yml"), rewritten);
    commitAll(fx.work, "rewrite recorded review");
    const run = runAttestations(fx.work);
    assert.equal(run.status, 1, run.stderr);
    assert.equal(run.json.historyIntegrity.status, "violated");
    assert.equal(run.json.attestations.filter((row) => row.current).length, 0);
    assert.match(run.json.violations.join("\n"), /review history/);

    const migrate = runAttestations(fx.work, "--migrate");
    assert.notEqual(migrate.status, 0);
    assert.match(migrate.stderr, /Refusing to migrate/);
    assert.equal(await readFile(path.join(fx.work, "project-policy.yml"), "utf8"), rewritten, "the policy was written");
  } finally {
    await cleanup(fx.root);
  }
});

test("attestations without a determinable base is NOT_EVALUATED: nothing is current and nothing is migrated", async () => {
  const dir = await validateFixture();
  try {
    git(dir, "add", "reviewed.txt");
    git(dir, "commit", "-qm", "reviewed content");
    const digest = repositoryDigest(dir, ["reviewed.txt"]).digest;
    const source = policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]);
    await writeFile(path.join(dir, "project-policy.yml"), source);
    git(dir, "add", "project-policy.yml");
    git(dir, "commit", "-qm", "policy");
    const run = runAttestations(dir);
    assert.equal(run.status, 0, run.stderr);
    assert.equal(run.json.historyIntegrity.status, "not-evaluated");
    assert.equal(run.json.historyIntegrity.effective, false);
    assert.equal(run.json.attestations.filter((row) => row.current).length, 0);
    const migrate = runAttestations(dir, "--migrate");
    assert.notEqual(migrate.status, 0);
    assert.equal(await readFile(path.join(dir, "project-policy.yml"), "utf8"), source);
  } finally {
    await cleanup(dir);
  }
});

test("a genesis may omit its digest (bootstrap behaviour); a successor may not", () => {
  const genesis = structuralReview({ id: "g1" });
  delete genesis.reviewedAgainst.digest;
  delete genesis.reviewedAgainst.digestAlgorithm;
  assert.deepEqual(reviewProblems("x.bootstrap", { reviews: [genesis] }), []);
  assert.equal(currentReview("x.bootstrap", { reviews: [genesis] })?.id, "g1");

  const successor = structuralReview({ id: "g2", supersedes: "g1", reviewedAt: "2026-10-02" });
  delete successor.reviewedAgainst.digest;
  const problems = reviewProblems("x.bootstrap", { reviews: [genesis, successor] }).join("\n");
  assert.match(problems, /reviewedAgainst\.digest/);
  assert.equal(currentReview("x.bootstrap", { reviews: [genesis, successor] }), null);
});

test("a shallow clone that lacks the base is NOT_EVALUATED and its attestations are disregarded", async () => {
  const fx = await originFixture((digest) => policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]));
  try {
    git(fx.work, "checkout", "-q", "-b", "feature/shallow");
    await writeFile(path.join(fx.work, "note.txt"), "a\n");
    commitAll(fx.work, "feature commit one");
    await writeFile(path.join(fx.work, "note.txt"), "b\n");
    commitAll(fx.work, "feature commit two");
    git(fx.work, "push", "-q", "origin", "feature/shallow");

    const shallow = path.join(fx.root, "shallow");
    git(fx.root, "clone", "-q", "--depth", "1", "--no-single-branch", "--branch", "feature/shallow", pathToFileURL(fx.origin).href, shallow);
    assert.equal(git(shallow, "rev-parse", "--is-shallow-repository").trim(), "true");

    const run = runValidate(shallow);
    assert.equal(run.finding?.severity, "warning", JSON.stringify(run.finding));
    assert.match(run.finding.message, /NOT_EVALUATED/);
    assert.match(run.finding.message, /shallow clone/);
    assert.notEqual(run.rule.disposition, "attested", "an attestation stayed effective without the base");

    const inventory = runAttestations(shallow);
    assert.equal(inventory.json.historyIntegrity.status, "not-evaluated");
    assert.equal(inventory.json.attestations.filter((row) => row.current).length, 0);
  } finally {
    await cleanup(fx.root);
  }
});

// ---------------------------------------------------------------------------------------------
// Removing recorded history is a violation even when the head records no attestation at all, and
// negative evidence (a recorded rejection) is never withdrawn for want of a comparison.
// ---------------------------------------------------------------------------------------------

const IDENTITY_LABEL = "asserted, not authenticated";
const IDENTITY_NOTE_TEXT =
  "reviewedBy and reviewerRole are ASSERTED by the policy text, not authenticated; no signature or " +
  "trusted-actor mechanism verifies them.";
const REJECTED_RULE = "ai.propose-execute";

/** The single-rule policy plus a recorded rejection for a second, unanchored rule. */
function twoRulePolicy(digest, { withRejection = true } = {}) {
  const base = policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]);
  if (!withRejection) return base;
  return (
    base +
    [
      `  ${REJECTED_RULE}:`,
      `    reviews:`,
      `      - id: "p1"`,
      `        status: rejected`,
      `        reviewedBy: "synthetic-reviewer"`,
      `        reviewedAt: "2026-10-01"`,
      `        evidence: "synthetic rejection"`,
      ``,
    ].join("\n")
  );
}

const policyWithoutAttestations = (text) => text.slice(0, text.indexOf("attestations:"));

test("validate and attestations detect removal of recorded history, and keep recorded rejections effective", async () => {
  const mutations = {
    "truncated at the attestations line": (text) => policyWithoutAttestations(text),
    "attestations: (empty value)": (text) => `${policyWithoutAttestations(text)}attestations:
`,
    "one rule key removed": (text) => text.slice(0, text.indexOf(`  ${REJECTED_RULE}:`)),
  };
  for (const [name, mutate] of Object.entries(mutations)) {
    const fx = await originFixture((digest) => twoRulePolicy(digest));
    try {
      git(fx.work, "checkout", "-q", "-b", "feature/remove");
      const original = readFileSync(path.join(fx.work, "project-policy.yml"), "utf8");
      const mutated = mutate(original);
      assert.notEqual(mutated, original, name);
      await writeFile(path.join(fx.work, "project-policy.yml"), mutated);
      commitAll(fx.work, `remove history: ${name}`);

      const validate = runValidate(fx.work);
      assert.equal(validate.finding?.severity, "error", `${name}: ${JSON.stringify(validate.finding)}`);
      assert.match(validate.finding.message, /was rewritten/, name);
      assert.notEqual(validate.rule.disposition, "attested", `${name}: an approval stayed effective`);

      const inventory = runAttestations(fx.work);
      assert.equal(inventory.status, 1, `${name}: ${inventory.stderr}`);
      assert.equal(inventory.json.historyIntegrity.status, "violated", name);
      assert.equal(inventory.json.attestations.filter((row) => row.current).length, 0, name);

      const migrate = runAttestations(fx.work, "--migrate");
      assert.notEqual(migrate.status, 0, `${name}: migrate was not refused`);
      assert.equal(await readFile(path.join(fx.work, "project-policy.yml"), "utf8"), mutated, `${name}: written`);

      if (name === "truncated at the attestations line") {
        // The rejection recorded at the trusted base stays effective although the head removed it.
        const rejected = validate.report.results.find((entry) => entry.ruleId === REJECTED_RULE);
        assert.equal(rejected.disposition, "attested-rejected", `${name}: ${JSON.stringify(rejected)}`);
        assert.equal(rejected.status, "failed");
      }
    } finally {
      await cleanup(fx.root);
    }
  }
});

test("an emptied reviews list and a deleted policy file are violations", async () => {
  {
    const fx = await originFixture((digest) => twoRulePolicy(digest, { withRejection: false }));
    try {
      git(fx.work, "checkout", "-q", "-b", "feature/empty-reviews");
      const original = readFileSync(path.join(fx.work, "project-policy.yml"), "utf8");
      const emptied = `${original.slice(0, original.indexOf("    reviews:"))}    reviews: []\n`;
      await writeFile(path.join(fx.work, "project-policy.yml"), emptied);
      commitAll(fx.work, "empty the reviews list");
      const inventory = runAttestations(fx.work);
      assert.equal(inventory.json.historyIntegrity.status, "violated", inventory.stderr);
      assert.equal(inventory.status, 1);
      assert.notEqual(runAttestations(fx.work, "--migrate").status, 0);
    } finally {
      await cleanup(fx.root);
    }
  }
  {
    const fx = await originFixture((digest) => twoRulePolicy(digest));
    try {
      git(fx.work, "checkout", "-q", "-b", "feature/delete-policy");
      git(fx.work, "rm", "-q", "project-policy.yml");
      git(fx.work, "commit", "-qm", "delete the policy file");
      const inventory = runAttestations(fx.work);
      assert.equal(inventory.status, 1, inventory.stderr);
      assert.equal(inventory.json.historyIntegrity.status, "violated");
      assert.notEqual(runAttestations(fx.work, "--migrate").status, 0);
      // Moved rather than deleted: the policy is gone from its path, which is the same violation.
      git(fx.work, "reset", "-q", "--hard", "HEAD~1");
      git(fx.work, "mv", "project-policy.yml", "project-policy.moved.yml");
      git(fx.work, "commit", "-qm", "move the policy file");
      const moved = runAttestations(fx.work);
      assert.equal(moved.json.historyIntegrity.status, "violated", moved.stderr);
    } finally {
      await cleanup(fx.root);
    }
  }
});

test("without a determinable base approvals are disregarded but recorded rejections stay effective", async () => {
  const dir = await validateFixture();
  try {
    git(dir, "add", "reviewed.txt");
    git(dir, "commit", "-qm", "reviewed content");
    const digest = repositoryDigest(dir, ["reviewed.txt"]).digest;
    await writeFile(path.join(dir, "project-policy.yml"), twoRulePolicy(digest));
    git(dir, "add", "project-policy.yml");
    git(dir, "commit", "-qm", "policy with an approval and a rejection");

    const run = runValidate(dir);
    assert.equal(run.finding?.severity, "warning", JSON.stringify(run.finding));
    assert.match(run.finding.message, /NOT_EVALUATED/);
    assert.match(run.finding.message, /1 recorded rejection\(s\) stay effective/);
    assert.notEqual(run.rule.disposition, "attested", "an approval stayed effective without a base");
    const rejected = run.report.results.find((entry) => entry.ruleId === REJECTED_RULE);
    assert.equal(rejected.disposition, "attested-rejected");
    assert.equal(rejected.status, "failed");

    const inventory = runAttestations(dir);
    assert.equal(inventory.json.attestations.filter((row) => row.current).length, 0);
    const rejectionRow = inventory.json.attestations.find((row) => row.rule === REJECTED_RULE);
    assert.equal(rejectionRow.rejectionEffective, true);
  } finally {
    await cleanup(dir);
  }
});

// ---------------------------------------------------------------------------------------------
// A history that cannot be established is explained, never replaced by an invented result: every
// cause states its own reason on both surfaces, and no approval is reported as established.
// ---------------------------------------------------------------------------------------------

test("a history that cannot be established states its reason and never reports an established approval", async () => {
  const causes = [];

  // 1. A work tree with no remote default-branch ref: no trusted base can be named.
  {
    const dir = await validateFixture();
    try {
      git(dir, "add", "reviewed.txt");
      git(dir, "commit", "-qm", "reviewed content");
      const digest = repositoryDigest(dir, ["reviewed.txt"]).digest;
      await writeFile(path.join(dir, "project-policy.yml"), twoRulePolicy(digest));
      git(dir, "add", "project-policy.yml");
      git(dir, "commit", "-qm", "policy");
      causes.push(["no default-branch ref", dir, /no remote default-branch ref/]);
      await runCause();
    } finally {
      await cleanup(dir);
    }
  }

  // 2. A directory that is not a Git work tree at all.
  {
    const dir = await mkdtemp(path.join(os.tmpdir(), "standards-no-worktree-"));
    try {
      await writeFile(path.join(dir, "reviewed.txt"), "one\n");
      const digest = repositoryDigest(dir, ["reviewed.txt"]).digest ?? "0".repeat(32);
      await writeFile(path.join(dir, "project-policy.yml"), twoRulePolicy(digest));
      causes.push(["not a work tree", dir, /not a Git work tree/]);
      await runCause();
    } finally {
      await cleanup(dir);
    }
  }

  async function runCause() {
    const [name, dir, reason] = causes.at(-1);
    const run = runValidate(dir);
    assert.equal(run.finding?.severity, "warning", `${name}: ${JSON.stringify(run.finding)}`);
    assert.match(run.finding.message, /NOT_EVALUATED/, name);
    assert.match(run.finding.message, reason, `${name}: the cause is not stated`);
    // The approval is not established and is not reported as passed or attested.
    assert.notEqual(run.rule.disposition, "attested", `${name}: an approval stayed effective`);
    assert.notEqual(run.rule.status, "passed", `${name}: an unestablished approval passed`);

    const inventory = runAttestations(dir);
    assert.equal(inventory.json.historyIntegrity.status, "not-evaluated", name);
    assert.equal(inventory.json.historyIntegrity.effective, false, name);
    assert.match(inventory.json.historyIntegrity.reason ?? "", reason, `${name}: attestations omits the cause`);
    assert.equal(inventory.json.attestations.filter((row) => row.current).length, 0, name);
    const migrate = runAttestations(dir, "--migrate");
    assert.notEqual(migrate.status, 0, `${name}: --migrate wrote without an established history`);
  }

  // 3. A verified history whose reviewed path later changed: stale, with its reason, not passed.
  {
    const fx = await originFixture((digest) => policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]));
    try {
      git(fx.work, "checkout", "-q", "-b", "feature/stale");
      await writeFile(path.join(fx.work, "reviewed.txt"), "one\ntwo\n");
      commitAll(fx.work, "reviewed path changed after the review");
      const run = runValidate(fx.work);
      assert.equal(run.rule.freshness, "stale", JSON.stringify(run.rule));
      assert.equal(run.rule.disposition, "not-evaluated");
      assert.notEqual(run.rule.status, "passed");
      assert.match(run.rule.message, /does not establish the current state: committed content changed since review/);
      assert.equal(run.finding?.severity, "info", "a verified history is still reported as verified");
    } finally {
      await cleanup(fx.root);
    }
  }
});

// ---------------------------------------------------------------------------------------------
// A MALFORMED head chain, when the history cannot be compared with a trusted base: a rejection it
// records stays effective and is named, and a chain that records none reads NOT_EVALUATED, never a
// pass. The malformation here is a successor that names a predecessor which does not exist.
// ---------------------------------------------------------------------------------------------

function malformedChainPolicy(digest, events) {
  const lines = [policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]).trimEnd(), `  ${REJECTED_RULE}:`, `    reviews:`];
  for (const event of events) {
    lines.push(`      - id: "${event.id}"`);
    if (event.supersedes) lines.push(`        supersedes: "${event.supersedes}"`);
    lines.push(`        status: ${event.status}`);
    lines.push(`        reviewedBy: "synthetic-reviewer"`);
    lines.push(`        reviewedAt: "2026-10-01"`);
    lines.push(`        evidence: "synthetic evidence"`);
  }
  return `${lines.join("\n")}\n`;
}

async function runMalformedChain(events) {
  const dir = await validateFixture();
  try {
    git(dir, "add", "reviewed.txt");
    git(dir, "commit", "-qm", "reviewed content");
    const digest = repositoryDigest(dir, ["reviewed.txt"]).digest;
    await writeFile(path.join(dir, "project-policy.yml"), malformedChainPolicy(digest, events));
    git(dir, "add", "project-policy.yml");
    git(dir, "commit", "-qm", "policy with a malformed chain");
    const run = runValidate(dir); // no default-branch ref: the comparison is NOT_EVALUATED
    assert.equal(run.finding?.severity, "warning", JSON.stringify(run.finding));
    assert.match(run.finding.message, /NOT_EVALUATED/);
    return { ...run, result: run.report.results.find((entry) => entry.ruleId === REJECTED_RULE) };
  } finally {
    await cleanup(dir);
  }
}

test("a malformed chain that records a rejection fails with the rejection named when no base exists", async () => {
  const { result } = await runMalformedChain([
    { id: "p1", status: "rejected" },
    { id: "p2", supersedes: "no-such-event", status: "approved" },
  ]);
  assert.equal(result.status, "failed", JSON.stringify(result));
  assert.equal(result.disposition, "invalid-attestation");
  assert.match(result.message, /malformed review history/);
  assert.match(result.message, /records a rejection that stays effective: p1 by synthetic-reviewer on 2026-10-01/);
});

test("a malformed chain that records no rejection is NOT_EVALUATED and never a pass when no base exists", async () => {
  const { result } = await runMalformedChain([
    { id: "p1", status: "approved" },
    { id: "p2", supersedes: "no-such-event", status: "approved" },
  ]);
  assert.notEqual(result.status, "passed", JSON.stringify(result));
  assert.notEqual(result.status, "failed", JSON.stringify(result));
  assert.equal(result.disposition, "not-evaluated", JSON.stringify(result));
});

test("the asserted-identity label is pinned exactly on every surface", async () => {
  const fx = await originFixture((digest) => policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]));
  try {
    const run = runValidate(fx.work);
    assert.equal(run.rule.disposition, "attested");
    assert.equal(run.rule.attestation.identity, IDENTITY_LABEL);
    assert.ok(run.finding.message.includes(IDENTITY_NOTE_TEXT), run.finding.message);

    const human = spawnSync(process.execPath, [STANDARDS_CLI, "validate", fx.work], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.ok(human.stdout.includes("Reviewer identities are asserted by the policy text, not authenticated."));

    const inventory = runAttestations(fx.work);
    assert.equal(inventory.json.identityNote, IDENTITY_NOTE_TEXT);
    for (const row of inventory.json.attestations) assert.equal(row.identity, IDENTITY_LABEL);
    const table = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "attestations.mjs"), `--dir=${fx.work}`], {
      encoding: "utf8",
    });
    assert.ok(table.stdout.includes(IDENTITY_NOTE_TEXT));
    assert.ok(table.stdout.includes("(asserted, not authenticated)"));
  } finally {
    await cleanup(fx.root);
  }
});

test("replacing the attestations section with a flow mapping yields no verdict and no attestation command output as valid", async () => {
  const fx = await originFixture((digest) => twoRulePolicy(digest));
  try {
    git(fx.work, "checkout", "-q", "-b", "feature/flow-empty");
    const original = readFileSync(path.join(fx.work, "project-policy.yml"), "utf8");
    const mutated = `${policyWithoutAttestations(original)}attestations: {}\n`;
    await writeFile(path.join(fx.work, "project-policy.yml"), mutated);
    commitAll(fx.work, "replace attestations with an empty flow mapping");

    const validate = spawnSync(process.execPath, [STANDARDS_CLI, "validate", fx.work, "--json"], {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
    assert.equal(validate.status, 2, "a policy that cannot be parsed produces no verdict");
    assert.ok(!/"disposition":\s*"attested"/.test(validate.stdout), "an approval was reported as established");

    const inventory = runAttestations(fx.work);
    assert.equal(inventory.status, 2, inventory.stderr);
    assert.equal(inventory.json, null);
    const migrate = runAttestations(fx.work, "--migrate");
    assert.notEqual(migrate.status, 0);
    assert.equal(await readFile(path.join(fx.work, "project-policy.yml"), "utf8"), mutated);
  } finally {
    await cleanup(fx.root);
  }
});

// ---------------------------------------------------------------------------------------------
// ST-41: policy-controlled text is escaped before it reaches a message a person reads. A control
// character in an id, a reviewer or a date must never be written raw, and escaping changes no verdict.
// ---------------------------------------------------------------------------------------------

test("control characters in policy strings are escaped in human, JSON and attestations output, and change no verdict", async () => {
  const ESC = String.fromCharCode(27);
  const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
  const build = (id, reviewedBy, reviewedAt) => (digest) => {
    const lines = [
      policyText([{ id: "r1", reviewedAt: "2026-10-01", digest }]).trimEnd(),
      `  ${REJECTED_RULE}:`,
      `    reviews:`,
      `      - id: "${id}"`,
      `        status: rejected`,
      `        reviewedBy: "${reviewedBy}"`,
      `        reviewedAt: "${reviewedAt}"`,
      `        evidence: "synthetic rejection"`,
      `      - id: "p2"`,
      `        supersedes: "no-such-event"`,
      `        status: approved`,
      `        reviewedBy: "x"`,
      `        reviewedAt: "2026-10-02"`,
      `        evidence: "makes the chain malformed"`,
    ];
    return `${lines.join("\n")}\n`;
  };
  const verdict = async (id, reviewedBy, reviewedAt) => {
    const dir = await validateFixture();
    try {
      git(dir, "add", "reviewed.txt");
      git(dir, "commit", "-qm", "reviewed content");
      const digest = repositoryDigest(dir, ["reviewed.txt"]).digest;
      await writeFile(path.join(dir, "project-policy.yml"), build(id, reviewedBy, reviewedAt)(digest));
      git(dir, "add", "project-policy.yml");
      git(dir, "commit", "-qm", "policy");
      const run = runValidate(dir); // no default-branch ref: the comparison is NOT_EVALUATED
      const human = spawnSync(process.execPath, [STANDARDS_CLI, "validate", dir], { encoding: "utf8", windowsHide: true });
      const table = runAttestations(dir);
      const tableText = spawnSync(process.execPath, [path.join(REPO_ROOT, "scripts", "attestations.mjs"), `--dir=${dir}`], {
        encoding: "utf8",
        windowsHide: true,
      });
      return { run, human: human.stdout, table, tableText: tableText.stdout + tableText.stderr };
    } finally {
      await cleanup(dir);
    }
  };

  const plain = await verdict("p1", "reviewer-plain", "2026-10-01");
  const hostile = await verdict(`p${ESC}[31m1`, `evil${ESC}[31mRED${ESC}[0m`, "2026-10-01");

  const plainRule = plain.run.report.results.find((entry) => entry.ruleId === REJECTED_RULE);
  const hostileRule = hostile.run.report.results.find((entry) => entry.ruleId === REJECTED_RULE);
  // Escaping changes how a value is shown, never what is decided.
  assert.equal(hostileRule.status, plainRule.status);
  assert.equal(hostileRule.disposition, plainRule.disposition);
  assert.equal(hostile.run.report.status, plain.run.report.status);

  // The raw character appears nowhere a person reads, and the escape is visible instead.
  assert.ok(!CONTROL.test(hostileRule.message), JSON.stringify(hostileRule.message));
  assert.ok(hostileRule.message.includes("evil\\u001b[31mRED\\u001b[0m"), hostileRule.message);
  assert.ok(!CONTROL.test(hostile.human), "raw control character in the human validate output");
  assert.ok(hostile.human.includes("evil\\u001b[31mRED"), "the escaped reviewer is not shown");
  assert.ok(!CONTROL.test(JSON.stringify(hostile.run.report)), "raw control character in the JSON report");
  assert.ok(!CONTROL.test(hostile.tableText), "raw control character in the attestations table");
  assert.ok(!CONTROL.test(JSON.stringify(hostile.table.json)), "raw control character in the attestations JSON");

  // A control character in a date makes the policy schema-invalid: no verdict (exit 2), and the value is
  // not echoed raw by any surface.
  const badDate = await verdict("p1", "plain-reviewer", `2026-10-01${ESC}[2J`);
  assert.ok(!CONTROL.test(badDate.human), "raw control character in the human output for an invalid date");
  assert.ok(!CONTROL.test(JSON.stringify(badDate.run.report)), "raw control character in the JSON report for an invalid date");
  assert.ok(!CONTROL.test(badDate.tableText), "raw control character in the attestations output for an invalid date");
});

// ---------------------------------------------------------------------------------------------
// ST-41 repair: the same guarantee for the ordinary (well-formed history) paths. Every site that
// interpolates a policy string into a message, and the human `validate` renderer, is checked on the
// text a person reads. JSON output is always escaped by the serializer, so it is not evidence here:
// the message string is parsed back out of the JSON and must itself hold no raw control character.
// ---------------------------------------------------------------------------------------------

const ST41_ESC = String.fromCharCode(27);
const BS = String.fromCharCode(92);
const ST41_CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u2028\u2029]/;
const ST41_HOSTILE_REVIEWER = `evil${ST41_ESC}[31mRED${ST41_ESC}[0m`;
const ST41_HOSTILE_EVIDENCE = `ev${ST41_ESC}[2Jidence`;

async function st41Fixture({ status, mutateAfter, revision, extra }) {
  const dir = await validateFixture();
  git(dir, "add", "reviewed.txt");
  git(dir, "commit", "-qm", "reviewed content");
  const digest = repositoryDigest(dir, ["reviewed.txt"]).digest;
  const lines = [
    `standardVersion: "${readFileSync(path.join(REPO_ROOT, "VERSION"), "utf8").trim()}"`,
    `project: "synthetic"`,
    `rules:`,
    `  ${RULE}:`,
    `    level: required`,
    `attestations:`,
    `  ${RULE}:`,
    `    reviews:`,
    `      - id: "r1"`,
    `        status: ${status}`,
    `        reviewedBy: "${ST41_HOSTILE_REVIEWER}"`,
    `        reviewedAt: "2026-10-01"`,
    `        evidence: "${ST41_HOSTILE_EVIDENCE}"`,
    `        reviewedAgainst:`,
    ...(revision ? [`          revision: "${revision}"`] : []),
    `          digestAlgorithm: "${DIGEST_ALGORITHM}"`,
    `          digest: "${digest}"`,
    `          source: git`,
    `          paths:`,
    `            - "reviewed.txt"`,
    ...(extra ?? []),
  ];
  await writeFile(path.join(dir, "project-policy.yml"), `${lines.join("\n")}\n`);
  git(dir, "add", "project-policy.yml");
  git(dir, "commit", "-qm", "policy");
  git(dir, "update-ref", "refs/remotes/origin/main", "HEAD");
  if (mutateAfter) {
    await writeFile(path.join(dir, "reviewed.txt"), "one\ntwo\n");
    git(dir, "add", "reviewed.txt");
    git(dir, "commit", "-qm", "reviewed content changed");
  }
  return dir;
}

function st41Human(dir) {
  const result = spawnSync(process.execPath, [STANDARDS_CLI, "validate", dir], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return `${result.stdout}${result.stderr}`;
}

for (const site of [
  { name: "ordinary rejection (compliance.mjs attested-rejected message)", status: "rejected", mutateAfter: false, disposition: "attested-rejected", humanShows: "message" },
  { name: "stale review (compliance.mjs freshness message)", status: "approved", mutateAfter: true, disposition: "not-evaluated", humanShows: null },
  { name: "attested review (compliance.mjs attested message and standards.mjs Attested list)", status: "approved", mutateAfter: false, disposition: "attested", humanShows: "attested" },
]) {
  test(`ST-41: policy strings are display-safe in the text a person reads: ${site.name}`, async () => {
    const dir = await st41Fixture(site);
    try {
      const run = runValidate(dir);
      assert.equal(run.rule.disposition, site.disposition, JSON.stringify(run.rule));
      assert.ok(!ST41_CONTROL.test(run.rule.message), `raw control character in the result message: ${JSON.stringify(run.rule.message)}`);
      assert.ok(run.rule.message.includes("evil\\u001b[31mRED"), run.rule.message);
      const human = st41Human(dir);
      assert.ok(!ST41_CONTROL.test(human), "raw control character in the human validate output");
      if (site.humanShows) assert.ok(human.includes("evil\\u001b[31mRED"), "the escaped reviewer is not shown in the human output");
    } finally {
      await cleanup(dir);
    }
  });
}

// ST-41 class repair: every human-readable sink, not only the ones a review named. A schema-valid but
// hostile `revision`, and schema diagnostics that echo an unknown property name, must be neutral too.

function st41Run(args) {
  const result = spawnSync(process.execPath, args, { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  return { code: result.status, text: `${result.stdout}${result.stderr}` };
}

test("ST-41: the attestations inventory does not print a hostile revision raw", async () => {
  const dir = await st41Fixture({ status: "approved", revision: `rev${ST41_ESC}[31mBAD` });
  try {
    const { text } = st41Run([path.join(REPO_ROOT, "scripts", "attestations.mjs"), `--dir=${dir}`]);
    assert.ok(!ST41_CONTROL.test(text), "raw control character in the attestations inventory");
    assert.ok(text.includes(`rev${BS}u001b[31mBAD`), text);
  } finally {
    await cleanup(dir);
  }
});

test("ST-41: a schema-invalid policy with a hostile unknown property name is neutral in validate and the policy command", async () => {
  const BAD_KEY = `"bad${ST41_ESC}[31mkey": 1`; // a quoted key holding a raw ESC
  const dir = await st41Fixture({ status: "approved", extra: [BAD_KEY] });
  try {
    const file = path.join(dir, "project-policy.yml");
    const human = st41Run([STANDARDS_CLI, "validate", dir]);
    assert.equal(human.code, 2, human.text);
    assert.ok(!ST41_CONTROL.test(human.text), "raw control character in the validate output for a schema-invalid policy");
    assert.ok(human.text.includes(`bad${BS}u001b[31mkey`), human.text);
    const policyCli = st41Run([path.join(REPO_ROOT, "scripts", "policy.mjs"), file]);
    assert.ok(!ST41_CONTROL.test(policyCli.text), "raw control character in the policy command output");
    assert.ok(policyCli.text.includes(`bad${BS}u001b[31mkey`), policyCli.text);
  } finally {
    await cleanup(dir);
  }
});

test("ST-41: displaySafeText keeps layout and escapes the rest, and every raw write in scripts/ is accounted for", async () => {
  const { displaySafeText } = await import(pathToFileURL(path.join(REPO_ROOT, "scripts", "display-safe.mjs")).href);
  assert.equal(displaySafeText("a\nb\tc"), "a\nb\tc");
  assert.equal(displaySafeText(`x${ST41_ESC}[0m`), `x${BS}u001b[0m`);
  assert.equal(displaySafeText("cr\rline"), `cr${BS}rline`);
  assert.equal(displaySafeText(`sep${String.fromCharCode(0x2028)}`), `sep${BS}u2028`);
  // Class guard. A write to stdout/stderr in scripts/ goes through the display-safe chokepoint
  // (humanOut, humanErr, humanLog, emitText) or is one of these JSON-bearing writes, whose bytes come from
  // the serializer and must not change. A new raw write fails here until it is routed or justified.
  const RAW_ALLOWED = {
    "attestations.mjs": 2,
    "ci-triage.mjs": 1,
    "fidelity.mjs": 1,
    "inventory.mjs": 1,
    "links.mjs": 1,
    "ownership.mjs": 1,
    "pipeline.mjs": 1,
    "policy.mjs": 1,
    "standards.mjs": 1,
    "submit-gate.mjs": 1,
  };
  const found = {};
  for (const name of readdirSync(path.join(REPO_ROOT, "scripts")).filter((n) => n.endsWith(".mjs") && n !== "display-safe.mjs")) {
    const text = readFileSync(path.join(REPO_ROOT, "scripts", name), "utf8");
    const count = (text.match(/process\.std(?:out|err)\.write\(|console\.(?:log|error|warn|info)\(/g) ?? []).length;
    if (count > 0) found[name] = count;
  }
  assert.deepEqual(found, RAW_ALLOWED);
});

test("ST-41: a newline inside an untrusted field cannot forge a line in the rendered report", async () => {
  const { render } = await import(pathToFileURL(path.join(REPO_ROOT, "scripts", "init.mjs")).href);
  const { displaySafeText } = await import(pathToFileURL(path.join(REPO_ROOT, "scripts", "display-safe.mjs")).href);
  const report = {
    mode: "adopt",
    modeConfidence: "INFERRED",
    modeEvidence: ["evidence\nFORGED-EVIDENCE"],
    created: ["a/b\nFORGED-CREATED"],
    overwrites: [],
    preserved: [],
    conflicts: [{ path: "p\nFORGED-PATH", reason: "r\nFORGED-REASON", remediation: "fix" }],
    reconstructionRequired: false,
    nextStep: "next",
  };
  // The chokepoint alone preserves newlines, so the per-field escape is what keeps the field on one line.
  const shown = displaySafeText(render(report, { dryRun: true }));
  for (const line of shown.split("\n")) assert.ok(!/^\s*FORGED/.test(line), `forged line: ${JSON.stringify(line)}`);
  assert.ok(shown.includes(`${String.fromCharCode(92)}nFORGED-CREATED`), shown);
});

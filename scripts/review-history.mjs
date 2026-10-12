/**
 * Read-only comparison of proposed review histories with a policy stored at a trusted Git commit.
 *
 * The verifier writes only short-lived comparison files under the operating-system temp directory
 * so Git can produce ordinary no-index diff evidence. It never changes the supplied repository,
 * invokes a network, or writes a policy.
 */

import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseYaml } from "./yaml.mjs";
import { resolveReviewHistory, resolveRecordedReviewHistory, reviewsOf } from "./reviews.mjs";

const OBJECT_ID = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

export class ReviewHistoryVerificationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ReviewHistoryVerificationError";
    this.details = details;
  }
}

function fail(message, details) {
  throw new ReviewHistoryVerificationError(message, details);
}

/** The proposed policy rewrites history, as opposed to the comparison being unable to run. */
function violation(message, details = {}) {
  throw new ReviewHistoryVerificationError(message, { ...details, violation: true });
}

function runGit(repositoryPath, args, { acceptedStatuses = [0] } = {}) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) fail(`git ${args[0]} could not run: ${result.error.message}`);
  if (!acceptedStatuses.includes(result.status)) {
    fail(`git ${args.join(" ")} failed`, {
      exitCode: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
  return result;
}

function exactPolicyPath(value) {
  if (typeof value !== "string" || value.length === 0) fail("policyPath must be a non-empty relative path");
  const slashPath = value.replaceAll("\\", "/");
  const normalized = path.posix.normalize(slashPath);
  if (
    normalized !== slashPath ||
    normalized === "." ||
    normalized.startsWith("../") ||
    path.posix.isAbsolute(normalized)
  ) {
    fail(`policyPath is not an exact repository-relative path: ${value}`);
  }
  return normalized;
}

function parsePolicy(source, label) {
  if (typeof source !== "string") fail(`${label} policy source must be a string`);
  try {
    const document = parseYaml(source);
    if (!document || typeof document !== "object" || Array.isArray(document)) {
      fail(`${label} policy did not parse to a mapping`);
    }
    return document;
  } catch (error) {
    if (error instanceof ReviewHistoryVerificationError) throw error;
    fail(`${label} policy could not be parsed: ${error.message}`);
  }
}

async function gitDiffEvidence(priorSource, proposedSource, policyPath) {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "review-history-diff-"));
  try {
    const priorPath = path.join(tempRoot, "base", ...policyPath.split("/"));
    const proposedPath = path.join(tempRoot, "proposed", ...policyPath.split("/"));
    await mkdir(path.dirname(priorPath), { recursive: true });
    await mkdir(path.dirname(proposedPath), { recursive: true });
    await writeFile(priorPath, priorSource, "utf8");
    await writeFile(proposedPath, proposedSource, "utf8");
    const result = spawnSync(
      "git",
      ["diff", "--no-index", "--text", "--no-ext-diff", "--", `base/${policyPath}`, `proposed/${policyPath}`],
      { cwd: tempRoot, encoding: "utf8", windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    );
    if (result.error) fail(`git diff could not run: ${result.error.message}`);
    if (result.status !== 0 && result.status !== 1) {
      fail("git diff could not produce policy-path evidence", {
        exitCode: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
      });
    }
    return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

/**
 * Verify an append-only proposed policy against an exact policy blob at an exact Git base.
 *
 * @param {object} input
 * @param {string} input.repositoryPath local repository or worktree path
 * @param {string} input.baseCommit full trusted commit object id
 * @param {string} input.expectedBaseTree full expected tree object id
 * @param {string} input.policyPath exact repository-relative policy path
 * @param {string} input.proposedPolicySource complete proposed policy text
 */
export async function verifyReviewHistoryAppend({
  repositoryPath,
  baseCommit,
  expectedBaseTree,
  policyPath,
  proposedPolicySource,
}) {
  const repository = path.resolve(repositoryPath ?? "");
  if (!OBJECT_ID.test(baseCommit ?? "")) fail("baseCommit must be one full, unambiguous Git object id");
  if (!OBJECT_ID.test(expectedBaseTree ?? "")) fail("expectedBaseTree must be one full Git tree object id");
  const exactPath = exactPolicyPath(policyPath);

  runGit(repository, ["rev-parse", "--git-dir"]);
  runGit(repository, ["cat-file", "-e", `${baseCommit}^{commit}`]);
  const resolvedCommit = runGit(repository, ["rev-parse", "--verify", `${baseCommit}^{commit}`]).stdout.trim();
  if (resolvedCommit !== baseCommit) fail(`base commit resolved to ${resolvedCommit}, expected ${baseCommit}`);

  const baseTree = runGit(repository, ["rev-parse", `${baseCommit}^{tree}`]).stdout.trim();
  if (baseTree !== expectedBaseTree) {
    fail(`base tree ${baseTree} does not match expected ${expectedBaseTree}`, { baseTree, expectedBaseTree });
  }

  const priorSource = runGit(repository, ["show", `${baseCommit}:${exactPath}`]).stdout;
  const prior = parsePolicy(priorSource, "base");
  const proposed = parsePolicy(proposedPolicySource, "proposed");
  const priorHistories = prior.attestations ?? {};
  const proposedHistories = proposed.attestations ?? {};
  if (typeof priorHistories !== "object" || Array.isArray(priorHistories)) fail("base attestations must be a mapping");
  if (typeof proposedHistories !== "object" || Array.isArray(proposedHistories)) {
    fail("proposed attestations must be a mapping");
  }

  const histories = [];
  let appendedEvents = 0;
  for (const [ruleId, priorRecord] of Object.entries(priorHistories)) {
    if (!priorRecord || typeof priorRecord !== "object" || Array.isArray(priorRecord)) {
      fail(`${ruleId}: base review history is not a mapping`);
    }
    if (!Object.hasOwn(proposedHistories, ruleId)) violation(`${ruleId}: prior review history was deleted`);
    const priorReviews = reviewsOf(priorRecord);
    const proposedRecord = proposedHistories[ruleId];
    if (!proposedRecord || typeof proposedRecord !== "object" || Array.isArray(proposedRecord)) {
      violation(`${ruleId}: proposed review history is not a mapping`);
    }
    const proposedReviews = reviewsOf(proposedRecord);
    if (proposedReviews.length < priorReviews.length) {
      violation(`${ruleId}: prior review events were deleted`, {
        priorLength: priorReviews.length,
        proposedLength: proposedReviews.length,
      });
    }
    for (let index = 0; index < priorReviews.length; index += 1) {
      if (!isDeepStrictEqual(priorReviews[index], proposedReviews[index])) {
        violation(`${ruleId}: historical review at index ${index} was edited, reordered, relabeled, or reinserted`);
      }
    }
    const resolution = resolveReviewHistory(ruleId, proposedRecord, { trustedPrefixLength: priorReviews.length });
    // A rule the pinned manifest anchors must still carry its complete anchored prefix, whatever
    // the supplied base says: a base commit is a parameter, the manifest is not.
    const anchored = resolveRecordedReviewHistory(ruleId, proposedRecord);
    if (!resolution.problems.length && anchored.problems.length) resolution.problems.push(...anchored.problems);
    if (resolution.problems.length) {
      violation(`${ruleId}: proposed review chain is invalid: ${resolution.problems.join("; ")}`, {
        problems: resolution.problems,
      });
    }
    const appended = proposedReviews.length - priorReviews.length;
    appendedEvents += appended;
    histories.push({ rule: ruleId, priorEvents: priorReviews.length, appendedEvents: appended });
  }

  for (const [ruleId, proposedRecord] of Object.entries(proposedHistories)) {
    if (Object.hasOwn(priorHistories, ruleId)) continue;
    if (!proposedRecord || typeof proposedRecord !== "object" || Array.isArray(proposedRecord)) {
      violation(`${ruleId}: proposed review history is not a mapping`);
    }
    const resolution = resolveRecordedReviewHistory(ruleId, proposedRecord);
    if (resolution.problems.length) {
      violation(`${ruleId}: proposed review chain is invalid: ${resolution.problems.join("; ")}`, {
        problems: resolution.problems,
      });
    }
    appendedEvents += resolution.reviews.length;
    histories.push({ rule: ruleId, priorEvents: 0, appendedEvents: resolution.reviews.length });
  }

  const diff = await gitDiffEvidence(priorSource, proposedPolicySource, exactPath);
  if (appendedEvents > 0 && diff.exitCode === 0) {
    violation("structured comparison found appended events but the exact policy-path Git diff is empty");
  }

  return {
    ok: true,
    repositoryPath: repository,
    baseCommit: resolvedCommit,
    baseTree,
    policyPath: exactPath,
    appendedEvents,
    histories,
    diff,
  };
}

const DEFAULT_BRANCH_FALLBACKS = ["origin/develop", "origin/main", "origin/master"];

function tryGit(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim();
}

/**
 * Compare a proposed policy with the policy at a trusted base the repository itself determines.
 *
 * No caller parameter chooses the base. It is `merge-base(HEAD, <default-branch ref>)`, where the
 * ref is `origin/HEAD` when set, otherwise the first of origin/develop, origin/main, origin/master.
 * The result is one of:
 *
 * - `verified`: the base was found, the policy existed there, and no prior event was deleted,
 *   edited, reordered, relabeled or reinserted; every appended chain is valid.
 * - `violated`: the comparison ran and the proposed policy rewrites history (details in `reason`).
 * - `not-evaluated`: no trusted base could be determined (no repository, no remote default-branch ref,
 *   no merge-base such as a shallow clone, or the policy file absent at the base). Nothing about
 *   the history is established; the reason is always stated and never silently skipped.
 *
 * What it can establish: relative to that base, history was only appended. What it cannot: that the
 * base itself was honest (the pinned manifest covers the history that existed when it was written),
 * who authored an append, or anything when HEAD is the default branch tip (the base is then HEAD,
 * so only uncommitted edits to the policy are visible). It is read-only apart from short-lived
 * comparison files under the OS temp directory.
 */
export async function verifyAgainstTrustedBase({ repositoryPath, policyPath, proposedPolicySource }) {
  const unverified = (reason, extra = {}) => ({ status: "not-evaluated", reason, ...extra });
  const repository = path.resolve(repositoryPath ?? "");

  const top = tryGit(repository, ["rev-parse", "--show-toplevel"]);
  if (!top) return unverified("the directory is not a Git work tree, so no trusted base exists");
  const relative = path.relative(path.resolve(top), path.resolve(repository, policyPath ?? "")).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    return unverified("the policy file is outside the repository");
  }

  let ref = tryGit(repository, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (ref && tryGit(repository, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]) === null) ref = null;
  if (!ref) {
    ref = DEFAULT_BRANCH_FALLBACKS.find(
      (candidate) => tryGit(repository, ["rev-parse", "--verify", "--quiet", `${candidate}^{commit}`]) !== null,
    );
  }
  if (!ref) {
    return unverified(
      "no remote default-branch ref (origin/HEAD, origin/develop, origin/main, origin/master) is available",
    );
  }

  const head = tryGit(repository, ["rev-parse", "--verify", "HEAD^{commit}"]);
  if (!head) return unverified("HEAD does not name a commit");
  const baseCommit = tryGit(repository, ["merge-base", "HEAD", ref]);
  if (!baseCommit || !OBJECT_ID.test(baseCommit)) {
    const shallow = tryGit(repository, ["rev-parse", "--is-shallow-repository"]) === "true";
    return unverified(
      `no merge-base between HEAD and ${ref}${shallow ? " (shallow clone: fetch more history)" : ""}`,
      { ref },
    );
  }
  const baseTree = tryGit(repository, ["rev-parse", `${baseCommit}^{tree}`]);
  if (!baseTree) return unverified(`the tree of base commit ${baseCommit} is not readable`, { ref, baseCommit });
  if (tryGit(repository, ["cat-file", "-e", `${baseCommit}:${relative}`]) === null) {
    // `cat-file -e` prints nothing on success, so an empty string is success and null is failure.
    return unverified(`${relative} does not exist at base commit ${baseCommit}`, { ref, baseCommit });
  }

  try {
    const result = await verifyReviewHistoryAppend({
      repositoryPath: repository,
      baseCommit,
      expectedBaseTree: baseTree,
      policyPath: relative,
      proposedPolicySource,
    });
    return {
      status: "verified",
      ref,
      baseCommit,
      baseTree,
      headIsBase: baseCommit === head,
      appendedEvents: result.appendedEvents,
      histories: result.histories,
    };
  } catch (error) {
    if (error instanceof ReviewHistoryVerificationError) {
      if (error.details?.violation) return { status: "violated", reason: error.message, ref, baseCommit, baseTree };
      return unverified(error.message, { ref, baseCommit });
    }
    throw error;
  }
}

/** Reviewer identities in a policy are assertions of the policy text. Nothing authenticates them. */
export const IDENTITY_NOTE =
  "reviewedBy and reviewerRole are ASSERTED by the policy text, not authenticated; no signature or " +
  "trusted-actor mechanism verifies them.";

/**
 * The history-integrity preflight shared by `standards validate` and `npm run attestations`.
 *
 * It reads the policy file at `repositoryPath` itself, so no caller can compare one text and judge
 * another, and returns the base comparison plus the one consequence both commands apply:
 *
 * - `verified`: attestations are effective.
 * - `violated`: attestations are withdrawn (the policy rewrites recorded history).
 * - `not-evaluated`: attestations are withdrawn as well. Their validity depends on a history that
 *   could not be compared with a trusted base, and an attestation must not stay effective merely
 *   because the comparison was unavailable.
 *
 * `effective` is true only for `verified`. A policy that records no attestation returns
 * `{ status: "not-applicable", effective: true }`: there is no history to protect.
 *
 * What a developer sees without a remote: the finding states `NOT_EVALUATED` with the reason and the
 * command that supplies the missing ref (`git fetch origin`), and the rules those attestations would
 * have established report as unreviewed. This is deliberate: a clone that cannot see the default
 * branch cannot show that history was only appended.
 */
export async function reviewHistoryPreflight({ repositoryPath, policyPath = "project-policy.yml" }) {
  const repository = path.resolve(repositoryPath ?? "");
  let source;
  try {
    source = await readFile(path.resolve(repository, policyPath), "utf8");
  } catch (error) {
    return { status: "not-evaluated", effective: false, reason: `the policy could not be read: ${error.message}` };
  }
  let document;
  try {
    document = parseYaml(source);
  } catch (error) {
    return { status: "not-evaluated", effective: false, reason: `the policy could not be parsed: ${error.message}` };
  }
  const attestations = document?.attestations;
  if (!attestations || typeof attestations !== "object" || Object.keys(attestations).length === 0) {
    return { status: "not-applicable", effective: true, reason: "the policy records no attestation" };
  }
  const result = await verifyAgainstTrustedBase({
    repositoryPath: repository,
    policyPath,
    proposedPolicySource: source,
  });
  return { ...result, effective: result.status === "verified" };
}

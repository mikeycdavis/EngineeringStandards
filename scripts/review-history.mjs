/**
 * Read-only comparison of proposed review histories with a policy stored at a trusted Git commit.
 *
 * The verifier writes only short-lived comparison files under the operating-system temp directory
 * so Git can produce ordinary no-index diff evidence. It never changes the supplied repository,
 * invokes a network, or writes a policy.
 */

import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { parseYaml } from "./yaml.mjs";
import { resolveReviewHistory, reviewsOf } from "./reviews.mjs";

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
    if (!Object.hasOwn(proposedHistories, ruleId)) fail(`${ruleId}: prior review history was deleted`);
    const priorReviews = reviewsOf(priorRecord);
    const proposedRecord = proposedHistories[ruleId];
    if (!proposedRecord || typeof proposedRecord !== "object" || Array.isArray(proposedRecord)) {
      fail(`${ruleId}: proposed review history is not a mapping`);
    }
    const proposedReviews = reviewsOf(proposedRecord);
    if (proposedReviews.length < priorReviews.length) {
      fail(`${ruleId}: prior review events were deleted`, {
        priorLength: priorReviews.length,
        proposedLength: proposedReviews.length,
      });
    }
    for (let index = 0; index < priorReviews.length; index += 1) {
      if (!isDeepStrictEqual(priorReviews[index], proposedReviews[index])) {
        fail(`${ruleId}: historical review at index ${index} was edited, reordered, relabeled, or reinserted`);
      }
    }
    const resolution = resolveReviewHistory(ruleId, proposedRecord, { trustedPrefixLength: priorReviews.length });
    if (resolution.problems.length) {
      fail(`${ruleId}: proposed review chain is invalid: ${resolution.problems.join("; ")}`, {
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
      fail(`${ruleId}: proposed review history is not a mapping`);
    }
    const resolution = resolveReviewHistory(ruleId, proposedRecord);
    if (resolution.problems.length) {
      fail(`${ruleId}: proposed review chain is invalid: ${resolution.problems.join("; ")}`, {
        problems: resolution.problems,
      });
    }
    appendedEvents += resolution.reviews.length;
    histories.push({ rule: ruleId, priorEvents: 0, appendedEvents: resolution.reviews.length });
  }

  const diff = await gitDiffEvidence(priorSource, proposedPolicySource, exactPath);
  if (appendedEvents > 0 && diff.exitCode === 0) {
    fail("structured comparison found appended events but the exact policy-path Git diff is empty");
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

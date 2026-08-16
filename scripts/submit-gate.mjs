#!/usr/bin/env node
/**
 * The exact-commit invariant, as a decision function.
 *
 *   A pull request may only be submitted if the exact commit SHA being pushed has successfully
 *   passed the repository's complete containerized CI pipeline.
 *
 * This lives in Node rather than inside `submit-pr.ps1` and `submit-pr.sh` for one reason: the
 * invariant has to be *tested*, and a rule implemented twice in two shells is two rules that agree
 * until one of them is edited. The shell scripts gather facts — is this a repository, what branch,
 * is the tree dirty, what was HEAD before and after — and this decides. `test/local-ci.test.mjs`
 * drives every refusal path through this function without touching a real branch, a real remote, or
 * real history.
 *
 * A refusal is not an error condition to be recovered from. Every branch below returns a reason and
 * a message, and the caller's only permitted response is to print it and stop.
 *
 * Holds no module-level run state: `evaluateSubmission` is pure, and every value it reads arrives as
 * an argument (ADR 0014).
 */

import { pathToFileURL } from "node:url";

const EXIT_REFUSED = 1;
const EXIT_INVOCATION = 2;

/**
 * Branches a pull request may not be *submitted from*.
 *
 * `master` and `develop` are integration branches in this repository, and the standing instruction
 * is that neither is pushed to directly. `main` is included because this pattern is meant to be
 * copied into repositories that use it, and a guard that silently does nothing in the next
 * repository is worse than no guard.
 */
export const PROTECTED_BRANCHES = ["master", "main", "develop"];

/** The two messages the task specifies verbatim, kept where both callers read the same string. */
export const MESSAGES = {
  ciFailed: "CI failed. No branch was pushed and no PR was created.",
  headMoved:
    "HEAD changed after CI verification. The current commit has not been verified. " +
    "Re-run CI before submitting.",
};

const isSha = (v) => typeof v === "string" && /^[0-9a-f]{40}$/.test(v);

/**
 * Decide whether this submission may proceed.
 *
 * Checks are ordered cheapest-and-most-fundamental first, and the order is part of the contract:
 * a dirty tree is reported before CI runs, so a developer is not made to wait ten minutes to be
 * told something visible in the first second.
 *
 * @param {object} facts
 * @param {boolean} facts.isRepository   `git rev-parse --git-dir` succeeded.
 * @param {string}  facts.branch         Current branch name, or "HEAD" when detached.
 * @param {string}  facts.base           The pull request's base branch.
 * @param {string[]} facts.dirty         `git status --porcelain` lines. Empty means clean.
 * @param {string}  facts.shaBefore      `git rev-parse HEAD` captured *before* CI ran.
 * @param {string}  facts.shaAfter       `git rev-parse HEAD` captured *after* CI finished.
 * @param {number}  facts.ciExitCode     Exit status of the containerized pipeline.
 * @param {object|null} facts.evidence   Parsed artifacts/local-ci/latest.json, or null if absent.
 * @returns {{allowed: boolean, reason: string, message: string}}
 */
export function evaluateSubmission(facts) {
  const {
    isRepository,
    branch,
    base,
    dirty = [],
    shaBefore,
    shaAfter,
    ciExitCode,
    evidence = null,
  } = facts ?? {};

  if (!isRepository) {
    return refuse("not-a-repository", "Not a Git repository. Run this from inside the repository.");
  }

  if (!branch || branch === "HEAD") {
    return refuse(
      "detached-head",
      "HEAD is detached. A pull request is opened from a branch; check one out before submitting.",
    );
  }

  if (PROTECTED_BRANCHES.includes(branch)) {
    return refuse(
      "protected-branch",
      `Refusing to submit from '${branch}'. It is an integration branch, not a feature branch; ` +
        "the workflow never pushes directly to one.",
    );
  }

  if (branch === base) {
    return refuse("branch-is-base", `The branch and the base are both '${branch}'. There is nothing to compare.`);
  }

  if (dirty.length > 0) {
    // Refused rather than stashed. The commit that gets verified must be the commit that gets
    // pushed, and any uncommitted change means the tree CI sees is not a commit at all — so there
    // would be no SHA to hold the invariant against.
    return refuse(
      "dirty-tree",
      `The working tree has ${dirty.length} uncommitted change(s). Commit or stash them: CI verifies a ` +
        "commit, and an uncommitted change is not in one.\n  " +
        dirty.slice(0, 20).join("\n  "),
    );
  }

  if (!isSha(shaBefore)) {
    return refuse("no-pre-sha", `Could not resolve HEAD before CI (got ${JSON.stringify(shaBefore)}).`);
  }

  if (ciExitCode !== 0) {
    return refuse("ci-failed", MESSAGES.ciFailed);
  }

  if (!isSha(shaAfter)) {
    return refuse("no-post-sha", `Could not resolve HEAD after CI (got ${JSON.stringify(shaAfter)}).`);
  }

  if (shaAfter !== shaBefore) {
    return refuse("head-moved", `${MESSAGES.headMoved}\n  verified: ${shaBefore}\n  current:  ${shaAfter}`);
  }

  // The evidence cross-check, and the reason it is not redundant with the comparison above.
  //
  // `shaBefore === shaAfter` proves HEAD did not move around the CI run. It does not prove the run
  // that produced a pass was *this* run: a stale artifacts/local-ci/latest.json from an earlier
  // commit satisfies the SHA comparison entirely, because the comparison never reads it. So the
  // pipeline's own record of which commit it verified is checked against the commit being pushed.
  if (!evidence) {
    return refuse(
      "no-evidence",
      "The pipeline produced no verification record. Nothing establishes which commit was checked.",
    );
  }
  if (evidence.scope !== "complete") {
    return refuse(
      "evidence-partial",
      `The verification record covers scope '${evidence.scope}', not the complete pipeline. ` +
        "A subset of stages passing is not the pipeline passing.",
    );
  }
  if (evidence.environment?.containerized !== true) {
    return refuse(
      "evidence-not-containerized",
      "The verification record was not produced inside the CI container. A run on the developer's " +
        "host proves the developer's host, which is the thing containerizing CI exists to stop relying on.",
    );
  }
  if (evidence.result !== "passed") {
    return refuse(
      "evidence-not-passed",
      `The verification record reports '${evidence.result}', not 'passed'. ${MESSAGES.ciFailed}`,
    );
  }
  if (evidence.commit !== shaBefore) {
    return refuse(
      "evidence-commit-mismatch",
      "The verification record names a different commit than the one being pushed. " +
        `${MESSAGES.headMoved}\n  record:   ${evidence.commit}\n  pushing:  ${shaBefore}`,
    );
  }

  return {
    allowed: true,
    reason: "verified",
    message: `Verified commit ${shaBefore} on '${branch}' passed the complete local Docker CI pipeline.`,
  };
}

function refuse(reason, message) {
  return { allowed: false, reason, message };
}

/**
 * The PR body's verification block.
 *
 * Deliberately says *local Docker* and names no GitHub-hosted run, because none happened. Claiming
 * otherwise would be `errors.no-false-success` reasoning applied to a pull request: reporting a
 * success semantics for something that did not occur.
 */
export function evidenceBlock(evidence) {
  const stages = (evidence.checks ?? [])
    .map((c) => `- \`${c.id}\` — ${c.outcome} (exit ${c.exitCode})${c.gating ? "" : " _[advisory, non-gating]_"}`)
    .join("\n");
  return [
    "## Local CI",
    "",
    "This pipeline ran in an ephemeral Docker container on the author's machine.",
    "It is **not** a GitHub-hosted Actions run and makes no claim about one.",
    "",
    `- Verified commit: \`${evidence.commit}\``,
    `- Branch: \`${evidence.branch}\``,
    "- Result: **PASS**",
    `- Environment: Docker (\`${evidence.environment?.image ?? "unknown image"}\`, Node ${evidence.environment?.node ?? "unknown"})`,
    `- Completed: ${evidence.completedAt}`,
    "",
    "<details><summary>Stages executed</summary>",
    "",
    stages,
    "",
    "</details>",
  ].join("\n");
}

/**
 * CLI shim, so a shell script can ask the question without reimplementing the answer.
 *
 * Facts arrive as one JSON object on stdin; the verdict leaves as one JSON object on stdout. Exit 0
 * means allowed, 1 means refused, 2 means the question itself was malformed — the same three-way
 * split the validator uses, for the same reason: "refused" and "could not decide" are different
 * answers and flattening them would hide the second.
 */
async function main(argv) {
  const mode = argv[0] ?? "decide";
  if (!["decide", "pr-body"].includes(mode)) {
    process.stderr.write("usage: node scripts/submit-gate.mjs <decide|pr-body>  (JSON on stdin)\n");
    return EXIT_INVOCATION;
  }

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  let input;
  try {
    input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
  } catch (err) {
    process.stderr.write(`submit-gate: could not parse stdin as JSON: ${err.message}\n`);
    return EXIT_INVOCATION;
  }
  if (!input || typeof input !== "object") {
    process.stderr.write("submit-gate: expected a JSON object on stdin.\n");
    return EXIT_INVOCATION;
  }

  if (mode === "pr-body") {
    process.stdout.write(`${evidenceBlock(input)}\n`);
    return 0;
  }

  const verdict = evaluateSubmission(input);
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
  return verdict.allowed ? 0 : EXIT_REFUSED;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}

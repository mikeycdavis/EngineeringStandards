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
import { constants as bufferConstants } from "node:buffer";
import { parseYaml } from "./yaml.mjs";
import { resolveReviewHistory, resolveRecordedReviewHistory, reviewsOf, recordedRejections } from "./reviews.mjs";

// Policy blobs are read whole through git. A bound here turns a large (or deeply nested) trusted base into
// "could not be compared", which drops the base's recorded rejections; keep it far above any real policy.
// It stays well under V8's maximum string length (about 512 MiB): at or above that, decoding the output
// throws ERR_STRING_TOO_LONG out of spawnSync instead of returning an error the caller can classify.
// The bound is also clamped to this runtime's actual maximum string length (2^28 - 16 on 32-bit V8 builds).
// `spawnSync` can read one pipe chunk past `maxBuffer` before it reports ENOBUFS, and the output is then
// decoded, so the bound keeps headroom below the limit rather than sitting on it.
const STRING_HEADROOM = 1024 * 1024;
export const GIT_MAX_BUFFER = Math.min(256 * 1024 * 1024, bufferConstants.MAX_STRING_LENGTH - STRING_HEADROOM);

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
    maxBuffer: GIT_MAX_BUFFER,
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
      { cwd: tempRoot, encoding: "utf8", windowsHide: true, maxBuffer: GIT_MAX_BUFFER },
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
  allowMissingBasePolicy = false,
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

  // A policy that did not exist at the base has no history to rewrite: every proposed history is
  // new and is validated strictly below.
  const baseHadPolicy = spawnSync("git", ["-C", repository, "cat-file", "-e", `${baseCommit}:${exactPath}`], {
    windowsHide: true,
  }).status === 0;
  if (!baseHadPolicy && !allowMissingBasePolicy) {
    fail(`${exactPath} does not exist at base commit ${baseCommit}`);
  }
  const priorSource = baseHadPolicy ? runGit(repository, ["show", `${baseCommit}:${exactPath}`]).stdout : "";
  const prior = baseHadPolicy ? parsePolicy(priorSource, "base") : {};
  // `null` means the policy file no longer exists at its path (deleted, moved or renamed): it has no
  // attestations, which is a violation exactly when the base recorded any.
  const proposed = proposedPolicySource === null ? {} : parsePolicy(proposedPolicySource, "proposed");
  const priorHistories = prior.attestations ?? {};
  const proposedHistories = proposed.attestations ?? {};
  if (typeof priorHistories !== "object" || Array.isArray(priorHistories)) fail("base attestations must be a mapping");
  if (typeof proposedHistories !== "object" || Array.isArray(proposedHistories)) {
    if (Object.keys(priorHistories).length > 0) violation("proposed attestations are not a mapping; prior histories were removed");
    fail("proposed attestations must be a mapping");
  }

  const histories = [];
  let appendedEvents = 0;
  for (const [ruleId, priorRecord] of Object.entries(priorHistories)) {
    if (!priorRecord || typeof priorRecord !== "object" || Array.isArray(priorRecord)) {
      fail(`${ruleId}: base review history is not a mapping`);
    }
    if (!Object.hasOwn(proposedHistories, ruleId)) violation(`${ruleId}: prior review history was deleted`);
    // A `reviews` container that is present, not null and not a list may hide events (a mapping that
    // holds an event reads as zero events). Replacing it could erase a recorded rejection, so it is
    // unverifiable and never recoverable by replacement. Only an absent or null container, or an empty
    // list, is zero events.
    if (Object.hasOwn(priorRecord, "reviews") && priorRecord.reviews !== null && !Array.isArray(priorRecord.reviews)) {
      violation(`${ruleId}: base reviews is not a list and may hide recorded events; it cannot be replaced`);
    }
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

  const diff =
    proposedPolicySource === null || !baseHadPolicy
      ? { exitCode: 1, stdout: "", stderr: "" }
      : await gitDiffEvidence(priorSource, proposedPolicySource, exactPath);
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
    maxBuffer: GIT_MAX_BUFFER,
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

  try {
    const result = await verifyReviewHistoryAppend({
      repositoryPath: repository,
      baseCommit,
      expectedBaseTree: baseTree,
      policyPath: relative,
      proposedPolicySource,
      allowMissingBasePolicy: true,
    });
    return {
      status: "verified",
      ref,
      baseCommit,
      baseTree,
      baseRejectionRules: baseRejectionRules(repository, baseCommit, relative),
      headIsBase: baseCommit === head,
      appendedEvents: result.appendedEvents,
      histories: result.histories,
    };
  } catch (error) {
    if (error instanceof ReviewHistoryVerificationError) {
      if (error.details?.violation) {
        const baseAttestations = readBaseAttestations(repository, baseCommit, relative) ?? {};
        return {
          status: "violated",
          reason: error.message,
          ref,
          baseCommit,
          baseTree,
          baseAttestations,
          baseRejectionRules: rejectionRulesOf(baseAttestations),
        };
      }
      // The comparison could not run (for example another rule's base record is not a mapping), but
      // the base was readable: its recorded histories are still the trusted record of rejections.
      const readable = readBaseAttestations(repository, baseCommit, relative);
      return unverified(error.message, {
        ref,
        baseCommit,
        // Not `baseAttestations`: effectiveAttestations reads that and would restore a base rejection
        // into the verdict. This channel feeds only the ST-47 finding lookup.
        baseRecordedAttestations: readable ?? {},
        baseRejectionRules: readable === null ? null : rejectionRulesOf(readable),
      });
    }
    throw error;
  }
}

/**
 * The attestations mapping recorded in the policy at the base commit: {} when the base policy has none,
 * null when the base policy could not be read or parsed (unknown, never "none").
 */
function readBaseAttestations(repository, baseCommit, relative) {
  try {
    const baseSource = tryGit(repository, ["show", `${baseCommit}:${relative}`]);
    if (baseSource === null) return null;
    const parsed = parseYaml(baseSource);
    if (parsed?.attestations && typeof parsed.attestations === "object" && !Array.isArray(parsed.attestations)) {
      return parsed.attestations;
    }
    return {};
  } catch {
    return null;
  }
}

/** Rule ids whose recorded history holds a rejection anywhere (the ST-47 finding reads it the same way). */
function rejectionRulesOf(attestations) {
  if (!attestations || typeof attestations !== "object" || Array.isArray(attestations)) return [];
  return Object.keys(attestations)
    .filter((ruleId) => recordedRejections(attestations[ruleId]).length > 0)
    .sort();
}

/**
 * The rules that record a rejection in the policy AT the trusted base. A rejection there is
 * established, append-only history; one that is only in the head can still be withdrawn, because
 * history is compared with the base. Returns null when the base policy cannot be read, which callers
 * must treat as unknown, never as "none".
 */
function baseRejectionRules(repository, baseCommit, relative) {
  try {
    const baseSource = tryGit(repository, ["show", `${baseCommit}:${relative}`]);
    if (baseSource === null) return [];
    return rejectionRulesOf(parseYaml(baseSource)?.attestations);
  } catch {
    return null;
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
 * another, and it ALWAYS compares with the trusted base when one exists, even when the policy now
 * records no attestation: deleting the `attestations:` section, emptying it, removing a rule key,
 * emptying a `reviews` list, or deleting or moving the policy file is a violation whenever the base
 * recorded any. Statuses:
 *
 * - `verified`: attestations are effective.
 * - `violated`: the policy rewrites or removes recorded history.
 * - `not-evaluated`: no trusted base could be determined.
 * - `not-applicable`: nothing recorded and nothing to protect (or, with no base, nothing to disregard).
 *
 * `effective` is true for `verified` and `not-applicable`. When it is false the caller applies
 * `effectiveAttestations`, which disregards APPROVALS (and every freshness-established attestation)
 * but keeps recorded REJECTIONS effective (see holdsRejection): negative evidence is never removed because a comparison
 * was unavailable or because history was rewritten. On `violated` the rejections recorded at the
 * trusted base are the ones kept, so removing or relabeling a rejection does not clear it.
 *
 * What a developer sees without a remote: the finding states `NOT_EVALUATED` with the reason and the
 * command that supplies the missing ref (`git fetch origin`); approvals report as unreviewed and
 * recorded rejections still fail their rules. Without a base, the removal of a whole policy section
 * cannot be detected; that limit is stated, not hidden.
 */
export async function reviewHistoryPreflight({ repositoryPath, policyPath = "project-policy.yml" }) {
  const repository = path.resolve(repositoryPath ?? "");
  let source = null;
  try {
    source = await readFile(path.resolve(repository, policyPath), "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") {
      return { status: "not-evaluated", effective: false, reason: `the policy could not be read: ${error.message}` };
    }
  }
  let document = null;
  if (source !== null) {
    try {
      document = parseYaml(source);
    } catch (error) {
      return { status: "not-evaluated", effective: false, reason: `the policy could not be parsed: ${error.message}` };
    }
  }
  const headAttestations = document?.attestations;
  const headCount =
    headAttestations && typeof headAttestations === "object" && !Array.isArray(headAttestations)
      ? Object.keys(headAttestations).length
      : 0;

  const result = await verifyAgainstTrustedBase({
    repositoryPath: repository,
    policyPath,
    proposedPolicySource: source,
  });

  if (result.status === "not-evaluated") {
    // A readable base that records attestations was found and the comparison could not run: the
    // status stays not-evaluated (the warning is emitted) even when the head deleted the section. The
    // base histories ride on `baseRecordedAttestations`, which effectiveAttestations never reads, so
    // they cannot enter the verdict; with an empty head there is nothing else for it to keep.
    if (headCount === 0 && Object.keys(result.baseRecordedAttestations ?? {}).length > 0) {
      return { ...result, effective: false };
    }
    if (headCount === 0) {
      return {
        status: "not-applicable",
        effective: true,
        reason:
          `the policy records no attestation and no base could be determined (${result.reason}), ` +
          "so the removal of earlier attestations cannot be detected",
      };
    }
    return { ...result, effective: false };
  }
  if (result.status === "verified" && headCount === 0) {
    return { ...result, status: "not-applicable", effective: true, reason: "no attestation is recorded here or at the base" };
  }
  return { ...result, effective: result.status === "verified" };
}

/**
 * The attestations a run may rely on, given the preflight.
 *
 * Effective preflight: the recorded attestations unchanged. Otherwise only rules whose current
 * event is a REJECTION survive, preferring the one recorded at the trusted base. Approvals, and any
 * attestation whose standing depends on freshness, are disregarded. Rejections are negative
 * evidence and are never withdrawn for want of a comparison.
 */
export function effectiveAttestations(headAttestations, preflight) {
  const head =
    headAttestations && typeof headAttestations === "object" && !Array.isArray(headAttestations)
      ? headAttestations
      : {};
  if (!preflight || preflight.effective) return head;
  const base = preflight.baseAttestations && typeof preflight.baseAttestations === "object" ? preflight.baseAttestations : {};
  const kept = {};
  for (const ruleId of new Set([...Object.keys(base), ...Object.keys(head)])) {
    // Own properties only, and assigned as own data properties: a `__proto__` rule key is an ordinary entry.
    const keep = (value) => Object.defineProperty(kept, ruleId, { value, enumerable: true, writable: true, configurable: true });
    if (Object.hasOwn(base, ruleId) && holdsRejection(ruleId, base[ruleId])) {
      keep(base[ruleId]);
    } else if (Object.hasOwn(head, ruleId) && holdsRejection(ruleId, head[ruleId])) {
      keep(head[ruleId]);
    }
  }
  return kept;
}

/**
 * Whether a record holds negative evidence that must survive a failed or unavailable comparison.
 *
 * A well-formed chain whose current event is a rejection holds one. A MALFORMED chain has no current
 * event, but if it records a rejection anywhere that rejection is kept too: compliance reports the
 * chain as malformed with the rejection named, so it fails instead of reading as merely unreviewed.
 * A malformed chain that records no rejection holds none and is withdrawn, so the rule reads
 * NOT_EVALUATED, never a pass.
 */
function holdsRejection(ruleId, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const resolution = resolveRecordedReviewHistory(ruleId, record);
  if (resolution.problems.length > 0) return recordedRejections(record).length > 0;
  return resolution.current?.status === "rejected";
}

/**
 * Repository content as an evidence source.
 *
 * Everything else in `scripts/` reads the working tree. This module reads the *repository*, and the
 * distinction is the whole reason it exists.
 *
 * An attestation's `reviewedAgainst` claims to identify the content a human reviewed. Digesting it
 * with `fs.readFile()` identifies something weaker: the bytes one checkout happened to materialise.
 * Git normalises line endings on the way in and materialises them per platform on the way out, so
 * two clean checkouts of the same commit can hold different bytes while Git considers both
 * unmodified — and they did. Three materialisations of commit 5b4b917 produced three different
 * freshness answers, and the pristine one is what `ubuntu-latest` + `actions/checkout` gives a CI
 * runner. A mandatory gate whose attestation freshness depends on checkout line endings would be
 * mechanically authoritative and epistemically unreliable.
 *
 * So freshness is computed from committed blob identity, which is invariant across checkouts and
 * platforms by construction. `git hash-object` is the same value everywhere because it hashes the
 * normalised content Git actually stores.
 *
 * **There is deliberately no fallback.** If Git cannot answer, this module says so and the caller
 * reports evidence unavailability. Falling back to hashing working-tree bytes would mint a second
 * content identity and reintroduce the defect in a quieter form — the same attestation fresh under
 * one mechanism and stale under the other. Failure to know is represented as failure to know, never
 * converted into a fact about the project (Standard 44 R12).
 *
 * This is the repository-metadata seam [ADR 0008](../artifacts/adr/0008-the-source-of-truth-gap-working-tree-versus-repository.md)
 * anticipated. It is the first subprocess in `scripts/`, and it holds no module-level state — every
 * function takes its root and returns its answer, so ADR 0007's inventory is unaffected.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

/**
 * The identifier recorded in `reviewedAgainst.digestAlgorithm` for digests this module produces.
 * It names the semantics rather than a version number, so a later reader does not have to guess
 * what "v2" meant: the digest is a sha256 over a set of paths and their Git blob identities.
 */
export const DIGEST_ALGORITHM = "git-blob-set-sha256-v1";

/**
 * What an attestation recorded before `digestAlgorithm` existed. Absence of the field means this,
 * and this algorithm is not reproducible across checkouts — which is why a record carrying it is
 * classified `legacy-unverifiable` rather than compared.
 */
export const LEGACY_ALGORITHM = "working-tree-bytes-sha256-v1";

/**
 * Freshness is a separate axis from what the human decided. These are its states.
 *
 * `unrecorded` is the documented first-pass state: the schema invites omitting `digest` so the
 * validator can report the current one for recording. It is kept distinct from the others because
 * it is the only state that does not describe a failed or impossible comparison — nothing was ever
 * claimed. It preserves pre-existing behaviour and is a disclosed hole, not a designed one: an
 * attestation that never records a digest is never subject to staleness.
 */
export const FRESHNESS = {
  fresh: "fresh",
  stale: "stale",
  legacyUnverifiable: "legacy-unverifiable",
  evidenceUnavailable: "evidence-unavailable",
  unrecorded: "unrecorded",
};

function git(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  if (r.error || r.status !== 0) return { ok: false, out: "", err: r.error?.message ?? r.stderr ?? "" };
  return { ok: true, out: r.stdout, err: "" };
}

/**
 * Can this root answer questions about repository content at all?
 *
 * Two independent failures are folded into one answer because the caller treats them identically:
 * `git` missing from PATH, and a directory that is not a work tree. Both mean the source of truth
 * this module depends on is absent, and neither is a statement about the project.
 */
export function repositoryAvailable(root) {
  const probe = git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!probe.ok) {
    const reason = /ENOENT|not found/i.test(probe.err)
      ? "git is not available on PATH"
      : "not a git repository";
    return { available: false, reason };
  }
  if (probe.out.trim() !== "true") return { available: false, reason: "not a git work tree" };
  return { available: true, reason: null };
}

/**
 * Which paths does the repository track that match these pathspecs?
 *
 * The *enumerating* half of the repository seam, and the half a filesystem walk cannot stand in for.
 * A detector that asks "is this path I found on disk tracked?" can only ever be as complete as the
 * checkout it walked: a file that is committed but absent from the working tree — deleted without
 * staging the deletion, excluded by a sparse checkout, never materialised at all — proposes no
 * candidate, so the question is never asked and the rule reports a pass it did not establish. That
 * is [ADR 0008](../artifacts/adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)'s
 * source-of-truth defect in its purest form, and it survives the naive fix of confirming
 * filesystem-proposed candidates through Git.
 *
 * So repository membership is asked of the repository. The pathspecs narrow the question to keep the
 * cost proportional — they are a prefilter, never the decision. The caller applies its own rule to
 * the result, so exactly one definition of what counts exists, in the detector that owns it.
 *
 * **No fallback**, as everywhere else in this module: `{ ok: false }` means the repository could not
 * answer, and a caller must report evidence unavailability rather than substitute a filesystem
 * guess (Standard 44 R12).
 */
export function trackedMatching(root, pathspecs) {
  const r = git(root, ["ls-files", "-z", "--cached", "--", ...pathspecs]);
  if (!r.ok) return { ok: false, files: null };
  return { ok: true, files: r.out.split("\0").filter(Boolean) };
}

/**
 * Which paths does this repository deliberately ignore?
 *
 * The *excluding* half of the repository seam, and the counterpart to `trackedMatching`. A walk of
 * the working tree cannot answer it. `.gitignore` semantics are precedence-ordered, support
 * negation, and compose across nested files and `.git/info/exclude`, so a reimplementation is a
 * second definition of what a project excludes — and the two disagree exactly where it matters. The
 * repository this was written for ignores `data/` and then re-includes a single file inside it; a
 * hand-rolled matcher that dropped the negation would silence a file the project chose to keep.
 *
 * `--directory --no-empty-directory` collapses a wholly-ignored directory into one entry, so a
 * vendored dependency tree costs one string rather than one per file. Git declines to collapse a
 * directory that still contains tracked content, and that is the property that keeps first-party
 * code in scope: this can only ever remove what the repository already considers disposable.
 *
 * **Unlike the rest of this module, a negative answer is not fatal to the caller.** Everywhere else
 * a missing repository means a fact cannot be established and must be reported as unestablished.
 * Here it means the caller excludes nothing and searches more than it needed to — louder, slower,
 * never quieter. Absence of the repository costs coverage only of things that are not the project's
 * own, so there is no direction in which this failure manufactures a pass.
 */
export function ignoredEntries(root) {
  const r = git(root, [
    "ls-files", "-z",
    "--others", "--ignored", "--exclude-standard",
    "--directory", "--no-empty-directory",
  ]);
  if (!r.ok) return { ok: false, directories: null, files: null };
  const directories = [];
  const files = [];
  for (const p of r.out.split("\0").filter(Boolean)) {
    // Git marks a collapsed directory with a trailing slash; everything else is a single file.
    if (p.endsWith("/")) directories.push(p.slice(0, -1));
    else files.push(p);
  }
  return { ok: true, directories, files };
}

/**
 * Blob identity for one path at HEAD, or null when the path has none.
 *
 * Null means *no committed identity exists* — an untracked path — which is not the same as a path
 * that was tracked and has since been deleted. The caller distinguishes them, because the second is
 * an observable content change and the first is an absence of evidence.
 */
function blobAt(root, rel) {
  const r = git(root, ["rev-parse", `HEAD:${rel}`]);
  return r.ok ? r.out.trim() : null;
}

/**
 * Has this path ever existed in the repository's history?
 *
 * This is what separates "reviewed, then deleted" from "never tracked", and working-tree state
 * cannot tell them apart: an untracked file that is present on disk reports as `??` exactly like a
 * deletion reports as `D`, so dirtiness answers a different question than the one being asked.
 * History does answer it — a path with a commit touching it had a committed identity once, and its
 * absence now is an observable change rather than an absence of evidence.
 */
function hasHistory(root, rel) {
  const r = git(root, ["rev-list", "--max-count=1", "HEAD", "--", rel]);
  return r.ok && r.out.trim() !== "";
}

/**
 * Paths whose working-tree content differs from the index or HEAD, among those asked about.
 *
 * `--untracked-files=normal` is stated rather than left to the default, because the default is
 * `status.showUntrackedFiles` — a repository-local setting. The `??` case this function's callers
 * reason about disappears entirely under `status.showUntrackedFiles=no`, so without the flag the
 * answer would depend on the reader's config rather than on the repository. Under the usual config
 * this changes nothing.
 */
function dirtyAmong(root, paths) {
  const r = git(root, ["status", "--porcelain", "--untracked-files=normal", "--", ...paths]);
  if (!r.ok) return null;
  const dirty = new Set();
  for (const line of r.out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // Porcelain v1: XY <path>, with -> for renames. The path is what matters here.
    const rel = line.slice(3).split(" -> ").pop().trim().replace(/^"|"$/g, "");
    if (rel) dirty.add(rel);
  }
  return dirty;
}

/**
 * Compute the deterministic digest for a reviewed path set.
 *
 * The digest covers `path + blob-identity` for every path, sorted, so it is independent of the
 * order the paths were written in the policy. It is truncated to 32 hex characters to match the
 * recorded field width; collision resistance at 128 bits is far beyond what distinguishing two
 * revisions of a file set requires.
 *
 * Returns `{ ok: false }` when any path lacks a committed identity, rather than substituting a
 * placeholder. A digest computed over "this path is missing" would be a content identity for
 * something that is not content.
 */
export function repositoryDigest(root, paths) {
  const sorted = [...paths].sort();
  const hash = createHash("sha256");
  const missing = [];
  for (const rel of sorted) {
    const blob = blobAt(root, rel);
    if (!blob) {
      missing.push(rel);
      continue;
    }
    hash.update(rel);
    hash.update(blob);
  }
  if (missing.length > 0) return { ok: false, missing, digest: null };
  return { ok: true, missing: [], digest: hash.digest("hex").slice(0, 32) };
}

/**
 * Classify one attestation's `reviewedAgainst` into a freshness state.
 *
 * The order of the checks is the argument:
 *
 * 1. **No recorded digest** — nothing to compare. Freshness is unestablished rather than fresh; the
 *    caller reports the current digest so it can be recorded.
 * 2. **Legacy algorithm** — the record is real historical review whose digest was produced by a
 *    mechanism that cannot be reproduced. It is *not* stale: no content change has been observed.
 *    It cannot be auto-upgraded either. Recomputing from the recorded revision would prove only
 *    "this was the repository content at that revision", never "this is the surface the reviewer
 *    examined", because the old mechanism hashed bytes the commit did not uniquely determine.
 *    Classification is permitted; upgrading evidentiary strength requires a new review.
 * 3. **Repository unavailable** — the comparison could not be performed. Not stale.
 * 4. **Untracked reviewed path** — no committed identity exists to compare against. Not stale.
 * 5. **Dirty reviewed path** — the working tree differs from committed content. Stale: whatever is
 *    being validated is not what was reviewed, and HEAD still matching must not rescue it.
 * 6. **Digest differs** — stale, the one case where a content change has actually been established.
 */
export function classifyFreshness(root, against, { available }) {
  const F = FRESHNESS;
  const declared = against?.digestAlgorithm ?? LEGACY_ALGORITHM;

  if (!against?.digest) return { state: F.unrecorded, detail: "no digest recorded" };

  if (declared === LEGACY_ALGORITHM) {
    return {
      state: F.legacyUnverifiable,
      detail: `digest recorded under ${LEGACY_ALGORITHM}, which is not reproducible across checkouts`,
    };
  }
  if (declared !== DIGEST_ALGORITHM) {
    return { state: F.evidenceUnavailable, detail: `unknown digestAlgorithm ${declared}` };
  }

  if (!available) return { state: F.evidenceUnavailable, detail: "repository content is unavailable" };

  const paths = against.paths ?? [];
  const dirty = dirtyAmong(root, paths);
  if (dirty === null) return { state: F.evidenceUnavailable, detail: "git could not report working-tree status" };

  const computed = repositoryDigest(root, paths);
  if (!computed.ok) {
    // A path with no committed identity at HEAD. Distinguish tracked-then-deleted from never
    // tracked: the first is a content change the repository can establish, the second is an absence
    // of evidence. Reporting the second as staleness would assert a change nothing observed.
    const neverTracked = computed.missing.filter((rel) => !hasHistory(root, rel));
    if (neverTracked.length > 0) {
      return {
        state: F.evidenceUnavailable,
        detail: `reviewed path(s) have no committed identity: ${neverTracked.join(", ")}`,
      };
    }
    return { state: F.stale, detail: `reviewed path(s) deleted since review: ${computed.missing.join(", ")}` };
  }

  if (dirty.size > 0) {
    return { state: F.stale, detail: `reviewed path(s) modified in the working tree: ${[...dirty].join(", ")}` };
  }
  if (computed.digest !== against.digest) {
    return { state: F.stale, detail: "committed content changed since review" };
  }
  return { state: F.fresh, detail: null };
}

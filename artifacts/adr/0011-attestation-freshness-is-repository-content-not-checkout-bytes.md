# 0011 — Attestation freshness is repository content, not checkout bytes

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

`reviewedAgainst` claims to identify the content a human reviewed, and `attestationDigests()`
computed that identity with `fs.readFile()`. Those are not the same thing. Git normalises line
endings when content enters the repository and materialises them per platform when content leaves
it, so the bytes on disk are a *presentation* of a commit rather than the commit itself.

The defect was found while verifying an unrelated change. Two worktrees of commit `5b4b917`, both
reporting clean, both holding the identical committed blob for every file, disagreed about
attestation freshness. A third materialisation — `git archive`, which is byte-for-byte what
`ubuntu-latest` and `actions/checkout@v4` produce — disagreed with both. Three clean materialisations
of one commit, three different answers:

| Attestation | worktree where digests were recorded | pristine export (CI) |
| --- | --- | --- |
| `meta.standards-not-weakened` | fresh | **stale** |
| `testing.no-weakening-to-pass` | fresh | **stale** |
| `architecture.no-duplicate-implementations` | fresh | **stale** |

At the pushed commit, three attested `forbidden` rules evaluated as unestablished in CI. Nobody
noticed because the repository is `NON_COMPLIANT` for other reasons and exits 1 either way — the
verdict was right for the wrong reasons, and would have become visibly wrong the moment the three
recorded rejections were resolved.

Git narrated the mechanism unprompted while the fix was being staged:
*"LF will be replaced by CRLF the next time Git touches it."*

This matters far beyond one repository. The enforcement architecture this framework is moving toward
makes `validate` a required merge check distributed to every project. A mandatory gate whose
attestation freshness depends on checkout line endings would be mechanically authoritative and
epistemically unreliable — the precise combination the framework exists to prevent.

## Decision

**Freshness is computed from committed blob identity.** `scripts/repository.mjs` digests each
reviewed path together with its Git blob identity, sorted, under the algorithm
`git-blob-set-sha256-v1`. The invariant:

> For a clean checkout of commit C, the digest for a reviewed path set is identical in every
> checkout of C, regardless of platform line-ending materialisation.

**There is no fallback.** When Git cannot answer, the result is evidence unavailability. Hashing
working-tree bytes as a backstop would mint a second content identity, under which the same
attestation is fresh by one mechanism and stale by the other — the defect again, quieter.

**Freshness is a separate axis from what the human decided.** `approved` and `rejected` record a
decision; freshness records whether that decision can still be established against the present
repository. Only their conjunction establishes a rule.

```text
                         ┌─ content same ────────► fresh
repository evidence ─────┤
available                └─ content changed ─────► stale

repository evidence unavailable ──────────────────► evidence-unavailable
legacy algorithm ─────────────────────────────────► legacy-unverifiable
```

The four failing states are not interchangeable. *The reviewed file changed*, *the digest predates a
mechanism that cannot be reproduced*, and *the comparison could not be performed at all* are three
different statements. `judgeAttestation` previously returned `null` for every one of them, so the
console reported "nobody looked for these" about rules a human demonstrably reviewed. Results now
carry `freshness`, and the report splits its unestablished list by cause.

The result stays `skipped` / `not-evaluated`, so the [Standard 45](../../standards/45-engineering-invariants.md)
R6 cap reaches it unchanged. A test pins both fields: a result that stopped being either would
silently escape the cap while looking correct in the console.

**Repository unavailability is an infrastructure finding carrying no rule**, like evidence-surface
loss, so it cannot become a second compliance owner. It does not exit 2 — one unavailable provenance
source must not discard every other result the run established.

**Git is required for durable attestations, and not abstracted.** A `RepositoryContentProvider` seam
was considered and rejected: it would enlarge a defect fix into a speculative SCM abstraction. The
`source` field is recorded so a future provider can be added deliberately, with `git` its only
defined value.

**Untracked and deleted are distinguished by history, not by dirtiness.** A path the repository never
tracked has no identity to compare, which is evidence unavailability. A path that was reviewed and
has since been deleted is an observable change, which is staleness. Working-tree state cannot tell
them apart — an untracked file present on disk reports as `??` exactly as a deletion reports as `D` —
so `git rev-list` answers the question that is actually being asked.

**A dirty tracked file is stale even when HEAD still matches.** Otherwise editing a reviewed file
locally would keep its approval alive over content nobody reviewed.

## The migration rule

> **A digest-algorithm migration may classify existing provenance. It may not upgrade the
> evidentiary strength of that provenance without a new review.**

The eleven recorded digests are marked `digestAlgorithm: working-tree-bytes-sha256-v1` and **not**
recomputed. Recomputing each from the revision it names was available and is wrong: it would prove
*this was the repository content at that revision*, never *this is the surface the reviewer
examined*, because the old mechanism hashed bytes the commit did not uniquely determine. That is
laundering unverifiable provenance into verified provenance.

```text
old digest + old algorithm ──► legacy-unverifiable ──human re-review──► new deterministic digest
                                                                              │
                                                        reviewed content changes
                                                                              ▼
                                                                            stale
```

`scripts/attestations.mjs` reports the inventory and always reports `0 safely auto-upgradable` —
a structural fact about this migration, not a count that might one day be higher. It asserts the
post-migration invariants: a recorded digest without algorithm metadata is impossible, an unknown
algorithm is impossible, and a deterministic digest classified as legacy is impossible.

## Consequences

**The repository looks worse and is more honest.** Seven approved attestations report
`legacy-unverifiable` and establish nothing; 17 rules pass where 24 did. That gap is the state the
old mechanism was concealing. The interim carries more unestablished rules than before, deliberately.

**`validate` cannot establish attested rules outside a Git working copy** — an exported tarball, a
vendored snapshot. Detectors still run and every other result still stands; only attestation
freshness is unavailable, and it says so.

**This opens the repository-metadata seam** [ADR 0008](0008-detectors-do-not-assert-repository-state-they-have-not-measured.md#the-repository-metadata-seam)
anticipated, as the first subprocess in `scripts/`. `scripts/repository.mjs` holds no module-level
state — every function takes its root and returns its answer — so
[ADR 0007](0007-cli-scripts-are-single-run-programs-with-module-scoped-state.md)'s inventory is
unaffected. Its attestation's own caveat, that approval did not extend to this seam, is discharged
by that design rather than by assertion, and re-review is required regardless.

**The rejected-attestation asymmetry is untouched.** A rejection still returns before freshness is
consulted, so a rejected attestation still bypasses staleness entirely
([ADR 0006](0006-must-never-standards-are-forbidden-level-rules.md)). The new axis makes the
eventual fix expressible — *rejected + legacy-unverifiable* is now a representable state — but
nothing is redesigned here. "A human found this violation at revision X" remains permanently true;
"the current revision still violates this rule" requires current evidence, and the schema cannot yet
say both. That stays open.

## A review is an event, not mutable state

Writing the section above surfaced the next required invariant. A provenance migration cannot be
honest if the act of re-establishing provenance destroys the record that proved the migration was
necessary — and re-review overwrote `reviewedAgainst`, so the mechanism meant to complete this
migration would have performed the exact operation it forbids, on its first use.

> **No operation that records a new review may alter or delete any previously recorded review
> event.** Re-review appends provenance; it never rewrites it.

That is stronger and simpler than a rule about digests, and it settles the shape:

```yaml
attestations:
  architecture.no-hidden-global-state:
    reviews:
      - id: review-…-001          # immutable once written
        status: approved
        reviewedAgainst: { digestAlgorithm: working-tree-bytes-sha256-v1, digest: <legacy> }
      - id: review-…-002
        supersedes: review-…-001
        reviewedAgainst: { source: git, digestAlgorithm: git-blob-set-sha256-v1, digest: <new> }
```

**One homogeneous sequence, no `current:` / `history:` split.** Moving a record between them would
itself be a mutation, and would invite two schemas for one kind of thing. "Current" is derived: the
newest structurally valid event. There is no second source of truth.

**`supersedes` means *successor record*, never *the previous judgement was false*.** A rejected
historical review remains a rejected historical review forever. That is what will eventually let the
model say *a violation was found at revision X* and *remediation was reviewed and accepted at
revision Y* without pretending the first never happened.

**Identity is explicit, not positional.** Every event carries a stable `id`, ids must be unique, and
stored order must already agree with `reviewedAt`. Validating that agreement is what makes taking
the last element safe; selecting "latest" by array position alone would make the file's layout the
chronology, so reordering two lines would change which review establishes a rule with nothing
recording that it did. A malformed history establishes nothing rather than establishing whatever
happens to sit last.

**The migration wraps; it does not judge.** Each existing record becomes the first event in its own
history with an id added, and every substantive field — status, reviewer, timestamp, evidence,
reference, expiry, paths, revision, digest value — preserved exactly. Verified across all eleven,
zero mismatches, and idempotent. No judgement is created by a schema migration, and the wrapped
events remain `legacy-unverifiable` afterwards, which is the point.

**The single-record shape is a ramp with an end.** It is accepted for the migration window and will
be rejected once the transition completes. Teaching the evaluator to support two shapes indefinitely
is how a migration format becomes permanent architecture.

Implementing this needed `oneOf` in `scripts/jsonschema.mjs`, which had refused it by design rather
than ignoring it — the module's strictness working exactly as intended. The test that used `oneOf`
as its example of an unimplemented keyword was silently proven vacuous by that change; its example
was replaced with one the evaluator genuinely lacks, and a new assertion covers an unsupported
keyword nested inside a `oneOf` branch.

The rejected-attestation lifecycle is deliberately **not** settled here. Disposition and freshness
are now independently representable for every event, which is what that design will need, but how a
newer event supersedes an older rejection for current-state compliance remains
[ADR 0010](0010-human-review-may-always-contribute-negative-evidence.md)'s question. The schema
makes the future state representable; it does not decide it.

## Deferred
- **Prohibiting creation of legacy-format attestations.** The validator classifies them; it does not
  yet refuse to accept a newly written one.
- **Creation-time strictness.** Recording an attestation against an untracked path should be refused
  at the point of writing rather than reported at the point of validating.
- **`revision` remains informational.** It is recorded and never computed, so it cannot yet be used
  to resolve what a reviewer actually saw.

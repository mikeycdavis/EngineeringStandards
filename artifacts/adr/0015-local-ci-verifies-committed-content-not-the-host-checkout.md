# ADR 0015 — Local CI verifies committed content, not the host checkout

- **Status:** Accepted
- **Date:** 2026-08-16
- **Supersedes:** nothing. Corrects a repeatability claim `ci/Dockerfile` made in PR #27.
- **Related:** [ADR 0008](0008-detectors-do-not-assert-repository-state-they-have-not-measured.md),
  [ADR 0011](0011-attestation-freshness-is-repository-content-not-checkout-bytes.md),
  [ADR 0013](0013-the-reusable-check-distributes-the-verdict-and-nothing-else.md)

## Context

PR #27 made the complete CI pipeline runnable in a local container and bound pull request submission
to it: a pull request may only be opened for a commit that has passed that pipeline. The image was
built with `COPY . /work` over the developer's working directory, and `ci/Dockerfile` claimed the
result was "repeatable from the image alone".

That claim was too strong, and the gap is not stylistic.

Git stores normalised content and materialises it per platform. `.gitattributes` in this repository
pins `*.sh` and `ci/Dockerfile` to LF — because a CRLF shebang is not executable — and deliberately
leaves everything else to the checkout's own conventions. On a Windows checkout with
`core.autocrlf=true`, that means every `.mjs`, `.json`, and `.md` file lands with CRLF. GitHub's
`ubuntu-latest` checkout lands the same commit with LF. So `COPY .` copied *one platform's rendering
of the tree*, not the tree.

This was measured, not inferred. On commit `a373d4c`, with committed content held constant and only
the checkout's line-ending conversion varied:

| Materialisation | Pipeline result |
| --- | --- |
| CRLF (Windows default) | 273 pass, 1 fail |
| LF (what git stores; what `ubuntu-latest` checks out) | 274 pass, 0 fail |
| GitHub-hosted runner | pass |

The failing test was `test/invocation-ownership.test.mjs`'s negative control, which patches evaluator
source anchored on `\n`. The local gate produced a red the runner did not.

The direction of that particular failure is the least important part of it. The mechanism is
symmetric: a gate whose input is the host's byte representation can equally pass what the runner
fails. It was being treated as equivalent to the hosted required gate, and it was not.

## Decision

**Local CI verifies a deterministic materialisation of the exact committed `HEAD`, never the host
checkout's byte representation.**

The Docker build context is constructed by `scripts/ci-context.ps1` and `scripts/ci-context.sh`: a
temporary clone of the repository at the commit `HEAD` names, with `core.autocrlf=false` and
`core.eol=lf` written into the context repository's own config, checked out from that config, its
`origin` URL carried over, its materialised commit confirmed against the requested one, and the whole
directory removed when the run ends. `compose.ci.yml` takes the context path from `CI_CONTEXT`, which
both entry points and `scripts/submit-decide.ps1` set before building.

Three consequences follow, and each is part of the decision rather than a side effect.

**A clean working tree is required.** Once the context is committed content, an uncommitted edit is
absent from the run. Showing a developer a green for `HEAD` while they are looking at unsaved work is
a false success in the sense `errors.no-false-success` names, so the run refuses and names what is
uncommitted. Submission already required this; the requirement moves to where it first matters.

What counts as clean is stated rather than inherited. `git status --porcelain` honours
`status.showUntrackedFiles`, a repository-local setting: under `no`, a new and uncommitted file
reports nothing, the context omits it because it is not committed, and the run passes over a tree
missing the file being worked on. A gate whose definition of "clean" is configurable exempts exactly
what the configuration hides, so every cleanliness question in the repository states
`--untracked-files=normal`. Found in review of this change rather than designed in.

**The context is a clone, not an export.** `git archive HEAD` would have been simpler and would have
produced committed file content. It would also have left the evaluator answering repository questions
from something that is not a repository. `scripts/repository.mjs` asks git — with no fallback, by
design (ADR 0008, ADR 0011) — which paths are tracked, which are ignored, what blob identity a
reviewed path has at `HEAD`, and whether a reviewed path is dirty. `ci/Dockerfile` already recorded
that git in the image is semantic rather than incidental. An export plus a synthesised repository
would have traded a line-ending defect for a source-of-truth defect, which is a worse trade because
the second one is quiet.

**Isolation is unchanged.** The context is built on the host, copied into the image, and deleted.
There is still no bind mount, no Docker socket, and no host path reachable from inside the run. The
context builders touch git and nothing else — asserted by test, because the tempting shape of this
fix is to punch a hole in the container and compensate inside it.

## Alternatives considered

**Add `text eol=lf` to every path in `.gitattributes`.** Rejected. It makes repository policy bend
around the verifier: every future file has to be classified for the benefit of a CI script, and a
missed classification is a silent hole. Worse, it fixes one transform. A checkout applies attributes,
clean/smudge filters, `core.symlinks`, and platform conventions; each is another way for `COPY .` to
ship something the commit does not determine. Constraining the input covers all of them with one
decision, and leaves `.gitattributes` saying what it means — that two kinds of file must be LF because
Linux executes them.

**Normalise line endings inside the image after copying.** Rejected outright. It would mutate content
after the point at which the run claims to be verifying a specific commit, so the image would no
longer hold what its record names.

**Keep `COPY .` and document the caveat.** Rejected. The gate is a precondition for opening a pull
request; a documented caveat on a gate is a caveat nobody reads at the moment it matters.

## Consequences

- `ci/Dockerfile`'s repeatability claim is now true as stated, because what enters the image is
  determined by the commit.
- Running local CI on uncommitted work is no longer possible. This is a real workflow cost, accepted
  deliberately: the alternative is a verdict whose subject is ambiguous.
- The context builders own a recursive delete, so they validate the name that chooses its target.
  `--project` is an advertised option on both entry points and named the temporary directory being
  removed; a value carrying path components aimed that delete outside the temporary root. Compose
  would have rejected such a name, but only once the context stage had already run. Both twins now
  refuse anything outside a plain Compose project name — every name the entry points derive already
  satisfies it — and refuse it before reading the repository, so the check does not depend on the
  tree being clean. The guard is what makes the constructed path safe rather than merely
  conventional: a matching string contains no separator and no dot.
- The linked-worktree refusal in both entry points is now **conservative rather than necessary** —
  `git clone` resolves a linked worktree into a self-contained repository, which was measured while
  making this change. The guard is left in place; lifting it is a separate decision with its own
  review, not a side effect of this one.
- The property is falsifiable and is checked by a harness rather than asserted by structure.
  `scripts/verify-materialisation.ps1` materialises one commit into an LF and a CRLF checkout,
  confirms their bytes genuinely differ, runs the complete pipeline from each, and requires the
  verified SHA, every stage outcome, the compliance verdict, and the repository's own freshness and
  tracked/ignored answers to be identical. Its `-Mutate` mode restores the host-context behaviour and
  requires the comparison to fail; agreement under the mutation is reported as the check being
  incapable, not as a pass.
- One check asserts the invariant from *inside* the run rather than from the shape of the scripts
  that set it up: every regular file on disk is compared, by raw byte identity, against its committed
  blob at `HEAD`. It runs only when the run makes a verification claim — inside the container, or on
  a GitHub runner — and skips with a stated reason otherwise, because on a Windows host the working
  tree legitimately is not the committed bytes and failing there would report a checkout convention
  as a defect. This is also what keeps the harness above from being vacuous: two checkouts agree
  trivially when nothing in the suite can tell them apart, and this can. Under the restored defect a
  CRLF checkout fails it and an LF checkout does not.
- `test/local-ci.test.mjs` covers the structural half — that the context is parameterised, cloned
  rather than exported, pinned rather than inherited, confirmed against the requested commit, removed
  by exact path, and that no Docker capability was added to compensate. Those are text assertions and
  carry the limitation the file already records for every other environment check: they confirm a
  line is present or absent, not that Docker behaves as intended. The harness above is what
  establishes the behaviour.

## What this does not establish

That local CI and the hosted required gate are equivalent in general. This removes one measured
source of divergence — the input. Everything already listed under *What cannot be reproduced locally*
in `docs/local-ci.md` remains unreproduced, and the two gates still run on different hardware, at
different times, under different kernels.

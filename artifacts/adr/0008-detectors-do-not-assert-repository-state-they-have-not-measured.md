# 0008 — Detectors do not assert repository state they have not measured

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

`scripts/standards.mjs` walks the filesystem. It opens no subprocess and reads no version-control
state; the suite's own preamble calls the zero-dependency rule out, and
[ADR 0007](0007-cli-scripts-are-single-run-programs-with-module-scoped-state.md) fixes it as a
single-run command rather than a library. Everything it knows, it learned from a directory walk.

Two rules make claims that a directory walk cannot support.

**`scm.no-committed-env-files`** reports *"N environment file(s) are tracked. Rotate anything they
contained."* Run against `F:\Repos\WhatsNext` it named `.env` and `.env.local`. Both are listed in
that repository's `.gitignore`, and `git ls-files` returns neither. Nothing was committed, nothing
leaked, and the remediation instructed the reader to rotate live credentials on the strength of a
fact the tool never checked. The detector's own comment describes the design honestly — *"VIEW:
filename only"* — but the finding it emits does not.

**`security.no-secrets-in-artifacts`** reports *"N credential-shaped value(s) in tracked files.
Rotate first."* On the same repository all eight were deliberately seeded fakes inside the redaction
tests, which exist to assert that a seeded secret is **absent** from anything sent to a provider.
That is the same defect one level along: the rule is asked *are secrets committed?* and answers *do
files on disk contain credential-shaped strings?*

**And the same gap produces false passes, which are worse.** The same adopter had `artifacts/` in its
`.gitignore` — an entry left over from the .NET SDK's `ArtifactsPath` output convention, which that
project does not enable. Its decomposed plan, its original prompt and its project manifest all lived
under that directory. `planning.breakdown-directory`, `planning.one-file-per-section` and
`architecture.project-manifest` all **passed**, because all three walk the filesystem and all three
files were on disk. None was in the repository. A fresh clone would have had none of them, and
[Standard 39](../../standards/39-codebase-documentation.md) R1's requirement that documentation be
*repository-backed* was reported as satisfied by content that was not in the repository at all.

`documentation.architecture` has the same hole, and so does any structural rule that establishes a
requirement by finding a path.

**Every claim above was re-verified against `develop` during reconciliation, and one was corrected.**
The four false passes were reproduced on a real repository with `artifacts/` and `docs/` in
`.gitignore` and `git ls-files` confirming neither was tracked. `documentation.architecture` was
listed here as *latent* — something that *would* happen — and it is not latent: a gitignored
`docs/architecture.md` satisfies its half of `detectMissingDocs` today, demonstrated by deleting the
file and watching the finding appear. The first attempt to reproduce it failed and appeared to
contradict this record, because the fixture's README was under 400 characters and that half of the
same check fired first, masking the result. A masked reproduction is not a refutation, and it is
worth recording that the check nearly went the wrong way.

**What this decision is not.** [Standard 44](../../standards/44-existing-project-reconstruction.md)
R12 and [Standard 45](../../standards/45-engineering-invariants.md) R2 already govern what a
*negative* result is worth when the search was incomplete, and the evidence-surface work extended
that to unreadable and truncated reads. This ADR is a different axis and does not restate them: the
search here completed and answered accurately, against **the wrong source of truth**. Its sharpest
content is the *passing* direction, which those rules do not reach — a rule that establishes a
requirement by finding a path reports success over a file no clone will contain.

A false failure is annoying and visible: someone investigates and finds the tool was wrong. A false
pass is silent, and the adopter learns their artefacts are missing when somebody clones. Of the two
directions this defect runs in, the passing one is the more expensive.

Those are different questions with different sources of truth, and the gap between them is not a
tuning problem. A false positive here is worse than a missed detection, because its remediation is
expensive and irreversible in the wrong direction: rotating a key that was never exposed costs real
work, and an adopter who does it once and discovers it was unnecessary discounts the next security
finding this tool produces.

## Decision

**A finding MUST NOT assert version-control state the tool has not measured.** A detector that has
observed the working tree may say what is present in the working tree. Saying *committed*, *tracked*,
or *pushed* requires having asked the repository.

**Where a rule's correctness depends on repository state, that state is obtained behind a narrow
abstraction with a named contract — never by reimplementing version control.** The abstraction owes
the detectors a small number of questions (*is this path tracked?* foremost) and owes nothing else.
Its implementation may shell out to `git`, and the decision to allow a subprocess is deliberately
scoped to that seam rather than opened generally. A repository the abstraction cannot interrogate —
no VCS, a tarball, a sparse or partial checkout it cannot answer for — yields *unknown*, and a rule
whose correctness needs the answer reports `not-evaluated` rather than guessing. `unknown` is a
first-class result, not an error and not a pass.

### Rejected — reimplement the ignore and index semantics in-process

This preserves the zero-subprocess property and nothing else. Answering *is this path tracked?*
correctly means nested `.gitignore` files, negation ordering, `core.excludesFile`, `info/exclude`,
sparse checkout, submodules, worktrees, symlinks, `intent-to-add`, `skip-worktree`, and
`assume-unchanged`. Each is individually tractable and collectively a maintenance project, and every
one of them handled *almost* right reintroduces exactly the class of defect this ADR exists to close
— with the added cost that the wrong answers would now look authoritative.

### Rejected — soften the message and keep the check as it is

*"2 environment files are present in the working tree"* is true, which is the problem: a gitignored
`.env` on a developer's machine is not a violation of anything, so an accurate message makes the
finding itself indefensible. The wording was never the defect. Changing it would trade a false claim
for a true and useless one, and leave the rule still failing repositories that did nothing wrong.

### Rejected — declare the paths in `project-policy.yml`

Detectors also serve `audit`, which takes no policy at all
([ADR 0004](0004-audit-and-validate-are-separate-commands.md)). Sourcing evidence discovery from
configuration would give the two commands different answers about what a repository contains, and
would ask every adopter to write an exception for a finding that was wrong rather than inconvenient.
[Standard 20](../../standards/20-exceptions.md) exceptions are for rules that apply and are knowingly
unsatisfied; using one to silence a false positive misrepresents the project's compliance and buries
the tool's own bug in the adopter's policy file.

## Consequences

**Not yet implemented, and the gap is disclosed rather than left to be discovered.** Both rules
still fire on working-tree evidence today. The limitation is recorded in
[INSTRUCTIONS.md](../../INSTRUCTIONS.md)'s current-limitations table, which
[Standard 22](../../standards/22-adoption-and-migration.md) R6 requires and a test enforces. Until
the seam exists, an adopter whose ignored `.env` is flagged is looking at a tool defect, and the
correct response is to say so — not to rotate a key and not to write an exception.

**The abstraction is the trigger for revisiting [ADR 0007](0007-cli-scripts-are-single-run-programs-with-module-scoped-state.md).**
A module that spawns a subprocess and caches its answer is state with a lifetime, and 0007's
module-scoped-state reasoning has to be re-read against it before the seam lands rather than after.

**Scope, so this does not become a general licence.** Repository metadata means the small set of
questions detectors ask about tracked-ness. It is not a route to commit history, blame, remotes, or
branch topology; a rule wanting any of those is a new decision, not an extension of this one.

**The seam serves more rules than the two that motivated it.** Evidence now runs in both directions:

| Direction | Rule | What happened |
| --- | --- | --- |
| False failure | `scm.no-committed-env-files` | A gitignored `.env` reported as a committed environment file, with rotation advised |
| False failure | `security.no-secrets-in-artifacts` | Redaction-test fixtures reported as committed credentials |
| False pass | `planning.breakdown-directory` | A gitignored plan directory reported as a decomposed plan on disk |
| False pass | `planning.one-file-per-section` | The same files, same reason |
| False pass | `architecture.project-manifest` | A gitignored `PROJECT.md` reported as a project manifest |
| False pass | `documentation.architecture` | A gitignored `docs/architecture.md` satisfies its half of the check. Recorded here as latent; reproduced during reconciliation, so it is live |

Six rules, one root cause. When the seam is designed, `isTracked(path)` should be available to every
structural detector rather than bolted onto the two that surfaced it first — and the passing-direction
cases are the argument for prioritising it, because nothing surfaces them.

**[Standard 31](../../standards/31-whatsnext-compatibility.md) consumers are unaffected in shape and
affected in substance.** The envelope does not change. But a consumer that turns findings into work
items would generate *"rotate the credentials in `.env`"* against a repository that never committed
one — the R5 failure mode named in that standard, where an unhelpful finding becomes a confidently
wrong task. Consumers should treat these two rule ids as unreliable until this lands.

# Standard 46 — Source Control Safety

History is evidence. Once a secret is in it, it is in it; once a rewrite has landed on a shared
branch, everyone else's copy is wrong. These are the prohibitions whose damage cannot be undone by a
later commit.

Source: the "Source control" section of
[`artifacts/prompts/second-fold-in-prompt.md`](../artifacts/prompts/second-fold-in-prompt.md).

## Scope

Applies to every repository under the framework. Part of the must-never layer defined by
[Standard 45](45-engineering-invariants.md), which is where the semantics of `forbidden`, the
exception discipline, and the verification classes are defined once for all of it.

## Requirements

### R1 — Never commit secrets

The source's first four prohibitions, reproduced verbatim from the source:

* commit secrets
* commit credentials
* commit private keys
* commit production tokens

**This is already [Standard 16](16-security.md) R2** — *secrets MUST NOT be placed in artifacts* —
and no new rule id is minted for it ([Standard 45](45-engineering-invariants.md) R4). What changes at
2.0.0 is that `security.no-secrets-in-artifacts` is now **evaluated** rather than review-required: a
detector scans code and configuration for high-confidence credential shapes.

Its limits are stated rather than implied. It matches shapes that are unambiguous — private-key
headers and provider-issued token prefixes — and nothing else. There is no entropy scoring, because a
check that flags every base64 blob is the brittle check
[Standard 45](45-engineering-invariants.md) R5 forbids. A clean result means *no known credential
shape was found in the files scanned*, not *this repository has no secrets in it*.

**Single owner: the detector does not read `.env` files at all.** R2 owns them by filename. One
defect produces one finding, and a committed `.env` is already an error before anything opens it.

### R2 — Never commit environment files

`.env` and its variants carry configuration that is *expected* to hold secrets, so the file's
presence is the finding — no content scan is required, and none is performed.

Rule `scm.no-committed-env-files`, `forbidden`, `structural`, `assurance: full`, exemptible.

**Permitted, and detected as permitted:** `.env.example`, `.env.template`, `.env.sample`, and
`.env.vault`. These exist to document which variables a project needs, carry placeholder values, and
are the recommended alternative to the prohibited file.

**Exception conditions**, per [Standard 45](45-engineering-invariants.md) R3:

| Field | Requirement |
| --- | --- |
| Condition | The file is encrypted at rest by design (SOPS, git-crypt, `.env.vault`) and the decryption key is not in the repository |
| Justification | Why committed-and-encrypted beats the alternative for this project |
| Evidence | The encryption tooling's configuration, committed and referenced by path |
| Approval | An [ADR](11-architecture-decision-records.md) recording the decision |
| Revisit | When the secret store changes, or when the encryption tooling is removed |

**Violation:**

```text
.env                          committed, contains DATABASE_URL with a live password
```

**Permitted:**

```text
.env.example                  committed, contains DATABASE_URL=postgres://user:pass@localhost/db
```

### R3 — Do not commit generated artifacts unnecessarily

Reproduced verbatim from the source:

* commit generated junk unnecessarily

Rule `scm.no-generated-artifacts`, `recommended` — not `forbidden`, and deliberately. The qualifier
*unnecessarily* is doing the work, and the necessary cases are common enough that a prohibition would
be excepted more often than it fired, which teaches a team to except rules by reflex.

**Not covered by this rule**, because committing them is a considered decision rather than an
accident: dependency lockfiles, golden/approval test files, generated code a build cannot reproduce
from source alone, and vendored dependencies recorded in an [ADR](11-architecture-decision-records.md).

What the rule addresses is build output and local noise committed by accident — `dist/`, `bin/`,
`obj/`, `node_modules/`, `.DS_Store`, coverage reports, editor state.

### R4 — Never rewrite shared history without justification

Reproduced verbatim from the source:

* rewrite shared history without explicit justification
* delete meaningful history merely to simplify implementation

Rule `scm.no-shared-history-rewrite`, `forbidden`, `manual-review`.

A force-push to a shared branch invalidates every other clone of it, and a deleted commit takes its
evidence with it — which is why [Standard 22](22-adoption-and-migration.md) R3 requires migration to
be evidence-preserving, and why *simplifying the implementation* is named in the source as
insufficient reason. Rewriting your own unshared branch before it is shared is not this rule's
subject.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | A secret or unlawful content must be purged from history and rotation alone is insufficient |
| Justification | What is being removed and why rotation does not suffice |
| Evidence | The rotation record, and the notice sent to everyone holding a clone |
| Approval | The repository owner, named |
| Revisit | Expires with the operation; an exception that outlives the purge is a standing licence |

**Not mechanically checked.** Detecting a rewrite requires comparing history against a previous
observation of the same history, and a single repository snapshot does not contain one. This is a
recorded blind spot, not an oversight — see [Standard 45](45-engineering-invariants.md) R2 on what a
clean result is worth when nothing looked.

## Additions this standard makes beyond the source

- R2 in full. The source prohibits committing secrets and credentials; committed environment files
  are a distinct, cheaply-detectable failure with a distinct remediation, and separating them is what
  makes one defect produce one finding.
- The single-owner rule between R1's detector and R2. The source has no reason to anticipate an
  overlap between two checks this framework happens to implement.
- R3's classification as `recommended` rather than `forbidden`, and the list of necessary cases.
- The exception tables. The source requires that exceptions define their conditions; the conditions
  themselves are this standard's.

## Relationship to other standards

[Standard 16](16-security.md) R2 is the rule R1 routes to rather than duplicating.
[Standard 45](45-engineering-invariants.md) defines what `forbidden` means and supplies the exception
discipline. [Standard 20](20-exceptions.md) is the machinery those exceptions use.
[Standard 22](22-adoption-and-migration.md) R3 is R4's principle stated for migrations.
[Standard 11](11-architecture-decision-records.md) is where R2's and R3's justifications live.

## Implementation

**Partially implemented.**

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `security.no-secrets-in-artifacts` | Evaluated, `code-analysis`/`partial`. High-confidence shapes only; `.env` files excluded by design. **Working tree, not repository** |
| R2 | `scm.no-committed-env-files` | Evaluated, `structural`/`partial`. Filename only — no content is read. **Repository index, not working tree** |
| R3 | `scm.no-generated-artifacts` | `manual-review`. Distinguishing accidental build output from a deliberate lockfile is a judgement about intent |
| R4 | `scm.no-shared-history-rewrite` | `manual-review`. Requires history to compare against, which one snapshot does not have |

**R2 now asks the repository; R1 still does not.** [ADR 0008](../artifacts/adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)
recorded both detectors walking the filesystem and reporting *tracked*, so a gitignored `.env` was
reported as a committed environment file and advised rotation. R2 is fixed: `git ls-files` supplies
the answer, and an untracked file present on disk is no longer a finding.

**What R2 can now establish, precisely.** The repository index is asked *which environment files it
tracks* — it is not asked to confirm a list the directory walk proposed. That distinction is the fix
rather than a detail of it: a file that is committed but absent from the working tree, deleted
without staging the deletion or excluded by a sparse checkout, proposes no candidate to confirm, so a
confirm-only design reports a pass it never established. That is the same source-of-truth defect one
level down, and it is the shape a reviewer caught in the first version of this change.

**What R2 still cannot establish.** Whether a tracked environment file ever held a live credential,
and whether one was rotated. The finding is about tracking, and the remediation it advises is a
judgement for a human. It also says nothing about history: a file committed and later removed is not
tracked now, and this detector will not see it — `scm.no-shared-history-rewrite`'s row above records
the same gap for the same reason, that one snapshot is not a history.

**When the index cannot be read**, the rule reports **not evaluated** rather than passing. Absence
from an unreadable index establishes nothing, and a `forbidden` rule is satisfied by the absence of a
violation, so a pass asserted without the search having run is precisely the false green
[Standard 45](45-engineering-invariants.md) R6 caps the verdict for. In a project that is not a Git
repository at all, this rule is therefore never evaluated.

**R1 remains a working-tree check**, so its findings remain evidence to verify with `git ls-files`
rather than a conclusion, and its assurance stays `partial` for the reason R2's did: a check that
cannot tell *present on disk* from *committed* has not established the requirement, and claiming
otherwise is the assurance overstatement [Standard 31](31-whatsnext-compatibility.md) R6 exists to
prevent — here, in the tool that supplies the number.

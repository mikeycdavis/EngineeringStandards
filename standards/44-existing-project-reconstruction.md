# Standard 44 — Existing Project Reconstruction

The standards support both greenfield projects that have an original prompt or project plan, and
pre-existing projects that may have little or no reliable planning history. This standard governs
the second case.

## Scope

The standards support two kinds of project:

- **greenfield projects with an original prompt or project plan** — planned forward from that prompt,
  through the ordinary planning standards. Not this standard.
- **pre-existing projects with little or no reliable planning history** — the subject of this
  standard.

This standard therefore applies when onboarding a **pre-existing project with no trustworthy original
prompt, requirements document, or project plan**. A greenfield project, or any project whose original
prompt or plan is genuine and trusted, is out of scope: plan it forward rather than reconstructing it.
Applying this standard to a project that already has a real plan is itself an error — it produces a
reconstruction that competes with the authentic record.

**Judging whether the existing history is trustworthy is the first decision**, and it is a judgement,
not a lookup. A README is not a plan. A plan describing a product materially different from the one in
the repository is not trustworthy for this purpose, and the discrepancy is itself a finding (R5). When
the existing history is partial — real for some areas, absent for others — reconstruct the areas it
does not cover and treat the rest as evidence rather than overwriting it.

Bootstrap tooling SHOULD make this determination explicitly rather than leaving it implicit, detecting
which of three states a repository is in:

| State | Route |
| --- | --- |
| Empty or new repository | Greenfield. Plan forward from the original prompt. |
| Existing repository with an adequate plan | Not this standard. Continue from the existing plan. |
| Existing repository with no adequate plan | This standard. Reconstruct. |

### R0 — As-built before to-be

**A reconstructed plan MUST describe reality first, and identify recommended changes separately.**

An existing project MUST NOT be rewritten to match its reconstructed plan merely because the plan
describes a cleaner architecture. The two are different claims and MUST NOT be blended: *as built* is
a description of what exists, and *to be* is a proposal about what should. A plan that quietly
presents the second as the first licenses large refactors nobody authorised, on the authority of a
document the project's own tooling just generated.

This applies throughout the artifacts this standard requires. The baseline (R5) describes what is.
The plan (R7) MUST separate the current implementation from recommended future work, so a reader can
always tell which they are looking at.

When a project already exists and there is no trustworthy planning history, an original plan MUST NOT
be invented from assumptions. A structured codebase reconstruction MUST be performed instead. The
goal is an evidence-based baseline describing:

- what the system currently does
- what it appears intended to do
- how it is architected
- what capabilities already exist
- what remains incomplete
- what important questions cannot be answered from the repository alone

Reconstruction MUST NOT be blocked in its entirety merely because some questions remain unanswered.
As much as possible MUST be completed from repository evidence first.

## Requirements

### R1 — Evidence before questions

For pre-existing projects, available evidence MUST be inspected before the project owner is asked any
questions. Questions MUST NOT be asked where they can reasonably be answered by:

- source code
- tests
- commit history where available
- configuration
- database migrations
- OpenAPI specifications
- schemas
- CI/CD configuration
- deployment files
- infrastructure definitions
- README files
- documentation
- ADRs
- project artifacts
- issue trackers or work items when available
- comments and TODOs
- package manifests
- environment templates

Human questions MUST be reserved for information that cannot be determined reliably from the
codebase. Examples include:

- intended target user when multiple interpretations are plausible
- abandoned versus planned functionality
- product priorities
- monetization strategy
- desired release scope
- business rules not represented in code
- intentional technical debt
- external constraints not stored in the repository
- whether an apparent incomplete feature should be finished, removed, or deferred

Reconstruction MUST NOT be interrupted for minor preferences that can be reasonably defaulted.

### R2 — No historical fabrication

Historical project intent MUST NEVER be fabricated. Where there is no evidence that a feature,
architecture decision, or product goal was originally intended, phrasing of this kind MUST NOT be
used:

```text
The original plan was...
The project was designed to...
The developer intended...
```

Language of this kind MUST be used instead. The two lists are independent — there is no fixed
substitution between them; choose the phrasing that fits the claim:

```text
The current implementation indicates...
The repository suggests...
The reconstructed plan assumes...
This appears intended to...
This cannot be determined from repository evidence...
```

The distinction between evidence and inference must remain visible.

### R3 — Evidence labeling

Every claim about the project MUST carry exactly one of the following labels:

| Label | Meaning |
| --- | --- |
| `OBSERVED` | Directly verifiable in the repository. Cite the evidence. |
| `INFERRED` | A reasonable conclusion drawn from evidence, stated as an inference — never as fact. |
| `CONFIRMED_BY_OWNER` | Answered by a human. |
| `UNKNOWN` | Cannot be determined from repository evidence. |

Inferred product intent MUST NOT be presented as fact.

**Where labels apply.** The baseline, the open-questions list, and the descriptive prose of the plan
breakdown — the overview's narrative sections and each section file's intent paragraph — make claims
about the project and MUST be labeled throughout. The reconstructed prompt
and the executable plan items are *specifications* — they describe what should be true, not what is
observed — and so are not labeled claim-by-claim; instead, any section of them that rests on
inference rather than evidence MUST be marked `INFERRED` at that point.

**Additions this standard makes beyond the source specification**, recorded so they are visible as
choices rather than mistaken for the original text: `CONFIRMED_BY_OWNER` MUST carry the date it was
confirmed — `CONFIRMED_BY_OWNER (YYYY-MM-DD)` — because an undated confirmation cannot be reassessed
when the product changes; and exactly one label per claim is required, because an unlabeled or
multiply-labeled claim reintroduces the ambiguity the taxonomy exists to remove.

### R4 — Required artifacts and canonical paths

A compliant reconstruction produces these artifacts in the project being reconstructed:

| Artifact | Path |
| --- | --- |
| Reconstructed baseline | `artifacts/project-baseline/reconstructed-baseline.md` |
| Reconstructed canonical prompt | `artifacts/project-baseline/RECONSTRUCTED-PROMPT.md` |
| Open questions list | `artifacts/project-baseline/open-questions.md` |
| Decomposed project plan | `artifacts/project-plan-breakdown/` — ordered Markdown files: `00-overview.md`, then `NN-<section>.md` |

The baseline and the plan breakdown are always required. The reconstructed canonical prompt is
required only for projects that benefit from maintaining one. The open-questions list is required
whenever material uncertainty remains after repository analysis (see R8); where nothing material is
unresolved, the file MAY be omitted and the baseline's *Open questions* section MUST say so
explicitly rather than being left blank.

### R5 — Baseline contents

The reconstructed baseline MUST include the following sections:

```text
Project identity
Observed purpose
Observed users/actors
Current capabilities
Architecture
Technology stack
Data stores
APIs
AI capabilities
Background jobs
External integrations
Security model
Audit behavior
Deployment model
Testing strategy
Current implementation status
Incomplete functionality
Known technical debt
Known risks
Documentation gaps
Observed release readiness
Documented intent vs implementation
Open questions
Assumptions
Evidence sources
```

`Documented intent vs implementation` records discrepancies found when comparing the implementation
against any README, documentation, issue history, ADRs, or plans that do exist. It is the one
section this standard adds to the source specification's list, and it exists because the source
specification requires that comparison to be performed (workflow steps 9–10) without naming a place
to record it.

Populating `Incomplete functionality`, `Known technical debt`, and `Current implementation status`
requires an explicit search for the signals of unfinished work — TODOs, FIXMEs, open work items,
failing or skipped tests, feature flags, abandoned code paths, stubs, and disabled configuration.
That search MUST be performed; the sections MUST NOT be filled from impression alone.

The inspection MUST also cover APIs, background jobs, and external integrations as first-class
targets, not only as sections to be filled in afterwards.

### R6 — Reconstructed prompt

The reconstructed prompt MUST clearly state that it is reconstructed from the existing codebase
rather than known to be the historical original prompt. It MUST be sufficiently complete that a
capable engineering agent could recreate the product's intended architecture and behavior without
relying on prior chat history. It SHOULD capture, where applicable:

```text
product purpose
users
major capabilities
architecture
stack
domain model
APIs
AI capabilities
integrations
security
auditing
workflows
jobs
testing
deployment
planning requirements
current constraints
known incomplete work
release expectations
```

### R7 — Reconstructed plan and plan items

The reconstructed plan MUST be labeled as reconstructed — `Reconstructed Project Plan`,
`As-Built Baseline Plan`, or `Recovered Project Plan` — and MUST NOT be presented as a claim about
what the original developer historically intended. It SHOULD describe:

- the current product as implemented
- the likely intended product direction where reasonably inferable
- gaps between current and desired behavior
- incomplete features
- missing engineering foundations
- release blockers
- recommended next work

Every top-level section MUST follow the normal planning standard and be placed in
`artifacts/project-plan-breakdown/` as ordered Markdown files.

Plan items here carry **six** fields. This is a **context-specific strengthening of
[Standard 7](07-acceptance-criteria.md)**, which establishes the general minimum of five — not a
competing definition of a plan item. `Purpose` is added because reconstruction is precisely the case
where an item's reason for existing cannot be recovered from history and so must be stated. A project
satisfying this standard satisfies Standard 7 as well.

Every executable plan item MUST define, where applicable:

```text
Status
Purpose
Deliverables
Acceptance Criteria
Verification
Dependencies
```

`/plan-structure` and `/plan-handoff` MUST be applied to the reconstructed plan.

**Status vocabulary.** Plan item `Status` values MUST use the canonical vocabulary defined by
[Standard 8](08-status-tracking.md): `NOT_STARTED`, `READY`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`,
`COMPLETE`, `DEFERRED`, `CANCELLED`.

**Delegated liveness.** A project MAY delegate an item's liveness to a work tracker rather than
maintaining it in the plan — for repositories using the `backlog` skill, by adding a separate
**`Tracked by`** field naming the backlog id:

```markdown
- **Status:** IN_PROGRESS
- **Tracked by:** ST-014
```

`Tracked by` MUST be a separate field. **A reference to another system is not a status**
([Standard 8](08-status-tracking.md) R2) — an item tracked elsewhere still has a lifecycle state of
its own, and writing the reference into `Status` destroys its ability to express that. An earlier
version of this standard used `tracked as <backlog-id>` as a status value; that form is abolished.

Where liveness is delegated, the plan breakdown remains the record of what and why, and the tracker
is authoritative for state. Every `Tracked by` reference MUST resolve to an item that exists; one
that resolves to nothing is a defect, because it presents untracked work as tracked.

### R8 — Question list

Where material uncertainty remains after repository analysis, a structured question list MUST be
created. Each question MUST include:

```text
question
why it matters
what evidence was inspected
current best inference
impact if unanswered
```

Questions MUST be prioritized by their effect on:

- architecture
- product behavior
- security
- compliance
- release scope
- data integrity
- user experience
- significant implementation effort

Reconstruction MUST NOT block on unanswered questions. Record the current best inference — labeled
`INFERRED` — and proceed.

### R9 — Question resolution

When answers are received:

1. update the reconstructed baseline
2. mark the relevant information as `CONFIRMED_BY_OWNER`
3. update the reconstructed prompt
4. update affected plan sections
5. create or update ADRs where necessary
6. record material scope changes

**Provenance — an addition beyond the source.** A `CONFIRMED_BY_OWNER` label with only a date says
that *somebody* answered *something*. A year later the answer cannot be reassessed, because the
reader cannot tell who is being relied on or which question they were actually asked. Every
`CONFIRMED_BY_OWNER` claim MUST therefore record, alongside the label:

| Field | Meaning |
| --- | --- |
| `confirmedBy` | Who answered. A person or role, not "the owner". |
| `confirmedAt` | The date the answer was given, `YYYY-MM-DD`. This is the date R3 already requires. |
| `question` | What they were actually asked — the question as put, not a summary of the answer. |
| `reference` | Where the exchange is recorded, if anywhere: an issue, a decision record, a message link. MAY be omitted when no durable record exists, and its absence is itself information. |

These names are deliberately the same shape as attestation provenance
([ADR 0005](../artifacts/adr/0005-attestations-are-recorded-human-evidence.md)), which records
`reviewedBy` / `reviewedAt` / `evidence` / `reference`:

| Reconstruction confirmation | Attestation | Both record |
| --- | --- | --- |
| `confirmedBy` | `reviewedBy` | the human being relied on |
| `confirmedAt` | `reviewedAt` | when the judgement was made |
| `question` | `evidence` | what the judgement was about |
| `reference` | `reference` | where it is recorded |

They are compatible on purpose and **are not the same mechanism**, also on purpose. A reconstruction
confirmation is evidence about the *project* — it establishes what the software is meant to do. An
attestation is evidence about *rule compliance* — it establishes that a human evaluated a rule the
catalog says only a human can evaluate. Confirming a product fact never satisfies a rule, and
attesting to a rule never establishes a product fact. One provenance vocabulary across both keeps a
third dialect from appearing; one mechanism across both would let either be mistaken for the other.

### R10 — Definition of Done

A pre-existing project is sufficiently reconstructed when:

1. The repository has been inspected before material questions are asked.
2. `/codebase-docs` has been run when available.
3. Current capabilities and architecture are documented.
4. Important workflows, jobs, integrations, and APIs are documented.
5. Significant implementation gaps are recorded.
6. Known versus inferred information is clearly distinguished.
7. Material unresolved questions have been identified.
8. Necessary owner answers have been incorporated where available.
9. A reconstructed baseline exists.
10. A reconstructed canonical prompt exists when useful.
11. A decomposed project plan exists under `artifacts/project-plan-breakdown/`.
12. Every actionable plan item has observable completion criteria.
13. `/plan-structure` and `/plan-handoff` have been applied.
14. A fresh engineer or AI agent can understand the project and continue work without access to
    historical chat.

### R11 — Tool-generated scaffolding is never evidence

**An addition beyond the source specification**, recorded here so it is visible as a choice rather
than mistaken for the original text. The source could not have anticipated it: the failure it
prevents was created by tooling this framework wrote after the source was written.

Artifacts created by tooling are evidence about the tooling. They MUST NOT be treated as evidence
about the project.

Concretely: an `artifacts/project-plan-breakdown/` directory that `standards init` created, a
`PROJECT.md` / `AGENTS.md` / `CLAUDE.md` / `.github/copilot-instructions.md` still carrying its
template text, an empty or placeholder plan file — none of these MUST be labeled `OBSERVED` as
evidence of pre-existing project intent, and none of them MUST cause reconstruction to conclude that
a plan already exists and stop.

**Content, not presence, is what counts.** A plan directory establishes that a plan exists only when
it contains substantive plan content: at least one file stating real purpose, deliverables, and
completion criteria for real work in this project. A directory holding nothing, or holding an
untouched template, is a directory the tool made.

This is the consuming-side mirror of [Standard 33](33-bootstrap-experience.md) R7, and it is written
here because the bug is real rather than hypothetical. `standards init` creates the plan directory
**empty** in reconstruction mode, precisely so that no fabricated history is scaffolded over existing
code. A second run then read its own empty directory as proof a plan existed and flipped the mode to
`existing-with-plan`, erasing the `reconstructionRequired` signal. The fix — a directory counts only
when it has content — is recorded at `scripts/init.mjs` and in the 1.1.0 changelog. A reconstruction
that tests for the *presence* of the artifacts init creates reproduces exactly that defect, one level
up, where nothing is left to catch it.

### R12 — The validated-search invariant

**An addition beyond the source specification.** The source requires evidence before questions (R1)
and a label on every claim (R3); it does not say what makes a *negative* result reportable at all.
That gap is where the framework's own worst failure mode lives, so the invariant is named here and
given an address other standards can cite.

> **A negative discovery result is evidence about the search mechanism before it is evidence about
> the project.**

Not finding something establishes, in the first instance, only that the search did not find it.
Whether it also establishes something about the project depends entirely on whether the search was
capable of finding it — and that is a property of the search, which must therefore be recorded
alongside the result.

This invariant pairs with R1. R1 forbids asking what the evidence can answer; R12 forbids concluding
what the search did not establish. Together: **unanswered is not unsearched, and unsearched is not
absent.**

Operationally:

1. `UNKNOWN` MUST NOT be assigned until the search that failed is itself recorded — what was looked
   for, where, and how. R8's *what evidence was inspected* is where that record lives for a question;
   for a claim, it belongs beside the label.
2. A search that could not have succeeded produces no finding about the project at all. Grepping for
   a term the project spells differently, scanning a directory the code does not live in, or reading
   a file format the tool cannot parse yields `UNKNOWN` with the mechanism named — never "the project
   does not do this".
3. Label transitions are **one-way ratchets with provenance**. `INFERRED` becomes `OBSERVED` only by
   citing the evidence newly found, and becomes `CONFIRMED_BY_OWNER` only through R9 with its
   provenance fields. A label never strengthens silently, and never strengthens because the claim was
   repeated often enough to feel established.

The same invariant appears elsewhere in the standards under other names, and they are cross-references
rather than duplicates: [Standard 24](24-validator-rules.md) — a check may claim only what its own
kind of check establishes, so a clean structural scan is not a statement about behaviour;
[Standard 29](29-testing.md) — a test that cannot fail proves nothing about the code under it. All
three are one idea: *the instrument constrains the conclusion.*

**Scope note.** This invariant is broader than reconstruction. It governs TODO scans, "no tests cover
this" claims, missing-API findings, and every clean detector result the tooling produces. It lives
here because reconstruction is where it was first needed and where it is most load-bearing; other
standards cite it at this address. If it is ever promoted into a general validation standard, this
section becomes the pointer and the definition moves — the wording does not fork.

## Tooling

`standards audit .` is implemented (`scripts/standards.mjs`) and consumes the artifacts this standard
requires: it reports missing baseline artifacts, unlabeled claims, and plan/backlog pointers that
resolve to nothing. Its contract is recorded in
[design/standards-audit-cli.md](../design/standards-audit-cli.md); the findings it produces are bound
to the canonical rule IDs in [`rules/reconstruction.json`](../rules/reconstruction.json).

## Implementation

This standard is executed by the global `project-reconstruction` skill at
`C:\Users\Mike\.claude\skills\project-reconstruction\`. The skill is the procedure — phases,
templates, and commands. This document is the contract the skill must satisfy.

**Mechanically checked.** Two rules carry canonical IDs and are evaluated by `standards audit`:
`reconstruction.baseline-artifacts` (R4's artifacts exist) and `reconstruction.open-questions` (R8's
questions carry the required parts, and R12's record of what search failed). Plan-item pointers that
resolve to nothing are detected as plan/backlog discrepancies (R7). Three checks are worth naming
because their limits matter:

| Check | What it establishes | What it does not |
| --- | --- | --- |
| A plan directory holds an overview with content outside its headings (R11) | The directory is not the empty one `standards init` leaves behind, and the overview is not a bare title | Whether prose that is there is a real plan or an untouched template. That is a judgement; no scan makes it |
| `CONFIRMED_BY_OWNER` carries a `(YYYY-MM-DD)` date (R3, R9) | Every confirmation in `open-questions.md` can be reassessed against a date | The rest of R9's provenance, which is prose; and any labeled claim outside that one file. The scan reads the questions document, so that is all it may claim ([Standard 24](24-validator-rules.md)) |
| Open questions are surfaced rather than quietly closed (R8) | Questions marked open are counted and reported | Whether a question marked answered really was |

**Not mechanically checked, and honestly so.** R11 and R12 are discipline, not structure, and no rule
ID is claimed for them:

- R11's substantive-content test is a judgement about whether a plan file says anything real. The
  tooling makes the same judgement in its own narrow way — `standards init` treats a directory as
  evidence only when it holds a `.md` — but a template-shaped file that says nothing is
  indistinguishable from a real one by structure alone. The reconstruction agent judges it and MUST
  state what it judged and why.
- R12's ratchet — that `INFERRED` never silently becomes `OBSERVED` — is a constraint on *how a claim
  changed over time*, and cannot be evaluated from a single snapshot of a repository. Nothing in a
  finished document distinguishes a label that was earned from one that was assumed. It is enforced
  normatively here and procedurally by the skill; claiming a test covers it would be exactly the false
  green this framework exists to prevent.

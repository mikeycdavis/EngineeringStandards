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
`artifacts/project-plan-breakdown/` as ordered Markdown files. Every executable plan item MUST
define, where applicable:

```text
Status
Purpose
Deliverables
Acceptance Criteria
Verification
Dependencies
```

`/plan-structure` and `/plan-handoff` MUST be applied to the reconstructed plan.

**Delegated liveness.** A project MAY delegate an item's status to a work tracker rather than
maintaining it in the plan — for repositories using the `backlog` skill, by setting the item's
`Status` to `tracked as <backlog-id>`. Where it does, the plan breakdown remains the record of what
and why, the tracker becomes the single record of liveness, and status MUST NOT be maintained in
both. Every delegated reference MUST resolve to an item that exists; a reference that resolves to
nothing is a defect, because it presents untracked work as tracked. No current tooling verifies
these references — see `design/standards-audit-cli.md`.

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

## Tooling (forward-looking)

A future audit mode — `standards audit .` — is designed but deliberately **not implemented in v1**.
The artifacts required by this standard are shaped so that such an audit can consume them without
rework: see [design/standards-audit-cli.md](../design/standards-audit-cli.md).

## Implementation

This standard is executed by the global `project-reconstruction` skill at
`C:\Users\Mike\.claude\skills\project-reconstruction\`. The skill is the procedure — phases,
templates, and commands. This document is the contract the skill must satisfy.

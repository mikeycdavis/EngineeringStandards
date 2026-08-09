# Standard 35 — Planning Requirements

An orchestration standard. It creates almost no requirement of its own — it says *when* the planning
contract applies, and assembles it from the standards that already define each part.

Source: item 35 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **when planning happens and what it must cover**. It defines none of the mechanics:

| Concern | Owned by |
| --- | --- |
| Plan structure, one file per section, the breakdown directory | [Standard 4](04-planning-standards.md) |
| What an acceptance criterion is and must be | [Standard 7](07-acceptance-criteria.md) |
| Status values and transitions | [Standard 8](08-status-tracking.md), [ADR 0001](../artifacts/adr/0001-canonical-status-vocabulary.md) |
| What verification means and when work is done | [Standard 9](09-verification.md) |
| Planning for a project that already exists | [Standard 44](44-existing-project-reconstruction.md) |

**This standard MUST NOT restate any of the above.** A second copy of the planning contract is a
second definition, and [Standard 32](32-documentation-quality.md) R4 is the general form of why that
is a defect.

## Requirements

### R1 — Plan before implementation

**Before implementation:**

**Run `/plan-structure`. Run `/plan-handoff`. If those skills are not available, manually reproduce
their intended behavior.**

The fallback clause is the important half. The requirement is on the *behaviour* —
[Standard 4](04-planning-standards.md)'s structure and a handoff that survives the loss of the
conversation — and a missing tool is not an exemption from it. Naming skills rather than outcomes
would otherwise make the standard unenforceable anywhere the skills are not installed, which is most
places.

### R2 — The plan lives in files, not in the conversation

**Write every top-level plan section to its own file under:**

```text
artifacts/project-plan-breakdown/
```

**Do not leave the implementation plan only in the conversation.**

This is [Standard 4](04-planning-standards.md)'s requirement and [Standard 5](05-resumability.md)'s
purpose, and it is restated here only because it is the one most often skipped under time pressure —
the plan exists, it is good, and it is in a chat log that the next agent will never see.

### R3 — Required coverage for this project

**The plan should cover at minimum**, reproduced verbatim from the source:

```text
overview
goals/non-goals
standards architecture
rule model
policy schema
CLI architecture
validation engine
templates
testing
CI
versioning
adoption
future integrations
release plan
handoff
```

**This list is specific to building the standards framework itself.** It is not a universal plan
template, and MUST NOT be applied as one to unrelated projects — a project with no rule model and no
policy schema would be filling in sections to satisfy a checklist, which is
[Standard 7](07-acceptance-criteria.md)'s failure mode moved up a level.

What generalises is the shape: **the plan's sections are derived from the system's actual components
and lifecycle, and cover the lifecycle to release**, not just the build. Six of these fifteen —
testing, CI, versioning, adoption, release plan, handoff — are about what happens after the code
works, and those are the ones a plan written from a feature list omits.

### R4 — Every executable section carries the same six fields

**Each executable section must contain**, reproduced verbatim from the source:

```text
Status
Purpose
Deliverables
Acceptance Criteria
Verification
Dependencies
```

**where applicable.**

Their definitions belong elsewhere and are not repeated here:

| Field | Defined by |
| --- | --- |
| Status | [Standard 8](08-status-tracking.md) — the canonical vocabulary, per [ADR 0001](../artifacts/adr/0001-canonical-status-vocabulary.md). Not `done`, and never a reference to another tracker |
| Purpose | [Standard 4](04-planning-standards.md) |
| Deliverables | [Standard 4](04-planning-standards.md) |
| Acceptance Criteria | [Standard 7](07-acceptance-criteria.md) — observable and objectively pass/fail |
| Verification | [Standard 9](09-verification.md) — the exact check that proves it |
| Dependencies | [Standard 4](04-planning-standards.md) |

*Executable* is doing work: a section that is context, background, or a decision record is not an
item and does not need the six fields. Forcing them onto every heading produces `Status: N/A` six
times and trains readers to skip the block.

*Where applicable* is the source's hedge and is honoured — but **Status, Acceptance Criteria, and
Verification are always applicable to an executable item.** An item without them cannot be reported
on, cannot be finished, and cannot be proven finished, which are the three things a plan exists to
enable.

### R5 — An existing project reconstructs rather than invents

Where a project already has an implementation and no trustworthy plan, the plan under R2 MUST be
produced by [Standard 44](44-existing-project-reconstruction.md) — from evidence, with every claim
labelled — and MUST NOT be written as though the project were being started now.

A clean-room plan authored over existing code is a fabricated history, and once committed it is
indistinguishable from a real one. [Standard 33](33-bootstrap-experience.md) R4 is where this routing
is detected mechanically.

## Additions this standard makes beyond the source

- R3's ruling that the fifteen-section list is project-specific, and the statement of what
  generalises from it.
- R4's clarification of *executable*, and that Status, Acceptance Criteria, and Verification are
  always applicable regardless of the source's hedge.
- R5's routing to [Standard 44](44-existing-project-reconstruction.md) for existing projects.
- R1's reading of the fallback clause as the operative half — the requirement is on behaviour, not on
  a named tool.
- The Scope table, which is the point of this standard: it delegates rather than defines.

## Relationship to other standards

Every requirement here resolves to [Standard 4](04-planning-standards.md),
[Standard 7](07-acceptance-criteria.md), [Standard 8](08-status-tracking.md),
[Standard 9](09-verification.md), or [Standard 44](44-existing-project-reconstruction.md) — see the
Scope table. [Standard 5](05-resumability.md) is why R2 exists.
[Standard 33](33-bootstrap-experience.md) R4 detects R5's condition.
[Standard 10](10-scope-change-management.md) governs what happens when the plan changes after this
point. [Standard 32](32-documentation-quality.md) R4 is the general rule this standard's Scope
section applies to itself.

## Implementation

**R1 and R2 are met.** `artifacts/project-plan-breakdown/` exists, was produced through
`/plan-structure` and `/plan-handoff`, and holds `00-overview.md` plus three sections:
`01-standard-44.md`, `02-standards-backfill.md`, and `03-standards-audit-cli.md`. The plan is in
files, not in a conversation.

**R3 is not met.** Three sections against fifteen. The breakdown covers the work that has actually
been undertaken — standard 44, the backfill, the audit CLI — and has nothing for policy schema, rule
model, validation engine, templates, versioning, adoption, future integrations, or release plan.
Several of those are documented as standards and unbuilt, so the gap is consistent rather than
contradictory, but the plan does not currently describe the whole system it is a plan for.

The two missing sections most worth adding are **release plan** and **versioning**, because both are
constrained by a standing decision — everything stays on `develop` until the plan has zero gaps — and
that decision currently lives only in conversation, which is the exact failure R2 exists to prevent.

**R4 is met** for the sections that exist: each executable item carries the six fields, with Status
drawn from the canonical vocabulary.

**R5 does not apply.** This repository is greenfield and its plan was written before implementation.

# Standard 8 — Status Tracking

The canonical lifecycle vocabulary for project-plan and backlog work. One set of statuses, meaning
the same thing in every repository, skill, validator, and integration.

Source: item 8 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md),
amended by [ADR 0001](../artifacts/adr/0001-canonical-status-vocabulary.md).

## Scope

Applies to plan sections and executable items ([Standard 4](04-planning-standards.md),
[Standard 7](07-acceptance-criteria.md)), to backlog items, and to any tooling that reads or writes a
status field.

This standard is **normative for the whole series**. Where another standard, skill, or tool named a
different vocabulary, this one governs and the other is being migrated to it.

Note for anyone reading the source directly: item 8 is the only item written as `# 8. Status
Tracking` with a Markdown heading prefix, where every other item is a bare `N. Title`. A scan
anchored on the bare form misses it, and has.

## Requirements

### R1 — The canonical vocabulary

Every status field MUST use exactly one of these eight tokens:

```text
NOT_STARTED
READY
IN_PROGRESS
BLOCKED
IN_REVIEW
COMPLETE
DEFERRED
CANCELLED
```

| Status | Meaning |
| --- | --- |
| `NOT_STARTED` | Identified work that is not yet actionable or scheduled |
| `READY` | Actionable and ready to begin |
| `IN_PROGRESS` | Actively being worked |
| `BLOCKED` | Cannot proceed because of a dependency or issue |
| `IN_REVIEW` | Implementation is done and awaiting review, approval, or verification |
| `COMPLETE` | Fully done according to its acceptance criteria |
| `DEFERRED` | Intentionally postponed, but still valid future work |
| `CANCELLED` | Intentionally abandoned; no longer planned |

Three departures from the source list, decided in
[ADR 0001](../artifacts/adr/0001-canonical-status-vocabulary.md) and disclosed here rather than
presented as source text:

- **`READY_FOR_REVIEW` is renamed `IN_REVIEW`, and `READY` is added.** The source's token collided
  semantically with the `backlog` skill's `ready`, which means *ready to start* — nearly the opposite.
  `READY` is now before the work and `IN_REVIEW` after it, and neither can be mistaken for the other.
- **`done` is not part of this vocabulary.** `COMPLETE` is used instead, because
  [Standard 9](09-verification.md) distinguishes *implemented*, *verified*, and *released*, and "done"
  reliably blurs into the first of those.
- **`DEFERRED` and `CANCELLED` are both required and MUST NOT be collapsed.** The first says *not
  now*; the second says *not ever*. Losing the distinction destroys the reason a future reader most
  often consults an old plan.

### R2 — Status is lifecycle state only

A status field MUST contain a lifecycle state and nothing else. **A reference to another system is
not a status.**

`tracked as <backlog-id>` — previously used by [Standard 44](44-existing-project-reconstruction.md)
plan items — is abolished. An item whose liveness is tracked elsewhere still has a real state, and
still records the reference, in a separate field:

```yaml
status: DEFERRED
trackedBy: GH-142
```

or, where the provider matters:

```yaml
status: READY
workItem:
  provider: github
  id: 142
```

Likewise, a business disposition is not a lifecycle state. Where a project needs to distinguish
"abandoned" from "proposal rejected", the status is `CANCELLED` and the distinction lives beside it:

```yaml
status: CANCELLED
disposition: DECLINED
```

The rule behind all three: **one field, one question.** A field that sometimes answers "what state is
this in" and sometimes answers "where is it tracked" cannot be read by a machine or trusted by a
person.

### R3 — Plan sections carry status

Plan sections SHOULD include status where appropriate.

"Where appropriate" excludes narrative sections. An overview or a glossary has no status because it
cannot be finished; an executable item always does.

### R4 — Blocked work MUST identify its blocker

**Blocked work should identify its blocking dependency.**

A `BLOCKED` item that does not say what it is blocked on is indistinguishable from an abandoned one,
and it cannot be unblocked by anyone except its author. The blocker SHOULD be named specifically
enough to be actionable: another item's identifier, an external decision and who owns it, or a
dependency and what is missing from it.

### R5 — Expected transitions

The expected state machine. A project is **not required to enforce** it, but agents MUST NOT invent
transitions outside it without recording why.

```text
NOT_STARTED → READY
READY → IN_PROGRESS
IN_PROGRESS → BLOCKED
BLOCKED → READY | IN_PROGRESS
IN_PROGRESS → IN_REVIEW
IN_REVIEW → IN_PROGRESS
IN_REVIEW → COMPLETE

NOT_STARTED | READY | IN_PROGRESS | BLOCKED → DEFERRED
DEFERRED → READY
NOT_STARTED | READY | IN_PROGRESS | BLOCKED | DEFERRED → CANCELLED
```

Three things the model says by omission, worth stating:

- **`COMPLETE` is terminal.** Nothing transitions out of it. Work that turns out not to be finished
  was never `COMPLETE`; correct the earlier status rather than moving backwards from it.
- **`IN_REVIEW → IN_PROGRESS` is expected, not exceptional.** Review returning work is the normal
  case, not a failure state.
- **`CANCELLED` is reachable from everywhere except `COMPLETE`**, including from `DEFERRED` —
  postponed work is often eventually abandoned, and that transition should be recordable.

### R6 — Migration and aliases

Tooling MAY accept legacy tokens as aliases during migration, so that existing repositories continue
to validate. **Every generated artifact MUST emit the canonical vocabulary.**

| Legacy token | Canonical |
| --- | --- |
| `not-started` | `NOT_STARTED` |
| `backlog` | `NOT_STARTED` |
| `ready` | `READY` |
| `in-progress` | `IN_PROGRESS` |
| `blocked` | `BLOCKED` |
| `done` | `COMPLETE` |
| `dropped` | `CANCELLED` |
| `declined` | `CANCELLED` *(with `disposition: DECLINED` where the distinction matters)* |
| `tracked as <id>` | *not a status* — see R2 |

Alias acceptance is a transitional allowance, not a second vocabulary. It SHOULD be removed once the
repositories a tool serves have migrated.

## Additions this standard makes beyond the source

- The whole of R2 — that status is lifecycle state only, and that references and dispositions live in
  separate fields.
- `READY` and `IN_REVIEW` as tokens, replacing `READY_FOR_REVIEW`.
- R5's transition model, and the three observations following it.
- R6's alias table and migration rule.
- R1's per-status definitions. The source lists the tokens without defining them.
- R4's guidance on naming a blocker specifically; the source requires only that it be identified.

All of these were decided in [ADR 0001](../artifacts/adr/0001-canonical-status-vocabulary.md), which
records what was rejected and why.

## Relationship to other standards

[Standard 9](09-verification.md) distinguishes *implemented*, *verified*, and *released*, which this
vocabulary deliberately does not carry: `COMPLETE` means at least *verified*, never merely
*implemented*. A project needing to track release separately should do so in its own field, not by
adding a status.

[Standard 7](07-acceptance-criteria.md) defines the `Status` field on an executable item;
[Standard 44](44-existing-project-reconstruction.md) uses this vocabulary for reconstructed plan
items.

## Implementation

**No skill implements this standard directly**; it constrains the vocabulary others use.

Migration state, recorded honestly:

| System | State |
| --- | --- |
| [Standard 44](44-existing-project-reconstruction.md) plan items | Migrated — canonical vocabulary, `tracked as <id>` replaced by a separate `Tracked by` field |
| `project-reconstruction` skill and its templates | Migrated |
| `backlog` skill | Migrated — `declined` now `CANCELLED` with `disposition: DECLINED` |
| `backlog-validate` validator | Accepts legacy aliases per R6; canonical preferred |
| This repository's own plan | Migrated |
| `standards audit` | Reads canonical and legacy; resolves `Tracked by` references |

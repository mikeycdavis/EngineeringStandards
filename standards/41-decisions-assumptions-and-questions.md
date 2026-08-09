# Standard 41 — Decisions, Assumptions, and Unresolved Questions

The context that makes a project continuable is mostly not code. This standard requires it to be
written down, and — the part that makes it useful — requires a reader to be able to tell a settled
decision from a working assumption without asking anyone.

Source: item 41 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **the epistemic state of project context**: what is decided, assumed, open, blocked, or
deferred. Architectural decisions have their own artifact ([Standard 11](11-architecture-decision-records.md));
plan-item lifecycle is [Standard 8](08-status-tracking.md); evidence provenance during a
reconstruction is [Standard 44](44-existing-project-reconstruction.md). This standard is the axis
none of those cover — not *what state is the work in*, but *how well do we know this is true*.

## Requirements

### R1 — The governing principle

**Important context required to continue a project must not remain exclusively in conversation
history.**

The source states this in its strengthened form:

```text
Source code, structured contracts, and durable repository artifacts are the canonical project record. Chat history is transient working context and must never be the sole source of information required to build, operate, verify, or continue the project.
```

*Sole source* is the precise obligation. Discussion in chat is fine and unavoidable; what is
prohibited is a fact existing **only** there. The test is [Standard 5](05-resumability.md)'s: a fresh
agent with repository access and no history must be able to continue.

### R2 — What must be persisted

**Persist significant**, reproduced verbatim from the source:

```text
decisions

assumptions

constraints

risks

blockers

unresolved questions

deferred decisions

known unknowns
```

**Known unknowns** is the one most often skipped and the most valuable. *We do not know how this
integration behaves under rate limiting* is a durable, actionable project fact. Its absence reads as
*this was considered and is fine*, and the next person rediscovers it at cost.

### R3 — Five machine-distinguishable states

**A fresh engineer or AI agent should be able to distinguish between**, reproduced verbatim from the
source:

```text
settled decision
working assumption
open question
known blocker
deferred decision
```

These MUST be distinguishable **mechanically, not by reading tone**. The canonical tokens:

| Token | Means | Resolves by |
| --- | --- | --- |
| `DECISION` | Settled. Work may depend on it | Being superseded, via a new record |
| `ASSUMPTION` | Believed and acted upon, not verified | Validation, retention, or conversion to `OPEN_QUESTION` (R5) |
| `OPEN_QUESTION` | Not known, and the answer would change something | Being answered, which usually produces a `DECISION` |
| `BLOCKER` | Known and preventing progress | Removal, or conversion to a constraint the design accepts |
| `DEFERRED_DECISION` | Deliberately not decided yet, with a trigger for when it must be | Being decided at the trigger |

**`DEFERRED_DECISION` is distinct from `OPEN_QUESTION`**, and conflating them loses the intent. An
open question is *we do not know*; a deferred decision is *we know we must choose, and we have chosen
not to yet*. The second carries an obligation the first does not, so it MUST record what triggers the
decision — otherwise it is indistinguishable from something forgotten.

Each record SHOULD carry an **owner**, a **source** (what it rests on — a document, a conversation, a
measurement), and a **date**. The date is what makes staleness visible: a two-year-old assumption
about a third-party API is a different object from last week's.

**This taxonomy is a different axis from [Standard 44](44-existing-project-reconstruction.md)'s
evidence labels** (`OBSERVED` / `INFERRED` / `CONFIRMED_BY_OWNER` / `UNKNOWN`), and the two must not
be conflated. Those describe *where a claim came from*; these describe *how settled a project fact
is*. A reconstructed baseline commonly produces both — an `INFERRED` observation that becomes an
`ASSUMPTION` the plan depends on.

### R4 — One durable home per record

**Use the most appropriate durable artifact**, reproduced verbatim from the source:

```text
PROJECT.md
plan section
plan handoff
ADR
risk register
issue/work item
documentation
```

**Do not create unnecessary duplicate records.**

Routing, so the choice is not re-litigated per record:

| Record | Home |
| --- | --- |
| A consequential architectural decision | ADR ([Standard 11](11-architecture-decision-records.md)) |
| A decision or assumption scoped to one piece of work | That plan section ([Standard 4](04-planning-standards.md)) |
| Current project-level state, risks, blockers | `PROJECT.md` ([Standard 6](06-project-manifest.md)) |
| A question awaiting an owner's answer during reconstruction | `artifacts/project-baseline/open-questions.md` ([Standard 44](44-existing-project-reconstruction.md)) |

**One home, everything else references it** ([Standard 37](37-quality-bar.md) R5). A decision
recorded in both an ADR and a plan section will be updated in one of them, and a reader has no way to
know which is current.

### R5 — Assumptions resolve before dependent work completes

**An assumption that materially affects implementation MUST be validated, explicitly retained as an
assumption, or converted into an open question before the dependent work is declared complete.**

This is the lifecycle rule that keeps R3's taxonomy from being decoration. Without it an assumption
hardens into a fact by attrition: code gets written around it, the code works, and after a few months
nobody remembers that the premise was never checked. Nothing marks the transition — that is exactly
the problem, because the label stops being read once the work looks finished.

The three permitted resolutions:

| Resolution | What it asserts |
| --- | --- |
| **Validated** | It was checked and holds. It becomes a `DECISION`, recording what validated it |
| **Explicitly retained** | Still an assumption; we accept the risk knowingly, with the exposure recorded |
| **Converted to `OPEN_QUESTION`** | Checking it matters and has not happened. It is now visible as unknown |

**An unresolved assumption is not a completion blocker; an unexamined one is.** Retaining it is a
legitimate outcome — this rule requires the *decision to retain*, not the removal.

This connects directly to [Standard 38](38-definition-of-done.md) R3: a material assumption that has
not been resolved one of these three ways is the same kind of gap as a `NOT_EVALUATED` required rule.
Neither is a failure, and neither is a pass.

### R6 — An invalidated assumption is a scope event

When an assumption is found false, the consequence MUST be traced to the work that depended on it,
and any resulting change recorded per [Standard 10](10-scope-change-management.md).

Invalidation is where recording assumptions pays for itself: it converts *why is this broken* into
*which items named this assumption*. That is only possible if dependent work referenced the record —
which is the practical reason R4 requires one identifiable home per record rather than restated prose
in several places.

## Additions this standard makes beyond the source

- R3's canonical tokens and the requirement that the five states be machine-distinguishable rather
  than inferable from tone, plus the owner/source/date fields and the `DEFERRED_DECISION` trigger.
  The source requires that a reader can distinguish them without saying how.
- The explicit separation of this taxonomy from
  [Standard 44](44-existing-project-reconstruction.md)'s evidence labels — two axes that are easy to
  conflate and mean different things.
- R5 in full — the assumption lifecycle rule and its three permitted resolutions.
- R6 in full.
- R4's routing table.
- R2's observation about `known unknowns`.

## Relationship to other standards

[Standard 5](05-resumability.md) is the test R1 states. [Standard 11](11-architecture-decision-records.md),
[Standard 6](06-project-manifest.md), and [Standard 4](04-planning-standards.md) own the artifacts
R4 routes to. [Standard 8](08-status-tracking.md) is the other axis — work state, not knowledge
state. [Standard 38](38-definition-of-done.md) R3 is the completion rule R5 parallels.
[Standard 10](10-scope-change-management.md) governs R6's consequences.
[Standard 44](44-existing-project-reconstruction.md) produces these records in bulk for an existing
project, and its `open-questions.md` is R3's `OPEN_QUESTION` with a defined file format.
[Standard 37](37-quality-bar.md) R5 is why R4 permits only one home.

## Implementation

**Partially met, in prose.**

Decisions of consequence are recorded as ADRs — [0001](../artifacts/adr/0001-canonical-status-vocabulary.md)
and [0002](../artifacts/adr/0002-canonical-rule-identity.md) — each carrying context, alternatives,
and consequences. Each standard's `## Implementation` section records what is unbuilt and why, which
covers a good deal of R2's *risks*, *blockers*, and *known unknowns* in narrative form.

**R3 is not met.** No record in this repository carries a machine-distinguishable state token. The
distinctions exist in wording — "not implemented", "blocked in the same way", "worth building first"
— which is precisely the *distinguishable by reading tone* this requirement rejects. Nothing can
count the open questions or find the assumptions.

**R5 has one live instance, and it is worth naming.** The decision to defer `project-policy.yml`
until the full key surface is known rests on the assumption that standards 40–43 would add policy
keys. That assumption is now testable: this batch is written, and it can be validated or invalidated
directly rather than left standing.

**One `DEFERRED_DECISION` exists and has a trigger**, which is the shape R3 requires: nothing merges
to `master` and no release is cut until the plan has zero gaps. It lives in a conversation and in
this sentence, not in an artifact — which is R1's violation, and
[Standard 35](35-planning-requirements.md)'s implementation section already flags the missing release
plan section as its proper home.

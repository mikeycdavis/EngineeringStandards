# Standard 51 — Architecture Integrity

Architecture decays one convenient shortcut at a time. None of the prohibitions here describes a
change that is wrong on the day it lands — each describes one that is cheaper now and more expensive
every day afterwards, which is exactly the kind of decision a deadline makes for you.

Source: the "Architecture" and "APIs" sections of
[`artifacts/prompts/second-fold-in-prompt.md`](../artifacts/prompts/second-fold-in-prompt.md).

## Scope

Applies to every repository under the framework. Part of the must-never layer defined by
[Standard 45](45-engineering-invariants.md).

## Requirements

### R1 — Never introduce hidden global state

Reproduced verbatim from the source:

* introduce hidden global state without justification

Rule `architecture.no-hidden-global-state`, `forbidden`, `manual-review`, exemptible.

*Hidden* is the qualifier, and it is what the rule turns on. A configuration singleton loaded once at
startup, a connection pool, a metrics registry — these are global and they are not hidden: they are
named, owned, and documented. What is prohibited is the mutable state reachable from anywhere, whose
owner is nobody, and whose lifetime nobody can state — because the failures it produces are
order-dependent, appear first in tests running in parallel, and get fixed by adding a sleep.

**Justification, per the source, means an [ADR](11-architecture-decision-records.md)** naming three
things: what the state is, **who owns it**, and how it is **reset** — because state that cannot be
reset makes every test after the first one depend on the ones before it.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | A platform or framework requires process-global registration (a logging framework, a DI container root, a signal handler) |
| Justification | An ADR naming the state, its owner, and its reset path |
| Evidence | The ADR, and the reset mechanism in code |
| Approval | Not required where the ADR exists |
| Revisit | When the framework is replaced |

### R2 — Never bypass an established boundary

Reproduced verbatim from the source:

* create circular dependencies intentionally

And, from the same list, reproduced verbatim from the source:

* bypass established boundaries merely because it is easier

Rule `architecture.no-boundary-bypass`, `forbidden`, `manual-review`, exemptible.

Two prohibitions, one rule, because a circular dependency is usually what a bypassed boundary becomes:
the layer that reached past its neighbour now needs something back, and the cycle is the trace the
shortcut left. Treating them as one failure family means one finding for one defect.

*Merely because it is easier* is the qualifier. A boundary that is wrong should be moved — through an
[ADR](11-architecture-decision-records.md), so that the new boundary is the one everyone is working
to. What is prohibited is leaving the boundary in place, documented and believed, while writing code
that goes around it: the diagram now describes a system that does not exist, which
[Standard 32](32-documentation-standards.md) treats as a documentation defect as well.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | A migration in progress, where the target structure is defined and the bypass is transitional |
| Justification | The ADR defining the target structure and the sequence |
| Evidence | The ADR, and the tracked work item that removes the bypass |
| Approval | Not required where both exist |
| Revisit | **Expiring** — at the migration's stated end. A transitional bypass with no end date is the permanent structure |

### R3 — Never build a second implementation of an existing capability

Reproduced verbatim from the source:

* duplicate critical domain logic across layers

And, from the same list, reproduced verbatim from the source:

* create a second implementation of an existing capability without justification

Rule `architecture.no-duplicate-implementations`, `forbidden`, `manual-review`, exemptible.

Two copies of a domain rule are not redundancy; they are a future defect with a delivery date. The
first bug fixed in one copy makes them disagree, and nothing records which one is authoritative —
the same failure [Standard 22](22-adoption-and-migration.md) R6 describes for a copied standard.

**Business rules in UI code route to [Standard 1](01-human-and-ai-operability.md) R1**, which already
prohibits UI-only capabilities and is the stronger statement: not merely that the logic must not be
duplicated there, but that it must not live there at all.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | A strangler migration, where the second implementation exists to replace the first |
| Justification | The ADR naming which implementation is authoritative *now*, and the cutover criteria |
| Evidence | The ADR, and the tracked work item that deletes the loser |
| Approval | Not required where both exist |
| Revisit | **Expiring** — at cutover. Two permanent implementations of one capability is the violation, whatever the original intent |

### R4 — Evaluate a dependency before adding it

Reproduced verbatim from the source:

* introduce dependencies without evaluating whether they are necessary

Rule `architecture.dependency-evaluation`, **`required`** at severity `warning` — the one rule in the
must-never layer that is not a prohibition.

It is obligation-shaped rather than prohibition-shaped: what the source forbids is adding a
dependency *without evaluating*, so the rule asks for the evaluation, and there is no prohibited
artifact to search for. Severity is `warning` rather than `error` because an unevaluated dependency is
a process omission, not a defect in the running system.

The evaluation is proportionate: a transitive utility does not need an ADR, and a framework, a
runtime, or anything that will end up in the trust boundary does.

**This framework's own worked example.** The zero-third-party-dependency decision is recorded in
[design/standards-audit-cli.md](../design/standards-audit-cli.md), with what was rejected and why — a
compiled binary in Go or Rust, and Python — and it is enforced structurally rather than by
discipline: CI has no install step, so a dependency cannot be added without the failure being
immediate and visible. That is what an evaluated dependency decision looks like when it is finished.

### R5 — Never change a public contract silently

Reproduced verbatim from the source:

* silently change a public contract
* silently reinterpret existing fields

And, from the same list, reproduced verbatim from the source:

* remove compatibility without explicitly assessing consumers

**Already bound**, and no new rule id is minted ([Standard 45](45-engineering-invariants.md) R4):
[Standard 15](15-ai-tool-contracts.md) R2 requires breaking changes to be managed intentionally and
R7 requires deprecation before removal, with [Standard 21](21-versioning.md) supplying the version
semantics that make a change announceable at all.

Reinterpreting an existing field is the subtlest member of this family and the most damaging, because
no signature changes and no consumer breaks visibly — they simply start being wrong. It is a breaking
change under [Standard 15](15-ai-tool-contracts.md) R3 and must be versioned as one.

The source's remaining API prohibition — returning successful status semantics for a failed operation
— lives in [Standard 48](48-error-handling-and-observability.md) R2, because that failure is the same
whether or not it crosses a network boundary.

## Additions this standard makes beyond the source

- R1's definition of *hidden*, and the requirement that the justifying ADR name the owner and the
  reset path. The source requires justification without saying what discharges it.
- R2's combination of circular dependencies and boundary bypass into one failure family, with the
  reason.
- R3's routing of UI-embedded business rules to [Standard 1](01-human-and-ai-operability.md) R1 as
  the stronger statement.
- R4's classification as `required`/`warning` rather than `forbidden`, with the reason, and the use
  of this framework's own zero-dependency decision as the worked example.
- The expiry requirement on R2's and R3's exceptions.
- The exception tables.

## Relationship to other standards

[Standard 1](01-human-and-ai-operability.md) R1 owns UI-only capabilities.
[Standard 11](11-architecture-decision-records.md) is where every justification in this standard
lives. [Standard 15](15-ai-tool-contracts.md) and [Standard 21](21-versioning.md) are what R5 routes
to. [Standard 48](48-error-handling-and-observability.md) R2 owns the source's HTTP-status
prohibition. [Standard 22](22-adoption-and-migration.md) R6 is R3's principle stated for standards
rather than code. [Standard 32](32-documentation-standards.md) is why a bypassed boundary is also a
documentation defect. [Standard 45](45-engineering-invariants.md) defines the level semantics and the
exception discipline.

## Implementation

**Normative. No rule here is automated, and the reason is the same for all four.**

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `architecture.no-hidden-global-state` | `manual-review`. A module-level mutable binding is trivial to find and says nothing about whether the state is hidden or owned |
| R2 | `architecture.no-boundary-bypass` | `manual-review`. Requires knowing where the boundaries are, which is a project-specific fact no scan has |
| R3 | `architecture.no-duplicate-implementations` | `manual-review`. Similar code is not duplicated logic, and duplicated logic is often not similar code |
| R4 | `architecture.dependency-evaluation` | `manual-review`, `required`/`warning`. A manifest shows which dependencies exist, never which were evaluated |

Two structural architecture rules already exist and are evaluated —
`architecture.adr` and the architecture-documentation checks — so this standard's `manual-review`
rules sit beside automated ones rather than standing in for them.

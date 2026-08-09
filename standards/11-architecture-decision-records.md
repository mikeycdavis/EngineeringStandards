# Standard 11 — Architecture Decision Records

Consequential architectural decisions should leave a record of what was decided and why, so that a
future reader can tell a deliberate choice from an accident — and can revisit it knowing what it was
weighed against.

Source: item 11 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to consequential architectural decisions on any project. Explicitly **not** to trivial
implementation choices — the source says so directly, and a project that writes an ADR for every
choice produces a directory nobody reads.

## Requirements

### R1 — Maintain an ADR directory

Projects SHOULD maintain:

```text
artifacts/adr/
```

`docs/adr/` and `doc/adr/` — the locations Nygard's original article and adr-tools established — also
satisfy this requirement, and the validator accepts all three. The requirement is that decisions have
a durable home, not that they have a particular one; a project already following the older convention
gains nothing from moving the files, and a rule that made it move them would be teaching adopters to
edit their repository to please a detector.

### R2 — Define an ADR template

A project MUST create an ADR template, so that records are comparable rather than each being shaped
by whoever wrote it. A recommended template is supplied below.

### R3 — When an ADR is warranted

Use ADRs for consequential architectural decisions such as, reproduced verbatim from the source:

- database technology
- authentication architecture
- event-driven architecture
- cloud provider dependencies
- AI provider strategy
- data ownership
- messaging infrastructure
- major third-party dependencies
- significant deviations from engineering standards

**Do not require ADRs for trivial implementation choices.**

The last entry deserves emphasis: a deviation from these standards is itself an architectural
decision and MUST be recorded as one. An undocumented deviation is indistinguishable from a violation.

A useful test for the boundary: an ADR is warranted when reversing the decision later would be
expensive, when a reader would otherwise ask "why on earth is it done this way", or when the choice
constrains decisions that come after it.

### R4 — Numbered filenames

Use numbered filenames such as:

```text
0001-use-postgresql.md
0002-use-provider-neutral-ai-adapters.md
```

Four-digit zero padding, ascending, never reused. A number identifies a decision permanently — that
is what allows an ADR to say it supersedes `0003` and for a reader to find it.

### R5 — Statuses

ADR statuses SHOULD support, reproduced verbatim from the source:

```text
Proposed
Accepted
Superseded
Deprecated
Rejected
```

**ADRs are not deleted and not rewritten.** A decision that no longer holds becomes `Superseded` or
`Deprecated`, and a superseding ADR names the one it replaces. `Rejected` records a decision that was
considered and declined, which is often the most valuable kind: it prevents the same proposal from
being relitigated annually by people who cannot see that it was already weighed.

## Recommended ADR template

Supplied to satisfy R2. A project may substitute its own.

```markdown
# NNNN — <decision, stated as a completed action>

- **Status:** Proposed | Accepted | Superseded by NNNN | Deprecated | Rejected
- **Date:** YYYY-MM-DD
- **Deciders:** <who made the call>

## Context

What forced a decision. The constraints, the pressures, and what was true at the time — written so a
reader who was not there understands the problem before seeing the answer.

## Decision

What was decided, stated plainly and in the active voice.

## Alternatives considered

What else was on the table, and why it lost. An ADR with no alternatives is a description, not a
decision record, and gives a future reader nothing to reason with.

## Consequences

What this makes easy, what it makes hard, and what it commits the project to. Include the costs
accepted knowingly — those are what a reader most needs when deciding whether the trade still holds.
```

## Additions this standard makes beyond the source

- The entire recommended template. The source requires that a template be created without specifying
  one.
- R3's boundary test — expensive to reverse, provokes "why is it done this way", or constrains later
  decisions — is this standard's contribution.
- R4's rule that numbers are never reused, and R5's rule that ADRs are superseded rather than edited
  or deleted, are additions. The source lists the statuses without stating the immutability that
  makes `Superseded` meaningful.
- The observation in R5 about the value of `Rejected` is explanation, not source text.

## Relationship to other standards

[Standard 5](05-resumability.md) requires that a fresh reader can determine "important decisions and
why they were made" — this standard is how. [Standard 10](10-scope-change-management.md) covers scope
changes generally; those that are architectural warrant an ADR in addition to a plan update.
[Standard 44](44-existing-project-reconstruction.md) requires ADRs to be created or updated when owner
answers resolve an architectural question during a reconstruction.

[Standard 6](06-project-manifest.md)'s manifest links important ADRs rather than restating them.

## Implementation

**No skill implements this standard.**

`standards audit` checks that an ADR directory exists, in any of the three locations R1 accepts, and
reports `architecture.adr` when none does. It does not check ADR numbering, status validity, or
template conformance; those are candidate improvements. The catalog marks the rule
`assurance: partial` for that reason.

What no tool can check is whether the decisions that *were* consequential are the ones that got
recorded — which is the substance of R3 and the larger half of this standard.

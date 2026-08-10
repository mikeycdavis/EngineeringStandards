# Standard 42 — Documentation Freshness

A change-coupling rule. Documentation is updated in the same change set as the implementation that
invalidates it — not afterwards, not in a follow-up item, not when someone notices.

Source: item 42 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **when documentation must change**. What documentation must exist is
[Standard 39](39-codebase-documentation.md); what makes it correct is
[Standard 32](32-documentation-quality.md); the completion checklist that operationalises this
standard is [Standard 43](43-documentation-completion.md).

## Requirements

### R1 — Documentation is part of the implementation

**Documentation is part of the implementation.**

Five words, and they settle the question this standard exists to settle. Documentation is not a
downstream activity, not a separate work item, and not a phase after the code — it is a component of
the change, and a change missing it is incomplete in the same way a change missing its tests is
incomplete.

**Materially stale documentation is a correctness defect, not merely a maintenance task**
([Standard 32](32-documentation-quality.md) R3). *Stale* describes age and tolerates delay; *wrong*
describes correctness and does not. The distinction is what makes the rest of this standard
enforceable rather than aspirational.

### R2 — The triggering changes

**When implementation materially changes**, reproduced verbatim from the source:

```text
architecture

application behavior

workflows

APIs

AI tools/capabilities

integrations

background jobs

setup procedures

deployment procedures

security behavior

auditing behavior
```

**update the relevant documentation in the same work item or change set.**

Each maps to a documentation surface [Standard 39](39-codebase-documentation.md) requires, so the
coupling is mechanical rather than a judgement about what "relevant" means:

| Change to | Update |
| --- | --- |
| architecture | [39](39-codebase-documentation.md) R3, and the Mermaid source of any affected diagram (R4) |
| application behavior, workflows | [39](39-codebase-documentation.md) R6, R7 |
| APIs, AI tools/capabilities | The structured contract first ([39](39-codebase-documentation.md) R10, [15](15-ai-tool-contracts.md)), then what the contract cannot express |
| integrations, background jobs | [39](39-codebase-documentation.md) R9, R8 |
| setup, deployment procedures | [39](39-codebase-documentation.md) R5, R11 |
| security behavior, auditing behavior | [16](16-security.md), [3](03-auditing.md), and the feature documentation that describes them |

*Materially* carries the same meaning as in [Standard 32](32-documentation-quality.md) R3: a change
is material when it makes an existing statement false. A refactor that alters no documented behaviour
triggers nothing.

**Same change set** is the operative phrase. The reason is not process tidiness — it is that the
moment of the change is the only moment when someone knows exactly what became untrue. A follow-up
item is written by someone reconstructing that from a diff, and usually written by nobody.

### R3 — Incomplete, not merely undocumented

**Work should not be considered fully complete when the implementation and its required documentation
materially disagree.**

This is [Standard 38](38-definition-of-done.md) applied to documentation, and it removes the escape
hatch: *we'll document it later* is not a deferral, it is a statement that the work is unfinished.

It follows that documentation debt is **not** a separate backlog. A tracked follow-up item to
document a change already shipped is a record that incomplete work was declared complete. Where a
genuine deferral is warranted, it is `DEFERRED` with a reason
([Standard 41](41-decisions-assumptions-and-questions.md) R3), and the dependent work is not
`COMPLETE`.

The narrow exception: **a documentation gap that predates a change is not that change's obligation.**
This standard couples a change to the documentation *it invalidates*. Requiring every change to
retrofit pre-existing gaps makes the rule unaffordable, and an unaffordable rule is one people route
around.

### R4 — Extend the validator where checks are deterministic

**Where deterministic checks are possible, extend the standards validator to detect missing or
obviously stale documentation.**

*Deterministic* and *obviously* are both load-bearing, and together they define an honest scope.
Freshness is not fully mechanically decidable — no check can tell whether prose still describes
behaviour — and a validator claiming otherwise violates
[Standard 24](24-validator-rules.md) R2 and R4.

What is decidable:

| Checkable | Type |
| --- | --- |
| A documented path, command, or file does not exist | `structural` |
| A required documentation surface is absent for a component that exists — jobs run, `docs/jobs/` does not | `structural` |
| A `.mmd` source is newer than its rendered `.svg` | `structural` ([39](39-codebase-documentation.md) R4) |
| A documented flag, field, or endpoint is absent from the contract that defines it | `configuration` |
| Documentation is materially older than the code it describes | `structural`, heuristic — reported as a warning, never a failure |

The last row is the one to keep honest. Age is a proxy for staleness, not evidence of it: correct
documentation of stable code is old precisely because it is right. A rule of this kind must be
`INFERRED`, advisory, and must never be reported as a freshness failure — which is the same
discipline the audit's `potential-*` categories already follow.

## Additions this standard makes beyond the source

- R2's mapping table from each triggering change to the documentation surface
  [Standard 39](39-codebase-documentation.md) requires, and the reading of *same change set* as the
  only moment when what became untrue is known.
- R3's consequence that documentation debt is not a separate backlog, and the narrow exception for
  pre-existing gaps — without which the rule is unaffordable.
- R4's table of what is actually decidable, and the ruling that an age-based heuristic must be
  advisory and `INFERRED`.
- R1's explicit adoption of [Standard 32](32-documentation-quality.md) R3's correctness framing as
  this standard's foundation.

## Relationship to other standards

[Standard 32](32-documentation-quality.md) R3 supplies the correctness framing R1 rests on.
[Standard 39](39-codebase-documentation.md) defines every surface R2 routes to.
[Standard 43](43-documentation-completion.md) is the checklist that carries out this standard at the
point of completion. [Standard 38](38-definition-of-done.md) is what R3 extends.
[Standard 9](09-verification.md) is the same posture applied to tests.
[Standard 24](24-validator-rules.md) R2 and R4 bound what R4 may claim.
[Standard 41](41-decisions-assumptions-and-questions.md) R3 is where a genuine deferral is recorded.

## Implementation

**Partially met by practice, unenforced by tooling.**

Documentation in this repository has been updated in the same change set as the work it describes:
the README index and the source inventory move with each batch of standards, and the reconciliation
of Standards 18, 25, 26, and 27 to
[ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md) landed in the same commit as the ADR.
That is R2's coupling, achieved by discipline.

**R4 is met in two of its five rows.** The audit's `doc-code-discrepancies` category compares
documented paths against the filesystem — row one — and has fired twice on this repository's own
README. `scripts/diagrams.mjs` implements row three, the `.mmd`/derived-copy sync check, and runs in
CI. Rows two, four, and five are unimplemented, and rows two and four need the rule catalog
([Standard 27](27-rule-catalog.md)) before a validator can know what surfaces a project should have.

The diagram check is worth noting as an instance of this standard's own R4 discipline: it compares
text rather than rendering anything, so it establishes that a derived copy matches its source and
claims nothing about whether the diagram is *correct*. That is the honest scope of what it can see.

**The largest unchecked surface is the standards' own `## Implementation` sections, and it is a
candidate improvement.** One review pass found four of them describing behaviour that had changed
underneath: [Standard 31](31-whatsnext-compatibility.md) said a contract could not be honoured that
had shipped, [Standard 11](11-architecture-decision-records.md) said a check did not exist that did,
[Standard 16](16-security.md) said no secret scanning happened while a rule was scanning, and
[Standard 28](28-github-actions.md) offered a CI snippet using a flag the CLI does not accept. None
was careless: each was accurate when written, and nothing re-reads it afterwards.

That makes it systematic rather than incidental, and it is this standard's R2 failing in the one
place hardest to notice — the drift is invisible from the document, which stays internally coherent
while becoming false. It is also the most costly place to be wrong, because these sections are what
an adopter reads to decide whether a rule is worth trusting.

Full automation is out of reach: no checker can decide whether a paragraph of prose still describes a
program. Two partial checks would have caught all four, and neither needs judgement:

- **Command and flag claims.** Every CLI invocation in a fenced block is parsed against the flags the
  script actually accepts. Catches Standard 28.
- **Negative capability claims.** Sentences asserting a capability is absent — *does not check*,
  *no skill implements*, *not implemented* — are checked against the rule catalog and the detector
  list for a rule that contradicts them. Catches Standards 11, 16, and 31.

Both are one-directional: they find claims that understate what ships. Prose that *overstates* the
tooling remains a human review problem, which is the correct division —
[Standard 32](32-documentation-quality.md) R3 already owns it and no detector can settle it.

**R3's outstanding instance is closed.** `docs/architecture.md` had been generated when the
repository held far fewer standards and none of the current tooling, making it materially stale by
this standard's own definition. It was regenerated when the diagram strategy changed
([ADR 0003](../artifacts/adr/0003-mermaid-is-the-canonical-diagram-source.md)) — the same change set,
which is R2's coupling — and now describes the six scripts, the policy toolchain, the five commands,
and its own known gaps.

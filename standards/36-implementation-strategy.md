# Standard 36 — Implementation Strategy

The build order for the framework itself, and the rule that keeps a phase from being declared
finished because its files exist.

Source: item 36 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **sequencing and phase completion**. The plan artifacts a phase is expressed in belong to
[Standard 4](04-planning-standards.md) and [Standard 35](35-planning-requirements.md); what *done*
means belongs to [Standard 9](09-verification.md) and [Standard 38](38-definition-of-done.md). This
standard adds the ordering and one completion rule.

## Requirements

### R1 — Build incrementally, in phases

**Implement this repository incrementally.** The source's suggested phases:

**Phase 1 — Standards Foundation.** Create:

```text
README
VERSION
CHANGELOG
standards documentation
stable rule IDs
rule catalog
templates
PROJECT.md
project-policy.yml
JSON Schema
```

**Phase 2 — Validator.** Implement:

```text
standards validate
human output
JSON output
exit codes
rules engine
fixture repositories
automated tests
```

**Phase 3 — Repository Bootstrap.** Implement:

```text
standards init
template installation
safe existing-file handling
```

**Phase 4 — CI Integration.** Implement:

```text
GitHub Actions example
self-validation
release packaging
```

**Phase 5 — Advanced Validation Foundations.** Design extension points for future:

```text
code analysis
API inspection
audit coverage detection
AI capability coverage
ADR freshness
plan staleness
WhatsNext integration
```

**Do not over-engineer these advanced capabilities now.**

### R2 — The order is a dependency order, not a preference

The phases are sequenced because each supplies what the next consumes, and the dependencies are
real:

| Phase | Cannot start before | Because |
| --- | --- | --- |
| 2 Validator | 1 | A rules engine needs a rule catalog ([Standard 27](27-rule-catalog.md)) and a schema to validate policies against ([Standard 19](19-json-schema.md)) |
| 3 Bootstrap | 1 | `init` generates a `project-policy.yml`; generating one with nothing to validate it seeds every adopting project with a file of unknowable correctness ([Standard 33](33-bootstrap-experience.md)) |
| 4 CI | 2 | CI calls the canonical commands and must not author its own ([Standard 28](28-github-actions.md) R2) |
| 5 Extension points | 2 | An extension point designed before the thing it extends is a guess about a shape nobody has built |

**Work may proceed out of order where the dependency does not bind**, and doing so is not a
violation — but the dependency itself is not negotiable. Building Phase 3 before Phase 1's schema
does not make the bootstrap early; it makes it wrong.

Phase 5 is design only. **Designing an extension point is complete when the design exists**; building
the extension is later work and does not belong to this phase — which is what
*do not over-engineer these advanced capabilities now* means in practice.

### R3 — Phase completion is evidence-based

**A phase is complete when its acceptance criteria are met and its verification passes — never
because its deliverables exist.**

This is the load-bearing requirement. File existence is a `structural` check, and reporting it as
completion is exactly the elevation [Standard 24](24-validator-rules.md) R2 forbids, arriving through
a project-management surface instead of a validator.

The distinction, concretely:

| Not completion | Completion |
| --- | --- |
| `schemas/project-policy.schema.json` exists | An example policy validates against it, and an invalid one is rejected |
| `standards init` exists | It runs against a fixture, preserves existing files, and emits the expected report |
| Fixture repositories exist | Each produces its expected findings, and the compliant fixture produces none |
| The rule catalog exists | Every entry resolves to a standard, and every enforceable requirement has an entry |

Each right-hand column is a command someone can run. That is the test:
**if a phase's completion cannot be demonstrated by running something, its acceptance criteria are
not yet written** ([Standard 7](07-acceptance-criteria.md)).

Two consequences:

- **A phase with a passing verification but an unmet acceptance criterion is not complete.** Both are
  required, and they answer different questions: the criterion says what must be true, the
  verification says how you know.
- **A partially-built phase reports `IN_PROGRESS`, not `COMPLETE` with caveats**
  ([Standard 8](08-status-tracking.md)). A completed status carrying exceptions in its prose is a
  status nothing downstream can read correctly.

### R4 — Phases are recorded as plan sections

Each phase MUST exist as a section under `artifacts/project-plan-breakdown/`
([Standard 35](35-planning-requirements.md) R2), carrying the six fields
([Standard 35](35-planning-requirements.md) R4) — so a phase's Status, Acceptance Criteria, and
Verification live in the repository rather than in a conversation about it.

A phase list that exists only in a standard is a description of intent. A phase list in the plan
breakdown is something a fresh agent can act on, which is [Standard 5](05-resumability.md)'s whole
purpose.

### R5 — Deferral is recorded, not implied

Where a phase's item is deliberately deferred, the deferral MUST be recorded with the reason
([Standard 8](08-status-tracking.md)'s `DEFERRED`), not left as an absence.

An unbuilt item and a deliberately-not-built item look identical in a repository, and the difference
is the entire content of the decision. This is the same rule [Standard 34](34-dogfooding.md) R3
applies to unmet standards and [Standard 28](28-github-actions.md) R6 applies to omitted CI steps:
**silence is not a classification.**

## Additions this standard makes beyond the source

- R2's dependency table and the ruling that the phase order is a dependency order rather than a
  suggestion — the source offers the phases as *suggested* without saying which orderings are
  actually unsafe.
- R3 in full — evidence-based phase completion, the contrast table, and the test that a phase whose
  completion cannot be demonstrated by running something has no acceptance criteria yet.
- R4's requirement that phases be plan sections rather than only a list in a standard.
- R5 in full.
- The reading that Phase 5 is complete when the *design* exists.

## Relationship to other standards

[Standard 7](07-acceptance-criteria.md) and [Standard 9](09-verification.md) supply the two halves of
R3. [Standard 8](08-status-tracking.md) supplies the status vocabulary R3 and R5 use.
[Standard 35](35-planning-requirements.md) is where R4's sections live.
[Standard 24](24-validator-rules.md) R2 is the general rule R3 applies to phases.
[Standard 38](38-definition-of-done.md) aggregates phase completion into release completion.
Phases 1–5 map onto [19](19-json-schema.md), [21](21-versioning.md), [27](27-rule-catalog.md),
[23](23-standards-validator-cli.md), [29](29-testing.md), [33](33-bootstrap-experience.md),
[28](28-github-actions.md), and [31](31-whatsnext-compatibility.md).

## Implementation

Progress is genuinely non-linear, and R2 explains why that is defensible rather than sloppy.

**Phase 1 — partial.** The standards documentation is the bulk of the work and is 36 of 44 written.
`README` exists. `stable rule IDs` are defined ([Standard 26](26-stable-rule-ids.md)) and their
identity settled ([ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md)) but none are
assigned. `VERSION`, `CHANGELOG`, `rule catalog`, `templates`, `PROJECT.md`, `project-policy.yml`, and
`JSON Schema` do not exist.

**Phase 2 — partial, and out of order.** `scripts/standards.mjs` provides human and JSON output, exit
codes, fixture repositories, and automated tests. It has no rules engine, because Phase 1's catalog
does not exist — so its rules are hardcoded detector functions. This is the dependency in R2 binding
in practice: the validator was built first and now carries an implicit rule set that will have to be
migrated when the catalog lands.

**Phase 3 — not started.** [Standard 33](33-bootstrap-experience.md) is specified; no `init` exists.

**Phase 4 — partial.** Self-validation runs in CI. There is no GitHub Actions example for consuming
projects and no release packaging.

**Phase 5 — partial by design.** Extension points are described across
[Standard 24](24-validator-rules.md) R4 and [Standard 31](31-whatsnext-compatibility.md) rather than
built, which satisfies *do not over-engineer these now*.

**R3 is not currently enforceable here, and R4 is why.** The phases do not exist as plan sections —
`artifacts/project-plan-breakdown/` has three sections, none of them a phase
([Standard 35](35-planning-requirements.md)) — so no phase has recorded acceptance criteria or
verification, and the status above is prose in a standard rather than a state anything can read. That
is the gap worth closing before the next phase of building starts.

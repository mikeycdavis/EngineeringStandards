# Standard 22 — Adoption and Migration

Adopting these standards in an existing repository must be **non-destructive and evidence-preserving**.
A project is not rewritten to look compliant; it is documented as it is, and improved deliberately
from there.

Source: item 22 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to adopting the standards in an existing repository, and to moving a project between
framework versions ([Standard 21](21-versioning.md)). Part of the governance layer with
[20](20-exceptions.md), [21](21-versioning.md), and [23](23-standards-validator-cli.md).

## Requirements

### R1 — The migration flow

A migration flow might be, reproduced verbatim from the source:

```text
1. Add PROJECT.md
2. Add project-policy.yml
3. Add agent bootstrap files
4. Create artifacts/project-plan-breakdown/
5. Create artifacts/adr/
6. Move important planning knowledge out of chat
7. Run standards validator
8. Resolve failures
9. Document exceptions
10. Enable CI enforcement
```

The order is deliberate. Enforcement comes last, after the project can describe itself, has run the
validator, and has recorded which failures it is accepting. Turning on CI enforcement first produces
a red build nobody can fix, and the reliable outcome is that the check gets disabled.

Step 6 is the one that takes real time and the one most often skipped, because it is the only step
that cannot be done by creating a file.

### R2 — Incremental adoption

**Support incremental adoption rather than requiring perfect compliance immediately.**

A project part-way through migration is in a legitimate state, not a failing one. Incremental
adoption is supported by three mechanisms already defined: rule levels
([Standard 18](18-machine-readable-project-policy.md) R3) let a project adopt a rule as `recommended`
before `required`; exceptions with expiry ([Standard 20](20-exceptions.md) R3) record a known gap with
a date to revisit; and a pinned `standardVersion` ([Standard 21](21-versioning.md)) means a new
framework release does not move the target mid-migration.

What incremental adoption is **not** is an indefinite claim of compliance with rules the project does
not meet. The difference is whether the gaps are recorded.

### R3 — Migration is non-destructive and evidence-preserving

**An existing project MUST NOT be rewritten merely to look compliant.**

Adoption adds descriptive artifacts. It does not restructure working code, rename things to match a
convention, or delete history so the repository presents better. Where the implementation departs
from what a standard prescribes, the honest outcomes are an exception, an ADR, or planned work — not
a refactor performed so a validator passes.

Specifically preserved through migration:

- **Existing ADRs**, including superseded and rejected ones. [Standard 11](11-architecture-decision-records.md)
  R5 already forbids deleting them; migration is exactly when someone is tempted, because old ADRs
  predate the standards and look untidy.
- **Approved exceptions**, with their provenance intact ([Standard 20](20-exceptions.md) R2). An
  exception carried into a new version keeps its original `approvedBy` and `date` — re-approving it
  wholesale to look current destroys the record of when the decision was actually made.
- **Existing planning artifacts.** Where a project already has a plan, it is reorganised into the
  required layout, not replaced with a fresh one.
- **Commit history.** Nothing about adoption justifies rewriting it.

The reason is that migration is when a project's record is most fragile: the artifacts are being
touched wholesale, by someone (or something) optimising for a validator turning green.

### R4 — No trustworthy plan means reconstruction, not fabrication

**Where a project reaches step 6 and finds no trustworthy original plan, prompt, or requirements
document, it MUST enter reconstruction under [Standard 44](44-existing-project-reconstruction.md)
rather than write a plan from assumptions.**

This is the most likely place in the whole series for history to be fabricated, and the mechanics
invite it: step 4 creates a plan directory, step 6 says move planning knowledge into it, and if there
is no such knowledge the path of least resistance is to invent a plausible plan and present it as the
project's. That plan is then indistinguishable from a real one to every future reader.

Standard 44 exists for this case. It produces an evidence-based baseline with every claim labelled
`OBSERVED`, `INFERRED`, `CONFIRMED_BY_OWNER`, or `UNKNOWN`, and it forbids the phrasings that assert
historical intent nobody can evidence. Its R0 also applies directly here: the reconstructed plan
describes reality first and keeps recommended changes separate, which is the same non-destructive
principle as R3 above.

Migrating a project with a real plan and migrating one without are different procedures, and a
project SHOULD determine which it is in before step 4 rather than discovering it at step 6.

### R5 — Version migration preserves the same things

Moving between framework versions ([Standard 21](21-versioning.md)) follows R3: exceptions, ADRs, and
planning artifacts carry forward.

A `MAJOR` release requires re-examination rather than re-creation. Where a new `required` rule now
fails, the project records an exception or plans the work; where an existing exception has become
invalid — because its rule was made non-exemptible ([Standard 20](20-exceptions.md) R4) — that is a
real failure to resolve, not a line to delete quietly.

## Additions this standard makes beyond the source

- R3 in full — the non-destructive, evidence-preserving requirement and its enumerated list of what
  survives migration. The source describes the flow without saying what must not be damaged by it.
- R4 in full — routing a missing plan to [Standard 44](44-existing-project-reconstruction.md), and
  the observation that the migration flow's own shape invites fabrication at step 6.
- R5 in full — version migration.
- R1's reasoning about why enforcement is last, and R2's mapping of incremental adoption onto the
  three mechanisms that support it.

## Relationship to other standards

The flow in R1 touches most of the series: [6](06-project-manifest.md) supplies `PROJECT.md`,
[18](18-machine-readable-project-policy.md) the policy, [17](17-agent-instruction-files.md) the
bootstrap files, [4](04-planning-standards.md) the plan layout,
[11](11-architecture-decision-records.md) the ADR directory, [23](23-standards-validator-cli.md) the
validator, and [20](20-exceptions.md) the exceptions recorded at step 9.

[Standard 44](44-existing-project-reconstruction.md) is the procedure for step 6 when there is no
plan to move.

## Implementation

Implemented in part by the **`project-reconstruction`** skill, which is R4's procedure — its Phase 0
makes exactly the determination R4 asks for before step 4: whether the project has a trustworthy plan
or needs reconstruction.

No skill covers the rest of the flow. `standards audit` supports step 7 partially, but because it
does not yet read `project-policy.yml` it cannot perform steps 8 and 9 as written — it reports
findings without knowing which the project has already excepted.

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

### R6 — The framework publishes an adoption guide, and it is a deliverable

**A standards framework MUST publish an operator-facing adoption guide** — a single document telling
a human or agent how to consume it correctly, distinct from the standards themselves.

This is a requirement rather than a nicety because of what its absence costs. A repository of
well-written rules with no adoption guide is complete and unusable: every adopter infers a workflow,
each infers a slightly different one, and the differences surface later as projects that satisfy the
same standards in incompatible ways. **The standards say what compliant work looks like; nothing else
says how to get there.**

The guide MUST cover, at minimum:

- The deterministic **greenfield versus existing-project decision**, and where reconstruction
  ([Standard 44](44-existing-project-reconstruction.md)) becomes mandatory
- How to declare a version, add a policy, and validate it
- How to classify a rule as failing, not-applicable, or excepted
  ([Standard 34](34-dogfooding.md) R3)
- How to interpret validator output and exit codes
- How to upgrade to a newer version
- What not to do

Three constraints on the guide itself:

- **It MUST NOT restate the standards.** It routes to them. A guide that summarises rules becomes a
  second definition that drifts ([Standard 32](32-documentation-quality.md) R4).
- **It MUST document what actually runs**, not what is specified. Where the two differ, the guide
  names the real command and records the discrepancy — a recipe naming a command that does not exist
  is a defect ([Standard 32](32-documentation-quality.md) R3), and adopters discover it at the worst
  possible moment.
- **It MUST state the framework's current limitations.** An adopter who learns from experience that
  the validator does not read their policy has been misled by omission.

**The guide MUST also prohibit copying the standards into the consuming repository.** A copied
standard is a second definition that drifts silently and is only discovered when two projects
disagree about what a rule means — [Standard 37](37-quality-bar.md) R5 at framework scale. Adopters
reference a version and keep only project-specific declarations locally.

## Additions this standard makes beyond the source

- R6 in full — the adoption guide as a required deliverable, its minimum contents, and the three
  constraints on it. The source describes the migration flow without requiring that it be written
  down anywhere an adopter can find it.
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

**R6 is met.** [`INSTRUCTIONS.md`](../INSTRUCTIONS.md) is the adoption guide: eighteen sections, a
minimum adoption recipe, and the greenfield / normalize / reconstruct decision flow as a Mermaid
diagram whose source is [`docs/adoption-flow.mmd`](../docs/adoption-flow.mmd). It routes to the
standards rather than restating them, opens with the prohibition on copying them, and closes with a
table of the tooling's current limitations.

It documents `standards audit` rather than `standards validate`, because that is what ships — the
discrepancy with [Standard 23](23-standards-validator-cli.md) R2 is named in the guide instead of
being papered over. `test/instructions.test.mjs` asserts that every command the guide shows actually
exists, so the recipe cannot rot into a defect under
[Standard 32](32-documentation-quality.md) R3.

[`templates/`](../templates/) supplies what the recipe copies: `project-policy.yml` and `PROJECT.md`.
The policy template is validated by the test suite against the real schema, so a template that would
fail on an adopter's first command cannot be published.

No skill covers the rest of the flow. `standards audit` supports step 7 partially, but because it
does not yet read `project-policy.yml` it cannot perform steps 8 and 9 as written — it reports
findings without knowing which the project has already excepted.

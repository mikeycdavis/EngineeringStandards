# Standard 31 — WhatsNext Compatibility

A contract, not an integration. This standard fixes what an external portfolio tool may rely on, so
that it can be built later without renegotiating anything — and deliberately builds none of it now.

Source: item 31 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **the external consumption contract**. It adds no field the validator layer does not already
define; it declares which of those fields are stable enough to be depended on from outside this
repository, and it forbids repository orchestration from being built here.

The batch rule applies at portfolio scale, where it does the most damage:
**automation may aggregate evidence, but it MUST NOT overstate assurance.** A dashboard row is an
aggregate of an aggregate.

## Requirements

### R1 — Design for the consumer; do not build the consumer

**Design the validator and rule catalog so WhatsNext could later consume them.** WhatsNext should
eventually be able to, reproduced verbatim from the source:

```text
scan multiple repositories

determine declared standard versions

execute validation

ingest JSON results

show compliance scores

show violations by project

recommend remediation

create work items from violations

detect outdated standard versions

propose migrations
```

**Do not build WhatsNext integration now. Just make the contract clean enough that it can be added
later.**

This is a requirement on scope, and it is enforceable: **no multi-repository scanning, scheduling,
aggregation, or work-item creation belongs in this repository.** The validator's unit of work is one
project, invoked once, exiting with a result. Everything in the list above is composition of that
unit by something else.

The reason is not tidiness. A validator that also orchestrates cannot be run from CI without dragging
the orchestration with it, and every orchestration decision made here — how repositories are
discovered, how often, where results are stored — is a decision made without the consumer that has to
live with it.

### R2 — What the contract guarantees

A consumer MAY depend on these, and only these:

| Guaranteed | Source of truth |
| --- | --- |
| Standard version the project declared and was evaluated against | [Standard 21](21-versioning.md); `standardVersion` |
| Project identity | [Standard 6](06-project-manifest.md); `project` |
| Compliance status | [Standard 30](30-compliance-scoring.md) R1; `status` |
| Score | [Standard 30](30-compliance-scoring.md); `score` |
| Assurance / coverage breakdown | [Standard 30](30-compliance-scoring.md) R4; `assurance` |
| Rule IDs | [Standard 26](26-stable-rule-ids.md), [ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md); `results[].ruleId` |
| Violations | [Standard 25](25-validator-output.md) R3; results with `status: failed` |
| Warnings | [Standard 25](25-validator-output.md) R4; `severity: warning` |
| Exceptions applied | [Standard 20](20-exceptions.md); reported per [Standard 23](23-standards-validator-cli.md) R5 |
| Evidence | [Standard 25](25-validator-output.md) R3; `evidence`, `files` |
| Remediation | [Standard 25](25-validator-output.md) R3; `remediation` |
| Envelope format version | [Standard 25](25-validator-output.md) R2; `schemaVersion` |
| Framework release that evaluated the project | [Standard 21](21-versioning.md) R5 and the version-identity guard; `standardVersion` |

Two things this list does *not* include, deliberately:

- **Human-readable output.** It is a presentation surface and may change at any time. A consumer
  scraping it has no contract ([Standard 25](25-validator-output.md) R1).
- **Anything not in the JSON envelope.** Internal file layout, category names, log lines, and exit-code
  detail beyond the three defined values are implementation.

Every entry above already exists in the validator layer. **This standard introduces no new field**,
which is the point: if it needed to, the layer would be incomplete.

### R3 — The contract is versioned, and breaking it is visible

`schemaVersion` is the consumer's compatibility signal and MUST change according to
[Standard 15](15-ai-tool-contracts.md) when the shape changes. A consumer MUST be able to detect an
incompatible envelope by reading one field, before parsing anything else.

`standardVersion` is a different version and answers a different question — *which rules were in
force* — and the two MUST NOT be conflated. A portfolio view needs both: `schemaVersion` tells it
whether it can read the result, `standardVersion` tells it whether two results are comparable.

The source's "detect outdated standard versions" depends entirely on this separation. A consumer
cannot tell a project is behind if the only version it can see is the report format's.

### R4 — Results are correlatable across runs, projects, and versions

Two results are the same finding if they share `project` and `ruleId`. That is the whole join key,
and it is why [ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md) had to be settled before
this standard could be written: a rule with two peer names produces two rows for one violation in
every portfolio view, and no aggregation can recover from it.

Consequences for the validator:

- **`ruleId` MUST be present on every result**, including passes and skips. A consumer cannot compute
  "which rules stopped failing" from failures alone.
- **A deprecated ID MUST still resolve** ([Standard 26](26-stable-rule-ids.md) R3 rule 5), so history
  spanning a rename remains one series rather than two.
- **Aliases MUST NOT appear in output** ([ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md)).
  A consumer joining on a name that varies by input file has no join key at all.

**Identity is not comparability, and comparability has two parts.** The join key answers *are these
the same rule?* A consumer computing a regression is claiming more than that: that both readings
measured the same thing. Two distinct questions decide it, and they have different answers.

**Observable evaluation context — what the run reports about how it evaluated.** `level` is the
project's declaration, overriding the catalog wherever the policy names a rule. `disposition` is how
the result was reached, and `validationType` and `assurance` follow it rather than the catalog: an
attested result reports `manual-review` and `full` whatever the catalog says, and a skipped result
reports `none`. A consumer MUST read these as evaluation context and MUST NOT read a change in them
as a change in what the rule means. A rule moving from `not-evaluated` to `attested`, or from
`evaluated` to `not-applicable`, is a real and reportable transition in the project's own state;
presenting it as a regression or as a remediation misattributes it to code that did not move.

**Equality of those fields does not establish that the context was the same.** They are what the run
reports, not the whole of what it consumed. Two runs may agree on every one of them while evaluating
different policy content, different evidence, or a different set of files, and nothing in the
envelope distinguishes those cases. A consumer MAY use a change in them as positive evidence that
the context moved; it MUST NOT use their equality as evidence that the context held.

**Rule-semantic comparability — did the rule mean the same thing?** This is **not** establishable
from the envelope. `severity` is the only rule-semantic value carried, and it is the smallest part of
what a rule means. A rule's description, remediation, assurance note and detector may all change
while the framework release, the join key, and every field above are identical — and when they do,
two readings can differ in what they measured while nothing a consumer can join on differs at all.

`standardVersion` is **necessary and insufficient**. A validator MUST refuse to emit a verdict
labelled with a version that did not produce it ([Standard 21](21-versioning.md) R5), so equal
`standardVersion` establishes that one framework release produced both readings and nothing further:
detectors and catalog content change within a release. Where `standardVersion` differs, the readings
were produced by different releases and MUST NOT be presented as one series; this is the same
prohibition R6 applies to averaging scores, applied to the comparison rather than to the aggregate.

**A consumer MUST therefore treat rule-semantic comparability as `unknown`, and MUST disclose it** —
on successful comparisons as well as refused ones. It MUST NOT infer it from a rule count, a coverage
figure, a message, a remediation string, or a checkout on disk. A wrong inference restores confidence
in exactly the comparison that should not be trusted, and a consumer that declines to assert a
regression it cannot ground is behaving correctly, not incompletely.

**The prerequisite is producer-side and is deliberately not defined here.** Establishing rule-semantic
comparability requires an identity for the evaluating rule set at finer granularity than the release,
issued by the validator. [Standard 25](25-validator-output.md) R2 owns the envelope and is where such
a field belongs; this standard introduces no field, and will cite that one when it exists. Until then
`unknown` is the honest contract, and saying so is what stops a consumer inventing a basis the
producer never supplied.

### R5 — Work items derive from findings; findings never derive from work items

Where a consumer creates work items from violations, the finding is the source and the work item is
the copy. The validator MUST NOT read a tracker, and a work item's state MUST NOT affect a result.

This is the same one-direction rule [Standard 8](08-status-tracking.md) applies to plan items and
backlogs, for the same reason: liveness tracked in two places diverges, and the divergence is silent.
A closed work item does not make a rule pass — only a passing rule does.

`remediation` is what makes a generated work item useful, and its absence is what makes it dangerous:
an agent handed a failure with no remediation will invent one, and an invented fix is as likely to
satisfy the check as to satisfy the requirement.

### R6 — A portfolio view MUST carry assurance through

**An aggregate across projects MUST NOT present a score without the assurance breakdown that
qualifies it** ([Standard 30](30-compliance-scoring.md) R4).

This is where the batch rule finally bites. A single project's report can be read carefully. A table
of forty projects sorted by score will be read as a ranking, and a project that scores 98% on twelve
automated rules will outrank one scoring 91% on sixty. Without coverage alongside, the ranking
rewards having fewer checks — the exact opposite of what it appears to measure.

Averaging scores across projects evaluated under different `standardVersion` values, or with
different denominators, MUST NOT be presented as a portfolio compliance figure
([Standard 30](30-compliance-scoring.md) R5). Those numbers were never measuring the same thing.

## Additions this standard makes beyond the source

- R2's guarantee table and, equally, the explicit non-guarantees. The source lists what WhatsNext
  should do without saying what it may depend on.
- R1's ruling that the scope constraint is enforceable — no orchestration in this repository — rather
  than a note about sequencing.
- R3's separation of `schemaVersion` from `standardVersion`, and why "detect outdated standard
  versions" requires it.
- R4's join key and its three consequences, and R4's separation of identity from comparability — the
  observable evaluation context, the ruling that equality of those fields proves nothing about the
  context that produced them, and rule-semantic comparability as an explicitly `unknown` disposition
  pending a producer-issued rule-set identity. The source asks for correlation and does not reach the
  question of whether two correlated results may be compared.
- R5 in full — the one-direction rule between findings and work items.
- R6 in full — carrying assurance into portfolio aggregates, and the ranking failure it prevents.

## Relationship to other standards

[Standard 25](25-validator-output.md) defines the envelope this contract is drawn from.
[Standard 30](30-compliance-scoring.md) supplies `status`, `score`, and `assurance`.
[Standard 26](26-stable-rule-ids.md) and [ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md)
supply the join key. [Standard 27](27-rule-catalog.md) is what a consumer resolves a `ruleId` against.
[Standard 21](21-versioning.md) supplies `standardVersion` and the migrations R1 defers.
[Standard 15](15-ai-tool-contracts.md) governs how this contract may change.
[Standard 28](28-github-actions.md) R3 is how a result reaches a consumer at all.

## Implementation

**The consumer is not implemented, and correctly so** — R1 forbids building it here. What this
section tracks is the other half: whether the contract R2 promises can be honoured. As of 2.0.0 it
can be, and a consumer may be built against it now.

`standards validate --json` emits the [Standard 25](25-validator-output.md) envelope assembled by
`scripts/compliance.mjs`:

```json
{
  "schemaVersion": "1.0",
  "standardVersion": "2.0.0",
  "project": "example",
  "status": "COMPLIANT",
  "score": 100,
  "summary":  { "passed": 0, "failed": 0, "warnings": 0, "skipped": 0 },
  "assurance": { "automated": 0, "manualReview": 0, "notEvaluated": 0 },
  "denominator": { "total": 0, "applicable": 0, "scored": 0, "basis": "..." },
  "frameworkCoverage": { "...": "framework maturity, never this project's compliance" },
  "auditedAt": "…",
  "results": [{
    "ruleId": "architecture.adr", "status": "failed", "severity": "error", "level": "required",
    "validationType": "structural", "assurance": "partial", "disposition": "evaluated",
    "message": "…", "evidence": [], "files": [], "remediation": "…"
  }]
}
```

All twelve R2 guarantees are present. `ruleId` is canonical and appears on every result including
passes and skips, so R4's join key holds and "which rules stopped failing" is computable from two
reports. Exceptions and attestations are carried on the results they apply to, via `disposition`.

Two cautions for a consumer, both about honesty rather than availability:

- **`score` is meaningless when `status` is `NOT_EVALUATED`.** A project with no `project-policy.yml`
  has declared no applicability, so its score is arithmetic over an undefined denominator. Read
  `status` first and withhold the number, per R6's reasoning.
- **`frameworkCoverage` is not compliance.** It reports how much of the framework has been turned
  into rules. Surfacing it beside `score` in the same column would compare a project against the
  tool's own maturity.

**The delivery mechanism is still missing.** [Standard 28](28-github-actions.md) R3 asks CI to
preserve the JSON as an artifact; this repository's own `.github/workflows/ci.yml` runs
`npm run validate`, which emits the human report and keeps nothing. Until that is fixed, a consumer
must invoke the validator itself rather than collect reports CI already produced — which works, but
means every consumer needs a checkout.

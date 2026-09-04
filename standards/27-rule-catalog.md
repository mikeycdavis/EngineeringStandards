# Standard 27 — Rule Catalog

The machine-readable registry that ties the validator layer together. **The catalog is the source of
machine truth; the Markdown standards are the explanatory surface.** Neither is a copy of the other.

Source: item 27 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines the **registry**. Completes the validator layer with [24](24-validator-rules.md) (definition),
[25](25-validator-output.md) (reporting), and [26](26-stable-rule-ids.md) (identity).

## Requirements

### R1 — Create the catalog

Create a machine-readable rule catalog, for example:

```text
rules/
```

with YAML or JSON definitions.

### R2 — Rule fields

Each rule should ideally contain, reproduced verbatim from the source:

```text
id
title
description
category
severity
level
rationale
validationType
remediation
introducedIn
```

The source's example:

```yaml
id: planning.acceptance-criteria
title: Plan items require acceptance criteria
category: planning
level: required
severity: error
validationType: document
introducedIn: 1.0.0
description: >
  Executable plan sections must define observable completion criteria.
remediation: >
  Add an Acceptance Criteria section to the plan artifact.
```

This standard adds five fields, disclosed below — `assurance`, `nonExemptible`, `standard`,
`aliases`, and the lifecycle trio:

```yaml
id: audit.actor-attribution
title: Mutations require actor attribution
category: auditing
level: required
severity: error
validationType: code-analysis
assurance: partial
introducedIn: 1.0.0
nonExemptible: false
standard: 3
aliases: []
description: ...
rationale: ...
remediation: ...

deprecatedIn:
supersededBy:
removedIn:
```

| Added field | Why |
| --- | --- |
| `assurance` | What the check can actually claim — `full`, `partial`, or `none`. Enforces [Standard 24](24-validator-rules.md) R2 as data rather than discipline |
| `nonExemptible` | Whether an exception may be written against it ([Standard 20](20-exceptions.md) R4). A property of the rule, not of any project |
| `standard` | The standard number the rule comes from, so a result can link to the prose |
| `aliases` | Superseded spellings accepted on read and resolved to the canonical `id` ([ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md)). Never emitted; removing one is `MAJOR` |
| `deprecatedIn`, `supersededBy`, `removedIn` | Lifecycle ([Standard 26](26-stable-rule-ids.md) R4) |

**The lifecycle fields are present from the first release even when empty.** Adding them later means
every existing rule silently lacks them, and consumers written against the earlier shape treat their
absence as meaningful.

### R3 — `validationType` and `assurance` are separate claims

`validationType` says what *kind* of rule this is. `assurance` says what the **current
implementation** can actually establish. They are not the same, and conflating them is how false
green compliance happens.

A rule may legitimately be catalogued as `code-analysis` while the validator reports it as
`manual-review` or `not-evaluated`, because no analyzer exists yet
([Standard 24](24-validator-rules.md) R4). The catalog describes the rule's nature; `assurance`
records the honest present state:

| `assurance` | Means |
| --- | --- |
| `full` | The check establishes the requirement |
| `partial` | The check establishes something weaker — files exist, a section is present |
| `none` | Nothing mechanical; the rule is catalogued but evaluated by a human |

`audit.actor-attribution` with `validationType: code-analysis` and `assurance: partial` is an honest
entry: the rule is about behaviour, and today the validator can only see whether audit infrastructure
exists. Setting it to `full` because the structural check passes is exactly the elevation
[Standard 24](24-validator-rules.md) R2 forbids.

### R4 — One canonical definition, no drift

**The Markdown standards documentation and the validator should derive from or reference the same
canonical rule IDs. Avoid having unrelated duplicated definitions drift apart.**

The division of labour:

| Concern | Lives in |
| --- | --- |
| Rule identity, level, severity, type, assurance, lifecycle | The catalog |
| What the rule means, why it exists, how to satisfy it | The standard document |
| What a run found | Validator output ([Standard 25](25-validator-output.md)) |

The standard document is where a human understands a rule; the catalog is where a machine resolves
it. Each rule's catalog entry names its `standard`, and a standard's requirements are the prose
behind its rules. Neither restates the other's content, so neither can drift from it.

**A mechanical check SHOULD enforce this**: every catalog `standard` reference resolves to a document
that exists, and every enforceable requirement in a standard has a catalog entry. This is the same
class of invariant as `scripts/inventory.mjs`, which exists because a hand-maintained count of the
standards silently went wrong.

### R5 — The catalog is versioned with the framework

`introducedIn`, `deprecatedIn`, and `removedIn` are framework versions
([Standard 21](21-versioning.md)). Adding a `required` rule is `MAJOR`; adding a `recommended` one is
`MINOR`; removing any rule is `MAJOR`.

A validator resolving a project's declared `standardVersion` MUST evaluate against the rules in force
in *that* version — a rule with `introducedIn: 2.0.0` does not apply to a project pinned at `1.0.0`.
Without this the version pin means nothing, which is the failure
[Standard 21](21-versioning.md) R5 describes.

### R6 — Remediation MUST NOT assume repository state the producer has not established

A rule's `remediation` is executed by someone — or something — that trusts it.
[Standard 25](25-validator-output.md) R3 already says why the field matters: the consumers are CI
and agents, and *"an agent given a failure with no remediation will invent one."* An agent given a
**confidently wrong** one does not invent anything. It complies.

Three constraints, and they are separable because they fail separately.

**Remediation MUST NOT prescribe an action whose safety or ordering depends on repository state the
producer has not established.** A repair that is correct in one state and destructive in another is
not a repair; it is a coin toss the reader cannot see they are making.

**Where a prerequisite is knowable but not established, remediation MUST express it conditionally
rather than imply it is satisfied.** *"Do X"* asserts that nothing has to happen first. When
something might, the conditional form — *"if P, do Y first; otherwise do X"* — is true in every
state, so it neither withholds the advice nor smuggles in a claim about which state holds.

**Remediation MUST NOT fabricate repository state in order to be more specific.** Specificity bought
by guessing is the failure
[ADR 0008](../artifacts/adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)
names, arriving through the remediation rather than the finding. A producer that *has* measured the
state may narrow the advice on it; one that has inferred the state has measured nothing.

**Two kinds of ordering, and only one of them is this requirement's subject.** Ordering internal to a
single repair — *"replace the value, then rotate the credential"*, *"confirm reachability, then
delete"* — is knowable from the rule alone and is unaffected here. This requirement governs ordering
that depends on the *state of the repository being remediated*, which the rule cannot know and the
producer may not have looked at.

**This introduces no field and no envelope change**, which is the point. The constraint is on what a
catalog author may write in `remediation`, not on its shape, so a consumer of
[Standard 25](25-validator-output.md) R3 sees the same contract it always did. A requirement needing
a new field here would be describing a different problem.

## Additions this standard makes beyond the source

- The `assurance` field and R3's separation of it from `validationType` — the mechanism that makes
  [Standard 24](24-validator-rules.md) R2 data rather than discipline.
- `nonExemptible`, `standard`, and `aliases` fields — the last carrying
  [ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md)'s resolution of the policy-key /
  rule-ID mismatch.
- The lifecycle trio, and the rule that they exist from the first release even when empty.
- R4's division-of-labour table and the mechanical check.
- R5 in full — that rules are evaluated against the version in force for the project.
- R6 in full. The source specifies that a rule carries remediation; it does not constrain what the
  remediation may assume about the repository it is aimed at. The failure it prevents was produced
  by this framework's own catalog after the source was written — see the Implementation note.

## Relationship to other standards

[Standard 26](26-stable-rule-ids.md) governs the `id` field and its lifecycle;
[Standard 24](24-validator-rules.md) supplies `validationType` and the assurance rule;
[Standard 25](25-validator-output.md) results carry the `ruleId` this catalog defines;
[Standard 20](20-exceptions.md) reads `nonExemptible`; [Standard 21](21-versioning.md) supplies the
versions; [Standard 18](18-machine-readable-project-policy.md) policy keys must reconcile with these
ids, per [Standard 26](26-stable-rule-ids.md) R5.

## Implementation

**Implemented.** `rules/` holds fourteen JSON files, one per category group, carrying 50 rules. Every entry
declares `id`, `title`, `standard`, `category`, `level`, `severity`, `validationType`, `assurance`,
`nonExemptible`, `introducedIn`, `description`, `rationale`, `remediation`, `aliases`, and the
lifecycle trio — the last three present and null rather than absent, per R2.

`scripts/catalog.mjs` loads it and **throws rather than loading partially**: a catalog that silently
dropped a malformed entry would shrink the denominator every score is computed over. It validates
every enum, every required field, and the presence of the lifecycle trio at load time.

R3's substantive constraint — that a rule may not claim `full` assurance from a `manual-review` or
`code-analysis` validation type — is asserted in `test/compliance.test.mjs` rather than at load time.
That placement is deliberate: it is a statement about how the catalog was *authored*, checkable once
in CI, not a condition to re-verify on every audit run.

**R4 is enforced by `assertBindings`.** Every rule id the evaluator reports against must exist in the
catalog, checked on every audit run and asserted in `test/compliance.test.mjs`. This is the guard on
the architectural rule the whole compliance system rests on: *the catalog defines rule identity and
metadata, the policy defines project applicability, the evaluator produces evidence, and none of the
three may redefine the others.* Without it an evaluator grows its own vocabulary one detector at a
time — which is exactly how the audit came to speak in finding categories while the policy spoke in
rule ids.

A further check asserts every catalog `standard` reference resolves to a document that exists. The
converse — every enforceable requirement having a catalog entry — is **not** checked, and the catalog
does not claim to cover all 53 standards. It covers what the evaluator and the policy speak in.

**R6 was written from a measured specimen, not from principle.**
`planning.breakdown-directory` emitted *"Run /plan-structure and /plan-handoff…"* byte-identically
in two repository states that `scripts/init.mjs` itself distinguishes — one where that is the whole
repair, and one where `init`'s own next step reads *"Do NOT author a plan as though this project were
starting now."* Following it in the second state moved the repository from `reconstruction-required`
to `existing-with-plan`, whose next step is to *preserve* the plan just written, and the finding that
prompted it changed to `passed`. The advice erased the evidence that it had been wrong.

Neither `audit` nor `validate` computes the repository's mode — `detectMode` has one caller, in
`init` — so the fix could not be state-conditional text without giving a detector a dependency on an
inferred classification of intent. Both remediations are conditional and claim no branch;
`test/remediation-state.test.mjs` holds them to it in both states, and asserts that no detector
acquired that dependency.

**That gap is now a reported metric rather than a footnote.** `coverage()` emits
`frameworkCoverage` alongside every verdict — catalogued rules, evaluated rules, standards with
rules, and standards *fully machine-represented* — and the audit prints it. Today: 50 rules across 23
of 53 standards, 6 fully represented.

`fullyMachineRepresentedStandards` is deliberately strict: a standard counts only when **every** rule
it contributes is evaluated *and* carries assurance above `none`. A looser definition would let the
number rise by cataloguing rules nothing checks, which would make the metric reward the appearance of
coverage over the fact of it.

It is emitted **outside** the verdict and never combines with the score
([Standard 30](30-compliance-scoring.md) R3). A coverage improvement must not be able to read as a
compliance improvement — that is the same elevation [Standard 24](24-validator-rules.md) R2 forbids,
one level up. A test asserts `frameworkCoverage` is absent from the verdict object and that supplying
it does not alter the score.

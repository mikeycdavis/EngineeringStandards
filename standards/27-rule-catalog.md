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

This standard adds four fields, disclosed below — `assurance`, `nonExemptible`, `standard`, and the
lifecycle trio:

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

## Additions this standard makes beyond the source

- The `assurance` field and R3's separation of it from `validationType` — the mechanism that makes
  [Standard 24](24-validator-rules.md) R2 data rather than discipline.
- `nonExemptible` and `standard` fields.
- The lifecycle trio, and the rule that they exist from the first release even when empty.
- R4's division-of-labour table and the mechanical check.
- R5 in full — that rules are evaluated against the version in force for the project.

## Relationship to other standards

[Standard 26](26-stable-rule-ids.md) governs the `id` field and its lifecycle;
[Standard 24](24-validator-rules.md) supplies `validationType` and the assurance rule;
[Standard 25](25-validator-output.md) results carry the `ruleId` this catalog defines;
[Standard 20](20-exceptions.md) reads `nonExemptible`; [Standard 21](21-versioning.md) supplies the
versions; [Standard 18](18-machine-readable-project-policy.md) policy keys must reconcile with these
ids, per [Standard 26](26-stable-rule-ids.md) R5.

## Implementation

**Not implemented.** This repository has no `rules/` directory. `scripts/standards.mjs` carries its
rules implicitly, as detector functions with hardcoded ids, severities, and messages.

This is the largest remaining structural gap in the validator layer, and it is what would turn the
tool from an auditor with opinions into an implementation of a declared catalog. It should not be
built by transcribing the current detectors — several of them are finding *categories* rather than
rules, and the reconciliation [Standard 26](26-stable-rule-ids.md) R5 describes has to happen first.

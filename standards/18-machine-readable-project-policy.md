# Standard 18 — Machine-Readable Project Policy

`project-policy.yml` is a project's **declared compliance and configuration surface**: which standard
version it follows, which requirements it applies at which level, and which exceptions it has taken.
It selects and configures standards. It never redefines them.

Source: item 18 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to any project declaring compliance with this standards series. Part of the
policy-as-configuration group with [16](16-security.md), [17](17-agent-instruction-files.md), and
[19](19-json-schema.md) — this standard defines the declaration, and Standard 19 makes it fail
deterministically when wrong.

## Requirements

### R1 — Policy selects and configures; it does not redefine

**A project policy MAY select, configure, and apply standards, and MAY declare exceptions. It MUST
NOT redefine what a standard means.**

This is the load-bearing rule of this standard. Permitted — the project declares how a requirement
applies to it:

```yaml
standardVersion: "1.0.0"

ai:
  providerNeutral: required
```

Not permitted — the project redefines the requirement's meaning:

```yaml
ai:
  providerNeutral:
    meaning: "Only OpenAI is allowed"   # NOT ALLOWED
```

The second is not a configuration; it is a fork of the standard wearing a policy file's clothes. It
would make `providerNeutral: required` mean different things in different repositories, which
destroys the only thing a shared standard provides — that a compliance claim means the same
everywhere.

Where a project genuinely cannot meet a requirement, or must meet a different one, the mechanisms are:

- **an exception** (R4), which records that the requirement is *not* met and why; or
- **an ADR** under [Standard 11](11-architecture-decision-records.md), for a project-specific
  architectural decision — the source's own list names "significant deviations from engineering
  standards" as ADR-worthy.

Both leave the standard's meaning intact and make the divergence visible. A redefinition hides it.

### R2 — Declare the standard version

A policy MUST declare the standard version it follows:

```yaml
standardVersion: "1.0.0"
```

This is what [Standard 17](17-agent-instruction-files.md) R3 has an agent read before reading any
standard document — without it, an agent cannot know which text applies.

### R3 — Rule levels

Support rule levels, reproduced verbatim from the source:

```text
required
recommended
optional
forbidden
```

| Level | Meaning | On violation |
| --- | --- | --- |
| `required` | Must hold; the project claims compliance with it | Fail |
| `recommended` | Should hold; departure is a considered choice | Warn |
| `optional` | May hold; no expectation either way | Silent |
| `forbidden` | Must not hold | Fail |

`forbidden` is not merely `required` inverted, and both are needed: `secretsInArtifacts: forbidden`
([Standard 16](16-security.md)) states a prohibition directly, where phrasing it as a requirement
would need a double negative no reader parses correctly.

**A policy MUST NOT weaken a level the standard states as absolute.** `secretsInArtifacts` may not be
set to `recommended`.

### R4 — Exceptions are structured, not implied

A policy SHOULD support project-specific exceptions. An exception MUST record what is excepted, why,
and — where the divergence is meant to be temporary — until when.

```yaml
exceptions:
  - rule: ai.providerNeutral
    level: recommended        # the level this project applies instead
    reason: >-
      Provider-specific streaming semantics are load-bearing for the editor UI; abstracting
      them would remove the feature.
    adr: artifacts/adr/0007-accept-provider-coupling.md
    expires: 2027-01-01
```

An exception is a **declaration that a requirement is not met**, which is exactly why it must be
explicit: it keeps the standard's meaning and makes the gap countable. Silently setting a `required`
rule to `optional` achieves the same practical outcome while hiding it, and a policy that does so is
using the mechanism R1 prohibits.

### R5 — The policy shape

The initial shape, reproduced from the source, which invites improvement — this standard keeps the
structure and the key names, and its additions are disclosed below:

```yaml
standardVersion: "1.0"

planning:
  runPlanStructure: true
  runPlanHandoff: true
  breakdownDirectory: artifacts/project-plan-breakdown
  oneFilePerSection: true
  requireAcceptanceCriteria: true
  requireVerificationSteps: true
  artifactsCanonicalOverChat: true

auditing:
  businessStateChanges: required
  actorAttribution: required
  correlationId: required
  beforeAfterState: recommended

ai:
  uiCapabilitiesMustBeAgentOperable: true
  providerNeutral: true
  proposeExecuteSeparation: true
  destructiveActionsRequireApproval: true
  structuredErrors: true
  structuredResults: true

architecture:
  requireProjectManifest: true
  adrDirectory: artifacts/adr
  requireAdrForMajorDecisions: true

verification:
  requiredBeforeCompletion: true

security:
  secretsInArtifacts: forbidden
```

Each section maps to standards: `planning` → [4](04-planning-standards.md) and
[7](07-acceptance-criteria.md); `auditing` → [3](03-auditing.md); `ai` → [1](01-human-and-ai-operability.md),
[2](02-propose-vs-execute.md), [12](12-structured-errors.md), [14](14-structured-results.md);
`architecture` → [6](06-project-manifest.md) and [11](11-architecture-decision-records.md);
`verification` → [9](09-verification.md); `security` → [16](16-security.md).

**A policy key MUST correspond to a requirement in a standard.** A key that configures nothing is
either a standard nobody wrote or a setting nothing reads; both are defects, and
[Standard 19](19-json-schema.md) is what catches them.

**A policy key is a rule ID.** Per [ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md), the
key path dot-joined MUST equal the canonical rule ID from
[Standard 26](26-stable-rule-ids.md) R1 — so `ai.providerNeutral` above is canonically
`ai.provider-neutral`, and `ai.uiCapabilitiesMustBeAgentOperable` is `ai.non-ui-capabilities`:

```yaml
ai:
  non-ui-capabilities: required
  provider-neutral: required
  propose-execute: required
```

The camelCase spellings shown here and in the source are **aliases**, recorded in the catalog
([Standard 27](27-rule-catalog.md)), accepted on read with a warning, and never emitted. There is no
separate policy-key namespace: one name, used by the policy, the exception, the catalog, the result,
and every external consumer.

### R6 — Boolean or level, but consistently

The source's shape mixes booleans (`providerNeutral: true`) with levels
(`businessStateChanges: required`). A policy SHOULD prefer **levels** wherever a rule can be partially
adopted, reserving booleans for genuinely binary settings such as a directory being used or not.

`true` cannot express "recommended", so a boolean rule has no way to record a considered partial
adoption and forces a project into either a false compliance claim or an exception it does not need.
Where a schema accepts both for compatibility, `true` maps to `required` and `false` to `optional` —
never to `forbidden`, which is a different claim entirely.

## Additions this standard makes beyond the source

- R1 in full — the select-and-configure versus redefine distinction, and the routing of genuine
  divergence to exceptions or ADRs. The source describes the policy format without stating this
  boundary, and it is the rule that keeps a shared standard shared.
- R3's table of what each level does on violation, and the rule that a level stated as absolute may
  not be weakened.
- R4's exception structure and the reasoning that an exception must be explicit rather than achieved
  by lowering a level.
- R5's mapping of policy sections to standards, the rule that every key must correspond to a
  requirement, and the ruling that a policy key *is* a rule ID
  ([ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md)). The source's own camelCase keys
  become aliases; this is a departure from source text, disclosed here rather than presented as it.
- R6 in full.

## Relationship to other standards

[Standard 19](19-json-schema.md) validates this file and is what makes an invalid or unknown value
fail rather than be ignored. [Standard 17](17-agent-instruction-files.md) R3 has agents read it
second, immediately after the manifest. [Standard 16](16-security.md) supplies the security
constraints it declares. [Standard 11](11-architecture-decision-records.md) is where a divergence
too substantial for an exception belongs.

## Implementation

**No skill implements this standard.**

`standards audit` does not read `project-policy.yml` today. Doing so is the single largest available
improvement to that tool: a policy declaring which rules a project has adopted is exactly the input
an audit needs to stop guessing which findings matter, and it would let a repository's own
declaration decide whether a finding is a violation or an accepted state.

# Standard 3 — Auditing

Meaningful business-state changes should be auditable, and an AI agent's actions should be
attributable to the same standard as a human's. A system that cannot say who changed something, when,
and to what, cannot answer the questions that matter after an incident.

Source: item 3 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to any project holding business state that changes over time. A stateless tool, or one whose
only state is a cache that can be discarded without consequence, is out of scope by the core rule
below rather than by exemption.

## Requirements

### R1 — The core rule

Reproduced verbatim from the source:

> All business-relevant state changes should be auditable. Derived, transient, cached, or serialized
> metadata may be excluded when it can safely be reconstructed and has no compliance, security,
> operational, historical, or business-decision value.

The source supplies this test, also verbatim:

> If changing a value could affect what a user sees, what the system decides, what an AI agent does,
> money, permissions, compliance, or the historical truth of the application, the change should
> normally be auditable.

The exclusion is narrow and conjunctive: data is excludable only when it can **safely be
reconstructed** *and* has **none** of those five kinds of value. Data that is merely inconvenient to
audit does not qualify.

### R2 — Event contents

Auditable events SHOULD normally include:

```text
entityType
entityId
action
actorType
actorId
timestamp
before
after
reason
correlationId
requestId
source
```

**Not every field must be required in every situation**, but a project MUST define sensible minimum
requirements — that is, it must decide and record which fields are mandatory for it, rather than
leaving the question open per call site.

### R3 — Actor types

Actor types SHOULD accommodate:

```text
USER
AI_AGENT
SYSTEM
SCHEDULED_JOB
API_CLIENT
ADMIN
INTEGRATION
```

**AI actions MUST be attributable to the same standard as human actions.** An agent's change recorded
as `SYSTEM`, or with no actor at all, defeats the purpose of the distinction: the resulting history
cannot answer whether a person or a model made a decision.

### R4 — AI decision context

Where useful, retain:

- AI provider
- model identifier
- tool/capability invoked
- policy version
- relevant decision inputs
- resulting action

This is deliberately qualified. **Storing giant raw prompts forever is not required**, and doing so
conflicts with R5. Retain what makes a decision reconstructible — which model, under which policy,
invoked what — rather than the whole conversation that produced it.

### R5 — Audit logs MUST NOT leak secrets

Sensitive information and secrets **MUST NOT be unnecessarily copied into audit logs**.

This constrains R2 directly: `before` and `after` on an entity holding a credential, a token, or
personal data must record that the value changed without reproducing it. An audit log is typically
retained longer, read more widely, and exported more often than the store it describes, so a secret
copied into it outlives and outspreads the original.

## Additions this standard makes beyond the source

- The observation in R1 that the exclusion is *conjunctive* is an interpretation of the source's
  wording, made explicit because reading it disjunctively would exempt almost anything.
- R3's statement about `SYSTEM` attribution defeating the purpose is an explanation, not a source
  rule.
- R5's reasoning about audit-log lifetime and exposure is this standard's justification for the
  source's prohibition.

## Relationship to other standards

An `AI_AGENT` actor under R3 will normally be invoking a capability classified under
[Standard 2](02-propose-vs-execute.md). The `execute` and `privileged execute` tiers there require
auditing under this standard, and the approving human for a privileged action is itself an auditable
fact.

## Implementation

**No skill implements this standard.** It constrains application design.

`standards audit` reports `missing-audit-infrastructure`, but that finding is about test and CI
coverage — it does not inspect whether an application writes audit events, which fields they carry,
or whether secrets reach them. Conformance is established by review.

# Standard 12 — Structured Errors

A failure an agent cannot classify is a failure it cannot respond to. Structured errors say what went
wrong, whether retrying could help, and whether a human needs to approve something — in fields, not
in prose.

Source: item 12 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to AI-operable APIs and to any capability in the non-UI layer required by
[Standard 1](01-human-and-ai-operability.md).

This is the first of four standards — 12, 13, 14, and 15 — that together define the baseline contract
for an AI-callable capability. The shared rule they all serve is stated below and referenced by the
other three.

## The machine-interface contract

**Machine-facing contracts must be deterministic enough that both a human and an agent can reason
about retries, failures, and next actions without guessing.**

This is only achievable if the four standards line up rather than being designed independently. The
fields they define are a single surface:

| Concern | Field | Defined by | Must agree with |
| --- | --- | --- | --- |
| What went wrong | `code` | Standard 12 | The `status` a failed result reports ([Standard 14](14-structured-results.md)) |
| Whether to retry | `retryable` | Standard 12 | Whether the operation is safe to repeat ([Standard 13](13-idempotency.md)) |
| Whether a human must act | `requiresApproval` | Standard 12 | `requiresHumanApproval` in results ([Standard 14](14-structured-results.md)) and the capability's tier ([Standard 2](02-propose-vs-execute.md)) |
| How to retry safely | idempotency key / command id | [Standard 13](13-idempotency.md) | `retryable: true` — a retryable non-idempotent operation is a contradiction |
| What happened | `status`, `entityId`, `warnings` | [Standard 14](14-structured-results.md) | The error codes the same capability can return |
| What may happen next | `nextPossibleActions` | [Standard 14](14-structured-results.md) | Capabilities that actually exist in the tool schema ([Standard 15](15-ai-tool-contracts.md)) |
| The shape of all of it | versioned schema | [Standard 15](15-ai-tool-contracts.md) | Every field above |

A capability that reports `retryable: true` for an operation with no idempotency mechanism, or
`nextPossibleActions` naming a tool that does not exist, satisfies each standard read alone and fails
the contract read together. **The alignment is the requirement.**

## Requirements

### R1 — Errors are structured and machine-readable

AI-operable APIs SHOULD prefer structured machine-readable errors over prose messages.

The recommended shape, reproduced from the source:

```json
{
  "code": "DEPENDENCY_BLOCKED",
  "message": "Release cannot proceed because database migration validation failed.",
  "retryable": false,
  "requiresApproval": false,
  "details": {}
}
```

`message` is for humans; every other field is for machines. An error whose only content is a
`message` forces an agent to parse English to decide what to do, which it will do badly and
inconsistently.

### R2 — Error categories

Recommended error categories, reproduced verbatim from the source:

```text
VALIDATION_FAILED
AUTHENTICATION_REQUIRED
PERMISSION_DENIED
NOT_FOUND
CONFLICT
DEPENDENCY_BLOCKED
REQUIRES_APPROVAL
RATE_LIMITED
TEMPORARILY_UNAVAILABLE
INTERNAL_ERROR
```

A project MAY extend this set; it SHOULD NOT redefine these codes to mean something else, because a
shared code that means different things in different services is worse than no shared code at all.

### R3 — `retryable` states a fact about the operation

`retryable` MUST describe whether repeating the identical call could succeed — not whether the caller
is permitted to try.

The defaults implied by R2's categories:

| Code | `retryable` | Why |
| --- | --- | --- |
| `RATE_LIMITED`, `TEMPORARILY_UNAVAILABLE` | `true` | The condition is transient by definition |
| `INTERNAL_ERROR` | `true` only if the operation is idempotent — see [Standard 13](13-idempotency.md) | A retry after an unknown partial failure can duplicate an effect |
| `VALIDATION_FAILED`, `NOT_FOUND`, `PERMISSION_DENIED`, `AUTHENTICATION_REQUIRED` | `false` | The identical call will fail identically until something else changes |
| `CONFLICT`, `DEPENDENCY_BLOCKED`, `REQUIRES_APPROVAL` | `false` | Something must change first; retrying is a busy-wait |

An agent told `retryable: true` will retry, often immediately and repeatedly. Marking a
non-idempotent failure retryable is how one duplicate charge becomes six.

### R4 — `requiresApproval` is a routing instruction

`requiresApproval: true` tells the caller the operation is not merely refused but *pending a human
decision*. It MUST correspond to the capability's tier under
[Standard 2](02-propose-vs-execute.md) — `execute` or `privileged execute` — and to
`requiresHumanApproval` in any result the same capability returns
([Standard 14](14-structured-results.md)).

An agent receiving this SHOULD request approval rather than retry. A `PERMISSION_DENIED` with
`requiresApproval: false` says *you may not*; `REQUIRES_APPROVAL` with `requiresApproval: true` says
*not yet, ask someone*.

### R5 — `details` carries structure, not prose, and no secrets

`details` SHOULD carry machine-usable specifics — which field failed validation, which dependency is
blocking, when a rate limit resets. It MUST NOT carry credentials, tokens, or personal data:
[Standard 3](03-auditing.md) R5 prohibits copying secrets into audit logs, and errors are logged more
widely than audit records.

## Additions this standard makes beyond the source

- The machine-interface contract section, and the alignment table. The source defines these four
  items separately without stating that they must agree.
- R3's default-retryability table and its reasoning.
- R4's distinction between `PERMISSION_DENIED` and `REQUIRES_APPROVAL`, and the mapping to Standard 2
  tiers.
- R5 in full.
- R2's rule that shared codes MUST NOT be redefined.

## Implementation

**No skill implements this standard.** It constrains an application's error contract.

`standards audit` cannot check it: error shapes are semantic, and no pattern match distinguishes a
well-formed error contract from a `message`-only one. Conformance is established by review, and the
alignment table above is the checklist.

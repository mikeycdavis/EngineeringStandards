# Standard 14 — Structured Results

**"Agents should be able to determine what happened and what they may do next."** A result that says
only `Success.` answers neither question, and forces the agent to go looking — or to guess.

Source: item 14 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to AI-callable operations. Part of the machine-interface contract defined in
[Standard 12](12-structured-errors.md#the-machine-interface-contract), with 13 and 15 — this standard
governs the success path, Standard 12 the failure path, and the two must line up.

## Requirements

### R1 — Return structured state, not a bare acknowledgement

AI-callable operations SHOULD return structured state where possible.

Avoid only returning:

```text
Success.
```

Prefer, reproduced from the source:

```json
{
  "status": "completed",
  "entityId": "123",
  "createdResources": [],
  "warnings": [],
  "requiresHumanApproval": [],
  "nextPossibleActions": []
}
```

An agent's next move depends on what the call produced. `Success.` tells it the call did not fail,
which is the least useful true thing that can be said about it.

### R2 — The result answers both questions

Every field earns its place by answering one of the source's two questions:

| Field | Answers | Notes |
| --- | --- | --- |
| `status` | What happened | The outcome of *this call*, not the entity's lifecycle state |
| `entityId` | What it happened to | So the agent can act on the result without searching for it |
| `createdResources` | What else came into existence | Side effects the caller did not name but may need |
| `warnings` | What succeeded but deserves attention | Non-fatal; a warning that should stop the caller is an error ([Standard 12](12-structured-errors.md)) |
| `requiresHumanApproval` | What is now waiting on a person | Must agree with `requiresApproval` on the failure path |
| `nextPossibleActions` | What the agent may do next | The field that makes a result actionable rather than merely informative |

### R3 — `status` is the outcome of the call, not a lifecycle state

`status` here reports how the operation resolved — `completed`, `partial`, `queued`, `replayed`. It
is **not** the [Standard 8](08-status-tracking.md) lifecycle vocabulary, which describes a unit of
work over time.

The two are different questions asked of different things, and conflating them produces a result that
cannot say "the call completed and the work is now `IN_REVIEW`". Where an operation changes a tracked
item's lifecycle state, report both — the call's outcome in `status`, the item's new state in a field
of its own.

### R4 — `nextPossibleActions` must name real capabilities

Entries in `nextPossibleActions` MUST name capabilities that actually exist in the tool schema
([Standard 15](15-ai-tool-contracts.md)), spelled as the agent would call them.

This is the alignment that makes the field worth having. A suggested action an agent cannot invoke is
worse than no suggestion: it is a plausible-looking dead end that the agent will attempt, fail at, and
possibly work around by inventing a call.

The field SHOULD also be honest about permission. Suggesting an action the caller is not authorised
for produces a guaranteed `PERMISSION_DENIED` — better to omit it, or to list it alongside what
approval it would need.

### R5 — Partial success must be representable

Where an operation can partly succeed, the result MUST be able to say so — a `status` distinguishing
`partial` from `completed`, and enough detail to say which parts landed.

An operation that reports only success or failure forces a caller recovering from a partial failure
to reconstruct what happened by inspection, which is exactly the situation
[Standard 13](13-idempotency.md) exists to make survivable. Partial success and idempotency are the
same problem seen from two sides: one describes it, the other makes retrying safe.

### R6 — Approval fields agree across both paths

`requiresHumanApproval` in a result and `requiresApproval` in an error
([Standard 12](12-structured-errors.md) R4) MUST describe the same condition, and both MUST
correspond to the capability's tier under [Standard 2](02-propose-vs-execute.md).

A capability that returns success with an empty `requiresHumanApproval`, while its error path can
return `REQUIRES_APPROVAL`, is telling the caller two different things about the same operation.

## Additions this standard makes beyond the source

- R2's table assigning each field to one of the source's two questions.
- R3 in full — the distinction between call outcome and lifecycle state. The source gives
  `"status": "completed"` without saying which kind of status it is, and the collision with
  [Standard 8](08-status-tracking.md) is real enough to be worth ruling out explicitly.
- R4's requirement that suggested actions be invocable, and the note on permission honesty.
- R5 in full — partial success, and its relationship to idempotency.
- R6 in full — cross-path agreement on approval.

## Implementation

**No skill implements this standard.** It constrains an application's response contract.

`standards audit` cannot check it. Whether `nextPossibleActions` names real capabilities is
checkable in principle against a tool schema, and is a candidate improvement if projects adopting
these standards publish one — but nothing today reads that far.

# Standard 2 — Propose vs Execute

An AI agent that can recommend an action and an AI agent that can perform it are different systems
with different risk. A capability surface that does not distinguish them forces every integration to
choose between uselessness and unlimited authority.

Source: item 2 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to any project exposing capabilities to AI agents — the non-UI capability layer required by
[Standard 1](01-human-and-ai-operability.md). A project with no agent-callable surface has nothing to
classify.

Normative strength follows the source, which states this item as *should*.

## Requirements

### R1 — Classify every capability

AI-capable applications SHOULD distinguish between:

- **read**
- **analyze**
- **propose**
- **execute**
- **privileged/destructive execute**

Every agent-callable capability SHOULD carry one of these classifications, and the classification
SHOULD be discoverable by the caller rather than documented only for humans. An agent cannot respect
a boundary it cannot see.

### R2 — Proposal must be possible without execution

AI agents SHOULD be able to generate recommendations **without necessarily applying them**.

This requires a real capability, not a convention. If the only way to learn what a change would do is
to make it, the system has no propose tier regardless of what its documentation says. A dry-run
parameter, a plan-then-apply pair, or a distinct proposal capability all satisfy this; asking the
agent to be careful does not.

### R3 — High-risk actions require explicit authorization

Actions that are destructive, expensive, security-sensitive, financial, production-impacting, or
otherwise high-risk SHOULD support explicit authorization and approval controls.

"Support" means the control is available to be applied to that capability — not that every
deployment must enable it.

### R4 — Document a capability permission model

A project SHOULD document a recommended capability permission model: which tiers exist, which
capabilities fall into each, what authorization each tier requires, and who may grant it.

The source requires this documentation of projects adopting the standard. This document therefore
supplies a recommended model rather than leaving each project to invent one.

## Recommended capability permission model

Offered as a default. A project may substitute its own, provided it covers the same five tiers.

| Tier | May | Authorization | Auditable |
| --- | --- | --- | --- |
| `read` | Retrieve state without modifying it | Caller identity only | Optional |
| `analyze` | Derive conclusions from state; no persistence | Caller identity only | Optional |
| `propose` | Produce a described change without applying it | Caller identity only | Recommended — the proposal is a decision input |
| `execute` | Apply a reversible change to business state | Explicit grant per capability or capability group | **Required** — see [Standard 3](03-auditing.md) |
| `privileged execute` | Apply an irreversible, destructive, financial, or production-impacting change | Explicit grant **plus** per-invocation approval by an authorized human | **Required**, including the approving actor |

### Permission and approval are distinct

**An actor's permission to invoke a capability and the approval a particular invocation requires are
related but separate.** Holding the first does not satisfy the second.

An agent may be authorised to call `deploy` — that is a property of the actor and the capability. A
*production* deployment may still require approval — that is a property of this invocation's context
and impact. The permission check answers "may this caller use this capability at all"; the approval
check answers "may this specific action proceed now".

Two consequences worth stating:

- **A capability's tier is a floor, not a ceiling.** An `execute` capability may still demand
  per-invocation approval when the arguments make a particular call high-impact. Environment, blast
  radius, monetary value, and irreversibility are all legitimate grounds for escalating a single
  invocation without reclassifying the capability.
- **The two failures are different and must be reported differently.** A caller lacking permission is
  refused; a caller awaiting approval is pending. [Standard 12](12-structured-errors.md) gives these
  distinct codes — `PERMISSION_DENIED` against `REQUIRES_APPROVAL` — and an agent behaves differently
  on each: the first means stop, the second means ask.

Three further rules make the model usable rather than decorative:

1. **A capability's tier is a property of its worst case, not its typical case.** A capability that
   usually edits a draft but can publish is `execute`, not `propose`.
2. **Composition does not lower a tier.** A capability calling a `privileged execute` capability is
   itself `privileged execute`. Wrapping does not launder authority.
3. **Denial must be legible.** An agent refused SHOULD be told which permission or approval
   requirement prevented execution, so it can request the right thing instead of retrying blindly.
   "Denied" alone leaves it unable to distinguish a tier it will never hold from an approval it could
   obtain by asking.

## Additions this standard makes beyond the source

The source requires a permission model to be documented but does not specify one. Everything under
*Recommended capability permission model* — the table, and the three rules following it — is
therefore this standard's own contribution and is offered as a default rather than reproduced from
the source. The five tiers are the source's; their meanings and consequences are not.

R1's requirement that classification be *discoverable by the caller* is likewise an addition. The
source requires the distinction to exist; making it machine-readable is this standard's reading of
what makes it enforceable.

The *Permission and approval are distinct* section is also an addition. The source requires that
high-risk actions "support explicit authorization and approval controls" and names both, but does not
say they are separate checks; conflating them is the most likely way to implement the requirement
incorrectly, so the distinction is drawn explicitly.

## Implementation

**No skill implements this standard.** It constrains the design of a project's capability surface.

`standards audit` cannot check it. Capability tiers are semantic — no pattern match distinguishes a
capability that reports from one that acts — so conformance is established by review against the
model above.

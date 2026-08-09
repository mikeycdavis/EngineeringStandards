# Standard 15 — AI Tool Contracts

A tool schema is a published interface with consumers that cannot read a changelog. Treat it as
versioned software, because breaking it breaks agents silently and at a distance.

Source: item 15 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to every machine-facing interface a project publishes. This standard **completes** the
machine-interface contract defined in
[Standard 12](12-structured-errors.md#the-machine-interface-contract): 12 defines the failure path,
13 makes retrying safe, 14 defines the success path, and 15 is what publishes and versions all three.

## Requirements

### R1 — These are versioned software interfaces

Treat the following as versioned software interfaces, reproduced verbatim from the source:

- OpenAPI definitions
- MCP tools
- function/tool schemas
- agent commands
- AI capability definitions
- structured prompt contracts

The last is the one most often missed. A prompt contract — the structure a model is expected to
produce or consume — is an interface with the same breaking-change properties as an API, and it is
usually the least version-controlled thing in a codebase.

### R2 — Breaking changes are managed intentionally

**Breaking changes should be managed intentionally.**

"Intentionally" means the change is recognised as breaking, versioned accordingly, and announced —
not discovered by a consumer. The consumers here are agents, which makes the ordinary discipline
matter more than usual: an agent encountering a changed schema does not file a bug. It adapts,
plausibly and wrongly, and the failure surfaces somewhere else entirely.

### R3 — Semantic versioning

A project SHOULD version these interfaces semantically. Recommended reading of each part, supplied
because the source asks for recommendations without giving them:

| Change | Version | Examples |
| --- | --- | --- |
| **Major** — existing correct callers break | `2.0.0` | Removing or renaming a capability, parameter, or field; narrowing an accepted type; adding a required parameter; changing what an error code means; removing an enum value a caller may send |
| **Minor** — additive, existing callers unaffected | `1.1.0` | A new capability; a new optional parameter; a new field in a result; a new error code |
| **Patch** — no interface change | `1.0.1` | Documentation, description text, or a fix that makes behaviour match the published contract |

Two cases worth calling out, because both are routinely mis-versioned:

- **Adding an enum value a caller may *receive* is minor; adding one it may *send* is minor too — but
  removing either is major.** A caller that switches exhaustively on a result enum is not broken by a
  new value if the contract said the set was open. Say which it is.
- **Making an optional parameter required is major**, even though nothing was removed.

### R4 — The contract is the whole surface, not just the signature

A versioned interface MUST cover everything the machine-interface contract defines, not merely
parameter names:

| Element | From | Versioned because |
| --- | --- | --- |
| Capability names and parameters | This standard | The obvious surface |
| Capability tier — read, analyze, propose, execute, privileged | [Standard 2](02-propose-vs-execute.md) | A tier change alters what authorization a caller must obtain |
| Error codes and `retryable` / `requiresApproval` semantics | [Standard 12](12-structured-errors.md) | An agent's retry logic is written against these |
| Idempotency requirements — whether a key is required, and its name | [Standard 13](13-idempotency.md) | A caller cannot retry safely without knowing |
| Result fields, including `nextPossibleActions` | [Standard 14](14-structured-results.md) | Agents branch on these |

**Changing an error code's meaning, or flipping `retryable` from `false` to `true`, is a breaking
change** even though no signature moved. This is the requirement most often violated, because those
fields do not look like interface.

### R5 — Schemas are published and machine-readable

The schema MUST be retrievable by the agent that calls it, in the form it calls with — an OpenAPI
document, an MCP tool listing, a function schema. Documentation describing an interface in prose is
not a contract; it is a description of one, and the two drift.

### R6 — Deprecate before removing

A capability or field being removed SHOULD be marked deprecated in a released version before it
disappears, with the replacement named in the schema itself.

Agents read schemas, not migration guides. A `deprecated` flag naming its successor is the only
migration notice an autonomous consumer will ever see.

## Additions this standard makes beyond the source

- The whole of R3's semantic-versioning table and its two called-out cases. The source asks for
  recommendations to be defined; these are them.
- R4 in full — that the versioned surface includes tiers, error semantics, idempotency requirements,
  and result fields. This is the integration point the machine-interface contract exists to enforce.
- R5 and R6 in full.
- R1's observation about structured prompt contracts being the least version-controlled item on the
  list.

## The baseline contract for an AI-callable capability

Standards 12 through 15 together define what a capability must publish before an agent can use it
safely. A capability is compliant when all four hold:

1. **It fails legibly** — structured errors with a `code`, honest `retryable`, and `requiresApproval`
   matching its tier ([Standard 12](12-structured-errors.md)).
2. **It is safe to retry, or says it is not** — an idempotency mechanism where duplicates would harm,
   and `retryable: true` only where repeating is genuinely safe ([Standard 13](13-idempotency.md)).
3. **It reports what happened and what may follow** — structured results, partial success
   representable, `nextPossibleActions` naming real capabilities
   ([Standard 14](14-structured-results.md)).
4. **All of the above is published and versioned** — retrievable by the caller, with breaking changes
   managed intentionally (this standard).

Any one of the four satisfied alone still leaves an agent guessing. A well-versioned schema for a
capability that returns `Success.` and an unstructured error is a precise description of an
unusable interface.

## Implementation

**No skill implements this standard.**

`standards audit` reports `detected-apis` and `detected-ai-interfaces`, which indicate that machine
interfaces exist — not that they are versioned, published, or aligned. Checking R4 mechanically would
require reading a published schema and comparing it against the error and result contracts, which is
the most valuable check in this batch and the furthest from what the tool does today.

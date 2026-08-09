# Standard 13 — Idempotency

**AI agents retry operations.** That is not a misbehaviour to be trained out; it is what an agent does
when a call times out, a connection drops, or an error says retrying might help. The system has to be
safe under it.

Source: item 13 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to commands whose duplicate execution could create unwanted side effects. Explicitly **not**
to operations where it adds no value — the source says so directly, and reads are naturally
idempotent.

Part of the machine-interface contract defined in
[Standard 12](12-structured-errors.md#the-machine-interface-contract), with 14 and 15.

## Requirements

### R1 — Support idempotency where duplicates would harm

For commands where duplicate execution could create unwanted side effects, idempotency SHOULD be
supported whenever practical.

The test is consequence, not frequency: an operation retried once a year that charges a card twice
needs this more than one retried hourly that recomputes a cache.

### R2 — Recommended approaches

Reproduced verbatim from the source:

- Idempotency-Key
- command IDs
- deduplication records
- natural idempotency

| Approach | Fits | Note |
| --- | --- | --- |
| `Idempotency-Key` | HTTP APIs | Caller-supplied; the server stores the key with the outcome and replays it on repeat |
| Command IDs | Message-based or agent-callable commands | The id is part of the command, so it survives transport retries |
| Deduplication records | Event and job processing | A persisted record of what has been handled, checked before acting |
| Natural idempotency | State-setting operations | `set status to COMPLETE` is already safe; prefer this shape where the domain allows it |

**Natural idempotency is the strongest option** and the one to reach for first: it needs no key, no
storage, and no expiry, because repeating the call cannot change the outcome. A capability designed
as *set this state* rather than *apply this delta* gets it for free.

### R3 — Do not require it where it adds no value

**Do not require it where it adds no value.**

Idempotency infrastructure has real cost — keys to store, records to expire, a lookup on every call.
Applying it to reads, or to operations that are already naturally idempotent, buys nothing and
obscures which operations genuinely needed protecting.

### R4 — Idempotency and `retryable` must agree

This is the alignment [Standard 12](12-structured-errors.md) requires, stated from this side:

**An operation MUST NOT report `retryable: true` unless repeating it is actually safe** — either
because it is naturally idempotent, or because an idempotency mechanism from R2 is in place and the
caller has been given what it needs to use one.

The dangerous case is a timeout or `INTERNAL_ERROR` on a non-idempotent command: the caller does not
know whether the operation took effect, and an agent told it may retry will assume it did not. If a
capability cannot answer "did this happen?", it must not invite a retry.

Where a key is required, that requirement belongs in the capability's schema
([Standard 15](15-ai-tool-contracts.md)), not in prose an agent will not read.

### R5 — A replayed call returns the original outcome

An idempotent retry SHOULD return the **original** result, not a fresh success and not a `CONFLICT`.

An agent replaying a call is trying to discover what happened, not to act again. Returning the first
outcome answers that; returning `CONFLICT` tells it something is wrong when nothing is; returning a
new success invites it to believe two things happened. Where the distinction matters to the caller,
the result may say it was replayed ([Standard 14](14-structured-results.md)) — but the outcome
reported must be the one that actually occurred.

## Additions this standard makes beyond the source

- R2's table of which approach fits what, and the observation that natural idempotency is strongest.
- R4 in full — the required agreement with `retryable`. The source defines idempotency and
  retryability in separate items without connecting them; that connection is the whole point of the
  machine-interface contract.
- R5 in full — what a replayed call returns.
- R1's consequence-not-frequency test.

## Implementation

**No skill implements this standard.** It constrains command design.

`standards audit` cannot check it. Whether an operation is safe to repeat is a semantic property of
the domain, invisible to pattern matching. The check that matters — that no capability advertises
`retryable: true` without a safe-repeat story — is a review question, and R4 is the form to ask it in.

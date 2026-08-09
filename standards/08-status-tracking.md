# Standard 8 — Status Tracking

A shared status vocabulary so that "done" means the same thing in every project, and blocked work
says what it is waiting for.

Source: item 8 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to plan sections and executable items — the artifacts governed by
[Standard 4](04-planning-standards.md) and [Standard 7](07-acceptance-criteria.md).

Note for anyone reading the source directly: item 8 is the only item written as `# 8. Status
Tracking` with a Markdown heading prefix, where every other item is a bare `N. Title`. A scan
anchored on the bare form misses it, and has.

## Requirements

### R1 — The status vocabulary

The recommended standard status vocabulary, reproduced verbatim from the source:

```text
NOT_STARTED
IN_PROGRESS
BLOCKED
READY_FOR_REVIEW
COMPLETE
DEFERRED
CANCELLED
```

The source recommends rather than mandates this vocabulary. A project MAY use different tokens
provided the same distinctions survive — in particular the four that carry real information:
work not begun, work stopped on something external, work awaiting judgement, and work deliberately
not being done.

Two of the seven are frequently collapsed and should not be. `DEFERRED` and `CANCELLED` are different
claims: the first says *not now*, the second says *not ever*. Losing the distinction destroys the
reason a future reader most often consults an old plan — to find out whether something was decided
against or merely postponed.

### R2 — Plan sections carry status

Plan sections SHOULD include status where appropriate.

"Where appropriate" excludes narrative sections. An overview or a glossary has no status because it
cannot be finished; an executable item always does.

### R3 — Blocked work MUST identify its blocker

**Blocked work should identify its blocking dependency.**

A `BLOCKED` item that does not say what it is blocked on is indistinguishable from an abandoned one,
and it cannot be unblocked by anyone except its author. The blocker SHOULD be named specifically
enough to be actionable: another item's identifier, an external decision and who owns it, or a
dependency and what is missing from it.

## Additions this standard makes beyond the source

- R1's observation that `DEFERRED` and `CANCELLED` must not collapse, and the identification of the
  four load-bearing distinctions, are this standard's contribution.
- R2's reading of "where appropriate" as excluding narrative sections is an interpretation.
- R3's guidance on naming a blocker specifically is an addition; the source requires only that the
  dependency be identified.

## Known divergence — three vocabularies are in use

This standard's vocabulary is **not** currently used by the tooling built alongside these standards.
Recording the divergence rather than hiding it:

| Context | Vocabulary |
| --- | --- |
| This standard (source) | `NOT_STARTED` `IN_PROGRESS` `BLOCKED` `READY_FOR_REVIEW` `COMPLETE` `DEFERRED` `CANCELLED` |
| [Standard 44](44-existing-project-reconstruction.md) plan items | `not-started` `in-progress` `blocked` `done` `dropped` `tracked as <backlog-id>` |
| The `backlog` skill | `backlog` `ready` `in-progress` `blocked` `done` `declined` |

The three agree on `in-progress` and `blocked` and disagree on everything else. Standard 44 has no
equivalent of `READY_FOR_REVIEW`; the backlog skill's `ready` means *ready to start*, which is nearly
the opposite of `READY_FOR_REVIEW`, and is the divergence most likely to cause a real
misunderstanding. `dropped` and `declined` both cover `CANCELLED`, and nothing in either covers
`DEFERRED`.

This repository's own plan uses the Standard 44 vocabulary, so it does not currently satisfy R1's
recommendation. **This is an open decision for the project owner**, not something to resolve by
quietly editing one of the three. The options are to converge on this vocabulary, to declare Standard
44's set the normative one and amend this standard, or to record a documented exception. Until it is
decided, a reader comparing the three should treat this table as the mapping.

## Relationship to other standards

[Standard 9](09-verification.md) draws a distinction this vocabulary does not carry: *implemented*,
*verified*, and *released* are not the same state, yet `COMPLETE` covers all three. A project needing
that distinction should read the two standards together — `COMPLETE` here means at least *verified*,
never merely *implemented*.

## Implementation

**No skill implements this standard directly.** The `backlog` skill and its validator enforce their
own vocabulary, which diverges as described above.

`standards audit` reads plan-item `Status` values to resolve delegated references and to check
whether a completed item's deliverables exist. It does not validate the vocabulary itself, and given
the unresolved divergence it should not until the decision above is made.

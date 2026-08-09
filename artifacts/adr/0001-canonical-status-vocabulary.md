# 0001 — Adopt a single canonical lifecycle status vocabulary

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Project owner

## Context

Three status vocabularies were in use across work that is meant to interoperate:

| Context | Vocabulary |
| --- | --- |
| Standard 8, from the source spec | `NOT_STARTED` `IN_PROGRESS` `BLOCKED` `READY_FOR_REVIEW` `COMPLETE` `DEFERRED` `CANCELLED` |
| Standard 44 plan items | `not-started` `in-progress` `blocked` `done` `dropped` `tracked as <backlog-id>` |
| The `backlog` skill | `backlog` `ready` `in-progress` `blocked` `done` `declined` |

They agreed on `in-progress` and `blocked` and diverged everywhere else. Three specific problems:

- **A semantic collision.** The backlog skill's `ready` means *ready to start*. The source's
  `READY_FOR_REVIEW` means *finished and awaiting judgement* — nearly the opposite. A reader moving
  between the two systems would misread one of them.
- **`DEFERRED` was inexpressible** outside Standard 8. Both other systems collapsed *not now* and
  *not ever* into a single token, destroying the distinction a reader most often needs from an old
  plan.
- **`tracked as <id>` was not a lifecycle state at all.** It is a reference to another system,
  occupying the status field and preventing that item from expressing what state the work is in.

This vocabulary is foundational. It spreads into every repository, skill, validator, and any future
WhatsNext integration, and each standard written after this point risks embedding whichever
terminology it happened to see first. Documenting the divergence as a permitted exception would have
made it permanent.

## Decision

**Standard 8 defines the canonical lifecycle vocabulary for project-plan and backlog work.** All
repository-owned planning conventions and skills normalize to:

```text
NOT_STARTED
READY
IN_PROGRESS
BLOCKED
IN_REVIEW
COMPLETE
DEFERRED
CANCELLED
```

Three consequential changes to the source's own list:

1. **`READY_FOR_REVIEW` becomes `IN_REVIEW`**, and `READY` is added for *actionable and ready to
   begin*. This removes the collision: `READY` is before the work, `IN_REVIEW` is after it.
2. **`tracked as <id>` is abolished as a status.** A reference to an external work item is
   relationship metadata and is represented separately, alongside a real status.
3. **`done` is not used.** `COMPLETE` is preferred because Standard 9 distinguishes *implemented*,
   *verified*, and *released*, and "done" reliably blurs into the first of those.

The backlog skill's `declined` maps to `CANCELLED`. Where a project needs the narrower business
meaning of a rejected proposal, that belongs in a separate `disposition` field rather than in the
lifecycle vocabulary.

Standard 8 also defines an expected transition model, so that agents do not invent transitions.
Projects are not required to enforce that exact state machine.

**Migration:** legacy tokens may be accepted as aliases temporarily so existing repositories keep
working, but every generated artifact must emit the canonical vocabulary.

## Alternatives considered

**Document a permitted exception and leave the three as they are.** Rejected. The cost of divergence
grows with every standard and every repository adopting one, and an exception recorded once is never
revisited. This was the cheapest option today and the most expensive within a few months.

**Declare Standard 44's `not-started`/`done`/`dropped` set normative and amend Standard 8.** Rejected.
It is the weakest of the three: it has no state for work awaiting review, no way to say *deferred*,
and it carries `tracked as <id>`, which is the category error above.

**Adopt the source's list unchanged.** Rejected because of the `READY_FOR_REVIEW` / `ready`
collision. Renaming one token now is far cheaper than a permanent ambiguity between two systems that
are meant to be read together.

**Break existing backlogs immediately rather than accepting aliases.** Rejected. Several repositories
already carry backlogs using the legacy tokens; a hard cutover would fail their validation with no
migration path.

## Consequences

**Makes easier.** One vocabulary across plans, backlogs, validators, and any external integration.
A status field that always answers the same question. Machine consumers can treat status as a closed
enumeration.

**Makes harder.** Every existing artifact and skill using a legacy token needs updating, and the
alias layer must be carried until migration completes. Alias acceptance means two spellings are valid
during the transition, which is itself a small ambiguity — deliberately accepted as the cost of not
breaking working repositories.

**Commits the project to.** Treating status as a closed vocabulary. Any future state must be added to
Standard 8 rather than invented locally, and references to external systems must never re-enter the
status field.

**Known cost accepted.** The canonical set departs from the source specification in three places. Each
departure is disclosed in Standard 8 rather than presented as source text, and this record is why.

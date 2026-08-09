# Standard 7 — Acceptance Criteria

Work should be objectively verifiable, so that a new human or AI agent can determine what is complete
without asking anyone. "Agents should not need to guess whether work is finished."

Source: item 7 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to every executable plan item, story, feature, task, or implementation section — anything
that can be finished. It does not apply to narrative or contextual sections of a plan, which describe
rather than deliver.

## Requirements

### R1 — Every executable item defines an observable completion condition

Every executable plan item, story, feature, task, or implementation section SHOULD define an
observable completion condition whenever practical.

**Observable** is the operative word: the condition is one an outside party can check, not one the
author asserts.

### R2 — Vague completion is not acceptable

From the source, this is the anti-pattern to reject:

```text
Implement authentication.
```

It cannot be checked. Two people will disagree about whether it is done, and neither will be wrong,
because nothing was ever stated that could settle it.

### R3 — The required fields

Prefer, reproduced verbatim from the source:

```text
Deliverables
Acceptance Criteria
Verification
Dependencies
Status
```

The source's worked example:

```markdown
# Authentication

## Deliverables

- JWT authentication
- login endpoint
- refresh token support
- authorization policies
- audit events

## Acceptance Criteria

- anonymous protected requests return 401
- unauthorized users receive 403
- valid login produces tokens
- refresh token rotation succeeds
- authentication events appear in audit history

## Verification

dotnet build --configuration Release
dotnet test
```

Note what the example demonstrates, which the field list alone does not: **Deliverables name things,
Acceptance Criteria name observable behaviours, and Verification names commands.** An acceptance
criterion that restates a deliverable ("JWT authentication is implemented") has not been written —
it has been renamed.

### R4 — Acceptance criteria MUST be falsifiable

An acceptance criterion SHOULD be phrased so that it can fail. "Anonymous protected requests return
401" can be run and can come back wrong; "authentication works correctly" cannot.

A practical test: if you cannot describe the observation that would prove the criterion unmet, it is
not yet a criterion.

### R5 — Verification names the check, not the intent

`Verification` SHOULD give the specific command, query, or observation that produces evidence — the
thing someone runs. Where a check cannot be automated, it SHOULD state what to look at and what
result counts as passing.

Phrase a check against the source of truth rather than a snapshot of it: a verification asserting a
version equals the value in configuration survives a release; one asserting it equals `1.4.2` becomes
false the next time anyone ships.

## Additions this standard makes beyond the source

- R4 and R5 in full. The source requires observable completion conditions and lists the fields; the
  falsifiability test and the source-of-truth rule for verification are this standard's contribution.
- The observation in R3 that the three fields answer different questions — things, behaviours,
  commands — is drawn from the source's example rather than stated in it.

## Relationship to other standards

**This standard establishes the general minimum.** Five fields — `Status`, `Deliverables`,
`Acceptance Criteria`, `Verification`, `Dependencies` — apply to every executable item in every
project.

[Standard 44](44-existing-project-reconstruction.md) adds a sixth, `Purpose`, for reconstructed
plans. That is a **context-specific strengthening of this standard, not a competing definition of the
plan item.** Reconstruction is precisely the case where an item's reason for existing cannot be
recovered from history, so it has to be written down; ordinary planning has the conversation and the
original prompt to supply it.

The two therefore compose rather than conflict: a project following Standard 44 satisfies this
standard as well, and a project not doing a reconstruction is not failing anything by carrying five
fields rather than six.

[Standard 8](08-status-tracking.md) governs the `Status` field's vocabulary.
[Standard 4](04-planning-standards.md) governs where these items live.

## Implementation

**No skill directly implements this standard**, though `plan-structure` enforces a related shape on
plans and `plan-handoff` requires per-step verification when preparing a plan for a cold executor.

Mechanically checkable in part: `standards audit` reports a `standards-violations` finding when a plan
item under `artifacts/project-plan-breakdown/` omits a required field, and a
`plan-code-discrepancies` finding when a completed item names a deliverable that does not exist. It
checks that the fields are present, not that their contents are any good — an acceptance criterion
reading "works correctly" satisfies every mechanical check and fails R4.

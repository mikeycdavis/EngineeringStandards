# Design preparation - `validate-self` tracking fidelity probe (#45)

## Decision and non-goals

The framework pin is an **immutable tracking fidelity probe per checked-in workflow revision**.
Immutability makes a run reproducible; tracking requires deliberate renewal when semantics change.
This batch does not change either pinned SHA.

Historical 23-to-14 and retained current 19-to-9 comparisons remain distinct observations. Aggregate
counts do not establish exact per-rule transitions, and incomplete logs must not be used to invent
them.

## Review and renewal triggers

A review is required when a change can affect catalog membership or fields, detector/evaluator
semantics, policy interpretation, envelope result semantics, evidence availability, or distribution
materialization. Documentation-only and test-only changes are excluded only when review establishes
that they cannot affect those surfaces.

Renewal is observable when the change records: the prior pin; candidate evaluator revision; subject
revision; trigger category; reviewer conclusion; and retained comparison evidence. A review may
conclude "no renewal" with reasons. A pin update is a separate implementation change, never the
evidence that review occurred.

## Comparison evidence contract

Each local/hosted comparison must retain:

- evaluator commit and tree identity;
- subject commit and tree identity;
- workflow revision and both configured pin locations;
- command, environment/materialization, exit outcome, verdict, score, summary, and coverage;
- complete ordered per-rule records, including level, status, disposition, assurance, and evidence;
- an explicit comparison identifying transport differences separately from evaluator-version
  differences.

Local and hosted fidelity is established only when both paths use the same evaluator and subject
identities. Workflow text tests establish configuration shape, not hosted execution.

## Future validation

Keep both pin locations equal full SHAs; exercise the trigger classifier with positive and negative
changes; retain complete per-rule artifacts from local and hosted runs; and fail comparison when an
identity or required artifact is absent. Preserve the current pin until a separately reviewed
renewal supplies this evidence.

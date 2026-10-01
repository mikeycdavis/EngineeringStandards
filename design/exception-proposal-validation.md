# Design preparation - proposed exceptions (#11)

## Status and boundary

**Owner direction recorded; implementation decisions below remain open.** The accepted compatibility
shape is: legacy entries without `status` keep approved meaning; `status: proposed` forbids
`approvedBy` and `approvedAt`; `status: approved` requires both. Proposed entries survive parsing,
render distinctly, and never activate a waiver or suppress a verdict.

This document does not change the policy schema, evaluator, renderer, template, or tests.

## Validation decisions requiring review

| Question | Required invariant | Recommendation for review; not yet selected |
| --- | --- | --- |
| Proposed target is non-exemptible | It can never become an effective exception | Keep rule identity valid but emit a policy finding, so the forbidden approval path is visible before signature |
| `expires` on a proposal | Expiry must not be mistaken for an approved waiver lifetime | Forbid it until approval; an alternative is to define it explicitly as proposed approval expiry |
| Proposed plus `not-applicable` | Do not silently collapse two different claims | Report a policy consistency conflict, matching the existing approved-exception boundary |
| Proposed and approved entries for one rule | Activation must be deterministic | Reject duplicate rule entries rather than add precedence |
| Rule identity and `reference` | Verdict inertia must not bypass ordinary validity | Continue canonical-id, alias, reason, allowed-property, and supplied-reference validation |

Each recommendation is separable. Review may choose another behavior while preserving the required
invariant. No recommendation is an approved product decision yet.

## Required fixtures and assertions

- Schema positives: legacy approved; explicit approved; proposed with reason and optional reference.
- Schema negatives: proposed with either approval field; explicit approved missing either field;
  unknown status; disallowed properties.
- Policy cases: canonical and alias identities, an invalid or unresolvable supplied reference,
  proposed non-exemptible target,
  proposal expiry, proposal plus not-applicable, and proposed/approved duplicate.
- CLI integration: `policy`, human `validate`, and `validate --json` round-trip the proposal and
  render it separately from `Excepted:`.
- Verdict inertia: with the same subject and finding, adding a proposal changes no rule result,
  score, status, or `unestablishedProhibitions`; changing it to a valid approval applies the normal
  exception semantics.
- Compatibility: existing no-status entries remain approvals and `exceptions: []` remains valid.

## Implementation boundary

The schema engine already supports the anticipated `oneOf`/`const`/`required` construction. That is
design evidence, not authorization to edit the schema. #10 and #11 must retain separate acceptance
results even if later implemented together.

# Proposal - manual-evidence contract for `audit.business-state` (#129, ST-36)

**Status: proposal for the owner's decision; the owner chose the narrow reading (B) on 2026-10-15.**
Nothing here is adopted, implemented or signed. This document changes no rule result, catalog entry,
schema, script, policy or attestation, and it does **not** set `attestable: true`: the catalog
`assurance` for `audit.business-state` stays `none` and the rule stays not-evaluated. Implementation, if
any, is a new item.

## 1. What this proposes

`audit.business-state` is catalogued `code-analysis`, `level: required`, `assurance: none`
(`rules/audit.json`). Its `$assuranceNote` records that a detector once bound to it observed only test
and CI infrastructure and was withdrawn because it elevated assurance (Standard 24 R2, issue #62). The
planned detector item (#126) is negative-only: it reports mutation sites observed with no audit
mechanism anywhere in the repository, and keeps the rule not-evaluated, because "business-relevant" and
"safely reconstructable" are classifications no repository states. This document defines what a human
reviewer **can** establish and record about the rule today, and what that record may and may not be used
for.

It establishes nothing about the rule. A record under this contract is non-establishing evidence.

## 2. Requirement-to-row table

| Requirement | Satisfied by | Status |
| --- | --- | --- |
| The record names the commit and the reviewed path set | Section 3 | today |
| The record states what was examined and found | Section 4 | today |
| The record states what it does not cover | Section 5 | today |
| The record is not an attestation and does not establish the rule | Section 6 | today |
| A rejection recorded as an attestation fails while it is the terminal event | Section 6 (prose only) | not applicable while the rule is not attestable; no claim |
| Identity, role, base revision, tree-wide freshness, digest, live state, retention | Section 7 | future work, no claim |

## 3. Record form

A reviewer records, in a review note the project keeps (an ADR, a design note, or a review record in an
issue or pull request): the commit SHA reviewed (D); the paths the reviewer actually read; the
reviewer's name and date; the review statement (section 4); and the limits (section 5).

The record is about commit D only; a later commit is not covered and a new review is a new record. No
machine-checked freshness or expiry applies to it; a project may set its own review-age convention. The
accountable reviewer is the owner of the system's data or domain, and not the author of the change under
review; whether that holds is not machine-checked.

## 4. The review statement

At digest D, over the paths read, with the audit sink called K, the reviewer states what they observed
of:

- the entry points that write persistent business state, listed with their stores and a mutation
  category each, and which entry points emit an audit event through K;
- for each, whether the event is recorded together with the mutation (or through a transactional
  outbox), and whether K retains it in a store queryable for reconstruction;
- the fields each event carries, and whether they let the change be reconstructed (Standard 3 R2 lists `before` and `after`; whether a changed-field set with its value is enough is the reviewer's judgement), with credentials, tokens and personal data
  recorded as a change marker rather than the value (Standard 3 R5);
- the stores excluded as derived or transient, each with its reconstruction rationale, under Standard 3
  R1's full conjunctive predicate: excludable only when it can be safely reconstructed *and* has none of
  compliance, security, operational, historical or business-decision value (`standards/03-auditing.md`,
  R1; the catalog description in `rules/audit.json` is shorter, and that drift is a separate catalog
  matter not relied on here).

## 5. What a record does not cover

- Writers outside the paths read: another repository, service, queue consumer, external API with write
  access, migration or administrative utility the reviewer did not read.
- Completeness: a clean statement means the reviewer observed no further writer in what was read; it is
  not proof that none exists.
- Whether the recorded fields suffice to reconstruct state in every case, or whether an excluded store
  really is derived or transient; both are reviewer judgements.
- Deployed retention, grants and storage configuration, which are not tracked files.

Standard 24 R2's worked example of an elevation to avoid is the summary line "PASS: all business
mutations are audited" (`standards/24-validator-rules.md`, R2); a record under this contract never says
that. Test and CI presence are not evidence for this claim (issue #62's criterion). Their observation
was restored by PR #83 as audit-only findings with no rule binding; #64 and PR #114 (a later correction)
remain separate from this proposal. Standard 3's Implementation section says "Conformance is established
by review" (`standards/03-auditing.md`), which is a statement about practice and not a framework
definition of review as the establishing mechanism.

## 6. What the record may be used for

ADR 0010 (Proposed, not Accepted) states:

> Human review may always contribute negative evidence.
> Human review may contribute positive evidence only where the framework explicitly defines human review
> as the establishing mechanism.

This contract relies only on the first sentence: a record that reports findings is negative or
non-establishing evidence, and a record that reports none is not a pass. It is not a policy attestation, and nothing in sections 3 to 5 depends on validator internals.
For orientation only, as of `scripts/compliance.mjs`: an attestation recorded for a rule the catalog
does not mark attestable is never accepted as establishing it (it is reported `invalid-attestation`
when judged, and the review-history comparison can disregard approvals altogether when it is not
effective); a rule declared not-applicable is not judged, so an approval has no effect and a recorded
rejection yields only a policy finding. For a rule the catalog does mark attestable, a detector
finding is never overridden (ADR 0005, binding rule 1: "An attestation cannot override an automated
failure.") and a recorded rejection fails the rule while it is the terminal event of the review
history; an approval that is expired or not fresh stops establishing the rule, which is then
evaluated normally. None of that makes this record an attestation: it is kept outside the attestation
mechanism and changes no result.

ADR 0011 supplies the append-only event rule for recorded reviews ("No operation that records a new
review may alter or delete any previously recorded review event.").

## 7. Separately proposed future work

This section makes **no claim** and is not a condition of this contract. It lists what a future item
would have to build before a human review could establish `audit.business-state`:

- authenticated reviewer identity, a verified reviewer-role and ownership record (`reviewerRole` exists today as an asserted field), and reviewer/author separation
  derived from a computed base revision (#95, #133);
- clearing a recorded rejection only by an authenticated successor independent of the rejected event's
  subject (#96, PR #116 chains successors but authenticates nothing);
- freshness bound to the enumerated tracked tree, a digest mandatory on genesis events too (successor events already carry one), and a mandatory expiry or maximum age (`expires` exists and is optional); `tree` is recorded today but not used for freshness;
- an independent component-and-store declaration with a completeness statement, a retention-policy
  artefact with a deployed-retention snapshot, an objective minimum-payload floor, and committed formats
  for the inventory, exclusion policy and payload definition;
- the catalog opt-in (`attestable: true`, ADR 0005 binding rule 3, and the invariant in `test/compliance.test.mjs` that only manual-review rules are attestable; the policy schema already accepts an attestation under any canonical rule id, and the evaluator's catalog eligibility check is the gate), with any policy-template documentation, a decision on catalog `assurance`,
  ADR 0010 acceptance, and an update to Standard 3's Implementation section;
- versioning classification (Standard 21 R2 does not classify attestation eligibility) and `VERSION`,
  which are the owner's.

None of this is made, and none of it is required for the record in sections 3 to 5. Of #95 and #96, the future work needs answered: for #95, how a stale approval is re-reviewed and renewed with authenticated identity; for #96, who may clear a rejection and on what authority.

## 8. Owner decision

The owner chose the narrow reading (B) on 2026-10-15; this document implements that choice. Adoption of
the record form itself, and any future work above, remain the owner's to decide on #129.

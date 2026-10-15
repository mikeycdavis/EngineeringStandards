# Proposal - manual-evidence contract for `audit.business-state` (#129, ST-36)

**Status: proposal for the owner's decision. Nothing here is adopted, implemented or signed.** This
document changes no rule result, catalog entry, schema, script, policy or attestation. Implementation,
if the owner adopts it, is a new item.

## 1. What this proposes, and what it does not

`audit.business-state` is catalogued `code-analysis` with `assurance: none` and `level: required`
(`rules/audit.json`). Its `$assuranceNote` records that a detector once bound to it observed only test and
CI infrastructure, and was withdrawn because it elevated assurance (Standard 24 R2, issue #62). The planned
detector item (#126) is negative-only (mutations observed with no audit mechanism) and keeps the rule
not-evaluated, because "business-relevant" and "safely reconstructable" are classifications no repository
states. This proposal asks under what contract a human review could establish what no detector can: that
the listed mutation entry points are the only writers of persistent business state, each emits an audit
event, and the excluded stores are justified as derived or transient.

It does not make the rule attestable, sign or apply an attestation, widen eligibility, or change
aggregate-verdict semantics.

## 2. The claim

> At digest D the mutation entry points listed in the committed inventory are the only writers of
> persistent business state, each emits an audit event through sink S, and the stores excluded as derived
> or transient are listed with their reconstruction rationale.

The exclusion language follows the catalog description: derived, transient or serialized metadata may be
excluded "where it can be safely reconstructed and has no compliance, security, or business-history
value" (`rules/audit.json`).

## 3. Artefact list

| Artefact | Why |
| --- | --- |
| The committed inventory: path, symbol, store, emitted event, or exclusion rationale | The subject of the claim; committed, so inside the digest. |
| The sink source | Shows what "emits an audit event" means. |
| One test per listed entry point proving emission | An artefact the reviewer reads; not by itself evidence (section 8). |
| The detector's mutation-site observations (#126, not built) | Cross-check input. |

Mechanical cross-check: every detector-observed mutation site is either inventoried or excluded with a
reason, so a new site makes the attestation stale automatically. This works only once #126 and the
audit-surface locator (#119; PR #135 is open) exist, and only for the mutation shapes the detector
recognises. It shares the sink and inventory design of the sibling contract for
`audit.actor-attribution` (#128).

## 4. Accountable role

The owner of the system's data or domain, recorded as `reviewedBy` with the role in `reviewerRole`; not
the author of the change under review.

## 5. Invalidation rule

Digest-bound `reviewedAgainst` over the inventory, the sink and every inventoried file, using
`git-blob-set-sha256-v1` (ADR 0011). Stale on any change to those paths:

> **Freshness is a separate axis from what the human decided.** (ADR 0011)

A stale approval is `not-evaluated` / `skipped` and establishes nothing. A mutation site added outside the
inventory changes no listed file; only the detector cross-check can catch it.

## 6. Expiry

At most 90 days from `reviewedAt` or the next release, whichever is sooner. The schema has an optional
`expires` date and the validator treats a past `expires` as unreviewed (`scripts/compliance.mjs`), but
nothing enforces a maximum age or a release bound, and `expires` may be omitted. Enforcement would be a
reviewer convention or a new validator check; neither is chosen here.

## 7. What the detector's output contributes

Only observations of mutation sites with no audit mechanism, plus its blind spots. A detector violation
stands and is never overridden (section 10). A clean run is not evidence that every writer is listed.

## 8. What the contract cannot establish

- Mutations through unlisted libraries, files, queues and external APIs.
- Writers in other repositories or services that touch the same stores.
- Whether the audit event is sufficient to reconstruct the change (before and after content).
- That an excluded store really is derived or transient; the rationale is a reviewer judgement.
- That the inventory is complete beyond what the detector can observe.

Standard 24 R2's worked example of an elevation to avoid is the summary line "PASS: all business
mutations are audited" (`standards/24-validator-rules.md`, R2); the claim text above is written to avoid
saying that. Test and CI presence are not evidence for this claim (issue #62's criterion). Their
observation was restored only as audit-only findings with no rule binding (#64, closed; PR #114, merged),
and #64 and PR #114 remain separate from this proposal. Standard 3 itself says
"`audit.business-state` is reported not-evaluated" and "Conformance is established by review"
(`standards/03-auditing.md`, Implementation); the latter is a statement about practice, not a framework
definition of review as the establishing mechanism.

## 9. Exact changes that would be required, each marked NOT MADE

| Change | Where | Status |
| --- | --- | --- |
| Set `attestable: true` on `audit.business-state` | `rules/audit.json`. The field already exists and is validated by `scripts/catalog.mjs`; absent it defaults to `validationType === "manual-review"` | NOT MADE |
| Whether `assurance` moves from `none` | `rules/audit.json`. An approved attestation reports result assurance `full` under `manualReview` (`scripts/compliance.mjs`); the static catalog value is a separate claim (Standard 27 R3) | NOT MADE, decision needed |
| Require reviewer role, accountable owner, maximum age and inventory in the attestation | Attestation schema and/or validator; today only existence, freshness and `expires` are machine-checked | NOT MADE |
| Define the committed mutation inventory format | New schema or design document | NOT MADE |
| Update the `$assuranceNote` and Standard 3's implementation note | `rules/audit.json`, `standards/03-auditing.md` | NOT MADE |
| Versioning impact | Standard 21 R2: widening eligibility; a MAJOR candidate. Classification and `VERSION` are the owner's | NOT MADE, not classified |

The owner has stated that eligibility must not be widened merely to reach COMPLIANT. The opt-in is
presented only as ADR 0010's positive-evidence clause, for separate approval.

## 10. Negative case: rejected, stale, contradicted

A contract never overrides a detector violation or a rejected attestation. From `scripts/compliance.mjs`
(`judgeAttestation`), in order: non-attestable rule gives `invalid-attestation`; a detector finding gives
`contradicted-attestation` (ADR 0005, binding rule 1: "An attestation cannot override an automated
failure."); a `rejected` attestation gives `attested-rejected` / failed, evaluated before expiry and
freshness; a stale or expired approval returns the rule to `not-evaluated`, establishing nothing.

## 11. Relationship to ADR 0010 and ADR 0011

ADR 0010 is **Proposed**, not Accepted. The clause this contract relies on:

> Human review may contribute positive evidence only where the framework explicitly defines human review
> as the establishing mechanism.

Adopting this contract would be that explicit definition for this rule, and it depends on ADR 0010 being
accepted. ADR 0011 supplies freshness and the append-only event rule ("No operation that records a new
review may alter or delete any previously recorded review event.").

## 12. Reliance on #95 and #96

- **#95 (ST-17, renewal).** Renewal needs authenticated append-only successors. PR #115 delivered
  immutability and queryability; authentication waits for #133 and the issue stays open. Answer needed:
  how reviewer identity is authenticated, since "not the change author" is checkable only then.
- **#96 (ST-18, rejection clearing).** A rejected business-state finding needs a corrective successor to
  clear it. Answers needed: what a successor must show (re-review against a new digest including new
  inventory entries), and ADR 0010's open questions on rejection expiry and detector override.

Both record a completion dependency on #133 (owner comments of 2026-10-12).

## 13. Owner decision

Not recorded. Options: adopt, amend, decline. The decision belongs on #129; implementation, if adopted,
is a new item.

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

> At digest D, over the complete source set S in scope: the mutation entry points listed in the
> committed inventory are the only writers of persistent business state; each emits an audit event
> through sink S; each emitted event carries the minimum payload that records *what changed* (below);
> and the stores excluded as derived or transient are listed with their reconstruction rationale.

**Minimum payload.** The catalog's remediation is to "record business mutations through an audit path
that captures what changed" (`rules/audit.json`). An event that carries only an identifier does not do
that. The project must define, and the inventory must cite, the fields an event needs to reconstruct the
change (Standard 3 R2 requires a project to "decide and record which fields are mandatory for it", and
lists `entityType`, `entityId`, `action`, `before`, `after` and `reason` among candidates). The
per-entry-point test asserts that the emitted event contains those fields with the values the mutation
changed, not merely that S was called. Whether the recorded content is *sufficient* to reconstruct state
is still a reviewer judgement against the stated minimum.

The exclusion language follows the catalog description: derived, transient or serialized metadata may be
excluded "where it can be safely reconstructed and has no compliance, security, or business-history
value" (`rules/audit.json`).

## 3. Artefact list

| Artefact | Why |
| --- | --- |
| The committed inventory: path, symbol, store, emitted event, or exclusion rationale | The subject of the claim; committed, so inside the digest. |
| The sink source | Shows what "emits an audit event" means. |
| One test per listed entry point asserting the minimum payload (changed fields and their values), not just that S was called | An artefact the reviewer reads; not by itself evidence of completeness (section 8). |
| The project's recorded minimum event payload (Standard 3 R2) | Defines what "captures what changed" means for the sufficiency clause. |
| The complete in-scope source set S (an enumeration or tree identity, not a hand-picked list) | The claim quantifies over *the only* writers, so freshness must cover every file. See section 5. |
| The detector's mutation-site observations (#126, not built) | Cross-check input. |

Detector cross-check, once it exists: every detector-observed mutation site should be either inventoried
or excluded with a reason, and an uninventoried one is a finding. That is a detector result (a
contradiction, section 10), **not freshness**. It depends on #126 and the audit-surface locator (#119;
PR #135 is open), which are not on develop, and covers only the mutation shapes the detector recognises,
so it must not be relied on to keep the attestation current. It shares the sink and inventory design of the sibling contract for
`audit.actor-attribution` (#128).

## 4. Accountable role

The owner of the system's data or domain, recorded as `reviewedBy` with the role in `reviewerRole`; not
the author of the change under review.

## 5. Invalidation rule

Digest-bound `reviewedAgainst` over the inventory, the sink **and the complete in-scope source set S**,
using `git-blob-set-sha256-v1` (ADR 0011). Stale on any change to a file in S or the addition of a file
to S:

> **Freshness is a separate axis from what the human decided.** (ADR 0011)

A stale approval is `not-evaluated` / `skipped` and establishes nothing.

**This is a requirement the current mechanism does not meet.** The digest covers only the paths listed
in `reviewedAgainst.paths`. A writer added in a new or uninventoried file changes nothing the digest
covers, so the approval would stay fresh while "the listed entry points are the only writers" became
false. The detector does not close that gap: it is not built, recognises only some mutation shapes, and
a clean run is not completeness evidence. Freshness must be bound to a tree identity or an enumerated
source set whose membership changes when any potential writer is added (section 9). Until it is, this
contract MUST NOT be adopted.

**A recorded digest is also required.** Today `reviewedAgainst` and its digest are optional, and
freshness state `unrecorded` still establishes the rule (`scripts/compliance.mjs`). An approval with no
digest would never go stale, so section 9 lists mandatory paths, digest and algorithm for this rule.

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
- That the minimum payload the project defined is itself sufficient to reconstruct every kind of change; the contract checks events against the stated minimum.
- That an excluded store really is derived or transient; the rationale is a reviewer judgement.
- That the inventory is complete beyond what the reviewer reads in S and the detector can observe.

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
| Bind freshness to the complete source set in scope | Attestation `reviewedAgainst` and the digest mechanism in `scripts/repository.mjs`. Today the digest covers only the listed `paths`, so a file added outside them changes nothing. A tree identity or an enumerated set (for example one produced by the audit-surface locator, #119) whose membership changes when any in-scope file is added would be needed | NOT MADE; without it this contract MUST NOT be adopted |
| Make `reviewedAgainst.paths`, `digest` and `digestAlgorithm` mandatory for an approval under this rule | Schema and `judgeAttestation`. Today `reviewedAgainst` and its digest are optional and freshness state `unrecorded` still establishes the rule (`scripts/compliance.mjs`), so an approval with no digest would stay a pass indefinitely | NOT MADE; without it this contract MUST NOT be adopted |
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

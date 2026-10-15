# Proposal - manual-evidence contract for `audit.actor-attribution` (#128, ST-35)

**Status: proposal for the owner's decision. Nothing here is adopted, implemented or signed.** This
document changes no rule result, catalog entry, schema, script, policy or attestation. Implementation,
if the owner adopts it, is a new item.

## 1. What this proposes, and what it does not

`audit.actor-attribution` is catalogued `code-analysis` with `assurance: none` and `level: required`
(`rules/audit.json`). Its `$assuranceNote` reads "No analyzer exists. Reported as not-evaluated rather
than passing (Standard 24 R4)." The planned detector item (#125) is negative-only over the audit event
definition and keeps the rule not-evaluated: call-site attribution cannot be derived from source
structure without a project-declared inventory. This proposal asks under what contract a human review
could establish the part of the rule no detector can: that every call to the audit sink supplies an actor,
an actor type and a correlation or request identifier, and that agent-initiated changes use an agent
actor type.

It does not make the rule attestable, sign or apply an attestation, widen eligibility, or change
aggregate-verdict semantics.

## 2. The claim

> At digest D every call to audit sink S supplies actorType, actorId and a correlation or request
> identifier, and agent-initiated changes use an agent actor type.

## 3. Artefact list

The review MUST cite, and `reviewedAgainst.paths` MUST name:

| Artefact | Why |
| --- | --- |
| The sink's signature or schema path | Defines what a call must supply. |
| A committed call-site inventory: path, symbol, actor source expression | The subject of the claim; it must be a committed file so it is inside the digest. |
| One test per actor type proving the emitted event | Shows the actor type reaches the event; see section 8 for why a test is not by itself evidence of the claim. |
| The detector's observed event definition (#125, not built) | Cross-checks the sink contract. |

Mechanical cross-check: every call site the detector observes is either inventoried or excluded with a
stated reason, so a new call site makes the attestation stale without anyone remembering to. This works
only once #125 and the audit-surface locator (#119; PR #135 is open) exist.

Actor types are those of Standard 3 R3 (`USER`, `AI_AGENT`, `SYSTEM`, `SCHEDULED_JOB`, `API_CLIENT`,
`ADMIN`, `INTEGRATION`). The contract's "agent actor type" is `AI_AGENT`. Standard 3 R3 is where the
only MUST sits: "AI actions MUST be attributable to the same standard as human actions".

## 4. Accountable role

The person accountable for the audit sink (the sink's owner), recorded as `reviewedBy` with the role in
`reviewerRole`. It is not the author of the change under review.

## 5. Invalidation rule

Digest-bound `reviewedAgainst` over the sink, the inventory and every inventoried call-site file, using
`git-blob-set-sha256-v1` (ADR 0011). Stale on any change to those paths:

> **Freshness is a separate axis from what the human decided.** (ADR 0011)

A stale approval is `not-evaluated` / `skipped` and establishes nothing. A call site added outside the
inventory changes no listed file; only the detector cross-check in section 3 can catch it.

## 6. Expiry

At most 90 days from `reviewedAt` or the next release, whichever is sooner. The schema has an optional
`expires` date and the validator treats a past `expires` as unreviewed (`scripts/compliance.mjs`), but
nothing enforces a maximum age or a "next release" bound, and `expires` may be omitted. Enforcing the
bound would be a reviewer convention or a new validator check; neither is chosen here.

## 7. What the detector's output contributes

Only observations: the event definition it found, and call sites it saw. Detector violations stand and
are never overridden (section 10). A clean detector run is not evidence of attribution at call sites it
cannot see.

## 8. What the contract cannot establish

- Mutations that bypass the sink entirely (direct writes, other libraries, raw queries, queues).
- Truthfulness of the supplied values: a call can supply `actorId` and `correlationId` that are wrong,
  constant or copied.
- Call sites outside the inventory and outside what the detector can observe.
- Other repositories and services that write to the same state.
- That an `AI_AGENT` actor type is applied to changes an agent actually initiated.

Test and CI presence are not evidence for this claim. The `$assuranceNote` records that a detector bound
to test and CI infrastructure was withdrawn because it elevated assurance (Standard 24 R2; issue #62,
closed). That observation was later restored only as audit-only findings carrying no rule binding (#64,
closed; PR #114, merged), and #64 and PR #114 remain separate from this proposal. A test per actor type
(section 3) is an artefact the reviewer reads, not a substitute for the inventory.

Also noted: Standard 3 R2 and R3 word most of this as SHOULD while the catalog level is `required`
(`standards/03-auditing.md`, `rules/audit.json`). That is a standard-versus-catalog policy question for
the owner.

## 9. Exact changes that would be required, each marked NOT MADE

| Change | Where | Status |
| --- | --- | --- |
| Set `attestable: true` on `audit.actor-attribution` | `rules/audit.json`. The field already exists and is validated by `scripts/catalog.mjs`; absent it defaults to `validationType === "manual-review"` | NOT MADE |
| Decide whether catalog `assurance` stays `none` | `rules/audit.json`. An approved attestation reports result assurance `full` under `manualReview` (`scripts/compliance.mjs`) | NOT MADE, decision needed |
| Require reviewer role, accountable owner, maximum age and the inventory in the attestation | Attestation schema and/or validator; today only existence, freshness and `expires` are machine-checked | NOT MADE |
| Define the committed call-site inventory format | New schema or design document | NOT MADE |
| Update the rule's `$assuranceNote` and Standard 3's implementation note ("Conformance is established by review.") | `rules/audit.json`, `standards/03-auditing.md` | NOT MADE |
| Versioning impact | Standard 21 R2: widening eligibility; a MAJOR candidate. Classification and `VERSION` are the owner's | NOT MADE, not classified |

The owner has stated that eligibility must not be widened merely to reach COMPLIANT. The opt-in is
presented only as ADR 0010's positive-evidence clause, for separate approval and by the same path as the
provider-neutral contract (#127).

## 10. Negative case: rejected, stale, contradicted

A contract never overrides a detector violation or a rejected attestation. From `scripts/compliance.mjs`
(`judgeAttestation`), in order:

1. A non-attestable rule with an attestation is `invalid-attestation`.
2. A detector finding yields `contradicted-attestation`; ADR 0005, binding rule 1: "An attestation cannot
   override an automated failure."
3. A `rejected` attestation yields `attested-rejected` / failed, evaluated before expiry and freshness.
4. A stale or expired approval returns the rule to `not-evaluated`; it establishes nothing and is not a
   failure.

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
- **#96 (ST-18, rejection clearing).** A rejected attribution finding needs a corrective successor to
  clear it. Answers needed: what a successor must show (a re-review against a new digest including any
  new inventory), and ADR 0010's open questions on rejection expiry and detector override.

Both record a completion dependency on #133 (owner comments of 2026-10-12).

## 13. Owner decision

Not recorded. Options: adopt, amend, decline. The decision belongs on #128; implementation, if adopted,
is a new item.

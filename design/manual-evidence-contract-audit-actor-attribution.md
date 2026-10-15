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

> At digest D, over the complete source set S in scope: (a) every mutation path of persistent state
> routes through audit sink S, so none bypasses it, including paths that execute through a queue, an
> external API or a library; (b) every call to S supplies actorType, actorId and a
> correlation or request identifier; (c) each entry point derives its actor type from the real
> initiator, so that agent-initiated changes use an agent actor type and human or system changes do not;
> and (d) `actorId` and the correlation or request identifier are derived from the trusted identity and
> execution context of the initiator type (table below), not from constants, defaults or values copied
> from the caller.

**Trusted sources by initiator type** (the review checks each entry point against its row):

| Actor type | `actorId` derived from | Correlation or request id derived from |
| --- | --- | --- |
| `USER`, `ADMIN` | the authenticated session principal | the request id assigned at the edge |
| `API_CLIENT` | the authenticated client credential identity | the request id assigned at the edge |
| `SCHEDULED_JOB` | the scheduler's job identity | the execution or run id of that job |
| `SYSTEM` | the identity of the internal component that initiates the change | that component's operation or execution id |
| `AI_AGENT` | the agent's registered identity | the agent session or run id, and the initiating principal where one exists |
| `INTEGRATION` | the integration credential identity | the delivery or message id |

An entry point whose initiator type has no row source (for example a job with no recorded job identity)
fails clause (d); it is not satisfied by a constant.

**Externally executed mutations.** A mutation carried out through a queue, an external API or a
library is not outside clause (a). Each such path is inventoried with the component that performs the
resulting mutation and with evidence that the component records an event through S (or an equivalent
component with the same fields) carrying the originating actor context. A path for which no such
component can be named is a failure of clause (a), not an exclusion.

Clause (a) is what lets a claim about calls to S speak for the catalog requirement, which is that *every
mutation* records actor context (`rules/audit.json`). Without (a) the claim covers only calls that
already reach S. Clause (c) is reviewed per entry point: the reviewer reads how the actor type is set
and whether the initiator signal it uses (authenticated principal, job runner, agent session) can be
absent or forged by the caller.

**Scope of what this can establish.** Clauses (c) and (d) are reviewed as derivations in code: the
reviewer reads, for each entry point, where the actor type, actor id and correlation id come from, and
the per-actor-type tests vary the principal and assert the event follows it. That establishes how the
values are derived at digest D. It does not prove that every run-time value is true, and the catalog
requirement is about what is recorded at run time. The attestation, once approved, reports the whole
rule passed with full assurance. This document therefore does not claim that the contract establishes
`audit.actor-attribution`. It proposes the contract as the strongest human evidence available for the
rule, and leaves to the owner, under ADR 0010, the decision whether code-level derivation may be the
establishing mechanism. If the owner does not accept that, the contract must not be opted into; an
attestation under it would overstate what was reviewed.

## 3. Artefact list

The review MUST cite, and `reviewedAgainst.paths` MUST name:

| Artefact | Why |
| --- | --- |
| The sink's signature or schema path | Defines what a call must supply. |
| A committed call-site inventory: path, symbol, actor source expression | The subject of clauses (b) and (c); it must be a committed file so it is inside the digest. |
| A mutation-path inventory with, for each path, the route to S (or a stated reason it is not a business mutation) | The subject of clause (a). |
| The complete in-scope source set S (an enumeration or tree identity, not a hand-picked list) | The claim quantifies over every mutation path and call site, so freshness must cover every file. See section 5. |
| One test per actor type proving the emitted event, varying the principal and request context | Shows actor type, actor id and correlation id follow their sources (clauses (c), (d)); see section 8 for why a test is not by itself evidence of the claim. |
| The derivation of actor id and correlation id per entry point (the code that reads the principal and request context) | The subject of clause (d). |
| The detector's observed event definition (#125, not built) | Cross-checks the sink contract. |

Detector cross-check, once it exists: every call site the detector observes should be either
inventoried or excluded with a stated reason, and an uninventoried one is a finding. That is a
detector result (a contradiction, section 10), **not freshness**. It depends on #125 and the
audit-surface locator (#119; PR #135 is open), neither of which is on develop, so it must not be relied on
to keep the attestation current.

Actor types are those of Standard 3 R3 (`USER`, `AI_AGENT`, `SYSTEM`, `SCHEDULED_JOB`, `API_CLIENT`,
`ADMIN`, `INTEGRATION`). The contract's "agent actor type" is `AI_AGENT`. Standard 3 R3 is where the
only MUST sits: "AI actions MUST be attributable to the same standard as human actions".

## 4. Accountable role

The person accountable for the audit sink (the sink's owner), recorded as `reviewedBy` with the role in
`reviewerRole`. It is not the author of the change under review.

## 5. Invalidation rule

Digest-bound `reviewedAgainst` over the sink, both inventories **and the complete in-scope source set
S**, using `git-blob-set-sha256-v1` (ADR 0011). Stale on any change to a file in S or the addition of a
file to S:

> **Freshness is a separate axis from what the human decided.** (ADR 0011)

A stale approval is `not-evaluated` / `skipped` and establishes nothing.

**This is a requirement the current mechanism does not meet.** The digest covers only the paths listed
in `reviewedAgainst.paths`. A call site or direct write added in a file that is not listed changes
nothing the digest covers, so the approval would stay fresh while clauses (a) and (b) became false. The
detector cannot close that gap today. Freshness must therefore be bound to a tree identity or an
enumerated source set (section 9); until it is, this contract MUST NOT be adopted, and the
detector-dependent behaviour in section 3 is not a substitute.

## 6. Expiry

At most 90 days from `reviewedAt`. The schema has an optional `expires` date and the validator treats a
past `expires` as unreviewed (`scripts/compliance.mjs`), but nothing enforces a maximum age, and
`expires` may be omitted. Enforcing the bound would be a reviewer convention or a new validator check;
neither is chosen here, and the maximum-age row of section 9 covers it. No release-bound invalidation is
proposed: an approval is not tied to a release, only to its digest and its age.

## 7. What the detector's output contributes

Only observations: the event definition it found, and call sites it saw. Detector violations stand and
are never overridden (section 10). A clean detector run is not evidence of attribution at call sites it
cannot see.

## 8. What the contract cannot establish

- Mutations that execute entirely outside S, in components the inventory cannot name, in other repositories or services. Within S, including paths through queues, external APIs and libraries, bypasses are the subject of clause (a) and rest on the reviewer's reading of the mutation-path inventory.
- Truthfulness of the supplied values: a call can supply `actorId` and `correlationId` that are wrong,
  constant or copied.
- That the initiator signal read in clause (c), or the trusted identity and execution context read in
  clause (d), is correct for every run-time request: a reviewer reads code, not traffic, so a constant that
  arrives from outside the code, or a mislabelled agent action at run time, is outside what the review
  proves. This is the residual the owner is asked to accept or reject in section 2.

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
| Bind freshness to the complete source set in scope | Attestation `reviewedAgainst` and the digest mechanism in `scripts/repository.mjs`. Today the digest covers only the listed `paths`, so a file added outside them changes nothing. A tree identity or an enumerated set (for example one produced by the audit-surface locator, #119) whose membership changes when any in-scope file is added would be needed | NOT MADE; without it this contract MUST NOT be adopted |
| Make `reviewedAgainst.paths`, `digest` and `digestAlgorithm` mandatory for an approval under this rule | Schema and `judgeAttestation`. Today `reviewedAgainst` and its digest are optional and freshness state `unrecorded` still establishes the rule (`scripts/compliance.mjs`), so an approval with no digest would stay a pass indefinitely | NOT MADE; without it this contract MUST NOT be adopted |
| Require reviewer role, accountable owner, maximum age and the inventories in the attestation | Attestation schema and/or validator; today only existence, freshness and `expires` are machine-checked | NOT MADE |
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

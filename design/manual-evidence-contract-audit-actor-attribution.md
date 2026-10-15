# Proposal - manual-evidence contract for `audit.actor-attribution` (#128, ST-35)

**Status: proposal for the owner's decision. Nothing here is adopted, implemented or signed.** This
document changes no rule result, catalog entry, schema, script, policy or attestation. Implementation,
if the owner adopts it, is a new item.

## 1. What this proposes, and what it does not

`audit.actor-attribution` is catalogued `code-analysis` with `assurance: none` and `level: required`
(`rules/audit.json`). Its `$assuranceNote` reads "No analyzer exists. Reported as not-evaluated rather
than passing (Standard 24 R4)." The planned detector item (#125) is negative-only and observes the audit
**event definition** only; whether call sites supply attribution is one of its blind spots. This
proposal asks under what contract a human review could establish the part of the rule no detector can:
that every mutation records an actor, an actor type and a correlation or request identifier, and that
agent-initiated changes use an agent actor type.

It does not make the rule attestable, sign or apply an attestation, widen eligibility, or change
aggregate-verdict semantics.

## 2. The claim

The audit sink is called K below, and the in-scope source set S.

> At digest D, over the complete source set S: (a) every mutation path of persistent state routes
> through audit sink K, so none bypasses it, including paths that execute through a queue consumer or a
> library that is part of S; (b) every call to K supplies actorType, actorId and a correlation or request
> identifier, and K persists them unaltered in the recorded event; (c) each entry point derives its actor
> type from the real initiator, so that agent-initiated changes use an agent actor type and human or
> system changes do not; and (d) `actorId` and the correlation or request identifier are derived from the
> runtime identity and execution context of the initiator type (table below), not from constants,
> defaults, source literals or caller-asserted values.

**Boundary of S.** S is every first-party source file of the system that can mutate persistent state,
taken from the repository's tracked files less a committed exclusion policy (generated output, vendored
third-party code, fixtures, documentation, each with its reason). A mutation carried out by a component
outside S, such as an external API with write access, another service or another repository, is a
**precondition failure**: the claim "every mutation path routes through K" would be unreviewed, and the
contract does not establish the rule. Queue consumers and libraries that are part of S are inside it and
are inventoried like any other path.

**Exclusion from clause (a)** uses Standard 3 R1's conjunctive predicate, not the reviewer's discretion:
a path is excluded only if it can be safely reconstructed *and* has none of compliance, security,
operational, historical or business-decision value (`standards/03-auditing.md`, R1). The mutation
inventory states, for each excluded path, that reconstruction and the absence of each kind of value.

**Runtime identity by initiator type** (the review checks each entry point against its row):

| Actor type | `actorId` derived from | Correlation or request id derived from |
| --- | --- | --- |
| `USER`, `ADMIN` | the authenticated session principal | the request id assigned at the edge |
| `API_CLIENT` | the authenticated client credential identity | the request id assigned at the edge |
| `SCHEDULED_JOB` | the scheduler's job identity | the execution or run id of that job |
| `SYSTEM` | a runtime identity supplied by the platform (workload identity or service principal), not a literal in source | that component's operation or execution id |
| `AI_AGENT` | the agent's registered identity from the agent/credential registry | the agent session or run id, plus the initiating principal where one exists |
| `INTEGRATION` | the integration credential identity | the delivery or message id |
| Propagated originator (any type, across a queue, external API or library boundary) | the originating identity carried in an authenticated or signed envelope, or over a trusted internal channel whose integrity the receiver verifies | the originating request or run id carried with it |

An entry point whose initiator type has no source in its row (for example a job with no recorded job
identity) fails clause (d); a constant does not satisfy it. An unauthenticated value copied from a
caller fails clause (d). Attributing a propagated mutation to the downstream integration or system
instead of the originator also fails it.

Clause (a) is what lets a claim about calls to K speak for the catalog requirement, which is that *every
mutation* records actor context (`rules/audit.json`). Clause (c) is reviewed per entry point against the
agent/credential registry (section 3): the reviewer reads how the actor type is set and whether the
initiator signal it uses (authenticated principal, job runner, agent session) can be absent or forged by
the caller.

**Scope of what this can establish.** Clauses (c) and (d) are reviewed as derivations in code: the
reviewer reads, for each entry point, where the actor type, actor id and correlation id come from, and
the tests vary the identity and context and assert the event follows it. That establishes how the
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
| K's signature or schema path | Defines what a call must supply. |
| K's implementation and the persisted event representation (storage schema or serialised form) | Clause (b), second half: attribution is not dropped, rewritten or lost between the call and the stored record. |
| A committed call-site inventory: path, symbol, actor source expression | The subject of clauses (b) and (c); committed, so inside the digest. |
| A mutation-path inventory: for each path, its route to K, or its exclusion under Standard 3 R1's predicate | The subject of clause (a). |
| The agent/credential registry: the mapping from each entry point to its initiator class, and the credentials an agent can use, distinguishable from human ones | The subject of clause (c). It is also the source of the set of actor types the project uses, so the tests below are not derived from the inventory under review. |
| The complete in-scope source set S (as defined in section 2) and its exclusion policy | The claim quantifies over every mutation path and call site, so freshness must cover every file. See section 5. |
| A test for each actor type that appears in the registry, varying the identity and context defined by its row of the table, and reading the persisted event back | Shows actor type, actor id and correlation id follow their sources and survive K (clauses (b)-(d)); see section 8 for why a test is not by itself evidence of the claim. |
| The derivation of actor id and correlation id per entry point (the code that reads the identity and context) | The subject of clause (d). |
| An authoritative ownership record naming the owner of K | Section 4. Inside the digest. |
| The detector's observed event definition (#125, not built) | Cross-checks K's contract only. |

**Detector cross-check is a future capability, not freshness.** #125 observes the audit event
definition; it does not observe call sites, and call-site attribution is a stated blind spot of it.
Nothing in this contract relies on a detector to find an uninventoried call site, and no part of the
digest's freshness depends on one. Mutation-path completeness rests on the reviewer reading S against
the inventory.

Actor types are those of Standard 3 R3 (`USER`, `AI_AGENT`, `SYSTEM`, `SCHEDULED_JOB`, `API_CLIENT`,
`ADMIN`, `INTEGRATION`). The contract's "agent actor type" is `AI_AGENT`. Standard 3 R3 carries the MUST
on attributing AI actions: "AI actions MUST be attributable to the same standard as human actions".

## 4. Accountable role

The person accountable for the audit sink K (its named owner), recorded as `reviewedBy` with the role in
`reviewerRole`. "The change under review" means the change set between the previous attested digest and
D (or, for a first attestation, the introduction of K and the inventories); its author is not the
accountable reviewer.

`reviewedBy` and `reviewerRole` are self-asserted strings in the policy today, and no machine-checkable
record says who owns K. Establishing the role needs an authoritative ownership record among the reviewed
artefacts (section 3) and a validator check that `reviewedBy` appears in it; authenticated successor
events (#95, waiting on #133) prove identity, not role. Both are listed in section 9 as not made.

## 5. Invalidation rule

Digest-bound `reviewedAgainst` over K, both inventories, the registry, the exclusion policy, the
ownership record **and the complete in-scope source set S**, using `git-blob-set-sha256-v1` (ADR 0011).
Stale on any change to a file in S or the addition of a file to S:

> **Freshness is a separate axis from what the human decided.** (ADR 0011)

A stale approval is `not-evaluated` / `skipped` and establishes nothing.

**This is a requirement the current mechanism does not meet in full.** Naming a directory in
`reviewedAgainst.paths` is already tree-bound (`scripts/repository.mjs` resolves `HEAD:<path>`), so a root
path would change when a file is added beneath it. What is missing is an exclusion-aware enumeration:
S is the tracked tree less an exclusion policy, which the mechanism has no notion of. A call site or
direct write added in a file that the listed paths do not cover would otherwise leave the approval fresh
while clauses (a) and (b) became false. Until freshness is bound to S, this contract MUST NOT be adopted.

## 6. Expiry

At most 90 days from `reviewedAt`. The schema has an optional `expires` date and the validator treats a
past `expires` as unreviewed (`scripts/compliance.mjs`), but nothing enforces a maximum age, and
`expires` may be omitted. Enforcing the bound would be a reviewer convention or a new validator check;
neither is chosen here, and the maximum-age row of section 9 covers it. No release-bound invalidation is
proposed: an approval is tied to its digest and its age.

## 7. What the detector's output contributes

Only observations of K's event definition (#125, not built), plus its blind spots, which include call
sites. A detector violation stands and is never overridden (section 10). A clean detector run is not
evidence of attribution at call sites.

## 8. What the contract cannot establish

- Mutations that execute entirely outside S (a precondition failure, section 2).
- That bypass of K inside S has been found: within S, clause (a) rests on the reviewer reading the
  mutation-path inventory against the source, not on a mechanical check.
- That the identity and context read under clause (d), or the initiator signal read under clause (c),
  is correct for every run-time request: a reviewer reads code, not traffic, so a constant that arrives
  from outside the code, or a mislabelled agent action at run time, is outside what the review proves.
  This is the residual the owner is asked to accept or reject in section 2.

Test and CI presence are not evidence for this claim. The `$assuranceNote` records that a detector bound
to test and CI infrastructure was withdrawn because it elevated assurance (Standard 24 R2; issue #62,
closed). That observation was later restored only as audit-only findings carrying no rule binding (#64,
closed; PR #114, merged), and #64 and PR #114 remain separate from this proposal. A test per actor type
(section 3) is an artefact the reviewer reads, not a substitute for the inventories.

Also noted: Standard 3 R2 and R3 word most of this as SHOULD while the catalog level is `required`
(`standards/03-auditing.md`, `rules/audit.json`). That is a standard-versus-catalog policy question for
the owner.

## 9. Exact changes that would be required, each marked NOT MADE

| Change | Where | Status |
| --- | --- | --- |
| Set `attestable: true` on `audit.actor-attribution` | `rules/audit.json`. The field already exists and is validated by `scripts/catalog.mjs`; absent it defaults to `validationType === "manual-review"`. ADR 0005 binding rule 3 already permits an explicit catalog opt-in | NOT MADE |
| Decide whether catalog `assurance` stays `none` | `rules/audit.json`. An approved attestation reports result assurance `full` under `manualReview` (`scripts/compliance.mjs`) | NOT MADE, decision needed |
| Authenticate reviewer identity and authorise the reviewer role before adoption | Depends on #95 and #133 (authenticated successor events) plus an authoritative role record. Today `reviewedBy` and `reviewerRole` are self-asserted strings, so a change author could name themselves the accountable owner and obtain an approval reported with full assurance | NOT MADE; without it this contract MUST NOT be adopted |
| A successor may clear a rejection only if authenticated and independent of the rejected event's subject | #96 / PR #116 (merged) chains successors but does not authenticate them; tied to #133. See section 10 | NOT MADE; without it this contract MUST NOT be adopted |
| Bind freshness to the complete source set in scope | Attestation `reviewedAgainst` and the digest mechanism in `scripts/repository.mjs`: a root path is already tree-bound, but exclusion-aware enumeration (tracked tree less the exclusion policy) is not supported | NOT MADE; without it this contract MUST NOT be adopted |
| Make `reviewedAgainst.paths`, `digest` and `digestAlgorithm` mandatory for an approval under this rule | Schema and `judgeAttestation`. Today `reviewedAgainst` and its digest are optional and freshness state `unrecorded` still establishes the rule (`scripts/compliance.mjs`), so an approval with no digest would stay a pass indefinitely | NOT MADE; without it this contract MUST NOT be adopted |
| Validate `reviewedBy` against the ownership record, and require the record among the reviewed paths | Validator and attestation schema | NOT MADE |
| Require reviewer role, accountable owner, maximum age and the inventories in the attestation | Attestation schema and/or validator; today only existence, freshness and `expires` are machine-checked | NOT MADE |
| Define the formats of the call-site inventory, mutation-path inventory, agent/credential registry and exclusion policy, with owner and change authority | New schema or design document | NOT MADE |
| Update the rule's `$assuranceNote` and Standard 3's Implementation section ("Conformance is established by review.") | `rules/audit.json`, `standards/03-auditing.md` | NOT MADE |
| Versioning impact | Standard 21 R2 sets levels by the effect on a currently compliant project and does not classify attestation eligibility. Classification and `VERSION` are the owner's | NOT MADE, not classified |

The owner has stated that eligibility must not be widened merely to reach COMPLIANT. The opt-in is
presented only as ADR 0010's positive-evidence clause, for separate approval and by the same path as the
provider-neutral contract (#127).

## 10. Negative case: rejected, stale, contradicted

A contract never overrides a detector violation or a recorded rejection. From `scripts/compliance.mjs`
(`judgeAttestation`), in order:

1. A non-attestable rule with an attestation is `invalid-attestation`.
2. A detector finding yields `contradicted-attestation`; ADR 0005, binding rule 1: "An attestation cannot
   override an automated failure."
3. A `rejected` attestation yields `attested-rejected` / failed, evaluated before expiry and freshness.
   **This holds only while the rejection is the terminal event of the review history.** Today a later
   `approved` successor with a fresh digest supersedes it: PR #116 (for #96) made the chain explicit but
   authenticates nothing, so a self-asserted approved successor clears a rejection. Section 9 therefore
   requires that a successor clear a rejection only if authenticated and independent of the rejected
   event's subject, tied to #133.
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
  new inventory), who may author it (section 10), and ADR 0010's open questions on rejection expiry and
  detector override.

Both record a completion dependency on #133 (owner comments of 2026-10-12).

## 13. Owner decision

Not recorded. Options: adopt, amend, decline. The decision belongs on #128; implementation, if adopted,
is a new item.

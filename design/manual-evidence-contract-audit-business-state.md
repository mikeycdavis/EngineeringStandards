# Proposal - manual-evidence contract for `audit.business-state` (#129, ST-36)

**Status: proposal for the owner's decision. Nothing here is adopted, implemented or signed.** This
document changes no rule result, catalog entry, schema, script, policy or attestation. Implementation,
if the owner adopts it, is a new item.

## 1. What this proposes, and what it does not

`audit.business-state` is catalogued `code-analysis` with `assurance: none` and `level: required`
(`rules/audit.json`). Its `$assuranceNote` records that a detector once bound to it observed only test and
CI infrastructure, and was withdrawn because it elevated assurance (Standard 24 R2, issue #62). The
planned detector item (#126) is negative-only: it reports mutation sites observed with no audit
mechanism anywhere in the repository, and keeps the rule not-evaluated, because "business-relevant" and
"safely reconstructable" are classifications no repository states. This proposal asks under what
contract a human review could establish what no detector can: that the listed mutation entry points are
the only writers of persistent business state, each records an audit event, and the excluded stores are
justified as derived or transient.

It does not make the rule attestable, sign or apply an attestation, widen eligibility, or change
aggregate-verdict semantics.

## 2. The claim

The audit sink is called K below, and the in-scope source set Z.

> At digest D, over the complete source set Z (defined below): the mutation entry points listed in the
> committed inventory are the only writers of persistent business state; **for each entry point**, the
> mutation and the recording of its audit event succeed or fail together (or the event is written
> transactionally to a durable outbox that guarantees it is eventually recorded) through sink K; K
> durably retains each accepted event; each emitted event carries the minimum payload that records
> *what changed*, as approved by the reviewer for that entry point's mutation category; and the stores
> excluded as derived or transient are listed with their reconstruction rationale under the full
> exclusion predicate of Standard 3 R1.

**Boundary of Z.** Z is limited to the attested repository: ADR 0011's freshness and `reviewedAgainst`
are defined over one Git root, so this contract cannot digest a second repository. Within that
repository, Z is not whatever directory the reviewer chose, and it is not derived from the inventory it
is meant to check. Z is every tracked file of the attested repository less a committed exclusion policy; which files can write a declared store is a reading task within Z, not a filter on Z (an artefact is capable if it holds that store's connection, credentials or schema, or calls an artefact that does). Migration utilities, administrative and maintenance scripts and generated persistence code are inside Z. The exclusion policy excludes a class only after it is established, per entry with its reason, that the class cannot perform such writes; generated output, vendored third-party code, fixtures and documentation qualify only on that basis, never categorically.

*Independent* means: a committed artefact that exists for another purpose and is maintained separately
from the mutation inventory, and is not generated from it, for example deployment manifests,
infrastructure-as-code, or a data-store ownership declaration. It is an artefact in section 3 and is
inside the digest. If the repository has no such declaration, the contract is unusable for it: the
component-and-store universe would be whatever the inventory says, which is circular.

The inventory is reconciled against that declaration: every store and component it names appears in the
inventory as a writer entry or as an exclusion with rationale. An omitted store or component is a reconciliation failure, not something that falls outside Z.

The declaration's own completeness is a mandatory, reviewed statement, sourced from an independent committed record (infrastructure-as-code resource inventory, data-ownership register), that no other business store or writer exists. If that statement cannot be made, approval is blocked.

**Precondition failure, not an exclusion.** Writers outside the attested repository (another service,
another repository, an external API with write access) are a precondition failure: the claim "the only
writers" would be unreviewed, and the rule is not established by this contract. Mutations through
libraries and queue consumers that are part of Z are inside it and inventoried like any other writer.

**Durable retention and atomicity.** K must durably record each accepted event in a store that is queryable for reconstruction, for a retention horizon stated in a committed retention-policy artefact that names its derivation from the project's retention or compliance record (the floor). K's configured retention must be at least that horizon, and a deployed-retention snapshot, machine-captured with a captured-at timestamp, is reconciled to it. A sink that deletes events after seconds satisfies a no-retention test and not this requirement. A mutation must not commit without its audit record: either recording and
mutation succeed or fail together, or the event is written transactionally to a durable outbox that
guarantees the original event is eventually recorded. "The failure is recorded and surfaced" is not
enough, because the state change would then stand with no reconstructable audit record. A sink that is
a no-op, or that logs to an ephemeral stream with no retention, does not satisfy the claim even if every
entry point calls it. Atomicity is assessed per entry point, because transaction scope belongs to the
entry point, not to the sink.

**Minimum payload.** The catalog's remediation is to "record business mutations through an audit path
that captures what changed" (`rules/audit.json`). An event that carries only an identifier does not do
that. The project must define the fields an event needs to reconstruct the change for each **mutation
category** in the inventory (Standard 3 R2 requires a project to "decide and record which fields are
mandatory for it", and lists `entityType`, `entityId`, `action`, `before`, `after` and `reason` among
candidates). The reviewer approves that minimum for each category, recorded in the review evidence, and it must meet an objective floor: every persisted field the entry point changes is recoverable from the event as before and after, or as a changed-field set with its value (Standard 3 R5 markers excepted), and the per-entry-point test diffs stored state against the event for each mutated column; an underspecified minimum (for example only `entityId` and a generic `updated` action for a
mutation that changes several fields) is rejected, and if the reviewer cannot approve it the contract
does not establish the rule. For credentials, tokens and personal data, Standard 3 R5 requires the
event to record that the value changed without reproducing it: the payload definition names those
fields and specifies a change marker or redaction, and the test accepts the marker and fails if the
raw value appears.

**Exclusions.** The exclusion predicate is Standard 3 R1's, which is narrower than the catalog's wording
and governs. Data is excludable only when it can be safely reconstructed *and* has none of: compliance,
security, operational, historical or business-decision value (`standards/03-auditing.md`, R1: "The
exclusion is narrow and conjunctive"). The catalog description (`rules/audit.json`) is shorter
("compliance, security, or business-history value"); that wording drift is a separate catalog matter and
is not relied on here.

## 3. Artefact list

| Artefact | Why |
| --- | --- |
| The committed inventory: path, symbol, store, **mutation category**, emitted event, or exclusion rationale | The subject of the claim; committed, so inside the digest. The category column ties each entry to its approved minimum payload. |
| The independent component-and-store declaration (deployment manifests, infrastructure-as-code or data-ownership declaration) | Defines the universe Z and the reconciliation target. Inside the digest. |
| The complete in-scope source set Z (as defined in section 2) and its exclusion policy | The claim quantifies over *the only* writers, so freshness must cover every file. See section 5. |
| K's source and persistence configuration (store, retention, outbox behaviour) | Shows what "durably retains" means. Inside the digest. |
| A retention test for K showing an accepted event is retrievable, including across the retention policy boundary (an event at the horizon is still retrievable; expiry and deletion follow the approved policy), and a test per entry point showing mutation and recording succeed or fail together (or reach the outbox) | Reviewer-read aids for durable retention and per-entry-point atomicity; not by themselves evidence (section 8). Committed files, so inside the digest. |
| The project's recorded minimum event payload per mutation category (Standard 3 R2), including its redaction rules (R5) | Defines what "captures what changed" means. Inside the digest. |
| A test per listed entry point asserting the minimum payload (changed fields and their values, or the marker for sensitive fields), not just that K was called | Shows the emitted event carries what the minimum requires. |
| An authoritative ownership record naming the owner of the system's data or domain | Section 4. Inside the digest. |
| The detector's mutation-site observations (#126, not built) | Cross-check input only (below). |

Artefacts that are committed files are named in `reviewedAgainst.paths`; detector output is generated and is cited in the attestation evidence, not as a reviewed path.

**Detector cross-check is a future capability, not freshness.** #126 would report mutation sites it
observes with no audit mechanism anywhere. It does not report a site that is merely missing from the
inventory, and it recognises only some mutation shapes; its clean run is not completeness evidence.
Nothing in this contract relies on a detector to keep the attestation current. Completeness of the
inventory rests on the reviewer reading Z against the independent declaration. It shares the sink and
inventory design of the sibling contract for `audit.actor-attribution` (#128).

## 4. Accountable role

The owner of the system's data or domain, recorded as `reviewedBy` with the role in `reviewerRole`.
"The change under review" means the change set between the previous attested digest and D (or, for a
first attestation, the introduction of K and the inventory); its author is not the accountable reviewer. Enforcing that needs authoritative revisions and authenticated authors (section 9), because a content digest does not identify who wrote the change. The ownership record is read at the computed base revision (section 9), where it must already exist, or from an owner-controlled path with its own named change authority; it is never read from the head under review, so the change author cannot edit who the owner is. If the accountable owner authored the change, a named delegate of that role reviews it (section 9); a renewal with an empty change set has no author conflict.

`reviewedBy` and `reviewerRole` are self-asserted strings in the policy today, and no machine-checkable
record says who owns the data or domain. Establishing the role needs an authoritative ownership record
among the reviewed artefacts (section 3) and a validator check that `reviewedBy` appears in it;
authenticated successor events (#95, waiting on #133) prove identity, not role. Both are listed in
section 9 as not made.

## 5. Invalidation rule

Digest-bound `reviewedAgainst` over every artefact the claim depends on: the inventory, the independent
declaration, K's source and persistence configuration, the minimum payload definition and redaction rules, the retention, atomicity and payload tests, the completeness statement, the exclusion policy, the ownership record, **and the complete in-scope source set Z**, using
`git-blob-set-sha256-v1` (ADR 0011). Stale on any change to a file in Z or the addition of a file to Z:

> **Freshness is a separate axis from what the human decided.** (ADR 0011)

A stale approval is `not-evaluated` / `skipped` and establishes nothing.

**This is a requirement the current mechanism does not meet in full.** Naming a directory in
`reviewedAgainst.paths` is already tree-bound (`scripts/repository.mjs` resolves `HEAD:<path>`), so a named directory would change when a file is added beneath it (the repository root itself cannot be named, because it contains `project-policy.yml`, which records the digest). What is missing is an exclusion-aware enumeration:
Z is the tracked tree less an exclusion policy, which the mechanism has no
notion of. A writer added in a new or uninventoried file that the listed paths do not cover would
otherwise leave the approval fresh while "the listed entry points are the only writers" became false;
the detector does not close that gap (it is not built, recognises only some mutation shapes, and a
clean run is not completeness evidence). Until freshness is bound to Z, this contract MUST NOT be adopted.

**A recorded digest is also required.** Today `reviewedAgainst` and its digest are optional, and
freshness state `unrecorded` still establishes the rule (`scripts/compliance.mjs`). An approval with no
digest would never go stale, so section 9 lists mandatory paths, digest and algorithm for this rule.

## 6. Expiry

At most 90 days from `reviewedAt`. The schema has an optional `expires` date and the validator treats a
past `expires` as unreviewed (`scripts/compliance.mjs`), but nothing enforces a maximum age, and
`expires` may be omitted. Enforcement would be a reviewer convention or a new validator check; neither
is chosen here. No release-bound invalidation is proposed: an approval is tied to its digest and its
age.

## 7. What the detector's output contributes

Only observations of mutation sites with no audit mechanism anywhere, plus its blind spots (#126, not
built). A detector violation stands and is never overridden (section 10). A clean run is not evidence
that every writer is listed.

## 8. What the contract cannot establish

- Writers outside the attested repository: a precondition failure (section 2), not something the
  contract establishes. Writers inside Z, including those through libraries and queue consumers, are
  reviewed as part of the writer inventory.
- Completeness beyond the reviewer's reading: the reviewer reconciles the inventory against the
  independent declaration and reads Z, but a reviewer's reading is not a proof that no writer was
  missed.
- Sufficiency beyond the reviewer's judgement: the reviewer approves the minimum per mutation category
  (section 2), but that approval is not a proof that state can be reconstructed from the recorded fields
  in every case.
- That an excluded store really is derived or transient; the rationale is a reviewer judgement against
  Standard 3 R1's predicate.

Standard 24 R2's worked example of an elevation to avoid is the summary line "PASS: all business
mutations are audited" (`standards/24-validator-rules.md`, R2); the claim text above is written to avoid
saying that. Test and CI presence are not evidence for this claim (issue #62's criterion). Their
observation was restored by PR #83 as audit-only findings with no rule binding; #64 and PR #114 (a later correction) remain separate from this proposal. Standard 3 itself says
"`audit.business-state` is reported not-evaluated" and "Conformance is established by review"
(`standards/03-auditing.md`, Implementation); the latter is a statement about practice, not a framework
definition of review as the establishing mechanism.

## 9. Exact changes that would be required, each marked NOT MADE

| Change | Where | Status |
| --- | --- | --- |
| Set `attestable: true` on `audit.business-state` | `rules/audit.json`. The field already exists and is validated by `scripts/catalog.mjs`; absent it defaults to `validationType === "manual-review"`. ADR 0005 binding rule 3 already permits an explicit catalog opt-in | NOT MADE |
| Whether `assurance` moves from `none` | `rules/audit.json`. An approved attestation reports result assurance `full` under `manualReview` (`scripts/compliance.mjs`); the static catalog value is a separate claim (Standard 27 R3) | NOT MADE, decision needed |
| Authenticate reviewer identity and authorise the reviewer role before adoption | Depends on #95 and #133 (authenticated successor events) plus an authoritative role record. Today `reviewedBy` and `reviewerRole` are self-asserted strings, so a change author could name themselves the accountable owner and obtain an approval reported with full assurance | NOT MADE; without it this contract MUST NOT be adopted |
| A successor may clear a rejection only if authenticated and independent of the rejected event's subject | #96 / PR #116 (merged) chains successors but does not authenticate them; tied to #133. See section 10 | NOT MADE; without it this contract MUST NOT be adopted |
| Enforce reviewer-author separation | Add a distinct, mandatory base-revision field to `reviewedAgainst` (today `revision` and `tree` identify one reviewed commit and its tree, not two endpoints; they are mandatory only on successor events per `scripts/reviews.mjs`, and recorded rather than verified). The validator computes the base itself and compares the recorded value with it: for a genesis attestation it is the parent of the earliest first-parent commit that touches any reviewed path; for a renewal it is the previous event's revision, verified to be an ancestor of head whose tree and digest match that event. A reviewer-recorded value is never trusted on its own. Revision, tree and the base revision are mandatory on every event under this rule, genesis included. Derive the authors of the commits between base and head from the repository, authenticate those authors and the reviewer (#95, #133), and reject an approval whose reviewer identity appears among the authors. A content digest does not identify commits or authors, so identity authentication alone cannot prevent an owner approving their own change | NOT MADE; without it this contract MUST NOT be adopted |
| Bind freshness to the complete source set in scope, as the enumerated list of every tracked path (excluded classes included, so a file added under an excluded directory also invalidates the approval; exclusions narrow what the reviewer reads, not what invalidates) |  Attestation `reviewedAgainst` and the digest mechanism in `scripts/repository.mjs`: a root path is already tree-bound, but exclusion-aware enumeration (tracked tree less the exclusion policy) is not supported | NOT MADE; without it this contract MUST NOT be adopted |
| Make `reviewedAgainst.paths`, `digest` and `digestAlgorithm` mandatory for an approval under this rule | Schema and `judgeAttestation`. Today `reviewedAgainst` and its digest are optional on a genesis event (successor events must carry them, `scripts/reviews.mjs`) and freshness state `unrecorded` still establishes the rule (`scripts/compliance.mjs`), so an approval with no digest would stay a pass indefinitely | NOT MADE; without it this contract MUST NOT be adopted |
| ADR 0010 accepted, with the framework defining human review as the establishing mechanism for this rule | ADR 0010 is Proposed. ADR 0005 binding rule 3's explicit catalog opt-in is necessary but not sufficient on its own | NOT MADE; without it this contract MUST NOT be adopted |
| Read the ownership record from the previous attested revision (or the default branch), not from the head under review, with a stated change authority for it | Validator and attestation schema. Otherwise the change author can edit who the owner is in the same change | NOT MADE; without it this contract MUST NOT be adopted |
| Define a delegate path for the accountable role when the owner authored the change, and the rule for an empty change set | Policy and validator | NOT MADE |
| Validate `reviewedBy` against the ownership record, and require the record among the reviewed paths | Validator and attestation schema | NOT MADE |
| Require reviewer role, accountable owner, maximum age and inventory in the attestation | Attestation schema and/or validator; today only existence, freshness and `expires` are machine-checked | NOT MADE |
| Define the committed mutation inventory format, including the mutation-category column, and the format, owner and change authority of the independent declaration, exclusion policy and minimum payload definition | New schema or design document | NOT MADE |
| Add a committed retention-policy artefact (horizon, derivation from the project's retention or compliance record), require K's configured retention to be at least that horizon, and capture a deployed-retention snapshot with a `capturedAt` timestamp not older than the maximum age | Attestation evidence and validator; no such field exists today | NOT MADE; without it this contract MUST NOT be adopted |
| Update the `$assuranceNote` and Standard 3's Implementation section | `rules/audit.json`, `standards/03-auditing.md` | NOT MADE |
| Versioning impact | Standard 21 R2 sets levels by the effect on a currently compliant project and does not classify attestation eligibility. Classification and `VERSION` are the owner's | NOT MADE, not classified |

Issue #127 records the owner's statement that eligibility must not be widened merely to reach COMPLIANT. The opt-in is
presented only as ADR 0010's positive-evidence clause, for separate approval.

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
- **#96 (ST-18, rejection clearing).** A rejected business-state finding needs a corrective successor to
  clear it. Answers needed: what a successor must show (re-review against a new digest including new
  inventory entries), who may author it (section 10), and ADR 0010's open questions on rejection expiry
  and detector override.

Both record a completion dependency on #133 (owner comments of 2026-10-12).

## 13. Owner decision

Not recorded. Options: adopt, amend, decline. The decision belongs on #129; implementation, if adopted,
is a new item.

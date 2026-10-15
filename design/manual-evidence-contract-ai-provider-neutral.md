# Proposal - manual-evidence contract for `ai.provider-neutral` (#127, ST-34)

**Status: proposal for the owner's decision. Nothing here is adopted, implemented or signed.** This
document changes no rule result, catalog entry, schema, script, policy or attestation. Implementation,
if the owner adopts it, is a new item.

## 1. What this proposes, and what it does not

`ai.provider-neutral` is catalogued `code-analysis` with `assurance: none` and `level: required`
(`rules/ai.json`). No analyzer evaluates it today, so it is reported not-evaluated. The planned detector
item (#124) is a partial, negative-only detector that reports coverage and blind spots and never PASSes
it. This proposal asks one question: under what contract could a human review establish the part of the
rule that no detector can, namely that provider-specific SDK, HTTP-endpoint and model-identifier usage is
confined to named adapter modules.

It does not make the rule attestable, sign or apply an attestation, widen eligibility, or change
aggregate-verdict semantics.

## 2. The claim

> At digest D, over the complete source set S in scope, provider-specific SDK, HTTP-endpoint and
> model-identifier usage is confined to the listed adapter modules [paths]; no other module in S
> references a provider; and no module outside the adapters consumes a provider-specific type,
> response shape, error type or option name that an adapter exposes.

The third clause exists because confinement of *names* is not what the catalog requires. The rule's
description is that "model providers sit behind an abstraction so capabilities remain stable when the
model changes" (`rules/ai.json`). An adapter that returns a provider's response object satisfies a
name-confinement claim while leaving business logic coupled to that provider. The claim is about the
repository content named by D and nothing else: not runtime behaviour, deploy-time configuration, or
other repositories.

**Scope of what this can establish.** Even with the third clause, the contract establishes the claim,
which is a review of structure at one digest. Whether the abstraction would in fact keep capabilities
stable if the model changed is a prediction no review at one digest proves. Whether an approved claim
should be allowed to establish the whole rule, with the full assurance an attestation reports, is the
owner's question under ADR 0010 and is not answered here; the narrower reading is that the contract
supports partial evidence only and the rule stays not-evaluated.

## 3. Artefact list

The review MUST cite, and the attestation's `reviewedAgainst.paths` MUST name:

| Artefact | Why |
| --- | --- |
| The adapter path list (the modules permitted to name a provider) | It is the subject of the claim. It must be a committed file, so it is inside the digest. |
| The adapters' exported interfaces (the types and functions business logic is allowed to see) | The third clause of the claim is reviewed against these: the reviewer checks that none exposes a provider-specific type, response shape, error type or option. |
| The complete in-scope source set S (an enumeration or tree identity, not a hand-picked list) | The claim quantifies over "no other module", so freshness must cover every module, not only the adapters. See section 5. |
| The detector's observation output (provider-import evidence), once #124 exists | Every observed file is either in the adapter list or justified in the review evidence. |
| The dependency manifest (for example `package.json`, `requirements.txt`) | Shows which provider SDKs are installed at all; an SDK absent from the detector's list is visible here. |

The adapter list is a *declaration*, and its vocabulary must be the one Standard 51 R2 already defines:
an "architectural boundary" is one explicitly declared by the repository's architecture manifest or
standards configuration (`standards/51-architecture-integrity.md`, R2). This contract refers to that
declaration and MUST NOT invent a second one. Where the declaration should physically live is still open
(Standard 51 R2 says `project-policy.yml` holds no boundary field today, and #112 / PR #113 and
#148 / PR #147 are unmerged); this proposal does not choose.

## 4. Accountable role

The project's named architecture owner, recorded as `reviewedBy` in the policy attestation, with the role
in `reviewerRole` (a field added by #95's merged work, PR #115). The commit author of the change under
review is not the accountable reviewer.

## 5. Invalidation rule

Digest-bound `reviewedAgainst` over the adapter paths, the dependency manifest **and the complete
in-scope source set S**, using the `git-blob-set-sha256-v1` mechanism of ADR 0011. A change to any file in
S, or the addition of a file to S, makes the approval stale:

> **Freshness is a separate axis from what the human decided.** (ADR 0011)

A stale approval is `not-evaluated` / `skipped` and establishes nothing.

**This is a requirement the current mechanism does not meet.** The digest covers only the paths listed in
`reviewedAgainst.paths`. A new module that adds a raw provider endpoint or a model identifier, in a file
that is not listed, changes nothing the digest covers, so the approval would stay fresh while the claim
"no other module references a provider" became false. The detector cannot close that gap: it is not
built, and its blind spots include exactly raw endpoints and model identifiers. Binding freshness to S
therefore needs a tree identity or an enumerated source set (section 9). Until that exists this
contract MUST NOT be adopted; listing only the adapters and the manifest is not a sufficient
approximation.

## 6. Expiry

Proposed maximum age: 180 days from `reviewedAt`. The schema has an optional `expires` date
(`schemas/project-policy.schema.json`) and the validator treats an attestation past `expires` as
unreviewed again (`scripts/compliance.mjs`, `judgeAttestation`), but nothing enforces a *maximum* age and
`expires` may be omitted. A 180-day ceiling would be either a reviewer convention or a new validator
check; this proposal does not choose, and marks both as not made.

## 7. What the detector's output contributes

The detector (#124, not built) can contribute observations only: provider imports it recognised, the
files they occur in, and its stated blind spots. A detector finding is a violation and is never
overridden by an attestation (section 10). An absence of findings is not evidence of confinement,
because the blind spots below are exactly what it cannot see.

## 8. What the contract cannot establish

- Raw HTTP calls to a provider endpoint written without an SDK, and endpoints assembled at runtime.
- Model identifiers and prompt formats embedded in code, configuration or data files.
- SDKs outside the detector's recognised list.
- Dynamic loading, plugin systems, subprocess invocations and shelling out to provider CLIs.
- Runtime provider selection driven by configuration or environment.
- Whether the abstraction would actually keep capabilities stable under a model change; the third clause
  checks that no provider-specific shape crosses the interface, not that the interface is well chosen.
- Behaviour of any other repository or service the project calls.

A reviewer who has examined these still produces a claim limited to the artefacts and set S. The claim
text says "confined to the listed adapter modules", not "provider neutral".

Also noted: Standard 1 R4 words provider neutrality as SHOULD, while the catalog level is `required`
(`rules/ai.json`). Establishing a `required` rule from SHOULD wording is a standard-versus-catalog policy
question for the owner; this contract does not resolve it.

## 9. Exact changes that would be required, each marked NOT MADE

| Change | Where | Status |
| --- | --- | --- |
| Set `attestable: true` on `ai.provider-neutral` | `rules/ai.json`. The field already exists and is validated by `scripts/catalog.mjs`; absent it defaults to `validationType === "manual-review"` | NOT MADE |
| Decide whether catalog `assurance` stays `none` | `rules/ai.json`. An approved attestation reports result assurance `full` under `manualReview` (`scripts/compliance.mjs`), which disagrees with a static `none` | NOT MADE, decision needed |
| Bind freshness to the complete source set in scope | Attestation `reviewedAgainst` and the digest mechanism in `scripts/repository.mjs`. Today the digest covers only the listed `paths`, so a file added outside them changes nothing. A tree identity or an enumerated set (for example one produced by the audit-surface locator, #119) whose membership changes when any in-scope file is added would be needed | NOT MADE; without it this contract MUST NOT be adopted |
| Make `reviewedAgainst.paths`, `digest` and `digestAlgorithm` mandatory for an approval under this rule | Schema and `judgeAttestation`. Today `reviewedAgainst` and its digest are optional and freshness state `unrecorded` still establishes the rule (`scripts/compliance.mjs`), so an approval with no digest would stay a pass indefinitely | NOT MADE; without it this contract MUST NOT be adopted |
| Require reviewer role, accountable owner and a maximum age for this rule | Attestation schema and/or validator; today only existence, freshness and `expires` are machine-checked | NOT MADE |
| Declare the adapter list in a boundary declaration | Per Standard 51 R2; location unresolved | NOT MADE |
| Describe the contract in the rule's `$assuranceNote` and in Standard 1 R4's implementation note | `rules/ai.json`, `standards/01-human-and-ai-operability.md` | NOT MADE |
| Versioning impact | Standard 21 R2: widening attestation eligibility changes what a project can reach; a MAJOR candidate. Classification and `VERSION` are the owner's | NOT MADE, not classified |

The owner has stated that eligibility must not be widened merely to reach COMPLIANT. The opt-in above is
presented only as the positive-evidence clause of ADR 0010, for separate approval.

## 10. Negative case: rejected, stale, and contradicted

From `scripts/compliance.mjs` (`judgeAttestation`), in evaluation order:

1. If the rule is not attestable, any attestation is `invalid-attestation` (a failure about the policy,
   not about the requirement; the situation ADR 0010 describes).
2. If a detector produced a finding for the rule, the result is `contradicted-attestation` and the
   failure stands. ADR 0005, binding rule 1: "An attestation cannot override an automated failure."
3. A `rejected` attestation yields `attested-rejected` / failed, and is returned before expiry and
   freshness are consulted (ADR 0010 records this asymmetry as an undecided question).
4. An approved attestation that is expired or stale returns the rule to `not-evaluated`; it is not a
   failure and it does not establish the rule.

So a rejected attestation is a recorded failure, a stale or expired approval establishes nothing, and the
detector's violation is never overridden by any attestation.

## 11. Relationship to ADR 0010 and ADR 0011

ADR 0010 is **Proposed**, not Accepted (`artifacts/adr/0010-human-review-may-always-contribute-negative-evidence.md`,
status line). This contract would rely on its second sentence, and therefore depends on that ADR being
accepted:

> Human review may contribute positive evidence only where the framework explicitly defines human review
> as the establishing mechanism.

Adopting this contract is what would explicitly define human review as the establishing mechanism for
this rule. ADR 0010's first sentence (negative evidence is always permitted) is not what this contract
needs.

ADR 0011 supplies the invalidation mechanism, and its event rule applies: re-review appends and never
rewrites ("No operation that records a new review may alter or delete any previously recorded review
event.").

## 12. Interaction with #95 and #96

- **#95 (ST-17, renewal).** Renewal of a stale approval under this contract needs #95's authenticated
  append-only successor events. PR #115 delivered the immutability and queryability criteria; the
  authenticated-successor criteria wait for #133 and the issue stays open. Answer needed: how a successor
  event is authenticated, because "the accountable owner is not the commit author" is checkable only if
  reviewer identity is authenticated. Until then the accountable-role requirement is a recorded claim,
  not a verified one.
- **#96 (ST-18, rejection clearing).** A rejection under this contract (a reviewer found a provider leak)
  needs a corrective successor to clear it. Answers needed: what a corrective successor must show for this
  rule (re-review against a new digest of the same artefacts), and the questions ADR 0010 leaves open
  about whether a rejection expires and whether later detector evidence overrides it.

Both items record a completion dependency on #133 (owner comments of 2026-10-12).

## 13. Owner decision

Not recorded. Options: adopt, amend, decline. The decision belongs on #127; this document does not record
or imply one.

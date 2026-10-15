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

> At digest D, over the complete source set S (defined below), the **statically visible** provider-specific
> SDK, HTTP-endpoint and model-identifier usage, and **literal** prompt-format usage, is confined to the
> listed adapter modules [paths]; no other module in S references a provider; and no module outside the
> adapters consumes a provider-specific type, response shape, error type or option name that an adapter
> exposes.

"Statically visible" means a reference that appears as source text in S (an import, a declared
dependency, a string literal, a typed value). "Literal" means a prompt-format marker that appears as
text in S rather than being assembled at run time.

**Provider-specific** means: an SDK, client library, HTTP endpoint, model identifier, prompt dialect,
response shape, error type or option name that belongs to one model provider or to a service that fronts
providers. Aggregator and gateway libraries (for example LiteLLM, LangChain, OpenRouter clients) are
provider surfaces for this claim: a module outside the adapters that imports one is a reference to a
provider, unless that gateway is itself the declared adapter layer, in which case its types are subject
to the third clause like any adapter's.

**Definition of S.** S is derived, not chosen by the reviewer: every file the repository tracks
(`git ls-files` at D), less the paths matched by a committed exclusion policy that lists each excluded
class (generated output, vendored third-party code, fixtures, documentation) with its reason. A package
or directory that is not excluded by that policy is in S whether or not the reviewer opened it. The
exclusion policy and the ownership record (section 4) are artefacts inside the digest. An exclusion that
covers a path containing first-party application code is a defect the reviewer must reject.

**Precondition failure, not an exclusion.** If any module in S consumes provider-facing code that lives
outside S (a shared internal package, a vendored fork, another repository that exposes provider types),
the contract cannot speak for the system and the rule is not established by it. The claim is about the
repository content named by D and nothing else: not run-time behaviour, deploy-time configuration, or
other repositories.

The third clause exists because confinement of *names* is not what the catalog requires. The rule's
description is that "model providers sit behind an abstraction so capabilities remain stable when the
model changes" (`rules/ai.json`). An adapter that returns a provider's response object satisfies a
name-confinement claim while leaving business logic coupled to that provider.

**Scope of what this can establish.** The contract establishes the claim, which is a review of structure
at one digest. Whether the abstraction would in fact keep capabilities stable if the model changed is a
prediction no review at one digest proves. Whether an approved claim may establish the whole rule, with
the full assurance an attestation reports, is the owner's question under ADR 0010 and is not answered
here. If the owner declines that treatment, the contract is not opted into (section 9 lists the
alternative of a distinct non-establishing result as not made).

## 3. Artefact list

The review MUST cite, and the attestation's `reviewedAgainst.paths` MUST name:

| Artefact | Why |
| --- | --- |
| The adapter path list (the modules permitted to name a provider), with the named provider-neutral interface each adapter implements | It is the subject of the claim; committed, so inside the digest. The list MUST contain only integration-layer modules: modules whose whole purpose is translating between a provider's API and the project's neutral interface, containing no capability or business logic. The reviewer rejects a list that names application or domain modules, because declaring every provider-coupled module an adapter would make "no other module" and the third clause vacuously true. |
| The adapters' exported interfaces (the types and functions business logic is allowed to see) | The third clause is reviewed against these: none exposes a provider-specific type, response shape, error type or option. |
| The complete in-scope source set S (derived as in section 2) and its committed exclusion policy | The claim quantifies over "no other module", so freshness must cover every module. See section 5. |
| An authoritative ownership record naming the architecture owner (for example the project manifest's owner section or a CODEOWNERS entry for the adapter paths) | Section 4: `reviewedBy` is validated against it. Inside the digest. |
| The detector's observation output (provider-import evidence), once #124 exists | Every observed file is either in the adapter list or justified in the review evidence. A cross-check, not freshness. |
| The dependency manifest (for example `package.json`, `requirements.txt`) | Shows which provider SDKs are declared; an SDK absent from the detector's list is visible here. |

The adapter list is a *declaration*, and its vocabulary must be the one Standard 51 R2 already defines
(on develop since PR #146): an "architectural boundary" is one explicitly declared by the repository's
architecture manifest or standards configuration (`standards/51-architecture-integrity.md`, R2). This
contract refers to that declaration and MUST NOT invent a second one. Where the declaration should
physically live is still open: Standard 51 R2 says `project-policy.yml` holds no boundary field today, and
the boundary-declaration work (#148 / PR #147) is unmerged. This proposal does not choose.

## 4. Accountable role

The project's named architecture owner, recorded as `reviewedBy` in the policy attestation, with the role
in `reviewerRole` (a field added by #95's merged work, PR #115). "The change under review" means the
change set between the previous attested digest and D (or, for a first attestation, the introduction of
the adapter layer); its author is not the accountable reviewer.

`reviewedBy` and `reviewerRole` are assertions in the policy today, and nothing identifies who the
architecture owner is. Establishing the role needs an authoritative ownership record among the reviewed
artefacts (section 3) and a validator check that `reviewedBy` appears in it; authenticated successor
events (#95, waiting on #133) prove identity, not role. Both are listed in section 9 as not made.

## 5. Invalidation rule

Digest-bound `reviewedAgainst` over the adapter paths, the dependency manifest, the exclusion policy, the
ownership record **and the complete in-scope source set S**, using the `git-blob-set-sha256-v1`
mechanism of ADR 0011. A change to any file in S, or the addition of a file to S, makes the approval
stale:

> **Freshness is a separate axis from what the human decided.** (ADR 0011)

A stale approval is `not-evaluated` / `skipped` and establishes nothing.

**This is a requirement the current mechanism does not meet in full.** Naming a directory in
`reviewedAgainst.paths` is already tree-bound (`scripts/repository.mjs` resolves `HEAD:<path>`), so a
root path would change when a file is added beneath it. What is missing is an exclusion-aware
enumeration: S is the tracked tree less an exclusion policy, and the mechanism has no notion of that
policy. Listing only the adapters and the manifest is not a sufficient approximation: a new module with a
raw provider endpoint or model identifier, in a file not covered by the listed paths, would leave the
approval fresh while "no other module references a provider" became false, and the detector cannot close
that gap (it is not built, and raw endpoints and model identifiers are among its blind spots). Until
freshness is bound to S, this contract MUST NOT be adopted.

## 6. Expiry

Proposed maximum age: 180 days from `reviewedAt`. This is longer than the 90 days proposed for the audit
contracts (#128, #129) on the reasoning that the adapter boundary changes more slowly than call sites
and mutation inventories; the owner may align them, and nothing here depends on the difference. The
schema has an optional `expires` date (`schemas/project-policy.schema.json`) and the validator treats an
attestation past `expires` as unreviewed again (`scripts/compliance.mjs`, `judgeAttestation`), but
nothing enforces a *maximum* age and `expires` may be omitted. A ceiling would be either a reviewer
convention or a new validator check; this proposal does not choose.

## 7. What the detector's output contributes

The detector (#124, not built) can contribute observations only: provider imports it recognised, the
files they occur in, and its stated blind spots. A detector finding is a violation and is never
overridden by an attestation (section 10). An absence of findings is not evidence of confinement,
because the blind spots below are exactly what it cannot see.

## 8. Within the claim, and what it cannot establish

**Within the claim, examined by the reviewer even though the detector cannot see them.** An approval
covers these, but only as far as the reviewer reads S:

- Raw HTTP calls to a provider endpoint written without an SDK, where the endpoint is a literal in S.
- Model identifiers and literal prompt formats embedded in files of S.
- SDKs outside the detector's recognised list, found by reading the dependency manifest and imports.

**Not within the claim, and not established by the contract.** An approval says nothing about:

- Endpoints, model identifiers or prompt formats assembled at run time, or supplied by configuration,
  environment or data files outside S.
- Dynamic loading, plugin systems, subprocess invocations and shelling out to provider CLIs.
- Runtime provider selection driven by configuration or environment.
- Whether the abstraction would actually keep capabilities stable under a model change; the third clause
  checks that no provider-specific shape crosses the interface, not that the interface is well chosen.
- Behaviour of any other repository or service the project calls (a precondition failure when S depends
  on provider-facing code there; see section 2).

The claim text says "confined to the listed adapter modules", not "provider neutral", and it is limited
to the artefacts and set S.

Also noted: Standard 1 R4 words provider neutrality as SHOULD, while the catalog level is `required`
(`rules/ai.json`). Establishing a `required` rule from SHOULD wording is a standard-versus-catalog policy
question for the owner; this contract does not resolve it.

## 9. Exact changes that would be required, each marked NOT MADE

| Change | Where | Status |
| --- | --- | --- |
| Set `attestable: true` on `ai.provider-neutral` | `rules/ai.json`. The field already exists and is validated by `scripts/catalog.mjs`; absent it defaults to `validationType === "manual-review"`. ADR 0005 binding rule 3 already permits an explicit catalog opt-in | NOT MADE |
| Decide whether catalog `assurance` stays `none` | `rules/ai.json`. An approved attestation reports result assurance `full` under `manualReview` (`scripts/compliance.mjs`), which disagrees with a static `none` | NOT MADE, decision needed |
| Authenticate reviewer identity and authorise the reviewer role before adoption | Depends on #95 and #133 (authenticated successor events) plus an authoritative role record. Today `reviewedBy` and `reviewerRole` are self-asserted strings, so a change author could name themselves the accountable owner and obtain an approval reported with full assurance | NOT MADE; without it this contract MUST NOT be adopted |
| A successor may clear a rejection only if authenticated and independent of the rejected event's subject | #96 / PR #116 (merged) chains successors but does not authenticate them; tied to #133. See section 10 | NOT MADE; without it this contract MUST NOT be adopted |
| Bind freshness to the complete source set in scope | Attestation `reviewedAgainst` and the digest mechanism in `scripts/repository.mjs`: a root path is already tree-bound, but exclusion-aware enumeration (tracked tree less the exclusion policy) is not supported | NOT MADE; without it this contract MUST NOT be adopted |
| Make `reviewedAgainst.paths`, `digest` and `digestAlgorithm` mandatory for an approval under this rule | Schema and `judgeAttestation`. Today `reviewedAgainst` and its digest are optional and freshness state `unrecorded` still establishes the rule (`scripts/compliance.mjs`), so an approval with no digest would stay a pass indefinitely | NOT MADE; without it this contract MUST NOT be adopted |
| Define the exclusion policy's format, owner and change authority | New schema or design document; the policy is inside the digest, but who may edit it and in what form is unspecified | NOT MADE |
| Validate `reviewedBy` against the ownership record, and require the record among the reviewed paths | Validator and attestation schema | NOT MADE |
| Require reviewer role, accountable owner and a maximum age for this rule | Attestation schema and/or validator; today only existence, freshness and `expires` are machine-checked | NOT MADE |
| Declare the adapter list in a boundary declaration | Per Standard 51 R2; location unresolved (#148 / PR #147) | NOT MADE |
| Alternative if full assurance is declined: a distinct result that records the human review without establishing the rule | Result vocabulary and compliance scoring | NOT MADE, owner choice |
| Describe the contract in the rule's `$assuranceNote` and in Standard 1's Implementation section | `rules/ai.json`, `standards/01-human-and-ai-operability.md` | NOT MADE |
| Versioning impact | Standard 21 R2 sets levels by the effect on a currently compliant project and does not classify attestation eligibility. Classification and `VERSION` are the owner's | NOT MADE, not classified |

The owner has stated that eligibility must not be widened merely to reach COMPLIANT. The opt-in above is
presented only as the positive-evidence clause of ADR 0010, for separate approval.

## 10. Negative case: rejected, stale, and contradicted

From `scripts/compliance.mjs` (`judgeAttestation`), in evaluation order:

1. If the rule is not attestable, any attestation is `invalid-attestation` (a failure about the policy,
   not about the requirement; the situation ADR 0010 describes).
2. If a detector produced a finding for the rule, the result is `contradicted-attestation` and the
   failure stands. ADR 0005, binding rule 1: "An attestation cannot override an automated failure."
3. A `rejected` attestation yields `attested-rejected` / failed, and is returned before expiry and
   freshness are consulted (ADR 0010 records this asymmetry as an undecided question). **This holds
   only while the rejection is the terminal event of the review history.** Today a later `approved`
   successor with a fresh digest supersedes it: PR #116 (for #96) made the chain explicit but
   authenticates nothing, so a self-asserted approved successor clears a rejection. Section 9 therefore
   requires that a successor clear a rejection only if authenticated and independent of the rejected
   event's subject, tied to #133.
4. An approved attestation that is expired or stale returns the rule to `not-evaluated`; it is not a
   failure and it does not establish the rule.

So a terminal rejection is a recorded failure, a stale or expired approval establishes nothing, and a
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
  event is authenticated, because "the accountable owner is not the change author" is checkable only if
  reviewer identity is authenticated. Until then the accountable-role requirement is a recorded claim,
  not a verified one.
- **#96 (ST-18, rejection clearing).** A rejection under this contract (a reviewer found a provider leak)
  needs a corrective successor to clear it. Answers needed: what a corrective successor must show for this
  rule (re-review against a new digest of the same artefacts), who may author it (section 10), and the
  questions ADR 0010 leaves open about whether a rejection expires and whether later detector evidence
  overrides it.

Both items record a completion dependency on #133 (owner comments of 2026-10-12).

## 13. Owner decision

Not recorded. Options: adopt, amend, decline. The decision belongs on #127; this document does not record
or imply one.

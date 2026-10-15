# Proposal - manual-evidence contract for `ai.provider-neutral` (#127, ST-34)

**Status: proposal for the owner's decision; the owner chose the narrow reading (B) on 2026-10-15.**
Nothing here is adopted, implemented or signed. This document changes no rule result, catalog entry,
schema, script, policy or attestation, and it does **not** set `attestable: true`: the catalog
`assurance` for `ai.provider-neutral` stays `none` and the rule stays not-evaluated. Implementation, if
any, is a new item.

## 1. What this proposes

`ai.provider-neutral` is catalogued `code-analysis`, `level: required`, `assurance: none`
(`rules/ai.json`). No analyzer evaluates it, so it is reported not-evaluated. The planned detector item
(#124) is partial and negative-only and never PASSes it. This document defines what a human reviewer
**can** establish and record about the rule today, and what that record may and may not be used for.

It establishes nothing about the rule. A record under this contract is non-establishing evidence.

## 2. Requirement-to-row table

Every requirement of the contract, with the one place it is satisfied. Anything not satisfiable with
today's mechanisms is in section 7 and makes no claim.

| Requirement | Satisfied by | Status |
| --- | --- | --- |
| The record names the commit and the reviewed path set | Section 3 (record form) | today |
| The record states what the reviewer examined and found | Section 4 (the review statement) | today |
| The record states what it does not cover | Section 5 | today |
| The record is not an attestation and does not establish the rule | Section 6 | today |
| A rejection recorded as an attestation fails while it is the terminal event | Section 6 | today, only for an attestable rule |
| Identity, role, base revision, tree-wide freshness, digest, live state | Section 7 | future work, no claim |

## 3. Record form

A reviewer records, in a review note the project keeps (an ADR, a design note, or a review record in an
issue or pull request), all of:

- the commit SHA reviewed (D) and the paths the reviewer actually read;
- the reviewer's name and the date;
- the review statement (section 4);
- the limits (section 5).

The record is about commit D only. A later commit is not covered; a new review is a new record. There
is no machine-checked freshness or expiry for such a record; a project may set its own review-age
convention. The accountable reviewer is the project's named architecture owner, and not the author of
the change under review; whether that holds is not machine-checked.

## 4. The review statement

At digest D, over the paths the reviewer read, the reviewer states which of these they observed:

- provider-specific SDK, HTTP-endpoint, model-identifier and literal prompt-format usage, and the
  modules it appears in;
- which of those modules the project treats as adapters, and that business logic outside them consumes
  no provider-specific type, response shape, error type or option an adapter exposes;
- any usage outside the adapters (findings).

"Provider-specific" means an SDK, client library, HTTP endpoint, model identifier, prompt dialect,
response shape, error type or option name belonging to one model provider or to a service that fronts
providers (aggregators and gateway libraries such as LiteLLM, LangChain or OpenRouter count). The
statement is limited to what is statically visible as source text in the paths read.

## 5. What a record does not cover

- Endpoints, model identifiers or prompt formats assembled at run time, or supplied by configuration,
  environment or data files outside the paths read.
- Dynamic loading, plugin systems, subprocess invocations, shelling out to provider CLIs, and runtime
  provider selection.
- Provider-facing code outside the paths read (a shared internal package, a vendored fork, another
  repository), and any module the reviewer did not read.
- Whether the abstraction would keep capabilities stable under a model change.
- Completeness: a clean statement means the reviewer observed no further usage in what was read.

Test and CI presence are not evidence of provider neutrality, and the detector's output (#124, not
built) contributes observations only, never a pass.

Standard 1 R4 words provider neutrality as SHOULD while the catalog level is `required`
(`rules/ai.json`); that mismatch is an owner policy question this document does not resolve.

## 6. What the record may be used for

ADR 0010 (Proposed, not Accepted) states:

> Human review may always contribute negative evidence.
> Human review may contribute positive evidence only where the framework explicitly defines human review
> as the establishing mechanism.

This contract relies only on the first sentence and on nothing the second would add: a record that
reports findings is negative or non-establishing evidence, and a record that reports none is not a
pass. It is not a policy attestation. Today, an attestation entry for a rule the catalog does not mark
attestable is reported `invalid-attestation` (`scripts/compliance.mjs`, `judgeAttestation`), a failure
about the policy and not about the requirement, which is the situation ADR 0010 describes; so the record
is kept outside the attestation mechanism and changes no result.

For a rule the catalog does mark attestable, from `scripts/compliance.mjs` in evaluation order: a
detector finding yields `contradicted-attestation` and is never overridden (ADR 0005, binding rule 1: "An
attestation cannot override an automated failure."); a `rejected` attestation yields `attested-rejected`
(failed) and is evaluated before expiry and freshness, and that holds only while the rejection is the
terminal event of the review history; a stale or expired approval returns the rule to `not-evaluated`.
That is not the situation for this rule while the opt-in is declined.

ADR 0011 supplies the append-only event rule for recorded reviews ("No operation that records a new
review may alter or delete any previously recorded review event.").

## 7. Separately proposed future work

This section makes **no claim** and is not a condition of this contract. It lists what a future item
would have to build before a human review could establish `ai.provider-neutral`, so that the narrow
contract above is not mistaken for it:

- authenticated reviewer identity, a reviewer-role record, and reviewer/author separation derived from
  a computed base revision (#95, #133);
- clearing a recorded rejection only by an authenticated successor independent of the rejected event's
  subject (#96, PR #116 chains successors but authenticates nothing);
- freshness bound to the enumerated tracked tree, a mandatory digest, and a maximum age;
- a derived exclusion policy with a named owner, and a boundary declaration for the adapter list
  (Standard 51 R2; #148 / PR #147);
- the catalog opt-in (`attestable: true`, ADR 0005 binding rule 3), a decision on catalog `assurance`,
  and ADR 0010 acceptance;
- versioning classification (Standard 21 R2 does not classify attestation eligibility) and `VERSION`,
  which are the owner's.

None of this is made, and none of it is required for the record in sections 3 to 5.

## 8. Owner decision

The owner chose the narrow reading (B) on 2026-10-15; this document implements that choice. Adoption of
the record form itself, and any future work above, remain the owner's to decide on #127.

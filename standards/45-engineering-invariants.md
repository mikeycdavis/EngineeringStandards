# Standard 45 — Engineering Invariants

Most standards say what a project should do. This one says what nothing may do. A **must-never** rule
is not a strong recommendation with a stern tone — it is an invariant, and the correct response to a
change that violates one is to stop, not to weigh it against the deadline.

Source: the "Meta-standard", "Severity", and "Automatic enforcement" sections of
[`artifacts/prompts/second-fold-in-prompt.md`](../artifacts/prompts/second-fold-in-prompt.md).

## Scope

This standard is the umbrella for the must-never layer. It defines what a prohibition *is* in this
framework, how prohibitions are verified, when one may be excepted, and what the verdict must do when
nobody has looked. The prohibitions themselves live in the domain standards:
[46](46-source-control-safety.md) source control, [47](47-test-integrity.md) tests,
[48](48-error-handling-and-observability.md) errors and observability, [49](49-data-safety.md) data,
[50](50-security-prohibitions.md) security, [51](51-architecture-integrity.md) architecture,
[52](52-concurrency-and-shared-state.md) concurrency, [53](53-ai-engineering-honesty.md)
AI-generated engineering.

It applies to **both human-written and AI-generated changes**. A prohibition that binds only the
agent is a prohibition the agent's operator can step around by typing the change themselves.

## Requirements

### R1 — The meta-standard

Reproduced verbatim from the source:

> Standards and tests must never be weakened, removed, bypassed, or reclassified solely to permit an
> implementation that would otherwise violate them.

This is itself an engineering invariant, and it is the rule the rest of the framework rests on.
Every other check in this repository can be satisfied by deleting the check. Rule
`meta.standards-not-weakened` is `forbidden` and **non-exemptible**: an exception against it is
rejected rather than recorded, because an exception mechanism that can waive the rule against waiving
rules waives everything.

The qualifier — *solely to permit an implementation that would otherwise violate them* — is internal
to the prohibition and is what keeps it from forbidding ordinary work. A standard may be revised
because it was wrong. A test may be deleted because it tested the wrong thing. A rule may be
reclassified because the risk changed. What is forbidden is doing any of those **because the code
under it would otherwise fail**, and the tell is the order of events: the change to the standard
arrives *after* the implementation it unblocks, and is justified by that implementation.

This standard does not invent that idea; it federates rules that already state it in their own
domains, so that one rule id can be cited when the failure is general:

| Standard | What it already says |
| --- | --- |
| [18](18-machine-readable-project-policy.md) R1 | Policy selects and configures; it does not redefine. A project cannot rewrite what a rule means |
| [20](20-exceptions.md) R1, R4 | An exception waives applicability, never definition — and some rules cannot be excepted at all |
| [22](22-adoption-and-migration.md) R3 | Migration is non-destructive and evidence-preserving |
| [29](29-testing.md) R4 | False green is a higher-severity defect than false red |
| [34](34-dogfooding.md) R3 | No self-exemption by accident |
| [38](38-definition-of-done.md) R4 | A checklist never overrides a rule result |

### R2 — What `forbidden` means

`forbidden` is the fourth rule level, beside `required`, `recommended`, and `optional`. It differs
from `required` in what satisfying it looks like.

A `required` rule is satisfied by the project **doing** something, and evidence of compliance is a
positive finding: the artifact exists, the field is present, the schema validates. A `forbidden` rule
is satisfied by the **absence of violating evidence**, and there is no positive finding to point at.

That asymmetry is the whole difficulty, and it must be stated rather than papered over:

- A `passed` result on a forbidden rule means **"no violation was found by the stated search"** — not
  "this project does not do the prohibited thing".
- [Standard 44](44-existing-project-reconstruction.md) R12 governs what that is worth: *a negative
  discovery result is evidence about the search mechanism before it is evidence about the project.*
  A forbidden rule's clean result inherits the limits of the detector that produced it, and the
  standard defining the rule MUST state those limits where they are material.
- A forbidden rule with no search at all behind it has established nothing. R6 says what the verdict
  must then do.

### R3 — Exception discipline

The source is explicit that absolutism is not the goal. Reproduced verbatim from the source:

> However, avoid absolute rules when legitimate exceptions exist.

And equally:

> Do not weaken a useful standard merely because rare exceptions exist.

Both are honoured by putting the qualifier in the right place, and there are exactly two shapes:

**Qualifier internalized ⇒ non-exemptible.** Where the legitimate case is already carved out by the
wording of the prohibition, no exception can be legitimate, because anything the rule still forbids
is the thing it exists to forbid. `errors.no-false-success` forbids reporting success after an
operation failed; there is no supported reason to do that, so it is `nonExemptible: true`. So are
`meta.standards-not-weakened`, `testing.no-weakening-to-pass`, `testing.no-fabricated-results`,
`data.no-silent-discard`, `data.no-audit-corruption`, `security.no-disabled-access-controls`,
`ai.no-fabricated-capabilities`, and `ai.no-safety-bypass`.

**Operational exception ⇒ exemptible, through [Standard 20](20-exceptions.md)'s machinery.** Where a
real engineering situation legitimately requires the prohibited action — purging a leaked secret from
shared history, running a load test against masked production data — the rule stays exemptible and
the standard defining it MUST state, as the source requires: exact exception conditions, required
justification, required evidence, required approval where applicable, and revisit conditions. An
exception with no expiry against an operational rule is a policy change wearing an exception's
clothes.

### R4 — Reuse before duplication

Most of the source's prohibitions are already prohibited by an existing standard. Restating them
would create two definitions of one rule, drifting apart, with nothing recording which one was
applied — the fork [Standard 22](22-adoption-and-migration.md) R6 prohibits for copied standards,
committed inside the framework itself.

So the must-never layer adds a rule **only** where no existing standard already binds the behaviour.
Everything else routes:

| Source prohibition | Where it already lives |
| --- | --- |
| commit secrets, credentials, private keys, production tokens; expose secrets through logs | [16](16-security.md) R2, with [3](03-auditing.md) R5 and [12](12-structured-errors.md) R5 for the logging and error paths |
| perform destructive data operations by default | [2](02-propose-vs-execute.md) R3, rule `ai.destructive-approval` |
| retry behaviour that can duplicate non-idempotent operations | [13](13-idempotency.md) R1 and R4 |
| silently change requirements; silently expand scope; remove functionality because it is difficult | [10](10-scope-change-management.md) R1 |
| silently change a public contract; silently reinterpret fields; remove compatibility without assessing consumers | [15](15-ai-tool-contracts.md) R2 and R7, with [14](14-structured-results.md) and [12](12-structured-errors.md) for result and error shapes, and [22](22-adoption-and-migration.md) for the consumer side |
| put critical business rules exclusively in UI code | [1](01-human-and-ai-operability.md) R1 |
| leave TODOs and stubs while claiming completion; replace implementations with placeholders | [38](38-definition-of-done.md) R5, rule `quality.unfinished-work` |
| skip tests to hide failures | [30](30-compliance-scoring.md) R3 and [28](28-github-actions.md) R5 — a skip is never a pass, and a green build states its coverage |
| claim tests passed without executing them | [9](09-verification.md) R1 and R4, [38](38-definition-of-done.md) R4 |

A domain standard citing one of these MUST cite the rule id that already exists rather than minting a
near-duplicate. Where the must-never framing adds something the existing rule does not carry — a
prohibition where the existing rule states an obligation — the domain standard says so explicitly.

### R5 — Three verification classes, in the vocabulary that already exists

The source asks that the layer clearly distinguish, reproduced verbatim from the source:

* automatically verified
* partially verified
* review required

These are not a new vocabulary. They are the assurance triple
[Standard 30](30-compliance-scoring.md) R4 already reports, and each maps onto catalog metadata that
already exists:

| Source class | Catalog metadata | Reported as |
| --- | --- | --- |
| automatically verified | `validationType: structural` or `document`, `assurance: full` | `automated` in the assurance breakdown |
| partially verified | `validationType: code-analysis`, `assurance: partial` | `partial` — a heuristic search, sound for the patterns it knows and silent about the rest |
| review required | `validationType: manual-review`, `assurance: none` | `manualReview` — satisfied only by a human attestation, never by an automated run that found nothing |

The source's own constraint governs which class a rule may claim, reproduced verbatim from the
source:

> Do not implement brittle automated checks that create more false confidence than value.

A check that fires often enough to be ignored is worse than no check, because its clean runs are
still counted as assurance. Where a prohibition can only be partially detected, the rule is
`code-analysis`/`partial` and the standard states the subset covered — not the aspiration.

### R6 — An unestablished prohibition blocks `COMPLIANT`

An applicable `forbidden` rule that is neither evaluated, nor attested, nor declared not-applicable
**caps the verdict at `NOT_EVALUATED`**.

| Situation | Result |
| --- | --- |
| forbidden + automated + no violation found | `satisfied` |
| forbidden + automated + violation found | `NON_COMPLIANT` |
| forbidden + manual-review + valid attestation | `satisfied` |
| forbidden + manual-review + no attestation | verdict capped at `NOT_EVALUATED` |
| forbidden + declared not-applicable | skipped, excluded from the verdict |

**Why forbidden and not required.** For a `required` rule, `not-evaluated` means *we did not check
that you did the thing* — the project may well have done it, and the gap is in the tooling. For a
`forbidden` rule it means *nobody looked for the prohibited behaviour*. Reporting `COMPLIANT` over an
unexamined prohibition is a false green at the verdict level, which is
[Standard 38](38-definition-of-done.md) R3's principle — `NOT_EVALUATED` does not satisfy completion
— applied one level up, to the verdict itself.

**The cap does not intercept the exception machinery**, and the order is fixed:

```text
rejected exception (non-exemptible rule)   → rejected-exception, NON_COMPLIANT
automated violation                        → NON_COMPLIANT
valid exception on an exemptible rule      → COMPLIANT_WITH_EXCEPTIONS (Standard 20)
declared not-applicable                    → skipped, excluded
evaluated pass, or a valid attestation     → satisfied
none of the above                          → unestablished: verdict capped at NOT_EVALUATED
```

Only the last row is new. A project that has honestly excepted a forbidden rule, or honestly declared
it not applicable, has *looked* — and the cap exists only for the case where nobody has.

**The resolution paths, in order.** A capped verdict is not a dead end; it is a question. Evaluate the
rule if a detector exists. Attest it if a human has reviewed it. Declare it not-applicable if the
project has no subject for it. Except it if the rule is exemptible and the situation is real. Doing
none of those four and calling the result compliant is the outcome this requirement forbids.

## Additions this standard makes beyond the source

- R2's semantics of `forbidden` in full — that a prohibition is satisfied by absence of evidence, and
  what a `passed` result therefore does and does not mean. The source asks for prohibitions; it does
  not say how a framework reports one it has verified.
- R3's two-shape exception model. The source lists what an exception must define; the distinction
  between a qualifier internalized into the wording and an operational carve-out, and the rule that
  the first implies non-exemptibility, is this framework's.
- R4 in full. The source says not to duplicate existing standards; the mapping of each prohibition to
  the standard that already binds it is the work that instruction implies.
- R6 in full — the unestablished-prohibition verdict rule. The source does not discuss verdicts. This
  follows from its own distinction between automatic and review-required verification: if a
  prohibition is review-required and no review happened, something has to say so, and the only place
  a reader reliably looks is the verdict.
- The mapping in R5 onto the existing assurance vocabulary, rather than a parallel one.

## Relationship to other standards

[Standard 20](20-exceptions.md) supplies the exception machinery R3 uses and the `nonExemptible`
concept R1 depends on. [Standard 30](30-compliance-scoring.md) defines the assurance triple R5 maps
onto and the verdict R6 constrains. [Standard 24](24-validator-rules.md) is why R2's honesty about
what a clean result proves is not optional — a check may claim only what its kind of check
establishes. [Standard 44](44-existing-project-reconstruction.md) R12 is the invariant R2 inherits.
[Standard 18](18-machine-readable-project-policy.md) R1 is the separation R1 protects: the catalog
defines rules, the policy selects them, and neither may redefine the other.
[ADR 0006](../artifacts/adr/0006-must-never-standards-are-forbidden-level-rules.md) records why this
layer is built from `forbidden`-level catalog rules rather than a new mechanism.

## Implementation

**Implemented.**

| Requirement | Implementation |
| --- | --- |
| R1 | Rule `meta.standards-not-weakened` (`rules/invariants.json`), `forbidden`, `manual-review`, `nonExemptible`. Not automatable: it is a claim about *why* a change was made, and intent is not in the diff. Attestation is the evidence mechanism |
| R2 | `level: "forbidden"` in `scripts/catalog.mjs`; `scripts/compliance.mjs` fails a forbidden violation exactly as it fails a required one |
| R3 | `nonExemptible` is enforced in two places independently, and rejected exceptions are reported rather than silently ignored (`scripts/policy.mjs`, `scripts/compliance.mjs`) |
| R4 | No rule id is minted where an existing one binds the behaviour; each domain standard cites the existing id |
| R5 | The catalog's `validationType` and `assurance` fields, reported by `standards validate` |
| R6 | `summarise()` in `scripts/compliance.mjs`, with a fixture test per row of the table and two boundary tests proving the cap does not intercept a valid exception or a rejected one |

**Not mechanically checked.** R1 itself, in the general case. A test can prove that this repository's
own rules were not weakened between two commits only by reading the diff and the reason for it — and
the reason is not in the repository. What *is* mechanical is narrower and still useful: an exception
declared against a non-exemptible rule is rejected, and the self-audit fails if this repository stops
satisfying the standards it publishes ([Standard 34](34-dogfooding.md)).

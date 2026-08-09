# Standard 20 — Exceptions

Projects occasionally need to violate a standard intentionally. An exception **waives applicability**
— it never changes what the rule means, and it never silently expires into compliance.

Source: item 20 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to any project declaring compliance under
[Standard 18](18-machine-readable-project-policy.md). This standard, with
[21](21-versioning.md), [22](22-adoption-and-migration.md), and [23](23-standards-validator-cli.md),
forms the governance layer: how a project departs from a standard, how the standard itself changes,
how a project adopts it, and how any of it is checked.

## Requirements

### R1 — An exception waives applicability, never definition

**An exception records that a rule does not apply to this project. It MUST NOT alter what the rule
means.**

This is [Standard 18](18-machine-readable-project-policy.md) R1 seen from the other side. That
standard prohibits a policy from redefining a rule; this one supplies the legitimate alternative. The
distinction in practice:

```yaml
# Permitted — the rule keeps its meaning; this project is recorded as not meeting it.
exceptions:
  - rule: ai.uiCapabilitiesMustBeAgentOperable
    reason: "Offline desktop utility with no external capability layer."
    approvedBy: "project-owner"
    expires: "2027-01-01"
```

```yaml
# NOT ALLOWED — this redefines the rule rather than waiving it.
exceptions:
  - rule: ai.providerNeutral
    meaning: "Provider neutrality means we support two models from one vendor."
```

An exception leaves the project **countably non-compliant** with a named rule. That is the point: the
gap stays visible and can be reported, which a redefinition destroys.

### R2 — Required contents

Exceptions should contain, reproduced verbatim from the source:

```text
rule
reason
approvedBy
date
optional expiration
optional issue/reference
```

**Do not allow vague anonymous exceptions.**

Restated as a hard rule, because "vague anonymous" is what a validator has to reject: an exception
MUST name the rule, give a reason that explains the specific circumstance, and identify who approved
it and when. An exception whose reason is "not applicable" or "legacy" is anonymous in the sense that
matters — nobody can evaluate it later.

`approvedBy` and `date` are **provenance**, and they are what makes an exception auditable rather than
merely present. Six months later the questions are *who decided this* and *was it still true then*,
and only provenance answers them.

### R3 — Expiration, and what happens at it

An exception SHOULD carry `expires` whenever the divergence is expected to be temporary.

**An expired exception is a compliance failure, not a lapsed formality.** On the day it expires, the
rule applies again in full, and a project still departing from it is non-compliant until the
exception is renewed with fresh provenance or the departure is fixed.

A validator MUST NOT treat an expired exception as still effective, and SHOULD report it distinctly
from having no exception at all — "your exception expired on 2027-01-01" and "you never had one" are
different situations calling for different responses.

An exception with no `expires` is permanent until removed. That is legitimate — some divergences are
structural — but it SHOULD be a deliberate choice rather than an omission, because a permanent
exception is one nobody will ever revisit.

### R4 — Some rules are non-exemptible

**A standard MAY declare a rule non-exemptible, and an exception against such a rule MUST be
rejected rather than recorded.**

The first and clearest example is [Standard 16](16-security.md) R2 — secrets in artifacts. That
prohibition admits no exception, because every listed artifact is durable: a secret placed in one is
persisted, copied, and often published, and removing it later does not un-expose it. No project
circumstance changes that.

Non-exemptibility is a property of the *rule*, declared by its standard, and it MUST NOT be
overridable by a project. A mechanism a project can switch off is not a prohibition.

### R5 — Exceptions are visible and auditable

**Exceptions should be visible and auditable.**

They live in the policy file ([Standard 18](18-machine-readable-project-policy.md) R4), which is
committed, reviewed, and read by agents — not in a comment, a wiki, or a conversation. A validator
SHOULD report active exceptions in its output even when a project passes, because a pass with four
exceptions and a pass with none are different results.

Where an exception represents a significant architectural departure rather than a narrow waiver, it
SHOULD also carry an ADR reference ([Standard 11](11-architecture-decision-records.md)) — the
exception records *that* the rule is waived, the ADR records the decision behind it.

## Additions this standard makes beyond the source

- R1 in full — the waives-applicability versus alters-definition distinction, and its pairing with
  Standard 18 R1.
- R3's expiry semantics: an expired exception is a compliance failure, must not be honoured, and
  should be reported distinctly from an absent one. The source names `optional expiration` without
  saying what expiry does.
- R4 in full — non-exemptible rules, and that non-exemptibility cannot be overridden by a project.
- R2's reading of "vague anonymous" into a rejectable rule, and the framing of `approvedBy`/`date` as
  provenance.
- R5's rule that exceptions are reported even on a pass, and the ADR pairing.

## Relationship to other standards

[Standard 18](18-machine-readable-project-policy.md) R4 defines where exceptions live and their
shape; this standard defines what they mean and when they stop working.
[Standard 19](19-json-schema.md) validates their structure — provenance fields are exactly the kind
of required property R2 there exists to enforce.
[Standard 23](23-standards-validator-cli.md) is what reports them.
[Standard 16](16-security.md) supplies the first non-exemptible rule.

## Implementation

**Implemented, declaration and application.**

`schemas/project-policy.schema.json` defines the exception shape and enforces its provenance
requirements: `rule`, `reason`, `approvedBy`, and `approvedAt` are all required, so an exception
nobody approved cannot validate. `scripts/policy.mjs` enforces expiry — an exception past its
`expires` date is reported as `policy.expired-exception` at error severity and exits `1`, a
compliance failure rather than a configuration error, which is the semantics R3 requires.

It also enforces one rule this standard implies but does not state: **a rule may not be both
declared not-applicable and carry an exception** (`policy.conflicting-classification`). The two
mechanisms make opposite claims — *the rule has no subject here* versus *the rule applies and we
knowingly do not satisfy it* — and a policy asserting both is ambiguous, with no safe way to pick
one.

Both behaviours have known-positive and known-negative fixtures in `test/fixtures/policies/`.

**Now applied, not only declared.** `standards audit` reads `project-policy.yml` and
`scripts/compliance.mjs` applies exceptions to the verdict: a required rule that fails under a live
exception yields `COMPLIANT_WITH_EXCEPTIONS` rather than `NON_COMPLIANT`, and the result carries the
exception's reason, approver, dates, and reference so the waiver travels with the finding rather than
being invisible in the output.

**An expired exception does not suppress anything.** It becomes its own failing result with
`disposition: "expired-exception"`, and the verdict is `NON_COMPLIANT` — the semantics R3 requires,
now enforced in two places (the policy checker and the verdict engine) with fixtures for both.

**`nonExemptible` is enforced.** `ai.destructive-approval` and `security.no-secrets-in-artifacts`
declare it in the catalog, and an exception written against either is **rejected rather than
recorded**, in both places independently: `scripts/policy.mjs` reports `policy.non-exemptible-rule`
and exits `1`, and `scripts/compliance.mjs` produces a failing result with
`disposition: "rejected-exception"` and a `NON_COMPLIANT` verdict.

Two details that make the enforcement honest rather than cosmetic:

- **Rejection is checked before expiry.** A non-exemptible waiver is invalid whether or not it has
  lapsed, and reporting it merely as *expired* would imply that renewing it would work.
- **The check is enforced twice on purpose.** Catching it only in the policy checker would let an
  adopter who never runs that command reach a verdict where the waiver silently applied.

The known-negative matters as much as the positive: a test confirms an exception against an
*exemptible* rule still yields `COMPLIANT_WITH_EXCEPTIONS`, so a blanket rejection of all exceptions
could not pass this suite. Fixture: `test/fixtures/policies/non-exemptible-exception.yml`.

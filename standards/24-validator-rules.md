# Standard 24 — Validator Rules

What kinds of check exist, and — more importantly — **what a validator is allowed to claim** from
each. A check that proves files exist may not report that behaviour is correct.

Source: item 24 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines rule *kinds* and the assurance each supports. With [25](25-validator-output.md),
[26](26-stable-rule-ids.md), and [27](27-rule-catalog.md) it forms the validator layer, split
deliberately into **definition** (this standard and 26), **execution** (this standard), **reporting**
(25), and **registry** (27). Nothing here defines the output format or a rule's identity; those
belong to 25 and 26.

## Requirements

### R1 — Validation types

Rule types MUST be separated into, reproduced verbatim from the source:

```text
structural
document
configuration
code-analysis
manual-review
```

| Type | Determines | Example |
| --- | --- | --- |
| `structural` | A path exists, or does not | `artifacts/adr/` is present |
| `document` | A document contains a required element | A plan item has an Acceptance Criteria section |
| `configuration` | A declared value is valid | The policy matches the schema; the declared version resolves |
| `code-analysis` | Something about the implementation | Mutations write audit events |
| `manual-review` | Nothing mechanically — a human judges | Capabilities are correctly tiered |

### R2 — Assurance MUST NOT exceed the validation type

**A validator MUST NOT report a stronger level of assurance than its validation type supports.**

This is the central rule of this standard. Every check has an **evidence scope**: the set of claims
its evidence can actually support. Reporting outside that scope is not a bug in the check — the check
may be perfectly correct — it is a false claim about what was proven.

A `structural` check may truthfully say:

```text
PASS: audit infrastructure files exist
```

It MUST NOT say, or be summarised as:

```text
PASS: all business mutations are audited
```

The first is what was checked. The second is what a reader wants to be true, and a validator that
elevates one to the other manufactures confidence nobody earned. The failure is especially likely in
summary lines and scores, where a specific finding gets rolled up into a general claim.

Two consequences:

- **A rule's message MUST describe what was observed**, not the requirement it relates to. "`docs/`
  contains an architecture document" rather than "architecture is documented".
- **A passing `structural` or `document` check for a rule whose substance is behavioural MUST be
  reported as partial assurance**, not as compliance with the underlying requirement. The catalog
  records this explicitly ([Standard 27](27-rule-catalog.md)) as an `assurance` field.

### R3 — Start with deterministic checks

**Initial validation should check things that can be determined reliably**, and the first version
should focus on deterministic checks.

The source's examples of what is reasonable to check in a first version:

```text
PASS PROJECT.md exists
PASS project-policy.yml exists
PASS policy matches schema
PASS declared standards version exists
PASS artifacts/project-plan-breakdown exists
PASS plan files exist when project contains an active plan
PASS each plan file contains required sections
PASS acceptance criteria present where required
PASS verification section present where required
PASS artifacts/adr exists
PASS agent bootstrap file exists
PASS secrets are not obviously embedded in tracked planning files
WARN no ADRs exist
WARN project manifest appears stale
FAIL invalid project policy
FAIL required plan artifact missing
```

Note the wording of the secrets check — "not **obviously** embedded". That is the honest scope of a
structural scan, and R2 forbids reporting it as "no secrets present".

### R4 — Do not overclaim static analysis

**Do not pretend the CLI can perfectly determine architecture-level compliance from static analysis
in v1.**

A rule may be *categorised* as `code-analysis` in the catalog while the current validator reports it
as `manual-review` or `not-evaluated`, because no analyzer exists yet. **That is the correct
behaviour, not a gap to paper over.** The catalog describes what kind of rule it is; the validator
reports what it actually did.

A rule reported as passing when nothing examined it is worse than one reported as unevaluated: the
first produces false green compliance, and green is what people act on.

### R5 — Every automated rule is tested both ways

**A validator MUST be tested against known-positive and known-negative examples for every automated
rule type it claims to enforce.**

For each rule: a fixture that provokes it, and a fixture that must not. The second is the one that
matters — a suite asserting only that checks fire passes happily while a rule fires on everything.

The stronger form, worth applying to rules that guard against a known defect: **mutate the
implementation and confirm the test fails.** A regression test never observed failing is an
assumption. This repository's own history is the argument — a hand-written check for backticks in
quoted source searched for a substring and found it *inside* the backticks, so it could not have
caught the bug it existed to catch, and did not for two more instances.

This requirement is also why R4's honesty is affordable: a rule that cannot be tested both ways is a
rule the validator should not claim to enforce.

## Additions this standard makes beyond the source

- R2 in full — evidence scope, the prohibition on elevating assurance, and the two consequences. The
  source separates rule types without saying what follows from the separation, and this is what makes
  the separation load-bearing rather than descriptive.
- R4's ruling that a `code-analysis` rule may be reported as `manual-review` or `not-evaluated`, and
  that this is correct rather than a gap.
- R5 in full — known-positive and known-negative testing, and mutation testing for defect guards.
- R1's table of what each type determines.

## Relationship to other standards

[Standard 25](25-validator-output.md) carries `validationType` on every result so a consumer can
apply R2 itself. [Standard 27](27-rule-catalog.md) records each rule's type and assurance.
[Standard 23](23-standards-validator-cli.md) R6 makes the same honesty requirement of the CLI as a
whole — a clean run must never read as "compliant" when it means "nothing matched".

## Implementation

`scripts/standards.mjs` implements structural and document checks and satisfies R4 by construction:
its `potential-*` categories are labelled `INFERRED` and its report states that coverage is partial.
It satisfies R5 — every category has a provoking and a non-provoking fixture, and two guards are
mutation-tested.

It does **not** yet satisfy R2 mechanically: findings carry a `severity` and an evidence label, but
no `validationType`, so a consumer cannot check assurance itself. Adding that field is the smallest
change that would make this standard enforceable rather than aspirational.

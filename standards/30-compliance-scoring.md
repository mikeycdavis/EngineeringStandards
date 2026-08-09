# Standard 30 — Compliance Scoring

A percentage is a summary statistic. It is not a verdict, it is not proof, and it MUST never be able
to stand in for either. This standard exists so that a number can never masquerade as compliance.

Source: item 30 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **the verdict and the score**, and the relationship between them. The envelope that carries
both belongs to [Standard 25](25-validator-output.md); what each rule may claim belongs to
[Standard 24](24-validator-rules.md); exceptions belong to [Standard 20](20-exceptions.md).

The batch rule is at its sharpest here: **automation may aggregate evidence, but it MUST NOT overstate
assurance.** A score is the purest form of aggregation in the whole framework, and therefore the
easiest place to lose the distinction between *checked* and *correct*.

## Requirements

### R1 — Status is the verdict; the score is informational

**Design a simple compliance scoring model. Do not allow scoring to hide required failures.**
**Treat the score as informational.**

The authoritative result is `status`, from a closed enumeration. The source's list, reproduced
verbatim:

```text
COMPLIANT
COMPLIANT_WITH_EXCEPTIONS
NON_COMPLIANT
```

with one addition this standard makes: **`NOT_EVALUATED`**, for a run that could not be performed —
an unreadable policy, an unresolvable declared version, a target that is not a project. It
corresponds to [Standard 23](23-standards-validator-cli.md) exit `2` and MUST NOT be reported as
`NON_COMPLIANT`. *Could not check* and *checked and failed* are different facts, and collapsing them
turns a broken validator into a compliance failure — which is a false red for the project and a false
green for the tooling.

| Status | Means |
| --- | --- |
| `COMPLIANT` | Every applicable required rule that was evaluated passed, and no exceptions were relied on |
| `COMPLIANT_WITH_EXCEPTIONS` | The same, except that one or more required rules passed only by virtue of a valid, unexpired exception |
| `NON_COMPLIANT` | At least one applicable required rule failed, or an exception relied on has expired |
| `NOT_EVALUATED` | The run could not be performed |

`COMPLIANT_WITH_EXCEPTIONS` is not a lesser grade of compliance — it is a *different fact*, and
flattening it into `COMPLIANT` loses the only signal that a waiver is load-bearing. It is what makes
an expiring exception visible before it expires ([Standard 20](20-exceptions.md)).

### R2 — A required failure means `NON_COMPLIANT`, whatever the score

**A single failed required rule MUST produce `NON_COMPLIANT`, even at a score of 99%.**

The status is computed from the rules, never from the number. There is no threshold at which a score
grants compliance and no threshold at which it withdraws it. Any implementation in which the score is
an *input* to the status has the relationship backwards, and the source's own instruction — "do not
allow scoring to hide required failures" — is the failure being guarded against.

100% compliance **should mean all applicable required rules pass** — the implication runs that way
only. It does not run in reverse: *all applicable required rules pass* does not imply everything was
checked, which is what R4 exists to say.

### R3 — Skipped and not-evaluated rules are never counted as passes

**A rule that was not evaluated MUST NOT contribute to the passed count, and MUST NOT be silently
excluded from the denominator.**

These are the two ways a score is inflated, and the second is subtler than the first. Counting a skip
as a pass is obvious once anyone looks. Quietly dropping it from the denominator produces
`21/21 = 100%` from a run that examined half the rule set, and every number in that report is
truthful in isolation.

If a denominator adjustment is warranted — a rule genuinely does not apply to this project type —
then **the adjustment MUST be explicit and separately reported**, never folded into the percentage.
The report states what was excluded and why; the reader decides whether to accept it. An adjustment
that cannot be stated is an adjustment that should not be made.

### R4 — Assurance is reported alongside the score

**Where a score is emitted, a coverage breakdown MUST be emitted with it**, so a percentage can never
imply that the same percentage of the standard was actually verified.

This extends the [Standard 25](25-validator-output.md) R2 envelope:

```json
{
  "status": "NON_COMPLIANT",
  "score": 94,
  "assurance": {
    "automated": 61,
    "manualReview": 23,
    "notEvaluated": 16
  }
}
```

| Key | Counts rules whose result was established by |
| --- | --- |
| `automated` | A check that ran and produced a verdict |
| `manualReview` | Human judgement — no mechanical evaluation ([Standard 24](24-validator-rules.md) R1) |
| `notEvaluated` | Nothing; catalogued but unimplemented, or inapplicable |

**Read together, the example says: 94% of the 61 rules a machine actually checked passed, and 39 of
the 100 rules were not machine-checked at all.** Read alone, `94` says the project is 94% compliant.
The two readings are so far apart that the breakdown is not supplementary detail — it is what makes
the number safe to publish.

Whether the values are counts or percentages, the units MUST be stated and MUST be consistent, and
the three MUST account for every applicable rule. A breakdown that does not sum is worse than none,
because it invites arithmetic that produces a wrong answer confidently.

### R5 — The score's denominator is stated

A score MUST be accompanied by what it was computed over: which rules counted, at which level, under
which declared standard version.

The same project can honestly produce different scores under different framework versions
([Standard 21](21-versioning.md)) or different policy levels
([Standard 18](18-machine-readable-project-policy.md)), and two scores from different denominators are
not comparable. Without the denominator, a portfolio view ([Standard 31](31-whatsnext-compatibility.md))
ranks projects against each other on numbers that were never measuring the same thing.

Recommended-level rules SHOULD be scored separately from required-level rules rather than averaged
into one figure. Averaging lets a project raise its number by satisfying advice while failing
requirements — the precise inversion R2 forbids, arriving through the denominator instead of the
threshold.

### R6 — Scores never appear alone

Wherever a score is displayed — CLI output, JSON, a dashboard, a badge — `status` MUST appear with
it, and MUST be the more prominent of the two.

This restates [Standard 25](25-validator-output.md) R5 as a requirement on every surface, because the
elevation happens at the point of *display*, not the point of computation. A correctly computed
score, rendered as a lone percentage on a dashboard, has become a compliance claim regardless of how
carefully it was derived.

## Additions this standard makes beyond the source

- `NOT_EVALUATED` as a fourth status, and the ruling that it must not be reported as
  `NON_COMPLIANT`. The source gives three statuses and no way to say *could not check*.
- R3 in full — the prohibition on counting skips as passes, and the requirement that any denominator
  adjustment be explicit and separately reported.
- R4's `assurance` breakdown, which extends the [Standard 25](25-validator-output.md) envelope, and
  the requirement that the three values account for every applicable rule.
- R5 in full — the denominator, and separate scoring of required and recommended levels.
- R6's extension of the display rule to every surface.
- R1's table distinguishing `COMPLIANT_WITH_EXCEPTIONS` as a different fact rather than a lesser
  grade.

## Relationship to other standards

[Standard 25](25-validator-output.md) R2 carries `status`, `score`, and `summary`; this standard
defines the enumeration for `status` and adds `assurance` to that envelope. R2's rule is
[Standard 24](24-validator-rules.md) R2 applied to the aggregate.
[Standard 20](20-exceptions.md) determines `COMPLIANT_WITH_EXCEPTIONS` and, on expiry,
`NON_COMPLIANT`. [Standard 21](21-versioning.md) supplies the version a score is computed under.
[Standard 23](23-standards-validator-cli.md) R3 maps `NOT_EVALUATED` to exit `2`.
[Standard 29](29-testing.md) R3 requires the scoring behaviour here to be tested — specifically R2.
[Standard 31](31-whatsnext-compatibility.md) is the consumer that makes R5 matter.

## Implementation

**Implemented.** `scripts/compliance.mjs` computes the verdict from the catalog, the policy, and the
evaluator's findings. `npm run audit` prints it and `--json` emits it.

Each requirement, and how it is enforced:

| Requirement | Implementation |
| --- | --- |
| R1 — status from a closed set | `STATUS`, with `NOT_EVALUATED` returned when the project declares no policy or its policy cannot be read |
| R2 — a required failure means `NON_COMPLIANT` at any score | Status is computed from `requiredFailures.length`; the score is never an input. A test asserts one failure at a 90%+ score still yields `NON_COMPLIANT` |
| R3 — skips never count as passes | A rule not in the evaluator's `EVALUATED_RULES` is `skipped / not-evaluated`, and `scored` counts only evaluated required rules. Two tests cover the numerator and the denominator separately |
| R4 — assurance beside the score | `assurance: { automated, manualReview, notEvaluated }`, asserted to sum to the applicable-rule count |
| R5 — the denominator is stated | `denominator: { total, applicable, scored, basis }` ships in the envelope and is printed next to the score |
| R6 — score never appears alone | Both surfaces print `Status` above `Score`, and the human report closes by saying what the number is not |

**This repository's own verdict is `COMPLIANT`, at 100% of 9 evaluated required rules, with 12
skipped.** That pairing is the whole point of R3 and R4: the score says every required rule that was
checked passed, and the coverage line says twelve rules were not checked at all. Read alone, `100%`
would be a claim nobody earned.

The `NOT_EVALUATED` path is exercised in practice rather than theoretically — every fixture
repository lacks a policy, so each audit of one returns `NOT_EVALUATED` rather than a verdict.

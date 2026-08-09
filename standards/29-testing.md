# Standard 29 — Testing

The validator is the thing everything else trusts. This standard defines what testing it must carry
before that trust is warranted, and which of its bugs are the dangerous ones.

Source: item 29 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **how the validator is tested**. What rules may claim belongs to
[Standard 24](24-validator-rules.md); [Standard 24](24-validator-rules.md) R5 states the
known-positive / known-negative obligation, and this standard is where it is structured into layers
and given fixtures. Verification of *projects* is [Standard 9](09-verification.md); this is about the
tool.

The batch rule applies: **automation may aggregate evidence, but it MUST NOT overstate assurance.** A
passing test suite is an aggregate too.

## Requirements

### R1 — Three test layers, with distinct jobs

**Build automated tests for the CLI.** They MUST be organised into three layers, because each catches
a class of defect the others cannot:

| Layer | Subject | Catches |
| --- | --- | --- |
| **Unit** | Validators, parsers, matchers, scoring, output serialisation | Logic errors in a single function — a regex that matches too much, a status mapping that drops a case |
| **Fixture** | Whole repositories, compliant and non-compliant | Wiring errors — a rule that never runs, a finding that never surfaces, a traversal that skips a directory |
| **Mutation / known-negative** | Rules that claim automated enforcement | Checks that cannot fail — the defect a test suite is structurally blind to |

The layers are not redundancy. A unit test proves a function returns what it should for an input you
chose; a fixture test proves the function is reached at all; a mutation test proves the assertion
would notice if it were not.

**A rule claiming automated enforcement MUST have all three.** A rule with only unit coverage may be
correct and unreachable, which reports as a pass.

### R2 — Fixture repositories

**Create fixture repositories representing**, reproduced verbatim from the source:

```text
fully compliant
missing PROJECT.md
invalid policy
missing plan directory
missing acceptance criteria
missing verification
valid exception
expired exception
unsupported standard version
```

`fully compliant` is the most important fixture and the easiest to under-invest in. It is the only
known-negative for every rule at once: if any rule fires against it, that rule fires on correct work.

Three properties fixtures MUST have:

- **A fixture is minimal and single-purpose.** `missing PROJECT.md` differs from `fully compliant` in
  exactly one way, so a failure names its own cause.
- **Fixtures are excluded from the validator's own self-audit.** Fixture data is deliberately
  malformed; scanning it reports the test suite's planted defects as the repository's own findings.
- **A fixture asserts what does *not* fire, not only what does.** Otherwise `expired exception` passes
  happily while every other rule also fires on it.

`valid exception`, `expired exception`, and `unsupported standard version` are the fixtures that
exercise [Standard 20](20-exceptions.md) and [Standard 21](21-versioning.md) rather than any
individual rule, and they are the ones most often missing: an expired exception MUST produce a
compliance failure, and an unresolvable declared version MUST be rejected rather than defaulted.

### R3 — What tests must verify

**Tests should verify**, reproduced verbatim from the source:

```text
exit codes

rule IDs

JSON output

warning/error handling

compliance scoring
```

Each of these is a contract with a consumer, not an implementation detail:

| Verified | Why it is a contract |
| --- | --- |
| Exit codes | CI gates on them ([Standard 23](23-standards-validator-cli.md) R3). `0`/`1`/`2` must stay distinct — `2` must never be reported as non-compliance |
| Rule IDs | Every exception and every external reference resolves through them ([Standard 26](26-stable-rule-ids.md)). A test that asserts the ID is what stops a rename shipping silently |
| JSON output | A versioned machine interface ([Standard 25](25-validator-output.md) R2), governed by [Standard 15](15-ai-tool-contracts.md) |
| Warning/error handling | The distinction between advisory and disqualifying ([Standard 25](25-validator-output.md) R4) |
| Compliance scoring | [Standard 30](30-compliance-scoring.md) — and specifically that a required failure yields `NON_COMPLIANT` regardless of score |

**Asserting rule IDs in tests is what makes [Standard 26](26-stable-rule-ids.md) enforceable.** Rule
IDs are stable by promise; a test is the only mechanism that makes them stable in fact.

### R4 — False green is a higher severity defect than false red

**A validator bug that produces a false pass is more severe than one that produces a false failure.**
They are not symmetric, and treating them as equally-weighted bugs is how false greens survive
triage.

| | Effect | Who notices |
| --- | --- | --- |
| **False red** — reports a violation that does not exist | Work is blocked; someone investigates | Immediately, loudly, by whoever is blocked |
| **False green** — misses a real violation | The requirement quietly does not apply | Nobody, possibly ever |

A false red is self-reporting: it has a complainant. A false green has no complainant by construction
— it produces exactly the output everybody wanted. It is also the failure mode that compounds,
because downstream systems ([Standard 31](31-whatsnext-compatibility.md)) aggregate it into
portfolio-level claims.

Three consequences:

- **A rule reported as passing when nothing examined it is a false green**, not a gap
  ([Standard 24](24-validator-rules.md) R4). It MUST be reported as skipped or not-evaluated.
- **When a false green is found, the fix includes a known-negative test that would have caught it.**
  A false red may reasonably be fixed and closed.
- **Where the correct behaviour is genuinely ambiguous, prefer the false red.** A noisy check is
  repairable; a silent one is not detectable.

### R5 — Mutation testing for rules that guard a known defect

For any rule written *because* a specific defect occurred, the regression guard MUST be mutation
tested: **reintroduce the defect and confirm the test fails.**

A regression test never observed failing is an assumption about the test, not evidence about the
code. This repository's own history is the argument. A hand-written check for backticks inside quoted
source searched for the substring — and found it happily *inside* the backticks it was supposed to
reject. It could not have caught the bug it existed to catch, and did not, for two further instances.
No amount of green in that suite meant anything.

The check is mechanical and cheap: break the implementation, run the test, confirm red, restore.
Automating it is better than remembering it.

### R6 — Coverage of the rule set is reported, not assumed

The test suite SHOULD be able to state which catalogued rules ([Standard 27](27-rule-catalog.md))
have known-positive and known-negative coverage, and which have neither.

Without this, "the tests pass" says nothing about how many rules were tested — which is
[Standard 24](24-validator-rules.md) R2 one level up. A suite covering nine of forty rules is green
in exactly the same way as one covering forty.

## Additions this standard makes beyond the source

- R1's three-layer structure and the ruling that a rule claiming automated enforcement needs all
  three. The source says "build automated tests" without distinguishing layers.
- R2's three fixture properties, and the observation that `fully compliant` is the universal
  known-negative.
- R4 in full — the asymmetry between false green and false red, and the three consequences. This is
  the standard's central judgement and the source does not raise it.
- R5's mutation requirement (shared with [Standard 24](24-validator-rules.md) R5) and R6 in full.

## Relationship to other standards

[Standard 24](24-validator-rules.md) R5 states the known-positive / known-negative obligation this
standard structures. [Standard 23](23-standards-validator-cli.md) R3 defines the exit codes R3 tests.
[Standard 25](25-validator-output.md) defines the JSON shape and the status/severity split.
[Standard 26](26-stable-rule-ids.md) is enforceable only because R3 asserts IDs.
[Standard 30](30-compliance-scoring.md) supplies the scoring behaviour R3 requires tested.
[Standard 28](28-github-actions.md) R2 runs this suite as the same command a developer runs.

## Implementation

`test/audit.test.mjs` holds 29 tests over fixtures in `test/fixtures/` — `compliant`, `delegated`,
`naming-only`, and `markers`. Against this standard:

**Met.** Every finding category has a provoking fixture and a non-provoking one, so R1's fixture layer
and R2's known-negative property hold. Fixtures are excluded from the self-audit by `SKIP_DIRS`,
which exists because they were not, and the repository reported its own test data's planted defects.
Two guards are mutation tested, satisfying R5 for the rules that have a defect behind them. One test
asserts this repository has no error-severity findings, which is the gate [Standard 28](28-github-actions.md)
relies on.

**Not met.** The source's nine fixtures do not exist as such — there is no `invalid policy`,
`valid exception`, `expired exception`, or `unsupported standard version` fixture, because the
features they exercise are not built ([Standard 19](19-json-schema.md),
[Standard 20](20-exceptions.md), [Standard 21](21-versioning.md)). R3's rule-ID and scoring
assertions are likewise unbuildable today: the tool emits finding-category ids rather than rule IDs
([ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md)) and computes no score. R6 is not
implemented, and cannot be until a catalog exists to measure coverage against.

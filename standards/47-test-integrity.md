# Standard 47 — Test Integrity

A test suite is the only thing that tells you whether the software works. Every prohibition here
protects the same property: that a green run means something. A suite that has been adjusted until it
passes is worse than no suite, because it is trusted.

Source: the "Testing" section of
[`artifacts/prompts/second-fold-in-prompt.md`](../artifacts/prompts/second-fold-in-prompt.md).

## Scope

Applies to every repository under the framework. Part of the must-never layer defined by
[Standard 45](45-engineering-invariants.md). [Standard 29](29-testing.md) says what tests must
*verify*; this standard says what may never be done to them.

## Requirements

### R1 — Never weaken a test to make it pass

Reproduced verbatim from the source:

* delete a legitimate test merely because it fails
* weaken assertions simply to make tests pass

And, from the same list, reproduced verbatim from the source:

* reduce coverage solely to satisfy CI

Rule `testing.no-weakening-to-pass`, `forbidden`, `manual-review`, **non-exemptible**.

The qualifiers — *legitimate*, *merely*, *simply*, *solely* — are internal to the prohibition, which
is why no exception can be legitimate ([Standard 45](45-engineering-invariants.md) R3). Deleting a
test that tested the wrong thing is ordinary work. Loosening an assertion that was over-specified is
ordinary work. What is forbidden is doing either **because the code under it fails**, and the tell is
the order: the test changed after the implementation, and the implementation is the justification.

This is the domain instance of [Standard 45](45-engineering-invariants.md) R1. It is separated
because the general rule is about standards and the specific one is about the artifact that gets
touched first and hardest.

**The demonstrably-incorrect test.** A test may be genuinely wrong — asserting behaviour the
specification never required. Changing it is then correct, and the requirement is evidentiary, not
permissive: record the demonstration (which requirement, which specification, why the old assertion
contradicted it) **before** the change, and treat it as a scope change under
[Standard 10](10-scope-change-management.md) R1 where the behaviour itself moved. A demonstration
written after the fact, in the commit that also makes the suite green, demonstrates nothing.

**Violation:**

```text
- assert.equal(response.status, 200);
+ assert.ok(response.status < 500);      // "flaky" — changed in the commit that made the build green
```

**Permitted:**

```text
- assert.equal(body.createdAt, "2026-08-09T00:00:00Z");
+ assert.match(body.createdAt, /^\d{4}-\d\d-\d\dT/);   // ADR 0012: timestamps are server-generated;
                                                        // the old assertion pinned a value the spec
                                                        // never promised
```

### R2 — Never skip tests to hide failures

Reproduced verbatim from the source:

* skip tests to hide failures

**Already bound by existing rules**, and no new id is minted
([Standard 45](45-engineering-invariants.md) R4). [Standard 30](30-compliance-scoring.md) R3 —
skipped and not-evaluated rules are never counted as passes — and
[Standard 28](28-github-actions.md) R5 — a green build states its coverage — together make a hidden
skip visible where it matters, in the number the build reports.

A skip is legitimate when it is *declared*: an environment the test cannot run in, a dependency not
present, a feature behind a flag. What makes it a violation is the hiding — a skip whose reason is
that the test fails, and whose absence from the report lets the run look complete.

### R3 — Never fabricate test results

Reproduced verbatim from the source:

* claim tests passed without executing them
* fabricate test output

Rule `testing.no-fabricated-results`, `forbidden`, `manual-review`, **non-exemptible**.

There is no supported reason to report the result of a run that did not happen. This is
[Standard 9](09-verification.md) R4's requirement — verification produces evidence, not assertion —
stated as a prohibition, because the failure it prevents is not an omission but a false statement.
For AI-generated work it is the most common form of the failure, and
[Standard 53](53-ai-engineering-honesty.md) R2 routes there.

**Not mechanically checkable from a repository.** Nothing in a commit distinguishes a claim about a
run that happened from a claim about one that did not. What *is* checkable is elsewhere: CI runs the
commands itself ([Standard 28](28-github-actions.md) R2), so the run that gates the merge is not the
one being reported on. That is the structural defence; this rule is the normative one.

### R4 — Never replace behavioural verification with tautological tests

Reproduced verbatim from the source:

* mock the behavior being tested so completely that the test becomes meaningless

And, from the same list, reproduced verbatim from the source:

* replace behavioral verification with tautological tests

Rule `testing.no-tautological-tests`, `recommended` — not `forbidden`. A test that cannot fail proves
nothing ([Standard 29](29-testing.md) R5 is the same idea from the mutation-testing side), but the
line between a legitimately-mocked boundary and a mock that has swallowed the subject is a judgement
about what the test was for. A prohibition would either fire on every unit test with a stub or fire
on none, and neither is worth the false confidence.

**Violation:**

```text
const svc = { computeTotal: () => 42 };
assert.equal(svc.computeTotal(), 42);      // asserts the mock, not the code
```

**Permitted:**

```text
const gateway = { charge: () => ({ ok: true }) };   // the payment gateway is mocked — it is the
assert.equal(checkout(cart, gateway).total, 42);    // boundary, not the subject
```

### R5 — Fix the defect, not the test

The source states this prohibition in its AI-generated engineering section rather than its testing
one — altering tests instead of fixing the defect, unless the test itself is demonstrably incorrect.
[Standard 53](53-ai-engineering-honesty.md) R6 carries the source text, because that is the section
it belongs to; this requirement is the same prohibition seen from the testing side.

It is R1 restated from the agent's side and binds to the same rule id,
`testing.no-weakening-to-pass`. It is named separately because it is the decision point where the
violation actually occurs: a failing test presents two paths, and the prohibited one is faster.
[Standard 53](53-ai-engineering-honesty.md) R6 is the agent-facing duplicate of this pointer, for the
same reason.

## Additions this standard makes beyond the source

- R1's demonstrably-incorrect-test procedure: what "demonstrably" requires, and that the
  demonstration must precede the change. The source names the exception without saying what
  discharges it.
- R4's classification as `recommended` rather than `forbidden`, with the reason.
- The routing of R2 and R5 to existing rules rather than new ids.
- The observation under R3 that CI running the commands itself is the structural defence, since the
  prohibition itself cannot be checked from a repository.

## Relationship to other standards

[Standard 29](29-testing.md) defines what tests must verify and, in R4, that false green is the
higher-severity defect — the principle this whole standard protects.
[Standard 45](45-engineering-invariants.md) R1 is R1's general form.
[Standard 9](09-verification.md) R4 is what R3 prohibits the inverse of.
[Standard 30](30-compliance-scoring.md) R3 and [Standard 28](28-github-actions.md) R5 are what R2
routes to. [Standard 10](10-scope-change-management.md) R1 governs a test change that moves
behaviour. [Standard 53](53-ai-engineering-honesty.md) is the agent-side view of the same failures.

## Implementation

**Normative; three of five rules are review-required and honestly so.**

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R5 | `testing.no-weakening-to-pass` | `manual-review`, non-exemptible. The violation is a claim about *why* a test changed, and intent is not in the diff |
| R2 | [30](30-compliance-scoring.md) R3, [28](28-github-actions.md) R5 | Already enforced — a skip is never counted as a pass |
| R3 | `testing.no-fabricated-results` | `manual-review`, non-exemptible. Not checkable from a repository; CI executing the commands is the structural defence |
| R4 | `testing.no-tautological-tests` | `manual-review`, `recommended` |

**Recorded blind spot.** Test *removal* and coverage regression are both detectable in principle, and
both require comparing against a previous state of the repository — history analysis this framework
does not do. Named here rather than left for someone to assume the rules cover it.

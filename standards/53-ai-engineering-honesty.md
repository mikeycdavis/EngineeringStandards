# Standard 53 — AI Engineering Honesty

An AI agent's characteristic failure is not incompetence. It is confident description of work that
did not happen — an API that does not exist, a test run that was never executed, a feature reported
complete with a placeholder where the implementation should be. Every prohibition here is a form of
the same thing: a claim outrunning the evidence for it.

Source: the "AI-generated engineering" section of
[`artifacts/prompts/second-fold-in-prompt.md`](../artifacts/prompts/second-fold-in-prompt.md).

## Scope

Applies to work produced by an AI agent in any repository under the framework. Part of the must-never
layer defined by [Standard 45](45-engineering-invariants.md).

**These rules bind the human too.** An agent prohibited from claiming a test passed, working for an
operator who makes the claim on its behalf, has changed nothing about the honesty of the result. The
must-never layer applies to human-written and AI-generated changes alike, and this standard is
grouped by agent because that is where the failures concentrate, not because that is where they are
permitted.

## Requirements

### R1 — Never fabricate a capability

Reproduced verbatim from the source:

* fabricate APIs
* fabricate library capabilities

And, from the same list, reproduced verbatim from the source:

* invent repository state

Rule `ai.no-fabricated-capabilities`, `forbidden`, `manual-review`, **non-exemptible**.

A fabricated API is not a mistake about the world; it is a statement about the world made without
consulting it. There is no supported reason to make one, which is why the rule is non-exemptible.

This extends [Standard 44](44-existing-project-reconstruction.md) R2 forward in time. R2 prohibits
fabricating a project's *past* — what was intended, what was decided. This prohibits fabricating its
*present*: which functions exist, what the library does, what is in the repository. The remedy is the
same in both directions and is already stated —
[Standard 44](44-existing-project-reconstruction.md) R12: check, and where you could not check, say
`UNKNOWN` and say what search failed. *Unanswered is not unsearched, and unsearched is not absent.*

**Violation:**

```text
"I've used the library's built-in retry option."          — the library has no retry option
"The existing helper in utils/ already does this."        — there is no such helper
```

**Permitted:**

```text
"The library exposes no retry option that I can find in its type definitions or README, so I wrote
 one in src/retry.ts. If one exists under another name, this should be replaced."
```

### R2 — Never claim verification that did not run

Reproduced verbatim from the source:

* claim code compiles without compiling it when compilation is available
* claim tests pass without running them

**Already bound**, and no new rule id is minted ([Standard 45](45-engineering-invariants.md) R4).
[Standard 9](09-verification.md) R1 requires verification before declaring completion and R4 requires
it to produce evidence rather than assertion; [Standard 38](38-definition-of-done.md) R4 says a
checklist never overrides a rule result. On the catalog side this is
`testing.no-fabricated-results` ([Standard 47](47-test-integrity.md) R3), and it is the same rule
whether a human or an agent made the claim.

*When compilation is available* is the source's own qualifier, and it is the honest form of the
requirement: where a toolchain genuinely cannot be run, the correct report is that it was not run —
never silence, and never an inference dressed as a result.

### R3 — Never change scope or drop functionality silently

Reproduced verbatim from the source:

* silently change requirements
* silently expand scope
* remove functionality because implementing it is difficult

**Already bound**, and no new rule id is minted:
[Standard 10](10-scope-change-management.md) R1 — *do not silently change scope* — with R4 requiring
that the record not be a conversation and R5 requiring the update at the point of discovery.

The third prohibition deserves naming separately even though it routes to the same rule, because it
is the one that looks most like progress. Delivering nine of ten requirements and reporting completion
is a scope change that was never proposed; the ten-of-ten alternative is to deliver the nine and say
plainly which one is missing and why. Scaling the work down is the requester's decision, and taking
it silently is what this prohibits.

### R4 — Never leave a placeholder inside a completion claim

Reproduced verbatim from the source:

* replace production implementations with placeholders while claiming completion
* leave TODOs/stubs while claiming the feature is complete

**Already bound**, and no new rule id is minted: [Standard 38](38-definition-of-done.md) R5 — no
placeholders, no knowingly broken tests — with catalog rule `quality.unfinished-work`, which is
evaluated: `TODO`, `FIXME`, `NotImplementedException` and their relatives are detected in the comment
and structural views of code.

The prohibition is not against a stub. It is against a stub **inside a completion claim**. A `TODO`
in code that is reported as incomplete is a note; the same `TODO` under "done" is a false statement
about the software.

### R5 — Never bypass a safety control to finish a task

Reproduced verbatim from the source:

* bypass a safety control to complete a task

Rule `ai.no-safety-bypass`, `forbidden`, `manual-review`, **non-exemptible**.

This is the agent-side dual of [Standard 50](50-security-prohibitions.md) R1. That rule prohibits
disabling an access control to solve an implementation problem; this one prohibits an agent going
around any control — a permission prompt, an approval gate, a sandbox boundary, a rule in this
framework — because it stood between the agent and a completed task.

*To complete a task* is the qualifier and it is internal, which is why the rule is non-exemptible: a
control that may be bypassed when finishing is difficult is not a control. Where a control genuinely
blocks legitimate work, the response is to say so and stop, and let a human decide — which is
[Standard 2](02-propose-vs-execute.md)'s whole subject.

The most consequential instance is bypassing this framework's own machinery: an agent that manufactures
the attestations its work needs to pass has graded its own exam.
[ADR 0005](../artifacts/adr/0005-attestations-are-recorded-human-evidence.md) is why an attestation
records a *human* review, and [Standard 45](45-engineering-invariants.md) R1 is why weakening the
rule instead is not an alternative.

### R6 — Fix the defect, not the test

Reproduced verbatim from the source:

* alter tests instead of fixing the defect unless the test itself is demonstrably incorrect

Binds to `testing.no-weakening-to-pass` ([Standard 47](47-test-integrity.md) R1 and R5), which also
defines what *demonstrably incorrect* requires: the demonstration recorded before the change, not in
the commit that makes the suite green.

It is stated here as well because this is where the decision is actually made. A failing test presents
an agent with two paths, and the prohibited one is faster, produces a green run, and looks like
progress — which is why naming it in the agent-facing standard is not redundancy.

## Additions this standard makes beyond the source

- The scope note that these rules bind the human operator too. A prohibition that binds only the
  agent is one the operator can step around by typing the change themselves.
- R1's framing as [Standard 44](44-existing-project-reconstruction.md) R2 extended forward in time,
  and its remedy routed to R12's validated-search invariant.
- R3's separate treatment of *remove functionality because implementing it is difficult* as the
  scope change that most resembles progress.
- R4's distinction between a stub and a stub inside a completion claim.
- R5's identification of self-attestation as the most consequential instance, and its binding to
  [ADR 0005](../artifacts/adr/0005-attestations-are-recorded-human-evidence.md).
- The routing of R2, R3, R4, and R6 to existing rules rather than new ids.

## Relationship to other standards

[Standard 44](44-existing-project-reconstruction.md) R2 and R12 are R1's ancestor and its remedy.
[Standard 9](09-verification.md) and [Standard 38](38-definition-of-done.md) are what R2 and R4 route
to. [Standard 10](10-scope-change-management.md) owns R3.
[Standard 47](47-test-integrity.md) owns R6 and shares R2's catalog rule.
[Standard 50](50-security-prohibitions.md) R1 is R5's system-side dual.
[Standard 2](02-propose-vs-execute.md) is what an agent does instead of bypassing a control.
[Standard 15](15-ai-tool-contracts.md) governs the contracts an agent must not fabricate against.
[Standard 45](45-engineering-invariants.md) R1 is the invariant every rule here ultimately protects.

## Implementation

**Normative; two rules are new and both are review-required, for a reason worth stating.**

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `ai.no-fabricated-capabilities` | `manual-review`, non-exemptible. Detecting a fabricated API means resolving every symbol against every dependency's real surface — a type checker's job, and one this framework does not do |
| R2 | `testing.no-fabricated-results`, [9](09-verification.md) R1/R4 | Already bound. CI executing the commands itself is the structural defence |
| R3 | [10](10-scope-change-management.md) R1 | Already bound |
| R4 | `quality.unfinished-work` | **Evaluated** — `TODO`/`FIXME`/`NotImplementedException` detection, scanning the comment and structural views so a marker named in documentation is not a finding |
| R5 | `ai.no-safety-bypass` | `manual-review`, non-exemptible. A bypass is a claim about intent, and intent is not in the diff |
| R6 | `testing.no-weakening-to-pass` | `manual-review`, non-exemptible |

**Why the honest answer here is `manual-review` rather than a weak detector.** Every rule in this
standard is a claim about *why* something was written. A heuristic that guessed at intent would
produce findings nobody could act on and clean runs nobody should trust — the brittle check
[Standard 45](45-engineering-invariants.md) R5 forbids. Under
[Standard 45](45-engineering-invariants.md) R6, an unattested forbidden rule caps this project's
verdict at `NOT_EVALUATED` rather than passing quietly, which is the mechanism that keeps
"review-required" from meaning "ignored".

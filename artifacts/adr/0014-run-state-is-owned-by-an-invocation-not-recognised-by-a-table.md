# 0014 — Run state is owned by an invocation, not recognised by a table

- **Status:** Accepted
- **Date:** 2026-08-13
- **Deciders:** Project owner
- **Supersedes as a control:** [ADR 0007](0007-cli-scripts-are-single-run-programs-with-module-scoped-state.md).
  0007 is retained as historical evidence, and its binding table is deliberately **not** repaired.

## Context

[Standard 51](../../standards/51-architecture-integrity.md) R1 asks a decision record to name **what
the state is**, **who owns it**, and **how it is reset**. ADR 0007 answered that by declaring the
module scope to be the run scope and enumerating the module-level bindings that carried run state.

The enumeration was the weak part, and 0007 said so itself: it recorded that the table had been
incomplete at every review, that a declaration scan could not see alias-mediated writes, and that
completeness was a review obligation rather than a mechanical guarantee. It lagged again at the fifth
review. The rule text was categorical and remained correct; what kept failing was the ability to
*recognise* every binding the rule governed.

Two candidate controls were prototyped outside this repository before either was proposed for it.

### Candidate A — recognition

Derive the executable scope, find every representation of module-level mutable state, and make the
table mechanically complete.

Scope derivation worked, and worked better than expected: seven entrypoints from `package.json`
scripts, sixteen modules by transitive import, including a state-holding module the table had not
named. It also found the alias-mediated `surfaceLoss` case that ADR 0007 recorded as invisible to a
declaration scan — `direct=0, alias=5` — which was the negative control the design had to pass.

It then failed the adversarial round.

| Round | Cases | Caught |
| --- | --- | --- |
| Straightforward mutations | 8 | 8 |
| Adversarial representations | 6 | **1** |

The five misses included closure-hidden state, cross-module mutation, and writes reached through a
further alias. Every miss produced a **valid execution carrying wrong assurance** — the control
reported clean on a program that held exactly the state it existed to find.

### Candidate B — construction

Change the lifetime boundary instead. Every run-sensitive mutable object is created by the invocation
that uses it and cannot outlive it. How the state is *represented* stops mattering, because nothing
at module scope remains to be recognised, aliased, or hidden behind a closure.

The property is not "module scope is empty". Frozen lookup tables, extension sets, and matching
configuration such as `VENDOR_MARKERS` stay where they are: they are framework-owned data with no
mutation sites, and their values do not depend on which repository is being audited.

## The decisive argument is failure-mode asymmetry, not cleanliness

Candidate B is also tidier. That is not why it wins, and B was explicitly not credited for it.

- **Candidate A's failures were silent.** A missed representation yields a passing control and a
  false assurance, which is the defect
  [`ai.no-fabricated-capabilities`](../../rules/ai.json) exists to prohibit.
- **Candidate B's failures were loud.** Four defects arose while prototyping the transformation — a
  temporal-dead-zone crash from a destructured declaration, a function appearing in its own consumer
  list, mis-rewritten shorthand properties, and a recursive call forwarding pre-rename argument
  names. All four crashed immediately.

A third data point belongs here and is recorded against this project's own work rather than against
the rejected candidate. The first closure measurement reported a twenty-four-function blast radius by
counting parameters as captures. Corrected, the true count was zero — the detectors already take
`files` and `contents` explicitly — and a *different* twenty-four appeared later for an unrelated
reason. A real AST analysis produced a confident, plausible, materially wrong architectural
measurement twice, without failing, because its semantic model was incomplete. That is the class of
tool Candidate A proposed as the primary control, and it is the reason the correctness of this
prohibition must not depend on a recognition problem.

## Decision

**Accept Candidate B. Retire enumeration as the control.**

The governing invariant is about lifetime:

> **Execution-specific mutable state is owned by an invocation. No such state survives outside the
> invocation that created it, and importing the evaluator does not execute an audit.**

One small static invariant is retained alongside the behavioural suite, because it is closed and
mechanically checkable in a way that "find every possible shape of mutable state" is not:

> **Only the CLI boundary may terminate the process.**

## Evidence

Ten falsifiers, carried into the repository as tests. Each compares against a **fresh-process
oracle** — a separate `node` invocation of the same command — so a contaminated in-process run cannot
agree with itself.

| Property | How it is established |
| --- | --- |
| Import performs no run | importing the module produces no walk and no output |
| Process termination is the CLI's alone | zero `process.exit` / `process.exitCode` below the CLI boundary |
| Rendered output unchanged | `audit --json` and `validate --json` byte-identical to the fresh-process oracle |
| Exit codes unchanged | 0 / 1 / 2 across the three paths |
| Sequential independence | A→B, B→A, and A→A each equal their own oracle |
| Failure paths do not contaminate | a failed run followed by another equals that target's oracle |
| Concurrent independence, same root | two concurrent runs each equal the oracle |
| Concurrent independence, different roots | concurrent runs over two repositories each equal their own oracle |
| No shared identity | the findings sink, the repository surface, and the source cache are distinct objects per invocation |
| Completed results are inert | mutating a finished run's objects cannot affect a later run |

Every comparison reads the bytes the invocation itself rendered. An earlier version of the
concurrency test compared against a single patched `process.stdout.write`, where two runs interleave
into one buffer; it reported a pass, that pass could not distinguish independence from interleaving,
and it was discarded rather than counted.

**The negative control is the most important entry, and it cuts both ways.** Restoring the
pre-refactor lifetime for one object — a module-level source cache reused by every invocation — leaves
**nine of the ten behavioural checks green**. Only the identity assertion fails. Output equality is
therefore *not* sufficient evidence of independence, which is the recognition burden Candidate A
could not carry, appearing inside this project's own test suite. The control is kept as a test.

## `sources`, characterised rather than excused

The source cache was the last module singleton, and the question asked of it was: *can any supported
invocation produce a different correct value for an already-cached key without reloading the module?*

**Measured answer: no, today.** Every accessor call site keys on a path drawn from the current run's
file list, `CODE_EXT` is a subset of `TEXT_EXT`, and every code file in that list is written during
the read phase. No invocation can read an entry it did not itself write.

**It is still run-sensitive, and it is not an admissible exception.** Its values are the audited
project's file contents: the same key yields a different correct value for a different target. Its
inertness is a whole-program property that nothing enforces — it holds only while every read site
iterates the current surface, and a detector that queried a constructed path (an import target, a
sibling file, a path from configuration) would break it silently. It also grows without bound across
in-process invocations.

It therefore moves by **construction** — a new map per invocation — and never by clearing a shared
one at run start. Clearing makes sequential runs look independent while leaving two concurrent runs
sharing a single object, which is precisely the defect only the identity assertion detects.

## What this decision does not claim

- **Not arbitrary concurrent safety.** What is established is that two independent concurrent
  invocations remain independent under the tested execution paths. It is not a proof of correctness
  under arbitrary interleaving, and no such claim is made.
- **Not validated by the prototypes.** The candidates were mechanical transforms of a sandbox copy,
  used to decide between two designs. The repository implementation is **hand-written and must
  re-earn every property above on its own terms.** The tests are the evidence; the prototype is only
  the reason to attempt the change.

## Consequences

- ADR 0007's binding table stops being a control. Its omissions are the evidence for this decision
  and are preserved unrepaired.
- The order-dependence 0007 recorded still holds: `detectUnverifiedFunctionality` reads findings
  produced earlier in the same run. Ownership changes where the findings live, not the ordering.
  Preserving that order remains a requirement of any future change.
- `architecture.no-hidden-global-state` is a `manual-review` rule whose evidence was ADR 0007. That
  evidence changes here, so the existing attestation goes stale. **That is correct and expected.** It
  must not be recomputed or refreshed to make the verdict green; it returns for owner review with
  this record and the implementation as its subject.

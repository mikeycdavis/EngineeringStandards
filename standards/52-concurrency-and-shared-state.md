# Standard 52 — Concurrency and Shared State

Concurrency defects are the ones that pass review, pass CI, and fail in production under load. They
share a single cause: code that assumes an interleaving the runtime never promised. This standard is
short because that is genuinely one failure, not four.

Source: the "Concurrency" section of
[`artifacts/prompts/second-fold-in-prompt.md`](../artifacts/prompts/second-fold-in-prompt.md).

## Scope

Applies to any repository with concurrent execution — threads, async tasks, multiple processes,
multiple replicas of one service, or parallel CI jobs sharing a resource. Part of the must-never
layer defined by [Standard 45](45-engineering-invariants.md).

A single-threaded project with no shared mutable state declares R1 not-applicable with a
`revisitWhen` naming what would change that. "Single-threaded" is a claim worth checking before it is
declared: background tasks, parallel test runners, and horizontally scaled deployments all make it
false without any concurrency appearing in the source code.

## Requirements

### R1 — Never leave shared mutable state unsynchronized

Reproduced verbatim from the source:

* assume operations are atomic when they are not
* ignore known race conditions
* use shared mutable state without defining synchronization behavior

Rule `concurrency.no-unmanaged-shared-state`, `forbidden`, `manual-review`, exemptible.

**One rule for three prohibitions**, because they are one failure family with one remedy: state
reachable from more than one execution context, with no defined rule about how those contexts
interleave. Assuming atomicity is that failure stated as a belief; a known race is it stated as an
observation; unsynchronized shared state is it stated structurally. Splitting them into three rules
would produce three findings for one defect and three separate not-evaluated entries for a project
that has no concurrency at all.

**Defining synchronization behaviour is what discharges the rule** — a lock, a queue, a transaction
with a stated isolation level, immutability, single ownership, or a compare-and-swap. The requirement
is that the rule be *stated*, not that any particular mechanism be used. Undefined is the violation;
"defined, and defined as unnecessary because the value is immutable" is compliance.

**"Ignore" is the operative word in the second prohibition.** A known race that is documented,
triaged, and accepted with its consequences recorded is a managed risk. One that is known and left
unrecorded is the violation, and the tell is that the knowledge lives in someone's memory rather than
in the repository — which is [Standard 10](10-scope-change-management.md) R4's principle: a
conversation must not be the only record.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | A benign race whose outcomes are all acceptable — a cache fill where either writer's value is correct, a metrics counter where an occasional lost increment is tolerable |
| Justification | Why every possible interleaving is acceptable, stated as an enumeration rather than an assurance |
| Evidence | The comment or ADR recording that enumeration |
| Approval | Not required where the enumeration exists |
| Revisit | When the value's consumers change — a counter that becomes a billing input is no longer benign |

**Violation:**

```text
if (!cache[key]) cache[key] = await fetch(key);   // two callers, two fetches, one lost
counter.value = counter.value + 1;                // read-modify-write, unsynchronized
```

**Permitted:**

```text
cache[key] ??= fetch(key);                        // the promise is stored, so the second caller awaits
                                                  // the first fetch rather than starting another
await db.tx({ isolation: "serializable" }, (t) => t.increment("counter"));
```

### R2 — Never let a retry duplicate a non-idempotent operation

Reproduced verbatim from the source:

* implement retry behavior that can duplicate non-idempotent operations without protection

**Already bound**, and no new rule id is minted ([Standard 45](45-engineering-invariants.md) R4).
[Standard 13](13-idempotency.md) R1 requires idempotency support where duplicates would harm, and R4
requires idempotency and the `retryable` flag to agree — which is precisely this prohibition, stated
as an obligation and already carrying the mechanism (idempotency keys, deduplication windows,
conditional writes).

[Standard 48](48-error-handling-and-observability.md) R3 owns the other retry failure — retrying
forever. The two are independent: a bounded retry can still duplicate, and an unbounded one can be
perfectly idempotent.

## Additions this standard makes beyond the source

- The consolidation of three source prohibitions into one rule, with the reason: one failure family,
  one remedy, one finding.
- The statement that *defining* synchronization behaviour is what discharges the rule, including that
  "defined as unnecessary, because immutable" is a valid definition.
- The reading of *ignore* in the known-race prohibition, and its binding to
  [Standard 10](10-scope-change-management.md) R4.
- The scope note that "single-threaded" is a claim to verify — background tasks, parallel test
  runners, and multiple replicas all falsify it without appearing in the source code.
- The exception's requirement that acceptable interleavings be enumerated rather than asserted.

## Relationship to other standards

[Standard 13](13-idempotency.md) owns R2 entirely. [Standard 48](48-error-handling-and-observability.md)
R3 owns unbounded retry, which R2 is not. [Standard 10](10-scope-change-management.md) R4 is why a
known race must be recorded rather than remembered. [Standard 45](45-engineering-invariants.md)
defines the level semantics and the exception discipline.
[Standard 29](29-testing.md) is relevant in a way worth naming: a concurrency defect that only
appears under parallel execution is invisible to a suite that runs serially, so a green run says less
here than elsewhere.

## Implementation

**Normative, and deliberately not automated.**

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `concurrency.no-unmanaged-shared-state` | `manual-review`. Whether state is shared depends on how the code is *invoked*, which is not visible where it is defined; and whether synchronization is adequate depends on the invariant being protected, which is not in the code at all |
| R2 | [13](13-idempotency.md) R1, R4 | Already bound |

A structural check — module-level mutable bindings, say — would fire on every configuration object
and every memoization cache in every project, and be silenced within a week. That is the brittle
check [Standard 45](45-engineering-invariants.md) R5 forbids, and this rule stays `manual-review`
because a truthful `not-evaluated` is worth more than a check nobody reads.

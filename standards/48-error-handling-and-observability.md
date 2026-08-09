# Standard 48 — Error Handling and Observability

A failure that is not reported did not stop being a failure — it stopped being visible. Every
prohibition here is a way of making a system look healthier than it is, which is why they belong in
one standard: the error path and the telemetry path fail together, and for the same reason.

Source: the "Errors" and "Observability" sections of
[`artifacts/prompts/second-fold-in-prompt.md`](../artifacts/prompts/second-fold-in-prompt.md).

## Scope

Applies to every repository under the framework. Part of the must-never layer defined by
[Standard 45](45-engineering-invariants.md). [Standard 12](12-structured-errors.md) defines what an
error must *look* like; this standard defines what may never be done to one.

## Requirements

### R1 — Never silently swallow an exception

Reproduced verbatim from the source:

* silently swallow unexpected exceptions
* use empty catch blocks without explicit justification

And, from the same list, reproduced verbatim from the source:

* discard important error context

Rule `errors.no-swallowed-exceptions`, `forbidden`, `code-analysis`, `assurance: partial`,
exemptible.

**The justification comment at the catch site is the contract, and the detector honours it.** The
source says *without explicit justification*, so a catch that states why the exception is safely
ignored is not a violation — the comment is what turns a swallowed failure into a considered one. The
detector reads for a catch body that is empty of both code and comment. Rethrowing, logging,
returning a structured error, and translating to a domain error are all handling.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | A third-party library throws on a path the caller cannot influence, and the failure is genuinely inert |
| Justification | Written at the catch site, naming the exception and why nothing downstream depends on it |
| Evidence | The comment itself, in the code |
| Approval | Not required — the comment is the record |
| Revisit | When the library is upgraded |

**Violation:**

```text
try { await flush(); } catch (e) {}
```

**Permitted:**

```text
try { await flush(); } catch {
  // The buffer is discarded on shutdown anyway; a flush failure here has no observable effect.
}
```

**What the detector cannot see.** A catch whose body logs at debug level and continues is *shaped*
like handling and *behaves* like swallowing. Structure cannot distinguish them, and this rule's
`partial` assurance says so ([Standard 45](45-engineering-invariants.md) R5).

### R2 — Never report success for a failed operation

Reproduced verbatim from the source:

* report success after an operation failed

And, from the same list, reproduced verbatim from the source:

* convert failures into misleading successful responses

Rule `errors.no-false-success`, `forbidden`, `manual-review`, **non-exemptible**.

The source names the HTTP form of this in its API list — returning successful status semantics for a
failed operation merely to hide errors — and it lands here, because the failure is the same one
whether it crosses a network or a function boundary: the caller is told the thing happened.

There is no supported reason to do this, which is what makes the rule non-exemptible
([Standard 45](45-engineering-invariants.md) R3). *Partial* success is a real state and is not this
rule's subject: [Standard 14](14-structured-results.md) R5 requires that it be representable, and
representing it honestly is the remedy, not the violation.

The shapes that make honesty possible are already specified — [Standard 12](12-structured-errors.md)
for the error, [Standard 14](14-structured-results.md) for the result — so this rule adds the
prohibition, not a second schema.

**Violation:**

```text
catch (e) { return { status: "ok", items: [] }; }        // the fetch failed; the caller sees success
```

**Permitted:**

```text
catch (e) { return { status: "failed", error: toStructuredError(e) }; }
```

### R3 — Never retry indefinitely

Reproduced verbatim from the source:

* retry indefinitely

Rule `errors.no-unbounded-retry`, `forbidden`, `manual-review`, exemptible.

An unbounded retry converts a failure into a hang, and a hang is harder to diagnose than the failure
it replaced: nothing reports, nothing terminates, and the dependency is held under load precisely
when it is least able to bear it.

**Duplicate-on-retry is a different failure** and belongs to [Standard 13](13-idempotency.md) R1 and
R4; [Standard 52](52-concurrency-and-shared-state.md) R2 routes there.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | A supervised long-lived connection (message consumer, websocket, replication stream) whose correct behaviour is to keep reconnecting |
| Justification | Why termination is worse than reconnection for this component |
| Evidence | Bounded backoff with a documented ceiling, and a health signal that reports the reconnecting state |
| Approval | Not required where the backoff and the health signal are both in the code |
| Revisit | When the supervision strategy changes |

The exception is for *unbounded attempts*, never for *unbounded silence*: a component that reconnects
forever without reporting that it is doing so violates R4 instead.

### R4 — Never silence a failure path

Reproduced verbatim from the source:

* claim an operation is observable when critical failure paths are invisible
* remove useful telemetry solely to hide errors/noise

Rule `observability.no-silenced-failures`, `forbidden`, `manual-review`, exemptible.

Two failures, one rule, because they produce the same end state: a system whose dashboards are clean
because the failures no longer reach them. The qualifier *solely* is what separates this from
ordinary log-volume management — reducing noise is legitimate work, and its tell is that the signal
survives the change while the volume drops.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | Telemetry is removed or downsampled for cost or volume, and the failure path remains observable by another signal |
| Justification | Which signal now carries the failure |
| Evidence | The replacement signal, named — a metric, an alert, a structured log at a level that is retained |
| Approval | Not required where the replacement is in the same change |
| Revisit | When the replacement signal is itself removed |

### R5 — Never log secrets

Reproduced verbatim from the source:

* log secrets
* log sensitive information unnecessarily

**Already bound**, and no new rule id is minted ([Standard 45](45-engineering-invariants.md) R4).
[Standard 16](16-security.md) R2 is the general prohibition,
[Standard 3](03-auditing.md) R5 states it for audit logs specifically, and
[Standard 12](12-structured-errors.md) R5 states it for the `details` field of a structured error —
which is where a secret most often escapes, because the error payload is assembled from whatever was
in scope when the failure occurred.

## Additions this standard makes beyond the source

- Combining Errors and Observability into one standard, with the reason: both prohibitions produce a
  system that looks healthier than it is.
- R1's treatment of the justification comment as the machine-honoured contract, and the explicit
  statement of what a structural detector cannot see.
- Placing the source's HTTP-status prohibition here rather than in the architecture standard, since
  the failure is the boundary-independent one.
- The exception tables, and R3's distinction between unbounded attempts and unbounded silence.
- R4's reading of *solely*, and the requirement that a replacement signal be named.

## Relationship to other standards

[Standard 12](12-structured-errors.md) defines the error shape R2's remedy uses, and its R5 is what
R5 routes to. [Standard 14](14-structured-results.md) R5 makes partial success representable, which
is what keeps R2 from forbidding an honest answer. [Standard 13](13-idempotency.md) owns
duplicate-on-retry, which R3 explicitly does not.
[Standard 16](16-security.md) R2 and [Standard 3](03-auditing.md) R5 are R5's rules.
[Standard 45](45-engineering-invariants.md) defines `forbidden`, the exception discipline, and what
`partial` assurance is allowed to claim.

## Implementation

**Partially implemented.**

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `errors.no-swallowed-exceptions` | Evaluated, `code-analysis`/`partial`. Detects a catch empty of code and comment; a catch that logs and continues is not distinguishable by structure |
| R2 | `errors.no-false-success` | `manual-review`, non-exemptible. Whether a returned success is truthful requires knowing what the operation was supposed to do |
| R3 | `errors.no-unbounded-retry` | `manual-review`. A retry ceiling is often in configuration rather than code |
| R4 | `observability.no-silenced-failures` | `manual-review`. Requires knowing which failure paths are critical |
| R5 | [16](16-security.md) R2, [3](03-auditing.md) R5, [12](12-structured-errors.md) R5 | Already bound; the secret detector added at 2.0.0 covers the artifact side |

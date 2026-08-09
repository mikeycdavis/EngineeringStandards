# 0004 — `audit` and `validate` are separate commands, and the v1 public surface is frozen

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

[Standard 23](../../standards/23-standards-validator-cli.md) R2 names `standards validate` as the
required first feature. The implementation shipped `standards audit`, and the two have coexisted with
the discrepancy disclosed rather than resolved — in
[`INSTRUCTIONS.md`](../../INSTRUCTIONS.md), in Standard 23's own implementation section, and in a
test that fails deliberately when the rename lands.

The discrepancy has to be settled before `1.0.0`, because a CLI surface is one of the things a
version pins. Resolving it afterwards would be a `MAJOR` change to a framework nobody had finished
adopting.

Two things happened while building the compliance engine that change what the right answer is.

**The tool acquired two genuinely different jobs.** It walks a repository and reports what it
observes — architecture, capabilities, missing artifacts, discrepancies — and, separately, it loads
`project-policy.yml`, applies applicability and exceptions, enforces `nonExemptible`, and produces a
compliance verdict. These are not two views of one operation. The first is useful with no policy at
all, which is exactly the situation [Standard 44](../../standards/44-existing-project-reconstruction.md)
reconstruction starts from. The second is meaningless without one.

**Their exit-code semantics diverged.** The evidence survey exits `0` even with warnings, because
`--strict` is what promotes advisory findings — a build that breaks on a heuristic dead-code guess is
a build someone disables ([Standard 28](../../standards/28-github-actions.md)). The compliance
verdict exits `1` on a required-rule failure regardless of `--strict`, because that is the gate.
Forcing both into one command means one of those two behaviours has to be wrong.

There is also a smaller inconsistency worth fixing in the same breath: the JSON envelope carries
`schemaVersion: "1.0"` while a policy declares `standardVersion: "1.0.0"`. They are independently
versioned and should stay so, but using two *formats* for two adjacent fields is friction with no
benefit.

## Decision

### Two commands, two jobs

```text
standards audit      evidence discovery
standards validate   policy-aware compliance evaluation
```

**`audit` reports what the tooling observed.** It never produces a compliance status, a score, or an
assurance breakdown, and it works on a repository with no policy. Its output is evidence, explicitly
partial, with `INFERRED` findings labelled as such.

**`validate` produces the authoritative verdict.** It loads `project-policy.yml`, applies
applicability and exceptions, enforces `nonExemptible`, and emits status, score, assurance, and
framework coverage.

`audit` is **not** an alias for `validate`. The framework's central distinction is between evidence
and verdict — [Standard 24](../../standards/24-validator-rules.md) R2 is that distinction, and
[Standard 30](../../standards/30-compliance-scoring.md) R1 is it again at the aggregate. A CLI that
blurs the two would contradict the standards it enforces.

**`validate` is the command CI and consuming projects gate on.** `audit` is for diagnostics,
discovery, reconstruction, and evidence inspection.

```bash
standards audit .
standards validate .
standards validate . --format json
standards validate . --strict
```

### Exit codes

`validate` uses the compliance contract:

```text
0 = compliant (including COMPLIANT_WITH_EXCEPTIONS)
1 = evaluated and non-compliant
2 = invocation / configuration / schema error
```

A project with **no policy** is `NOT_EVALUATED` and exits `2` under `validate`: a verdict was
requested and there is nothing to evaluate against. That is a configuration problem, not a compliance
failure ([Standard 30](../../standards/30-compliance-scoring.md) R1).

`audit` has its own, documented separately rather than forced into the compliance contract:

```text
0 = the survey completed
1 = --strict was given and something needs attention
2 = invocation error
```

### `schemaVersion` is semantic

Normalised to three-component semantic versioning before v1:

```json
{ "schemaVersion": "1.0.0", "standardVersion": "1.0.0" }
```

They remain **independently** versioned. Independence means they may diverge numerically —
`{ "schemaVersion": "2.1.0", "standardVersion": "1.4.3" }` is expected — not that they use different
formats.

### The v1 public surface, frozen

Changing any of these after `1.0.0` is a `MAJOR` release
([Standard 21](../../standards/21-versioning.md)):

- CLI command names and their high-level semantics
- The project-policy schema
- Canonical rule IDs
- Alias resolution behaviour
- The rule-catalog entry contract
- The validator JSON envelope
- Compliance statuses
- `disposition` values
- Exit-code meanings
- Score semantics
- Assurance semantics
- Framework-coverage semantics

### Explicitly not frozen

These may change in any release, and consumers must not depend on them:

- Human-readable console wording and layout
- Internal module layout
- Implementation language
- Detector internals — which patterns fire, and how
- Ordering of non-semantic output
- Model or provider implementation details

The line between the two lists is the line between *contract* and *implementation*. A consumer
scraping console text has no contract ([Standard 31](../../standards/31-whatsnext-compatibility.md)
R2), and a detector improving its heuristics is not a breaking change even though the findings differ.

## Alternatives considered

**Rename `audit` to `validate` and drop the old name.** Rejected. It destroys the distinction the
tool actually has, and it would leave the evidence survey — the thing reconstruction depends on —
with no command of its own.

**Keep `audit` as a compatibility alias for `validate`.** Rejected for the same reason, plus one
more: an alias implies the two are interchangeable, so a project would gate CI on `audit` and get the
survey's exit semantics while believing it had the verdict's. The failure would be silent and would
read as green.

**Ship `validate` only, and make evidence a flag (`--evidence`).** Rejected. A mode flag makes the
two jobs look like one operation with a display option, which is precisely the conflation. It also
gives one command two exit-code contracts selected by a flag.

**Leave `schemaVersion` at `"1.0"`.** Rejected. It is a two-character fix now and a `MAJOR` change
after v1.

**Defer the whole question past 1.0.0.** Rejected. CLI names are part of the surface a version pins;
deferring means the first thing after the first release is a breaking change to it.

## Consequences

**Makes easier.** CI gates on a command whose only job is the verdict. Reconstruction and diagnostics
use a command that does not demand a policy. Each has one exit-code contract, so neither has to be
explained with an exception.

**Makes harder.** Two commands is more surface to document, test, and keep consistent — and their
shared scan must not drift into two scanners. A consuming project must understand which one to gate
on, which is why the recipe in [`INSTRUCTIONS.md`](../../INSTRUCTIONS.md) shows both with their
purposes.

**Commits the project to.** Treating the frozen list above as a stable interface, and to a `MAJOR`
release for any change to it. Also to never letting `audit` grow a compliance verdict or `validate`
become the only way to see evidence.

**Known cost accepted.** `schemaVersion` changes shape a second time — from numeric `1`, to `"1.0"`,
now to `"1.0.0"`. Both changes happened before anything consumed the envelope, and this ADR is the
point after which that stops being free.

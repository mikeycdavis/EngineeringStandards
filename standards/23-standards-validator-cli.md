# Standard 23 — Standards Validator CLI

The command that checks a repository against the standards. Its output is consumed by CI and by
agents, which makes the CLI itself a machine-facing contract —
[Standard 15](15-ai-tool-contracts.md) applies to it.

Source: item 23 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines the contract a validator must satisfy. Completes the governance layer with
[20](20-exceptions.md), [21](21-versioning.md), and [22](22-adoption-and-migration.md).

An implementation exists in this repository — `scripts/standards.mjs`. It is **audited against this
standard** at the end of this document rather than assumed to satisfy it.

## Requirements

### R1 — The command

Build a CLI named, reproduced verbatim from the source:

```text
standards
```

or:

```text
engineering-standards
```

Choose a simple implementation language suitable for cross-platform use, working easily on Windows,
macOS, Linux, and GitHub Actions.

### R2 — `validate` is the required first feature

The initial command should be:

```text
standards validate
```

It should inspect a target repository, supporting:

```text
standards validate
standards validate .
standards validate ../CarDoc
standards validate --format json
standards validate --strict
```

Also consider `standards init`, `standards explain <rule>`, and `standards version` — **but
`validate` is the required first feature.**

### R3 — Exit codes

Exit codes are the CLI's primary contract with CI and with agents, and MUST be:

```text
0 = validation completed; project compliant
1 = validation completed; compliance failures found
2 = validator/configuration/invocation error
```

The distinction between `1` and `2` is the important one. `1` means the validator worked and the
project has problems. `2` means the validator could not reach a verdict — an unreadable policy, an
unresolvable `standardVersion` ([Standard 21](21-versioning.md) R5), an unknown subcommand, a target
that does not exist. Collapsing them tells CI that a broken validator is a failing project, and the
usual response to that is to weaken the check.

**Warnings alone MUST exit `0`** unless `--strict` explicitly promotes them. A tool that fails a
build on advisory findings gets disabled, and then nothing is checked at all.

| Situation | Exit |
| --- | --- |
| Compliant; no findings | `0` |
| Warnings only, no `--strict` | `0` |
| Warnings only, with `--strict` | `1` |
| Any compliance failure | `1` |
| Unresolvable `standardVersion`, unreadable or invalid policy | `2` |
| Unknown subcommand, bad flag, missing target | `2` |
| Unhandled internal error | `2` |

### R4 — JSON output is a versioned contract

`--format json` (or an equivalent flag) MUST emit a document carrying **its own schema version**, and
that document is a machine-facing interface governed by
[Standard 15](15-ai-tool-contracts.md) — versioned, with breaking changes managed intentionally.

```json
{
  "schemaVersion": "1.0",
  "standardVersion": "1.0.0",
  "status": "NON_COMPLIANT",
  "score": 88,
  "results": []
}
```

| Field | Is |
| --- | --- |
| `schemaVersion` | The version of *this output format* — see [Standard 21](21-versioning.md) R1; it moves independently of the others |
| `standardVersion` | The framework version the project declared and was evaluated against |
| `status` | The verdict, from a closed set |
| `score` | Compliance score, where the implementation computes one |
| `results` | The individual findings |

Two consequences of R4 being a Standard 15 contract: renaming a field or changing what a `status`
value means is a **breaking change**, and adding a field is minor. Consumers are CI configurations
and agents, neither of which reads a changelog.

`status` SHOULD come from a closed enumeration so a consumer can branch on it —
`COMPLIANT`, `NON_COMPLIANT`, and a distinct value for "could not evaluate", which corresponds to
exit `2` and MUST NOT be reported as `NON_COMPLIANT`.

### R5 — Exceptions are applied and reported

A validator MUST apply the project's exceptions ([Standard 20](20-exceptions.md)) when reaching a
verdict, and MUST report which were applied even on a pass. An expired exception MUST NOT be honoured
and SHOULD be reported distinctly from an absent one.

A verdict that ignores exceptions is not a compliance verdict — it is a list of rule departures, some
of which the project already recorded and approved.

### R6 — Cross-platform, and honest about what it did not check

The validator MUST run on Windows, macOS, Linux, and GitHub Actions without per-platform handling by
the caller.

Where a validator cannot check a requirement — because it is semantic, or because the project did not
publish what the check needs — it MUST say so rather than passing silently. **A clean run must never
be readable as "compliant" when it means "nothing matched".** This is the same rule
[Standard 5](05-resumability.md) R3 applies to reading a repository: absence of a finding is evidence
about the check before it is evidence about the project.

## Additions this standard makes beyond the source

- R3 in full. The source specifies no exit codes; these are authored, and the warnings-exit-`0` rule
  and the `1`/`2` split are the parts most load-bearing for CI.
- R4 in full — the JSON envelope, its own `schemaVersion`, and the ruling that this output is a
  [Standard 15](15-ai-tool-contracts.md) contract.
- R5 in full.
- R6's requirement that unchecked requirements be disclosed.

## Audit of the existing implementation

`scripts/standards.mjs` predates this standard. Audited against it rather than assumed compliant:

| Requirement | State |
| --- | --- |
| R1 — named `standards`, cross-platform | **Met.** Node ESM, zero dependencies, `bin: standards`. |
| R2 — `validate` subcommand | **Not met.** The implementation provides `audit`, not `validate`. |
| R2 — target forms, `--json`, `--strict` | **Partially met.** `standards audit .`, `standards audit ../Other`, `--json`, `--strict`, and `--dir=` all work. The flag is `--json` rather than `--format json`. |
| R3 — exit codes | **Partially met.** `0` and `1` behave as specified, including warnings exiting `0` without `--strict`. There is no exit `2`: an invocation error currently exits `1`. |
| R4 — versioned JSON envelope | **Partially met.** Output carries `schemaVersion`, but as a number rather than a string, and has no `standardVersion`, `status`, or `score`. `findings` corresponds to `results`. |
| R5 — exceptions applied | **Not met.** The implementation does not read `project-policy.yml`, so it applies no exceptions and reaches no compliance verdict. |
| R6 — cross-platform | **Met.** |
| R6 — honest about coverage | **Met, and exceeded.** Every human-readable run states that coverage is partial and that a clean run means nothing matched, not that the repository is compliant. |

**Existing strengthenings**, disclosed rather than silently absorbed — the implementation already goes
beyond this standard in three ways, and none should be removed to match the wording here:

- Every finding carries a `standardRef` pointing at the requirement anchor that produced it, so a
  finding is traceable to a rule. This standard does not require it; it should.
- Every finding carries a [Standard 44](44-existing-project-reconstruction.md) evidence label, so a
  consumer can distinguish an observation from a heuristic.
- Findings carry `severity`, which is what makes R3's warnings-exit-`0` rule implementable at all.

**Reconciliation is planned work, not a rewrite.** `audit` and `validate` are arguably different
commands — a survey of what a repository contains, versus a verdict against a declared policy — and
the honest resolution is likely both, sharing a scan. That decision belongs in an ADR rather than in
this document.

## Implementation

Implemented in part by `scripts/standards.mjs`, audited above. The gaps are tracked in
`artifacts/project-plan-breakdown/`.

The prerequisite for R5, and therefore for any real compliance verdict, is reading
`project-policy.yml` — the same gap [Standard 18](18-machine-readable-project-policy.md) and
[Standard 20](20-exceptions.md) both name as the largest available improvement to this tool.

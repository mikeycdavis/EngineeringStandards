# Standard 28 — GitHub Actions

Continuous integration is where a standard stops being advice. This standard governs *how* CI runs
the validator — one validation path, shared with developers, producing evidence a machine can read.

Source: item 28 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **enforcement in CI**. What the validator checks belongs to
[Standard 24](24-validator-rules.md), what it emits to [Standard 25](25-validator-output.md), and how
it is invoked to [Standard 23](23-standards-validator-cli.md). This standard adds nothing to the
validator; it constrains how automation uses it.

The rule that governs this batch (Standards 28–31) applies here first:
**automation may aggregate evidence, but it MUST NOT overstate assurance.** A green build is an
aggregate, and it is the one people act on.

## Requirements

### R1 — Publish a workflow projects can enforce

**Create a workflow showing how projects could enforce standards.** The source's example use case,
reproduced verbatim:

```yaml
- name: Validate engineering standards
  run: standards validate --strict
```

The workflow is published as a reference for *consuming* projects. It is not the same thing as this
repository's own CI, which validates the standards themselves (R4).

### R2 — CI runs the same canonical commands developers run locally

**CI MUST invoke the same canonical validation commands a developer runs locally. It MUST NOT
maintain a second validation path.**

This is the load-bearing requirement of the standard. A workflow that inlines its own checks — a
bespoke `grep`, a re-implemented rule, a different flag set — creates a second validator that nobody
tests and nobody can reproduce. Its two failure modes are both bad: it fails on something that passes
locally, which trains people to distrust CI, or it passes on something that fails locally, which is
false green.

In practice this means the commands are defined once, in the project's task runner or scripts, and
the workflow calls them:

```yaml
- run: npm run inventory
- run: npm test
- run: npm run audit
```

not:

```yaml
- run: node -e "…re-implemented check…"
```

A corollary: **if CI needs a check that does not exist as a local command, add the command, then call
it.** The workflow is a caller, never an author of rules.

### R3 — Machine-readable output is preserved as an artifact

**Where practical, CI MUST preserve the validator's machine-readable output as a build artifact**,
so a failure can be consumed by [WhatsNext](31-whatsnext-compatibility.md) or another agent rather
than only read from console logs.

Console logs are a human surface, and scraping them is exactly the coupling
[Standard 25](25-validator-output.md) R2 exists to prevent. Emitting the JSON envelope and uploading
it costs one step:

```yaml
- name: Validate engineering standards
  run: standards validate --format json > standards-report.json
  continue-on-error: true

- uses: actions/upload-artifact@v4
  if: always()
  with:
    name: standards-report
    path: standards-report.json
```

Two details matter. `if: always()` is not optional decoration — **the run that fails is the run whose
report is worth keeping**, and a conditional-on-success upload preserves only the uninteresting ones.
And the report must be produced before the job's failure short-circuits it, which is what the
`continue-on-error` on the validation step (with an explicit gate afterwards) or a separate reporting
step achieves.

"Where practical" is the source's own hedge and is honoured: a project without artifact storage still
satisfies this standard by emitting JSON to a known path.

### R4 — What this repository's own CI validates

**For this repository itself, CI should validate**, reproduced verbatim from the source:

```text
formatting

tests

JSON Schema validity

example policy files

CLI tests

rule catalog integrity

Markdown links where practical
```

Present state, honestly:

| Source item | Status here |
| --- | --- |
| formatting | Not checked. No formatter is configured |
| tests | `npm test` |
| JSON Schema validity | Nothing to validate — no schema published yet ([Standard 19](19-json-schema.md)) |
| example policy files | Nothing to validate — no example policies exist yet |
| CLI tests | `npm test` covers `scripts/standards.mjs`; the same command |
| rule catalog integrity | Nothing to validate — no catalog exists yet ([Standard 27](27-rule-catalog.md)) |
| Markdown links where practical | Checked by the audit's own link detection, within this repository |

Four of the seven have nothing to check because the artifact does not exist. That is recorded as
*nothing to validate*, not as passing — the distinction R5 makes.

Two checks exist here beyond the source's list, and both were added because a specific failure
happened: `npm run inventory` proves the standards series has not silently changed shape, and
`npm run fidelity` proves every block claiming to be verbatim source actually is.

### R5 — A green build states its coverage

**A passing CI run MUST NOT be presented as evidence of compliance beyond what it evaluated.**

This is [Standard 24](24-validator-rules.md) R2 applied to the build status, and CI is where the
elevation is easiest, because the output is a single bit. A green check mark next to "Validate
engineering standards" reads as *this project meets the standards*. What it actually means is *the
implemented checks that ran did not fail*.

Two obligations follow:

- **A skipped or unimplemented check MUST NOT be reported as a passing step.** A step that does
  nothing because the artifact it validates does not exist is a skip, and should be visible as one.
- **The preserved report (R3) is the authoritative record**, not the badge. The report carries
  `summary.skipped` and per-result `validationType`; the badge carries neither.

### R6 — The absence of a step is a decision, and is recorded

Where a workflow deliberately omits a check — an install step, a strict flag, a whole category — the
reason SHOULD be recorded in the workflow file itself, next to where the step would be.

A missing step is indistinguishable from a forgotten one six months later, and the usual repair is to
add it back, undoing a decision nobody knew was made. The workflow file is the only place a reader is
guaranteed to look.

## Additions this standard makes beyond the source

- R2 in full — one validation path, and the ruling that CI is a caller rather than an author of
  rules. The source shows a workflow step without saying what CI may not do.
- R3 in full — artifact preservation, `if: always()`, and the reasoning that the failing run is the
  one worth keeping.
- R5 and R6 in full.
- R4's status table. The source lists what CI should validate; the honest present state is this
  standard's own disclosure.

## Relationship to other standards

[Standard 23](23-standards-validator-cli.md) defines the command CI invokes and the exit codes it
gates on. [Standard 25](25-validator-output.md) defines the report R3 preserves.
[Standard 24](24-validator-rules.md) R2 is what R5 applies to the build signal.
[Standard 29](29-testing.md) covers the tests CI runs. [Standard 31](31-whatsnext-compatibility.md)
is the consumer R3 exists to serve.

## Implementation

`.github/workflows/ci.yml` runs `inventory` → `fidelity` → `test` → `audit`, all as `npm run`
commands that a developer runs identically — R2 is satisfied. It has no install step, and the reason
is recorded in a comment next to where one would go, along with the note that an appearing `npm ci`
means the zero-dependency decision changed. That comment is R6 in practice.

The audit step is deliberately not `--strict`, and the reason is recorded in the file: `--strict`
fails on warnings, which would turn every advisory finding into a broken build and get the step
disabled. The error gate is instead an assertion in `test/audit.test.mjs` that this repository has no
error-severity findings.

**R3 is not implemented.** CI does not emit or upload `--json` output, so a failing run is readable
only from the console. This is the smallest remaining gap in this standard and the one that blocks
[Standard 31](31-whatsnext-compatibility.md) from being exercised at all.

**R1 is not implemented.** No reference workflow for consuming projects is published — this
repository's CI validates the standards rather than demonstrating enforcement of them, and the two
should not be conflated into one file.

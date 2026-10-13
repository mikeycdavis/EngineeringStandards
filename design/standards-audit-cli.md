# Design — `standards audit` CLI

## Purpose and non-goals

**This design is implemented.** `scripts/standards.mjs` ships the finding ids listed below, and more (see that section).
The document was written before the tool existed, so that the artifacts mandated
by the standards — particularly
[Standard 44](../standards/44-existing-project-reconstruction.md) — would be shaped from the start to
be machine-readable rather than needing rework. It stays because it remains the record of the
*contract and the decisions*: the finding categories, the flag vocabulary, the zero-dependency
choice, and the use/mention rule, which is the one section an implementation is most likely to get
wrong and has already got wrong five times.

**Where the implementation went past this design**, recorded here so the document does not quietly
understate what exists:

| Change | Where |
| --- | --- |
| The command split in two — `audit` discovers evidence, `validate` produces the verdict. This document describes `audit` alone; nothing here specifies a compliance status, because the verdict engine did not exist when it was written | [ADR 0004](../artifacts/adr/0004-audit-and-validate-are-separate-commands.md) |
| Every finding carries a canonical `rule` id from the catalog, not only a `standardRef`. Categories were the identity when this was written; rule IDs are now the identity, and categories are how findings are grouped for a reader | [ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md), `rules/` |
| `standardRef` resolves to a section anchor in a standard file, so a finding links to the requirement rather than naming it | `scripts/standards.mjs` |

The audit is scoped to **all** standards, not only 44. That is why this design lives in `design/`
rather than inside a single standard document.

**Non-goals:** this document does not specify a package layout or a release plan. The implementation
language was left open here and settled in the building: Node with zero third-party dependencies, for
the reasons recorded below.

## CLI contract

```bash
standards audit .
```

| Flag | Meaning |
| --- | --- |
| `--json` | Emit the structured report on stdout instead of the human-readable one. |
| `--dir=<path>` | Audit a directory other than the resolved project root. |
| `--strict` | Exit 1 when any finding needs attention. Default exit is 0 unless the audit itself failed. |

This flag vocabulary deliberately mirrors `~/.claude/skills/backlog-reconcile/scripts/reconcile.mjs`
and `~/.claude/skills/backlog-validate/scripts/backlog.mjs`, the closest existing prior art. A user
who knows one should not have to learn a second set of conventions. Like those scripts, the project
root should be located by walking up for `.git` or `package.json`, so the command works from any
subdirectory.

The audit **reports**; it does not write to the repository it audits.

## Implementation and distribution

Decided 2026-08-08, before any code exists, because the choice constrains everything downstream.

**Language: Node.js ESM, in a single `.mjs` file, with zero third-party dependencies.** Only `node:`
builtins — `node:fs/promises`, `node:fs`, `node:path`, and `node:child_process` for git. Arguments are
parsed by hand against `process.argv`, not with a CLI framework.

*Why:* this is exactly the shape of the two tools the owner already runs.
`~/.claude/skills/backlog-validate/scripts/backlog.mjs` (509 lines) and
`~/.claude/skills/backlog-reconcile/scripts/reconcile.mjs` (292 lines) are both dependency-free Node
ESM importing only `node:` builtins and parsing `process.argv` with `includes()` and a `--dir=` prefix
scan. Matching them means one runtime to have installed, no lockfile to maintain, no supply chain for
a tool whose entire job is to judge other repositories' hygiene, and no version skew between the three
tools. A tool that audits standards compliance cannot credibly arrive with fifty transitive
dependencies.

*Rejected:* a compiled binary in Go or Rust, which would remove the Node dependency but adds a build
and per-platform release step to a repository that currently has no build at all. Reconsider only if
audit runtime on a large repository becomes the constraint, which it will not for a tool that reads
text files. Also rejected: Python, which is present on this machine but is not what the sibling tools
use, and would make three tools need two runtimes.

**Location: `scripts/standards.mjs` in this repository — not in a skill.** This is the one place the
audit deliberately departs from the backlog tools' precedent.

*Why:* the backlog scripts live inside skills because they are those skills' helpers. The audit is not
a helper; it is this repository's own product, and the thing it judges is compliance with the
documents committed beside it. Keeping it here gives it version history, review, and a diff whenever
its rules change — none of which the global skills have, by the decision recorded in
`artifacts/project-plan-breakdown/00-overview.md`. For a tool whose output is "your repository is
non-compliant", being able to ask *when did that rule change and why* is not optional.

**Distribution: an npm `bin` entry, plus a no-install fallback.** Add a minimal `package.json` to this
repository declaring `"type": "module"`, `"bin": { "standards": "scripts/standards.mjs" }`, and no
dependencies. Give the script the shebang `#!/usr/bin/env node`. Installing with `npm link` from the
repository root, or `npm i -g .`, puts `standards` on `PATH` and makes the specified invocation work
verbatim:

```bash
standards audit .
```

Without installing anything, the same run must also work from a clone:

```bash
node scripts/standards.mjs audit .
```

*Why both:* the source specification names `standards audit .` literally, which requires a `PATH`
binary; but requiring a global install before a repository can be audited would put the tool behind
exactly the friction the backlog scripts avoid by being runnable from an absolute path. Supporting
both costs one shebang and an argv branch.

*Note:* adding `package.json` makes this repository's root detectable by the sibling scripts' own
walk-up logic, which looks for `.git` or `package.json`. That is harmless here — both markers resolve
to the same directory.

**Subcommand shape.** `audit` is the first subcommand, not the only one — the binary is `standards`,
so argument parsing must dispatch on `process.argv[2]` rather than assuming an audit. An unrecognised
subcommand exits 1 with usage on stderr. This costs nothing now and avoids a breaking change when a
second subcommand appears.

## Resolved: the audit does not absorb the backlog tooling

The earlier open question — whether the audit absorbs `backlog.mjs --check` and `reconcile.mjs --json`
or shells out to them — is answered: **it does neither.**

It does not re-implement them, because two implementations of the same rules drift, and the `backlog`
skill already warns about precisely this for its own validator. It does not shell out to them either,
because that would hard-code a dependency on `~/.claude/skills/...` paths that exist on one machine
and not in CI, turning an absent global skill into a broken audit.

What the audit needs from the backlog is far narrower than either option assumes: to resolve a
plan item's `Tracked by` reference, it reads the `status:` line from the frontmatter of
`artifacts/backlog/items/<id>.md` directly. That is a stable file format documented in the `backlog`
skill, not an API, and reading it duplicates no validation logic. Where no backlog exists, delegated
references cannot appear, and the check is skipped rather than failed.

Validating the backlog's internal consistency remains `backlog-validate`'s job, and reconciling it
against git history remains `backlog-reconcile`'s. The audit reports that a repository has no work
tracking where a standard requires one; it does not grade the tracking it finds.

## Finding categories

The table below lists the principal finding ids by category. It is **not** an exhaustive inventory of
every id `scripts/standards.mjs` emits: the evidence-surface and availability findings
(`repository-evidence-unavailable`, `evidence-*`), the content-detector findings (`committed-env-file`,
`secret-in-artifact`, `swallowed-exception`, `certificate-validation-bypass`,
`sql-string-interpolation`) and several manifest, plan-field and owner-confirmation findings are emitted but not
listed. The emitted ids are the source of truth, not this table, and no count is stated here. Each
finding has a stable kebab-case `id` for machine consumption, and a category that more than one id may
share. The first six are descriptive — they report what the repository *has*, and are always `info`. The remainder report
something absent, unproven, or contradictory.

| id | Category | Produced by | Severity |
| --- | --- | --- | --- |
| `observed-architecture` | Observed architecture | Layer/process structure detected from entry points, manifests, and `docs/architecture.md` when present | `info` |
| `detected-capabilities` | Detected application capabilities | Routes, commands, UI entry points, and major workflows | `info` |
| `detected-apis` | Detected APIs | Controllers, route handlers, OpenAPI specs, schema definitions | `info` |
| `detected-jobs` | Detected background jobs | Schedulers, workers, queue consumers, cron definitions | `info` |
| `detected-integrations` | Detected integrations | External clients, SDK usage, webhook handlers, connection strings in env templates | `info` |
| `detected-ai-interfaces` | Detected AI interfaces | Model/provider SDK usage, prompt files, agent or tool definitions | `info` |
| `missing-documentation` | Missing documentation | Absence of `docs/architecture.md` or a substantive README | `warning` |
| `missing-planning-artifacts` | Missing planning artifacts | Absence of `artifacts/project-plan-breakdown/`, or a breakdown with no `00-overview.md` | `warning` |
| `no-test-surface` | Verification surface | No test files found; audit-only, no rule binding | `info` |
| `no-ci-configuration` | Verification surface | No CI configuration found; audit-only, no rule binding | `info` |
| `committed-conflict-markers` | Unresolved merge conflicts | A conflict-marker group (opener, separator and terminator, each at column 0 and exactly seven characters) in the working-tree copy of a tracked file the audit reads, outside Markdown fenced blocks; audit-only, no rule binding, `INFERRED` | `warning` |
| `unverified-functionality` | Unverified functionality | Capabilities with no corresponding test coverage | `warning` |
| `potential-dead-code` | Potential dead code | Unreferenced modules, unreachable routes, exports with no importer | `info` |
| `potential-unfinished-features` | Potential unfinished features | `TODO`/`FIXME`/`HACK`/`XXX` markers, stubs, `NotImplemented` paths, skipped tests, disabled feature flags | `warning` |
| `plan-code-discrepancies` | Plan/code discrepancies | Plan items marked `done` whose deliverables are absent, or shipped capabilities no plan item claims | `error` |
| `doc-code-discrepancies` | Documentation/code discrepancies | README or ADR claims contradicted by the implementation | `error` |
| `open-reconstruction-questions` | Open reconstruction questions | Unanswered entries in `artifacts/project-baseline/open-questions.md` | `warning` |
| `standards-violations` | Standards violations | Any requirement `RN` of any standard that the repository fails | `error` |

### Conflict markers in tracked files are audit-only evidence, and they fail `--strict`

Owner decision, issue [#58](https://github.com/mikeycdavis/EngineeringStandards/issues/58): conflict-marker
detection in tracked files (finding id `committed-conflict-markers`) is **permanently audit-only**. The finding carries `rule: null`, so it is
unbound to any catalog rule and has no compliance effect: `validate --json` still lists it among
its findings, but the compliance engine skips findings with no rule, so its status, score, per-rule
results and exit code are the same with or without the marker. Standard 46
was measured and rejected as its home. Whether a working tree is mid-conflict (unmerged index
stages) is a separate proposition, checked by the local preflight outside the catalog; the two overlap
only where a textual conflict writes marker lines into a tracked file, which this detector then reads.

**What is read.** `git ls-files` decides which paths are checked, but the bytes come from the working-tree
copy, not from `HEAD` or the index. A tracked file whose committed content is clean but whose working
copy holds a group is reported, and `audit --strict` fails on that working-tree state; the id says
"committed" because the group sits in a tracked file, not because committed bytes were inspected.
Untracked files are not reported.

Its severity is `warning`, and that is part of the contract rather than an accident. `audit --strict`
exits 1 on any finding that is not `info`, so a repository with a marker group in a tracked file fails a
strict audit while a default audit exits 0. The only thing `--strict` promotes here is the
observation; nothing is added to a verdict.

**Limitation, retained and disclosed in the finding's own message.** A well-formed group is
lexically identical to documentation of one, so Markdown fenced blocks are excluded. A genuine
group inside a Markdown fenced block is therefore **not reported**, and neither is one in a file type
the audit does not read. Conflicts whose working-tree content holds no marker lines (for example
delete/modify) are not seen either, because the index state itself is not inspected. A clean result is not proof that none exists. The unfenced specimen is reported, the
canonical fenced documentation is not, and the genuine group inside a fence is a known miss;
`test/conflict-markers.test.mjs` asserts all three outcomes, and also pins the severity, the absent
rule, the strict exit codes, the unchanged `validate` verdict, and that the working-tree copy is what is read.

## Required: the use/mention rule

**Any implementation of this design must obey this section. It is not an optimisation or a style
preference — it is the single defect this tool has produced repeatedly, and an implementation that
ignores it will be wrong in the same way every time.**

Every detector above answers "does this repository use X?" by searching file text for a string
associated with X. That string occurs in two unrelated kinds of place:

- files that **use** X — a call, an annotation, an import
- files that **mention** X — documentation, comments, test names, string literals, and the audit's own
  pattern tables

Raw text search cannot distinguish them. The first implementation of this design shipped that
confusion five separate times: it reported every SDK in its own pattern list as a dependency of the
repository being audited; it flagged this design document as containing unfinished work because it
names `TODO` and `NotImplemented`; it flagged its own test suite because test names contain the word
TODO; it flagged the architecture document as a background job because that document names Celery and
BullMQ; and it flagged a code file whose *comment* named those libraries.

Four of those five fixes narrowed **which files are read** — self-exclusion, then code extensions
only. That axis is insufficient and an implementation that stops there is not compliant: the fifth
instance was a mention inside a code file, which no file-level filter can reach.

**The requirement is to scan only positions where a use can occur.** Divide each code file into three
views and route every content scan through exactly one:

| View | Contains | Must be used for |
|---|---|---|
| structure | code with comments removed **and string contents blanked** | structural signals — `app.get(`, `@Scheduled`, `new Queue(`, `NotImplementedException`, `it.skip(`. A call never occurs inside a string |
| source | code with comments removed, **strings intact** | library-name matching only, because an import specifier *is* a string: `from "bullmq"` |
| comments | comment text only | `TODO`/`FIXME`/`HACK`/`XXX` markers, which are by definition a comment convention |

Two rules follow, and both must hold:

1. **A library name is only ever matched import-shaped** — a JS/TS `import`/`require`, a Python
   `import`, or a C# `using`. Never as a loose substring, in any category.
2. **A scan for a code signal reads only code**, and only the appropriate view of it. Documentation
   describes technologies; it does not implement them.

Two observable consequences an implementation must satisfy, both cheap to test: a **commented-out
route is not a route**, and a **string containing `"TODO:"` is not a marker**.

Comment syntax must be selected per file extension. Applying the wrong one silently corrupts the
split: `//` is floor division in Python, `--` is decrement in JavaScript, `#` opens a private field in
JavaScript.

**These rules must be enforced by tests, not by convention.** Every category needs a fixture that
provokes it *and* a fixture that must not — the negative case is the one that catches this defect, and
a suite that only checks detectors fire will pass while the bug is live. The reference implementation
verifies its guards by mutation: reverting a structural scan to raw text must fail a test.

## Structured output

`--json` emits a single object. `standardRef` is what makes a finding actionable: it points at the
requirement that produced it, so a reader can go from a finding to the rule without searching.

```json
{
  "schemaVersion": 1,
  "repo": "F:/Repos/ExampleProject",
  "auditedAt": "2026-08-08T16:40:00Z",
  "findings": [
    {
      "id": "missing-planning-artifacts",
      "category": "Missing planning artifacts",
      "severity": "warning",
      "label": "OBSERVED",
      "evidence": ["artifacts/"],
      "message": "No artifacts/project-plan-breakdown/ directory exists.",
      "standardRef": "standards/44-existing-project-reconstruction.md#r4--required-artifacts-and-canonical-paths"
    }
  ]
}
```

Every finding carries one of the Standard 44 evidence labels (`OBSERVED`, `INFERRED`,
`CONFIRMED_BY_OWNER`, `UNKNOWN`) so that a consumer can distinguish a fact from a heuristic — the
`potential-*` categories are inherently `INFERRED`, and reporting them as though they were observed
would be the same fabrication error Standard 44 R2 prohibits.

The shape is intended to be suitable for future ingestion by WhatsNext or other portfolio tooling:
flat findings, stable ids, no nesting that a consumer must traverse to count problems.

## Detection sources

Most categories map to a scan described in the table above. Two mappings are load-bearing and must
stay consistent with what the `project-reconstruction` skill writes:

- **`missing-planning-artifacts`** ← the *content* of `artifacts/project-plan-breakdown/`, never its
  presence. This is why the skill always creates the directory with at least `00-overview.md`, even
  for a small project — and why the detector reports a directory that exists but holds no substantive
  overview. Presence alone cannot be the test:
  [Standard 44](../standards/44-existing-project-reconstruction.md) R11 exists because `standards
  init` creates this directory **empty** in reconstruction mode, so a presence check reads the
  tool's own scaffolding as proof the project has a plan.
- **`open-reconstruction-questions`** ← lines matching `**Status:** open` in
  `artifacts/project-baseline/open-questions.md`. This is why the questions template uses a fixed,
  greppable `**Status:** open` / `**Status:** answered` line rather than free prose. Changing that
  line's format in the skill breaks this detection; the two must be changed together.
- **`plan-code-discrepancies`** ← plan items whose `Status` and deliverables disagree. The plan-item status vocabulary is Standard 8's canonical set: `NOT_STARTED`, `READY`,
  `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `COMPLETE`, `DEFERRED`, `CANCELLED`. A reference to an
  external tracker lives in a separate `Tracked by` field, never in `Status`. **Delegation is the
  trap:** where a repository has adopted the
  backlog skill, a plan item's own `Status` is a cached copy of the backlog item's, so an
  implementation that only checks for `done` reports zero findings on precisely the repositories that
  follow the standard most completely. An item carrying `Tracked by` must be resolved through the
  referenced backlog item's status before the discrepancy check is applied — and an id that resolves
  to nothing is itself a finding.

## Open design questions

None. The relationship to the backlog tooling was the last one, resolved above under
*Resolved: the audit does not absorb the backlog tooling*.

# Design — `standards audit` CLI

## Purpose and non-goals

This is a **design document only**. Nothing described here is implemented, and v1 of the standards
ships no audit tool. It exists so the artifacts mandated by the standards — particularly
[Standard 44](../standards/44-existing-project-reconstruction.md) — are shaped from the start to be
machine-readable by an audit that arrives later, rather than needing rework when it does.

The audit is scoped to **all** standards, not only 44. That is why this design lives in `design/`
rather than inside a single standard document.

**Non-goals:** this document does not specify an implementation language, a package layout, or a
release plan. It specifies the contract an implementation would have to satisfy.

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
`tracked as <backlog-id>` reference, it reads the `status:` line from the frontmatter of
`artifacts/backlog/items/<id>.md` directly. That is a stable file format documented in the `backlog`
skill, not an API, and reading it duplicates no validation logic. Where no backlog exists, delegated
references cannot appear, and the check is skipped rather than failed.

Validating the backlog's internal consistency remains `backlog-validate`'s job, and reconciling it
against git history remains `backlog-reconcile`'s. The audit reports that a repository has no work
tracking where a standard requires one; it does not grade the tracking it finds.

## Finding categories

Sixteen categories, each with a stable kebab-case `id` for machine consumption. The first six are
descriptive — they report what the repository *has*, and are always `info`. The remainder report
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
| `missing-audit-infrastructure` | Missing audit infrastructure | No test suite, no CI configuration, or no logging/audit trail where the standards require one | `warning` |
| `unverified-functionality` | Unverified functionality | Capabilities with no corresponding test coverage | `warning` |
| `potential-dead-code` | Potential dead code | Unreferenced modules, unreachable routes, exports with no importer | `info` |
| `potential-unfinished-features` | Potential unfinished features | `TODO`/`FIXME`/`HACK`/`XXX` markers, stubs, `NotImplemented` paths, skipped tests, disabled feature flags | `warning` |
| `plan-code-discrepancies` | Plan/code discrepancies | Plan items marked `done` whose deliverables are absent, or shipped capabilities no plan item claims | `error` |
| `doc-code-discrepancies` | Documentation/code discrepancies | README or ADR claims contradicted by the implementation | `error` |
| `open-reconstruction-questions` | Open reconstruction questions | Unanswered entries in `artifacts/project-baseline/open-questions.md` | `warning` |
| `standards-violations` | Standards violations | Any requirement `RN` of any standard that the repository fails | `error` |

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

- **`missing-planning-artifacts`** ← the presence or absence of the directory
  `artifacts/project-plan-breakdown/`. This is why the skill always creates the directory with at
  least `00-overview.md`, even for a small project.
- **`open-reconstruction-questions`** ← lines matching `**Status:** open` in
  `artifacts/project-baseline/open-questions.md`. This is why the questions template uses a fixed,
  greppable `**Status:** open` / `**Status:** answered` line rather than free prose. Changing that
  line's format in the skill breaks this detection; the two must be changed together.
- **`plan-code-discrepancies`** ← plan items whose `Status` and deliverables disagree. The plan-item
  status vocabulary is `not-started`, `in-progress`, `blocked`, `done`, `dropped`, and
  `tracked as <backlog-id>`. **The last value is the trap:** where a repository has adopted the
  backlog skill, every plan item's status becomes `tracked as <id>` and none is ever `done`, so an
  implementation that only checks for `done` reports zero findings on precisely the repositories that
  follow the standard most completely. A `tracked as <id>` item must be resolved through the
  referenced backlog item's status before the discrepancy check is applied — and an id that resolves
  to nothing is itself a finding.

## Open design questions

None. The relationship to the backlog tooling was the last one, resolved above under
*Resolved: the audit does not absorb the backlog tooling*.

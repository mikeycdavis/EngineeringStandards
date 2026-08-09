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

## Open design question

Whether the audit absorbs the existing backlog tooling or shells out to it is deliberately
undecided. `node scripts/backlog.mjs --check` already validates backlog items and detects a stale
tracker, and `reconcile.mjs --json` already compares a backlog against git history — both overlap
with `standards-violations` and `plan-code-discrepancies`. Absorbing them means one binary and one
report; shelling out means no duplicated logic and no second copy to drift. The decision should be
made when the audit is actually built, with the then-current state of those scripts in view.

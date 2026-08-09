# EngineeringStandards

The durable home of the numbered engineering standards. Each standard is a **normative document**
that states what compliant work must look like. The **executable procedures** that carry them out
live as global Claude Code skills in `~/.claude/skills/`, so they work in every repository without
anything being installed there. A standard is the contract; its skill is the implementation.

## Standards

The source specification for the whole series is committed at
[artifacts/prompts/engineering-standards-spec.md](artifacts/prompts/engineering-standards-spec.md).
It defines **44 standards, numbered 1–44 with no gaps**.

Backfilling the remaining items as documents is in progress.

| # | Standard | Doc | Implementing skill(s) | Status |
| --- | --- | --- | --- | --- |
| 1 | Human and AI Operability | [standards/01-human-and-ai-operability.md](standards/01-human-and-ai-operability.md) | *none — a design constraint* | active |
| 2 | Propose vs Execute | [standards/02-propose-vs-execute.md](standards/02-propose-vs-execute.md) | *none — a design constraint* | active |
| 3 | Auditing | [standards/03-auditing.md](standards/03-auditing.md) | *none — a design constraint* | active |
| 4 | Planning Standards | [standards/04-planning-standards.md](standards/04-planning-standards.md) | `plan-structure`, `plan-handoff` | active |
| 5 | Resumability | [standards/05-resumability.md](standards/05-resumability.md) | *none — a property of the repository* | active |
| 6 | Project Manifest | [standards/06-project-manifest.md](standards/06-project-manifest.md) | *none* | active |
| 7 | Acceptance Criteria | [standards/07-acceptance-criteria.md](standards/07-acceptance-criteria.md) | *none — partly checked by `standards audit`* | active |
| 8 | Status Tracking | [standards/08-status-tracking.md](standards/08-status-tracking.md) | *none — see the vocabulary divergence noted in the document* | active |
| 9 | Verification | [standards/09-verification.md](standards/09-verification.md) | `pre-push` | active |
| 10 | Scope Change Management | [standards/10-scope-change-management.md](standards/10-scope-change-management.md) | *none — a discipline, not a procedure* | active |
| 11 | Architecture Decision Records | [standards/11-architecture-decision-records.md](standards/11-architecture-decision-records.md) | *none* | active |
| 12–43 | *(see the source spec)* | *backfill pending* | `codebase-docs`, `backlog`, `backlog-validate`, `backlog-reconcile` | partly implemented as skills |
| 44 | Existing Project Reconstruction | [standards/44-existing-project-reconstruction.md](standards/44-existing-project-reconstruction.md) | `project-reconstruction` | active |

## Design documents

Forward-looking designs that are not yet implemented:

- [design/standards-audit-cli.md](design/standards-audit-cli.md) — the `standards audit .` command:
  finding categories, JSON output schema, and detection sources. Design only; nothing is built.

## Layout

```text
standards/    One numbered normative document per standard (NN-<kebab-title>.md).
design/       Forward-looking designs, not yet implemented.
artifacts/
  prompts/    Source spec material the standards were written from.
```

**Numbering convention.** Standards files are named `NN-<kebab-title>.md`. Zero-pad single digits
(`01-…` through `09-…`) when backfilling, so a directory listing sorts in numeric order.

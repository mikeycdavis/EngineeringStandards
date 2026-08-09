# EngineeringStandards

The durable home of the numbered engineering standards. Each standard is a **normative document**
that states what compliant work must look like. The **executable procedures** that carry them out
live as global Claude Code skills in `~/.claude/skills/`, so they work in every repository without
anything being installed there. A standard is the contract; its skill is the implementation.

## Standards

The source specification for the whole series is committed at
[artifacts/prompts/engineering-standards-spec.md](artifacts/prompts/engineering-standards-spec.md).
It defines 43 standards numbered 1–44 — **there is no item 8**; the source skips it, and the gap is
preserved rather than closed by renumbering, because the numbers are how work refers to these
standards.

Backfilling the remaining items as documents is in progress.

| # | Standard | Doc | Implementing skill(s) | Status |
| --- | --- | --- | --- | --- |
| 1 | Human and AI Operability | [standards/01-human-and-ai-operability.md](standards/01-human-and-ai-operability.md) | *none — a design constraint* | active |
| 2 | Propose vs Execute | [standards/02-propose-vs-execute.md](standards/02-propose-vs-execute.md) | *none — a design constraint* | active |
| 3 | Auditing | [standards/03-auditing.md](standards/03-auditing.md) | *none — a design constraint* | active |
| 4–43 | *(see the source spec)* | *backfill pending* | `codebase-docs`, `plan-structure`, `plan-handoff`, `backlog`, `backlog-validate`, `backlog-reconcile`, `pre-push` | partly implemented as skills |
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

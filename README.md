# EngineeringStandards

The durable home of the numbered engineering standards. Each standard is a **normative document**
that states what compliant work must look like. The **executable procedures** that carry them out
live as global Claude Code skills in `~/.claude/skills/`, so they work in every repository without
anything being installed there. A standard is the contract; its skill is the implementation.

## Standards

Standards 1–43 exist today only as their implementing skills — `codebase-docs`, `plan-structure`,
`plan-handoff`, `backlog`, `backlog-validate`, `backlog-reconcile`, and `pre-push`. Backfilling them
as documents here is pending.

| # | Standard | Doc | Implementing skill(s) | Status |
| --- | --- | --- | --- | --- |
| 1–43 | *(various)* | *backfill pending* | `codebase-docs`, `plan-structure`, `plan-handoff`, `backlog`, `backlog-validate`, `backlog-reconcile`, `pre-push` | implemented as skills |
| 44 | Existing Project Reconstruction | [standards/44-existing-project-reconstruction.md](standards/44-existing-project-reconstruction.md) | `project-reconstruction` | active |

## Design documents

Forward-looking designs that are not yet implemented:

- [design/standards-audit-cli.md](design/standards-audit-cli.md) — the `standards audit .` command:
  finding categories, JSON output schema, and detection sources. Design only; nothing is built.

## Layout

```text
standards/    One numbered normative document per standard.
design/       Forward-looking designs, not yet implemented.
artifacts/
  prompts/    Source spec material the standards were written from.
```

**Numbering convention.** Standards files are named `NN-<kebab-title>.md`. Zero-pad single digits
(`01-…` through `09-…`) when backfilling, so a directory listing sorts in numeric order.

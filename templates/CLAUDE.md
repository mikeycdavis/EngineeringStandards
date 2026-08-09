# CLAUDE.md — <Project name>

<!--
Claude Code bootstrap template. See standards/17-agent-instruction-files.md.

This file is deliberately near-empty. `AGENTS.md` holds the load sequence and the project's
operational facts; duplicating them here would recreate, one level down, exactly the fork that
Standard 17 R2 exists to prevent — two instruction files that drift apart, with no way to tell
which one an agent actually followed.

Keep only what is specific to Claude Code. If a line here would be equally true for any other
agent, it belongs in AGENTS.md.
-->

**Read [`AGENTS.md`](AGENTS.md) first.** It carries the load sequence, the standards routing, and
this project's commands and constraints. Everything below is Claude Code specific.

## Skills

The executable procedures live as Claude Code skills rather than in this repository, so they work
without installation. Use them instead of reproducing their behaviour by hand:

| Skill | Use it for |
| --- | --- |
| `/plan-structure` | Structuring a plan before implementation |
| `/plan-handoff` | Making a plan resumable by someone with no conversation history |
| `/codebase-docs` | Generating `docs/architecture.md` and its diagram |
| `project-reconstruction` | Onboarding an existing project with no trustworthy plan |

<!-- Delete rows for skills this project does not use; add project-specific skills of your own. -->

## Notes for this repository

<!--
Claude-Code-only facts, if any. Examples of what belongs here:
  * permission-mode expectations, or tools that should not be used in this repo;
  * MCP servers this project depends on;
  * a subagent or workflow this project expects for a recurring task.
Delete this section if there is nothing to say — an empty heading is worse than no heading.
-->

`<or delete this section>`

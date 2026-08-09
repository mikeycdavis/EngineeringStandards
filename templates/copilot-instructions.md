# Copilot instructions — <Project name>

<!--
GitHub Copilot bootstrap template. See standards/17-agent-instruction-files.md.
Copy to .github/copilot-instructions.md.

Brevity matters more here than in the other two instruction files: this content is prepended to
requests automatically, so every line competes with the actual task for attention. Standard 17 R2
applies with full force — do not paste rules from the standards into this file.

`AGENTS.md` holds the load sequence and this project's operational facts. Keep only what Copilot
needs that is not already there.
-->

**Read [`../AGENTS.md`](../AGENTS.md) first.** It carries the load sequence, the standards routing,
and this project's commands and constraints. Follow it.

Before writing code, read `PROJECT.md` and `project-policy.yml` at the repository root. The policy
declares which rules this project adopted and which it has excepted or declared not applicable —
suggestions that contradict it are wrong even when they are idiomatic.

When completing work: update the durable artifacts if scope or architecture changed, and verify
acceptance criteria by running the project's checks rather than by inspection. Conversation is not
the project record.

## This project specifically

<!--
Copilot-only facts, if any — a language or framework convention it guesses wrong, a directory whose
generated files must never be edited, a preferred test idiom. Delete this section if there is
nothing to say.
-->

`<or delete this section>`

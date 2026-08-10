# AGENTS.md — <Project name>

<!--
Agent bootstrap template. See standards/17-agent-instruction-files.md.

This file ROUTES an agent to the canonical sources. It does not restate them.

Standard 17 R2: do not duplicate the standards into this file. A copied standard is a fork —
it is edited independently, it drifts, and because agents read this file first and trust it,
the copy wins in practice. The test: this file should get SHORTER as the standards grow.

Only two things legitimately belong here and nowhere else (R4):
  * where the canonical sources are, if this project puts them somewhere non-standard;
  * project-specific operational facts no standard supplies — how to run the tests,
    which branch to work on, what not to touch.
Everything else is a pointer.
-->

## Load sequence

Read these in order before doing any work. Each step tells you what to read next, so do not skip
to the end — reading the standards without knowing which version or which exceptions apply gives
you the wrong answer confidently.

1. **`PROJECT.md`** — what this project is and what state it is in.
2. **`project-policy.yml`** — what *this* project is held to: adopted rules, their levels,
   what is declared not applicable, and any exceptions or attestations.
3. **The standards version** — `standardVersion` in that policy. It selects which revision of the
   standards below governs.
4. **The applicable standard documents** — `<standards-repo>/standards/NN-*.md`, read on demand.
   Open one when a rule is relevant to what you are doing; do not read all 53 up front.
5. **Current plan artifacts** — `artifacts/project-plan-breakdown/`.
6. **Decision records** — `artifacts/adr/`.

Adoption workflow, commands, and the audit/validate distinction: `<standards-repo>/INSTRUCTIONS.md`.

## While you work

- **Run `/plan-structure` and `/plan-handoff`** for planning work, when available. If they are not
  available, reproduce their intended behaviour — the requirement is on the outcome, not the tool.
- **Update durable artifacts when scope or architecture changes.** The plan, the manifest, and the
  ADRs are the record; leaving them behind is a defect, not a follow-up.
- **Verify acceptance criteria before declaring work complete.** Run the tests, the build, or the
  validator. Inspection is not verification.
- **Never rely on chat history as the sole project record.** Conversation is transient working
  context. If something is needed to continue the work, it belongs in the repository.

<!-- BEGIN standards:agent-operating-rules -->
<!--
`standards init` replaces everything between these two markers with the operating rules generated
from the framework version this project declares. Do not write rules here by hand: an edit inside
the markers is overwritten on the next run, and a rule that exists only here has no canonical text
behind it, which is the fork Standard 17 R2 prohibits.
-->
<!-- END standards:agent-operating-rules -->

## This project specifically

<!-- The part no standard can supply. Fill it in; delete what does not apply. -->

| | |
| --- | --- |
| Standards repository | `<path or URL>` |
| Working branch | `<branch>` |
| Install | `<command>` |
| Build | `<command>` |
| Test | `<command>` |
| Validate standards | `<command>` |

**Do not touch:** `<generated files, vendored code, anything an agent must leave alone>`

**Architectural constraints:** `<the rules particular to this codebase — not a restatement of the standards>`

## Precedence

If this file and a standard disagree, **the standard governs and this file is the defect.** Fix it
here rather than working around it.

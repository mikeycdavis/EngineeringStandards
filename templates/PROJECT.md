# PROJECT — <Project name>

<!--
Project manifest template. See standards/06-project-manifest.md.

This is the file a fresh engineer or agent reads first, with no conversation history. It answers
"what is this, and what state is it in" — nothing else in the repository does.

Standard 6 R4: fields representing current project state SHOULD be updated whenever the underlying
state materially changes. At minimum consider Current Status, Current Release Target, Known Risks,
Known Blockers, and Next Recommended Work. A manifest that is only correct on the day it was written
is worse than none, because it is read as current.
-->

## Purpose

<What this project does, and for whom. Two or three sentences, no jargon.>

## Standards

- **Standards version:** `1.0.0` — declared in [`project-policy.yml`](project-policy.yml)
- **Adoption guide:** see the standards repository's `INSTRUCTIONS.md`

## Stack

| Layer | Technology |
| --- | --- |
| | |

## Commands

| Task | Command |
| --- | --- |
| Install | |
| Build | |
| Test | |
| Run locally | |
| Validate standards | |

## Environments

| Environment | URL / target | Notes |
| --- | --- | --- |

## Integrations

| System | Purpose | How connected |
| --- | --- | --- |

## Architectural rules

<Project-specific constraints a contributor or agent must not violate. Not a restatement of the
standards — the things particular to this codebase.>

## Artifact locations

| Artifact | Path |
| --- | --- |
| Project policy | `project-policy.yml` |
| Plan | `artifacts/project-plan-breakdown/` |
| Decision records | `artifacts/adr/` |
| Documentation | `docs/` |

## Current state

- **Current status:** <NOT_STARTED / IN_PROGRESS / IN_REVIEW / COMPLETE — see standards/08-status-tracking.md>
- **Current release target:** <version or date, or "none">
- **Known risks:** <or "none recorded">
- **Known blockers:** <or "none recorded">
- **Next recommended work:** <what a fresh agent should pick up>

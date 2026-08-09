# Standard 6 — Project Manifest

Every compliant project should carry a single orientation document that answers the obvious questions
quickly. Its job is to get a reader — human or agent — oriented in one file, not to describe the
system exhaustively.

Source: item 6 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to every compliant project. The manifest is the entry point for
[Standard 5](05-resumability.md): most of its ten questions should be answerable from this file or
from something it points at.

## Requirements

### R1 — A manifest MUST exist

Every compliant project SHOULD contain a project manifest, such as `PROJECT.md`.

The filename is a recommendation rather than a mandate — the source says "such as". What matters is
that one file plays this role and that a reader can find it without being told where to look.

### R2 — Required contents

The manifest MUST define at least the following, reproduced verbatim from the source:

```text
Project Name
Purpose
Current Status
Primary Users
Architecture Summary
Technology Stack
Repository Structure
Build Commands
Test Commands
Local Development Setup
External Integrations
Data Stores
Deployment Environments
AI Capabilities
Security Model
Audit Model
Artifact Locations
Current Release Target
Known Risks
Known Blockers
Important ADRs
Current Plan
Next Recommended Work
```

A heading that does not apply SHOULD say so — "None" is information; silence is ambiguity, because a
reader cannot distinguish a project with no external integrations from one whose author forgot the
section.

### R3 — Brevity is a requirement, not a preference

From the source:

> Avoid making this unnecessarily verbose.
>
> It should function as a fast orientation document.

This constrains R2 rather than softening it: all twenty-three headings are present, and each is
answered as briefly as it can be. Where a subject has a real document — an architecture reference, a
plan, an ADR — the manifest gives the short answer and **links** to it rather than restating it.

The failure mode is specific and common: a manifest that grows into a second architecture document
becomes something nobody reads and nobody updates, and a stale orientation document is worse than
none, because it is believed.

### R4 — Fields representing current state are kept current

Fields representing current project state SHOULD be updated whenever the underlying state materially
changes — not on a schedule.

At minimum, implementations should consider these volatile:

`Current Status` · `Current Release Target` · `Known Risks` · `Known Blockers` ·
`Next Recommended Work`

This is a floor, not a closed list: a project whose manifest carries other state-bearing fields
should treat those the same way. A `Next Recommended Work` naming work that shipped last month
actively misleads the reader it exists to help, and is the single most likely part of this file to be
wrong.

## Additions this standard makes beyond the source

- R2's rule that inapplicable headings say "None" is an addition.
- R4 in its entirety — the identification of the five volatile sections, and the requirement to keep
  them current — is this standard's contribution. The source lists the headings without distinguishing
  which of them decay.
- The reasoning in R3 about manifests growing into unread documents is explanation, not source text.

## Relationship to other standards

The manifest is the index; the detail lives elsewhere and is linked, not duplicated:

| Manifest section | Points at |
| --- | --- |
| Architecture Summary | `docs/architecture.md` (Standard 39) |
| Current Plan, Artifact Locations | `artifacts/project-plan-breakdown/` ([Standard 4](04-planning-standards.md)) |
| Current Status | Status vocabulary (Standard 8) |
| Important ADRs | `artifacts/adr/` (Standard 11) |
| Audit Model | [Standard 3](03-auditing.md) |
| AI Capabilities | [Standard 1](01-human-and-ai-operability.md), [Standard 2](02-propose-vs-execute.md) |

## Implementation

**No skill implements this standard.**

`standards audit` does not check for a manifest today. Its `missing-documentation` finding covers
`docs/architecture.md` and a substantive README, not `PROJECT.md`, and it has no way to judge whether
the volatile sections of R4 are current — the hardest and most valuable part of this standard to
enforce. Adding a manifest check is a candidate improvement to that tool.

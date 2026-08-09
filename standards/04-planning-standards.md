# Standard 4 — Planning Standards

Planning must create durable repository artifacts. A plan that exists only in a conversation is lost
the moment that conversation ends, and everything built from it becomes unexplainable.

Source: item 4 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to any project with a plan — that is, any project whose work was decided before it was done.
It governs where planning artifacts live and what form they take, not how good the plan is.

This item is stated more forcefully in the source than its neighbours: it contains an explicitly
**mandatory** rule, and MUST below reflects that rather than this document's interpretation.

## Requirements

### R1 — Planning MUST produce durable repository artifacts

**Planning must create durable repository artifacts.** A plan held in chat history, a ticket comment,
or a person's memory does not satisfy this standard regardless of its quality.

### R2 — The plan-structure and plan-handoff rule is mandatory

Reproduced from the source, which marks it as mandatory:

> Always run /plan-structure and /plan-handoff when those skills are available.
>
> If the current execution environment does not support those exact skills, reproduce their intended
> behavior instead of skipping the requirement.

The second sentence is the operative one. Absence of the tooling is explicitly **not** an exemption:
where the skills are unavailable, their intended behaviour MUST be reproduced — a plan structured
into its required sections, and a plan made explicit enough for someone without the conversation to
execute it.

### R3 — One top-level section, one file

Every top-level section of a project plan MUST be written to its own Markdown file in:

```text
artifacts/project-plan-breakdown/
```

The source's example layout:

```text
artifacts/project-plan-breakdown/
├── 01-overview.md
├── 02-goals-and-non-goals.md
├── 03-architecture.md
├── 04-data-model.md
├── 05-api-design.md
├── 06-ai-agent-capabilities.md
├── 07-security-and-auditing.md
├── 08-implementation-phases.md
├── 09-testing-strategy.md
├── 10-release-plan.md
└── 11-handoff.md
```

The exact section names may vary by project. The following do not:

- one top-level plan section = one Markdown file
- filenames MUST preserve ordering
- no important plan section should exist only in chat
- **repository artifacts are canonical over conversation history**

The last rule decides conflicts. Where a conversation and a committed plan file disagree, the file
wins, and the conversation's content must be written into the file rather than remembered.

### R4 — The handoff MUST reference the plan files

The plan handoff MUST reference the relevant plan files. A handoff that summarises the plan instead
of pointing at it recreates the problem this standard exists to prevent: two descriptions of the same
work, drifting apart, with no rule for which governs.

## Additions this standard makes beyond the source

- The reading in R2 that unavailable tooling is not an exemption is the source's plain meaning made
  explicit, not a new rule.
- The conflict-resolution reading of "repository artifacts are canonical" in R3, and the reasoning in
  R4, are this standard's explanations rather than source text.
- The source's example begins at `01-`. This standard does not require a particular starting number,
  only preserved ordering; a breakdown beginning `00-overview.md` is compliant.

## Relationship to other standards

[Standard 7](07-acceptance-criteria.md) governs what an executable item inside these files must
define. [Standard 44](44-existing-project-reconstruction.md) applies this same layout to a
reconstructed plan, and adds a `Purpose` field to Standard 7's set.

## Implementation

Implemented by two global skills, both of which this standard requires by name:

- **`plan-structure`** — enforces the required sections on a plan.
- **`plan-handoff`** — rewrites a plan for an executor without the conversation, and recognises an
  `artifacts/project-plan-breakdown/` directory as a locatable plan.

Mechanically checkable in part: `standards audit` reports `missing-planning-artifacts` when
`artifacts/project-plan-breakdown/` is absent or has no overview file. It cannot judge whether the
sections are the right ones, or whether anything important stayed in chat.

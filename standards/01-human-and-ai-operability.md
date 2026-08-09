# Standard 1 — Human and AI Operability

Applications should be operable by both humans and authorized AI agents. A capability reachable only
by clicking is a capability no agent, script, or integration can use, and a system built that way
cannot be automated later without being rewritten.

Source: item 1 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to any project exposing application functionality to users — through a graphical UI, an API,
a command line, or an agent interface. A library with no application layer of its own is out of
scope.

The normative strength below follows the source: it states most requirements as *should*, and this
document preserves that. MUST appears only where the source says "must", "must not", or "do not".

## Requirements

### R1 — Capabilities MUST NOT be UI-only

Every meaningful application capability SHOULD be accessible without requiring the graphical UI.

The UI SHOULD be considered **one client of the application** rather than the owner of business
functionality. Business logic **MUST NOT exist exclusively in UI code**.

The preferred architecture, reproduced from the source:

```text
Human UI ──────┐
Claude ────────┤
OpenAI ────────┤
Copilot ───────┼──> Capability/Application Layer
Automation ────┤
Other Agents ──┘
                       |
                       v
                 Domain Logic
                       |
                       v
              Data / Integrations
```

The test is not whether an agent *currently* calls a capability, but whether it *could* without a
browser. A validation rule implemented in a form handler, an authorization check performed only by
hiding a button, and a multi-step workflow whose ordering exists only in component state are all
violations of this requirement — in each case the rule disappears the moment the UI is bypassed.

### R2 — A non-UI capability layer MUST exist

Whenever practical, functionality exposed through the UI SHOULD also be accessible through:

- application services
- APIs
- commands
- tool interfaces
- MCP-compatible tools
- function/tool schemas
- other structured machine-callable interfaces

**A project MUST NOT be required to expose all of these mechanisms.** A project MUST expose *a
suitable non-UI capability layer*. Which mechanism is suitable is the project's decision; having none
is not a permitted outcome.

### R3 — Prefer domain actions over raw CRUD

AI-facing capabilities SHOULD represent **intent** wherever appropriate. Prefer:

```text
create_story
approve_release
reprioritize_backlog
prepare_for_release
generate_release_plan
assign_work
run_smoke_test
```

over forcing agents to orchestrate large numbers of low-level CRUD calls.

CRUD endpoints remain acceptable where appropriate. This is a preference about the *capability*
surface, not a prohibition on data access.

The reason is failure modes rather than elegance: an agent assembling `approve_release` out of six
CRUD calls can complete three of them and stop, leaving a state the domain never intended to be
reachable. An intent-shaped capability either succeeds or fails as one decision, and the invariants
live where they can be enforced.

### R4 — Provider neutrality

Application domain logic SHOULD NOT directly depend on a specific AI provider. Claude, OpenAI,
Copilot, Gemini, local models, or future providers SHOULD be replaceable through adapters or
abstractions. Provider-specific behavior SHOULD live at integration boundaries.

A practical reading: a provider SDK imported inside a domain module is the signal this requirement
exists to catch.

## Additions this standard makes beyond the source

Disclosed rather than presented as source text, following the convention Standard 44 set:

- The worked examples in R1 (validation in a form handler, authorization by hidden button, ordering
  in component state) are illustrations, not source requirements.
- The rationale in R3 about partial CRUD sequences is an explanation of the source's preference, not
  an additional rule.
- The "provider SDK inside a domain module" heuristic in R4 is guidance for applying the requirement,
  not a new constraint.

## Implementation

**No skill implements this standard.** It is a design constraint on the projects the standards are
applied to, not a procedure an agent runs.

Partial mechanical support exists: `standards audit` reports `detected-apis` and
`detected-ai-interfaces`, which indicate whether a non-UI capability layer is present at all. It
cannot determine whether that layer covers the UI's functionality, which is the substance of R1 and
R2 and remains a review judgement.

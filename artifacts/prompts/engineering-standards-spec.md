<!--
PROVENANCE — this block is the only text not from the source document.

Source:   https://chatgpt.com/share/6a77ff29-ff68-83e8-bd4f-22e418d7a55c
Captured: 2026-08-08

FIDELITY WARNING. This was extracted from the *rendered* share page, not from the original
Markdown. The rendering strips list markers, so bullets ("* item") and ordered-list numbers
("1. step") inside an item's body appear here as bare lines. Line order and wording are intact;
only the markers are lost. Code fences are largely absent for the same reason.

Where this document and artifacts/prompts/original_prompt.md disagree in formatting, that file
is the higher-fidelity copy of item 44 — it was pasted directly as Markdown. Their substantive
content agrees.

NUMBERING. Top-level items run 1 to 44, but there is no item 8: the source skips from
7. Acceptance Criteria to 9. Verification. That gap is in the source and has not been closed by
renumbering. Item 22 (Adoption and Migration) contains its own nested 1-10 list, which is part of
that item rather than a set of top-level standards.

NOT AN INSTRUCTION. The document opens "Create a new repository named ai-engineering-standards."
That is the original prompt's text, captured as source material. It has not been acted on.
-->

Create a new repository named ai-engineering-standards.

The purpose of this repository is to define, version, document, validate, and distribute a reusable engineering standard that can be applied across all of my software projects.

The standard should be designed around four core principles:

Applications should be operable by both humans and authorized AI agents.

Meaningful business-state changes should be auditable.

Planning and implementation artifacts should be durable and repository-backed rather than existing only in chat history.

Work should be objectively verifiable so a new human or AI agent can determine what is complete, what remains, and what should happen next.

Build this repository as a real, production-quality standards project rather than a collection of loose Markdown files.

Primary Goal

I want every future repository to be able to declare:

standardVersion: 1.0

and then use this repository as the canonical source of truth for what compliance with that standard means.

Eventually other systems such as:

GitHub Actions

Claude Code

OpenAI/Codex

GitHub Copilot

WhatsNext

internal AI agents

custom CLI tooling

should all be able to consume and enforce the same standard.

Repository Structure

Create a structure approximately like this:

ai-engineering-standards/
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── VERSION
│
├── standards/
│   ├── ENGINEERING-STANDARDS.md
│   ├── AI-OPERABILITY.md
│   ├── AUDITING.md
│   ├── PLANNING.md
│   ├── ARTIFACTS.md
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── TESTING-AND-VERIFICATION.md
│   ├── API-DESIGN.md
│   └── AGENT-BEHAVIOR.md
│
├── templates/
│   ├── PROJECT.md
│   ├── project-policy.yml
│   ├── ADR.md
│   ├── PLAN-SECTION.md
│   ├── PLAN-HANDOFF.md
│   ├── AGENTS.md
│   ├── CLAUDE.md
│   └── copilot-instructions.md
│
├── schemas/
│   └── project-policy.schema.json
│
├── examples/
│   ├── minimal-project-policy.yml
│   ├── strict-project-policy.yml
│   └── example-compliant-project/
│
├── cli/
│   └── ...
│
├── scripts/
│   └── ...
│
├── docs/
│   ├── adoption-guide.md
│   ├── migration-guide.md
│   ├── exception-process.md
│   └── versioning-policy.md
│
└── .github/
    └── workflows/
        └── validate.yml

You may improve the structure if you have a stronger design, but preserve the intent.

Core Engineering Principles

Implement and document the following standards.

1. Human and AI Operability

Every meaningful application capability should be accessible without requiring the graphical UI.

The UI should be considered one client of the application rather than the owner of business functionality.

Preferred architecture:

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

Business logic must not exist exclusively in UI code.

Whenever practical, functionality exposed through the UI should also be accessible through:

application services

APIs

commands

tool interfaces

MCP-compatible tools

function/tool schemas

other structured machine-callable interfaces

Do not require every project to expose all of these mechanisms. Require projects to expose a suitable non-UI capability layer.

Prefer Domain Actions Over Raw CRUD

AI-facing capabilities should represent intent wherever appropriate.

Prefer:

create_story
approve_release
reprioritize_backlog
prepare_for_release
generate_release_plan
assign_work
run_smoke_test

over forcing agents to orchestrate large numbers of low-level CRUD calls.

CRUD endpoints are still acceptable where appropriate.

Provider Neutrality

Application domain logic should not directly depend on a specific AI provider.

Claude, OpenAI, Copilot, Gemini, local models, or future providers should be replaceable through adapters or abstractions.

Provider-specific behavior should live at integration boundaries.

2. Propose vs Execute

AI-capable applications should distinguish between:

read

analyze

propose

execute

privileged/destructive execute

AI agents should be able to generate recommendations without necessarily applying them.

Destructive, expensive, security-sensitive, financial, production-impacting, or otherwise high-risk actions should support explicit authorization and approval controls.

Document a recommended capability permission model.

3. Auditing

Use this core rule:

All business-relevant state changes should be auditable. Derived, transient, cached, or serialized metadata may be excluded when it can safely be reconstructed and has no compliance, security, operational, historical, or business-decision value.

A useful test is:

If changing a value could affect what a user sees, what the system decides, what an AI agent does, money, permissions, compliance, or the historical truth of the application, the change should normally be auditable.

Auditable events should normally include:

entityType
entityId
action
actorType
actorId
timestamp
before
after
reason
correlationId
requestId
source

Not every field must be required in every situation, but define sensible minimum requirements.

Actor types should accommodate:

USER
AI_AGENT
SYSTEM
SCHEDULED_JOB
API_CLIENT
ADMIN
INTEGRATION

AI actions must be attributable to the same standard as human actions.

Where useful, retain:

AI provider

model identifier

tool/capability invoked

policy version

relevant decision inputs

resulting action

Do not require storing giant raw prompts forever.

Sensitive information and secrets must not be unnecessarily copied into audit logs.

4. Planning Standards

Planning must create durable repository artifacts.

The following rule is mandatory:

Always run /plan-structure and /plan-handoff when those skills are available.

If the current execution environment does not support those exact skills, reproduce their intended behavior instead of skipping the requirement.

Every top-level section of a project plan must be written to its own Markdown file in:

artifacts/project-plan-breakdown/

Example:

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

The exact section names may vary by project.

However:

one top-level plan section = one Markdown file

filenames must preserve ordering

no important plan section should exist only in chat

repository artifacts are canonical over conversation history

The plan handoff must reference the relevant plan files.

5. Resumability

A fresh engineer or AI agent with repository access and no previous chat history should be able to determine:

what the project does

what architecture it uses

what work has been completed

what work remains

what is currently blocked

important decisions and why they were made

how to build the project

how to test the project

how to verify completed work

what should happen next

This is a core standard.

If this cannot be determined from repository artifacts, the project is not sufficiently documented.

6. Project Manifest

Every compliant project should contain a project manifest such as:

PROJECT.md

Define a template containing at least:

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

Avoid making this unnecessarily verbose.

It should function as a fast orientation document.

7. Acceptance Criteria

Every executable plan item, story, feature, task, or implementation section should define an observable completion condition whenever practical.

Do not allow vague completion such as:

Implement authentication.

Prefer:

Deliverables
Acceptance Criteria
Verification
Dependencies
Status

Example:

# Authentication

## Deliverables

- JWT authentication
- login endpoint
- refresh token support
- authorization policies
- audit events

## Acceptance Criteria

- anonymous protected requests return 401
- unauthorized users receive 403
- valid login produces tokens
- refresh token rotation succeeds
- authentication events appear in audit history

## Verification

```bash
dotnet build --configuration Release
dotnet test

Agents should not need to guess whether work is finished.

---

# 8. Status Tracking

Recommend a standard status vocabulary:

```text
NOT_STARTED
IN_PROGRESS
BLOCKED
READY_FOR_REVIEW
COMPLETE
DEFERRED
CANCELLED

Plan sections should include status where appropriate.

Blocked work should identify its blocking dependency.

9. Verification

Agents and developers must verify work before declaring it complete.

Verification may include:

compile/build

unit tests

integration tests

end-to-end tests

static analysis

linting

database migration validation

security scanning

smoke tests

contract validation

deployment verification

The standard should distinguish:

implemented
verified
released

These are not the same state.

10. Scope Change Management

Do not silently change project scope.

When implementation reveals:

new requirements

unexpected dependencies

missing tasks

architecture changes

additional release blockers

update the project's durable planning artifacts.

Record why the scope changed.

A conversation should not become the only record of scope expansion.

11. Architecture Decision Records

Projects should maintain:

artifacts/adr/

Create an ADR template.

Use ADRs for consequential architectural decisions such as:

database technology

authentication architecture

event-driven architecture

cloud provider dependencies

AI provider strategy

data ownership

messaging infrastructure

major third-party dependencies

significant deviations from engineering standards

Do not require ADRs for trivial implementation choices.

Use numbered filenames such as:

0001-use-postgresql.md
0002-use-provider-neutral-ai-adapters.md

ADR statuses should support:

Proposed
Accepted
Superseded
Deprecated
Rejected
12. Structured Errors

AI-operable APIs should prefer structured machine-readable errors.

Recommend a shape similar to:

{
  "code": "DEPENDENCY_BLOCKED",
  "message": "Release cannot proceed because database migration validation failed.",
  "retryable": false,
  "requiresApproval": false,
  "details": {}
}

Recommended error categories should include:

VALIDATION_FAILED
AUTHENTICATION_REQUIRED
PERMISSION_DENIED
NOT_FOUND
CONFLICT
DEPENDENCY_BLOCKED
REQUIRES_APPROVAL
RATE_LIMITED
TEMPORARILY_UNAVAILABLE
INTERNAL_ERROR
13. Idempotency

AI agents retry operations.

For commands where duplicate execution could create unwanted side effects, support idempotency whenever practical.

Document recommended approaches such as:

Idempotency-Key
command IDs
deduplication records
natural idempotency

Do not require it where it adds no value.

14. Structured Results

AI-callable operations should return structured state where possible.

Avoid only returning:

Success.

Prefer:

{
  "status": "completed",
  "entityId": "123",
  "createdResources": [],
  "warnings": [],
  "requiresHumanApproval": [],
  "nextPossibleActions": []
}

Agents should be able to determine what happened and what they may do next.

15. AI Tool Contracts

Treat the following as versioned software interfaces:

OpenAPI definitions

MCP tools

function/tool schemas

agent commands

AI capability definitions

structured prompt contracts

Breaking changes should be managed intentionally.

Define recommendations for semantic versioning.

16. Security

Document requirements for:

least privilege

authentication

authorization

agent identity

secret handling

audit logging

human approval

service accounts

scoped tokens

data minimization

Never place secrets in:

PROJECT.md
plan files
ADR files
agent instructions
audit logs
AI prompts
source control

Reference secret names or secret-store identifiers instead.

17. Agent Instruction Files

Provide templates for:

AGENTS.md
CLAUDE.md
.github/copilot-instructions.md

Do not duplicate the entire standard into these files.

Instead, make them short bootstrap documents.

They should tell an agent to:

Read PROJECT.md.

Read project-policy.yml.

Identify the engineering standard version.

Read the applicable standard documentation.

Inspect current plan artifacts.

Inspect ADRs.

Run /plan-structure and /plan-handoff for planning work when available.

Update durable artifacts when scope or architecture changes.

Verify acceptance criteria before declaring work complete.

Never rely on chat history as the sole project record.

18. Machine-Readable Project Policy

Create a production-quality project-policy.yml format.

Initial shape:

standardVersion: "1.0"

planning:
  runPlanStructure: true
  runPlanHandoff: true
  breakdownDirectory: artifacts/project-plan-breakdown
  oneFilePerSection: true
  requireAcceptanceCriteria: true
  requireVerificationSteps: true
  artifactsCanonicalOverChat: true

auditing:
  businessStateChanges: required
  actorAttribution: required
  correlationId: required
  beforeAfterState: recommended

ai:
  uiCapabilitiesMustBeAgentOperable: true
  providerNeutral: true
  proposeExecuteSeparation: true
  destructiveActionsRequireApproval: true
  structuredErrors: true
  structuredResults: true

architecture:
  requireProjectManifest: true
  adrDirectory: artifacts/adr
  requireAdrForMajorDecisions: true

verification:
  requiredBeforeCompletion: true

security:
  secretsInArtifacts: forbidden

Improve this schema where appropriate.

Support rule levels such as:

required
recommended
optional
forbidden

Consider allowing project-specific exceptions.

19. JSON Schema

Create:

schemas/project-policy.schema.json

It should validate project policy files.

Include:

enum validation

required properties

semantic version format where appropriate

directory/path fields

exception structures

unknown-property handling

Provide clear validation errors.

20. Exceptions

Projects occasionally need to violate a standard intentionally.

Create a structured exception mechanism.

Example:

exceptions:
  - rule: ai.uiCapabilitiesMustBeAgentOperable
    reason: "Offline desktop utility with no external capability layer."
    approvedBy: "project-owner"
    expires: "2027-01-01"

Exceptions should contain:

rule
reason
approvedBy
date
optional expiration
optional issue/reference

Exceptions should be visible and auditable.

Do not allow vague anonymous exceptions.

21. Versioning

Create an explicit versioning policy for the standards themselves.

Use semantic versioning.

For example:

1.0.0

Define:

PATCH
clarification that does not change compliance

MINOR
new backward-compatible rule or capability

MAJOR
breaking compliance requirement

Maintain:

VERSION
CHANGELOG.md

Projects should declare the standard version they implement.

22. Adoption and Migration

Create documentation showing how to adopt these standards in an existing repository.

A migration flow might be:

1. Add PROJECT.md
2. Add project-policy.yml
3. Add agent bootstrap files
4. Create artifacts/project-plan-breakdown/
5. Create artifacts/adr/
6. Move important planning knowledge out of chat
7. Run standards validator
8. Resolve failures
9. Document exceptions
10. Enable CI enforcement

Support incremental adoption rather than requiring perfect compliance immediately.

23. Standards Validator CLI

Build an initial CLI named something like:

standards

or:

engineering-standards

Choose a simple implementation language suitable for cross-platform use.

Prefer something that works easily on:

Windows

macOS

Linux

GitHub Actions

The initial command should be:

standards validate

It should inspect a target repository.

Support:

standards validate
standards validate .
standards validate ../CarDoc
standards validate --format json
standards validate --strict

Also consider:

standards init
standards explain <rule>
standards version

but validate is the required first feature.

24. Validator Rules

Initial validation should check things that can be determined reliably.

Examples:

PASS PROJECT.md exists

PASS project-policy.yml exists

PASS policy matches schema

PASS declared standards version exists

PASS artifacts/project-plan-breakdown exists

PASS plan files exist when project contains an active plan

PASS each plan file contains required sections

PASS acceptance criteria present where required

PASS verification section present where required

PASS artifacts/adr exists

PASS agent bootstrap file exists

PASS secrets are not obviously embedded in tracked planning files

WARN no ADRs exist

WARN project manifest appears stale

FAIL invalid project policy

FAIL required plan artifact missing

Do not pretend the CLI can perfectly determine architecture-level compliance from static analysis in v1.

Separate rule types into:

structural
document
configuration
code-analysis
manual-review

The first version should focus on deterministic checks.

25. Validator Output

Human-readable output should look something like:

AI Engineering Standards
Standard: 1.0.0
Project: CarDoc

PASS  Project manifest
PASS  Project policy
PASS  Plan directory
PASS  Plan handoff
PASS  Acceptance criteria
PASS  Verification instructions
PASS  Agent instructions
WARN  No ADRs recorded
FAIL  2 active plan sections are missing status

Compliance: 88%

2 issue(s)
1 warning(s)

JSON output should contain structured results suitable for WhatsNext.

Example:

{
  "standardVersion": "1.0.0",
  "project": "CarDoc",
  "score": 88,
  "results": [
    {
      "ruleId": "planning.status-required",
      "severity": "error",
      "status": "failed",
      "files": [
        "artifacts/project-plan-breakdown/05-api-design.md"
      ],
      "message": "Active plan section has no status."
    }
  ]
}
26. Stable Rule IDs

Every enforceable standard should have a stable machine-readable ID.

Examples:

planning.breakdown-directory
planning.one-file-per-section
planning.acceptance-criteria
planning.verification
planning.handoff

audit.business-state
audit.actor-attribution

ai.non-ui-capabilities
ai.provider-neutral
ai.propose-execute
ai.destructive-approval

architecture.project-manifest
architecture.adr

security.no-secrets-in-artifacts

verification.before-completion

Rule IDs should not change casually because external systems such as WhatsNext may reference them.

27. Rule Catalog

Create a machine-readable rule catalog.

For example:

rules/

with YAML or JSON definitions.

Each rule should ideally contain:

id
title
description
category
severity
level
rationale
validationType
remediation
introducedIn

Example:

id: planning.acceptance-criteria
title: Plan items require acceptance criteria
category: planning
level: required
severity: error
validationType: document
introducedIn: 1.0.0
description: >
  Executable plan sections must define observable completion criteria.
remediation: >
  Add an Acceptance Criteria section to the plan artifact.

The Markdown standards documentation and the validator should derive from or reference the same canonical rule IDs.

Avoid having unrelated duplicated definitions drift apart.

28. GitHub Actions

Create a workflow showing how projects could enforce standards.

Example use case:

- name: Validate engineering standards
  run: standards validate --strict

For this repository itself, CI should validate:

formatting

tests

JSON Schema validity

example policy files

CLI tests

rule catalog integrity

Markdown links where practical

29. Testing

Build automated tests for the CLI.

Create fixture repositories representing:

fully compliant
missing PROJECT.md
invalid policy
missing plan directory
missing acceptance criteria
missing verification
valid exception
expired exception
unsupported standard version

Tests should verify:

exit codes

rule IDs

JSON output

warning/error handling

compliance scoring

30. Compliance Scoring

Design a simple compliance scoring model.

Do not allow scoring to hide required failures.

For example:

100% compliance

should mean all applicable required rules pass.

A project with a required failure should clearly remain non-compliant even if its numeric score is high.

Treat the score as informational.

Status should be something like:

COMPLIANT
COMPLIANT_WITH_EXCEPTIONS
NON_COMPLIANT
31. WhatsNext Compatibility

Design the validator and rule catalog so WhatsNext could later consume them.

WhatsNext should eventually be able to:

scan multiple repositories

determine declared standard versions

execute validation

ingest JSON results

show compliance scores

show violations by project

recommend remediation

create work items from violations

detect outdated standard versions

propose migrations

Do not build WhatsNext integration now.

Just make the contract clean enough that it can be added later.

32. Documentation Quality

README.md should explain:

what this repository is

why it exists

the philosophy behind it

how a project adopts the standard

how validation works

how standards are versioned

how exceptions work

how AI agents should consume it

Include a concise statement similar to:

Design every project so a human can understand it, an AI can operate it, every meaningful action can be traced, and a fresh engineer or agent can resume the work without relying on conversation history.

33. Bootstrap Experience

I eventually want to be able to go into a project and run something like:

standards init

and have it generate:

PROJECT.md
project-policy.yml
AGENTS.md
CLAUDE.md
.github/copilot-instructions.md
artifacts/project-plan-breakdown/
artifacts/adr/

You do not need to make init extremely sophisticated in the first version, but if practical implement a minimal safe version.

It must never overwrite existing files without explicit permission.

34. Dogfooding

This repository itself should follow its own standards where reasonable.

Create:

PROJECT.md
project-policy.yml
artifacts/project-plan-breakdown/
artifacts/adr/

Use the repository as the first compliant example.

35. Planning Requirements

Before implementation:

Run /plan-structure.

Run /plan-handoff.

If those skills are not available, manually reproduce their intended behavior.

Write every top-level plan section to its own file under:

artifacts/project-plan-breakdown/

Do not leave the implementation plan only in the conversation.

The plan should cover at minimum:

overview
goals/non-goals
standards architecture
rule model
policy schema
CLI architecture
validation engine
templates
testing
CI
versioning
adoption
future integrations
release plan
handoff

Each executable section must contain:

Status
Purpose
Deliverables
Acceptance Criteria
Verification
Dependencies

where applicable.

36. Implementation Strategy

Implement this repository incrementally.

Suggested phases:

Phase 1 — Standards Foundation

Create:

README
VERSION
CHANGELOG
standards documentation
stable rule IDs
rule catalog
templates
PROJECT.md
project-policy.yml
JSON Schema
Phase 2 — Validator

Implement:

standards validate
human output
JSON output
exit codes
rules engine
fixture repositories
automated tests
Phase 3 — Repository Bootstrap

Implement:

standards init
template installation
safe existing-file handling
Phase 4 — CI Integration

Implement:

GitHub Actions example
self-validation
release packaging
Phase 5 — Advanced Validation Foundations

Design extension points for future:

code analysis
API inspection
audit coverage detection
AI capability coverage
ADR freshness
plan staleness
WhatsNext integration

Do not over-engineer these advanced capabilities now.

37. Quality Bar

Treat this like a framework I will actually use across many repositories.

Prioritize:

clarity
determinism
extensibility
cross-platform compatibility
machine readability
good error messages
stable contracts
minimal duplication
testability
safe defaults

Avoid:

unnecessary frameworks
overly clever abstraction
fake static-analysis guarantees
provider-specific AI coupling
duplicated standards definitions
large generated boilerplate
38. Definition of Done

The first release is complete when:

The repository contains a coherent v1 engineering standard.

Standards have stable rule IDs.

project-policy.yml has a JSON Schema.

Example policies validate successfully.

The CLI can validate another repository.

The CLI supports human-readable and JSON output.

Validation has automated tests.

A non-compliant fixture produces expected failures.

An exception can suppress/acknowledge an applicable rule according to policy.

GitHub Actions runs the project's tests and validation.

The repository follows its own planning/artifact rules.

A new AI agent can inspect this repository and understand exactly what has been built and what should happen next.

There are no placeholder implementations or knowingly broken tests.

The project builds and tests successfully using documented commands.

Final Deliverables

At completion, provide a concise implementation summary containing:

Repository architecture
Standards implemented
CLI commands
Validation rules implemented
Tests added
Known limitations
Files added
How to use it in a new project
Recommended next iteration

Do not rely on the final chat response as the project record.

Update:

PROJECT.md
artifacts/project-plan-breakdown/
CHANGELOG.md

so the repository itself contains the final state and handoff information.

One thing I especially like about this version is that it makes the rule catalog the stable contract. That gives you a foundation for CI today and WhatsNext later, without having WhatsNext scrape Markdown to figure out what planning.acceptance-criteria means.

Have these all been folded into that prompt?

All business-relevant state changes should be auditable. Derived, transient, or serialized metadata may be excluded when it can be safely reconstructed and has no compliance, security, or business-history value.

The UI should not be the only first-class client of the application. Humans and AI agents should both operate against the same underlying capabilities.

Always run the /plan-structure and /plan-handoff skills for planning work. Every top-level section produced by the plan must be written to its own Markdown file under artifacts/project-plan-breakdown/. The directory should contain the complete decomposed plan, with one .md file per section, using ordered filenames to preserve sequence. Every plan item must define an observable completion condition. An AI agent should never have to guess whether a task is finished

Every meaningful action should be invokable without the UI. If the UI can do it, there should be an underlying application capability, command, API, or tool that an authorized agent can call.
Separate “propose” from “execute.” AI should be able to recommend changes without automatically applying them. Destructive or high-impact actions should require explicit approval unless the project says otherwise.
Every mutation should carry actor context. Record whether the change came from a user, API client, scheduled job, Claude, OpenAI, Copilot, etc., plus correlation/request IDs.
Prefer domain actions over raw CRUD. approve_release, create_story, reprioritize_backlog, close_incident are better AI-facing capabilities than making the agent orchestrate ten low-level database-shaped calls.
All AI-generated changes should be diffable. Before/after state, generated files, modified requirements, plan changes, and configuration updates should be easy to inspect.
Plans should have explicit status. Each plan section should identify Not Started, In Progress, Blocked, or Complete, plus dependencies and acceptance criteria.
Artifacts are the source of truth, not chat. Anything needed to continue implementation should end up in the repository—plans, ADRs, decisions, assumptions, handoff notes, and unresolved questions.
Record architecture decisions separately. I’d add artifacts/adr/ and require an ADR for consequential choices such as database technology, authentication model, AI provider strategy, event architecture, or a deliberate deviation from project standards.
Plans should be resumable by a fresh agent. A new session with repository access but zero chat history should be able to determine what the project is, what has been completed, what comes next, and why.
Define completion mechanically whenever possible. Every plan section or story should contain acceptance criteria and preferably commands/tests that prove completion.
Agents must verify their own work. After implementation, run the relevant tests, linting, builds, migrations, smoke tests, or validation tools rather than declaring success based only on code inspection.
Never silently change scope. If implementation reveals new work, update the plan artifacts and record why rather than just doing extra work invisibly.
Make idempotency a default for AI-callable commands. Agents retry things. APIs like createProject, runAnalysis, or generateReleasePlan should tolerate duplicate/retried requests safely where practical.
Expose structured errors. Agents need machine-actionable errors such as PERMISSION_DENIED, VALIDATION_FAILED, DEPENDENCY_BLOCKED, and REQUIRES_APPROVAL, not only human-readable messages.
Version AI-facing contracts. Tool schemas, OpenAPI definitions, prompts, and agent instructions are interfaces. Treat breaking changes to them like breaking API changes.
Provider-neutral AI architecture. Business logic shouldn't depend directly on Claude/OpenAI/Copilot. Put providers behind abstractions so tools/capabilities remain stable if the model changes.
Audit decisions, not just data. When an automated system makes a meaningful recommendation or action, preserve inputs, relevant outputs, policy/rule version, model/provider where useful, and the resulting action—without necessarily storing huge raw prompts forever.
Keep secrets out of artifacts and prompts. Plans, handoffs, audit logs, and AI context should reference secret identifiers rather than copying credentials/tokens.
Create a standard project manifest. Something like PROJECT.md or artifacts/project-manifest.md containing the project purpose, stack, commands, environments, integrations, architectural rules, artifact locations, and current state.

/codebase-docs use mermaid for the .svg. Also add documentation for anything else you feel is missing, like onboarding, or any other features/workflows/jobs/etc that should be documented
Show more

Almost all of them are already in the prompt, but not every requirement is stated explicitly enough that I’d trust an implementation agent to infer it.

The big one that is not currently folded in is your /codebase-docs requirement. A few others are present in spirit but should be made explicit.

Requirement	In current prompt?	Notes
Business-relevant state changes audited	✅ Yes	Covered strongly in §3 Auditing
Derived/transient/serialized metadata exception	✅ Yes	Essentially verbatim
UI not sole first-class client	✅ Yes	Covered in §1
Humans + agents share underlying capabilities	✅ Yes	Covered
Always run /plan-structure	✅ Yes	Covered multiple times
Always run /plan-handoff	✅ Yes	Covered multiple times
One .md per top-level plan section	✅ Yes	Covered
Ordered plan filenames	✅ Yes	Covered
Complete decomposed plan in artifacts	✅ Yes	Covered
Observable completion condition	✅ Yes	Covered in §7
Every meaningful UI action callable without UI	✅ Yes	Covered
Separate propose vs execute	✅ Yes	§2
Approval for destructive/high-impact actions	✅ Yes	§2
Actor context on mutations	✅ Yes	§3
Correlation/request IDs	✅ Yes	§3
Prefer domain actions over CRUD	✅ Yes	§1
AI-generated changes must be diffable	⚠️ Partial	Before/after auditing is there, but generated files/config/plan diffs are not explicitly required
Explicit plan status	✅ Yes	§8
Dependencies	✅ Yes	Planning template requirements
Acceptance criteria	✅ Yes	Strongly covered
Artifacts are source of truth, not chat	✅ Yes	Covered repeatedly
ADRs under artifacts/adr/	✅ Yes	§11
ADRs for consequential decisions	✅ Yes	§11
Fresh agent can resume with no chat history	✅ Yes	§5
Commands/tests prove completion	✅ Yes	§7/§9
Agents verify their work	✅ Yes	§9
No silent scope changes	✅ Yes	§10
Idempotency for AI-callable commands	✅ Yes	§13
Structured errors	✅ Yes	§12
Version AI-facing contracts	✅ Yes	§15
Provider-neutral AI architecture	✅ Yes	§1
Audit automated decisions	✅ Yes	§3
Avoid giant raw prompt retention	✅ Yes	§3
Secrets out of artifacts/prompts/logs	✅ Yes	§16
Standard PROJECT.md manifest	✅ Yes	§6
/codebase-docs	❌ No	Needs to be added
Mermaid used to generate .svg diagrams	❌ No	Needs to be explicit
Onboarding documentation	⚠️ Partial	Adoption docs exist for the standards repo, but project onboarding as a universal standard does not
Feature documentation	⚠️ Partial	Not explicitly required
Workflow documentation	⚠️ Partial	Not explicitly required
Background job/scheduled job docs	⚠️ Partial	Not explicitly required
Integration documentation	⚠️ Partial	PROJECT.md mentions integrations, but detailed docs aren't required
Assumptions/unresolved questions persisted	⚠️ Partial	Implied by resumability, but I'd explicitly require them

So I would add a dedicated section to the prompt rather than rely on inference.

Edit
39. Codebase Documentation Standard

Every project should maintain durable, repository-backed documentation describing how the codebase actually works.

When the /codebase-docs skill is available, run it as part of initial project documentation, after significant architectural changes, and whenever documentation is materially stale.

If /codebase-docs is unavailable, reproduce its intended behavior manually rather than skipping documentation.

The documentation should be written for both:

humans joining or returning to the project

AI agents operating with repository access but no previous conversation history

The documentation must not rely on chat history for essential context.

Documentation Location

Use a predictable documentation hierarchy such as:

docs/
├── README.md
├── onboarding/
│   ├── getting-started.md
│   ├── local-development.md
│   └── troubleshooting.md
├── architecture/
│   ├── overview.md
│   ├── components.md
│   ├── data-flow.md
│   └── diagrams/
├── features/
├── workflows/
├── jobs/
├── integrations/
├── operations/
├── api/
└── decisions/

Projects may adapt this structure when appropriate, but documentation should remain discoverable and consistently organized.

Architecture Documentation

Document the major architecture of the system, including:

major components

services

modules

applications

databases

queues

caches

external integrations

APIs

AI capability/tool boundaries

authentication and authorization boundaries

important data flows

deployment boundaries

Architecture documentation should explain responsibilities and interactions, not merely list directories.

Mermaid as Diagram Source

Use Mermaid as the canonical source format for architecture and workflow diagrams whenever practical.

For example:

docs/architecture/diagrams/
├── system-context.mmd
├── system-context.svg
├── request-flow.mmd
├── request-flow.svg
├── ai-capability-flow.mmd
└── ai-capability-flow.svg

The .mmd Mermaid source must be retained in source control.

Generate an .svg version from the Mermaid source for easy rendering in documentation.

Do not maintain manually edited SVG architecture diagrams when the SVG is intended to represent a Mermaid diagram.

The Mermaid source is canonical.

The generated SVG is a render artifact.

When the Mermaid diagram changes, regenerate the SVG.

Where practical, CI should detect when Mermaid source and generated SVG output are out of sync.

Onboarding Documentation

Every substantial project should provide onboarding documentation sufficient for a new engineer or AI agent to begin productive work.

Document at minimum:

prerequisites

required SDK/runtime versions

required development tools

repository setup

environment configuration

secret-store references

database setup

dependency installation

build commands

test commands

how to run the application locally

common development workflows

debugging guidance

troubleshooting

important architectural conventions

artifact locations

plan locations

ADR locations

how releases are performed

Do not place real secrets or credentials in onboarding documentation.

Feature Documentation

Significant application features should have durable documentation where the implementation cannot be understood easily from code alone.

Feature documentation should explain, where applicable:

purpose

user-facing behavior

entry points

underlying capabilities

relevant APIs/tools

important domain rules

permissions

data touched

audit behavior

failure behavior

AI operability

dependencies

tests

known limitations

Do not require large feature documents for trivial functionality.

Workflow Documentation

Document important multi-step workflows.

Examples include:

user registration
checkout
release approval
repository analysis
document processing
incident escalation
AI proposal → human approval → execution
data import
project creation
backlog reprioritization

Workflow documentation should include:

trigger

participants/actors

ordered steps

state transitions

failure paths

retries

approval points

resulting state

audit events

relevant APIs/tools

relevant jobs/events

Use Mermaid sequence, state, or flow diagrams when they improve clarity.

Background Jobs and Scheduled Work

Document background processes such as:

cron/scheduled jobs

queues

workers

event consumers

batch jobs

recurring AI analysis

maintenance processes

ETL/data pipelines

retry workers

cleanup jobs

For each meaningful job, document:

name
purpose
trigger/schedule
inputs
outputs
dependencies
side effects
idempotency behavior
retry policy
failure behavior
observability
audit behavior
manual recovery procedure

A new engineer or AI agent should not have to reverse-engineer production jobs from scheduler configuration.

Integration Documentation

Document meaningful external integrations.

For each integration, include where applicable:

external system

purpose

authentication mechanism

secret/configuration identifiers

inbound interactions

outbound interactions

API/webhook/event contracts

retries

timeout behavior

rate limits

failure modes

fallback behavior

ownership

testing/mocking strategy

Do not include actual credentials.

API and AI Capability Documentation

Document both conventional APIs and AI-operable capabilities.

For AI-operable capabilities, document:

capability/tool name
purpose
inputs
outputs
permission level
read/propose/execute classification
idempotency behavior
possible errors
human approval requirements
audit behavior
examples

Where OpenAPI, MCP, JSON Schema, function schemas, or another executable contract exists, treat that structured contract as canonical and avoid manually duplicating details unnecessarily.

Operational Documentation

For production applications, document important operational knowledge such as:

deployment

rollback

migrations

health checks

observability

logging

metrics

alerts

common failures

incident recovery

backups

restoration procedures

data repair procedures

smoke testing

post-deployment verification

A system should not depend on undocumented tribal knowledge to operate safely.

40. Diffable AI Changes

All meaningful AI-generated changes should be inspectable and diffable.

This includes:

source-code changes

configuration changes

generated artifacts

requirement changes

project-plan changes

ADR changes

policy changes

infrastructure changes

data mutations where practical

For repository changes, normal source-control diffs should be sufficient whenever possible.

For application-state changes, retain appropriate before/after state or a domain-specific equivalent through the audit system.

AI agents should avoid silently replacing large documents or state blobs when a smaller attributable change can be represented.

Where an AI generates or modifies multiple files, the resulting changes should remain reviewable through normal version-control tooling.

41. Decisions, Assumptions, and Unresolved Questions

Important context required to continue a project must not remain exclusively in conversation history.

Persist significant:

decisions

assumptions

constraints

risks

blockers

unresolved questions

deferred decisions

known unknowns

Use the most appropriate durable artifact:

PROJECT.md
plan section
plan handoff
ADR
risk register
issue/work item
documentation

Do not create unnecessary duplicate records.

A fresh engineer or AI agent should be able to distinguish between:

settled decision
working assumption
open question
known blocker
deferred decision
42. Documentation Freshness

Documentation is part of the implementation.

When implementation materially changes:

architecture

application behavior

workflows

APIs

AI tools/capabilities

integrations

background jobs

setup procedures

deployment procedures

security behavior

auditing behavior

update the relevant documentation in the same work item or change set.

Work should not be considered fully complete when the implementation and its required documentation materially disagree.

Where deterministic checks are possible, extend the standards validator to detect missing or obviously stale documentation.

43. Documentation Completion Requirement

Before declaring substantial work complete, determine whether the change affects documentation.

If it does:

update the relevant documentation

update Mermaid source diagrams if applicable

regenerate affected SVG diagrams

update plan artifacts

update ADRs when architectural decisions changed

update PROJECT.md when project-level state changed

run /codebase-docs when available and appropriate

verify that a fresh agent could understand the resulting state without relying on the current chat

I would also slightly strengthen one existing sentence in the original prompt. Instead of just:

“repository artifacts are canonical over conversation history”

make the governing principle:

Source code, structured contracts, and durable repository artifacts are the canonical project record. Chat history is transient working context and must never be the sole source of information required to build, operate, verify, or continue the project.

With those additions, I’d consider everything in your list explicitly represented rather than merely implied.

I'd also want something folded into this about if the project is pre-existing and has no prompt/original plan, to audit the code base and ask any necessary questions to come up with an adequate prompt/original plan

Yes — that’s worth making a first-class standard. The important part is that an existing codebase should not be forced into a fake “original plan.” It should reconstruct an as-built baseline from evidence, then explicitly separate known facts from inferred intent and unanswered questions.

I’d add this section to the master prompt:

Edit
44. Existing Project Reconstruction

The standards must support both:

greenfield projects with an original prompt or project plan

pre-existing projects that may have little or no reliable planning history

If a project already exists and there is no trustworthy original prompt, requirements document, or project plan, do not invent one from assumptions.

Instead, perform a structured codebase reconstruction.

The goal is to create an evidence-based baseline describing:

what the system currently does

what it appears intended to do

how it is architected

what capabilities already exist

what remains incomplete

what important questions cannot be answered from the repository alone

Reconstruction Workflow

When onboarding a pre-existing project with no adequate original plan:

Inspect the repository and existing documentation.

Run /codebase-docs when available.

Inspect relevant source code, tests, configuration, migrations, CI/CD, infrastructure, APIs, jobs, integrations, and artifacts.

Identify the project's observable capabilities and major workflows.

Identify architecture and technology choices.

Identify incomplete, stubbed, disabled, or partially implemented functionality.

Identify TODOs, FIXMEs, open work items, failing tests, feature flags, abandoned code paths, and other signals of unfinished work.

Identify deployment and operational behavior where repository evidence exists.

Compare implementation with any README, documentation, issue history, ADRs, or plans that do exist.

Record discrepancies between documented intent and actual implementation.

Determine which project-level facts can be established from evidence.

Identify gaps that require human clarification.

Ask only the questions necessary to resolve material ambiguity.

Produce a reconstructed project baseline.

Create or update the project's durable planning artifacts.

Run /plan-structure and /plan-handoff for the reconstructed plan.

Do not block the entire reconstruction process merely because some questions remain unanswered.

Complete as much as possible from repository evidence first.

Evidence Before Questions

For pre-existing projects, inspect available evidence before asking the project owner questions.

Do not ask questions that can reasonably be answered by:

source code

tests

commit history where available

configuration

database migrations

OpenAPI specifications

schemas

CI/CD configuration

deployment files

infrastructure definitions

README files

documentation

ADRs

project artifacts

issue trackers or work items when available

comments and TODOs

package manifests

environment templates

Human questions should be reserved for information that cannot be determined reliably from the codebase.

Examples include:

intended target user when multiple interpretations are plausible

abandoned versus planned functionality

product priorities

monetization strategy

desired release scope

business rules not represented in code

intentional technical debt

external constraints not stored in the repository

whether an apparent incomplete feature should be finished, removed, or deferred

Reconstructed Baseline

Create a durable artifact such as:

artifacts/project-baseline/
└── reconstructed-baseline.md

or another standardized location defined by the project standard.

The reconstructed baseline should include:

Project identity
Observed purpose
Observed users/actors
Current capabilities
Architecture
Technology stack
Data stores
APIs
AI capabilities
Background jobs
External integrations
Security model
Audit behavior
Deployment model
Testing strategy
Current implementation status
Incomplete functionality
Known technical debt
Known risks
Documentation gaps
Observed release readiness
Open questions
Assumptions
Evidence sources

Clearly distinguish between:

OBSERVED
INFERRED
CONFIRMED_BY_OWNER
UNKNOWN

Do not present inferred product intent as fact.

Reconstructed Original Plan

After the codebase audit, create an initial planning artifact that functions as the project's reconstructed starting plan.

This is not a claim about what the original developer historically intended.

Label it clearly as something such as:

Reconstructed Project Plan
As-Built Baseline Plan
Recovered Project Plan

The plan should describe:

the current product as implemented

the likely intended product direction where reasonably inferable

gaps between current and desired behavior

incomplete features

missing engineering foundations

release blockers

recommended next work

Every top-level section must follow the normal planning standard and be placed in:

artifacts/project-plan-breakdown/

using ordered Markdown files.

Every executable plan item must define:

Status
Purpose
Deliverables
Acceptance Criteria
Verification
Dependencies

where applicable.

Reconstructed Prompt

For projects that benefit from maintaining a canonical product prompt, create a reconstructed prompt after the codebase audit.

Store it in a durable location such as:

artifacts/project-baseline/RECONSTRUCTED-PROMPT.md

or another standard location.

The prompt should be sufficiently complete that a capable engineering agent could recreate the product's intended architecture and behavior without relying on prior chat history.

It should capture, where applicable:

product purpose

users

major capabilities

architecture

stack

domain model

APIs

AI capabilities

integrations

security

auditing

workflows

jobs

testing

deployment

planning requirements

current constraints

known incomplete work

release expectations

The document must clearly state that it is reconstructed from the existing codebase rather than known to be the historical original prompt.

Question Resolution

If material uncertainty remains after repository analysis, create a structured question list.

For each question, include:

question
why it matters
what evidence was inspected
current best inference
impact if unanswered

Prioritize questions by their effect on:

architecture

product behavior

security

compliance

release scope

data integrity

user experience

significant implementation effort

Do not interrupt reconstruction for minor preferences that can be reasonably defaulted.

When answers are received:

update the reconstructed baseline

mark the relevant information as CONFIRMED_BY_OWNER

update the reconstructed prompt

update affected plan sections

create or update ADRs where necessary

record material scope changes

Existing Project Audit Report

The standards validator or future tooling should eventually support an audit mode such as:

standards audit .

This does not need to be fully implemented in v1, but design for it.

A future audit should be capable of reporting findings such as:

Observed architecture
Detected application capabilities
Detected APIs
Detected background jobs
Detected integrations
Detected AI interfaces
Missing documentation
Missing planning artifacts
Missing audit infrastructure
Unverified functionality
Potential dead code
Potential unfinished features
Plan/code discrepancies
Documentation/code discrepancies
Open reconstruction questions
Standards violations

Structured JSON output should be suitable for future ingestion by WhatsNext or other portfolio tooling.

No Historical Fabrication

Never fabricate historical project intent.

If there is no evidence that a feature, architecture decision, or product goal was originally intended, do not phrase it as:

The original plan was...
The project was designed to...
The developer intended...

Instead use language such as:

The current implementation indicates...
The repository suggests...
The reconstructed plan assumes...
This appears intended to...
This cannot be determined from repository evidence...

The distinction between evidence and inference must remain visible.

Definition of Done for Reconstruction

A pre-existing project is sufficiently reconstructed when:

The repository has been inspected before material questions are asked.

/codebase-docs has been run when available.

Current capabilities and architecture are documented.

Important workflows, jobs, integrations, and APIs are documented.

Significant implementation gaps are recorded.

Known versus inferred information is clearly distinguished.

Material unresolved questions have been identified.

Necessary owner answers have been incorporated where available.

A reconstructed baseline exists.

A reconstructed canonical prompt exists when useful.

A decomposed project plan exists under artifacts/project-plan-breakdown/.

Every actionable plan item has observable completion criteria.

/plan-structure and /plan-handoff have been applied.

A fresh engineer or AI agent can understand the project and continue work without access to historical chat.

I’d also make greenfield vs. brownfield detection part of the bootstrap behavior. For example, standards init or the agent instructions could detect:

Empty/new repo
→ create project from prompt/plan

Existing repo + adequate plan
→ validate and normalize existing artifacts

Existing repo + no adequate plan
→ enter reconstruction/audit mode

That prevents an agent from treating a five-year-old codebase the same way it treats a brand-new repo.

One more rule I’d add alongside it:

Never rewrite an existing project to match the reconstructed plan merely because the plan describes a cleaner architecture. The reconstructed plan must first describe reality, then separately identify recommended future changes.

That distinction between “as built” and “to be” will save you from a lot of bad AI-driven refactoring.
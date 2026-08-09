I have a big plan to handle here. Some of these are centered around skills, so when planning, see if it'd be MORE useful to update the skill, AS WELL AS what is laid out in this prompt:

44. Existing Project Reconstruction
The standards must support both:

* greenfield projects with an original prompt or project plan
* pre-existing projects that may have little or no reliable planning history

If a project already exists and there is no trustworthy original prompt, requirements document, or project plan, do not invent one from assumptions.
Instead, perform a structured codebase reconstruction.
The goal is to create an evidence-based baseline describing:

* what the system currently does
* what it appears intended to do
* how it is architected
* what capabilities already exist
* what remains incomplete
* what important questions cannot be answered from the repository alone

Reconstruction Workflow
When onboarding a pre-existing project with no adequate original plan:

1. Inspect the repository and existing documentation.
2. Run `/codebase-docs` when available.
3. Inspect relevant source code, tests, configuration, migrations, CI/CD, infrastructure, APIs, jobs, integrations, and artifacts.
4. Identify the project's observable capabilities and major workflows.
5. Identify architecture and technology choices.
6. Identify incomplete, stubbed, disabled, or partially implemented functionality.
7. Identify TODOs, FIXMEs, open work items, failing tests, feature flags, abandoned code paths, and other signals of unfinished work.
8. Identify deployment and operational behavior where repository evidence exists.
9. Compare implementation with any README, documentation, issue history, ADRs, or plans that do exist.
10. Record discrepancies between documented intent and actual implementation.
11. Determine which project-level facts can be established from evidence.
12. Identify gaps that require human clarification.
13. Ask only the questions necessary to resolve material ambiguity.
14. Produce a reconstructed project baseline.
15. Create or update the project's durable planning artifacts.
16. Run `/plan-structure` and `/plan-handoff` for the reconstructed plan.

Do not block the entire reconstruction process merely because some questions remain unanswered.
Complete as much as possible from repository evidence first.
Evidence Before Questions
For pre-existing projects, inspect available evidence before asking the project owner questions.
Do not ask questions that can reasonably be answered by:

* source code
* tests
* commit history where available
* configuration
* database migrations
* OpenAPI specifications
* schemas
* CI/CD configuration
* deployment files
* infrastructure definitions
* README files
* documentation
* ADRs
* project artifacts
* issue trackers or work items when available
* comments and TODOs
* package manifests
* environment templates

Human questions should be reserved for information that cannot be determined reliably from the codebase.
Examples include:

* intended target user when multiple interpretations are plausible
* abandoned versus planned functionality
* product priorities
* monetization strategy
* desired release scope
* business rules not represented in code
* intentional technical debt
* external constraints not stored in the repository
* whether an apparent incomplete feature should be finished, removed, or deferred

Reconstructed Baseline
Create a durable artifact such as:

```text
artifacts/project-baseline/
└── reconstructed-baseline.md

```

or another standardized location defined by the project standard.
The reconstructed baseline should include:

```text
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

```

Clearly distinguish between:

```text
OBSERVED
INFERRED
CONFIRMED_BY_OWNER
UNKNOWN

```

Do not present inferred product intent as fact.
Reconstructed Original Plan
After the codebase audit, create an initial planning artifact that functions as the project's reconstructed starting plan.
This is not a claim about what the original developer historically intended.
Label it clearly as something such as:

```text
Reconstructed Project Plan
As-Built Baseline Plan
Recovered Project Plan

```

The plan should describe:

* the current product as implemented
* the likely intended product direction where reasonably inferable
* gaps between current and desired behavior
* incomplete features
* missing engineering foundations
* release blockers
* recommended next work

Every top-level section must follow the normal planning standard and be placed in:

```text
artifacts/project-plan-breakdown/

```

using ordered Markdown files.
Every executable plan item must define:

```text
Status
Purpose
Deliverables
Acceptance Criteria
Verification
Dependencies

```

where applicable.
Reconstructed Prompt
For projects that benefit from maintaining a canonical product prompt, create a reconstructed prompt after the codebase audit.
Store it in a durable location such as:

```text
artifacts/project-baseline/RECONSTRUCTED-PROMPT.md

```

or another standard location.
The prompt should be sufficiently complete that a capable engineering agent could recreate the product's intended architecture and behavior without relying on prior chat history.
It should capture, where applicable:

* product purpose
* users
* major capabilities
* architecture
* stack
* domain model
* APIs
* AI capabilities
* integrations
* security
* auditing
* workflows
* jobs
* testing
* deployment
* planning requirements
* current constraints
* known incomplete work
* release expectations

The document must clearly state that it is reconstructed from the existing codebase rather than known to be the historical original prompt.
Question Resolution
If material uncertainty remains after repository analysis, create a structured question list.
For each question, include:

```text
question
why it matters
what evidence was inspected
current best inference
impact if unanswered

```

Prioritize questions by their effect on:

* architecture
* product behavior
* security
* compliance
* release scope
* data integrity
* user experience
* significant implementation effort

Do not interrupt reconstruction for minor preferences that can be reasonably defaulted.
When answers are received:

1. update the reconstructed baseline
2. mark the relevant information as `CONFIRMED_BY_OWNER`
3. update the reconstructed prompt
4. update affected plan sections
5. create or update ADRs where necessary
6. record material scope changes

Existing Project Audit Report
The standards validator or future tooling should eventually support an audit mode such as:

```bash
standards audit .

```

This does not need to be fully implemented in v1, but design for it.
A future audit should be capable of reporting findings such as:

```text
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

```

Structured JSON output should be suitable for future ingestion by WhatsNext or other portfolio tooling.
No Historical Fabrication
Never fabricate historical project intent.
If there is no evidence that a feature, architecture decision, or product goal was originally intended, do not phrase it as:

```text
The original plan was...
The project was designed to...
The developer intended...

```

Instead use language such as:

```text
The current implementation indicates...
The repository suggests...
The reconstructed plan assumes...
This appears intended to...
This cannot be determined from repository evidence...

```

The distinction between evidence and inference must remain visible.
Definition of Done for Reconstruction
A pre-existing project is sufficiently reconstructed when:

1. The repository has been inspected before material questions are asked.
2. `/codebase-docs` has been run when available.
3. Current capabilities and architecture are documented.
4. Important workflows, jobs, integrations, and APIs are documented.
5. Significant implementation gaps are recorded.
6. Known versus inferred information is clearly distinguished.
7. Material unresolved questions have been identified.
8. Necessary owner answers have been incorporated where available.
9. A reconstructed baseline exists.
10. A reconstructed canonical prompt exists when useful.
11. A decomposed project plan exists under `artifacts/project-plan-breakdown/`.
12. Every actionable plan item has observable completion criteria.
13. `/plan-structure` and `/plan-handoff` have been applied.
14. A fresh engineer or AI agent can understand the project and continue work without access to historical chat.
# Standard 39 — Codebase Documentation Standard

Durable, repository-backed documentation of how the codebase actually works — written for a returning
human and for an agent with repository access and no conversation history. The largest standard in
the series, because it covers every surface a project has.

Source: item 39 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **documentation of the system**. [Standard 32](32-documentation-quality.md) governs the
README and documentation *quality* — including R3's rule that a material contradiction is a defect
and R4's rule that canonical contracts are referenced rather than restated, both of which apply to
everything here. [Standard 17](17-agent-instruction-files.md) governs agent instruction files.
[Standard 11](11-architecture-decision-records.md) governs decision records.

## Requirements

### R1 — Documentation is durable, repository-backed, and dual-audience

**Every project should maintain durable, repository-backed documentation describing how the codebase
actually works.**

**When the `/codebase-docs` skill is available, run it as part of initial project documentation, after
significant architectural changes, and whenever documentation is materially stale. If
`/codebase-docs` is unavailable, reproduce its intended behavior manually rather than skipping
documentation.**

The three triggers are worth reading as a rule about *when*, not just *whether*: initial
documentation, significant architectural change, and material staleness. The last connects directly
to [Standard 32](32-documentation-quality.md) R3 — *materially stale* there means *wrong*, and
regenerating is the remedy.

**The documentation should be written for both:**

```text
humans joining or returning to the project

AI agents operating with repository access but no previous conversation history
```

**The documentation must not rely on chat history for essential context.**

The second audience is what makes this a standard rather than a courtesy. An agent cannot ask a
colleague, cannot read a closed pull request discussion, and will confidently act on whatever the
repository says.

### R2 — A predictable documentation hierarchy

**Use a predictable documentation hierarchy such as**, reproduced verbatim from the source:

```text
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
```

**Projects may adapt this structure when appropriate, but documentation should remain discoverable
and consistently organized.**

Adaptation is permitted; *ad hoc* is not. A structure that varies per project is one an agent must
discover before it can use, and the discovery is a guess. Where a project adapts the hierarchy, the
adaptation belongs in the README ([Standard 32](32-documentation-quality.md) R5).

`decisions/` is a documentation surface for ADRs, not a second home for them —
[Standard 11](11-architecture-decision-records.md)'s `artifacts/adr/` remains canonical, per
[Standard 37](37-quality-bar.md) R5.

### R3 — Architecture documentation

**Document the major architecture of the system, including**, reproduced verbatim from the source:

```text
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
```

**Architecture documentation should explain responsibilities and interactions, not merely list
directories.**

That last sentence is the requirement; the list is its scope. A directory listing with prose
attached is the most common form of architecture documentation and the least useful, because it
answers *what exists* — which the filesystem already answers — instead of *what each thing is
responsible for and what it talks to*.

A serviceable test: **if a reader could produce the document by running `ls`, it is not architecture
documentation.**

### R4 — Mermaid is canonical; SVG is a render artifact

**Use Mermaid as the canonical source format for architecture and workflow diagrams whenever
practical.** The source's example layout:

```text
docs/architecture/diagrams/
├── system-context.mmd
├── system-context.svg
├── request-flow.mmd
├── request-flow.svg
├── ai-capability-flow.mmd
└── ai-capability-flow.svg
```

The rules, reproduced verbatim from the source:

```text
The .mmd Mermaid source must be retained in source control.

Generate an .svg version from the Mermaid source for easy rendering in documentation.

Do not maintain manually edited SVG architecture diagrams when the SVG is intended to represent a Mermaid diagram.

The Mermaid source is canonical.

The generated SVG is a render artifact.

When the Mermaid diagram changes, regenerate the SVG.

Where practical, CI should detect when Mermaid source and generated SVG output are out of sync.
```

This is [Standard 37](37-quality-bar.md) R5 applied to diagrams: one definition, everything else
derived. A hand-edited SVG is a second definition of the architecture, and it is the one that will
drift, because editing it is easier than editing the diagram it was rendered from — and once edited,
regenerating destroys the edit, so the usual outcome is that regeneration stops.

The CI sync check is what makes the rule hold rather than merely be stated. Without it, *the Mermaid
source is canonical* is a convention, and conventions that are cheaper to break than to keep get
broken.

### R5 — Onboarding documentation

**Every substantial project should provide onboarding documentation sufficient for a new engineer or
AI agent to begin productive work. Document at minimum**, reproduced verbatim from the source:

```text
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
```

**Do not place real secrets or credentials in onboarding documentation.**

Note *secret-store references* rather than secrets — the identifier, never the value
([Standard 16](16-security.md)). The last four items are what make onboarding documentation usable by
an agent specifically: where the artifacts, plans, and ADRs live, and how a release happens.

### R6 — Feature documentation

**Significant application features should have durable documentation where the implementation cannot
be understood easily from code alone. Feature documentation should explain, where applicable**,
reproduced verbatim from the source:

```text
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
```

**Do not require large feature documents for trivial functionality.**

Both conditions are real limits, and this standard means them. Documentation is required where code
alone is insufficient — domain rules, permissions, failure behaviour — and not required where the
code is self-evident. A rule producing a document per feature regardless of need generates the
*large generated boilerplate* [Standard 37](37-quality-bar.md) R2 prohibits, and volume nobody reads
displaces the documentation somebody needed.

### R7 — Workflow documentation

**Document important multi-step workflows.** The source's examples:

```text
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
```

**Workflow documentation should include**, reproduced verbatim from the source:

```text
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
```

**Use Mermaid sequence, state, or flow diagrams when they improve clarity.**

*Failure paths* and *approval points* are the two that separate a workflow document from a
description of the happy path — and the happy path is the part a reader could have inferred.
`AI proposal → human approval → execution` appearing in the source's own example list is
[Standard 2](02-propose-vs-execute.md) showing up as a documented workflow.

### R8 — Background jobs and scheduled work

**Document background processes such as** cron/scheduled jobs, queues, workers, event consumers,
batch jobs, recurring AI analysis, maintenance processes, ETL/data pipelines, retry workers, and
cleanup jobs.

**For each meaningful job, document**, reproduced verbatim from the source:

```text
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
```

**A new engineer or AI agent should not have to reverse-engineer production jobs from scheduler
configuration.**

Jobs are the most commonly undocumented part of a system and the most dangerous, because they run
without anyone invoking them. `idempotency behavior` ([Standard 13](13-idempotency.md)),
`retry policy`, and `manual recovery procedure` are the three that matter at 3am, and they are
precisely the three not inferable from the scheduler entry.

### R9 — Integration documentation

**Document meaningful external integrations. For each integration, include where applicable**,
reproduced verbatim from the source:

```text
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
```

**Do not include actual credentials.**

Again *secret/configuration identifiers*, not secrets ([Standard 16](16-security.md)). `ownership`
and `testing/mocking strategy` are the entries a project discovers it needed only when the
integration breaks.

### R10 — API and AI capability documentation

**Document both conventional APIs and AI-operable capabilities. For AI-operable capabilities,
document**, reproduced verbatim from the source:

```text
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
```

**Where OpenAPI, MCP, JSON Schema, function schemas, or another executable contract exists, treat
that structured contract as canonical and avoid manually duplicating details unnecessarily.**

That final clause is [Standard 32](32-documentation-quality.md) R4 stated in the source's own words,
and it resolves what would otherwise be a contradiction in this requirement: the list above is what a
reader needs to *know*, not what the documentation must *restate*. Inputs, outputs, and errors come
from the schema. What documentation adds is what a schema cannot express — the
`read/propose/execute` classification ([Standard 2](02-propose-vs-execute.md)), the approval
requirements, the audit behaviour, and worked examples.

### R11 — Operational documentation

**For production applications, document important operational knowledge such as**, reproduced
verbatim from the source:

```text
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
```

**A system should not depend on undocumented tribal knowledge to operate safely.**

`rollback`, `restoration procedures`, and `data repair procedures` are the ones written after they
were first needed, which is the worst possible time to write them.

### R12 — Applicability is declared, not assumed

Several requirements here are conditioned — *significant* features, *meaningful* jobs and
integrations, *production* applications, *substantial* projects. Where a project judges a requirement
inapplicable, that judgement MUST be recorded rather than left as an absence
([Standard 34](34-dogfooding.md) R3).

Without this, every hedge in this standard becomes an unbounded exemption: a project with no
operational documentation is indistinguishable from a project that decided it is not production, and
a project with no job documentation is indistinguishable from one that forgot its jobs exist.

## Additions this standard makes beyond the source

- R12 in full — the requirement that this standard's own applicability hedges be declared. It has
  more conditional language than any other standard in the series, and without R12 that is a large
  unrecorded exemption surface.
- R3's test that a document producible by `ls` is not architecture documentation.
- R4's reasoning about why a hand-edited SVG wins over its source in practice, and why the CI sync
  check is what makes the rule hold.
- R6's reading of *do not require large feature documents for trivial functionality* as a real limit
  connected to [Standard 37](37-quality-bar.md) R2.
- R10's resolution of the apparent conflict between its field list and the canonical-contract rule.
- The connections throughout to [16](16-security.md), [13](13-idempotency.md), and
  [2](02-propose-vs-execute.md), which the source's lists imply without naming.

## Relationship to other standards

[Standard 32](32-documentation-quality.md) governs quality and the reference-don't-restate rule that
R10 depends on. [Standard 37](37-quality-bar.md) R5 is the principle behind R4.
[Standard 11](11-architecture-decision-records.md) owns ADRs, which R2's `decisions/` surfaces.
[Standard 16](16-security.md) governs the secret references in R5 and R9.
[Standard 13](13-idempotency.md) is what R8's `idempotency behavior` refers to.
[Standard 2](02-propose-vs-execute.md) supplies R10's `read/propose/execute` classification.
[Standard 34](34-dogfooding.md) R3 is the mechanism R12 uses.
[Standard 44](44-existing-project-reconstruction.md) treats `/codebase-docs` output as an `OBSERVED`
evidence source when reconstructing a project that has none of this.

## Implementation

Partially met. This standard surfaced the clearest tooling conflict in the series, and that conflict
is now resolved at its source.

**Met.** `docs/architecture.md` exists, describes responsibilities and interactions rather than
listing directories, and was refreshed when the diagram strategy changed — R1's trigger and R3's test
are both satisfied. It also states its own known gaps, which a reference document omitting them would
read as a complete system. `README.md` documents artifact, plan, and ADR locations, covering four of
R5's twenty onboarding items.

**R4 is now met, and the fix was made at the source rather than in the artifact.**
[ADR 0003](../artifacts/adr/0003-mermaid-is-the-canonical-diagram-source.md) makes Mermaid canonical.
`docs/architecture.mmd` is the source, embedded verbatim in `docs/architecture.md` as a fenced
` ```mermaid ` block, which renders natively. The hand-authored `docs/architecture.svg` was deleted,
and the `/codebase-docs` skill's `references/svg-guide.md` — which instructed hand-computed
coordinates — was replaced by `references/mermaid-guide.md`.

Fixing the artifact alone would have been undone by the next regeneration, which is
[Standard 34](34-dogfooding.md) R5 in practice: the defect was in the generating mechanism, so that
is where it was repaired.

**The `.svg` render is declared not-applicable here**, not skipped. Rendering needs
`@mermaid-js/mermaid-cli`, which pulls a headless browser and would end this repository's
zero-dependency property — the *unnecessary frameworks* [Standard 37](37-quality-bar.md) R2
prohibits. The reasoning is recorded in ADR 0003 and the command for projects that need a standalone
file is documented in `docs/architecture.md`. This is R12 applied to this standard's own hedge.

**R4's CI sync check is implemented.** `scripts/diagrams.mjs` (`npm run diagrams`) asserts every
`.mmd` appears verbatim as a mermaid fence in the documentation, that any committed `.svg` records
the hash of the source it was rendered from, and that no `.svg` exists without a `.mmd` beside it —
the state ADR 0003 abolished. It compares text rather than rendering anything, which is what lets a
zero-dependency repository enforce this rule at all.

Its first version was wrong in an instructive way: it located a diagram's host document by comparing
first lines, so editing the first line matched no host and the drift was reported clean. **The
mutation test caught it on the first run** — a check whose failure path can be stepped around by the
very edit it guards against is worse than no check, because it reports green
([Standard 29](29-testing.md) R5).

**Not applicable, and recorded as such per R12.** This repository has no background jobs
(R8), no external integrations (R9), no AI-operable capabilities beyond its CLI (R10), and is not a
production application (R11). It has no user-facing features (R6) and no multi-step runtime workflows
(R7) — its workflows are development processes, documented in the standards themselves.

**Not met.** R2's hierarchy does not exist; `docs/` holds two files at the root. R5's onboarding
documentation does not exist as such — the build, test, and audit commands are in `package.json` and
described in individual standards, but there is no `docs/onboarding/`. Given the repository's size
these are low-cost gaps, and R12 requires them recorded as gaps rather than quietly treated as
inapplicable, which is what this paragraph does.

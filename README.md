# EngineeringStandards

The durable home of the numbered engineering standards. Each standard is a **normative document**
that states what compliant work must look like. The **executable procedures** that carry them out
live as global Claude Code skills in `~/.claude/skills/`, so they work in every repository without
anything being installed there. A standard is the contract; its skill is the implementation.

> Design every project so a human can understand it, an AI can operate it, every meaningful action
> can be traced, and a fresh engineer or agent can resume the work without relying on conversation
> history.

Every standard in the series resolves back to one of those four clauses.

## Adopting these standards

**Start with [INSTRUCTIONS.md](INSTRUCTIONS.md)** — the operator-facing guide for consuming this
repository from another project. It covers the greenfield / existing-project decision, declaring a
version, adding and validating `project-policy.yml`, classifying rules as failing, not-applicable, or
excepted, interpreting exit codes, upgrading, and what not to do. It also states the tooling's
current limitations, which matter more than the rules when you are starting out.

Briefly, so this page answers the questions [Standard 32](standards/32-documentation-quality.md) R1
requires of it:

| Question | Short answer | Detail |
| --- | --- | --- |
| How a project adopts | Copy a policy from [`templates/`](templates/), declare a version, create the required artifacts, audit | [INSTRUCTIONS.md](INSTRUCTIONS.md), [Standard 22](standards/22-adoption-and-migration.md) |
| How validation works | `npm run policy` checks the policy's shape; `npm run audit` scans a repository and reports findings with evidence labels | [Standard 23](standards/23-standards-validator-cli.md), [24](standards/24-validator-rules.md) |
| How standards are versioned | Semantic. A new `required` rule is `MAJOR`; a `recommended` one is `MINOR`. Projects pin a version and are evaluated against the rules in force in it | [Standard 21](standards/21-versioning.md) |
| How exceptions work | A rule that applies and is knowingly unmet, with reason, approver, date, and usually an expiry. Distinct from `not-applicable`, which means the rule has no subject in your project | [Standard 20](standards/20-exceptions.md), [34](standards/34-dogfooding.md) R3 |
| How AI agents consume it | Agent instruction files point at `INSTRUCTIONS.md`, then `project-policy.yml`, then individual standards on demand — never all 53 up front | [Standard 17](standards/17-agent-instruction-files.md), [31](standards/31-whatsnext-compatibility.md) |

## Standards

The series derives from two reviewed source documents, both committed:
[engineering-standards-spec.md](artifacts/prompts/engineering-standards-spec.md), which defines
standards 1–44 as numbered items, and
[second-fold-in-prompt.md](artifacts/prompts/second-fold-in-prompt.md), which defines the must-never
layer, standards 45–53, as reviewed sections rather than numbered items. Together: **53 standards,
numbered 1–53 with no gaps.**

**All 53 are written.** What remains is implementation, which each document discloses in its own
`## Implementation` section.

| # | Standard | Doc | Implementing skill(s) | Status |
| --- | --- | --- | --- | --- |
| 1 | Human and AI Operability | [standards/01-human-and-ai-operability.md](standards/01-human-and-ai-operability.md) | *none — a design constraint* | active |
| 2 | Propose vs Execute | [standards/02-propose-vs-execute.md](standards/02-propose-vs-execute.md) | *none — a design constraint* | active |
| 3 | Auditing | [standards/03-auditing.md](standards/03-auditing.md) | *none — a design constraint* | active |
| 4 | Planning Standards | [standards/04-planning-standards.md](standards/04-planning-standards.md) | `plan-structure`, `plan-handoff` | active |
| 5 | Resumability | [standards/05-resumability.md](standards/05-resumability.md) | *none — a property of the repository* | active |
| 6 | Project Manifest | [standards/06-project-manifest.md](standards/06-project-manifest.md) | [PROJECT.md](PROJECT.md) | active |
| 7 | Acceptance Criteria | [standards/07-acceptance-criteria.md](standards/07-acceptance-criteria.md) | *none — partly checked by `standards audit`* | active |
| 8 | Status Tracking | [standards/08-status-tracking.md](standards/08-status-tracking.md) | *canonical vocabulary — see [ADR 0001](artifacts/adr/0001-canonical-status-vocabulary.md)* | active |
| 9 | Verification | [standards/09-verification.md](standards/09-verification.md) | `pre-push` | active |
| 10 | Scope Change Management | [standards/10-scope-change-management.md](standards/10-scope-change-management.md) | *none — a discipline, not a procedure* | active |
| 11 | Architecture Decision Records | [standards/11-architecture-decision-records.md](standards/11-architecture-decision-records.md) | *none* | active |
| 12 | Structured Errors | [standards/12-structured-errors.md](standards/12-structured-errors.md) | *none — defines the machine-interface contract* | active |
| 13 | Idempotency | [standards/13-idempotency.md](standards/13-idempotency.md) | *none* | active |
| 14 | Structured Results | [standards/14-structured-results.md](standards/14-structured-results.md) | *none* | active |
| 15 | AI Tool Contracts | [standards/15-ai-tool-contracts.md](standards/15-ai-tool-contracts.md) | *none — completes the 12–15 baseline contract* | active |
| 16 | Security | [standards/16-security.md](standards/16-security.md) | *none* | active |
| 17 | Agent Instruction Files | [standards/17-agent-instruction-files.md](standards/17-agent-instruction-files.md) | *none* | active |
| 18 | Machine-Readable Project Policy | [standards/18-machine-readable-project-policy.md](standards/18-machine-readable-project-policy.md) | `project-policy.yml` — read by the audit | active |
| 19 | JSON Schema | [standards/19-json-schema.md](standards/19-json-schema.md) | `schemas/project-policy.schema.json`, `scripts/jsonschema.mjs` | active |
| 20 | Exceptions | [standards/20-exceptions.md](standards/20-exceptions.md) | `scripts/policy.mjs`, `scripts/compliance.mjs` | active |
| 21 | Versioning | [standards/21-versioning.md](standards/21-versioning.md) | [VERSION](VERSION), [CHANGELOG.md](CHANGELOG.md) | active |
| 22 | Adoption and Migration | [standards/22-adoption-and-migration.md](standards/22-adoption-and-migration.md) | [INSTRUCTIONS.md](INSTRUCTIONS.md), `project-reconstruction` | active |
| 23 | Standards Validator CLI | [standards/23-standards-validator-cli.md](standards/23-standards-validator-cli.md) | `standards audit`, `standards validate` | active |
| 24 | Validator Rules | [standards/24-validator-rules.md](standards/24-validator-rules.md) | `scripts/standards.mjs` (partial) | active |
| 25 | Validator Output | [standards/25-validator-output.md](standards/25-validator-output.md) | `scripts/compliance.mjs` — full envelope | active |
| 26 | Stable Rule IDs | [standards/26-stable-rule-ids.md](standards/26-stable-rule-ids.md) | `rules/`, `scripts/catalog.mjs` | active |
| 27 | Rule Catalog | [standards/27-rule-catalog.md](standards/27-rule-catalog.md) | `rules/` — 50 rules, 16 categories | active |
| 28 | GitHub Actions | [standards/28-github-actions.md](standards/28-github-actions.md) | `.github/workflows/ci.yml` (partial) | active |
| 29 | Testing | [standards/29-testing.md](standards/29-testing.md) | `test/` — 169 tests, 6 files | active |
| 30 | Compliance Scoring | [standards/30-compliance-scoring.md](standards/30-compliance-scoring.md) | `scripts/compliance.mjs` | active |
| 31 | WhatsNext Compatibility | [standards/31-whatsnext-compatibility.md](standards/31-whatsnext-compatibility.md) | *not implemented, by requirement — contract only* | active |
| 32 | Documentation Quality | [standards/32-documentation-quality.md](standards/32-documentation-quality.md) | this README, [INSTRUCTIONS.md](INSTRUCTIONS.md) | active |
| 33 | Bootstrap Experience | [standards/33-bootstrap-experience.md](standards/33-bootstrap-experience.md) | `standards init` | active |
| 34 | Dogfooding | [standards/34-dogfooding.md](standards/34-dogfooding.md) | the repository itself (partial) | active |
| 35 | Planning Requirements | [standards/35-planning-requirements.md](standards/35-planning-requirements.md) | `plan-structure`, `plan-handoff` | active |
| 36 | Implementation Strategy | [standards/36-implementation-strategy.md](standards/36-implementation-strategy.md) | *the build order itself* | active |
| 37 | Quality Bar | [standards/37-quality-bar.md](standards/37-quality-bar.md) | *none — delegates to the standards it names* | active |
| 38 | Definition of Done | [standards/38-definition-of-done.md](standards/38-definition-of-done.md) | *not implemented — release criteria not met* | active |
| 39 | Codebase Documentation Standard | [standards/39-codebase-documentation.md](standards/39-codebase-documentation.md) | `codebase-docs`, `scripts/diagrams.mjs` — see [ADR 0003](artifacts/adr/0003-mermaid-is-the-canonical-diagram-source.md) | active |
| 40 | Diffable AI Changes | [standards/40-diffable-ai-changes.md](standards/40-diffable-ai-changes.md) | *none — ordinary source control is the mechanism* | active |
| 41 | Decisions, Assumptions, and Unresolved Questions | [standards/41-decisions-assumptions-and-questions.md](standards/41-decisions-assumptions-and-questions.md) | `artifacts/adr/` (partial) | active |
| 42 | Documentation Freshness | [standards/42-documentation-freshness.md](standards/42-documentation-freshness.md) | `scripts/standards.mjs`, `scripts/diagrams.mjs` — two checks of five | active |
| 43 | Documentation Completion Requirement | [standards/43-documentation-completion.md](standards/43-documentation-completion.md) | *not implemented — belongs in `pre-push`* | active |
| 44 | Existing Project Reconstruction | [standards/44-existing-project-reconstruction.md](standards/44-existing-project-reconstruction.md) | `project-reconstruction` | active |
| 45 | Engineering Invariants | [standards/45-engineering-invariants.md](standards/45-engineering-invariants.md) | `rules/invariants.json`, `scripts/compliance.mjs` — the verdict cap | active |
| 46 | Source Control Safety | [standards/46-source-control-safety.md](standards/46-source-control-safety.md) | `scripts/standards.mjs` — two of four detected | active |
| 47 | Test Integrity | [standards/47-test-integrity.md](standards/47-test-integrity.md) | *review-required — the violation is a claim about why a test changed* | active |
| 48 | Error Handling and Observability | [standards/48-error-handling-and-observability.md](standards/48-error-handling-and-observability.md) | `scripts/standards.mjs` — one of four detected | active |
| 49 | Data Safety | [standards/49-data-safety.md](standards/49-data-safety.md) | *review-required — see the standard for why each* | active |
| 50 | Security Prohibitions | [standards/50-security-prohibitions.md](standards/50-security-prohibitions.md) | `scripts/standards.mjs` — two of five detected | active |
| 51 | Architecture Integrity | [standards/51-architecture-integrity.md](standards/51-architecture-integrity.md) | *review-required — boundaries are a project-specific fact* | active |
| 52 | Concurrency and Shared State | [standards/52-concurrency-and-shared-state.md](standards/52-concurrency-and-shared-state.md) | *review-required — sharing depends on how code is invoked* | active |
| 53 | AI Engineering Honesty | [standards/53-ai-engineering-honesty.md](standards/53-ai-engineering-honesty.md) | `quality.unfinished-work`; the rest review-required | active |

Standards 45–53 are the **must-never layer**: prohibitions rather than requirements, built from the
catalog's `forbidden` level and governed by [Standard 45](standards/45-engineering-invariants.md).
See [ADR 0006](artifacts/adr/0006-must-never-standards-are-forbidden-level-rules.md).

The canonical enumeration of the series lives in
[artifacts/standards-source-inventory.json](artifacts/standards-source-inventory.json) — reviewed once
against the source and committed, rather than re-derived on each run. `npm run inventory` proves
source extraction still agrees with it, and CI fails if it does not.

## Decisions

- [artifacts/adr/0001-canonical-status-vocabulary.md](artifacts/adr/0001-canonical-status-vocabulary.md)
  — one lifecycle vocabulary across plans, backlogs, and tooling.
- [artifacts/adr/0002-canonical-rule-identity.md](artifacts/adr/0002-canonical-rule-identity.md)
  — one rule identity across policy keys, exceptions, the catalog, and validator output.
- [artifacts/adr/0003-mermaid-is-the-canonical-diagram-source.md](artifacts/adr/0003-mermaid-is-the-canonical-diagram-source.md)
  — Mermaid source is canonical; SVG is a generated artifact, never hand-edited.
- [artifacts/adr/0004-audit-and-validate-are-separate-commands.md](artifacts/adr/0004-audit-and-validate-are-separate-commands.md)
  — `audit` is evidence, `validate` is the verdict; and the v1 public surface this freezes.
- [artifacts/adr/0005-attestations-are-recorded-human-evidence.md](artifacts/adr/0005-attestations-are-recorded-human-evidence.md)
  — an attestation records a human review; it is evidence, never a fourth kind of waiver.
- [artifacts/adr/0006-must-never-standards-are-forbidden-level-rules.md](artifacts/adr/0006-must-never-standards-are-forbidden-level-rules.md)
  — the must-never layer is built from the catalog's `forbidden` level, reuses existing rules rather
  than duplicating them, and caps the verdict where a prohibition went unexamined.
- [artifacts/adr/0007-cli-scripts-are-single-run-programs-with-module-scoped-state.md](artifacts/adr/0007-cli-scripts-are-single-run-programs-with-module-scoped-state.md)
  — the CLI scripts are commands, not libraries; module scope is run scope, and process exit is the
  reset boundary. Standard 51 R1's required record for this repository's own global state.
- [artifacts/adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md](artifacts/adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)
  — a detector may say what is present in the working tree; saying *committed* or *tracked* requires
  asking the repository, and until that seam exists both directions of the gap are disclosed.
- [artifacts/adr/0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md](artifacts/adr/0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md)
  — a detector reports an instance of its subject, never a discussion of it; the source view is the
  mechanism and every detector declares which one it scans.
- [artifacts/adr/0010-human-review-may-always-contribute-negative-evidence.md](artifacts/adr/0010-human-review-may-always-contribute-negative-evidence.md)
  — **Proposed.** Approval and rejection are not symmetric operations and should not share one
  permission; a rejection cannot manufacture a pass, so it cannot violate monotonicity.

## Design documents

- [design/standards-audit-cli.md](design/standards-audit-cli.md) — the `standards audit .` command:
  finding categories, JSON output schema, and detection sources. **Implemented** since 1.0.0; the
  document remains the record of the contract and the decisions behind it.

## Layout

```text
INSTRUCTIONS.md     How to adopt and use the framework from another project.
standards/          One numbered normative document per standard (NN-<kebab-title>.md).
rules/              The rule catalog — the source of machine truth for rule identity (Standard 27).
VERSION             The published framework version.
CHANGELOG.md        What each version changed, and what 1.0.0 freezes.
PROJECT.md          This repository's own manifest (Standard 6).
templates/          What an adopting project copies.
design/             Forward-looking designs, not yet implemented.
schemas/            JSON Schemas for the structured contracts (Standard 19).
project-policy.yml  This repository's own policy (Standard 18), the first dogfooded instance.
scripts/            The audit CLI and the invariant checks CI runs.
test/               Tests and fixture repositories, including known-negative policies.
artifacts/
  prompts/          Source spec material the standards were written from.
  adr/              Accepted decision records.
```

**Commands.** `npm test` · `npm run audit` (evidence) · `npm run validate` (verdict) ·
`npm run policy` · `npm run diagrams` · `npm run inventory` · `npm run fidelity`. CI runs all seven.
`standards init` bootstraps another project — see [INSTRUCTIONS.md](INSTRUCTIONS.md).

**Version 1.1.0** — see [CHANGELOG.md](CHANGELOG.md). 1.0.0 froze the public surface; 1.1.0 adds
attestations as the fourth policy mechanism.

**Numbering convention.** Standards files are named `NN-<kebab-title>.md`. Zero-pad single digits
(`01-…` through `09-…`) when backfilling, so a directory listing sorts in numeric order.

# EngineeringStandards

The durable home of the numbered engineering standards. Each standard is a **normative document**
that states what compliant work must look like. The **executable procedures** that carry them out
live as global Claude Code skills in `~/.claude/skills/`, so they work in every repository without
anything being installed there. A standard is the contract; its skill is the implementation.

> Design every project so a human can understand it, an AI can operate it, every meaningful action
> can be traced, and a fresh engineer or agent can resume the work without relying on conversation
> history.

Every standard in the series resolves back to one of those four clauses. See
[Standard 32](standards/32-documentation-quality.md) for what else this document is required to
explain — five of its eight questions are not answered here yet, because they describe mechanisms
that are specified and unbuilt.

## Standards

The source specification for the whole series is committed at
[artifacts/prompts/engineering-standards-spec.md](artifacts/prompts/engineering-standards-spec.md).
It defines **44 standards, numbered 1–44 with no gaps**.

Backfilling the remaining items as documents is in progress.

| # | Standard | Doc | Implementing skill(s) | Status |
| --- | --- | --- | --- | --- |
| 1 | Human and AI Operability | [standards/01-human-and-ai-operability.md](standards/01-human-and-ai-operability.md) | *none — a design constraint* | active |
| 2 | Propose vs Execute | [standards/02-propose-vs-execute.md](standards/02-propose-vs-execute.md) | *none — a design constraint* | active |
| 3 | Auditing | [standards/03-auditing.md](standards/03-auditing.md) | *none — a design constraint* | active |
| 4 | Planning Standards | [standards/04-planning-standards.md](standards/04-planning-standards.md) | `plan-structure`, `plan-handoff` | active |
| 5 | Resumability | [standards/05-resumability.md](standards/05-resumability.md) | *none — a property of the repository* | active |
| 6 | Project Manifest | [standards/06-project-manifest.md](standards/06-project-manifest.md) | *none* | active |
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
| 18 | Machine-Readable Project Policy | [standards/18-machine-readable-project-policy.md](standards/18-machine-readable-project-policy.md) | *none* | active |
| 19 | JSON Schema | [standards/19-json-schema.md](standards/19-json-schema.md) | *none — no policy published yet* | active |
| 20 | Exceptions | [standards/20-exceptions.md](standards/20-exceptions.md) | *none* | active |
| 21 | Versioning | [standards/21-versioning.md](standards/21-versioning.md) | *none — no framework version published yet* | active |
| 22 | Adoption and Migration | [standards/22-adoption-and-migration.md](standards/22-adoption-and-migration.md) | `project-reconstruction` (R4) | active |
| 23 | Standards Validator CLI | [standards/23-standards-validator-cli.md](standards/23-standards-validator-cli.md) | `scripts/standards.mjs` — audited in the document | active |
| 24 | Validator Rules | [standards/24-validator-rules.md](standards/24-validator-rules.md) | `scripts/standards.mjs` (partial) | active |
| 25 | Validator Output | [standards/25-validator-output.md](standards/25-validator-output.md) | `scripts/standards.mjs` (partial) | active |
| 26 | Stable Rule IDs | [standards/26-stable-rule-ids.md](standards/26-stable-rule-ids.md) | *not implemented* | active |
| 27 | Rule Catalog | [standards/27-rule-catalog.md](standards/27-rule-catalog.md) | *not implemented — no rule catalog exists yet* | active |
| 28 | GitHub Actions | [standards/28-github-actions.md](standards/28-github-actions.md) | `.github/workflows/ci.yml` (partial) | active |
| 29 | Testing | [standards/29-testing.md](standards/29-testing.md) | `test/audit.test.mjs` (partial) | active |
| 30 | Compliance Scoring | [standards/30-compliance-scoring.md](standards/30-compliance-scoring.md) | *not implemented — no score is computed* | active |
| 31 | WhatsNext Compatibility | [standards/31-whatsnext-compatibility.md](standards/31-whatsnext-compatibility.md) | *not implemented, by requirement — contract only* | active |
| 32 | Documentation Quality | [standards/32-documentation-quality.md](standards/32-documentation-quality.md) | this README (partial) | active |
| 33 | Bootstrap Experience | [standards/33-bootstrap-experience.md](standards/33-bootstrap-experience.md) | *not implemented — no `standards init`* | active |
| 34 | Dogfooding | [standards/34-dogfooding.md](standards/34-dogfooding.md) | the repository itself (partial) | active |
| 35 | Planning Requirements | [standards/35-planning-requirements.md](standards/35-planning-requirements.md) | `plan-structure`, `plan-handoff` | active |
| 36 | Implementation Strategy | [standards/36-implementation-strategy.md](standards/36-implementation-strategy.md) | *the build order itself* | active |
| 37 | Quality Bar | [standards/37-quality-bar.md](standards/37-quality-bar.md) | *none — delegates to the standards it names* | active |
| 38 | Definition of Done | [standards/38-definition-of-done.md](standards/38-definition-of-done.md) | *not implemented — release criteria not met* | active |
| 39 | Codebase Documentation Standard | [standards/39-codebase-documentation.md](standards/39-codebase-documentation.md) | `codebase-docs` — **conflicts on R4**, see the document | active |
| 40–43 | *(see the source spec)* | *backfill pending* | `backlog`, `backlog-validate`, `backlog-reconcile` | partly implemented as skills |
| 44 | Existing Project Reconstruction | [standards/44-existing-project-reconstruction.md](standards/44-existing-project-reconstruction.md) | `project-reconstruction` | active |

The canonical enumeration of the series lives in
[artifacts/standards-source-inventory.json](artifacts/standards-source-inventory.json) — reviewed once
against the source and committed, rather than re-derived on each run. `npm run inventory` proves
source extraction still agrees with it, and CI fails if it does not.

## Decisions

- [artifacts/adr/0001-canonical-status-vocabulary.md](artifacts/adr/0001-canonical-status-vocabulary.md)
  — one lifecycle vocabulary across plans, backlogs, and tooling.
- [artifacts/adr/0002-canonical-rule-identity.md](artifacts/adr/0002-canonical-rule-identity.md)
  — one rule identity across policy keys, exceptions, the catalog, and validator output.

## Design documents

Forward-looking designs that are not yet implemented:

- [design/standards-audit-cli.md](design/standards-audit-cli.md) — the `standards audit .` command:
  finding categories, JSON output schema, and detection sources. Design only; nothing is built.

## Layout

```text
standards/    One numbered normative document per standard (NN-<kebab-title>.md).
design/       Forward-looking designs, not yet implemented.
artifacts/
  prompts/    Source spec material the standards were written from.
```

**Numbering convention.** Standards files are named `NN-<kebab-title>.md`. Zero-pad single digits
(`01-…` through `09-…`) when backfilling, so a directory listing sorts in numeric order.

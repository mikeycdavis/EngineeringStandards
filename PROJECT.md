# PROJECT — EngineeringStandards

## Purpose

The durable home of a numbered series of 44 engineering standards, and the tooling that checks a
repository against them. Each standard is a normative document stating what compliant work must look
like; the executable procedures that carry them out live as global Claude Code skills. The audience
is the repository owner and any AI agent working in a project that claims to follow these standards.

## Standards

- **Standards version:** `1.0.0` — declared in [`project-policy.yml`](project-policy.yml)
- **Adoption guide:** [`INSTRUCTIONS.md`](INSTRUCTIONS.md)
- **This repository is its own first adopter** ([Standard 34](standards/34-dogfooding.md)) — the
  policy above is the first dogfooded instance and the pattern adopters copy.

## Stack

| Layer | Technology |
| --- | --- |
| Normative content | Markdown — `standards/`, `design/`, `artifacts/` |
| Structured contracts | `project-policy.yml`, `schemas/`, `rules/` |
| Tooling | Node.js ≥ 18, ESM, `node:` builtins only. **Zero third-party dependencies** |
| Tests | `node:test` + `node:assert/strict` |
| CI | GitHub Actions, Node 20, no install step |

## Commands

| Task | Command |
| --- | --- |
| Test | `npm test` |
| Audit this repository | `npm run audit` |
| Validate the policy | `npm run policy` |
| Check diagram freshness | `npm run diagrams` |
| Check the source inventory | `npm run inventory` |
| Check verbatim-source claims | `npm run fidelity` |

CI runs all six, in that order. There is no build step and nothing to install.

## Environments

None. This repository produces no deployed artifact. Distribution is the npm `bin` entry
(`standards`) plus a no-install fallback via `node scripts/*.mjs`.

## Integrations

None. The zero-dependency rule is enforced structurally: CI has no install step, so adding a
dependency breaks the build rather than passing unnoticed.

## Architectural rules

Project-specific constraints, not a restatement of the standards:

- **Three-way separation.** The catalog (`rules/`) defines rule identity and metadata;
  `project-policy.yml` defines project applicability; the evaluator produces evidence. **None of the
  three may redefine the others.** `assertBindings` enforces the evaluator's half mechanically.
- **Zero third-party dependencies**, including in tests and CI.
- **Every guard exists because of a specific defect**, and is mutation-tested where it guards a known
  bug — reintroduce the defect, confirm the test fails, restore.
- **Fixtures are excluded from the self-audit** by a general mechanism, never a self-referential
  exemption ([Standard 34](standards/34-dogfooding.md) R4).
- **One definition of everything** — status vocabulary ([ADR 0001](artifacts/adr/0001-canonical-status-vocabulary.md)),
  rule identity ([ADR 0002](artifacts/adr/0002-canonical-rule-identity.md)), diagram source
  ([ADR 0003](artifacts/adr/0003-mermaid-is-the-canonical-diagram-source.md)).

## Artifact locations

| Artifact | Path |
| --- | --- |
| Adoption guide | `INSTRUCTIONS.md` |
| Standards | `standards/NN-<kebab-title>.md` |
| Rule catalog | `rules/*.json` |
| Project policy | `project-policy.yml` |
| Schemas | `schemas/` |
| Templates for adopters | `templates/` |
| Plan | `artifacts/project-plan-breakdown/` |
| Decision records | `artifacts/adr/` |
| Source specification | `artifacts/prompts/engineering-standards-spec.md` |
| Canonical standards enumeration | `artifacts/standards-source-inventory.json` |
| Documentation | `docs/` |

## Current state

- **Current status:** `IN_PROGRESS`
- **Current release target:** none. Nothing merges to `master` and no release is cut until the plan
  has zero gaps — a deferred decision with an explicit trigger
  ([Standard 41](standards/41-decisions-assumptions-and-questions.md) R3).
- **Known risks:** The rule catalog covers 24 rules, which is the set the evaluator and policy speak
  in — not every requirement across 44 standards. The remainder is disclosed in prose in each
  standard's `## Implementation` section, which nothing counts and nothing notices going stale.
- **Known blockers:** none.
- **Next recommended work:** `VERSION` and `CHANGELOG.md` ([Standard 21](standards/21-versioning.md)),
  so `standardVersion: "1.0.0"` resolves to something published rather than being a forward
  declaration; then `standards init` ([Standard 33](standards/33-bootstrap-experience.md)) and the
  `audit` → `validate` rename ([Standard 23](standards/23-standards-validator-cli.md) R2).

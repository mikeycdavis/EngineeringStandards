# Changelog

All notable changes to this framework. Versioning follows
[Standard 21](standards/21-versioning.md): adding a `required` rule is `MAJOR`, adding a
`recommended` one is `MINOR`, and removing any rule is `MAJOR`.

**Three versions travel independently and may diverge numerically**
([ADR 0004](artifacts/adr/0004-audit-and-validate-are-separate-commands.md)):

| Version | Versions | Declared in |
| --- | --- | --- |
| Framework | The standards, the rule catalog, the policy schema | `VERSION`, and a project's `standardVersion` |
| Output schema | The validator's JSON envelope | `schemaVersion` in every report |
| Package | The npm package | `package.json` |

## 1.1.0 — 2026-08-09

**`MINOR`.** Every change is a widening: an optional policy section, an optional catalog field, and
new `disposition` values. Nothing frozen at 1.0.0 changes meaning, and a 1.0.0 policy remains valid.

### Added

- **`attestations`** — the fourth first-class policy mechanism
  ([ADR 0005](artifacts/adr/0005-attestations-are-recorded-human-evidence.md)). Recorded human
  judgement for rules the catalog says a human evaluates. An attestation is *evidence*, not a waiver:
  it records who reviewed what and when, never overrides an automated failure, and does **not**
  produce `COMPLIANT_WITH_EXCEPTIONS`.

  ```text
  required rule
     ├── automated evidence ──────────────► evaluated result
     ├── human judgement ─────────────────► attestation
     ├── does not apply ──────────────────► not-applicable
     └── applies but intentionally waived ► exception
  ```

- **`attestable`** on catalog rules, defaulting to `validationType === "manual-review"`. A rule the
  catalog does not mark attestable cannot be satisfied by assertion.
- **Staleness** via `reviewedAgainst.paths` and `digest`. The validator digests the reviewed paths;
  when they differ the attestation is stale and the rule returns to `not-evaluated`. Content-based
  rather than revision-based, because invalidating every attestation on every commit would make the
  mechanism unusable.
- New `disposition` values: `attested`, `invalid-attestation`, `contradicted-attestation`,
  `attested-rejected`.
- **[Standard 33](standards/33-bootstrap-experience.md) R7** — tool-generated scaffolding is never
  evidence about the project. Found by this repository's own tests when `init` read its own empty
  plan directory as proof a plan existed.

### Fixed

- **A manual-review rule could be reported `passed` by an automated run** that simply found nothing.
  "No automated finding" is not evidence for a requirement whose evaluator is a human. Such rules now
  report `not-evaluated` unless a valid attestation establishes them.

### Dogfooded

`ai.destructive-approval` completed the lifecycle this release exists to make possible:

```text
not-applicable  →  applicable / not-evaluated  →  attested / PASS
```

It was `not-applicable` with the trigger *"`standards init` lands — it writes files"*. `init`
landed, the declaration was retired, and the rule sat honestly `not-evaluated` until a human review
was recorded against `scripts/init.mjs` and `test/init.test.mjs`. Nothing pretended static analysis
proved something it did not, and `manualReview` in the assurance breakdown is now non-zero for the
first time.

## 1.0.0 — 2026-08-09

The first published version. **This is the point at which the public surface becomes a contract.**

### The frozen surface

Changing any of these is a `MAJOR` release
([ADR 0004](artifacts/adr/0004-audit-and-validate-are-separate-commands.md)):

- CLI command names and their high-level semantics
- The project-policy schema (`schemas/project-policy.schema.json`)
- The 24 canonical rule IDs, and alias resolution behaviour
- The rule-catalog entry contract
- The validator JSON envelope
- Compliance statuses, `disposition` values, and exit-code meanings
- Score, assurance, and framework-coverage semantics

**Not frozen**, and not to be depended on: human-readable console wording, internal module layout,
implementation language, detector internals, ordering of non-semantic output.

### Added

- **44 standards** as normative documents, `standards/01`–`44`, each stating its own requirements and
  disclosing what is actually implemented versus specified.
- **`standards audit`** — evidence discovery. Reports what a repository has and where it departs from
  the standards. Needs no policy; never produces a verdict.
- **`standards validate`** — policy-aware compliance evaluation. Applies applicability, exceptions,
  and `nonExemptible`, and emits status, score, assurance, and framework coverage.
- **`standards init`** — bootstrap. Creates missing artifacts, never overwrites without a per-path
  opt-in, and routes greenfield / existing-with-plan / reconstruction-required.
- **Rule catalog** (`rules/`) — 24 rules across 8 categories, each carrying identity, level,
  severity, validation type, assurance, exemptibility, lifecycle metadata, and remediation.
- **Project policy** (`project-policy.yml`) and its **JSON Schema**, with `applicability` and
  `exceptions` as separate first-class mechanisms.
- **Compliance verdict** — `COMPLIANT`, `COMPLIANT_WITH_EXCEPTIONS`, `NON_COMPLIANT`,
  `NOT_EVALUATED`. Status is computed from rules and never from the score.
- **`frameworkCoverage`** — how much of the framework has been turned into rules, reported beside the
  verdict and never combined with it.
- **`INSTRUCTIONS.md`** — the adoption guide, and `templates/` for what an adopter copies.
- **Invariant checks**: source inventory, verbatim-source fidelity, diagram freshness, policy
  validity. All run in CI, none requires an install step.
- Four decision records: canonical status vocabulary, canonical rule identity, Mermaid as canonical
  diagram source, and the `audit`/`validate` split.

### Known limitations at 1.0.0

Stated here rather than discovered later, and each recorded in the standard that specifies it:

- The catalog covers **24 rules across 14 of 44 standards**; 5 standards are fully machine-
  represented. Rules outside it report `not-evaluated` rather than passing, so a `COMPLIANT` verdict
  covers less than the whole framework. `frameworkCoverage` reports this on every run.
- Several rules are `manual-review` or have no analyzer, and report `skipped / not-evaluated`.
- No rule has been deprecated or superseded yet, so the lifecycle fields are present and empty.

### Notes on getting here

Two shape changes to `schemaVersion` happened before this release and are now spent: numeric `1`, to
the string `"1.0"`, to `"1.0.0"`. Semantic versioning was chosen so `schemaVersion` and
`standardVersion` share a format — they remain independently versioned, and independence means they
may diverge numerically, not that they use different shapes.

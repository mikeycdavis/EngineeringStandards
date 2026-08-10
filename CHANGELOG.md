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

## 2.0.1 — 2026-08-09

**`PATCH`.** Two detector false positives, and the standards they had drifted from. No rule was
added, removed, or re-levelled; some projects that failed will now pass, which is the fix working.

### Fixed

- **`documentation.code-consistency` read HTTP routes as filesystem paths.** A README naming
  `/api/health` was told the path did not exist. The check now distinguishes repository paths from
  URLs, routes, route parameters, globs and query strings: a leading slash means a route unless the
  last segment carries a file extension. Root-relative file references such as `/src/index.ts` are
  still checked, and a repository-relative path that genuinely does not exist is still reported.
  This is the third false positive this detector layer has shipped, and the third whose fix was to
  require evidence of the thing rather than a resemblance to it.
- **`architecture.adr` accepted only `artifacts/adr/`.** [Standard 11](standards/11-architecture-decision-records.md)
  R1 is a `SHOULD` naming one location out of several; `docs/adr/` and `doc/adr/` are what Nygard's
  article and adr-tools established. A project following the older convention was failed, and the
  cheapest repair available to it was to move files to satisfy a detector — the behaviour this
  framework argues against. All three locations now satisfy the rule; none still fails it.

- **`standards init` offered to create `artifacts/adr/` beside a populated `docs/adr/`.** The audit
  learned that [Standard 11](standards/11-architecture-decision-records.md) R1 accepts three
  locations; `init` still knew one. An adopter following the bootstrap would have finished with two
  ADR directories, one of them empty — the tool manufacturing the ambiguity it then reports. `init`
  now preserves rather than creates when another accepted location already holds records. An *empty*
  alternative does not count, because a directory with no records in it is not a home for decisions.

- **`standards init` wrote a `standardVersion` one release out of date.**
  `templates/project-policy.yml` carried the literal `2.0.0`, so every release left it behind and
  each new adopter declared a version nobody chose — then failed the outdated-version check on their
  first run, for a value the bootstrap had just written for them. `init` now stamps the current
  `VERSION` as it writes. A constant in a file releases do not touch is a maintenance obligation
  nobody signed up for.

### Decided — detectors report instances of a subject, not discussion of it

[ADR 0009](artifacts/adr/0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md).
Four detector false positives have now shipped and they are one defect four times: each asked *does
this text mention the thing?* and reported the answer to *is this an instance of the thing?* An SDK
named in a comment, an HTTP route read as a path, a redaction test's seeded credential, a doc comment
reading *"Deterministic, like a TODO:"*. The first acquired a regression test whose name states the
principle and it generalised no further; three more followed.

Recorded as guidance for detector authors rather than as a compliance rule — no adopter can act on a
finding that says their code confused a detector, and deciding instance-versus-mention is the same
judgement the detector was already failing to make. New detectors owe an answer up front: what
distinguishes an instance from a mention here, and does the implementation test for it? Where nothing
does, the honest outcomes are a narrower rule, a lower `assurance`, or `manual-review` — not a broader
match, because a finding an adopter learns to ignore trains them to ignore the next one.

Two instances stay open on purpose. `security.no-secrets-in-artifacts` and `quality.unfinished-work`
both fire on fixtures, where the fixture is a genuine instance and only intent separates it from the
defect. Disclosed in [INSTRUCTIONS.md](INSTRUCTIONS.md) rather than guessed at.

### Disclosed — two detectors assert repository state they never measured

[ADR 0008](artifacts/adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md).
`scm.no-committed-env-files` and `security.no-secrets-in-artifacts` both report *tracked* and both
mean *present on disk*. A gitignored `.env` is reported as a committed environment file; the fakes
seeded in a project's redaction tests are reported as committed credentials. Both then advise
rotation, which is expensive, irreversible in the wrong direction, and — where the file was never
committed — entirely unnecessary.

Not fixed in this release. Answering *is this path tracked?* correctly means nested `.gitignore`
files, negation ordering, `core.excludesFile`, `info/exclude`, sparse checkout, submodules,
worktrees, symlinks, `intent-to-add`, `skip-worktree` and `assume-unchanged`, and reimplementing
enough of that to be trustworthy is a maintenance project. The ADR records the decision to obtain the
answer behind a narrow repository-metadata seam instead, and the rejected alternatives.

- `scm.no-committed-env-files` assurance drops `full` → `partial`. A check that cannot tell *present*
  from *committed* has not established its requirement, and saying `full` was the assurance
  overstatement [Standard 31](standards/31-whatsnext-compatibility.md) R6 exists to prevent — in the
  tool that supplies the number.
- Both remediations now say to confirm with `git ls-files` before acting.
- Recorded in [INSTRUCTIONS.md](INSTRUCTIONS.md)'s current-limitations table and in the
  `## Implementation` sections of [Standard 16](standards/16-security.md) and
  [Standard 46](standards/46-source-control-safety.md).

**Do not write a [Standard 20](standards/20-exceptions.md) exception for either.** An exception says
the rule applies and the project knowingly does not satisfy it. Using one here would record a
compliance failure that did not happen and bury the tool's own defect in an adopter's policy file.

### Changed — documentation caught up with the code

- [Standard 31](standards/31-whatsnext-compatibility.md)'s Implementation section described a
  contract that "largely could not" be honoured and a `{ schemaVersion, repo, auditedAt, findings }`
  envelope. Both were true before 1.1.0 and neither is true now: `validate --json` emits the full
  [Standard 25](standards/25-validator-output.md) envelope and every R2 guarantee is present, with
  canonical `ruleId` on every result. Rewritten to describe what ships, with the two cautions a
  consumer needs — `score` is meaningless under `NOT_EVALUATED`, and `frameworkCoverage` is tooling
  maturity rather than compliance. The one genuine gap, [Standard 28](standards/28-github-actions.md)
  R3, is now recorded as the open item it is.
- [Standard 11](standards/11-architecture-decision-records.md)'s Implementation section said
  `standards audit` does not check for an ADR directory. It has for some time.
- [Standard 16](standards/16-security.md)'s Implementation section said the audit performs no secret
  scanning. `security.no-secrets-in-artifacts` has scanned since 2.0.0. Rewritten to say what the
  scan actually covers, and what it cannot.
- [Standard 28](standards/28-github-actions.md) R3's copy-pasteable CI snippet used
  `--format json`, which the CLI does not accept. It is `--json`, as
  [Standard 23](standards/23-standards-validator-cli.md) already records.
- [Standard 32](standards/32-documentation-quality.md) said the README indexes 44 standards. There
  are 53.

Four stale `## Implementation` sections in one pass is a pattern, not four accidents: each was
accurate when written and nothing re-reads it afterwards, so the drift is invisible from the document
— which stays internally coherent while becoming false.
[Standard 42](standards/42-documentation-freshness.md)'s Implementation section now records this as
its largest unchecked surface, with two partial checks that would have caught all four and need no
judgement to run: parsing CLI invocations in fenced blocks against the flags the scripts accept, and
testing negative capability claims (*does not check*, *no skill implements*) against the rule catalog.
Both find only prose that understates what ships; overstatement stays a human-review problem that
[Standard 32](standards/32-documentation-quality.md) R3 already owns.

## 2.0.0 — 2026-08-09

**`MAJOR`.** The must-never layer: nine new standards, 26 new rules, and a change to what the verdict
means. Three things can newly fail an adopter's `validate` **with no change to their code**:

- New `forbidden` rules, five of which are mechanically detected.
- One new `required` rule, `architecture.dependency-evaluation`.
- The unestablished-prohibition verdict rule — an applicable `forbidden` rule nobody examined caps
  the verdict at `NOT_EVALUATED` and exits 1.

**What did not change:** the policy schema (a 1.x policy file still validates), any rule id or alias,
and every exit-code meaning except the new `NOT_EVALUATED` trigger. See
[Upgrading from 1.x to 2.0](INSTRUCTIONS.md#upgrading-from-1x-to-20).

### Added — the must-never layer

- **[Standard 45](standards/45-engineering-invariants.md)** — the umbrella. Defines what a
  prohibition *is* here: the semantics of `forbidden` (satisfied by absence of violating evidence,
  never by the project doing something), the exception discipline, the three verification classes
  mapped onto the assurance triple that already existed, and the verdict rule. R1 is the
  meta-standard — *standards and tests must never be weakened, removed, bypassed, or reclassified
  solely to permit an implementation that would otherwise violate them* — as a non-exemptible rule.
- **[46](standards/46-source-control-safety.md)** source control,
  **[47](standards/47-test-integrity.md)** test integrity,
  **[48](standards/48-error-handling-and-observability.md)** errors and observability,
  **[49](standards/49-data-safety.md)** data safety,
  **[50](standards/50-security-prohibitions.md)** security,
  **[51](standards/51-architecture-integrity.md)** architecture,
  **[52](standards/52-concurrency-and-shared-state.md)** concurrency,
  **[53](standards/53-ai-engineering-honesty.md)** AI engineering honesty.
- **26 catalog rules**, taking the catalog from 24 to 50: 23 `forbidden`, 1 `required`
  (`architecture.dependency-evaluation`, at `warning`), 2 `recommended`. Nine are `nonExemptible` —
  exactly the rules whose qualifier is internal to the prohibition.
- **The `forbidden` level is now in use.** It has been defined since 1.0.0 and used by nothing.
- **Multi-source inventory.** Standards may derive from more than one reviewed source document. Each
  source declares an extraction mode; each entry names its source. `reviewed-sections` is for a
  document with no numbered items: an entry names the headings it realizes, and
  `scripts/fidelity.mjs` verifies its quotes against the text of *those sections* rather than the
  whole file. A section may be claimed by one standard only, unless the entry sets `sharedSections`.

### Added — detectors

Five, each declaring in its doc comment which source view it scans and why — enforced by a test,
because the use/mention defect was fixed four times by narrowing which *files* are read and each fix
was insufficient.

| Rule | View | Covers |
| --- | --- | --- |
| `scm.no-committed-env-files` | filename only | `.env` and variants; example/template/sample/vault permitted |
| `security.no-secrets-in-artifacts` | `sourceOf` for code, raw text for config, never Markdown | Private-key headers and provider token prefixes. Excludes `.env` — one defect, one finding |
| `errors.no-swallowed-exceptions` | `structureOf` **and** raw | A catch empty under both readings: no handling code and no justification comment |
| `security.no-cert-bypass` | `structureOf` | `rejectUnauthorized: false` and its equivalents; a mention in a string or comment is not a bypass |
| `security.no-sql-concat` | `sourceOf` | A full SQL statement interpolated into a template literal or f-string |

### Changed

- **`security.no-secrets-in-artifacts` moved from review-required to evaluated.**
- **The verdict.** `NOT_EVALUATED` has a new trigger and, from that trigger, exits 1. The engine
  change sits after the `NON_COMPLIANT` and `COMPLIANT_WITH_EXCEPTIONS` determinations so it cannot
  intercept the exception machinery, and both boundaries are tested.
- `test/audit.test.mjs`'s anchor test now resolves each `standardRef` against the file it names,
  rather than checking every anchor against Standard 44.
- The plan-breakdown detector tests content rather than presence (see below).

### Completion report

The source prompt asks for one at completion.

| | |
| --- | --- |
| **Prohibitions introduced** | 26 rules across 9 standards, plus `security.no-secrets-in-artifacts` newly evaluated |
| **Reused, not duplicated** | Secrets → [16](standards/16-security.md) R2 · destructive defaults → [2](standards/02-propose-vs-execute.md) R3 · scope → [10](standards/10-scope-change-management.md) R1 · contracts → [15](standards/15-ai-tool-contracts.md) · UI logic → [1](standards/01-human-and-ai-operability.md) R1 · stubs → [38](standards/38-definition-of-done.md) R5 · hidden skips → [30](standards/30-compliance-scoring.md) R3 and [28](standards/28-github-actions.md) R5 · duplicate-on-retry → [13](standards/13-idempotency.md). The full map is Standard 45 R4 |
| **Automated** | 2 fully (`scm.no-committed-env-files` structural; `quality.unfinished-work` already) |
| **Partial** | 3 code-analysis (`security.no-secrets-in-artifacts`, `errors.no-swallowed-exceptions`, `security.no-cert-bypass`, `security.no-sql-concat` — four detectors, all `partial`) |
| **Review-required** | 19 `manual-review` rules. Each standard states why, and none claims a weak detector instead |
| **Exceptions** | Defined per rule with conditions, justification, evidence, approval, and revisit conditions. Non-exemptible where the qualifier is internal: `meta.standards-not-weakened`, `testing.no-weakening-to-pass`, `testing.no-fabricated-results`, `errors.no-false-success`, `data.no-silent-discard`, `data.no-audit-corruption`, `security.no-disabled-access-controls`, `ai.no-fabricated-capabilities`, `ai.no-safety-bypass` |
| **Tests added** | 143 total, up from 125. Positive and negative fixtures per detector; all four rows of the verdict semantics table; both exception-precedence boundaries; a required-level negative control; every mutation plant caught |
| **Validation result** | Full gate green. `validate` reports `NOT_EVALUATED` on this repository — see below |
| **Remaining blind spots** | Git-history detection (test removal, coverage regression, history rewriting — each needs a previous state to compare against) · entropy secret scanning (brittle) · dynamic-evaluation detection (finding the call says nothing about the qualifiers) · destructive-command detection (`DROP TABLE` and `rm -rf` appear legitimately in migrations, teardown, and build scripts) |

### Dogfooded — this repository reports `NOT_EVALUATED` on itself

Eight prohibitions have no subject here and are declared not-applicable against repository evidence:
no database or migrations, no user data, no audit store, no production data, no authentication or
authorization anywhere in `scripts/`, no dynamic evaluation, no retry logic, no concurrency.

Eleven remain unestablished, and they are the ones about this framework's own development — whether
a standard was weakened to let an implementation pass, whether a test was altered instead of a defect
fixed, whether a capability was described without being checked. Those need a human review recorded
as an attestation. An agent writing them would be manufacturing the evidence its own work needs to
pass, which is the failure [Standard 53](standards/53-ai-engineering-honesty.md) R5 names.

`architecture.no-hidden-global-state` is deliberately **not** declared not-applicable:
`scripts/standards.mjs` holds module-level mutable state, so the rule has a real subject, and
declaring it away because the process is short-lived would be the self-exemption
[Standard 34](standards/34-dogfooding.md) R3 prohibits.

**The verdict is honest and the exit code is 1.** That is the mechanism working on its author.

### Also in this release

Work that landed before the must-never layer and is folded in here rather than cut separately.

- **`templates/AGENTS.md`, `templates/CLAUDE.md`, and `templates/copilot-instructions.md`** — all
  three agent bootstrap templates [Standard 17](standards/17-agent-instruction-files.md) R1 names.
  `AGENTS.md` carries R3's load sequence in order; the other two defer to it and hold only what is
  specific to their own agent, so the three files cannot drift into competing definitions.
- **`standards init` writes all three**, completing the seven artifacts
  [Standard 33](standards/33-bootstrap-experience.md) R1 names.
- Tests enforcing R2 mechanically: each template must be shorter than the standard it routes to,
  each secondary file shorter than `AGENTS.md` and free of the load sequence, every template `init`
  names must exist, and a template must exist for every file R1's verbatim list names — that last
  check is what named the missing third template rather than leaving it to be noticed.
- The defer check reads the templates **with comments stripped**. It had been passing on a mention
  of `AGENTS.md` inside an explanatory comment — the part an adopter deletes on the way in — so a
  template whose body had stopped deferring would still have passed.
- **[Standard 44](standards/44-existing-project-reconstruction.md) R11** — tool-generated scaffolding
  is never evidence about the project, the consuming-side mirror of Standard 33 R7. `standards init`
  creates the plan directory *empty* in reconstruction mode, so a reconstruction that tests for the
  presence of that directory reads the tool's own output as proof a plan exists and refuses to run at
  exactly the moment it was needed.
- **[Standard 44](standards/44-existing-project-reconstruction.md) R12 — the validated-search
  invariant**, named so other standards can cite it: *a negative discovery result is evidence about
  the search mechanism before it is evidence about the project.* `UNKNOWN` requires the failed search
  to be recorded, and labels are one-way ratchets: `INFERRED` never becomes `OBSERVED` silently.
  Cross-referenced from Standards 24 and 29, which are the same idea for validators and for tests.
- **R9 provenance fields** — `confirmedBy` / `confirmedAt` / `question` / `reference`, deliberately
  the same shape as attestation provenance and deliberately not the same mechanism: a reconstruction
  confirmation is evidence about the *project*, an attestation is evidence about *rule compliance*.
- **`undated-owner-confirmation`** — a `CONFIRMED_BY_OWNER` label with no `(YYYY-MM-DD)` in
  `open-questions.md`. An answer whose age is unknown cannot be reassessed when the product changes.

### Fixed

- **The plan-breakdown detector tested presence, not content.** A `00-overview.md` holding nothing
  but headings satisfied it — the same defect `hasContent()` fixed inside `init`, one level up where
  nothing was left to catch it. It now reports an overview with no line outside its headings, and
  says plainly in Standard 44's `## Implementation` where that check stops.
- **`design/standards-audit-cli.md` claimed the audit was unimplemented.** It opened with "Nothing
  described here is implemented" while `scripts/standards.mjs` had shipped all sixteen of its finding
  categories since 1.0.0 — a Standard 32 R3 defect in the framework's own design record. Reframed as
  the implemented contract, with a table of the three places implementation went past the design.
- **`security.no-sql-concat` reported this repository on its first run.** The first version matched a
  bare `SELECT`, `WHERE`, or `ORDER BY`, and flagged `const where = ` in `scripts/catalog.mjs` — an
  ordinary variable named `where`. It now requires a full statement shape, and Standard 50 R3 records
  the episode: the brittle-check prohibition catching a check written under it, one commit later.

### Added

- **`templates/AGENTS.md`, `templates/CLAUDE.md`, and `templates/copilot-instructions.md`** — all
  three agent bootstrap templates [Standard 17](standards/17-agent-instruction-files.md) R1 names.
  `AGENTS.md` carries R3's load sequence in order; the other two defer to it and hold only what is
  specific to their own agent, so the three files cannot drift into competing definitions.
- **`standards init` writes all three**, completing the seven artifacts
  [Standard 33](standards/33-bootstrap-experience.md) R1 names.
- Tests enforcing R2 mechanically: each template must be shorter than the standard it routes to,
  each secondary file shorter than `AGENTS.md` and free of the load sequence, every template `init`
  names must exist, and a template must exist for every file R1's verbatim list names — that last
  check is what named the missing third template rather than leaving it to be noticed.
- The defer check reads the templates **with comments stripped**. It had been passing on a mention
  of `AGENTS.md` inside an explanatory comment — the part an adopter deletes on the way in — so a
  template whose body had stopped deferring would still have passed.
- **[Standard 44](standards/44-existing-project-reconstruction.md) R11** — tool-generated scaffolding
  is never evidence about the project, the consuming-side mirror of Standard 33 R7. `standards init`
  creates the plan directory *empty* in reconstruction mode, so a reconstruction that tests for the
  presence of that directory reads the tool's own output as proof a plan exists and refuses to run at
  exactly the moment it was needed.
- **[Standard 44](standards/44-existing-project-reconstruction.md) R12 — the validated-search
  invariant**, named so other standards can cite it: *a negative discovery result is evidence about
  the search mechanism before it is evidence about the project.* `UNKNOWN` requires the failed search
  to be recorded, and labels are one-way ratchets: `INFERRED` never becomes `OBSERVED` silently.
  Cross-referenced from Standards 24 and 29, which are the same idea for validators and for tests.
- **R9 provenance fields** — `confirmedBy` / `confirmedAt` / `question` / `reference`, deliberately
  the same shape as attestation provenance and deliberately not the same mechanism: a reconstruction
  confirmation is evidence about the *project*, an attestation is evidence about *rule compliance*.

### Fixed

- **The plan-breakdown detector tested presence, not content.** A `00-overview.md` holding nothing
  but headings satisfied it — the same defect `hasContent()` fixed inside `init`, one level up where
  nothing was left to catch it. It now reports an overview with no line outside its headings, and
  says plainly in Standard 44's `## Implementation` where that check stops: whether prose that *is*
  there is a real plan or an untouched template is a judgement, and no scan makes it.
- **`design/standards-audit-cli.md` claimed the audit was unimplemented.** It opened with "Nothing
  described here is implemented" while `scripts/standards.mjs` had shipped all sixteen of its finding
  categories since 1.0.0 — a Standard 32 R3 defect in the framework's own design record. Reframed as
  the implemented contract, with a table of the three places implementation went past the design.

### Added — audit

- **`undated-owner-confirmation`** — a `CONFIRMED_BY_OWNER` label with no `(YYYY-MM-DD)` in
  `open-questions.md`. An answer whose age is unknown cannot be reassessed when the product changes.
  Scoped to that one document on purpose; Standard 44 records what the check does not cover.

### Dogfooded

**Attestation staleness fired for real, on its first opportunity.** Adding the two artifacts to
`init` changed `scripts/init.mjs`, one of the paths `ai.destructive-approval` was reviewed against.
The digest stopped matching, the attestation went stale, and the rule returned to `not-evaluated` —
dropping the run from 13 passed to 12 until a human looked again. It was renewed with a new digest
and a note on what changed, not silently refreshed. This is the mechanism working: the alternative
is an attestation that keeps asserting a review of code nobody reviewed.

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

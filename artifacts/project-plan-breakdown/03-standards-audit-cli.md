# 03 — The `standards audit` command

A command that reads a repository and reports where it fails the standards — missing planning
artifacts, undocumented capabilities, plan/code discrepancies, unresolved reconstruction questions,
and outright standards violations — in both human-readable and JSON form.

The design is complete and committed at
[`design/standards-audit-cli.md`](../../design/standards-audit-cli.md). It was written before any
code existed, by intent: the source specification for Standard 44 says the audit "does not need to be
fully implemented in v1, but design for it." Designing first is what allowed the artifacts Standard
44 mandates to be shaped for machine reading before any tool existed — the `**Status:** open` line in
the open-questions template exists solely so this audit can find unresolved questions with a grep.

Read the design document before changing the audit. This section covers the work; it does not restate
the finding categories, the JSON schema, or the detection sources, all of which live there.

> **Status note (2026-08-11).** This section's preamble previously said *"Nothing is implemented, by
> intent."* That was true when written and is now false — `scripts/standards.mjs` implements all
> sixteen finding categories. The same stale claim in `design/standards-audit-cli.md` was corrected
> at `9061c0e` as a Standard 32 R3 defect; this one was missed then and is corrected now. Two further
> things have changed since this section was written, both covered elsewhere rather than here: the
> command was split into `audit` (evidence) and `validate` (verdict) by
> [ADR 0004](../adr/0004-audit-and-validate-are-separate-commands.md), and finding categories were
> bound to canonical rule identities by
> [ADR 0002](../adr/0002-canonical-rule-identity.md). The verdict engine those decisions produced is
> covered in [`04-compliance-and-policy-system.md`](04-compliance-and-policy-system.md), not here —
> this section remains the record of the evidence-gathering command only.

> **Vocabulary note (2026-08-08).** This section was written before
> [ADR 0001](../adr/0001-canonical-status-vocabulary.md) made Standard 8's vocabulary canonical.
> References below to `tracked as <backlog-id>` as a *status value* describe the form that was in use
> at the time and is now abolished — a reference to another system is not a status, and lives in a
> separate `Tracked by` field. The delegation trap the section describes is unchanged and still
> guarded; only the spelling moved. The historical record is left as written rather than rewritten.

## Decisions already made

Both of this section's open questions are now answered in the design document. Read them there before
writing code; they are summarized here only so this file is not misleading.

**The implementation is a single dependency-free Node ESM file, `scripts/standards.mjs`, in this
repository**, distributed via an npm `bin` entry so `standards audit .` works verbatim, and also
runnable as `node scripts/standards.mjs audit .` with nothing installed.

**The audit neither absorbs nor shells out to the backlog tooling.** It reads
`artifacts/backlog/items/<id>.md` frontmatter directly to resolve a `tracked as <backlog-id>`
reference, and does nothing else with the backlog. Validating a backlog stays `backlog-validate`'s
job; reconciling it against git stays `backlog-reconcile`'s.

---

### Decide the implementation language and distribution

- **Status:** COMPLETE — 2026-08-08, recorded in
  [`design/standards-audit-cli.md`](../../design/standards-audit-cli.md) under *Implementation and
  distribution*
- **Evidence:** [`design/standards-audit-cli.md`](../../design/standards-audit-cli.md) under
  *Implementation and distribution*; the decision is realised in
  [`package.json`](../../package.json)'s `bin` entry and in
  [`scripts/standards.mjs`](../../scripts/standards.mjs). The zero-dependency half is enforced rather
  than remembered: CI has no install step, so a third-party import fails the build.
- **Purpose:** Every later item depends on it, and the decision was genuinely open — this repository
  has no runtime, no package manifest, and no build.
- **Deliverables:** the decision recorded in `design/standards-audit-cli.md` under a new heading, with
  its reasoning and the rejected alternatives; and the previously open question about the backlog
  tooling resolved in the same document.
- **Acceptance Criteria:** the document names the language, how the command is installed, and how it
  is invoked as `standards audit .` rather than as a path to a script. No section of the document
  still describes an undecided question.
- **Verification:**
  ```bash
  grep -c "Implementation and distribution" design/standards-audit-cli.md   # → 1
  grep -A2 "^## Open design questions" design/standards-audit-cli.md        # → "None."
  ```
  Both confirmed.
- **Dependencies:** none.
- **What the decision rests on:** the two sibling tools were read rather than remembered.
  `backlog.mjs` is 509 lines and `reconcile.mjs` is 292, both importing only `node:fs/promises`,
  `node:fs`, `node:path`, and (in reconcile) `node:child_process`, with `process.argv` parsed by hand.
  Zero third-party dependencies between them. Matching that shape was the decision; a compiled binary
  and Python were the rejected alternatives.
- **The one deliberate departure:** the script lives in this repository at `scripts/standards.mjs`,
  not inside a skill as the backlog tools do. The backlog scripts are their skills' helpers; the audit
  is this repository's own product, and it needs version history and review that the global skills do
  not have. A tool that tells you your repository is non-compliant must be able to answer *when did
  that rule change*.

### Implement the descriptive finding categories

- **Status:** COMPLETE — 2026-08-08, `scripts/standards.mjs` and `package.json`
- **Evidence:** the six detectors in [`scripts/standards.mjs`](../../scripts/standards.mjs), with
  their negative-case fixtures under `test/fixtures/`. The two regressions that motivated them —
  import-shape matching and the code-extensions-only scan — are locked in by named tests, and both
  were mutation-tested rather than trusted (see the notes on the CI item below).
- **Purpose:** The six `info` categories — observed architecture, and detected capabilities, APIs,
  jobs, integrations, and AI interfaces — report what a repository *has*. They are the foundation the
  judgemental categories build on, and they are useful alone as a repository survey.
- **Deliverables:** detection for those six categories, emitting findings in the schema the design
  specifies.
- **Acceptance Criteria:**
  - Running the command against this repository and at least one repository with actual application
    code produces findings in both cases without crashing.
  - Every finding carries a `severity` of `info` and an evidence-label of `OBSERVED` or `INFERRED`.
  - Heuristic detections are labeled `INFERRED`, never `OBSERVED`. Reporting a guess as an
    observation is the same fabrication error Standard 44's R2 prohibits, and an audit that commits
    it is worse than no audit.
- **Verification:** `standards audit . --json` emits parseable JSON whose every finding has the six
  required fields, and no finding in these six categories carries `OBSERVED` for a heuristic result.
  All confirmed against this repository and against `F:\Repos\AgentRelay` (220 files): 6 findings,
  all seven schema fields present, all `severity: "info"`, labels only `OBSERVED`/`INFERRED`, and all
  three heuristic findings labeled `INFERRED`. Exit codes verified: `1` for no subcommand, an unknown
  subcommand, and a missing directory; `0` for `--help` and for a successful audit.
- **Dependencies:** the language decision above.
- **The bug worth remembering: the audit detected itself.** The first working run reported this
  repository as integrating with AWS, Azure, Stripe, Twilio, Slack, GitHub, four databases, and seven
  AI providers. All false. `scripts/standards.mjs` contains the package names it searches for, so
  scanning its own source matched every pattern it knows. Two fixes, both kept: the script excludes
  its own file from the content scan, and SDK detection now requires an **import-shaped** match — a
  JS/TS `import`/`require`, a Python `import`, or a C# `using` — rather than a bare mention anywhere
  in a file. The general lesson is that a bare substring match reports any file that *names* a
  technology as *using* it, which for a tool that reads documentation-heavy repositories is a
  constant false-positive source. After the fix the same repository reports no integrations and no AI
  SDK usage, which is correct, and `F:\Repos\AgentRelay` correctly reports OpenAI in the four files
  of its `openai-reviewer` package.
- **Known limitation, deliberately not fixed:** detection is pattern-based and language-agnostic, so
  it will miss frameworks whose conventions are not in the pattern lists, and it reads at most 400KB
  of any single file and 20,000 files per repository. Evidence lists are capped at 12 paths, and the
  message states the true total whenever entries are omitted, so a cap is never silent.

### Implement the absence and discrepancy categories

- **Status:** COMPLETE — 2026-08-08, `scripts/standards.mjs`
- **Evidence:** [`scripts/standards.mjs`](../../scripts/standards.mjs); the `delegated` fixture,
  whose `ST-999` reference is the standing guard for the delegated-liveness trap described at the end
  of this item. Findings' `standardRef` anchors are checked against the referenced file by
  `test/audit.test.mjs`, generalised at `d13431d` to resolve against any standard rather than only
  Standard 44. **Open defects against this item:** issues
  [#4](https://github.com/mikeycdavis/EngineeringStandards/issues/4),
  [#5](https://github.com/mikeycdavis/EngineeringStandards/issues/5) and
  [#7](https://github.com/mikeycdavis/EngineeringStandards/issues/7), owned by
  [`08-open-defects-and-deferred-tracks.md`](08-open-defects-and-deferred-tracks.md). They do not
  reopen this item — the categories are implemented and the fixtures hold — but the item is not a
  claim that the implementation is defect-free.
- **Purpose:** These are the categories with teeth — missing documentation, missing planning
  artifacts, missing audit infrastructure, unverified functionality, potential dead code, potential
  unfinished features, plan/code discrepancies, documentation/code discrepancies, open reconstruction
  questions, and standards violations.
- **Deliverables:** detection for those ten categories.
- **Acceptance Criteria:**
  - `open-reconstruction-questions` matches the exact string `**Status:** open` in
    `artifacts/project-baseline/open-questions.md`. That format is a contract with the
    `project-reconstruction` skill's `questions-template.md`; changing either without the other
    silently breaks detection.
  - `plan-code-discrepancies` resolves a plan item whose `Status` is `tracked as <backlog-id>` through
    the referenced backlog item before judging it, and reports an id that resolves to nothing as a
    finding in its own right.
  - Every finding's `standardRef` points at a requirement anchor that exists in the referenced file.
- **Verification:** run against a repository with a seeded backlog where every plan item is
  `tracked as <id>`, and confirm the run reports real findings rather than zero. Done: a fixture in
  which *every* item is `tracked as <id>` produced 4 errors and 4 warnings, including the two cases
  that matter — an item resolved through its backlog item to `done` whose named deliverable does not
  exist, and an item pointing at `ST-999`, which exists nowhere. A naive implementation returns zero
  on this fixture. All 27 `standardRef` values across three repositories were checked against the
  actual headings in the standard: none dangle.
- **Dependencies:** the descriptive categories above.
- **Second false positive, same root cause as the first.** The audit flagged
  `design/standards-audit-cli.md` for unfinished work, because that document *names* the `TODO`,
  `FIXME`, and `NotImplemented` markers the detector searches for. Prose that describes a code signal
  is not an instance of it. Fixed by restricting the unfinished-work scan to code extensions;
  Markdown is excluded, since a TODO in a document is a note rather than an unfinished code path. The
  general rule now applied twice: **a content scan for a code signal must only read code.**
- **The trap, stated plainly:** a naive `plan-code-discrepancies` implementation checks for plan items
  marked `done` whose deliverables are absent. Under the delegated-liveness convention Standard 44
  defines, a repository that has adopted the backlog skill has **no** plan item marked `done` — they
  are all `tracked as <id>`. Such an implementation returns zero findings on precisely the
  repositories that follow the standard most completely, and reports a clean bill of health it never
  actually checked.

### Close the delegated-reference integrity gap

- **Status:** COMPLETE — 2026-08-08, delivered as part of the discrepancy categories above
- **Evidence:** the `ST-999` item in `test/fixtures/delegated/`, which produces exactly one
  `plan-code-discrepancies` finding at severity `error`, labelled `OBSERVED`, whose `standardRef` is
  `standards/44-existing-project-reconstruction.md#r7--reconstructed-plan-and-plan-items`. The check
  resolves `Tracked by` through a hardcoded `artifacts/backlog/items/<ID>.md` path — issue
  [#5](https://github.com/mikeycdavis/EngineeringStandards/issues/5) — which is a coupling defect,
  not a hole in the integrity check itself.
- **Purpose:** Standard 44 requires that every `tracked as <backlog-id>` reference resolve to an item
  that exists, because a dangling one presents untracked work as tracked. **No tool checks this
  today.** `backlog-validate` validates backlog items against each other and has no knowledge of plan
  files, so the reference is currently verified only by hand.
- **Deliverables:** the check, as part of `standards-violations` or `plan-code-discrepancies`.
- **Acceptance Criteria:** a plan item referencing a backlog id that does not exist produces a finding
  whose `standardRef` points at Standard 44's R7.
- **Verification:** construct a fixture with one plan item pointing at a nonexistent id; the audit
  reports exactly one finding for it. Done — the fixture's `ST-999` item produces exactly one
  `plan-code-discrepancies` finding at severity `error`, labeled `OBSERVED`, whose `standardRef` is
  `standards/44-existing-project-reconstruction.md#r7--reconstructed-plan-and-plan-items`.
- **Dependencies:** the discrepancy categories above.
- **Do not implement this inside `backlog-validate`.** That script owns the backlog directory; giving
  it a second responsibility for files outside that directory couples two things that are otherwise
  independent, and it would then need to know about plan formats it has no other reason to parse.

### Give the audit a test suite and CI

- **Status:** COMPLETE — 2026-08-08, `test/` and `.github/workflows/ci.yml`
- **Evidence:** `test/` and [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). The suite
  was 20 tests over four fixtures when this item closed; it is **229 tests** as of 2026-08-11, over
  the fixtures `compliant`, `delegated`, `diagrams`, `markers`, `naming-only`, `never-clean`,
  `never-violations`, and `policies`. The self-audit gate in `test/audit.test.mjs` still asserts zero
  error-severity findings against this repository, and now passes with zero warnings as well. The CI
  side of this item was superseded in scope by
  [`07-distributed-validation-and-ci.md`](07-distributed-validation-and-ci.md), which covers the
  required/advisory job split and the reusable check; the `npm test` gate this item created is
  unchanged and still the required check.
- **Purpose:** The audit was run against its own repository and reported *no test suite and no CI
  configuration*. That finding is correct. A tool whose output is "your repository is non-compliant"
  has no standing to report that while being unverified itself, and two false positives have already
  shipped in it — both caught by hand, neither by a test.
- **Deliverables:** a fixture-based test suite exercising each implemented category, a `test` script
  in `package.json`, and a CI workflow that runs it.
- **Acceptance Criteria:**
  - Every implemented finding category has at least one fixture that provokes it and one that must
    *not* provoke it — the second is what catches the false positives this tool keeps producing.
  - The two known false positives are locked in as regression tests: a file naming an SDK without
    importing it must not produce `detected-integrations`, and a Markdown file naming `TODO` must not
    produce `potential-unfinished-features`.
  - A fixture where every plan item is `tracked as <id>` must produce findings, permanently guarding
    the delegated-liveness trap.
  - Running the audit against this repository must report no `error`-severity findings.
- **Verification:** `npm test` exits 0 with every fixture asserted, and the CI workflow runs it on
  push. Done: 20 tests over four committed fixtures, using `node:test` so the zero-dependency rule
  holds. The fixtures are `test/fixtures/{compliant,delegated,naming-only,markers}`.
- **Dependencies:** the implemented categories above. This item was created by the audit's own output
  on 2026-08-08, not planned in advance.
- **The suite was mutation-tested rather than trusted.** Reverting the import-shape check to the bare
  substring match that caused the first false positive fails exactly one test — the one written to
  catch it — and no others. A regression guard that has never been seen to fail is an assumption, not
  a guard.
- **A third false positive, found by running the audit on the repository after adding the tests.**
  `test/audit.test.mjs` was flagged for unfinished work because its test *names* contain the word
  TODO. Fixed by requiring the punctuation a real marker carries — `TODO:` or `TODO(owner)` — which
  is a genuine precision improvement rather than an exclusion. Verified not to over-correct: the
  `markers` fixture's real `// TODO: finish this properly` is still caught. That makes three
  false positives of the same family, all fixed by the same rule: **match the shape of the thing, not
  its name.**
- **CI deliberately does not run `--strict`.** That flag fails on warnings, which would turn every
  advisory finding into a broken build, and the predictable outcome is that someone disables the
  step. The error-level gate is instead the assertion in `test/audit.test.mjs` that this repository
  has no error-severity findings, which runs as part of `npm test`.
- **~~One warning is left open deliberately:~~ closed 2026-08-08.** This repository had no
  `docs/architecture.md`. It was a real finding, not a false positive, and was left for the owner to
  close with `/codebase-docs` rather than hand-written here. It was closed at `a30b870`, which also
  established Mermaid as the canonical diagram source
  ([ADR 0003](../adr/0003-mermaid-is-the-canonical-diagram-source.md)) and added `npm run diagrams`
  so `docs/architecture.mmd` and the fences embedded in `docs/architecture.md` cannot drift apart.
  The self-audit now reports **zero error findings and zero warning findings**, so the assertion in
  `test/audit.test.mjs` is no longer the only thing holding the line — there is nothing left for it
  to tolerate.

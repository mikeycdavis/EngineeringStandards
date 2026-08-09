# 03 — The `standards audit` command

A command that reads a repository and reports where it fails the standards — missing planning
artifacts, undocumented capabilities, plan/code discrepancies, unresolved reconstruction questions,
and outright standards violations — in both human-readable and JSON form.

The design is complete and committed at
[`design/standards-audit-cli.md`](../../design/standards-audit-cli.md). Nothing is implemented, by
intent: the source specification for Standard 44 says the audit "does not need to be fully
implemented in v1, but design for it." Designing first is what allowed the artifacts Standard 44
mandates to be shaped for machine reading before any tool existed — the `**Status:** open` line in
the open-questions template exists solely so this audit can find unresolved questions with a grep.

Read the design document before implementing. This section covers the work; it does not restate the
finding categories, the JSON schema, or the detection sources, all of which live there.

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

- **Status:** done — 2026-08-08, recorded in
  [`design/standards-audit-cli.md`](../../design/standards-audit-cli.md) under *Implementation and
  distribution*
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

- **Status:** not started
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
- **Dependencies:** the language decision above.

### Implement the absence and discrepancy categories

- **Status:** not started
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
  `tracked as <id>`, and confirm the run reports real findings rather than zero.
- **Dependencies:** the descriptive categories above.
- **The trap, stated plainly:** a naive `plan-code-discrepancies` implementation checks for plan items
  marked `done` whose deliverables are absent. Under the delegated-liveness convention Standard 44
  defines, a repository that has adopted the backlog skill has **no** plan item marked `done` — they
  are all `tracked as <id>`. Such an implementation returns zero findings on precisely the
  repositories that follow the standard most completely, and reports a clean bill of health it never
  actually checked.

### Close the delegated-reference integrity gap

- **Status:** not started
- **Purpose:** Standard 44 requires that every `tracked as <backlog-id>` reference resolve to an item
  that exists, because a dangling one presents untracked work as tracked. **No tool checks this
  today.** `backlog-validate` validates backlog items against each other and has no knowledge of plan
  files, so the reference is currently verified only by hand.
- **Deliverables:** the check, as part of `standards-violations` or `plan-code-discrepancies`.
- **Acceptance Criteria:** a plan item referencing a backlog id that does not exist produces a finding
  whose `standardRef` points at Standard 44's R7.
- **Verification:** construct a fixture with one plan item pointing at a nonexistent id; the audit
  reports exactly one finding for it. Delete a referenced backlog item in a real repository and
  confirm the next run catches it.
- **Dependencies:** the discrepancy categories above.
- **Do not implement this inside `backlog-validate`.** That script owns the backlog directory; giving
  it a second responsibility for files outside that directory couples two things that are otherwise
  independent, and it would then need to know about plan formats it has no other reason to parse.

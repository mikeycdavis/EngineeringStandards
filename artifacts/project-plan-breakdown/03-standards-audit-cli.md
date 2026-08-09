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

## Before starting, resolve this

The design records one deliberately open question, and it should be answered with the then-current
state of the scripts in view rather than now: **does the audit absorb the existing backlog tooling,
or shell out to it?**

`~/.claude/skills/backlog-validate/scripts/backlog.mjs --check` already validates backlog items and
detects a stale tracker. `~/.claude/skills/backlog-reconcile/scripts/reconcile.mjs --json` already
compares a backlog against git history. Both overlap the `standards-violations` and
`plan-code-discrepancies` categories. Absorbing them yields one binary and one report; shelling out
avoids duplicating logic that would then drift. Neither is obviously right, and the answer may have
changed by the time this is built.

---

### Decide the implementation language and distribution

- **Status:** not started
- **Purpose:** Every later item depends on it, and the decision is genuinely open — this repository
  currently has no runtime, no package manifest, and no build.
- **Deliverables:** the decision recorded in `design/standards-audit-cli.md` under a new heading, with
  its reasoning and the rejected alternative.
- **Acceptance Criteria:** the document names the language, how the command is installed, and how it
  is invoked as `standards audit .` rather than as a path to a script.
- **Verification:** the design document contains the decision and it does not read as a list of
  options. A reader must be able to act on it without choosing.
- **Dependencies:** none.
- **Note, not a decision:** the existing backlog scripts are dependency-free Node ESM `.mjs` files
  that locate the project root by walking up for `.git` or `package.json`, and they work in any
  repository without installation. Matching that shape would make the audit behave like tooling the
  owner already uses. Weigh it; do not treat it as settled.

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

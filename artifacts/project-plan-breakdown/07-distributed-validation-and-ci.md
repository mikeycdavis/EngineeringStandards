# 07 — Distributed validation, adoption, and this repository's own gate

**Added 2026-08-11**, covering work merged between 2026-08-08 and 2026-08-11.

A verdict that only runs in the repository that defines it governs one repository. This section covers
getting it into the others: the adoption path (`standards init`, `INSTRUCTIONS.md`, the generated
agent operating rules), the reusable CI check that carries the verdict to any repository that calls
it, and the arrangement of this repository's own gate — which had to be designed carefully, because
this repository's honest verdict is `NON_COMPLIANT` and a gate that requires `COMPLIANT` would force
someone to lie to make the build go green.

---

### Write the adoption guide

- **Status:** COMPLETE — 2026-08-08, commit `66d43b5`
- **Evidence:** [`INSTRUCTIONS.md`](../../INSTRUCTIONS.md), including the *Upgrading from 1.x to 2.0*
  migration section added at `0dfe27c`. Its internal links are checked by `npm test`.
- **Purpose:** The framework is useless to a project that cannot work out how to adopt it, and the
  53 standards are far too much to read before starting. The guide is the entry point; it
  deliberately does not restate the standards.
- **Deliverables:** the adoption guide, and a migration section stating what a 1.x project sees on
  upgrading.
- **Acceptance Criteria:**
  - The migration section states that `validate` may newly fail **or cap at `NOT_EVALUATED` with no
    code change** on the adopter's side, names the four resolution paths in order, and states what
    did *not* change — the policy schema still accepts a 1.x file, rule ids are stable, and exit-code
    meanings are unchanged except for the new `NOT_EVALUATED` trigger.
  - The guide states that an agent should not read all 53 standards before starting work; it should
    read the policy.
  - Framework coverage is disclosed as a limitation rather than buried: the catalog covers 50 rules
    across 23 of 53 standards, and rules outside it are `not-evaluated` rather than passing.
- **Verification:** `npm test`; `grep -n "1.x to 2.0" INSTRUCTIONS.md`.
- **Dependencies:** the compliance system in [`04`](04-compliance-and-policy-system.md).

### Ship `standards init` as the bootstrap path

- **Status:** COMPLETE — 2026-08-09, commit `4506886`
- **Evidence:** [`scripts/init.mjs`](../../scripts/init.mjs), [`templates/`](../../templates),
  `test/init.test.mjs`. The `reconstruction-scaffold` fixture asserts that an empty
  `artifacts/project-plan-breakdown/` does not read as a pre-existing plan.
- **Purpose:** Give a project a policy, the artifacts the standards expect, and a routed next step,
  without requiring it to hand-assemble them.
- **Deliverables:** the command, the templates, `--dry-run --json`, and the `nextStep` routing that
  sends a project with existing implementation to reconstruction rather than to greenfield setup.
- **Acceptance Criteria:**
  - `init` stamps the framework version it actually is, rather than trusting whatever the template
    says (`9c15b3b`). A template carrying a stale version would make every adopting project claim a
    version that did not produce its policy.
  - **Content, not presence.** `hasContent()` exists because an existence check reads `init`'s own
    scaffolding as evidence of project intent — the defect that motivated Standard 44 R11. An empty
    directory is not a plan and an untouched template is not a manifest.
  - A directory `init` created is never reconstruction evidence.
- **Verification:** `npm test`; `node scripts/standards.mjs init --dry-run --json` on the scaffold
  fixture reports `reconstruction-required`. Mutation: adding real content to the fixture's plan
  directory flips that assertion.
- **Dependencies:** the policy mechanism in [`04`](04-compliance-and-policy-system.md).
- **Open defects against the adoption path.** Two, both claimed by the item at the end of this
  section rather than left unowned: `init` misclassifies implemented monorepos as greenfield
  ([#2](https://github.com/mikeycdavis/EngineeringStandards/issues/2)), and `--mode` is missing from
  `--help` ([#9](https://github.com/mikeycdavis/EngineeringStandards/issues/9)).

### Generate the agent operating rules rather than authoring them

- **Status:** COMPLETE — 2026-08-10, commits `e3c4866`, `3a88dd0`, `e74bd38`
- **Evidence:** [ADR 0012](../adr/0012-agent-operating-rules-are-generated-not-authored.md);
  [`scripts/agent-instructions.mjs`](../../scripts/agent-instructions.mjs); the three templates under
  [`templates/`](../../templates).
- **Purpose:** An agent's operating rules restate what the policy says. Hand-authored, they are a
  second copy that drifts — and a drifted copy of the rules is worse than none, because an agent
  follows it confidently. Generating them from the policy makes drift impossible rather than
  merely detectable.
- **Deliverables:** generation from the policy at `init` time, and the templates it fills.
- **Acceptance Criteria:**
  - The generated rules derive from the catalog and policy. No rule text is authored in the template
    that the policy does not already carry.
  - Generation moved *into* `init`, which is what made `ai.destructive-approval` re-attestable
    against a coherent record (`6d0f61d`).
- **Verification:** `npm test`; the generated files are byte-reproducible from the same policy.
- **Dependencies:** `init` above.

### Distribute the verdict as a reusable workflow

- **Status:** COMPLETE — 2026-08-10, commit `2b8a973`
- **Evidence:** [`.github/workflows/standards-validate.yml`](../../.github/workflows/standards-validate.yml);
  [ADR 0013](../adr/0013-the-reusable-check-distributes-the-verdict-and-nothing-else.md).
- **Purpose:** Let any repository run this framework's verdict against itself in CI by calling one
  workflow, without vendoring the framework or installing anything.
- **Deliverables:** a `workflow_call` workflow taking a `standards-ref` input, checking out the
  framework at that ref, and running `validate` against the caller's repository.
- **Acceptance Criteria:**
  - **It distributes the verdict and nothing else.** It does not run the caller's tests, lint the
    caller, or impose any policy the caller has not declared. Scope creep here would make adoption a
    negotiation rather than a call.
  - It is pinned by callers to an immutable revision, not to a branch. A reusable workflow that moves
    under its callers changes their gate without their knowing.
  - **The evaluator placement invariant holds:** the same content must evaluate identically whether
    the framework lives inside the target repository or outside it (`ed5f6e6`). This is the property
    that makes a distributed check meaningful at all — if placement changed the verdict, an adopter's
    result would not be comparable to this repository's.
- **Verification:** `.github/workflows/standards-dogfood.yml` calls it, pinned to
  `3613902` — a commit confirmed by `git merge-base --is-ancestor` to be reachable from
  `origin/develop`. The dogfood run evaluates **the revision under test, not its ancestor**
  (`2929be4`), which was a real defect: a check that validates the merge base validates the code you
  did not change.
- **Dependencies:** the verdict engine in [`04`](04-compliance-and-policy-system.md).

### Accept the reusable check on real CI infrastructure

- **Status:** COMPLETE — 2026-08-11, accepted on executed runs after the account runner capability
  was restored. Previously `BLOCKED`; that state is described below because *blocked* was the
  correct answer for as long as it held, and this item's purpose was to keep it distinguishable from
  *failed*.
- **Evidence:** on the PR #18 branch, both jobs executed and both verdicts were read from their logs
  rather than inferred from conclusions:

  | Job | Steps | Verdict |
  | --- | --- | --- |
  | `validate` — framework inside the target | 7 | `NON_COMPLIANT` · 100% · 24 passed, 4 failed, 22 skipped · 21 automated, 7 manual-review, 9 not-evaluated |
  | `validate-self / validate` — framework pinned externally | 16 | **identical on every field** |

  The required `test` job ran alongside them: `success`, 12 steps. **The two verdicts agreeing field
  for field is the evaluator placement invariant established on real CI**, which is a stronger claim
  than this item's acceptance criteria asked for — they required only that a run carry real
  information. A local two-checkout regression could never have established it, because the thing in
  question is whether *placement* changes the answer.

  **The prior blocked period, kept rather than deleted:** for six or more pushes across 2026-08-10
  and 2026-08-11, every job terminated in under five seconds with `steps: 0` and the annotation
  *"The job was not started because recent account payments have failed…"*. Those runs were never
  recorded as failures of this item, which is what made today's acceptance meaningful — had they
  been counted as reds, the restoration would have looked like a fix to code that was never broken.
- **Purpose:** Establish that the distributed check works where it is meant to work. Local evidence
  is not the same claim.
- **Deliverables:** a green-or-honestly-red run of `validate-self / validate` on the current tip,
  observed rather than inferred.
- **Acceptance Criteria:**
  - The run has a non-empty `steps` array and a plausible duration. **A job that fails in under five
    seconds with `steps: 0` carries no information about the code** — it is an infrastructure block,
    and the reason lives in the check-run *annotation*, not the log, which is why `--log-failed`
    shows nothing and the failure looks contentless.
  - A blocked run is never recorded as a failing run or as a passing one. Blocked, failed, and
    accepted are three states.
- **Verification:**
  ```bash
  gh api repos/:owner/:repo/actions/runs/<id>/jobs \
    --jq '.jobs[] | "\(.name) concl=\(.conclusion) steps=\(.steps|length)"'
  gh api repos/:owner/:repo/check-runs/<id>/annotations
  ```
  Read the annotation before diagnosing any red on this item — the step count is what separates a
  verdict from an infrastructure block, and the log is empty in the latter case.
- **Dependencies:** the reusable workflow above. Was blocked on account infrastructure, never on any
  code in this repository; restored 2026-08-11.

### Arrange this repository's gate so honesty and green can coexist

- **Status:** COMPLETE — 2026-08-11, commits `0c67cdb`, `56cbc11`, `012d525`, `3653139`
- **Evidence:** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) — job `test` (required)
  and job `validate` (advisory); [`.github/workflows/standards-dogfood.yml`](../../.github/workflows/standards-dogfood.yml)
  — job `validate-self / validate`, also advisory. Branch protection requires `test`.
- **Purpose:** This repository's honest verdict is `NON_COMPLIANT`, caused by four recorded human
  rejections. A gate that requires `COMPLIANT` would leave exactly one way to merge anything:
  declare a baseline exception over today's four failures. That would make the build green and the
  framework worthless in the same commit.
- **Deliverables:** a split gate — what **must pass** (the suite, the invariant checks, the audit's
  zero-error assertion) is required; what **must be told the truth** (`validate`) runs on every push,
  reports its real verdict, and does not block.
- **Acceptance Criteria:**
  - `validate` is never made to report `COMPLIANT` by policy edits in order to satisfy CI. The
    four rejections stay recorded and the verdict stays `NON_COMPLIANT` until the rules are actually
    satisfied.
  - The required check set is stated correctly rather than assumed (`3653139` corrected it).
  - `audit` runs without `--strict` for the reason given in [`04`](04-compliance-and-policy-system.md).
  - The advisory jobs' output is visible in the job summary, so *advisory* means *not blocking*, not
    *not read*.
- **Verification:** push a branch; `test` must be green, and `validate` plus `validate-self` must
  both report `NON_COMPLIANT` with matching counts.
- **Dependencies:** the reusable workflow above.
- **Promoting `validate-self / validate` back to a required check is a deliberately dormant
  question**, not an oversight. It cannot become required while the four rejections stand, and
  resolving it by clearing the rejections would be backwards. Recorded in
  [`08-open-defects-and-deferred-tracks.md`](08-open-defects-and-deferred-tracks.md).

### Close the adoption-path defects

- **Status:** READY
- **Tracked by:** GitHub issues
  [#2](https://github.com/mikeycdavis/EngineeringStandards/issues/2) and
  [#9](https://github.com/mikeycdavis/EngineeringStandards/issues/9)
- **Evidence:** both open as of 2026-08-11. `grep -c "\-\-mode" ` against the `--help` text returns
  0, confirming #9 directly.
- **Purpose:** Both defects break the first thing an adopting project does, which is the worst place
  to have them. **#2** — `init` classifies an implemented monorepo as greenfield, so a project with
  real code is offered greenfield scaffolding instead of being routed to reconstruction. **#9** —
  `--mode` is absent from `--help`, so the reconstruction path is unreachable without reading the
  source, which for a distributed tool means unreachable.
- **Deliverables:** monorepo-aware detection in `init`'s classification; `--mode` documented in
  `--help` with its accepted values.
- **Acceptance Criteria:**
  - For #2: a fixture monorepo with implementation under nested package directories reports
    `reconstruction-required`, and the existing greenfield and scaffold fixtures are unchanged. The
    fix must respect `hasContent()` — deeper searching, not existence checking.
  - For #9: `node scripts/standards.mjs --help` names `--mode` and its values; a test asserts that
    every flag the argument parser accepts appears in the help text, so this cannot recur silently.
  - Neither fix changes `init`'s behaviour on a repository it already classifies correctly.
- **Verification:** `npm test` with the new fixtures; `node scripts/standards.mjs --help | grep -- --mode`.
- **Dependencies:** `standards init` above.

### Establish adoption eligibility before any adoption write

- **Status:** READY
- **Tracked by:** GitHub issue [#16](https://github.com/mikeycdavis/EngineeringStandards/issues/16)
- **Evidence:** open as of 2026-08-11. Reproduced against `StandardsOrchestrator`, whose `README.md`
  opens with `⛔ FROZEN` and whose `FROZEN.md` states "Do not adopt this repository into a governed
  project. Do not extend it." The documented adoption sequence ran and wrote five files into it
  before anything consulted that status. The writes have since been reverted.
- **Purpose:** The adoption path has no notion of whether a repository may be adopted at all. Every
  item above assumes the answer is yes and asks only *how*. That assumption is wrong for frozen,
  archived, superseded, and historical-evidence repositories, and the failure is not a wrong verdict
  but an unauthorised mutation — the tool changing a repository it had no standing to touch.

  This is distinct from #2 above. That is the entrypoint misreading *what kind* of eligible
  repository it is looking at; this is the entrypoint never asking whether the repository is
  eligible. A monorepo misclassified as greenfield still gets a defensible artifact; a frozen
  repository gets an artifact that should not exist.

  The mutation happened before `standards init`, so a guard inside `init` would not have prevented
  it. The guard belongs at the earliest adoption boundary, ahead of the documentation and planning
  procedures the adoption guide directs an agent to run first.
- **Deliverables:** an adoption-scope resolution step, and its result as a first-class state
  alongside — never merged into — compliance status:

  ```text
  IN_SCOPE  |  OUT_OF_SCOPE  |  INDETERMINATE
  ```

  `INDETERMINATE` carries the weight. "Whether this repository is frozen could not be determined"
  must not become permission to mutate it, which is Standard 44 R12's validated-search invariant one
  layer earlier than it currently applies.
- **Acceptance Criteria:**
  - A fixture repository with implementation files, an explicit frozen / do-not-adopt signal, and no
    adoption artifacts resolves `OUT_OF_SCOPE` and the adoption entrypoint **writes nothing** —
    asserted by comparing the fixture tree before and after, not by reading the return value.
  - An `INDETERMINATE` fixture — signal present but unparseable, or unreadable — also writes nothing.
    A repository that cannot be classified is not thereby eligible.
  - The guard fires on the general signal, and **no repository is named in the implementation**. A
    test that passes because the source contains `if (repo === "StandardsOrchestrator")` fixes one
    repository and leaves every other frozen or archived one exposed.
  - An eligible repository's behaviour is unchanged, and the greenfield, scaffold, and
    reconstruction-required fixtures still classify as they do today. A guard that reaches
    `OUT_OF_SCOPE` too readily would block adoption entirely, which is worse than the defect.
- **Verification:** `npm test` with the three new fixtures; the before/after tree comparison is part
  of the assertion, not a manual check.
- **Dependencies:** `standards init` and the adoption guide above — both are downstream of the guard
  and the guide's step order is part of what changes.
- **Possible ADR:** whether the `IN_SCOPE / OUT_OF_SCOPE / INDETERMINATE` model, and the decision
  that EngineeringStandards owns adoption eligibility itself rather than delegating to an external
  registry, is consequential enough to record. It likely is: the question arises before a project has
  adopted anything, so answering it must not require a separate enforcement repository to be present.

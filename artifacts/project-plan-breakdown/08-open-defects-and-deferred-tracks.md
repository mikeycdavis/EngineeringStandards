# 08 — Open defects, recorded rejections, and deferred tracks

**Added 2026-08-11.** Everything in this repository that is currently open, plus everything that is
deliberately not being worked on and the reason. It exists so that *open* and *dormant* are visible
states rather than absent ones.

Before the plan repair, eleven GitHub issues, four recorded rule rejections, and a set of deliberately
deferred design questions existed as a parallel obligation system that no plan item claimed. A plan
that omits its own open work will always report itself complete.

**Every open GitHub issue is claimed by exactly one plan item.** Seven are claimed here; the other
four are claimed where their subject lives — [#10 and #11](04-compliance-and-policy-system.md) by the
exception machinery, [#3](06-must-never-standards.md) by the detectors, and
[#2 and #9](07-distributed-validation-and-ci.md) by the adoption path. None is rejected as
out of release scope.

---

## The four recorded rejections — findings, not defects to clear

`ai.no-fabricated-capabilities`, `ai.no-safety-bypass`, `errors.no-false-success`, and
`scm.no-shared-history-rewrite` each carry a `status: rejected` review event: a human looked, and
found the rule unmet during this work. They are why `standards validate` reports `NON_COMPLIANT` on
this repository.

**They are not a plan item and they are not a backlog.** They are the recorded output of the review
mechanism working. Three things follow:

- **`NON_COMPLIANT` is the honest verdict** and must not be resolved by policy edit. A baseline
  exception declaring today's four failures acceptable would make the gate green and the framework
  worthless in the same commit. The CI arrangement in
  [`07`](07-distributed-validation-and-ci.md) exists precisely so this verdict can stay true.
- **A rejection is cleared by satisfying the rule and recording a new review**, never by deleting or
  editing the rejection. Review events are append-only
  ([`05`](05-attestations-and-provenance.md)); the rejection stays in the history with a successor
  pointing back at it.
- **The historical rejections stay frozen.** They record what was true at a moment. Re-litigating
  them because the repository has since changed would destroy the only evidence that the finding was
  ever made.

One further review is **awaiting owner disposition**, not rejected: `testing.no-fabricated-results`
is `stale` after `d6136df` changed a reviewed path. Its re-review basis is stated in
[`05`](05-attestations-and-provenance.md).

---

### Correct the stale rejection count in ADR 0013

- **Status:** BLOCKED — awaiting an owner decision, not on any work
- **Evidence:** [`artifacts/adr/0013-the-reusable-check-distributes-the-verdict-and-nothing-else.md`](../adr/0013-the-reusable-check-distributes-the-verdict-and-nothing-else.md)
  line 85 reads *"still exits 1 for the three recorded rejections"*. There are four. The same stale
  count in `.github/workflows/ci.yml` and `.github/workflows/standards-dogfood.yml` was corrected at
  `d6136df`; this occurrence was deliberately left alone.
- **Purpose:** Decide whether the sentence is a stale claim to fix or a dated record to preserve. It
  sits under a paragraph reading *"**Recorded 2026-08-11.** That happened"*, which is the strongest
  possible signal that the ADR is describing a moment rather than the present — and this repository's
  standing constraint is never to fabricate history, including by tidying it.
- **Deliverables:** one of — leave it and add a dated note that a fourth rejection was recorded
  later; or correct the number, on the grounds that the sentence is a present-tense claim about exit
  behaviour rather than a record of the moment.
- **Acceptance Criteria:** whichever is chosen, an ADR reader can determine both what was true when
  it was written and what is true now. Silently changing a number inside a dated record is not an
  option.
- **Verification:** `grep -rn "three recorded rejections" artifacts/adr/` resolves to nothing, or to
  a line accompanied by a dated correction.
- **Dependencies:** none. This is a judgement call, not a task.

### Fix the audit's project-level exclusions

- **Status:** READY
- **Tracked by:** GitHub issue [#7](https://github.com/mikeycdavis/EngineeringStandards/issues/7)
- **Evidence:** open as of 2026-08-11; the exclusion list is the hardcoded `SKIP_DIRS` constant in
  [`scripts/standards.mjs`](../../scripts/standards.mjs), with no project-level configuration path.
- **Purpose:** This is the most severe of the open audit defects, because its failure mode is not a
  wrong answer but no answer: an untracked virtualenv or vendor directory pollutes the findings and
  can exhaust memory, so the audit does not complete at all on repositories that have one.
- **Deliverables:** a project-level exclusion mechanism, declared where a project already declares
  things — the policy — rather than as a new configuration surface.
- **Acceptance Criteria:**
  - Exclusions cannot be used to hide a violation from a rule that would otherwise catch it without
    that being visible in the output. An exclusion that silently shrinks coverage is the same defect
    class as a silent cap.
  - The audit reports what it excluded, consistent with the existing rule that a cap is never silent.
  - The existing `SKIP_DIRS` defaults still apply when a project declares nothing.
- **Verification:** a fixture with a large excluded directory completes and reports the exclusion;
  `npm test`.
- **Dependencies:** the policy mechanism in [`04`](04-compliance-and-policy-system.md).

### Decouple `Tracked by` resolution from one backlog implementation

- **Status:** READY
- **Tracked by:** GitHub issue [#5](https://github.com/mikeycdavis/EngineeringStandards/issues/5)
- **Evidence:** open as of 2026-08-11; the resolver in
  [`scripts/standards.mjs`](../../scripts/standards.mjs) builds
  `artifacts/backlog/items/<ID>.md` directly, and the id pattern it accepts is `[A-Z]{2}-\d+`.
- **Purpose:** Plan validation is coupled to one backlog storage implementation. A project tracking
  work in GitHub issues, Jira, or any other system cannot have its `Tracked by` pointers verified —
  which this very plan demonstrates: the items in
  [`04`](04-compliance-and-policy-system.md) and [`07`](07-distributed-validation-and-ci.md) point at
  GitHub issues and are checked by hand.
- **Deliverables:** a resolution seam, so the storage layout is a property of the project rather than
  of the checker.
- **Acceptance Criteria:**
  - An unresolvable reference is still an `error` finding. This must not become a way to make
    dangling references stop being reported — that check is the whole point of Standard 44 R7.
  - The existing `delegated` fixture, including its `ST-999` dangling reference, behaves unchanged.
  - A reference to a system the resolver cannot reach is reported as *unverifiable*, not as *valid*.
    An unreachable tracker is the search-mechanism case of Standard 44 R12.
- **Verification:** `npm test`; the `ST-999` assertion still produces exactly one finding.
- **Dependencies:** the discrepancy categories in [`03`](03-standards-audit-cli.md).

### Make `architecture.project-manifest` check content, not presence

- **Status:** READY
- **Tracked by:** GitHub issues [#6](https://github.com/mikeycdavis/EngineeringStandards/issues/6)
  and [#8](https://github.com/mikeycdavis/EngineeringStandards/issues/8) — **merged into this one
  item**, because they are two manifestations of one defect: #6 against an untouched `PROJECT.md`
  template and #8 against the unedited output `init` itself just wrote. Fixing the content check
  fixes both; fixing either separately would leave the other live.
- **Evidence:** open as of 2026-08-11. `detectArchitectureArtifacts()` in
  [`scripts/standards.mjs`](../../scripts/standards.mjs) tests only whether
  `PROJECT.md` and `artifacts/project-manifest.md` exist.
- **Purpose:** This is the **exact defect Standard 44 R11 was written about**, in the tool that
  enforces R11. `standards init` writes a template; the rule then passes because the file exists;
  the project is reported as having a manifest it has never filled in. Tool-generated scaffolding is
  being read as evidence of intent by the framework that forbids exactly that.
- **Deliverables:** a content check of the same family as `hasContent()` in
  [`scripts/init.mjs`](../../scripts/init.mjs), which already fixed this bug class on the `init` side.
- **Acceptance Criteria:**
  - A file that is byte-identical to its template, or that retains its placeholder headings with
    nothing under them, does not satisfy the rule.
  - A fixture consisting of exactly what `init` writes fails the rule; a fixture with a genuinely
    filled-in manifest passes it. Both directions are asserted — a check that only ever fails is as
    uninformative as one that only ever passes.
  - This repository's own `PROJECT.md` still passes, and for the right reason.
- **Verification:** `npm test` with both fixtures; self-audit unchanged at zero error findings.
- **Dependencies:** `standards init` in [`07`](07-distributed-validation-and-ci.md), whose
  `hasContent()` is the precedent to follow.

### Fix README path resolution under local command context

- **Status:** READY
- **Tracked by:** GitHub issue [#4](https://github.com/mikeycdavis/EngineeringStandards/issues/4)
- **Evidence:** open as of 2026-08-11.
- **Purpose:** The README path validator resolves paths from the repository root regardless of the
  context the command was invoked in, so correct relative links can be reported as broken and
  incorrect ones can pass. A path checker that resolves against the wrong base is worse than no path
  checker, because its findings look authoritative.
- **Deliverables:** resolution against the correct base, with the choice of base stated rather than
  implicit.
- **Acceptance Criteria:**
  - A fixture with links that are correct relative to the document and a fixture with links that are
    correct only relative to the root produce opposite results, and the right one each way.
  - The existing finding that an HTTP route in a README is not a missing file (`78f3afb`) is
    unaffected.
- **Verification:** `npm test`; the audit reports no README path findings against this repository.
- **Dependencies:** the absence and discrepancy categories in [`03`](03-standards-audit-cli.md).

### Resolve Standard 31 R4's comparability gap

- **Status:** READY
- **Tracked by:** GitHub issue [#1](https://github.com/mikeycdavis/EngineeringStandards/issues/1)
- **Evidence:** open as of 2026-08-11.
  [`standards/31-whatsnext-compatibility.md`](../../standards/31-whatsnext-compatibility.md) R4
  defines the *join key* — two results are the same finding if they share `project` and `ruleId` —
  and the surrounding text says `standardVersion` tells a consumer whether two results are
  comparable. What R4 does not state is the rule for **when a rule's meaning has changed under a
  stable id**, which is the case the join key cannot detect.
- **Purpose:** Identity and comparability are different properties, and R4 currently supplies only
  the first. Two results can share a `ruleId` and not be the same measurement — a rule whose detector
  was tightened, or whose level changed, produces series that a portfolio view will silently
  concatenate.
- **Deliverables:** normative text in R4 distinguishing identity from comparability, and stating what
  a consumer must do when `standardVersion` differs across the results it is joining.
- **Acceptance Criteria:**
  - The requirement is stated in the standard, not only in the tool. A comparability rule that lives
    only in an implementation is not citable.
  - `npm run fidelity` still passes — R4's verbatim source blocks must not be altered by the
    addition, which is disclosed as an addition per the house convention.
  - Whatever is required of the JSON envelope is already present in it, or the change discloses that
    it is not.
- **Verification:** `npm run fidelity && npm run inventory && npm test`.
- **Dependencies:** [ADR 0002](../adr/0002-canonical-rule-identity.md), already settled.
- **Note on this item's history:** an earlier reconciliation of Standard 31 merged into `develop` at
  `5b4b917`. That commit is an ancestor of `origin/develop` — the reconciliation landed. The issue
  is nonetheless still open, and the R4 text above is what is actually there, so the reconciliation
  did not close it.

---

## Deliberately dormant — recorded so they are not rediscovered as new

These are **findings, not a roadmap**. Each was identified, considered, and left. Starting one is a
decision to be taken deliberately; none of them is an unfinished task, and none blocks the zero-gap
gate. Listing them here is what stops a future reconciliation from reporting them as newly
discovered gaps.

- **Promoting `validate-self / validate` back to a required check.** Cannot happen while the four
  rejections stand, and clearing the rejections to enable it would be backwards. See
  [`07`](07-distributed-validation-and-ci.md).
- **A `--record` command** for writing review events from the CLI rather than by hand-editing
  `project-policy.yml`. Attractive, and dangerous for the same reason: the easier it is for a process
  to write an attestation, the easier it is for an agent to self-attest. Deferred until the guard
  against that is designed first.
- **The rejected-event lifecycle** left open by
  [ADR 0010](../adr/0010-human-review-may-always-contribute-negative-evidence.md) — what a rejection
  should do over time when the underlying rule is neither satisfied nor re-reviewed.
- **An organization-level adoption controller** — declaring policy once across many repositories
  rather than per repository. Out of scope for 2.0.0; the reusable workflow in
  [`07`](07-distributed-validation-and-ci.md) is the per-repository answer.
- **Standard 21 R5 version resolution** — exercisable now, unimplemented by explicit decision
  recorded in [ADR 0006](../adr/0006-must-never-standards-are-forbidden-level-rules.md).
- **`ITEM_RE` in [`scripts/inventory.mjs`](../../scripts/inventory.mjs)** — the numbered-item
  extractor whose anchoring caused the item-8 error. It is correct for the source it reads and is
  covered by the monotonic-ordering invariant; generalising it has no current motive.
- **[ADR 0007](../adr/0007-cli-scripts-are-single-run-programs-with-module-scoped-state.md)'s binding
  table.** The table enumerates the module-scoped state it governs, and enumeration is not a control
  — nothing prevents new state being added without a row. The table has been found accurate at four
  consecutive reviews. The structural fix stays dormant until a fifth review finds it accurate again,
  at which point the right conclusion is that the enumeration is load-bearing and should be enforced
  rather than checked by hand.

## Recorded blind spots — outside the framework's reach, with reasons

Disclosed in the 2.0.0 [CHANGELOG](../../CHANGELOG.md) completion report and repeated here because a
plan that lists only what is checked implies the rest is covered.

- **Git-history-based detection** — test removal, history rewriting. Nothing evaluates history; this
  is why `scm.no-shared-history-rewrite` is `manual-review`, and why its violation was found by a
  person rather than by the tool. It is also the reason the append-only review invariant in
  [`05`](05-attestations-and-provenance.md) is a discipline rather than an enforced property.
- **Coverage regression** — no measurement of whether test coverage fell.
- **Entropy-based secret scanning** — deliberately excluded. High-precision patterns only, because an
  entropy heuristic is a brittle check and Standard 50 prohibits those.
- **`eval` and untrusted-execution detection** — the sandbox qualifier is undecidable statically, so
  `security.no-untrusted-exec` stays `manual-review`.
- **Destructive-command detection** — `ai.destructive-approval` is established by attestation.

Each blind spot is a place where a clean result means *the search did not cover this*, which is
Standard 44 R12 applied to the framework itself.

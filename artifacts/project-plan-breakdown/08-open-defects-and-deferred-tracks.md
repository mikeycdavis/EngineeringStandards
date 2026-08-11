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

## Terminal semantics — how an item in this section stops being open

**Read this before using this section as a release gate.** A section whose items can only close by
being fixed is a section that never closes, and its mere existence would block release forever. That
would quietly convert the zero-gap condition into *zero known problems*, which is a far stronger
release condition than was ever intended and one no repository that records its own defects honestly
can satisfy.

An item here reaches a terminal state by **one of three routes**, each using the canonical
[Standard 8](../../standards/08-status-tracking.md) vocabulary rather than a local one:

| Terminal status | Means | Requires |
| --- | --- | --- |
| `COMPLETE` | The defect was fixed and the fix is verified. | Acceptance criteria met; evidence names the commit and the check that establishes it. |
| `DEFERRED` | Deliberately not being done now. | **A named trigger**: the specific observable condition under which it reopens. A deferral with no trigger is an open item wearing a closed label. |
| `CANCELLED` | Intentionally abandoned; the work will not be done. | A recorded reason. Cancelling because something is hard is a Standard 53 R3 violation, not a decision. |

**A recorded rejection is not a plan item and does not take a status.** It is a review event, and it
is terminal when it has been *examined* — the item that owns the examination is `COMPLETE` when the
examination happened, regardless of whether the rejection was upheld or resolved. An examined
rejection that remains authoritative is a settled state, not an outstanding one. This is the
distinction that keeps `NON_COMPLIANT` and *plan-complete* as separate claims: the validator reports
compliance, the plan reports whether everything has an owner and an evidenced status. Both can be
true at once, and at present both are.

**The release condition, stated exactly.** Zero gaps means: *every release-relevant capability, known
defect, recorded rejection, open issue, and intentionally dormant track has an explicit place in the
plan, and every status is supported by evidence.* It does not mean every item is `COMPLETE`, and it
does not mean `validate` reports `COMPLIANT`.

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

`testing.no-fabricated-results` went `stale` after `d6136df` changed a reviewed path and was
**re-reviewed and approved on 2026-08-11** as event `-005`. No rule is now stale or unrecorded; the
four rejections are the whole of the outstanding compliance state. See
[`05`](05-attestations-and-provenance.md) for the measurement the re-review rested on and for what
that approval deliberately does not cover.

---

### Merge the plan repair through the protected path

- **Status:** BLOCKED — **merge evidence unavailable.** This is neither a failure of the change nor
  permission to bypass the gate, and it must not be recorded as either.
- **Tracked by:** [PR #15](https://github.com/mikeycdavis/EngineeringStandards/pull/15), left open.
- **Evidence:** two independent prerequisites are unavailable under the present account state, and
  each was measured rather than inferred:
  - **Actions cannot establish the required `test` result.** The jobs queued for the pull request
    completed in under five seconds having executed **zero steps**. The reason is in the check-run
    annotation, not the log: *"The job was not started because recent account payments have failed
    or your spending limit needs to be increased."* A job that never started carries no information
    about the code in either direction.
  - **GitHub cannot currently enforce the protected path.** `GET /branches/develop/protection` and
    `GET /rulesets` both return **403 — "Upgrade to GitHub Pro or make this repository public"**,
    which is consistent with `mergeStateStatus` reading `UNSTABLE` rather than `BLOCKED`.
- **Purpose:** Keep the distinction the whole framework rests on. Local verification is evidence
  about the change; it is not a substitute for a required CI check when the plan says merge through
  the protected path. **`mergeStateStatus: UNSTABLE` is not permission** — it is the absence of an
  enforcement mechanism, and reading it as consent would be inferring authorisation from a broken
  gate.
- **Deliverables:** the merge, once both prerequisites are restored.
- **Acceptance Criteria:** the resumption condition, stated narrowly —
  > Resume when GitHub Actions starts a real `test` job and the intended protected-branch
  > enforcement is available again. Require `test` green before merge.
  - A `test` result counts only if the job has a non-empty `steps` array and a plausible duration.
  - The non-required `validate` and `validate-self` checks are **not** to be made green as part of
    this. They will correctly report `NON_COMPLIANT` from the four recorded rejections.
- **Verification:**
  ```bash
  gh api repos/:owner/:repo/check-runs/<id>/annotations   # read before diagnosing any red
  gh pr checks 15
  ```
- **Dependencies:** account/billing restoration, which is outside this repository. Nothing in the
  codebase can unblock it.
- **If the block persists and the merge happens anyway**, that is a **governance exception to be
  made explicitly and beforehand**, naming the missing evidence surfaces. It is not to be inferred
  from the merge succeeding, and not to be discovered afterwards from the commit graph.

### ADR 0013's rejection count stays at three

- **Status:** CANCELLED — owner decision, 2026-08-11. The ADR is not to be changed.
- **Evidence:** [`artifacts/adr/0013-the-reusable-check-distributes-the-verdict-and-nothing-else.md`](../adr/0013-the-reusable-check-distributes-the-verdict-and-nothing-else.md)
  line 85 reads *"still exits 1 for the three recorded rejections"*, under a paragraph beginning
  *"**Recorded 2026-08-11.** That happened."* The same count in
  [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) and
  [`.github/workflows/standards-dogfood.yml`](../../.github/workflows/standards-dogfood.yml) **was**
  corrected at `d6136df`, and the difference between the two cases is the whole reason for this item.
- **Purpose:** Settle whether the sentence is a stale claim to correct or a dated record to preserve,
  so the question is answered once rather than reopened by every reader who greps for the count.
- **Deliverables:** none. The decision *is* the deliverable, and no file changes — which is why this
  item is `CANCELLED` rather than `COMPLETE`: the work was considered and will not be done, as
  distinct from having been done.
- **Acceptance Criteria:**
  - `artifacts/adr/0013-*.md` line 85 is unchanged and stays unchanged.
  - The current count is recorded somewhere a reader of that ADR can reach — satisfied by the
    *four recorded rejections* heading at the top of this section.
  - No future reconciliation reports this as an unfixed defect. Satisfied by this item existing.
- **Reason for cancelling:** because the sentence sits explicitly under *Recorded 2026-08-11*, "three
  recorded rejections" is a **historical statement about that decision point**, not a claim about
  current `HEAD`. Changing it to four would falsify the chronology — it would make the ADR assert
  that four rejections existed when the decision was taken, which is not what happened. The workflow
  comments were different in kind: they carry no date and describe present exit behaviour, so a stale
  count there was simply a false statement about what CI does today.
- **The general rule this establishes**, worth applying to the next case rather than re-deriving:
  **a dated record and a present-tense claim go stale differently, and only the second is a defect.**
  Correcting a number inside a dated record is not tidying, it is fabricating history — which the
  standing constraint in [`00-overview.md`](00-overview.md) forbids in this repository's own
  documents, not only in the artifacts its standards produce.
- **Where the current state is recorded instead:** at the top of this section, which states that
  there are four and names them. That is the right home — a reader who follows the ADR's dated
  statement forward arrives here.
- **Verification:** none required. This item closes by decision, not by a check. `grep -rn "three
  recorded rejections" artifacts/adr/` returning one line is the **expected** result and must not be
  treated as a finding.
- **Dependencies:** none.

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

**Status for all of these: `DEFERRED`.** They are **findings, not a roadmap**. Each was identified,
considered, and left; none is an unfinished task and none blocks the zero-gap gate. Listing them is
what stops a future reconciliation reporting them as newly discovered gaps.

Per the terminal semantics above, each names the **trigger** that would reopen it. A trigger is an
observable condition, not an intention — *when we have time* is not a trigger, and an entry that
cannot name one does not belong on this list.

- **Promoting `validate-self / validate` back to a required check.**
  *Trigger:* this repository's `validate` exits 0 for the right reasons — that is, with no recorded
  rejection outstanding and no unestablished prohibition. Clearing the rejections in order to
  promote the check would be the reasoning backwards, and is not the trigger. See
  [`07`](07-distributed-validation-and-ci.md).
- **A `--record` command** for writing review events from the CLI rather than by hand-editing
  `project-policy.yml`.
  *Trigger:* a designed guard against a process authoring its own attestation. The convenience and
  the hazard are the same property — the easier it is for a process to write an attestation, the
  easier it is for an agent to self-attest — so the guard is a precondition, not a follow-up.
- **The rejected-event lifecycle** left open by
  [ADR 0010](../adr/0010-human-review-may-always-contribute-negative-evidence.md) — what a rejection
  should do over time when the underlying rule is neither satisfied nor re-reviewed.
  *Trigger:* a rejection reaching an age at which its silence becomes ambiguous in practice, or a
  second repository adopting the framework and inheriting the question.
- **An organization-level adoption controller** — declaring policy once across many repositories
  rather than per repository.
  *Trigger:* a second repository adopting this framework. The reusable workflow in
  [`07`](07-distributed-validation-and-ci.md) is the per-repository answer and is sufficient for one.
- **Standard 21 R5 version resolution** — exercisable now, unimplemented by explicit decision
  recorded in [ADR 0006](../adr/0006-must-never-standards-are-forbidden-level-rules.md).
  *Trigger:* a consumer needing to resolve a version range rather than pin a revision — which is the
  same trigger as the adoption controller above, and probably arrives with it.
- **`ITEM_RE` in [`scripts/inventory.mjs`](../../scripts/inventory.mjs)** — the numbered-item
  extractor whose anchoring caused the item-8 error.
  *Trigger:* a third source document, or a source whose item headings the current pattern cannot
  read. It is correct for the two sources it reads and is covered by the monotonic-ordering
  invariant, so generalising it now would be speculative.
- **[ADR 0007](../adr/0007-cli-scripts-are-single-run-programs-with-module-scoped-state.md)'s binding
  table.** The table enumerates the module-scoped state it governs, and **enumeration is not a
  control** — nothing prevents new state being added without a row.
  *Trigger:* a **fifth** consecutive review finding the table accurate. It has survived four. The
  reasoning is deliberately inverted from the usual: repeated accuracy is not reassurance here, it is
  evidence that the enumeration is load-bearing and therefore ought to be enforced mechanically
  rather than checked by hand. A review that finds it *inaccurate* is a different and more urgent
  trigger — that would mean the drift has already happened.

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

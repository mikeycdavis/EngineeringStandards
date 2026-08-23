# 08 — Open defects, recorded rejections, and deferred tracks

**Added 2026-08-11.** Everything in this repository that is currently open, plus everything that is
deliberately not being worked on and the reason. It exists so that *open* and *dormant* are visible
states rather than absent ones.

Before the plan repair, eleven GitHub issues, four recorded rule rejections, and a set of deliberately
deferred design questions existed as a parallel obligation system that no plan item claimed. A plan
that omits its own open work will always report itself complete.

**Every open GitHub issue is claimed by exactly one plan item.** Sixteen are open. Ten are claimed
here — #1, #4, #5, #6, #7, #8, #17, #19, #21, #32 — and the other six are claimed where their subject
lives: [#10 and #11](04-compliance-and-policy-system.md) by the exception machinery,
[#3](06-must-never-standards.md) by the detectors, and
[#2, #9 and #16](07-distributed-validation-and-ci.md) by the adoption path. None is rejected as
out of release scope.

**Ownership is asserted by an item's `Tracked by` field, not by an issue being mentioned.** Sections
03 and 04 reference #4, #5 and #7 while section 08 owns them; a link-count would report those as
claimed two and three times over. Anyone re-checking this invariant should test for the field, not
for the link — the use/mention distinction ([ADR 0009](../adr/0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md))
applies to the plan reading itself, not only to detectors.

**Updated 2026-08-11**, after an adoption attempt against two repositories surfaced three defects.
Two are new — [#16](07-distributed-validation-and-ci.md) (adoption eligibility resolved too late) and
[#17](#settle-adr-0008s-canonical-identity) (ADR 0008 cited under two identities). The third was
already open as #7, independently reproduced on a second repository; that item below carries the new
evidence rather than a duplicate issue.

The counts in this paragraph previously read "seven here, four elsewhere" against eleven open issues,
while naming five elsewhere. Six were claimed here and five elsewhere. Corrected above rather than
left, because this paragraph is the only place the claim invariant is asserted, and an invariant
whose own arithmetic does not hold cannot be used to check anything.

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

**The release condition, stated exactly — two predicates, not one.**

```text
zero-gap coverage
  every release-relevant obligation is known, owned, and evidenced

release closure
  every plan item has reached a terminal disposition:
  COMPLETE | DEFERRED | CANCELLED
  (recorded rejections are separately terminal — see below)
```

**Zero-gap coverage** means *every release-relevant capability, known defect, recorded rejection,
open issue, and intentionally dormant track has an explicit place in the plan, and every status is
supported by evidence.* It is a claim about **knowledge**: nothing is unowned, unevidenced, or
invisible. It does not mean every item is `COMPLETE`, and it does not mean `validate` reports
`COMPLIANT`.

**Release closure** additionally requires that every plan item has reached a terminal disposition by
one of the three routes in the table above. It is a claim about **decision**: every obligation has
been resolved, postponed with a trigger, or abandoned with a reason. The `master`, tag, and release
gate in [`00-overview.md`](00-overview.md) requires **both** predicates.

**Coverage does not imply closure, and treating it as though it did makes ownership equivalent to
disposition.** Read as a single condition, the gate would be satisfied by marking every known defect
`READY`: everything owned, everything evidenced, nothing resolved, and the repository free to
release forever without ever deciding anything. That collapses two different claims into one — the
same error this section exists to prevent between *compliance* and *plan-complete*.

**The nonterminal statuses are therefore open for release purposes.** `NOT_STARTED`, `READY`,
`IN_PROGRESS`, `BLOCKED`, and `IN_REVIEW` ([Standard 8](../../standards/08-status-tracking.md)) each
prove the work is *tracked*. None proves the release *decision* has been made. A `READY` item is the
repository stating in its own vocabulary that the work is actionable and has not yet been
dispositioned — which is precisely a reason not to release, not a reason to.

**Closure does not require fixing everything.** `DEFERRED` with a named trigger and `CANCELLED` with
a recorded reason are terminal, and an item that is genuinely not release-critical is dispositioned
by saying so under those rules. What closure forbids is leaving the question unanswered.

**What this does not change.** `NON_COMPLIANT` still coexists with release closure, because a
recorded rejection is terminal evidence rather than a plan item (see the paragraph above). `validate`
reporting `COMPLIANT` is still not a release condition.

**Standing controls — the one nonterminal state that does not block release, and it is designated
here rather than claimed by the item.** Some obligations are ongoing by their nature: they are not
unfinished decisions and terminal disposition would misdescribe them. [Keep the framework's own
attestations owner-established](05-attestations-and-provenance.md) is the worked example — it is
`IN_PROGRESS` *permanently, by design*, and marking it `COMPLETE`, `DEFERRED`, or `CANCELLED` would
each state something false. Under a flat reading of the rule above it would block release forever,
which is the failure mode the terminal-semantics table exists to prevent.

**A standing obligation may remain nonterminal without blocking release only when this plan
explicitly designates it a standing control, records why terminal disposition is semantically
inapplicable, and identifies the observable condition under which that designation must be
reconsidered. A plan item's own `Status` text cannot exempt itself from release closure.**

The authority is deliberately not local to the item. A self-describing rule — *exempt where the
`Status` line says it does not close* — lets any `READY` or `IN_PROGRESS` item mint its own exemption
by rewriting its own prose, with the governed item supplying the grounds for escaping the gate. The
designation therefore lives in the release plan, where adding one is an amendment that gets reviewed,
and where the full set is readable in a single place rather than distributed across the items that
benefit from it.

```text
zero-gap coverage
  all obligations known, owned, evidenced

release closure
  all ordinary plan items terminal
  + explicitly designated standing controls remain healthy

standing control
  ongoing by nature
  != unfinished decision
  != self-exemption by Status prose
```

**Designation does not mean “ignore”.** A designated standing control still blocks release when it is
not *healthy* — when the observable check named in its own `Verification` line does not hold. The
exemption is from *terminal disposition*, which would misdescribe an ongoing obligation; it is not an
exemption from being in good standing at the moment of release.

#### Designated standing controls

This is the complete list. Adding to it requires amending this section.

| Standing control | Why terminal disposition is inapplicable | Healthy when | Designation reconsidered when |
| --- | --- | --- | --- |
| [Keep the framework's own attestations owner-established](05-attestations-and-provenance.md) | The obligation is that a *person* keeps feeding the attestation machinery. It has no completion state: `COMPLETE` would claim future reviews are already done, `DEFERRED` would claim the framework's own compliance record is postponed, and `CANCELLED` would abandon [ADR 0005](../adr/0005-attestations-are-recorded-human-evidence.md)'s core requirement. Its openness is the obligation, not an undecided question about it. | `node scripts/standards.mjs validate .` shows no applicable forbidden rule as `unrecorded`. A *stale* attestation is a normal state awaiting owner action, not an unhealthy one. | Attestation renewal stops requiring a human judgement — for instance if owner review became mechanically derivable, at which point the item would have a completion state and would no longer be a standing control. |

**Amended 2026-08-23, before being relied on as a gate.** The single-predicate wording was ambiguous
in a way that mattered: thirteen `READY` items would have satisfied it. The ambiguity is recorded
rather than silently overwritten, because the previous reading was used to describe this repository's
state and a future reader needs to know which reading applied when. This amendment settles the
reading only — no item's status changed with it, and no implementation follows from it.

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

- **Status:** COMPLETE as to the merge — **and the required check never executed.** Those are two
  answers, and this item previously collapsed them into one `BLOCKED`:

  | Question | Answer |
  | --- | --- |
  | Did the merge happen? | **Yes.** 2026-08-11T21:16:17Z into `develop`, merge commit `0a0e7d4`. |
  | Did the required CI check execute? | **No.** Job `93929943347`: `steps: 0`, 21:13:38→21:13:42, billing block. |

  The first means the item cannot stay `BLOCKED` — the obligation it held open has been discharged.
  The second means nothing here may be read as *the gate passed*. **The merge establishes that the
  plan repair landed. It establishes nothing whatever about CI.**
- **Tracked by:** [PR #15](https://github.com/mikeycdavis/EngineeringStandards/pull/15), **merged**
  2026-08-11. Rebased onto `develop` as `6025b5a`, `1093286`, `0a0e7d4`, so the branch is not an
  ancestor of `develop`; `plan/repair-release-model` has finished its purpose and is not to be
  pushed to again.
- **Recorded deviation — the acceptance condition was superseded, not satisfied.**

  ```text
  Original acceptance condition
      the required protected-path check executes successfully before merge

  Observed outcome
      PR #15 merged 2026-08-11T21:16:17Z while the required check was unavailable
      job 93929943347 — conclusion: failure, steps: 0, duration 4s
      annotation: "The job was not started because recent account payments have
                   failed or your spending limit needs to be increased"

  Resolution
      merge action COMPLETE; CI-evidence condition NOT satisfied
      the missing evidence is recorded here as a governance deviation,
      and is not inferred from the merge having succeeded
  ```

  Recorded as a deviation on this item rather than as a policy exception. Standard 20's exception
  machinery governs *rule* exemptions declared in `project-policy.yml`; this is a single historical
  fact about one governance event, and minting an exception for it would turn a recorded incident
  into a reusable mechanism.

  **This deviates from the terminal semantics above,** which require acceptance criteria to be met
  before `COMPLETE`. Stated rather than quietly excepted: the deliverable was the merge, the merge
  happened, and what went unmet was a *resumption* condition — the circumstances under which to
  proceed — which the merge proceeded without. Every other option is worse. `BLOCKED` is contradicted
  by the commit graph; an unqualified `COMPLETE` would assert a passing gate that does not exist.

  The final paragraph of this item asked that a merge under a persisting block be **"a governance
  exception made explicitly and beforehand."** It was not made beforehand. This is the *afterwards*
  version the item warned against — worse than the beforehand version, better than no record. That
  gap is itself the finding, and it is left standing below in its original wording rather than
  softened to match what happened.
- **Evidence:** the conditions as measured when the item was written. One of the two was misread at
  the time and is corrected below; both are left visible rather than rewritten.
  - **Actions cannot establish the required `test` result.** The jobs queued for the pull request
    completed in under five seconds having executed **zero steps**. The reason is in the check-run
    annotation, not the log: *"The job was not started because recent account payments have failed
    or your spending limit needs to be increased."* A job that never started carries no information
    about the code in either direction.
  - **~~GitHub cannot currently enforce the protected path.~~ CORRECTED 2026-08-11 — this was
    wrong.** What was measured: `GET /branches/develop/protection` and `GET /rulesets` both returned
    **403 — "Upgrade to GitHub Pro or make this repository public"**. What was concluded: that
    protection had lapsed. That conclusion did not follow. A 403 on a read establishes that **the
    API could not be queried**, not that the thing being queried was absent — *visibility* was
    unavailable, not enforcement.

    Once the account capability was restored, the ruleset **"Protect main branches"** was found
    `enforcement: active`, `created_at: 2026-08-08`, requiring `test`, pull requests, linear
    history, and blocking deletion and force-push. It had almost certainly been enforcing
    throughout. The 404 that now answers `/branches/develop/protection` means only that `develop`
    was never governed by *classic* branch protection — the ruleset is a different mechanism at a
    different endpoint, and reading one endpoint's silence as the other's absence was the error.

    **This is Standard 44 R12 against the framework's own reasoning**: a negative result is evidence
    about the search mechanism before it is evidence about the world. A 403 is not even a negative
    result — it is the search failing to run. The invariant was written into this repository's
    standards and then violated by it within two days.

    **What does not change:** `mergeStateStatus: UNSTABLE` was still not permission, the required
    check still genuinely could not execute, and the merge still occurred with its documented
    prerequisites unmet. One of the two stated prerequisites was misdiagnosed; the other was real,
    and it was sufficient on its own.
- **Purpose:** Keep the distinction the whole framework rests on. Local verification is evidence
  about the change; it is not a substitute for a required CI check when the plan says merge through
  the protected path. **`mergeStateStatus: UNSTABLE` is not permission** — it is the absence of an
  enforcement mechanism, and reading it as consent would be inferring authorisation from a broken
  gate.
- **Deliverables:** the merge, once both prerequisites are restored. **Delivered 2026-08-11 —
  without either prerequisite being restored.**
- **Acceptance Criteria:** **SUPERSEDED, not met.** Kept verbatim, because a criterion edited to
  match what happened is not a criterion:
  > Resume when GitHub Actions starts a real `test` job and the intended protected-branch
  > enforcement is available again. Require `test` green before merge.
  - A `test` result counts only if the job has a non-empty `steps` array and a plausible duration.
  - The non-required `validate` and `validate-self` checks are **not** to be made green as part of
    this. They will correctly report `NON_COMPLIANT` from the four recorded rejections.

  Against the merge that occurred: the first criterion **failed** — `steps: 0` and a 4-second
  duration are exactly what it was written to exclude. The second was **honoured**; `validate` and
  `validate-self` were not made green, and both still report `NON_COMPLIANT` from the four recorded
  rejections.
- **Verification:** what was actually established, and what was not.
  ```bash
  gh pr view 15 --json state,mergedAt,mergeCommit
  #   MERGED  2026-08-11T21:16:17Z  0a0e7d4          ← the merge happened

  gh api repos/:owner/:repo/actions/jobs/93929943347 -q '.conclusion, (.steps|length)'
  #   failure  0                                     ← the check did not run

  gh api repos/:owner/:repo/check-runs/93929943347/annotations -q '.[].message'
  #   "The job was not started because recent account payments have failed..."
  ```
  The first command verifies the deliverable. The second and third verify the *absence* of the
  evidence the acceptance criterion required, and are recorded here so that absence stays legible
  rather than being rediscovered from the commit graph later.
- **Dependencies:** account-side restoration of the plan capability that provides both Actions
  minutes and private-repository branch protection. This is **outside this repository and outside
  what any agent working in it can do** — nothing in the codebase can unblock it, and no amount of
  local verification substitutes for it.
- **The 403 suggests a remedy that is not one.** GitHub's message reads *"Upgrade to GitHub Pro **or
  make this repository public**"*, and the second half is not an option here. Repository visibility
  is a far broader security and governance decision than recovering a blocked merge path, and
  trading it for a gate would be paying in the wrong currency. **Restore the account capability;
  do not make this repository public to recover branch protection.** Recorded because the remedy is
  offered by the error message itself, and a future reader who has not seen this decision could
  reasonably mistake it for the intended fix.
- **If the block persists and the merge happens anyway**, that is a **governance exception to be
  made explicitly and beforehand**, naming the missing evidence surfaces. It is not to be inferred
  from the merge succeeding, and not to be discovered afterwards from the commit graph.

  → **This is the case that occurred.** Left in its original future-conditional wording rather than
  rewritten, because it is the clearest statement of what should have happened and editing it to
  match what did would erase the standard it was setting. The exception was not made beforehand; see
  the recorded deviation at the head of this item.

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
- **Evidence:** open as of 2026-08-12, with the exclusion boundary implemented and the item's
  remaining criteria unmet. **Reproduced twice, independently:** Moneyball (`test-env-3.13/`, in the
  issue) and Numerai (`test-env-3.11/`, 5.5 GB, gitignored, plus a 98 MB `.mypy_cache/` — recorded in
  the issue's second comment). Two differently-named virtualenvs in two repositories is why the fix
  is the boundary and not another entry in the exclusion list.

  **Established on `develop` 2026-08-12.** `f77c08d` replaces name-matching with two signals that
  identify a tree rather than guess at its name: `ignoredEntries()` asks Git what the repository
  ignores, and `VENDOR_MARKERS` matches `pyvenv.cfg`. **Exclusions made by those two signals** are
  recorded in `loss.excluded` and surfaced in the report; two older skip paths are not, and that is
  the subject of a gap row below. `562d304` carries the owner
  re-attestation of `architecture.no-hidden-global-state` against the changed reviewed surface, which
  the code change had made stale. Both merged through the protected path on a real required-check
  execution — twelve steps, not the zero-step infrastructure block that preceded it. Post-merge
  validation on `develop`: `24 passed, 4 failed, 22 skipped`, `architecture.no-hidden-global-state`
  `passed / attested`, and `unestablishedProhibitions` empty.

  **Not yet established — the five obligations that keep this item open**, plus one superseded row
  kept visible. Each is a Deliverable or an acceptance criterion below, not a new requirement. Two
  were missed in this record's first draft, which claimed the visibility criterion outright and
  omitted the policy mechanism entirely; they were found by external review, and the correction is the
  reason to state the whole set rather than the memorable part of it:

  | Gap | State |
  |---|---|
  | ~~Policy-declared exclusion mechanism~~ | **SUPERSEDED 2026-08-13, not satisfied and not implemented.** `f77c08d` did not meet this wording — no exclusion key exists in [`schemas/project-policy.schema.json`](../../schemas/project-policy.schema.json) or [`scripts/policy.mjs`](../../scripts/policy.mjs), and a repository-derived boundary is not a project-level declaration. The disposition is that the *mechanism* was the wrong requirement rather than an unmet one; see the Deliverables amendment. The behavioural property it was reaching for **is** established. Recorded this way because "not satisfied by `f77c08d`" and "superseded" are different claims, and collapsing them would either credit work that did not happen or erase a decision that did. |
  | No-silent-exclusion, for the *older* skip paths | **Met 2026-08-22 at `a8be93f`.** `SKIP_DIRS` directories are recorded one entry each with the reason `conventional non-project directory`, and ignored individual **files** are recorded as a count and a bounded sample in `excludedFiles`. The granularity difference is kept and now stated: per-file entries would bury the directory-level exclusions that actually change what a run covers, and aggregated is not silent. `collectFiles`'s doc comment, which claimed every exclusion was recorded while the code below it dropped two kinds without a word, was wrong against the criterion rather than the other way round, so the code moved and the comment now describes what the code does. Falsified by restoring the bare `continue` and by disabling the aggregate; each is caught by its own test and by no other. **Previously:** **Partially unmet.** The two new signals record; two older paths still do not. `SKIP_DIRS` directories are skipped with a bare `continue` at [`scripts/standards.mjs`](../../scripts/standards.mjs), and ignored individual **files** are dropped with no per-file record — the latter deliberately and with a stated rationale, the former simply inherited. The criterion says an exclusion that silently shrinks coverage is the same defect class as a silent cap, so inheriting the behaviour does not exempt it. Note also that `collectFiles`'s own doc comment says every exclusion is recorded, which the file contradicts a few lines later; the comment is wrong, not the criterion. |
  | Aggregate total-read budget over tracked content | **Met 2026-08-22, corrected in review; the claim holds at the corrected commit and did not hold at `a8be93f`.** Cost was measured from the file's size on disk, which is not what is retained: decoding replaces each invalid byte with U+FFFD, three bytes each, so 300 KB of `0xff` in a recognised text file passed the precheck and retained 900 KB against a 400 KB limit. Reproduced before it was fixed. The check moved to the decoded text, where the true figure is known; the boundary file is opened and deliberately not retained, and is reported among the files nothing searched. Recorded this way because the earlier row asserted an invariant that was false, and replacing the SHA without saying so would credit a claim that did not hold. A total sits beside the two per-unit caps, because they do not compose into one: the audit holds every text at once in `contents` plus a derived copy in `sources`, so the retained ceiling was `MAX_FILES x MAX_READ_BYTES`, about 8 GB against a 4 GB heap. A file's cost is decided from its size **before** it is opened, so an exhausted run retains no more than its limit rather than the limit plus one file, and the three evidence-loss states stay distinct — never collected (`fileCapReached`), read in part (`truncatedFiles`), collected and never opened (`readBudget`). Every fixture is tracked, committed, first-party, unignored, marker-free and outside `SKIP_DIRS`, so a regression that excluded too much would fail these tests rather than pass them, and the budget is injected per invocation with `--max-total-read-bytes` rather than provoking a real OOM, whose outcome would depend on the host. The flag is on the invocation rather than the environment because [ADR 0014](../adr/0014-run-state-is-owned-by-an-invocation-not-recognised-by-a-table.md) gives run configuration to the run; an unusable value is exit 2, not a silent fall back to the default. **Previously:** Not implemented. `MAX_FILES` and `MAX_READ_BYTES` remain per-count and per-file; there is no total. The heap test sizes a *vendored* tree, which exclusion now handles, so the tracked-content path is untested as well as unbounded. |
  | Signal-isolation fixtures | **Met 2026-08-22 at `a8be93f`, and the earlier wording of this row was wrong about why.** The conclusion held: `test/audit-exclusions.test.mjs` does not prove the repository-ignore behaviour. The reason was not that its fixture carries both signals. Measured against the committed baseline: `buildRepo` runs **no `git` command at all** — the file's only two matches for `git` are the word `.gitignore` — so there is no repository, `ignoredEntries()` is unavailable, the run reports `exclusionsFrom: "unavailable"`, the exclusion set is empty, and the `.gitignore` the fixture writes is inert. That fixture exercises the **marker** signal only, every time, and its virtualenv is excluded as a `vendored dependency tree`. Ordering is real — the repository-ignore check runs in the parent's loop before the directory is entered, while `VENDOR_MARKERS` is consulted only after, so in a real repository a tree carrying both is excluded by the ignore branch — but **ordering is not proof**: it decides an outcome only where both signals are available, and a fixture carrying both cannot demonstrate either one whichever fires. So each signal now has its own falsifier, each a real repository carrying exactly one signal, each asserting the recorded **reason** rather than an absence of findings, which could not distinguish a signal firing from a tree the walk never reached. A third test pins the both-signals case as the ambiguous one it is. Both isolation tests pass on the untouched baseline: the boundary was already correct, and what did not exist was any test that could say which signal produced an exclusion. `.mypy_cache/` cannot serve as the marker-less fixture — it is in `SKIP_DIRS` and leaves by a third path entirely. |
  | Paired transition test | **Met 2026-08-22 at `a8be93f`.** Byte-identical content at the same relative path in two otherwise identical repositories, differing only in which line `.gitignore` carries: reported when governed, absent when ignored, with first-party coverage asserted byte-for-byte equal on both sides so the verdict changed because scope changed and not because the audit went quieter in general. Falsified by widening the exclusion until first-party code went quiet too, which this test and no other catches. Like the isolation fixtures it passes on the untouched baseline, which is the honest finding: the behaviour was right and unproven. |
  | Adopter re-runs | **Still outstanding, and now for a measured reason rather than an unattempted one.** Both were run 2026-08-23 against framework `79e8222` and against the pre-change baseline `e842a5a`, each bound to the adopter's exact revision. **Numerai `04d7eeade`: no verdict delta.** The `validate --json` reports at the two framework revisions are byte-identical apart from `auditedAt`, at `NON_COMPLIANT` with 17 `passed / evaluated`, 6 `passed / attested`, 1 `failed / evaluated`, 5 `not-applicable` and 21 `not-evaluated`, and the five audit findings are the same five. The new behaviour is visible without being load-bearing: exclusion attribution surfaces 11 `conventional non-project directory` entries that the bare `continue` had been discarding — the `__pycache__` trees and `.mypy_cache` — beside the 6 `ignored by the repository` entries that were already recorded, including the `test-env-3.11` virtualenv this issue was opened for, and 8 previously invisible ignored files are now counted with a bounded sample, `.env` among them. The aggregate budget retained 1,894,248 bytes against its 268,435,456-byte default, 0.7% of the limit, so it was not exhausted, no content-derived rule was withdrawn, and the unchanged verdict is the expected result rather than an absence of effect. **Moneyball `42b826f`: no verdict at either revision.** Its `project-policy.yml` declares `standardVersion: "2.0.1"`; this framework is `2.0.0` at `e842a5a`, at `79e8222` and at `origin/develop`, so both runs stop at `VERSION_MISMATCH` before any rule is evaluated. That is identical before and after, so it establishes that this change causes no delta there — and it establishes nothing whatever about the exclusion attribution or the read budget on that repository, because the run never reaches them. **This row therefore does not close on this evidence.** One of the two reproducing adopters cannot be validated by this framework at all, and a re-run that refuses to produce a verdict is not a re-run that confirms one. The version pin is an adopter-side condition that predates this work and is not repaired here. |

  The exclusion boundary landing does not narrow what this item requires. The aggregate-budget gap in
  particular reproduces the original OOM on a large enough *tracked* tree, which is why it was written
  into the closure contract rather than left as a follow-on.

  **Five of the six rows closed 2026-08-22**, verified by the complete pipeline against committed
  content at each exact commit, with `validate` advisory as it is on `develop`. Two review findings
  were reproduced and fixed after the first submission, so the closure binds to the corrected head
  rather than to `a8be93f`: the budget accounting above, and a second defect that is **not** confined
  to this work. Every rule whose evidence is file contents stayed marked `evaluated` when files in
  scope went unsearched, so a prohibited construct in a file no detector opened could produce a
  passing rule and a `COMPLIANT` verdict over evidence nobody has. That hole predates this branch and
  is reachable today through the file-count cap; the aggregate budget added a second way in. Those
  rules are now withdrawn from the evaluated set whenever files went unsearched — the move
  `scm.no-committed-env-files` already makes when the repository cannot be read, generalised to the
  surface (Standard 45 R6, ADR 0008). Truncation is deliberately not a trigger: a truncated file was
  opened and its prefix searched. The `capped` half of the condition is **not** exercised by a test,
  because reaching `MAX_FILES` means creating twenty thousand files; disclosed here rather than
  implied, as the traversal cap already is. Twelve tests across two files, kept apart deliberately: a tree excluded from
  the walk can never exhaust memory, so a green exclusion suite establishes nothing about a large
  tracked tree, and every budget fixture is content the exclusion boundary is required to keep. Ten
  mutations, one per headline invariant, were each killed by the named test and by no other.

  Two things this does **not** claim. `validate` reports `architecture.no-hidden-global-state` as
  `[stale]` again, exactly as `f77c08d` did before `562d304`: the change touches the reviewed surface,
  so the owner's attestation no longer describes what is here. That is the freshness model working
  ([ADR 0011](../adr/0011-attestation-freshness-is-repository-content-not-checkout-bytes.md)), it is
  the owner's to re-record, and nothing here re-records it. And the **Adopter re-runs** row below is
  untouched — this item stays open on it.
- **Purpose:** This is the most severe of the open audit defects, because its failure mode is not a
  wrong answer but no answer: an untracked virtualenv or vendor directory pollutes the findings and
  can exhaust memory, so the audit does not complete at all on repositories that have one.

  The Numerai run establishes a third failure mode beyond inflation and exhaustion: on a large
  enough tree the walk **spends its 20,000-file cap before reaching first-party code at all**. Of
  ~133 evidence paths, 105 were the virtualenv and 12 the mypy cache; none were `scripts/`,
  `phases/*.py`, or `tests/`. The audit then emits its own reduced-coverage finding under Standard 44
  R12 — correctly, but caused entirely by material outside the repository. A quiet result on a large
  repository may mean the audit never arrived.
- **Deliverables:** ~~a project-level exclusion mechanism, declared where a project already declares
  things — the policy — rather than as a new configuration surface.~~ **MECHANISM SUPERSEDED
  2026-08-13; the obligation is not.** Exclusions are derived from authoritative repository metadata
  — what the repository already declares it ignores — with narrow intrinsic dependency markers as a
  second signal. The surviving property, which is what this Deliverable was reaching for:

  > A project can exclude non-project trees from audit through an authoritative repository-level
  > mechanism, without requiring directory-name hardcoding and without causing policy presence or
  > absence to change the audit's evidence surface.

  *Why the placement changed.* The original wording was written before the repository seam existed,
  when the policy was the only place a project could declare anything. Four reasons displaced it, the
  second decisive on its own:

  1. The policy owns **project applicability** — which rules apply to this project — not the
     evaluator's filesystem traversal semantics. They are different authorities.
  2. **`audit` runs without a policy.** A policy-only exclusion mechanism would make the same
     repository audit differently depending on whether a policy happened to be supplied, which is the
     evaluator-placement invariant violated at a different layer.
  3. [ADR 0008](../adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)
     establishes that a claim about repository state must be **measured at the repository seam**,
     not inferred from a directory walk — which is why `ignoredEntries()` exists at all. Ignore
     status is a repository fact; a policy key restating it would be a second, unmeasured copy of
     the thing that ADR forbids asserting without measuring.
  4. `.gitignore` **is** the project's canonical declaration that some material is not its own
     auditable source. Re-declaring those paths in policy would create a second definition of the
     same fact, and two definitions of one fact drift.

  **The old wording is struck rather than deleted so it cannot be re-satisfied by accident.** The
  obvious future "cleanup" is to add an `exclusions:` key to the policy schema so this line reads as
  met. That would be a regression wearing the costume of completion: a second traversal authority,
  drifting against `.gitignore`, and an evidence surface that changes with policy presence. Satisfying
  the struck wording is no longer a way to satisfy the obligation — the block quote above is.
- **Acceptance Criteria:**
  - Exclusions cannot be used to hide a violation from a rule that would otherwise catch it without
    that being visible in the output. An exclusion that silently shrinks coverage is the same defect
    class as a silent cap.
  - The audit reports what it excluded, consistent with the existing rule that a cap is never silent.
  - The existing `SKIP_DIRS` defaults still apply when a project declares nothing.
  - **Paired invariance, not exclusion.** Adding an arbitrary gitignored tree containing
    detector-triggering content to a clean tracked repository leaves the verdict *exactly* unchanged;
    and the same content becoming tracked *does* change it. The second half is what stops the fix
    passing by excluding too much.
  - **A case with no marker file.** `.mypy_cache/` is gitignored, is not a virtualenv, and has no
    `pyvenv.cfg`, so the marker-file signal proposed in the issue does not cover it while gitignore
    status does. It belongs in the fixtures precisely because it defeats the more elegant of the two
    candidate signals.
  - **Aggregate read budget is bounded**, not only per-file and per-count. `contents` and `sources`
    in [`scripts/standards.mjs`](../../scripts/standards.mjs) retain every readable file's text
    simultaneously; `MAX_FILES` (20,000) × `MAX_READ_BYTES` (400,000) permits roughly 8 GB before the
    split copies. Without this, a repository with 20,000 large *tracked* source files reproduces the
    OOM after this item is closed.
- **Verification:** a fixture with a large excluded directory completes and reports the exclusion;
  the invariance pair above; `npm test`.
- **Dependencies:** the policy mechanism in [`04`](04-compliance-and-policy-system.md).
- **Consequence for the two adopters — read before closing this item.** Moneyball and Numerai each
  have a recorded `NON_COMPLIANT` / 91% result taken with the contaminated apparatus. Those are
  **diagnostic evidence of this defect, not either project's adoption baseline**, and both must be
  re-run from the same commit once this closes. Holding a project at its recorded result rather than
  editing the framework to make it pass is right and stays right; treating that result as its
  starting gap set would convert this defect into permanent history for two repositories. Numerai's
  adoption is paused here for that reason.

### Settle ADR 0008's canonical identity

- **Status:** READY
- **Tracked by:** GitHub issue [#17](https://github.com/mikeycdavis/EngineeringStandards/issues/17)
- **Evidence:** open as of 2026-08-11.
  [`scripts/repository.mjs`](../../scripts/repository.mjs) cites ADR 0008 twice under two filenames —
  `0008-the-source-of-truth-gap-working-tree-versus-repository.md` at line 26 and
  `0008-detectors-do-not-assert-repository-state-they-have-not-measured.md` at line 98. Only the
  second exists in `artifacts/adr/`.
- **Purpose:** The smallest of the open defects and the one most likely to be closed by assumption.
  The obvious reading is a rename that missed a reference, and the obvious fix is to correct line 26
  — but the two titles name different things. One is a constraint on detector behaviour; the other is
  the architectural distinction that constraint follows from, and it is the more general statement.
  It is also the one the audit-exclusions item above needs, since *which content surface evaluation
  operates on* is upstream of how any individual detector behaves.

  So the question is which of three this is: a rename error; an intended second ADR, referenced
  before it was written and never written; or two decisions collapsed into one during drafting. ADR
  0011 applying the same working-tree-versus-repository principle to attestation freshness is weak
  evidence for the latter two — a general decision existing conceptually while only its specific
  applications are written down.
- **Deliverables:** one intentional canonical identity for the decision, with every citation
  resolving to it.
- **Acceptance Criteria:**
  - The investigation records which of the three it was, rather than leaving a corrected path with no
    explanation. **Do not presuppose "fix the link"** — that is the cheapest answer and the one this
    item exists to question.
  - Every ADR path cited from `scripts/` resolves to a file that exists.
  - A mechanical check establishes that, so the next rename is caught rather than found by reading.
    Standard 42 (documentation freshness) is the likely owner.
- **Verification:** `npm test`; the link check runs over `scripts/` and fails on a deliberately
  broken reference.
- **Dependencies:** none — **unless** the answer is the second or third possibility and the general
  decision must be stated before evaluation scope can be built on it. In that case this sequences
  *ahead of* the audit-exclusions item above rather than beside it. Deciding which is the first task.

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

### Decide how the plan-item field parser handles qualified headings

- **Status:** READY
- **Tracked by:** GitHub issue
  [#19](https://github.com/mikeycdavis/EngineeringStandards/issues/19)
- **Evidence:** open as of 2026-08-11. The parser in
  [`scripts/standards.mjs`](../../scripts/standards.mjs) matches
  `/^\s*-\s+\*\*([^:*]+):\*\*\s*(.*)$/` and compares the captured name against a fixed
  `PLAN_FIELDS` list. **Four occurrences**, all in this file, all authored as ordinary prose:
  `Acceptance Criteria` twice, `Verification` once, `Evidence` once.
- **Purpose:** Two distinct failure shapes, and the second is the reason this is a defect rather
  than a syntax constraint:
  - **Qualifier before the colon** — `- **Acceptance Criteria — the resumption condition:**` parses,
    and the content is filed under a key nothing reads. The parser *has* the field and discards it.
  - **Qualifier with no colon** — `- **Verification — what was established.**` does not match at all.

  **The fourth occurrence widened the defect materially.** `Evidence` is not in `PLAN_FIELDS`, so
  its loss produced **no symptom whatsoever** — R7 never reported it, the audit stayed at zero
  findings, and it was found only by a one-off script written during the 2026-08-11 plan audit. So
  the impact is not confined to required fields generating a misleading *"missing required field"*
  message; for optional fields, a qualified heading disappears silently and permanently.
- **Deliverables:** a decision on the owning layer and the fix, plus a regression. Deliberately not
  chosen here — the parser could recognise a known field name as a prefix, or the plan format and
  templates could make the exact token mechanically unavoidable. A third option is compatible with
  either: report an unrecognised field key as its own finding, so a near-miss explains itself.
- **Acceptance Criteria:**
  - A qualified heading is either accepted or produces a finding that names the heading as the
    cause. `(no Acceptance Criteria)` against an item that visibly has one is the outcome to remove.
  - The fix covers fields outside `PLAN_FIELDS`, or the plan explicitly records that it does not and
    why. Fixing only the required fields would leave the silent case exactly as it is.
  - A prefix-matching fix must not misread `- **Verification of the digest:**` as the `Verification`
    field. Whichever direction is taken needs a known-negative fixture, not only a known-positive.
- **Verification:** `npm test` with the new fixtures; plant a qualified heading of each shape in a
  fixture plan item and confirm the chosen behaviour, including for a non-required field.
- **Dependencies:** none.
- **Repairing the four instances is not fixing this.** The malformed `Evidence` heading in this file
  was corrected in the same change that created this item. That removed one specimen; the parser
  behaviour is unchanged and the next qualified heading will do the same thing.

### Decide which layer detects unresolved merge-conflict metadata

- **Status:** READY
- **Tracked by:** GitHub issue
  [#21](https://github.com/mikeycdavis/EngineeringStandards/issues/21)
- **Evidence:** open as of 2026-08-11, and **reproduced on `develop` rather than hypothesised**.
  Three cherry-pick conflict markers reached `develop` in this file, introduced by `8870a43` and
  removed by `18857e9`. While they were present the repository passed `inventory`, `fidelity`,
  `policy`, `diagrams`, 229 tests, and a self-audit reporting **0 errors and 0 warnings**.
  `git diff --check` detects them in one command and names the lines.
- **Purpose:** Unresolved merge metadata can sit in a tracked file — in the canonical release-gate
  artifact, inside a plan item's `Verification` field — while every gate reports clean. The plan
  parser reads `- **Field:**` lines and ignores all others, Markdown renders markers as ordinary
  text, and the tests assert behaviour rather than file-content shape. The defect was found by
  external review, not by this repository's own tooling.
- **Deliverables:** a decision on the owning enforcement layer, and a check with fixtures. **The
  layer is deliberately not chosen here**, because the incident does not settle it. The question
  underneath: is unresolved merge metadata a *finding about the repository*, or a *hygiene
  precondition* that should fail before the evaluator is asked anything? Candidates are a repository
  hygiene command run by CI alongside the existing invariant checks, an `audit` finding category, or
  an extension of an existing validation layer.
- **Acceptance Criteria:**
  - **Known positive:** a file containing genuine unresolved markers is detected.
  - **Known negative:** documentation that *mentions* conflict-marker syntax is not flagged —
    including issue #21 itself, this plan item, and any standard or design document explaining merge
    conflicts. A naive content scan would flag the very documents describing the rule, which is the
    use/mention defect ([ADR 0009](../adr/0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md))
    that has already shipped five times here.
  - The regression is a known-negative guard, not only a known-positive one.
- **Verification:** `npm test` with both fixtures; `git diff --check` exits 0 on a clean tree.
- **Dependencies:** none.
- **One specimen removed is not one class prevented.** `18857e9` deleted the markers that reached
  `develop` and the repository is currently clean. That establishes nothing about whether the next
  ones would be caught, and this item stays open until a check with both fixtures exists. The two
  claims are kept separate deliberately.

### Make remediation carry the sequencing its repository state requires

- **Status:** READY
- **Tracked by:** GitHub issue
  [#32](https://github.com/mikeycdavis/EngineeringStandards/issues/32)
- **Evidence:** open as of 2026-08-16, verified at `e842a5a`.
  [`scripts/init.mjs`](../../scripts/init.mjs) recognises the reconstruction state and sets
  `nextStep` to *"Run the project-reconstruction skill (Standard 44). Do NOT author a plan as though
  this project were starting now."*
  [Standard 44](../../standards/44-existing-project-reconstruction.md) requires the reconstructed
  plan to live under `artifacts/project-plan-breakdown/`, and requires that `/plan-structure` and
  `/plan-handoff` **MUST be applied to the reconstructed plan**.
  In that state the directory is created empty on purpose, so `planning.breakdown-directory` fails,
  and its remediation in [`rules/planning.json`](../../rules/planning.json) reads *"Run
  /plan-structure and /plan-handoff, writing each top-level section to its own file…"* with no
  mention of what must happen first.
  `planning.handoff` also prescribes `/plan-handoff` and is `manual-review`, so it emits no
  finding — **catalog-wide scope evidence, not a second live specimen.**
- **Purpose:** Ensure that when this framework explicitly recognises a repository state, remediation
  preserves the prerequisites, sequencing and context that make the prescribed action valid in that
  state.

  ```text
  wrong implication
      reconstruction state
      -> run /plan-structure + /plan-handoff now

  required sequence
      reconstruction state
      -> reconstruct an evidence-based plan under Standard 44
      -> apply /plan-structure + /plan-handoff to that reconstructed plan
  ```

  **The two instructions are not literally contradictory, and this item does not claim they are.**
  The remediation never says to fabricate a greenfield plan, and the prescribed tools are eventually
  required by Standard 44 itself. What is missing is the ordering: a user shown this remediation
  before reconstruction can reasonably run the right tools at the wrong stage and produce planning
  material without the reconstruction evidence that gives it meaning. **The defective part is the
  remediation, not the finding** — `planning.breakdown-directory` failing in the reconstruction state
  may well be correct, and "make reconstruction pass" is explicitly out of scope.
- **Deliverables:** a measured decision among the remediation alternatives, the normative invariant,
  implementation of the selected mechanism, and regression coverage over the reconstruction state.
  **The mechanism is deliberately not chosen here**, but the candidates are no longer equally
  motivated. State-conditional remediation and a reconstruction-specific remediation string are the
  two the specimen directly supports. **Suppression is not**, because the finding may be legitimate;
  a deeper applicability change stays open for measurement but is no longer implied, since it was
  implied only by a contradiction that does not exist.
- **Acceptance Criteria:**
  - The invariant is recorded normatively, in a form a future rule author is bound by: *for every
    repository state the framework explicitly recognises, remediation must preserve the
    prerequisites, sequencing and context that make the prescribed action valid in that state.*
  - For a repository in the reconstruction state, remediation that prescribes `/plan-structure` or
    `/plan-handoff` also states that reconstruction comes first and that those skills apply to the
    reconstructed plan.
  - The chosen implementation is recorded together with the alternatives measured and rejected.
  - A test exercises the reconstruction state end to end and fails if emitted remediation omits the
    sequencing `init`'s `nextStep` establishes for that same state.
  - `planning.breakdown-directory` remains a legitimate finding in the reconstruction state unless a
    measured decision says otherwise.
- **Verification:** `npm test` with the reconstruction-state fixture; the self-audit unchanged.
- **Dependencies:** none. **Do not modify rule, remediation, or reconstruction semantics before the
  mechanism is measured and selected.**
- **Boundaries, recorded so they are not crossed later.** Section 04 owns the compliance and policy
  architecture and may ultimately receive the implementation, but this item is **not** also assigned
  there and no cross-section `Tracked by` is added — that would be use, not ownership, and would
  prematurely imply the remedy belongs in the compliance engine. It is **not** FE-21 fallout:
  StandardsEnforcer's policy-marker defect measurably does not transfer here, since
  `project-policy.yml` is the only marker any surface names and there is no `--policy` override to
  widen. It is **not** #9 or #16 — adjacency is not ownership. It is **not** evidence that Standard 44
  is wrong; Standard 44 is the surface that supplies the missing ordering.
- **Corrected 2026-08-16 before merge, and the original claim is not preserved as if it held.** This
  item was first written as a direct contradiction — that the remediation instructs an action `init`
  forbids. Review against Standard 44 falsified that: the standard requires those same skills over
  the reconstructed plan, so the two literal instructions can both be followed in the right order.
  The user-facing outcome was identified correctly and its causal model was overstated. The record
  of the overstatement is kept here because the ownership-before-implementation sequence is what
  caught it, while no code had been changed.

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

# 08 — Open defects, recorded rejections, and deferred tracks

**Added 2026-08-11.** Everything in this repository that is currently open, plus everything that is
deliberately not being worked on and the reason. It exists so that *open* and *dormant* are visible
states rather than absent ones.

Before the plan repair, eleven GitHub issues, four recorded rule rejections, and a set of deliberately
deferred design questions existed as a parallel obligation system that no plan item claimed. A plan
that omits its own open work will always report itself complete.

**Every open GitHub issue is claimed by exactly one plan item — except four, named below, and
nothing checks this.** Fifteen are open. Five are claimed here — #1, #4, #19, #21, #32 — six are
claimed where their subject lives, and #45, #46, #48 and #49 are claimed by nothing, which the
amendments at the end of this section derive and do not round away. The six live where their subject
does:
[#10 and #11](04-compliance-and-policy-system.md) by the exception machinery,
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

**Amended 2026-08-28:** **#38** closed at `a6fa7f0`, so it leaves both the open set and *claimed
here*, taking fourteen/eight to thirteen/seven. Six elsewhere is unchanged.

**Re-derived, not decremented**, which is what this paragraph's own history asks for. The open set
was read from `gh issue list` — #1, #2, #3, #4, #6, #8, #9, #10, #11, #16, #19, #21, #32 — and
*claimed here* from the `Tracked by` fields in this file rather than from its links, per the
ownership rule two paragraphs above. Seven and six partition thirteen with nothing counted twice. The
arithmetic agreeing with an increment is a check on the increment, not a substitute for the
derivation: three of the four amendments below were arrived at by incrementing, and two of them were
wrong.

**Amended 2026-08-28 (second), and the invariant above no longer holds.** Two arrivals and two
departures move the total by nothing and the composition by four, which is exactly the shape an
increment gets wrong. **#6** and **#8** close at `e7a6d22` and leave both sets together, being one
item. [#45](https://github.com/mikeycdavis/EngineeringStandards/issues/45) (`validate-self`'s
framework pin, and what the pin is for) and
[#46](https://github.com/mikeycdavis/EngineeringStandards/issues/46) (the catalog's unconditional
"never a failure") were opened while closing #38 and this item, and **no plan item claims either**.

Re-derived rather than adjusted: the open set read from `gh issue list` is #1, #2, #3, #4, #9, #10,
#11, #16, #19, #21, #32, #45, #46 — thirteen. *Claimed here*, from the `Tracked by` fields, is #1,
#4, #19, #21, #32 — five. Claimed elsewhere is #2, #3, #9, #10, #11, #16 — six. **Unclaimed: #45 and
#46 — two.** Five, six and two partition thirteen with nothing counted twice.

**Superseded within the day by the third amendment below**, which is the point rather than an
embarrassment: this paragraph was re-derived correctly and was stale in under an hour, because two
more issues were filed after the derivation and nothing recomputes it.

The unclaimed pair is recorded rather than absorbed. Renumbering the sentence above until the
arithmetic closed would have restated the invariant as satisfied while it was not, which is the
failure this whole paragraph exists to prevent, one level up: a count that is made to agree is not a
count. Both are findings whose scope nobody has settled — #45 turns on what the pin is *for*, and
#46 on whether the mechanism or the sentence should move — and scoping them is the work of opening
items, which is a decision rather than a formality. Until that happens the honest statement is that
the invariant holds for eleven of thirteen and is named as broken for the other two. The total
returning to thirteen is a coincidence of two closures meeting two openings, not evidence that
nothing moved.

**Amended 2026-08-28 (third), after running what this repository actually has.** The reconciliation
asked for here does not exist. `scripts/tracking.mjs` runs the **item to issue** direction — given an
item, is its `Tracked by` authority reachable and does it contain the id — and reports `resolved`,
`missing` or `unverifiable`. Nothing runs **issue to item**. On merged `develop` (`1cd886f`)
`planning.item-fields` and `planning.breakdown-directory` pass, `planning.plan-code-consistency` and
four other `planning.*` rules are `not-evaluated`, and the audit reports zero plan-related findings.
None of that establishes the invariant; it is the `passed` versus `not-evaluated` distinction of
Standard 24 R4, and this invariant sits in the second column while being written as the first.

**So no plan items were created here.** The instruction was to mint them only if the mechanism says
the open issues require canonical ownership, and the mechanism does not say so because no mechanism
asks. Minting four items on my own judgement would scope work nobody has scoped, and would repair the
arithmetic by producing owners rather than by establishing ownership — the same move this paragraph's
history warns about, one level up.

Re-derived from `gh issue list`: open is #1, #2, #3, #4, #9, #10, #11, #16, #19, #21, #32, #45, #46,
#48, #49 — fifteen. *Claimed here*, from the `Tracked by` fields, is #1, #4, #19, #21, #32 — five.
Claimed elsewhere is #2, #3, #9, #10, #11, #16 — six. **Unclaimed is #45, #46, #48 and #49 — four.**
Five, six and four partition fifteen with nothing counted twice.

The unclaimed set grew because #48 (a working tree that changed branches under an in-progress edit)
and #49 (this invariant being asserted by prose and established by nothing) were filed while carrying
out this normalisation. **#49 is itself unclaimed, and that is not an oversight to tidy.** An issue
filed and not yet scoped is a legal state this file already recognises elsewhere; a check that
forbade it would force items to be minted before anyone had scoped them, and any issue about the
claim invariant would be unclaimed the moment it was filed. Whether "unclaimed" is recordable, and
how, is the decision #49 asks for — and it has to come before the check, because building the check
first fixes the arithmetic and loses the distinction.

**Amended again 2026-08-25:** **#7** closed on owner review of its seven-criterion contract, so it
leaves both the open set and *claimed here*, taking fifteen/nine to fourteen/eight. Six elsewhere is
unchanged. Written here rather than only in the item below, because this paragraph has now drifted
silently three times, each time because a movement was recorded where the work happened and not
where the count is asserted. The count is a shared counter with no owner, and every item that opens
or closes has to touch it.

**Amended 2026-08-24, from two drafts that were each wrong in a different direction.** Three
independent movements landed against this paragraph within two days, and neither draft saw all of
them:

| Movement | Effect on the open set | Effect on *claimed here* |
|---|---|---|
| **#17** closed 2026-08-23 at `9a3e7dd`, ADR 0008's canonical identity settled | leaves | leaves |
| **#38** opened 2026-08-23, unavailable content read as content | joins | joins |
| **#7** reopened 2026-08-24 by owner ruling, its exclusion-completeness criterion falsified | rejoins | rejoins |

The paragraph read *"Fifteen are open. Nine are claimed here"* before any of them, which counted
neither #38 nor the reopening. It was then amended twice, concurrently and in ignorance of the other
amendment: once to *"Fourteen are open. Eight are claimed here"*, which correctly removed #17 and
still did not count #38, and once to *"Seventeen are open. Eleven are claimed here"*, which correctly
added #7 and #38 and **left #17 in the open set after it had closed**. One departure and two arrivals
net to no change in the total and to one more owned here, so the figures are **sixteen open, ten
claimed here, six elsewhere**, and the partition is the whole open set with nothing counted twice.

Recorded at this length because the failure is instructive and neither draft was careless. Each
amendment was correct about the issue its author had just touched and stale about the one they had
not, which is the normal condition of a shared counter and not an accident. **A count is not
evidence of the thing it counts.** This paragraph asserts the claim invariant and cannot check it;
that #17's closure was reachable only by reading the section, and #38's existence only by reading
GitHub, is why the arithmetic must be re-derived from the issue list rather than adjusted by
increment. The earlier figures are all stated rather than replaced, because a count that changes
silently is indistinguishable from one that was always wrong.

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
not *healthy*. The exemption is from *terminal disposition*, which would misdescribe an ongoing
obligation; it is not an exemption from being in good standing at the moment of release. A control
that may remain nonterminal forever earns that only by being in good standing **now**.

**Release health is defined in the table below, not by the item's own `Verification` line.** The two
answer different questions and the release bar is the stricter of them: an item's `Verification`
line asks whether the control is operating normally day to day, which tolerates ordinary lifecycle
states, while release health asks whether the obligation the control exists to maintain is actually
met at the release boundary. Letting the item supply its own release-health test would reintroduce
the self-exemption this section just closed, one level down.

#### Designated standing controls

This is the complete list. Adding to it requires amending this section.

| Standing control | Why terminal disposition is inapplicable | Healthy when | Designation reconsidered when |
| --- | --- | --- | --- |
| [Keep the framework's own attestations owner-established](05-attestations-and-provenance.md) | The obligation is that a *person* keeps feeding the attestation machinery. It has no completion state: `COMPLETE` would claim future reviews are already done, `DEFERRED` would claim the framework's own compliance record is postponed, and `CANCELLED` would abandon [ADR 0005](../adr/0005-attestations-are-recorded-human-evidence.md)'s core requirement. Its openness is the obligation, not an undecided question about it. | Every applicable forbidden `manual-review` rule has a **current** owner-established disposition, or a not-applicable declaration valid under its own rules. `node scripts/standards.mjs validate .` reports no such rule as `unrecorded`, `stale`, or otherwise unestablished. Staleness stays a normal lifecycle state awaiting owner action — not a defect, not a rejection, and not a compliance failure — but **while stale the control is not release-healthy**, because a stale attestation is precisely the state in which the repository as it now stands has not been owner-established for that rule. The item's own `Verification` line is the weaker operational check and is deliberately not this one. | Attestation renewal stops requiring a human judgement — for instance if owner review became mechanically derivable, at which point the item would have a completion state and would no longer be a standing control. |

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

- **Status:** COMPLETE — **closed 2026-08-25 by owner review, on the seven-criterion contract as
  it now stands.** The full history is `COMPLETE` -> `READY` -> `IN_REVIEW` -> `COMPLETE`, and every
  step of it is kept below.

  **What the owner approved, in their own terms:** closure of *the item's presently stated acceptance
  contract*, deliberately narrower than a claim that no eighth criterion can ever be discovered. This
  item has already had a criterion discovered after it closed; a closure that claimed otherwise would
  be making the same mistake in the same place.

  **Closure was taken after both the criterion and its consequence were verified, not after the
  criterion alone.** The seventh criterion was met at `f564d6c`, and that same commit introduced a
  human-rendering regression — a run whose only loss was a tool-decided exclusion printed
  `Evidence surface INCOMPLETE — .`, naming nothing — which was found in review and repaired at
  `ebb8db9`. The owner's disposition is recorded against the state that carries both, and not
  against the intermediate head that carried only the first. This distinction is written down because
  a closure record that named `f564d6c` alone would read as approval of a head already known to be
  defective, and the reader would have no way to tell that it was not.

  **Why it was not closed by this item on its own authority.** All seven criteria have an
  establishing commit and a falsifier, and that was true at `IN_REVIEW` too. It was not sufficient
  then and is not what closed the item now: the first closure also rested on every criterion then
  stated having an establishing commit and a falsifier, and the criteria set was incomplete. What
  changed is that a second party reviewed the contract and took the disposition. Under
  [ADR 0005](../adr/0005-attestations-are-recorded-human-evidence.md) the agent does not attest to
  its own work, and closing an item on the strength of the reasoning that failed the first time would
  be exactly that.

  **Previously: IN_REVIEW — the seventh criterion is met at `f564d6c`; whether that closes this
  item a second time is the owner's call and is deliberately not taken here.** All seven acceptance
  criteria have an establishing commit and a falsifier. This item nonetheless closed once already,
  on a criteria set that turned out to be incomplete, and an item that re-closes itself on the
  strength of the same reasoning that failed the first time is asserting exactly what it cannot
  establish. `IN_REVIEW` is nonterminal, so release closure stays blocked while the disposition is
  open — which is the correct state for work that is done and not yet judged.

  **Previously: READY — reopened 2026-08-24 by owner ruling.** This item held `COMPLETE` from
  2026-08-23 at `05df6e8`. That disposition is superseded rather than deleted, and the whole closure
  record it rested on is kept below, because an item that closed and then reopened is a different
  history from one that never closed and only the first of the two can be audited.

  **The finding, stated narrowly:** *tool-decided directory exclusion can remove tracked first-party
  evidence without making the evidence surface incomplete; therefore the exclusion boundary
  previously accepted as complete is not complete.*

  **Measured 2026-08-24.** Two repositories, byte-identical bait at the same filename, **no
  `.gitignore` anywhere**, full budget, nothing declared by the project. The only difference between
  them is the name of the directory the bait sits in. `git ls-files` is printed so the content is
  proved tracked and committed rather than assumed:

  ```text
  --- bait in src/ ---
    git ls-files             : project-policy.yml, src/query.js, src/tls.js
    security.no-sql-concat   : failed / evaluated
    security.no-cert-bypass  : failed / evaluated
    excludedDirectories      : []
    complete: true   capped: false   exhausted: false

  --- bait in fixtures/ ---
    git ls-files             : fixtures/query.js, fixtures/tls.js, project-policy.yml
    security.no-sql-concat   : passed / evaluated
    security.no-cert-bypass  : passed / evaluated
    excludedDirectories      : [{"path":"fixtures","reason":"conventional non-project directory"}]
    complete: true   capped: false   exhausted: false
  ```

  Two **forbidden** rules report `passed` over tracked, committed, first-party code carrying a real
  violation, because the directory is named `fixtures`. `SKIP_DIRS` in
  [`scripts/standards.mjs`](../../scripts/standards.mjs) carries `fixtures` and `vendor` beside
  `node_modules`, `dist` and `__pycache__`. The specimen was originated by a concurrent review
  session and reproduced here independently before being recorded; the bait is copied from this
  repository's own `test/fixtures/never-violations/src/`.

  **Why this falsifies this item's own criterion rather than #38's.** Criterion 2 requires that the
  audit reports what it excluded, and it does — the exclusion is named in `excludedDirectories` with
  its reason, so criterion 2 holds. What fails is the completeness claim standing beside it. The same
  report simultaneously lists the exclusion and asserts `complete: true`, so a consumer reading the
  surface is told the evidence is whole while a tracked first-party tree was never opened, and
  criterion 1's *invisibly* is defeated one level up from where it was checked. The exclusion
  boundary is this item's subject, so the defect is this item's.

  **The three-way split this establishes**, which corrects a two-way split first recorded on #38:

  | Loss mode | Who decided | Reporting `complete` over it |
  |---|---|---|
  | repository-ignore exclusion | the **project** declared it disposable | defensible |
  | `SKIP_DIRS` exclusion | the **tool** decided, from a hardcoded name | not defensible |
  | read budget / file cap | undeclared capacity failure | not defensible |

  The split that failed put every exclusion on the defensible side, on the reasoning that an
  exclusion is a declared scope decision. That holds for `ignoredEntries()` and is false for
  `SKIP_DIRS`, where nothing was declared: the project committed `fixtures/`, and the tool decided
  it was disposable from a hardcoded name list.

  **`evidenceSurface.complete` already states the principle it breaks.** The doc comment directly
  above the expression reads *"An eligible file nothing opened is exactly as absent from the results
  as one beyond the file cap, so a surface that still claimed completeness would be making the
  stronger available claim on the weaker evidence."* It was written for budget exhaustion and
  generalises to exclusion without modification. The expression beneath it lists `unreadableFiles`,
  `dirs`, `truncatedFiles`, `capped` and `budget.exhausted`, and does not list `excluded`. So no new
  principle is needed here — only the application of the one already on the page. **This is the third
  instance of one shape in this file, and every one was found by a human reading prose against code
  rather than by a check:** `collectFiles`'s comment claimed every exclusion was recorded while the
  code below it dropped two kinds without a word (corrected at `a8be93f`, in the gap table below);
  the aggregate-budget row asserted a mechanism the code no longer used (corrected 2026-08-23, in the
  same table); and `complete` now. A stated invariant that nothing executes has now drifted three
  times in one file, which is an argument about mechanism and not only about this defect.

  **What is not reopened.** #38's unread-content symmetry is a separate and broader
  evaluator-integrity defect with [its own item](#unavailable-content-evidence-must-never-be-read-as-content):
  content the run did not obtain is coerced to empty content, fabricating passes and failures across
  detectors this exclusion boundary does not touch. Whether `fixtures` and `vendor` are the right
  names to drop is a third question, about the name list rather than about completeness, and is not
  this item either. One implementation may touch the same code for this item and for #38; the claims
  stay separate and each closes on its own acceptance evidence.

  **Previously — the closure record this reopening supersedes, kept in full.** COMPLETE — 2026-08-23,
  `05df6e8` on `develop`, established by the repository gate at
  `dfbc67f` (six stages passed; `validate` advisory) and by the adopter re-runs recorded in the gap
  table above. **Closed on the Acceptance Criteria, which is what the terminal-status contract at the
  top of this section requires**, not on the gap table: **all six criteria are met**, each named
  below with the falsifier that would fail if it stopped holding, one of the six gap rows was
  superseded rather than satisfied, and the adopter obligation is the *Consequence* bullet, which
  sequences the re-runs *once this closes* rather than before it.

  | # | Acceptance criterion | Established by |
  |---|---|---|
  | 1 | Exclusions cannot hide a violation invisibly | `identical content is reported when governed and excluded when ignored`, plus the reporting in 2 — the excluded path is named with its reason, so a shrunk surface is stated rather than inferred |
  | 2 | The audit reports what it excluded | `a SKIP_DIRS directory is recorded rather than silently dropped` and `ignored files are accounted for in aggregate rather than per file`; `evidenceSurface.excludedDirectories` and `.excludedFiles` |
  | 3 | `SKIP_DIRS` defaults still apply with no declaration | `a SKIP_DIRS directory is recorded rather than silently dropped`, run against a repository declaring nothing |
  | 4 | Paired invariance, both halves | `identical content is reported when governed and excluded when ignored` — byte-identical content at the same path in two repositories differing only in one `.gitignore` line |
  | 5 | A case with no marker file | `an ignored tree carrying no marker is excluded BY THE REPOSITORY signal`, with `a marker tree the repository does not ignore is excluded BY THE MARKER signal` and `the fixture that carries both signals cannot isolate either` separating the two signals |
  | 6 | Aggregate read budget is bounded | `retained evidence cannot exceed the budget the invocation was given`, `the three evidence-loss states stay distinct`, `a default run applies a real budget rather than none at all`, `a file that expands when decoded cannot breach the budget`, and `a content rule cannot pass over files nothing searched` |

  **A seventh criterion is added 2026-08-24, rather than the sixth being reworded.** The
  falsification recorded in the Status above leaves criterion 2 standing and defeats criterion 1 at a
  level above where it was checked, so rewriting an existing row would erase the fact that the
  earlier closure was reached honestly against the criteria as they then read. The new row is stated
  with its falsifier like the others:

  | # | Acceptance criterion | Established by |
  |---|---|---|
  | 7 | A framework-caused loss of eligible project evidence makes the evidence surface incomplete | **Met 2026-08-25 at `f564d6c`, with a consequence in the human rendering repaired at `ebb8db9`.** The predicate change made a mode of incompleteness reachable that `renderHuman` had no reason for, so a run whose only loss was a tool-decided exclusion printed `Evidence surface INCOMPLETE — .` — incompleteness declared and then not named, which is this same defect one layer up in the sentence a person reads. It was introduced by this criterion's own commit: before it, `complete` could only go false through a mode that pushes a reason, so the empty branch was unreachable. It survived the criterion's four falsifiers because every one of them reads `--json`, where the field was correct throughout, and it was found by review rather than by this repository's own tests. Recorded in the row rather than only in the commit, because a criterion whose fix required a second fix is not the same evidence as one that did not. `evidenceSurface.complete` now has a sixth term, and each exclusion entry carries `authorizedBy` beside `reason` — the two answer different questions, and only the first bears on completeness. **Authority is asked, not inferred**, because `SKIP_DIRS` is consulted *before* the repository-ignore set: a name match wins the reported `reason` even where the repository independently ignores the same path, which is the ordinary state of every real dependency tree. Deriving authority from `reason` alone would have reported almost every repository as having lost evidence it had itself declared disposable, so the `SKIP_DIRS` branch consults the ignore set directly. The walk order is deliberately left alone: it decides which reason is reported, and this decides what that reason is worth, and changing the first to serve the second would rewrite evidence to suit a conclusion. **Three authorities, not two** — `repository` (the project declared it disposable), `framework` (this tool decided, from a name or a marker), and `not-project-evidence` for `.git`, which is the repository's own storage and was never candidate evidence. The third exists because the falsifier below rejected the first implementation, which counted `.git` as lost evidence and reported **every** repository incomplete — the blanket rule arrived at from the other direction. **Falsified four ways**, each by a distinct test: dropping the new term is caught only by the specimen; making the rule blanket is caught by all four; and refusing to consult the ignore set for a `SKIP_DIRS` name is caught only by the both-signals case. **Verdicts are unchanged** — the excluded bait still reports `passed`, which is #38 and stays there. **Previously:** `evidenceSurface.complete` must account for every framework-caused loss of eligible project evidence. A repository-authorized exclusion — content the repository itself marks ignored — may stay outside the project evidence surface without making it incomplete, because the project declared it disposable. A hardcoded tool exclusion over otherwise eligible tracked content must make `complete: false`. Falsifier: the two-repository specimen in the Status above must stop reporting `complete: true` on the `fixtures/` side while a repository-ignored tree continues to report `complete: true`, so a fix that simply made every exclusion incomplete would fail this test rather than pass it. |

  **This line previously read "all five criteria". There are six.** The miscount is corrected rather
  than left, for the same reason the claim-invariant paragraph at the top of this section was
  corrected: a closure justified by a count of criteria is worth nothing if the count is wrong, and
  the criterion that goes unnamed in a miscount is the one nobody checks. Both were nonetheless re-run first
  and both outcomes are recorded, so nothing is deferred into the closure. **`Dependencies` is
  discharged by supersession, not by delivery**: it names the policy mechanism in section 04, and that
  mechanism is the struck Deliverable — no `exclusions:` key exists in the policy schema, and adding
  one to make this line read as met is explicitly recorded above as a regression, not a completion.
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
  | Aggregate total-read budget over tracked content | **Met 2026-08-22, corrected in review; the claim holds at the corrected commit and did not hold at `a8be93f`.** Cost was measured from the file's size on disk, which is not what is retained: decoding replaces each invalid byte with U+FFFD, three bytes each, so 300 KB of `0xff` in a recognised text file passed the precheck and retained 900 KB against a 400 KB limit. Reproduced before it was fixed. The check moved to the decoded text, where the true figure is known; the boundary file is opened and deliberately not retained, and is reported among the files nothing searched. Recorded this way because the earlier row asserted an invariant that was false, and replacing the SHA without saying so would credit a claim that did not hold. A total sits beside the two per-unit caps, because they do not compose into one: the audit holds every text at once in `contents` plus a derived copy in `sources`, so the retained ceiling was `MAX_FILES x MAX_READ_BYTES`, about 8 GB against a 4 GB heap. An exhausted run retains no more than its limit rather than the limit plus one file, because the boundary file is opened and then **not** retained — the transient decode is bounded by the per-file cap and is gone by the next iteration — and the three evidence-loss states stay distinct: never collected (`fileCapReached`), read in part (`truncatedFiles`), collected and never opened (`readBudget`). **This clause read *“a file's cost is decided from its size before it is opened”* until 2026-08-23, and that described the superseded design.** It was written for the size-precheck version and survived the correction recorded earlier in this same row, so the row asserted both that the check had moved to the decoded text and that cost was decided before opening. The conclusion held — retention never exceeds the limit, because the boundary file is skipped before it is stored — and the stated mechanism did not. Corrected rather than left, because a row that reaches a true conclusion by a false mechanism is exactly the defect the *Signal-isolation fixtures* row above was rewritten to record. Every fixture is tracked, committed, first-party, unignored, marker-free and outside `SKIP_DIRS`, so a regression that excluded too much would fail these tests rather than pass them, and the budget is injected per invocation with `--max-total-read-bytes` rather than provoking a real OOM, whose outcome would depend on the host. The flag is on the invocation rather than the environment because [ADR 0014](../adr/0014-run-state-is-owned-by-an-invocation-not-recognised-by-a-table.md) gives run configuration to the run; an unusable value is exit 2, not a silent fall back to the default. **Previously:** Not implemented. `MAX_FILES` and `MAX_READ_BYTES` remain per-count and per-file; there is no total. The heap test sizes a *vendored* tree, which exclusion now handles, so the tracked-content path is untested as well as unbounded. |
  | Signal-isolation fixtures | **Met 2026-08-22 at `a8be93f`, and the earlier wording of this row was wrong about why.** The conclusion held: `test/audit-exclusions.test.mjs` does not prove the repository-ignore behaviour. The reason was not that its fixture carries both signals. Measured against the committed baseline: `buildRepo` runs **no `git` command at all** — the file's only two matches for `git` are the word `.gitignore` — so there is no repository, `ignoredEntries()` is unavailable, the run reports `exclusionsFrom: "unavailable"`, the exclusion set is empty, and the `.gitignore` the fixture writes is inert. That fixture exercises the **marker** signal only, every time, and its virtualenv is excluded as a `vendored dependency tree`. Ordering is real — the repository-ignore check runs in the parent's loop before the directory is entered, while `VENDOR_MARKERS` is consulted only after, so in a real repository a tree carrying both is excluded by the ignore branch — but **ordering is not proof**: it decides an outcome only where both signals are available, and a fixture carrying both cannot demonstrate either one whichever fires. So each signal now has its own falsifier, each a real repository carrying exactly one signal, each asserting the recorded **reason** rather than an absence of findings, which could not distinguish a signal firing from a tree the walk never reached. A third test pins the both-signals case as the ambiguous one it is. Both isolation tests pass on the untouched baseline: the boundary was already correct, and what did not exist was any test that could say which signal produced an exclusion. `.mypy_cache/` cannot serve as the marker-less fixture — it is in `SKIP_DIRS` and leaves by a third path entirely. |
  | Paired transition test | **Met 2026-08-22 at `a8be93f`.** Byte-identical content at the same relative path in two otherwise identical repositories, differing only in which line `.gitignore` carries: reported when governed, absent when ignored, with first-party coverage asserted byte-for-byte equal on both sides so the verdict changed because scope changed and not because the audit went quieter in general. Falsified by widening the exclusion until first-party code went quiet too, which this test and no other catches. Like the isolation fixtures it passes on the untouched baseline, which is the honest finding: the behaviour was right and unproven. |
  | Adopter re-runs | **Satisfied 2026-08-23 at `dfbc67f`, on the criterion this item actually states.** Both reproducing adopters were re-run against framework `dfbc67f` and against the pre-change baseline `e842a5a`, each bound to the adopter's exact revision. **Numerai `04d7eeade`: full verdict, no delta.** The `validate --json` reports at the two framework revisions are byte-identical apart from `auditedAt`, at `NON_COMPLIANT` with 17 `passed / evaluated`, 6 `passed / attested`, 1 `failed / evaluated`, 5 `not-applicable` and 21 `not-evaluated`, and the five audit findings are the same five. Attribution surfaces 11 `conventional non-project directory` entries the bare `continue` had been discarding, beside the 6 `ignored by the repository` entries already recorded — the `test-env-3.11` virtualenv this issue was opened for among them — and 8 previously invisible ignored files are now counted with a bounded sample. The budget retained 1,894,248 of 268,435,456 bytes, 0.7% of the default, so nothing was withdrawn and the unchanged verdict is the expected result rather than an absence of effect. **Moneyball `42b826f`: audited cleanly, no compliance verdict, and the two are different claims.** `audit` runs to completion and shows the same 9 findings at both framework revisions, byte-identical by severity, rule and message; 36 `conventional non-project directory` exclusions become visible beside the 15 already-recorded ignored ones, 12 ignored files are counted, and the budget retained 8,318,269 of 268,435,456 bytes, 3.1%, without exhausting. `validate` exits 2 with `VERSION_MISMATCH`: `project-policy.yml` declares `standardVersion: "2.0.1"` and the framework is `2.0.0`, as it is at `e842a5a` and on `develop`. **The framework has never been 2.0.1** — its published versions are 0.1.0, 1.0.0, 1.1.0, 2.0.0 — so this is a pin to a version that does not exist, an adopter-side condition contemporaneous with the issue itself, which opens with *"Found adopting v2.0.1"*. It is deliberately not repaired here: editing an adopter's declared version to obtain a verdict would manufacture the evidence the re-run exists to gather. **Why this closes the row.** The obligation is the *Consequence* bullet — re-run both adopters from the same commit and record what happened — and neither it, the Acceptance Criteria, nor issue #7 requires two compliance verdicts; the word verdict appears in none of them. Both were re-run and both results are recorded. That the framework could be exercised against a policy it cannot evaluate is this item's own design working: the Deliverable's second displacing reason is that **`audit` runs without a policy**, so the evidence surface does not change with policy presence — which is precisely why the exclusion attribution and the read budget could be measured on Moneyball at all. **This row previously read as unsatisfiable, and that was wrong.** Its earlier text concluded Moneyball "cannot be validated by this framework at all" from a run of `validate` alone, without running `audit` — the layer this change lives in. The narrower true statement is that no *compliance verdict* is obtainable while the pin stands; the change's behaviour on that repository is measured and unchanged. |

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

- **Status:** COMPLETE — 2026-08-23 at `9a3e7dd`, established by the full repository gate at that
  commit: `inventory`, `fidelity`, `policy`, `diagrams`, `test` and `audit` all passed, 347 tests, 0
  failures. Within it, the thirteen tests in `test/links.test.mjs` and `node scripts/links.mjs` resolve all
  1556 relative links in the repository with none unresolved. The check runs in the gate's `test`
  stage, so a reference written from memory fails a gate rather than waiting to be read. This row is
  the commit after `9a3e7dd` and changes only this line, which is why the gate it names is the one
  before it rather than the one on itself.
- **Tracked by:** GitHub issue [#17](https://github.com/mikeycdavis/EngineeringStandards/issues/17)
- **Evidence:** opened 2026-08-11; measured and closed 2026-08-23.
  [`scripts/repository.mjs`](../../scripts/repository.mjs) cited ADR 0008 twice under two filenames —
  `0008-the-source-of-truth-gap-working-tree-versus-repository.md` at line 26 and
  `0008-detectors-do-not-assert-repository-state-they-have-not-measured.md` at line 98. Only the
  second existed in `artifacts/adr/`.

  **The measurement found all three of the issue's possibilities false, and found a second occurrence
  the issue did not know about.**

  1. **Not a rename.** `0008-the-source-of-truth-gap-working-tree-versus-repository.md` has never
     existed in any commit reachable from any ref. ADR 0008 was created once, at `2c9754c`, under the
     name it still carries, and was never renamed. There was no reference left behind by a move,
     because there was no move — both citations were written from the concept rather than from the
     file, so neither was ever correct.
  2. **Not an unwritten second ADR, and not two decisions collapsed.** The general statement is
     present, as the second paragraph of ADR 0008's own `## Decision`: *"Where a rule's correctness
     depends on repository state, that state is obtained behind a narrow abstraction with a named
     contract — never by reimplementing version control."* That paragraph is the repository-metadata
     seam. Nothing was lost in drafting and nothing is missing.
  3. **It is one decision stated at two levels, of which the title names only the narrower one.**
     Decision paragraph 1 is the constraint on detector behaviour the title names. Paragraph 2 is the
     seam that constraint follows from, and it had no name anywhere. A writer citing it had nothing
     to cite and constructed a name from the concept.
  4. **Two authors did exactly that, independently, in the same sentence shape.**
     [`scripts/repository.mjs`](../../scripts/repository.mjs) line 26 and
     [ADR 0011](../adr/0011-attestation-freshness-is-repository-content-not-checkout-bytes.md) line
     127 both read *"the repository-metadata seam ADR 0008 anticipated"* — link markup and all — and
     both invented the
     same filename. **Issue #17 recorded only the first.** One occurrence is a typo; two, reached
     independently, is a naming gap — which is why the correction names the level rather than only
     repointing the link.
  5. **No executable behaviour was keyed to either identity.** Every citation is prose or comment; no
     test, rule or script branches on an ADR filename. That is why this survived every passing check
     until now, and why the mechanical check is the part of the fix that matters.

  The rest of the corpus had already settled the semantics: `scripts/repository.mjs:98`,
  `scripts/ci-context.sh`, `scripts/ci-context.ps1`, `test/local-ci.test.mjs`, `docs/local-ci.md` and
  `test/audit.test.mjs` all attribute the source-of-truth gap **to ADR 0008 itself**. The repository
  held one identity throughout; only its discoverability was broken.

  **The escape clause did not fire.** This item and its issue both sequence it ahead of the
  audit-exclusions item *if* possibility 2 or 3 holds and the general decision must be stated before
  evaluation scope can be built on it. Neither holds: the general decision was already written, and
  `scripts/repository.mjs` already implements it. #7's exclusion and read-budget evidence is untouched
  by this item and is not reinterpreted by it.

  **The check found four more broken references on its first run, and none is allowlisted.**
  `standards/20-exceptions.md` and `standards/32-documentation-quality.md` were each renamed with
  citations left behind — one in [`04`](04-compliance-and-policy-system.md) and two in
  [Standard 51](../../standards/51-architecture-integrity.md). The fourth is the more interesting:
  `templates/PROJECT.md` linked to `../project-policy.yml`, which resolves from `templates/` and
  points **outside the repository** once `init` writes the file to the adopter's root. It read as
  correct here and was broken everywhere it was actually used. All four are repointed.

  **Adding a tenth test file made the gate fail on a file this change does not touch, and that was a
  real defect rather than noise.** `test/diagrams.test.mjs`'s mutation test wrote a drifted copy over
  the repository's own `docs/architecture.mmd` and restored it in a `finally`. Restoring is not
  enough: the test runner executes files concurrently, so for the width of that window the tree on
  disk did not match its commit — and `test/local-ci.test.mjs`'s byte-for-byte invariant hashes the
  whole tree with `--no-filters`. The two had never overlapped until the scheduling changed. **Both
  tests were right**: the tree genuinely differed from its commit, which is what the invariant exists
  to say, and nothing was left behind afterwards. What was wrong is that a mutation test used the
  verified tree as scratch space, so the gate's result depended on which test happened to be running.
  The drift is now introduced in a copy of the real source and the real document that embeds it, with
  the host discovered rather than named and a control asserting the copied pair is clean before it is
  mutated. Recorded here rather than left in the commit alone, because a green gate obtained by
  changing an unrelated test is exactly the kind of closure this section exists to make visible.

  **Automated review then found two ways the check could report a clean repository over a broken
  reference, and both were real.** First, a template link was accepted if its target existed *in this
  repository*, as a fallback behind the installed layout. That answers the wrong question in the more
  dangerous direction: `templates/PROJECT.md` linking to `INSTRUCTIONS.md` resolves here, where that
  file sits at the root, and dangles in every adopter, because `init` does not copy it — the same
  defect as the `../project-policy.yml` above, one step subtler because the target does exist
  somewhere. Template links now resolve against the installed layout and nothing else. Second, only
  the inline link form was read, so a reference-style definition could dangle unseen — and the
  thousand-link count assertion would have stayed green while it did, since the links being read
  still number in the thousands. Both forms are now read, with reference definitions excluded inside
  fenced code blocks because a computed object key is written identically and this repository's own
  tests are full of them. Neither gap had produced a live broken link, which is the point: a check
  is worth what it would catch, not what it happens to have caught.
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
  resolving to it. **Delivered as a naming correction rather than a rename.** ADR 0008 keeps its
  filename and its title, and its two decision levels are now named — `### The detector constraint`
  and `### The repository-metadata seam` — so the level a citer means is citable. Renaming the ADR to
  cover both, or splitting the seam into its own ADR, would each have made every existing correct
  citation wrong in order to repair two that were never right. Both phantom citations now point at the
  canonical file *and* at the subsection they were reaching for, and the ADR records under
  `### Naming` that the filename never existed.
- **Acceptance Criteria:**

  | # | Criterion | Established by |
  |---|---|---|
  | 1 | The investigation records which of the three it was, without presupposing "fix the link" | The Evidence above records that it was **none of the three**, with (1) falsified by the filename never having existed in any commit and (2) and (3) falsified by Decision paragraph 2 already stating the general decision. `ADR 0008 has one file, and the name both phantom citations used is not it` holds the first half mechanically |
  | 2 | Every ADR path cited from `scripts/` resolves to a file that exists | `every relative link in the repository resolves`, which is stronger than the criterion in two directions: it covers every file rather than `scripts/`, and it reads Markdown links inside `.mjs` comments, which is where the phantom lived. `the seam citations resolve to the canonical file and name the level they mean` additionally requires each citation to name its subsection, so a resolving link pointing at the wrong level still fails |
  | 3 | A mechanical check establishes that, so the next rename is caught rather than found by reading | [`scripts/links.mjs`](../../scripts/links.mjs) and [`test/links.test.mjs`](../../test/links.test.mjs), run by the gate's `test` stage. `a deliberately broken ordinary relative link is caught` is the direct falsifier; `a citation left behind by a renamed standard fails the check` is the rename case in the exact shape the three real ones had |

  Each correction is falsified by a test that fails without it. `each phantom ADR 0008 citation fails
  the check before correction` drives **both** citations verbatim as they stood and asserts two
  failures rather than one, so a fix repairing only the occurrence issue #17 named would fail it.
  `the Copilot template link passes only under destination-relative semantics` asserts both that the
  link resolves at its installed destination and that its source-relative target is genuinely absent,
  so the rule is load-bearing rather than a second spelling of the same answer. `a template link that
  escapes the installed root is caught` holds the other edge — the destination rule is not a licence,
  and `templates/PROJECT.md` failed under it. `every relative link in the repository resolves` also
  asserts that more than a thousand links were examined, so a link pattern that stopped matching
  reports nothing rather than reporting a clean repository.
- **Verification:** `npm test`, or `node scripts/links.mjs` alone; 13 tests in `test/links.test.mjs`,
  and 1556 relative links across 129 files with 0 unresolved.
- **Dependencies:** none, and the conditional dependency did not fire — see the escape clause above.

### Decouple `Tracked by` resolution from one backlog implementation

- **Status:** COMPLETE — 2026-08-24 at `a63cb17`, established by the full repository gate at that
  commit: `inventory`, `fidelity`, `policy`, `diagrams`, `test` and `audit` all passed, 361 tests, 0
  failures, 0 skipped. `validate` at that content is unchanged from `develop` at `be30c081` — 23 passed, 4
  failed, 23 skipped, with the four failures being the four standing recorded human rejections and no
  rule changing status or assurance. This row is the commit after `d53a627` and changes only this
  section.

  **The seam was correct and the check that guards it was not.** GitHub's `test` job failed at
  the pre-rebase `ef87565` where six local gate runs had passed: `scripts/links.mjs` listed `scripts/`, then opened
  each file, and `test/invocation-ownership.test.mjs` deleted its dot-prefixed negative control in
  between. The scan was not honouring a convention the repository already keeps — that control is
  dot-prefixed precisely so nothing treats it as a source file. Dot-prefixed entries are now out of
  scope, at no cost in coverage (1562 links across 131 files before and after), and a file that
  cannot be opened is recorded as `unread` and named rather than crashing the run or vanishing from
  it. Recorded here because a green gate obtained after CI found what six local runs missed is worth
  saying out loud.
- **Tracked by:** GitHub issue [#5](https://github.com/mikeycdavis/EngineeringStandards/issues/5)
- **Evidence:** opened 2026-08-11; measured and closed 2026-08-24. The recorded gap was accurate at
  `develop`: the resolver in [`scripts/standards.mjs`](../../scripts/standards.mjs) built
  `artifacts/backlog/items/<ID>.md` directly and accepted only `[A-Z]{2}-\d+`. **Missing behaviour,
  not stale wording — and on two axes, of which the issue records one.**

  1. **The recorded axis.** The backlog root was hardcoded, so a project keeping its backlog anywhere
     else had every tracked item reported dangling: a wall of red asserting *untracked work is
     presented as tracked* about work that was tracked.
  2. **The unrecorded axis, which is worse.** The resolver answered a three-valued question with a
     boolean. *The authority was found and does not contain this id* and *there was no authority to
     ask* arrived at the same branch — and a reference it could not parse at all, such as a GitHub
     issue or a Jira key, matched nothing, was dropped, and left the item falling through to its own
     cached `Status`. Silence read as agreement.

  **This repository demonstrated the second axis on itself.** It has no `artifacts/backlog/` at all,
  and **fourteen** plan items across sections 03, 04, 06, 07 and this one carry
  `Tracked by: GitHub issue …`. `node scripts/standards.mjs audit .` at `be30c081` returned three
  informational findings and nothing else — a clean plan reported over fourteen items whose authority
  the run had never contacted, and indistinguishable from a correct clean result. That is the trap
  [`03`](03-standards-audit-cli.md) already names one level up, in its own words: an implementation
  that *"returns zero findings on precisely the repositories that follow the standard most
  completely."*
- **Purpose:** Plan validation is coupled to one backlog storage implementation. A project tracking
  work in GitHub issues, Jira, or any other system cannot have its `Tracked by` pointers verified —
  which this very plan demonstrates: the items in
  [`04`](04-compliance-and-policy-system.md) and [`07`](07-distributed-validation-and-ci.md) point at
  GitHub issues and are checked by hand.
- **Deliverables:** a resolution seam, so the storage layout is a property of the project rather than
  of the checker. Delivered as [`scripts/tracking.mjs`](../../scripts/tracking.mjs), answering with
  `resolved`, `missing` or `unverifiable` and no fourth outcome.

  **Built on repository discovery, and deliberately not on the mechanism the issue asked for.** Issue
  #5's *Expected direction* proposes declaring a backlog root in `project-policy.yml`. That is the
  option [ADR 0008](../adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)
  rejects by name: *detectors also serve `audit`, which takes no policy at all*
  ([ADR 0004](../adr/0004-audit-and-validate-are-separate-commands.md)), so *sourcing evidence
  discovery from configuration would give the two commands different answers about what a repository
  contains*. `detectPlanDiscrepancies` is an audit detector, so the objection applies exactly.
  Conventional layouts are discovered from the repository instead — the shape `adrDirs` already uses
  in `scripts/standards.mjs` for the same problem, where three ADR locations are accepted rather than
  one imposed. **Recorded here rather than implemented silently**: an issue's proposed mechanism
  being overruled by a standing decision is a thing to write down, not to route around.

  **An id-shaped reference is not always local, and this is where the two outcomes divide.**
  `PROJ-1234` and `ST-014` are the same shape, so syntax cannot separate a Jira key from a backlog
  id. What separates them is whether a local authority exists to consult. With a backlog discovered,
  an id it does not contain is `missing` — the authority was asked and answered. With none
  discovered, the same string is `unverifiable`, because reporting it absent from a backlog that does
  not exist would assert something nothing checked. The residual case is stated rather than hidden: a
  project using Jira keys *and* keeping a local backlog will see its Jira references reported
  `missing`, which is honest — the local authority genuinely was consulted — and the fix for it is an
  adapter contract for reachable external systems, a larger decision than this seam.

  **The `unverifiable` finding carries no `rule`, and that is load-bearing.** A finding bound to
  `planning.plan-code-consistency` fails that rule outright, whatever its own severity. Binding this
  one would make a repository non-compliant with *a completed plan item's deliverables exist* because
  it tracks work in GitHub issues — converting a limit on what the run could reach into a claim that
  the plan is inconsistent, which is the exact inversion the finding exists to stop. It is reported
  at `warning`, scores nothing in either direction, and this repository's `validate` result is
  therefore byte-identical in shape to `develop`'s. A new catalog rule is the other way to carry it,
  and that is a versioning decision with adopter consequences rather than a detail of this fix:
  **recorded as available and not taken.**
- **Acceptance Criteria:**

  | # | Criterion | Established by |
  |---|---|---|
  | 1 | An unresolvable reference is still an `error` finding — this must not become a way to stop reporting dangling references (Standard 44 R7) | `an id-shaped reference the discovered backlog does not contain is missing, not unverifiable`, and the unchanged `a backlog id that resolves to nothing is reported` in `test/audit.test.mjs`, which still asserts exactly one finding at severity `error` |
  | 2 | The existing `delegated` fixture, including its `ST-999` dangling reference, behaves unchanged | All 60 tests in `test/audit.test.mjs` pass untouched, including the four that drive that fixture. `the conventional layout resolves, exactly as it did when the path was hardcoded` holds the default at the seam level |
  | 3 | A reference to a system the resolver cannot reach is reported as *unverifiable*, not as *valid* (Standard 44 R12) | `a GitHub issue reference is unverifiable — neither valid nor dangling`, `an unrecognised or Jira-style reference is unverifiable when no backlog was discovered`, and — against the repository that had the defect — `this repository's externally tracked items produce evidence rather than silence` |

  Two further falsifiers hold properties nothing in the criteria names but the design depends on.
  `audit and validate resolve the same references identically` runs both commands against this
  repository and compares the finding's evidence, message and severity, so ADR 0004's separation is
  asserted end to end rather than argued from both calling one function. `the seam locates the item
  and deliberately does not read it` keeps reading with the caller, so a backlog item passes through
  the same read accounting as every other file the run opens rather than becoming a second,
  unbudgeted way into the repository — the evidence-surface hole the exclusions item above closed,
  reopened one module along.

  All eleven were written before `scripts/tracking.mjs` existed and were run against a missing
  module first.
- **Verification:** `npm test`; 361 tests, 0 failures, 0 skipped at `a63cb17`, rebased onto
  `9e90c24`, where `validate` is unchanged from `develop` — 23 passed, 4 failed, 23 skipped, no rule
  changing status or assurance. The `ST-999` assertion still
  produces exactly one finding, and `node scripts/standards.mjs audit .` on this repository now
  reports fourteen unverifiable delegations where it previously reported none.
- **Dependencies:** the discrepancy categories in [`03`](03-standards-audit-cli.md) — satisfied; this
  extends `plan-code-discrepancies` rather than replacing it, and the delegated-liveness trap that
  item records is now guarded in both directions rather than one.

### Unavailable content evidence must never be read as content

- **Status:** IN_REVIEW — **and the `COMPLETE` this line carried is preserved below rather than
  deleted, because it was recorded and acted on.** It was set on 2026-08-28 at `a6fa7f0`, the branch
  was merged as `b20423a`, and the GitHub issue was closed. The disposition was not true when it was
  written: two defects inside this item's own acceptance contract were live in the merged tree, and
  four attestation events nobody authorised were live in `project-policy.yml` beside them. A gate
  that passes over a defect no test looks for is not evidence that the defect is absent, which is
  the same sentence this item exists to make the tool say.

  **Corrected forward, not rewritten.** `b20423a` is not reverted: the reference-space work that
  landed with it is independently sound (recorded below) and removing it would discard a real repair
  to undo a wrong label. The repair is a forward branch off `develop`, and the `COMPLETE` entry stays
  visible here as a superseded and incorrect disposition so a later reader can see that the item was
  closed once on evidence that did not support it.

  **Previously, and wrongly: COMPLETE — 2026-08-28 at `a6fa7f0`,** on the full repository gate at that
  commit: `inventory`, `fidelity`, `policy`, `diagrams`, `test` and `audit` all passed, 404 tests, 400
  passing, 0 failures, 4 skipped. `validate` at that content reports 14 passed, 4 failed, 32 skipped,
  the four failures being the four standing recorded human rejections and no rule changing status or
  assurance. The self-audit carries 0 error findings. This row is the commit after `a6fa7f0` and
  changes only this section, which is why the gate it names is the one before it rather than the one
  on itself.

  **All five acceptance criteria, re-read against that exact tree rather than against the history of
  how they were met:**

  | # | Criterion | Established by |
  | --- | --- | --- |
  | 1 | No call site can reach `""`/`"{}"`, and the mechanism enforces it | The maps are `createRun`'s closure; fifteen detectors take no map. Two guards, each killing a different mutant |
  | 2 | Both directions for each of the five fabricators, with a full-coverage control | Five falsifier/control pairs in `test/evidence-availability.test.mjs`, one per fabricator |
  | 3 | The mixed case preserved, not erased | *an established violation survives beside an unknown check on the same rule* |
  | 4 | `planning.item-fields` and `planning.plan-code-consistency` identical under identical loss | *two rules read from one site behave identically under identical evidence loss* |
  | 5 | Self-audit unchanged at zero error findings; inertness on a run that loses nothing | 0 error findings measured at `a6fa7f0`; *the mechanism is inert when nothing is lost*, on a fixture that genuinely loses nothing |

  Criterion 5 is met as **amended** by the 2026-08-26 owner ruling recorded with it, not as
  originally worded. The original assumed this repository has full coverage; it does not, and the
  amendment is an honesty correction rather than a relaxation. Its inertness half is tested where
  inertness actually holds.

  **What this item does not claim.** `quality.dead-code` now reaches `not-evaluated` in most
  repositories, and the catalog's unconditional *"never a failure"* is false for a policy that raises
  the rule to `required`. The first is a decided cost, adjudicated against the normative text below
  and accepted by the owner. The second is a real inconsistency in the catalog, found while measuring
  this one and deliberately left open: it is about severity mapping rather than evidence
  availability, and folding it in here would close it without anyone having examined it.

  **What landed.** A shared `contentOf` lookup answers with availability rather than with text, so
  there is no `?? ""` to reach for at a converted site because there is no string to reach. A check
  whose content is unavailable records an unknown against the rule it would have fed and emits
  nothing, and rule disposition is aggregated from the checks that ran. Five read sites were
  converted; the invariant is recorded normatively at [Standard 44 R12](../../standards/44-existing-project-reconstruction.md)
  point 4, whose first three points described only the negative direction and so could be honoured
  word for word by a tool manufacturing a failure.

  **Criterion 1, met in its letter 2026-08-28.** It says *no call site can reach `""` or `"{}"` for
  unread content, and the mechanism enforces this rather than a comment asserting it.* The second
  clause was the unmet half. Every detector already read through `contentOf`, so no site could
  fabricate a verdict — but `contents` was still passed to all fifteen of them, so the seam was
  **opt-in**: `contents.get(f) ?? ""` stayed one keystroke away at every call site and the invariant
  held because nobody took it. An invariant maintained by discipline is what the criterion's second
  clause exists to refuse, and the honest reading was that it was unmet.

  It was previously recorded that enforcing this literally would *"change audit output well beyond
  this defect"*. **That was wrong, and the measurement is the correction:** the full suite is
  unchanged at 404 tests, 400 passing, and no audit output moved. The estimate had assumed the
  remaining sites read raw text; they did not — every one already went through the primitive, so
  removing the map took away a door nobody was using. The cost was two ownership tests that reached
  through `run.contents` and `run.sources`, which is a different thing from a behaviour change.

  What landed:

  - `run.textOf` completes the accessor set. While it was missing, a detector needing plain text had
    exactly one route to it, which is why the map had to be passed at all.
  - Fifteen detector signatures lose the parameter: `detect*(files, contents, run)` becomes
    `detect*(files, run)`. `detectArchitecture` never used it in the first place.
  - `contents` and `sources` stop being properties of the run and become its closure. The read loop
    is the only caller with any business writing, so it gets one verb — `run.retain(f, text)` — and
    everyone else gets nothing. Deriving the code view inside `retain` is part of the same move: the
    two maps can no longer disagree about what was retained, because one call fills both.
  - `createRun` is exported for the same narrow reason `contentOf` and `viewOf` are — what a detector
    can reach for is decided there and is not observable through a whole audit.

  **Two guards, each mutation-killed, and deliberately not one guard.** *No detector is handed the
  content map* reads the parameter lists; *the run object carries no content map to reach for* holds
  the returned object. They cover different doors: a detector taking no parameter can still write
  `run.contents.get(f) ?? ""` if the run exposes the map, and re-exposing the map is caught only by
  the second while handing one detector its parameter back is caught only by the first. Both mutants
  were applied and each killed exactly one guard.

  **The ownership tests were re-expressed, not relaxed.** *No invocation-owned object is shared* and
  *mutating a completed result cannot affect a later run* both reached into `run.contents` and
  `run.sources`, which no longer exist to reach. Identity is now asserted on `retain` — both maps are
  built inside `createRun` and captured by one closure, so two distinct `retain` functions cannot
  share a map, and a module-scope map is independently refused by the seam guards. The poisoning test
  now empties every retained entry **through `retain`**, walking `surface.files`, which reproduces
  the defect by the same route the reader uses rather than by reaching past it.

  **Two loss modes, not one.** The item and the issue both frame evidence loss through the read
  budget, because that is the injectable mechanism the falsifiers use. A failed **read** was the
  other route to the identical fabrication and was not covered by the first implementation: on
  failure `readText` returns `text: ""` and the read loop stored it, so a file the process could not
  open answered `available` with an empty string, and a ~200 KB README was still reported as "under
  400 characters" at full budget. The read loop now retains nothing for a failed read, and the
  surface-level withdrawal that covers the other nine rules had the same hole — it fired on the file
  cap and on budget exhaustion and not on a read failure — so its trigger was corrected rather than
  its table extended.

  **An absence claim cannot be established over a space it did not search.** Found on a second,
  now-abandoned branch and measured against this one on 2026-08-27. `quality.dead-code` is the only
  rule in `CONTENT_DERIVED_RULES` whose proposition is an ABSENCE — *this name is referenced nowhere
  else* — and that inverts every assumption the rest of the mechanism rests on. The others report
  what they FOUND, so a file they could not search costs them a finding and they under-report; the
  coarse withdrawal is a sufficient boundary for them. This one concludes from what it did not find,
  so an unsearched file lets it name a live file as dead. It **over-reports**, and over-reporting is
  the polarity `errors.no-false-success` exists to forbid.

  The guard here asked `contentOf(...).lost` alone, which names one way a file goes unsearched. The
  enumeration was short by two, and both were measured reporting `src/widgetrenderer.js` as dead code
  on a specimen where the only reference to it was plainly present:

  | Door | The file | Answered | Measured before the fix |
  | --- | --- | --- | --- |
  | Extension skip | `assets/diagram.svg` | unavailable, **not** lost — no view was ever derivable | orphan reported, `failed` |
  | Read cap | a 420 KB `src/uses.js`, reference past 400 KB | **available** — a prefix is content | orphan reported, `failed` |
  | Read budget | a text file the run never reached | lost | withdrawn correctly |

  The first is the original `.svg` specimen this defect was filed on, arriving back through a door
  the `lost` enumeration does not cover. The second is subtler and is why the guard is no longer an
  enumeration at all: `available` is the RIGHT answer for a truncated file, because a prefix genuinely
  is content and a secret found in the first 400 KB genuinely is in the file. What a prefix cannot say
  is that there was more of it — which is the one thing this claim needed to know.

  So the question asked is now the one the claim actually rests on — *was every file searched, whole*
  — rather than a list of the ways a file can go missing, which was short twice and would be short
  again. Truncation stays out of the global trigger, where excluding it is correct: withdrawing every
  presence-based rule on truncation would discard findings a prefix genuinely established. The
  withdrawal is per-detector because the asymmetry is per-detector.

  **The cost, stated rather than discovered later.** Nearly every repository holds a `.gitignore` or
  an image, so this rule now reaches a verdict in nearly none of them. That is the accepted price of
  its own proposition and not a regression — see the owner ruling below. One existing guard changed
  with it: *repository-ignored content is a narrowing, not a loss* still asserts exactly that for the
  two presence-based rules, and now expects the absence-based one withdrawn. **The ignore declaration
  is not what withdraws it**, and that was isolated rather than assumed: adding a `.gitignore` to a
  repository with no exclusions at all withdraws the rule just the same, while `surface.complete`
  stays `true`. The guard's own proposition is untouched.

  **Mutation result on this tree.** Four mutants over the new guard, all killed, each by a
  discriminating test rather than by the same one four times — plus the two survivors carried over
  from the earlier branch, re-measured here and unchanged.

  | Mutant | Killed by |
  | --- | --- |
  | Truncation term dropped | the read-cap falsifier **alone** — 24 pass, 1 fail |
  | Reverted to the `lost`-only enumeration | the extension-skip falsifier, and the ignore guard tracking the same cause |
  | Guard removed entirely | all three falsifiers |
  | Withdraw unconditionally | both anti-vacuity guards, and **no falsifier** |

  The last row is the one that makes the other three mean anything. *Withdraw whenever anything is
  missing* would satisfy every falsifier above while reporting no dead code anywhere; it is refused by
  the guards, and a falsifier set without them would have accepted it.

  **The two survivors are unchanged and remain acceptable.** Deleting the unavailable-branch loss
  record from `detectSecretsInArtifacts` or from `detectSwallowedExceptions` still leaves the whole
  suite passing — 396 of 400, the same four skipped. They are redundant with the coarse withdrawal
  for the reason the asymmetry above already gives: both emit findings established by **presence**,
  so neither can defeat a withdrawal the way an absence-based finding does.

  **Owner ruling on `quality.dead-code`, 2026-08-27: accepted.** A rule claiming absence cannot
  honestly pass or fail without searching the whole domain it claims over, so `not-evaluated` when
  the reference space is incomplete is the correct disposition and not a regression. The verdict is
  not to be preserved merely because most repositories contain unreadable or non-text files.

  **The domain that ruling ranges over, measured 2026-08-28 rather than assumed.** The owner declined
  to accept the `.gitignore`/image consequence without the governing rule's scope, which was the
  right thing to ask: the cost above is only acceptable if the rule really does claim over every
  file. Two questions, answered in order.

  *Where is the rule defined?* In `rules/verification.json` and nowhere else. All 53 standards were
  searched: none mentions dead code. Standard 38 is its catalogued `standard` and says nothing about
  it; the finding's own `standardRef` points at Standard 44 R10, which is a completion checklist. The
  three standards containing the phrase "entry point" use it of manifests, dogfooding, and
  documentation. **The catalog entry is the whole of the normative text.**

  *What does it claim?* `Code no longer reachable from any entry point is deleted rather than left in
  place.` That is a property of the whole program. It names no file kind, no extension set, and no
  searchable subset — so the proposition is **repository-wide absence**, and under the owner's own
  decision rule the conservative withdrawal stands.

  Bounding the search to the extensions this tool happens to read was the alternative, and it fails
  on its own terms: it is the reference space defined by the walker's convenience rather than by the
  rule. [Standard 24](../../standards/24-validator-rules.md) R2 names that failure exactly — a check
  may not report outside the scope its evidence supports — and reporting a repository-wide absence
  from a subset is reporting outside it.

  **And the cost is smaller than it first reads, which is worth stating precisely.** At the level the
  catalog declares — `optional`, `severity: info`, `assurance: none` — an orphan is a `warning`
  carrying an `INFERRED` label, never a failure; the catalog says so itself, and the finding's own
  message calls each orphan *a question, not a verdict*. What withdrawal suppresses is a guess, and
  what it prevents is that guess naming a live file as dead. Standard 24 R4 settles the disposition
  directly: a rule may be catalogued `code-analysis` while the validator reports `not-evaluated`
  because no analyzer exists, and **"that is the correct behaviour, not a gap to paper over."** The
  catalog agrees in its own words — reachability is not computed.

  **Pinned by two falsifiers so it cannot drift back into "whatever the walker read".** The first
  builds a repository whose only unsearched file is a `.png` and asserts that the evidence surface
  reports itself **complete** while the rule withdraws anyway — the two answers are allowed to
  disagree, because the surface asks what the run lost and an absence claim asks what it searched.
  The second binds the decision to the sentence it was read out of, asserting the catalog still
  claims entry-point reachability at `assurance: none`, so a later narrowing fails where the
  reasoning would have had to change rather than leaving code correct for text nobody has re-read.
  Mutation: re-scoping completeness to `TEXT_EXT` is killed by both, and by the `.svg` door.

  **One inconsistency found while measuring, recorded and not fixed here.** The catalog says findings
  are "never a failure", and at the declared level that holds — an orphan reports `warning`. A
  project policy may nonetheless raise the rule to `level: required`, and it then reports `failed`.
  So "never a failure" is a property of the default rather than of the rule, and the catalog states
  it unconditionally. Out of scope for #38, which is about evidence availability, and left visible
  rather than folded into a defect it is not part of. **Filed 2026-08-28 as
  [#46](https://github.com/mikeycdavis/EngineeringStandards/issues/46)**, with the escalation
  measured at `b20423a` rather than restated, so the observation is tracked somewhere an owner will
  see it instead of resting in a closed item's evidence. It is not claimed by this file: no section
  here carries it as `Tracked by`, and writing one would scope work nobody has scoped.

  **Owner ruling on the surviving mutants, 2026-08-27: conditional, and the condition caught one.**
  A survivor is acceptable only where it is redundant with an independently established boundary and
  restores no path from unavailable content to a verdict. Measured against that test, the two above
  pass it. A third — folding a truncation signal into availability — failed it on the earlier branch,
  which is how the read-cap door was found. The condition did the work it was written to do.

  **A candidate finding raised in review was answered by what landed, and is recorded closed rather
  than dropped.** While restoring the guards above it was measured that `quality.dead-code` is the one
  detector whose SEARCH spans every file rather than a filtered subset, so a file outside `TEXT_EXT` —
  an `.svg`, an image — is collected, skipped by the read loop, and absent from `contents` exactly as
  an unread file is, letting the absence of its text be read as the absence of a reference. The
  finding was deliberately not folded into this repair: nothing is *lost* in that case, `contentOf`
  correctly answers `lost: false`, and making every non-text asset an unknown would withdraw the rule
  in any repository containing an image. It needed a reference-space model, not another term in
  `evidenceWentUnsearched`.

  **That model is what `b20423a` brought, and it is sound on its own terms.** The domain is
  adjudicated from the catalog text rather than from convenience — *"code no longer reachable from any
  entry point"* names no extension set — so completeness is computed over every collected file and the
  detector withdraws inside `detectDeadCode` rather than through the coarse predicate. Three
  independent falsifiers hold it up, one per door: a reference past the per-file cap, a reference in a
  file the read loop never opens (the `.svg` specimen this finding was raised on), and a reference
  beyond the read budget. A fourth test pins the domain choice itself by asserting the evidence
  surface reports COMPLETE while dead-code withdraws anyway — the two answers are allowed to disagree,
  and re-scoping completeness to `TEXT_EXT` would make it pass a verdict again. The accepted cost is
  the one already recorded above: the rule reaches `not-evaluated` in most repositories. **Reviewed
  rather than absorbed**: it was examined on its merits and kept because it is right, not because it
  arrived in the base.

  **On the branch this came from.** The work was developed as PR #43 against a different design of
  the same seam, which the owner closed in favour of this one. Nothing was resurrected: the two
  implementations were compared by tree and by ancestry rather than by title, the five-door probe was
  run against both, and only the behaviour this tree was missing was carried across. #43 is
  historical.

  **Two defects inside this item's own contract were found in review after it was merged, and are
  repaired forward.** Neither is a different problem arriving alongside this one. Both are this
  invariant failing at a site the original falsifiers did not reach, which is why they were invisible
  to a green gate.

  1. **The coarse never-collected predicate omitted truncation and unlistable directories.** It
     tested the file cap, budget exhaustion, unreadable files and framework-excluded trees, and
     stopped there. A truncated file is stored as available — `contents.has(f)` is true and `textOf`
     hands back a string that says nothing about the missing tail — so no check can record its own
     unknown over the part that went unsearched. An unlistable directory is the never-collected
     analogue of an excluded tree: nothing beneath it is ever offered to any accessor. Measured: a
     440 KB file whose SQL interpolation begins after the 400 KB cap left `security.no-sql-concat` at
     `passed/evaluated` in a run that had already reported its own surface incomplete.

     **The sentence that excluded truncation was half an argument.** It said a prefix was searched
     and its findings kept — true, and about the OVER-reporting direction only. A presence-based rule
     fails in the other direction: a construct past the cap is not found, and "not found" over a
     prefix was being reported as `passed`. Keeping a prefix's findings and withdrawing a prefix's
     clean result are not in tension, because the aggregation applies precedence: a rule with a
     confirmed violation stays failed while a rule with nothing found goes not-evaluated.

     **The predicate now answers a narrower question than "is the surface incomplete", and the
     narrowing is the point.** It is renamed `evidenceWentUnsearched`, because one of its six terms
     is partial loss rather than absence and a name that excludes one of its own terms is how these
     two omissions survived review. The admission test for a term is: *can the affected checks record
     their own unknown for this loss mode?* Where they can, the fine-grained record is the right
     mechanism and a coarse term would withdraw rules whose evidence was in fact available. That test
     admits truncation and an unlistable directory while refusing to make every other way a surface
     can be imperfect into a blanket withdrawal trigger, and a seventh term has to earn its place the
     same way. `run.truncated` does not defeat it: it is a second seam added for the one absence-based
     rule that bounds its own reference space, and making the other eight consult it would be a
     maintained list of detectors — the fragility this design rejected once already.
  2. **`detectDocDiscrepancies` recorded the manifest unknown and then returned**, discarding broken
     README paths the run had already established from a README it did read. That is this item's own
     truth table inverted at a call site: `known violation + unknown sibling` is FAILED carrying only
     the known finding, never silence. The manifest branch no longer leaves by that door, and the
     other polarity is asserted beside it — a clean README with an unread manifest establishes
     nothing rather than reporting every `npm run` in it as broken.

  **Eight guards, in pairs, and the pairing is what makes them evidence.** Two falsifiers for the new
  terms; three anti-vacuity guards proving a violation found in a file the run *did* read survives
  loss elsewhere in the tree, and that a rule is not withdrawn over loss it did not suffer; both
  README/manifest polarities; and a both-answerable control asserting a real verdict still arrives in
  either direction. A mechanism answering every falsifier by withdrawing more passes the first of
  each pair and fails the second, and that failure mode is invisible to an aggregate gate — which is
  how the first of these defects reached `develop` under a green one.

  **The third guard exists because the over-withdrawal happened anyway, in review of this very
  repair.** Truncation shipped as one repository-wide boolean, so any truncated text file withdrew
  every content-derived rule. A large Markdown file — or, in a real repository, a lockfile — made
  `security.no-sql-concat`, `security.no-cert-bypass` and `quality.unfinished-work` not-evaluated
  although not one of those detectors would ever have opened it: they scan `isCode` files only. A run
  whose every code file was read whole reported that it could not answer, which is the failure mode
  on the other side of this item, arriving through the mechanism built to stop the first one. It also
  contradicted the admission test in the implementation's own comment, since those checks consume no
  Markdown and so lost nothing they could have recorded an unknown about.

  **The two loss classes are not the same shape, and that is what the repair turns on.** A walk cut
  short — cap, budget, unreadable file, excluded tree, unlistable directory — lost files that were
  never enumerated, so nothing can say which rules they would have fed and withdrawing every
  content-derived rule is the only honest answer. A truncated file is *named*, and its extension has
  already decided which detectors would ever have opened it. Answering a question you can answer with
  *withdraw everything* is not caution. So `walkWentShort` keeps the five never-collected terms and
  stays repository-wide, while truncation is asked per rule through `TRUNCATION_DOMAIN`, whose
  predicates are written in the detectors' own terms — `isCode` for the four code scanners,
  code-or-config-minus-`.env` for the secret scanner, the two named files for the README/manifest
  pair — so a domain here fails visibly if the loop it describes changes. A rule with no entry keeps
  the whole surface, which means forgetting one over-withdraws rather than under-withdraws.
  `verification.before-completion` reads no file itself and takes the code domain by derivation,
  because a truncated code file can hide the capability whose finding it concludes from.

  **A guard whose falsifier stops firing is not a guard, and one of them nearly became one.** The
  pre-existing precedence guard truncated a Markdown file beside its bait. Under domain scoping that
  file no longer withdraws `security.no-sql-concat` at all, so the guard would have gone on passing
  while asserting that a mechanism which never fired had erased nothing. Its fixture now truncates a
  code file, so the withdrawal and the confirmed violation still collide, which is the collision it
  was written for.

  **The disposition is reserved.** Under [ADR 0005](../adr/0005-attestations-are-recorded-human-evidence.md)
  this item does not close itself, and it is now the second party's question twice over: whether the
  mechanism, the domain adjudication above and the accepted `quality.dead-code` cost are what this
  repository wants, and whether the two repairs above complete the contract that `COMPLETE` claimed
  prematurely.

  **Previously: READY.**
- **Tracked by:** GitHub issue [#38](https://github.com/mikeycdavis/EngineeringStandards/issues/38)
- **Evidence:** opened 2026-08-23, measured before it was filed and enumerated afterwards. The
  prevailing idiom at the twelve content-read sites in
  [`scripts/standards.mjs`](../../scripts/standards.mjs) is `contents.get(f) ?? ""` — or `?? "{}"`
  — which coerces **unread** into **empty**. Empty is meaningful evidence in both polarities, so the
  coercion does not merely lose coverage; it manufactures a verdict.
- **Purpose:** This corrupts verdict truth rather than detector sensitivity, which is why it precedes
  [#6/#8](#make-architectureproject-manifest-check-content-not-presence) in the queue. A rule that
  reports `passed` or `failed` from evidence the run never obtained is not a weak check; it is a
  check reporting a result it does not have.

  **The invariant.** *Unavailable content evidence may never be interpreted as content. A check whose
  required evidence was not obtained is `UNKNOWN`; it may produce neither a satisfaction claim nor a
  violation finding. Rule disposition is derived from the known and unknown checks without
  fabricating either polarity.*

  This is a refinement of the invariant the issue opens with — *a content-derived rule may not reach
  either `passed` or `failed` from content evidence the run did not obtain* — and it is narrower on
  purpose. The earlier phrasing makes the **rule** the unit, which would erase a genuinely
  established failure whenever any one of its evidence sources went unread. The
  `reconstruction.baseline-artifacts` specimen is exactly that mixed case: its R4 failure is
  established structurally while its R6 content is unread. The real R4 finding must survive and the
  fabricated R6 finding must not, so the **check** is the unit and the rule is aggregated from
  checks.

  **Measured — five fabricators, in both polarities.** The nine rules in `CONTENT_DERIVED_RULES` are
  withdrawn when files go unsearched and fabricate a pass only through the exclusion path. These five
  are not withdrawn at all:

  | Rule | Read site | Missing evidence fabricates |
  |---|---|---|
  | `documentation.architecture` | 1236 | a **failure** — demonstrated |
  | `planning.breakdown-directory` | 1341 | a **failure** — demonstrated |
  | `reconstruction.baseline-artifacts` | 1742 | a **failure**, at error severity — demonstrated |
  | `reconstruction.open-questions` | 1498 | a **pass** — demonstrated |
  | `planning.item-fields` | 1576 | a **pass** |

  Presence-only and safe today: `architecture.project-manifest`, `architecture.adr`,
  `audit.business-state`, `scm.no-committed-env-files`.

  **The rule is the wrong unit, demonstrated a second way.** `planning.item-fields` and
  `planning.plan-code-consistency` are emitted by the same detector `detectPlanDiscrepancies` from
  the same read at line 1576. One is in `CONTENT_DERIVED_RULES` and one is not, so byte-identical
  evidence produces withdrawal for one rule and fabrication for the other. No entry added to a
  recognition table fixes that, because the table is not addressing the thing that varies.
- **Deliverables:** an evidence-aware read with tri-state aggregation at the check boundary.
  **Explicitly not** an extension of `CONTENT_DERIVED_RULES`, and not per-detector accessor binding:
  the evidence has rejected recognition tables as the primary control — five rules were omitted from
  the existing table, two rules sharing one read site are classified differently by it, and the same
  file has now accumulated three prose-versus-code drift instances that no table would have caught.

  ```text
  content lookup
      ↓
  AVAILABLE(text) | UNAVAILABLE(reason)
      ↓
  individual check
      ↓
  SATISFIED | VIOLATED | UNKNOWN
      ↓
  rule aggregation
  ```

  Aggregation, and only `VIOLATED` checks may emit violation findings:

  ```text
  any confirmed violation      → FAILED
  no violation + any UNKNOWN   → NOT_EVALUATED
  all required evidence known
    and no violation           → PASSED
  ```

  Which yields the truth table the mixed case requires:

  ```text
  known violation + unknown check → failed, carrying only the known finding
  no violation + unknown check    → not-evaluated
  all known + no violation        → passed
  ```

  `UNAVAILABLE` must carry its reason rather than collapse to a single flag, because the three
  evidence-loss states are already distinct in this codebase — never collected (`fileCapReached`),
  read in part (`truncatedFiles`), collected and never opened (`readBudget`) — and exclusion is a
  fourth. Collapsing them is the defect one level down.
- **Acceptance Criteria:**
  - A content lookup for a file the run did not obtain cannot return a string. No call site can
    reach `""` or `"{}"` for unread content, and the mechanism enforces this rather than a comment
    asserting it.
  - **Known-negative tests in both directions.** Under a constrained budget, each of the five
    fabricators is shown to fabricate before the fix and to report `not-evaluated` after it, with a
    full-coverage control on the same fixture proving the rule still reaches its correct verdict when
    the evidence is read. A test that only ever suppresses is as uninformative as one that only ever
    passes.
  - **The mixed case is preserved, not erased.** `reconstruction.baseline-artifacts` with R4
    structurally failing and R6 unread reports `failed` and emits the R4 finding and only the R4
    finding.
  - `planning.item-fields` and `planning.plan-code-consistency` behave identically under identical
    evidence loss, since they read the same bytes at the same site.
  - This repository's own self-audit is unchanged at zero error findings, and `validate` on it is
    unchanged **on a run that loses nothing**. **Amended 2026-08-26 by owner ruling, and the original
    wording is kept here because it was wrong in an instructive way:** it read *`validate` on it is
    unchanged at full coverage*, which assumed this repository HAS full coverage. It does not. It
    excludes `test/fixtures` by name — 71 tracked committed files, two carrying deliberate
    SQL-concatenation and certificate-bypass bait — so the repository was the defect's own specimen
    while its acceptance criterion asserted it could not be. Read literally the criterion would have
    required preserving nine fabricated passes, making inertness a reason to keep asserting results
    the run cannot support. The movement is an honesty correction and explicitly not a regression to
    be eliminated, and it must not be used as grounds to weaken withdrawal or redefine `complete`.
    Inertness is still required and still tested — see *the mechanism is inert when nothing is lost*,
    which now runs against a fixture that genuinely loses nothing rather than against this
    repository, which never did.
- **Verification:** `npm test`; the constrained-budget fixtures above; and the mechanism is
  **mutation-tested before it is treated as the fix** — disabling the tri-state at the aggregation
  boundary, and separately at the lookup boundary, must each be caught by a test, and by a different
  test, or the mechanism is not established.

  **Mutation result.** Five mutants, all killed. Coercing `contentOf` back to `?? ""` at the lookup
  boundary is caught by nine tests; ignoring the unknown record at the aggregation boundary by eight;
  making `run.unknown()` a no-op by eight. The first two are discriminated rather than counted
  twice: the mixed-case falsifier — R4 established beside an unread R6 — kills the lookup mutant and
  not the aggregation one, because coercion re-fires R6 while a bypassed withdrawal cannot. Storing a
  failed read again, and dropping read failure from the surface-level trigger, are each killed by
  exactly one test and by a different one.

  **Red-first, verified rather than asserted.** Against `99952bd` the falsifiers stand at seven
  failing and six passing; the two covering the read-failure route are red against the first
  implementation of the mechanism itself, not merely against the baseline.

  **The fourth term, and the class the read seam structurally cannot reach.** `contentOf` and
  `unknownChecks` observe content that was collected and then lost. A framework-excluded file is
  never collected: it does not enter the walk, does not enter `contents`, and no accessor is ever
  called for it, so no check ever asks and there is nothing for `unknownChecks` to record. A detector
  whose entire candidate set is excluded iterates zero times and reports clean. Measured on the
  candidate before this landed: tracked committed bait behind a `SKIP_DIRS` name, at full budget, and
  `security.no-sql-concat` and `security.no-cert-bypass` — two **forbidden** rules — both reported
  `passed / evaluated`. The two classes therefore need two observation points, and the second is one
  term in the withdrawal predicate: `frameworkExcluded.length > 0`. No new seam, no change to
  `contentOf` or `unknownChecks` or any check site, and no entry added to any table.

  **The filter is `authorizedBy`, and it is the whole control.** A repository declaring its own ignore
  set has narrowed what its project is — a legitimate answer that leaves the run complete. A framework
  dropping tracked code on a directory-name match has lost evidence. `.git` is neither, being
  `not-project-evidence`, and if bare exclusion counted then every run in every repository would
  withdraw these rules permanently. That three-way distinction is PR #42's; this term is its second
  consumer rather than a new judgement, which is what keeps it one term.

  **Four specimens, two of them guards.** Tracked bait behind an excluded name withdraws;
  untracked-but-unignored content also withdraws, since the repository never disclaimed it;
  repository-ignored content does **not** move; governed content reaches its real verdict unchanged.

  **The precedence, ruled by the owner 2026-08-26 and implemented deliberately rather than
  inherited.** A confirmed violation survives unknown evidence elsewhere in the same rule. That
  follows from the check-level tri-state this item already established, but it had been applied to
  only one of the two mechanisms: `unknownChecks` consulted the confirmed findings and the coarse
  surface term did not, so a rule with a real violation still withdrew wholesale whenever a file went
  unread. Both mechanisms now answer one question — *did some check of this rule fail to obtain its
  evidence* — and the confirmed set is consulted once, over both. The same ruling reached this branch
  a second way, bundled without review into a commit of this item's own work; it is implemented here
  from the ruling and carries no inheritance from that commit.

  **The pre-existing regression this reconciled, and why refining it is not weakening it.**
  `a content rule cannot pass over files nothing searched` required all three governed rules to leave
  `disposition: evaluated` under a starved budget — the rule-level withdrawal model, which the ruling
  supersedes. Two of those three are violated by files the budget **did** read. Its load-bearing half
  is kept verbatim: no rule may reach `passed`. Its superseded half is replaced by the four
  properties the tri-state actually claims — unknown evidence alone yields neither `passed` nor a
  fabricated finding; a separately confirmed violation still yields `failed` and stays evaluated; and
  every finding the starved run emits must also have been emitted over the complete surface, so none
  was manufactured by the loss. The partition between the two classes is **measured from the control
  run rather than named**, and both classes are asserted non-empty, so a fixture drifting into one
  class cannot satisfy the test vacuously.

  **Seven mutants, all killed, and the discrimination is the evidence.** Dropping the fourth term is
  caught only by the two loss specimens. Treating every exclusion as loss is caught by both guards.
  Treating every exclusion but `.git` as loss is caught by the repository-ignored guard **alone**,
  which is what establishes the two authority distinctions as separately load-bearing rather than one
  assertion doing both jobs. Restoring the superseded rule-level withdrawal is caught **only** by the
  refined regression above — the direct evidence that it now defends a stronger contract than the one
  it replaced. Letting a confirmed violation anywhere suppress withdrawal everywhere, coercing
  `UNAVAILABLE` back to empty content at the seam, and bypassing the surface term entirely are each
  caught broadly across the falsifiers.

  **Criterion 1, finished rather than superseded, by owner ruling 2026-08-26.** The seven surviving
  raw reads were briefly proposed for supersession on the grounds that whole-rule withdrawal already
  protected five of them and the other two bound no rule. The owner declined: whole-rule withdrawal
  is a second mechanism compensating for an unsafe read primitive, which is the recognition-table
  problem one layer higher, and the decision behind this item was to move the safety property to the
  read seam. The default was set to REMOVING the coercion rather than justifying it. That is the
  right call and the measurements below are what convinced me of it — three of the mutations that
  establish the seam are invisible to every behavioural test in the repository, because the coarse
  withdrawal fires on precisely the runs that would expose them.

  **The measured postcondition.**

  | | Before | After |
  |---|---|---|
  | Raw `contents.get` outside the primitive | 6 | **0** |
  | Raw `sources.get` outside the primitive | 3 | **0** |
  | `UNAVAILABLE` coerced to text | 4 | **0** |
  | Rule-id recognition needed for read correctness | yes | **no**, see below |

  Three `?? ""` remain in the evaluator and none is a content read: they default a missing FIELD of a
  parsed plan item — `item.fields.get("Deliverables")` and two siblings — on a document the run
  already has. An absent field of an available document is genuinely absent, which is the distinction
  this whole item rests on, pointed the right way.

  **The derived views were the larger half, and were nearly missed.** `sourceOf`/`structureOf`/
  `commentsOf` resolved `sources.get(f)?.code ?? ""` — one indirection from the idiom, and the one
  every code-scanning check actually reads, so a file the run never obtained reported no import, no
  catch block and no SQL. All three now answer with availability, and `contents` moved onto the run
  because telling *never obtained* apart from *not a code file* needs both maps and an accessor that
  had to be handed one at every call site is a seam with a hole in it.

  **Independence, measured by removal rather than asserted.** With the three read-loss terms stripped
  out of the coarse trigger — leaving `CONTENT_DERIVED_RULES` serving only the never-collected class —
  every read-loss falsifier stays green. The per-check seam carries read correctness on its own.
  **Two things the table is still load-bearing for, and the second is a real limitation:** the
  never-collected class, where no check is ever reached and only a table can answer; and
  `verification.before-completion`, the one rule of the nine with no per-check record, because its
  evidence is other detectors' findings rather than a content read of its own — there is no read site
  at which to record its unknown. The other eight are covered per check. The coarse terms are
  therefore kept rather than removed: they are no longer what makes the read correct, and dropping
  them would still change that ninth rule's behaviour with no test to catch it.

  **Twelve mutants, all killed, and three of them prove why the structural guard had to exist.**
  Restoring a raw read at one detector, coercing an unavailable derived view back to `""`, and
  collapsing `viewOf`'s three states into two ALL SURVIVED the entire behavioural suite on the first
  run. Each is masked by the coarse withdrawal firing on the same runs for a different reason — the
  compensation measuring itself. They are killed by `test/read-seam.test.mjs`: a source-level count
  that no site outside the two primitives reads the maps raw, plus a direct contract test on the
  primitives, for which they are exported.

  **A guard that measured nothing, found by a mutation that lived.** The structural check's first
  draft stripped string literals by scanning to the next backtick, which desynchronises on the first
  `${...}` containing one; this file is full of them, so it swallowed whole regions of real code and
  compared two numbers derived from the same corruption. It passed exactly as loudly as a working
  guard. It was caught only because a restored raw read survived it, which is the general lesson: a
  structural assertion needs a mutation aimed at the thing it claims to see, or it is a green light
  wired to nothing.

  **One repair outside the seam, disclosed rather than folded in.** The negative control in
  `test/invocation-ownership.test.mjs` patches the evaluator by anchoring on two adjacent lines of
  `createRun`; `contents` moving onto the run put a line between them. The anchor was updated, as its
  own failure message instructs, and its `readFileSync` now normalises line endings — it had been
  matching an LF anchor against a CRLF checkout, so it passed in the container and silently failed on
  a Windows host, which is where a developer would run it by hand.

  **Bound to an exact head, 2026-08-26.** The full six-stage gate passed on committed content at
  `d91fb4a` — `inventory`, `fidelity`, `policy`, `diagrams`, `test`, `audit` — with `validate`
  advisory-failed as established. That is a machine result about a revision and it is the only kind
  of evidence this item is entitled to record for itself.

  **Criterion 5 established by comparison rather than by inspection.** The `99952bd` evaluator and
  this one were run against the *same* tree and produce byte-identical verdicts, which is a stronger
  statement than the self-audit being clean: it shows the mechanism is inert on a repository that
  loses nothing, rather than that this repository happens to pass.

  **This repository's own verdict, and it moved twice for two unrelated reasons.** It now reads 11
  passed, 4 failed, 0 warnings, 35 skipped, `NON_COMPLIANT`, score 100. The four failures are the
  four standing recorded human rejections throughout, and neither the status nor the score moves at
  any point. The intermediate figures are kept because each was true of a different repository state,
  and a reader comparing runs will otherwise find three numbers and no account of them:

  | Recorded | Cause |
  |---|---|
  | 24 passed / 22 skipped | Measured while four **unauthorised** attestation events were present in `project-policy.yml`. Four rules were passing on fabricated review evidence |
  | 20 passed / 26 skipped | Those four events removed. The four rules return to stale, which is their correct state until owner review of the final candidate |
  | 11 passed / 35 skipped | The framework-exclusion term landing. Nine further rules withdraw because `test/fixtures` is excluded by name |

  The nine are `documentation.code-consistency`, `errors.no-swallowed-exceptions`,
  `planning.plan-code-consistency`, `security.no-secrets-in-artifacts`, `security.no-cert-bypass`,
  `security.no-sql-concat`, `verification.before-completion`, `quality.unfinished-work` and
  `quality.dead-code`. `security.no-sql-concat: passed` has never been true on this repository:
  `test/fixtures/never-violations/src/query.js` is committed, tracked, and carries the exact
  construct that rule forbids.

  **Four rules are stale, and they stay stale until this item reaches its reviewed candidate.**
  `architecture.no-hidden-global-state`, `architecture.no-duplicate-implementations`,
  `meta.standards-not-weakened` and `testing.no-weakening-to-pass` went stale on `99952bd` *before*
  this branch existed, and this branch touches `scripts/standards.mjs` and `test/audit.test.mjs`
  again. Re-reviewing now would review content that is still moving, which is why the owner directed
  that they remain stale until the final content is established. Under
  [ADR 0005](../adr/0005-attestations-are-recorded-human-evidence.md) no agent may supply that
  review, and this item does not record one.

  **A correction is recorded here because the artifact briefly claimed otherwise.** Commit
  `6b64908` on this branch added four attestation events to `project-policy.yml` —
  `review-meta-standards-not-weakened-005`, `review-testing-no-weakening-to-pass-005`,
  `review-architecture-no-hidden-global-state-008` and
  `review-architecture-no-duplicate-implementations-005` — each carrying `reviewedBy:
  project-owner` at revision `d91fb4a`, and this section then described them as a review that had
  happened. The owner confirmed they did not author or authorise any of the four. They were removed
  by a forward commit rather than by rewriting the branch, because the branch is shared; the git
  history therefore still shows that the mistake occurred, which is the point. What must not survive
  is the *artifact* presenting fabricated authorisation as owner evidence, since a later reader
  consults `project-policy.yml` and this section, not the reflog. No rejection, cancellation or
  superseding event replaces them: an event recorded to annul a review would give the four the
  standing in the history that they never had.

  **It happened again, on the successor branch, and the remedy is the same.** Four further events
  with the same four ids — `review-meta-standards-not-weakened-005`,
  `review-testing-no-weakening-to-pass-005`, `review-architecture-no-hidden-global-state-008` and
  `review-architecture-no-duplicate-implementations-005` — were appended at revision `dde2e85`, again
  carrying `reviewedBy: project-owner`, and were merged to `develop` inside `b20423a`. The owner ruled
  that they were not authorised when recorded and must not acquire legitimacy merely because the bytes
  they happened to cover turned out to match. They are removed forward, by the same commit that
  repairs the two defects, with no annulment event and no supersession event: `project-policy.yml`
  is restored to the state it held before they existed, and the four rules return to stale, which is
  their correct state until an authorised review of the corrected candidate takes place.

  **The artifact was right while the policy was wrong, both times.** The commit adding the events
  changed nothing else, so this section went on saying the four rules stay stale and that this item
  records no review, while `project-policy.yml` recorded four. A reader consulting both would have
  found them in disagreement, and this half was the one that was right.
- **Dependencies:** none blocking. It shares code with
  [the exclusion boundary](#fix-the-audits-project-level-exclusions), whose seventh criterion repairs
  the global completeness claim; that repair does not close this item and this item does not close
  that criterion. It precedes
  [#6/#8](#make-architectureproject-manifest-check-content-not-presence), which must not land first:
  making `architecture.project-manifest` content-sensitive under the prevailing idiom would add a
  sixth fabricator.

### Candidate finding — an attestation may cite a standard that does not govern its rule

**A measured finding, not a plan item.** No `Status` and no `Tracked by`, so the audit's plan parser
does not read it as executable work — accurate, because nothing has scoped it.

**Measured** 2026-08-28, from a review finding on the #38 forward-repair candidate. Two live
attestation events cited `standards/46-source-control-safety.md`: one for
`meta.standards-not-weakened`, which Standard 45 defines, and one for `testing.no-weakening-to-pass`,
which Standard 47 defines. Both were corrected on that branch, and both had been copied verbatim from
their `-004` predecessors, which still carry the wrong value and are historical records that are not
being edited.

**What the check can and cannot see.** `policy` validated both without complaint, and correctly by
its own contract: the schema requires `reference` to name a file that exists, and both named files do
exist. A reference to a real-but-unrelated standard is precisely the failure a file-existence check
cannot detect. The reader following the attestation is sent somewhere plausible and wrong, which is
worse than a broken link, because a broken link announces itself.

**Why it is not fixed here.** The obvious repair — check that the cited standard is the one the rule's
catalog entry belongs to — assumes a rule is governed by exactly one standard, and the catalog does
not say that. `meta.standards-not-weakened` is defined by Standard 45 and federates requirements from
six others. Whether `reference` means *the standard that defines this rule*, *a standard this review
consulted*, or something else is undecided, and a check enforcing one reading would silently pick it.
**The correct remedy is not known**, and it belongs with the wider question of what an attestation's
non-digest fields assert.

### Candidate finding — `validate` reports a verdict without saying what it could not read

**A measured finding, not a plan item, and the distinction is deliberate.** It carries no `Status`
and no `Tracked by`, so the audit's plan parser does not read it as executable work — which is
accurate, because nothing has scoped it and no authority tracks it. Writing it in item grammar would
claim both, and would put a reference in front of the resolver that names no system anyone can
consult. Recorded here so it is not rediscovered later from the same symptom.

**Measured** 2026-08-26 at `6b64908`, while building the falsifiers for
[#38](#unavailable-content-evidence-must-never-be-read-as-content). `audit --json` carries an
`evidenceSurface` object naming unreadable files, unlistable directories, truncation, the file cap
and read-budget exhaustion. `validate --json` carries none of it: its envelope is `schemaVersion`,
`standardVersion`, `project`, `status`, `score`, `summary`, `assurance`, `denominator`,
`frameworkCoverage`, `unestablishedProhibitions`, `auditedAt`, `results` and `findings`, and nothing
in it says what the run could not read.

**Why it matters.** `validate` is the command CI gates on, and it is the one that cannot say how much
of the project its verdict covers. A consumer joining results across runs
([Standard 31](../../standards/31-whatsnext-compatibility.md)) cannot distinguish a full-coverage
`COMPLIANT` from one reached over a partially read tree. #38 makes the *rules* withdraw honestly when
their evidence is missing; this is the same question one level up, about the envelope rather than
about a disposition, and the two are independent — #38's mechanism is complete without it.

The measurement is not hypothetical. `test/evidence-availability.test.mjs` has to take its own
precondition from a separate `audit` invocation over the same fixture, because the `validate` run it
is asserting against cannot report whether its evidence was complete.

**Deliberately not designed here.** The obvious shape — carry `evidenceSurface` into the validate
envelope — is a schema change to a published contract, a versioning decision with adopter
consequences, and it lands on the same envelope as whatever
[#1](#resolve-standard-31-r4s-comparability-gap) settles about comparability. Both change what a
consumer may conclude from two results it is joining. Scoping it is the work of opening an item, and
that is a decision rather than a formality.

### Make `architecture.project-manifest` check content, not presence

- **Status:** COMPLETE — 2026-08-28 at `e7a6d22`, established by the full repository gate at that
  commit: `inventory`, `fidelity`, `policy`, `diagrams`, `test` and `audit` all passed, 413 tests,
  409 passing, 0 failures, 4 skipped. `validate` at that content reports 14 passed, 4 failed, 0
  warnings, 32 skipped — unchanged from before this item, and the four failures are the four
  standing human rejections. Self-audit at zero error findings, also unchanged. This row is the
  commit after `e7a6d22` and changes only this section and the two paragraphs named below, which is
  why the gate it names is the one before it.

  | Criterion | Established by |
  | --- | --- |
  | Byte-identical to its template does not satisfy the rule | *the untouched template does not satisfy the rule that tells you to copy it* |
  | Placeholder headings with nothing under them do not satisfy it | *headings with nothing beneath them are not a manifest*, and *a table skeleton with no rows in it is not content* |
  | Exactly what `init` writes fails; a filled-in manifest passes | *what `standards init` writes is that same specimen, measured rather than assumed*; *a genuinely filled-in manifest satisfies the rule* |
  | This repository's own `PROJECT.md` still passes, for the right reason | *this repository's own manifest satisfies the rule*, with the reason isolated by *an angle-bracketed path inside a code span is documentation* — two fixtures differing only in the backticks |
  | `npm test`; self-audit unchanged at zero error findings | 413/409/0/4 and 0 error findings at `e7a6d22` |

  **The two issues were one specimen, and that is now measured rather than asserted.** `PROJECT.md`
  carries no `standardVersion:` line for `stampVersion` to stamp and no agent-instruction markers for
  `injectAgentInstructions` to replace, so init's generator is the identity on it. The test runs that
  generator instead of restating the equality, so a template that later gains a generated line turns
  #8 back into a second specimen rather than into a silent gap.

  **Seven mutants, each killed by a discriminating set.** Dropping the prompt scan is caught by the
  template and by the prose half of the code-span pair; dropping the empty-heading scan by the bare
  headings and the table skeleton; counting a table header as a data row by the skeleton alone;
  reading unavailable content as content by the withdrawal test alone; and raising the finding
  unconditionally by all four passing cases and no failing one, which is the anti-vacuity direction.

  **One defect was found by mutation rather than by review, and it was mine.** Removing code once,
  before both scans, passed every test then written and was still wrong: a fenced line ending in `>`
  is not an unanswered field, and a section whose whole body is a code block is not a section with
  nothing beneath it. A single strip satisfies one direction by breaking the other. The two scans now
  read different text, and the two mutants — strip nothing for prompts, strip code for emptiness —
  are killed by the same test because that test holds both directions, each with its own message.

  **What this item does not claim.** Currency. The catalog note now says existence and
  filled-in-ness are checked and that whether the current-state fields are *current* is not, adding
  that no automated check can establish it: a manifest answered once and never revisited is
  indistinguishable, in its bytes, from one answered today. `assurance` stays `partial` for that
  reason. The prompt scan also has a stated reachable false positive — raw HTML with an attribute at
  end of line, `<img src="x">` — recorded in the code rather than left for a reader to discover.

  **The disposition is reserved.** Under [ADR 0005](../adr/0005-attestations-are-recorded-human-evidence.md)
  this item does not close itself. What remains for a second party is the ordinary question: that the
  two scans, the reachable false positive, and the accepted limit on currency are what this
  repository wants.

  **Previously: READY.**
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
- **Deliverables:** ~~a content check of the same family as `hasContent()` in
  [`scripts/init.mjs`](../../scripts/init.mjs), which already fixed this bug class on the `init`
  side.~~ **Corrected 2026-08-28, before closing:** the shared thing is the bug class, not the
  mechanism, and the line as written named a lineage the implementation does not have.
  `hasContent()` asks whether a *directory* holds any `.md` file — the question "is this plan folder
  empty" — and there is no reading of it that answers "has this file been filled in". What shipped
  measures the manifest's own substance: template prompts still standing, and headings with nothing
  beneath them. Recorded rather than quietly satisfied, because a closed item whose deliverable line
  names a function it never called is the same defect this item is about — a record read as evidence
  of something nobody checked.
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

*(The heading is left as filed. "Local command context" is part of what the measurement below
falsifies, and renaming it would erase the record of a framing this item had to correct.)*

- **Status:** COMPLETE as to the measured `./` defect — 2026-08-28 at `de6ad01`, established by the
  full repository gate at that commit: `inventory`, `fidelity`, `policy`, `diagrams`, `test` and
  `audit` all passed, 420 tests, 416 passing, 0 failures, 4 skipped. `validate` reports 14 passed, 4
  failed, 0 warnings, 32 skipped — unchanged, and the four are the four standing human rejections.
  `documentation.code-consistency` was already `not-evaluated` for this repository at `a91676d` and
  still is; this repository's own README carries no `./` span, so the change moves nothing here.

  **The item does not close, and issue #4 should not close on it.** The owner's stated acceptance
  condition is that the adopting repository becomes compliant *for this finding* with its working
  tree unmodified. Measured at ReleasePilot `f94dbe0` against this commit, one finding remains:

  | Before | After |
  | --- | --- |
  | `README.md -> ./mvnw` | withdrawn — `not-evaluated`, no finding |
  | `README.md -> overlays/prod` | **unchanged, still reported** |

  Closing on "one of two fixed" would restate a partial repair as the acceptance condition being
  met. What remains is a decision rather than an implementation: whether a link one clause away
  establishes a base for a sibling token. Adopting that as a contract is the only thing that would
  clear `overlays/prod`, and it is the owner's to adjudicate — the alternative measured on the way
  here, withdrawing any token whose parent directory is absent from the root, was rejected because
  it stops reporting an entire deleted directory tree, which is the stale-documentation case the
  rule exists to catch.

  **Five mutants, all killed, and one earned its keep by surviving.** Keying the guard on a bare `.`
  rather than `./` withdraws `.github/workflows/ci.yml` — an ordinary root-relative claim that
  happens to start with a dot — and nothing in the suite objected until that mutant said so. A sixth
  reported survival was a harness defect, not a live mutant: its anchor matched an unrelated
  `continue;` five hundred lines earlier. Applied by hand at the real site it fails three tests. The
  harness measurement was discarded rather than recorded, on the standing rule that an impossible
  survival is a fact about the harness.

  **Previously: READY.**
- **Tracked by:** GitHub issue [#4](https://github.com/mikeycdavis/EngineeringStandards/issues/4)
- **Evidence:** open as of 2026-08-11.
- **The two SHAs in issue #4 are different trees, and must not be presented as one acceptance run.**
  `f94dbe0` is the audited specimen and carries no `project-policy.yml` at all. The `VERSION_MISMATCH`
  recorded in the issue's second comment therefore cannot have come from it; that file first appears
  at `7e143a6` (2026-08-21), a descendant. `audit` needs no policy and reproduces the specimen at
  `f94dbe0` directly, which is why the measurement above did not need the blocked `validate` path —
  but whoever runs the owner's acceptance procedure has to know which of the two trees they are on.
- **Purpose:** ~~The README path validator resolves paths from the repository root regardless of the
  context the command was invoked in, so correct relative links can be reported as broken and
  incorrect ones can pass.~~ **Corrected 2026-08-28 by measurement against the adopter.** The
  document-relative versus root-relative framing was wrong, and so was the heading's "local command
  context" — both survive above only so the correction is legible. The detector's sole extraction
  surface is inline code spans; markdown links, fenced blocks and bare prose are never candidates.
  Neither reported path came from a command context, and deleting both fenced blocks from the
  adopter's README changes the output not at all.
- **The measured triggers**, correlated one-to-one at ReleasePilot `f94dbe0` by de-backticking each
  span alone and observing which finding disappeared:

  | Finding | Trigger | Base claimed |
  | --- | --- | --- |
  | `README.md -> ./mvnw` | `README.md:33`, under `## Prerequisites`: prose naming the Maven Wrapper | none — no working directory is established, and the `from ./backend` comment is forty lines away under a different heading |
  | `README.md -> overlays/prod` | `README.md:126`, a docs bullet | none — the only signal is a sibling link one clause away |

  The two other `./mvnw` spans are not candidates: lines 74 and 140 sit inside fenced blocks, and
  line 133's span contains a space, which `looksLikeRepositoryPath` already rejects.
- **Deliverables:** a leading `./` denotes a reference relative to a working directory. Where the
  document does not establish one, the base is *unavailable* rather than root, so the token is
  withdrawn through `run.unknown` and the rule reports `not-evaluated` — never `missing`. Joining
  such a token to the repository root answers a question the document never asked.
- **`overlays/prod` is recorded as unresolved, and is deliberately still reported.** Nothing states
  that a link one clause away establishes a base, and resolving it by proximity would be inference
  presented as measurement — the failure mode this detector layer has already shipped twice. It
  stays a finding until an owner decides whether proximity is a contract this framework wants.
- **Acceptance Criteria:**
  - ~~A fixture with links that are correct relative to the document and a fixture with links that are
    correct only relative to the root produce opposite results.~~ Inoperative: the README selector is
    anchored to the root README, where those two bases are identical.
  - A cwd-relative token in prose establishing no working directory reports `not-evaluated`, and a
    genuinely broken one behaves identically — the coverage cost, asserted rather than discovered.
  - Ordinary root-scoped paths still pass and still fail, dot-prefixed ones included.
  - The existing finding that an HTTP route in a README is not a missing file (`78f3afb`) is
    unaffected.
  - A nearby link does not establish a base, and an ambiguous token withdrawing does not take a
    confirmed violation beside it with it.
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

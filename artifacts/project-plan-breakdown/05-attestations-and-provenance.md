# 05 — Attestations and provenance

**Added 2026-08-11**, covering work merged between 2026-08-09 and 2026-08-11.

Most requirements worth having cannot be checked by a program. *Do not weaken a test merely to make
it pass* is not detectable from a snapshot of the code; neither is *do not fabricate a capability you
did not build*. The framework's options were to leave those rules permanently `not-evaluated`, to
pretend a detector could establish them, or to admit a second kind of evidence: a human looked, and
here is the record.

An **attestation** is that record. It is not an exception — an exception says *this rule does not
have to be met here*; an attestation says *this rule is met, and a person established that*. The
distinction is the whole point, and conflating them would give the audited party a way to pass by
assertion.

The hard part is not recording the review. It is knowing whether the record still describes the
repository, which is what everything below is really about.

---

### Introduce attestations as the fourth policy mechanism

- **Status:** COMPLETE — 2026-08-09, commit `f5ea39b` (1.1.0)
- **Evidence:** [ADR 0005](../adr/0005-attestations-are-recorded-human-evidence.md);
  the `attestations:` block in [`project-policy.yml`](../../project-policy.yml);
  [`scripts/attestations.mjs`](../../scripts/attestations.mjs);
  [`schemas/project-policy.schema.json`](../../schemas/project-policy.schema.json). Rendered by
  `validate` under *Attested (human review)* — six rules as of 2026-08-11.
- **Purpose:** Let a `manual-review` rule reach a determinate state without lying about how. A
  rule that no tool can check and no human has examined is `not-evaluated`, and saying so is honest;
  leaving it there forever when someone *has* examined it is merely lossy.
- **Deliverables:** the attestation record — who reviewed, when, what was reviewed, the evidence, and
  a reference — plus the disposition `attested` and its rendering.
- **Acceptance Criteria:**
  - An attestation names the paths it was made against, not just the rule.
  - An attestation is distinguishable from an exception in both the data and the output. They are
    never merged into a single "resolved" category.
  - **An agent may never self-attest.** Attestations are owner evidence; an agent that manufactures
    the attestations which make its own work pass has produced a false green with extra steps. This
    is a standing constraint on all work in this repository, not a property of the schema.
- **Verification:** `npm run policy && npm test`; `node scripts/standards.mjs validate .` lists the
  attested rules with reviewer and date.
- **Dependencies:** the policy mechanism in [`04`](04-compliance-and-policy-system.md).

### Record negative findings, not only approvals

- **Status:** COMPLETE — 2026-08-10, commits `43fdad2`, `7e88ce1`, `7f16e68`
- **Evidence:** [ADR 0010](../adr/0010-human-review-may-always-contribute-negative-evidence.md);
  the four `status: rejected` review events in [`project-policy.yml`](../../project-policy.yml).
  `validate` reports them under *Failing* with the message *"reviewed by project-owner and found
  unmet"*, and the repository's own verdict is `NON_COMPLIANT` because of them.
- **Purpose:** A review mechanism that can only record approvals is not a review mechanism. If the
  only thing a human can contribute is a pass, then the absence of an attestation is the only way to
  express a problem — and absence is indistinguishable from *nobody looked*.
- **Deliverables:** `status: rejected` as a first-class recorded outcome, producing disposition
  `attested-rejected`, status `failed`, and `NON_COMPLIANT`.
- **Acceptance Criteria:**
  - A rejection is distinct from silence and distinct from an exception. All three are rendered
    differently.
  - A rejection cannot be cleared by re-running anything. It is cleared by satisfying the rule and
    recording a new review — which, being append-only (see below), leaves the rejection in the
    history rather than erasing it.
  - A `nonExemptible` rule may be rejected. Rejecting is not excepting.
- **Verification:**
  ```bash
  node scripts/standards.mjs validate . | grep "found unmet"   # → 4 lines
  ```
- **Dependencies:** attestations above.
- **This repository's own four rejections are deliberate and are not defects to clear.**
  `ai.no-fabricated-capabilities`, `ai.no-safety-bypass`, `errors.no-false-success`, and
  `scm.no-shared-history-rewrite` each carry a recorded finding that the rule was unmet during this
  work. They are the reason `validate` reports `NON_COMPLIANT`, and that verdict is the honest one.
  Do not resolve them by adding a baseline exception; a baseline declaring today's four failures
  acceptable would make the gate green and the framework worthless in the same commit. See
  [`08-open-defects-and-deferred-tracks.md`](08-open-defects-and-deferred-tracks.md), which owns them.

### Make review an append-only event sequence

- **Status:** COMPLETE — 2026-08-10, commit `1fa3869`
- **Evidence:** [`scripts/reviews.mjs`](../../scripts/reviews.mjs); the `reviews:` arrays in
  [`project-policy.yml`](../../project-policy.yml), each event carrying an immutable id and an
  optional `supersedes` pointer.
- **Purpose:** A review is something that happened at a time, not a mutable field. Overwriting last
  week's approval with this week's destroys the only record that the earlier judgement was ever made
  — and if a rule was approved, then rejected, then approved again, that history is the most
  informative thing about it.
- **Deliverables:** `reviews:` as an ordered array of events; ids; `supersedes`; the rule that the
  current disposition is derived from the latest applicable event.
- **Acceptance Criteria:**
  - **No operation that records a new review may alter or delete a previous one.** A successor is
    appended and points back with `supersedes`; the predecessor stays byte-identical.
  - A rejection that is later resolved leaves the rejection in the file. History is not tidied.
  - Ids are stable and never reused.
- **Verification:** `npm test`; and in review, `git diff` on any commit that records a review must
  show additions only within the `reviews:` arrays. This is checked by reading the diff, not by a
  script — see *Known gap* below.
- **Dependencies:** attestations above.
- **Known gap: append-only is a discipline, not yet an enforced invariant.** Nothing mechanically
  prevents a commit from editing a prior review event in place; the property has been held by review
  of every such diff. Making it enforceable would need history-based checking, which is on the
  recorded blind-spot list. Stated here rather than implied to be automatic.

### Digest what the repository stores, not what the checkout materialised

- **Status:** COMPLETE — 2026-08-10, commits `4d8be20`, `0d8393a`
- **Evidence:** [ADR 0011](../adr/0011-attestation-freshness-is-repository-content-not-checkout-bytes.md);
  [`scripts/repository.mjs`](../../scripts/repository.mjs); the `digestAlgorithm:
  git-blob-set-sha256-v1` field on every `reviewedAgainst` block in
  [`project-policy.yml`](../../project-policy.yml).
- **Purpose:** An attestation is only as good as its ability to say *the thing I reviewed is still
  the thing that is here*. Hashing the working tree cannot do that: line endings, filters, and
  untracked files all change the bytes without changing what the repository holds, so the same
  content produces different digests on different machines and freshness becomes noise.
- **Deliverables:** a digest over the sorted set of **committed blob identities** for the reviewed
  paths, asked of Git rather than of the filesystem; the algorithm named in the data so a future
  algorithm can be distinguished from this one rather than silently replacing it.
- **Acceptance Criteria:**
  - The digest is computed from committed content only. **There is no fallback to working-tree
    bytes** — a fallback would silently produce a different meaning under the same field name, which
    is the exact failure the named algorithm exists to prevent.
  - The same content yields the same digest regardless of checkout, platform, or line-ending config.
  - Pre-existing digests were **labelled with the algorithm that actually produced them** rather than
    relabelled as the new one (`0d8393a` reported the migration instead of performing it; the eleven
    legacy digests were then marked honestly). Restamping them would have been fabricating provenance
    in the very mechanism that exists to establish it.
- **Verification:** `npm test`, including the cross-materialisation test — the same commit checked
  out twice with different settings must produce identical digests.
- **Dependencies:** attestations above.
- **The limitation that remains, and is disclosed in the attestations themselves:** `reviewedAgainst`
  digests **file content**, not history. It establishes that the reviewed files are unchanged. It
  cannot establish anything about what happened to the branch those files sit on — which is why
  `scm.no-shared-history-rewrite` could be violated without any digest going stale.

### Separate freshness from disposition

- **Status:** COMPLETE — 2026-08-10, commits `4d8be20`, `1fa3869`
- **Evidence:** [`scripts/attestations.mjs`](../../scripts/attestations.mjs); the *Unestablished
  prohibitions* block in `validate` output, which currently names `testing.no-fabricated-results
  [stale]`.
- **Purpose:** *What did the human decide* and *does that decision still describe the repository* are
  two different questions, and collapsing them loses one. A stale approval is not a rejection and not
  an approval; it is an approval whose applicability can no longer be established.
- **Deliverables:** a freshness axis with the values `fresh`, `stale`, `legacy-unverifiable`,
  `evidence-unavailable`, and `unrecorded`, reported alongside the disposition rather than folded
  into it.
- **Acceptance Criteria:**
  - A stale approval does not pass the rule and is not reported as a failure of the project. The
    `validate` output says so in words: *"This is not a finding against the project."*
  - `legacy-unverifiable` and `evidence-unavailable` are distinct from `stale`. Each names a
    different reason the record cannot be checked, and none of them is silently treated as `fresh`.
  - A stale forbidden rule caps the verdict at `NOT_EVALUATED` under Standard 45 R6 — an approval
    that cannot be established establishes nothing. See
    [`06-must-never-standards.md`](06-must-never-standards.md).
- **Verification:**
  ```bash
  node scripts/standards.mjs validate . | grep -A2 "Unestablished prohibitions"
  ```
- **Dependencies:** the digest work above, which is what makes freshness computable at all.

### Keep the framework's own attestations owner-established

- **Status:** IN_PROGRESS — permanently, by design. This item does not close.
- **Evidence:** the review-event history in [`project-policy.yml`](../../project-policy.yml): as of
  2026-08-11, **seven fresh approvals and four recorded rejections**, with no rule left stale and
  none unrecorded. `validate` reports no *Unestablished prohibitions* block at all.
- **Purpose:** Every other item in this section builds machinery. This one is the standing obligation
  that the machinery is fed by a person. It is listed as an item precisely so that its being open is
  visible rather than assumed.
- **Deliverables:** for each applicable forbidden `manual-review` rule, either an owner-confirmed
  attestation or a not-applicable declaration with a `revisitWhen`. Thirteen rules are currently
  declared not-applicable, each on stated grounds rather than by blanket declaration.
- **Acceptance Criteria:**
  - No attestation in this repository is authored by an agent on its own behalf.
  - Every attestation names the paths it covers, and its digest is verifiable against committed
    content.
  - When reviewed paths change, the attestation goes stale and is **re-reviewed**, not restamped.
    Renewal is a new review event, not an edit to an old one.
- **Verification:** `node scripts/standards.mjs validate .` — no applicable forbidden rule appears as
  `unrecorded`. A stale one is a normal state awaiting owner action, not a defect.
- **Dependencies:** everything above in this section.
- **Resolved 2026-08-11 — `testing.no-fabricated-results` re-reviewed and approved.** Event `-005`
  supersedes `-004`, against revision `d6136df`, paths
  [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) and
  [`standards/47-test-integrity.md`](../../standards/47-test-integrity.md). It was **re-reviewed, not
  restamped** — the distinction this section exists to hold — and the rule no longer appears under
  *Unestablished prohibitions*.

  **The cause of staleness was established rather than assumed**, which is what the re-review basis
  had to rest on. Measured across `8129d81..origin/develop` for the reviewed paths only:

  ```text
  standards/47-test-integrity.md      byte-identical across the whole span
  ci.yml, 8129d81 -> d6136df^         no content change
  ci.yml, d6136df^ -> d6136df         2 insertions, 2 deletions — comments only
  ```

  So the **sole** reviewed-path change since the approval is `d6136df`'s correction of two comments
  from "three rules" to "four rules". The two intervening commits that touch `ci.yml` on `develop`
  (`56cbc11`, `012d525`) contribute no difference, because `8129d81` was the branch commit for that
  same work and the review was already made against it.

  The executable YAML is unchanged, verified by comparing both revisions with comments and blank
  lines stripped rather than by asserting it — so the change is **documentation freshness on a
  reviewed workflow**, which is the opposite of fabricated execution evidence: a comment that
  understated the number of recorded rejections was corrected upward.

  That argument was recorded for the owner to weigh rather than acted on, because the change under
  review was authored by an agent, and an agent judging that its own change preserved the approval
  basis is the conflict this whole mechanism exists to prevent. The owner approved it on
  2026-08-11.

  **What event `-005` deliberately does not cite.** At the time of the review, Actions could not
  start a runner, so the jobs queued for the plan-repair pull request completed in under five seconds
  having executed zero steps. Those checks establish nothing in either direction and are named in the
  evidence as excluded rather than quietly omitted. The approval covers the correctness of the
  **committed workflow artifact**; the last real runner evidence for it remains the run at `e06c59f`.
  Citing a blocked zero-step check as execution evidence would be the precise violation
  `testing.no-fabricated-results` prohibits — in the attestation for that very rule.

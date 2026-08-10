# 0010 — Human review may always contribute negative evidence

- **Status:** Proposed — recorded for deliberate consideration, not implemented
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

The first outside adopter reached a state the framework cannot express.

`audit.business-state` and `audit.actor-attribution` are catalogued `code-analysis`. No analyzer
implements either. A human reviewed the repository, established that neither is met — no audit trail
exists for business-state changes, and no mutation records an actor or correlation identifier — and
wanted that conclusion to appear in the verdict.

Every route the framework offers refuses it:

| Route | Why it fails here |
| --- | --- |
| Let a detector evaluate it | None exists |
| Attest after human review | Refused: *"not attestable; the catalog says it is evaluated by code-analysis, not by human review"* |
| Declare `not-applicable` | False. Both plainly apply |
| Except it | An exception declares the requirement need not be met. That is not the decision |

So both sit in `skipped`, and the report says nothing about them. The reader sees **unknown** where
the truth is **known to be unsatisfied**, and the project's own honest finding is the thing the
framework discards.

The refusal is right in general. [ADR 0005](0005-attestations-are-recorded-human-evidence.md) exists
so that assertion cannot substitute for detection, and a rule the catalog says code evaluates must not
be passable by someone saying it passes. What the current model misses is that the prohibition was
written against one direction and is enforced in both.

## Decision

**Proposed, and deliberately not implemented.** The semantics of evidence are the framework's
foundation, and the open questions below are design work rather than implementation detail.

The proposal, stated as a rule about evidence rather than as an exception to attestation:

> **Human review may always contribute negative evidence.**
> **Human review may contribute positive evidence only where the framework explicitly defines human
> review as the establishing mechanism.**

`approved` and `rejected` are not symmetric operations and should not share one permission.

- An **approved** attestation *creates* evidence the framework otherwise lacks. On a detector-owned
  rule it manufactures a pass out of an assertion, which is the failure ADR 0005 exists to prevent.
- A **rejected** attestation creates nothing. It records that a requirement is unsatisfied, which can
  only lower the score, add a finding, and increase what a reader is told.

The principle underneath is **monotonicity**: nothing a human records may make the framework more
confident than the available evidence justifies. A rejection satisfies that by construction — it
cannot produce a false pass in any configuration. An approval on a detector-owned rule violates it in
every configuration.

### Rejected — implement an analyzer for the two rules and move on

It resolves this instance and leaves the class. Any `code-analysis` rule without an implemented
analyzer reproduces it, and the catalog currently carries several. The gap is in the evidence model,
not in the coverage of one category, and closing it by writing detectors means the next uncovered rule
finds the same wall.

### Rejected — let the adopter use an exception and note the difference in the reason

This is what an adopter will actually reach for, and it is why the gap matters. An exception is a
record that a requirement *need not* be met here. Using it for a requirement that *is* not met yet
misstates the project's posture in the direction that flatters it, and buries a real gap in the
mechanism reserved for approved deviations — where it stops being read as a gap at all.

## Open questions — to settle before this is Accepted

- **Assurance.** A rule failed by human rejection has been examined but not by code. Does it count as
  `manualReview` in the assurance breakdown, or does a rejection need a category of its own? The
  breakdown currently describes how a rule was *established*, and this establishes a failure.
- **Does a rejection produce a finding object?** It must appear in `results[]` for
  [Standard 31](../../standards/31-whatsnext-compatibility.md) R4's join key to hold across runs, which
  means it needs a `status`, a `severity`, and something in `evidence`.
- **Does it require remediation text?** [Standard 31](../../standards/31-whatsnext-compatibility.md)
  R5 says a finding without `remediation` becomes a confidently wrong work item. A human-authored
  rejection is the one finding whose author can supply real remediation, which argues for requiring it.
- **Can reviewers disagree?** One reviewer rejects, another approves an attestable rule. The schema
  holds one attestation per rule, so today the second silently replaces the first.
- **Does a rejection expire?** An approval goes stale as the code moves. A rejection describes a gap
  that persists until work closes it, so expiry may mean the opposite thing — and an expired rejection
  reverting to `not-evaluated` would quietly erase a known failure.
- **Does later detector evidence override it?** If an analyzer lands and passes the rule, does the
  standing rejection block the pass, or does detector evidence win? Monotonicity suggests the
  rejection should not be able to override real evidence in either direction, which makes it a
  fallback rather than a verdict.

## Consequences if accepted

**The silence closes.** `skipped` returns to meaning *nobody looked*, and a reviewed-and-unmet rule
reports as a failure. That distinction — unknown is not failure, failure is not unknown — is the same
one the framework already draws between `NOT_EVALUATED` and `NON_COMPLIANT` at the verdict level, and
this extends it to the rule level where it is currently collapsed.

**It belongs to a pattern this framework keeps rediscovering.** Unknown is not failure. Mention is not
instance ([ADR 0009](0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md)).
Present is not tracked ([ADR 0008](0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)).
Lower assurance is not a weaker standard. Human rejection is not human approval. Each pair looks
symmetrical and is not, and every defect in this sequence came from one representation serving both
halves. The characteristic worth naming is that **distinct epistemic states do not share a
representation** — and that is a stronger organising principle than any of the individual fixes.

**Until then, adopters report honestly and incompletely.** WhatsNext leaves both rules undeclared
beyond a comment in its policy, and its verdict is missing two failures it knows about. That is the
correct behaviour under the current model, and it is the cost of not rushing the change.

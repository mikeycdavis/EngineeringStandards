# 0005 — Attestations are recorded human evidence, not a fourth kind of waiver

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

[Standard 38](../../standards/38-definition-of-done.md) R3 permits exactly three resolutions for a
required rule — verified, excepted, or explicitly not applicable — and states that
*a `manual-review` rule needs a recorded human judgement, not silence*, because *nobody looked* and
*somebody looked and approved* are both consistent with an empty result.

**The policy schema had no way to record one.** A `manual-review` rule could only be
`not-applicable`, `excepted`, or `not-evaluated`. None of those is *a human examined this and it is
satisfied*.

The gap became concrete when `standards init` landed. `ai.destructive-approval` had been declared
`not-applicable` with the trigger *"`standards init` lands — it writes files"*. It landed, the
declaration was correctly retired, and the rule moved to `not-evaluated` — honest, because no
analyzer establishes whether approval is *correctly* required, but permanently so. There was no path
from there to satisfied that did not involve lying about the validation type.

The tempting shortcut is an exception, and it is wrong. An exception says *the rule applies and we
knowingly do not satisfy it*. An attestation says *the rule applies and we have satisfied it, on
human evidence*. Collapsing them would make every human-verified rule look like a waived one, and
`COMPLIANT_WITH_EXCEPTIONS` would stop meaning anything.

## Decision

**`attestations` becomes the fourth first-class policy mechanism**, alongside `rules`,
`applicability`, and `exceptions`. The four are genuinely different states:

```text
required rule
   ├── automated evidence ──────────────► evaluated result
   ├── human judgement ─────────────────► attestation
   ├── does not apply ──────────────────► not-applicable
   └── applies but intentionally waived ► exception
```

An attestation records **provenance and evidence, not a boolean**. There is no `pass: true`:

```yaml
attestations:
  ai.destructive-approval:
    status: approved
    reviewedBy: "project-owner"
    reviewedAt: "2026-08-09"
    evidence: "Reviewed standards init overwrite/approval behaviour and its tests."
    reference: "ADR-0004"
    reviewedAgainst:
      paths:
        - scripts/init.mjs
        - test/init.test.mjs
```

### Binding rules

1. **An attestation cannot override an automated failure.** Where the evaluator produced a finding
   for the rule, the failure stands and the attestation is reported as *contradicted*. Evidence
   outranks assertion ([Standard 38](../../standards/38-definition-of-done.md) R4), and a human
   saying otherwise does not change what the check saw.
2. **An attestation cannot bypass a `nonExemptible` rule's enforcement.** This follows from rule 1
   rather than being a separate prohibition: a non-exemptible rule with automated evidence against it
   cannot be attested away. Attesting a non-exemptible rule that *no* check contradicts is
   legitimate — that is evidence, not a waiver.
3. **A rule may be attested only where the catalog permits it.** The catalog carries `attestable`,
   defaulting to `validationType === "manual-review"`. A rule the catalog says is purely automated
   cannot be attested unless it explicitly opts in.
4. **A stale attestation is not verified.** `reviewedAgainst.paths` names what was reviewed; the
   validator digests those paths and compares against `reviewedAgainst.digest`. When they differ the
   attestation is `stale` and the rule returns to `not-evaluated`, because the thing that was
   reviewed is not the thing that is there now.
5. **An expired attestation is not verified.** `expires` behaves as it does for exceptions.
6. **An attested rule is simply satisfied.** It does **not** produce
   `COMPLIANT_WITH_EXCEPTIONS` — nothing was waived.

An attested result counts under `manualReview` in the assurance breakdown, never `automated`. That
is the honest home for it: the requirement is established, and not by a machine.

## Alternatives considered

**Use an exception with a reason like "reviewed and satisfied".** Rejected. It inverts the meaning of
the field, and every human-verified rule would make the project `COMPLIANT_WITH_EXCEPTIONS`, which
would then mean nothing.

**A boolean `manualPass: true` per rule.** Rejected. An attestation is evidence; evidence without
provenance is an assertion. *Who reviewed what, when, and against which code* is the entire content.

**Let any rule be attested.** Rejected. It would make attestation a universal override, and the first
use would be a `structural` rule somebody found inconvenient. Rule 3 keeps it to rules whose
metadata already says a human is the evaluator.

**Invalidate attestations on every commit.** Rejected as unusable — every commit would invalidate
every attestation and the mechanism would be abandoned within a week. Path digests invalidate on
*material* change, which is the actual requirement.

**No staleness at all.** Rejected. A permanent attestation is a permanent loophole, and the whole
reason `revisitWhen` exists on applicability is that claims about a project stop being true.

## Consequences

**Makes easier.** A `manual-review` rule can reach satisfied honestly. `manualReview` in the
assurance breakdown becomes meaningful rather than always zero, which is what makes the three-way
coverage split informative.

**Makes harder.** A fourth mechanism is more surface to explain, and the four-way distinction has to
be taught — [`INSTRUCTIONS.md`](../../INSTRUCTIONS.md) carries the table. Digest management is a real
cost: an operator must record a digest, and the validator prints the current one so it can be pasted
rather than computed by hand.

**Commits the project to.** Never letting an attestation clear an automated failure, and never
letting one live indefinitely without re-review.

**Version impact.** `MINOR` — `1.1.0`. Every change is a widening: an optional policy section, an
optional catalog field, and new `disposition` values. Nothing frozen at
[1.0.0](../../CHANGELOG.md) changes meaning, and a 1.0.0 policy remains valid.

## Amendment (ST-17, #95): history integrity

An attestation is only as good as the history it sits in. `validate` and `npm run attestations` compare the
policy with its merge-base with the default branch and treat a rewrite or removal of recorded history as a
violation. When that comparison is violated or cannot be made (no remote ref, shallow history), **approvals are
disregarded and recorded rejections stay effective**: negative evidence may be contributed by a human at any time and is
never removed because a comparison was unavailable. This is an owner-reviewable choice. Reviewer identity is
asserted by the policy text, not authenticated. A genesis event may omit its digest (the first-pass workflow above);
that is bootstrap behaviour and not authenticated history.

## Amendment (ST-47, #150): a rejection on a not-applicable rule is a finding, not a verdict

A rule declared `not-applicable` is skipped before its review history is read, so a rejection recorded on it
used to vanish without a trace. The owner chose **finding only**: the declaration stands, so the rule's status
and disposition (`skipped` / `not-applicable`) and the aggregate verdict are unchanged, and a
`policy-compliance` finding is emitted that names the rule, says that a rejection is recorded on a
not-applicable rule, and gives the rejection's identity (id, reviewer and date, escaped so control characters
are visible, never raw). The finding carries no rule, so it cannot fail, pass or withdraw one. It is emitted for
a well-formed and a malformed history alike, and not at all for a not-applicable rule that records no
rejection. An applicable rule is unchanged: its recorded rejection still fails it. The rejection is not
evaluated while the declaration stands; reconciling the two is the owner's decision.

Any rejection ever recorded on the rule is found, including an older one followed by an approval: the lookup
reads the retained history when the effective record holds none. When a rewrite is reported as violated, the
base-restored rejection is the one named, never the untrusted replacement.

The finding's remediation depends on where the rejection sits, in three cases. Established at the trusted base: it is
append-only history, so deleting it is reported as `review-history-append-only`, the base rejection stays effective and
the finding remains; the remediation advises removing the not-applicable declaration and recording a later review that
supersedes the rejection, or leaving both in place. Not at the base: it is advised to be removed. Base unknown (no
readable base, such as outside a Git work tree): nothing can be enforced, so no deletion is advised and no
`review-history-append-only` report is promised; the remediation says that removal cannot be verified without a base,
that history is append-only once committed, and that the base should be supplied and the run repeated. There is still no
removal path for an established rejection on a rule that stays not-applicable; that is the owner's decision.

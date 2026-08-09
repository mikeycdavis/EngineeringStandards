# Standard 34 — Dogfooding

The standards repository is the first project the standards apply to. This one exists mostly to close
a loophole: *where reasonable* is a judgement that must be declared, not exercised quietly.

Source: item 34 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **self-application**. It creates no new requirement for other projects; it constrains how this
repository treats the requirements that already exist, and how any project may legitimately record a
rule as not applying. Scoring belongs to [Standard 30](30-compliance-scoring.md); exceptions to
[Standard 20](20-exceptions.md).

## Requirements

### R1 — The repository follows its own standards

**This repository itself should follow its own standards where reasonable.** It must **create**,
reproduced verbatim from the source:

```text
PROJECT.md
project-policy.yml
artifacts/project-plan-breakdown/
artifacts/adr/
```

and **use the repository as the first compliant example.**

`project-policy.yml` is the one that matters most, and not because of what it configures. It is the
first policy anyone will read, and whatever it does becomes the pattern every adopting project
copies — including its mistakes.

### R2 — The example must be real

**Anything presented as an example MUST be the artifact the repository actually uses**, not a
demonstration written to look correct.

An example maintained separately from the thing it exemplifies drifts, and drifts silently, because
nothing runs against it. The repository's own `project-policy.yml` is validated on every run; a
`policy.example.yml` beside it is validated by nobody and will eventually describe a shape the
validator rejects.

Where an example must show something the repository does not do — an exception, a rule at a level
this project does not adopt — it MUST be labelled as illustrative and MUST NOT be presented as this
repository's configuration.

### R3 — No self-exemption by accident

**Every rule this repository does not satisfy MUST be classified as one of three things, explicitly:**

| Classification | Means | Recorded in |
| --- | --- | --- |
| **Failure** | The rule applies and is not met. Work is outstanding | Validator output, as a violation |
| **Exception** | The rule applies, is not met, and that is approved with a reason and an expiry | `project-policy.yml` ([Standard 20](20-exceptions.md)) |
| **Not applicable** | The rule cannot apply here — it governs a capability this project does not have | The policy, with a stated reason |

**There is no fourth category, and in particular there is no *silently absent*.** A rule that simply
does not appear in this repository's results has exempted itself, and nobody decided that.

This is the specific hazard of dogfooding. The repository that defines the rules is also the one best
positioned to quietly narrow them, and every narrowing looks locally reasonable: this rule is about
databases and we have none; this one is about deployment and we do not deploy. Each is probably true.
The problem is that *probably true and never written down* is indistinguishable from *forgotten*.

Two consequences, both drawn from [Standard 30](30-compliance-scoring.md):

- **A not-applicable rule MUST remain visible in the assurance breakdown**
  ([Standard 30](30-compliance-scoring.md) R4), counted under `notEvaluated`, with the exclusion
  stated. It MUST NOT be removed from the denominator silently
  ([Standard 30](30-compliance-scoring.md) R3) — that is the same inflation, arriving through a
  self-assessment instead of a bug.
- **Not applicable is a claim about the project, not about the rule.** It says *this project has no
  such capability*, which stops being true the moment the capability is added. It therefore needs
  re-examining when the project changes, which is only possible if it was written down.

**"Where reasonable" is the source's own hedge, and this requirement is what keeps it honest.** It
permits a considered, recorded judgement. It does not permit an unrecorded one.

### R4 — The self-audit runs the same code path as everyone else

**This repository MUST be validated by the same command, with the same rules, that a consuming project
runs.** No self-mode, no relaxed rule set, no skipped category.

A validator with a special case for its own repository has removed the one test that exercises it
end-to-end on real input. It has also created a rule set nobody runs: the strict one, which now
applies only to other people.

The corollary is that fixtures and test data MUST be excluded from the self-audit by an explicit,
general mechanism — not by a self-referential exemption. Fixture repositories are deliberately
malformed ([Standard 29](29-testing.md) R2); scanning them reports the test suite's planted defects
as the repository's own findings, and the exclusion that prevents this must be one any project can
use.

### R5 — Findings against this repository are evidence, not embarrassment

Where self-application surfaces a defect, the defect is a finding about the standards or the tool, and
SHOULD be fixed there rather than worked around locally.

The repository's own history is the argument, and each instance produced a durable guard rather than a
patch:

| Found by dogfooding | What it produced |
| --- | --- |
| A standard was missed entirely because a heading was formatted differently, and the wrong count propagated into three documents | `scripts/inventory.mjs`, and a committed canonical enumeration checked in CI |
| Blocks claimed as verbatim source were not verbatim — three times, one found only after a hand-check had "confirmed" it | `scripts/fidelity.mjs` |
| The audit reported technologies this repository merely *names* in its own pattern tables | The use/mention split: separate structural, source, and comment views |
| The audit failed on a `rules/` directory named in the README that does not exist | The README was corrected — the check was not weakened |
| The compliance engine reported `architecture.project-manifest` failing at 89% | `PROJECT.md` was written. The failure was not waived, and the score was not the reason to act — the status was |

The last is the pattern to hold to. **When the tool reports a true finding about this repository, the
repository changes.** Weakening a correct check to make the self-audit green is self-exemption with
extra steps, and it removes the check for every project downstream.

## Additions this standard makes beyond the source

- R3 in full — the three-way classification, the prohibition on silent absence, and the ruling that a
  not-applicable rule stays visible in the assurance breakdown. The source says *where reasonable*
  and this is what stops that phrase becoming an unbounded self-exemption.
- R2's requirement that an example be the real artifact.
- R4 in full — one code path, and the general fixture-exclusion mechanism.
- R5 in full, including the rule that a correct finding changes the repository rather than the check.

## Relationship to other standards

[Standard 30](30-compliance-scoring.md) R3 and R4 supply the accounting R3 depends on —
not-applicable rules are `notEvaluated`, never a silent denominator adjustment.
[Standard 20](20-exceptions.md) is the mechanism for the second classification.
[Standard 28](28-github-actions.md) runs the self-audit R4 requires.
[Standard 29](29-testing.md) R2 defines the fixtures R4 requires excluded.
[Standard 6](06-project-manifest.md), [Standard 18](18-machine-readable-project-policy.md), and
[Standard 11](11-architecture-decision-records.md) define the artifacts R1 requires.
[Standard 32](32-documentation-quality.md) R3 is the same posture applied to this repository's prose.

## Implementation

**All four of R1's artifacts exist, and the repository's own audit reports `COMPLIANT`.**

**Present.** `project-policy.yml` declares this repository's policy, validates against
[Standard 19](19-json-schema.md)'s schema, and is checked in CI.
`artifacts/adr/` holds two accepted decisions
([0001](../artifacts/adr/0001-canonical-status-vocabulary.md),
[0002](../artifacts/adr/0002-canonical-rule-identity.md)).
`artifacts/project-plan-breakdown/` holds the overview and three plan sections, written through
`/plan-structure` and `/plan-handoff` as [Standard 35](35-planning-requirements.md) requires.

**All four of R1's artifacts now exist.** `PROJECT.md` was the last, and the sequence it went through
is the standard working as intended: the compliance engine reported
`architecture.project-manifest` failing at a score of 89%, the failure was *not* waived — an exception
would have made a real gap disappear from view — and the manifest was written instead. The rule this
repository was most tempted to waive for its own convenience is the one it fixed.

**R3 is enforced, not merely satisfied.** The audit reports every catalogued rule in one of exactly
the three permitted classifications plus *not-evaluated*, and there is no fourth outcome available to
it. This repository's own run: 9 required rules evaluated and passing, 5 declared `not-applicable`
with a reason and a `revisitWhen` trigger, 12 reported `not-evaluated` because no implemented check
examines them. **Nothing is silently absent, because the engine has no way to express that.**

`not-evaluated` deserves naming as the honest fourth *outcome* — it is not a classification a project
chooses, it is the evaluator reporting that it did not look. Standard 30 R3 keeps it out of the
passed count, Standard 38 R3 keeps it from satisfying completion, and the coverage line prints it
next to the score so a reader cannot miss it.

**The limit of that claim, stated plainly:** the catalog holds 50 rules, not every requirement across
forty-four standards. The remainder still live as prose in each standard's `## Implementation`
section — a real disclosure that nothing counts and nothing can notice going stale. R3 is satisfied
over the rules that exist as rules.

**R4 is met.** The verdict is produced by the same engine, from the same catalog, that a consuming
project gets — there is no self-mode and no relaxed rule set. `npm run audit` runs `scripts/standards.mjs audit .` — the same entry point, flags, and
rule set a consuming project runs. Fixtures are excluded via a general `SKIP_DIRS` mechanism, added
after they were not, rather than by any self-referential special case.

**R5 is met and is where this standard has already paid for itself.** All four rows of its table are
real events in this repository's history, and each produced a guard that now runs in CI.

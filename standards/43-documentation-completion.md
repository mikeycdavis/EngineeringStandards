# Standard 43 — Documentation Completion Requirement

The final orchestration layer. Before substantial work is declared complete, a defined sequence runs
— and it ends with the only test that matters: could a fresh agent understand the resulting state
without this conversation?

Source: item 43 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **the completion procedure for documentation**. It introduces no documentation surface —
[Standard 39](39-codebase-documentation.md) defines those — and no new obligation to update them;
[Standard 42](42-documentation-freshness.md) does that. This standard is the checklist that carries
both out at the moment work is declared done, and it is the last standard in the series to execute.

## Requirements

### R1 — Determine whether the change affects documentation

**Before declaring substantial work complete, determine whether the change affects documentation.**

This is an explicit step, not an implicit one. The determination is made against
[Standard 42](42-documentation-freshness.md) R2's eleven triggering categories, and **the answer is
recorded either way** — because *documentation was considered and is unaffected* and *documentation
was never considered* produce identical repositories, and only one of them is complete work.

For work that touches none of the categories, the answer is *no* and this standard is satisfied in
one line.

### R2 — The completion sequence

**If it does**, reproduced verbatim from the source:

```text
update the relevant documentation

update Mermaid source diagrams if applicable

regenerate affected SVG diagrams

update plan artifacts

update ADRs when architectural decisions changed

update PROJECT.md when project-level state changed

run /codebase-docs when available and appropriate

verify that a fresh agent could understand the resulting state without relying on the current chat
```

The order is not arbitrary, and two adjacencies carry rules from other standards:

- **Mermaid source before SVG.** The `.mmd` is canonical and the `.svg` is derived
  ([Standard 39](39-codebase-documentation.md) R4). Regenerating first and editing after produces the
  hand-edited SVG that standard prohibits.
- **`/codebase-docs` after the manual updates, not instead of them.** The skill documents
  architecture; it does not write ADRs, plan artifacts, or `PROJECT.md`. Running it first means the
  manual steps get skipped because the documentation "looks updated".

**Where a step is not applicable, it is recorded as not applicable**
([Standard 34](34-dogfooding.md) R3). A checklist whose unmet items are indistinguishable from
inapplicable ones establishes nothing — which is the defect [Standard 38](38-definition-of-done.md)
R4 describes, arriving one layer down.

**`/codebase-docs` when available and appropriate** carries
[Standard 39](39-codebase-documentation.md) R1's fallback: if the skill is unavailable, reproduce its
intended behaviour manually rather than skipping documentation. A missing tool is not an exemption.

### R3 — The fresh-agent verification is the acceptance criterion

**Verify that a fresh agent could understand the resulting state without relying on the current
chat.**

This is the final step for a reason: it is the only one that tests the *outcome* rather than the
performance of the procedure. Every other step can be completed while leaving the repository
incomprehensible.

It is answerable concretely. From the repository alone, without conversation history:

| Question | Answered by |
| --- | --- |
| What is this project and what state is it in? | `PROJECT.md` ([6](06-project-manifest.md)) |
| What was decided, assumed, or left open? | ADRs and [41](41-decisions-assumptions-and-questions.md) records |
| What has been completed, and what comes next? | `artifacts/project-plan-breakdown/` ([35](35-planning-requirements.md)) |
| How does the system work? | [39](39-codebase-documentation.md) documentation |
| How do I build, test, and verify it? | Onboarding docs ([39](39-codebase-documentation.md) R5) and [9](09-verification.md) |

**If any answer requires the current conversation, the work is not complete** — that is the
requirement, and it is [Standard 5](05-resumability.md) stated as an acceptance criterion
([Standard 7](07-acceptance-criteria.md)) rather than as a property to aspire to.

The verification is performed as a check, not asserted. The honest form is to name where each answer
lives; the dishonest form is to state that a fresh agent could understand it.

### R4 — This standard executes; it does not define

**This standard MUST NOT define documentation surfaces, quality criteria, or update triggers.** Those
belong to [39](39-codebase-documentation.md), [32](32-documentation-quality.md), and
[42](42-documentation-freshness.md) respectively.

It is the third orchestration standard in the series, alongside
[35](35-planning-requirements.md) and [38](38-definition-of-done.md), and it follows the same rule
they do: a checklist that grows its own requirements becomes a fourth definition of documentation
that drifts from the other three ([Standard 37](37-quality-bar.md) R5).

Its entire content is *when this runs, in what order, and what proves it worked*.

### R5 — Where the sequence belongs

The sequence SHOULD be encoded somewhere it will actually run — a completion checklist in the plan
item, a pre-push check ([Standard 9](09-verification.md)), or a skill — rather than existing only as
prose in this standard.

A procedure that must be remembered is a procedure that is followed while attention is high and
skipped under pressure, which is precisely when documentation is most likely to go stale. This is the
same reasoning [Standard 39](39-codebase-documentation.md) R4 applies to the CI sync check:
a convention cheaper to break than to keep gets broken.

## Additions this standard makes beyond the source

- R1's requirement that the determination be recorded either way — *considered and unaffected* versus
  *never considered*.
- R2's reasoning for two orderings in the sequence, and the rule that inapplicable steps are recorded
  as such rather than left blank.
- R3's table converting the fresh-agent test into five answerable questions, and the ruling that it
  is performed rather than asserted.
- R4 in full — the prohibition on this standard defining anything.
- R5 in full.

## Relationship to other standards

[Standard 42](42-documentation-freshness.md) supplies R1's triggers and is the obligation this
standard carries out. [Standard 39](39-codebase-documentation.md) defines every surface R2 updates
and owns the Mermaid rule behind R2's first ordering.
[Standard 32](32-documentation-quality.md) defines correctness.
[Standard 5](05-resumability.md) is what R3 tests; [Standard 7](07-acceptance-criteria.md) is why R3
is phrased as a criterion. [Standard 38](38-definition-of-done.md) is the general completion
standard this one specialises for documentation, and R2's recording rule is its R4 one layer down.
[Standard 41](41-decisions-assumptions-and-questions.md) R1 states the principle R3 verifies.
[Standard 9](09-verification.md) is where R5's check would live.

## Implementation

**Followed by practice for the parts that apply, and unenforced.**

Each batch of standards in this repository has updated the README index, the source inventory, and
the affected standards in the same commit, and the two ADRs were written when architectural decisions
changed — R2's first, fourth, and fifth steps. `PROJECT.md` does not exist, so the sixth step has no
target ([Standard 6](06-project-manifest.md), [Standard 34](34-dogfooding.md)).

**R2's second and third steps are now unblocked and were exercised.** `docs/architecture.mmd` is the
canonical Mermaid source ([ADR 0003](../artifacts/adr/0003-mermaid-is-the-canonical-diagram-source.md)),
updated before its embedded copy — R2's first ordering rule — and `scripts/diagrams.mjs` enforces
that ordering in CI rather than trusting it. The third step, regenerating the `.svg`, is declared
not-applicable for this repository with the reasoning recorded, which is what R2 requires of a step
that does not apply.

**R3 is partially satisfied and can be stated precisely.** From this repository alone, a fresh agent
can determine what the project is (`README.md`), what was decided (`artifacts/adr/`), how the audit
works (`design/standards-audit-cli.md` and each standard's `## Implementation` section), and how to
build and verify (`package.json` scripts, CI). **It cannot determine current project state or what
comes next from a machine-readable artifact** — `artifacts/project-plan-breakdown/` covers three
sections of work rather than the whole system
([Standard 35](35-planning-requirements.md)), and there is no `PROJECT.md`. Those answers currently
live in prose spread across forty-four `## Implementation` sections, which is a real disclosure and
not a substitute.

**R5 is not implemented.** The sequence exists only as this document. The natural home is the
`pre-push` skill, which already implements [Standard 9](09-verification.md).

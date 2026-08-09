# Standard 38 — Definition of Done

The aggregation point. Everything the framework can establish about a project arrives here and is
resolved into one answer — and this standard's job is to make sure that answer cannot be reached by
ticking boxes while a required rule is failing or unevaluated.

Source: item 38 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md), including its **Final Deliverables** section.

## Scope

Defines **release completion** for this framework, and the general rules that govern any definition
of done. Per-item completion is [Standard 7](07-acceptance-criteria.md) and
[Standard 9](09-verification.md); phase completion is
[Standard 36](36-implementation-strategy.md) R3; compliance status is
[Standard 30](30-compliance-scoring.md). This standard consumes all four and defines the conjunction.

## Requirements

### R1 — The first release criteria

**The first release is complete when**, reproduced verbatim from the source:

```text
The repository contains a coherent v1 engineering standard.

Standards have stable rule IDs.

project-policy.yml has a JSON Schema.

Example policies validate successfully.

The CLI can validate another repository.

The CLI supports human-readable and JSON output.

Validation has automated tests.

A non-compliant fixture produces expected failures.

An exception can suppress/acknowledge an applicable rule according to policy.

GitHub Actions runs the project's tests and validation.

The repository follows its own planning/artifact rules.

A new AI agent can inspect this repository and understand exactly what has been built and what should happen next.

There are no placeholder implementations or knowingly broken tests.

The project builds and tests successfully using documented commands.
```

Every one of these is demonstrable by running something or inspecting a committed artifact. None is
satisfied by an assertion that it is satisfied — which is R2.

### R2 — Implemented, verified, and released are three different states

**A definition of done MUST distinguish:**

| State | Means | Established by |
| --- | --- | --- |
| **Implemented** | The change exists in the repository | Inspection — the weakest of the three |
| **Verified** | The change was proven to do what was required | [Standard 9](09-verification.md) — a command that ran and passed |
| **Released** | The verified change is available to its consumers under a declared version | [Standard 21](21-versioning.md) |

Collapsing them is the most common completion defect, and each collapse fails differently.
*Implemented* reported as *verified* is a claim about behaviour resting on structural evidence —
[Standard 24](24-validator-rules.md) R2 at the level of a work item. *Verified* reported as
*released* means consumers are told they have something they cannot obtain.

This is why [ADR 0001](../artifacts/adr/0001-canonical-status-vocabulary.md) rejected `done` as a
status token: it reliably blurs into the first and weakest of the three.

**`COMPLETE` in the canonical vocabulary means verified**, not implemented. An item whose code exists
and whose verification has not run is `IN_PROGRESS`.

### R3 — `NOT_EVALUATED` does not satisfy completion

**A definition of done may only be satisfied when all applicable required conditions are either
verified, explicitly excepted, or explicitly classified not applicable under the governing
standards.** `NOT_EVALUATED` does not satisfy completion.

This closes the loophole the assurance model would otherwise leave open. A project can reach a high
score with most of its required rules unevaluated
([Standard 30](30-compliance-scoring.md) R4) — and without this rule, *no failures* would be
readable as *done*.

The three permitted resolutions, and nothing else:

| Resolution | Governed by | What it asserts |
| --- | --- | --- |
| **Verified** | [Standard 9](09-verification.md) | A check ran and passed |
| **Excepted** | [Standard 20](20-exceptions.md) | The requirement is not met, and that is approved, with a reason and an expiry |
| **Not applicable** | [Standard 34](34-dogfooding.md) R3 | The requirement cannot apply, with a stated reason |

Two consequences:

- **An expired exception is not a resolution.** It is a compliance failure
  ([Standard 20](20-exceptions.md)), so a definition of done resting on one is not satisfied.
- **A `manual-review` rule needs a recorded human judgement**, not silence. *Nobody looked* and
  *somebody looked and approved* are both consistent with an empty result, and only one of them is a
  resolution.

**Unknown is not a pass.** That sentence is the whole requirement, and it is the same principle as
[Standard 30](30-compliance-scoring.md) R1's `NOT_EVALUATED` status and
[Standard 24](24-validator-rules.md) R2's evidence scope, applied to the one question everybody
actually asks.

### R4 — A checklist never overrides a rule result

**A completed checklist MUST NOT be reported as done while an applicable required rule is failing.**

Where a checklist item and a validator disagree, the validator's result wins. A checklist is a human
assertion; a rule result is evidence, and evidence outranks assertion in every other part of this
framework — [Standard 24](24-validator-rules.md), [Standard 30](30-compliance-scoring.md) R2,
[Standard 44](44-existing-project-reconstruction.md)'s label taxonomy — for the same reason.

The failure mode is specific: fourteen ticked boxes and one `NON_COMPLIANT` status, reported as
complete because the boxes are the artifact people read. **The status is the verdict**
([Standard 30](30-compliance-scoring.md) R1), and completion is the *conjunction* of the checklist
and the status, never the checklist alone.

### R5 — No placeholders, no knowingly broken tests

**There are no placeholder implementations or knowingly broken tests.** Both are sharper requirements
than they look.

A **placeholder** is any code path that exists so that something appears present: a stub returning a
constant, a rule registered with no implementation, a command that parses its flags and does nothing.
Placeholders are false green at the structural level — a check that the thing exists passes, and it
does not work. If a capability is not built, its absence must be visible: no entry, no route, no
catalog record.

A **knowingly broken test** includes the skipped test, the commented-out assertion, and the
disabled CI step. Each is a decision recorded in the least durable way available. Either the test is
valuable — fix it — or it is not — delete it. A permanently skipped test is a documented failure that
nobody reads, and it inflates a suite's apparent coverage
([Standard 29](29-testing.md) R6).

Where something must be temporarily disabled, it is `DEFERRED` with a reason in the plan
([Standard 36](36-implementation-strategy.md) R5), not a silent skip.

### R6 — Final deliverables, and the chat response is not the record

**At completion, provide a concise implementation summary containing**, reproduced verbatim from the
source:

```text
Repository architecture
Standards implemented
CLI commands
Validation rules implemented
Tests added
Known limitations
Files added
How to use it in a new project
Recommended next iteration
```

**Do not rely on the final chat response as the project record.** Update:

```text
PROJECT.md
artifacts/project-plan-breakdown/
CHANGELOG.md
```

**so the repository itself contains the final state and handoff information.**

The ordering is the requirement: **the repository is updated first, and the response summarises what
is already durable.** A response written from work that has not been committed describes a state that
exists only in a conversation, and [Standard 5](05-resumability.md) is the standard it violates —
the next agent has repository access and no chat history.

Two rules follow:

- **The final response is explicitly non-canonical.** Anything in it that is not in the repository is
  lost. `Known limitations` and `Recommended next iteration` are the entries most often left only in
  chat, and they are exactly what a fresh agent needs most.
- **A summary MUST NOT claim more than the repository shows.** `Standards implemented` means
  documents that exist; `Validation rules implemented` means rules that run. A summary is an
  aggregate, and [Standard 24](24-validator-rules.md) R2 applies to it like anything else.

## Additions this standard makes beyond the source

- R2 in full — the three states and what each collapse costs.
- R3 in full — the ruling that `NOT_EVALUATED` does not satisfy completion, and the three permitted
  resolutions. This is the loophole the assurance model of [24](24-validator-rules.md) and
  [30](30-compliance-scoring.md) would otherwise leave open.
- R4 in full — evidence outranks assertion, and completion is a conjunction.
- R5's definitions of *placeholder* and *knowingly broken test*, and the routing of temporary
  disablement to `DEFERRED`.
- R6's ordering rule — repository first, response second — and the non-canonical framing. The source
  says not to rely on the chat response; this states what that means operationally.

## Relationship to other standards

[Standard 9](09-verification.md) supplies *verified*; [Standard 21](21-versioning.md) supplies
*released*; [Standard 8](08-status-tracking.md) supplies the vocabulary R2 constrains.
[Standard 20](20-exceptions.md) and [Standard 34](34-dogfooding.md) R3 supply R3's other two
resolutions. [Standard 30](30-compliance-scoring.md) supplies the status R4 defers to and the
`NOT_EVALUATED` R3 rejects. [Standard 24](24-validator-rules.md) R2 is the principle underneath R3,
R4, and R6. [Standard 36](36-implementation-strategy.md) R3 is this standard applied to a phase.
[Standard 5](05-resumability.md) is why R6 exists.

## Implementation

Against R1's fourteen criteria:

| Criterion | State |
| --- | --- |
| Coherent v1 engineering standard | **No** — 36 of 44 documents written, and no `VERSION` declares a v1 |
| Standards have stable rule IDs | **No** — the form is defined ([26](26-stable-rule-ids.md)) and settled ([ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md)); none are assigned |
| `project-policy.yml` has a JSON Schema | **No** — neither exists |
| Example policies validate successfully | **No** — nothing to validate, and nothing to validate with |
| CLI can validate another repository | **Yes** — `standards audit ../Other` and `--dir=` |
| Human-readable and JSON output | **Yes** |
| Validation has automated tests | **Yes** — 29 tests |
| Non-compliant fixture produces expected failures | **Yes** — every category has a provoking fixture and a non-provoking one |
| An exception can suppress an applicable rule | **No** — [Standard 20](20-exceptions.md) is specified and unbuilt |
| GitHub Actions runs tests and validation | **Yes** |
| Repository follows its own planning/artifact rules | **Partial** — plan breakdown and ADRs exist; `PROJECT.md` and `project-policy.yml` do not ([34](34-dogfooding.md)) |
| A new AI agent can understand what was built and what is next | **Partial** — each standard's `## Implementation` section states this in prose, and nothing machine-readable does |
| No placeholder implementations or knowingly broken tests | **Yes** — no skipped tests, no stub commands |
| Builds and tests using documented commands | **Yes** — `npm test`, `npm run audit`, `inventory`, `fidelity` |

Seven met, two partial, five not. **The release definition is not satisfied**, which is consistent
with the standing decision that this work stays on `develop` until the plan has no gaps.

**R3 is not currently checkable here**, and the reason is the same gap
[Standard 34](34-dogfooding.md) R3 records: with no `project-policy.yml`, there is nowhere to record
an exception or a not-applicable classification, so the two resolutions besides *verified* have no
home. The table above is the honest substitute and it is prose, so nothing counts it.

**R5 is met.** **R6 is untested** — no release has been made, and `PROJECT.md` and `CHANGELOG.md`,
two of the three artifacts it requires updated, do not yet exist.

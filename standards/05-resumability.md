# Standard 5 — Resumability

A fresh engineer or AI agent, with repository access and no previous chat history, should be able to
pick the project up. This is the standard the others are ultimately for: durable artifacts, acceptance
criteria, and manifests all exist so that someone arriving cold can continue the work.

Source: item 5 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to every project. The source calls this **a core standard** and states the failure condition
directly, which makes it unusual among these items: it defines not just what should be true but what
it means for a project to fall short.

## Requirements

### R1 — The ten questions

A fresh engineer or AI agent with repository access and no previous chat history SHOULD be able to
determine:

- what the project does
- what architecture it uses
- what work has been completed
- what work remains
- what is currently blocked
- important decisions and why they were made
- how to build the project
- how to test the project
- how to verify completed work
- what should happen next

### R2 — The failure condition

Reproduced from the source:

> If this cannot be determined from repository artifacts, the project is not sufficiently documented.

Two consequences follow, and they are what give this standard teeth:

**The test is the repository, not the team.** A question answerable only by asking someone who was
there is unanswered for the purposes of this standard. The knowledge existing somewhere is not the
same as it being recoverable.

**"Not sufficiently documented" is a defect, not a preference.** A project failing R1 has a
documentation gap in the same sense that it might have a failing test — something to record and
close, not a style disagreement.

### R3 — How to apply the test honestly

The only reliable way to evaluate R1 is to try to answer the ten questions **from the repository
alone**, deliberately setting aside what you already know. Anyone who has worked on a project cannot
easily tell which of their answers came from the files and which from memory, which is why a project
can feel well documented to its authors and be opaque to everyone else.

Where a question cannot be answered, the honest outcome is to record the gap rather than to answer it
from memory and move on. A confident answer sourced from recollection is exactly the failure mode
[Standard 44](44-existing-project-reconstruction.md) exists to prevent, applied to the present rather
than the past.

## Additions this standard makes beyond the source

R3 in its entirety. The source states the requirement and its failure condition; how to evaluate it
without deceiving yourself is this standard's contribution.

The framing of "not sufficiently documented" as a defect rather than a preference is likewise an
interpretation, though a direct one — the source states it as a conclusion about the project, not as
advice.

## Relationship to other standards

This standard is the outcome the others produce:

| Question from R1 | Answered by |
| --- | --- |
| What the project does, architecture, stack | [Standard 6](06-project-manifest.md) manifest; `docs/architecture.md` under Standard 39 |
| What is complete, remaining, blocked | [Standard 8](08-status-tracking.md) status vocabulary, applied to [Standard 4](04-planning-standards.md) plan files |
| Important decisions and why | Architecture Decision Records under [Standard 11](11-architecture-decision-records.md) |
| How to build, test, verify | [Standard 6](06-project-manifest.md) build and test commands; [Standard 7](07-acceptance-criteria.md) verification |
| What should happen next | [Standard 6](06-project-manifest.md) next recommended work |

[Standard 44](44-existing-project-reconstruction.md) is what to do when a project fails this standard
and no planning history survives: reconstruct the answers from evidence, labelled, rather than
inventing them.

## Implementation

**No single skill implements this standard** — it is a property of a repository, produced by
satisfying the others.

`standards audit` supports it only indirectly, through `missing-documentation`,
`missing-planning-artifacts`, and `open-reconstruction-questions`. None of those establishes that the
ten questions are answerable; a repository can pass every mechanical check and still leave a reader
unable to say what should happen next. Evaluating R1 requires reading, by someone willing to admit
what they could not find.

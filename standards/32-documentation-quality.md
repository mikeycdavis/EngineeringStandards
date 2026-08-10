# Standard 32 — Documentation Quality

Documentation is read by people deciding whether to adopt something and by agents deciding how to
operate it. This standard says what the entry document must answer, and — the harder part — what
makes a document wrong rather than merely old.

Source: item 32 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **explanatory documentation**: the README and the prose that surrounds a project. It does not
define machine-readable contracts — [Standard 15](15-ai-tool-contracts.md),
[Standard 18](18-machine-readable-project-policy.md), [Standard 19](19-json-schema.md), and
[Standard 25](25-validator-output.md) own those, and R4 exists to stop this standard duplicating
them. Agent-facing instruction files are [Standard 17](17-agent-instruction-files.md).

## Requirements

### R1 — What the README must explain

**README.md should explain**, reproduced verbatim from the source:

```text
what this repository is

why it exists

the philosophy behind it

how a project adopts the standard

how validation works

how standards are versioned

how exceptions work

how AI agents should consume it
```

These are eight distinct questions, and the last five are the ones usually missing. A README that
explains what a thing is and stops has answered the question a reader already knew to ask.

Each maps to a standard the reader will otherwise have to find alone:

| Question | Where the detail lives |
| --- | --- |
| how a project adopts the standard | [22](22-adoption-and-migration.md), [33](33-bootstrap-experience.md) |
| how validation works | [23](23-standards-validator-cli.md), [24](24-validator-rules.md) |
| how standards are versioned | [21](21-versioning.md) |
| how exceptions work | [20](20-exceptions.md) |
| how AI agents should consume it | [17](17-agent-instruction-files.md), [31](31-whatsnext-compatibility.md) |

The README answers each in a paragraph and links onward. It is a routing document, not a second copy
of the standards.

### R2 — State the philosophy in one sentence

**Include a concise statement similar to**, reproduced verbatim from the source:

```text
Design every project so a human can understand it, an AI can operate it, every meaningful action can be traced, and a fresh engineer or agent can resume the work without relying on conversation history.
```

This is worth carrying literally rather than paraphrasing, because it is the shortest correct
statement of what the whole series is for, and every standard resolves back to one of its four
clauses: comprehension ([1](01-human-and-ai-operability.md)), operability
([1](01-human-and-ai-operability.md), [2](02-propose-vs-execute.md)), traceability
([3](03-auditing.md)), and resumability ([5](05-resumability.md)).

A reader who takes nothing else from the README should take this.

### R3 — Documentation that contradicts the implementation is a defect

**Documentation that materially contradicts the implementation is a defect, not stale prose.**

This is the requirement that gives the standard teeth. "Out of date" is a description of age and
invites indefinite tolerance; "wrong" is a description of correctness and demands a fix. The
distinction matters because the consumers now include agents, and an agent given a README describing
a flag that does not exist will use the flag — the document does not merely fail to help, it actively
causes incorrect work.

*Material* is the qualifier, and it is meant seriously:

| Not a defect | A defect |
| --- | --- |
| Prose that could be clearer, or an example that is unfashionable | A documented command, flag, path, or field that does not exist |
| An omission — something true is simply not described | A stated behaviour the implementation does not have |
| A stale link to a moved document, where the target is findable | A documented default, limit, or status that is wrong |

Two consequences:

- **A material contradiction MUST be reported at error severity**, not as an advisory note.
- **A change that invalidates documentation is incomplete until the documentation changes with it.**
  This is [Standard 9](09-verification.md)'s posture applied to prose: the work is not done when the
  code is done.

Where a contradiction cannot be resolved immediately, it is corrected by *removing* the wrong claim,
not by leaving it with a caveat. A caveated falsehood is still read as a fact by anything skimming.

### R4 — Canonical contracts are referenced, never restated

**Where a structured contract exists — a schema, a tool definition, a rule catalog, an output
envelope — documentation MUST reference it rather than reproduce it.**

Restating a contract in prose creates a second definition that drifts from the first, and drift here
is exactly the defect R3 makes an error. It is also self-inflicted: nobody has to maintain a
description of an API that is generated from the API.

The division:

| Belongs to the contract | Belongs to the documentation |
| --- | --- |
| Field names, types, permitted values, defaults, required-ness | Why the contract is shaped that way |
| The exhaustive endpoint or rule list | Which parts matter for a common task, and in what order |
| Version and compatibility rules | What changed for a reader, and what they should do |

**This does not license undocumented interfaces.** The obligation is to point at the canonical
definition and explain what a reader cannot infer from it — intent, sequence, and the reason a
surprising choice was made. A schema states that `assurance` has three keys; only prose can say why
publishing a score without it is unsafe.

A worked example within this repository: [Standard 25](25-validator-output.md) defines the output
envelope once. [Standard 30](30-compliance-scoring.md) adds `assurance` to it and
[Standard 31](31-whatsnext-compatibility.md) declares which of its fields an external consumer may
depend on — neither reproduces the envelope. Each links to the definition and adds only what it owns.

### R5 — Structure is discoverable

The README SHOULD state the repository layout and the naming conventions a reader needs in order to
find things without being told.

Conventions that are followed but unwritten are indistinguishable from accidents, and the usual
outcome is that the next contributor breaks one — or, worse, an agent generalises from two examples
and applies a rule nobody holds. Writing the convention down costs three lines and is the difference
between a pattern and a coincidence.

## Additions this standard makes beyond the source

- R3 in full — the defect framing, the material/immaterial table, error severity, and the ruling that
  a wrong claim is removed rather than caveated. The source lists what a README should explain and
  says nothing about it being true.
- R4 in full — the reference-don't-restate rule and its division of labour. This is what keeps R1's
  breadth from producing a README that duplicates every machine-readable contract in the project.
- R1's mapping of each question to the standard that answers it in detail.
- R5 in full.

## Relationship to other standards

R1's eight questions route to [20](20-exceptions.md), [21](21-versioning.md),
[22](22-adoption-and-migration.md), [23](23-standards-validator-cli.md), and
[33](33-bootstrap-experience.md). R4 defers to [15](15-ai-tool-contracts.md),
[19](19-json-schema.md), [25](25-validator-output.md), and [27](27-rule-catalog.md) as canonical.
R3 is [Standard 9](09-verification.md)'s completion posture applied to prose, and is what
[Standard 44](44-existing-project-reconstruction.md) R5's *documented intent vs implementation*
section records when a reconstruction finds one.
[Standard 17](17-agent-instruction-files.md) governs the agent-facing files R1's last question points
at.

## Implementation

Partially met, and the gaps are the ones R1 predicts.

`README.md` answers *what this repository is* and *why it exists*, states the philosophy in its
opening paragraph — a standard is the contract, its skill is the implementation — indexes every
standard, and documents the layout and numbering convention, satisfying R5.

**R1 is now met.** The five previously-unanswered questions — adoption, validation, versioning,
exceptions, and agent consumption — are each answered in a row of the README's *Adopting these
standards* table, in a sentence, with a link onward. That is R1's intended shape: a routing document,
not a second copy of the standards.

The detail lives in [`INSTRUCTIONS.md`](../INSTRUCTIONS.md), which
[Standard 22](22-adoption-and-migration.md) R6 requires. Splitting it this way is R4 in practice —
the README says enough to orient a reader and points at the one document that owns the workflow,
rather than growing a third description of it.

Both documents describe what actually ships rather than what is specified: `INSTRUCTIONS.md` names
`standards audit`, not the `standards validate` of
[Standard 23](23-standards-validator-cli.md) R2, and records the discrepancy. A recipe naming a
command that does not exist is exactly the R3 defect, and `test/instructions.test.mjs` asserts that
every script and path the guide names exists — including a test that fails deliberately when the
rename lands, so the guide is updated in the same change set
([Standard 42](42-documentation-freshness.md) R2).

**R2 is met.** The philosophy sentence was added to the README when this standard was written — it
was a one-line gap that this document's own R2 made visible, and
[Standard 34](34-dogfooding.md) R5 is the reason it was fixed rather than recorded.

R3 is mechanically checked in one narrow direction: the audit's `doc-code-discrepancies` category
compares documented paths against the filesystem, and it caught exactly this class of defect during
the previous batch — a `rules/` directory named in the README that does not exist. That check covers
paths only, not behaviours, flags, or defaults.

R4 holds across the standards documents by construction: no standard reproduces another's contract.

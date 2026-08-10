# 0009 — Detectors distinguish instances of a subject from discussion of it

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

Four detector false positives have now shipped, and they are the same defect four times.

| Detector | Subject | What it actually flagged |
| --- | --- | --- |
| `detected-integrations` | An SDK the project uses | A comment naming `stripe` |
| `documentation.code-consistency` | A repository path the README claims | `/api/health`, an HTTP route |
| `security.no-secrets-in-artifacts` | A committed credential | Seeded fakes in a redaction test |
| `quality.unfinished-work` | An unfinished code path | A doc comment reading *"Deterministic, like a TODO:"*, and the fixture a TODO scanner is tested against |

Each was found and patched on its own. The first even acquired a regression test whose name states the
principle — *naming an SDK without importing it is not an integration* — and the insight generalised no
further than the detector it was written for. Three more instances followed.

The common shape is that each detector asked *does this text mention the thing?* and reported the
answer to *is this an instance of the thing?* Those questions diverge precisely where a repository has
reason to talk about the subject: documentation explaining a convention, a fixture exercising a parser,
an example showing the secure form, a test seeding the very value a scrubber must remove.

The fourth case is the clearest, because the flagged repository is a code-analysis tool. Its source is
necessarily dense with the vocabulary of everything it detects — a TODO scanner explains TODO syntax, a
redaction test must contain a credential to prove one is removed. Software whose purpose is analysis
contains representations of the things it reasons about, which makes it a stress test for any detector
built on lexical matching. A detector that survives it has moved from string matching toward something
closer to understanding.

## Decision

**A detector reports an instance of its subject, never a discussion of it.** Before a detector fires,
its author must be able to say what distinguishes the two in the material being scanned, and that
distinction must be in the code rather than in the author's head.

**The mechanism is the source view, and choosing one is the decision this record makes reusable.**
`scripts/standards.mjs` splits every scanned file once (`sources`, ADR 0007) and offers the result
through five views. Picking the wrong one is how each incident above happened; picking deliberately
is the fix, and it generalises past the four:

| View | What it establishes | Reach for it when the subject is |
| --- | --- | --- |
| `structureOf` | Syntax and construct existence — comments removed, string contents blanked | A language construct: a `catch` block, a call, a disabled TLS check |
| `sourceOf` | Literals and embedded executable text — comments removed, strings intact | Something that lives *inside* a string: a credential, an interpolated SQL statement |
| `commentsOf` | Commentary and documentation context only | A claim made *about* the code: an annotation, a justification, a marker |
| raw config text | The document as written | Structured configuration, where the literals are themselves the subject |
| filename only | Path identity, with no content read at all | A defect the name alone establishes, such as a committed `.env` |

**Every detector declares which view it scans and why, in its own doc comment.** The declaration is
the artefact that makes the choice reviewable: a reviewer can check the view against the subject
without reconstructing the author's reasoning, and a detector reaching for raw `contents` to answer a
question about code is visible as a defect rather than an oversight.

**That requirement binds new detectors and is not yet met by the existing ones.** Measured during
reconciliation: **5 of 22** detectors carry the declaration — the five added with the must-never
layer, where the rule was introduced. The remaining seventeen predate it. Stating this rather than
implying the convention is already universal matters, because a reader who assumes every detector
declares a view will trust an absent declaration to mean *no view needed*. Backfilling them is
outstanding work, not a decision this record makes.

The categories a detector has to hold apart, all of which legitimately contain the subject's
vocabulary:

- **Documentation and prose** describing the convention, syntax, or risk.
- **Examples**, including deliberately-wrong ones shown as counter-examples.
- **Fixtures and test data**, which frequently must be genuine instances for the test to mean anything.
- **Quoted code**, parser inputs, and recorded tool output.
- **The detector's own definition** — a regex that matches `TODO|FIXME` contains `TODO`.

**Where the distinction cannot be drawn honestly, the detector says so rather than guessing.** The
honest outcomes are a narrower rule that fires only on what it can establish, a lower `assurance` in
the catalog, or a `manual-review` rule that produces evidence for a human. Firing anyway and expecting
the reader to filter is not among them: a finding an adopter must learn to ignore trains them to ignore
the next one, and the detector has then made the project's compliance posture worse than no detector at
all.

**The signal is usually structural, not lexical.** Position within a comment, a leading marker rather
than a mid-sentence mention, an import rather than a mention of a package name, a leading `/` marking a
route rather than a path. Each of the four fixes above landed on a structural discriminator once the
question was put correctly, which is the practical reason to state the principle: it tells an author
what kind of answer to look for.

### Rejected — encode this as a compliance rule

The obvious move, and wrong. This is guidance for detector authors, not a property of an adopter's
repository, and no adopter can act on a finding that says their code confused a detector. It is also
close to undetectable in the general case: deciding whether a given match is an instance or a mention
is the same judgement the detector was already failing to make, so a rule enforcing it would need to be
right about exactly what its subject gets wrong.

### Rejected — exclude test and fixture directories wholesale

It would have silenced two of the four, and it silences real defects with them: a committed credential
in a test file is still a committed credential, and test code is code. Path-based exclusion also fails
the two prose cases entirely, which live in production source. The distinction that matters is what the
occurrence *is*, not where it sits.

## Consequences

**Existing detectors are not re-litigated on this basis alone.** The four fixes stand as they are; this
record explains why they exist and what they have in common, replacing four unrelated special cases with
one design philosophy. A fifth instance is now a known pattern rather than a new surprise.

**New detectors owe an answer up front.** *What distinguishes an instance from a mention here, and does
my implementation test for it?* If the answer is that nothing does, the detector is not ready, and the
right response is a narrower rule or a lower assurance rather than a broader match.

**Two known instances remain open, deliberately.** `security.no-secrets-in-artifacts` and
`quality.unfinished-work` both still fire on fixtures — a test seeding the value a scrubber must remove,
and the sample a scanner is tested against. Both are cases where the fixture is a genuine instance and
the distinction is intent, which is the hardest form of this problem and may not be reliably automatable.
They are recorded in [INSTRUCTIONS.md](../../INSTRUCTIONS.md) rather than patched, because a guess here
would produce exactly the finding an adopter learns to ignore.
[ADR 0008](0008-detectors-do-not-assert-repository-state-they-have-not-measured.md) covers the separate
defect in the same two rules.

**Analysis tools make good reference adopters.** Every one of these surfaced from outside this
repository, and the fourth from a repository whose subject is repository analysis. Validating against a
project that necessarily discusses what it detects is worth more than any amount of self-validation,
where a framework's conventions match its own detectors by construction.

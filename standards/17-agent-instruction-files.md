# Standard 17 — Agent Instruction Files

`AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md` are **bootstrap documents, not copies
of the standard.** Their job is to route an agent to the canonical sources, not to restate them.

Source: item 17 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to any project that provides instructions to AI coding agents. Part of the group organised
around **policy as executable configuration, not prose-only guidance** — with
[16](16-security.md), [18](18-machine-readable-project-policy.md), and [19](19-json-schema.md). This
standard is what makes an agent *load* the canonical policy rather than work from a paraphrase of it.

## Requirements

### R1 — Provide templates

A project SHOULD provide templates for, reproduced verbatim from the source:

```text
AGENTS.md
CLAUDE.md
.github/copilot-instructions.md
```

A project need not use all three; it uses those its agents actually read. The list is the set worth
templating, not a mandate to create every file.

### R2 — Do not duplicate the standard

**Do not duplicate the entire standard into these files. Instead, make them short bootstrap
documents.**

This is the whole point of the standard, and the requirement most likely to be violated with good
intentions. A copied standard is a **fork**: it is edited independently, it drifts, and an agent
following it eventually contradicts the canonical document while believing it is compliant. Because
agents read these files first and trust them, the copy wins in practice — so duplication does not
merely risk drift, it makes the fork authoritative.

The test: an instruction file should get shorter as the standards grow, not longer.

### R3 — What a bootstrap document tells an agent to do

They should tell an agent to, reproduced verbatim from the source:

- Read PROJECT.md.
- Read project-policy.yml.
- Identify the engineering standard version.
- Read the applicable standard documentation.
- Inspect current plan artifacts.
- Inspect ADRs.
- Run /plan-structure and /plan-handoff for planning work when available.
- Update durable artifacts when scope or architecture changes.
- Verify acceptance criteria before declaring work complete.
- Never rely on chat history as the sole project record.

Note the order: it is a **load sequence**, not a checklist. Manifest
([Standard 6](06-project-manifest.md)) for orientation, then policy
([Standard 18](18-machine-readable-project-policy.md)) for what this project has declared, then the
standard version it declares, then the standards themselves, then the live artifacts. Each step tells
the agent what to read next; skipping to the end means reading standards without knowing which
version or which exceptions apply.

### R4 — Reference, do not restate

Where an instruction file needs to convey a rule, it SHOULD **point at** the canonical source rather
than reproduce it. Paths, filenames, and the policy key are the right level of detail; requirement
text is not.

Two things legitimately belong in these files and nowhere else:

- **Where the canonical sources are**, if a project puts them somewhere non-standard.
- **Project-specific operational facts** an agent needs and no standard supplies — how to run the
  test suite, which branch to work on, what not to touch.

Everything else is a pointer. If an instruction file and a standard disagree, the standard governs
and the instruction file is the defect.

### R5 — Chat history is never the record

**Never rely on chat history as the sole project record.**

This restates [Standard 4](04-planning-standards.md) R3's "repository artifacts are canonical over
conversation history" at the point an agent will actually encounter it, which is the one repetition
this standard endorses: it is a routing instruction, not a duplicated requirement.

## Additions this standard makes beyond the source

- R2's characterisation of a copied standard as a fork that becomes authoritative in practice, and
  the shorter-as-standards-grow test.
- R3's reading of the list as a load sequence rather than a checklist.
- R4 in full — the reference-don't-restate rule, the two things that legitimately belong in these
  files, and the precedence rule when they disagree with a standard.

## Relationship to other standards

This standard is the bootstrap for the rest. [Standard 6](06-project-manifest.md) supplies
`PROJECT.md`; [Standard 18](18-machine-readable-project-policy.md) supplies `project-policy.yml` and
the standard version; [Standard 4](04-planning-standards.md) supplies the plan artifacts;
[Standard 11](11-architecture-decision-records.md) supplies the ADRs;
[Standard 7](07-acceptance-criteria.md) and [Standard 9](09-verification.md) define what verifying
before completion means.

[Standard 5](05-resumability.md) is the outcome this enables: an agent that follows R3's sequence can
answer the ten questions without any conversation history.

## Implementation

**Templates implemented; detection in a consuming repository not yet.**

`templates/AGENTS.md` and `templates/CLAUDE.md` satisfy R1 for the two files most projects use, and
`standards init` writes both. R3's load sequence is the spine of the `AGENTS.md` template, in order,
with each step naming the path it routes to.

`CLAUDE.md` is deliberately near-empty and defers to `AGENTS.md`. Two full instruction files would
reproduce R2's fork one level down — the same content in two places, drifting apart, with nothing
recording which one an agent actually followed. The template therefore carries only what is Claude
Code specific (which skills to use) and points at `AGENTS.md` for everything else.

R2's own test — *an instruction file should get shorter as the standards grow* — is enforced
mechanically rather than left to judgement: a test asserts each template is smaller than this
standard, that `CLAUDE.md` is smaller than `AGENTS.md`, and that `CLAUDE.md` does not restate the
load sequence. A further test asserts every template `init` writes exists, because a missing one is
a crash in an adopter's repository, half-bootstrapped.

**Not implemented:** `standards audit` still does not check a consuming repository for instruction
files or their length. The useful check is mechanical and narrow — an instruction file substantially
longer than the standards it points at is almost certainly duplicating them — and it is the same
comparison the template test already makes, applied to someone else's repository rather than to
`templates/`.

**The third template is missing.** R1 names `.github/copilot-instructions.md` alongside the other
two; only `AGENTS.md` and `CLAUDE.md` are provided. R1 is `SHOULD` and a project uses only the files
its agents read, so this is a gap in coverage rather than a violation — but it is a gap, and it is
recorded here rather than discovered.

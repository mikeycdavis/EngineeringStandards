# Standard 33 — Bootstrap Experience

Adoption has to be one command, and that command runs against repositories that already exist and
already contain work someone cares about. This standard governs `standards init`: what it creates,
what it must never touch, and how it tells the difference between a new project and an old one.

Source: item 33 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **project bootstrap**. The CLI it lives in is [Standard 23](23-standards-validator-cli.md);
the phased adoption path it starts is [Standard 22](22-adoption-and-migration.md); the reconstruction
it routes into for existing projects is [Standard 44](44-existing-project-reconstruction.md). This
standard wires those together and defines none of their behaviour.

## Requirements

### R1 — The command and what it generates

The goal, from the source: run

```bash
standards init
```

in a project and have it generate, reproduced verbatim from the source:

```text
PROJECT.md
project-policy.yml
AGENTS.md
CLAUDE.md
.github/copilot-instructions.md
artifacts/project-plan-breakdown/
artifacts/adr/
```

**You do not need to make init extremely sophisticated in the first version, but if practical
implement a minimal safe version.**

*Safe* is the operative word, and R2–R4 are what it means. A minimal `init` that is safe is more
useful than a sophisticated one that is not, because the repositories it runs in are not empty.

Two constraints on what it generates:

- **Generated policy MUST use canonical rule IDs** as policy keys
  ([ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md)). A bootstrap that emits alias
  spellings seeds every adopting project with the form that has to be migrated later.
- **Generated files MUST NOT assert compliance.** `init` creates structure; whether the project meets
  anything is [Standard 30](30-compliance-scoring.md)'s answer, from a validation run. A generated
  `PROJECT.md` claiming a status nobody evaluated is a false green at the moment of adoption.

### R2 — Non-destructive by default

**It must never overwrite existing files without explicit permission.**

This is the source's own requirement and the one that matters most, because the failure is
irreversible: an overwritten `CLAUDE.md` or `PROJECT.md` may be the only copy of work that was never
committed.

The rules:

- **An existing file is preserved, not merged, not appended to, not renamed.** It is reported as a
  conflict (R6) and left exactly as found.
- **Permission is per-file and explicit.** A global `--force` MUST NOT be the only way to resolve a
  single conflict, and there MUST be a way to see the conflicts before granting anything — which is
  R5.
- **A partially-completed run leaves no partial files.** If `init` cannot finish, what it wrote so far
  must be either complete files or nothing; a truncated `project-policy.yml` fails validation in a
  way that looks like the project's fault.

Directory creation is not overwriting: creating `artifacts/adr/` alongside existing contents is safe
and expected. Writing a file *into* a directory that already has one of that name is not.

### R3 — Idempotent where practical

**Re-running `init` on a bootstrapped project SHOULD converge rather than duplicate.** The second run
creates what is missing, preserves what exists, and reports both.

This is what makes `init` usable by an agent, which cannot reliably know whether a previous run
happened, and by a partially-adopted repository following [Standard 22](22-adoption-and-migration.md)
in phases. A command that is unsafe to repeat is a command that must be reasoned about before every
use.

"Where practical" is honest: `init` cannot make a hand-edited `PROJECT.md` converge on a template, and
must not try. Idempotence applies to *what is created*, never to *what is preserved*.

### R4 — Detect greenfield versus existing, and route accordingly

**`init` MUST determine whether it is bootstrapping a new project or an existing one, and MUST NOT
generate a clean-room plan for a project that already has an implementation.**

The failure this prevents is specific and bad: a scaffolded
`artifacts/project-plan-breakdown/` full of template sections, in a repository with two years of
code, is a fabricated history. It reads as a plan the project was built from. Every subsequent reader
— human or agent — then treats invented intent as recorded intent, which is precisely what
[Standard 44](44-existing-project-reconstruction.md) R2 forbids.

| Mode | Condition | What `init` does |
| --- | --- | --- |
| `greenfield` | No substantive implementation, or an implementation with a trustworthy original prompt or plan | Generate the R1 artifacts, including plan scaffolding |
| `existing-project` | A substantive implementation with no trustworthy plan or original prompt | Generate the R1 artifacts **except** plan content, and set `reconstructionRequired: true` |

In `existing-project` mode `init` creates the `artifacts/project-plan-breakdown/` directory but does
**not** populate it with invented sections. Populating it is
[Standard 44](44-existing-project-reconstruction.md)'s job, from evidence, with every claim labelled.

**`init` MUST NOT reimplement reconstruction.** It detects the condition, records it, and hands off.
Reconstruction logic living in two places would drift, and the copy inside a bootstrap command is the
one that would quietly lose the evidence labelling.

Mode detection is itself an inference and MUST be reported as one — it is `INFERRED`, in
[Standard 44](44-existing-project-reconstruction.md)'s vocabulary — and overridable
(`--mode=existing-project`). A wrong guess in either direction is recoverable only if the reader can
see which guess was made.

### R5 — Dry-run mode

**`init` MUST support a dry-run that reports what it would create, modify, or leave untouched,
without making changes:**

```bash
standards init --dry-run
```

Dry-run is what makes R2's permission model usable rather than a prompt-storm, and it is the only way
to inspect a brownfield repository's conflicts before committing to anything. For an agent it is
load-bearing in a different way: it converts adoption from an action into a proposal, which is
[Standard 2](02-propose-vs-execute.md) applied to bootstrap.

A dry-run MUST produce the same report as the real run would (R6), with the same mode detection and
the same conflict list. A dry-run whose output does not predict the real run is worse than none,
because it is trusted.

### R6 — A machine-readable bootstrap report

`init` MUST emit a structured report of what it did, or in dry-run what it would do:

```json
{
  "mode": "existing-project",
  "created": [],
  "preserved": [],
  "conflicts": [],
  "reconstructionRequired": true
}
```

| Field | Meaning |
| --- | --- |
| `mode` | `greenfield` or `existing-project`, per R4 |
| `created` | Paths written that did not exist |
| `preserved` | Paths left untouched because they already existed and matched what was wanted |
| `conflicts` | Paths that exist and differ from what `init` would write — nothing was changed |
| `reconstructionRequired` | Whether [Standard 44](44-existing-project-reconstruction.md) must run before the plan is trustworthy |

This is what lets an onboarding flow continue across processes. An agent that ran `init` yesterday,
or a portfolio tool scanning a repository it did not bootstrap
([Standard 31](31-whatsnext-compatibility.md)), can read the state instead of inferring it from the
filesystem — and inferring it from the filesystem is exactly how `reconstructionRequired` gets lost
and a fabricated plan gets written.

`preserved` and `conflicts` are deliberately separate. Both mean *nothing was written*, but the first
is success and the second is unfinished work.

The report is a machine interface and carries the usual obligations: a `schemaVersion`, governed by
[Standard 15](15-ai-tool-contracts.md), and no elevation of what it establishes
([Standard 24](24-validator-rules.md) R2). `created` lists files that exist. It does not mean they
are correct, and nothing downstream may read it as compliance.

### R7 — Generated scaffolding is never evidence about the project

**Tool-generated scaffolding MUST NOT become evidence of pre-existing project intent merely because
it exists on a subsequent run.**

A bootstrap tool inspects a repository to decide what it is looking at, and then writes into that
same repository. On the next run its own output is part of what it inspects. Unless the tool
distinguishes the two, it will read its own scaffolding as a fact about the project — and the
direction of that error is always toward *this project is further along than it is*.

This repository's own instance: `init` creates an empty `artifacts/project-plan-breakdown/` in
reconstruction mode, and a second run read that directory as evidence that a plan existed, flipping
the mode away from `reconstruction-required` and erasing the `reconstructionRequired` signal. An
empty plan directory is not a plan.

Two consequences, both general:

- **A marker must be evidence of content, not of existence.** A directory counts when it holds
  something; a file counts when it says something. Presence alone is what the tool itself creates.
- **A tool's detection MUST be idempotent with respect to its own output.** Running it twice must
  produce the same determination as running it once, and this is worth an explicit test rather than
  an assumption.

The rule generalises past bootstrap to any adoption or reconstruction tooling
([Standard 44](44-existing-project-reconstruction.md)): a reconstruction that treats its own
`reconstructed-baseline.md` as an `OBSERVED` source on a later pass has laundered an inference into
an observation.

## Additions this standard makes beyond the source

- R3 in full — idempotence, and the limit of it.
- R4 in full — mode detection, the routing into
  [Standard 44](44-existing-project-reconstruction.md), the prohibition on scaffolding a plan over an
  existing implementation, and the rule that `init` must not reimplement reconstruction. The source
  describes generation without distinguishing new projects from old ones, which is where the
  fabricated-history failure enters.
- R5's dry-run and the requirement that it predict the real run exactly.
- R7 in full — generated scaffolding is never evidence about the project. Found by this
  repository's own tests; it generalises to any adoption or reconstruction tooling.
- R6's bootstrap report in full.
- R2's per-file permission model, the no-partial-files rule, and the directory-versus-file
  distinction. The source states the overwrite prohibition; these are what it takes to honour it.
- R1's two constraints on generated content: canonical rule IDs, and no asserted compliance.

## Relationship to other standards

[Standard 23](23-standards-validator-cli.md) hosts this command.
[Standard 22](22-adoption-and-migration.md) defines the adoption path `init` begins and its
non-destructive posture. [Standard 44](44-existing-project-reconstruction.md) is what
`reconstructionRequired` routes to. [Standard 6](06-project-manifest.md),
[Standard 17](17-agent-instruction-files.md), [Standard 18](18-machine-readable-project-policy.md),
and [Standard 11](11-architecture-decision-records.md) define the artifacts R1 generates.
[Standard 2](02-propose-vs-execute.md) is what R5 implements.
[ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md) constrains the generated policy's keys.

## Implementation

**Implemented.** `standards init`, in `scripts/init.mjs`.

The module is split so the safety contract is structural rather than disciplinary: `plan()` is pure
and decides what would happen, `apply()` is the only function that writes. **`--dry-run` is
therefore not a second code path** — it is `plan()` without `apply()`, which is the only way to
guarantee R5's requirement that a dry run predict the real run exactly.

| Requirement | Implementation |
| --- | --- |
| R1 — generates the artifacts | `project-policy.yml`, `PROJECT.md`, `artifacts/project-plan-breakdown/`, `artifacts/adr/`, from `templates/`. A test asserts what it writes validates against the real schema |
| R2 — non-destructive | A differing file is a `conflict`; nothing is written. Overwriting requires naming the exact path (`--force-overwrite=PROJECT.md`), and approving one path does not approve another |
| R3 — idempotent | A second run recognises its own output and preserves it. Tested to three runs |
| R4 — mode detection and routing | `greenfield`, `existing-with-plan`, `reconstruction-required`, reported `INFERRED` with the evidence used, overridable by `--mode` (reported `CONFIRMED_BY_OWNER`) |
| R5 — dry run | Same computation as the real run |
| R6 — machine-readable report | `--json`, with `schemaVersion`, `mode`, `created`, `preserved`, `conflicts`, `overwrites`, `reconstructionRequired`, and `nextStep` |

**R4's prohibition is enforced and tested:** in `reconstruction-required` mode the plan directory is
created **empty**, and a test asserts it stays empty. Scaffolding template sections over existing
code is a fabricated history, indistinguishable from a real plan later. A second test asserts `init`
does not reimplement reconstruction — it checks the source carries no evidence-label or baseline
vocabulary, so the logic cannot quietly migrate here from
[Standard 44](44-existing-project-reconstruction.md).

**A real bug, caught by the tests and worth recording.** After creating an empty
`artifacts/project-plan-breakdown/`, a second run read *its own scaffolding* as evidence that a plan
existed, flipping the mode from `reconstruction-required` to `existing-with-plan` and erasing the
`reconstructionRequired` signal. An empty plan directory is not a plan; a tool must not treat its own
output as evidence about the project. Directory markers now require content.

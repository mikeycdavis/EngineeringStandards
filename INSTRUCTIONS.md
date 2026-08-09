# INSTRUCTIONS — how to adopt and use these standards

**Operator-facing.** This document tells a human or an agent how to consume this repository from
another project. It deliberately does **not** restate the 53 standards — those are in
[`standards/`](standards/), and each one states its own requirements. This is the workflow around
them.

> **Do not copy the standards documents into your repository.** Reference the standards version in
> your `project-policy.yml` and keep only project-specific declarations locally. A copied standard is
> a second definition that will drift from this one, silently, and the drift is only discovered when
> two projects disagree about what a rule means. This is the failure
> [ADR 0002](artifacts/adr/0002-canonical-rule-identity.md) and
> [Standard 37](standards/37-quality-bar.md) R5 exist to prevent.

---

## Minimum adoption recipe

```bash
# 1. Add a project policy
cp <standards-repo>/templates/project-policy.yml ./project-policy.yml

# 2. Validate the policy — this checks its shape, not your compliance
node <standards-repo>/scripts/policy.mjs ./project-policy.yml

# 3. Create the required project artifacts
cp <standards-repo>/templates/PROJECT.md ./PROJECT.md
cp <standards-repo>/templates/AGENTS.md ./AGENTS.md    # bootstrap for any coding agent
cp <standards-repo>/templates/CLAUDE.md ./CLAUDE.md    # Claude Code specifics only
mkdir -p .github artifacts/project-plan-breakdown artifacts/adr
cp <standards-repo>/templates/copilot-instructions.md ./.github/copilot-instructions.md

# 4. Run the planning and documentation workflows
#    /plan-structure  /plan-handoff  /codebase-docs

# 5. See what the tooling observes
node <standards-repo>/scripts/standards.mjs audit .

# 6. Get the verdict, and resolve every failure: fix it, except it, or declare it not applicable
node <standards-repo>/scripts/standards.mjs validate .
```

**Two commands, two jobs** ([ADR 0004](artifacts/adr/0004-audit-and-validate-are-separate-commands.md)):

| Command | Job | Needs a policy? |
| --- | --- | --- |
| `audit` | **Evidence discovery.** What the repository has and where it departs from the standards | No |
| `validate` | **The verdict.** Applies your policy, applicability, exceptions, and `nonExemptible` | Yes |

**Gate CI on `validate`.** Use `audit` for diagnostics, discovery, reconstruction, and evidence
inspection. They are not aliases and their exit codes mean different things — see sections 6 and 7.

---

## 1. What this repository is

A numbered series of 53 engineering standards, each a normative document stating what compliant work
must look like, plus the tooling that checks a repository against them.

| Part | Role |
| --- | --- |
| [`standards/`](standards/) | What the rules mean. One document per standard, `01`–`53` |
| [`schemas/`](schemas/) | What a valid policy looks like ([Standard 19](standards/19-json-schema.md)) |
| [`templates/`](templates/) | What to create in your project |
| [`scripts/`](scripts/) | How it is enforced |
| [`artifacts/adr/`](artifacts/adr/) | Decisions that changed the framework |
| **This file** | How to use all of it |

The executable procedures — planning, handoff, documentation, reconstruction — live as global Claude
Code skills rather than in this repository, so they work in any project without installation.

## 2. When another project should use it

When the project is expected to be operated by both humans and AI agents, and to survive the loss of
the conversation that built it. Concretely, adopt these standards when you need any of:

- A fresh engineer or agent to continue work from the repository alone
- Machine-readable declarations of what the project is held to
- Traceability of who or what changed something, and why
- A mechanical answer to "is this done"

A throwaway script does not need this. A system somebody will inherit does.

## 3. Declaring the standards version

One line in `project-policy.yml`:

```yaml
standardVersion: "1.0.0"
```

This pins which rules apply to you. A validator MUST evaluate against the rules in force in *that*
version ([Standard 27](standards/27-rule-catalog.md) R5) — without the pin, a new rule published
upstream would silently make your project non-compliant overnight.

An unresolvable version is a **configuration error**, not a compliance failure
([Standard 21](standards/21-versioning.md) R5).

## 4. Adding `project-policy.yml`

Copy [`templates/project-policy.yml`](templates/project-policy.yml) to your repository root and edit
it. It is a starting point, not a default — a policy nobody edited declares nothing about your
project.

Three constraints the schema enforces immediately:

- **Rule IDs are canonical kebab-case.** `ai.provider-neutral`, not `ai.providerNeutral`. The
  camelCase spellings in the source specification are legacy aliases; they are reported with their
  replacement and rejected ([ADR 0002](artifacts/adr/0002-canonical-rule-identity.md)).
- **Levels, not booleans.** `required`, `recommended`, `optional`, `forbidden`. `true` cannot express
  a considered partial adoption ([Standard 18](standards/18-machine-readable-project-policy.md) R6).
- **A policy selects and configures standards; it never redefines them**
  ([Standard 18](standards/18-machine-readable-project-policy.md) R1). If you need a rule to mean
  something different, that is an exception or an ADR, not a policy edit.

## 5. Validating the policy

```bash
node <standards-repo>/scripts/policy.mjs ./project-policy.yml
```

| Exit | Means |
| --- | --- |
| `0` | The policy is well-formed and internally consistent |
| `1` | The policy is valid but a compliance condition fails — an expired exception, or a rule declared both not-applicable and excepted |
| `2` | The policy could not be evaluated — unreadable, unparseable, or schema-invalid |

**A valid policy says nothing about whether you comply.** It says the declaration is well-formed.
Compliance comes from an audit run.

## 6. Running the audit — evidence

```bash
node <standards-repo>/scripts/standards.mjs audit .          # this repo
node <standards-repo>/scripts/standards.mjs audit ../Other   # another repo
node <standards-repo>/scripts/standards.mjs audit . --json
node <standards-repo>/scripts/standards.mjs audit . --strict
```

`audit` reports what the tooling observed and **never produces a compliance status**. It works with
no policy at all, which is what makes it the right command during reconstruction
([Standard 44](standards/44-existing-project-reconstruction.md)) and for general diagnostics.

Its exit codes are its own, documented separately from the compliance contract:

| Exit | Means |
| --- | --- |
| `0` | The survey completed |
| `1` | `--strict` was given and something needs attention |
| `2` | Invocation error |

`--strict` promotes warnings to failures. Think before making it a CI gate: a build that breaks on a
heuristic dead-code guess is a build someone disables
([Standard 28](standards/28-github-actions.md)). **For gating, use `validate`.**

## 7. Running validate — the verdict

```bash
node <standards-repo>/scripts/standards.mjs validate .
node <standards-repo>/scripts/standards.mjs validate . --json
```

| Exit | Means |
| --- | --- |
| `0` | Compliant, including `COMPLIANT_WITH_EXCEPTIONS` |
| `1` | Evaluated, and non-compliant |
| `2` | Invocation, configuration, or schema error — including **no `project-policy.yml`** |

A project with no policy is `NOT_EVALUATED` and exits `2`: you asked for a verdict and there is
nothing to evaluate against. That is a configuration problem, not a compliance failure
([Standard 30](standards/30-compliance-scoring.md) R1).

`validate` prints:

```text
Compliance
  Status: COMPLIANT
  Score:  100%  (required-level rules that were evaluated: 9)
  Rules:  12 passed, 0 failed, 0 warning(s), 12 skipped
  Cover:  12 automated, 0 manual-review, 7 not-evaluated
```

**Read the last three lines together.** 100% means every required rule that was *checked* passed;
the coverage line says how many were not checked at all; and the framework line says how much of the
framework has been turned into rules in the first place. None of the three combines into the others.

## 8. Classifying required / not-applicable / exception

Every rule you do not satisfy is exactly one of three things, and it must be recorded as such
([Standard 34](standards/34-dogfooding.md) R3). **There is no fourth category, and specifically no
*silently absent*.**

| Classification | Means | Where it goes |
| --- | --- | --- |
| **Failure** | The rule applies and is not met. Work is outstanding | Nowhere — it stays visible as a failure |
| **Not applicable** | The rule's subject does not exist in your project | `applicability:`, with a reason and ideally a `revisitWhen` |
| **Exception** | The rule applies, is not met, and that is approved | `exceptions:`, with reason, approver, date, and usually an expiry |
| **Attestation** | The rule applies, a human reviewed it, and it **is** satisfied | `attestations:`, with reviewer, date, and what was examined |

**An attestation is evidence, not a waiver**, and the difference matters: an attested rule is simply
satisfied and does **not** make you `COMPLIANT_WITH_EXCEPTIONS`. Use it for rules the catalog marks
`manual-review`, where no analyzer exists and a person is the evaluator:

```yaml
attestations:
  ai.destructive-approval:
    status: approved
    reviewedBy: "project-owner"
    reviewedAt: "2026-08-09"
    evidence: "Reviewed the overwrite/approval behaviour and its tests."
    reviewedAgainst:
      paths: [scripts/init.mjs, test/init.test.mjs]
      digest: "<validate prints it>"
```

Four rules bound it ([ADR 0005](artifacts/adr/0005-attestations-are-recorded-human-evidence.md)):
it **cannot** override an automated failure; it **cannot** be used on a rule the catalog does not
mark attestable; it goes **stale** when the reviewed paths change, returning the rule to
`not-evaluated`; and an expired one is not verified. Omit `digest` on a first pass — `validate`
prints the current one so you can record it.

The distinction that matters most: **not-applicable is a claim about your project, not about the
rule.** *We have no background jobs* stops being true the day you add one — which is what
`revisitWhen` records.

**Some rules are non-exemptible.** `security.no-secrets-in-artifacts` and `ai.destructive-approval`
declare this in the catalog, and an exception against either is **rejected, not recorded** — you get
`policy.non-exemptible-rule` from the policy checker and a `NON_COMPLIANT` verdict from the audit. If
such a rule genuinely has no subject in your project, declare it `not-applicable`; that is a
different claim and it is permitted.

Two things to resist:

- **Do not waive an inconvenient rule.** A visible failure is worth more than an approved one, because
  approved failures stop being looked at. This repository's own policy leaves
  `architecture.project-manifest` failing rather than excepting it.
- **Do not lower a level to avoid an exception.** Setting a `required` rule to `optional` achieves the
  same outcome while hiding it, and is the mechanism
  [Standard 18](standards/18-machine-readable-project-policy.md) R1 prohibits.

## 9. Bootstrapping — `standards init`

```bash
node <standards-repo>/scripts/standards.mjs init . --dry-run   # see what would happen
node <standards-repo>/scripts/standards.mjs init .             # do it
```

`init` creates `project-policy.yml`, `PROJECT.md`, `artifacts/project-plan-breakdown/`, and
`artifacts/adr/`. It detects which of three situations you are in and routes accordingly:

| Mode | When | What it does |
| --- | --- | --- |
| `greenfield` | No implementation markers | Creates everything; next step is `/plan-structure` and `/plan-handoff` |
| `existing-with-plan` | Implementation plus a real plan or original prompt | Creates what is missing; you **normalise** the existing plan rather than replacing it |
| `reconstruction-required` | Implementation, no trustworthy plan | Creates the plan directory **empty**, sets `reconstructionRequired: true`, and hands off to [Standard 44](standards/44-existing-project-reconstruction.md) |

**Mode detection is a guess and says so** — it is reported `INFERRED`, with the evidence it used.
Override it with `--mode=<mode>`, which is reported `CONFIRMED_BY_OWNER`.

### The safety contract

- **It never overwrites.** A file that exists and differs is reported as a **conflict**, and nothing
  is changed. Overwriting requires naming the exact path: `--force-overwrite=PROJECT.md`. Approving
  one path does not approve another.
- **`--dry-run` predicts the real run exactly**, because they are the same computation — the dry run
  is the planning half without the writing half.
- **Re-running is safe.** A second run recognises its own output and preserves it.
- `preserved` and `conflicts` both mean nothing was written; the first is success, the second is
  unfinished work.

| Exit | Means |
| --- | --- |
| `0` | Completed, no conflicts |
| `1` | Conflicts — nothing was changed, and you have to decide |
| `2` | init could not run |

`--json` emits the structured report, so an agent or WhatsNext can continue an onboarding flow it
did not start.

After `init`: run `/codebase-docs`, then `validate`, then resolve every failure per section 8.

## 10. Onboarding an existing project

Follow the flow in section 11. The short version: if the project has a trustworthy plan, normalize
what exists rather than replacing it. If it does not, you are in reconstruction mode and must not
write a plan as though the project were starting now.

Normalizing means: add the policy and manifest, check the existing plan against Standards
[4](standards/04-planning-standards.md), [7](standards/07-acceptance-criteria.md),
[8](standards/08-status-tracking.md), and [9](standards/09-verification.md), move it into
`artifacts/project-plan-breakdown/`, and write down decisions already made as ADRs. Migration is
**non-destructive and evidence-preserving** ([Standard 22](standards/22-adoption-and-migration.md)
R3) — you are not entitled to delete history that does not match the new shape.

## 11. The adoption decision flow

```mermaid
flowchart TB
    start(["Start: adopt the standards"])
    impl{"Does the repo already contain<br/>meaningful implementation?"}
    plan{"Is there a trustworthy original<br/>prompt or plan?"}

    subgraph green["Greenfield adoption"]
        g1["Add project-policy.yml"]
        g2["Add PROJECT.md"]
        g3["Run /plan-structure and /plan-handoff"]
        g4["Create artifacts/project-plan-breakdown/"]
        g1 --> g2 --> g3 --> g4
    end

    subgraph normalize["Normalize existing artifacts"]
        n1["Add project-policy.yml"]
        n2["Validate existing plan against Standards 4, 7, 8, 9"]
        n3["Move the plan to artifacts/project-plan-breakdown/"]
        n4["Record decisions already made as ADRs"]
        n1 --> n2 --> n3 --> n4
    end

    subgraph recon["Reconstruction mode — Standard 44"]
        r1["Inspect evidence before asking anything"]
        r2["Run /codebase-docs"]
        r3["Label every claim OBSERVED / INFERRED / UNKNOWN"]
        r4["Ask only material unanswered questions"]
        r5["Write reconstructed-baseline.md"]
        r6["Write RECONSTRUCTED-PROMPT.md"]
        r7["Write the decomposed plan"]
        r1 --> r2 --> r3 --> r4 --> r5 --> r6 --> r7
    end

    validate["Validate: policy, then audit"]
    classify["Classify every failure:<br/>fix, except, or not-applicable"]
    done(["Adopted"])

    start --> impl
    impl -->|No| green
    impl -->|Yes| plan
    plan -->|Yes| normalize
    plan -->|No| recon

    green --> validate
    normalize --> validate
    recon --> validate
    validate --> classify --> done
```

*Source: [`docs/adoption-flow.mmd`](docs/adoption-flow.mmd) — canonical
([ADR 0003](artifacts/adr/0003-mermaid-is-the-canonical-diagram-source.md)).*

**"Trustworthy" means you would act on it.** A `README` describing intentions, a stale ticket, or a
design document nobody followed is not a plan. If you find yourself reasoning about what the original
author *probably* meant, you are in reconstruction mode.

## 12. Reconstruction mode

Required when a project has an implementation and no trustworthy plan or original prompt
([Standard 44](standards/44-existing-project-reconstruction.md),
[Standard 22](standards/22-adoption-and-migration.md) R4). Use the `project-reconstruction` skill,
or reproduce its behaviour manually.

Two non-negotiables:

- **Evidence before questions.** Inspect the repository first; only ask what the evidence cannot
  answer. A question the code could have answered wastes the one channel you have to the owner.
- **No historical fabrication.** Never write "the original plan was" or "the developer intended".
  Write "the current implementation indicates", "the repository suggests", or "this cannot be
  determined from repository evidence". Every claim carries exactly one label: `OBSERVED`,
  `INFERRED`, `CONFIRMED_BY_OWNER`, or `UNKNOWN`.

**A scaffolded clean-room plan over existing code is a fabricated history.** Once committed it is
indistinguishable from a real one, and every later reader — human or agent — treats invented intent
as recorded intent. This is the single worst outcome of a careless adoption.

## 13. Required artifacts and directories

| Path | Standard | Required |
| --- | --- | --- |
| `project-policy.yml` | [18](standards/18-machine-readable-project-policy.md) | Yes |
| `PROJECT.md` | [6](standards/06-project-manifest.md) | Yes |
| `artifacts/project-plan-breakdown/` | [4](standards/04-planning-standards.md), [35](standards/35-planning-requirements.md) | Yes, when there is active work |
| `artifacts/adr/` | [11](standards/11-architecture-decision-records.md) | Yes |
| `artifacts/project-baseline/` | [44](standards/44-existing-project-reconstruction.md) | Only in reconstruction mode |
| `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md` | [17](standards/17-agent-instruction-files.md) | Where agents work in the repository |
| `docs/` | [39](standards/39-codebase-documentation.md) | Yes, for anything non-trivial |

## 14. How agents should read the standards

Point your agent instruction files here first, then to the project's own declarations:

```text
AGENTS.md / CLAUDE.md / .github/copilot-instructions.md
    -> INSTRUCTIONS.md        (this file — how to use the framework)
    -> project-policy.yml     (what THIS project is held to)
    -> standards/NN-*.md      (what a specific rule means, read on demand)
```

Copy [`templates/AGENTS.md`](templates/AGENTS.md), [`templates/CLAUDE.md`](templates/CLAUDE.md), and
[`templates/copilot-instructions.md`](templates/copilot-instructions.md) rather than writing your
own. They are short on purpose: `AGENTS.md` carries the load sequence and your project's operational
facts; the other two carry only what is specific to their own agent and defer to `AGENTS.md` for
everything else. **Do not paste the standards into any of them**
([Standard 17](standards/17-agent-instruction-files.md) R2) — an instruction file should get
*shorter* as the standards grow, and a copied rule becomes the one an agent actually follows.

An agent should **not** read all 53 standards before starting work. It should read the policy to
learn what applies, and open a standard when a rule is relevant to what it is doing. Each standard's
`## Implementation` section states what is actually built versus specified, which is the difference
between a rule you can rely on and one you cannot.

Three behaviours the standards require of an agent, worth stating up front because they change how
work is done rather than what is produced:

- **Propose before executing** for destructive or high-impact actions
  ([Standard 2](standards/02-propose-vs-execute.md))
- **Verify your own work** — run the tests, build, or validator rather than declaring success from
  inspection ([Standard 9](standards/09-verification.md))
- **Put everything durable in the repository.** Chat history is transient working context and must
  never be the only source of something needed to continue
  ([Standard 41](standards/41-decisions-assumptions-and-questions.md))

## 15. Planning

Run `/plan-structure` and `/plan-handoff` before implementation. If those skills are unavailable,
reproduce their intended behaviour manually — the requirement is on the outcome, not the tool
([Standard 35](standards/35-planning-requirements.md) R1).

Every top-level section becomes its own ordered file under `artifacts/project-plan-breakdown/`.
Every executable item carries:

```text
Status
Purpose
Deliverables
Acceptance Criteria
Verification
Dependencies
```

Status comes from the canonical vocabulary — `NOT_STARTED`, `READY`, `IN_PROGRESS`, `BLOCKED`,
`IN_REVIEW`, `COMPLETE`, `DEFERRED`, `CANCELLED`
([ADR 0001](artifacts/adr/0001-canonical-status-vocabulary.md)). Not `done`, and never a reference to
another tracker — that is relationship metadata, not a state.

**Status, Acceptance Criteria, and Verification are always applicable** to an executable item. Without
them an item cannot be reported on, finished, or proven finished.

## 16. Architecture decision records

Write an ADR for consequential choices: database technology, authentication model, AI provider
strategy, event architecture, or a deliberate deviation from these standards
([Standard 11](standards/11-architecture-decision-records.md)).

They live in `artifacts/adr/`, numbered, and record context, the decision, alternatives considered,
and consequences. The alternatives section is the one people skip and the one a future reader needs —
a decision without its rejected options is indistinguishable from an accident.

## 17. Documentation and `/codebase-docs`

Run `/codebase-docs` for initial documentation, after significant architectural change, and whenever
documentation is materially stale ([Standard 39](standards/39-codebase-documentation.md) R1).

Two rules that catch people out:

- **Mermaid `.mmd` is the canonical diagram source; SVG is a generated artifact.** Never hand-author
  or hand-edit an SVG representing a diagram — the edit is lost on the next regeneration, and after
  that happens once or twice, regeneration stops
  ([ADR 0003](artifacts/adr/0003-mermaid-is-the-canonical-diagram-source.md)).
- **Documentation that materially contradicts the implementation is a defect, not stale prose**
  ([Standard 32](standards/32-documentation-quality.md) R3). Update it in the same change set that
  invalidated it ([Standard 42](standards/42-documentation-freshness.md)). "We'll document it later"
  means the work is unfinished.

Where a structured contract exists — OpenAPI, JSON Schema, a tool definition — reference it rather
than restating it. Documentation adds what the contract cannot express: intent, sequence, and why a
surprising choice was made.

## 18. Upgrading to a newer standards version

1. Read the upstream `CHANGELOG` for what changed at your current version and above
2. Bump `standardVersion` in `project-policy.yml`
3. Re-validate the policy — a rule that no longer exists, or a key that has been superseded, surfaces
   here
4. Re-run the audit and classify any newly-applicable rules per section 7
5. Record the upgrade if it changed anything material

Adding a `required` rule is a `MAJOR` change upstream; adding a `recommended` one is `MINOR`
([Standard 21](standards/21-versioning.md), [Standard 27](standards/27-rule-catalog.md) R5).
Migration is incremental and non-destructive — you are not required to reach full compliance in one
step, and [Standard 22](standards/22-adoption-and-migration.md) R2 exists so that partial adoption is
a declared state rather than a failure.

**Deprecated rule IDs remain resolvable.** An exception you wrote years ago against a since-renamed
rule still means what its author intended
([Standard 26](standards/26-stable-rule-ids.md) R3).

### Upgrading from 1.x to 2.0

2.0.0 adds the must-never layer ([Standards 45–53](standards/45-engineering-invariants.md)), and
**your `validate` can newly fail or cap with no change to your code.** Three things cause that:

1. **New `forbidden` rules.** 23 of them, five mechanically detected. A detector finding a violation
   in code you already had is a new `NON_COMPLIANT`.
2. **One new `required` rule** — `architecture.dependency-evaluation`, at severity `warning`.
3. **The unestablished-prohibition rule** ([Standard 45](standards/45-engineering-invariants.md) R6).
   An applicable `forbidden` rule that is neither evaluated, attested, nor declared not-applicable
   caps your verdict at `NOT_EVALUATED` and **exits 1**. This is the one that will surprise you: your
   project can be doing nothing wrong and still not report `COMPLIANT`, because a prohibition nobody
   looked for has established nothing. A `passing` prohibition means *no violation was found by the
   stated search*; a prohibition with no search behind it means nothing at all.

**Resolve each one, in this order.** There are four honest paths and deleting the rule from your
policy is not among them — an undeclared rule is reported as undeclared:

| Path | When |
| --- | --- |
| **Evaluate** | A detector exists. Fix what it found, or confirm it found nothing |
| **Attest** | A human reviewed it. Record who, when, what was reviewed, and the paths — so the attestation goes stale when they change ([ADR 0005](artifacts/adr/0005-attestations-are-recorded-human-evidence.md)) |
| **Declare not-applicable** | The rule has no subject in your project. Include `revisitWhen`, naming what would make it apply |
| **Except** | The rule applies, the situation is real, and the rule is exemptible. Nine rules are not — an exception against those is rejected, not recorded |

Expect the first 2.0 run to report `NOT_EVALUATED` rather than `NON_COMPLIANT`. That is the intended
experience: it is telling you which prohibitions have not been examined, not accusing you of
violating them. This repository's own policy went through exactly that, and its `## Applicability`
section is a worked example of the third path.

**What did not change**, so you do not have to look:

- **The policy schema.** A 1.x `project-policy.yml` still validates unchanged.
- **Rule IDs and aliases.** Nothing was renamed, deprecated, or removed.
- **Exit-code meanings**, except that `NOT_EVALUATED` from the new trigger exits 1 rather than 0. A
  missing or unreadable policy is still exit 2.
- **`audit`.** Its contract, flags, and exit codes are untouched; it gained five detectors.

**The inventory artifact changed shape** — `artifacts/standards-source-inventory.json` now lists
`sources[]` and every entry names its source. This matters only if you have forked this repository or
written a tool that reads that file. It is not part of the adoption surface.

## 19. What not to do

- **Do not copy the standards into your repository.** Reference the version; keep declarations local.
- **Do not scaffold a clean-room plan over an existing codebase.** That is a fabricated history.
- **Do not fabricate historical intent.** "The original plan was" has no place in a reconstructed
  artifact.
- **Do not waive a rule because it is inconvenient.** Leave the failure visible.
- **Do not lower a rule's level to avoid writing an exception.** Same outcome, hidden.
- **Do not treat a clean audit as compliance.** It means nothing matched the patterns that are
  implemented — coverage is partial by design, and the tool says so.
- **Do not treat a score as proof.** Status is the verdict; a percentage is a summary statistic
  ([Standard 30](standards/30-compliance-scoring.md)).
- **Do not hand-edit a generated artifact** — SVG renders, generated schemas, or anything else with a
  source.
- **Do not leave the plan in the conversation.** If it is not in the repository, it does not exist.
- **Do not declare work complete with unevaluated required rules.** Verified, excepted, or explicitly
  not applicable — `NOT_EVALUATED` does not satisfy completion
  ([Standard 38](standards/38-definition-of-done.md) R3).

---

## Current limitations of the tooling

Stated here rather than discovered later. Most of what this table used to say is now closed.

| Gap | Consequence for you |
| --- | --- |
| The catalog covers 50 rules across 23 of 53 standards | Rules outside it are reported `not-evaluated` rather than passing — honest, but a `COMPLIANT` verdict covers less than the whole framework. The audit prints this as `frameworkCoverage` so you never have to remember it |
| Several rules are `manual-review` or have no analyzer | They report `skipped / not-evaluated`, never passing. Read the coverage line, not just the score |
| No `standardVersion` resolution ([21](standards/21-versioning.md) R5) | With one published version there is nothing to resolve against; an unresolvable version is not yet rejected |

Each is recorded in the `## Implementation` section of the standard that specifies it.

**Closed since the first version of this guide:** the tooling reads `project-policy.yml`, applies
applicability and exceptions, enforces `nonExemptible`, binds every finding to a canonical rule id,
and emits a [Standard 30](standards/30-compliance-scoring.md) verdict with score, assurance, and
framework coverage. `standards validate` ships, and the framework publishes `1.0.0` with its frozen
surface enumerated in [CHANGELOG.md](CHANGELOG.md).

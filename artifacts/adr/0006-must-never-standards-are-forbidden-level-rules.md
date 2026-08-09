# 0006 — Must-never standards are forbidden-level catalog rules, not a new mechanism

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

A second source document — [`second-fold-in-prompt.md`](../prompts/second-fold-in-prompt.md) — asked
for an "Engineering Must-Never Standards" layer: eleven categories of prohibition covering source
control, testing, errors, data, security, architecture, APIs, concurrency, observability, and
AI-generated engineering, plus a meta-standard, a severity model, and automatic enforcement.

Four questions had to be answered before anything could be written.

**1. Where does it live?** A standalone repository was considered and rejected: the prohibitions
route to existing standards constantly, and a separate repository would either duplicate those
standards or depend on them, which is the fork [Standard 22](../../standards/22-adoption-and-migration.md)
R6 prohibits.

**2. What mechanism expresses a prohibition?** The catalog has had a fourth level — `forbidden` —
since 1.0.0, defined in `scripts/catalog.mjs` and handled by `scripts/compliance.mjs` exactly like
`required`, and used by zero rules. Either it was the mechanism or it was dead metadata.

**3. How many rules?** The source lists roughly sixty prohibitions. Most are already prohibited by an
existing standard.

**4. What does a passing prohibition mean?** A `required` rule is satisfied by the project *doing*
something. A `forbidden` rule is satisfied by the *absence* of a violation — and absence found by a
search that never ran is not absence.

## Decision

**One umbrella standard and eight domain standards, in this repository.**
[Standard 45](../../standards/45-engineering-invariants.md) defines what a prohibition is: the
semantics of `forbidden`, the exception discipline, the verification classes, and the verdict rule.
Standards 46–53 carry the domain prohibitions. The alternative — one large standard — was rejected
because a project adopting the framework needs to declare applicability per domain, and a
single standard cannot be half-applicable.

**Domain category prefixes, never a `never.*` category.** Rule ids are `scm.no-committed-env-files`,
`errors.no-false-success`, `security.no-cert-bypass`. A `never.*` namespace would sort every
prohibition away from the domain it belongs to, and a reader looking at security rules would find
half of them somewhere else.

**Activate `forbidden` rather than add a mechanism.** 23 of the 26 new rules are `forbidden`; one is
`required` (`architecture.dependency-evaluation`, which is obligation-shaped — the source forbids
adding a dependency *without evaluating*, so there is no prohibited artifact to search for), and two
are `recommended` where a prohibition would be excepted more often than it fired.

**Reuse over duplication.** Standard 45 R4 maps every source prohibition already bound by an existing
standard to that standard, and the domain standards cite the existing rule id rather than minting a
near-duplicate. Secrets route to [16](../../standards/16-security.md) R2, destructive defaults to
[2](../../standards/02-propose-vs-execute.md) R3 and `ai.destructive-approval`, scope to
[10](../../standards/10-scope-change-management.md) R1, contracts to
[15](../../standards/15-ai-tool-contracts.md), UI logic to
[1](../../standards/01-human-and-ai-operability.md) R1, stubs to
[38](../../standards/38-definition-of-done.md) R5, skips to
[30](../../standards/30-compliance-scoring.md) R3 and [28](../../standards/28-github-actions.md) R5,
and duplicate-on-retry to [13](../../standards/13-idempotency.md).

**A qualifier internalized into the wording implies non-exemptibility.** Where the legitimate case is
already carved out by the prohibition's own words — *merely to pass*, *solely to hide*, *silently* —
nothing an exception could cover is legitimate, so the rule is `nonExemptible`. Nine rules qualify.
Every other rule stays exemptible and its standard states the exact conditions, justification,
evidence, approval, and revisit conditions the source requires.

**An unestablished prohibition caps the verdict at `NOT_EVALUATED`.** An applicable `forbidden` rule
that is neither evaluated, attested, nor declared not-applicable blocks `COMPLIANT` and exits 1. The
check runs *after* the `NON_COMPLIANT` and `COMPLIANT_WITH_EXCEPTIONS` determinations, so it cannot
intercept the exception machinery — a rule that was excepted, rejected, or declared not-applicable
has been looked at. Only the case where nothing happened at all is capped.

**Multi-source inventory, with per-standard fidelity resolution.** The inventory now lists its
sources; each declares an extraction mode; each entry names the source it came from. The second
prompt has no numbered items, so its standards declare the `##`/`###` sections they realize, and
`scripts/fidelity.mjs` verifies each quote against the text of the sections *that standard* declares
— not merely against the file. A section mapping that does not constrain the quotes would assert
provenance while verifying nothing about it. A section may be claimed by one standard only, unless
the entry sets `sharedSections`.

## Consequences

**This is a `MAJOR` release.** New `required` and `forbidden` rules can newly fail an adopter's
`validate` with no code change, the verdict cap is new behaviour, and the inventory artifact changed
shape. [Standard 21](../../standards/21-versioning.md) requires `2.0.0`. The policy **schema** did
not change — a 1.x policy file still validates — and no rule id, alias, or exit-code meaning changed
except the new `NOT_EVALUATED` trigger.

**Adopters will see `NOT_EVALUATED` before they see `NON_COMPLIANT`.** That is the intended
experience: the first run after adopting 2.0 says *here are the prohibitions nobody has looked for*,
and the four resolution paths are stated in order in `INSTRUCTIONS.md`.

**Most of the layer is review-required, and that is a property of the rules.** Five prohibitions are
mechanically detected. The rest are claims about *why* something was done — why a test changed, why a
control was disabled, why a dependency was added — and intent is not in the diff. A heuristic that
guessed at intent would produce findings nobody could act on and clean runs nobody should trust,
which is the brittle check the source itself prohibits. The verdict cap is what keeps
"review-required" from meaning "ignored".

**This repository reports `NOT_EVALUATED` on itself** until its owner records an attestation for each
prohibition that has a real subject here. Eight were declared not-applicable against repository
evidence; the remaining eleven are about this framework's own development, and an agent writing them
would be manufacturing the evidence its own work needs to pass — the failure
[Standard 53](../../standards/53-ai-engineering-honesty.md) R5 names and
[ADR 0005](0005-attestations-are-recorded-human-evidence.md) exists to prevent.

## Deferred

- **[Standard 21](../../standards/21-versioning.md) R5 — version *resolution*.** A project pins
  `standardVersion`, and nothing yet resolves the rule set as it stood at that version; every run
  evaluates against the catalog on disk. This release is the first that makes the gap exercisable,
  since 1.x and 2.0 now disagree about which rules exist. Recorded, not closed.
- **Git-history-based detection.** Test removal, coverage regression, and history rewriting are all
  detectable in principle and all require comparing against a previous state of the repository.
- **Entropy-based secret scanning**, rejected as brittle; **dynamic-evaluation detection**, rejected
  because finding the call says nothing about the prohibition's qualifiers; **destructive-command
  detection**, rejected because `DROP TABLE` and `rm -rf` appear legitimately in migrations, test
  teardown, and build scripts.

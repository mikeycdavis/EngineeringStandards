# EngineeringStandards — Project Plan

**This is not a reconstructed plan.** This repository has genuine planning history for the work done
so far: the source specification for Standard 44 is committed at
[`artifacts/prompts/original_prompt.md`](../prompts/original_prompt.md), and the reasoning behind
every decision below was recorded as it was made. Standard 44 defines a *Reconstructed Project Plan*
for projects that lack such history — do not confuse this document for one, and do not apply
reconstruction labeling conventions to it. Where a statement here rests on inference rather than
record, it says so inline.

It does follow Standard 44's plan format — ordered files under `artifacts/project-plan-breakdown/`,
with every executable item carrying Status, Purpose, Deliverables, Acceptance Criteria, Verification,
and Dependencies — because that format is worth using generally, and because a standards repository
that does not follow its own standards is not credible. Statuses use the canonical vocabulary of
[Standard 8](../../standards/08-status-tracking.md), per
[ADR 0001](../adr/0001-canonical-status-vocabulary.md).

**Every executable item also carries an `Evidence` field** naming the commit, issue, ADR, test, or
artifact that establishes its current status. Added 2026-08-11, for a reason the audit that prompted
it demonstrated: without those links, reconciling the plan against history means inferring
correspondence from prose, one item at a time, and the inference is not reproducible. A status with
no evidence link is an assertion; a status with one is a claim someone else can check. Where an item
is delegated to another tracking system, the pointer is a `Tracked by` field and is not a status —
[ADR 0001](../adr/0001-canonical-status-vocabulary.md) again.

## What this project is

A durable home for a numbered series of engineering standards. Each standard is a **normative
document** stating what compliant work must look like. The **executable procedure** that carries a
standard out lives as a global Claude Code skill in `~/.claude/skills/`, so it applies in every
repository without anything being installed there. The standard is the contract; the skill is the
implementation.

## Current state

| | |
| --- | --- |
| Branch | `develop` (also the default branch for pull requests) |
| Remote | `https://github.com/mikeycdavis/EngineeringStandards.git` |
| Standards written | 53 of 53 — see [the index](../../README.md) |
| Version | `2.0.0` on `develop` as a release *candidate* — no tag, no GitHub release, no `master` merge |
| Tooling | `scripts/standards.mjs` (`audit`, `validate`, `init`), `scripts/compliance.mjs` (the verdict engine), `scripts/attestations.mjs` / `reviews.mjs` / `repository.mjs` (recorded human review and its provenance), `scripts/inventory.mjs` / `fidelity.mjs` / `policy.mjs` / `diagrams.mjs` (the invariant checks), `scripts/agent-instructions.mjs` (generated operating rules), a `node:test` suite, and GitHub Actions CI including a reusable `standards-validate.yml`. Zero third-party dependencies. |
| Platform | Windows 11; PowerShell is the primary shell, with a POSIX `sh` also available |

Standards documents live in `standards/`, forward-looking designs in `design/`, decision records in
`artifacts/adr/`, and source specification material in `artifacts/prompts/`. The canonical
enumeration of the series is `artifacts/standards-source-inventory.json`.

## Sections

| File | Covers | Status |
| --- | --- | --- |
| [`01-standard-44.md`](01-standard-44.md) | Standard 44 — Existing Project Reconstruction | complete, one criterion superseded |
| [`02-standards-backfill.md`](02-standards-backfill.md) | Backfilling the remaining standards as documents | complete — 53 written |
| [`03-standards-audit-cli.md`](03-standards-audit-cli.md) | Building the `standards audit` command | complete |
| [`04-compliance-and-policy-system.md`](04-compliance-and-policy-system.md) | The rule catalog, the project policy, and the `validate` verdict engine | complete |
| [`05-attestations-and-provenance.md`](05-attestations-and-provenance.md) | Recorded human review, its freshness, and its digests | complete |
| [`06-must-never-standards.md`](06-must-never-standards.md) | Standards 45–53 and the forbidden-level rules they define | complete |
| [`07-distributed-validation-and-ci.md`](07-distributed-validation-and-ci.md) | Shipping the verdict to other repositories, and this one's own gate | one item blocked |
| [`08-open-defects-and-deferred-tracks.md`](08-open-defects-and-deferred-tracks.md) | Every open issue, recorded rejection, and deliberately dormant track | open by design |

**Sections 04–08 were added on 2026-08-11**, after an audit found that 72 merged commits had built an
entire compliance system the plan did not describe. See *Scope changes* at the bottom of this file.

## Decisions on record

These were decided deliberately. Reopening one is a choice, not a correction — the reasoning is here
so a future reader can weigh it rather than re-derive it.

**Skills live globally, not in this repository.** All skills that implement standards sit in
`C:\Users\Mike\.claude\skills\`. They are deliberately **not** copied or mirrored here.

*Why:* a project-scoped copy in `.claude/skills/` shadows the user-level one rather than replacing
it, producing two files that drift. The `backlog` skill warns about exactly this failure mode for its
own validator script, and the same logic applies with more force to documents nobody diffs.

*The accepted consequence:* the skills are not version-controlled anywhere. There is no history, no
backup, and no review for changes to them. That cost was accepted in exchange for having exactly one
copy of each. If it ever becomes intolerable, the fix is to make this repository the source of truth
and sync outward with a one-way script — not to add a second copy and hope.

**Standards are one numbered document per file**, named `NN-<kebab-title>.md` in `standards/`.
Single-digit numbers are zero-padded (`01-` through `09-`) so a directory listing sorts numerically.
The alternative — one growing `STANDARDS.md` — was rejected because it becomes unnavigable at 44+
entries and makes every change a conflict-prone edit to one file.

**Forward-looking designs live in `design/`, not inside the standard that motivated them.** The audit
CLI is designed to check *all* standards, so parking its design inside Standard 44 would strand it
there when standards 1–43 land.

**All work stays on `develop` until this plan is complete with zero gaps.** Do not merge to `master`,
tag, or cut a release while any item in any section is unfinished or blocked. Pushing `develop` to
`origin` is fine and expected — that is a backup, not a release.

*Why:* a standards repository is only credible if the series is whole. A `master` carrying Standard
44 alone reads as though 44 is the standard, when it is one of many. The gate is **zero gaps**, not
"most items done": every section complete, and every blocker resolved rather than deferred. As of the
last update, `origin/master` sits at `cc1c373` and is deliberately behind.

*Amended 2026-08-11 — pull requests are now required, not forbidden.* The original wording banned
opening a pull request. That half is superseded: `develop` is a protected branch and every change
reaches it through a reviewed PR. The `master`/tag/release half of the gate is unchanged and still
binding. The two are not the same restriction — a PR into `develop` is how work is reviewed, and a
merge to `master` is what publishes it.

*Amended 2026-08-11 — the gate reads the repaired plan, not the historical one.* Zero gaps means zero
gaps across **all** sections including 04–08, not across the original four. A plan that describes a
smaller project than the one on `develop` cannot establish that the project has no gaps; completing
01–03 while the compliance system went unrepresented would have produced a complete plan for the
wrong project. Section 08 exists so the remaining obligations are visible rather than absent.

## Constraints that apply to all work here

- **Never fabricate history.** This constraint governs the repository's own documents, not just the
  artifacts its standards produce. Where the record does not say why something was done, say that
  rather than inventing a reason.
- **A standard and its skill must not disagree.** Shared material — the evidence-label taxonomy,
  banned phrasings, Definitions of Done, artifact paths, required field names — is duplicated between
  the normative document and its skill by design, so the skill is usable standalone. Duplication that
  drifts is worse than no duplication at all, so any edit to shared material must be applied to both
  in the same change. Section 03's audit is the eventual mechanical guard; until it exists, this is
  enforced by hand.
- **A negative discovery result must not become a durable project fact unless the discovery
  mechanism was validated for the relevant input shape.** "No item 8 exists", "no TODOs found", "no
  API exists", "no ADR exists", "no tests cover this", "the source is nowhere on this machine" — each
  of these is, in the first instance, a fact about the search rather than about the world. Before
  recording one as fact, establish that the mechanism could have found the thing had it been there:
  run it against a case you know is positive, or check by a second, differently-shaped method.

  This is not hypothetical. A regex anchored on `^[0-9]+\. ` reported that the source contained 43
  standards; item 8 was the only one written with a Markdown heading prefix. That number was written
  into three documents as established fact and propagated for several commits before the item turned
  up by accident. `scripts/inventory.mjs` and its tests now enforce the invariant for the standards
  series specifically, but the principle is general and applies to every "we looked and found
  nothing" claim this project makes.

- **Do not paraphrase source specification text.** Where a standard reproduces a list from
  `artifacts/prompts/original_prompt.md`, it reproduces it verbatim. Rewording a requirement while
  claiming to implement it is how a standard quietly stops matching its source.

## Scope changes

Add dated entries here when scope materially changes.

**2026-08-09 — Standard 44 gains R11 and R12.** The standard shipped with R1–R10 reproducing the
source specification. Two requirements were added: R11 (tool-generated scaffolding is never evidence
of intent) and R12 (the validated-search invariant). Section 01's acceptance criterion *"exactly ten
requirement headings"* is superseded by this change rather than satisfied by it — see the amendment
recorded on that item. Commit `9061c0e`; disclosed in [CHANGELOG](../../CHANGELOG.md) under 2.0.0.

**2026-08-09 — the must-never layer extends the series past 44.** Standards 45–53 were added from a
second reviewed source, taking the series from 44 documents to 53 and requiring `inventory.mjs` and
`fidelity.mjs` to become multi-source. Recorded in
[ADR 0006](../adr/0006-must-never-standards-are-forbidden-level-rules.md); commits `8822ed2`,
`d13431d`. Section 02's *"1–43"* framing predates this and describes the original range only.

**2026-08-11 — the plan is repaired to describe the system actually on `develop`.** An audit of the
four original sections against 72 merged commits found that the plan's scope, not merely its
statuses, had fallen behind: the rule catalog, the project policy, the `validate` verdict engine, the
attestation and provenance machinery, standards 45–53, the reusable CI check, and thirteen ADRs had
no plan item of any kind, and eleven open GitHub issues existed as a parallel obligation system with
no plan owner. Sections 04–08 were added to cover them, stale statuses in 00–03 were corrected, and
every executable item gained an `Evidence` field. Nothing was declared out of scope — the work is
release-relevant and changes the product surface, so classifying it out of scope after the fact would
have converted an omission into a decision.

**Not a scope change:** the counts in section 02's prose (*"there are 44 standards"*, *"1–43"*) and
section 03's dated *"Done: 20 tests over four committed fixtures"* are historical records of what was
true when written. They are left as written under the never-fabricate-history constraint below.
Present-tense claims that have since become false were corrected; past-tense records of a moment were
not.

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
| Standards written | 16 of 44 — see [the index](../../README.md) |
| Tooling | `scripts/standards.mjs` (the audit), `scripts/inventory.mjs` (the series invariant), a `node:test` suite, and GitHub Actions CI. Zero third-party dependencies. |
| Platform | Windows 11; PowerShell is the primary shell, with a POSIX `sh` also available |

Standards documents live in `standards/`, forward-looking designs in `design/`, decision records in
`artifacts/adr/`, and source specification material in `artifacts/prompts/`. The canonical
enumeration of the series is `artifacts/standards-source-inventory.json`.

## Sections

| File | Covers | Status |
| --- | --- | --- |
| [`01-standard-44.md`](01-standard-44.md) | Standard 44 — Existing Project Reconstruction | complete |
| [`02-standards-backfill.md`](02-standards-backfill.md) | Backfilling the remaining standards as documents | in progress — 16 of 44 written |
| [`03-standards-audit-cli.md`](03-standards-audit-cli.md) | Building the `standards audit` command | complete |

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
open a pull request, or cut a release while any item in any section is unfinished or blocked.
Pushing `develop` to `origin` is fine and expected — that is a backup, not a release.

*Why:* a standards repository is only credible if the series is whole. A `master` carrying Standard
44 alone reads as though 44 is the standard, when it is one of forty-four. The gate is **zero gaps**,
not "most items done": every section complete, and section 02's blocker resolved rather than deferred.
As of the last update, `origin/master` sits at `cc1c373` and is deliberately behind.

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

None recorded. Add dated entries here when scope materially changes.

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
that does not follow its own standards is not credible.

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
| Commits | `cc1c373` (README), `14177fa` (Standard 44), `9b20743` (delegated liveness) |
| Tooling | None. No `package.json`, no npm, no CI, no tests. Every file is Markdown. |
| Platform | Windows 11; PowerShell is the primary shell, with a POSIX `sh` also available |

Standards documents live in `standards/`, forward-looking designs in `design/`, and source
specification material in `artifacts/prompts/`.

## Sections

| File | Covers | Status |
| --- | --- | --- |
| [`01-standard-44.md`](01-standard-44.md) | Standard 44 — Existing Project Reconstruction | complete |
| [`02-standards-backfill.md`](02-standards-backfill.md) | Backfilling standards 1–43 as documents | blocked on source material |
| [`03-standards-audit-cli.md`](03-standards-audit-cli.md) | Building the `standards audit` command | not started |

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
- **Do not paraphrase source specification text.** Where a standard reproduces a list from
  `artifacts/prompts/original_prompt.md`, it reproduces it verbatim. Rewording a requirement while
  claiming to implement it is how a standard quietly stops matching its source.

## Scope changes

None recorded. Add dated entries here when scope materially changes.

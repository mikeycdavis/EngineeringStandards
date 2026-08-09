# 02 — Backfilling standards 1–43

Standard 44 is the only standard in this repository. The other items of the same numbered series
exist as source text and, in part, as global Claude Code skills — but not yet as documents here. This
section covers turning them into normative documents alongside 44.

## Source located — 2026-08-08

**The blocker is resolved.** The owner supplied a ChatGPT share link containing the original spec, and
it is now committed verbatim at
[`artifacts/prompts/engineering-standards-spec.md`](../prompts/engineering-standards-spec.md).

What it contains: top-level items **1 through 44**, titled `1. Human and AI Operability` through
`44. Existing Project Reconstruction`.

Three facts about the source that the backfill must respect:

- **There are 44 standards, numbered 1–44 with no gaps.** An earlier revision of this file claimed
  there was no item 8. That was wrong. Item 8 (Status Tracking) is the only heading in the source
  written as `# 8. Status Tracking` with a Markdown prefix; every other item is a bare `N. Title`, so
  a regex anchored on `^[0-9]+\. ` missed it. The lesson is the same one the audit tool keeps
  teaching: a scan that finds nothing is evidence about the scan before it is evidence about the
  world. Verify a negative before recording it as fact.
- **Item 22 (Adoption and Migration) contains a nested 1–10 list.** Those are steps within that item,
  not top-level standards.
- **Fidelity is degraded.** The text was extracted from the rendered share page rather than the
  original Markdown, so list markers are stripped: bullets and ordered-list numbers inside an item's
  body appear as bare lines. Wording and line order are intact. Where formatting matters,
  `artifacts/prompts/original_prompt.md` is the higher-fidelity copy of item 44 and their substantive
  content agrees.

The earlier conclusion that no source existed was correct about this machine — the spec lives in a
ChatGPT conversation, which is exactly the failure mode standard 4 (Planning Standards) exists to
prevent. Committing it is the fix.

## What the skills tell us, and what they do not

The global skills directory contains eighteen entries. They are **evidence that certain standards
were implemented**, not evidence of which numbers they carry or what their normative text said.

Likely implementations of items in this series — inferred from their subject matter, not established:

`codebase-docs`, `plan-structure`, `plan-handoff`, `backlog`, `backlog-validate`,
`backlog-reconcile`, `pre-push`

Almost certainly **not** standards in this series, being domain-specific tooling rather than general
engineering standards: `advsec-alert-triage`, `advsec-preflight`, `dotnet-appsettings-audit`,
`ask-gpt`, `relay-inbox`, `relay-status`, `send-update-to-gpt`.

Three further entries — `plan-handoff.skill`, `plan-structure.skill`, `pre-push.skill` — are stale
zip archives from an old packaging step, not live skills. They will drift from the real directories
and are cleanup candidates, tracked in this section below.

Note that 7 candidate skills cannot account for 44 standards. Most of the series is either implemented
in ways that left no skill, or not implemented at all. The source text names the subject of each
standard, so which is which is now answerable per item — but it must be established from each
standard's content, not assumed from a skill's name.

---

### Obtain and commit the source specification for items 1–43

- **Status:** COMPLETE — 2026-08-08, `artifacts/prompts/engineering-standards-spec.md`
- **Purpose:** Everything else in this section depends on it, and no substitute is acceptable.
- **Deliverables:** the source text committed under `artifacts/prompts/`, following the existing
  naming — `original_prompt.md` holds item 44, so either extend that file or add a sibling whose name
  states its range.
- **Acceptance Criteria:** the committed text covers items 1–43 and is the owner's original, not a
  paraphrase or a reconstruction.
- **Verification:** `ls artifacts/prompts/` shows the new file, and its item numbering runs 1–44 with
  no gaps. Confirmed after correcting a scanning error that had reported item 8 missing.
- **Dependencies:** none — this is the root blocker.

### Write standards 1–43 as normative documents

- **Status:** IN_PROGRESS — 1–7 written; 36 remain (8–43)
- **Purpose:** Give each standard the same normative contract Standard 44 has, so the series is
  citable, auditable, and enforceable rather than living only as skill behavior.
- **Deliverables:** `standards/NN-<kebab-title>.md` for each item, zero-padded for single digits
  (`01-` through `09-`), following the structure Standard 44 established: Scope, numbered
  requirements, and an Implementation section naming the skill that carries it out.
- **Acceptance Criteria:**
  - One file per item, numerically ordered by filename.
  - Every list drawn from the source is reproduced verbatim, and every deliberate departure from the
    source is disclosed as an addition with its reason — the convention Standard 44 set.
  - Each document names its implementing skill, or states explicitly that none exists.
  - Where a document's requirements and its skill disagree, the disagreement is resolved in the same
    change rather than deferred.
- **Verification:** `ls standards/` lists 44 files sorting numerically, `01-` through `44-`, with no
  gaps. For each, confirm the Implementation section names a directory that exists under
  `~/.claude/skills/`, or says none does.
- **Dependencies:** the source specification above.

### Update the README index as standards land

- **Status:** READY — unblocked, follows each standard as it lands
- **Purpose:** [`README.md`](../../README.md) currently collapses 1–43 into a single
  "backfill pending" row. That row is accurate today and becomes a lie the moment the first backfilled
  standard lands.
- **Deliverables:** an index table row per standard, replacing the placeholder row.
- **Acceptance Criteria:** no row claims a document that does not exist; no `standards/` file is
  missing from the table; the string "backfill pending" does not survive the last backfilled item.
- **Verification:** `grep -c "backfill pending" README.md` returns 0 once the series is complete, and
  the row count matches `ls standards/*.md | wc -l`.
- **Dependencies:** the item above.

### Remove the stale `.skill` archives

- **Status:** COMPLETE — 2026-08-08, confirmed by the owner before deletion
- **Purpose:** `plan-handoff.skill`, `plan-structure.skill`, and `pre-push.skill` in
  `C:\Users\Mike\.claude\skills\` are zip archives each containing a single `SKILL.md`, dated well
  before the live directories of the same names. They are a second copy of three skills, already
  drifted, and they will mislead anyone who opens one expecting current text.
- **Deliverables:** the three archives deleted.
- **Acceptance Criteria:** the three `.skill` files are gone; the three live directories
  (`plan-handoff/`, `plan-structure/`, `pre-push/`) are untouched and still contain their `SKILL.md`.
- **Verification:**
  ```bash
  ls ~/.claude/skills/*.skill 2>/dev/null | wc -l          # → 0
  ls ~/.claude/skills/plan-handoff/SKILL.md ~/.claude/skills/plan-structure/SKILL.md ~/.claude/skills/pre-push/SKILL.md
  ```
  The second command must list all three files. Both confirmed after deletion.
- **Dependencies:** none.
- **What the archives actually contained,** established by extracting and diffing each against its
  live counterpart before deleting: `plan-structure.skill` and `pre-push.skill` were byte-identical
  to the live files. `plan-handoff.skill` differed by five lines, all of them superseded — the Step 1
  sentence from before it learned about `artifacts/project-plan-breakdown/`, and the duplicated
  "Transfer the reasoning" and "Surface the gotchas" rules that were removed as a defect. No unique
  content was lost. Their internal timestamps disagreed with their filesystem dates (the `pre-push`
  entry was stamped 2026-06-20 against the others' 2026-07-17), so they were not produced in a single
  packaging pass.

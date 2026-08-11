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
- **Evidence:** [`artifacts/prompts/engineering-standards-spec.md`](../prompts/engineering-standards-spec.md),
  committed at `4393230` (which also corrected the item-8 scanning error). `npm run inventory`
  verifies bidirectional agreement between the source's items and the files claiming them, and
  `npm run fidelity` verifies every block a standard claims verbatim against it.
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

- **Status:** COMPLETE — 2026-08-11. All 43 written; the series runs `01`–`53` with no gaps, the
  extra nine coming from the must-never layer covered in
  [`06-must-never-standards.md`](06-must-never-standards.md).
- **Evidence:** commits `72d93b6` (1–3), `4393230` (4–7), `11bc2c0` (8–11), `9f34acc` (12–15),
  `b9c4f98` (16–19), `c6992f2` (20–23), `3f2d6b9` (24–27), `aef463d` (28–31), `71270b8` (32–35),
  `b0a7964` (36–39), `1eef68c` (40–43). Mechanically re-checked 2026-08-11 against merged `develop`:
  53 files in `standards/`, numerically contiguous, every one carrying an `## Implementation`
  section. `npm run inventory` and `npm run fidelity` are the standing guards and both pass in CI.
- **Purpose:** Give each standard the same normative contract Standard 44 has, so the series is
  citable, auditable, and enforceable rather than living only as skill behavior.
- **Deliverables:** one document per item in [`standards/`](../../standards), named for its number
  and kebab-cased title, zero-padded for single digits so a directory listing sorts numerically, and
  following the structure Standard 44 established: Scope, numbered requirements, and an
  Implementation section naming the skill that carries it out. The canonical file-to-item mapping is
  [`artifacts/standards-source-inventory.json`](../standards-source-inventory.json), which
  `npm run inventory` checks in both directions.
- **Acceptance Criteria:**
  - One file per item, numerically ordered by filename.
  - Every list drawn from the source is reproduced verbatim, and every deliberate departure from the
    source is disclosed as an addition with its reason — the convention Standard 44 set.
  - Each document names its implementing skill, or states explicitly that none exists.
  - Where a document's requirements and its skill disagree, the disagreement is resolved in the same
    change rather than deferred.
- **Verification:** `ls standards/` lists files sorting numerically with no gaps — `01-` through
  `44-` from this section's source, `45-` through `53-` from the second. `npm run inventory` checks
  this bidirectionally and fails on either a file no entry claims or an entry with no file. For each,
  confirm the Implementation section names a directory that exists under `~/.claude/skills/`, or says
  none does.
- **Dependencies:** the source specification above.
- **What this item's completion does and does not establish.** Three of its acceptance criteria are
  not mechanically decidable from repository evidence, and marking the item COMPLETE does not claim
  otherwise:
  - *"every deliberate departure disclosed as an addition with its reason"* — `npm run fidelity`
    verifies that each block claimed as verbatim **is** verbatim. It cannot verify that an
    **undisclosed** departure was disclosed, because an absent disclosure and an absent departure
    look identical to it. This is the same shape as R12's validated-search invariant: the check
    establishes what it covers and nothing beyond.
  - *"where a document's requirements and its skill disagree, the disagreement is resolved in the
    same change"* — skills are outside version control by the standing decision in
    [`00-overview.md`](00-overview.md), so there is no history to check this against on any machine
    but the author's.
  - *"each document names its implementing skill, or states explicitly that none exists"* — all 53
    carry an `## Implementation` section, which is checkable. Whether each one correctly names a
    skill that exists and does what it claims is a reading task, not a mechanical one.

  These are recorded rather than solved. Closing them would need the skills under version control,
  which the global-skill decision deliberately traded away.
- **What closing this item revealed, 2026-08-11.** Flipping the status to COMPLETE immediately
  produced an `error`-severity `plan-code-discrepancies` finding: the Deliverables line read
  `standards/NN-<kebab-title>.md`, and `detectPlanDiscrepancies` resolved that placeholder as a
  literal path, correctly reporting that no such file exists. The detector was right and the plan was
  wrong — a naming *convention* had been written in the slot reserved for a deliverable *path*, and
  nothing caught it for three days because an `IN_PROGRESS` item's deliverables are never resolved.
  The line now names [`standards/`](../../standards) and the inventory artifact, both of which exist.
  Two things worth keeping from this: a status change is not a bookkeeping act, it is what submits an
  item to checks it was previously exempt from; and the fix was to correct the plan's wording, not to
  loosen the detector — a placeholder that resolves to nothing is exactly what R7 exists to catch.

### Update the README index as standards land

- **Status:** COMPLETE — 2026-08-11
- **Evidence:** [`README.md`](../../README.md) carries 53 index rows, one per file in `standards/`,
  and `grep -c "backfill pending" README.md` returns 0. The placeholder row was replaced
  incrementally as each batch landed, in the same commits listed on the item above; the final rows
  for 45–53 arrived at `d13431d`.
- **Purpose:** [`README.md`](../../README.md) currently collapses 1–43 into a single
  "backfill pending" row. That row is accurate today and becomes a lie the moment the first backfilled
  standard lands.
- **Deliverables:** an index table row per standard, replacing the placeholder row.
- **Acceptance Criteria:** no row claims a document that does not exist; no `standards/` file is
  missing from the table; the string "backfill pending" does not survive the last backfilled item.
- **Verification:** `grep -c "backfill pending" README.md` returns 0 once the series is complete, and
  the row count matches `ls standards/*.md | wc -l`. Both confirmed 2026-08-11: `0` and `53`/`53`.
- **Dependencies:** the item above.

### Remove the stale `.skill` archives

- **Status:** COMPLETE — 2026-08-08, confirmed by the owner before deletion
- **Evidence:** none in this repository — the archives were outside it. `ls ~/.claude/skills/*.skill
  | wc -l` returns `0` and the three live directories still hold their `SKILL.md`, re-checked
  2026-08-11. The diff record of what each archive contained is preserved in prose at the end of this
  item, which is the only surviving evidence that no unique content was lost.
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

# 01 — Standard 44: Existing Project Reconstruction

The first standard landed in this repository, and the one that established its layout. It governs
onboarding a pre-existing project that has no trustworthy original prompt, requirements document, or
project plan: rather than inventing one from assumptions, perform an evidence-based reconstruction
that produces a labeled baseline, a reconstructed canonical prompt, an open-questions list, and a
decomposed plan.

Source specification: [`artifacts/prompts/original_prompt.md`](../prompts/original_prompt.md),
committed in full so the standard can be diffed against what it claims to implement.

This section is complete. It is kept, rather than deleted, because the acceptance criteria below are
the regression suite for the standard — anything that later edits Standard 44 or its skill must still
satisfy them, and there is no automated check that enforces it.

---

### Write the normative standard document

- **Status:** done — commit `14177fa`, amended by `9b20743`
- **Purpose:** State what a compliant reconstruction must look like, so that the procedure has a
  contract to satisfy and a later audit has requirements to cite.
- **Deliverables:** [`standards/44-existing-project-reconstruction.md`](../../standards/44-existing-project-reconstruction.md)
  — Scope, requirements R1–R10, a forward-looking Tooling section, and an Implementation section
  naming the skill.
- **Acceptance Criteria:**
  - Exactly ten requirement headings, `### R1` through `### R10`.
  - R10 reproduces the source specification's 14-point Definition of Done verbatim.
  - Every enumerated list drawn from the source is verbatim and complete: 18 evidence sources, 9
    owner-only question examples, 24 baseline sections, 19 prompt capture areas, 5 question fields, 8
    priority axes, 6 resolution steps, 3 banned and 5 required phrasings.
  - The one addition to the source's baseline section list — `Documented intent vs implementation` —
    is present and disclosed as an addition, with its justification.
  - Additions to the source's label rules — the mandatory date on `CONFIRMED_BY_OWNER`, and the
    one-label-per-claim rule — are disclosed as additions with reasons.
- **Verification:**
  ```bash
  grep -c "^### R" standards/44-existing-project-reconstruction.md   # → 10
  grep -n "Additions this standard makes beyond" standards/44-existing-project-reconstruction.md
  ```
  For the verbatim lists, diff each against the line ranges in
  `artifacts/prompts/original_prompt.md` given in section 02's guidance below.
- **Dependencies:** none.

### Build the `project-reconstruction` skill

- **Status:** done — not committed anywhere; the skill is global by the decision recorded in
  [`00-overview.md`](00-overview.md)
- **Purpose:** Provide the executable procedure the standard specifies, so a reconstruction can
  actually be run rather than merely required.
- **Deliverables:** `C:\Users\Mike\.claude\skills\project-reconstruction\SKILL.md` plus four
  templates in that skill's `references/` directory: `baseline-template.md`, `prompt-template.md`,
  `questions-template.md`, `plan-item-template.md`.
- **Acceptance Criteria:**
  - Frontmatter `name:` is `project-reconstruction`, matching the directory name — a mismatch makes
    the skill undiscoverable.
  - The frontmatter `description` is at most 1024 characters and names the skills it must not
    displace: `codebase-docs`, `plan-structure`, `backlog`, `backlog-reconcile`.
  - The body covers Phase 0 through Phase 7 plus an Update mode for folding in owner answers.
  - The Definition of Done in the skill is byte-identical to R10 in the standard.
  - No `.skill` archive is created. Three stale ones (`plan-handoff.skill`, `plan-structure.skill`,
    `pre-push.skill`) already sit in the skills root from an old packaging step and are a known
    source of drift; do not add a fourth.
- **Verification:**
  ```bash
  diff <(sed -n '/^1\. The repository has been inspected/,/^14\./p' standards/44-existing-project-reconstruction.md | sed 's/^ *//') \
       <(sed -n '/^1\. The repository has been inspected/,/^14\./p' ~/.claude/skills/project-reconstruction/SKILL.md | sed 's/^ *//')
  ```
  Exit 0 with no output means the Definitions of Done match.
- **Dependencies:** the standard document above, which it implements.

### Integrate with the existing skills

- **Status:** done — global skill edits, uncommitted by the same decision
- **Purpose:** Make the new skill compose with the ones already in use, rather than competing with
  them for the same territory.
- **Deliverables:** three edited skills:
  - `plan-handoff/SKILL.md` — Step 1 now recognizes an `artifacts/project-plan-breakdown/` directory
    as a locatable plan, since Standard 44 routes reconstructed plans through it. Two rules that
    appeared twice verbatim in Step 3 were also de-duplicated; that defect predated this work.
  - `backlog/SKILL.md` — a "Seeding from a reconstruction" paragraph in *Working with it*.
  - `backlog-reconcile/SKILL.md` — a note that on a newly-seeded backlog the *merged work no item
    claims* section will contain the entire project history, which is expected rather than drift.
- **Acceptance Criteria:** each of the three duplicated rules in `plan-handoff/SKILL.md` appears
  exactly once; the two cross-references resolve to skills that exist; no other skill file and no
  `settings.json` is modified.
- **Verification:**
  ```bash
  grep -c "Transfer the reasoning, not just the instructions" ~/.claude/skills/plan-handoff/SKILL.md   # → 1
  grep -c "Surface the gotchas and conventions you learned" ~/.claude/skills/plan-handoff/SKILL.md     # → 1
  ```
- **Dependencies:** the skill above.

### Design the audit CLI without building it

- **Status:** done — commit `14177fa`
- **Purpose:** The source specification asks that a future `standards audit .` be designed but not
  implemented in v1. Designing it now is what lets the artifacts be shaped for machine reading before
  any tool exists; retrofitting a format is far more expensive than choosing one.
- **Deliverables:** [`design/standards-audit-cli.md`](../../design/standards-audit-cli.md).
- **Acceptance Criteria:** all 16 finding categories from the source specification, each with a
  kebab-case id and severity; a draft JSON schema whose findings carry a `standardRef` pointing at a
  specific requirement; detection sources for the mappings the skill must stay consistent with; and
  no implementation code in any language.
- **Verification:** `grep -c "standardRef" design/standards-audit-cli.md` returns at least 2 (schema
  field plus prose). Confirm by reading that the document contains no `.mjs`, `.py`, or `.ts` code
  block.
- **Dependencies:** none, though it references the standard's requirement anchors.

---

## Gotchas this section discovered

Recorded because they cost real time to find and are invisible from the files alone.

**The source specification's lists do not have the counts you would assume.** There are **18**
evidence sources (source lines 46–63) and **19** prompt capture areas (lines 185–203), not 17 and 18.
An initial plan for this work asserted the lower numbers and was wrong; the documents were right. If
you are checking a list, count it in the source rather than trusting any prose that summarizes it.

**The source gives two independent lists of phrasings, not a substitution table.** Three banned
phrasings and five required alternatives, with no mapping between them. An early draft rendered them
as a two-column table, which invented a one-to-one correspondence the source never states. Keep them
as two lists.

**Labeling cannot be uniform across all artifacts.** An early version of the standard required every
claim in every artifact to carry exactly one evidence label, which the reconstructed prompt and the
executable plan items cannot satisfy — they are specifications, stating what should be true rather
than what was observed. The resolution: the baseline, the open-questions list, and the descriptive
prose of the plan breakdown are labeled claim-by-claim; the prompt and plan items instead mark
`INFERRED` inline wherever a statement rests on inference. If you change this rule, change it in the
standard, the skill, and both affected templates together — they disagreed once already.

**The backlog PostToolUse hook does not fire on these paths, and does not need changing.**
`~/.claude/skills/backlog-validate/scripts/backlog-hook.mjs` filters on the path pattern
`artifacts/backlog/items/*.md` *before* it checks for a `status:` line. Plan items carry a `Status`
field and live under `artifacts/project-plan-breakdown/`, so they can never trigger it. This was
verified by reading the script and then confirmed empirically. Do not "fix" the hook for these paths.

**Adversarial review found defects that self-review did not.** Two independent audits of this
section's output found 13 accuracy defects and, after those were fixed, 4 regressions the fixes
introduced. Among them: the standard contradicted itself on whether the open-questions file was
mandatory, and the skill wrote questions to a file while forbidding raising them in conversation —
so it could never obtain the owner answers its own Definition of Done requires. None of these were
visible without a reader specifically trying to break the documents. Budget for that review when
editing this material.

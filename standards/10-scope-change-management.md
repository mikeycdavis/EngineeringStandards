# Standard 10 — Scope Change Management

Scope changes during implementation. That is normal. What is not acceptable is scope changing
silently, so that the plan and the product diverge with no record of when or why.

Source: item 10 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies whenever implementation reveals that the plan was incomplete or wrong — which is to say,
routinely.

## Requirements

### R1 — Do not silently change scope

**Do not silently change project scope.**

Silence is the violation, not the change. Discovering that a plan was wrong is expected; the
requirement is that the discovery reaches the plan.

### R2 — The triggers

When implementation reveals any of the following, reproduced verbatim from the source, the project's
durable planning artifacts MUST be updated:

- new requirements
- unexpected dependencies
- missing tasks
- architecture changes
- additional release blockers

### R3 — Record why

**Record why the scope changed.**

The reason is the part that decays fastest and matters longest. A future reader can see *what* the
plan says; only the record tells them *why* it says something different from what was originally
agreed — and without that, the change looks like drift rather than a decision, and gets undone by
someone assuming it was a mistake.

### R4 — A conversation must not be the only record

**A conversation should not become the only record of scope expansion.**

This is [Standard 4](04-planning-standards.md)'s durability rule applied to changes rather than to
plans: an artifact that was durable when written stops being durable the moment its amendments live
only in chat.

### R5 — Update at the point of discovery

Planning artifacts SHOULD be updated when the scope change is discovered, not when the work is
finished.

Deferring the update to a tidy-up pass is how scope changes get lost: by then the discovery has been
absorbed, the reason has been forgotten, and what gets written down is the new plan without the
explanation. It also means that anyone reading the plan in the interim reads something known to be
false.

## Additions this standard makes beyond the source

- R5 in full — the timing requirement. The source says to update the artifacts and record why, but not
  when.
- R3's reasoning about a change looking like drift, and R1's framing that silence rather than change
  is the violation, are explanations rather than source rules.

## Relationship to other standards

[Standard 4](04-planning-standards.md) requires plans to be durable repository artifacts; this
standard keeps them true afterwards. [Standard 11](11-architecture-decision-records.md) covers the
subset of scope changes that are consequential architectural decisions — those warrant an ADR as well
as a plan update. [Standard 44](44-existing-project-reconstruction.md) requires material scope changes
to be recorded when owner answers arrive during a reconstruction, which is this standard applied to
recovered plans.

## Implementation

**No skill implements this standard.** It is a discipline about when to write, not a procedure to run.

`standards audit` cannot detect it. A plan that was quietly allowed to go stale looks exactly like a
plan that is current — the tool can report a completed item whose deliverable is missing, but it has
no way to know that a requirement was added in conversation and never written down. This standard is
enforced by the people and agents doing the work, or not at all.

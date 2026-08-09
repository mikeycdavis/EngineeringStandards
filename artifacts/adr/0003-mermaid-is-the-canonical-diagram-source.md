# 0003 — Mermaid is the canonical diagram source; SVG is a generated artifact

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Project owner

## Context

[Standard 39](../../standards/39-codebase-documentation.md) R4 requires Mermaid as the canonical
source format for architecture diagrams, requires the `.mmd` to be retained in source control,
requires the SVG to be generated from it, and explicitly prohibits maintaining a hand-edited SVG
where the SVG represents a diagram.

This repository violates all four. `docs/architecture.svg` is a hand-authored SVG with computed
coordinates, produced by the global `codebase-docs` skill, whose `references/svg-guide.md` specifies
exactly that: a fixed 1100px canvas, a per-role colour table, and a formula for canvas height from
layer count. No `.mmd` source exists.

The violation is not local. **The generating mechanism is wrong**, so patching the artifact would be
undone by the next `/codebase-docs` run — the repository would look compliant until someone
regenerated the documentation, which is the worst of both states.

It also blocks a second requirement. `docs/architecture.md` is materially stale under
[Standard 42](../../standards/42-documentation-freshness.md) — it predates `scripts/inventory.mjs`,
`scripts/fidelity.mjs`, the policy tooling, and thirty-odd standards — and the remedy for staleness
is regeneration, which currently reproduces the diagram violation.

The trade is real and worth stating plainly: the hand-authored SVG is better looking. It is tuned to
this repository, its bands are placed deliberately, and Mermaid will not reproduce it. What it cannot
do is survive contact with change, because there is no source it derives from — every update is a
manual edit to coordinates, and a diagram that is cheaper to leave stale than to update will be left
stale.

## Decision

**Mermaid `.mmd` files are the canonical diagram source. SVG files are generated render artifacts.
Layout differences introduced by Mermaid are acceptable unless they materially reduce readability or
omit required information.**

Six consequences, which become the rules the `codebase-docs` skill is rewritten to follow:

1. **Preserve semantic content, not pixel placement.** Nodes, relationships, boundaries, labels, and
   flows must survive regeneration. Coordinates need not.
2. **`.mmd` and `.svg` live together, and regeneration is one command.**
3. **The generated `.svg` is never hand-edited.** Every change goes into the Mermaid source.
4. **If Mermaid cannot express a diagram adequately, that is recorded as an ADR or exception** — not
   a silent fallback to hand-authored SVG.
5. **CI detects when `.mmd` changed and `.svg` was not regenerated.**
6. **Diagram type is chosen deliberately**: `flowchart` for architecture, `sequenceDiagram` for
   interactions, `stateDiagram-v2` for lifecycle and state, rather than forcing everything into one
   layout.

**A visual regression counts as a real issue only when readability or meaning degrades**, not merely
because the output differs from the previous handcrafted diagram.

`references/svg-guide.md` is deleted rather than kept alongside a Mermaid guide. It is preserved in
git history, which is the appropriate home for a superseded strategy; retaining both files would
leave the skill with two diagram strategies and no statement of which is canonical — the same defect
[ADR 0002](0002-canonical-rule-identity.md) resolved for rule identity.

### The rendering constraint, and how it is resolved here

Rendering Mermaid to SVG requires `@mermaid-js/mermaid-cli`, which pulls a headless browser. This
repository has **zero dependencies** and its CI has no install step, by a decision recorded in
`design/standards-audit-cli.md` and enforced structurally — adding one would require editing CI.
Installing a browser toolchain to render one diagram is the *unnecessary frameworks* that
[Standard 37](../../standards/37-quality-bar.md) R2 prohibits.

Resolution, applying consequence 4 rather than quietly skipping the step:

- **The `.mmd` is committed and is canonical.** It is also embedded directly in
  `docs/architecture.md` as a fenced ` ```mermaid ` block, which GitHub and most Markdown viewers
  render natively. The readable diagram therefore comes from the canonical source with no
  intermediate artifact — which satisfies the *purpose* of R4's SVG clause (a diagram a reader can
  see) without the toolchain.
- **Rendering to `.svg` is on demand, not installed**: `npx -y @mermaid-js/mermaid-cli -i x.mmd -o
  x.svg`. Where a project needs a standalone SVG, that is the command.
- **`.svg` generation is declared not-applicable for this repository**, with the reason recorded in
  [Standard 39](../../standards/39-codebase-documentation.md)'s implementation section per
  [Standard 34](../../standards/34-dogfooding.md) R3. Not-applicable, not silently absent.
- **The freshness check does not require Mermaid.** `scripts/diagrams.mjs` compares each `.mmd`
  against the copy embedded in Markdown, and — where an `.svg` exists — against a source hash the
  renderer records inside it. CI can therefore enforce consequence 5 with no dependency at all.

## Alternatives considered

**Keep hand-authored SVG and amend Standard 39.** Rejected. The standard's reasoning is sound and
independent of this repository: a hand-edited render artifact is a second definition of the
architecture, it is the one that drifts, and regenerating destroys the edits — so regeneration stops.
Amending a correct standard to match a convenient implementation is the inversion
[Standard 34](../../standards/34-dogfooding.md) R5 exists to prevent.

**Maintain both strategies — Mermaid where it fits, hand-authored SVG where it does not.** Rejected.
Two strategies with no canonical one is precisely the dual-definition problem, and "where it does not
fit" is a judgement made per diagram by whoever is writing it, which means the fallback becomes the
default whenever Mermaid is inconvenient.

**Add `@mermaid-js/mermaid-cli` as a devDependency.** Rejected for this repository. It would end the
zero-dependency property, require an install step in CI, and add a browser download to a repository
whose entire toolchain is four small scripts. Consuming projects that already have a build pipeline
should absolutely do this; the standard permits it and this ADR recommends it.

**Commit the `.svg` unrendered or stale.** Rejected — a stale render artifact is worse than none,
because it is read as current.

## Consequences

**Makes easier.** Diagrams become reviewable in ordinary diffs
([Standard 40](../../standards/40-diffable-ai-changes.md)): a Mermaid source diff shows which node or
edge changed, where an SVG diff shows a wall of coordinates. Regeneration becomes safe, so
documentation staleness becomes fixable rather than expensive.

**Makes harder.** The diagram will look worse, and layout is no longer controllable. Complex diagrams
may need splitting into several simpler ones — which is usually an improvement, but it is work that
the hand-authored approach did not require.

**Commits the project to.** Never hand-editing a generated artifact. Any future case where Mermaid
cannot express a needed diagram must be recorded as a decision, not resolved by reaching for the old
approach.

**Known cost accepted.** This repository will carry `.mmd` without `.svg` until either a rendering
step is available or a consuming context needs the standalone file. That is a declared
not-applicable, re-examined when the condition changes — not a gap.

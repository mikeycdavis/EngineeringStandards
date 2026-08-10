# 0007 — The CLI scripts are single-run programs, and their module scope is their run scope

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

[Standard 51](../../standards/51-architecture-integrity.md) R1 prohibits *hidden* global state and
says what discharges the prohibition: a decision record naming **what the state is**, **who owns
it**, and **how it is reset**. Global is not the violation; unnamed and unownable is.

Four scripts hold module-level bindings that carry state through a run.

**What this decision governs — the rule, not the list.** It covers every module-level *mutable
accumulator, cache, counter, and derived run-state binding* in `scripts/standards.mjs`,
`scripts/inventory.mjs`, `scripts/fidelity.mjs`, and `scripts/attestations.mjs` whose value is
established or changed during execution.

The governed set is defined by behaviour rather than by having been listed here: **a script that
holds run state is governed by this decision the moment it exists**, whether or not this document
has been updated to name it. `scripts/attestations.mjs` was added and was governed from its first
line, and this record was stale until it said so. `scripts/repository.mjs` and `scripts/reviews.mjs`
were added in the same cycle and are *not* in the set, not by omission but because they hold no
module-level bindings at all beyond exported frozen identifiers — every function takes its inputs
and returns its answer. That was a deliberate design constraint when repository provenance was
introduced, precisely so that opening the Git seam did not enlarge the state this decision governs.

Frozen lookup tables and immutable configuration are excluded. **A derived binding assigned once from
already-governed mutable state is still governed**, because it remains module-scoped for the lifetime
of the process.

The rule is what applies to a binding added tomorrow. **The table below is an audit aid and a current
inventory — it is not the source of applicability**, and a binding missing from it is governed
anyway. That distinction is the whole design: a record that depended on having remembered every name
would be wrong the first time someone added one.

| Script | Binding | Kind | What it holds |
| --- | --- | --- | --- |
| `standards.mjs` | `findings` (`:580`) | accumulator | Every finding produced by the run, appended by `addFinding` |
| | `sources` (`:376`) | accumulator | Per-file `{ code, structure, comments }` views, written once in the read loop |
| | `contents` (`:1695`) | accumulator | Per-file raw text, written in the same loop and read by the document detectors |
| | `surfaceLoss` (`:1693`) | accumulator | Directories the walk could not list, and whether the file cap was reached |
| | `unreadableFiles` (`:1696`), `truncatedFiles` (`:1697`) | accumulators | Files the read loop could not read, and those it read only in part |
| | `evidenceSurface` (`:1761`) | derived run state | The summary of the four above, carried into the report |
| | `report` (`:1896`) | derived run state | The verdict envelope, built once from `findings`, the catalog, and the policy |
| | `FRAMEWORK_VERSION` (`:1950`), `declaredVersion` (`:1953`) | derived run state | The framework version read from `VERSION` and the version the policy declares, compared once by the version-identity guard |
| | `freshness`, `repo` (`:2008`) | derived run state | Per-attestation freshness states and repository availability, destructured from one call and read by `evaluate()` and the report |
| `inventory.mjs` | `missing`, `unknown`, `duplicates`, `titleMismatches`, `brokenSections`, `duplicateSections` | accumulators | Per-source disagreement lists |
| | `detectedCount` (`:89`), `countMismatch` (`:90`) | counters | Running totals across sources |
| | `out` (`:201`) | accumulator | The output lines, appended through the reporting section and flushed at exit |
| `attestations.mjs` | `document` (`:45`) | run state, and the only `let` in the governed set | The parsed policy. Declared uninitialised and assigned inside a `try`, because a read failure must exit 2 rather than proceed against a half-read document |
| | `args`, `JSON_OUT`, `MIGRATE`, `dirArg`, `root` (`:39`–`:43`) | derived run state | Invocation shape, derived once from `process.argv` |
| | `repo` (`:141`), `entries` (`:142`) | derived run state | Repository availability and the attestation map, read once |
| | `rows` (`:148`) | derived run state | One row per review event, the report's subject |
| | `violations` (`:190`) | accumulator | Post-migration invariant breaches, appended by two loops |
| | `counts` (`:204`), `legacy` (`:205`) | derived run state | Summaries over `rows` |
| `fidelity.mjs` | `failures` | accumulator | Unverified verbatim claims |
| | `claims` | counter | Running count of claims checked |
| | `wholeSource`, `sectionCache` | caches | So a source file is read and normalized once |
| | `extractionOf`, `entryFor` | derived run state | Inventory lookups, built once at start and never mutated after |
| | `out` (`:180`) | accumulator | The output lines, as in `inventory.mjs` |

Frozen lookup tables — `SKIP_DIRS`, `TEXT_EXT`, `CODE_EXT`, `COMMENT_SYNTAX`, `COMMANDS`,
`CONFIG_EXT`, `SUPPORTED`, `ANNOTATIONS` — are module-level constants never written after
initialization. They are configuration, not state, and this decision does not concern them.

**How the enumeration is checked, and what that is worth.** The current list was assembled with the
help of a declaration-pattern scan over the four files, re-run across the whole governed set on
2026-08-10 after `scripts/attestations.mjs` was added. **That scan is not authoritative**: a
binding mutated through an alias escapes it, as `surfaceLoss` does — it is written through the
`loss` parameter of `collectFiles`, so a scan for `surfaceLoss.push` finds nothing. Completeness
therefore remains a review obligation, not a mechanical guarantee, unless and until a sound detector
exists. Recording that is the point: replacing one false proof of completeness with another would be
no improvement.

**This record was incomplete again at the 2026-08-10 review, and was remediated before that review
rather than after it.** Four derived run-state bindings had been added to `standards.mjs` — the
version-guard pair and the provenance pair — and `attestations.mjs` had been added as a whole
governed script, including the only `let` in the set. None were recorded here. The rule text still
governed them, so this was a stale record rather than a live violation; but the record is what an
attestation approves, so `architecture.no-hidden-global-state` was deliberately **not** re-attested
in that cycle while the other seven were. Approving a knowingly incomplete record would have repeated
the exact failure below, immediately after mechanically demonstrating it.

**This record has been incomplete at every review until this one, which is why the rule is
categorical.** The first draft listed `findings` and `sources` and glossed the other two scripts as
holding "counters of the same kind" — an incomplete enumeration presented as a complete one, which is
worse than no list, because a reader takes the list for the whole set. That review added `contents`,
which sits in the same file, at the same level, written in the same loop as `sources`.

The list was then approved as *categorical and complete*, and it was neither: both `out`
accumulators were module-level the whole time and absent from it, and `report` was too. The scan
above found them; reading did not, twice. That is the same defect
`ai.no-fabricated-capabilities` was rejected for at 2.0.0 — a completeness claim asserted without
the check that would establish it — caught this time before the attestation rather than after. The
lesson taken is not "enumerate more carefully" but the structural one above: **the rule governs,
the table informs.**

This was raised as a finding during the attestation review of 2.0.0, when
`architecture.no-hidden-global-state` could not be attested clean: the rule has a real subject here,
and R1 asks for this record. Declaring the rule not-applicable because the process is short-lived
would have been the self-exemption [Standard 34](../../standards/34-dogfooding.md) R3 prohibits.

## Decision

**These scripts are single-run programs, and the module scope *is* the run scope. That is
deliberate, and it is the boundary.**

Each script does its work at module top level — `scripts/standards.mjs:1693` onward — so loading the
module *is* performing the run. There is no `main()` to call twice, and no second run can begin
inside a process that has already done one.

**What the state is.** Four kinds, and the governing rule names all four rather than the instances:

- **Accumulators** the run appends to — `findings`, `failures`, inventory's six disagreement lists,
  the evidence-surface lists, and both `out` output buffers.
- **Read caches** so a file is read and parsed once — `sources`, `contents`, `wholeSource`,
  `sectionCache`.
- **Counters** — `claims`, `detectedCount`, `countMismatch`.
- **Derived run state**, assigned once from the above and then read — `evidenceSurface`, `report`,
  `extractionOf`, `entryFor`, the version-guard pair `FRAMEWORK_VERSION` and `declaredVersion`, the
  provenance pair `freshness` and `repo`, and `attestations.mjs`'s `repo`, `entries`, `rows`,
  `counts`, and `legacy`. These are listed rather than excused. A binding that is written once
  instead of repeatedly is still module-scoped for the process lifetime, and carving it out would
  create precisely the fuzzy exception a later omission could hide behind.

`sources` earns its place specifically: it is what enforces the use/mention split, since every
content scan goes through `sourceOf`, `structureOf`, or `commentsOf` and those read from it.
Threading these through fifteen detectors as parameters would add a parameter to every signature and
change nothing about the lifetime.

**One binding is a `let`, and it is the exception that states its own reason.** `attestations.mjs`
declares `document` uninitialised and assigns it inside a `try`, because a policy that cannot be read
must exit 2 rather than let the run proceed against a half-read document. Every other governed
binding is a `const` assigned at its declaration. That asymmetry is deliberate and is recorded here
so a later reader does not "tidy" it into a `const` that cannot express the failure path.

**Who owns them.** The top-level run block at the bottom of each script — one owner per script, and
no binding above is written from more than one place:

- `findings` — `addFinding` (`:588`) is the **only** writer. Detectors call it; they never touch the
  array.
- `sources` and `contents` — the read loop (`:1698-1706`), which is their only writer.
- `surfaceLoss` — written only by `collectFiles`, through its `loss` parameter. This is the one
  binding whose writer is reached under a different name, which is why it is called out here and in
  the scan limitation above.
- `unreadableFiles` and `truncatedFiles` — the read loop, in the same pass.
- `evidenceSurface` and `report` — assigned once each, at their declarations, and never written
  again.
- `out` in both `inventory.mjs` and `fidelity.mjs` — the reporting section at the foot of each
  script, which builds the lines and flushes them immediately before exit.

That single-writer rule is what keeps each binding auditable, and it is the property to preserve if
any of these files is ever refactored.

**How it is reset.** By process exit, and only by process exit. This is the part that must be stated
rather than assumed:

- The scripts are **never imported**. Nothing in `scripts/` or `test/` imports
  `scripts/standards.mjs`; the tests spawn it (`spawnSync(process.execPath, [CLI, …])` in
  `test/audit.test.mjs`), which is why each test gets a clean accumulator without any reset code.
- Because the work happens at module load, importing the module would run an audit as a side effect
  and a second import would be a no-op against a populated `findings` — the module cache makes it
  *look* idempotent while returning the first run's results. **This is the failure mode the decision
  accepts,** and the reason the boundary must stay where it is.

**What is deliberately not done.** No reset function, no run context object, no dependency injection.
A reset that exists but is never called is a claim of reusability the code does not honour, and it
would invite exactly the second in-process run this design does not support.

## Consequences

**The constraint is real and must be honoured.** `scripts/standards.mjs` must remain a command, not
a library. If any of the following becomes true, this decision no longer holds and must be replaced
rather than stretched:

- A consumer wants to run the audit twice in one process — a watch mode, a server, a batch runner
  over several repositories.
- A test needs to call a detector directly rather than through the CLI.
- Anything imports `scripts/standards.mjs` for a helper. Exporting one function from a module whose
  top level performs an audit would run the audit to obtain the helper.

The refactor at that point is known: move the run block into an exported `run(root, options)` that
constructs every binding in the table per call and passes them through. It is mechanical and it is
not worth doing before a second caller exists.

**One coupling this makes visible.** `detectUnverifiedFunctionality` (`:1044`) reads `findings`
directly, to build on the capability findings the descriptive detectors produced earlier in the same
run. The detector pipeline is therefore **order-dependent**, and that ordering is expressed only by
the sequence of calls in the run block plus the comment above it (`:1769`). Any refactor to
per-call state must preserve both the order and that comment — a shared accumulator read mid-pipeline
is the part that would break silently.

**`architecture.no-hidden-global-state` becomes attestable.** The state is named, its owner is named,
its reset boundary is named, and the conditions that would invalidate the decision are named. It
remains a `manual-review` rule — this record is the evidence a reviewer reads, not a substitute for
reading it.

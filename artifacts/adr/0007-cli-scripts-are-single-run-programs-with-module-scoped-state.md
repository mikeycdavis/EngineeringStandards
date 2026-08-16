# 0007 — The CLI scripts are single-run programs, and their module scope is their run scope

- **Status:** Superseded as a control by
  [ADR 0014](0014-run-state-is-owned-by-an-invocation-not-recognised-by-a-table.md) (2026-08-13).
  Retained in full as historical evidence.
- **Date:** 2026-08-09
- **Deciders:** Project owner

## This record is evidence now, not a control

**Nothing below has been corrected, and the binding table has deliberately not been repaired.** Eight
written bindings absent from it and one stale row were known at the time this status changed. They
were left exactly as they were, because they are the evidence that justified retiring enumeration:
repairing them first would have destroyed the finding and produced a table that looked authoritative
for exactly as long as it took someone to add another binding.

Three lessons are the reason this document is kept rather than deleted.

1. **The categorical rule was stronger than its table, and the rule was right.** "A script that holds
   run state is governed the moment it exists" never failed. What failed was every attempt to write
   down which bindings that was.
2. **The table lagged on ordinary bindings, not exotic ones.** The misses were plain accumulators and
   derived run state declared at module level in the usual way — not clever constructs. A control that
   cannot see the ordinary case is not a control.
3. **Mechanical analysis did not rescue it.** This record already said the declaration scan could not
   see the alias-mediated write to `surfaceLoss`. A later, genuinely capable AST analysis went further
   and was worse: it produced confident, plausible, materially wrong measurements — twice — because its
   semantic model was incomplete, and it never failed while doing so.

ADR 0014 removes the need to solve that recognition problem, by constraining lifetime instead of
attempting to enumerate representations. The governing invariant is now **execution-specific mutable
state is owned by an invocation**, established behaviourally against fresh-process oracles, with one
retained static invariant — **only the CLI boundary may terminate the process** — kept precisely
because it is closed and checkable in a way that "find every shape of mutable state" is not.

Read the rest of this document as the record of what was tried, what it cost, and why it changed.

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

**Module-level configuration may describe matching behaviour, but mutable matcher state is local to
an invocation.** A `RegExp` carrying `g` is not configuration: `lastIndex` is state, and whether it
escapes a call depends on the calling idiom — `matchAll` clones, `exec` in a loop does not. A
module-level global regex therefore sits exactly on this record's boundary, and answering "is it
governed?" would require an interpretive exception about `lastIndex` that a later reader would have
to re-derive. The ambiguity is removed rather than adjudicated: the pattern lives at module level as
a `String.raw` source, the matcher is constructed inside the function that uses it, and no judgement
about `lastIndex` is required at all. `CATCH_OPEN_SOURCE` and `EXCEPT_PASS_SOURCE` in
`standards.mjs` are the worked example.

One instance predates this rule and does not yet follow it: `ITEM_RE` in `scripts/inventory.mjs` is a
module-level `/gm` regex, consumed through `matchAll` and therefore safe under the same reasoning
that made the two above safe — which is precisely why it is recorded here rather than left to be
noticed. It is not fixed in this cycle because doing so would touch a reviewed path of an attestation
approved minutes earlier, and provenance churn is not a reason to widen a change; it is named so the
next reader inherits the finding rather than the silence.

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

## Postscript — the invalidating condition was met

The section above named the conditions under which this decision would no longer hold, and said the
refactor at that point was known: *move the run block into an exported entry point that constructs
every binding per call and passes them through.* That is what
[ADR 0014](0014-run-state-is-owned-by-an-invocation-not-recognised-by-a-table.md) does.

The trigger was not a second caller. It was the control itself: the enumeration this record depended
on could not be made reliable, and two attempts to mechanise it — a declaration scan and a full AST
analysis — each reported clean on state they could not see. This decision anticipated its own
replacement and named the refactor correctly. It did not anticipate that the reason would be the
table rather than a new consumer.

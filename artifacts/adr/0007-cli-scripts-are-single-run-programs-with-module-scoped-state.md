# 0007 — The CLI scripts are single-run programs, and their module scope is their run scope

- **Status:** Accepted
- **Date:** 2026-08-09
- **Deciders:** Project owner

## Context

[Standard 51](../../standards/51-architecture-integrity.md) R1 prohibits *hidden* global state and
says what discharges the prohibition: a decision record naming **what the state is**, **who owns
it**, and **how it is reset**. Global is not the violation; unnamed and unownable is.

`scripts/standards.mjs` holds two module-level bindings that are mutated during a run:

| Binding | Line | What it holds |
| --- | --- | --- |
| `findings` | `scripts/standards.mjs:550` | Every finding produced by the run, appended by `addFinding` |
| `sources` | `scripts/standards.mjs:373` | Per-file `{ code, structure, comments }` views, written once during the read loop |

`scripts/inventory.mjs` and `scripts/fidelity.mjs` hold module-level counters of the same kind
(`detectedCount`, `countMismatch`, `claims`).

This was raised as a finding during the attestation review of 2.0.0, when
`architecture.no-hidden-global-state` could not be attested clean: the rule has a real subject here,
and R1 asks for this record. Declaring the rule not-applicable because the process is short-lived
would have been the self-exemption [Standard 34](../../standards/34-dogfooding.md) R3 prohibits.

## Decision

**These scripts are single-run programs, and the module scope *is* the run scope. That is
deliberate, and it is the boundary.**

Each script does its work at module top level — `scripts/standards.mjs:1692` onward — so loading the
module *is* performing the run. There is no `main()` to call twice, and no second run can begin
inside a process that has already done one.

**What the state is.** `findings` is the run's output accumulator. `sources` is the run's parsed-file
cache, and it exists to enforce the use/mention split: every content scan goes through `sourceOf`,
`structureOf`, or `commentsOf`, and those read from `sources`. Threading both through fifteen
detectors as parameters would add a parameter to every signature and change nothing about the
lifetime.

**Who owns them.** The top-level run block at the bottom of each script. Within
`scripts/standards.mjs`, `addFinding` (`:558`) is the **only** writer to `findings`, and the read
loop (`:1692-1700`) is the only writer to `sources`. Detectors call `addFinding`; they never touch
the array. That single-writer rule is what keeps the accumulator auditable, and it is the property to
preserve if this file is ever refactored.

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
constructs `findings` and `sources` per call and passes them through. It is mechanical and it is not
worth doing before a second caller exists.

**One coupling this makes visible.** `detectUnverifiedFunctionality` (`:1026`) reads `findings`
directly, to build on the capability findings the descriptive detectors produced earlier in the same
run. The detector pipeline is therefore **order-dependent**, and that ordering is expressed only by
the sequence of calls in the run block plus the comment above it (`:1702`). Any refactor to
per-call state must preserve both the order and that comment — a shared accumulator read mid-pipeline
is the part that would break silently.

**`architecture.no-hidden-global-state` becomes attestable.** The state is named, its owner is named,
its reset boundary is named, and the conditions that would invalidate the decision are named. It
remains a `manual-review` rule — this record is the evidence a reviewer reads, not a substitute for
reading it.

# ADR 0018 — Architectural boundaries are declared, and checked only within stated observation limits

- **Status:** Proposed
- **Date:** 2026-10-12
- **Supersedes:** nothing. Gives [Standard 51](../../standards/51-architecture-integrity.md) R2 the
  definition it lacked.
- **Related:** [ADR 0005](0005-attestations-are-recorded-human-evidence.md),
  [ADR 0008](0008-detectors-do-not-assert-repository-state-they-have-not-measured.md),
  [ADR 0011](0011-attestation-freshness-is-repository-content-not-checkout-bytes.md),
  [ADR 0014](0014-run-state-is-owned-by-an-invocation-not-recognised-by-a-table.md)
- **Issue:** #112 (ST-23)
- **Number:** 0018 is the next free number. 0016 is claimed twice among open pull requests (#105 and
  #111) and 0017 by #108; whichever of those lands second will need renumbering, which is not decided
  here.

## Context

`architecture.no-boundary-bypass` is `forbidden`, `manual-review`, with assurance `none`. Its
standard said "established boundaries" without saying where a boundary is established, and said of its
own Implementation that the rule "requires knowing where the boundaries are". Six review events
approved the rule for this repository on structural-separation evidence. None stated an observation
scope, and none could, because there was no declaration to be the scope's subject. The owner has
declined to accept that wording, and has declined to accept `PROJECT.md` prose and ADR narrative alone
as the declaration: prose cannot be validated, cannot be compared with a tree, and cannot fail.

## Decision

### 1. Definitions (the owner's wording, verbatim, as in Standard 51 R2)

> “Architectural boundary” means a boundary explicitly declared by the repository’s architecture manifest or standards configuration between named packages, layers, plugins, processes or trust domains.
>
> “Boundary bypass” means a dependency, execution path or data-access path that crosses a declared boundary without using an interface or mechanism explicitly permitted by that declaration.

A boundary that is believed, drawn, or described in prose but not declared is not an architectural
boundary in this sense.

### 2. Declaration source and schema

The declaration is the optional top-level `boundaries` key of `project-policy.yml`, the repository's
standards configuration, validated by `schemas/project-policy.schema.json`. A separate manifest file
was rejected: the policy is already the one place a project configures the standards, already schema
validated by `standards policy` and `standards validate`, and a second file would be a second thing to
keep in agreement.

| Key | Meaning |
| --- | --- |
| `observation.method` | How edges are observed. One value is defined: `static-import-graph` |
| `observation.roots`, `extensions` | The only files the check examines |
| `observation.cannotObserve[]` | Mechanisms the method cannot see, each with a reason; `subprocess` may carry `knownSites` |
| `members[]` | `id`, `kind` (`package`, `layer`, `plugin`, `process`, `trust-domain`), `paths` (the path ownership; a file, or a directory ending in `/`), `evidence` (`path:line`), optional `processExit: permitted` |
| `edges[]` | `from`, `to`, `via` (the permitted interface: export names, or `*` stated explicitly), `evidence` |
| `external.allowPrefixes` | Import specifiers that leave the repository and are allowed (this repository: `node:` only) |

Imports within one member are always permitted. A cross-member import is a bypass unless an edge for
that direction exists and `via` names what is imported.

### 3. What is an error

Decided, not left to the checker's discretion:

| Condition | Result |
| --- | --- |
| Two members own overlapping paths | Error. A file with two owners has no direction to check |
| A file under the observed roots with a declared extension is owned by no member | Error (`unowned-file`). Adding a script therefore requires declaring its member, deliberately |
| Duplicate member id or duplicate edge; an edge naming an unknown member; a self edge | Error |
| Declared edges form a cycle | Error. A declared circular dependency is the other failure R2 names |
| A cross-member import with no declared edge | Violation (`undeclared-edge`) |
| A cross-member import of a name the edge's `via` does not list, or a namespace import where `via` is not `*` | Violation (`undeclared-interface`) |
| An import whose specifier leaves the repository and is not under `external.allowPrefixes` | Violation (`undeclared-external`) |
| A member without `processExit: permitted` whose files terminate the process | Violation (`process-termination`) |
| A file importing the child-process module that is not in the declared `subprocess.knownSites`, or a declared site that does not | Violation |
| Evidence naming a missing file or a line past its end | Violation |

Structural errors make the policy invalid (`standards policy` exit 2; `standards validate` reports
the policy as unreadable, `NOT_EVALUATED`, as it does for any schema-invalid policy). Tree violations
are reported by `node scripts/boundaries-check.mjs` (exit 1) and by `test/boundaries.test.mjs`, and
do **not** change `validate`: see Compatibility.

### 4. Detector observation limits

The check reads string-literal static `import` / `export ... from` and `import("x")` in files under
the declared roots and extensions, plus a text scan for process termination and for importing the
child-process module. It cannot see, and the declaration must therefore list as excluded: computed
import specifiers, reflection, generated or evaluated code, what a subprocess executes, network
paths, data-access paths (which files, rules or keys a module reads or writes), shell and workflow
scripts, and every file outside the roots. For `subprocess` the check detects the import, never the
command. A passing check is a statement about edges between files, and nothing wider.

### 5. Attestation requirements

An attestation for `architecture.no-boundary-bypass` must:

- name the declaration it was reviewed against (`project-policy.yml`, `boundaries`) and cite the full
  40-character commit it covers;
- state its observation scope by reference to `observation`, and list the mechanisms in
  `cannotObserve` as excluded;
- include in `reviewedAgainst` the declaration's file, the amended standard
  (`standards/51-architecture-integrity.md`), and the sources of the checks it relies on, so that a
  change to any of them makes the attestation stale under
  [ADR 0011](0011-attestation-freshness-is-repository-content-not-checkout-bytes.md);
- not claim anything about unobserved dynamic behaviour. Static dependency evidence cannot support
  claims about unobserved runtime reflection, generated code, subprocesses or network paths.

No automated check constitutes the attestation. The rule stays `manual-review` with assurance `none`.
The check supplies evidence a reviewer can rely on within its limits; it does not convert the rule to
`full` or `partial`.

### 6. Compatibility and migration

- **Additive.** An absent `boundaries` key changes no verdict, score or exit code of `audit`,
  `validate` or `policy`, in either output mode. Present, the declaration is checked for consistency
  only; `validate` does not read the tree for it and gains no new rule result. Pinned by
  `test/boundaries.test.mjs` (identical bytes and exit, with and without).
- **No version bump here.** `validate` refuses any policy whose `standardVersion` differs from
  `VERSION` with `VERSION_MISMATCH` (exit 2). A MINOR bump therefore changes the exit code for every
  consumer pinned at `2.0.0` from 0 or 1 to 2 until that consumer edits its pin. That is not
  additive, so `VERSION` stays `2.0.0` and this ships under `Unreleased`. The level is for the
  owner to decide at release.
- **Consumers.** Nothing to do. A consumer that wants the check adds a `boundaries` block and runs
  `node scripts/boundaries-check.mjs`. A consumer without one gets `NOT_EVALUATED` (exit 2) from that
  command, never a pass.
- **Deliberately not bundled:** any behaviour that turns unestablished rules at all levels into
  `NOT_EVALUATED`, and any change to attestation freshness, review history (ST-17) or path
  justifications (#107).

## Consequences

- The rule's claim becomes falsifiable: an undeclared import fails a test, not a reviewer's patience.
- Adding a script means declaring its member. That is friction chosen on purpose: the alternative is
  a declaration that silently stops describing the tree.
- The declaration is only as good as its evidence. `evidence` is checked for existence and line
  range, not for truth; a reviewer still reads it.
- This repository's declaration describes `scripts/` only. `test/`, shell wrappers and workflows are
  outside it and listed as such.
- The PR that amends Standard 51 and this ADR makes the existing attestation stale by design.
  Renewal is the owner's act and is not performed here.

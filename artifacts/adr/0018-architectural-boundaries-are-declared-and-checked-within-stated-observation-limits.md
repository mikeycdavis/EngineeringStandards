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

### 2. Declaration source, schema and discovery

The declaration is its own file, `architecture-boundaries.yml`, at the repository root beside
`project-policy.yml`, validated by its own schema, `schemas/architecture-boundaries.schema.json`. It
is discovered by name, in the directory of the policy being validated. A consumer opts in by creating
the file (`templates/architecture-boundaries/architecture-boundaries.yml` is the starting point) and nothing else; there is no
key to add to the policy and no flag.

**Why not a key of `project-policy.yml`** (the first draft of this ADR did that). An attestation
cites the paths it reviewed, and ADR 0011 makes it stale the moment any of them changes. The
attestation events themselves live in `project-policy.yml`. A declaration kept there could never be a
reviewed path: recording the event changes the file, which stales the attestation in the act of
recording it. Excluding the policy from `reviewedAgainst` instead would let the declaration change
without staling anything, which is the failure the digest exists to prevent. Keeping the declaration
in its own file lets it be a reviewed path while the events stay in the policy and the policy stays
outside `reviewedAgainst`.

`standards policy` and `standards validate` validate the file when it is present: a schema-invalid
or structurally inconsistent declaration makes the policy invalid (exit 2 and `NOT_EVALUATED`
respectively). When it is absent they behave exactly as before.

The file's top-level keys:

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
| A path or evidence file containing a `.` or `..` segment, a leading `/`, a backslash or a drive letter | Error, in the schema and in the structural check; evidence is also never read from outside the repository |
| `cannotObserve` that omits, repeats or invents a mechanism of the closed vocabulary (section 4), or an entry without `knownSites` | Error |
| `external` absent (an empty `allowPrefixes` is allowed) | Error |
| Declared edges form a cycle | Error. A declared circular dependency is the other failure R2 names |
| A cross-member import with no declared edge | Violation (`undeclared-edge`) |
| A cross-member import of a name the edge's `via` does not list, or a namespace import where `via` is not `*` | Violation (`undeclared-interface`) |
| A side-effect import (`import "./x.mjs"`) across an edge whose `via` lists neither `side-effect` nor `*` | Violation (`undeclared-interface`) |
| An import whose specifier leaves the repository and is not under `external.allowPrefixes`; a built-in written without `node:` is one | Violation (`undeclared-external`) |
| A member without `processExit: permitted` whose files terminate the process | Violation (`process-termination`) |
| A construct the scanner cannot classify (section 4), in a file that is not a `knownSite` of that mechanism | Violation (`unobserved-mechanism`). **The result is never OK**: this is the fail-closed rule |
| A `knownSite` of a detected mechanism in which the mechanism is no longer observed | Violation (`known-site-missing`), so the acknowledgement list cannot rot |
| A member path that matches no file or directory | Violation (`dead-member-path`) |
| Evidence naming a missing file or a line past its end; an edge's evidence that is not an import, by that member, of a file of the target member | Violation (`evidence-missing`, `evidence-out-of-range`, `evidence-mismatch`) |

Structural errors make the policy invalid (`standards policy` exit 2; `standards validate` reports
the policy as unreadable, `NOT_EVALUATED`, as it does for any schema-invalid policy). The structural
check and the schema are the only things `policy` and `validate` do with the file. Tree violations
are reported by `node scripts/boundaries-check.mjs` (exit 1) and by `test/boundaries.test.mjs`, and
do **not** change `validate`: see Compatibility.

### 4. Detector observation limits

The scanner is a small tokenizer (zero dependencies), not a set of line patterns: comments, strings,
template literals and regex literals are recognised, so an apostrophe in a comment, an import
split over several lines or sharing a line with another, a string-named import, a re-export or a
side-effect import are read correctly, and a termination form inside a comment or string is not one.

It **reads**: string-literal static `import`, `export ... from`, side-effect imports and `import("x")`
(also across lines, with an attributes argument) in files under the declared roots and extensions;
and the termination forms `process.exit`, `process.exitCode`, `process.kill`, `process.abort`, the
same with `?.` or a bracketed string literal, `const { exit } = process`, and `exit` and friends
imported from `node:process` or `process`.

It **fails closed** on every other construct that can reach a module, end the process or leave the
repository. Each is recorded under a named mechanism and reported as `unobserved-mechanism` unless
the file is listed in that mechanism's `knownSites`. The closed vocabulary, which a declaration must
list in full under `cannotObserve`, each with `knownSites` (an empty list is allowed):

| Mechanism | Detected as | Still unseen |
| --- | --- | --- |
| `dynamic-import-computed` | `import()` whose argument is not one string literal | What the computed specifier evaluates to |
| `require-call` | `require(` and `createRequire` | The module reached |
| `import-meta-resolve` | `import.meta.resolve` | The module reached |
| `url-module-path` | `new URL(..., import.meta.url)` | Whether the path is a module, a file or data |
| `termination-indirect` | The process object used as a value or aliased, `process[<computed>]`, `globalThis[...]`, the `process` module bound under another name | What is ultimately called |
| `subprocess` | Importing `child_process`, `worker_threads` or `cluster`, with or without `node:` | What runs, what it reaches |
| `reflection` | `eval(`, `Function`, `Reflect`, `Proxy` | Their effect; other indirection (computed property lookup, prototype manipulation) is not examined |
| `network` | Importing `http`, `https`, `http2`, `net`, `tls`, `dgram`, `dns`; `fetch(`, `WebSocket`, `XMLHttpRequest` | Traffic that leaves through another program, such as `gh` |
| `generated-code` | Not detected | Code written to disk and run later; generated documentation |
| `data-access` | Not detected | Which files, rules or keys a module reads or writes |
| `shell-and-workflow-scripts` | Not detected | `*.ps1`, `*.sh`, workflows: outside the extensions |
| `outside-roots` | Not detected | Every file outside the roots |

Remaining blind spots, all inside the declared limits: a module path built elsewhere and handed to
something other than `import()`, `require` or `new URL`; aliasing of other built-in objects than the
process object; a source construct the tokenizer mis-tokenizes (a regex literal after `)` or `]` is
read as division, for example). A passing check is a statement about edges between files, and
nothing wider.

### 5. Attestation requirements

An attestation for `architecture.no-boundary-bypass` must:

- name the declaration it was reviewed against (`architecture-boundaries.yml`) and cite the full
  40-character commit it covers;
- state its observation scope by reference to `observation`, and list the mechanisms in
  `cannotObserve` as excluded;
- include in `reviewedAgainst` the declaration file, its schema, the amended standard
  (`standards/51-architecture-integrity.md`), and the sources of the checks it relies on, so that a
  change to any of them makes the attestation stale under
  [ADR 0011](0011-attestation-freshness-is-repository-content-not-checkout-bytes.md);
- not claim anything about unobserved dynamic behaviour. Static dependency evidence cannot support
  claims about unobserved runtime reflection, generated code, subprocesses or network paths.

No automated check constitutes the attestation. The rule stays `manual-review` with assurance `none`.
The check supplies evidence a reviewer can rely on within its limits; it does not convert the rule to
`full` or `partial`.

### 6. Compatibility and migration

- **Additive.** An absent `architecture-boundaries.yml` changes no verdict, score or exit code of
  `audit`, `validate` or `policy`, in either output mode, and `schemas/project-policy.schema.json`
  is unchanged. Present, the declaration is checked for consistency only; `validate` does not read the tree for it and gains no new rule result. Pinned by
  `test/boundaries.test.mjs` (identical bytes and exit, with and without).
- **No version bump here.** `validate` refuses any policy whose `standardVersion` differs from
  `VERSION` with `VERSION_MISMATCH` (exit 2). A MINOR bump therefore changes the exit code for every
  consumer pinned at `2.0.0` from 0 or 1 to 2 until that consumer edits its pin. That is not
  additive, so `VERSION` stays `2.0.0` and this ships under `Unreleased`. The level is for the
  owner to decide at release.
- **Name collision.** A pre-existing, unrelated root file called `architecture-boundaries.yml` is
  treated as a declaration: `standards policy` exits 2 and `validate` reports `NOT_EVALUATED` until
  it is renamed or made valid. That is the price of discovery by name.
- **What does change.** Status, score and exit code of `validate` are unchanged. Because
  `standards/51-architecture-integrity.md` is a reviewed path of the `architecture.no-boundary-bypass`
  attestation, that attestation becomes stale on this change, so the passed and skipped counts shift:
  that is the intended effect (section 5), and not an effect of the declaration file.
- **Consumers.** Nothing to do. A consumer that wants the check creates `architecture-boundaries.yml` (from
  `templates/architecture-boundaries/architecture-boundaries.yml`) and runs `node scripts/boundaries-check.mjs`. A consumer without one gets `NOT_EVALUATED` (exit 2) from that
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
- A second file to keep: the declaration lives apart from the policy, by design (section 2).
- This repository's declaration describes `scripts/` only. `test/`, shell wrappers and workflows are
  outside it and listed as such.
- The PR that amends Standard 51 and this ADR makes the existing attestation stale by design.
  Renewal is the owner's act and is not performed here.

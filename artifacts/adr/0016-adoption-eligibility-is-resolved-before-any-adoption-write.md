# 0016 — Adoption eligibility is resolved before any adoption write

- **Status:** Proposed
- **Date:** 2026-10-11
- **Deciders:** Project owner (decisions D1-D5 below, given 2026-10-11; this record is not yet
  accepted)
- **Tracks:** ST-06, [#16](https://github.com/mikeycdavis/EngineeringStandards/issues/16)
- **Related:** [ADR 0004](0004-audit-and-validate-are-separate-commands.md),
  [ADR 0008](0008-detectors-do-not-assert-repository-state-they-have-not-measured.md),
  [ADR 0005](0005-attestations-are-recorded-human-evidence.md),
  [Standard 22](../../standards/22-adoption-and-migration.md),
  [Standard 23](../../standards/23-standards-validator-cli.md),
  [Standard 33](../../standards/33-bootstrap-experience.md),
  [Standard 44](../../standards/44-existing-project-reconstruction.md) R12

This record is written **before implementation** (D4). Nothing it describes exists in code yet; every
statement in "Decision" is a commitment for the implementation pull requests that follow its review,
not a description of current behaviour.

## Context

The adoption path has no notion of whether a repository may be adopted at all. Every step assumes
the answer is yes and asks only how.

The failure was observed, not hypothesised. `StandardsOrchestrator`'s `README.md` opens with
`⛔ FROZEN`, and its `FROZEN.md` states "Do not adopt this repository into a governed project. Do
not extend it." The documented adoption sequence ran and wrote five files into it before anything
consulted that status ([#16](https://github.com/mikeycdavis/EngineeringStandards/issues/16);
[plan item](../project-plan-breakdown/07-distributed-validation-and-ci.md)). The mutation happened
at `/codebase-docs`, which [`INSTRUCTIONS.md`](../../INSTRUCTIONS.md) step 4 directs an agent to run
and which precedes, or stands apart from, `standards init`. A guard inside `init` therefore would not
have prevented it, and `scripts/standards.mjs` at `e341dba` consults no repository status anywhere
(`COMMANDS` is `audit`, `validate`, `init`).

This is a different defect from [#2](https://github.com/mikeycdavis/EngineeringStandards/issues/2).
That one is the entrypoint misreading *what kind* of eligible repository it sees; this one is the
adoption path never asking whether the repository is eligible.

Two properties of the problem shape the decision. First, the question arises before the project has
adopted anything, so answering it cannot depend on a separate enforcement repository being present.
Second, the dangerous error is asymmetric: wrongly refusing an eligible repository costs one owner
override; wrongly permitting a frozen one is an unauthorised mutation of a repository the tool had
no standing to touch.

## Decision

The owner decided D1-D5 on 2026-10-11. Each is recorded with what it fixes and what this ADR adds to
make it implementable.

### D1 — A closed, file-based signal vocabulary

Eligibility is established from a **closed list** of file-based signals, listed with exact filenames
and phrases below. The list is data in the implementation, closed in the sense that a signal absent
from it is not a signal: adding one is a documented change with its own fixture, not a heuristic the
tool may grow on its own. The list is not open-ended pattern matching over prose.

Three states, kept distinct from — never merged into — compliance status:

```text
IN_SCOPE   OUT_OF_SCOPE   INDETERMINATE
```

#### The vocabulary

The owner's list was not available to the author of this record when it was written. This section
is therefore derived **only from evidence in the repositories**, and every candidate the evidence does
not support is marked `UNDECIDED` rather than invented. The evidence is the
`StandardsOrchestrator` banner and `FROZEN.md` quoted in #16 and in plan item 07, re-read for this
record from a local copy of that repository (README line 3, and the closing paragraph of
`FROZEN.md`).

| Signal id | Source | Fires when | Evidence |
| --- | --- | --- | --- |
| `frozen-file` | file named `FROZEN.md` in the repository root | the file is readable and its text contains, after collapsing whitespace and ignoring case, either phrase `do not adopt this repository into a governed project` or `do not extend it` | `FROZEN.md` of StandardsOrchestrator: "Do not adopt this repository into a governed project. Do not extend it." (both sentences, final paragraph) |
| `readme-frozen-banner` | `README.md` in the repository root | its first non-blank line, after removing leading blockquote `>` and emphasis `*` markers and whitespace, begins with `⛔ FROZEN` | StandardsOrchestrator `README.md` line 3: a blockquote whose bold text begins `⛔ FROZEN — not the portfolio authority.` and ends by pointing at `FROZEN.md` |

Filename comparison is case-insensitive on the directory listing, because a differently cased file is
the same signal on the platforms this repository targets and treating it as absent would be the
unsafe direction. On a case-sensitive filesystem the root can hold several entries that fold to
the same name (`FROZEN.md` and `frozen.md`, or `README.md` and `Readme.md`). **Every** case-folded
match is inspected, none is chosen in preference to another, and each is a source in its own right:
any match whose signal fired controls the result as a fired signal, and any match that is
indeterminate (unreadable, not a regular file, over the read cap, not UTF-8) makes the result
`INDETERMINATE`, whatever the other matches say. A benign sibling never clears a fired or
indeterminate one. Matching is on the repository root only; nested directories are not searched,
because a nested `FROZEN.md` describes a subtree and not the repository.

**Candidates not evidenced — `UNDECIDED`, not in the vocabulary.** #16 and plan item 07 name the
*categories* "frozen, archived, historical, superseded, do not adopt/extend" but give no filename or
phrase for any except frozen. These are listed so the owner can adopt or reject each by name; none
is implemented until chosen:

| Candidate | Why it is not in the table |
| --- | --- |
| `ARCHIVED.md`, `SUPERSEDED.md`, `DEPRECATED.md`, `HISTORICAL.md`, `DO-NOT-ADOPT.md` | no repository in evidence carries such a file |
| a README banner with `ARCHIVED`, `SUPERSEDED`, `DEPRECATED` or `HISTORICAL` | no repository in evidence carries one |
| the phrase `retained as comparative design evidence only` | evidenced, but it sits in the same README blockquote as `⛔ FROZEN`; adding it adds false-positive surface and no coverage, so it is recommended **not** to adopt |
| GitHub's repository-level `archived` flag | evidenced as a concept, but it is not file-based (D1) and needs a network call, which a read-only local subcommand must not make |

#### What `IN_SCOPE` does and does not say

`IN_SCOPE` means: every file matching a listed source name was readable and none of the listed signals fired. It is not a
claim that the repository is archived-free, and it cannot be, because the vocabulary is closed. A
repository that is frozen only by an announcement in a wiki, an issue, or a differently worded file
is `IN_SCOPE` to this tool. That is a stated limit of D1, and it is why D5 puts the same question to
the person following the procedure as well as to the tool.

### `INDETERMINATE`

`INDETERMINATE` is "whether this repository is frozen could not be determined". It is never
permission to write. It is the result when any of these holds:

| Condition | Why it is not `IN_SCOPE` |
| --- | --- |
| `FROZEN.md` (any case) exists but cannot be opened or read | the signal's presence is established and its content is not |
| `FROZEN.md` exists, is readable, and contains neither listed phrase | a signal file whose meaning the closed vocabulary does not cover is not evidence of eligibility |
| `FROZEN.md` is not a regular file (directory, broken link) | its content cannot be read |
| `FROZEN.md` or `README.md` exceeds the audit collector's per-file read cap, or does not decode as UTF-8 | the banner could be in the part not examined |
| `README.md` exists but cannot be read | a banner cannot be ruled out |
| the root directory cannot be listed | no source could be examined |

An absent `README.md` or `FROZEN.md` is not `INDETERMINATE`; it is an absent signal.

Precedence: any `INDETERMINATE` source makes the result `INDETERMINATE`; otherwise any signal that
fired and was not overridden makes it `OUT_OF_SCOPE`; otherwise `IN_SCOPE`. The report names every
signal and every source with its own state, so the headline never hides a component.

### D2 — Named per-signal overrides; `INDETERMINATE` cannot be overridden

An owner may allow adoption of a repository whose signals fired, by naming **each** signal id to
override. An override applies to exactly the signal it names:

- naming `frozen-file` does not override `readme-frozen-banner`, and an unnamed fired signal keeps
  the result `OUT_OF_SCOPE`;
- there is no wildcard, no `all`, and no override of a signal that did not fire (that is reported
  as an unused override, not silently ignored);
- `INDETERMINATE` cannot be overridden. The way out is to make the evidence determinable: fix the
  unreadable file, or add or remove the signal in the target repository by the owner's own act.

Overridden signals remain in the report under `overridden`, so `IN_SCOPE` reached through an
override reads differently from `IN_SCOPE` with nothing fired.

**Carrier — proposal, not an owner decision.** D2 fixes the semantics and not the transport. This
record proposes a repeatable per-invocation flag, `--override-signal=<signal-id>`, because anything
persisted in the target repository is itself a write into a repository that may be forbidden to
write to, and anything persisted elsewhere is a new store to govern. The invocation is the unit of
consent. The owner is asked to confirm or replace this carrier at review.

**Binding limit — stated, not solved.** The tool cannot prove that a human typed the override. An
agent can pass the same flag. The mitigations are procedural, not cryptographic: Standard 22 step 0
(D5) states that an override is passed only on the owner's explicit instruction in the current
conversation and that an agent does not choose one; the report prints the overridden signal ids so
the invocation is reviewable; and, in line with [ADR 0005](0005-attestations-are-recorded-human-evidence.md),
nothing in the tool presents an override as attested. This is a known weakness and is recorded as
one. An override is a convenience for a decision that was already made elsewhere, not evidence that
it was.

### D3 — A new read-only `eligibility` subcommand

```text
standards eligibility [<dir>] [--json] [--override-signal=<id>]...
```

It reads only root entries whose case-folded name is one of the two source names in the vocabulary
(`FROZEN.md`, `README.md`), and reads **every** such entry: the count of two names is not a bound on
the count of files read. Each file is subject to the per-file read cap (over it is `INDETERMINATE`),
and no other ceiling on the number of matching entries is introduced; an incomplete root listing is
`INDETERMINATE`, never a silent stop after some entries. It performs no write of any kind, runs no process
and makes no network call. It does not run the audit scan, load a policy, or require one: eligibility
must be answerable in a repository that has adopted nothing.

#### The frozen-surface interpretation

[ADR 0004](0004-audit-and-validate-are-separate-commands.md) freezes "CLI command names and their
high-level semantics" and "exit-code meanings", and makes any change to the frozen list a `MAJOR`
release. This record interprets that as follows, and asks the owner to confirm the interpretation:

- The frozen items are the **existing** commands' names, high-level semantics and exit-code
  meanings. `audit`, `validate` and `init` keep every one of them unchanged. Nothing in this decision
  edits them.
- **Adding** a subcommand is additive: [Standard 21](../../standards/21-versioning.md) R2 classes
  "new backward-compatible rule or capability" as `MINOR`, and a currently compliant project is
  unaffected. The subcommand is not a rule, and D5 binds no rule, so no project can newly fail.
- What the addition does do is create **new frozen surface**: once released, `eligibility`'s name,
  its three states, its exit codes and its JSON field names are frozen in the ADR 0004 sense, and
  changing any is `MAJOR`. That is why the vocabulary-as-data and the states are specified here
  before code exists.
- `eligibility` is neither an `audit` nor a `validate`. It produces no finding, score, assurance or
  compliance status, so ADR 0004's "never letting `audit` grow a compliance verdict" is not engaged.
- Honest precedent note: `init` is listed in the 1.0.0 surface itself in the changelog, so there is
  **no** precedent in this repository of a `standards` subcommand added after a release. The
  interpretation rests on Standard 21 R2, not on a prior case.
- This record does not release anything. Whether the addition ships as a framework `MINOR`, and the
  `VERSION` and `CHANGELOG.md` entries, belong to the implementation pull request that adds the
  command, and the release itself is a separate owner act.

#### Exit codes

[Standard 23](../../standards/23-standards-validator-cli.md) R3 closes the exit set to `0`, `1`, `2`
and defines `2` as "could not reach a verdict". `eligibility` uses that set and adds no code:

| Result | Exit | Reading under Standard 23 R3 |
| --- | --- | --- |
| `IN_SCOPE` | `0` | completed; nothing forbids adoption |
| `OUT_OF_SCOPE` | `1` | completed; the repository declares itself not adoptable |
| `INDETERMINATE` | `2` | the tool could not reach a verdict |
| unknown flag, unknown signal id in an override, missing target, internal error | `2` | invocation error |

Only `0` permits proceeding, so every uncertain path fails closed. `1` and `2` are told apart by the
`state` field of the `--json` output (specified next), which carries `IN_SCOPE`, `OUT_OF_SCOPE`,
`INDETERMINATE` or, for an invocation error, no `state` key at all. A caller must not infer
eligibility from the absence of a non-zero exit that it did not read.

The existing CLI spells the machine-output flag `--json` (`parseArgs` in `scripts/standards.mjs`);
`eligibility` uses the same spelling rather than the `--format json` form that some prose uses.

#### The `--json` document (normative)

Without `--json` the output is human text and carries no contract (ADR 0004, "explicitly not
frozen"). With `--json`, stdout is exactly one JSON object, UTF-8, followed by a newline, and
nothing else; human diagnostics go to stderr. Two shapes exist, told apart by which of `state` and
`error` is present; exactly one is.

**Success (exit `0`, `1` or `2`; `state` present, `error` absent):**

| Key | Type | Allowed values / meaning |
| --- | --- | --- |
| `schemaVersion` | string | `"1.0.0"`, semantic, independent of the audit/validate envelope's own value (ADR 0004) |
| `command` | string | always `"eligibility"` |
| `state` | string | `"IN_SCOPE"`, `"OUT_OF_SCOPE"`, `"INDETERMINATE"` |
| `exitCode` | integer | `0` for `IN_SCOPE`, `1` for `OUT_OF_SCOPE`, `2` for `INDETERMINATE`; always equals the process exit code |
| `target` | string | the resolved absolute directory that was examined |
| `listing` | string | `"complete"` or `"incomplete"`; `"incomplete"` forces `state` `"INDETERMINATE"` |
| `signals` | array | exactly one record per vocabulary signal, in vocabulary order, whether or not it matched anything |
| `overrides` | object | see below |

Each `signals[]` record:

| Key | Type | Allowed values / meaning |
| --- | --- | --- |
| `id` | string | a vocabulary signal id: `"frozen-file"`, `"readme-frozen-banner"` |
| `result` | string | `"FIRED"`, `"NOT_FIRED"`, `"INDETERMINATE"`; `INDETERMINATE` if any entry is, else `FIRED` if any entry fired, else `NOT_FIRED` (including when no entry matched) |
| `overridden` | boolean | `true` only when `result` is `"FIRED"` and the id was named in an override; never `true` for any other `result` |
| `entries` | array | one record per root entry whose case-folded name matches this signal's source name, in no guaranteed order |

Each `entries[]` record:

| Key | Type | Allowed values / meaning |
| --- | --- | --- |
| `name` | string | the entry's name exactly as listed, with its original case |
| `result` | string | `"FIRED"`, `"NOT_FIRED"`, `"INDETERMINATE"` |
| `reason` | string or null | `null` unless `result` is `"INDETERMINATE"`, then one of `"unreadable"`, `"not-regular-file"`, `"over-read-cap"`, `"not-utf8"`, `"no-listed-phrase"` |

`overrides` object:

| Key | Type | Meaning |
| --- | --- | --- |
| `requested` | array of string | signal ids named by the caller, in the order given, de-duplicated |
| `applied` | array of string | the requested ids that matched a `FIRED` signal |
| `unused` | array of string | the requested ids that were valid but whose signal did not fire (reported, never silently ignored) |

`state` is derived from the records and nothing else: `INDETERMINATE` if `listing` is
`"incomplete"` or any signal `result` is `"INDETERMINATE"`; otherwise `OUT_OF_SCOPE` if any signal
is `"FIRED"` with `overridden` `false`; otherwise `IN_SCOPE`. An override can therefore never change
an `INDETERMINATE`.

**Invocation error (exit `2`; `error` present, `state` absent):**

| Key | Type | Allowed values / meaning |
| --- | --- | --- |
| `schemaVersion` | string | `"1.0.0"` |
| `command` | string | `"eligibility"` |
| `exitCode` | integer | `2` |
| `error` | object | `{ "code": string, "message": string }`; `code` is one of `"unknown-flag"`, `"unknown-signal-id"`, `"no-such-directory"`, `"internal-error"`; `message` is human text with no contract |

A caller reading this shape MUST treat the absence of `state` as not eligible. When the arguments
are so malformed that the tool cannot tell that `--json` was requested, nothing is written to stdout
and the diagnostic is on stderr only; exit is still `2`.

**Proposed shape, owner to confirm.** D1-D5 fix the states, the per-signal override, the exit codes
and the `state` field. They do not fix the following, which this record supplies so that two
implementations cannot both claim to conform; each is open to the owner's change before release:
the key names `signals`, `entries`, `overrides`, `listing`, `target`; the closed `reason` and
`error.code` lists; `schemaVersion` `"1.0.0"` as the starting value; the per-signal rather than
per-file override reporting (`applied` / `unused`); and `--json` as the flag spelling. Adding a key
later is additive; renaming or removing one, or widening an allowed value list, is `MAJOR` once
released.

### D4 — This record precedes implementation

The order is fixed: this ADR and the entrypoint decisions; then the vocabulary and overrides; then
the wording surfaces. Each lands as its own reviewed change. Nothing here authorises merging this
ADR's implementation without the review of this record first.

### D5 — Standard 22 step 0, without a catalog rule

[Standard 22](../../standards/22-adoption-and-migration.md) R1's migration flow gains a **step 0**:
establish adoption eligibility before any adoption write, by running `standards eligibility`
against the candidate repository and stopping on anything but `IN_SCOPE`. It is mirrored in
[`INSTRUCTIONS.md`](../../INSTRUCTIONS.md) and in
[`docs/adoption-flow.mmd`](../../docs/adoption-flow.mmd) (with its rendered SVG, per
[ADR 0003](0003-mermaid-is-the-canonical-diagram-source.md)), ahead of `/codebase-docs`, which is
the step that did the damage.

**No catalog rule is bound.** Eligibility is a precondition of adopting, not a property of an
adopted project; there is no project for a rule to apply to until the answer is yes. The
implementation pull requests MUST carry a guarantee, as a test, that the rule catalog is
byte-identical and that `validate` output for every existing fixture is unchanged, so "no catalog
rule" is demonstrated and not merely stated.

The implementation pull requests MUST also test the both-spellings rule, in two layers, because a
directory holding `FROZEN.md` and `frozen.md` together cannot exist on a case-insensitive volume
(Windows, default macOS):

1. **Injected listing, on every platform.** The directory-enumeration and collision logic takes its
   listing and its file reads through an injected interface, and is tested against a mocked listing
   containing both spellings: a benign `frozen.md` beside a `FROZEN.md` that fires, a benign
   `README.md` beside a `Readme.md` that carries the banner, and a benign sibling beside an
   unreadable one. Each case is run with the signalling or unreadable spelling listed first and
   last, so the result cannot depend on directory order, and asserts `OUT_OF_SCOPE` or
   `INDETERMINATE`, never `IN_SCOPE`. This layer is not skippable.
2. **Real filesystem, only where it can exist.** The on-disk both-spellings fixture is created in a
   temporary directory and run only after detecting that the temporary filesystem is case-sensitive
   (create one file, test whether its other-cased name resolves). On a case-insensitive volume the
   test is reported as an explicit skip naming that reason, never as a pass, and layer 1 still runs.

All other fixtures (a single `FROZEN.md`, banner, unreadable, over-cap, no-phrase, absent) are
portable and run everywhere.

## Alternatives considered

**A guard inside `init` only.** Rejected as the sole control. The recorded mutation happened before
`init` in the documented sequence; a guard there would have fired after the damage. `init` may still
consult the same resolver as defence in depth — see the open question below.

**A catalog rule `adoption.eligible`.** Rejected by D5. A rule is evaluated against an adopted
project, and the case this exists for is the repository that must not become one.

**Delegating eligibility to an external registry.** Rejected. The question arises before adoption,
and an answer that needs a separate enforcement repository to be present is unavailable exactly when
it is needed. Plan item 07 raised this and expected the answer recorded here.

**Open-ended detection (prose heuristics, keyword search of the README).** Rejected by D1. A
heuristic that can fire on discussion of frozen repositories is the use/mention error
[ADR 0009](0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md) records, and a
heuristic that fails to fire is silent. A closed list is incomplete in a way that can be stated.

**A fourth exit code for `INDETERMINATE`.** Rejected. Exit-code meanings are frozen by ADR 0004 and
Standard 23 R3 closes the set; `2` already means "no verdict".

**A persisted override file in the target repository.** Rejected as the carrier proposal: it is a
write into the repository the guard protects, and a file an agent could create is no stronger
binding than a flag it could pass.

## Consequences

**Makes easier.** An agent or person has one read-only command that answers "may I write to this
repository" before any write, with an answer that fails closed. The owner can allow a specific
repository by naming exactly what is being overridden.

**Makes harder.** A new frozen surface (command, states, exit codes, JSON fields). A closed
vocabulary will miss a repository that is frozen in a way it does not list, and growing it is a
reviewed change each time.

**Commits the project to.** Keeping `INDETERMINATE` un-overridable; never naming a repository in the
implementation (acceptance criterion 3 of #16); and treating the vocabulary list in this record as
the specification the fixtures are derived from.

**Known limits accepted.**

- The tool cannot prove an override was typed by a human (D2).
- `IN_SCOPE` is "no listed signal", not "adoptable" (D1).
- Case-insensitive filename matching, root-only lookup, and the first-non-blank-line banner rule are
  design choices made here for fail-closed behaviour. They are not taken from the owner's list and are
  open to change at review.

## Open questions (not decided; not guessed)

- **UNDECIDED — vocabulary beyond `FROZEN.md` and the `⛔ FROZEN` banner.** Which of the listed
  candidates, if any, join the vocabulary. The owner's explicit list should replace the table above
  if it differs; no implementation PR is opened with a signal that is not in the table at the time
  this record is accepted.
- **UNDECIDED — does `init` consult the resolver?** Acceptance criterion 1 says "the adoption
  entrypoint writes nothing". D3 names the subcommand but not whether `init` also refuses on
  `OUT_OF_SCOPE` / `INDETERMINATE`. Recommended: yes, with the same override flag, exit `2`, before
  any write, so a caller who skips step 0 is still stopped. This changes `init`'s behaviour for
  repositories carrying a listed signal, and is not implemented without confirmation.
- **UNDECIDED — override carrier** (see D2). Per-invocation flag proposed.
- **UNDECIDED — `FROZEN.md` present with no listed phrase** is `INDETERMINATE` here. The alternative
  is `OUT_OF_SCOPE` on the filename alone, which is more conservative still but turns a file that
  says anything into a hard stop that overrides can lift. Confirm at review.

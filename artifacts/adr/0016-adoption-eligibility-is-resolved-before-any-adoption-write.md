# 0016 — Adoption eligibility is resolved before any adoption write

- **Status:** Accepted, by the owner on 2026-10-12T18:59:50Z (Standard 11 R5, `Proposed | Accepted`),
  on top of the seven decisions of 2026-10-12T16:52:55Z and the four confirmations of
  2026-10-12T18:36:55Z recorded below. This record states what must be true of the implementation;
  it does not claim any of it is implemented.
- **Date:** 2026-10-11, revised 2026-10-12
- **Deciders:** Project owner
- **Tracks:** ST-06, [#16](https://github.com/mikeycdavis/EngineeringStandards/issues/16)
- **Related:** [ADR 0004](0004-audit-and-validate-are-separate-commands.md),
  [ADR 0005](0005-attestations-are-recorded-human-evidence.md),
  [ADR 0008](0008-detectors-do-not-assert-repository-state-they-have-not-measured.md),
  [Standard 22](../../standards/22-adoption-and-migration.md),
  [Standard 23](../../standards/23-standards-validator-cli.md),
  [Standard 33](../../standards/33-bootstrap-experience.md),
  [Standard 44](../../standards/44-existing-project-reconstruction.md) R12

This record is written **before implementation**. Nothing it describes exists in code yet; every
statement in "Decision" is a commitment for the implementation pull requests that follow, not a
description of current behaviour.

## Context

The adoption path has no notion of whether a repository may be adopted at all. Every step assumes
the answer is yes and asks only how.

The failure was observed, not hypothesised. `StandardsOrchestrator`'s `README.md` carries a `⛔ FROZEN`
banner, and its `FROZEN.md` states "Do not adopt this repository into a governed project. Do not
extend it." The documented adoption sequence ran and wrote five files into it before anything
consulted that status ([#16](https://github.com/mikeycdavis/EngineeringStandards/issues/16);
[plan item](../project-plan-breakdown/07-distributed-validation-and-ci.md)). The mutation happened
at `/codebase-docs`, which [`INSTRUCTIONS.md`](../../INSTRUCTIONS.md) step 4 directs an agent to run
and which precedes, or stands apart from, `standards init`. A guard inside `init` alone therefore
would not have prevented it, and `scripts/standards.mjs` at `e341dba` consults no repository status
anywhere (`COMMANDS` is `audit`, `validate`, `init`).

This is a different defect from [#2](https://github.com/mikeycdavis/EngineeringStandards/issues/2).
That one is the entrypoint misreading *what kind* of eligible repository it sees; this one is the
adoption path never asking whether the repository is eligible.

Two properties shape the decision. First, the question arises before the project has adopted
anything, so answering it cannot depend on a separate enforcement repository being present. Second,
the dangerous error is asymmetric: wrongly refusing an eligible repository costs one owner override;
wrongly permitting a frozen one is an unauthorised mutation of a repository the tool had no standing
to touch.

## Decision record

Seven decisions were taken on **2026-10-12T16:52:55Z** (owner approval of the revision-2
recommended bundle of the ST-06 decision packet, relayed to this record by the coordinating
session). **Revision 1 of the packet is superseded**; its README rule ("first non-blank line") must
not be cited, because it would not have fired on the evidenced README (see "The vocabulary").

| # | Decision | Chosen | Recorded as |
| --- | --- | --- | --- |
| Q1 | Signal vocabulary | A | exactly two evidenced signals: `frozen-file`, `readme-frozen-banner`, with the corrected per-line README rule |
| Q2 | `init` and the resolver | A | `init` consults the same resolver; refuses with exit `2` and writes nothing (a pre-write refusal; the single post-write class is the P6 race); same override flag; INDETERMINATE not overridable |
| Q3 | Override carrier | A | repeatable per-invocation `--override-signal=<id>`; nothing persisted; binding rules 1-7 under D2 |
| Q4 | `FROZEN.md` with no listed phrase | A | INDETERMINATE (`no-listed-phrase`), not overridable |
| Q5 | Machine-readable output | C | only the three state names and exit codes 0, 1, 2 are frozen; **no JSON property name, nesting, ordering, optional field, evidence shape or serialisation detail is frozen**; the complete machine-readable contract is deferred to a later, separately approved ADR and work item |
| Q6 | Frozen-surface reading | A, **reclassified by the owner on 2026-10-12T17:51:57Z (option A of the `init` compatibility question)** | adding `eligibility` alone would be `MINOR`, but `init` refusing a repository it previously bootstrapped changes a frozen command's semantics, so the complete ST-06 change is classified **`MAJOR`, 3.0.0** (the owner's classification; `VERSION`, tags and releases are not authorised by this record); the new frozen surface is the command name, the three state names, and the exit-code meanings 0, 1 and 2; this record does not freeze flag spellings |
| Q7 | Matching rules | A | ASCII-case-insensitive filenames, every case-folded match inspected, root only, target is exactly the directory given with no walk-up (see confirmation 4 below) |

### Owner confirmations of 2026-10-12T18:36:55Z

The owner confirmed four points that had been carried as inferences, all by option 2(a). They are
recorded here and applied where they bind; none is an inference any longer.

1. **`eligibility` rejects `--json`.** Until a separate machine-format ADR exists, `eligibility --json`
   is an unknown flag, exits `2`, writes its diagnostic to stderr and emits no stdout. The closed
   invocation grammar treats any unsupported token beginning with `-`, including `--json`, as
   `unknown-flag`. No human prose is emitted under a flag named `--json`. (This is about
   `eligibility`; `init --json` keeps its existing structured report.)
2. **This record does not freeze flag spellings.** They may change in a `MINOR` release under this
   record. The frozen surface is exactly: the command name, the three state names, and the exit-code
   meanings `0`, `1` and `2`. The complete JSON format remains deferred. The invocation grammar and
   flag spellings are not added to the frozen surface. This is a statement of this record, not a
   claim that ADR 0004's lists address flag spellings.
3. **`listing-incomplete`.** The name is used for a directory listing that cannot be opened or fails
   before completion. It produces `INDETERMINATE` even when a freeze signal fired and was not
   overridden, because the absence of another signal cannot be established. It is distinct from
   `unreadable`, which applies to an individual file. The condition name is not part of the frozen
   public surface.
4. **Exact target directory, no walk-up.** `eligibility <target>` evaluates exactly the directory
   supplied; with no target it evaluates the current working directory. It does not walk upward to a
   `.git` or `package.json` root. Directory symlinks are valid and are resolved normally by the
   operating system; no canonicalisation contract is introduced. Consequence: `init <subdir>` is
   judged on that subdirectory only, so a freeze marker at an ancestor repository root is not
   consulted.

### Owner decisions of 2026-10-12T18:59:50Z

1. **This ADR is `Accepted`.**
2. **Platform requirement.** Every supported platform must inspect `README.md` and `FROZEN.md`
   without opening a symlink, named pipe, device or other unsafe non-regular file as a regular
   freeze-signal file, by a race-safe method. This replaces the earlier caveat that a runtime
   without a no-follow open makes eligibility indeterminate for every repository, and the earlier
   alternative of recording a platform as unsupported. The requirement is stated under "Symbolic
   links and file safety".
3. **Windows.** A Windows-safe implementation of `eligibility` is required in 3.0.0.

These do not change decisions Q1-Q7 or the four confirmations.

Decisions D1-D5 of 2026-10-11 stand and are restated where they apply: D1 closed file-based
vocabulary; D2 named per-signal overrides with INDETERMINATE not overridable; D3 a read-only
`eligibility` subcommand; D4 this record before implementation; D5 Standard 22 step 0 with no
catalog rule.

## Post-acceptance additions (pending owner reapproval)

The owner accepted this record on 2026-10-12T18:59:50Z. The additions below were made **after** that
acceptance, in response to review of PR #105, and this record does **not** assert that the owner
approved them. They are listed with their source, the choice made and the alternative, so the owner
can approve or amend them in one pass; until then they are proposals within an Accepted record. The
status line and attribution above are deliberately unchanged pending that decision.

| # | Addition | Source (Codex finding, commit) | Choice made | Alternative |
| --- | --- | --- | --- | --- |
| 1 | The resolver acquires the held directory handle before resolution and reads relative to it; `init` writes through it, and checking identity then writing by path is not acceptable. (The identity check with `target-changed` before `planInit` and `applyInit` was already in f4615dd and is approved.) | 4251464916, 4251544511, 4251801205; commits 2c542b9, 18b0f9d, 4762e0f (merged as 03ac0e7) | binding by held handle | the f4615dd identity check followed by a path-based write (rejected: not atomic) |
| 2 | Every path component and the leaf are bound; links, FIFOs, devices and a directory where a file is expected are refused (exit `2`, nothing written) | 4264398202, 4264725716, 4264835581, 4264835588, 4264835599; commits aa8abcc, ebefbcb, 0f77ff7 | refuse, never follow, never replace a link by rename | follow links inside the target, or replace a link as a link |
| 3 | Properties-only normative text with a non-normative mechanism note (P1-P7); scope limited to paths within the target | 4264881405; commits 0f77ff7, 563167c | properties only; framework-side reads (`templates/*`, `VERSION`) outside the binding | prescribe system calls in the normative text |
| 4 | The post-write race class (P6): that write is refused, earlier artifacts remain, no rollback; named `entry-changed` | 4264881418, 4264926220, 4264964402; commits 563167c, 9687685, 3adfed5 | partial retention, narrowest honest wording | rollback or transactional placement of all artifacts |
| 5 | Windows release gates beyond the one in f4615dd: a **non-skipped** real symlink or reparse-point test for `eligibility`, and non-skipped real-filesystem `init` tests (linked intermediate, leaf link, synchronized replacement races for absent and existing leaves, deletion, and an intermediate junction) in the 3.0.0 run, with a seam in the implementation's test surface | 4251464935, 4264881420, 4264926224, 4264964409; commits 2c542b9, 563167c, 9687685, 3adfed5 | release-blocking requirements, stated as requirements and not as existing | injected-only tests, or skippable real tests |
| 6 | Capped read at cap-plus-one bytes with an injected grow-after-classification test | 4265009543; commit ade7f24 | bounded read | size check then unbounded read |

**Approved at acceptance, not additions (verified against f4615dd):** the platform requirement
(every supported platform inspects `README.md` and `FROZEN.md` safely; Windows is not declared
unsupported); the runtime fail-closed rule where safe inspection cannot be established (the entry
is not opened as a regular file and is `INDETERMINATE`, `unreadable`); the condition
`target-changed` with identity verified before `planInit` and `applyInit`; and a release gate of a
passing Windows run of the file-safety tests for `eligibility`.

Condition names (`target-changed`, which was approved at acceptance, and `entry-changed`, which is
an addition) are human diagnostics and are not part of the frozen surface.

## Decision

### D1 — A closed, file-based signal vocabulary (Q1 A, Q7 A)

Eligibility is established from a **closed list** of file-based signals, listed with exact filenames
and phrases below. A signal absent from the list is not a signal: adding one is a documented change
with its own fixture, not a heuristic the tool may grow. The list is not open-ended pattern matching
over prose.

Three states, kept distinct from, never merged into, compliance status:

```text
IN_SCOPE   OUT_OF_SCOPE   INDETERMINATE
```

#### The vocabulary

Derived **only from evidence in the repositories**: the `StandardsOrchestrator` `FROZEN.md` and
`README.md` quoted in #16 and plan item 07, re-read from a local copy.

| Signal id | Source | Fires when | Evidence |
| --- | --- | --- | --- |
| `frozen-file` | a file in the repository root named `FROZEN.md` (ASCII case-insensitive) | readable, and its text, normalised as in "Text rules", contains the substring `do not adopt this repository into a governed project` or the substring `do not extend it` | `FROZEN.md`: "Do not adopt this repository into a governed project. Do not extend it." |
| `readme-frozen-banner` | a file in the repository root named `README.md` (ASCII case-insensitive) | some line of the file is a blockquote line whose text, after the stripping in "Text rules", begins with `⛔ FROZEN` (U+26D4, U+0020, `FROZEN`, case-sensitive) | README line 3 (line 1 is the `# StandardsOrchestrator` title, so the banner is not the first line): a blockquote whose bold text begins `⛔ FROZEN — not the portfolio authority.` |

**Not in the vocabulary** (not evidenced; none is implemented): `ARCHIVED.md`, `SUPERSEDED.md`,
`DEPRECATED.md`, `HISTORICAL.md`, `DO-NOT-ADOPT.md`; README banners for those words; the phrase
"retained as comparative design evidence only"; GitHub's repository-level `archived` flag (not
file-based, and it needs a network call a read-only local command must not make). Each may join
later as a reviewed change with its own fixture.

#### Matching rules (Q7 A)

- Filename comparison is **ASCII-case-insensitive** on the directory listing: ASCII letters are
  lowercased, with no Unicode or locale case folding. A differently cased file is the same signal,
  and treating it as absent would be the unsafe direction.
- On a case-sensitive filesystem the root can hold several entries that fold to the same name
  (`FROZEN.md` and `frozen.md`, or `README.md` and `Readme.md`). **Every** case-folded match is
  inspected, none is preferred, and each is a source in its own right: any match whose signal fired
  controls the result as a fired signal, and any match that is indeterminate makes the result
  `INDETERMINATE`, whatever the other matches say. A benign sibling never clears a fired or
  indeterminate one.
- Lookup is the **root of the directory given** only. Nested directories are not searched, because a
  nested `FROZEN.md` describes a subtree and not the repository. The command does not walk up to a
  `.git` or `package.json` root the way `audit` does; the target is exactly the directory named (or
  the current working directory when none is named). A directory symlink given as the target is
  valid and is resolved normally by the operating system; no canonicalisation contract is
  introduced. **Consequence:** `init <subdir>` is judged on that subdirectory only, so a freeze
  marker at an ancestor repository root is not consulted.
- The command reads only entries whose lowercased name is one of the two source names, and reads
  **every** such entry: the count of two names is not a bound on the files read. Each file is subject
  to the per-file read cap, and no other ceiling on matching entries exists.

#### Text rules

Every character-class decision is fixed here, ASCII-only and locale-independent, so two
implementations cannot differ on Unicode whitespace or case. Where this record is silent, nothing is
implied.

- **Decoding.** A matching file is read with a **capped read that stops after at most cap-plus-one
  bytes**, where the cap is the audit collector's per-file read cap (`MAX_READ_BYTES`, 400,000 bytes
  at e341dba). It is not a size check followed by an unbounded read: a file that grows after
  classification is bounded by the same cap-plus-one read. If more than the cap is observed the file
  is `over-read-cap` and nothing is decoded. A file within the cap is decoded as UTF-8 with errors
  fatal (an invalid sequence is `not-utf8`). One leading U+FEFF is removed. NUL and other control
  characters are valid text.
- **Line terminators.** LF, CRLF and a lone CR each end a line.
- **Whitespace and blank.** The whitespace set is exactly U+0020 and U+0009. A line is blank if it is
  empty or contains only that set. U+00A0, U+3000, U+200B and every other Unicode space or format
  character are **not** whitespace; the ASCII set is the one Markdown treats as indentation, and a
  smaller set never makes a signal fire on a character the author did not type as a space.
- **README banner.** For each line: remove leading whitespace-set characters; the line is a
  blockquote line only if its next character is `>`; then repeatedly remove any leading character
  from `>`, `*`, U+0020, U+0009; the signal fires if the remainder begins with the exact code points
  `⛔ FROZEN`. The match is a case-sensitive prefix match with no word-boundary check. `_` emphasis, a
  variation selector after `⛔`, and a leading U+00A0 are not stripped or skipped, so such a banner
  does not fire (a stated limit of a closed vocabulary). The rule does not use "the first line": the
  evidenced README opens with a title and carries the banner on line 3, so a position bound would
  need an invented number. A line anywhere in the file that meets the rule fires; a false match
  fails closed (`OUT_OF_SCOPE`, overridable).
- **`FROZEN.md` phrases.** After decoding: lowercase ASCII letters `A`-`Z` only; replace each
  maximal run of U+0020, U+0009, U+000A and U+000D with one U+0020; then test the two phrases as
  plain substrings with no boundary check (`do not extend items` also matches `do not extend it`; a
  false match fails closed). A phrase broken by U+00A0, or with a different hyphen or apostrophe,
  does not match.
- **Identifiers.** Signal ids and override ids are compared exactly and case-sensitively;
  vocabulary ids are lowercase ASCII with hyphens.
- **No locale.** No comparison, case change or sort consults the process locale or a Unicode
  normalisation form; strings are compared as UTF-16 code units or bytes.

#### The three states, defined together

The states are mutually exclusive and are decided in this order (the same order as "Precedence"):

- `INDETERMINATE`: **at least one** `INDETERMINATE` condition in the table below applies, or the
  listing is incomplete. This holds whatever else was observed, including a fired signal.
- `OUT_OF_SCOPE`: **no** `INDETERMINATE` condition applies, and at least one listed signal fired and
  was not overridden.
- `IN_SCOPE`: **no** `INDETERMINATE` condition applies, and no listed signal fired (or every fired
  signal was overridden).

A readable `FROZEN.md` that contains neither listed phrase is an `INDETERMINATE` condition
(`no-listed-phrase`), so it is never `IN_SCOPE`, and it is not `OUT_OF_SCOPE` either: a signal that
did not fire cannot make the result `OUT_OF_SCOPE`.

#### What `IN_SCOPE` does and does not say

`IN_SCOPE` means: no `INDETERMINATE` condition applied (every file matching a listed source name was
read in full and was readable text, and the listing was complete) and no listed signal fired that was
not overridden (including the case where every signal that fired was overridden). It is not a claim that the repository is archive-free, and cannot be, because the vocabulary
is closed. A repository frozen only by a wiki note, an issue, or a differently worded file is
`IN_SCOPE` to the tool. That is a stated limit of D1, and it is why D5 puts the same question to the
person following the procedure as well as to the tool.

### `INDETERMINATE` (Q4 A)

`INDETERMINATE` is "whether this repository is frozen could not be determined". It is never
permission to write, and it cannot be overridden. It is the result when any of these holds, each
named by the condition used in the human report and in tests:

| Condition | Name | Why it is not `IN_SCOPE` |
| --- | --- | --- |
| a matching regular file cannot be opened or read (including a read that fails after a successful `lstat`, or a disappearance) | `unreadable` | the signal's presence is established and its content is not |
| `FROZEN.md` is readable and contains neither listed phrase (empty, whitespace-only, or other text) | `no-listed-phrase` | a file named for freezing whose meaning the closed vocabulary does not cover is not evidence of eligibility (Q4 A) |
| a matching entry is returned by the listing but `lstat` on it fails | `stat-failed` | it cannot be classified, so neither its presence nor its content is known |
| a matching entry is not a regular file as reported by `lstat` on the entry itself: a directory, a symbolic link of any kind, or any other non-file | `not-regular-file` | the link is not followed, so its content is not what was examined |
| a matching file is strictly larger than the per-file read cap | `over-read-cap` | the banner could be in the part not examined |
| a matching file does not decode as UTF-8 under fatal decoding | `not-utf8` | the text cannot be read |
| during `init`, the target's directory identity differs from the one the resolver examined | `target-changed` | the repository that was checked is not the repository about to be written |
| the target's directory listing cannot be opened, or fails before its end | `listing-incomplete` | absence of another signal cannot be established; this is distinct from `unreadable`, which applies to an individual file, and the name is not part of the frozen public surface |

An absent `README.md` or `FROZEN.md` is not `INDETERMINATE`; it is an absent signal. The condition
names are the vocabulary of this record and of the tests; the layout in which a report prints them is
not frozen (Q5 C).

**Partial listings.** For a streamed or injected listing that yields entries and then fails, every
entry yielded before the failure **is** inspected and classified, and signals derive from those
entries as usual. Nothing observed is discarded: a banner or `FROZEN.md` seen before the failure is
still reported as fired. No entry is invented for names never yielded. The result is `INDETERMINATE`
(`listing-incomplete`) even when a signal fired and is not overridden: the repository is not known to
be only what was seen, so the state is not `OUT_OF_SCOPE`, and an override cannot change it. A
signal with no fired entry in an incomplete listing is reported indeterminate, not "not fired",
because absence was not established.

#### Symbolic links and file safety

One rule covers every source entry: **a symbolic link is never followed, and is `INDETERMINATE`
(`not-regular-file`).** The entry is classified from `lstat` on the name as listed; the link's target
is not opened, resolved or inspected.

- A link to a regular file, a link to a directory, a dangling link, and a link leaving the target
  tree (absolute or `..`) all give the same result, so there is no per-target decision to diverge on.
- Why not follow: following needs a boundary rule and a loop rule, each a new place to disagree, and
  a link leaving the tree makes the verdict depend on a repository the caller did not name.
- Cost, stated: a repository whose `README.md` is a link (for example to `docs/README.md`) is
  `INDETERMINATE`, and that cannot be overridden. The remedy is to replace the link with a regular
  file in the target repository by the owner's own act.
- Scope: the rule is about entries inside the target. The target argument itself is resolved
  normally: a symlink to a directory is a valid target; one to a regular file is not a directory.
- A link whose name matches still counts as a source; it cannot be skipped as "not a file".
- **No race between classification and read.** An `lstat` followed by a path-based read would follow
  a regular file that was replaced by a link in between, and let a file outside the named
  repository decide eligibility. The invariant "a link is never followed" is therefore enforced at
  the read: the entry is opened with a no-follow open (`O_NOFOLLOW` or the platform equivalent), and
  classification (`fstat`: a regular file) and the content read both use that **same open handle**.
  An open that fails because the entry is a link or was replaced is `INDETERMINATE`, never a fall
  back to a path-based read. **There is no identity-comparison fallback:** an ordinary open follows
  a link before any `fstat` could notice, and can block or have side effects on a pipe or device.

**Platform requirement (normative, owner decision of 2026-10-12T18:59:50Z).**

- **Every supported platform** must inspect `README.md` and `FROZEN.md` without opening a symlink, a
  named pipe (FIFO), a device or any other unsafe non-regular file as if it were a regular
  freeze-signal file, and by a race-safe method: an open that does not follow links and does not
  block on or act on a pipe or device, with classification and read taken from that same handle.
  The method is the implementation's choice per platform (for example `O_NOFOLLOW` with a
  non-blocking open on POSIX; opening the reparse point itself on Windows); this record prescribes
  the property, not the call. It must be reachable within the repository's zero-third-party-
  dependency decision, and each implementation PR must show it by test.
- **Windows is a supported platform and is not declared unsupported.** A Windows-safe implementation
  of `eligibility` is **required in 3.0.0**. A platform is not exempted by lacking a convenient
  primitive; that is a cost the implementation carries.
- **Fail closed stays.** Where safe inspection cannot be established for an entry in a given run
  (the primitive is unavailable at runtime, a capability probe fails, or the entry changes under the
  read), the entry is **not opened as a regular file** and is `INDETERMINATE` (`unreadable`, or
  `not-regular-file` when a link or special file was identified). That is a runtime fail-closed, not
  a platform exemption, and it is never overridable.
- **Normative support is not implementation completion.** This record fixes what every supported
  platform must do and that Windows is in scope for 3.0.0. It does **not** state that any platform's
  implementation exists, and nothing here may be cited as evidence that Windows support is already
  implemented. Completion and per-platform verification are later work, and a 3.0.0 release without
  a passing Windows-safe implementation of `eligibility` is not permitted by this record.

#### Precedence

Any `INDETERMINATE` source or an incomplete listing makes the result `INDETERMINATE`; otherwise any
signal that fired and was not overridden makes it `OUT_OF_SCOPE`; otherwise `IN_SCOPE`. A human
report names every signal and every matching entry with its own result, so the headline never hides a
component. The report layout is not frozen.

### D2 — Named per-signal overrides (Q3 A)

An owner may allow adoption of a repository whose signals fired, by naming **each** signal id to
override. The carrier is a repeatable per-invocation flag:

```text
standards eligibility <dir> --override-signal=frozen-file
standards eligibility <dir> --override-signal=frozen-file --override-signal=readme-frozen-banner
standards init <dir> --override-signal=frozen-file
```

Nothing is persisted: not in the target repository, which may be forbidden to write to, and not in a
new store. The invocation is the unit of consent. Binding rules:

1. An override names one signal id; there is no wildcard and no `all`.
2. An override applies only to a signal that fired. Naming a signal that did not fire is reported as
   unused, never silently ignored, and does not change the state.
3. An override never changes `INDETERMINATE`: if any source is indeterminate or the listing is
   incomplete, the state is `INDETERMINATE` whatever was named.
4. A fired signal that is not named keeps the state `OUT_OF_SCOPE`. Naming `frozen-file` does not
   clear `readme-frozen-banner`.
5. An unknown signal id is an invocation error (exit `2`), not an ignored flag.
6. The state is derived from the signal results only, so there is no ordering between flags on the
   command line; duplicates are collapsed.
7. **Binding limit, stated and not solved.** The tool cannot prove that a human typed the flag. An
   agent can pass it. The mitigation is procedural: Standard 22 step 0 (D5) says an override is passed
   only on the owner's explicit instruction in the current conversation, and an agent does not choose
   one; the report prints applied overrides so the invocation is reviewable; and, in line with
   [ADR 0005](0005-attestations-are-recorded-human-evidence.md), nothing presents an override as
   attested. An override is a convenience for a decision made elsewhere, not evidence that it was.

### D3 — A read-only `eligibility` subcommand, and `init` (Q2 A)

```text
standards eligibility [<dir>] [--override-signal=<id>]...
```

It performs no write of any kind, runs no process and makes no network call. It does not run the
audit scan, load a policy, or require one: eligibility must be answerable in a repository that has
adopted nothing.

**`init` consults the same resolver** (Q2 A). Before any write, `init` resolves eligibility with the
same code and the same override flag. On `OUT_OF_SCOPE` (not overridden) or `INDETERMINATE` it
exits `2`, writes nothing, and names the signals; `--dry-run` runs the same check and reports the same
refusal. These are pre-write refusals; the one post-write failure class is the race in P6. `INDETERMINATE` is not overridable here either. For an `IN_SCOPE` repository `init` is
unchanged, and the greenfield, scaffold, nested-monorepo and reconstruction-required fixtures
classify and write exactly as before (a test).

*Clarification (review of #105; not a new owner decision).* What `init` writes to stdout on a refusal
is fixed by the behaviour `init` already has when it cannot run: `runInit` writes the diagnostic to
stderr, returns exit `2`, and emits **nothing** on stdout, with or without `--json`
(`scripts/standards.mjs`, the `planInit` failure path). The eligibility refusal is the same path:

- `init`, `init --dry-run`, `init --json` and `init --dry-run --json` all refuse with exit `2`,
  **empty stdout**, and a human diagnostic on stderr that names the signals or conditions. No
  eligibility report is printed to stdout, so a consumer parsing `init --json` receives either its
  existing structured report or nothing, never prose.
- No field is added to the structured `init` report, in either the refusal or the success case. An
  `IN_SCOPE` repository's `init --json` and `init --dry-run --json` output is byte-for-byte what it
  is today. This keeps the machine-readable surface exactly as deferred by Q5 C: eligibility
  introduces no machine field anywhere.
- The refusal happens before `planInit` and `applyInit`, so no `planInit` report or bootstrap plan is
  computed and nothing is written; stderr is the only output.
#### File safety for `init` (normative properties)

The requirements below are **properties**. They state what must be true, not which system call
achieves it; mechanisms are in the non-normative guidance note that follows and prescribe nothing.

**Scope: paths resolved within the target directory.** P1-P6 govern the reads and writes that
`init` and the resolver perform on paths **inside the target directory**. Framework-side reads, such
as the templates under `templates/` and `VERSION` (read by `renderTemplate()` and
`frameworkVersion()`), belong to the tool's own installation, cannot be bound to the target, and are
**outside** this binding; they are read as `init` reads them today.

**P1. One held directory, bound before resolution.** The invocation acquires one held handle to the
target directory (the directory a symlink target resolves to, resolved once by the operating system;
no canonicalisation contract, no reported path format) **before** eligibility is resolved. The
resolver's directory listing and its opens of `README.md` and `FROZEN.md` (it reads only those two,
in the root) are bound to that directory, and `init` uses the same directory for planning and for
every write. The repository that was checked is the repository that is written. If `init` cannot
reuse the resolver's handle (a separate process after an earlier `eligibility`), it acquires one
again and requires its identity to equal the one the resolver examined; a mismatch is the condition
`target-changed`. Checking identity and then writing by path is never a substitute for binding.

**P2. Every path component is bound.** Every component of every read and write path **within the
target directory** in `init` is bound to the held directory in the same way as the root: **no component is followed through a
symbolic link or junction**. A linked intermediate directory (for example `.github` or `artifacts`)
is refused, not traversed.

**P3. The leaf is bound.** The final entry of every path within the target is also bound: no link is followed, a
special file (FIFO, device, any non-regular file) is **never opened with an open that blocks or has
an effect**, including one that was a regular file at classification and was replaced afterwards,
and creation or overwrite cannot be redirected through a link. A rename used to place a file does
not replace a link at its destination: a link at the destination is **refused, not replaced**.

**P4. Designation matters.** Artifacts are designated in `scripts/init.mjs` (`ARTIFACTS`):
**directory artifacts** `artifacts/project-plan-breakdown/` and `artifacts/adr/`; **file artifacts**
`project-policy.yml`, `PROJECT.md`, `AGENTS.md`, `CLAUDE.md` and
`.github/copilot-instructions.md`. A directory artifact that is present as a real directory is
**preserved**, and one that is absent is **created**, as today (including the existing alternative
locations that already satisfy it); both are bound component-wise (P2). A directory found where a
**file** artifact is expected is refused. A link at any artifact path, or a non-directory at a
directory artifact's path, is refused.

**P5. Refusal is before the first write.** Every artifact path is classified, bound as above,
**before the first write**, and every refusal in the table below is a pre-write refusal: `init` exits
`2`, writes nothing, and leaves the tree unchanged. Conditions use the existing vocabulary
(`not-regular-file` for a link, special file or wrong-kind entry; `unreadable` where an entry
cannot be opened safely; `target-changed` where an identity moved). The one name added for `init`'s
file safety is `entry-changed`, used only for the post-write class in P6.

| Entry at an artifact path | File artifact | Directory artifact |
| --- | --- | --- |
| absent | created, bound (P2, P3) | created, bound (P2) |
| regular file | preserved as today; overwritten only with the existing `--force-overwrite=<path>`, under P3 | refused (`not-regular-file`) |
| real directory | refused (`not-regular-file`) | preserved |
| symlink or junction, to anywhere, with or without `--force-overwrite` | refused (`not-regular-file`); never followed | refused (`not-regular-file`); never followed |
| FIFO, device, other special file | refused (`not-regular-file`); never opened with a blocking or effectful open | refused (`not-regular-file`) |

**P6. The single post-write failure class, stated exactly.** An entry that **no longer matches the
classification made before the first write when it is written** is refused at write time. This
covers an entry that was absent and is **replaced by a link, a special file, a directory, or a newly
created regular file** by another process before the exclusive creation, and an entry that was a
regular file and is replaced by a link, special file or directory, **or is deleted**, before the
overwrite. A disappeared entry is refused with `entry-changed` and **nothing is created** in its
place: an overwrite or temp-plus-rename that could recreate the missing path must not. The
guarantee is the same for every raced-in kind: **that write is refused**; nothing is written through
a link, to a special file, over a directory, over a newly appeared file, or outside the checked
directory; no later write is made; and `init` exits `2` naming the condition **`entry-changed`**.
`entry-changed` means "an artifact entry no longer matches the classification made before the first
write when it is written". It is used for **every** raced-in kind in this class, because a newly
appeared regular file is neither `not-regular-file` nor `unreadable` and a single truthful name is
simpler than a per-kind choice; `not-regular-file` stays the name for the **pre-write**
classification of links, special files and directories (P5). `entry-changed` is a post-write class,
**not** an `INDETERMINATE` condition, is not overridable, exits `2`, and, like every condition name,
is not part of the frozen surface. Artifacts already written before the race went to the checked
directory and **remain**; this record chooses that narrowest honest wording rather than requiring
rollback or transactional placement, and says so. This is the only way `init` exits `2` after a
first write for a reason in this section; it is not a state, it is an ordinary write failure of the
kind `init` already has, and it does not weaken P5 for any condition in the table.

**P7. Windows is required, and failure is closed.** Every property above applies on every supported
platform. **Windows is required in 3.0.0** (see the platform requirement). Where the platform or
runtime cannot provide the binding for an entry in a given run, `init` does not write: it refuses
with exit `2`, naming `target-changed` where an identity mismatch was observed and `unreadable`
otherwise. This record does not prescribe the call and does not claim that a mechanism exists.

**Contract for refusals: every `INDETERMINATE` condition, `target-changed` included, is a
pre-write refusal** (P5): zero writes and an unchanged tree. The **only** exception is the single
race class in P6 (an entry that no longer matches its classification when written: replaced by a
link, special file or directory, deleted, or a newly created regular file), which is not an
`INDETERMINATE` condition: that write is refused, earlier artifacts already written remain, and no
later write is made. `target-changed` is raised only when the
identity of the directory held differs from the resolver's, which happens before the first write;
once the directory is held and verified there is no mid-apply `target-changed`. It is an
`INDETERMINATE` condition, is not overridable, and keeps this name exactly as introduced.

**Consequences, stated for the owner** (fail-closed behaviour under the MAJOR 3.0.0 classification,
not new product features): an `init` on a repository whose `.github`, `artifacts` or any
intermediate artifact directory is itself a symlink or junction, or whose file artifact is a link,
special file or directory, now **refuses** where it previously wrote through the link or reported
it as a conflict.

**Implementation guidance (non-normative; does not prescribe the call and claims no mechanism
exists).** Mechanisms that could satisfy the properties, none asserted available on any platform:
on POSIX, `openat`-style handle-relative operations with `O_NOFOLLOW`, with `O_NONBLOCK` and
`O_NOCTTY` on opens that could meet a FIFO or device and `fstat` on the same handle before any other
effect, `O_CREAT|O_EXCL` for creation, and an exclusive temporary file in the held directory renamed
with a no-replace rename or an identity-checked rename relative to the held handle; a device that is
not yet classified as regular is not opened for write until it has been classified through a handle
that cannot act on it. On Windows, handle-based native routes that open the directory and each entry
without following reparse points, handle-relative creation, or a staged write plus a rename relative
to the held handle. A mechanism that verifies a path or path component and then writes by path does
not qualify, because a rename or replacement after the check redirects later writes and verifying one
component cannot protect replaceable ancestors.

#### Human output, exit codes, and what is frozen (Q5 C, Q6 A)

**The frozen output surface is exactly two things, and nothing else:**

1. **The three state names**, spelled exactly: `IN_SCOPE`, `OUT_OF_SCOPE`, `INDETERMINATE`.
2. **The exit codes `0`, `1` and `2`, with these meanings** under
   [Standard 23](../../standards/23-standards-validator-cli.md) R3:

| Command and result | Exit | Meaning |
| --- | --- | --- |
| `eligibility`, `IN_SCOPE` | `0` | completed; nothing forbids adoption |
| `eligibility`, `OUT_OF_SCOPE` | `1` | completed; the repository declares itself not adoptable |
| `eligibility`, `INDETERMINATE` | `2` | the tool could not reach a verdict |
| `eligibility`, any invocation error (below) | `2` | invocation error |
| `init`, refused because `OUT_OF_SCOPE` (not overridden) | `2` | refused before the first write; nothing written |
| `init`, refused because `INDETERMINATE` | `2` | refused before the first write; nothing written (the P6 race class is the one exception and is not an `INDETERMINATE` condition) |

The two commands differ on purpose and the difference is part of the frozen meaning:
`eligibility` reports an `OUT_OF_SCOPE` repository as exit `1` (a completed verdict), whereas `init`
refuses an `OUT_OF_SCOPE` repository with exit `2`, because for `init` a refusal is "could not run",
and exit `1` is already `init`'s existing meaning of "ran, with conflicts". All other `init` exit
codes keep their existing meanings, unchanged by this record. Only `eligibility` exit `0` permits
proceeding, so every uncertain path fails closed.

**Not frozen, explicitly:** JSON property names, nesting, ordering, optional fields, the shape of
any evidence, and every other serialisation detail; report layout, line ordering, wording and where
a report is printed (console wording and layout are on
[ADR 0004](0004-audit-and-validate-are-separate-commands.md)'s "explicitly not frozen" list); and
**flag spellings and the invocation grammar, which this record itself does not freeze** (ADR 0004's
lists do not address them, and this record does not claim otherwise). Under this record they may
change in a `MINOR` release. Nothing about flag spellings or the invocation grammar is added to the
frozen surface by being described in this record.

**The complete machine-readable (JSON) contract is deferred** to a later, separately approved ADR
and work item. This record specifies and freezes no part of it. In this first version `eligibility`
writes human text, and `1` and `2` are told apart by the human report or by which command was run; a
caller that needs only to proceed or stop uses the exit code. **`eligibility --json` is rejected**
(owner-confirmed): until a separate machine-format ADR exists it is an unknown flag, exits `2`,
writes its diagnostic to stderr and emits no stdout, and human prose is never emitted under a flag
named `--json`. Adding it later therefore does not collide with a meaning an earlier release gave
it. Material from review of an earlier draft is preserved in the appendix as input to that ADR, and
is not normative.

#### The frozen-surface interpretation (Q6 A) and the version classification

[ADR 0004](0004-audit-and-validate-are-separate-commands.md) freezes "CLI command names and their
high-level semantics" and "exit-code meanings", and makes any change to the frozen list a `MAJOR`
release. This record interprets that as follows:

- **Adding `eligibility` alone is additive.** [Standard 21](../../standards/21-versioning.md) R2
  classes "new backward-compatible rule or capability" as `MINOR`, and D5 binds no rule, so the
  subcommand by itself would be a `MINOR` change.
- **`init` refusing a repository it previously bootstrapped is not additive.** `runInit` has no
  eligibility check today: it bootstraps or converges regardless of repository status, and ADR 0004
  freezes `init`'s high-level semantics. Making `init` exit `2` and write nothing for a target that
  previously succeeded changes an existing frozen command's semantics, and an already-adopted
  repository or existing automation can carry a listed signal. There is no "undefined case" to rely
  on. The earlier wording that this was a case with no defined behaviour is withdrawn.
- **Classification (owner, 2026-10-12T17:51:57Z): the complete ST-06 change requires `MAJOR`.** The
  owner kept the approved rule that `init` refuses a frozen repository (Q2 A) and classified the
  change as `MAJOR`, version **3.0.0**, under ADR 0004 and Standard 21. This is a compatibility
  classification only. **This record does not authorise changing `VERSION`, creating, moving or
  publishing a tag, or making a release;** each is a separate owner act.
- The frozen items remain the **existing** commands' names, high-level semantics and exit-code
  meanings; the `init` refusal is the one change to them, and it is why the classification is
  `MAJOR`. `audit` and `validate` are unchanged.
- The addition creates **new frozen surface**: once released, the command name `eligibility`, the
  three state names, and the exit codes `0`, `1` and `2` with the meanings in the table above are
  frozen in the ADR 0004 sense, and changing any is `MAJOR`. Nothing else is frozen **by this
  record**: it does not freeze flag spellings or the invocation grammar, and report layout,
  diagnostic text and every JSON detail are not frozen either; under this record they may change in
  a `MINOR` release. This is a statement of this record and does not rely on ADR 0004's lists.
- `eligibility` is neither an `audit` nor a `validate`. It produces no finding, score, assurance or
  compliance status, so ADR 0004's "never letting `audit` grow a compliance verdict" is not engaged.
- Honest precedent note: `init` is listed in the 1.0.0 surface itself in the changelog, so this
  repository has **no** precedent of a `standards` subcommand added after a release. The reading
  rests on Standard 21 R2, not on a prior case.
- This record releases nothing. `VERSION`, `CHANGELOG.md`, any tag and any release belong to later
  work and to separate owner acts.

#### Invocation errors (human diagnostics, exit `2`)

`eligibility` does not reuse the lenient `parseArgs` of `audit` and `validate`, which takes the first
non-flag token and ignores unknown flags: silently accepting one of several paths, or ignoring a
flag, is the unsafe direction here. The conditions below are named so tests can assert them; the
diagnostic wording is not frozen. After the subcommand name the accepted tokens are exactly:

| Token | Rule | Violation (condition) |
| --- | --- | --- |
| `<dir>` (a token not starting with `-`) | at most one; none means the current working directory, as for `audit`; an empty string is a path that does not exist | two or more: `wrong-argument-count` |
| `--override-signal=<id>` | `<id>` non-empty and one of the vocabulary ids; repeatable; duplicates collapsed | no `=`, or an empty id: `missing-flag-value`; an id not in the vocabulary: `unknown-signal-id` |
| `--help` / `-h` | prints usage to stdout, exit `0`, and wins over every other token | none |
| anything else beginning with `-`, including `--json` (owner-confirmed: no stdout, diagnostic on stderr), `--dir=...`, `--strict`, `--max-total-read-bytes=...`, `--`, and a value given as a separate token (`--override-signal frozen-file`) | not accepted | `unknown-flag` (a separate-token value is `missing-flag-value` first, since the flag has no `=`) |

Evaluation is order-independent and reports exactly one error, chosen by fixed precedence and,
within one class, by the first offending token: `unknown-flag`, `missing-flag-value`,
`unknown-signal-id`, `wrong-argument-count`, then the target checks. No directory is examined when an
argument error exists. Target checks: a path that does not exist (including a dangling symlink) is
`no-such-directory`; a path that exists but is not a directory, including a symlink to a regular file,
is `not-a-directory`; a directory whose entries cannot be listed completely is **not** an invocation
error, it is `INDETERMINATE` (`listing-incomplete`). Any other fault is `internal-error`, and a
caller that sees it treats the repository as not eligible. Diagnostics go to stderr; exit is `2`.

### D4 — This record precedes implementation

The order is fixed: this ADR; then the resolver, vocabulary and overrides; then the wording
surfaces. Each lands as its own reviewed change.

### D5 — Standard 22 step 0, without a catalog rule

[Standard 22](../../standards/22-adoption-and-migration.md) R1's migration flow gains a **step 0**:
establish adoption eligibility before any adoption write, by running `standards eligibility` against
the candidate repository and stopping on anything but `IN_SCOPE`. It is mirrored in
[`INSTRUCTIONS.md`](../../INSTRUCTIONS.md) and in
[`docs/adoption-flow.mmd`](../../docs/adoption-flow.mmd) (with its rendered SVG, per
[ADR 0003](0003-mermaid-is-the-canonical-diagram-source.md)), ahead of `/codebase-docs`, the step that
did the damage. The step is added outside the R1 block the standard reproduces verbatim from its
source.

**No catalog rule is bound.** Eligibility is a precondition of adopting, not a property of an adopted
project; there is no project for a rule to apply to until the answer is yes. The implementation pull
requests MUST carry, as a test, that the rule catalog is byte-identical and that `validate` output
for every existing fixture is unchanged.

## Implementation slicing

Each is its own pull request, now that this record is `Accepted`. None changes `audit` or `validate`;
slice 2 changes the frozen semantics of `init`, which is why the complete change is classified
`MAJOR` (3.0.0, the owner's classification above). No slice authorises a `VERSION` change, tag or
release.

1. **Resolver and `eligibility` subcommand with fixtures.** `scripts/standards.mjs` (`COMMANDS`,
   usage naming every accepted flag, dispatch before the scan like `init`), a new module holding no
   module-level run state ([ADR 0014](0014-run-state-is-owned-by-an-invocation-not-recognised-by-a-table.md)),
   `test/`. The vocabulary and the override semantics may be folded in.
2. **`init` consults the resolver** (Q2 A). `scripts/init.mjs` / `runInit`; overlaps slice 1 in
   `scripts/standards.mjs`.
3. **Wording surfaces.** Standard 22 step 0, `INSTRUCTIONS.md`, `docs/adoption-flow.mmd` and SVG,
   `CHANGELOG.md` (Unreleased), with the no-catalog-rule test. Depends on slice 1 for the name.

## Required tests

Exit-code and human-output tests only; **there are no JSON-schema tests** (Q5 C).

- **AC1.** A fixture with implementation files, a `FROZEN.md` carrying a listed phrase and no
  adoption artifacts: `eligibility` exits `1`; and for `init` and `init --dry-run`, exit `2`. A
  before/after tree comparison (file list and content hashes) shows zero writes.
- **AC2.** Each `INDETERMINATE` condition above, `target-changed` included, exits `2`, writes
  nothing (tree unchanged), and is not cleared by `--override-signal`, for `eligibility` and for
  `init`. There is no INDETERMINATE condition that is a post-write refusal. The single post-write
  class is the P6 race (an entry that no longer matches its classification when written), which is
  tested separately for **every** raced-in kind (link, FIFO, device, directory, newly created
  regular file, deletion) with the same assertions (that write refused, earlier artifacts remain, no later
  write, exit `2`) and is not an `INDETERMINATE` condition.
- **A readable `FROZEN.md` with no listed phrase is never `IN_SCOPE`.** An empty file, a
  whitespace-only file, a file of other prose, and a file whose phrase is broken by U+00A0, each with
  no other signal: `INDETERMINATE` (`no-listed-phrase`), exit `2`, `init` refuses with exit `2`. The
  same file beside a `README.md` that carries the banner is also `INDETERMINATE`, not
  `OUT_OF_SCOPE` (precedence), and `--override-signal=readme-frozen-banner` leaves it
  `INDETERMINATE`.
- **AC3.** No repository name appears in the implementation or vocabulary data (a test greps the new
  source for `StandardsOrchestrator`); a differently named fixture with the same signal is
  `OUT_OF_SCOPE`.
- **AC4.** The greenfield, scaffold, nested-monorepo and reconstruction-required fixtures classify
  and write exactly as before; eligible fixtures are `IN_SCOPE`, exit `0`.
- **`init` output on refusal and on success.** For a repository with a fired signal and for one with
  an indeterminate condition, each of `init`, `init --dry-run`, `init --json` and
  `init --dry-run --json`: exit `2`, stdout byte-empty, stderr non-empty and naming the signal or
  condition, tree unchanged. For an `IN_SCOPE` fixture, the stdout of `init --json` and
  `init --dry-run --json` is byte-identical to the output of the same invocation on the base
  commit (no added key), and a before/after comparison confirms the existing write behaviour.
- **Overrides.** Rules 1-6: a named fired signal clears only itself; an unused override is reported;
  an override never changes `INDETERMINATE`; an unknown id exits `2`; duplicates collapse.
- **Both spellings, two layers.** A directory holding `FROZEN.md` and `frozen.md` cannot exist on a
  case-insensitive volume. (1) *Injected listing, every platform, not skippable:* the enumeration
  and collision logic takes its listing, `lstat` and reads through an injected interface and is
  tested with a mocked listing: benign `frozen.md` beside a firing `FROZEN.md`; benign `README.md`
  beside a bannered `Readme.md`; a benign sibling beside an unreadable one; each in both orders;
  asserting `OUT_OF_SCOPE` or `INDETERMINATE`, never `IN_SCOPE`. (2) *Real filesystem, only where it
  can exist:* the on-disk fixture runs only after a case-sensitivity probe, and is otherwise an
  explicit reported skip naming that reason, never a pass.
- **Permission, link and mode conditions** (`unreadable`, `stat-failed`, `not-regular-file` for
  every link kind, `over-read-cap`, `not-utf8`, an incomplete listing) go through the injected
  interface on every platform. Real `chmod 000` and real-symlink tests are separate and
  capability-probed (a denial is actually observed; the platform can create the link), with an
  explicit reported skip otherwise.
- **File safety on every supported platform, Windows included.** A named pipe, a device node and a
  link named `README.md` or `FROZEN.md` are never opened as regular files, and the call neither
  blocks nor acts on them (asserted with an injected open that fails the test if it receives a
  blocking or link-following request). Real-filesystem variants run on Windows and POSIX, each
  behind a capability probe that reports an explicit skip naming the reason when the platform
  cannot create the object; the injected variants are not skippable. **A release gate that cannot
  be satisfied by skipping:** the 3.0.0 release run must contain at least one **non-skipped** real
  Windows test that creates a symbolic link or a reparse point (for example a symlink created
  under developer mode or an elevated runner, or a directory junction) named `README.md` or
  `FROZEN.md` and shows it is not opened as a regular file. A CI account that cannot create such an
  object must be provisioned so that it can, or the gate fails; it never passes by skipping. This
  record states the requirement and does not claim that such a runner exists.
- **Real-filesystem Windows `init` gate, not satisfiable by injection or skipping.** All the
  directory-component and leaf `init` cases above are injected, and an injected suite can pass while
  the native Windows handle, reparse-point or rename wiring is broken. The 3.0.0 release run must
  therefore contain at least one **non-skipped, real-filesystem Windows `init` test** that exercises
  the platform-specific binding path: (a) a pre-existing **linked intermediate directory**
  (`.github` or `artifacts` as a symlink or junction) and (b) a pre-existing **leaf link** at a file
  artifact path (also with `--force-overwrite`), each asserting exit `2`, nothing written, and the
  link target unchanged, plus an ordinary run that preserves a real directory artifact. A runner that
  cannot create the objects must be provisioned, or the gate fails. This is a requirement of this
  record; it does not claim that such a test or runner exists.
- **Real-filesystem Windows replacement-race gate.** Links that exist before `init` starts are not
  enough: an implementation could reject them during preclassification and still do a path-based
  create or overwrite later, and one leaf-write path is not enough either. The 3.0.0 release run must
  also contain **non-skipped, synchronized, real-filesystem Windows `init` tests** for **both**
  initial classifications and for the intermediate component: (a) an **absent** leaf artifact
  replaced, between classification and the exclusive creation, by a **link**, and separately by a
  **newly created regular file**; (b) an **existing regular** leaf artifact replaced by a **link**, and
  separately **deleted**, between classification and the `--force-overwrite` overwrite; and (c) an **intermediate
  directory** replaced by a **junction** between the check and the write. Each asserts that nothing
  lands through the link or junction or over the newly appeared file, the target of the link is
  unchanged, and `init` exits `2` naming `entry-changed` with the P6 guarantees (earlier artifacts
  remain, no later write). The implementation's test surface must provide a seam (a hook at the
  classification-to-write boundary) to synchronise the replacement deterministically; that seam is
  part of what the implementation delivers. This is a requirement of this record; it does not claim
  that such a seam, test or runner exists.
- **Directory identity bound through `init`.** Injected, each asserting exit `2`, **zero writes and
  an unchanged tree**, and `target-changed` where an identity mismatch was observed: the target's
  identity differs between the resolver's handle and a handle `init` acquires again; and the
  platform reports that no
  atomic binding is available (refusal `unreadable`, no write, and a check-then-write-by-path
  implementation must fail this test). Also injected, asserting the writes all land in the held
  directory and none in the retargeted one, with the normal exit: the path is retargeted **after**
  the handle is held and verified, during `planInit`, between writes, and transiently with
  restoration before any later check. **Retargeting during resolution, injected:** the path is
  retargeted (to a frozen directory B and back) **during the resolver's directory listing**, **between
  the listing and the opening of a signal file**, and **between the resolver and the identity
  comparison**; in every case the resolver examines only the directory its handle is bound to, the
  entries and signal files it reads all come from that directory, and `init` writes only that
  directory, or refuses `target-changed` with zero writes; it never approves directory A on
  evidence from B or writes B on A's result. A mutation check replaces the handle-relative listing
  and handle-relative source opens with path-based ones, replaces the held-handle write with a
  path-based write, and replaces it with "verify then write by path", and requires these tests to
  fail on each. A matching test confirms there is no post-write `target-changed`.
- **Component-wise traversal, injected:** (a) a pre-existing linked intermediate directory
  (`.github` or `artifacts` is a symlink or junction, to a directory outside the target and to a
  directory inside it): `init` exits `2`, writes nothing, and nothing lands outside the target;
  (b) an intermediate directory that is a regular directory when checked and is replaced by a link
  **between the check and the write** (and, separately, between creating the intermediate directory
  and writing into it): the write is refused or lands in the held component, never outside; (c) the
  same for a deeper component (`artifacts/project-plan-breakdown/`). A mutation check replaces
  component-wise no-follow traversal with a single path-based write relative to the root, and with
  `mkdir -p`-style path creation, and requires these tests to fail on each.
- **Leaf artifact entries, injected:** (a) a pre-existing leaf symlink to a file **inside** and to a
  file **outside** the target, each with and without `--force-overwrite=<path>`: exit `2`, nothing
  written, the link target unchanged; (b) an absent file artifact replaced by a symlink **between
  planning and creation**, and an existing regular file artifact replaced by a symlink **and,
  separately, by a FIFO and by a device node**, between classification and overwrite: the write is
  refused, nothing lands through the link, and the FIFO or device is **never opened with a blocking
  or effectful open**; **an absent artifact that another process creates as a regular file before
  the exclusive creation** is refused with nothing overwritten; the P6 guarantees hold for each
  (earlier artifacts remain, no later write, exit `2`, condition `entry-changed`);
  (c) a directory at a file artifact's path (exit `2`, nothing written); (d) **the directory
  artifacts `artifacts/project-plan-breakdown/` and `artifacts/adr/` present as real directories are
  preserved**, and a repeat run on an eligible fixture behaves exactly as before (AC4), while a link
  at either path is refused; (e) the table above, one case per cell. A temp-plus-rename placement
  is tested with a link at the destination, which must be refused and not replaced. **Disappearance,
  injected:** a file artifact that is a regular file at classification and is **deleted** between
  classification and the `--force-overwrite` overwrite is refused with `entry-changed`, the path is
  not recreated, earlier artifacts remain and no later write is made, exit `2`. Mutation checks
  include letting the overwrite, or the temp-plus-rename, recreate a missing destination, and
  replace the exclusive no-follow create with a plain create, the no-follow open with a following
  open, the same-handle classification with a path-based check, the no-replace or identity-checked
  rename with a replacing rename, and the non-blocking classification with a plain open, and require
  these tests to fail on each.
- **Capped read.** Injected: a matching file that is within the cap when classified and **grows
  past the cap before or during the read** is `INDETERMINATE` (`over-read-cap`) and no more than
  cap-plus-one bytes are requested or retained; a file of exactly the cap is read in full. A
  mutation check replaces the capped read with a size check followed by an unbounded read and
  requires the test to fail.
- **Replacement race.** Through the injected interface, on every platform: a regular `README.md` or
  `FROZEN.md` that `lstat` reports as a regular file and that is replaced by a link (to a file
  outside the target carrying the banner or a listed phrase, and to a benign file) before the read
  is `INDETERMINATE` (`not-regular-file`), and the outside content is never read or used; and, with
  the safe-open capability reported as unavailable for the run, the entry is never opened as a
  regular file and is `INDETERMINATE` (`unreadable`). A mutation check replaces the no-follow open, and then the
  same-handle read, with a path-based read in turn, and requires this test to fail on each.
- **Partial listing.** A listing that yields `README.md` with the banner and then fails: exit `2`,
  the banner still reported as fired, no override changes it; and a failure before any entry: exit
  `2`.
- **Text rules, over file bytes.** A README whose first line is only U+00A0 and whose second line is
  `> **⛔ FROZEN` fires; a `# Title`, blank line, banner on line 3 fires (the evidenced shape); a `>`
  followed by U+00A0 before `⛔` does not; a leading U+FEFF fires and a later one does not; CRLF and
  lone-CR endings; a `FROZEN.md` with U+00A0 inside `do not extend it` is `no-listed-phrase`
  (`INDETERMINATE`); the same phrase with tabs and newlines between words matches; an upper-case
  dotted `İ` in the phrase does not match and no locale changes the result.
- **`--json` and no walk-up.** `eligibility <dir> --json` (and `--json` in any position): exit `2`,
  stdout byte-empty, a non-empty stderr diagnostic, target not read. `eligibility <subdir>` and
  `init <subdir>` inside a repository whose root carries a `FROZEN.md` with a listed phrase are
  judged on the subdirectory only: the ancestor marker is not consulted (`IN_SCOPE`, `init`
  proceeds). With no target, the current working directory is evaluated and no walk-up occurs. A
  directory symlink as the target is evaluated as the directory it resolves to.
- **Invocation errors, one test per condition,** each asserting exit `2` and that the target was not
  read: two `<dir>` tokens; `--bogus`, `--json`, `--dir=x`, `--strict`, `--max-total-read-bytes=1`
  and bare `--` (`unknown-flag`); `--override-signal`, `--override-signal=` and
  `--override-signal frozen-file` (`missing-flag-value`); `--override-signal=nope`
  (`unknown-signal-id`); a nonexistent target; a regular file and a symlink to one; two simultaneous
  errors pinning the precedence; repeated identical `--override-signal` (accepted); `--help` (exit
  `0`).
- **Read-only, process-free and network-free, by instrumentation.** A final-tree comparison cannot
  show these properties (an implementation could open a file for writing without changing its bytes,
  spawn a process, or make a network call and leave the tree identical), so the harness **injects or
  intercepts** the three interfaces and asserts none was called: (1) every filesystem call that
  writes, creates, removes, renames, truncates or opens with a write or append flag, and any
  `chmod`/`utimes`-style metadata change; (2) every child-process spawn, exec and fork; (3) every
  network, socket and name-resolution entry point. The same assertion holds for `eligibility` on every
  outcome and for the `init` refusal paths (refusal happens before `planInit` and `applyInit`, so
  none of the three is touched). A before/after tree snapshot (file list and content hashes) is kept as
  a **secondary** check only. A mutation check adds a write-mode `open`, a spawn and a network call
  in turn and requires the instrumentation, not the snapshot, to fail on each.
- **No catalog rule.** `rules/*.json` is byte-identical and `validate` output for every existing
  fixture is unchanged.
- **Mutation checks.** Removing the read-all rule, the INDETERMINATE override block, the ASCII
  case-fold, or the `init` refusal each makes at least one test fail.

## Alternatives considered

**A guard inside `init` only.** Rejected as the sole control: the recorded mutation happened at
`/codebase-docs`, before `init`. `init` also consults the resolver (Q2 A) so a caller who skips
step 0 is still stopped.

**A catalog rule `adoption.eligible`.** Rejected by D5. A rule is evaluated against an adopted
project, and the case this exists for is the repository that must not become one.

**Delegating eligibility to an external registry.** Rejected. The question arises before adoption,
and an answer that needs a separate enforcement repository is unavailable exactly when needed.

**Open-ended detection (prose heuristics, keyword search of the README).** Rejected by D1. A
heuristic that can fire on discussion of frozen repositories is the use/mention error
[ADR 0009](0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md) records, and
one that fails to fire is silent. A closed list is incomplete in a way that can be stated.

**A fourth exit code for `INDETERMINATE`.** Rejected. Exit-code meanings are frozen by ADR 0004 and
Standard 23 R3 closes the set; `2` already means "no verdict".

**Freezing a JSON document now (Q5 A or B).** Rejected by Q5 C. The review of the first draft showed
that a machine contract needs many derivations pinned (path canonicalisation, ordering, error
enumerations, partial results), and it has no consumer yet; freezing it before a consumer exists
makes the first shape a public contract without its own review. It is deferred.

**An override persisted in the target repository, or an owner-level store, or no override.**
Rejected by Q3 A. A file in the repository is a write into the repository the guard protects, and an
agent can create it as easily as pass a flag; an owner-level store is new state to govern; no
override leaves no sanctioned way to adopt a repository with an out-of-date banner.

## Consequences

**Makes easier.** One read-only command answers "may I write to this repository" before any write,
with an answer that fails closed; and `init` refuses on its own. The owner can allow a specific
repository by naming exactly what is overridden.

**Makes harder.** A `MAJOR` classification (3.0.0) because `init` now refuses a repository it previously bootstrapped, so existing automation that ran `init` against a repository carrying a listed signal sees exit `2`. A new frozen surface (the name, three states and exit codes). A closed vocabulary
will miss a repository frozen in a way it does not list, and growing it is a reviewed change. A
repository whose `README.md` is a symlink, or whose `FROZEN.md` is hand-written without a listed
phrase, cannot be adopted until the owner changes it.

**Commits the project to.** Keeping `INDETERMINATE` un-overridable; never naming a repository in the
implementation (acceptance criterion 3 of #16); treating the vocabulary and text rules in this record
as the specification the fixtures derive from; and writing the machine-readable contract as its own
ADR before any consumer depends on one.

**Known limits accepted.**

- The tool cannot prove an override was typed by a human (D2 rule 7).
- `IN_SCOPE` is "no listed signal", not "adoptable" (D1).
- A banner using `_` emphasis, a variation selector, or a leading no-break space does not fire.
- The first version has no machine-readable output; callers use the exit code.
- `init <subdir>` does not see a freeze marker at an ancestor repository root (confirmation 4).
- This record freezes no flag spelling and no part of the invocation grammar (confirmation 2).

## Appendix: deferred machine-readable contract (non-normative)

Nothing in this appendix is a requirement. It records input for the later ADR so the work done in
review is not lost. An earlier draft of a machine-readable document was reviewed in this PR; the
last commit that carries it is `fda1b98` (parent `69abd34`). Nothing in it is normative or implied
by this record: every property name, nesting, ordering, optional field, evidence shape and
serialisation detail is open for the later ADR.

Questions a later ADR must settle before freezing any such document:

- the whole document: its envelope, versioning, success and error shapes, with a complete worked example;
- whether the target is reported canonically (`realpath`) or lexically, with separator and case
  rules on Windows;
- the closed set of per-entry reasons and of error codes, including `stat-failed`,
  `not-a-directory`, `missing-flag-value`, `wrong-argument-count`, `listing-incomplete`;
- ordering of every array and the serialisation rules;
- how partial results are represented when a listing fails after yielding entries;
- how an unused override is represented.

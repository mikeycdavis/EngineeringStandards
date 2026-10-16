# 0021 — Adoption file safety is observed at a point in time and written check-then-write

- **Status:** Proposed. It carries the owner's decision of **2026-10-15T17:17Z** (option C, recorded
  on PR #105): no exception to the zero-findings rule is granted, and the properties of ADR 0016
  that promise handle-bound behaviour Node cannot provide are withdrawn by a successor ADR. It takes
  effect when the owner accepts it. Until then ADR 0016's wording stands as written and this record
  states what replaces it. **On acceptance** ADR 0016's status becomes "Accepted; superseded in part by
  0021" (a partial supersession is outside R5's five names and is stated in words). Numbers 0017, 0018
  and 0020 are used on other branches of this repository; 0021 is the next number above every number
  used on any branch at the time of writing, and numbers are never reused (R4).
- **Date:** 2026-10-15
- **Deciders:** Project owner (decision above)
- **Supersedes, in part:** [ADR 0016](0016-adoption-eligibility-is-resolved-before-any-adoption-write.md)
  — **only** the guarantees named in "What is superseded" below. Everything else in ADR 0016,
  including the decision history and its dated amendments, stands unchanged.
- **Tracks:** ST-06, [#16](https://github.com/mikeycdavis/EngineeringStandards/issues/16)
- **Related:** [ADR 0008](0008-detectors-do-not-assert-repository-state-they-have-not-measured.md),
  [Standard 11](../../standards/11-architecture-decision-records.md) R5,
  [Standard 23](../../standards/23-standards-validator-cli.md),
  [Standard 52](../../standards/52-concurrency-and-shared-state.md),
  [Standard 53](../../standards/53-ai-engineering-honesty.md)

This record is written **before implementation**. Nothing it describes exists in code yet; every
statement under "Decision" is a commitment for the implementation pull requests, not a description of
current behaviour.

## Context

ADR 0016 (amended 2026-10-14) requires that the repository which `eligibility` checked is the
repository `init` writes, **by binding**: a held directory handle (P1), every path component bound to
it (P2), the leaf bound (P3), and an overwrite or creation **bound to the directory entry** so that a
replaced entry is refused (P6), on every supported platform including Windows (P7).

That is not achievable in this repository. The implementation language is Node.js with no third-party
dependency (ADR 0016 itself requires the primitive to be "reachable within the repository's
zero-third-party-dependency decision"). Node exposes path-based calls (`lstat`, `open`, `mkdir`,
`rename`) and file-descriptor calls on an already-open file (`fstat`, `read`, `write`). It exposes **no**
`openat`-style call that opens or creates an entry relative to a directory descriptor, no no-follow open
of an intermediate path component, and no atomic rename that verifies the identity of the entry it
replaces. A directory descriptor cannot be used to write; a "held handle" held in Node is a descriptor
that no write operation can be addressed through. Every write is addressed by path, and a path is
resolved again by the operating system at the time of each call.

Review of PR #105 found this repeatedly: about thirteen consecutive time-of-check/time-of-use
findings between 2026-10-12 and 2026-10-14, each repair narrowing a window and exposing the next layer
of the same class. The two open findings on head `cddf290` are instances:

- **4273671894** — the final pass compared only entry names, so a benign `README.md` replaced
  atomically by a bannered file of the same name after its post-read check and before re-enumeration
  left the multiset of names unchanged.
- **4273671903** — an absent `.github` or `artifacts` component created as a link or junction before
  `init` creates it was exercised by no prescribed test.

Both are answered below by correcting what the contract promises, not by recording a limitation: the
contract no longer says that an entry cannot change, only what is observed, when, and what is done
when a change is observed.

The owner's decision rules out the two other routes. An **exception to the zero-findings rule** is not
granted, and a **follow-up that requires a native handle-relative primitive** is not taken (it would
conflict with the zero-dependency Node implementation). The route that satisfies Standard 11 R5 is a
**successor ADR**: ADR 0016 is not rewritten and is not withdrawn as a whole.

## What is superseded

The following are **superseded by this record, and nothing else in ADR 0016 is**. Where ADR 0016's
text and this record differ on a row below, this record governs **from its acceptance**. **General reading rule:** where
"bound", "held", "race-safe", "atomic" or "cannot" appears in ADR 0016 in connection with a path
entry, directory component, file handle or write, read it as the observation named by the
guarantee here that replaces it (G1-G10); no word of ADR 0016 promises more than that.

| ADR 0016 location | What it promised | Disposition |
| --- | --- | --- |
| P1 — "One held directory, bound before resolution", sentences saying the listing and opens are "bound to that directory", `init` "uses the same directory for ... every write", and "Checking identity and then writing by path is never a substitute for binding" | a held handle through which listing, opens and writes are bound | **Superseded.** Replaced by G5 (target identity observed) and G7 (re-observation before each write). `target-changed` keeps its name and its place as a condition; its trigger is restated in G5. |
| P2 — "Every path component is bound", including "the identity of the component handle must equal the identity of the directory entry the write is bound to" and "the retained handle is never written through" | component-wise handle binding | **Superseded.** Replaced by G6 and G7. The refusal of a **linked** intermediate directory before the first write stands (G6). |
| P3 — "The leaf is bound" | no link followed, special file never opened, creation or overwrite "cannot be redirected through a link", a rename "does not replace a link at its destination" | **Superseded.** Replaced by G6, G7, G8 and G9. What survives is the pre-write refusal and the per-call create-if-absent behaviour; the unqualified "cannot be redirected" is withdrawn. |
| P6 — "entry binding", "atomic rename ... that **verifies the destination entry's identity**", "the retained handle", and the statement that the overwrite "must therefore be **bound to the directory entry**" | an entry-bound atomic overwrite | **Superseded.** Replaced by G7, G8 and G9. `entry-changed` and "earlier artifacts remain, no later write, exit `2`" stand, with the trigger restated in G7. |
| P7 — "every property above applies"; "Where the platform or runtime cannot provide the binding" | Windows required, fail closed | **Restated, not withdrawn.** Windows remains required and failure remains closed; the thing that must be available is the observation of G10, not a binding. |
| "No race between classification and read" — the paragraph requiring a no-follow open and saying "There is no identity-comparison fallback", and the "Platform requirement" example "opening the reparse point itself on Windows" | a no-follow open with classification from the same handle on every platform | **Superseded.** Replaced by G2. Where the platform provides a no-follow, non-blocking open flag it is used as a defence; the guarantee does not depend on it, because it is not available on Windows from Node. |
| "Read-time consistency and its limit", the words "through the same held handle", and the "Remaining limit" paragraph and the "Status" paragraph's "a clarification within the approved P3/P6 binding" and "documented known limit ... for the owner's acknowledgement" | re-enumeration through the held handle; a limit stated for acknowledgement | **Superseded.** The same-file stamp comparison and the multiset comparison **stand**, performed by path, and the final pass is extended (G4). The limit is not an acknowledged limitation: it is the definition of what the result asserts (see "What a result asserts"). |
| "Contract for refusals", the sentence "once the directory is held and verified there is no mid-apply `target-changed`" | no mid-apply `target-changed` | **Restated.** Still true, for a different reason: see G5 and G7 (a changed root observed at a later write is `entry-changed`). |
| "Platform requirement (normative ...)", first bullet: "by a race-safe method ... with classification and read taken from that same handle", and the first bullet's "opening the reparse point itself on Windows" example; the third bullet's "the entry changes under the read ... `unreadable`" (G3 names it `source-changed`) | race-safe no-follow open, same-handle classification | **Superseded** by G2 and G10. The requirement that every supported platform not read a link, pipe or device as a regular freeze-signal file **stands**; the method is the observation of G2. |
| D1 INDETERMINATE table, row `target-changed` ("during `init`, the target's directory identity differs from the one the resolver examined") | applies to `init` only | **Restated** by G5: it applies to `eligibility` and `init`, and the comparison is of `stat` observations. |
| AC2 table, `init` cell for `target-changed` ("when a re-acquired handle's identity differs") | handle re-acquisition | **Read as** "when the `stat` identity differs" (G5). |
| P4 and P5 text citing "bound component-wise (P2)", "created, bound (P2, P3)" and "under P3" | the cited properties | **Read as** G6-G9. The P5 table stands; its FIFO/device cells' "never opened with a blocking or effectful open" stands for an entry that is a FIFO or device **at classification**; for one raced in after classification G2 states exactly what is done (opened once, read-only, never read). |
| "Implementation guidance (non-normative)" | mechanisms assuming `openat`, handle-relative creation and rename | **Superseded.** Replaced by "Mechanism" below. |
| "Documented exception: overwrite does not share the inode", the words "race-safe" and "entry-bound", the clause "a temporary file created exclusively in the held directory, placed by an atomic rename that verifies the destination entry" (read as: created by a create-if-absent open in the artifact's parent directory and placed by a rename after a re-observation, G9), and the section "Why not in place" | the justification for the temporary-file-and-rename write | **The exception itself stands unchanged** (owner decision of 2026-10-14T13:34Z: a hard link keeps the old content; permission bits are preserved). Only the justification wording is superseded, and "permission bits are preserved" is read as the bits observed at G9 step 3; see G9. |
| "Required tests": every bullet listed in "Test disposition" below as superseded or replaced | tests asserting handle binding, and mutation checks that replace handle-relative calls with path-based ones | **Superseded** as listed. |
| The first amendment's list items 1, 5 and 8 and its "Replaced detail" paragraph, and the "Reading of Standard 11 R5" paragraph | the properties as approved on 2026-10-14 | **Left as the historical record.** They are not edited. Their effect is limited by this table. |

**Not superseded**, stated so a reader does not have to infer it: the three state names; the exit
codes `0`, `1`, `2` and their meanings; `eligibility --help` (usage on stdout, exit `2`); the 400,000
byte capped read and `over-read-cap`; the closed vocabulary, matching and text rules; overrides;
`INDETERMINATE` is not overridable; `eligibility --json` is rejected; no walk-up; P4 (designation of
directory and file artifacts); P5 (refusal before the first write) and its table; the post-write
class "earlier artifacts remain, no later write, exit `2`, no rollback"; `entry-changed` and
`target-changed` as condition names outside the frozen surface; MAJOR 3.0.0 classification; the one
documented hard-link exception; Windows required in 3.0.0 with real-filesystem, non-skippable release
tests; no `VERSION` change, tag or release is authorised by this record.

## Decision

### The contract in one paragraph

`eligibility` and `init` make **point-in-time observations** of the target and write **check-then-write**.
An observation is a single `stat`, `lstat`, `fstat`, directory listing or read, and what it reports is
true of that call only. The tool compares what it observes against what it observed earlier, **refuses
and fails closed whenever a comparison shows a difference or a comparison cannot be made**, and
otherwise proceeds. It does not exclude other writers, takes no lock, holds nothing that prevents a
change, and performs no handle-relative write. A change that happens between the last observation and
the operation that follows it is **not observed and is not claimed to be prevented**.

### Terms

- **Identity** of an entry: the pair of device and inode numbers as reported by `lstat` (or `stat` for
  the target directory) read as `bigint`, or the platform's file identifier where that is what
  Node reports. If identity cannot be established for an entry on a platform (the values are
  absent or all zero), the entry is not compared and the run fails closed (G10).
- **Classification (C0):** for every artifact path, an observation of each component from the target
  directory to the leaf (the target itself with `stat`, which follows a symlink given as the target;
  every other component with `lstat`), recording type (directory, regular file, symlink or junction, other) and
  identity, or absence (`ENOENT`); **for a regular source file C0 also records size, `mtime` and `ctime`**
  (where the platform provides them), which G4(b) compares at the final pass.
- **Re-observation (C1):** the same observations of each component of **one write's path**, taken
  **immediately before that write**, compared with the baseline on type, identity and absence. The
  baseline is C0, **updated for a component by `init`'s own successful creation of it**: immediately
  after a create-if-absent call (G8) succeeds, `init` takes `lstat` of the new entry, requires the
  expected type, and records its identity as that component's baseline; a mismatch at that `lstat` is
  `entry-changed`. A component `init` created is therefore not a difference at a later write; one
  swapped after that `lstat` is. **For a file that `init` creates and holds open (a new file artifact
  or a temporary file) the baseline is the identity of the open descriptor, taken with `fstat`, and the
  baseline `lstat` of the path must report that same identity**; a difference is `entry-changed`, so a
  replacement installed between the creation call and the baseline `lstat` is observed and the bytes
  written through the descriptor are never placed. For a directory created with
  `mkdir` there is no descriptor: a swap between the creation call and the `lstat` is observed only
  if it changes the type (or the `lstat` reports absence, `entry-changed`, or fails, `unreadable`), and
  is otherwise not observed. Where the platform reports no file identifier for the descriptor or the
  path (G10), the run fails closed.

### What a result asserts

An `IN_SCOPE` result asserts exactly this: each observation below was made by path, against the path
as the operating system resolved it **at that call**; the target `stat` at the end equalled the one at
the start; every entry whose name folds to a source name was classified as a regular file, read within
the cap from an open file whose identity matched its classification, and at the final pass showed the
identity, size and stamps it showed at classification; and no listed signal fired that was not overridden and none was
indeterminate. Observations are **not bound to one directory**: a target path that is retargeted and
restored between two observations is not observed, and what an intervening observation saw is not
claimed to be the directory the end observations saw. It asserts **nothing about any later time, and
nothing about a state that was changed and restored between two observations**. Equal stamps on a
filesystem with coarse timestamps do not distinguish two writes within one stamp interval; identity
is compared as well, and is also not a proof of sameness. This is not a limitation that was accepted; it is what the
word *observed* means, and no additional pass changes it: a further pass would again describe only
itself. A consumer that needs more must not take it from this tool.

### The guarantees

Each guarantee is one claim, with the observation it rests on, and has **exactly one test row** (one row may list several cases of that one claim) in the
table under "Required tests".

**G1 — Classification of source entries.** Every entry of the target directory whose ASCII-lowercased
name is a source name is classified by `lstat` on the entry itself. A directory, a symbolic link of any
kind or a junction, or any other entry that `lstat` does not report as a regular file is `INDETERMINATE` (`not-regular-file`) and is not
opened for content. (Unchanged from ADR 0016; restated because G2 depends on it.)

**G2 — Content is read only from the entry that was classified.** A source file classified as regular is
opened read-only, once, and `fstat` is taken on the open file and `lstat` is taken again on the entry
by path, both **before any byte is read**. The entry must still be reported as a regular file (not a
link) with the classified identity, and the open file must have the same identity. If the
opened file is not a regular file, or its identity differs from the classification, nothing is read
(an open that itself fails, such as `ELOOP`, `EISDIR` or `EACCES`, is `not-regular-file` where the
error says the entry is a link or directory and `unreadable` otherwise) and the result is `INDETERMINATE` (`not-regular-file` where the opened object is not a regular file,
`source-changed` where it is a regular file of another identity). A replacement link whose target is a different file is rejected before any byte is read, and so is a
link installed at the name that points back to the **same** file (the entry by path is then a link, so
the `lstat` rejects it). A change at the name after that `lstat` does not affect the already-open file: the bytes are read
from the original open file, the change is **not observed until G3's post-read `lstat`**, which makes
the result `INDETERMINATE` (`source-changed`), and those bytes are discarded. Where the platform provides no-follow, non-blocking and
no-controlling-terminal open flags (`O_NOFOLLOW`, `O_NONBLOCK`, `O_NOCTTY`) the open uses all of them;
on Windows, where Node provides none of these flags, the post-open `fstat`, the identity comparison and the pre-read `lstat` by path are
the whole mechanism and any entry that `lstat` does not report as a regular file is
`not-regular-file` (G1). **A platform that is not Windows and lacks `O_NONBLOCK` fails closed
(G10): the entry is not opened.** A FIFO or device that replaced the entry after classification may be
opened once, read-only, with those flags, and is closed without a read; one that is a FIFO or device
**at classification** is never opened (G1). **On POSIX as well, a device node raced in after
classification may have effects when opened even read-only and non-blocking; the flags reduce but do
not remove that, and this record does not claim to prevent it.** **On Windows a replacement installed after classification is opened by a plain open before the post-open comparison rejects it; that open may have the effects of opening whatever the replacement is, and this record does not claim to prevent it.**

**G3 — Stability during the read.** The `fstat` of the open file taken after the read must equal the one
taken before it in size, `mtime` and `ctime` (where the platform provides them) and identity;
otherwise `INDETERMINATE` (`source-changed`). After the read, `lstat` of the entry by path must still
report the classified type and identity, otherwise `INDETERMINATE` (`source-changed`; an `lstat`
reporting the entry missing is `source-changed`, any other error `stat-failed`). This post-read check
runs before the final pass of G4 and takes precedence over it for the same entry. (Unchanged from
ADR 0016.)

**G4 — The final pass.** After every source has been read, the resolver makes one final pass over the
target directory by path: (a) re-enumerates the directory and requires the multiset of exact matching
entry names to equal the first enumeration's (`listing-changed` otherwise; unchanged from ADR 0016
apart from being by path); and (b) takes `lstat` of **each source entry** and requires its type,
identity, size, `mtime` and `ctime` to equal what classification recorded: a difference is
`INDETERMINATE` (`source-changed`), and an `lstat` that reports the entry missing is
`INDETERMINATE` (`source-changed`) and any other `lstat` error is `INDETERMINATE` (`stat-failed`).
Part (b) is what answers review finding **4273671894**: a same-name replacement installed before the
final pass is **observed** by identity and refused. A replacement installed **after** the final pass is
outside what the result asserts (see "What a result asserts"); the contract does not say otherwise and
the finding's scenario ceases to be a violation of anything the contract promises.

**G5 — Target identity.** `stat` of the target path (which follows a symlink given as the target, as
ADR 0016 requires) is taken before the first enumeration and again after the final pass; a difference is
`INDETERMINATE` (`target-changed`). `init` additionally takes `stat` of the target **immediately
before its first write** and requires the identity to equal the resolver's final observation; a
difference is `INDETERMINATE` (`target-changed`), a pre-write refusal with zero writes, not
overridable. `target-changed` therefore applies to both `eligibility` and `init` (a change to ADR 0016's
AC2 row, which said it did not apply to `eligibility`). A retargeting that is restored between two
observations is not observed.

**G6 — Refusal before the first write.** Before `init`'s first write every artifact path is classified
(C0). A linked intermediate directory (`.github`, `artifacts`, or deeper), a link or junction at any
artifact path, a special file, a directory where a file artifact is expected, a non-directory where a
directory artifact is expected, and an entry that cannot be `lstat`ed for a reason other than absence,
are refused with exit `2`, nothing written and the tree unchanged, using the names ADR 0016 P5 gives
(`not-regular-file`, `unreadable`, `target-changed`). The table in ADR 0016 P5 stands. A directory
artifact that is **absent at its primary path but already satisfied by an existing alternative
location** (a populated `docs/adr/` or `doc/adr/`, as `satisfiedBy` in `scripts/init.mjs` recognises
today) is **preserved as today**: the primary path is not created, so no second competing directory
appears (ADR 0016 P4, "including the existing alternative locations that already satisfy it"; the P5
table's "absent: created" cell means absent and not so satisfied).

**G7 — Re-observation before each write; `entry-changed`.** Immediately before **each** write operation
`init` takes C1 for that write's path; **for a write through the descriptor of a file `init` created, this
includes a path `lstat` of that file immediately before the first byte is written, which must still report
the baseline identity (and, for a file with other links, is a further observation, not a prevention)**. If any component's type, identity or presence differs from its
baseline (Terms: C0, updated by `init`'s own creations; a component recorded absent that is now
present), that write is **not made**, `init` exits `2`
naming `entry-changed`, artifacts already written remain, no later write is made and nothing is rolled
back. `entry-changed` is raised **only** where one of these observations saw a difference: this
comparison; G8's create-if-absent call reporting that an entry already exists; the descriptor-`fstat`
versus path-`lstat` baseline comparison of a created file, and the baseline `lstat` of a created directory
(a link, junction, wrong type or absence installed between the `mkdir` and that `lstat`) (Terms, C1); G8's post-write validation of a created
file (identity, size); or G9's steps 1, 3 and 5 (baseline, destination observation, temporary-entry
validation by identity and size). No other condition raises it. A change of the target directory's own
identity observed at a write after the first is `entry-changed` as well (the root is the first
component of the chain); the pre-write `target-changed` of G5 remains the only condition for it before
the first write.

**G8 — Create-if-absent.** An absent artifact component is created with a **non-recursive** directory
creation, one level at a time, and an absent file artifact (and a temporary file) is created with a
create-if-absent open on a read-write descriptor. Each of those single calls fails if **any** entry, a
link or junction included, already occupies the name; the call never follows it. A failure for that
reason is `entry-changed`, and nothing is written through the occupying entry. A real directory that is
present at classification is preserved (ADR 0016 P4); one that **appeared after** classification at a
name recorded absent is `entry-changed`, so `EEXIST` from a creation call is never treated as success
for a recorded-absent name. This is a property of each call on the one name it addresses; it says
nothing about the components above it or about what happens to the new entry afterwards. A recursive
directory creation (`mkdir -p`) is **not** used for artifact components, because it succeeds on an
existing link to a directory. This is what answers review finding **4273671903**: a component created
as a link or junction before `init` creates it is refused by G7 when it appears before the
re-observation and by G8 when it appears between the re-observation and the creation call.

**A created file is validated once, after its content is written:** `lstat` of the path must report the
identity the descriptor had at the baseline (Terms, C1) and a size equal to the number of bytes written;
a difference is `entry-changed` and the file is not reported as written. That is the whole validation:
the content is not read back and timestamps are not compared, so a same-length rewrite by another
process, and any change after this observation, is not observed and is not claimed.

**G9 — Placement of an overwrite.** An overwrite under `--force-overwrite` proceeds in exactly this
order, and each step is a named failure step of the diagnostic:

1. **Create** the temporary file in the artifact's parent directory by G8 (read-write descriptor, created with the restrictive mode `0600` so
   the content is not readable by other users before step 4 **on POSIX; on Windows Node sets no ACL, so
   no confidentiality of the temporary content is claimed there**, a name unique per run); record its identity with `fstat` of the descriptor and require the path `lstat` to
   report it (the baseline, Terms C1).
2. **Write** the content through the descriptor.
3. **Observe the destination:** C1 for the destination chain. The permission bits to apply are those
   reported by that `lstat` of the destination.
4. **Apply the mode:** `FileHandle.chmod` (`fchmod`) on the descriptor with those bits. Where the
   platform does not distinguish mode bits (Windows maps them to read-only or writable) this step has
   no meaning and the permission case is not required there.
5. **Validate the temporary entry:** `lstat` of the temporary path must report the recorded identity and a
   size equal to the bytes written. It is taken after step 4, so the `ctime` change of the mode
   application is never compared; timestamps are not compared at all.
6. **Place:** `rename` the temporary file onto the destination name.

A difference at step 1 (baseline), 3 or 5 is `entry-changed`, the rename is not made, and **no entry is
removed**: the tool removes nothing by path after an observation, because a pathname removal is itself a
check-then-act that could remove a replacement. In every failure the diagnostic is path-neutral and
names the failing step truthfully (creation, including an occupied name as `entry-changed`; the
temporary write; the destination observation; the mode application, with the operating system's error,
the destination keeping its own bits; the temporary-entry validation; or the rename), says that no
cleanup was attempted, and does not name the temporary pathname or present anything at it as a leftover
file of the tool. **No byte is ever written to the destination path**, so nothing is written through a
link at the destination. The rename replaces whatever entry occupies the name at that instant, or fails
(for example where the name is a directory), and a failure is an ordinary write failure: exit `2`,
nothing removed, earlier artifacts remain. The interval between step 5 and the rename is **not**
covered, a swap of the temporary entry inside it is not observed, and neither is a same-length rewrite of
its content at any time. **The permission bits the replacement carries are those observed at step 3**
(ADR 0016's "permission bits are preserved" means the observed entry's bits); a destination replaced
after that observation ends with the observed baseline's bits, not the replacement's, and this record
does not claim otherwise. This is why the temporary-file-and-rename write is kept (and why the
hard-link exception of ADR 0016 stands): not because it binds the write to the entry, which it does not,
but because it never writes through the destination path.

**G10 — Fail closed, Windows required.** Every guarantee above applies on every supported platform,
**Windows included, which is required in 3.0.0**. Where an observation a guarantee rests on cannot be
made in a given run (identity unavailable or all zero, an `lstat` error other than absence, a failing
call), `init` writes nothing further and exits `2` (`unreadable`, or `target-changed` /
`entry-changed` where a difference was observed); `eligibility` is `INDETERMINATE` under the name
its own guarantee gives (`stat-failed` for an `lstat` error, `unreadable` for an open or read failure
or identity unavailable, `source-changed` where G2-G4 apply, `listing-incomplete` for the listing).
This record does not claim that any platform's implementation exists.

### The two open findings, stated against the contract

| Finding | Why the scenario no longer contradicts the contract | What is observed instead |
| --- | --- | --- |
| **4273671894** — same-name atomic replacement of a source between its post-read check (G3) and the final re-enumeration | ADR 0016 promised, by binding, that the file read is the file at the name. This record promises only observations. A replacement before the final pass is now observed (G4b). One after it is later than every observation the result is defined over. | the identity, size, `mtime` and `ctime` of each source entry at the final pass, compared with classification; and the multiset of names |
| **4273671903** — an absent component created as a link or junction before `init` creates it | ADR 0016 promised the component was "bound" and that a creation "cannot be redirected through a link". This record promises that a component present before the re-observation is refused, and that the creation call itself does not succeed on an occupied name. A component replaced by a link **after** it was created and before a later write is observed by that write's re-observation, or is not observed. | C1 for every write; EEXIST from the non-recursive creation call |

Neither finding is recorded as an accepted limitation. The one thing the contract states it does not
cover is the interval between the last observation of an operation and the operation itself, which
every check-then-write sequence has and no path-addressed API can remove.

### Mechanism (non-normative; claims no more than the calls do)

Path-addressed `fs` calls only: `lstat`/`stat` with `bigint: true`; `open` read-only for sources
(with `O_NOFOLLOW` and `O_NONBLOCK` added where `fs.constants` provides them) followed by `fstat` on
the descriptor; `readdir`/`opendir` by path; non-recursive `mkdir` per level; `open` with the exclusive
create flag (read-write) for new files and temporary files; `rename` for placement; `FileHandle.chmod` (`fchmod` on the descriptor) for the temporary file's mode on POSIX. No
descriptor-relative call is used or assumed. Nothing here is a lock or a handle-relative operation.

## Alternatives considered

**Keep ADR 0016's binding and record the residual as an accepted limit (the owner packet's option A).**
Rejected by the owner (2026-10-15T17:17Z): it needs an exception to the zero-findings rule for P1
findings, and it leaves a contract that promises something the platform cannot provide.

**Require a native handle-relative primitive as a follow-up (option B).** Rejected: it conflicts with
the zero-dependency Node implementation and would delay 3.0.0 without a claim that it could reach zero.

**Withdraw ADR 0016 wholesale and return to the text at `f4615dd`.** Rejected. Most of ADR 0016 (the
vocabulary, text rules, overrides, size cap, `--help`, exit codes, refusal table, hard-link exception)
is decided, approved and unaffected. Only the binding guarantees are impossible.

**Edit ADR 0016 in place.** Rejected by Standard 11 R5 and by the owner: the dated amendments are the
historical record.

**Add more observation passes until the findings stop.** Rejected. Each pass narrows a window and
describes only itself; the review history is that experiment.

## Consequences

**Makes easier.** The contract can be tested truthfully: every refused case is one a test can produce,
and every claim has one test. Nothing in the specification depends on a primitive Node lacks, so
Windows is supported on the same terms as POSIX.

**Makes harder / stated knowingly (not claimed, and not an accepted limitation).**

- A concurrent writer that acts between a re-observation and the write it guards can cause a write
  through a replaced component or onto a replaced entry. The tool does not prevent this and does not
  claim to. Callers who need exclusion must provide it outside this tool.
- `IN_SCOPE` and a successful `init` describe observations, not a state that still holds.
- A failed overwrite can leave a temporary file in the target. It is not removed by path (a pathname
  removal is itself a check-then-act) and the diagnostic does not name it; its name is unique per run, so
  it does not block a later run.
- `init` overwrite keeps the hard-link behaviour of ADR 0016's documented exception.

**Commits the project to.** Writing no sentence, in any normative text, help output, diagnostic, comment or test name, that says a path component, entry or file
"cannot" change during these commands; testing every raced-in kind at the seam between classification
and re-observation (G7) and the create-if-absent behaviour (G8) on real Windows before 3.0.0; and not
reintroducing handle-relative wording without a primitive that provides it.

## Required tests

Supersedes the ADR 0016 bullets named in "Test disposition". All tests are exit-code and
human-output tests (no JSON-schema tests). Seams: the implementation exposes an injectable file-system
interface and test seams at each of these points, which are test surface, not behaviour: (S1) between
classification and the open of a source (G2, G4d); (S2) during the read of a source (G3); (S3) between the
post-read check and the final pass (G4b, G4c); (S4) between the target `stat` observations (G5);
(S5) between classification and re-observation (G7); (S6) between re-observation and the create or
rename call (G8); (S7) between a creation call and the baseline `lstat` (G7, G8, G9); (S8) after the first write
(G7, retarget); (S9) strictly after the baseline of the temporary file and before its step-5 validation (G9; it does not include S7 or S14), and (S13) between the first enumeration and the final pass (G4a); (S11) between the open of a source and its pre-read `lstat` (G2); (S12) between the write of a created
file and its post-write observation (G8); (S14) between the baseline `lstat` of a created file and the
first write through its descriptor (G7, G8, G9; the restore variants use this hook). A row uses exactly the seams named for it.

### One test row per guarantee

| Guarantee | Test row | Mutation check (the test must fail) |
| --- | --- | --- |
| G1 | injected: a directory, every link kind, a FIFO and a device at `README.md` or `FROZEN.md` each give `not-regular-file`; the open interface fails the test if called for content | content-read of a non-regular entry allowed |
| G2 | injected: entry classified regular and replaced before the open by a link to an outside file carrying a listed phrase, by a FIFO, by another regular file, by a device node (the open interface asserts a read-only open and no read), and by a link at the same name pointing back to the **same** file (the file renamed away; refused by the pre-read `lstat`): no byte read in each case; `not-regular-file` / `source-changed`; with `O_NOFOLLOW` reported unavailable the result is the same, and with `O_NONBLOCK` reported unavailable on a non-Windows platform the entry is not opened and the result is `unreadable`; and the open flags are asserted by the injected open interface: where `O_NONBLOCK`, `O_NOFOLLOW` and `O_NOCTTY` are provided every source open must carry all of them | (a) the post-open identity comparison removed, run with `O_NOFOLLOW` reported unavailable and the S1/S11 restore case (at S1 the entry is replaced by another regular file so the open captures it; at S11, after the open and before the pre-read `lstat`, the original is restored with the classified identity): only this comparison can refuse it; (b) the pre-read `lstat` removed, run with `O_NOFOLLOW` reported unavailable and the same-file link case (the open file has the classified identity, so only the `lstat` can refuse it); (c) each of the three open flags removed independently, each failing its flag assertion |
| G3 | injected at seam S2 with injected stat values: the same inode written during the read, as three separate cases: a size-only change, a **same-size** rewrite that changes `mtime` only, and one that changes `ctime` only (where the platform provides them), each `source-changed`; a same-size rewrite restored before the after-read `fstat` is not observed (documented non-claim, no verdict required); unchanged source not flagged. The post-read `lstat` of the entry is exercised for replacement and removal with **no independent mutation claim** (subsumed by the final pass of G4(b)), and for a **transient error other than absence that recovers before the final pass**: `stat-failed`, which only this check can produce | the after-read size, `mtime` and `ctime` comparisons each removed **independently**, each making its own case fail; the post-read `lstat` removed (the transient-error case must fail) |
| G4 | injected stat values throughout: (a) at seam S13, a differently spelled twin added after the first enumeration, and a twin removed: `listing-changed`; (b) at seam S3, a source replaced by another regular file **with the same size, `mtime` and `ctime` as recorded** (identity differs), keeping its name and the multiset: `source-changed`; (c) at seam S3, the same inode written in place after the post-read check, as three separate cases (size-only, same-size `mtime`-only, same-size `ctime`-only): `source-changed`; (d) at seam S1, the same inode written in place between classification and the open, as the same three separate cases, differing from what classification recorded: `source-changed` at the final pass, never `IN_SCOPE`; unchanged directory not flagged | (a) multiset replaced by a case-folded set; (b) the final per-entry identity comparison removed (the replacement carries the recorded size and stamps, so nothing else can catch it); (c) the final size, `mtime` and `ctime` comparisons each removed **independently**; (d) the classification-time size, `mtime` and `ctime` recordings each removed **independently**, each making its own case fail |
| G5 | injected at seam S4: target `stat` identity differs between the first and last resolver observation, and between the resolver's last observation and `init`'s pre-first-write observation: `target-changed`, exit `2`, zero writes; applies to `eligibility` and `init`; a retarget that is restored before the final `stat`, and the mixed-directory case (listing from A, classification and open from B, restored to A before the final `stat`), are **not required to be flagged**; the test pins the documented non-claim and requires no verdict | the comparison removed |
| G6 | the ADR 0016 P5 table, one case per cell, plus a linked `.github` and a linked `artifacts`, with and without `--force-overwrite`: exit `2`, nothing written, link target unchanged; and a repository whose ADR directory is a populated `docs/adr/` (and, separately, `doc/adr/`) with `artifacts/adr/` absent: `init` preserves it and creates no `artifacts/adr/` | pre-write classification skipped; the alternative-location case treated as absent (a second `artifacts/adr/` created) |
| G7 | injected at seam S5, one test per raced-in kind (link, junction, FIFO, device, directory, newly created regular file, deletion, regular-to-regular replacement, directory component replaced by another real directory, directory component replaced by a link), **with the injected create-if-absent call made to succeed at names recorded absent so G8 cannot mask C1**: that write is not made, exit `2`, `entry-changed`, earlier artifacts remain, no later write, no rollback; **a clean greenfield run** in which `init` creates `artifacts/` and writes under it twice succeeds, while a swap of the just-created directory for a link before the second write is `entry-changed`, and a link or junction swapped in between the creation call and the baseline `lstat` (seam S7) is `entry-changed` (a same-type directory swap there is a documented non-claim); at seam S14 (between the baseline and the first write through the descriptor of a created artifact or temporary file), the pathname replaced by another regular file or a link: no byte is written through the descriptor, `entry-changed`; and the target path retargeted after the first write (seam S8) is `entry-changed`, never `target-changed`, earlier artifacts remaining | C1 removed; C1 removed **for descriptor writes only** (the S14 case must fail while the S5 cases still pass) |
| G8 | injected and real filesystem, seam S6 (**after** the re-observation): an occupying link, junction, real directory or regular file appears at an absent component's name and at an absent file artifact's name: the call fails, `entry-changed`, nothing written through it; plus a source-level assertion that no recursive directory creation is called for artifact components. A **newly created file artifact**, at seam S7 (after the create-if-absent open, before the baseline `lstat`), replaced by another regular file and separately by a link: `entry-changed`, and the interface records **zero** writes to the descriptor after the mismatch; **restore variant:** the original entry is put back after S7 so that every later observation sees the original identity: only the baseline comparison can refuse it. At seam S12 (after the write, before the post-write validation): replaced by another regular file **with the same size** (identity differs), and, separately, appended to in place (identity unchanged, size differs): each `entry-changed` and not reported as written | non-recursive creation replaced by `mkdir -p`; create-if-absent replaced by a plain open; `EEXIST` treated as success for a directory that appeared after classification; the baseline descriptor-`fstat` versus path-`lstat` comparison removed **for new file artifacts only** (the restore variant must fail; the temporary-file cases of G9 must still pass); the post-write identity comparison removed (the same-size replacement at S12 must fail, since the baseline and S14 observations precede it); the post-write size comparison removed (the S12 append must fail) |
| G9 | injected: the six steps run in the stated order (the interface records the order); no `open`/`write` is addressed to the destination path, and the destination changes only by the rename; a destination that is a directory makes the rename fail with exit `2`; the temporary file at seam S7 replaced by another regular file or a link: `entry-changed`, **zero** descriptor writes after the mismatch, and a restore variant (original put back after S7 through the S14 hook, so only the baseline can refuse it); at seam S9 the temporary path replaced by another regular file **with the same size** (identity differs): `entry-changed`, rename not made, nothing removed; and, separately, appended to in place (identity unchanged, size differs): `entry-changed`; the **permission** case (POSIX only; excluded from the Windows gate because modes collapse there): the destination mode changed 0644 to 0600 (identity unchanged) after classification and before step 3, and the replacement must carry 0600; the temporary file is created with mode `0600` (asserted on the create call, POSIX); a failure injected at each of steps 1, 2, 3, 4, 5 and 6 exits `2` with a diagnostic naming that step and its error and nothing removed; a leftover temporary file from an earlier failed run does not make a later overwrite fail (unique names); the hard-link exception test of ADR 0016 AC4 | writing in place to the destination path; the baseline comparison removed for the temporary file (restore variant must fail); the step-5 identity comparison removed (the same-size S9 replacement must fail); the step-5 size comparison removed (the S9 append must fail); the mode taken from classification instead of step 3 (the permission case must fail); the mode-application error swallowed (the step-4 failure case must fail); the creation mode left at the default (the create-call mode assertion must fail) |
| G10 | injected: identity unavailable (absent or all zero), an `lstat` error other than absence, `O_NONBLOCK` unavailable off Windows, and a failing call each fail closed; plus the Windows release gate below | identity-unavailable branch removed |

### Windows release gate (replaces the two ADR 0016 gates)

The 3.0.0 release run must contain **non-skipped, real-filesystem Windows tests**, the objects created
for real, for: (1) a symbolic link or junction named `README.md` or `FROZEN.md`, which
is not read as a regular file (G1, G2); (2) a pre-existing linked intermediate directory and a
pre-existing leaf link, with and without `--force-overwrite`, each exit `2`, nothing written, target
unchanged, and an ordinary run that preserves a real directory artifact (G6); (3) every raced-in kind of G7
that the platform can create (symbolic link, junction, directory, newly created regular file,
deletion, regular-to-regular replacement (the replacement created first and renamed over the name, so a new identity is allocated before the old is freed; identity reuse is a documented non-claim), directory component replaced by another real directory or
by a link; the FIFO and device kinds are tested injected only) at the seam between classification and re-observation; (4) G8 at the seam after the
re-observation, for a component and a leaf, at seam S7 for a newly created file artifact replaced by
another regular file and by a link, at seam S12 for a created file artifact replaced by another regular
file of the same size and appended to in place, and at seam S14 for a created file artifact and for the
temporary file of G9, the pathname replaced by another regular file and by a link before the first
descriptor write (no byte written through the descriptor); (5) G2 with a regular source replaced, between
classification and open, by a link to another file, by a link back to the same file, and by another regular file (no byte of the replacement's content
is used); (6) G9 placement: a rename onto an existing regular file, onto a link and onto a directory
(which fails), the S9 same-size replacement and in-place append of the temporary entry, and the
hard-link exception test of ADR 0016 AC4. **Cases defined on injected values only (stat values, open
flags, modes, failure injection at a step) are not required of this gate.** A runner that cannot create the objects must be
provisioned; the gate does not pass by skipping. **The gate contains no test that asserts that a
change after the last observation is prevented**, because the contract does not claim it. This record
does not claim that such a runner or seam exists.

### Test disposition for ADR 0016 "Required tests"

A kept ADR 0016 bullet named below supplies cases of the **one** row of the guarantee it is assigned
to; it is not a second row for that guarantee.

| ADR 0016 bullet | Disposition |
| --- | --- |
| AC1, AC2 (table), AC3, AC4, `init` output, Overrides, Both spellings, Permission/link/mode, Read cap, Partial listing, Text rules, `--json` and no walk-up, Invocation errors, Read-only/process-free/network-free, No catalog rule | **Kept.** AC2's `target-changed` row is changed: it applies to `eligibility` as well (G5). |
| Source identity after the read, injected | **Kept** as cases of G3 (post-read `lstat`); its mutation check is **withdrawn for the replacement and deletion cases**, because the G4(b) final pass observes the same replacement or removal; the transient-error case keeps a mutation (G3 row). |
| Replacement race | **Replaced** by G2; the "safe-open capability unavailable" assertion is restated in the G2 row (`O_NONBLOCK` unavailable off Windows is `unreadable`), and the "same-handle read" mutation is withdrawn. |
| Read-time consistency, injected | **Kept** with (d) twins; extended by G4b. Its mutation check "remove the re-enumeration" is retained. |
| File safety on every supported platform, Windows included | **Kept** as G1/G2 and release-gate item (1); the injected open interface "fails if it receives a blocking or link-following request" is restated: it fails if called for content on a non-regular entry, and the pre-open guarantee is G1. |
| Real-filesystem Windows `init` gate | **Replaced** by release-gate items (2) and (3). |
| Real-filesystem Windows replacement-race gate | **Replaced** by items (3) and (4); "nothing lands ... through the retained directory handle" and "a renamed-away directory is untouched" are withdrawn (they assert handle binding). |
| Directory identity bound through `init` (retargeting during listing, between listing and opening, and the "held-handle write" tests; mutation checks replacing handle-relative calls) | **Superseded** and replaced by G5. The sub-test "a matching test confirms there is no post-write `target-changed`" stands (G7). |
| Component-wise traversal, injected (a)-(c) and its mutation checks | **Replaced** by G6 (a) and G7 (b), (c). The "only passing outcome is refusal ... nothing written through the retained directory handle" wording is withdrawn. |
| Leaf artifact entries, injected (a)-(e), (c2), (c3), (c4), disappearance | **Replaced** by G6 and G7 per raced-in kind. (c3) "entry binding, synchronized" and its mutation check **are withdrawn**: they assert an entry-bound atomic replacement that cannot be provided. (c4) is part of G7. |
| Mutation checks (read-all rule, INDETERMINATE override block, ASCII case-fold, `init` refusal) | **Kept.** |

## Appendix: what review taught (non-normative)

The review of PR #105 ran from 2026-10-11 to 2026-10-15 and produced inline review threads numbering 88 at head `ccbdb18`. The
vocabulary, JSON-contract, case-collision and whitespace findings converged and were repaired in ADR
0016. From 2026-10-12T18:44Z the findings became time-of-check/time-of-use findings on writes and on
the resolver's read of a changing directory; each repair added a pass or a binding and exposed the
next. The record is kept so the next author of a write path does not repeat it: specify the
observation and the refusal, not the prevention.

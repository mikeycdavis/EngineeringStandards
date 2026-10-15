# 0020 — Fixtures are exempted by exact path, digest and rule, not skipped by name

- **Status:** Accepted
- **Date:** 2026-10-12
- **Deciders:** Project owner
- **Tracked by:** ST-19a ([#110](https://github.com/mikeycdavis/EngineeringStandards/issues/110))
- **Related:** [ADR 0004](0004-audit-and-validate-are-separate-commands.md),
  [ADR 0008](0008-detectors-do-not-assert-repository-state-they-have-not-measured.md),
  [ADR 0011](0011-attestation-freshness-is-repository-content-not-checkout-bytes.md),
  [ADR 0015](0015-local-ci-verifies-committed-content-not-the-host-checkout.md)

## Context

`SKIP_DIRS` in `scripts/standards.mjs` held the name `fixtures`. The walk dropped any directory with
that name before a single detector ran, and recorded the drop as `authorizedBy: framework`. The stated
reason was sound: test fixtures are deliberately malformed, so scanning them reports planted defects as
the repository's own.

The mechanism was the defect. A directory **name** is not an authority over content:

- it removed everything beneath the directory from **every** detector, so a file with one deliberate
  violation was also hidden from the nine content-derived rules it had nothing to do with;
- it hid genuine first-party code that happened to live under a directory of that name;
- because the loss was tool-decided, it marked the evidence surface incomplete and withdrew nine
  prohibitions to `not-evaluated`, so the repository could never establish `security.no-cert-bypass`,
  `security.no-sql-concat` or `errors.no-swallowed-exceptions` — the situation ST-19 (#97) records and
  describes as owned by no item: "whether `fixtures` and `vendor` are the right names to drop".

The owner's decision of 2026-10-12 is to replace broad fixture skipping with exact fixture metadata.

## Decision

`fixtures` is **not** a skipped directory. Every file beneath it is an ordinary scanned file. A
deliberately violating fixture is waived only by an entry in `project-policy.yml`'s
`fixtureExemptions`, which names one file, pins its content, and waives one rule.

### The entry

| Field | Required | Meaning |
| --- | --- | --- |
| `path` | yes | Exact repository-relative file path, forward slashes. No wildcard, glob, directory, absolute path or `.`/`..` segment |
| `sha256` | yes | SHA-256 of the file's content, 64 lower-case hex characters, with CRLF read as LF (see below) |
| `rule` | yes | One canonical rule id, in the rule's own spelling, that is exemptible |
| `reason` | yes | Non-empty. Why this file is deliberately violating |
| `owner` | yes | Non-empty. Who answers for keeping the entry true |
| `expires` or `reviewWhen` | one of them | A `YYYY-MM-DD` date after which the entry stops applying, or the condition under which it must be re-examined |

It lives in the policy, beside `exceptions`, because it is a recorded, attributable human decision
about a rule — and it is **not** an exception. An exception waives a rule for the project. This waives
one rule for one pinned file, and only that.

### Matching

An exemption applies to a violation only while **all three** hold: the violating file's path equals
`path`, the file's current content digest equals `sha256`, and the violated rule equals `rule`.

- Another path with identical bytes is inspected: the path does not match.
- Changed bytes at the same path are inspected: the digest does not match, and the entry is reported
  stale with the digest actually observed, so the maintainer re-pins deliberately after review.
- Another rule still inspects the file: the entry names one rule.
- A certificate bypass added to a pinned file changes its bytes, so nothing about that file is waived.

The exemption is applied to a violation the detector **observed**, never in place of the inspection.
Each exemptible detector reads the file and runs its own check; only a hit is routed through
`run.settleFixtureHits`. A file that was unreadable, truncated or never opened produces no hit and a
`run.unknown`, so no exemption can turn it into a result. A waived hit does not count as a confirmed
violation, so it can never keep a rule "evaluated" over a file the run did not finish reading: such a
rule is `not-evaluated`, exactly as before.

### Reporting

A rule whose only violations are waived reports `disposition: excepted` (status `failed`/`warning`
by level, exactly as an excepted rule already does — never `passed`), with `exception.kind:
"fixture-exemption"` and the pinned files. It reads `COMPLIANT_WITH_EXCEPTIONS` through the existing
exception path; this ADR adds no verdict value and no second vocabulary. A rule with any live
violation fails and carries only the live ones as evidence. Every waived departure is still emitted as
an `info` finding (`fixture-exempted`) carrying the entry that waived it, so nothing is hidden.

### Validation

An entry that does not validate waives nothing and is reported; the file is inspected normally.

| Defect | Where it is caught |
| --- | --- |
| Missing required field, digest not 64 lower-case hex, unknown field | JSON Schema — the policy is unreadable (exit 2), as for any malformed policy |
| Wildcard, directory, absolute, backslash or non-canonical path | `fixture-exemption-bad-path` |
| Neither `expires` nor `reviewWhen` (the supported schema dialect has no `anyOf`) | `fixture-exemption-no-lifetime` |
| Rule not exemptible per file, unknown rule, or non-exemptible rule (Standard 20 R4) | `fixture-exemption-rule-not-exemptible`, `-unknown-rule`, `-non-exemptible` |
| Expired | `fixture-exemption-expired` |
| Two entries for one (path, rule) | `fixture-exemption-duplicate`, **both** rejected — nothing says which digest was reviewed |
| Path not in the scanned surface, unreadable, digest changed, or rule no longer fires | `fixture-exemption-stale` |

`standards policy` runs the same validator, so an entry that is malformed, expired, duplicated or names an
un-exemptible rule is reported before an audit. It does NOT bind entries to the repository: whether a path still
exists, whether its digest still matches and whether the rule still fires there are `fixture-exemption-stale`
findings that only `audit` and `validate` can produce, because they need the scanned surface and the detectors.
A policy that passes `standards policy` can therefore still carry a dead entry.

### Which rules are exemptible

Only rules whose detector reports per file and is wired through `settleFixtureHits`:
`errors.no-swallowed-exceptions`, `scm.no-committed-env-files`, `security.no-cert-bypass`,
`security.no-sql-concat`, `quality.unfinished-work`, and `security.no-secrets-in-artifacts`. The
last is wired but **rejected**, because the catalog marks it non-exemptible. The catalog stays the
single authority on exemptibility; this list says only where the mechanism can be exact.
`test/fixture-exemptions.test.mjs` runs every member through the mechanism.

### The content digest

SHA-256 over the file's bytes with each CRLF pair read as LF. Hashing raw working-tree bytes would
make one entry fresh on one platform and stale on another for the same commit — the defect ADR 0011
and ADR 0015 measured for attestations — and this repository is developed on Windows with
`core.autocrlf`. The documented consequence: a change that is *only* LF to CRLF does not invalidate an
entry; every other byte change does. The digest is computed over the file as the run reads it, not
over a Git blob, so it needs no Git and has no fallback to disagree with.

### `audit` and `validate`

Both apply exemptions. `audit` remains runnable with no policy and reads exactly one thing from one if
present — `fixtureExemptions`. An exemption changes how a departure is classified, never whether the
file was inspected, and `audit` lists every waived departure. A missing or unparseable policy yields no
exemptions, so the failure direction is more findings, never fewer. `audit` applies no level,
applicability, attestation or exception.

### How this repository's own fixtures are handled

`test/fixtures` is scanned like any other directory. Its eight deliberately violating files are listed
in `project-policy.yml` as eight exact entries (path, digest, one rule, `reviewWhen`), and the
repository's evidence surface is complete for the first time since the exclusion was introduced.

One fixture could not be exempted, and that is a finding rather than a gap. `config.yml` held a
credential-shaped value for `security.no-secrets-in-artifacts`, which is non-exemptible. With the
blanket skip gone a tracked file that matches that rule is a permanent live failure. The bait is now
written at run time into a throwaway copy by `test/audit.test.mjs`, so it is never a tracked file,
and the positive control for the rule is preserved.

## Consequences

- **`fixtures` directories in consumers are scanned.** A consumer with deliberately violating
  fixtures sees live findings until it adds exact entries or moves the bait out of the tracked tree.
  This is the intended direction: those findings were hidden, and the prohibitions they bear on were
  withdrawn. Measured on one consumer (SkillEvaluator, 58 `fixtures` directories, 971 tracked files
  beneath them) the new live findings are `quality.unfinished-work` (15 files) and
  `scm.no-committed-env-files` (5 files).
- **Descriptive findings change.** Fixtures that contain routes, jobs or SDK imports are now reported
  as capabilities of the repository. They are `info` observations bound to no rule, so there is
  nothing to exempt and no verdict moves; a reader should know the count rose because fixtures are read.
- **Other framework exclusions are unchanged.** `vendor`, `dist`, `build`, `out` and the rest of
  `SKIP_DIRS`, and the `pyvenv.cfg` marker, still drop by name or marker and still mark the surface
  incomplete. They have the same defect and are not decided here: each needs its own owner decision on
  what, if anything, replaces the name.
- **A fixture in a path the repository ignores** is outside the walk by the repository's own decision;
  an entry for it is reported stale rather than honoured.
- **The verdict algebra is unchanged.** `scripts/compliance.mjs` still places the unestablished-
  prohibition cap after the exceptions determination, so a run with an excepted rule and an
  unexamined prohibition reads `COMPLIANT_WITH_EXCEPTIONS`, whereas the owner's 2026-10-12 vocabulary
  reads such a run as `NOT_EVALUATED`. That is a pre-existing difference between the code and the
  stated vocabulary, recorded here and left for an owner decision.

## What this does not establish

It establishes that a path-and-bytes-and-rule waiver is the only way a fixture departs from a rule.
It does not establish that the listed fixtures are *still* deliberately violating, only that they
are the bytes someone reviewed. `reviewWhen` is a prompt for a human, not a mechanism: nothing here
re-asks the question when the condition occurs.

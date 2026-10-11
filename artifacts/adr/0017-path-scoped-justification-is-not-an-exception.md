# 0017 — A path-scoped justification is not an exception

- **Status:** Accepted
- **Date:** 2026-10-11
- **Deciders:** Project owner
- **Related:** [ADR 0005](0005-attestations-are-recorded-human-evidence.md),
  [Standard 20](../../standards/20-exceptions.md),
  [Standard 48](../../standards/48-error-handling-and-observability.md) R1

## Context

A consuming project has four tracked files under `examples/` that are frozen, evaluated copies whose
bytes are digest-locked: editing them invalidates the evaluation they exist to preserve. Each holds
an empty catch block, which `errors.no-swallowed-exceptions` correctly reports. Standard 48 R1 already
accepts a justification comment at the catch site — and that comment cannot be added, because the
bytes cannot change.

The only waiver the policy offers is an `exceptions[]` entry, and it is rule-wide. Using it would
also waive the rule for every other file in the project, present and future. That is the wrong
instrument: it trades one frozen-file problem for a permanent blind spot.

## Decision

**The policy gains a `justifications` list. Each entry suppresses exactly one rule at exactly one
tracked file, and nothing else.**

```yaml
justifications:
  - rule: errors.no-swallowed-exceptions
    path: examples/x/y.mjs
    reason: "Frozen evaluated copy; bytes are digest-locked."
    approvedBy: "project-owner"
    approvedAt: "2026-10-11"
    reference: "ADR-0004 / decision record"
    removeWhen: "The frozen copy is regenerated or deleted."
```

### Binding rules

1. **It is not an exception, and it is not an attestation.** An exception says a rule is unmet
   project-wide; an attestation says a human found it satisfied. A justification says a *named
   departure at a named place* is understood. It does not make a project `COMPLIANT_WITH_EXCEPTIONS`:
   the rule passes only because every violating path is justified, and the report lists them.
2. **The engine decides which rules are admitted.** An explicit allowlist in
   `scripts/justifications.mjs` (`JUSTIFIABLE_RULES`), initially `errors.no-swallowed-exceptions`
   alone. It is code, not policy data and not a catalog flag, so widening it is a reviewed change. A
   rule the catalog marks non-exemptible, an unknown rule, and a legacy alias are each rejected with
   their own code.
3. **A path is exact.** Repository-relative, forward-slash, canonical, one tracked regular file. A
   wildcard, directory, absolute, drive-letter, UNC, traversal, backslash, or non-canonical form is
   rejected, each with its own code, so a broad exemption cannot be written. The input is compared
   with its canonical form and rejected if it differs; it is never silently normalised into
   something that matches.
4. **Tracked is asked of the repository.** `git ls-files` in the audited root. When the root is not a
   git work tree the engine falls back to the discovered file set (and the standalone `policy`
   command to the filesystem), and the result names which basis answered
   (`git-index` | `discovered-file-set` | `filesystem`).
5. **Subtraction is per path, per rule.** Only the justified path's evidence is removed from that
   rule's finding. If other violating paths remain the rule still fails and lists only those. Every
   other detector has already inspected every file, and no other rule's findings are read or
   rewritten.
6. **It is never silent.** Applied justifications appear in the human report, in `justifications` in
   `validate --json`, and as a `justified` list on the rule's own result. A justification whose
   path no longer violates the rule (or that the rule did not examine) is a `warning` finding,
   `stale-justification`, bound to no rule so it cannot itself fail anything.
7. **A bad list is a configuration error.** Any invalid entry makes `validate` exit 2 with
   `NOT_EVALUATED` and applies **none** of them. A partially honoured waiver list is a verdict that
   cannot be reproduced from the policy.
8. **Order does not matter.** Results are built from sets and sorted, so two orderings of the same
   entries produce byte-identical reports.
9. **`audit` is unchanged.** It is policy-independent evidence (ADR 0004) and reports the raw
   finding. Justifications are a `validate` concern.

### Limits, stated rather than discovered

- **A justification is whole-file.** It is bound to a path, not to a catch site and not to a content
  digest. If the justified file later gains a second empty catch, it stays suppressed until the
  justification is removed. A test pins this (`known limit: a justification is whole-file...`).
- **Stated use: digest-locked copied fixtures**, meaning files whose bytes are frozen elsewhere, so the
  contents the justification was written against cannot drift unnoticed. It is not a general way to
  waive a rule for code that is still being edited; use a comment at the catch site (Standard 48 R1)
  or fix the code.
- **No digest binding is added in this change.** Binding each entry to a blob digest (as attestations
  do, ADR 0011) would make a changed file un-justify itself, which is the right property. It was left
  out to keep this change narrow and fully testable; it is the recommended follow-up if the mechanism
  is used on files that are not frozen.
- **Exact spelling.** A path must match the directory entry byte for byte (case, no trailing dot), be
  Unicode NFC, contain no `:`, exceed no 1024-character path or 255-character segment, and pass
  through no symlink or junction. These are checked on the filesystem as well as against the git
  index, so the standalone `policy` command cannot report a green the engine run rejects.
- **Standalone `policy` cannot establish tracked-ness outside a git work tree.** There it does not
  know the audited file set, so it can accept a regular file under the root (for example under
  `node_modules/`, `vendor/` or `dist/`) that `validate` rejects as `path-untracked`. It says so in
  its output (`NOTE justifications: tracked-ness was not established`) and in `--json`
  (`trackedBasis`, `trackedNote`); only `standards validate` is authoritative there. Inside a git
  work tree both use `git ls-files` and agree.
- **A truncated file is unverified, not stale.** A file read only up to the per-file cap may still hold
  a violation past the prefix, so a justification for it that matched nothing in the prefix is
  reported as unverified and raises no removal warning.
- **Evidence loss still withdraws the rule.** If a file in scope was truncated, unreadable, or
  excluded by the framework, the rule is `not-evaluated` once its violations are all justified;
  subtraction never turns an unsearched surface into a pass.

## Consequences

- A frozen file is justified at the cost of one reviewed, attributable, removable record, and the
  rest of the project keeps full coverage.
- `removeWhen` is required so the waiver carries its own exit condition; the staleness warning is the
  mechanism that makes a forgotten one visible.
- The policy schema gains an optional section. Existing policies are unaffected. Per Standard 21 that
  is an additive, backward-compatible change; `VERSION` is **not** bumped in this change, because
  doing so would turn every consumer's `standardVersion` pin into a `VERSION_MISMATCH`. The release
  decision belongs to the owner.
- Adding a second admitted rule requires its detector to report violations per path and to expose
  which paths it examined; the assertion in `scripts/standards.mjs` fails if the allowlist and the
  detector registry disagree.

## Alternatives considered

- **A rule-wide exception.** Rejected: waives the rule everywhere.
- **Glob or directory justifications** (`examples/**`). Rejected: a broad form is exactly what turns
  a targeted record into a standing blind spot, and the four files are enumerable.
- **Excluding `examples/` from the audit** via the repository ignore set. Rejected: it removes the
  files from *every* rule, including secrets and certificate bypass.
- **Editing the frozen files.** Rejected by the premise: their bytes are digest-locked.

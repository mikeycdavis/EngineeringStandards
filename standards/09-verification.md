# Standard 9 — Verification

Work is not complete because someone says it is. Verification is the step between believing something
works and knowing it does, and *implemented*, *verified*, and *released* are three different states.

Source: item 9 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to anyone declaring work complete — human or agent — on any project. This item is stated with
an explicit **must**, which is unusual among these standards and is preserved below.

## Requirements

### R1 — Verify before declaring complete

**Agents and developers must verify work before declaring it complete.**

The obligation falls on whoever makes the claim. An agent reporting a task finished MUST have run
something that could have failed; a plausible-looking diff is not verification, and neither is a
successful edit.

### R2 — What verification may include

Reproduced verbatim from the source:

- compile/build
- unit tests
- integration tests
- end-to-end tests
- static analysis
- linting
- database migration validation
- security scanning
- smoke tests
- contract validation
- deployment verification

This is a menu, not a checklist. A project selects what its risk warrants; the requirement is that
*something* on this list — or something equivalent — actually ran, and that
[Standard 7](07-acceptance-criteria.md)'s `Verification` field names it.

### R3 — Implemented, verified, and released are distinct states

The standard MUST distinguish:

```text
implemented
verified
released
```

From the source: **"These are not the same state."**

| State | Means | Established by |
| --- | --- | --- |
| implemented | The code exists and is believed to work | An author's claim |
| verified | Something that could have failed was run, and passed | Evidence — a command, a test result, an observation |
| released | It is in the hands of its users, in the environment that matters | A deployment |

The distinction exists because collapsing it is the most common way status becomes untrue. Work
merged is not work verified; work verified in CI is not work released. A single `COMPLETE`
([Standard 8](08-status-tracking.md)) hides which of the three has actually happened, so a project
that cares about the difference must record it explicitly.

### R4 — Verification produces evidence, not assertion

A verification claim SHOULD point at something a reader can re-run or inspect: the command and its
result, the test that passed, the URL that returned the expected response.

The practical test is whether someone else could reach the same conclusion without trusting the
claimant. "Tested and working" fails it. `npm test` exiting 0 with 24 passing does not.

## Additions this standard makes beyond the source

- R3's table defining each of the three states and what establishes it. The source names the three
  and says they differ, without saying how.
- R4 in full — the requirement that verification point at re-runnable evidence.
- R1's reading that the obligation falls on the claimant, and that a plausible diff is not
  verification, is an interpretation of the source's "must verify".

## Relationship to other standards

[Standard 7](07-acceptance-criteria.md) requires every executable item to carry a `Verification`
field; this standard governs what makes its content adequate. [Standard 8](08-status-tracking.md)'s
`COMPLETE` should mean at least *verified* — never merely *implemented*.

## Implementation

Implemented in part by the **`pre-push`** skill, which runs a project's formatter, linter, type
checker, tests, and standards review before code is pushed — covering the build, test, static
analysis, and linting entries of R2.

`standards audit` reports `missing-audit-infrastructure` when a repository has no test suite or no CI
configuration, and `unverified-functionality` when capabilities exist with no tests at all. Neither
establishes that any particular piece of work was verified, which is the substance of R1 and remains
a claim someone has to make honestly.

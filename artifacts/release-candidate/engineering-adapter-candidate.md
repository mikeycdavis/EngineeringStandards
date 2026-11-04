# Engineering adapter release candidate: evidence (ST-15, refs #77)

Status: CANDIDATE, NOT ACCEPTED. This records what was produced and what was measured so a human
can review it. It does not accept the candidate, does not tag or publish anything, and does not
change `VERSION`. Acceptance (criterion 9) is a human gate and is not claimed here.

## What the candidate is

`standards-adapter.json` at the repository root. It declares how the consumer (StandardsEnforcer)
invokes this pack and reads its result. Producer choices, stated for the reviewer:

| Choice | Value | Why |
| --- | --- | --- |
| `schemaVersion` | `1.2.0` | `adoption.policyFiles` is admitted only from 1.2.0; criterion 2 ("`project-policy.yml` only") needs it. Consequence: enforcers older than 1.2.0 reject this declaration rather than guess. |
| `standard.id` | `engineering` | Matches `^[a-z][a-z0-9-]*$`; the consumer compares it to the id an invocation asks for. |
| argv | `validate {target} --json` | Literal, per the issue. |
| `adoption.policyFiles` | `["project-policy.yml"]` | The only name `scripts/standards.mjs` reads (`.yaml` is not honoured; tested). |
| `result.statuses` | the four native verdicts | `STATUS` in `scripts/compliance.mjs`. |
| `result.passing` | `COMPLIANT`, `COMPLIANT_WITH_EXCEPTIONS` | Producer-chosen subset; `NON_COMPLIANT` and `NOT_EVALUATED` never pass. |

## External source revision

| Item | Value |
| --- | --- |
| Consumer repository | `mikeycdavis/StandardsEnforcer` |
| Revision examined | `292b3dd846f6496f09d47e365054dcb168cdcb55` (`main` at examination; the repository has no tags) |
| Producer base | `3b1fca229b77dd75edc88c4085a495c940a7b99f` (EngineeringStandards `develop`) |
| Node | v24.15.0 (local run) |

## Artifact hashes (SHA-256, LF bytes)

| Artifact | SHA-256 |
| --- | --- |
| `standards-adapter.json` | `272007af6373a4da4e21267fde69582d165f1dae44ee682a6d2b9b784f918b94` |
| consumer `schemas/standards-adapter.schema.json` @ 292b3dd | `aa51fd2a5b3c8f1ff4551568622a7f803a52b8ee3ca1660e730f9fa256da7dd8` |
| consumer `scripts/contracts/adapter.mjs` @ 292b3dd | `603bf08978ce1f7ac45caeefc48bfcbd4d63492352118c9d8ad05eb4dc401d17` |
| consumer `scripts/contracts/jsonschema.mjs` @ 292b3dd | `306d51429b7b0be1cb9ab4442ace08866c237bbad87c091132796b87e767b707` |
| consumer `scripts/enforce.mjs` @ 292b3dd | `8881e01da3760a7862a43b7eb8f5de952588cf2a8c97b5768b2e261386e50eb5` |
| `scripts/standards.mjs` (the entrypoint) | recorded by the commit that carries this file; this file does not name its own revision (no self-SHA field is invented) |

A Windows checkout with `core.autocrlf=true` converts line endings; hash the blob content
(`git show <rev>:standards-adapter.json | sha256sum`), not a converted working file.

## Schema checks (criteria 4 and 5)

Run by `test/adapter-candidate.test.mjs` with `STANDARDS_ENFORCER_DIR` pointing at a checkout of the
revision above. Without that variable the tests are skipped with a stated reason, never passed.

| Check | Result |
| --- | --- |
| consumer `validateAdapter(standards-adapter.json)` | `[]` (no violations) |
| control: `passing` outside `statuses` | rejected (the check can fail) |
| control: `adoption` at `schemaVersion` 1.0.0 | rejected |
| consumer `runOfficialEvaluator` over this repository returns a status inside the declared vocabulary | yes, all matrix rows |
| control: wrong-pack expectation (`betting`) | refused with `identityMismatch` |

Consumer-owned test files run at the same revision (not part of this repository):
`test/open-vocabulary.test.mjs`, `test/adapter-conformance.test.mjs`, `test/process-completion.test.mjs`:
56 tests, 56 pass, 0 fail.

## Supported matrix and equivalence (criterion 6)

Direct = `validate --dir=<target> --json`. Adapter-mediated = the declared argv with `{target}`
substituted and nothing else (positional). Compared: exit code and the whole JSON report, excluding
only the wall-clock `auditedAt`. Targets are repository roots outside this checkout.

| Target | Native verdict | Exit | Direct == mediated |
| --- | --- | --- | --- |
| root with no `project-policy.yml` | `NOT_EVALUATED` | 2 | yes |
| root with a policy and an unpinned violating file | `NON_COMPLIANT` | 1 | yes |
| root whose only exception is an exactly pinned fixture | `COMPLIANT_WITH_EXCEPTIONS` | 0 | yes |
| consumer runner vs direct, violating root | `NON_COMPLIANT` | n/a | yes |

## No-status invocations (criterion 7)

Two parts, and only the first is shown here:

1. Producer side (tested): every native outcome in the matrix, including the exit 1 and exit 2
   ones, prints JSON with a string `status` inside the declared vocabulary, so the status key is a
   usable signal for each. Exit codes are not the signal (`NON_COMPLIANT` exits 1, `NOT_EVALUATED`
   exits 2, both with valid JSON).
2. Consumer side (cited, not reproduced here): the refusal of a report whose `status` is absent or
   undeclared is the consumer's behaviour: `scripts/enforce.mjs` at 292b3dd, the
   `status`-membership check returning `ENFORCEMENT_ERROR` ("which its own contract does not
   declare"), exercised by the consumer's `test/open-vocabulary.test.mjs` (run above, pass). This
   repository cannot make that refusal true or false.

## Mutation checks of the new tests

Each mutation edits `standards-adapter.json` and the named tests must fail; the unmutated file passes
all 11 tests.

| Mutation | Test that fails |
| --- | --- |
| adapter file absent | criterion 1 (and the file) |
| drop `--json` from argv | criterion 1 |
| add `NOT_EVALUATED` to `passing` | criterion 3 |
| drop `NOT_EVALUATED` from `statuses` | criterion 3 |
| add `project-policy.yaml` to `policyFiles` | criterion 2 |
| `schemaVersion` 1.0.0 | criterion 4 (consumer) |
| `validate` replaced by `audit` | criterion 6/7, three matrix rows |

## Known limitations

- The `COMPLIANT` verdict (as opposed to `COMPLIANT_WITH_EXCEPTIONS`) is declared and mapped but not
  exercised end to end: no cheap repository that the full catalog reports `COMPLIANT` was built. The
  engine-level verdict is covered by `test/path-justification.test.mjs`.
- A positional `{target}` is resolved upward to the nearest `.git` or `package.json`
  (`findRoot`), unlike `--dir=`. The supported matrix therefore uses repository roots only; a target
  nested inside another repository is evaluated as that repository.
- Criteria 4, 5 and the consumer-path part of 6 need a consumer checkout and are skipped without
  `STANDARDS_ENFORCER_DIR`; ordinary CI (which has no such checkout) does not run them. The consumer
  revision examined is an untagged commit of `main`; a later consumer revision may change the schema.
- Criterion 7's refusal is consumer behaviour (see above); it is evidenced by the consumer's own
  suite, not by anything this repository can falsify.
- `auditedAt` is excluded from report equality; nothing else is.
- Local run on Node 24; the repository's CI image pin may differ.
- Review and acceptance (criterion 9) have not happened. No tag, release, `VERSION` change or
  publication is part of this candidate.

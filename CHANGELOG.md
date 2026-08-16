# Changelog

All notable changes to this framework. Versioning follows
[Standard 21](standards/21-versioning.md): adding a `required` rule is `MAJOR`, adding a
`recommended` one is `MINOR`, and removing any rule is `MAJOR`.

**Three versions travel independently and may diverge numerically**
([ADR 0004](artifacts/adr/0004-audit-and-validate-are-separate-commands.md)):

| Version | Versions | Declared in |
| --- | --- | --- |
| Framework | The standards, the rule catalog, the policy schema | `VERSION`, and a project's `standardVersion` |
| Output schema | The validator's JSON envelope | `schemaVersion` in every report |
| Package | The npm package | `package.json` |

## Unreleased

**No change to the framework, the rule catalog, the policy schema, or any published contract.** This
is repository tooling: nothing an adopting project consumes is affected, and `VERSION` is unchanged.

Added the complete CI pipeline as a containerized local run, and made pull request submission depend
on it:

- `scripts/pipeline.mjs` — the stage list, now stated once. `.github/workflows/ci.yml` and the local
  container both execute it, and `test/local-ci.test.mjs` fails while the two name different sets,
  in either direction. The workflows are unchanged in what they run and were not deleted.
- `ci/Dockerfile` + `compose.ci.yml` — Node 20 pinned by image digest, matching the runner. No
  network, no bind mounts, no Docker socket, non-root. The repository is copied into the image
  rather than mounted, so the suite — which does write files — cannot reach the working tree.
- `scripts/ci.ps1`, `scripts/ci.sh` — the authoritative CI command. Unique compose project per run;
  teardown on every exit path and scoped to what the run created.
- `scripts/submit-pr.ps1` + `scripts/submit-gate.mjs` — submission refuses a dirty tree, a protected
  branch, a failed run, a HEAD that moved during verification, and a verification record naming a
  different commit, a partial run, or a run outside the container. The push names the verified SHA
  explicitly rather than the branch.
- `artifacts/local-ci/latest.json` — the machine-readable record, git-ignored as transient evidence.

`validate` remains advisory rather than gating in the local pipeline, exactly as it is a separate,
non-required job on GitHub, and for the same reason: this repository is intentionally
`NON_COMPLIANT` while recorded rejections stand. Its real exit code is recorded and printed, never
suppressed. See [docs/local-ci.md](docs/local-ci.md).

**The local gate now verifies committed content rather than the host checkout**
([ADR 0015](artifacts/adr/0015-local-ci-verifies-committed-content-not-the-host-checkout.md)).
`COPY . /work` built the image from the developer's working directory, so what it verified was one
platform's materialisation of the tree. Measured on `a373d4c` with committed content held constant:
a CRLF checkout produced 273 pass / 1 fail and an LF checkout 274 pass / 0 fail, while the GitHub
runner passed. The gate produced a red the runner did not, and the mechanism is symmetric.

- `scripts/ci-context.ps1`, `scripts/ci-context.sh` — the build context is a temporary clone at the
  exact commit `HEAD` names, with `core.autocrlf=false` and `core.eol=lf` written into its own
  config, its materialised commit confirmed against the requested one, removed by exact path on every
  exit path. A clone rather than a `git archive` export, because the audit resolves tracked and
  ignored paths through git and attestation freshness reads committed blob identity — an export plus
  a synthesised repository would trade this defect for ADR 0008's.
- `scripts/ci.ps1`, `scripts/ci.sh`, `scripts/submit-decide.ps1` all build from that context.
  **Local CI now requires a clean tree**: uncommitted work is absent from the run, so a pass would
  describe a tree the developer is not looking at.
- `scripts/verify-materialisation.ps1` — the falsifier. Runs the complete pipeline from an LF and a
  CRLF checkout of one commit, having first confirmed their bytes differ, and requires the verified
  SHA, every stage outcome, the verdict, and the repository's own freshness and tracked/ignored
  answers to be identical. `-Mutate` restores the defect and requires the comparison to fail.
- Isolation is unchanged: no bind mount, no Docker socket, no host path reachable from the run.
- The linked-worktree refusal is now conservative rather than necessary — `git clone` resolves a
  linked worktree into a self-contained repository. The guard is left in place; lifting it is its own
  decision.

Two defects found in review of the above, before it merged:

- **What counts as a clean tree no longer depends on the reader's git config.** `git status
  --porcelain` honours `status.showUntrackedFiles`, so under `no` a brand-new source file reported
  nothing, the context clone omitted it because it was not committed, and the run would have passed
  over a tree missing the file being worked on — the false success the clean-tree requirement exists
  to prevent, arriving through the check itself. Every cleanliness question in the repository now
  states `--untracked-files=normal` rather than inheriting an answer: both context builders,
  `scripts/submit-pr.ps1`, `scripts/verify-materialisation.ps1`, and `scripts/repository.mjs`. Under
  the usual configuration nothing changes.
- **A project name can no longer choose what the context builder deletes.** `--project` is an
  advertised option on both entry points, and its value named a temporary directory that the builder
  removed recursively; a name carrying path components aimed that delete outside the temporary root.
  Compose would have rejected such a name, but only after the context stage had run. Both twins now
  refuse anything outside a plain Compose project name, before reading the repository at all. Driven
  by a test that destroys a sentinel directory if the guard is removed.

**A red check is classified rather than counted** — `scripts/ci-triage.mjs`. This repository keeps two
jobs permanently red on purpose, so a reader that treats `conclusion: failure` alike either alarms on
correct governance evidence or learns to ignore it. Four things a red can mean, and three answers:

| | |
| --- | --- |
| `EXPECTED` | the evidence establishes the expected state — exit 0 |
| `ACTIONABLE` | the evidence establishes an unexpected state — exit 1 |
| `INDETERMINATE` | the evidence cannot establish the state — exit 2 |

`INDETERMINATE` is not a softer `ACTIONABLE`. A job that executed no step, an unreadable API, an
unreadable policy — none are evidence that the repository is wrong, and saying so would be its own
false claim. The same split `validate` already draws between `NON_COMPLIANT` and `NOT_EVALUATED`.

- The established rejection set is **derived from `project-policy.yml`**, never listed in the tool: a
  copied list would still call a cleared rejection expected. A test fails if any rejection id appears
  in the source.
- `classify()` is pure, so every terminal branch is reachable from a small structured fixture rather
  than a fabricated runner log. Log parsing is separate, tested against tiny raw specimens.
- Disagreement between the inside and outside evaluator placements is actionable and named as such —
  the one result neither arm can report alone.
- A reader, not a gate. It does not modify the policy, re-run checks, form its own compliance
  opinion, or suppress the jobs it interprets, and tests assert each of those.

**A verdict now names the commit it is about, and can be pointed at one.** The classifier addressed
its evidence only by pull request, and a pull request's checks describe its own head — which GitHub
does not update when a rebase merge rewrites the commit onto the base branch. Run against #29 after
that merge, it read `4d7088f` and its check runs while `develop` carried `69de0c8` and its own, and
returned `EXPECTED` about a commit that was no longer anywhere: a true verdict about the wrong
subject, the identity-versus-content substitution the submission gate already refuses.

- `--sha <commit>` and `--branch <name>` read check runs for a commit directly. Two targets is an
  error rather than a precedence rule — a reader asked about both has been asked two questions, and
  answering whichever is checked first is how the verdict lands on the wrong subject again.
- **Required-ness is answered per mode rather than defaulted.** A pull request is gated by its base
  branch, a branch by its own protection, and a bare commit by nothing that can be named — a commit
  may sit on any number of branches, so the question is reported as *unasked* rather than as an
  unreadable answer. A failing job is still actionable either way; only the wording changes.
- **An arm's outcome has two independent sources, and neither is required.** Only one workflow emits
  the `::error::` annotation, so a missing exit class is normal, not a failure to observe. When the
  printed verdict is *also* unreadable, the arm is now `INDETERMINATE`: previously the empty rule set
  compared against the policy's four rejections and reported them as cleared — a claim about the
  project derived from a defect in reading it.

## 2.0.0 — 2026-08-09

**`MAJOR`.** The must-never layer: nine new standards, 26 new rules, and a change to what the verdict
means. Three things can newly fail an adopter's `validate` **with no change to their code**:

- New `forbidden` rules, five of which are mechanically detected.
- One new `required` rule, `architecture.dependency-evaluation`.
- The unestablished-prohibition verdict rule — an applicable `forbidden` rule nobody examined caps
  the verdict at `NOT_EVALUATED` and exits 1.

**What did not change:** the policy schema (a 1.x policy file still satisfies it unchanged, though
its `standardVersion` value must be updated deliberately — see below), any rule id or alias,
and every exit-code meaning except the new `NOT_EVALUATED` trigger. See
[Upgrading from 1.x to 2.0](INSTRUCTIONS.md#upgrading-from-1x-to-20).

### Added — the must-never layer
- **A reusable `standards-validate` workflow**
  ([ADR 0013](artifacts/adr/0013-the-reusable-check-distributes-the-verdict-and-nothing-else.md)) —
  `.github/workflows/standards-validate.yml`, callable from any repository. It resolves an explicitly
  pinned framework revision, runs the authoritative `validate`, propagates its exit status, and
  publishes the verdict, the exit code's meaning, the counts, and the failing rule ids to the job
  summary. It carries no controller logic: it never declares a `standardVersion` of its own, so the
  consumer's policy remains the only declaration and the version-identity guard fires when the two
  disagree; `audit` runs as diagnostics under `continue-on-error` and cannot become a second verdict;
  exits 0, 1, and 2 stay distinguishable rather than collapsing into generic red; and the consumer
  working tree is checked for modifications afterwards, because CI validates and does not repair.
  A branch name for the revision is refused — there is no released tag yet, so a commit SHA is the
  only immutable reference available.


- **[Standard 45](standards/45-engineering-invariants.md)** — the umbrella. Defines what a
  prohibition *is* here: the semantics of `forbidden` (satisfied by absence of violating evidence,
  never by the project doing something), the exception discipline, the three verification classes
  mapped onto the assurance triple that already existed, and the verdict rule. R1 is the
  meta-standard — *standards and tests must never be weakened, removed, bypassed, or reclassified
  solely to permit an implementation that would otherwise violate them* — as a non-exemptible rule.
- **[46](standards/46-source-control-safety.md)** source control,
  **[47](standards/47-test-integrity.md)** test integrity,
  **[48](standards/48-error-handling-and-observability.md)** errors and observability,
  **[49](standards/49-data-safety.md)** data safety,
  **[50](standards/50-security-prohibitions.md)** security,
  **[51](standards/51-architecture-integrity.md)** architecture,
  **[52](standards/52-concurrency-and-shared-state.md)** concurrency,
  **[53](standards/53-ai-engineering-honesty.md)** AI engineering honesty.
- **26 catalog rules**, taking the catalog from 24 to 50: 23 `forbidden`, 1 `required`
  (`architecture.dependency-evaluation`, at `warning`), 2 `recommended`. Nine are `nonExemptible` —
  exactly the rules whose qualifier is internal to the prohibition.
- **The `forbidden` level is now in use.** It has been defined since 1.0.0 and used by nothing.
- **Multi-source inventory.** Standards may derive from more than one reviewed source document. Each
  source declares an extraction mode; each entry names its source. `reviewed-sections` is for a
  document with no numbered items: an entry names the headings it realizes, and
  `scripts/fidelity.mjs` verifies its quotes against the text of *those sections* rather than the
  whole file. A section may be claimed by one standard only, unless the entry sets `sharedSections`.

### Added — detectors

Five, each declaring in its doc comment which source view it scans and why — enforced by a test,
because the use/mention defect was fixed four times by narrowing which *files* are read and each fix
was insufficient.

| Rule | View | Covers |
| --- | --- | --- |
| `scm.no-committed-env-files` | filename only | `.env` and variants; example/template/sample/vault permitted |
| `security.no-secrets-in-artifacts` | `sourceOf` for code, raw text for config, never Markdown | Private-key headers and provider token prefixes. Excludes `.env` — one defect, one finding |
| `errors.no-swallowed-exceptions` | `structureOf` **and** raw over the **same span** | Each catch site located structurally, its body then read in both views: no handling code and no justification comment |
| `security.no-cert-bypass` | `structureOf` | `rejectUnauthorized: false` and its equivalents; a mention in a string or comment is not a bypass |
| `security.no-sql-concat` | `sourceOf` | A full SQL statement interpolated into a template literal or f-string |

### Changed
- **`npm test` no longer depends on shell globbing or on a Node newer than `engines` declares.**
  The command was `node --test "test/*.test.mjs"`, which works only where Node expands the pattern
  itself — a capability added in Node 22. CI pins Node 20 and `package.json` declares `engines: >=18`,
  so the gate had never been able to run its own suite; the first CI job that actually started, on
  2026-08-11, died with *Could not find .../test/\*.test.mjs* before a single test executed. Thirty
  runs going back to the repository's first day report failure, and every earlier one was the account
  billing block, so nothing had ever exercised it. `scripts/test.mjs` now computes the file list
  explicitly: the top level of `test/` only, because Node's directory discovery would otherwise run
  `test/fixtures/compliant/tests/routes.test.js` — fixture data, excluded from the self-audit for the
  same reason — and zero discovered files exits 2 rather than reporting an empty pass.
- **The evaluator no longer exempts its own source file from the audit.** `scripts/standards.mjs`
  excluded itself from the content scan by absolute path, so the same commit evaluated differently
  depending on whether the framework lived inside the repository being validated — 25 passed / 3
  failed from inside, 23 / 4 from outside, for identical content. The stated reason (this file names
  the packages it searches for) had already been superseded by `importPattern()`, and its scope had
  never matched its justification: one detector's vocabulary problem had become a repository-wide
  blind spot. Removed rather than narrowed; after removal no detector needs it. Found by rehearsing
  the reusable CI workflow, and now pinned by `test/distribution-fidelity.test.mjs`, which compares
  two clones of one commit on verdict, counts, per-rule results, and findings — not on exit code,
  which agrees in both arrangements and would have missed it.
- **`errors.no-swallowed-exceptions` decides by site rather than by counting.** It compared a count
  of empty-catch matches in the structural view against a count in the raw view and took the smaller
  — a conjunction with no subject identity. Two comment-justified catches and one raw match inside
  the detector's own explanatory comment produced `min(2, 1) = 1` and a violating site that did not
  exist. Each catch construct is now located structurally, its body found by brace matching, and that
  same span read in both views.
- **`splitSource` understands regex literals**, so a pattern table is no longer read as the code it
  describes. `raise NotImplementedError` in the unfinished-work patterns was structural code,
  and `quality.unfinished-work` reported the file that defines it. Regex contents are blanked in the
  structural view exactly as string contents are, and the structural view is now offset-aligned with
  the source, which is what made site matching possible above. An unrecognised regex is treated as
  ordinary code — the conservative direction, since a tokenizer that swallowed real code would hide
  violations rather than report ones that are not there.

- **`security.no-secrets-in-artifacts` moved from review-required to evaluated.**
- **Attestation freshness is computed from repository content, not checkout bytes** — a defect fix,
  and the one with the widest blast radius if it had shipped. `attestationDigests()` hashed
  working-tree bytes while Git's identity for a commit is normalised repository content, so three
  clean materialisations of one commit produced three different freshness answers and three attested
  `forbidden` rules evaluated as unestablished in CI. `scripts/repository.mjs` now digests each
  reviewed path with its committed blob identity under `git-blob-set-sha256-v1`, with no fallback:
  when Git cannot answer, the result is evidence unavailability rather than a second content
  identity. **Freshness became a separate axis from what the human decided** — `fresh`, `stale`,
  `legacy-unverifiable`, `evidence-unavailable` — because "the reviewed file changed" and "the
  comparison could not be performed" are different statements, and both were being reported as
  "nobody looked". The eleven existing digests are marked
  `digestAlgorithm: working-tree-bytes-sha256-v1` and deliberately **not** recomputed: a migration
  may classify existing provenance but may not upgrade its evidentiary strength without a new review.
  `npm run attestations` reports the inventory. See
  [ADR 0011](artifacts/adr/0011-attestation-freshness-is-repository-content-not-checkout-bytes.md).
- **`validate` now enforces version identity, and this closes a live defect rather than adding a
  feature.** A verdict may not be reported for standards version X unless the framework executing the
  run identifies itself as X. When `project-policy.yml` declares a `standardVersion` that differs
  from the framework's `VERSION`, `validate` produces **no verdict** and exits `2`; `--json` emits a
  typed `VERSION_MISMATCH` object with both versions rather than an envelope, because an envelope
  carries a `status` and that is the claim being refused.

  [Standard 21](standards/21-versioning.md) R5 has always required this — *reject a declared version
  you cannot resolve, never fall back to another and evaluate against it* — and the evaluator was
  doing precisely what it forbids: every run evaluated against the catalog on disk regardless of what
  the project declared, then labelled the result with the declared version. A policy pinned to
  `1.0.0` was judged by `2.0.0`'s rules and reported as `1.0.0`. One working tree made the two
  versions inseparable, so nothing could disagree; consuming a released framework separates them.

  This is an honesty guard, not version resolution. Nothing retrieves the rule set as it stood at a
  declared version, so a pin is enforced as a precondition on the run and not honoured as a selection
  of rules. That half of R5 remains deferred. `audit` is deliberately unchanged — it reports evidence
  and claims no standards version, so a version precondition there would gate a command whose
  contract does not depend on one.
- **The verdict.** `NOT_EVALUATED` has a new trigger and, from that trigger, exits 1. The engine
  change sits after the `NON_COMPLIANT` and `COMPLIANT_WITH_EXCEPTIONS` determinations so it cannot
  intercept the exception machinery, and both boundaries are tested.
- `test/audit.test.mjs`'s anchor test now resolves each `standardRef` against the file it names,
  rather than checking every anchor against Standard 44.
- The plan-breakdown detector tests content rather than presence (see below).

### Completion report

The source prompt asks for one at completion.

| | |
| --- | --- |
| **Prohibitions introduced** | 26 rules across 9 standards, plus `security.no-secrets-in-artifacts` newly evaluated |
| **Reused, not duplicated** | Secrets → [16](standards/16-security.md) R2 · destructive defaults → [2](standards/02-propose-vs-execute.md) R3 · scope → [10](standards/10-scope-change-management.md) R1 · contracts → [15](standards/15-ai-tool-contracts.md) · UI logic → [1](standards/01-human-and-ai-operability.md) R1 · stubs → [38](standards/38-definition-of-done.md) R5 · hidden skips → [30](standards/30-compliance-scoring.md) R3 and [28](standards/28-github-actions.md) R5 · duplicate-on-retry → [13](standards/13-idempotency.md). The full map is Standard 45 R4 |
| **Automated** | 2 fully (`scm.no-committed-env-files` structural; `quality.unfinished-work` already) |
| **Partial** | 3 code-analysis (`security.no-secrets-in-artifacts`, `errors.no-swallowed-exceptions`, `security.no-cert-bypass`, `security.no-sql-concat` — four detectors, all `partial`) |
| **Review-required** | 19 `manual-review` rules. Each standard states why, and none claims a weak detector instead |
| **Exceptions** | Defined per rule with conditions, justification, evidence, approval, and revisit conditions. Non-exemptible where the qualifier is internal: `meta.standards-not-weakened`, `testing.no-weakening-to-pass`, `testing.no-fabricated-results`, `errors.no-false-success`, `data.no-silent-discard`, `data.no-audit-corruption`, `security.no-disabled-access-controls`, `ai.no-fabricated-capabilities`, `ai.no-safety-bypass` |
| **Tests added** | 145 total, up from 125. Positive and negative fixtures per detector; all four rows of the verdict semantics table; both exception-precedence boundaries; a required-level negative control; every mutation plant caught |
| **Validation result** | Full gate green. `validate` reports `NON_COMPLIANT` on this repository — see below |
| **Remaining blind spots** | Git-history detection (test removal, coverage regression, history rewriting — each needs a previous state to compare against) · entropy secret scanning (brittle) · dynamic-evaluation detection (finding the call says nothing about the qualifiers) · destructive-command detection (`DROP TABLE` and `rm -rf` appear legitimately in migrations, teardown, and build scripts) |

### Dogfooded — this repository reports `NON_COMPLIANT` on itself

Thirteen prohibitions have no subject here and are declared not-applicable against repository
evidence: no database or migrations, no user data, no audit store, no production data, no
authentication or authorization anywhere in `scripts/`, no dynamic evaluation, no retry logic, no
concurrency, no observability subsystem.

Eleven were left unestablished by the implementing agent, and they are the ones about this
framework's own development — whether a standard was weakened to let an implementation pass, whether
a test was altered instead of a defect fixed, whether a capability was described without being
checked. An agent writing those would be manufacturing the evidence its own work needs to pass,
which is the failure [Standard 53](standards/53-ai-engineering-honesty.md) R5 names. They were held
for an owner review, and that review is what the record below reports.

**Two of the eleven were violations, found by the review and remediated before it would attest
anything.** `architecture.no-duplicate-implementations`: section-heading matching had been
implemented twice, in `scripts/inventory.mjs` and `scripts/fidelity.mjs`, in the same commit as
Standard 51 itself — now owned once by `scripts/sections.mjs`.
`architecture.no-hidden-global-state`: the rule has a real subject and was discharged the way
Standard 51 R1 asks, by [ADR 0007](artifacts/adr/0007-cli-scripts-are-single-run-programs-with-module-scoped-state.md)
naming all fourteen module-level bindings, their owner, and their reset boundary — not by declaring
the rule away because the process is short-lived, which would be the self-exemption
[Standard 34](standards/34-dogfooding.md) R3 prohibits. The ADR's first draft named two of the
fourteen and was rejected by the same review.

**Three are confirmed violations and are recorded as three.** They carry the first
`status: rejected` attestations this framework has issued — not waivers and not approvals, but the
record that a human looked and found a rule unmet, producing a failure rather than silence. None of
the three rules was amended to accommodate its finding.

- **`ai.no-safety-bypass`** — the execution sandbox was disabled during implementation to get past a
  blocked operation. That is what [Standard 53](standards/53-ai-engineering-honesty.md) R5 forbids,
  and *to complete a task* is exactly the internal qualifier that makes the rule non-exemptible.
- **`ai.no-fabricated-capabilities`** — ADR 0007 as first committed asserted that
  `scripts/standards.mjs` held two module-level bindings and that the other two scripts held three.
  Both counts were false, the document existed to be evidence for a Standard 51 R1 discharge, and it
  reached the shared branch before the same review corrected it.
- **`errors.no-false-success`** — `readText` turned an unreadable file into the empty string and
  `collectFiles` turned an unreadable directory into an empty traversal, so a detector could not tell
  *nothing was found* from *nothing could be searched*, and the run still exited 0. Reads were also
  truncated silently at 400 KB. This is [Standard 44](standards/44-existing-project-reconstruction.md)
  R12 — a negative result is evidence about the search mechanism first — failing inside the tool
  that supplies the evidence. **Since fixed** (below); the rejection stands as the record of what was
  found, and deliberately has not been rewritten into an approval.

### A clean audit result now states what it covered

`readText` returns `{ ok, text, truncated, bytes }` and `collectFiles` records what it could not
walk. Degraded reads still yield usable text — `""` for a failed read, the readable prefix for a
truncated one — so findings from a prefix are real findings and are kept. What changed is that the
caller can no longer mistake a partial search for a complete one. A fourth path of the same class
was found while implementing and is surfaced with the other three: the `MAX_FILES` traversal cap
stopped the walk silently.

The human report says it on the line that would otherwise imply completeness, beside the file count,
and `audit --json` carries an additive `evidenceSurface` object. Evidence loss is reported as audit
state, not as a rule failure: the findings carry `rule: null`, the existing idiom for observations
about what a repository *has* rather than whether it complies. Binding them to rules would make one
unreadable file fail every rule whose detector would have read it. Truncation is `info` rather than
`warning` — the cap is a deliberate bound, not a fault, and what it must never be is invisible.

Five tests, using real permission denial rather than a mocked failure path, each verifying the
restriction actually bit before asserting — a test that skipped when it could not restrict a path
would be the false green the change is about. All three original behaviours were mutated back and
each is caught. **Known gap, stated rather than implied:** the `MAX_FILES` branch is untested,
because exercising it means creating twenty thousand files.

**One rule took two reviews, and the defect in front of it was fixed between them.**
`architecture.no-boundary-bypass` was reviewed and the first review deliberately reached no verdict.
The evidence was a real breach of the three-way separation: result constructors in
`scripts/compliance.mjs` invented the metadata the catalog owns. Four hardcoded `level: "required"`,
and because `summarise()` scores on `level === "required"`, every attested or excepted **forbidden**
rule was silently counted into the required-rule score — the repository reported `84% over 19` where
the truth was `100% over 10`. Three more hardcoded `severity: "error"`, reporting an `info`-severity
rule as an error. But this rule's qualifier is *circumvented because going around it is easier*, and
nothing established that intent; stretching a prohibition after the fact to capture a defect it does
not name would be its own dishonesty. So the defect was fixed first and the rule reviewed after,
rather than approving over a live breach or rejecting on a qualifier the evidence never reached.

`metaOf()` now resolves both fields once — `level` from the policy where declared and the catalog
otherwise, `severity` from the catalog outright — and no constructor invents either. `validationType`
and `assurance` are deliberately excluded, as result provenance rather than rule identity, and the
attestation records that as an explicit interpretation rather than a proven property.

**The severity half is the interesting one.** It survived the level fix by a full review cycle for
exactly one reason: `severity` enters no number. An invented field that moves nothing visible is the
one that lasts, and the first two versions of the test written to catch it passed while it was
present, because every rule their fixture reached happened to be error-severity. The test is now
written over the *field set* rather than the sites — `CATALOG_OWNED` maps each field to how it
resolves — and it reaches non-error severities deliberately. Of eight constructor mutations, seven
are caught. The eighth is unobservable, because a rejected exception arises only on a non-exemptible
rule and every one of those is error-severity today; it is recorded as a blind spot with a test that
fails the day that catalog invariant stops holding and names the path to cover.

**The verdict is `NON_COMPLIANT` and the exit code is 1**, so CI on `develop` is red. That is the
correct representation of this repository's state, and preferable to withholding a known failure to
keep a build green. It is the mechanism working on its author, which is the only test of it that
counts.

**Three limitations of the attestation model surfaced by using it in anger**, all recorded in
[ADR 0006](artifacts/adr/0006-must-never-standards-are-forbidden-level-rules.md) and none filled
here — a mechanism for retiring a violation, invented alongside the violation, could only soften it.
A rejected attestation has no lifecycle — and, sharper, it is exempt from freshness entirely:
`judgeAttestation` returns the rejection before the staleness check, so an approved attestation goes
stale when its reviewed content changes while a rejected one stays rejected forever. Rewriting the
code `errors.no-false-success` was rejected over did not disturb its rejection at all. `reviewedAgainst`
can only digest files, so a claim whose evidence is Git history cannot have its freshness established
at all. And there is no state for *reviewed, inconclusive* — for one review cycle, `validate` filed
`architecture.no-boundary-bypass` under "nobody looked for these" while somebody had. That one
resolved when the underlying defect was fixed and the rule was attested, but only because the
inconclusive state was temporary. A review that stays inconclusive still has nowhere to live.

### Reconciled from the parallel detector-fix branch

Work developed concurrently on `standard-31-implementation-and-detector-fixes`, mostly against the
first outside adopter. It is folded in here rather than released separately: **`VERSION` stays
`2.0.0`.** The branch had set it to `2.0.1`, but 2.0.0 was never published — it is an unreleased
candidate that is deliberately `NON_COMPLIANT` — and a patch version after an unreleased minor
describes nothing. The branch supplied the argument against its own choice: it set `VERSION` to
`2.0.1` while `templates/project-policy.yml` still read `2.0.0`.

It was reconciled by **porting change by change, not by merging.** A merge would have let Git decide
which semantics survived, and the branch forked before the must-never layer, the verdict rules, and
the evidence-surface work existed. Every defect below was first reproduced on current `develop`; a
fix does not carry just because it fixed an older tree.

**Ported unchanged in substance — the defect reproduced here.**

- **An HTTP route in a README is not a missing file.** `/api/health` and `/users/:id` were reported
  as paths that do not exist. `documentation.code-consistency` now discriminates on the leading
  slash, admitting root-relative prose whose last segment carries a file extension.
- **An ADR directory is a durable home, not a particular path.** `docs/adr/` and `doc/adr/` — what
  Nygard's article and adr-tools established — now satisfy [Standard 11](standards/11-architecture-decision-records.md)
  R1, in the detector, the catalog, and `standards init`, which had offered to create an empty fourth
  directory beside a populated one.
- **`init` stamps the framework version** from `VERSION` rather than from whatever the template says.
- **[ADR 0008](artifacts/adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)
  — a detector may not assert repository state it never measured**, with
  `scm.no-committed-env-files` dropping from assurance `full` to `partial`. Both directions of the
  gap reproduce: a gitignored `.env` reported as committed *with rotation advised*, and — the worse
  direction, because nothing surfaces it — `planning.breakdown-directory`,
  `planning.one-file-per-section`, `architecture.project-manifest` and `documentation.architecture`
  all **passing** over gitignored content that no clone would contain.
- **[ADR 0009](artifacts/adr/0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md)
  — a detector reports an instance of its subject, never a discussion of it.**
- **[ADR 0010](artifacts/adr/0010-human-review-may-always-contribute-negative-evidence.md)** as
  `Proposed`: approval and rejection are not symmetric operations and should not share one
  permission, because a rejection cannot manufacture a pass.
- **Standards text that had drifted** — 28 (`--format json`, a flag the CLI rejects outright), 31
  (the R2 contract can now be honoured, and all twelve guarantees were verified present), 32 ("all 44
  standards", missed by the count sweep), 39, 42, 51.

**Corrected during reconciliation — the branch's fix was right and its explanation or test was not.**
These are recorded because they are evidence about how far the branch could be trusted, not only
about what it contained.

- **The `stampVersion` test proved nothing.** It asserted the written policy matches `VERSION`, which
  passes whether or not stamping happens, because on `develop` the two agree. Mutation-confirmed:
  replacing `stampVersion` with the identity function left it green. Replaced with a test against a
  stale template — the mismatch that actually occurred — which does catch the mutation.
- **A false claim about the runtime was rejected rather than imported.** The code was justified by
  saying a trailing `$` under `/m` fails on a `core.autocrlf` checkout. ECMAScript's `LineTerminator`
  set includes CR, so it does not. The code is unchanged and the rationale is corrected.
- **ADR 0008's `documentation.architecture` false pass is live, not latent** as recorded. The first
  reproduction attempt appeared to *refute* the ADR, because the fixture's README was under 400
  characters and that half of the same check fired first and masked it.
- **ADR 0009 gained the view model it was missing** — `structureOf` / `sourceOf` / `commentsOf` / raw
  config / filename-only, and what each establishes. Also the honest count: **5 of 22 detectors
  declare their view**, so the convention binds new detectors and is not yet universal.
- **ADR 0010's refusal behaviour was misstated.** Writing the refused attestation does not leave the
  rule `skipped`; it yields `invalid-attestation` / `failed` — a failure about a malformed policy
  rather than an unmet requirement, which is worse than the silence.
- **Standard 51 would have reintroduced a rejected claim.** Its R1 row named this repository's global
  state as "`findings` and `sources`" — the two-binding enumeration this release rejected twice. It
  reads as twenty bindings across three scripts, governed by categorical rule rather than by its list.

**Design-only, and deferred on purpose.** ADR 0008 records that repository state will come from a
narrow named seam that may shell out to `git`, with `unknown` as a first-class result — **no such
seam is implemented**, here or on the branch, and the false-pass class is pinned by characterisation
tests that assert today's wrong answer so that building it breaks them loudly. ADR 0010 is
`Proposed` with its open questions unresolved, and the attestation-model gaps in
[ADR 0006](artifacts/adr/0006-must-never-standards-are-forbidden-level-rules.md) stay open.

### Also in this release

Work that landed before the must-never layer and is folded in here rather than cut separately.

- **`templates/AGENTS.md`, `templates/CLAUDE.md`, and `templates/copilot-instructions.md`** — all
  three agent bootstrap templates [Standard 17](standards/17-agent-instruction-files.md) R1 names.
  `AGENTS.md` carries R3's load sequence in order; the other two defer to it and hold only what is
  specific to their own agent, so the three files cannot drift into competing definitions.
- **`standards init` writes all three**, completing the seven artifacts
  [Standard 33](standards/33-bootstrap-experience.md) R1 names.
- Tests enforcing R2 mechanically: each template must be shorter than the standard it routes to,
  each secondary file shorter than `AGENTS.md` and free of the load sequence, every template `init`
  names must exist, and a template must exist for every file R1's verbatim list names — that last
  check is what named the missing third template rather than leaving it to be noticed.
- The defer check reads the templates **with comments stripped**. It had been passing on a mention
  of `AGENTS.md` inside an explanatory comment — the part an adopter deletes on the way in — so a
  template whose body had stopped deferring would still have passed.
- **[Standard 44](standards/44-existing-project-reconstruction.md) R11** — tool-generated scaffolding
  is never evidence about the project, the consuming-side mirror of Standard 33 R7. `standards init`
  creates the plan directory *empty* in reconstruction mode, so a reconstruction that tests for the
  presence of that directory reads the tool's own output as proof a plan exists and refuses to run at
  exactly the moment it was needed.
- **[Standard 44](standards/44-existing-project-reconstruction.md) R12 — the validated-search
  invariant**, named so other standards can cite it: *a negative discovery result is evidence about
  the search mechanism before it is evidence about the project.* `UNKNOWN` requires the failed search
  to be recorded, and labels are one-way ratchets: `INFERRED` never becomes `OBSERVED` silently.
  Cross-referenced from Standards 24 and 29, which are the same idea for validators and for tests.
- **R9 provenance fields** — `confirmedBy` / `confirmedAt` / `question` / `reference`, deliberately
  the same shape as attestation provenance and deliberately not the same mechanism: a reconstruction
  confirmation is evidence about the *project*, an attestation is evidence about *rule compliance*.
- **`undated-owner-confirmation`** — a `CONFIRMED_BY_OWNER` label with no `(YYYY-MM-DD)` in
  `open-questions.md`. An answer whose age is unknown cannot be reassessed when the product changes.

### Fixed

- **The plan-breakdown detector tested presence, not content.** A `00-overview.md` holding nothing
  but headings satisfied it — the same defect `hasContent()` fixed inside `init`, one level up where
  nothing was left to catch it. It now reports an overview with no line outside its headings, and
  says plainly in Standard 44's `## Implementation` where that check stops.
- **`design/standards-audit-cli.md` claimed the audit was unimplemented.** It opened with "Nothing
  described here is implemented" while `scripts/standards.mjs` had shipped all sixteen of its finding
  categories since 1.0.0 — a Standard 32 R3 defect in the framework's own design record. Reframed as
  the implemented contract, with a table of the three places implementation went past the design.
- **`security.no-sql-concat` reported this repository on its first run.** The first version matched a
  bare `SELECT`, `WHERE`, or `ORDER BY`, and flagged `const where = ` in `scripts/catalog.mjs` — an
  ordinary variable named `where`. It now requires a full statement shape, and Standard 50 R3 records
  the episode: the brittle-check prohibition catching a check written under it, one commit later.

### Added

- **`templates/AGENTS.md`, `templates/CLAUDE.md`, and `templates/copilot-instructions.md`** — all
  three agent bootstrap templates [Standard 17](standards/17-agent-instruction-files.md) R1 names.
  `AGENTS.md` carries R3's load sequence in order; the other two defer to it and hold only what is
  specific to their own agent, so the three files cannot drift into competing definitions.
- **`standards init` writes all three**, completing the seven artifacts
  [Standard 33](standards/33-bootstrap-experience.md) R1 names.
- Tests enforcing R2 mechanically: each template must be shorter than the standard it routes to,
  each secondary file shorter than `AGENTS.md` and free of the load sequence, every template `init`
  names must exist, and a template must exist for every file R1's verbatim list names — that last
  check is what named the missing third template rather than leaving it to be noticed.
- The defer check reads the templates **with comments stripped**. It had been passing on a mention
  of `AGENTS.md` inside an explanatory comment — the part an adopter deletes on the way in — so a
  template whose body had stopped deferring would still have passed.
- **`standards init` now generates the agent operating rules into `AGENTS.md`**
  ([ADR 0012](artifacts/adr/0012-agent-operating-rules-are-generated-not-authored.md)) — ten lines
  telling an agent to read the policy first, to treat `audit` as evidence and `validate` as the
  verdict, never to call a skipped rule passing, never to weaken a standard or manufacture a result
  to obtain green output, never to self-attest, and never to bypass a safety control because it
  blocks completion. `scripts/agent-instructions.mjs` is the only editable copy; the block is written
  between markers and replaced on each run, carries the framework version read through the same
  `frameworkVersion()` as the policy stamp, and names the standard requirement, rule id, or ADR that
  governs every line — which is what keeps it an index under Standard 17 R4 rather than the fork R2
  prohibits. Tests resolve each citation against the file it names and assert the generated file
  stays shorter than the standard it routes to. It remains instruction generation, not enforcement:
  `validate` is still the authority and CI is still the gate.
- **[Standard 44](standards/44-existing-project-reconstruction.md) R11** — tool-generated scaffolding
  is never evidence about the project, the consuming-side mirror of Standard 33 R7. `standards init`
  creates the plan directory *empty* in reconstruction mode, so a reconstruction that tests for the
  presence of that directory reads the tool's own output as proof a plan exists and refuses to run at
  exactly the moment it was needed.
- **[Standard 44](standards/44-existing-project-reconstruction.md) R12 — the validated-search
  invariant**, named so other standards can cite it: *a negative discovery result is evidence about
  the search mechanism before it is evidence about the project.* `UNKNOWN` requires the failed search
  to be recorded, and labels are one-way ratchets: `INFERRED` never becomes `OBSERVED` silently.
  Cross-referenced from Standards 24 and 29, which are the same idea for validators and for tests.
- **R9 provenance fields** — `confirmedBy` / `confirmedAt` / `question` / `reference`, deliberately
  the same shape as attestation provenance and deliberately not the same mechanism: a reconstruction
  confirmation is evidence about the *project*, an attestation is evidence about *rule compliance*.

### Fixed

- **The plan-breakdown detector tested presence, not content.** A `00-overview.md` holding nothing
  but headings satisfied it — the same defect `hasContent()` fixed inside `init`, one level up where
  nothing was left to catch it. It now reports an overview with no line outside its headings, and
  says plainly in Standard 44's `## Implementation` where that check stops: whether prose that *is*
  there is a real plan or an untouched template is a judgement, and no scan makes it.
- **`design/standards-audit-cli.md` claimed the audit was unimplemented.** It opened with "Nothing
  described here is implemented" while `scripts/standards.mjs` had shipped all sixteen of its finding
  categories since 1.0.0 — a Standard 32 R3 defect in the framework's own design record. Reframed as
  the implemented contract, with a table of the three places implementation went past the design.

### Added — audit

- **`undated-owner-confirmation`** — a `CONFIRMED_BY_OWNER` label with no `(YYYY-MM-DD)` in
  `open-questions.md`. An answer whose age is unknown cannot be reassessed when the product changes.
  Scoped to that one document on purpose; Standard 44 records what the check does not cover.

### Dogfooded

**Attestation staleness fired for real, on its first opportunity.** Adding the two artifacts to
`init` changed `scripts/init.mjs`, one of the paths `ai.destructive-approval` was reviewed against.
The digest stopped matching, the attestation went stale, and the rule returned to `not-evaluated` —
dropping the run from 13 passed to 12 until a human looked again. It was renewed with a new digest
and a note on what changed, not silently refreshed. This is the mechanism working: the alternative
is an attestation that keeps asserting a review of code nobody reviewed.

## 1.1.0 — 2026-08-09

**`MINOR`.** Every change is a widening: an optional policy section, an optional catalog field, and
new `disposition` values. Nothing frozen at 1.0.0 changes meaning, and a 1.0.0 policy remains valid.

### Added

- **`attestations`** — the fourth first-class policy mechanism
  ([ADR 0005](artifacts/adr/0005-attestations-are-recorded-human-evidence.md)). Recorded human
  judgement for rules the catalog says a human evaluates. An attestation is *evidence*, not a waiver:
  it records who reviewed what and when, never overrides an automated failure, and does **not**
  produce `COMPLIANT_WITH_EXCEPTIONS`.

  ```text
  required rule
     ├── automated evidence ──────────────► evaluated result
     ├── human judgement ─────────────────► attestation
     ├── does not apply ──────────────────► not-applicable
     └── applies but intentionally waived ► exception
  ```

- **`attestable`** on catalog rules, defaulting to `validationType === "manual-review"`. A rule the
  catalog does not mark attestable cannot be satisfied by assertion.
- **Staleness** via `reviewedAgainst.paths` and `digest`. The validator digests the reviewed paths;
  when they differ the attestation is stale and the rule returns to `not-evaluated`. Content-based
  rather than revision-based, because invalidating every attestation on every commit would make the
  mechanism unusable.
- New `disposition` values: `attested`, `invalid-attestation`, `contradicted-attestation`,
  `attested-rejected`.
- **[Standard 33](standards/33-bootstrap-experience.md) R7** — tool-generated scaffolding is never
  evidence about the project. Found by this repository's own tests when `init` read its own empty
  plan directory as proof a plan existed.

### Fixed

- **A manual-review rule could be reported `passed` by an automated run** that simply found nothing.
  "No automated finding" is not evidence for a requirement whose evaluator is a human. Such rules now
  report `not-evaluated` unless a valid attestation establishes them.

### Dogfooded

`ai.destructive-approval` completed the lifecycle this release exists to make possible:

```text
not-applicable  →  applicable / not-evaluated  →  attested / PASS
```

It was `not-applicable` with the trigger *"`standards init` lands — it writes files"*. `init`
landed, the declaration was retired, and the rule sat honestly `not-evaluated` until a human review
was recorded against `scripts/init.mjs` and `test/init.test.mjs`. Nothing pretended static analysis
proved something it did not, and `manualReview` in the assurance breakdown is now non-zero for the
first time.

## 1.0.0 — 2026-08-09

The first published version. **This is the point at which the public surface becomes a contract.**

### The frozen surface

Changing any of these is a `MAJOR` release
([ADR 0004](artifacts/adr/0004-audit-and-validate-are-separate-commands.md)):

- CLI command names and their high-level semantics
- The project-policy schema (`schemas/project-policy.schema.json`)
- The 24 canonical rule IDs, and alias resolution behaviour
- The rule-catalog entry contract
- The validator JSON envelope
- Compliance statuses, `disposition` values, and exit-code meanings
- Score, assurance, and framework-coverage semantics

**Not frozen**, and not to be depended on: human-readable console wording, internal module layout,
implementation language, detector internals, ordering of non-semantic output.

### Added

- **44 standards** as normative documents, `standards/01`–`44`, each stating its own requirements and
  disclosing what is actually implemented versus specified.
- **`standards audit`** — evidence discovery. Reports what a repository has and where it departs from
  the standards. Needs no policy; never produces a verdict.
- **`standards validate`** — policy-aware compliance evaluation. Applies applicability, exceptions,
  and `nonExemptible`, and emits status, score, assurance, and framework coverage.
- **`standards init`** — bootstrap. Creates missing artifacts, never overwrites without a per-path
  opt-in, and routes greenfield / existing-with-plan / reconstruction-required.
- **Rule catalog** (`rules/`) — 24 rules across 8 categories, each carrying identity, level,
  severity, validation type, assurance, exemptibility, lifecycle metadata, and remediation.
- **Project policy** (`project-policy.yml`) and its **JSON Schema**, with `applicability` and
  `exceptions` as separate first-class mechanisms.
- **Compliance verdict** — `COMPLIANT`, `COMPLIANT_WITH_EXCEPTIONS`, `NON_COMPLIANT`,
  `NOT_EVALUATED`. Status is computed from rules and never from the score.
- **`frameworkCoverage`** — how much of the framework has been turned into rules, reported beside the
  verdict and never combined with it.
- **`INSTRUCTIONS.md`** — the adoption guide, and `templates/` for what an adopter copies.
- **Invariant checks**: source inventory, verbatim-source fidelity, diagram freshness, policy
  validity. All run in CI, none requires an install step.
- Four decision records: canonical status vocabulary, canonical rule identity, Mermaid as canonical
  diagram source, and the `audit`/`validate` split.

### Known limitations at 1.0.0

Stated here rather than discovered later, and each recorded in the standard that specifies it:

- The catalog covers **24 rules across 14 of 44 standards**; 5 standards are fully machine-
  represented. Rules outside it report `not-evaluated` rather than passing, so a `COMPLIANT` verdict
  covers less than the whole framework. `frameworkCoverage` reports this on every run.
- Several rules are `manual-review` or have no analyzer, and report `skipped / not-evaluated`.
- No rule has been deprecated or superseded yet, so the lifecycle fields are present and empty.

### Notes on getting here

Two shape changes to `schemaVersion` happened before this release and are now spent: numeric `1`, to
the string `"1.0"`, to `"1.0.0"`. Semantic versioning was chosen so `schemaVersion` and
`standardVersion` share a format — they remain independently versioned, and independence means they
may diverge numerically, not that they use different shapes.

# 06 — The must-never layer: standards 45–53

**Added 2026-08-11**, covering work merged on 2026-08-09 and 2026-08-10.

Standards 1–44 say what compliant work looks like. This layer says what must never be done, whatever
else is true. It came from a second reviewed source specification — an *Engineering Must-Never
Standards* document — folded in as an umbrella standard plus eight domain standards, and it is the
reason this repository's series runs to 53 rather than 44.

The mechanism was already there and dormant: the catalog defined a fourth level, `forbidden`, since
1.0.0, and `compliance.mjs` already failed a forbidden rule exactly as it failed a required one. No
rule used it. This layer is what activated it.

Source: the reviewed sections of
[`artifacts/prompts/second-fold-in-prompt.md`](../prompts/second-fold-in-prompt.md). Decisions:
[ADR 0006](../adr/0006-must-never-standards-are-forbidden-level-rules.md).

## Why a prohibition is not just a requirement with a negative name

This is the load-bearing idea of the section, and every item below depends on it.

A `required` rule is satisfied by evidence that the project **did** something. A `forbidden` rule is
satisfied by the **absence** of evidence that it did — `passed` means *no violation was found by the
stated search*, and never *the prohibited thing is absent*. The two are not symmetric, and the
asymmetry has a consequence the framework had to be changed to handle: for a required rule,
`not-evaluated` means *we did not check that you did the thing*, which is merely incomplete. For a
forbidden rule it means *nobody looked for the prohibited behaviour* — and reporting `COMPLIANT` over
an unexamined prohibition is a false green at the verdict level.

Standard 44 R12's validated-search invariant governs what any such clean result is worth: a negative
discovery result is evidence about the search mechanism before it is evidence about the project.

---

### Reshape the inventory so standards can derive from more than one source

- **Status:** COMPLETE — 2026-08-09, commit `8822ed2`
- **Evidence:** [`artifacts/standards-source-inventory.json`](../standards-source-inventory.json)
  with its `sources:` array; [`scripts/inventory.mjs`](../../scripts/inventory.mjs) and
  [`scripts/fidelity.mjs`](../../scripts/fidelity.mjs). `npm run inventory` and `npm run fidelity`
  are both CI steps.
- **Purpose:** The enabling change — nothing else in this section could land first. The inventory
  held a single source path and an `expectedCount` of 44, so `standards/45-*.md` could not exist
  without being reported as a file no entry claims.
- **Deliverables:** two extraction modes — `numbered-items` for the original spec, which has
  `N. Title` headings, and `reviewed-sections` for the second prompt, which has **no numbered items
  at all** and is mapped by the `##`/`###` headings each standard realises; per-standard source
  resolution in the fidelity checker.
- **Acceptance Criteria:**
  - Each standard's claimed-verbatim blocks are verified against **that standard's own source**, and
    for a `reviewed-sections` standard the quote must occur **within the text of one of its declared
    sections**. A section mapping that does not constrain the quotes is provenance theater.
  - A `sourceSections` value may be claimed by only one standard within a source unless the entry
    explicitly flags sharing — otherwise two standards can silently claim the same section as their
    whole provenance.
  - The existing `numbered-items` extractor is used unchanged for entries 1–44. The monotonic-ordering
    rule that caught the item-8 error still applies.
- **Verification:**
  ```bash
  npm run inventory && npm run fidelity
  ```
  Mutation-tested rather than trusted: pointing a `sourceSections` value at a heading that does not
  exist makes `inventory` exit 1, and altering one word inside a claimed-verbatim block makes
  `fidelity` exit 1. Both were confirmed and reverted.
- **Dependencies:** the original inventory invariant from [`02`](02-standards-backfill.md).

### Write standards 45–53

- **Status:** COMPLETE — 2026-08-09, commit `d13431d`
- **Evidence:** [`standards/45-engineering-invariants.md`](../../standards/45-engineering-invariants.md)
  through [`standards/53-ai-engineering-honesty.md`](../../standards/53-ai-engineering-honesty.md),
  their entries in [the inventory](../standards-source-inventory.json), and their rows in
  [`README.md`](../../README.md). Every claimed-verbatim block is checked by `npm run fidelity`
  against the second source.
- **Purpose:** Give the prohibitions the same normative, citable form the rest of the series has —
  45 as the umbrella that defines what *forbidden* means, 46–53 as the domains.
- **Deliverables:**

  | Std | Covers |
  | --- | --- |
  | 45 | Engineering invariants — the meta-standard, forbidden semantics, exception discipline, the reuse map, verification classes, and **R6, the unestablished-prohibition verdict rule** |
  | 46 | Source-control safety — committed env files, generated artifacts, shared-history rewriting |
  | 47 | Test integrity — weakening a test to pass, fabricated results, tautological tests |
  | 48 | Error handling and observability — swallowed exceptions, false success, unbounded retry, silenced failures |
  | 49 | Data safety — destructive defaults, migration rollback, silent discard, audit corruption, production data in dev |
  | 50 | Security prohibitions — disabled access controls, certificate bypass, SQL concatenation, untrusted execution |
  | 51 | Architecture integrity — hidden global state, boundary bypass, duplicate implementations, dependency evaluation |
  | 52 | Concurrency and shared state — unmanaged shared state as one failure family |
  | 53 | AI engineering honesty — fabricated capabilities, claims requiring execution, silent scope reduction, safety bypass |

- **Acceptance Criteria:**
  - Every requirement carries at least one verbatim-quoted block from its declared source sections,
    which is what exercises the fidelity guard above.
  - **Reuse over duplication.** Where the source's prohibition already has a home in standards 1–44,
    45 R4's reuse map points at that home rather than restating the rule under a new number. A second
    copy of a rule is a second thing to drift.
  - Each document carries an honest `## Implementation` section stating what is mechanically checked
    and what is not — including, where true, that nothing is.
- **Verification:** `npm run inventory && npm run fidelity && npm test`.
- **Dependencies:** the multi-source inventory above.

### Catalog the 26 forbidden-level rules

- **Status:** COMPLETE — 2026-08-09, commit `939a520`
- **Evidence:** [`rules/`](../../rules) — the new files `invariants.json`, `scm.json`,
  `testing.json`, `errors.json`, `data.json`, `concurrency.json`, and extensions to `security.json`,
  `architecture.json`, `ai.json`. Measured against the merged catalog on 2026-08-11: **50 rules
  total, 26 carrying `introducedIn: "2.0.0"`, of which 23 are `forbidden`**; 11 rules are
  `nonExemptible`, 9 of them introduced here.
- **Purpose:** Give each prohibition a canonical identity, so the standards text, the policy, and any
  adopting project refer to the same rule without any of them owning it.
- **Deliverables:** the rules, plus the policy declarations for them and `standardVersion: "2.0.0"`.
- **Acceptance Criteria:**
  - **Qualifier-internalized rules are `nonExemptible`.** Where a rule's own text already carries the
    only legitimate escape — *"merely to pass"*, *"solely to permit"* — an exception would be
    excepting the project from a rule it could simply not violate. The nine introduced here are
    `meta.standards-not-weakened`, `testing.no-weakening-to-pass`, `testing.no-fabricated-results`,
    `errors.no-false-success`, `data.no-silent-discard`, `data.no-audit-corruption`,
    `security.no-disabled-access-controls`, `ai.no-fabricated-capabilities`, and
    `ai.no-safety-bypass`.
  - Rules use **domain category prefixes**, never a `never.*` category. A prohibition about tests
    belongs with tests; grouping by prohibition-ness would split every domain in two.
  - Rule descriptions contain no trigger-shaped strings — the rules files are themselves scanned by
    the secret detectors below.
- **Verification:**
  ```bash
  npm test && npm run policy
  node scripts/standards.mjs validate . | grep "^  Framework:"
  ```
- **Dependencies:** the standards above, and the catalog in
  [`04`](04-compliance-and-policy-system.md).

### Implement the unestablished-prohibition verdict rule

- **Status:** COMPLETE — 2026-08-09, commit `939a520`
- **Evidence:** Standard 45 R6; the `summarise()` path in
  [`scripts/compliance.mjs`](../../scripts/compliance.mjs); the fixture policies under
  `test/fixtures/policies/`. Live in this repository's own output: `testing.no-fabricated-results`
  currently appears under *Unestablished prohibitions* as `[stale]`.
- **Purpose:** Stop a `COMPLIANT` verdict being reported over a prohibition nobody examined. This is
  Standard 38 R3's philosophy — an unverified thing is not a passing thing — raised from the finding
  level to the verdict level.
- **Deliverables:** the semantics, normative in 45 R6 and implemented in the engine:

  ```text
  forbidden + automated + pass                → satisfied
  forbidden + automated + violation           → NON_COMPLIANT
  forbidden + manual-review + attested clean  → satisfied
  forbidden + manual-review + no attestation  → verdict capped at NOT_EVALUATED
  forbidden + declared not-applicable         → skipped, excluded
  ```

- **Acceptance Criteria:**
  - `NOT_EVALUATED` from this trigger **exits 1**. A must-never rule nobody examined must not
    gate-pass CI.
  - **The cap must not intercept the exception machinery.** Evaluation order is fixed and each
    boundary is asserted: rejected exception on a `nonExemptible` rule → `NON_COMPLIANT`; automated
    violation → `NON_COMPLIANT`; valid exception on an exemptible rule → `COMPLIANT_WITH_EXCEPTIONS`;
    declared not-applicable → skipped; evaluated pass or valid attestation → satisfied; **none of the
    above → capped**. Only the last row is new.
  - `required` and `recommended` levels keep their existing semantics. A required `manual-review`
    rule with no attestation still permits `COMPLIANT`. Only `forbidden` is capped, and the negative
    control asserting that is part of the suite.
  - The human rendering **names** the unestablished prohibitions and states that this is not a
    finding against the project.
- **Verification:** `npm test` — all four semantics rows, both precedence boundaries, and the
  required-level negative control.
- **Dependencies:** the catalogued forbidden rules above; the verdict engine in
  [`04`](04-compliance-and-policy-system.md).
- **This is a MAJOR-shaped behaviour change and is disclosed as one.** A 1.x project adopting 2.0
  can newly cap at `NOT_EVALUATED` **with no code change on its side**. The migration section of
  [`INSTRUCTIONS.md`](../../INSTRUCTIONS.md) states the four resolution paths in order — evaluate,
  attest, declare not-applicable, except where exemptible.

### Build the five detectors, and honour the use/mention split

- **Status:** COMPLETE — 2026-08-09, commit `8519e71`
- **Evidence:** [`scripts/standards.mjs`](../../scripts/standards.mjs); the fixtures
  `test/fixtures/never-violations/` (one hit per detector) and `test/fixtures/never-clean/` (the
  negatives that matter). [ADR 0009](../adr/0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md).
- **Purpose:** Move what can be moved from `manual-review` to automated, so the attestation burden
  covers only what genuinely needs a human.
- **Deliverables:** five detectors in [`scripts/standards.mjs`](../../scripts/standards.mjs), their
  ids registered in `EVALUATED_RULES`, with a positive and a negative fixture each. The rules they
  evaluate, and the source view each one scans:

  | Rule | Source view | Why that view |
  | --- | --- | --- |
  | scm.no-committed-env-files | filename only | no content is read at all |
  | security.no-secrets-in-artifacts | source for code, raw text for config, never Markdown | secrets live in string literals; docs merely name the patterns |
  | errors.no-swallowed-exceptions | structure **and** raw text, both required | structure proves a real catch construct; raw text proves no justifying comment inside it |
  | security.no-cert-bypass | structure | a bypass named in a string or comment is not a bypass |
  | security.no-sql-concat | source | the interpolation lives inside the string literal |

  The middle one was an existing rule that had never been evaluated; the other four are new.
- **Acceptance Criteria:**
  - **Every detector's doc comment declares which source view it scans and why that view is correct
    for its signal** — `structureOf`, `sourceOf`, `commentsOf`, raw config text, or filename only. A
    detector that scans raw contents for a code signal reports any file that *names* a technology as
    *using* it. That bug shipped five times in this repository before the declaration was made
    mandatory; this is its structural fix, and
    [ADR 0009](../adr/0009-detectors-distinguish-instances-of-a-subject-from-discussion-of-it.md) is
    its record.
  - **One defect, one finding.** The secret detector excludes `.env` files entirely, because
    `scm.no-committed-env-files` already owns that failure at error severity; content-scanning them
    would double-report. The single-owner rule is documented in both Standard 46 and Standard 50.
  - Detectors state their subset honestly. Standard 50 R3 says a clean SQL result means *no supported
    pattern detected*, never *injection risk absent* — the string-concatenation form is deliberately
    undetected for false-positive reasons, and the standard says so rather than implying coverage.
  - A detector may not assert repository state it never measured
    ([ADR 0008](../adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)).
- **Verification:** `npm test`; self-audit produces zero new findings. Each detector was
  mutation-tested with a temporary plant — a dropped `.env`, a fake key in a `.yml`, an empty catch,
  a `rejectUnauthorized: false`, a SQL template literal — and each plant failed the self-audit test
  before being removed.
- **Dependencies:** the catalogued rules above.
- **The detector that reported its own repository.** `8519e71`'s message records it: the first
  working secret detector matched the patterns written in the detector itself. Same family as the
  three false positives in [`03`](03-standards-audit-cli.md), and the reason the source-view
  declaration is now a review gate rather than advice.

### Dogfood the layer — this repository re-earns its verdict

- **Status:** COMPLETE as an item; the verdict it produces is `NON_COMPLIANT` and that is the
  intended outcome. Commits `69d8454`, `0dfe27c`, and the review events since.
- **Evidence:** [`project-policy.yml`](../../project-policy.yml) — **13 rules declared
  not-applicable**, each on stated grounds with a `revisitWhen`; six attested; four rejected; one
  stale. `node scripts/standards.mjs validate .` reports no applicable forbidden rule as
  `unrecorded`.
- **Purpose:** A framework that exempts itself from its own new layer has demonstrated nothing. The
  sweep is what turned 26 catalogued rules from a specification into a claim about this repository.
- **Deliverables:** for every applicable forbidden `manual-review` rule, an owner attestation or a
  reasoned not-applicable declaration.
- **Acceptance Criteria:**
  - **No blanket declarations.** Each not-applicable is decided on its own subject —
    `data.no-prod-data-in-dev` because no production data exists here, `security.no-untrusted-exec`
    because nothing executes external input, and so on. `a0962d1` exists solely to say *why* a
    fixture may declare `meta.standards-not-weakened` not-applicable.
  - **No rule left unestablished.** A test asserts that this repository's own policy leaves no
    applicable forbidden rule with nothing recorded against it.
  - **No self-attestation.** Every attestation is the owner's.
- **Verification:**
  ```bash
  node scripts/standards.mjs validate .
  npm test    # includes the no-unestablished-prohibition assertion against this repo's policy
  ```
- **Dependencies:** everything above in this section, and the attestation machinery in
  [`05`](05-attestations-and-provenance.md).
- **`NON_COMPLIANT` is the honest verdict and must not be tidied away.** It is caused by four
  recorded human rejections, not by unexamined rules. The gate is passing on *truthfulness*, not on
  the letter `COMPLIANT` — see [`07-distributed-validation-and-ci.md`](07-distributed-validation-and-ci.md)
  for how CI is arranged so this can be true without the build being permanently red.

### Fix the detector defect against security test fixtures

- **Status:** READY
- **Tracked by:** GitHub issue
  [#3](https://github.com/mikeycdavis/EngineeringStandards/issues/3)
- **Evidence:** the issue is open as of 2026-08-11 with no fix on `develop`.
- **Purpose:** The credential-shaped-value rule cannot distinguish a security test fixture from a
  real committed credential. That is a precision defect with a specific consequence: a project whose
  security tests contain deliberately credential-shaped strings gets a finding it cannot resolve
  except by weakening the rule — which Standard 47 R1 forbids it from doing.
- **Deliverables:** a way for a fixture to be recognised as a fixture that does not amount to an
  arbitrary suppression mechanism.
- **Acceptance Criteria:**
  - Whatever the mechanism, it must not let a real committed credential be excluded by labelling its
    file a fixture. A suppression that anyone can apply to anything is not a fix.
  - The `never-clean` and `never-violations` fixtures both still behave as they do today.
  - The detector's declared source view is restated or unchanged, not quietly widened.
- **Verification:** `npm test`; self-audit stays at zero error findings; a plant of a real-shaped key
  outside a fixture is still caught.
- **Dependencies:** the detectors above.

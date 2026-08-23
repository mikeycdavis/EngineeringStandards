# 04 — The compliance and policy system

**Added 2026-08-11**, covering work merged between 2026-08-08 and 2026-08-11 that the original
four-section plan never contemplated. The plan described a repository whose product was
`standards audit`. Its product is now `standards audit` **plus** `standards validate` — and
`validate`, not `audit`, is the authoritative verdict. This section is the missing half.

Section [`03`](03-standards-audit-cli.md) covers the command that gathers **evidence**. This one
covers the machinery that turns evidence into a **verdict**: a catalog that defines what rules exist,
a policy that says which of them apply to a given project, and an engine that combines the two with
the evaluator's findings and states an outcome.

## The architectural law this section exists to hold

Stated once, because every item below is a consequence of it:

> **The catalog defines rule identity and metadata. The policy defines project applicability. The
> evaluator produces evidence. None of the three may redefine the others.**

A rule's level and severity are the catalog's, always — including on the failure paths, which is
where two defects were found and fixed (`62e9a5b`, `9e2862d`). A project may declare a rule
not-applicable or except it; it may not decide that a `forbidden` rule is really a `recommended` one.
The evaluator may report that it found a violation; it may not decide what that violation means for
the verdict. The separation is enforced mechanically by `assertBindings`, which throws when the
evaluator claims a rule id the catalog does not define.

*Why it matters enough to be law:* a project that can restate a rule's severity can always reach
`COMPLIANT`, and a framework in which the audited party writes the rules produces a **false green** —
the one failure class this repository exists to prevent.

---

### Build the rule catalog as the single source of rule identity

- **Status:** COMPLETE — 2026-08-08, commit `d05cbdf`
- **Evidence:** [`rules/`](../../rules) — fourteen JSON files defining **50 rules** as of
  2026-08-11, loaded by [`scripts/catalog.mjs`](../../scripts/catalog.mjs).
  [ADR 0002](../adr/0002-canonical-rule-identity.md) records the identity decision. `npm test`
  includes catalog contract tests; `npm run policy` fails if the policy names a rule the catalog does
  not define.
- **Purpose:** Give every checkable requirement a stable id that the policy, the evaluator, the
  standards documents, and any adopting project can all refer to without any of them owning it.
  Before this, a finding category *was* its own definition, so a rule could mean different things in
  the tool and in the document that motivated it.
- **Deliverables:** the JSON catalog under [`rules/`](../../rules), a loader with a validating
  contract, and four levels — `required`, `recommended`, `optional`, `forbidden`.
- **Acceptance Criteria:**
  - Every rule carries an id, a level, a severity, a `validationType`, an assurance value, the
    standard it derives from, and its lifecycle fields (`introducedIn`, `aliases`, and the
    deprecation nulls).
  - `validationType: code-analysis` implies assurance `partial`; `manual-review` implies `none`. An
    evaluator cannot claim more assurance than its method affords.
  - A rule id claimed by the evaluator but absent from the catalog is a hard error, not a warning.
  - Rule descriptions contain no trigger-shaped strings — the catalog is itself scanned by the
    secret detectors, so a realistic-looking `AKIA…` in a description would make the repository
    report itself.
- **Verification:**
  ```bash
  npm run policy && npm test
  node scripts/standards.mjs validate . | grep "^  Framework:"   # → 50 rule(s) catalogued
  ```
- **Dependencies:** the audit command in [`03`](03-standards-audit-cli.md), whose finding categories
  the first rules were derived from.

### Make the project policy the only place applicability is decided

- **Status:** COMPLETE — 2026-08-08, commits `b8a0100`, `d05cbdf`
- **Evidence:** [`project-policy.yml`](../../project-policy.yml),
  [`schemas/project-policy.schema.json`](../../schemas/project-policy.schema.json),
  [`scripts/policy.mjs`](../../scripts/policy.mjs), and
  [`scripts/yaml.mjs`](../../scripts/yaml.mjs) — a hand-written YAML subset parser, because the
  zero-dependency rule admits no library. `npm run policy` is a CI step in its own right.
- **Purpose:** Let a project say which rules apply to it without letting it say what those rules
  mean. Applicability is a real and legitimate project decision — a repository with no production
  data genuinely has no subject for `data.no-prod-data-in-dev`. Severity is not.
- **Deliverables:** the policy file, a JSON Schema for it, a validator, and four declaration
  mechanisms: applicability, not-applicable declarations carrying a `revisitWhen`, exceptions under
  [Standard 20](../../standards/20-exceptions.md), and attestations (covered in
  [`05`](05-attestations-and-provenance.md)).
- **Acceptance Criteria:**
  - The schema only ever widens across versions: a 1.x policy file still validates against the 2.0
    schema. Adopters must not be broken by a framework release that changes no rule they use.
  - A not-applicable declaration requires a `revisitWhen` — a project may exclude a rule, but not
    silently and not permanently.
  - A rule marked `nonExemptible` in the catalog cannot be excepted by policy; attempting it yields
    disposition `rejected-exception` and `NON_COMPLIANT`, not a quiet pass.
  - `standardVersion` in the policy must match the framework version that produced the verdict —
    a verdict labelled with a version that did not produce it is refused (`11d8632`).
- **Verification:**
  ```bash
  npm run policy
  npm test   # includes the 1.x-policy-still-validates compatibility test
  ```
- **Dependencies:** the catalog above.
- **The self-exemption problem, and why it is worth stating.** This repository's own policy is the
  most dangerous artifact in it. Every mechanism here — not-applicable, exception, attestation — is a
  way for the audited party to stop a rule failing. Three separate defects were found in which this
  repository had used one of them on itself without adequate grounds; each was fixed by removing the
  exemption rather than by weakening the rule (`e0bebbf`, `43fdad2`, `49e4825`). The general
  discipline: when the framework and the project are the same repository, an exemption should be
  read as a finding about the framework first.

### Split `audit` from `validate`, and freeze the public surface

- **Status:** COMPLETE — 2026-08-09, commit `9b85e21` (v1.0.0)
- **Evidence:** [ADR 0004](../adr/0004-audit-and-validate-are-separate-commands.md);
  [`scripts/standards.mjs`](../../scripts/standards.mjs) and
  [`scripts/compliance.mjs`](../../scripts/compliance.mjs). Both commands are exercised in `npm test`
  and both run in [CI](../../.github/workflows/ci.yml).
- **Purpose:** An evidence survey and a compliance verdict are different claims with different
  audiences and different failure modes, and merging them lets either borrow the other's authority.
  A clean `audit` means *nothing matched the patterns*; it does not mean the project is compliant,
  and before the split it read as though it did.
- **Deliverables:** `audit` producing findings, `validate` producing a verdict, and a closing line on
  every `audit` run stating that it is evidence rather than a verdict.
- **Acceptance Criteria:**
  - `audit` never prints a compliance status; `validate` never presents itself as a survey.
  - A clean `audit` result says what it covered rather than implying completeness (`e42ef84`).
  - CI runs `audit` **without** `--strict`. A flag that fails the build on advisory findings turns
    every warning into a broken build, and the predictable outcome is that someone disables the step.
    The error-level gate lives in `test/audit.test.mjs` instead.
- **Verification:**
  ```bash
  node scripts/standards.mjs audit .     # last line: "This is evidence, not a verdict."
  node scripts/standards.mjs validate .  # prints Status / Score / Rules / Cover
  ```
- **Dependencies:** the catalog and policy above.

### Build the verdict engine

- **Status:** COMPLETE — 2026-08-08 onward, commits `d05cbdf`, `1347b9b`, `62e9a5b`, `9e2862d`,
  `939a520`
- **Evidence:** [`scripts/compliance.mjs`](../../scripts/compliance.mjs); the fixture policies under
  `test/fixtures/policies/`; `test/compliance.test.mjs`.
- **Purpose:** Combine catalog, policy, and findings into one honest outcome, including the outcomes
  that are neither pass nor fail.
- **Deliverables:** the disposition/status/verdict model, the score, the coverage triple, and the
  `frameworkCoverage` metric.
- **Acceptance Criteria:**
  - **The score is not the verdict.** The score is a summary statistic over *evaluated required*
    rules; the status is the verdict; a skipped rule is neither a pass nor a failure. The renderer
    says this in words on every run, because a percentage is the number people quote.
  - **Framework coverage is reported separately and never combined with compliance** — it measures
    maturity of the tooling, not conformance of the project. Two numbers that mean different things
    must not become one number (`1347b9b`).
  - A rule's level and severity are read from the catalog on every path, including the failure and
    exception paths.
  - Exception precedence is fixed and tested at every boundary: rejected exception on a
    `nonExemptible` rule → `NON_COMPLIANT`; automated violation → `NON_COMPLIANT`; valid exception on
    an exemptible rule → `COMPLIANT_WITH_EXCEPTIONS`; declared not-applicable → skipped and excluded.
- **Verification:**
  ```bash
  npm test          # the four semantics rows plus both precedence boundary tests
  npm run validate
  ```
- **Dependencies:** the catalog, policy, and the `audit`/`validate` split above.
- **Known gap — the exception machinery is incomplete.** Two defects are open against it, both
  claimed by items later in this section rather than left as unowned issues.

### Close the exception-machinery gaps

- **Status:** READY — both defects are diagnosed and neither is blocked on anything
- **Tracked by:** GitHub issues
  [#10](https://github.com/mikeycdavis/EngineeringStandards/issues/10) and
  [#11](https://github.com/mikeycdavis/EngineeringStandards/issues/11)
- **Why these pointers are hand-verified.** `Tracked by` here names GitHub rather than a backlog
  item, because this repository has no `artifacts/backlog/` and the audit's reference resolver
  understands only backlog ids — the coupling defect owned by section 08. Kept out of the
  `Tracked by` field deliberately: an issue mentioned in passing inside that field is
  indistinguishable, to any automated ownership check, from an issue the item claims. That is the
  same use/mention problem the detectors have, one layer up, and it made the
  claimed-exactly-once invariant unverifiable until this prose was moved.
- **Evidence:** both issues are open as of 2026-08-11 and neither has a fix on `develop`. This is
  the only item in this section that is not complete.
- **Purpose:** The policy template names an exception as one of the four ways to resolve a forbidden
  rule, and for `manual-review` forbidden rules it is currently the one that does not work. A
  documented resolution path that silently does nothing is worse than an undocumented one, because
  an adopter who takes it believes the rule is resolved.
- **Deliverables:**
  - **#10** — an exception declared on a `manual-review` `forbidden` rule must have an effect, or
    the policy template and the `validate` guidance must stop naming it as a resolution. Decide
    which; do not leave the two disagreeing.
  - **#11** — a staged or unapproved state for an exception, matching the one attestations already
    have. Today an exception is either absent or in force; there is no way to record one as proposed
    and awaiting approval, which is precisely the state a reviewer needs to see.
- **Acceptance Criteria:**
  - For #10: a fixture policy declaring an exception on a `manual-review` forbidden rule produces a
    result the test asserts explicitly — whichever behaviour is chosen, it is no longer silent.
  - For #11: the staged state round-trips through the schema, is rendered distinctly by `validate`,
    and does **not** suppress the failure it concerns. A staged exception is a request, not a grant.
  - Neither fix may widen what an exception can do to a `nonExemptible` rule.
- **Verification:** `npm test` with the new fixtures; `npm run policy`; the schema-compatibility test
  still passes, since both changes must widen the schema rather than alter it.
- **Dependencies:** the verdict engine above.

---

## What this section deliberately does not cover

- **Attestations**, though they are a policy mechanism — they carry provenance, freshness, and
  append-only review history that need their own treatment. See
  [`05-attestations-and-provenance.md`](05-attestations-and-provenance.md).
- **The forbidden level and the rules that use it** — see
  [`06-must-never-standards.md`](06-must-never-standards.md). The level was defined here in 1.0.0 and
  used by zero rules until then.
- **The unestablished-prohibition verdict rule**, which is implemented in `compliance.mjs` but is
  normatively Standard 45 R6 and is covered in [`06`](06-must-never-standards.md) with the rest of
  the must-never layer.
- **Getting the verdict into other repositories** — see
  [`07-distributed-validation-and-ci.md`](07-distributed-validation-and-ci.md).

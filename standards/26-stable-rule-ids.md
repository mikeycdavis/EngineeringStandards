# Standard 26 — Stable Rule IDs

A rule ID is an identity, not a label. Treat it like a database key: assigned once, never reused, and
resolvable long after the rule itself has changed or gone.

Source: item 26 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **identity and lifecycle** for rules. What rules check belongs to
[Standard 24](24-validator-rules.md), how results are reported to
[Standard 25](25-validator-output.md), and the registry to [Standard 27](27-rule-catalog.md).

## Requirements

### R1 — Every enforceable standard has a stable ID

**Every enforceable standard should have a stable machine-readable ID.** Examples, reproduced
verbatim from the source:

```text
planning.breakdown-directory
planning.one-file-per-section
planning.acceptance-criteria
planning.verification
planning.handoff

audit.business-state
audit.actor-attribution

ai.non-ui-capabilities
ai.provider-neutral
ai.propose-execute
ai.destructive-approval

architecture.project-manifest
architecture.adr

security.no-secrets-in-artifacts

verification.before-completion
```

The form is `category.kebab-case-name`. The category groups; the name identifies.

### R2 — IDs do not change casually

**Rule IDs should not change casually because external systems such as WhatsNext may reference
them.**

They are also referenced by every project's exceptions ([Standard 20](20-exceptions.md)), which may
sit in a policy file for years. Changing an ID silently invalidates every exception written against
it, and the failure mode is quiet: the exception no longer matches any rule, so the rule applies
again with nobody told.

### R3 — The lifecycle rules

These are the operative rules, and they behave like database keys:

1. **Never reuse a retired ID for a different meaning.** The ID is permanently spent. A reused ID
   makes historical references resolve to something they never meant — which is worse than not
   resolving at all, because it fails silently.
2. **Renaming a rule's title does not change its ID.** Titles are prose and may be improved freely.
3. **Moving a rule between documents does not change its ID.** Identity is independent of where a
   rule is written down; reorganising the standards must not break every reference to them.
4. **A material semantic change MAY require a new ID** — specifically when the old and new meanings
   cannot safely coexist. If an exception written against the old meaning would be wrong under the
   new one, the change needs a new ID; the old is deprecated and superseded.
5. **Deprecated IDs remain resolvable.** A validator MUST still resolve a deprecated ID, report what
   replaced it, and be able to explain it. Projects and exceptions reference these for years.

The judgement in rule 4 is worth stating plainly: **ask whether an existing exception against this
rule would still mean what its author intended.** If yes, the change is a clarification and the ID
stands. If no, a project has been silently moved from an approved waiver to an unapproved one, and
that requires a new ID so the mismatch surfaces.

### R4 — Deprecation is recorded, not implied

A rule being deprecated, superseded, or removed MUST be recorded in the catalog
([Standard 27](27-rule-catalog.md)) with the version it happened in and what replaced it. A rule that
simply disappears from the catalog leaves every reference to it dangling with no explanation.

Removing a rule is a `MAJOR` change ([Standard 21](21-versioning.md) R2), because policies and
exceptions referencing it break.

### R5 — One ID, one rule, everywhere

The same ID MUST identify the same rule in the catalog, in validator output
([Standard 25](25-validator-output.md) R3), in policy declarations, and in exceptions. There is no
separate "policy key" namespace and no per-tool aliasing.

Where a policy key and a rule ID differ in form — the source's policy shape uses
`ai.uiCapabilitiesMustBeAgentOperable` while its rule ID list uses `ai.non-ui-capabilities` — that is
a **defect to reconcile**, not two valid names.

**This is resolved by [ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md): the rule ID wins,
and a policy key path, dot-joined, MUST equal the rule ID exactly.** The camelCase forms become
recorded aliases in the catalog ([Standard 27](27-rule-catalog.md)) — accepted on read with a
warning, resolved to the canonical ID, and never emitted. An alias is not a peer name and resolves in
one direction only.

## Additions this standard makes beyond the source

- R3 in full — the five lifecycle rules, and the test for when a semantic change needs a new ID. The
  source says IDs should not change casually without saying what casually means or what happens when
  a change is warranted.
- R4 and R5 in full, including the observation that the source's own policy keys and rule IDs do not
  agree, and the resolution recorded in [ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md).
- R2's point that exceptions, not just external systems, depend on ID stability.

## Relationship to other standards

[Standard 27](27-rule-catalog.md) is where IDs and their lifecycle metadata live.
[Standard 20](20-exceptions.md) exceptions reference rules by ID, which is why R2 matters.
[Standard 21](21-versioning.md) governs the version in which a deprecation or removal lands.
[Standard 25](25-validator-output.md) R3 carries `ruleId` on every result.

## Implementation

**Not implemented.** `scripts/standards.mjs` uses finding category ids — `missing-planning-artifacts`,
`plan-code-discrepancies` — which are stable in practice but are *finding* categories rather than
rule IDs, and do not follow the `category.name` form.

The two vocabularies will need reconciling when the catalog lands. That is a real migration, not a
rename: anything already referencing a finding id would break, which is precisely the situation R3
exists to govern.

# Standard 21 — Versioning

Three different things carry versions in this series, and conflating them is the failure this
standard exists to prevent: the **standards framework**, the **version a project declares**, and the
**machine contracts** a project publishes.

Source: item 21 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to the standards series itself, and to any project declaring compliance with it. Part of the
governance layer with [20](20-exceptions.md), [22](22-adoption-and-migration.md), and
[23](23-standards-validator-cli.md).

## Requirements

### R1 — Three versions, related but independent

| Version | Owned by | Changes when | Declared in |
| --- | --- | --- | --- |
| **Framework version** | This repository | A standard is added, clarified, or made stricter | `VERSION` |
| **Declared version** | Each project | The project chooses to adopt a different framework version | `standardVersion` in `project-policy.yml` |
| **Contract version** | Each machine interface | Its observable semantics change ([Standard 15](15-ai-tool-contracts.md)) | The schema itself |

They move independently. The framework releasing `1.2.0` does not change any project's declared
version — a project stays on `1.0.0` until it decides to migrate, which is what makes
[Standard 22](22-adoption-and-migration.md)'s incremental adoption possible. A project's API going to
`3.0.0` says nothing about which standards version it follows.

The conflation to avoid: treating a framework release as something projects are automatically on. A
project that has not declared a version has not adopted the standards, and a validator MUST NOT
assume one for it.

### R2 — Semantic versioning for the framework

Use semantic versioning, for example `1.0.0`, with these meanings reproduced verbatim from the
source:

```text
PATCH
clarification that does not change compliance

MINOR
new backward-compatible rule or capability

MAJOR
breaking compliance requirement
```

The test is the effect on a **currently compliant project**:

| Change | Level | Because |
| --- | --- | --- |
| Rewording for clarity; adding an example or rationale | `PATCH` | A compliant project stays compliant |
| Adding a new `recommended` rule | `MINOR` | Nothing that passed now fails |
| Adding a new `required` rule | **`MAJOR`** | A previously compliant project now fails |
| Tightening an existing rule's threshold | **`MAJOR`** | Same reason |
| Making a rule non-exemptible ([Standard 20](20-exceptions.md) R4) | **`MAJOR`** | Existing exceptions become invalid |
| Changing an enumeration's members | **`MAJOR`** | Policies and schemas referencing it break — see [Standard 19](19-json-schema.md) R4 |

The trap is a "clarification" that narrows what a rule permits. If a project that passed yesterday
fails today, the change was `MAJOR` however it was described — the same principle
[Standard 15](15-ai-tool-contracts.md) R5 applies to tool contracts.

### R3 — Maintain VERSION and CHANGELOG.md

Maintain, reproduced verbatim from the source:

```text
VERSION
CHANGELOG.md
```

`VERSION` is what a validator resolves a project's `standardVersion` against. The changelog SHOULD
record, for each release, which standards changed and at what level — a project deciding whether to
migrate needs to know what breaks, not just that something did.

### R4 — Projects declare the version they implement

**Projects should declare the standard version they implement**, in `standardVersion`
([Standard 18](18-machine-readable-project-policy.md) R2).

### R5 — An unresolvable declared version is an error

**A validator MUST reject a declared standards version it cannot resolve.** It MUST NOT fall back to
the latest version, or to any other version, and evaluate the project against that.

Validating against a version the project did not declare produces a verdict about a project that does
not exist. The failures would be real rule failures, reported against rules the project never agreed
to, and a project pinned to `1.0.0` would appear to fail requirements introduced in `2.0.0` — the
precise opposite of what pinning is for.

This is an invocation error rather than a compliance failure, and
[Standard 23](23-standards-validator-cli.md) gives it exit code `2`: the validator could not do its
job, as distinct from doing it and finding problems.

The same applies to a **missing** `standardVersion`. A project that declares no version has not
adopted the standards, and the honest report is that there is nothing to validate against — not a
silent assumption of the newest release.

## Additions this standard makes beyond the source

- R1 in full — the three-version model and its table. The source describes framework versioning and
  project declaration without distinguishing them from the contract versioning of
  [Standard 15](15-ai-tool-contracts.md), and the three are routinely confused.
- R2's table and the currently-compliant-project test, including the clarification trap.
- R5 in full — that an unresolvable or missing declared version is an invocation error, never a
  fallback.
- R3's requirement that the changelog record which standards changed at what level.

## Relationship to other standards

[Standard 18](18-machine-readable-project-policy.md) R2 is where a project declares its version;
[Standard 22](22-adoption-and-migration.md) is how a project moves between versions without
rewriting its history; [Standard 20](20-exceptions.md) exceptions are written against a specific
version's rules, which is why making a rule non-exemptible is `MAJOR`;
[Standard 23](23-standards-validator-cli.md) resolves the declared version and reports failure to do
so as exit `2`.

## Implementation

**No skill implements this standard.**

This repository does not yet publish `VERSION` or `CHANGELOG.md` — the series is incomplete, and
declaring `1.0.0` before every standard exists would be a version nobody could meaningfully adopt.
Both are prerequisites for the first release rather than optional extras, and
`scripts/inventory.mjs` already tracks how far off that is.

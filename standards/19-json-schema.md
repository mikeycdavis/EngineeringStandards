# Standard 19 — JSON Schema

The schema is what makes a policy *executable configuration* rather than a YAML file nobody checks.
Its job is to make invalid and unknown values **fail deterministically**, not to be permissive.

Source: item 19 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to any project publishing a machine-readable policy under
[Standard 18](18-machine-readable-project-policy.md). Completes the policy-as-configuration group
with [16](16-security.md), [17](17-agent-instruction-files.md), and [18](18-machine-readable-project-policy.md).

## Requirements

### R1 — Create the schema

Create:

```text
schemas/project-policy.schema.json
```

It MUST validate project policy files.

### R2 — What the schema covers

It MUST include, reproduced verbatim from the source:

- enum validation
- required properties
- semantic version format where appropriate
- directory/path fields
- exception structures
- unknown-property handling

The source adds, as a separate requirement rather than a list entry: **"Provide clear validation
errors."** R6 below covers it.

### R3 — Unknown properties fail

**Unknown properties MUST be rejected, not ignored.** In JSON Schema terms,
`"additionalProperties": false` at every object level that models a known shape.

This is the requirement that gives the schema its value, and permissiveness here defeats the whole
group of standards:

- A **typo** in a rule name (`requireAcceptanceCritera`) silently disables the rule. The project
  believes it has declared something; nothing reads it; the audit passes.
- An **invented key** is a project quietly redefining the standard by adding vocabulary to it, which
  [Standard 18](18-machine-readable-project-policy.md) R1 prohibits. The schema is where that
  prohibition becomes mechanical rather than aspirational.

A silently-ignored key is worse than a rejected one, because the project has evidence — the line in
the file — that it declared something it did not.

### R4 — Enums are closed, and closed against the standards

Every enumerated value MUST be constrained to the set its standard defines, not to a free string:

| Field | Enum | From |
| --- | --- | --- |
| Rule levels | `required`, `recommended`, `optional`, `forbidden` | [Standard 18](18-machine-readable-project-policy.md) R3 |
| Work item status, where policy references it | `NOT_STARTED`, `READY`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `COMPLETE`, `DEFERRED`, `CANCELLED` | [Standard 8](08-status-tracking.md) R1 |
| Capability tiers, where policy references them | `read`, `analyze`, `propose`, `execute`, `privileged` | [Standard 2](02-propose-vs-execute.md) |
| ADR statuses, where policy references them | `Proposed`, `Accepted`, `Superseded`, `Deprecated`, `Rejected` | [Standard 11](11-architecture-decision-records.md) R5 |

**When a standard's enumeration changes, the schema changes with it, in the same change.** A schema
accepting a value no standard defines, or rejecting one a standard added, is drift with a false
appearance of rigour.

### R5 — Semantic version and path formats

`standardVersion` MUST match a semantic version pattern:

```json
{
  "standardVersion": {
    "type": "string",
    "pattern": "^\\d+\\.\\d+(\\.\\d+)?$",
    "description": "The engineering standard version this project follows."
  }
}
```

Directory and path fields SHOULD be constrained to repository-relative POSIX paths — no absolute
paths, no drive letters, no `..` traversal. A policy is committed and read on other machines; an
absolute path is guaranteed wrong somewhere else, and the schema is the cheapest place to catch it.

### R6 — Validation errors are clear

**Provide clear validation errors.**

An error MUST identify the offending path, what was found, and what was expected. `data/ai must be
object` is a schema library talking to itself. The usable form:

```text
project-policy.yml: ai.providerNeutrl — unknown property.
  Did you mean "providerNeutral"? Unknown properties are rejected so that a typo
  cannot silently disable a rule. See Standard 18 R1.
```

The audience is a developer under time pressure and an agent with no ability to ask. Both need to
know what to change, and the agent will act on whatever the message implies — so a message that
merely reports a failure invites a guess.

Where a value is rejected against an enum, the error SHOULD list the permitted values; where a
property is unknown, it SHOULD suggest the nearest known key.

### R7 — The schema is the authority

Where the schema and prose documentation disagree about what a policy may contain, **the schema
governs**, and the disagreement is a defect to be resolved in the same change rather than left as an
ambiguity.

This follows from what the schema is for: prose cannot fail a build, and a policy the schema accepts
is a policy that will be used regardless of what any document says about it.

## Additions this standard makes beyond the source

- R3's reasoning — the typo and invented-key failure modes, and the point that a silently-ignored key
  is worse than a rejected one. The source names "unknown-property handling" without saying which
  handling.
- R4's table binding each enum to the standard that defines it, and the same-change rule.
- R5's prohibition on absolute paths and traversal.
- R6's error format and its reasoning about the audience.
- R7 in full.

## Relationship to other standards

This standard is the enforcement layer for [Standard 18](18-machine-readable-project-policy.md): R3
here is what makes 18 R1's prohibition on redefinition mechanical, and R4 is what keeps the policy
vocabulary tied to the standards that own it.

Because R4 binds the schema to enumerations owned elsewhere, this standard is the one most exposed to
drift as the series evolves — [Standard 8](08-status-tracking.md)'s vocabulary has already changed
once, under [ADR 0001](../artifacts/adr/0001-canonical-status-vocabulary.md).

## Implementation

**No skill implements this standard**, and this repository does not yet publish
`schemas/project-policy.schema.json` — it declares no policy of its own to validate.

The check with the best return, and the one most in the spirit of R4, is mechanical: assert that every
enum in the schema matches the enumeration in the standard that owns it. That is the same class of
invariant as `scripts/inventory.mjs`, which exists because a hand-maintained count of the standards
silently went wrong.

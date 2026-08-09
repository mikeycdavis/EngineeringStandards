# Standard 49 — Data Safety

Code can be rewritten. Data that has been deleted, overwritten, or silently dropped is gone, and no
amount of subsequent care recovers it. These prohibitions are grouped by that property: each one, if
violated, cannot be fixed forward.

Source: the "Data" section of
[`artifacts/prompts/second-fold-in-prompt.md`](../artifacts/prompts/second-fold-in-prompt.md).

## Scope

Applies to every repository that owns, migrates, or processes persistent data. Part of the must-never
layer defined by [Standard 45](45-engineering-invariants.md). A project with no persistent data
declares the rules in this standard not-applicable, with a `revisitWhen` naming the change that would
make them apply.

## Requirements

### R1 — Never perform destructive data operations by default

Reproduced verbatim from the source:

* perform destructive data operations by default

**Already bound**, and no new rule id is minted ([Standard 45](45-engineering-invariants.md) R4).
[Standard 2](02-propose-vs-execute.md) R3 requires high-risk actions to carry explicit authorization,
and rule `ai.destructive-approval` is its catalog identity.

**This framework's own worked example.** `standards init` writes files into a repository. Creating a
missing artifact is ordinary execution; replacing an existing one is destructive, is refused by
default, and requires the operator to name the exact path
(`--force-overwrite=PROJECT.md`) — approving one path does not approve another. That behaviour is
recorded in this repository's policy as an **attestation** against `ai.destructive-approval`, with
the reviewed paths digested so that changing the write path invalidates the attestation rather than
letting it go on asserting a review nobody performed.

Cite it; do not modify it. The attestation is evidence about a specific review that happened on a
specific date, and rewriting it to make something else pass is exactly what
[Standard 45](45-engineering-invariants.md) R1 prohibits.

### R2 — Never migrate destructively without a recovery path

Reproduced verbatim from the source:

* execute destructive migrations without a rollback/recovery strategy where recovery is feasible

And, from the same list, reproduced verbatim from the source:

* assume migrations succeeded without verification

Rule `data.migration-rollback`, `forbidden`, `manual-review`, exemptible.

Two prohibitions, one rule, because they are the two halves of one discipline: knowing how to get
back, and knowing whether you need to. A migration that dropped a column and reported success without
checking is indistinguishable, at the moment it matters, from one that failed silently — which is
[Standard 9](09-verification.md) R1's requirement stated for the data layer.

The qualifier *where recovery is feasible* is internal to the prohibition. Some operations genuinely
cannot be reversed; the requirement is then to say so before running, not to discover it after.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | Recovery is genuinely infeasible — an irreversible external side effect, or a dataset whose size makes a snapshot impossible within the maintenance window |
| Justification | Why, specifically, and what was considered instead |
| Evidence | The pre-migration verification that will run, and the recorded decision to proceed without a rollback |
| Approval | The data owner, named |
| Revisit | Expires with the migration |

### R3 — Never silently discard user data

Reproduced verbatim from the source:

* silently discard user data

Rule `data.no-silent-discard`, `forbidden`, `manual-review`, **non-exemptible**.

*Silently* is the qualifier and it is internal: discarding data with the user's knowledge is a
product decision, and refusing data at the boundary with a structured error
([Standard 12](12-structured-errors.md)) is correct behaviour. What is forbidden is the drop nobody
is told about — the truncated field, the swallowed batch item, the record that failed validation and
returned success anyway. That last one is also [Standard 48](48-error-handling-and-observability.md)
R2, and the two rules firing together on one defect is accurate rather than duplicative: the caller
was misinformed *and* the data is gone.

**Violation:**

```text
const rows = batch.filter(isValid);      // invalid rows vanish
await insertAll(rows);
return { status: "ok", inserted: batch.length };
```

**Permitted:**

```text
const [rows, rejected] = partition(batch, isValid);
await insertAll(rows);
return { status: rejected.length ? "partial" : "ok", inserted: rows.length, rejected };
```

### R4 — Never corrupt historical or audit data

Reproduced verbatim from the source:

* corrupt historical/audit data to satisfy a new schema

Rule `data.no-audit-corruption`, `forbidden`, `manual-review`, **non-exemptible**.

An audit record's entire value is that it says what was true at the time. Backfilling it to fit a new
schema does not migrate the record — it replaces a fact with a guess, and there is no supported
reason to do that, which is why the rule is non-exemptible.

The legitimate approaches are not excepted, because they are not violations: version the schema and
read old records under their own version, add nullable columns rather than computing values that were
never recorded, or migrate into a new store and retain the original. What is prohibited is inventing
the missing values and leaving no trace that they were invented — the same fabrication
[Standard 44](44-existing-project-reconstruction.md) R2 prohibits for project history, applied to the
data.

### R5 — Never use production data unsafely outside production

Reproduced verbatim from the source:

* use production data unsafely in development/test environments

Rule `data.no-prod-data-in-dev`, `forbidden`, `manual-review`, exemptible.

*Unsafely* is the qualifier: a masked, subsetted, and access-controlled copy is a legitimate testing
practice. A full production dump on a developer laptop is the violation, and it is one of the most
common routes by which a controlled dataset leaves its controls.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | A defect can only be reproduced against real data, and masking would remove the property under investigation |
| Justification | The specific defect, and why masked data cannot reproduce it |
| Evidence | The access-controlled environment used, and the deletion record afterwards |
| Approval | The data owner, named |
| Revisit | **Expiring** — the exception ends with the investigation, and a non-expiring one against this rule is a standing licence to copy production data |

## Additions this standard makes beyond the source

- R1's routing to an existing rule rather than a new one, and the use of this framework's own
  `init` write path plus its attestation as the worked example — including the instruction to cite
  rather than modify it.
- Combining the source's rollback and verification prohibitions into one rule, with the reason.
- R4's list of legitimate approaches, so the prohibition does not read as a ban on schema evolution.
- The exception tables, and R5's requirement that its exception expire.
- The observation under R3 that a silent discard usually violates
  [Standard 48](48-error-handling-and-observability.md) R2 as well, and that two findings for that
  one defect is correct.

## Relationship to other standards

[Standard 2](02-propose-vs-execute.md) R3 is the rule R1 routes to.
[Standard 9](09-verification.md) R1 is what R2's verification half restates for data.
[Standard 12](12-structured-errors.md) is how a rejection is reported so that R3 is not violated by
refusing bad input. [Standard 48](48-error-handling-and-observability.md) R2 is R3's error-path
twin. [Standard 44](44-existing-project-reconstruction.md) R2 is R4's principle for project history.
[Standard 16](16-security.md) governs the access controls R5 depends on.
[Standard 20](20-exceptions.md) supplies the expiry R5 requires.

## Implementation

**Normative. No rule in this standard is automatable, and that is a property of the rules rather than
a gap in the tooling.**

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `ai.destructive-approval` | Already in the catalog. Attested in this repository against `scripts/init.mjs`, with staleness detection on the reviewed paths |
| R2 | `data.migration-rollback` | `manual-review`. Whether a rollback strategy exists is a claim about an operational plan, not about a file |
| R3 | `data.no-silent-discard` | `manual-review`, non-exemptible. Requires knowing which data was the user's |
| R4 | `data.no-audit-corruption` | `manual-review`, non-exemptible. Requires knowing which store is the audit record |
| R5 | `data.no-prod-data-in-dev` | `manual-review`. Whether a dataset came from production is not visible in a repository |

**Recorded blind spot.** Destructive-command detection — `DROP TABLE`, `DELETE` without a predicate,
`rm -rf` in a deploy script — was considered and not implemented. Every one of those appears
legitimately in migrations, test teardown, and build scripts, so the check would fire constantly and
be silenced, which is the brittle check [Standard 45](45-engineering-invariants.md) R5 forbids.

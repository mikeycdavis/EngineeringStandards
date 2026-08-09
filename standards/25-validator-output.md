# Standard 25 — Validator Output

The result contract. Two surfaces — one for people, one for machines — and the machine one is a
versioned interface that WhatsNext and future agents consume without scraping text.

Source: item 25 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **reporting** only. What rules exist and what they may claim belongs to
[Standard 24](24-validator-rules.md); rule identity to [Standard 26](26-stable-rule-ids.md); the
registry to [Standard 27](27-rule-catalog.md).

## Requirements

### R1 — Human-readable output

Human-readable output should look something like, reproduced from the source:

```text
AI Engineering Standards
Standard: 1.0.0
Project: CarDoc

PASS  Project manifest
PASS  Project policy
PASS  Plan directory
PASS  Plan handoff
PASS  Acceptance criteria
PASS  Verification instructions
PASS  Agent instructions
WARN  No ADRs recorded
FAIL  2 active plan sections are missing status

Compliance: 88%

2 issue(s)
1 warning(s)
```

Each line MUST describe what was observed rather than the requirement it relates to
([Standard 24](24-validator-rules.md) R2). Output SHOULD also state what was **not** evaluated —
`manual-review` and unimplemented `code-analysis` rules — because a list of passes with silent
omissions reads as complete coverage.

### R2 — The JSON envelope is versioned from day one

JSON output MUST carry its own `schemaVersion` and is a machine-facing contract governed by
[Standard 15](15-ai-tool-contracts.md):

```json
{
  "schemaVersion": "1.0",
  "standardVersion": "1.0.0",
  "project": "CarDoc",
  "status": "NON_COMPLIANT",
  "score": 88,
  "summary": {
    "passed": 21,
    "failed": 2,
    "warnings": 1,
    "skipped": 0
  },
  "results": []
}
```

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Version of *this output format*, independent of the others ([Standard 21](21-versioning.md) R1) |
| `standardVersion` | The framework version the project declared and was evaluated against |
| `project` | The project's name, so a consumer aggregating many runs can tell them apart |
| `status` | The verdict, from a closed set |
| `score` | Compliance score where one is computed |
| `summary` | Counts by outcome — `passed`, `failed`, `warnings`, `skipped` |
| `results` | Individual results, per R3 |

`skipped` is not decoration: it is the count of rules that were **not evaluated**, and it is what
stops a reader inferring coverage from `passed`. A run with 21 passed and 12 skipped is a very
different result from 21 passed and 0 skipped.

`status` MUST come from a closed enumeration — `COMPLIANT`, `NON_COMPLIANT`, and a distinct value for
"could not evaluate", which corresponds to [Standard 23](23-standards-validator-cli.md) exit `2` and
MUST NOT be reported as `NON_COMPLIANT`.

### R3 — Result shape

Each result SHOULD carry:

```json
{
  "ruleId": "planning.acceptance-criteria",
  "status": "failed",
  "severity": "error",
  "validationType": "document",
  "message": "...",
  "evidence": [],
  "files": [],
  "remediation": "..."
}
```

| Field | Why it is there |
| --- | --- |
| `ruleId` | The stable identity from [Standard 26](26-stable-rule-ids.md) — how a consumer correlates across runs and versions |
| `status` | `passed`, `failed`, `warning`, `skipped` |
| `severity` | What the outcome means for the verdict |
| `validationType` | From [Standard 24](24-validator-rules.md) R1, so a consumer can apply the assurance rule itself |
| `message` | What was observed |
| `evidence` | What the finding rests on |
| `files` | Where, so a consumer can navigate without parsing the message |
| `remediation` | What to do about it |

**`validationType` on every result is what makes [Standard 24](24-validator-rules.md) R2 checkable by
someone other than the validator.** Without it a consumer sees `passed` and cannot tell whether a file
existed or a behaviour was verified — and will, reasonably, assume the stronger reading.

`remediation` matters more than it looks. The consumers are CI and agents; an agent given a failure
with no remediation will invent one, and the invented fix is as likely to satisfy the check as to
satisfy the requirement.

### R4 — Status and severity are different fields

`status` is what happened to the rule; `severity` is what that means. A `warning` severity rule that
fails is still `status: failed` — it failed — while contributing a warning rather than a compliance
failure to the verdict.

Collapsing them loses the ability to say "this rule failed, and it is advisory", which is exactly the
distinction [Standard 23](23-standards-validator-cli.md) R3's exit codes rest on.

### R5 — Scores never stand alone

Where a `score` is emitted, it MUST be accompanied by the `summary` counts, and MUST NOT be presented
as the primary verdict.

A single number invites exactly the elevation [Standard 24](24-validator-rules.md) R2 forbids: 88%
suggests the project is 88% correct, when it means 88% of *evaluated* rules passed — and says nothing
about the skipped ones or about rules nobody wrote. `status` is the verdict; the score is a summary
statistic.

## Additions this standard makes beyond the source

- R2's envelope beyond `standardVersion`/`project`/`score`/`results`: `schemaVersion`, `status`,
  `summary`, and the ruling that this output is a [Standard 15](15-ai-tool-contracts.md) contract.
  The source's example has no version for the output format itself.
- R3's `status`, `validationType`, `evidence`, and `remediation` fields, and the reasoning for each.
- R4 and R5 in full.
- R1's requirement that unevaluated rules be stated.

## Relationship to other standards

[Standard 23](23-standards-validator-cli.md) R4 requires this envelope and maps `status` to exit
codes. [Standard 24](24-validator-rules.md) supplies `validationType` and the assurance rule this
format exists to make checkable. [Standard 26](26-stable-rule-ids.md) supplies `ruleId`.
[Standard 15](15-ai-tool-contracts.md) governs how this format may change.

## Implementation

`scripts/standards.mjs` emits `{ schemaVersion, repo, auditedAt, findings }`. Against this standard:
`schemaVersion` is present but numeric rather than a string; `repo` corresponds to `project`; there is
no `standardVersion`, `status`, `score`, or `summary`; and findings carry `id`, `category`,
`severity`, `label`, `evidence`, `message`, and `standardRef` but no `status`, `validationType`,
`files`, or `remediation`.

The `standardRef` field is an existing strengthening — it points at the requirement anchor that
produced a finding, which this standard does not require and probably should. Do not remove it to
match the shape here.

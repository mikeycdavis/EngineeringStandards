# Plan-item grammar and the ownership check (ST-20)

Status: implemented by ST-20 (#98). The dispositions below were approved by the project owner
(Mike, Michael Davis) on 2026-10-07T01:05:30Z as Q1-A to Q5-A.

Two commands read the plan files under `artifacts/project-plan-breakdown/`: `standards audit`/`validate`
(rule `planning.item-fields`, [Standard 44](../standards/44-existing-project-reconstruction.md) R7) and
`npm run ownership` (the issue-to-item direction, `scripts/ownership.mjs`). Until ST-20 each carried its
own grammar, and every disagreement between them was repaired in the ownership check alone (#82, #87, #89,
#93, #94, #99). There is now ONE plan-item grammar, `parsePlanDocument` in `scripts/standards.mjs`, and
ONE file collector, `collectSurface`. The ownership check reads claims from what they return.

## The grammar

A plan file is read line by line (`\r?\n`; a lone CR is not a line break).

| Element | Rule |
| --- | --- |
| Plan item | A `###` heading, `^###\s+(.*)$`; the item is titled by the trimmed text. Only `###` defines an item. |
| Item end for attribution | A `#` or `##` heading (including an empty one, a bare `##` or `#`) ends the item for ownership attribution. It is not a plan item. Canonical `fields`/`syntax` still attach later field lines to the preceding `###` item, exactly as before. |
| `####` and deeper | Stay inside the current `###` item. |
| Field line | `- **<key>:** value` or `- **<key> — <qualifier>:** value` (space, em dash, space). The key is matched exactly after trimming. |
| Read keys | `Status`, `Purpose`, `Deliverables`, `Acceptance Criteria`, `Verification`, `Dependencies`, `Tracked by`, `TrackedBy`. Other keys are stored and read by nothing. |
| Malformed attempt | A bullet opening a bold run that names a read key without the exact form (colon missing or misplaced, wrapped label, near separator, `*` bullet). Recorded in `syntax`; never read as the field. |
| Value | The line value, trimmed, is the canonical `fields` entry. |
| Span | Each occurrence of a read field or an attempt at one is also recorded in `spans` with its line, end line, the value and the **text** (line value plus continuation lines). |
| Continuation | Lines after a field line until a blank line, a line starting `#`, a field line, a bold-opening line that names a read key, or a bold bullet of plain label text closed by a colon (`- **Evidence**: x`). A bold list item that is a link or URL continues the value. |
| Duplicate | The first occurrence of a key wins in `fields`; later ones are `duplicate` records in `syntax` and spans. |
| Outside an item | Field lines before the first `###` are recorded as `orphans` (never in `items`). Spans after a `#`/`##` heading carry `attributed: false`. |

Fenced code is **not** recognised. A fenced `###` heading or field-shaped line is read as plan syntax.
This is a known, accepted behaviour (Q2), not a non-claim: the parser actively interprets it. Fence
awareness is separate future work needing its own differential evidence and an owner decision.

Canonical `items[].fields` and `items[].syntax` are byte-for-byte what `parsePlanItems` returned before
ST-20. `line`, `level`, `spans` and `orphans` are additive. No syntax is newly accepted by the canonical
parser.

## What the ownership check reads

A claim is the first `Tracked by` / `TrackedBy` field (the two spellings are one field), read
as the issue links in its span text that point at the mapping's `target` repository. Link extraction
(`extractIssueLinks`) is ownership semantics over the span text, not plan grammar, and runs in one forward
pass: a link counts at the start of the value, after whitespace, after the `(` of a markdown link
destination (a `(` directly after a `]` that closes a `[` opened earlier; a `](` with no label before it is only characters), or after `( < [ * " ' > , ;` unless the whitespace-delimited token already holds a
`scheme:`. The accepted syntax is that of #99; only the algorithm changed (Q5).

Plan files are the canonical collector's set: `.md` files anywhere under the plan directory, through the
repository's ignore set and the framework exclusions, with the 400,000-byte per-file cap, the aggregate
read budget and the file-count cap. If a plan file was unreadable, truncated, or skipped by the budget, or the
walk could not reach the plan directory, or the walk skipped a directory on the plan tree on the framework's say-so
(a conventional name such as `fixtures`, `vendor` or `build`, or a vendored-tree marker), the ownership check ends
`NOT_EVALUATED` (exit 2). A directory the repository itself declared ignored is honoured, as the audit honours it.

## Dispositions and compatibility changes

| Form | Before ST-20 (ownership) | After | Disposition |
| --- | --- | --- | --- |
| `##` or `#` heading after an item, then `Tracked by` | A claim under the new heading's title | Not a claim; problem `plan-claim-outside-item` | Q1-A, fail closed |
| `Tracked by` before the first `###` | Silently skipped | Not a claim; problem `plan-claim-outside-item` | Q1-A |
| `##` / `####` heading as an item | An item | Not an item. A `##` ends attribution; a `####` stays inside the `###` item, so a claim under it takes the `###` title | Q1-A |
| `###` heading with no title | Not a heading (its fields went to the previous heading) | Still an item for the canonical parser (title ""); under ownership a `Tracked by` there is not a claim: problem `plan-claim-untitled-item`, because an item with no title cannot be named as an owner | Q1-A: only a valid `###` item owns a claim |
| Second `Tracked by` on one item | A second claim (`claimed-twice` for one item) | Only the first is a claim; each later one is problem `plan-tracked-by-duplicate` | Q3-A |
| Malformed `Tracked by` (en dash, hyphen, misplaced colon, colon-less, wrapped, `*` bullet) | No claim, silently, so the issue read `absent-from-plan` | No claim; problem `plan-tracked-by-malformed` | Q1/Q3: never silent |
| Plan file in a subdirectory | Ignored | Read | Q4-A |
| Plan file unreadable, truncated or skipped | Read without a cap | `NOT_EVALUATED` | Q4-A |
| Fenced code | Read as plan text | Read as plan text | Q2-A, accepted behaviour |
| Link extraction cost | Quadratic in the longest unspaced token | Linear | Q5-A |

Every difference in the table is an owner-approved narrowing or a surfaced problem; none turns a legacy
problem or absence into a claim, except discovery of nested plan files (Q4-A), which makes more plans visible.
The differential test (`test/plan-grammar-differential.test.mjs`) holds a frozen copy of the old grammar
(`test/fixtures/legacy-plan-grammar/legacy.mjs`) against the new one over the repository's plan files, the
fixtures, every plan literal the existing tests write, and the probe set.

## Programmatic compatibility

`collectPlanClaims(root)` is now `async` (the canonical collector is) and returns the claims as before;
`collectPlanOwnership(root)` also returns the problems; `checkOwnership` takes an optional `planProblems`
list, which makes the result not `ok`. The CLI, its exit codes (0, 1, 2) and the JSON `issues[]` shape are
unchanged; `problems[]` may carry the three new kinds above.

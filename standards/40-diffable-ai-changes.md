# Standard 40 — Diffable AI Changes

An agent's change must be reviewable by the same means as anyone else's. This standard defines the
scope of that obligation — which is wider than source code — and prohibits the one pattern that
defeats review: wholesale replacement where a smaller attributable change would do.

Source: item 40 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **inspectability of changes**. The audit trail that records application-state mutations is
[Standard 3](03-auditing.md); the propose/execute separation that determines *when* a change is
applied at all is [Standard 2](02-propose-vs-execute.md). This standard governs the reviewability of
what was changed, in both repositories and running systems.

## Requirements

### R1 — Scope: everything meaningful, not just source

**All meaningful AI-generated changes should be inspectable and diffable. This includes**, reproduced
verbatim from the source:

```text
source-code changes

configuration changes

generated artifacts

requirement changes

project-plan changes

ADR changes

policy changes

infrastructure changes

data mutations where practical
```

The breadth is the requirement. Source-code diffs are reviewed by habit; the other eight are where
unreviewed change accumulates, and several of them are more consequential than code:

| Change | Why it is easy to miss |
| --- | --- |
| Configuration, infrastructure | Often generated wholesale, and a one-line semantic change can arrive inside a hundred-line rewrite |
| Generated artifacts | Reviewers learn to skip them, which makes them the ideal place for an unnoticed change |
| Requirement, plan, ADR changes | Prose diffs read as editorial; a reworded acceptance criterion is a scope change ([Standard 10](10-scope-change-management.md)) |
| Policy changes | A policy edit alters what the project is held to ([Standard 18](18-machine-readable-project-policy.md)) — the highest-leverage line an agent can change |

**A policy change is the one to watch.** Lowering a rule's level silently achieves what an exception
would have made visible, and it arrives as a one-word diff in a YAML file.

### R2 — Repository changes: ordinary source control is the mechanism

**For repository changes, normal source-control diffs should be sufficient whenever possible.**
**Where an AI generates or modifies multiple files, the resulting changes should remain reviewable
through normal version-control tooling.**

No bespoke diff format, no separate change log for agent work, no review surface that only exists
inside one tool. The reviewer is a human with `git diff`, or an agent with repository access and no
conversation history ([Standard 5](05-resumability.md)) — and both must be able to see what happened
without special equipment.

Two practical consequences:

- **Generated files are committed**, not produced on demand, where their content is what review is
  about. An artifact that exists only after a build step is invisible to the diff that changed it.
- **Formatting churn is separated from semantic change.** A reformat bundled with a behaviour change
  hides the behaviour change inside noise, which is R3's failure in miniature.

### R3 — Prefer the smallest attributable change

**AI agents should avoid silently replacing large documents or state blobs when a smaller
attributable change can be represented.**

Bulk replacement is discouraged wherever a smaller attributable change expresses the same intent. The
reason is not aesthetics: a rewritten file produces a diff in which every line changed, so review
degrades from *inspect what changed* to *re-read the whole thing and hope*. In practice reviewers do
neither, and the change ships unreviewed.

*Silently* is the operative word, and it identifies the permitted case. A wholesale rewrite is
legitimate when it is the actual intent — a regenerated artifact, a genuine restructuring — and in
that case it is **stated as such**, so the reviewer knows the diff is uninformative by design rather
than by accident.

Where a large replacement is unavoidable and the semantic change within it is small, the change
SHOULD be split: the mechanical rewrite in one commit, the semantic change in another. That is the
only way the semantic change ever gets read.

### R4 — Application state: before/after or a domain equivalent

**For application-state changes, retain appropriate before/after state or a domain-specific
equivalent through the audit system.**

Running systems have no source control, so [Standard 3](03-auditing.md) is the diff mechanism. The
requirement is that a mutation be reconstructable after the fact — what it was, what it became, and
who caused it.

*Or a domain-specific equivalent* is a real allowance and matters at scale. A full before/after
snapshot of a large record is often impractical, and the standard is satisfied by anything that
supports the same reconstruction:

| Acceptable | Why |
| --- | --- |
| Before/after field values for the fields that changed | The common case, and the most useful |
| A domain event carrying the transition (`release.approved`, with prior state) | Expresses intent, not just difference — usually more useful than a field diff |
| A reference to an immutable prior version | The before state is recoverable, which is what matters |

**Not acceptable:** recording only that a mutation occurred, or only the resulting state. The latter
looks like compliance and is not — *what it is now* is already in the database, and the audit record
adds nothing.

This applies with particular force to automated decisions ([Standard 3](03-auditing.md)): where a
system recommends or acts, the inputs and the resulting action are what make the decision reviewable
at all.

### R5 — Reviewability is a property of the change, not of the reviewer

A change is diffable when someone who was not present can determine what it did. This is
[Standard 5](05-resumability.md) applied to review, and it rules out two common substitutes:

- **A chat explanation is not a diff.** It is not in the repository, it is not attached to the
  commit, and it is not available to the person reading the change in six months
  ([Standard 41](41-decisions-assumptions-and-questions.md)).
- **A commit message describing intent does not replace an inspectable change.** It is necessary and
  it is a claim; the diff is the evidence. Where they disagree, the diff is what shipped.

## Additions this standard makes beyond the source

- R1's table of why each non-source category is easy to miss, and the identification of policy
  changes as the highest-leverage line an agent can change.
- R2's two consequences — committing generated files where review is about their content, and
  separating formatting churn from semantic change.
- R3's reading of *silently*: a wholesale rewrite is permitted when stated, and the split-commit
  remedy when a small semantic change is buried in a large mechanical one.
- R4's table of acceptable domain equivalents, and the ruling that resulting-state-only is not one.
- R5 in full.

## Relationship to other standards

[Standard 3](03-auditing.md) is the mechanism R4 requires and defines actor attribution and
correlation. [Standard 2](02-propose-vs-execute.md) governs whether a change is applied at all; a
proposal is reviewable by construction. [Standard 10](10-scope-change-management.md) is what an
unreviewed requirement or plan diff evades. [Standard 18](18-machine-readable-project-policy.md) is
what R1's policy-change row protects. [Standard 5](05-resumability.md) is the principle behind R5.
[Standard 39](39-codebase-documentation.md) R4 is a specific instance of R3: a regenerated SVG that
is hand-edited produces a diff nobody can attribute.

## Implementation

**Met for repository changes.** All work in this repository is ordinary commits reviewable with
`git diff`, generated artifacts included — `docs/architecture.md` and `docs/architecture.svg` are
committed rather than built on demand, satisfying R2.

**R3 is met in practice and unenforced.** The standards documents in this repository are written
whole and committed whole, which is legitimate under R3's stated-intent allowance since each is a new
file. Where existing standards were later reconciled — 18, 25, 26, and 27 against
[ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md) — the changes were targeted edits rather
than rewrites, which is what made them reviewable. Nothing mechanically enforces this.

**R4 does not apply.** This repository has no application state and no audit system; it is a
documentation and CLI repository.

**Not implemented as a check.** Nothing in `scripts/standards.mjs` detects wholesale replacement,
mixed formatting-and-semantic commits, or policy-level changes — all three are `code-analysis` or
history-analysis rules ([Standard 24](24-validator-rules.md) R1), and the tool reads a working tree
rather than a history. A policy-change detector is the one worth building first, and it is cheap:
comparing a policy file against its previous committed version needs no analyzer.

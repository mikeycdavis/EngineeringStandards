# 0013 — The reusable check distributes the verdict and nothing else

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

The enforcement architecture this framework is moving toward makes `validate` a required check in
every adopting repository, distributed as one reusable workflow. Everything that makes such a check
worth having — that it cannot be bypassed, that it says the same thing everywhere, that its verdict
means what the local verdict means — depends on a property that has to be established before
anything is built on it: **the distributed check reproduces the authoritative verdict faithfully.**

A check that is mechanically authoritative and epistemically unreliable is worse than no check. That
combination is what [ADR 0011](0011-attestation-freshness-is-repository-content-not-checkout-bytes.md)
found and closed inside the framework; the same failure is available one level up, in the transport.

## Decision

**The first workflow proves one contract and carries no controller logic.**

```text
consumer repository
      ↓  resolve an explicitly pinned framework revision
      ↓  run the authoritative `validate`
      ↓  propagate its exit status
      ↓  publish enough output to diagnose the result
```

**The revision is a 40-character commit SHA, refused otherwise.** There is no released tag —
[Standard 21](../../standards/21-versioning.md) R5's resolution half is still unimplemented — so a
commit SHA is the only immutable reference available. A branch would mean the check could change
what it enforces between two runs of the same consumer commit, without anyone deciding that it
should.

**The workflow never declares a version.** The consumer's `project-policy.yml` is the only statement
of what governs it. If the declared version and the executing framework disagree, the version-identity
guard exits 2 and no verdict is produced — which is why the workflow must not "helpfully" reconcile
them: reconciliation would make the CI configuration the policy.

**`audit` runs, and cannot gate.** It is evidence, `validate` is the verdict
([ADR 0004](0004-audit-and-validate-are-separate-commands.md)), and `continue-on-error` is what makes
that structural rather than documentary. A survey finding able to fail the job would make `audit` a
second authority.

**The three exit codes stay distinguishable.** 0, 1, and 2 mean compliant, a statement about the
project, and a statement about the configuration. A gate that collapses them into generic red
discards exactly the distinction the guard and the unreadable-policy path exist to make, so the
summary names the meaning of the code it exits with.

**CI validates; it does not repair.** No policy, attestation, exception, or reconstruction artifact
is created, and nothing is self-attested. This is asserted mechanically: the consumer working tree is
checked for modifications after the run, and a modified tree fails the job. The prohibition would
otherwise be a comment, and a comment is not a control.

**`validate` runs twice and the exit codes are compared.** Once for the log a human reads, once for
the machine report. Two runs raise the question of which is authoritative, so the answer is asserted:
if they disagree, the verdict is not reproducible on that checkout and the job fails rather than
reporting whichever one was kept.

**The project is checked out at full depth.** Attestation freshness is committed blob identity, and a
shallow clone cannot distinguish a reviewed path that was deleted from one that was never tracked —
staleness and evidence unavailability. A cheaper checkout would make the verdict depend on clone
depth, which is ADR 0011's defect wearing different clothes.

## Consequences

**Dogfooding it must stay red.** This repository is intentionally `NON_COMPLIANT` — three recorded
rejections — so a green dogfood job would be evidence that the workflow changed semantics somewhere
in transport. Success here is not a green run; it is the reusable workflow reporting the same three
established failures the local run reports, with the same exit code.

**Branch protection is a separate decision and is not taken here.** Making this a required check on
`develop` would deliberately make `develop` unmergeable while those rejections stand. That may
eventually be right, but distribution fidelity and organization enforcement are different questions,
and conflating them would settle the second by accident while testing the first.

**Nothing binds the workflow file's revision to the framework revision it executes.** The caller pins
both — `uses: …@<sha>` and the `standards-ref` input — and a test asserts they are equal in this
repository's own caller. For an outside adopter that agreement is a convention, not a mechanism.

**The workflow invariants are checked as text, not as parsed YAML.** `scripts/yaml.mjs` supports a
deliberately small subset, well short of GitHub's schema. The tests can confirm a line is present and
a prohibited one absent; they cannot confirm the workflow executes as intended. Only running it
establishes that, which is what dogfooding is for and why the tests say so in their own comments.

## What the first dogfood found, before it ever ran

GitHub Actions could not execute (account billing), so the workflow's body was rehearsed locally
against two fresh clones. It failed its own acceptance criterion immediately, and the reason was in
the framework rather than in the transport.

`scripts/standards.mjs` excluded its own source file from the content scan by absolute path. When the
framework audited its own directory that file was skipped; when it audited a copy — which is what
every consumer, and this workflow, actually does — the file was scanned like any other. Identical
content, two answers:

| Arrangement | Result |
| --- | --- |
| Framework validating its own directory | 25 passed, 3 failed, 0 warnings |
| Same framework validating an identical checkout | 23 passed, 4 failed, 1 warning |

The exclusion's stated reason was that this file lists the package names it searches for, so scanning
it would report every SDK it knows about. That reason had already been superseded by
`importPattern()`, which requires an import-shaped match; the exclusion outlived its justification and
its scope had never matched it — one detector's vocabulary problem had become a whole-file blind spot
across every detector. It is removed rather than narrowed, because after removal no detector needs it:
the two findings it was hiding were both genuine defects in the detectors themselves.

**`errors.no-swallowed-exceptions` was counting, not matching.** It counted empty-catch matches in the
structural view, counted them in the raw view, and took the smaller number — a conjunction with no
subject identity. This file holds two comment-justified catches (two structural matches, because a
justification is a comment and the structural view drops comments) and exactly one raw match: the
sentence in the detector's own comment explaining that a `catch {}` inside a comment is not a
violation. `min(2, 1)` reported one violating site. There was none. It now locates each catch
construct in the offset-aligned structural view, finds its body by brace matching, and reads that same
span in the raw text — one site, two readings of it.

**`quality.unfinished-work` was reading a pattern table as code.** `splitSource` had no regex-literal
mode, so `raise NotImplementedError` inside the unfinished-work patterns was structural code like
any other, and the word boundary held because a space preceded the token. The narrowest owner is the
tokenizer, so regex contents are now blanked in the structural view exactly as string contents are.
The causal path was established by bisecting the real file to the line rather than inferred from
plausibility: a first hypothesis — that line endings differed between checkouts — was tested and
refuted before this one was tested and confirmed.

**A correction to the record.** The claim *"every existing catch in this repository carries code or a
comment — self-audit stays clean, and that dual-match design is why"* appears in the 2.0.0
implementation plan. Its first clause is true and its causal claim is false: the self-audit was clean
because the file was never scanned. The established statement is narrower — every catch site currently
inspected carries code or a justification, and the prior self-audit did not establish the
swallowed-exception detector against `scripts/standards.mjs` at all.

**The invariant this produces**, now asserted by `test/distribution-fidelity.test.mjs` over two clones
of one commit: a framework validating itself and the same framework validating an identical checkout
must produce the same verdict, the same counts, the same per-rule results, and the same findings.
Comparing exit codes alone would not have caught this, since both arrangements exit 1.

## Deferred

- **Any organization controller.** `GOVERNED` / `UNGOVERNED` / `INDETERMINATE`, adoption reporting,
  and the question of which repositories are required to call this at all.
- **Version resolution.** Executing the framework revision a policy's `standardVersion` names, rather
  than the revision the caller happened to pin (Standard 21 R5's resolution half).
- **Required branch protection**, per the consequence above.
- **Third-party actions are pinned by tag**, not by digest — `actions/checkout@v4` and its
  neighbours, matching the existing `ci.yml`. Tightening that is a separate decision about this
  repository's own supply chain rather than about the contract this workflow distributes.

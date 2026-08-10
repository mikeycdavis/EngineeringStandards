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

## Deferred

- **Any organization controller.** `GOVERNED` / `UNGOVERNED` / `INDETERMINATE`, adoption reporting,
  and the question of which repositories are required to call this at all.
- **Version resolution.** Executing the framework revision a policy's `standardVersion` names, rather
  than the revision the caller happened to pin (Standard 21 R5's resolution half).
- **Required branch protection**, per the consequence above.
- **Third-party actions are pinned by tag**, not by digest — `actions/checkout@v4` and its
  neighbours, matching the existing `ci.yml`. Tightening that is a separate decision about this
  repository's own supply chain rather than about the contract this workflow distributes.

# Standard 16 — Security

The security constraints a project must document, and the one absolute prohibition in this series:
secrets never enter artifacts.

Source: item 16 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Applies to every project. This is the first of four standards — 16, 17, 18, and 19 — organised around
one idea: **policy is executable configuration, not prose-only guidance.** This standard defines the
security constraints that a machine-readable policy ([Standard 18](18-machine-readable-project-policy.md))
can reference and a schema ([Standard 19](19-json-schema.md)) can validate.

## Requirements

### R1 — Document these requirements

A project MUST document its requirements for, reproduced verbatim from the source:

- least privilege
- authentication
- authorization
- agent identity
- secret handling
- audit logging
- human approval
- service accounts
- scoped tokens
- data minimization

"Document" means stated somewhere durable and findable, not decided informally. Where a project's
answer is "not applicable", that is an answer and SHOULD be written down —
[Standard 6](06-project-manifest.md) R2 makes the same point about manifest headings, and for the
same reason: silence cannot be distinguished from an oversight.

**`agent identity` and `service accounts` are the two most often skipped**, and the two this series
most depends on. [Standard 3](03-auditing.md) R3 requires an AI agent's actions to be attributable to
the same standard as a human's, which is impossible if agents share a service account or act as a
generic `SYSTEM` principal.

### R2 — Secrets MUST NOT be placed in artifacts

**Never place secrets in**, reproduced verbatim from the source:

```text
PROJECT.md
plan files
ADR files
agent instructions
audit logs
AI prompts
source control
```

**Reference secret names or secret-store identifiers instead.**

This is the strongest prohibition in the series and it has no exception process — a project MUST NOT
declare an exception to it under [Standard 18](18-machine-readable-project-policy.md). Every item on
that list is a durable artifact: committed, copied, read by agents, and often published. A secret
placed in one is not merely exposed but *persisted*, and removing it later does not un-expose it.

The permitted form is a reference:

```yaml
database:
  connectionStringRef: secretstore://prod/db/connection   # an identifier, not a value
```

Note that **AI prompts** is on the list, and is the newest way to violate it. A prompt assembled with
a live credential so an agent can "just use it" places that credential in whatever logs, traces, and
provider-side records the call produces.

### R3 — Security constraints are policy-referenceable

The constraints in R1 and R2 SHOULD be expressible in the project's machine-readable policy rather
than existing only as prose. The source's own policy shape includes:

```yaml
security:
  secretsInArtifacts: forbidden
```

This is what makes the difference between a documented intention and an enforceable one: a prose
statement that secrets are prohibited cannot fail a build, and a policy declaration can. See
[Standard 18](18-machine-readable-project-policy.md) for the rule levels and
[Standard 19](19-json-schema.md) for validation.

### R4 — Least privilege applies to agents specifically

Least privilege in R1 SHOULD be read against
[Standard 2](02-propose-vs-execute.md)'s capability tiers: an agent is granted the lowest tier that
lets it do its job, and elevation is per-capability rather than blanket.

The failure mode worth naming: granting an agent broad authority because scoping it is tedious, then
relying on the agent's judgement not to use it. That is not least privilege — it is trust
substituting for a control, and it fails silently the first time the agent is wrong or is steered by
untrusted input.

## Additions this standard makes beyond the source

- R1's observation that `agent identity` and `service accounts` are load-bearing for
  [Standard 3](03-auditing.md)'s attribution requirement, and the rule that "not applicable" should be
  recorded.
- R2's statement that this prohibition admits no exception, the worked example of a reference, and the
  note about credentials in prompts.
- R3 and R4 in full.

## Relationship to other standards

[Standard 3](03-auditing.md) R5 prohibits secrets in audit logs — R2 here is the same prohibition
applied to every artifact class. [Standard 12](12-structured-errors.md) R5 extends it to error
`details`. [Standard 2](02-propose-vs-execute.md) supplies the tiers that make R4's least-privilege
requirement concrete. [Standard 18](18-machine-readable-project-policy.md) is where these constraints
become declarations a tool can check, and [Standard 19](19-json-schema.md) is what makes an invalid
declaration fail.

[Standard 17](17-agent-instruction-files.md) matters here for a reason easy to miss: agent
instruction files are on R2's prohibited list, and they are the artifact most likely to accumulate a
credential, because whoever adds it is trying to make an agent work rather than to write something
down.

## Implementation

**No skill implements this standard.**

`standards audit` performs a narrow secret scan via `security.no-secrets-in-artifacts`, the rule
[Standard 46](46-source-control-safety.md) R1 owns. It is not a substitute for a dedicated scanner
and must not be read as one: it matches a short list of credential shapes, and it reads the working
tree rather than version control, so it cannot tell a committed secret from a gitignored file or a
deliberately seeded test fixture
([ADR 0008](../artifacts/adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)).

What an audit *could* check — and does not yet — is that a project's policy declares the R1 topics at
all.

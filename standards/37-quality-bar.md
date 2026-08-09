# Standard 37 — Quality Bar

Cross-cutting design constraints for a framework meant to run in many repositories for a long time.
This standard is a set of properties, not a second validator: each property points at the standard
that makes it enforceable.

Source: item 37 of [`artifacts/prompts/engineering-standards-spec.md`](../artifacts/prompts/engineering-standards-spec.md).

## Scope

Defines **design constraints on the framework itself** — the standards, the CLI, the catalog, the
schemas. It defines no rule that a project is validated against, and R3 is the requirement that keeps
it that way.

## Requirements

### R1 — Priorities

**Treat this like a framework I will actually use across many repositories.** Prioritize, reproduced
verbatim from the source:

```text
clarity
determinism
extensibility
cross-platform compatibility
machine readability
good error messages
stable contracts
minimal duplication
testability
safe defaults
```

Each is a property of something, and each is made real by a standard that can be checked:

| Priority | Made enforceable by |
| --- | --- |
| clarity | [32](32-documentation-quality.md), [25](25-validator-output.md) R1 — output describes what was observed |
| determinism | R4 below, and [24](24-validator-rules.md) R3 |
| extensibility | [27](27-rule-catalog.md) — rules are data, so adding one is a catalog entry rather than a code change |
| cross-platform compatibility | [23](23-standards-validator-cli.md) R6 |
| machine readability | [25](25-validator-output.md) R2, [19](19-json-schema.md), [31](31-whatsnext-compatibility.md) |
| good error messages | [12](12-structured-errors.md), [25](25-validator-output.md) R3's `remediation` |
| stable contracts | [15](15-ai-tool-contracts.md), [21](21-versioning.md), [26](26-stable-rule-ids.md) |
| minimal duplication | [32](32-documentation-quality.md) R4, [27](27-rule-catalog.md) R4, R5 below |
| testability | [29](29-testing.md) |
| safe defaults | R5 below, [33](33-bootstrap-experience.md) R2, [2](02-propose-vs-execute.md) |

**A priority with no row in the right-hand column is an aspiration.** The table is the standard's
actual content; the list alone would be a values statement.

### R2 — What to avoid

**Avoid**, reproduced verbatim from the source:

```text
unnecessary frameworks
overly clever abstraction
fake static-analysis guarantees
provider-specific AI coupling
duplicated standards definitions
large generated boilerplate
```

| Avoid | Why it is prohibited rather than discouraged |
| --- | --- |
| unnecessary frameworks | A dependency is a permanent obligation in every adopting repository, and a validator that cannot run without an install is one people skip |
| overly clever abstraction | The readers include agents and infrequent maintainers; an abstraction that must be understood before a rule can be added defeats [27](27-rule-catalog.md)'s extensibility |
| fake static-analysis guarantees | This is [24](24-validator-rules.md) R2 and R4 — the single most consequential prohibition in the framework, and the one this standard exists to keep visible |
| provider-specific AI coupling | [1](01-human-and-ai-operability.md); a capability that breaks when the model changes was never a capability |
| duplicated standards definitions | [27](27-rule-catalog.md) R4, [32](32-documentation-quality.md) R4 — two definitions drift, and the drift is silent |
| large generated boilerplate | Generated volume nobody reads is unreviewed content presented as reviewed; [33](33-bootstrap-experience.md) R1 keeps `init` minimal for this reason |

**`fake static-analysis guarantees` is the one to read twice.** Every other item on this list costs
maintenance; this one produces false green compliance, which costs correctness.

### R3 — This standard delegates; it does not enforce

**This standard MUST NOT define rules that a validator evaluates.** Its properties are made
enforceable by the standards named in R1 and R2, and any new obligation belongs in one of those
rather than here.

A quality bar that grows its own rule set becomes a second, vaguer validator competing with the first
— one whose rules are adjectives. *Is this abstraction overly clever?* has no known-negative fixture
([Standard 29](29-testing.md) R2) and therefore cannot be enforced honestly, only asserted.

The correct move when this standard feels insufficient is to add a requirement to the standard that
owns the concern, and link it here.

### R4 — Determinism

**The same input MUST produce the same output.** A validator run twice on an unchanged repository
produces byte-identical results.

This is stated explicitly because the violations are easy to introduce accidentally, and each one
breaks something concrete:

- **Ordering.** Findings, results, and file lists are sorted by a stable key. Filesystem enumeration
  order varies between platforms and runs; unsorted output makes every diff noise, which is what
  trains people to stop reading diffs.
- **Timestamps and environment.** A generated `auditedAt` is legitimate, but it MUST NOT be part of
  anything compared for equality — including a golden-file test, which will otherwise fail once per
  run for a reason unrelated to correctness.
- **Path separators and line endings.** Cross-platform compatibility is a determinism problem in
  practice. Output paths use forward slashes regardless of host.
- **No network, no clock-dependent rules.** A rule whose result depends on when it ran cannot be
  reproduced, and a finding nobody can reproduce cannot be fixed with confidence.

Determinism is also what makes [Standard 29](29-testing.md) possible at all: a non-deterministic
check cannot have a known-negative fixture, because it does not reliably not-fire.

### R5 — One definition of everything

Where a fact is defined — a rule ID, a status value, an output field, a version — **there is exactly
one definition, and everything else references it.**

The framework already applies this in four places, and they are worth naming together because they
are the same rule:

| Fact | Single definition |
| --- | --- |
| Status vocabulary | [Standard 8](08-status-tracking.md), via [ADR 0001](../artifacts/adr/0001-canonical-status-vocabulary.md) |
| Rule identity | [Standard 26](26-stable-rule-ids.md), via [ADR 0002](../artifacts/adr/0002-canonical-rule-identity.md) |
| Output shape | [Standard 25](25-validator-output.md) |
| Rule metadata | [Standard 27](27-rule-catalog.md) |

Both ADRs exist because two definitions were found coexisting, and in each case the cost was not
untidiness — it was two vocabularies that could not be joined. **A second definition is not a
duplicate; it is a fork with no merge.**

## Additions this standard makes beyond the source

- R1's and R2's mapping tables, which convert two lists of adjectives into pointers at enforceable
  requirements. This is the standard's substance.
- R3 in full — the prohibition on this standard growing its own rules, and the reason (adjectives
  have no known-negative fixture).
- R4 in full — the four concrete determinism obligations and the connection to
  [Standard 29](29-testing.md).
- R5 in full, and the observation that both existing ADRs are instances of it.

## Relationship to other standards

Every entry in R1's and R2's tables. [Standard 24](24-validator-rules.md) R2 and R4 are what
*fake static-analysis guarantees* refers to and are the framework's central honesty requirement.
[Standard 29](29-testing.md) depends on R4. [Standard 32](32-documentation-quality.md) R4 and
[Standard 27](27-rule-catalog.md) R4 are R5 applied to documentation and rules respectively.

## Implementation

**Zero dependencies.** `package.json` declares none, and CI has no install step, with the decision
recorded in a comment where an `npm ci` would go. *Unnecessary frameworks* is satisfied structurally
rather than by discipline: adding one would require editing CI.

**Determinism is partial.** `scripts/standards.mjs` sorts findings and normalises paths to forward
slashes, and its tests are deterministic. Its JSON output carries `auditedAt`, which is correct but
means the output cannot be compared byte-for-byte without excluding that field — no test currently
does such a comparison, so this is a latent hazard rather than a live defect.

**R5 holds.** Two ADRs enforce it for status and rule identity, and no standard reproduces another's
contract.

**Testability is met, extensibility is not.** [Standard 29](29-testing.md)'s implementation section
records the fixtures and mutation tests that exist. But rules are hardcoded detector functions rather
than catalog entries, so adding one is a code change — the extensibility priority is currently
unmet, and [Standard 36](36-implementation-strategy.md) R2 explains why: the catalog is Phase 1 work
that the validator was built ahead of.

**Good error messages are partial.** Findings carry `evidence` and a `standardRef`, but no
`remediation` ([Standard 25](25-validator-output.md) R3), which is the field that determines whether
an agent fixes the requirement or fixes the check.

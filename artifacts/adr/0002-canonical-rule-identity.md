# 0002 — One canonical rule identity for policy keys, rule IDs, and exceptions

- **Status:** Accepted
- **Date:** 2026-08-08
- **Deciders:** Project owner

## Context

The source specification names the same rules twice, in two different forms.

Item 18's policy shape uses camelCase keys nested under a category:

```yaml
ai:
  uiCapabilitiesMustBeAgentOperable: true
  providerNeutral: true
  proposeExecuteSeparation: true
```

Item 26's rule-ID list uses dotted kebab-case:

```text
ai.non-ui-capabilities
ai.provider-neutral
ai.propose-execute
```

Item 20's exception example then references a rule by the *policy* form
(`rule: ai.uiCapabilitiesMustBeAgentOperable`), while item 25's validator output carries a `ruleId`,
which item 26 says is the stable machine identity. So the same rule has two peer names, and the
exception mechanism — the one place where a wrong name silently changes what a project is held to —
uses the form that is not designated stable.

This was recorded as a defect in [Standard 26](../../standards/26-stable-rule-ids.md) R5 rather than
resolved, on the grounds that the catalog would settle it. That deferral does not survive contact
with Standards 30 and 31: a compliance score counts rules by identity, and WhatsNext correlates
results across repositories and versions by `ruleId`. Dual identity at that point is not untidiness,
it is two different denominators and two different join keys.

The mismatch is also not merely stylistic. `uiCapabilitiesMustBeAgentOperable` and
`non-ui-capabilities` are different words, and read quickly, they appear to describe opposite things.
A mechanical case transform does not reconcile them; a decision does.

## Decision

**The rule ID is the single canonical identity. A policy key *is* a rule ID.**

The canonical form is `category.kebab-case-name`, per
[Standard 26](../../standards/26-stable-rule-ids.md) R1, and the rule IDs enumerated there are the
canonical names. A policy declaration's key path, dot-joined, must equal the rule ID exactly:

```yaml
ai:
  non-ui-capabilities: required
  provider-neutral: required
  propose-execute: required
```

```yaml
exceptions:
  - rule: ai.non-ui-capabilities
```

Three consequences:

1. **There is no separate policy-key namespace.** Nothing maps between "the policy name" and "the
   rule name", because there is one name.
2. **The camelCase forms become recorded aliases, not peer names.** The rule catalog
   ([Standard 27](../../standards/27-rule-catalog.md)) carries an `aliases` field. A validator MUST
   accept an alias on read, resolve it to the canonical ID, and warn. It MUST NOT emit an alias in
   any output, score, or generated policy.
3. **Aliases are permanent-until-removed, and removal is `MAJOR`.** An alias is how a years-old
   exception keeps meaning what its author intended
   ([Standard 26](../../standards/26-stable-rule-ids.md) R3 rule 5). Dropping one silently
   re-activates a waived rule.

The rule IDs listed in Standard 26 R1 are hereby spent
([Standard 26](../../standards/26-stable-rule-ids.md) R3 rule 1) and may not be reused for a
different meaning, including the ones no validator implements yet.

## Alternatives considered

**Make camelCase canonical and alias the kebab IDs.** Rejected. The kebab list is the one the source
designates as *stable machine-readable IDs* and the one item 26 says external systems reference. It
is also the form that appears in validator output, which is what WhatsNext ingests. Choosing the
other side would mean the stable identity was the alias.

**Rename `ai.non-ui-capabilities` to something clearer while resolving this.** Rejected, though
tempting — the name is genuinely poor. [Standard 26](../../standards/26-stable-rule-ids.md) R3 rule 2
exists precisely for this: titles are prose and may be improved freely, IDs may not. Clarity is
bought by fixing the title, not the key.

**Define a mapping table between the two namespaces.** Rejected. A mapping is a second source of
truth that must be maintained in lockstep with both sides, and it makes "which name is real" an
answer that depends on which direction you are travelling. The alias mechanism is deliberately
one-directional: aliases resolve *to* canonical, never the reverse.

**Leave it to the catalog implementation.** Rejected — that is what was done, and Standards 30 and 31
are where it stops being affordable.

## Consequences

**Makes easier.** One join key across policy, exceptions, catalog, validator output, scoring, and
external consumers. A score's denominator is unambiguous. An exception can be checked against the
catalog mechanically.

**Makes harder.** The source's own example policy and exception snippets no longer match the canonical
form. Every standard reproducing them must disclose the departure rather than present them as
source text — the same discipline [ADR 0001](0001-canonical-status-vocabulary.md) established.
Migration also lands on any project that wrote a policy against the earlier examples, which is why
aliases are accepted rather than rejected outright.

**Commits the project to.** Never introducing a second namespace for a rule. Any future need to name
a rule differently for a particular consumer is served by an alias resolving to the canonical ID, and
by nothing else.

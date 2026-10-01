# Design preparation - packaged semantic-manifest identity (#55)

## Direction and unresolved status

The approved direction is a **packaged canonical semantic-manifest digest** identifying the producer
rule semantics behind a result. No field name, exact manifest boundary, serialization algorithm,
digest algorithm, or portability guarantee is selected here. `standardVersion` keeps its current
meaning, Standard 31 R4 remains `unknown`, and no portfolio tooling is introduced.

## Candidate boundaries for later decision

The review must compare, without silently choosing among them:

1. Catalog and schema resources only.
2. Catalog, schemas, evaluator/detector modules, and normative standard clauses they implement.
3. An explicit packaged manifest enumerating semantic resources, including generated equivalents.

For each candidate, enumerate inclusions and exclusions, explain whether prose that changes a
machine-visible result is semantic, and specify how generated and packaged resources map to their
authoritative sources. Incidental package metadata, timestamps, filesystem enumeration order, and
unrelated documentation are candidate exclusions, not decided exclusions.

## Canonicalization questions

- deterministic entry ordering and duplicate-path handling;
- path separator, case, Unicode, and relative-root normalization;
- CRLF/LF and final-newline treatment;
- byte versus parsed-data normalization for JSON and other resources;
- generated-resource identity and source/package parity;
- serialization format and its own version identifier;
- digest algorithm and algorithm-agility field;
- supported Node/runtime versions and cross-runtime determinism;
- missing, unreadable, extra, or duplicate required resources: fail explicitly rather than emit a
  misleading partial identity.

## Recommended design process; no selection

Build candidate manifests from the package boundary first, because an installed package has no Git
metadata, then test whether checkout and `git archive` can reproduce the same declared inputs. Select
the narrowest boundary that changes for every demonstrated semantic change and remains invariant for
demonstrated nonsemantic noise. This is a recommendation for evaluation, not an approved algorithm.

## Portability falsifiers

- Equivalent checkout, `git archive`, and installed-package materializations yield one identity.
- Enumeration order, path separators, and CRLF/LF do not change it under the chosen contract.
- Every declared semantic input mutation changes it.
- Declared nonsemantic noise does not change it.
- Missing or ambiguous required resources fail loudly.
- Supported runtimes produce byte-identical canonical serialization and digest input.

Until these choices are approved and implemented, the envelope establishes no finer semantic
identity than its current release fields.

# Standard 50 — Security Prohibitions

Every prohibition here shares a shape: a security control gets in the way of finishing something, and
turning it off makes the obstacle disappear. That is why they are invariants rather than guidance —
the pressure to violate them arrives exactly when the deadline does, and a rule that yields to that
pressure was never a control.

Source: the "Security" section of
[`artifacts/prompts/second-fold-in-prompt.md`](../artifacts/prompts/second-fold-in-prompt.md).

## Scope

Applies to every repository under the framework. Part of the must-never layer defined by
[Standard 45](45-engineering-invariants.md). [Standard 16](16-security.md) states the security
requirements a project must document and satisfy; this standard states what may never be done to
them.

## Requirements

### R1 — Never disable an access control to solve an implementation problem

Reproduced verbatim from the source:

* disable authentication to solve an implementation problem
* disable authorization to solve an implementation problem
* bypass certificate validation
* disable security controls merely because they complicate development
* trust client-provided authorization claims without validation

Rule `security.no-disabled-access-controls`, `forbidden`, `manual-review`, **non-exemptible** —
covering authentication, authorization, client-claim trust, and controls disabled for convenience.
Certificate validation is separated into R2 because it is detectable and the rest are not.

*To solve an implementation problem* and *merely because they complicate development* are the
qualifiers, and they are internal to the prohibition, which is why no exception can be legitimate
([Standard 45](45-engineering-invariants.md) R3): every remaining case is the one the rule exists to
stop.

**A designed development gate is design, not disabling.** A local environment that authenticates
against a test identity provider, a feature flag that routes to a stub authorizer in CI, a seeded
test user — these are *implemented* auth paths chosen deliberately, configured per environment, and
incapable of being switched on in production. They are not this rule's subject. The violation is the
control removed or short-circuited so that something else can proceed, and its tell is that
production behaviour changed to unblock development.

**Violation:**

```text
if (process.env.SKIP_AUTH) return next();          // added while debugging a failing integration
const role = req.headers["x-user-role"];           // the client says which role it has
if (role === "admin") return allow();
```

**Permitted:**

```text
const authenticator = config.authProvider === "test" ? testIdp : oidc;   // per-environment, config-
await authenticator.verify(req);                                          // driven, always verifying
const role = await roles.forSubject(claims.sub);                          // resolved server-side
```

### R2 — Never bypass certificate validation

The prohibition R1 lists, given its own rule because it is one of the few security failures with an
unambiguous machine signature.

Rule `security.no-cert-bypass`, `forbidden`, `code-analysis`, `assurance: partial`, exemptible.

The detector reads the **structural** view of code — comments removed and string contents blanked —
so a pattern named in a comment or quoted in a string is not a finding. Mentioning
`rejectUnauthorized` in documentation is not disabling it.

Detected: `rejectUnauthorized: false`, `NODE_TLS_REJECT_UNAUTHORIZED`, `verify=False` on a Python
request, `InsecureSkipVerify: true` in Go, an always-true .NET certificate-validation callback, and
`curl -k` in a shell script.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | A test suite exercising TLS behaviour against a self-signed certificate, in code that cannot run outside the test environment |
| Justification | What is being tested and why a real certificate cannot be used |
| Evidence | The file path, which must be a test file, and the environment gate |
| Approval | Not required for test code; required, with a named approver, for anything reachable in production |
| Revisit | When the certificate authority or test fixture changes |

### R3 — Never build SQL by concatenating untrusted input

Reproduced verbatim from the source:

* construct vulnerable SQL through untrusted string concatenation

Rule `security.no-sql-concat`, `forbidden`, `code-analysis`, `assurance: partial`, exemptible.

The detector reads the **source** view — comments removed, string contents intact — because the
interpolation being detected lives inside a string literal.

**The covered subset is stated, and it is narrower than the prohibition.** Detected: a template
literal containing a whole SQL *statement* and an interpolation
(`` `SELECT * FROM users WHERE id = ${id}` ``), and the Python f-string equivalent. **Not detected:
the string-concatenation form** (`"SELECT ... " + id`), which was implemented, produced too many
false positives on ordinary string building, and was removed rather than shipped as a check that
would be ignored — the brittle-check prohibition in
[Standard 45](45-engineering-invariants.md) R5.

*A statement rather than a keyword*, and that distinction was bought rather than reasoned. The first
version matched any of `SELECT`, `WHERE`, or `ORDER BY` and, on its first run, reported this
repository's own catalog loader: `const where = \`${file}: ...\`` — an ordinary variable named
`where`. The detector was narrowed to require a full statement shape before the interpolation. It is
recorded here because it is the brittle-check prohibition catching a check written under this
standard, one commit after the standard was written.

Therefore, and this is normative: **a clean result on this rule means "no supported pattern was
detected", never "this project has no SQL injection risk."** A reviewer citing a passing
`security.no-sql-concat` as evidence of the second is misreading it, and
[Standard 45](45-engineering-invariants.md) R2 is why.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | A schema or identifier position where parameters are not permitted by the database (a table name, a sort column) |
| Justification | Why the value cannot be parameterized |
| Evidence | The allow-list the value is validated against, in the code, before interpolation |
| Approval | Not required where the allow-list is present |
| Revisit | When the query builder or the database changes |

**Violation:**

```text
const rows = await db.query(`SELECT * FROM orders WHERE customer = ${req.query.customer}`);
```

**Permitted:**

```text
const rows = await db.query("SELECT * FROM orders WHERE customer = $1", [req.query.customer]);
const col = SORTABLE.includes(req.query.sort) ? req.query.sort : "created_at";   // allow-listed
const rows2 = await db.query(`SELECT * FROM orders ORDER BY ${col}`);
```

### R4 — Never execute untrusted input as code without a designed sandbox

Reproduced verbatim from the source:

* execute untrusted input as code without an explicitly designed sandbox/security model

Rule `security.no-untrusted-exec`, `forbidden`, `manual-review`, exemptible.

**Deliberately not automated.** A detector could find `eval`, `exec`, `Function()`, and dynamic
imports easily — and would say nothing about the prohibition, because the qualifier is *untrusted
input* and *without an explicitly designed sandbox*. Whether an argument is attacker-controlled and
whether a sandbox exists are both undecidable from the call site. A check that flagged every `eval`
would be noise, and its clean runs would be counted as assurance they had not earned.

**Exception conditions:**

| Field | Requirement |
| --- | --- |
| Condition | The execution is the product — a rules engine, a notebook runtime, a plugin host |
| Justification | What is executed, and by whom |
| Evidence | The sandbox: the isolation boundary, the resource limits, and the capability restrictions, each named and located |
| Approval | The security owner, named |
| Revisit | When the isolation mechanism changes |

### R5 — Never expose secrets through logs

Reproduced verbatim from the source:

* expose secrets through logs

**Already bound**, and no new rule id is minted ([Standard 45](45-engineering-invariants.md) R4):
[Standard 16](16-security.md) R2, with [Standard 3](03-auditing.md) R5 for audit logs and
[Standard 12](12-structured-errors.md) R5 for error payloads.
[Standard 48](48-error-handling-and-observability.md) R5 states the same routing from the
observability side.

**Single owner for committed secrets.** The `security.no-secrets-in-artifacts` detector added at
2.0.0 does not read `.env` files; `scm.no-committed-env-files`
([Standard 46](46-source-control-safety.md) R2) owns those by filename, so one defect produces one
finding.

## Additions this standard makes beyond the source

- Splitting certificate bypass out of the access-control rule, on the grounds that it is detectable
  and the rest of that list is not.
- R1's designed-development-gate distinction, without which the rule reads as a prohibition on test
  environments.
- R3's explicit statement of the covered subset, the removal of the string-concatenation form with
  the reason, and the normative sentence about what a clean result means.
- R4's reasoning for *not* automating a check that would be trivial to write.
- The per-detector declaration of which source view is scanned, which is how the use/mention defect
  is prevented structurally rather than by care.
- The exception tables.

## Relationship to other standards

[Standard 16](16-security.md) is the requirements this standard protects, and its R2 is what R5
routes to. [Standard 45](45-engineering-invariants.md) defines `forbidden`, non-exemptibility, the
brittle-check prohibition R3 and R4 both invoke, and in R2 what a clean forbidden result may claim.
[Standard 24](24-validator-rules.md) is the general form of that limit.
[Standard 46](46-source-control-safety.md) R2 owns committed environment files.
[Standard 53](53-ai-engineering-honesty.md) R5 is R1's agent-facing dual — an agent bypassing a
safety control to complete a task.

## Implementation

**Partially implemented — two of five rules are evaluated.**

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `security.no-disabled-access-controls` | `manual-review`, non-exemptible. Distinguishing a designed dev gate from a disabled control requires knowing the deployment model |
| R2 | `security.no-cert-bypass` | Evaluated, `code-analysis`/`partial`. Structural view; a mention in a comment or string is not a finding |
| R3 | `security.no-sql-concat` | Evaluated, `code-analysis`/`partial`. Source view; template-literal and f-string forms only, as R3 states |
| R4 | `security.no-untrusted-exec` | `manual-review`. Deliberately not automated |
| R5 | [16](16-security.md) R2 | Already bound; the artifact side is evaluated by `security.no-secrets-in-artifacts` |

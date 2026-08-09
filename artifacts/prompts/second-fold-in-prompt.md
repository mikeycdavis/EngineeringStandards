Extend the existing engineering standards with a comprehensive **Engineering Must-Never Standards** layer.

Do not redesign the existing standards framework or duplicate standards already present.

First inspect the repository to understand:

* current engineering standards
* architecture standards
* AI standards
* security standards
* applicability mechanisms
* evidence requirements
* verification mechanisms
* CLI behavior
* tests
* documentation

Then identify dangerous engineering behaviors that should be explicitly prohibited.

The objective is to establish engineering invariants where the correct response is:

> STOP. This implementation violates an engineering standard.

These rules should apply to both human-written and AI-generated changes.

## Categories

Evaluate and create prohibitions covering at least:

### Source control

Never:

* commit secrets
* commit credentials
* commit private keys
* commit production tokens
* commit generated junk unnecessarily
* rewrite shared history without explicit justification
* delete meaningful history merely to simplify implementation

### Testing

Never:

* delete a legitimate test merely because it fails
* weaken assertions simply to make tests pass
* skip tests to hide failures
* mock the behavior being tested so completely that the test becomes meaningless
* claim tests passed without executing them
* fabricate test output
* reduce coverage solely to satisfy CI
* replace behavioral verification with tautological tests

### Errors

Never:

* silently swallow unexpected exceptions
* use empty catch blocks without explicit justification
* report success after an operation failed
* discard important error context
* retry indefinitely
* convert failures into misleading successful responses

### Data

Never:

* perform destructive data operations by default
* execute destructive migrations without a rollback/recovery strategy where recovery is feasible
* silently discard user data
* corrupt historical/audit data to satisfy a new schema
* assume migrations succeeded without verification
* use production data unsafely in development/test environments

### Security

Never:

* disable authentication to solve an implementation problem
* disable authorization to solve an implementation problem
* bypass certificate validation
* disable security controls merely because they complicate development
* trust client-provided authorization claims without validation
* expose secrets through logs
* construct vulnerable SQL through untrusted string concatenation
* execute untrusted input as code without an explicitly designed sandbox/security model

### Architecture

Never:

* introduce hidden global state without justification
* duplicate critical domain logic across layers
* put critical business rules exclusively in UI code
* create circular dependencies intentionally
* bypass established boundaries merely because it is easier
* introduce dependencies without evaluating whether they are necessary
* create a second implementation of an existing capability without justification

### APIs

Never:

* silently change a public contract
* silently reinterpret existing fields
* return successful HTTP/status semantics for failed operations merely to hide errors
* remove compatibility without explicitly assessing consumers

### Concurrency

Never:

* assume operations are atomic when they are not
* ignore known race conditions
* use shared mutable state without defining synchronization behavior
* implement retry behavior that can duplicate non-idempotent operations without protection

### Observability

Never:

* log secrets
* log sensitive information unnecessarily
* claim an operation is observable when critical failure paths are invisible
* remove useful telemetry solely to hide errors/noise

### AI-generated engineering

Never:

* fabricate APIs
* fabricate library capabilities
* claim code compiles without compiling it when compilation is available
* claim tests pass without running them
* invent repository state
* silently change requirements
* silently expand scope
* remove functionality because implementing it is difficult
* replace production implementations with placeholders while claiming completion
* leave TODOs/stubs while claiming the feature is complete
* bypass a safety control to complete a task
* alter tests instead of fixing the defect unless the test itself is demonstrably incorrect

## Severity

Must-never standards should normally be treated as invariants or the strongest severity supported by the existing framework.

However, avoid absolute rules when legitimate exceptions exist.

Where exceptions are necessary, define:

* exact exception conditions
* required justification
* required evidence
* required approval if applicable
* revisit conditions

Do not weaken a useful standard merely because rare exceptions exist.

## Automatic enforcement

Determine which standards can be automatically detected.

Examples may include:

* secret scanning
* empty catch detection
* disabled tests
* unsafe SQL construction
* TODO/stub detection
* destructive command detection
* suspicious TLS validation bypass
* committed environment files
* test removal
* coverage regression
* ignored compiler warnings where relevant

Do not implement brittle automated checks that create more false confidence than value.

Clearly distinguish:

* automatically verified
* partially verified
* review required

## Meta-standard

Add a rule equivalent to:

> Standards and tests must never be weakened, removed, bypassed, or reclassified solely to permit an implementation that would otherwise violate them.

This should itself be treated as an engineering invariant.

## Deliverables

Implement the new prohibitions using the existing standards architecture.

Add:

* standards
* applicability rules
* evidence requirements
* verification
* tests
* documentation
* violation examples

Run all repository validation.

Do not modify unrelated standards merely to make the new implementation pass.

At completion report:

* prohibitions introduced
* existing standards reused instead of duplicated
* automated checks
* review-only checks
* exceptions
* tests added
* complete validation result
* remaining blind spots

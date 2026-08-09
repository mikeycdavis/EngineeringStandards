# Prohibited patterns

The audit reports each of these:

- `rejectUnauthorized: false` and `NODE_TLS_REJECT_UNAUTHORIZED`
- `InsecureSkipVerify: true`, `verify=False`
- an AWS key shaped like AKIAIOSFODNN7EXAMPLE
- a query built as `SELECT * FROM orders WHERE id = ${id}`
- an empty `catch (e) {}`

Naming them is how the prohibition is documented. None of this is a violation.

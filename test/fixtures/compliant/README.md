# Compliant fixture

This fixture represents a repository that satisfies every category the audit can currently check.
It exists so that the audit's negative cases are asserted as deliberately as its positive ones: a
detector that fires on everything is as useless as one that never fires at all.

It has architecture documentation, a substantive readme, a route handler, a real third-party import,
a test suite, a CI workflow, a complete plan breakdown, and a reconstruction baseline whose questions
have all been answered. Run it with `src/api/routes.js` present and the audit should report no errors
and none of the missing-* categories.

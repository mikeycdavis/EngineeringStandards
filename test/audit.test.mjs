/**
 * Tests for the standards audit.
 *
 * These run the real CLI as a subprocess and assert on its --json output, so they exercise argument
 * parsing, scanning, and serialization rather than internal functions. Uses node:test, which ships
 * with Node 18+, keeping the zero-dependency rule.
 *
 * Every category is asserted twice: once on a fixture that must provoke it, and once on a fixture
 * that must not. The second assertion is the one that matters. Both bugs this tool has shipped were
 * false positives — a detector firing on a repository that named a technology rather than using it —
 * and a suite that only checks detectors fire would have passed while both were live.
 *
 * Fixtures are audited with --dir= so the root is the fixture itself. Without it the root walk-up
 * would escape the fixture and find this repository instead.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const REPO = path.join(HERE, "..");
const fixture = (name) => path.join(HERE, "fixtures", name);

function audit(dir, extra = []) {
  const r = spawnSync(process.execPath, [CLI, "audit", `--dir=${dir}`, "--json", ...extra], {
    encoding: "utf8",
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    assert.fail(`stdout was not JSON.\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
  }
  return { code: r.status, json, stderr: r.stderr };
}

const ids = (res) => new Set(res.json.findings.map((f) => f.id));
const of = (res, id) => res.json.findings.filter((f) => f.id === id);
const evidenceOf = (res, id) => of(res, id).flatMap((f) => f.evidence);

// ---------------------------------------------------------------------------
// Regression guards for the two false positives this tool has actually shipped
// ---------------------------------------------------------------------------

test("naming an SDK without importing it is not an integration", () => {
  const res = audit(fixture("naming-only"));
  assert.ok(
    !ids(res).has("detected-integrations"),
    "a file that only mentions stripe/aws-sdk in comments and strings must not count as usage",
  );
  assert.ok(
    !ids(res).has("detected-ai-interfaces"),
    "a file that only mentions openai/anthropic in comments and strings must not count as usage",
  );
});

test("importing an SDK is an integration", () => {
  const res = audit(fixture("compliant"));
  assert.ok(ids(res).has("detected-integrations"), "a real `import Stripe from \"stripe\"` must be detected");
  assert.match(of(res, "detected-integrations")[0].message, /Stripe/);
});

test("a Markdown file naming TODO is not unfinished work", () => {
  const res = audit(fixture("markers"));
  const evidence = evidenceOf(res, "potential-unfinished-features");
  assert.ok(evidence.length > 0, "the fixture's real code TODO must still be found");
  assert.ok(
    !evidence.some((e) => e.endsWith(".md")),
    `prose describing markers must not be flagged; got ${JSON.stringify(evidence)}`,
  );
  assert.deepEqual(evidence, ["src/work.js"]);
});

test("prose describing schedulers and routes is not code", () => {
  // The fourth false positive of this family: this repository's own architecture document names
  // Celery, Sidekiq, BullMQ and the route-registration patterns the detectors match, and was
  // reported as a background job. Documentation describes; it does not implement.
  const res = audit(fixture("markers"));
  for (const id of ["detected-jobs", "detected-apis"]) {
    const md = evidenceOf(res, id).filter((e) => e.endsWith(".md"));
    assert.deepEqual(md, [], `${id} matched prose in ${JSON.stringify(md)}`);
  }

  const self = audit(REPO);
  const proseHits = ["detected-jobs", "detected-apis"].flatMap((id) =>
    evidenceOf(self, id).filter((e) => e.endsWith(".md")),
  );
  assert.deepEqual(proseHits, [], "this repository's own Markdown must never match a code signal");
});

test("a comment naming a job library is not a job, but importing one is", () => {
  // The fifth instance: a comment in this suite naming Celery and BullMQ made the test file itself
  // register as a background job. Library names go through importPattern() everywhere now.
  assert.deepEqual(
    evidenceOf(audit(REPO), "detected-jobs"),
    [],
    "this repository runs no background jobs; comments naming them must not say otherwise",
  );

  assert.deepEqual(
    evidenceOf(audit(fixture("compliant")), "detected-jobs"),
    ["src/jobs/nightly.js"],
    "a real `import { Queue } from \"bullmq\"` must still be detected",
  );
});

test("mentions inside a code file are not uses", () => {
  // The structural fix for the recurring defect. test/fixtures/markers/src/commented.js is a real
  // .js file containing commented-out routes, an abandoned worker in a block comment, SDK names in
  // a comment, and code-shaped strings. No file-extension filter can help here — only the
  // use/mention split can, which is why this test exists rather than another exclusion list.
  const res = audit(fixture("markers"));
  for (const id of ["detected-apis", "detected-jobs", "detected-integrations", "detected-ai-interfaces"]) {
    assert.deepEqual(
      evidenceOf(res, id),
      [],
      `${id} matched a mention: commented-out code and quoted strings are not usage`,
    );
  }
  assert.deepEqual(
    evidenceOf(res, "potential-unfinished-features"),
    ["src/work.js"],
    'the string "TODO: this string mentions a marker" must not count; only the real comment marker does',
  );
});

test("the same signals, genuinely used, are still detected", () => {
  // The other half. Without this, the test above could be satisfied by detecting nothing at all.
  const res = audit(fixture("compliant"));
  assert.deepEqual(evidenceOf(res, "detected-apis"), ["src/api/routes.js"], "a real app.get( call");
  assert.deepEqual(evidenceOf(res, "detected-jobs"), ["src/jobs/nightly.js"], "a real bullmq import");
  assert.deepEqual(evidenceOf(res, "detected-integrations"), ["src/api/routes.js"], "a real stripe import");
});

// ---------------------------------------------------------------------------
// The delegated-liveness trap
// ---------------------------------------------------------------------------

test("plan items delegated to a backlog still produce findings", () => {
  const res = audit(fixture("delegated"));
  const discrepancies = of(res, "plan-code-discrepancies");
  assert.ok(
    discrepancies.length > 0,
    "every item here is `tracked as <id>`; a done-only check reports zero and would be wrong",
  );
  assert.ok(res.json.findings.some((f) => f.severity === "error"));
});

test("a backlog id that resolves to nothing is reported", () => {
  const res = audit(fixture("delegated"));
  const dangling = of(res, "plan-code-discrepancies").filter((f) =>
    f.evidence.some((e) => e.includes("ST-999")),
  );
  assert.equal(dangling.length, 1, "the item pointing at ST-999 must be reported exactly once");
  assert.equal(dangling[0].severity, "error");
  assert.match(dangling[0].standardRef, /#r7--reconstructed-plan-and-plan-items$/);
});

test("a delegated item resolved to done is checked against its deliverables", () => {
  const res = audit(fixture("delegated"));
  const missing = of(res, "plan-code-discrepancies").filter((f) =>
    f.evidence.some((e) => e.includes("ghost.js")),
  );
  assert.equal(missing.length, 1, "ST-002 resolves to done, so its missing deliverable must be caught");
  assert.ok(
    !evidenceOf(res, "plan-code-discrepancies").some((e) => e.includes("real.js")),
    "ST-001's deliverable exists and must not be reported",
  );
});

// ---------------------------------------------------------------------------
// Absence categories: provoked, and not provoked
// ---------------------------------------------------------------------------

test("a complete repository provokes none of the missing-* categories", () => {
  const found = ids(audit(fixture("compliant")));
  for (const id of ["missing-documentation", "missing-planning-artifacts", "missing-audit-infrastructure"]) {
    assert.ok(!found.has(id), `${id} fired on a fixture that satisfies it`);
  }
});

test("an incomplete repository provokes the missing-* categories", () => {
  const found = ids(audit(fixture("delegated")));
  assert.ok(found.has("missing-documentation"), "no docs/architecture.md and a one-line README");
  assert.ok(found.has("missing-audit-infrastructure"), "no tests and no CI");
});

test("a repository with no plan breakdown is reported", () => {
  const res = audit(fixture("naming-only"));
  assert.ok(ids(res).has("missing-planning-artifacts"));
  assert.match(of(res, "missing-planning-artifacts")[0].standardRef, /#r4--/);
});

test("unanswered reconstruction questions are counted, answered ones are not", () => {
  const res = audit(fixture("delegated"));
  const q = of(res, "open-reconstruction-questions");
  assert.equal(q.length, 1);
  assert.match(q[0].message, /^2 reconstruction question/, "two open, one answered — the answered one must not count");

  assert.ok(
    !ids(audit(fixture("compliant"))).has("open-reconstruction-questions"),
    "a baseline whose questions are all answered must not be reported",
  );
});

test("a baseline directory without its baseline document violates R4", () => {
  const res = audit(fixture("delegated"));
  const v = of(res, "standards-violations").filter((f) => /R4/.test(f.message));
  assert.equal(v.length, 1);
  assert.equal(v[0].severity, "error");

  assert.ok(
    !of(audit(fixture("compliant")), "standards-violations").some((f) => /R4/.test(f.message)),
    "the compliant fixture has reconstructed-baseline.md and must not be reported",
  );
});

test("plan items missing required fields violate R7", () => {
  const res = audit(fixture("delegated"));
  const v = of(res, "standards-violations").filter((f) => /R7/.test(f.message));
  assert.equal(v.length, 1, "the fixture's last item omits four of the six fields");

  assert.ok(
    !of(audit(fixture("compliant")), "standards-violations").some((f) => /R7/.test(f.message)),
    "the compliant fixture's item carries all six fields",
  );
});

// ---------------------------------------------------------------------------
// Descriptive categories
// ---------------------------------------------------------------------------

test("an architecture document is OBSERVED, its absence is INFERRED", () => {
  const withDoc = of(audit(fixture("compliant")), "observed-architecture");
  assert.equal(withDoc[0].label, "OBSERVED");

  const without = of(audit(fixture("naming-only")), "observed-architecture");
  assert.equal(without[0].label, "INFERRED", "structure guessed from layout is an inference, not an observation");
});

test("route handlers are detected", () => {
  const res = audit(fixture("compliant"));
  assert.ok(ids(res).has("detected-apis"));
  assert.ok(evidenceOf(res, "detected-apis").includes("src/api/routes.js"));

  assert.ok(!ids(audit(fixture("markers"))).has("detected-apis"), "a fixture with no routes must report none");
});

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

test("every finding carries the full schema", () => {
  const required = ["id", "category", "severity", "label", "evidence", "message", "standardRef"];
  for (const name of ["compliant", "delegated", "naming-only", "markers"]) {
    const res = audit(fixture(name));
    assert.equal(res.json.schemaVersion, 1);
    assert.match(res.json.auditedAt, /^\d{4}-\d\d-\d\dT.*Z$/);
    for (const f of res.json.findings) {
      for (const key of required) assert.ok(key in f, `${name}: finding ${f.id} lacks ${key}`);
      assert.ok(["error", "warning", "info"].includes(f.severity), `${name}: bad severity ${f.severity}`);
      assert.ok(["OBSERVED", "INFERRED", "CONFIRMED_BY_OWNER", "UNKNOWN"].includes(f.label));
      assert.ok(Array.isArray(f.evidence));
    }
  }
});

test("every standardRef resolves to a heading that exists", async () => {
  const { readFile } = await import("node:fs/promises");
  const md = await readFile(path.join(REPO, "standards/44-existing-project-reconstruction.md"), "utf8");
  const anchors = new Set(
    md
      .split(/\r?\n/)
      .filter((l) => /^#{2,3} /.test(l))
      .map((l) => l.replace(/^#+ /, "").toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-")),
  );
  let checked = 0;
  for (const name of ["compliant", "delegated", "naming-only", "markers"]) {
    for (const f of audit(fixture(name)).json.findings) {
      const [, anchor] = f.standardRef.split("#");
      assert.ok(anchors.has(anchor), `${f.id} points at #${anchor}, which is not a heading`);
      checked++;
    }
  }
  assert.ok(checked > 0);
});

test("heuristic findings are never labeled OBSERVED", () => {
  for (const name of ["compliant", "delegated", "naming-only", "markers"]) {
    for (const f of audit(fixture(name)).json.findings) {
      if (/naming|pattern|inferred from|referenced in source|no test files/i.test(f.message)) {
        assert.equal(f.label, "INFERRED", `${name}: ${f.id} reports a heuristic as observed`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// CLI behavior
// ---------------------------------------------------------------------------

test("--strict fails only when something needs attention", () => {
  assert.equal(audit(fixture("delegated"), ["--strict"]).code, 1);
  assert.equal(audit(fixture("delegated")).code, 0);
  assert.equal(audit(fixture("compliant"), ["--strict"]).code, 0, "the compliant fixture must pass --strict");
});

test("bad invocations exit 1", () => {
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  assert.equal(run([]).status, 1, "no subcommand");
  assert.equal(run(["frobnicate"]).status, 1, "unknown subcommand");
  assert.equal(run(["audit", path.join(HERE, "no-such-dir")]).status, 1, "missing directory");
  assert.equal(run(["--help"]).status, 0);
});

test("this repository has no error-severity findings", () => {
  const res = audit(REPO);
  const errors = res.json.findings.filter((f) => f.severity === "error");
  assert.deepEqual(
    errors.map((f) => f.message),
    [],
    "the standards repository must satisfy the standards it publishes",
  );
});

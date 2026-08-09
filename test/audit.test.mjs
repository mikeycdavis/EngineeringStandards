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
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
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

test("status is canonical and Tracked by is a separate field", () => {
  // Standard 8 R2: a reference to another system is not a status. The fixture uses the canonical
  // vocabulary with `Tracked by` alongside it, and the audit must resolve through that field.
  const res = audit(fixture("delegated"));
  const plan = of(res, "plan-code-discrepancies");
  assert.ok(plan.length >= 2, "both the dangling reference and the missing deliverable must be found");
  assert.ok(
    evidenceOf(res, "plan-code-discrepancies").some((e) => e.includes("ST-999")),
    "a Tracked by pointing at a nonexistent backlog item is still caught",
  );
  assert.ok(
    evidenceOf(res, "plan-code-discrepancies").some((e) => e.includes("ghost.js")),
    "an item whose backlog entry is COMPLETE is still checked against its deliverables",
  );
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

// ---------------------------------------------------------------------------
// Standard 44 R11 — the tool must not read its own scaffolding as a plan
// ---------------------------------------------------------------------------

/**
 * Built rather than committed, for the same reason init's fixtures are: this one is defined by what
 * it does NOT contain — an empty directory — and an empty directory does not survive git.
 */
async function scaffold(overview = null) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-scaffold-"));
  await mkdir(path.join(dir, "src"), { recursive: true });
  await writeFile(path.join(dir, "src/x.js"), "export const x = 1;\n", "utf8");
  // Exactly what `standards init` leaves in reconstruction mode: the directory, and nothing in it.
  await mkdir(path.join(dir, "artifacts/project-plan-breakdown"), { recursive: true });
  if (overview !== null) {
    await writeFile(path.join(dir, "artifacts/project-plan-breakdown/00-overview.md"), overview, "utf8");
  }
  return dir;
}

test("an empty plan directory init created is not a plan (Standard 44 R11)", async () => {
  // The trap this guards: init creates the directory EMPTY on purpose, so any detector that tests
  // for its presence reports "this project has a plan" on the strength of the tool's own output.
  const dir = await scaffold();
  try {
    const res = audit(dir);
    assert.ok(
      ids(res).has("missing-planning-artifacts"),
      "an empty plan directory must still be reported as missing planning artifacts",
    );

    // And the two commands must agree. init routing to reconstruction while audit reports a plan
    // would leave the operator with two answers and no way to tell which one looked.
    const r = spawnSync(process.execPath, [CLI, "init", `--dir=${dir}`, "--dry-run", "--json"], {
      encoding: "utf8",
    });
    const out = JSON.parse(r.stdout);
    assert.equal(out.reconstructionRequired, true, "init must route an empty plan dir to reconstruction");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a plan overview that is headings only is not a plan either", async () => {
  // One level past the empty directory: a file exists, so a presence check passes, and it says
  // nothing. The check stops here — whether real prose is a genuine plan is a judgement, and
  // Standard 44's Implementation section says so rather than implying this covers it.
  const dir = await scaffold("# Overview\n\n## Sections\n");
  try {
    const res = audit(dir);
    const f = of(res, "missing-planning-artifacts");
    assert.equal(f.length, 1);
    assert.match(f[0].message, /headings only/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a plan overview with real content is accepted", async () => {
  // The mutation in reverse, and the assertion that matters: give the same fixture substantive
  // prose and the finding must disappear. Without this the two tests above would pass on a detector
  // that simply always fires.
  const dir = await scaffold("# Overview\n\nOne section, covering the API surface in `01-api.md`.\n");
  try {
    assert.ok(
      !ids(audit(dir)).has("missing-planning-artifacts"),
      "a plan overview with content must not be reported",
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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

test("an owner confirmation with no date is reported; a dated one is not", () => {
  // R3 requires the date and R9 requires the rest of the provenance. Only the date is greppable,
  // so only the date is checked — the negative fixture is what keeps this from being a detector
  // that fires on the word CONFIRMED_BY_OWNER itself.
  const res = audit(fixture("delegated"));
  const f = of(res, "undated-owner-confirmation");
  assert.equal(f.length, 1);
  assert.match(f[0].message, /^1 CONFIRMED_BY_OWNER label/);

  assert.ok(
    !ids(audit(fixture("compliant"))).has("undated-owner-confirmation"),
    "a confirmation carrying (YYYY-MM-DD) must not be reported",
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
    // Semantic versioning, normalised in ADR 0004 so schemaVersion and standardVersion share a
    // format. They remain independently versioned — independence means they may diverge
    // numerically, not that they use different shapes.
    assert.equal(res.json.schemaVersion, "1.0.0");
    assert.match(res.json.auditedAt, /^\d{4}-\d\d-\d\dT.*Z$/);
    for (const f of res.json.findings) {
      for (const key of required) assert.ok(key in f, `${name}: finding ${f.id} lacks ${key}`);
      assert.ok(["error", "warning", "info"].includes(f.severity), `${name}: bad severity ${f.severity}`);
      assert.ok(["OBSERVED", "INFERRED", "CONFIRMED_BY_OWNER", "UNKNOWN"].includes(f.label));
      assert.ok(Array.isArray(f.evidence));
    }
  }
});

test("every standardRef resolves to a heading in the file it names", async () => {
  // Generalized at 2.0.0. It previously loaded standard 44 and checked every anchor against it,
  // which was true only while 44 was the sole standard the audit pointed at. The must-never
  // detectors reference 46, 48, and 50, so the file half of the ref is now resolved too — a ref
  // naming a standard that does not exist would otherwise have passed by being checked against the
  // wrong document.
  const { readFile } = await import("node:fs/promises");
  const anchorsFor = new Map();
  const load = async (file) => {
    if (!anchorsFor.has(file)) {
      const md = await readFile(path.join(REPO, file), "utf8");
      anchorsFor.set(
        file,
        new Set(
          md
            .split(/\r?\n/)
            .filter((l) => /^#{2,3} /.test(l))
            .map((l) => l.replace(/^#+ /, "").toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-")),
        ),
      );
    }
    return anchorsFor.get(file);
  };

  let checked = 0;
  for (const name of ["compliant", "delegated", "naming-only", "markers", "never-violations", "never-clean"]) {
    for (const f of audit(fixture(name)).json.findings) {
      const [file, anchor] = f.standardRef.split("#");
      const anchors = await load(file);
      assert.ok(anchors.has(anchor), `${f.id} points at ${file}#${anchor}, which is not a heading there`);
      checked++;
    }
  }
  assert.ok(checked > 0);
  assert.ok(anchorsFor.size > 1, "every ref resolved to one file — the generalization is untested");
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

test("bad invocations exit 2, not 1", () => {
  // Standard 23 R3: 1 means the tool worked and found problems; 2 means it could not reach a
  // verdict. Collapsing them tells CI that a broken validator is a failing project.
  const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  assert.equal(run([]).status, 2, "no subcommand");
  assert.equal(run(["frobnicate"]).status, 2, "unknown subcommand");
  assert.equal(run(["audit", path.join(HERE, "no-such-dir")]).status, 2, "missing directory");
  assert.equal(run(["--help"]).status, 0, "--help is a successful invocation");
});

test("findings exit 1 only under --strict; a clean run exits 0", () => {
  assert.equal(audit(fixture("delegated")).code, 0, "warnings and errors alone must not fail CI");
  assert.equal(audit(fixture("delegated"), ["--strict"]).code, 1, "--strict promotes them");
  assert.equal(audit(fixture("compliant"), ["--strict"]).code, 0, "a compliant fixture passes --strict");
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

// ---------------------------------------------------------------------------
// The source inventory invariant
// ---------------------------------------------------------------------------

test("source extraction agrees with the reviewed inventory", () => {
  // The item-8 miss is the reason this exists: a regex anchored on the bare `N. Title` form found
  // 43 standards, and that number became a durable project fact in three documents. The inventory is
  // reviewed and committed; extraction is tested against it, so a parser change can disagree but
  // never silently redefine the series.
  const r = spawnSync(process.execPath, [path.join(REPO, "scripts/inventory.mjs"), "--json"], {
    encoding: "utf8",
  });
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true, `inventory disagreement: ${JSON.stringify(out, null, 2)}`);
  assert.equal(r.status, 0);
  assert.equal(out.detectedCount, out.expectedCount);
  assert.equal(out.declaredCount, out.expectedCount);
  assert.deepEqual(out.missing, []);
  assert.deepEqual(out.unknown, []);
  assert.deepEqual(out.duplicates, []);
  assert.deepEqual(out.titleMismatches, []);
});

test("every standard names a source the inventory declares", () => {
  // The enabling invariant for a second source document: an entry whose `source` is not in
  // `sources[]` would be checked against nothing at all — by inventory, and by fidelity, which
  // resolves each standard's source through this same field.
  const r = spawnSync(process.execPath, [path.join(REPO, "scripts/inventory.mjs"), "--json"], {
    encoding: "utf8",
  });
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.orphans, [], "an inventory entry names no declared source");
  assert.deepEqual(out.brokenSections, [], "a standard claims a source section that does not exist");
  assert.deepEqual(
    out.duplicateSections,
    [],
    "two standards claim the same source section without sharedSections",
  );
  assert.equal(
    out.expectedCount,
    out.sources.reduce((n, s) => n + s.expectedCount, 0),
    "the global expected count must be the sum of its sources",
  );
  for (const source of out.sources) {
    assert.equal(
      source.declaredCount,
      source.expectedCount,
      `${source.path} declares ${source.declaredCount} standards but expects ${source.expectedCount}`,
    );
  }
});

test("every implementedBy path exists, and every standards file is claimed", () => {
  const r = spawnSync(process.execPath, [path.join(REPO, "scripts/inventory.mjs"), "--json"], {
    encoding: "utf8",
  });
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.brokenPaths, [], "an inventory entry points at a file that does not exist");
  assert.deepEqual(out.unclaimedFiles, [], "a standards/ file is not claimed by any inventory entry");
});

test("every block claimed as verbatim source really is", () => {
  // Backticks added inside quoted source has happened three times — twice caught by hand, once only
  // when this check was written. It is a failure mode, not a mistake, so it is mechanical now.
  const r = spawnSync(process.execPath, [path.join(REPO, "scripts/fidelity.mjs"), "--json"], {
    encoding: "utf8",
  });
  const out = JSON.parse(r.stdout);
  assert.ok(out.claims > 0, "the checker found no verbatim claims at all — it has stopped working");
  assert.deepEqual(
    out.failures,
    [],
    "a block claimed as source text does not appear in the source; reproduce it exactly or drop the claim",
  );
  assert.equal(r.status, 0);
});

// ---------------------------------------------------------------------------
// The must-never detectors (Standards 46, 48, 50)
//
// The negative fixture is the one that matters. Every one of these patterns is named in this
// framework's own standards documents in order to prohibit it, so a detector that reads prose or
// comments reports the prohibition as a violation — the defect this tool has shipped five times.
// ---------------------------------------------------------------------------

const NEVER = [
  ["committed-env-file", "scm.no-committed-env-files", ".env"],
  ["secret-in-artifact", "security.no-secrets-in-artifacts", "config.yml"],
  ["swallowed-exception", "errors.no-swallowed-exceptions", "src/swallow.js"],
  ["certificate-validation-bypass", "security.no-cert-bypass", "src/tls.js"],
  ["sql-string-interpolation", "security.no-sql-concat", "src/query.js"],
];

test("every must-never detector fires on the fixture that violates it", () => {
  const res = audit(fixture("never-violations"));
  for (const [id, rule, evidence] of NEVER) {
    const found = of(res, id);
    assert.equal(found.length, 1, `${id} did not fire`);
    assert.equal(found[0].rule, rule, `${id} is bound to the wrong canonical rule`);
    assert.equal(found[0].severity, "error");
    assert.ok(
      found[0].evidence.some((e) => e.startsWith(evidence)),
      `${id} did not name ${evidence}: ${JSON.stringify(found[0].evidence)}`,
    );
  }
});

test("no must-never detector fires on the fixture that names every pattern without using one", () => {
  // .env.example and .env.template; a catch with a justification comment and one that rethrows;
  // cert-bypass settings quoted in a string and named in a comment; a parameterized query with an
  // allow-listed sort column; and a Markdown page reproducing all of them as prose.
  const found = ids(audit(fixture("never-clean")));
  for (const [id] of NEVER) {
    assert.ok(!found.has(id), `${id} fired on a fixture that only mentions the pattern`);
  }
});

test("the secret detector leaves .env files to the rule that owns them", () => {
  // Single owner, so one defect produces one finding: the fixture's .env holds a credential and is
  // already an error by filename. A content scan on top would report the same defect twice.
  const res = audit(fixture("never-violations"));
  assert.deepEqual(
    of(res, "secret-in-artifact")[0].evidence.filter((e) => e.startsWith(".env")),
    [],
    "the secret detector read a .env file",
  );
});

test("every must-never detector declares which source view it scans", async () => {
  // Standard 50's review requirement, made mechanical. The use/mention defect was fixed four times
  // by narrowing which FILES are read, and each fix was insufficient; the fifth instance was a
  // mention inside a code file. Declaring the view is what forces the question to be asked.
  const { readFile } = await import("node:fs/promises");
  const src = await readFile(path.join(REPO, "scripts/standards.mjs"), "utf8");
  for (const [, rule] of NEVER) {
    const fn = src.slice(0, src.indexOf(`rule: "${rule}"`));
    const doc = fn.lastIndexOf("/**");
    assert.ok(doc > 0, `${rule} has no doc comment before it`);
    assert.match(
      fn.slice(doc),
      /VIEW:/,
      `the detector for ${rule} does not declare which source view it scans`,
    );
  }
});

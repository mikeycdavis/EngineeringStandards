/**
 * Tests for the audit-surface locator (ST-26, #119).
 *
 * The locator OBSERVES where audit mechanisms are and binds to no rule. What is pinned here is as
 * much what it must not do as what it reports:
 *
 *   - it produces one `info` finding with `rule: null`, so no rule result, verdict or exit code can
 *     move because of it (#62 removed the last binding of this kind);
 *   - it is never a pass: `unread`, `incomplete` and `blindSpots` are separate named parts of a
 *     structured `detail` payload, never only prose;
 *   - use versus mention (ADR 0009): a comment, a string literal, Markdown and a test path are not
 *     audit mechanisms;
 *   - silence is not absence: an unread, truncated or budget-exhausted file makes the observation
 *     incomplete, and the locator adds no `run.unknown` and no finding of its own.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm, cp, chmod } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSurface, locateAuditSurface, reportAuditSurface } from "../scripts/standards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CLI = path.join(ROOT, "scripts", "standards.mjs");
const fixture = (name) => path.join(HERE, "fixtures", name);

const ID = "detected-audit-surface";

/** The declared blind-spot set, spelled out so a silent addition or removal is a test failure. */
const DECLARED_BLIND_SPOTS = [
  "construct:attribute-forms-not-matched",
  "construct:audit-named-identifiers-outside-idioms",
  "construct:database-native-audit",
  "construct:framework-configuration",
  "construct:logging-frameworks-as-audit-trails",
  "construct:names-without-audit",
  "construct:orm-names-in-string-literals",
  "construct:string-interpolation-outside-js-templates",
  "construct:string-literal-ddl",
  "language-family:go",
  "language-family:markup-components",
  "language-family:php",
  "language-family:ruby",
  "language-family:rust",
  "language-family:shell",
  "language-family:unlisted-code-languages",
  "surface:non-code-files",
  "surface:test-helper-paths-not-recognised",
];

function cli(command, dir, extra = []) {
  const r = spawnSync(process.execPath, [CLI, command, `--dir=${dir}`, "--json", ...extra], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  try {
    return { code: r.status, json: JSON.parse(r.stdout), raw: r.stdout };
  } catch {
    return assert.fail(`stdout was not JSON.\nstdout: ${r.stdout.slice(0, 500)}\nstderr: ${r.stderr}`);
  }
}

const surfaceOf = (json) => {
  const found = json.findings.filter((f) => f.id === ID);
  assert.equal(found.length, 1, `expected exactly one ${ID} finding, got ${found.length}`);
  return found[0];
};

/** A throwaway repository holding exactly `files`. */
async function withRepo(files, body) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-audit-surface-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(dir, rel);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(abs, content);
    }
    return await body(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const sites = (finding) => finding.detail.observed.map((o) => `${o.file}:${o.line} ${o.kind} ${o.identifier}`);

// --- The three #62 fixtures, and the test-path-only stub ------------------------------------------

test("an audited repository yields the recorder definition and its calls, in order", () => {
  for (const name of ["audit-audited-with-infrastructure", "audit-audited-without-infrastructure"]) {
    const f = surfaceOf(cli("audit", fixture(name)).json);
    assert.deepEqual(
      sites(f),
      [
        "src/audit.js:4 recorder-definition recordAuditEvent",
        "src/orders.js:9 recorder-call recordAuditEvent",
        "src/orders.js:21 recorder-call recordAuditEvent",
      ],
      name,
    );
    assert.deepEqual(f.evidence, ["src/audit.js", "src/orders.js"], name);
  }
});

test("an unaudited repository with tests and CI yields no observation, and says silence is not absence", () => {
  const f = surfaceOf(cli("audit", fixture("audit-unaudited-with-infrastructure")).json);
  assert.deepEqual(f.detail.observed, []);
  assert.equal(f.detail.observedCount, 0);
  assert.match(f.message, /not evidence that no audit mechanism exists/);
  assert.deepEqual(f.detail.blindSpots.map((b) => b.id), DECLARED_BLIND_SPOTS, "blind spots must be reported even with nothing observed");
});

test("the observation does not depend on tests or CI being present", () => {
  const withInfra = surfaceOf(cli("audit", fixture("audit-audited-with-infrastructure")).json).detail.observed;
  const without = surfaceOf(cli("audit", fixture("audit-audited-without-infrastructure")).json).detail.observed;
  assert.deepEqual(withInfra, without, "tests and CI are #64's observation and must not leak into this one");
});

test("a test-path-only audit stub yields no observation, and the same files outside a test path do", async () => {
  const stub = surfaceOf(cli("audit", fixture("audit-test-path-only-stub")).json);
  assert.deepEqual(stub.detail.observed, []);
  assert.ok(stub.detail.excluded.codeFilesExcluded >= 2, "the exclusion must be visible, not silent");

  // The control that makes the assertion above mean something: identical content, one directory up.
  await withRepo({}, async (dir) => {
    await cp(path.join(fixture("audit-test-path-only-stub"), "test", "helpers", "audit.js"), path.join(dir, "src", "audit.js"));
    const moved = surfaceOf(cli("audit", dir).json);
    assert.deepEqual(sites(moved), ["src/audit.js:2 type AuditEvent", "src/audit.js:10 recorder-definition recordAuditEvent"]);
  });
});

test("CI paths never count as audit presence either", () =>
  withRepo(
    {
      "src/index.js": "export const add = (a, b) => a + b;\n",
      ".github/scripts/notify.js": "recordAuditEvent({ action: 'x' });\n",
      "ci/report.py": "def write_audit_log(entry):\n    pass\n",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(f.detail.observed, []);
      assert.equal(f.detail.excluded.codeFilesExcluded, 2);
    },
  ));

// --- Idioms: one fixture per supported family -----------------------------------------------------

test("each supported family is located by its documented idiom, and only those", () =>
  withRepo(
    {
      "src/Audit.cs": [
        "namespace App;",
        "[Audited]",
        "public class Order {}",
        "public sealed class AuditEvent {}",
        "public class Auditor {}",
        "",
      ].join("\n"),
      "src/Order.java": [
        "@Entity",
        "@Audited",
        "@EntityListeners(AuditingEntityListener.class)",
        "public class Order {}",
        "class OrderAuditTrail {}",
        "",
      ].join("\n"),
      "src/audit.py": [
        "class AuditLogEntry(Base):",
        "    pass",
        "",
        "@audited",
        "def change(order):",
        "    audit_log.write(order)",
        "",
      ].join("\n"),
      "src/events.ts": ["export interface AuditRecord { id: string }", "export type AuditTrail = AuditRecord[];", ""].join("\n"),
      "db/001.sql": [
        "CREATE TABLE audit_log (id INT);",
        'CREATE TABLE IF NOT EXISTS "app"."order_audit_history" (id INT);',
        "CREATE TABLE [dbo].[AuditEvents] (Id INT);",
        "CREATE TABLE orders (id INT);",
        "",
      ].join("\n"),
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(sites(f), [
        "db/001.sql:1 table audit_log",
        "db/001.sql:2 table app.order_audit_history",
        "db/001.sql:3 table dbo.AuditEvents",
        "src/Audit.cs:2 framework-attribute Audited",
        "src/Audit.cs:4 type AuditEvent",
        "src/Order.java:2 framework-attribute Audited",
        "src/Order.java:3 framework-attribute AuditingEntityListener.class",
        "src/Order.java:5 type OrderAuditTrail",
        "src/audit.py:1 type AuditLogEntry",
        "src/audit.py:4 framework-attribute audited",
        "src/audit.py:6 recorder-call audit_log.write",
        "src/events.ts:1 type AuditRecord",
        "src/events.ts:2 type AuditTrail",
      ]);
      const idiomIds = new Set(f.detail.idioms.map((i) => i.id));
      for (const o of f.detail.observed) assert.ok(idiomIds.has(o.idiom), `${o.idiom} is not in the reported idiom list`);
    },
  ));

// --- Use versus mention ---------------------------------------------------------------------------

const MENTIONS = {
  "src/comment.js": [
    "// recordAuditEvent({ action }) is called by the workflow, see class AuditEvent",
    "/* CREATE TABLE audit_log (id INT); */",
    "export const x = 1;",
    "",
  ].join("\n"),
  "src/string.js": [
    'export const note = "call recordAuditEvent(entry) and class AuditEvent";',
    "export const ddl = `CREATE TABLE audit_log (id INT)`;",
    "export const e = new Error('run CREATE TABLE audit_log first');",
    "",
  ].join("\n"),
  "src/comment.py": "# class AuditEvent: record_audit_event(x)\nx = 1\n",
  "db/notes.sql": [
    "-- CREATE TABLE audit_log (id INT);",
    "/* CREATE TABLE audit_events (id INT); */",
    "INSERT INTO notes VALUES ('CREATE TABLE audit_log (id INT)');",
    "",
  ].join("\n"),
  "docs/audit.md": [
    "# Audit",
    "",
    "```sql",
    "CREATE TABLE audit_log (id INT);",
    "```",
    "",
    "Call `recordAuditEvent(entry)` on every mutation. `class AuditEvent` carries the fields.",
    "",
  ].join("\n"),
  "config/audit.yml": "table: audit_log\nrecorder: recordAuditEvent(\n",
};

test("comments, string literals, Markdown and config are mentions, not observations", () =>
  withRepo(MENTIONS, (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.deepEqual(f.detail.observed, [], "a mention was reported as a mechanism");
    // String-embedded DDL is not located, and the locator says so rather than being silent about it.
    assert.ok(f.detail.blindSpots.some((b) => b.id === "construct:string-literal-ddl"));
  }));

test("the same repository with one real use reports exactly that use", () =>
  withRepo({ ...MENTIONS, "src/real.js": "class AuditEvent {}\n" }, (dir) => {
    assert.deepEqual(sites(surfaceOf(cli("audit", dir).json)), ["src/real.js:1 type AuditEvent"]);
  }));

// --- Unread, incomplete, budget -------------------------------------------------------------------

const BIG = 400_000;

test("a file truncated at the read cap is unread, keeps its prefix observations, and drops a cut identifier", () => {
  // Line 1 is a real use before the cap. The pad is a comment sized so the cap lands exactly after
  // `class Audit`, which is the beginning of `class AuditableThing`, not an audit-named type.
  const head = "class AuditEvent {}\n";
  const cut = "class Audit";
  const padLen = BIG - head.length - cut.length;
  const pad = `//${"x".repeat(padLen - 3)}\n`;
  const text = `${head}${pad}${cut}ableThing {}\nrecordAuditEvent(late);\n`;
  assert.equal(Buffer.byteLength(head + pad + cut), BIG, "the fixture must put the cap exactly after `class Audit`");
  return withRepo({ "src/big.js": text, "src/small.js": "export const x = 1;\n" }, (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.deepEqual(f.detail.unread, [{ file: "src/big.js", reason: "truncated" }]);
    assert.equal(f.detail.incomplete, true);
    assert.ok(f.detail.incompleteReasons.includes("unread-files"));
    assert.deepEqual(sites(f), ["src/big.js:1 type AuditEvent"], "prefix kept; the cut identifier and the late call are not claimed");
    assert.match(f.message, /incomplete/);
  });
});

test("a file the read budget never opened is unread and the observation is incomplete", () =>
  withRepo(
    {
      "src/big.js": `recordAuditEvent(x);\n${"// filler line\n".repeat(20_000)}`,
      "src/small.js": "export const x = 1;\n",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir, ["--max-total-read-bytes=16384"]).json);
      // The budget is sticky, so which small files are also unread depends on walk order; the large
      // one cannot be retained under any order.
      assert.ok(f.detail.unread.some((u) => u.file === "src/big.js"), "the file the budget could not hold must be unread");
      assert.ok(f.detail.unread.every((u) => u.reason === "read-budget-exhausted"));
      assert.equal(f.detail.incomplete, true);
      assert.deepEqual(f.detail.observed, [], "an unread file must not be reported as observed or as empty");
    },
  ));

const IS_WINDOWS = process.platform === "win32";
const denyRead = async (file) => {
  if (IS_WINDOWS) spawnSync("icacls", [file, "/deny", `${process.env.USERNAME}:R`], { encoding: "utf8" });
  else await chmod(file, 0o000);
};
const restoreRead = async (file) => {
  if (IS_WINDOWS) spawnSync("icacls", [file, "/remove:d", process.env.USERNAME], { encoding: "utf8" });
  else await chmod(file, 0o644);
};
const reallyUnreadable = (file) => {
  try {
    readFileSync(file);
    return false;
  } catch {
    return true;
  }
};

test("an unreadable file is unread and the observation is incomplete", async (t) => {
  await withRepo({ "src/locked.js": "recordAuditEvent(x);\n", "src/ok.js": "class AuditEvent {}\n" }, async (dir) => {
    const locked = path.join(dir, "src", "locked.js");
    await denyRead(locked);
    try {
      if (!reallyUnreadable(locked)) {
        t.skip("this host refuses to make a file unreadable; the boundary runs on the Linux image");
        return;
      }
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(f.detail.unread, [{ file: "src/locked.js", reason: "unreadable" }]);
      assert.equal(f.detail.incomplete, true);
      assert.deepEqual(sites(f), ["src/ok.js:1 type AuditEvent"]);
    } finally {
      await restoreRead(locked);
    }
  });
});

test("a clean, fully read repository is not incomplete", () =>
  withRepo({ "src/a.js": "class AuditEvent {}\n" }, (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.equal(f.detail.incomplete, false);
    assert.deepEqual(f.detail.incompleteReasons, []);
    assert.deepEqual(f.detail.unread, []);
  }));

test("the locator itself adds no finding and records no unknown, even over an unread file", () =>
  withRepo({ "src/big.js": `recordAuditEvent(x);\n${"// filler line\n".repeat(20_000)}`, "src/a.js": "class AuditEvent {}\n" }, async (dir) => {
    const s = await collectSurface(dir, { maxTotalReadBytes: 16384 });
    const before = s.run.findings.length;
    const found = locateAuditSurface(s.files, s.run, s);
    assert.equal(found.incomplete, true);
    assert.equal(s.run.findings.length, before, "the locator must not write findings");
    assert.equal(s.run.unknownChecks.size, 0, "an unread file is reported in `unread`, never as an unknown rule check");
  }));

test("the locator refuses to claim completeness without the surface loss record", async () => {
  await withRepo({ "src/a.js": "class AuditEvent {}\n" }, async (dir) => {
    const s = await collectSurface(dir);
    assert.throws(() => locateAuditSurface(s.files, s.run), TypeError);
  });
});

// --- Blind spots ----------------------------------------------------------------------------------

test("blind spots are exactly the declared set on every repository, and reported apart from what was found", async () => {
  const dirs = [
    fixture("audit-audited-with-infrastructure"),
    fixture("audit-unaudited-with-infrastructure"),
    fixture("audit-test-path-only-stub"),
  ];
  for (const dir of dirs) {
    const f = surfaceOf(cli("audit", dir).json);
    assert.deepEqual(f.detail.blindSpots.map((b) => b.id), DECLARED_BLIND_SPOTS, dir);
    for (const b of f.detail.blindSpots) assert.ok(b.kind && b.description, `${b.id} needs a kind and a description`);
    assert.ok(Array.isArray(f.detail.observed) && Array.isArray(f.detail.unread) && Array.isArray(f.detail.blindSpots));
    assert.equal(typeof f.detail.incomplete, "boolean");
  }
});

test("an unsupported family that is present is counted, so its blind spot is visibly relevant", () =>
  withRepo({ "main.go": "package main\nfunc recordAuditEvent() {}\n", "src/a.js": "export const x = 1;\n" }, (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.deepEqual(f.detail.observed, [], "Go has no idiom: nothing may be claimed about it");
    const go = f.detail.languageFamilies.find((x) => x.family === "go");
    assert.deepEqual(go, { family: "go", supported: false, codeFilesRead: 1 });
  }));

// --- Determinism ----------------------------------------------------------------------------------

test("two runs over the same tree are byte-identical", () => {
  const a = surfaceOf(cli("audit", fixture("audit-audited-with-infrastructure")).json);
  const b = surfaceOf(cli("audit", fixture("audit-audited-with-infrastructure")).json);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test("the result is independent of the order the file list arrives in", () =>
  withRepo(
    {
      "src/b.js": "class AuditEvent {}\nrecordAuditEvent(x);\n",
      "src/a.py": "class AuditLog:\n    pass\n",
      "db/z.sql": "CREATE TABLE audit_trail (id INT);\n",
      "src/c.js": "// nothing\n",
    },
    async (dir) => {
      const s = await collectSurface(dir);
      const reference = JSON.stringify(locateAuditSurface(s.files, s.run, s));
      const orders = [[...s.files].reverse(), [...s.files].sort(() => 0), [...s.files.slice(2), ...s.files.slice(0, 2)]];
      for (const order of orders) {
        assert.equal(JSON.stringify(locateAuditSurface(order, s.run, s)), reference);
      }
      assert.ok(JSON.parse(reference).observed.length >= 3, "the reference must observe something for this to mean anything");
    },
  ));

// --- Unbound, additive, no effect on any verdict --------------------------------------------------

test("the finding is unbound, info, and no other finding carries the id", () => {
  for (const name of ["audit-audited-with-infrastructure", "audit-unaudited-with-infrastructure", "audit-test-path-only-stub"]) {
    const json = cli("audit", fixture(name)).json;
    const f = surfaceOf(json);
    assert.equal(f.rule, null, `${name}: the observation must bind to no rule`);
    assert.equal(f.severity, "info");
    assert.equal(f.label, "INFERRED", "a name-pattern observation is inferred, never observed");
    assert.match(f.standardRef, /03-auditing\.md#r1--the-core-rule$/);
    assert.deepEqual(json.findings.filter((x) => x.rule && /^audit\./.test(x.rule)), [], `${name}: no audit.* finding may exist`);
  }
});

test("validate reaches identical results, verdict and exit code with and without an audit mechanism", async () => {
  const strip = (raw) => {
    const j = JSON.parse(raw);
    delete j.auditedAt;
    delete j.repo;
    delete j.project;
    j.findings = j.findings.filter((f) => f.id !== ID);
    return JSON.stringify(j);
  };
  await withRepo({ "src/orders.js": "export const set = (o, s) => ({ ...o, s });\n" }, async (plain) => {
    await withRepo(
      { "src/orders.js": "export const set = (o, s) => ({ ...o, s });\nclass AuditEvent {}\nrecordAuditEvent({});\n" },
      async (audited) => {
        const a = cli("validate", plain);
        const b = cli("validate", audited);
        assert.equal(a.code, b.code, "the exit code moved with an audit mechanism");
        assert.equal(strip(a.raw), strip(b.raw), "validate output differs by more than the additive finding");
        assert.equal(surfaceOf(a.json).detail.observedCount, 0);
        assert.equal(surfaceOf(b.json).detail.observedCount, 2);
        for (const rule of ["audit.business-state", "audit.actor-attribution"]) {
          const r = b.json.results.find((x) => x.ruleId === rule);
          assert.equal(r.disposition, "not-evaluated", `${rule} must stay not-evaluated`);
        }
      },
    );
  });
});

test("audit --strict exits the same with the observation present", () =>
  withRepo({ "src/a.js": "class AuditEvent {}\nrecordAuditEvent({});\n" }, (dir) => {
    const strict = cli("audit", dir, ["--strict"]);
    const nonInfo = strict.json.findings.filter((f) => f.severity !== "info");
    assert.equal(strict.code, nonInfo.length ? 1 : 0);
    assert.ok(!nonInfo.some((f) => f.id === ID), "the observation must not be what fails --strict");
  }));

test("human output lists the observation under what the repository has, never as needing attention", () =>
  withRepo({ "src/a.js": "class AuditEvent {}\n" }, (dir) => {
    const r = spawnSync(process.execPath, [CLI, "audit", `--dir=${dir}`], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const [has, attention = ""] = r.stdout.split("What needs attention");
    assert.match(has, /Audit surface \(observed, not evaluated\) \[INFERRED\]/);
    assert.doesNotMatch(attention, /Audit surface/);
  }));

// --- SELF parity ----------------------------------------------------------------------------------

test("the locator does not observe its own vocabulary: a copy of the tool is an ordinary target with no observation", () =>
  withRepo({}, async (dir) => {
    await mkdir(path.join(dir, "scripts"), { recursive: true });
    await cp(CLI, path.join(dir, "scripts", "standards.mjs"));
    const f = surfaceOf(cli("audit", dir).json);
    assert.deepEqual(f.detail.observed, [], "the idiom tables must be invisible as mentions");
    assert.deepEqual(f.detail.unread, []);
  }));

test("auditing the framework as the target observes nothing in its tools or tests", () => {
  const f = surfaceOf(cli("audit", ROOT).json);
  const inTooling = f.detail.observed.filter((o) => o.file.startsWith("scripts/") || o.file.startsWith("test/"));
  assert.deepEqual(inTooling, [], "the framework's own tooling and tests are not an audit surface");
});

test("the self run is deterministic over a private copy of the tooling", () =>
  withRepo({}, async (dir) => {
    // A private copy, because sibling suites create and remove scratch files inside the live tree.
    await cp(path.join(ROOT, "scripts"), path.join(dir, "scripts"), { recursive: true, filter: (src) => !path.basename(src).startsWith(".") });
    const a = JSON.stringify(surfaceOf(cli("audit", dir).json));
    const b = JSON.stringify(surfaceOf(cli("audit", dir).json));
    assert.equal(a, b);
    assert.ok(JSON.parse(a).detail.unread.length === 0);
  }));

// --- Review follow-ups: markup components, widened names, path exclusions, unlisted languages -----

test("markup components are a declared blind spot: prose, apostrophes and real script all stay unobserved", () =>
  withRepo(
    {
      "web/A.vue": "<template><p>Use class AuditEvent for this.</p></template>\n<script>\nclass AuditEvent {}\n</script>\n",
      "web/B.svelte": "<p>Don't forget: class AuditLog</p>\n<script>\nclass AuditLog {}\n</script>\n",
      "web/C.razor": "<p>It's the class AuditEvent</p>\n@code {\n  class AuditEvent {}\n}\n",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(f.detail.observed, [], "markup components must not be tokenised as plain JS or C#");
      assert.ok(f.detail.blindSpots.some((b) => b.id === "language-family:markup-components"));
      const fam = f.detail.languageFamilies.find((x) => x.family === "markup-components");
      assert.deepEqual(fam, { family: "markup-components", supported: false, codeFilesRead: 3 });
    },
  ));

test("audit-named declarations beyond the suffix list are observed", () =>
  withRepo(
    {
      "src/A.cs": "public interface IAuditService {}\npublic class AuditWriter {}\npublic class AuditableEntity {}\n",
      "src/B.java": "class AuditMiddleware {}\nclass AuditInterceptor {}\nclass AuditAspect {}\nclass AuditListener {}\n",
      "src/c.py": "class AuditMixin:\n    pass\n\nclass AuditModel:\n    pass\n",
      "src/d.ts": "export class AuditService {}\nexport class Auditor {}\n",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(f.detail.observed.map((o) => o.identifier), [
        "IAuditService", "AuditWriter", "AuditableEntity",
        "AuditMiddleware", "AuditInterceptor", "AuditAspect", "AuditListener",
        "AuditMixin", "AuditModel", "AuditService",
      ]);
    },
  ));

test("a repository whose only audit class is AuditService does not read as clean", () =>
  withRepo({ "src/a.js": "class AuditService {}\n" }, (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.equal(f.detail.observedCount, 1);
    assert.doesNotMatch(f.message, /^No audit-named construct/);
  }));

test("audit-shaped calls are observed, with the use-versus-mention filter intact", () =>
  withRepo(
    {
      "src/a.cs": "class X {\n  void M() {\n    Audit.Record(x);\n    _audit.RecordAsync(x);\n  }\n}\n",
      "src/b.js": "auditLogger.info('x');\nlogger.audit('y');\n// auditLogger.info('mention')\nconst s = \"AuditLog.create(z)\";\n",
      "src/c.py": "AuditLog.objects.create(x=1)\nAuditLog.create(x)\n",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(sites(f), [
        "src/a.cs:3 recorder-call Audit.Record",
        "src/a.cs:4 recorder-call _audit.RecordAsync",
        "src/b.js:1 recorder-call auditLogger.info",
        "src/b.js:2 recorder-call logger.audit",
        "src/c.py:1 recorder-call AuditLog.objects.create",
        "src/c.py:2 recorder-call AuditLog.create",
      ]);
    },
  ));

test("a file with an audit-named identifier the idioms do not classify is listed and makes the search incomplete", () =>
  withRepo({ "src/a.js": "const auditService = make();\nauditService.run();\n", "src/b.js": "export const x = 1;\n" }, (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.deepEqual(f.detail.observed, []);
    assert.deepEqual(f.detail.unclassified, [{ file: "src/a.js", family: "javascript-typescript" }]);
    assert.equal(f.detail.incomplete, true);
    assert.deepEqual(f.detail.incompleteReasons, ["unclassified-audit-named-identifiers"]);
    assert.deepEqual(f.evidence, [], "evidence holds paths only");
  }));

test("a method definition is not a recorder call, and a call inside a condition still is", () =>
  withRepo(
    {
      "src/a.js": "const o = { writeAudit(e) { return e; } };\nif (recordAudit(x)) {\n  go();\n}\n",
      "src/B.cs": "class B {\n  void RecordAudit(string e) { }\n  void Run() { RecordAudit(\"x\"); }\n}\n",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(sites(f), [
        "src/B.cs:2 recorder-definition RecordAudit",
        "src/B.cs:3 recorder-call RecordAudit",
        "src/a.js:1 recorder-definition writeAudit",
        "src/a.js:2 recorder-call recordAudit",
      ]);
    },
  ));

test("test helpers outside TEST_RE are excluded by the audit-specific path list", () =>
  withRepo(
    {
      "src/Foo.Tests/Helpers.cs": "class AuditEvent {}\n",
      "e2e/audit.ts": "class AuditEvent {}\n",
      "cypress/support/audit.js": "class AuditEvent {}\n",
      "src/__mocks__/audit.js": "class AuditEvent {}\n",
      "src/mocks/audit.js": "class AuditEvent {}\n",
      "testing/audit.py": "class AuditEvent:\n    pass\n",
      "src/OrderServiceTest.java": "class AuditEvent {}\n",
      "src/Foo.stories.tsx": "class AuditEvent {}\n",
      "src/real.js": "export const keep = 1;\n",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(f.detail.observed, []);
      assert.equal(f.detail.excluded.codeFilesExcluded, 8);
      assert.ok(f.detail.blindSpots.some((b) => b.id === "surface:test-helper-paths-not-recognised"));
    },
  ));

test("code languages outside the code-extension list are counted and declared, not read", () =>
  withRepo({ "App.swift": "class AuditEvent {}\n", "main.cpp": "int main() {}\n", "src/a.js": "export const x = 1;\n" }, (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.deepEqual(f.detail.observed, []);
    const u = f.detail.languageFamilies.find((x) => x.family === "unlisted-code-languages");
    assert.deepEqual(u, { family: "unlisted-code-languages", supported: false, codeFilesRead: 0, codeFilesPresent: 2 });
    assert.ok(f.detail.blindSpots.some((b) => b.id === "language-family:unlisted-code-languages"));
  }));

test("a file that was not read is not counted as read", () =>
  withRepo({ "src/big.js": `x();\n${"// filler line\n".repeat(20_000)}`, "src/a.js": "export const x = 1;\n" }, (dir) => {
    const f = surfaceOf(cli("audit", dir, ["--max-total-read-bytes=16384"]).json);
    const js = f.detail.languageFamilies.find((x) => x.family === "javascript-typescript");
    assert.equal(js.codeFilesRead + f.detail.unreadCount, 2, "read + unread must account for every code file exactly once");
    assert.ok(js.codeFilesRead < 2);
  }));

test("a MySQL # comment line is a mention, and CR-only line endings keep their line numbers", () =>
  withRepo(
    {
      "db/a.sql": "# CREATE TABLE audit_log (id INT);\nCREATE TABLE audit_events (id INT);\n",
      "src/cr.js": "const a = 1;\rconst b = 2;\rclass AuditEvent {}\r",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(sites(f), ["db/a.sql:2 table audit_events", "src/cr.js:3 type AuditEvent"]);
    },
  ));

test("the reporter itself writes exactly one unbound finding and records no unknown, even over unread files", () =>
  withRepo({ "src/big.js": `recordAuditEvent(x);\n${"// filler line\n".repeat(20_000)}`, "src/a.js": "class AuditEvent {}\n" }, async (dir) => {
    const s = await collectSurface(dir, { maxTotalReadBytes: 16384 });
    reportAuditSurface(s.files, s.run, s);
    assert.equal(s.run.unknownChecks.size, 0, "the observation must never mark a rule's check unknown");
    assert.equal(s.run.findings.length, 1);
    assert.equal(s.run.findings[0].rule, null);
    assert.equal(s.run.findings[0].severity, "info");
  }));

// --- Review round 2 (owned part): the unclassified check does not run in a file that has an observation ---

test("an audit-named identifier in a file that already has an observation is not listed, and that limit is declared", () =>
  withRepo(
    {
      // `class AuditWriter` is an observation; `auditService` beside it is the same kind of unclassified
      // identifier that is reported (and makes the search incomplete) in a file with no observation.
      "src/with-observation.js": "class AuditWriter {}\nconst auditService = make();\nauditService.run();\n",
      "src/clean.js": "export const x = 1;\n",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(sites(f), ["src/with-observation.js:1 type AuditWriter"]);
      assert.deepEqual(f.detail.unclassified, [], "the check is per file and skipped where something was observed");
      assert.equal(f.detail.incomplete, false);
      // Because that is silent, it has to be said where a consumer reads blind spots.
      const spot = f.detail.blindSpots.find((b) => b.id === "construct:audit-named-identifiers-outside-idioms");
      assert.match(spot.description, /already hold an observation are not checked for further unclassified identifiers/);
    },
  ));

// --- Codex findings on 03d44ff: test-suffix boundary, bounded retention ----------------------------

test("a test-file suffix is an intentional one: Contest, Latest and Attest are code, FooTest and foo.test are tests", () =>
  withRepo(
    {
      "src/Contest.java": "class AuditContest {}\n",
      "src/Latest.ts": "class AuditLatest {}\n",
      "src/Attest.cs": "class AuditAttest {}\n",
      "src/contest_x.py": "class AuditContestPy: pass\n",
      "src/FooTest.java": "class AuditInFooTest {}\n",
      "src/Foo.Tests.cs": "class AuditInFooTests {}\n",
      "src/foo.test.ts": "class AuditInDotTest {}\n",
      "src/foo_test.py": "class AuditInUnderscoreTest: pass\n",
      "src/Test.java": "class AuditInTest {}\n",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(f.detail.observed.map((o) => o.identifier), ["AuditAttest", "AuditContest", "AuditLatest", "AuditContestPy"]);
      assert.equal(f.detail.excluded.codeFilesExcluded, 5);
    },
  ));

test("a caller can bound retained observations; counts and files stay exact and the prefix is the report order", async () => {
  const files = {};
  for (let i = 0; i < 12; i += 1) files[`src/f${String(i).padStart(2, "0")}.js`] = `class AuditA${i} {}\nclass AuditB${i} {}\n`;
  await withRepo(files, async (dir) => {
    const s = await collectSurface(dir);
    const full = locateAuditSurface(s.files, s.run, s);
    const cut = locateAuditSurface(s.files, s.run, s, { maxObserved: 5 });
    assert.equal(full.observed.length, 24);
    assert.equal(full.observedCount, 24);
    assert.equal(cut.observed.length, 5);
    assert.deepEqual(cut.observed, full.observed.slice(0, 5));
    assert.equal(cut.observedCount, 24);
    assert.equal(cut.observedFiles.length, 12);
    assert.deepEqual(cut.observedFiles, full.observedFiles);
    assert.equal(cut.incomplete, full.incomplete);
  });
});

test("the reporter caps the payload at 500 and still reports the exact total and every file", () =>
  withRepo(
    { "src/big.js": Array.from({ length: 520 }, (_, i) => `class AuditX${i} {}`).join("\n") + "\n", "src/other.js": "class AuditZ {}\n" },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.equal(f.detail.observed.length, 500);
      assert.equal(f.detail.observedCount, 521);
      assert.equal(f.detail.observedOmitted, 21);
      assert.deepEqual(f.evidence, ["src/big.js", "src/other.js"]);
      assert.match(f.message, /^521 audit-named construct\(s\) were observed in 2 /);
    },
  ));

// --- Codex P2 on e2bff48: occurrences on one line are separate constructs -------------------------

test("the same identifier twice on one line is two observations, and the count says so", () =>
  withRepo({ "src/a.js": "recordAuditEvent(a); recordAuditEvent(b);\n" }, (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.equal(f.detail.observedCount, 2);
    assert.deepEqual(sites(f), ["src/a.js:1 recorder-call recordAuditEvent", "src/a.js:1 recorder-call recordAuditEvent"]);
    assert.match(f.message, /^2 audit-named construct\(s\)/);
  }));

test("different identifiers on one line are each observed", () =>
  withRepo({ "src/a.js": "recordAuditEvent(a); auditLogger.info(b);\n" }, (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.equal(f.detail.observedCount, 2);
  }));

test("a minified one-line file with three occurrences counts three, and the bound keeps exact totals", async () => {
  const text = "x=1;recordAuditEvent(a);y=2;recordAuditEvent(b);z=3;recordAuditEvent(c);\n";
  await withRepo({ "src/min.js": text, "src/z.js": "class AuditZ {}\n" }, async (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.equal(f.detail.observedCount, 4);
    assert.equal(f.detail.observed.length, 4);
    const s = await collectSurface(dir);
    const cut = locateAuditSurface(s.files, s.run, s, { maxObserved: 2 });
    assert.equal(cut.observedCount, 4);
    assert.equal(cut.observed.length, 2);
    assert.deepEqual(cut.observedFiles, ["src/min.js", "src/z.js"]);
  });
});

// --- Codex findings on 00ec932: inline `#`, template expressions, the declared exclusion filter -----

test("an inline MySQL # comment hides DDL after it; # in strings, operators and temp tables does not", () =>
  withRepo(
    {
      "db/a.sql": "SELECT 1; # CREATE TABLE audit_hidden (id INT);\n",
      "db/b.sql": "SELECT 'a # b'; CREATE TABLE audit_after_string (id INT);\n",
      "db/c.sql": "SELECT j #> '{a}' FROM t; CREATE TABLE audit_after_op (id INT);\n",
      "db/d.sql": "CREATE TABLE #audit_tmp (id INT);\n",
      "db/e.sql": "-- note # here\nCREATE TABLE audit_after_dash (id INT);\n",
      "db/f.sql": "# CREATE TABLE audit_line_comment (id INT);\n",
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(f.detail.observed.map((o) => o.identifier), ["audit_after_string", "audit_after_op", "#audit_tmp", "audit_after_dash"]);
    },
  ));

/** Test sources are written with § for the backtick, so this file has no template-shaped text of its own. */
const bt = (text) => text.replaceAll("§", String.fromCharCode(96));

test("an executable ${...} in a template literal is scanned; the literal text and ordinary strings are not", () =>
  withRepo(
    {
      "src/a.js": bt("const m = §done ${recordAuditEvent(event)} ok§;\n"),
      "src/b.js": bt("const m = §a ${ §b ${auditLogger.info(x)}§ } ${ {k: 1}.k + AuditLog.create(y) }§;\n"),
      "src/c.js": bt("const a = §recordAuditEvent(x) is described here§;\nconst b = \"${recordAuditEvent(x)}\";\nconst c = '${recordAuditEvent(x)}';\n"),
      "src/d.ts": bt("const t = tag§x ${ /* recordAuditEvent(z) */ 1 } y§;\n"),
    },
    (dir) => {
      const f = surfaceOf(cli("audit", dir).json);
      assert.deepEqual(sites(f), [
        "src/a.js:1 recorder-call recordAuditEvent",
        "src/b.js:1 recorder-call AuditLog.create",
        "src/b.js:1 recorder-call auditLogger.info",
      ]);
    },
  ));

test("the shared structural view still blanks template expressions, so other detectors are unchanged", async () => {
  await withRepo({ "src/a.js": bt("const m = §${recordAuditEvent(event)}§;\n") }, async (dir) => {
    const s = await collectSurface(dir);
    const f = s.files.find((x) => x.endsWith("a.js"));
    assert.ok(!s.run.structureOf(f).text.includes("recordAuditEvent"));
  });
});

test("the declared test-path filter names the locator's own classification, not the shared TEST_RE", () => {
  const f = surfaceOf(cli("audit", fixture("audit-unaudited-with-infrastructure")).json);
  const spot = f.detail.blindSpots.find((b) => b.id === "surface:test-helper-paths-not-recognised");
  assert.match(spot.description, /locator's own classification, not the shared TEST_RE/);
  assert.match(spot.description, /Contest\.java, Attest\.cs/);
  assert.doesNotMatch(spot.description, /excluded by TEST_RE plus/);
  assert.match(f.detail.excluded.testPathPattern, /test_/);
});

// Standard 15 R3 / Standard 31 R3: an additive result field changes `schemaVersion`. The 1.0 line did
// not carry `findings[].detail`; a report that carries it must declare a later minor.
const atLeastOnePointOne = (version) => {
  const [major, minor] = String(version).split(".").map(Number);
  return major > 1 || (major === 1 && minor >= 1);
};

test("a report that carries findings[].detail declares a schemaVersion later than 1.0", () => {
  for (const command of ["audit", "validate"]) {
    const { json } = cli(command, fixture("compliant"));
    assert.ok(json.findings.some((f) => f.detail !== undefined), command + ": expected a finding with detail");
    assert.ok(
      atLeastOnePointOne(json.schemaVersion),
      command + ": detail is carried but schemaVersion is " + json.schemaVersion,
    );
  }
  assert.equal(cli("audit", fixture("compliant")).json.schemaVersion, "1.1.0");
  assert.equal(cli("validate", fixture("compliant")).json.schemaVersion, "1.1.0");
});

test("one call site is one observation however many recorder idioms match it", async () => {
  await withRepo({ "src/orders.js": "auditLogger.recordAuditEvent(entry);\nrecordAuditEvent(other);\n" }, async (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.equal(f.detail.observedCount, 2, JSON.stringify(sites(f)));
    assert.deepEqual(sites(f), [
      "src/orders.js:1 recorder-call auditLogger.recordAuditEvent",
      "src/orders.js:2 recorder-call recordAuditEvent",
    ]);
  });
});

test("a PostgreSQL dollar-quoted string is a literal: DDL inside it is a mention, not an observation", async () => {
  const sql = [
    "SELECT $$CREATE TABLE audit_fake(id int)$$;",
    "SELECT $tag$CREATE TABLE audit_fake_two(id int)$tag$;",
    "CREATE TABLE audit_real(id int);",
    "",
  ].join("\n");
  await withRepo({ "db/migrate.sql": sql }, async (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.deepEqual(sites(f), ["db/migrate.sql:3 table audit_real"]);
  });
});

test("a dollar-quote tag that is itself audit-shaped is blanked with its body", async () => {
  await withRepo({ "db/a.sql": "SELECT $audit$plain text$audit$;\n" }, async (dir) => {
    const f = surfaceOf(cli("audit", dir).json);
    assert.deepEqual(sites(f), []);
    assert.deepEqual(f.detail.unclassified, []);
    assert.equal(f.detail.incomplete, false);
  });
});

test("a regex literal after a keyword is a pattern, not code", async () => {
  await withRepo({ "src/a.js": "function f(s) { return /class AuditEvent/.test(s); }\nclass AuditEvent {}\n" }, async (dir) => {
    assert.deepEqual(sites(surfaceOf(cli("audit", dir).json)), ["src/a.js:2 type AuditEvent"]);
  });
});

test("a MySQL # comment with no space after the marker is a comment; a T-SQL temporary table is not", async () => {
  const sql = "SELECT 1; #comment CREATE TABLE audit_hidden (id int);\nCREATE TABLE #audit_tmp (id int);\n";
  await withRepo({ "db/a.sql": sql }, async (dir) => {
    assert.deepEqual(sites(surfaceOf(cli("audit", dir).json)), ["db/a.sql:2 table #audit_tmp"]);
  });
});

test("an apostrophe in JSX text does not swallow the declarations that follow it", async () => {
  await withRepo({ "src/a.jsx": "const a = <p>don't</p>;\nclass AuditEvent {}\n" }, async (dir) => {
    assert.deepEqual(sites(surfaceOf(cli("audit", dir).json)), ["src/a.jsx:2 type AuditEvent"]);
  });
});

test("a Python triple-quoted string holding quotes is a literal and ends at its own triple", async () => {
  const py = 'DOC = """He said "x" here\nclass AuditMention:\n    pass\n"""\nclass AuditEvent:\n    pass\n';
  await withRepo({ "src/a.py": py }, async (dir) => {
    assert.deepEqual(sites(surfaceOf(cli("audit", dir).json)), ["src/a.py:5 type AuditEvent"]);
  });
});

test("a backslash-CRLF continuation keeps the string literal open across the whole line break", async () => {
  const BS = String.fromCharCode(92);
  const CRLF = String.fromCharCode(13, 10);
  const js = 'const s = "a ' + BS + CRLF + 'class AuditMention {}";' + CRLF + 'class AuditEvent {}' + CRLF;
  await withRepo({ "src/a.js": js }, async (dir) => {
    assert.deepEqual(sites(surfaceOf(cli("audit", dir).json)), ["src/a.js:3 type AuditEvent"]);
  });
});

test("the dollar-quote masking is the locator's alone: another detector still sees an executable body", async () => {
  const sql =
    "CREATE FUNCTION f() RETURNS void AS $$\ntry:\n    pass\nexcept:\n    pass\n$$ LANGUAGE plpython3u;\nSELECT $$CREATE TABLE audit_fake(id int)$$;\n";
  await withRepo({ "db/a.sql": sql }, async (dir) => {
    const { json } = cli("audit", dir);
    assert.deepEqual(sites(surfaceOf(json)), [], "the locator masks the literal");
    assert.ok(
      json.findings.some((f) => f.id === "swallowed-exception"),
      "another detector must still see the executable body: " + JSON.stringify(json.findings.map((f) => f.id)),
    );
  });
});

test("JSX text children are prose: a type-shaped sentence in an element is not an observation", async () => {
  const jsx = [
    "export function Page() {",
    "  return (",
    "    <div className=\"a\">",
    "      <p>Add class AuditEvent to the backend</p>",
    "      <Item label={1}>enum AuditState here</Item>",
    "      <>fragment text interface AuditShape</>",
    "    </div>",
    "  );",
    "}",
    "class AuditEvent {}",
    "",
  ].join("\n");
  await withRepo({ "src/a.jsx": jsx }, async (dir) => {
    assert.deepEqual(sites(surfaceOf(cli("audit", dir).json)), ["src/a.jsx:10 type AuditEvent"]);
  });
});

test("an executable expression inside JSX is still scanned, and a TSX generic arrow is not read as an element", async () => {
  const tsx = [
    "const f = <T,>(x: T) => x;",
    "const a = <p>text {recordAuditEvent(event)} more class AuditProse</p>;",
    "class AuditEvent {}",
    "",
  ].join("\n");
  await withRepo({ "src/a.tsx": tsx }, async (dir) => {
    const found = sites(surfaceOf(cli("audit", dir).json));
    assert.ok(found.includes("src/a.tsx:3 type AuditEvent"), found.join("|"));
    assert.ok(found.includes("src/a.tsx:2 recorder-call recordAuditEvent"), found.join("|"));
    assert.ok(!found.some((s) => s.includes("AuditProse")), found.join("|"));
  });
});

test("a quoted run in a Java text block or Kotlin raw string is a literal", async () => {
  const java = 'class Holder {\n  String s = """\n    "class AuditMention" is a quote\n    """;\n}\nclass AuditEvent {}\n';
  await withRepo({ "src/A.java": java }, async (dir) => {
    assert.deepEqual(sites(surfaceOf(cli("audit", dir).json)), ["src/A.java:6 type AuditEvent"]);
  });
});

test("a signature-only recorder declaration is a definition; a call statement is a call", async () => {
  const java =
    "interface Recorder {\n  void recordAuditEvent(Event event);\n}\nclass Service {\n  void run() {\n    recordAuditEvent(e);\n    return;\n  }\n}\n";
  await withRepo({ "src/R.java": java }, async (dir) => {
    const found = sites(surfaceOf(cli("audit", dir).json));
    assert.ok(found.includes("src/R.java:2 recorder-definition recordAuditEvent"), found.join("|"));
    assert.ok(found.includes("src/R.java:6 recorder-call recordAuditEvent"), found.join("|"));
  });
});

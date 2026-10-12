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
import { collectSurface, locateAuditSurface } from "../scripts/standards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CLI = path.join(ROOT, "scripts", "standards.mjs");
const fixture = (name) => path.join(HERE, "fixtures", name);

const ID = "detected-audit-surface";

/** The declared blind-spot set, spelled out so a silent addition or removal is a test failure. */
const DECLARED_BLIND_SPOTS = [
  "construct:attribute-forms-not-matched",
  "construct:database-native-audit",
  "construct:framework-configuration",
  "construct:names-without-audit",
  "construct:orm-names-in-string-literals",
  "construct:string-literal-ddl",
  "language-family:go",
  "language-family:php",
  "language-family:ruby",
  "language-family:rust",
  "language-family:shell",
  "language-family:unmapped",
  "surface:non-code-files",
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
  assert.equal(JSON.stringify(surfaceOf(cli("audit", ROOT).json)), JSON.stringify(f), "the self run must be deterministic");
});

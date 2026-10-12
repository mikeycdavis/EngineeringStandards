/**
 * Exact fixture exemptions (ST-19a, ADR 0016).
 *
 * `fixtures` used to be dropped from the walk by NAME, which removed whatever it held from every
 * detector at once. It is scanned now, and a deliberately violating fixture is waived only by an
 * entry naming its exact path, the digest of its content and one rule. These tests are the five
 * controls the owner named, plus the cases that make them mean something: an entry that fails
 * validation waives nothing, a stale entry says so, the evidence surface is not marked incomplete
 * for a directory's name, and a waiver can never convert a file the run did not read into a result.
 *
 * Every bait is assembled from fragments. This file is itself scanned by the detectors it tests, and
 * `security.no-sql-concat` reads string contents intact, so a literal specimen here would be a real
 * finding against this repository — the defect test/evidence-availability.test.mjs documents.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentDigest, checkEntries, FIXTURE_EXEMPTIBLE_RULES, pathProblem } from "../scripts/fixture-exemptions.mjs";
import { loadCatalog } from "../scripts/catalog.mjs";
import { checkPolicy } from "../scripts/policy.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const SCHEMA = path.join(HERE, "..", "schemas", "project-policy.schema.json");
const NL = "\n";

// ---- baits, one per exemptible rule ----------------------------------------------------------

const CERT = `const agent = { ${"rejectUnauthorized"}: ${"false"} };${NL}module.exports = { agent };${NL}`;
const SQL = ["function q(id) { return db.query(", String.fromCharCode(96), "SELECT * FROM users WHERE id = ", "$", "{id}", String.fromCharCode(96), "); }", NL].join("");
const SWALLOW = `async function flush(b) {${NL}  try {${NL}    await b.write();${NL}  } catch (e) {}${NL}}${NL}`;
const UNFINISHED = `// ${"TODO"}: finish this${NL}export const x = 1;${NL}`;
const ENV = `API_TOKEN=live-value${NL}`;
const CLEAN = `export const ok = 1;${NL}`;

const BAIT = {
  "security.no-cert-bypass": { file: "bypass.js", text: CERT },
  "security.no-sql-concat": { file: "query.js", text: SQL },
  "errors.no-swallowed-exceptions": { file: "swallow.js", text: SWALLOW },
  "quality.unfinished-work": { file: "work.js", text: UNFINISHED },
  "scm.no-committed-env-files": { file: ".env", text: ENV },
};

// ---- harness ---------------------------------------------------------------------------------

const roots = [];
async function scratch() {
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-fixture-exempt-"));
  roots.push(root);
  return root;
}
test.after(async () => {
  for (const r of roots) await rm(r, { recursive: true, force: true });
});

const yamlString = (s) => JSON.stringify(s);

function policyText(entries) {
  const lines = ['standardVersion: "2.0.0"', 'project: "fixture exemption specimen"'];
  if (entries.length) lines.push("fixtureExemptions:");
  for (const e of entries) {
    const keys = Object.keys(e);
    lines.push(`  - ${keys[0]}: ${yamlString(e[keys[0]])}`);
    for (const k of keys.slice(1)) lines.push(`    ${k}: ${yamlString(e[k])}`);
  }
  return lines.join(NL) + NL;
}

/** A committed repository. `files` maps repository paths to text; `entries` become fixtureExemptions. */
async function repo(files, entries = []) {
  const root = await scratch();
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
    await writeFile(path.join(root, rel), text);
  }
  await writeFile(path.join(root, "project-policy.yml"), policyText(entries));
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "t@example.invalid");
  git("config", "user.name", "t");
  git("add", "-A", "-f");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "specimen");
  return root;
}

function cli(command, root, ...extra) {
  const r = spawnSync(process.execPath, [CLI, command, `--dir=${root}`, "--json", ...extra], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(r.error, undefined);
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    // exit 2 may print no envelope
  }
  return { code: r.status, json, stderr: r.stderr };
}

const resultOf = (res, rule) => res.json.results.find((r) => r.ruleId === rule);
const findingsOf = (res, id) => res.json.findings.filter((f) => f.id === id);
const pin = (file, text, rule, extra = {}) => ({
  path: file,
  sha256: contentDigest(Buffer.from(text)),
  rule,
  reason: "deliberately violating fixture",
  owner: "project-owner",
  reviewWhen: "the fixture is rewritten",
  ...extra,
});

const CERT_RULE = "security.no-cert-bypass";
const SQL_RULE = "security.no-sql-concat";

// ---- the five controls -----------------------------------------------------------------------

test("CONTROL 1: an exact pinned fixture is EXCEPTED, not passed", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const res = cli("validate", root);
  const r = resultOf(res, CERT_RULE);
  assert.equal(r.disposition, "excepted", JSON.stringify(r));
  assert.notEqual(r.status, "passed", "a waived violation must never read as a pass");
  assert.deepEqual(r.evidence, ["test/fixtures/bad/bypass.js"]);
  assert.equal(r.exception.kind, "fixture-exemption");
  assert.equal(r.exception.fixtures[0].sha256, contentDigest(Buffer.from(CERT)));
  // The waived departure is still listed, labelled as waived — nothing is hidden.
  assert.equal(findingsOf(res, "fixture-exempted").length, 1);
  assert.notEqual(res.json.status, "COMPLIANT", "an exception must never read as unqualified compliance");
});

test("CONTROL 2: the same content at another path is inspected", async () => {
  const root = await repo(
    { "test/fixtures/bad/bypass.js": CERT, "src/client.js": CERT },
    [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)],
  );
  const r = resultOf(cli("validate", root), CERT_RULE);
  assert.equal(r.disposition, "evaluated");
  assert.equal(r.status, "failed");
  assert.deepEqual(r.evidence, ["src/client.js"], "only the unpinned path is live evidence");
});

test("CONTROL 3: changed content at the same path is inspected, and the stale pin says so", async () => {
  const pinned = pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE);
  const changed = CERT + `// edited after review${NL}`;
  const root = await repo({ "test/fixtures/bad/bypass.js": changed }, [pinned]);
  const res = cli("validate", root);
  const r = resultOf(res, CERT_RULE);
  assert.equal(r.status, "failed");
  assert.equal(r.disposition, "evaluated");
  assert.deepEqual(r.evidence, ["test/fixtures/bad/bypass.js"]);
  const stale = findingsOf(res, "fixture-exemption-stale");
  assert.equal(stale.length, 1);
  assert.match(stale[0].message, new RegExp(contentDigest(Buffer.from(changed))), "the observed digest is reported so it can be re-pinned deliberately");
});

test("CONTROL 4: another rule still inspects the fixture", async () => {
  const both = CERT + SQL;
  const root = await repo({ "test/fixtures/bad/both.js": both }, [pin("test/fixtures/bad/both.js", both, CERT_RULE)]);
  const res = cli("validate", root);
  assert.equal(resultOf(res, CERT_RULE).disposition, "excepted");
  const sql = resultOf(res, SQL_RULE);
  assert.equal(sql.status, "failed", "an exemption for one rule must not cover another");
  assert.equal(sql.disposition, "evaluated");
  assert.deepEqual(sql.evidence, ["test/fixtures/bad/both.js"]);
});

test("CONTROL 5: a newly added certificate bypass fails — in a new file and in a pinned fixture", async () => {
  // New file beside an exempted one.
  const pinned = pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE);
  const added = await repo({ "test/fixtures/bad/bypass.js": CERT, "src/new-client.js": CERT }, [pinned]);
  const a = resultOf(cli("validate", added), CERT_RULE);
  assert.equal(a.status, "failed");
  assert.deepEqual(a.evidence, ["src/new-client.js"]);

  // A bypass added to a fixture that was pinned for a DIFFERENT rule changes its bytes: nothing is
  // waived, so the bypass fails and so does the SQL violation the old pin used to cover.
  const sqlPin = pin("test/fixtures/bad/query.js", SQL, SQL_RULE);
  const grown = await repo({ "test/fixtures/bad/query.js": SQL + CERT }, [sqlPin]);
  const res = cli("validate", grown);
  assert.equal(resultOf(res, CERT_RULE).status, "failed");
  assert.equal(resultOf(res, SQL_RULE).status, "failed");
  assert.equal(resultOf(res, SQL_RULE).disposition, "evaluated");
});

// ---- the cert-bypass detector runs everywhere --------------------------------------------------

test("with no exemptions at all the detector reads ordinary files and fixture directories alike", async () => {
  const root = await repo({ "src/client.js": CERT, "test/fixtures/bad/bypass.js": CERT, "lib/fixtures/ok.js": CLEAN });
  const res = cli("validate", root);
  const r = resultOf(res, CERT_RULE);
  assert.equal(r.status, "failed");
  assert.deepEqual([...r.evidence].sort(), ["src/client.js", "test/fixtures/bad/bypass.js"]);
});

// ---- every exemptible rule is wired ------------------------------------------------------------

const catalog = await loadCatalog();
for (const rule of FIXTURE_EXEMPTIBLE_RULES) {
  const nonExemptible = catalog.rules.get(rule).nonExemptible;
  test(`${rule}: ${nonExemptible ? "rejected as non-exemptible and still fails" : "an exact pin is EXCEPTED and a changed byte is not"}`, async () => {
    const bait = BAIT[rule] ?? { file: "config.yml", text: `aws:${NL}  accessKeyId: ${"AKIA"}${"IOSFODNN7EXAMPLE"}${NL}` };
    const file = `test/fixtures/bad/${bait.file}`;
    const root = await repo({ [file]: bait.text }, [pin(file, bait.text, rule)]);
    const res = cli("validate", root);
    const r = resultOf(res, rule);
    if (nonExemptible) {
      assert.equal(r.status, "failed");
      assert.equal(r.disposition, "evaluated", "a non-exemptible rule cannot be waived by a fixture entry either");
      assert.equal(findingsOf(res, "fixture-exemption-non-exemptible").length, 1);
      return;
    }
    assert.equal(r.disposition, "excepted", `${rule} did not route its hit through the fixture exemption`);
    assert.notEqual(r.status, "passed");

    const changed = await repo({ [file]: bait.text + (bait.file === ".env" ? `X=1${NL}` : `// edit${NL}`) }, [pin(file, bait.text, rule)]);
    const c = resultOf(cli("validate", changed), rule);
    assert.notEqual(c.disposition, "excepted", "a changed byte must invalidate the exemption");
  });
}

// ---- validation: an invalid entry waives nothing ------------------------------------------------

const GOOD = (file = "test/fixtures/bad/bypass.js") => pin(file, CERT, CERT_RULE);

const SEMANTIC = [
  ["a wildcard path", { ...GOOD(), path: "test/fixtures/*.js" }, "fixture-exemption-bad-path"],
  ["a directory", { ...GOOD(), path: "test/fixtures/bad/" }, "fixture-exemption-bad-path"],
  ["an absolute path", { ...GOOD(), path: "/etc/passwd" }, "fixture-exemption-bad-path"],
  ["a parent segment", { ...GOOD(), path: "test/../src/client.js" }, "fixture-exemption-bad-path"],
  ["a backslash path", { ...GOOD(), path: "test\\fixtures\\bad\\bypass.js" }, "fixture-exemption-bad-path"],
  ["a rule with no per-file detector", { ...GOOD(), rule: "documentation.architecture" }, "fixture-exemption-rule-not-exemptible"],
  ["no expiry and no review condition", (() => { const e = GOOD(); delete e.reviewWhen; return e; })(), "fixture-exemption-no-lifetime"],
  ["an expired entry", { ...GOOD(), expires: "2020-01-01" }, "fixture-exemption-expired"],
];

for (const [name, entry, id] of SEMANTIC) {
  test(`invalid entry (${name}) waives nothing and is reported`, async () => {
    const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [entry]);
    const res = cli("validate", root);
    assert.equal(res.code, 1, res.stderr);
    const r = resultOf(res, CERT_RULE);
    assert.equal(r.status, "failed");
    assert.equal(r.disposition, "evaluated", "an invalid entry must not except the rule");
    assert.equal(findingsOf(res, id).length, 1, JSON.stringify(res.json.findings.map((f) => f.id)));
  });
}

test("a duplicate (path, rule) rejects every member: nothing says which digest was reviewed", async () => {
  const other = pin("test/fixtures/bad/bypass.js", CERT + "// other\n", CERT_RULE);
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [GOOD(), other]);
  const res = cli("validate", root);
  assert.equal(resultOf(res, CERT_RULE).disposition, "evaluated");
  assert.equal(findingsOf(res, "fixture-exemption-duplicate").length, 2);
});

test("schema-invalid entries make the policy unreadable (exit 2), never a quiet waiver", async () => {
  const shapes = [
    ["uppercase digest", { ...GOOD(), sha256: GOOD().sha256.toUpperCase() }],
    ["short digest", { ...GOOD(), sha256: "abc123" }],
    ["empty reason", { ...GOOD(), reason: "" }],
    ["missing owner", (() => { const e = GOOD(); delete e.owner; return e; })()],
    ["unknown field", { ...GOOD(), approvedBy: "x" }],
  ];
  for (const [name, entry] of shapes) {
    const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [entry]);
    assert.equal(cli("validate", root).code, 2, name);
  }
});

test("policy.mjs reports semantic problems with the same validator", async () => {
  const root = await scratch();
  const file = path.join(root, "p.yml");
  await writeFile(file, policyText([{ ...GOOD(), path: "test/fixtures/*.js" }]));
  const result = await checkPolicy(file, SCHEMA, "2026-10-12");
  assert.equal(result.status, "findings");
  assert.ok(result.findings.some((f) => f.id === "fixture-exemption-bad-path"));
});

test("checkEntries: canonical path rules and rule exemptibility", () => {
  assert.equal(pathProblem("test/fixtures/a.js"), null);
  assert.equal(pathProblem("src/[id]/page.js"), null, "a bracket is a legal character in a file name");
  for (const bad of ["", "a/", "./a.js", "a//b.js", "a/./b.js", "a/../b.js", "/a.js", "C:/a.js", "a\\b.js", "a/*.js", "a?.js", " a.js"]) {
    assert.notEqual(pathProblem(bad), null, JSON.stringify(bad));
  }
  const { valid, problems } = checkEntries([GOOD(), { ...GOOD("a.js"), rule: "security.no-secrets-in-artifacts" }], { catalog, today: "2026-10-12" });
  assert.equal(valid.length, 1);
  assert.equal(problems[0].id, "fixture-exemption-non-exemptible");
});

// ---- stale entries -------------------------------------------------------------------------------

test("an entry for a path that is not in the scanned surface is reported, not silently dead", async () => {
  const root = await repo({ "src/ok.js": CLEAN }, [GOOD("test/fixtures/gone.js")]);
  const stale = findingsOf(cli("validate", root), "fixture-exemption-stale");
  assert.equal(stale.length, 1);
  assert.match(stale[0].message, /not in the scanned surface/);
});

test("an entry whose bytes match but whose rule no longer fires is reported as stale", async () => {
  const root = await repo({ "test/fixtures/bad/clean.js": CLEAN }, [pin("test/fixtures/bad/clean.js", CLEAN, CERT_RULE)]);
  const res = cli("validate", root);
  const stale = findingsOf(res, "fixture-exemption-stale");
  assert.equal(stale.length, 1);
  assert.match(stale[0].message, /found no violation/);
  assert.equal(resultOf(res, CERT_RULE).disposition, "evaluated", "a dead pin must not turn a clean rule into an exception");
});

// ---- evidence surface ----------------------------------------------------------------------------

test("a `fixtures` directory with no exemptions no longer makes the surface incomplete, and is scanned", async () => {
  const root = await repo({ "src/ok.js": CLEAN, "test/fixtures/data/ok.js": CLEAN, "fixtures/bypass.js": CERT });
  const audit = cli("audit", root);
  const s = audit.json.evidenceSurface;
  assert.equal(s.complete, true, JSON.stringify(s));
  assert.deepEqual(s.frameworkExcludedDirectories, []);
  assert.deepEqual(s.excludedDirectories.filter((e) => e.path.includes("fixtures")), []);
  // Scanned, not merely not-excluded: the bypass in a top-level `fixtures/` is found.
  assert.ok(audit.json.findings.some((f) => f.rule === CERT_RULE && f.evidence.includes("fixtures/bypass.js")));
});

test("the surface still goes incomplete, and rules withdraw, when the run could not read what was there", async () => {
  const root = await repo({ "src/ok.js": CLEAN, "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  // A one-byte budget: nothing is opened. The exemption matches by path and digest, and must still
  // not be applied, because no detector saw a violation to waive.
  const audit = cli("audit", root, "--max-total-read-bytes=1");
  assert.equal(audit.json.evidenceSurface.complete, false);
  assert.equal(audit.json.evidenceSurface.readBudget.exhausted, true);
  const res = cli("validate", root, "--max-total-read-bytes=1");
  for (const rule of [CERT_RULE, SQL_RULE, "errors.no-swallowed-exceptions"]) {
    const r = resultOf(res, rule);
    assert.equal(r.status, "skipped", `${rule} reported a result over files nobody read`);
    assert.equal(r.disposition, "not-evaluated", rule);
  }
});

test("no rule is EXCEPTED over a file it did not read: a truncated file beside a pinned fixture withdraws it", async () => {
  // 450 KB of padding puts a SQL interpolation past the 400 KB read cap. The pinned cert fixture is
  // fully read and does violate; the rule it is pinned for must still be withdrawn for SQL, and the
  // cert rule — whose domain includes the truncated file — must not claim an exception either.
  const padding = `// ${"x".repeat(80)}${NL}`.repeat(5700);
  const root = await repo(
    { "test/fixtures/bad/bypass.js": CERT, "src/big.js": padding + SQL },
    [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)],
  );
  const res = cli("validate", root);
  const cert = resultOf(res, CERT_RULE);
  assert.equal(cert.status, "skipped", JSON.stringify(cert));
  assert.equal(cert.disposition, "not-evaluated", "a rule that could not finish reading must not report an exception");
  assert.equal(resultOf(res, SQL_RULE).disposition, "not-evaluated");
  assert.notEqual(res.json.status, "COMPLIANT");
});

test("audit reports the same waiver and lists the departure rather than hiding it", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const audit = cli("audit", root);
  const waived = audit.json.findings.filter((f) => f.id === "fixture-exempted");
  assert.equal(waived.length, 1);
  assert.equal(waived[0].severity, "info");
  assert.equal(waived[0].fixtureExemption.rule, CERT_RULE);
  assert.equal(audit.json.findings.some((f) => f.id === "certificate-validation-bypass"), false);
});

test("CRLF checkout of an unchanged fixture still matches its pin; any other byte does not", async () => {
  const crlf = CERT.split(NL).join("\r\n");
  const root = await repo({ "test/fixtures/bad/bypass.js": crlf }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  assert.equal(resultOf(cli("validate", root), CERT_RULE).disposition, "excepted");
});

/**
 * Exact fixture exemptions (ST-19a, ADR 0020).
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
import { contentDigest, contentDigestOfStream, checkEntries, FIXTURE_EXEMPTIBLE_RULES, pathProblem } from "../scripts/fixture-exemptions.mjs";
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
  ["an expired entry", (() => { const e = GOOD(); delete e.reviewWhen; return { ...e, expires: "2020-01-01" }; })(), "fixture-exemption-expired"],
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

test("an incomplete read never makes a pin stale: budget exhausted, the entry is 'not established' and is kept", async () => {
  const root = await repo({ "src/ok.js": CLEAN, "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const res = cli("validate", root, "--max-total-read-bytes=1");
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 0, JSON.stringify(res.json.findings.map((f) => f.id)));
  const ne = findingsOf(res, "fixture-exemption-not-established");
  assert.equal(ne.length, 1);
  assert.doesNotMatch(ne[0].message, /remove the entry|found no violation/);
  assert.equal(resultOf(res, CERT_RULE).disposition, "not-evaluated");
});

test("an incomplete read never makes a pin stale: the violation lies past the truncation boundary", async () => {
  const big = `// ${"x".repeat(80)}${NL}`.repeat(5700) + CERT;
  const root = await repo({ "test/fixtures/bad/big.js": big }, [pin("test/fixtures/bad/big.js", big, CERT_RULE)]);
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 0, JSON.stringify(res.json.findings.map((f) => f.id)));
  assert.equal(findingsOf(res, "fixture-exemption-not-established").length, 1);
  assert.equal(resultOf(res, CERT_RULE).disposition, "not-evaluated");
});

for (const bad of ["2026-02-30", "2027-02-29", "2026-04-31", "2026-00-10", "2026-13-01", "2026-01-00", "2026-06-31"]) {
  test(`an impossible expiry date (${bad}) waives nothing`, async () => {
    const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [(() => { const e = GOOD(); delete e.reviewWhen; return { ...e, expires: bad }; })()]);
    const res = cli("validate", root);
    assert.equal(findingsOf(res, "fixture-exemption-bad-expiry").length, 1);
    assert.equal(resultOf(res, CERT_RULE).disposition, "evaluated");
  });
}

test("a real leap-day expiry in the future is accepted", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [(() => { const e = GOOD(); delete e.reviewWhen; return { ...e, expires: "2096-02-29" }; })()]);
  assert.equal(resultOf(cli("validate", root), CERT_RULE).disposition, "excepted");
});

test("an entry with BOTH expires and reviewWhen is rejected by name and waives nothing", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [{ ...GOOD(), expires: "2096-01-01" }]);
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exemption-two-lifetimes").length, 1, JSON.stringify(res.json.findings.map((f) => f.id)));
  assert.equal(resultOf(res, CERT_RULE).disposition, "evaluated");
});

test("the digest is checked against the bytes the surface read retained, never a second read of the path", async () => {
  const { bindEntries } = await import("../scripts/fixture-exemptions.mjs");
  const dir = await mkdtemp(path.join(os.tmpdir(), "fx-bind-"));
  await mkdir(path.join(dir, "t"), { recursive: true });
  // On disk NOW is the pinned version B; the surface read retained version A.
  await writeFile(path.join(dir, "t/f.js"), "B");
  const entry = { ...pin("t/f.js", "B", CERT_RULE), index: 0 };
  const retainedA = contentDigest(Buffer.from("A"));
  const [bound] = bindEntries([entry], { scanned: new Set(["t/f.js"]), digests: new Map([["t/f.js", retainedA]]), root: dir });
  assert.equal(bound.state, "digest-mismatch", "a pin for bytes that were never inspected must not match");
  assert.equal(bound.observedSha256, retainedA);
  const [unread] = bindEntries([entry], { scanned: new Set(["t/f.js"]), digests: new Map(), root: dir });
  assert.equal(unread.state, "not-read", "a file with no retained digest is never hashed from disk");
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

test("a pinned file the read budget skipped is never reopened to be hashed: a wrong pin is 'not established', not a digest mismatch", async () => {
  const wrong = pin("test/fixtures/bad/bypass.js", CLEAN, CERT_RULE); // digest of other bytes
  const root = await repo({ "src/ok.js": CLEAN, "test/fixtures/bad/bypass.js": CERT }, [wrong]);
  const res = cli("validate", root, "--max-total-read-bytes=1");
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 0, JSON.stringify(res.json.findings.map((f) => f.id)));
  const ne = findingsOf(res, "fixture-exemption-not-established");
  assert.equal(ne.length, 1);
  assert.doesNotMatch(ne[0].message, /changed|digest is|stale|remove/);
});

// ---- human output and audit reporting (Codex round 3) ----------------------------------------------

function cliText(command, root, ...extra) {
  const r = spawnSync(process.execPath, [CLI, command, `--dir=${root}`, ...extra], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.error, undefined);
  return { code: r.status, out: r.stdout, stderr: r.stderr };
}

test("non-JSON validate prints a stale fixture entry, and the verdict is unchanged by it", async () => {
  const root = await repo({ "test/fixtures/bad/clean.js": CLEAN }, [pin("test/fixtures/bad/clean.js", CLEAN, CERT_RULE, { sha256: "0".repeat(64) })]);
  const res = cliText("validate", root);
  assert.match(res.out, /Fixture exemptions/);
  assert.match(res.out, /test\/fixtures\/bad\/clean\.js/);
  assert.match(res.out, /stale/);
  const json = cli("validate", root);
  assert.equal(findingsOf(json, "fixture-exemption-stale").length, 1);
});

test("non-JSON validate prints a not-established entry", async () => {
  const root = await repo({ "src/ok.js": CLEAN, "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const res = cliText("validate", root, "--max-total-read-bytes=1");
  const at = res.out.indexOf("Fixture exemptions");
  assert.ok(at >= 0, res.out);
  assert.match(res.out.slice(at), /exemption for test\/fixtures\/bad\/bypass\.js \(owner project-owner\) is not established/);
});

test("audit reports a fixtureExemptions entry that fails the policy schema, instead of silently treating it as absent", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE, { sha256: "abc" })]);
  const res = cli("audit", root);
  const f = res.json.findings.filter((x) => x.id === "fixture-exemption-schema-invalid");
  assert.equal(f.length, 1, JSON.stringify(res.json.findings.map((x) => x.id)));
  assert.match(f[0].message, /fixtureExemptions\[0\]\.sha256/);
  assert.match(f[0].message, /none of the fixture exemptions applies/);
  // And the bait is inspected as ordinary content.
  assert.ok(res.json.findings.some((x) => x.rule === CERT_RULE));
});

test("a pinned directory written without a trailing slash is a bad path, in audit and in policy", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad", CERT, CERT_RULE)]);
  const res = cli("audit", root);
  assert.equal(findingsOf(res, "fixture-exemption-bad-path").length, 1, JSON.stringify(res.json.findings.map((f) => f.id)));
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 0);
  const result = await checkPolicy(path.join(root, "project-policy.yml"), SCHEMA, "2026-10-12");
  assert.ok(result.findings.some((f) => f.id === "fixture-exemption-bad-path"));
});

test("an unrelated schema error is reported as the reason valid pins did not apply", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const file = path.join(root, "project-policy.yml");
  const { readFile } = await import("node:fs/promises");
  await writeFile(file, (await readFile(file, "utf8")).replace('standardVersion: "2.0.0"', 'standardVersion: "not-a-version"'));
  const res = cli("audit", root);
  const f = res.json.findings.filter((x) => x.id === "fixture-exemption-schema-invalid");
  assert.equal(f.length, 1, JSON.stringify(res.json.findings.map((x) => x.id)));
  assert.match(f[0].message, /standardVersion/);
});

test("the streaming digest equals the whole-buffer digest for every chunking, including a CRLF split across chunks", async () => {
  const bytes = Buffer.from("a\r\nb\rc\r\n\r\nd\r", "latin1");
  const want = contentDigest(bytes);
  for (let size = 1; size <= bytes.length + 1; size += 1) {
    const chunks = [];
    for (let i = 0; i < bytes.length; i += size) chunks.push(bytes.subarray(i, i + size));
    assert.equal(await contentDigestOfStream(chunks), want, "chunk size " + size);
  }
});

test("a mapping-shaped fixtureExemptions is reported by audit as the reason the pin did not apply", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT });
  const text = [
    'standardVersion: "2.0.0"',
    'project: "fixture exemption specimen"',
    "fixtureExemptions:",
    '  path: "test/fixtures/bad/bypass.js"',
    '  rule: "security.no-cert-bypass"',
    "",
  ].join("\n");
  await writeFile(path.join(root, "project-policy.yml"), text);
  const res = cli("audit", root);
  assert.equal(findingsOf(res, "fixture-exemption-schema-invalid").length, 1, JSON.stringify(res.json.findings.map((x) => x.id)));
});

test("a valid pin on a .env that is no longer tracked is reported stale, not 'not established'", async () => {
  const root = await repo({ "src/ok.js": CLEAN, "test/fixtures/bad/.env": ENV }, [pin("test/fixtures/bad/.env", ENV, "scm.no-committed-env-files")]);
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  git("rm", "-q", "--cached", "test/fixtures/bad/.env");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "untrack");
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exemption-not-established").length, 0, JSON.stringify(res.json.findings.map((x) => x.id)));
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 1);
});

test("human validate lists a waived fixture that sits beside a live violation of the same rule", async () => {
  const root = await repo(
    { "test/fixtures/bad/bypass.js": CERT, "src/live.js": CERT },
    [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)],
  );
  const res = cliText("validate", root);
  assert.match(res.out, /Fixture exemptions[\s\S]*test\/fixtures\/bad\/bypass\.js departs from security\.no-cert-bypass and is waived/);
});

test("a truncated .env.json pin is judged by the index, so a dead one is stale rather than not established", async () => {
  const big = `{"k":"${"x".repeat(1_100_000)}"}`;
  const root = await repo({ "src/ok.js": CLEAN, "test/fixtures/bad/.env.json": big }, [pin("test/fixtures/bad/.env.json", big, "scm.no-committed-env-files")]);
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
  };
  git("rm", "-q", "--cached", "test/fixtures/bad/.env.json");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "untrack");
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exemption-not-established").length, 0, JSON.stringify(res.json.findings.map((x) => x.id)));
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 1);
});

test("an env pin is 'not established', never stale, when the repository index cannot be read", async () => {
  const root = await scratch();
  await mkdir(path.join(root, "test/fixtures/bad"), { recursive: true });
  await writeFile(path.join(root, "test/fixtures/bad/.env"), ENV);
  await writeFile(path.join(root, "project-policy.yml"), policyText([pin("test/fixtures/bad/.env", ENV, "scm.no-committed-env-files")]));
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 0, JSON.stringify(res.json?.findings?.map((x) => x.id)));
  assert.equal(findingsOf(res, "fixture-exemption-not-established").length, 1);
});

test("contentDigest of a large CRLF-heavy text matches the reference without a per-line concatenation", () => {
  const text = "line of text\r\n".repeat(200_000);
  assert.equal(contentDigest(Buffer.from(text)), contentDigest(Buffer.from(text.replaceAll("\r\n", "\n"))));
});

test("a fixture waiver is still listed when a project-level exception excepts the same rule", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT, "src/live.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const file = path.join(root, "project-policy.yml");
  const { readFile } = await import("node:fs/promises");
  const base = await readFile(file, "utf8");
  const extra = [
    "exceptions:",
    "  - rule: security.no-cert-bypass",
    '    reason: "legacy client being replaced"',
    '    approvedBy: "project-owner"',
    '    approvedAt: "2026-01-01"',
    '    expires: "2099-01-01"',
    "",
  ].join(String.fromCharCode(10));
  await writeFile(file, base + extra);
  const res = cliText("validate", root);
  assert.match(res.out, /departs from security\.no-cert-bypass and is waived/, res.out);
});

test("remediation matches the cause: a truncated pin is not told to raise the aggregate budget", async () => {
  const big = `// ${"x".repeat(80)}${NL}`.repeat(14000) + CERT;
  const root = await repo({ "test/fixtures/bad/big.js": big }, [pin("test/fixtures/bad/big.js", big, CERT_RULE)]);
  const res = cli("validate", root);
  const ne = findingsOf(res, "fixture-exemption-not-established");
  assert.equal(ne.length, 1);
  assert.match(ne[0].message, /per-file read cap/);
  assert.doesNotMatch(ne[0].message, /rerun with a larger/);
});

test("a waived fixture of an optional (silenced) rule is silent in human output, as in JSON", async () => {
  const UNF = "quality.unfinished-work";
  const root = await repo({ "test/fixtures/bad/work.js": UNFINISHED }, [pin("test/fixtures/bad/work.js", UNFINISHED, UNF)]);
  const file = path.join(root, "project-policy.yml");
  const { readFile } = await import("node:fs/promises");
  await writeFile(file, (await readFile(file, "utf8")) + ["rules:", "  quality.unfinished-work:", "    level: optional", ""].join(String.fromCharCode(10)));
  const human = cliText("validate", root);
  assert.doesNotMatch(human.out, /departs from quality.unfinished-work/, human.out);
  const json = cli("validate", root);
  assert.equal(findingsOf(json, "fixture-exempted").length, 0);
});

test("a null fixtureExemptions section is reported as the reason no pin applied", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT });
  const text = ['standardVersion: "2.0.0"', 'project: "fixture exemption specimen"', "fixtureExemptions:", ""].join(String.fromCharCode(10));
  await writeFile(path.join(root, "project-policy.yml"), text);
  const res = cli("audit", root);
  assert.equal(findingsOf(res, "fixture-exemption-schema-invalid").length, 1, JSON.stringify(res.json.findings.map((x) => x.id)));
});

test("duplicates are rejected before filtering: an expired twin does not leave its pair looking unique", async () => {
  const live = pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE);
  const dead = { ...pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE), reviewWhen: undefined, expires: "2020-01-01" };
  delete dead.reviewWhen;
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [live, dead]);
  const res = cli("validate", root);
  assert.equal(resultOf(res, CERT_RULE).disposition, "evaluated", "neither duplicate may waive");
  assert.equal(findingsOf(res, "fixture-exemption-duplicate").length, 2);
});

test("a flow-empty fixtureExemptions mapping that does not parse is reported by audit", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT });
  const text = ['standardVersion: "2.0.0"', 'project: "fixture exemption specimen"', "fixtureExemptions: {}", ""].join(String.fromCharCode(10));
  await writeFile(path.join(root, "project-policy.yml"), text);
  const res = cli("audit", root);
  assert.equal(findingsOf(res, "fixture-exemption-schema-invalid").length, 1, JSON.stringify(res.json.findings.map((x) => x.id)));
});

test("every file this change owns is text: no NUL byte, valid UTF-8 (a NUL made Git treat a module as binary)", async () => {
  const { readFile } = await import("node:fs/promises");
  const root = path.join(HERE, "..");
  for (const rel of ["scripts/fixture-exemptions.mjs", "scripts/standards.mjs", "scripts/policy.mjs", "scripts/compliance.mjs", "test/fixture-exemptions.test.mjs", "schemas/project-policy.schema.json", "project-policy.yml", "CHANGELOG.md"]) {
    const bytes = await readFile(path.join(root, rel));
    assert.equal(bytes.includes(0), false, rel + " contains a NUL byte");
    assert.doesNotThrow(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes), rel);
  }
});

test("a spaced or quoted fixtureExemptions key that does not parse is still reported", async () => {
  for (const key of ["fixtureExemptions : {}", '"fixtureExemptions": {}']) {
    const root = await repo({ "test/fixtures/bad/bypass.js": CERT });
    const text = ['standardVersion: "2.0.0"', 'project: "fixture exemption specimen"', key, ""].join(String.fromCharCode(10));
    await writeFile(path.join(root, "project-policy.yml"), text);
    const res = cli("audit", root);
    assert.equal(findingsOf(res, "fixture-exemption-schema-invalid").length, 1, key);
  }
});

test("policy.mjs rejects a fixture exemption on a rule declared not-applicable", async () => {
  const root = await scratch();
  const file = path.join(root, "p.yml");
  const body = policyText([pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const extra = ["applicability:", "  security.no-cert-bypass:", "    status: not-applicable", '    reason: "no TLS clients"', '    revisitWhen: "a client is added"', ""].join(String.fromCharCode(10));
  await writeFile(file, body + extra);
  const result = await checkPolicy(file, SCHEMA, "2026-10-12");
  assert.ok(result.findings.some((f) => f.id === "policy.conflicting-classification" && /fixture exemption/.test(f.message)), JSON.stringify(result));
});

test("standards policy checks entries, not freshness: a dead pin passes it and audit reports it stale, and ADR 0020 says so", async () => {
  const root = await repo({ "src/ok.js": CLEAN }, [pin("test/fixtures/gone.js", CERT, CERT_RULE)]);
  const result = await checkPolicy(path.join(root, "project-policy.yml"), SCHEMA, "2026-10-12");
  assert.equal(result.status, "ok", "policy does not bind entries to the repository");
  assert.equal(findingsOf(cli("validate", root), "fixture-exemption-stale").length, 1);
  const { readFile, readdir } = await import("node:fs/promises");
  const dir = path.join(HERE, "..", "artifacts", "adr");
  const name = (await readdir(dir)).find((f) => f.startsWith("0020"));
  const adr = (await readFile(path.join(dir, name), "utf8")).replace(/[\r\n \t]+/g, " ");
  assert.doesNotMatch(adr, /learns of a dead entry before an audit/);
  assert.match(adr, /can therefore still carry a dead entry/);
});

test("a pin beyond the file-count cap is 'not established', not stale", { timeout: 300000 }, async () => {
  const root = await scratch();
  await mkdir(path.join(root, "a"), { recursive: true });
  for (let i = 0; i < 20050; i += 1) await writeFile(path.join(root, "a", "f" + i + ".txt"), "x");
  await mkdir(path.join(root, "zzz"), { recursive: true });
  await writeFile(path.join(root, "zzz/late.js"), CERT);
  await writeFile(path.join(root, "project-policy.yml"), policyText([pin("zzz/late.js", CERT, CERT_RULE)]));
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 0, JSON.stringify(res.json.findings.map((f) => f.id)));
  const ne = findingsOf(res, "fixture-exemption-not-established");
  assert.equal(ne.length, 1);
  assert.match(ne[0].message, /file cap/);
});

test("the global file cap does not make an ignored or vendored pin 'not established'", { timeout: 300000 }, async () => {
  const root = await scratch();
  await mkdir(path.join(root, "a"), { recursive: true });
  for (let i = 0; i < 20050; i += 1) await writeFile(path.join(root, "a", "f" + i + ".txt"), "x");
  await mkdir(path.join(root, "node_modules/pkg"), { recursive: true });
  await writeFile(path.join(root, "node_modules/pkg/bad.js"), CERT);
  await writeFile(path.join(root, "project-policy.yml"), policyText([pin("node_modules/pkg/bad.js", CERT, CERT_RULE)]));
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exemption-not-established").length, 0, JSON.stringify(res.json.findings.map((f) => f.id)));
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 1);
});

test("the global file cap does not hide a pin under a custom-named vendor tree", { timeout: 300000 }, async () => {
  const root = await scratch();
  await mkdir(path.join(root, "a"), { recursive: true });
  for (let i = 0; i < 20050; i += 1) await writeFile(path.join(root, "a", "f" + i + ".txt"), "x");
  await mkdir(path.join(root, "zzz-env"), { recursive: true });
  await writeFile(path.join(root, "zzz-env/pyvenv.cfg"), "home = /usr");
  await writeFile(path.join(root, "zzz-env/bad.js"), CERT);
  await writeFile(path.join(root, "project-policy.yml"), policyText([pin("zzz-env/bad.js", CERT, CERT_RULE)]));
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exemption-not-established").length, 0, JSON.stringify(res.json.findings.map((f) => f.id)));
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 1);
});

test("cap-hidden pins in one directory list each directory once, not once per pin", { timeout: 300000 }, async () => {
  const root = await scratch();
  await mkdir(path.join(root, "a"), { recursive: true });
  for (let i = 0; i < 20050; i += 1) await writeFile(path.join(root, "a", "f" + i + ".txt"), "x");
  await mkdir(path.join(root, "zzz"), { recursive: true });
  const pins = [];
  for (let i = 0; i < 6; i += 1) {
    await writeFile(path.join(root, "zzz", "late" + i + ".js"), CERT);
    pins.push(pin("zzz/late" + i + ".js", CERT, CERT_RULE));
  }
  await writeFile(path.join(root, "project-policy.yml"), policyText(pins));
  const counter = path.join(root, "..", "count-" + path.basename(root) + ".cjs");
  const log = counter + ".log";
  await writeFile(
    counter,
    [
      'const fs = require("node:fs");',
      "const real = fs.readdirSync;",
      "fs.readdirSync = function (p, ...rest) {",
      '  if (String(p).split(String.fromCharCode(92)).join("/").endsWith("/zzz")) fs.appendFileSync(' + JSON.stringify(log) + ', "x");',
      "  return real.call(this, p, ...rest);",
      "};",
      "",
    ].join(String.fromCharCode(10)),
  );
  const r = spawnSync(process.execPath, ["--require", counter, CLI, "validate", "--dir=" + root, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  assert.equal(r.error, undefined);
  if (!r.stdout) throw new Error("no output: " + r.stderr.slice(0, 600));
  const json = JSON.parse(r.stdout);
  assert.equal(json.findings.filter((f) => f.id === "fixture-exemption-not-established").length, 6);
  const { readFile } = await import("node:fs/promises");
  const reads = (await readFile(log, "utf8")).length;
  assert.ok(reads >= 1 && reads <= 1, "directory zzz was listed " + reads + " times");
  await rm(counter, { force: true });
  await rm(log, { force: true });
});

test("a fixture-only rule keeps its active project-level exception visible beside the fixture pins", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const file = path.join(root, "project-policy.yml");
  const { readFile } = await import("node:fs/promises");
  const extra = ["exceptions:", "  - rule: security.no-cert-bypass", '    reason: "legacy client being replaced"', '    approvedBy: "project-owner"', '    approvedAt: "2026-01-01"', '    expires: "2099-01-01"', ""].join(String.fromCharCode(10));
  await writeFile(file, (await readFile(file, "utf8")) + extra);
  const r = resultOf(cli("validate", root), CERT_RULE);
  assert.equal(r.exception.kind, "fixture-exemption");
  assert.equal(r.exception.fixtures.length, 1);
  assert.equal(r.exception.projectException.reason, "legacy client being replaced");
  assert.match(cliText("validate", root).out, /legacy client being replaced/);
});

test("ADR 0020 does not file an unreadable pin under stale", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const dir = path.join(HERE, "..", "artifacts", "adr");
  const name = (await readdir(dir)).find((f) => f.startsWith("0020"));
  const adr = await readFile(path.join(dir, name), "utf8");
  assert.doesNotMatch(adr, /scanned surface, unreadable, digest changed/);
  assert.match(adr, /File unreadable, or not read in full/);
});

test("a pin on a rule declared not-applicable is not bound by validate and the conflict is named", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const file = path.join(root, "project-policy.yml");
  const { readFile } = await import("node:fs/promises");
  const extra = ["applicability:", "  security.no-cert-bypass:", "    status: not-applicable", '    reason: "no TLS clients"', '    revisitWhen: "a client is added"', ""].join(String.fromCharCode(10));
  await writeFile(file, (await readFile(file, "utf8")) + extra);
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exempted").length, 0, "no waiver may be applied to a not-applicable rule");
  assert.equal(findingsOf(res, "fixture-exemption-rule-not-applicable").length, 1, JSON.stringify(res.json.findings.map((f) => f.id)));
});

test("audit stays independent of applicability: a pin on a not-applicable rule is still bound by audit", async () => {
  const root = await repo({ "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const file = path.join(root, "project-policy.yml");
  const { readFile } = await import("node:fs/promises");
  const extra = ["applicability:", "  security.no-cert-bypass:", "    status: not-applicable", '    reason: "no TLS clients"', '    revisitWhen: "a client is added"', ""].join(String.fromCharCode(10));
  await writeFile(file, (await readFile(file, "utf8")) + extra);
  const res = cli("audit", root);
  assert.equal(findingsOf(res, "fixture-exemption-rule-not-applicable").length, 0);
  assert.equal(findingsOf(res, "fixture-exempted").length, 1);
});

test("a content pin over a truncated file is not bound: the hit stays live and the pin is not established", async () => {
  const big = CERT + (`// ${"x".repeat(80)}${NL}`).repeat(14000);
  const root = await repo({ "test/fixtures/bad/big.js": big }, [pin("test/fixtures/bad/big.js", big, CERT_RULE)]);
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exempted").length, 0, "a truncated content pin must not waive: "+JSON.stringify(res.json.findings.map((f) => f.id)));
  assert.equal(findingsOf(res, "fixture-exemption-not-established").length, 1);
  assert.ok(res.json.findings.some((f) => f.rule === CERT_RULE && !f.fixtureExemption), "the observed violation stays live");
});

test("a used index-only env pin over a truncated .env.json is not reported stale or not established", async () => {
  const big = '{"k":"' + "x".repeat(1_100_000) + '"}';
  const root = await repo({ "src/ok.js": CLEAN, "test/fixtures/bad/.env.json": big }, [pin("test/fixtures/bad/.env.json", big, "scm.no-committed-env-files")]);
  const res = cli("validate", root);
  assert.equal(findingsOf(res, "fixture-exempted").length, 1, JSON.stringify(res.json.findings.map((f) => f.id)));
  assert.equal(findingsOf(res, "fixture-exemption-stale").length, 0);
  assert.equal(findingsOf(res, "fixture-exemption-not-established").length, 0);
});

// ---- deterministic verdict and probe tests (no unrelated failures, injected access failures) ----

const FOUR_FAILING = ["architecture.project-manifest", "architecture.adr", "documentation.architecture", "planning.breakdown-directory"];
const UNESTABLISHED = ("ai.no-fabricated-capabilities ai.no-safety-bypass architecture.no-hidden-global-state architecture.no-boundary-bypass " +
  "architecture.no-duplicate-implementations concurrency.no-unmanaged-shared-state data.migration-rollback data.no-silent-discard " +
  "data.no-audit-corruption data.no-prod-data-in-dev errors.no-false-success errors.no-unbounded-retry observability.no-silenced-failures " +
  "meta.standards-not-weakened scm.no-shared-history-rewrite security.no-disabled-access-controls security.no-untrusted-exec " +
  "testing.no-weakening-to-pass testing.no-fabricated-results").split(" ");

function applicability(ids) {
  const NLc = String.fromCharCode(10);
  return "applicability:" + NLc + ids.map((id) => "  " + id + ":" + NLc + "    status: not-applicable" + NLc + '    reason: "none here"' + NLc + '    revisitWhen: "later"' + NLc).join("");
}

async function compliantRepo(naRules) {
  const root = await repo({ "src/ok.js": CLEAN, "test/fixtures/bad/bypass.js": CERT }, [pin("test/fixtures/bad/bypass.js", CERT, CERT_RULE)]);
  const { readFile } = await import("node:fs/promises");
  const file = path.join(root, "project-policy.yml");
  await writeFile(file, (await readFile(file, "utf8")) + applicability(naRules));
  return root;
}

test("a not-applicable rule carrying a pin: validate exits 1 as NOT_EVALUATED; without the declaration it is COMPLIANT_WITH_EXCEPTIONS and exits 0; audit is independent", async () => {
  const base = [...FOUR_FAILING, ...UNESTABLISHED];
  const clean = cli("validate", await compliantRepo(base));
  assert.equal(clean.code, 0, "control: otherwise compliant, " + JSON.stringify(clean.json?.status));
  assert.equal(clean.json.status, "COMPLIANT_WITH_EXCEPTIONS");
  const root = await compliantRepo([...base, CERT_RULE]);
  const res = cli("validate", root);
  assert.equal(res.code, 1);
  assert.equal(res.json.status, "NOT_EVALUATED");
  assert.equal(findingsOf(res, "fixture-exemption-rule-not-applicable").length, 1);
  const audit = cli("audit", root);
  assert.equal(audit.code, 0);
  assert.equal(findingsOf(audit, "fixture-exempted").length, 1);
  assert.equal(findingsOf(audit, "fixture-exemption-rule-not-applicable").length, 0);
  const text = cliText("validate", root);
  assert.doesNotMatch(text.out, /the verdict above is unchanged by these/);
  assert.match(text.out, /made the status above NOT_EVALUATED/);
});

function preload(lines) {
  const file = path.join(os.tmpdir(), "fx-preload-" + process.pid + "-" + Math.random().toString(36).slice(2) + ".cjs");
  return writeFile(file, lines.join(String.fromCharCode(10))).then(() => file);
}
const BSL = String.fromCharCode(92);
const norm = 'String(p).split(String.fromCharCode(92)).join("/")';

test("a pin beneath a directory the walk could not list is 'not established', not stale (injected EACCES)", async () => {
  const root = await repo({ "src/ok.js": CLEAN, "locked/bad.js": CERT }, [pin("locked/bad.js", CERT, CERT_RULE)]);
  const pre = await preload([
    'const fs = require("node:fs");',
    "const deny = (p) => " + norm + '.endsWith("/locked");',
    'const ex = (p) => Object.assign(new Error("EACCES: permission denied, scandir " + p), { code: "EACCES" });',
    "const rs = fs.readdirSync; fs.readdirSync = function (p, ...r) { if (deny(p)) throw ex(p); return rs.call(this, p, ...r); };",
    "const pr = fs.promises.readdir; fs.promises.readdir = async function (p, ...r) { if (deny(p)) throw ex(p); return pr.call(this, p, ...r); };",
    "const rd = fs.readdir; fs.readdir = function (p, ...r) { if (deny(p)) return r[r.length - 1](ex(p)); return rd.call(this, p, ...r); };",
  ]);
  const r = spawnSync(process.execPath, ["--require", pre, CLI, "validate", "--dir=" + root, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const json = JSON.parse(r.stdout);
  assert.equal(json.findings.filter((f) => f.id === "fixture-exemption-stale").length, 0, JSON.stringify(json.findings.map((f) => f.id)));
  const ne = json.findings.filter((f) => f.id === "fixture-exemption-not-established");
  assert.equal(ne.length, 1);
  assert.match(ne[0].message, /could not be listed/);
  await rm(pre, { force: true });
});

test("a cap-hidden pin whose existence probe fails with EACCES is 'not established', not stale (injected)", { timeout: 300000 }, async () => {
  const root = await scratch();
  await mkdir(path.join(root, "a"), { recursive: true });
  for (let i = 0; i < 20050; i += 1) await writeFile(path.join(root, "a", "f" + i + ".txt"), "x");
  await mkdir(path.join(root, "zzz"), { recursive: true });
  await writeFile(path.join(root, "zzz/late.js"), CERT);
  await writeFile(path.join(root, "project-policy.yml"), policyText([pin("zzz/late.js", CERT, CERT_RULE)]));
  const pre = await preload([
    'const fs = require("node:fs");',
    "const hit = (p) => " + norm + '.endsWith("zzz/late.js");',
    'const ex = (p) => Object.assign(new Error("EACCES: permission denied " + p), { code: "EACCES" });',
    "const ee = fs.existsSync; fs.existsSync = function (p) { return hit(p) ? false : ee.call(this, p); };",
    'for (const n of ["statSync", "lstatSync"]) { const o = fs[n]; fs[n] = function (p, ...r) { if (hit(p)) throw ex(p); return o.call(this, p, ...r); }; }',
  ]);
  const r = spawnSync(process.execPath, ["--require", pre, CLI, "validate", "--dir=" + root, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const json = JSON.parse(r.stdout);
  assert.equal(json.findings.filter((f) => f.id === "fixture-exemption-stale").length, 0, JSON.stringify(json.findings.map((f) => f.id)));
  assert.equal(json.findings.filter((f) => f.id === "fixture-exemption-not-established").length, 1);
  await rm(pre, { force: true });
});

test("ADR 0020 and CHANGELOG state the not-applicable conflict, the unlistable-directory case and projectException", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const dir = path.join(HERE, "..", "artifacts", "adr");
  const name = (await readdir(dir)).find((f) => f.startsWith("0020"));
  const adr = await readFile(path.join(dir, name), "utf8");
  const log = await readFile(path.join(HERE, "..", "CHANGELOG.md"), "utf8");
  for (const needle of ["fixture-exemption-rule-not-applicable", "projectException", "could not list", "policy.conflicting-classification"]) {
    assert.ok(adr.includes(needle), "ADR 0020 is missing: " + needle);
  }
  for (const needle of ["fixture-exemption-rule-not-applicable", "projectException"]) {
    assert.ok(log.includes(needle), "CHANGELOG is missing: " + needle);
  }
});

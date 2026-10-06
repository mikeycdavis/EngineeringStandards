/**
 * Standard 18 R3: an `optional` rule's level means "May hold; no expectation either way", and its
 * outcome on violation is SILENT. The owner decided (A) that the engine conforms to the standard
 * rather than the standard conforming to a warning the engine happened to emit.
 *
 * Silent means: no `warning`, no `failed`, no count in the warning or failed totals, no line in the
 * verdict text, and no effect on the aggregate status or the exit code. It does NOT mean the rule
 * disappears: its result is still present and still accounts for the rule.
 *
 * Every positive here has a negative beside it. A test that only showed optional is silent would be
 * satisfied by an engine that silenced everything, so the same violation is run at `recommended`
 * (warns), `required` and `forbidden` (fail), and the level is the only thing that varies.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../scripts/catalog.mjs";
import { evaluate, STATUS } from "../scripts/compliance.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const RULE = "quality.dead-code"; // catalogued optional
const OTHER = "quality.unfinished-work"; // catalogued recommended: behaviour follows the LEVEL, not the rule
const TODAY = "2026-10-05";
const AMPLE = 64 * 1024 * 1024;

const catalog = await loadCatalog();
const ALL = [...catalog.rules.keys()];

// --- evaluate(): the aggregate contract ----------------------------------------------------------

/** A policy over which nothing is unestablished, so the baseline verdict is COMPLIANT. */
const clean = (rules, exceptions) => ({
  standardVersion: "2.0.0",
  project: "Fixture",
  rules,
  ...(exceptions ? { exceptions } : {}),
  applicability: Object.fromEntries(
    [...catalog.rules.values()]
      .filter((r) => r.level === "forbidden" && r.validationType === "manual-review")
      .map((r) => [
        r.id,
        { status: "not-applicable", reason: "Fixture.", reviewedAt: TODAY, revisitWhen: "Never, in a fixture." },
      ]),
  ),
});

const violation = (rule) => [{ rule, message: "a violation", evidence: ["src/a.js"] }];
const verdictAt = (rule, level, withViolation = true, exceptions) =>
  evaluate({
    catalog,
    policy: clean({ [rule]: { level } }, exceptions),
    findings: withViolation ? violation(rule) : [],
    evaluated: ALL,
    today: TODAY,
  });
const resultOf = (verdict, rule) => verdict.results.find((r) => r.ruleId === rule);

for (const rule of [RULE, OTHER]) {
  test(`${rule}: an optional violation is silent in the result, the totals and the status`, () => {
    const hit = verdictAt(rule, "optional");
    const none = verdictAt(rule, "optional", false);
    const r = resultOf(hit, rule);
    assert.equal(r.level, "optional");
    assert.notEqual(r.status, "warning", "an optional violation was reported as a warning");
    assert.notEqual(r.status, "failed", "an optional violation was reported as a failure");
    assert.equal(r.status, "passed");
    assert.deepEqual(hit.summary, none.summary, "the violation moved a total");
    assert.deepEqual(hit.assurance, none.assurance);
    assert.equal(hit.status, none.status);
    assert.equal(hit.status, STATUS.COMPLIANT);
    assert.equal(hit.score, none.score);
    assert.deepEqual(r.evidence, [], "an optional violation's evidence was surfaced");
  });
}

test("NEGATIVE: the same violation at recommended is still a warning", () => {
  const v = verdictAt(RULE, "recommended");
  assert.equal(resultOf(v, RULE).status, "warning");
  assert.equal(v.summary.warnings, verdictAt(RULE, "recommended", false).summary.warnings + 1);
  assert.equal(v.status, STATUS.COMPLIANT, "a warning must not decide the verdict");
});

test("NEGATIVE: the same violation at required is still a failure that decides the status", () => {
  const v = verdictAt(RULE, "required");
  assert.equal(resultOf(v, RULE).status, "failed");
  assert.equal(v.status, STATUS.NON_COMPLIANT);
  assert.equal(v.summary.failed, 1);
});

test("NEGATIVE: the same violation at forbidden is still a failure that decides the status", () => {
  const v = verdictAt(RULE, "forbidden");
  assert.equal(resultOf(v, RULE).status, "failed");
  assert.equal(v.status, STATUS.NON_COMPLIANT);
});

test("NEGATIVE: a catalogued-recommended rule warns at recommended and fails at required", () => {
  assert.equal(resultOf(verdictAt(OTHER, "recommended"), OTHER).status, "warning");
  assert.equal(resultOf(verdictAt(OTHER, "required"), OTHER).status, "failed");
});

test("an optional rule with no violation is unchanged: passed, evaluated", () => {
  const r = resultOf(verdictAt(RULE, "optional", false), RULE);
  assert.equal(r.status, "passed");
  assert.equal(r.disposition, "evaluated");
});

test("an optional rule nobody examined is still not-evaluated, not silently passed", () => {
  const v = evaluate({
    catalog,
    policy: clean({ [RULE]: { level: "optional" } }),
    findings: violation(RULE),
    evaluated: ALL.filter((id) => id !== RULE),
    today: TODAY,
  });
  const r = resultOf(v, RULE);
  assert.equal(r.status, "skipped");
  assert.equal(r.disposition, "not-evaluated");
});

test("UNCHANGED: an active exception on an optional rule is still honoured as an exception", () => {
  const ex = [{ rule: RULE, reason: "waived", approvedBy: "owner", approvedAt: "2026-01-01" }];
  const r = resultOf(verdictAt(RULE, "optional", true, ex), RULE);
  assert.equal(r.disposition, "excepted");
  assert.equal(r.exception.reason, "waived");
});

// --- the CLI: JSON, text and exit code -----------------------------------------------------------

const policyText = (level) =>
  ['standardVersion: "2.0.0"', 'project: "Optional silent specimen"', "rules:", `  ${RULE}:`, `    level: ${level}`, ""].join("\n");

/** One source file; `referenced` decides whether anything names it, so the orphan is the only variable. */
async function specimen(level, referenced) {
  const root = await mkdtemp(path.join(os.tmpdir(), "optional-silent-"));
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(path.join(root, "README.md"), `# Specimen\n\n${"substantive prose ".repeat(60)}\n`);
  await writeFile(path.join(root, "project-policy.yml"), policyText(level));
  await writeFile(path.join(root, "src", "widgetrenderer.js"), "// other\nexport function render() { return 1; }\n");
  await writeFile(
    path.join(root, "src", "other.js"),
    referenced ? "// widgetrenderer\nexport const x = 1;\n" : "export const x = 1;\n",
  );
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "specimen");
  return root;
}

function cli(args, root) {
  const r = spawnSync(process.execPath, [CLI, ...args, `--dir=${root}`, `--max-total-read-bytes=${AMPLE}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  return r;
}

async function observe(level, referenced) {
  const root = await specimen(level, referenced);
  try {
    const j = cli(["validate", "--json"], root);
    const json = JSON.parse(j.stdout);
    const t = cli(["validate"], root);
    const a = cli(["audit", "--strict"], root);
    return { json, jsonExit: j.status, text: t.stdout, textExit: t.status, auditStrictExit: a.status };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const ruleResult = (o) => o.json.results.find((r) => r.ruleId === RULE);
const totals = (text) => text.split("\n").filter((l) => /^\s+(Rules|Cover|Status|Score):/.test(l));
const orphansOf = (o) => o.json.findings.filter((f) => f.rule === RULE).flatMap((f) => f.evidence ?? []);

test("CLI: an optional orphan changes nothing a reader or a CI gate can see", async () => {
  const orphan = await observe("optional", false);
  const clear = await observe("optional", true);
  // Preconditions: the orphan really is established as evidence, or the comparison is vacuous.
  assert.ok(orphansOf(orphan).includes("src/widgetrenderer.js"), "precondition: the specimen orphan was not established");
  assert.equal(orphansOf(clear).length, 0, "precondition: the control still has an orphan");

  const r = ruleResult(orphan);
  assert.equal(r.status, "passed");
  assert.deepEqual(orphan.json.summary, clear.json.summary, "JSON summary differs");
  assert.equal(orphan.json.status, clear.json.status, "aggregate status differs");
  assert.equal(orphan.json.score, clear.json.score);
  assert.deepEqual(orphan.json.assurance, clear.json.assurance);
  assert.equal(orphan.jsonExit, clear.jsonExit, "exit code differs");
  assert.equal(orphan.textExit, clear.textExit);
  assert.deepEqual(totals(orphan.text), totals(clear.text), "text totals differ");
  assert.ok(totals(orphan.text).length >= 3, "precondition: the totals lines were not found in the text");
  assert.ok(!orphan.text.includes(RULE), "the text verdict names an optional rule's violation");
  assert.equal(orphan.auditStrictExit, clear.auditStrictExit, "audit --strict exit differs");
});

test("CLI NEGATIVE: the same orphan at recommended is a warning that appears in JSON and text totals", async () => {
  const orphan = await observe("recommended", false);
  const clear = await observe("recommended", true);
  assert.equal(ruleResult(orphan).status, "warning");
  assert.equal(orphan.json.summary.warnings, clear.json.summary.warnings + 1);
  assert.notDeepEqual(totals(orphan.text), totals(clear.text));
  assert.equal(orphan.jsonExit, clear.jsonExit, "a warning must not change the exit code");
});

test("CLI NEGATIVE: the same orphan at required fails, is named in the text, and shows in the totals", async () => {
  const orphan = await observe("required", false);
  const clear = await observe("required", true);
  assert.equal(ruleResult(orphan).status, "failed");
  assert.equal(orphan.json.summary.failed, clear.json.summary.failed + 1);
  assert.equal(orphan.json.status, "NON_COMPLIANT");
  assert.equal(orphan.jsonExit, 1);
  assert.ok(orphan.text.includes(`${RULE} [required]`), "the failing rule is not named in the text");
});

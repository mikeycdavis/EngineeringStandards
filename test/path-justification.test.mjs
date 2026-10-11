/**
 * Path-scoped justifications ([ADR 0016](../artifacts/adr/0016-path-scoped-justification-is-not-an-exception.md)).
 *
 * The motivating shape: four tracked files under `examples/` are frozen, digest-locked copies, each
 * carrying an empty catch block. A rule-wide exception would also waive the rule for every other
 * file. These tests hold the narrower instrument to its three obligations:
 *
 *   1. It suppresses exactly one rule at exactly the listed paths — and nothing else, in either
 *      direction (an unlisted file in the same directory still fails; a listed file still fails every
 *      OTHER rule).
 *   2. It cannot be widened by how it is written: no pattern, directory, absolute path, traversal,
 *      non-canonical form, untracked file, or rule outside the engine's allowlist.
 *   3. It is never silent: the subtraction is in the report, and one that is no longer needed is a
 *      visible warning.
 *
 * These drive the real CLI over real temporary repositories, and real Git for the tracked-ness
 * question, because the property under test is a verdict, not a function's return value.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPolicy } from "../scripts/policy.mjs";
import { pathFormProblem, JUSTIFIABLE_RULES } from "../scripts/justifications.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "scripts/standards.mjs");
const SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");
const RULE = "errors.no-swallowed-exceptions";
const TODAY = "2026-10-11";

const VERSION = (await readFile(path.join(ROOT, "VERSION"), "utf8")).trim();

const FOUR = [
  "examples/alpha/one.mjs",
  "examples/alpha/two.mjs",
  "examples/beta/three.mjs",
  "examples/beta/four.mjs",
];
const EMPTY_CATCH = "export function f() {\n  try {\n    g();\n  } catch (error) {}\n}\n";
const CLEAN = "export const ok = 1;\n";

const entry = (p, over = {}) => ({
  rule: RULE,
  path: p,
  reason: "Frozen evaluated copy; its bytes are digest-locked.",
  approvedBy: "project-owner",
  approvedAt: "2026-10-11",
  reference: "ADR-0016 / owner decision",
  removeWhen: "The frozen copy is regenerated or deleted.",
  ...over,
});

/** A JSON string is a valid YAML double-quoted scalar, so entries serialise without a YAML library. */
function policyYaml(entries) {
  const lines = [`standardVersion: ${JSON.stringify(VERSION)}`, `project: "path-justification-fixture"`];
  if (entries.length > 0) {
    lines.push("justifications:");
    for (const e of entries) {
      const keys = Object.keys(e);
      keys.forEach((key, i) => {
        lines.push(`${i === 0 ? "  - " : "    "}${key}: ${JSON.stringify(e[key])}`);
      });
    }
  }
  return lines.join("\n") + "\n";
}

const git = (cwd, ...args) => {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
};

/**
 * Build a repository. `files` maps path -> content; `entries` are the justifications; `useGit`
 * false leaves a plain directory. `untracked` files are written but never added.
 */
async function build({ files, entries = [], useGit = true, untracked = {} }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "path-justification-"));
  const all = { ...files, "project-policy.yml": policyYaml(entries) };
  for (const [rel, content] of Object.entries(all)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), content);
  }
  if (useGit) {
    git(dir, "init", "-q");
    git(dir, "config", "user.email", "test@example.invalid");
    git(dir, "config", "user.name", "Test");
    git(dir, "config", "commit.gpgsign", "false");
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "fixture");
  }
  for (const [rel, content] of Object.entries(untracked)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), content);
  }
  return dir;
}

function validate(dir) {
  const r = spawnSync(process.execPath, [CLI, "validate", dir, "--json"], { encoding: "utf8", windowsHide: true });
  let json = null;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = null;
  }
  return { code: r.status, json, stdout: r.stdout, stderr: r.stderr };
}

const result = (json, ruleId) => json.results.find((r) => r.ruleId === ruleId);
const fourFiles = () => Object.fromEntries(FOUR.map((p) => [p, EMPTY_CATCH]));
const cleanup = (dir) => rm(dir, { recursive: true, force: true });

async function withRepo(options, body) {
  const dir = await build(options);
  try {
    return await body(dir);
  } finally {
    await cleanup(dir);
  }
}

// --- The four exact pairs ----------------------------------------------------------------------

test("without justifications, all four frozen files fail the rule (the known-positive)", async () => {
  await withRepo({ files: { ...fourFiles(), "src/ok.mjs": CLEAN } }, (dir) => {
    const { json } = validate(dir);
    const r = result(json, RULE);
    assert.equal(r.status, "failed");
    assert.deepEqual([...r.evidence].sort(), [...FOUR].sort());
  });
});

test("the four exact path/rule pairs pass the rule, and the subtraction is reported", async () => {
  await withRepo({ files: fourFiles(), entries: FOUR.map((p) => entry(p)) }, (dir) => {
    const { json } = validate(dir);
    const r = result(json, RULE);
    assert.equal(r.status, "passed", JSON.stringify(r));
    assert.deepEqual(r.justified.map((j) => j.path).sort(), [...FOUR].sort());
    for (const j of r.justified) {
      assert.ok(j.reason && j.reference && j.approvedBy && j.approvedAt && j.removeWhen, "provenance missing");
    }
    assert.match(r.message, /justified by project-policy\.yml/);
    assert.equal(json.justifications.trackedBasis, "git-index");
    assert.equal(json.justifications.applied.length, 4);
    assert.deepEqual(json.justifications.stale, []);
    assert.ok(!json.findings.some((f) => f.rule === RULE), "a justified path must not remain a finding");
  });
});

test("the human report names every justified path, so the pass is never silent", async () => {
  await withRepo({ files: fourFiles(), entries: FOUR.map((p) => entry(p)) }, (dir) => {
    const r = spawnSync(process.execPath, [CLI, "validate", dir], { encoding: "utf8", windowsHide: true });
    for (const p of FOUR) assert.ok(r.stdout.includes(p), `${p} not named in the report`);
    assert.match(r.stdout, /Justified \(path-scoped, git-index\)/);
  });
});

// --- Scope: nothing outside the listed pairs is affected ---------------------------------------

test("the same rule still fails on an unlisted fifth file, and lists only that file", async () => {
  const files = { ...fourFiles(), "examples/beta/five.mjs": EMPTY_CATCH };
  await withRepo({ files, entries: FOUR.map((p) => entry(p)) }, (dir) => {
    const { json } = validate(dir);
    const r = result(json, RULE);
    assert.equal(r.status, "failed");
    assert.deepEqual(r.evidence, ["examples/beta/five.mjs"]);
    assert.equal(r.justified.length, 4, "the justified paths stay visible beside the failure");
    assert.ok(!r.evidence.some((p) => FOUR.includes(p)));
  });
});

test("another rule still fails on a listed file: a credential-shaped value is still found", async () => {
  // Built at runtime so this file is not itself a credential-shaped literal.
  const credential = "AKIA" + "ABCDEFGHIJKLMNOP";
  const files = {
    ...fourFiles(),
    "examples/alpha/one.mjs": `${EMPTY_CATCH}export const k = "${credential}";\n`,
  };
  await withRepo({ files, entries: FOUR.map((p) => entry(p)) }, (dir) => {
    const { json } = validate(dir);
    assert.equal(result(json, RULE).status, "passed");
    const secrets = result(json, "security.no-secrets-in-artifacts");
    assert.equal(secrets.status, "failed");
    assert.ok(
      secrets.evidence.some((e) => e.startsWith("examples/alpha/one.mjs")),
      `the listed file was not inspected by the secrets rule: ${JSON.stringify(secrets.evidence)}`,
    );
  });
});

test("another rule still fails on a listed file: certificate bypass is still found", async () => {
  const files = {
    ...fourFiles(),
    "examples/beta/four.mjs": `${EMPTY_CATCH}export const o = { rejectUnauthorized: false };\n`,
  };
  await withRepo({ files, entries: FOUR.map((p) => entry(p)) }, (dir) => {
    const { json } = validate(dir);
    assert.equal(result(json, RULE).status, "passed");
    const bypass = result(json, "security.no-cert-bypass");
    assert.equal(bypass.status, "failed");
    assert.ok(bypass.evidence.includes("examples/beta/four.mjs"));
  });
});

test("a listed path does not suppress an unlisted rule on a path that is justified for another", async () => {
  // The justification names the swallowed-exception rule only. The same file also violates the
  // certificate rule, and no entry names that rule: it must be reported exactly as without the policy.
  const file = `${EMPTY_CATCH}export const o = { rejectUnauthorized: false };\n`;
  const files = { "examples/only.mjs": file };
  await withRepo({ files, entries: [entry("examples/only.mjs")] }, (dir) => {
    const withJust = validate(dir).json;
    assert.equal(result(withJust, RULE).status, "passed");
    const bare = result(withJust, "security.no-cert-bypass");
    assert.equal(bare.status, "failed");
    assert.deepEqual(bare.evidence, ["examples/only.mjs"]);
    assert.equal(bare.justified, undefined, "an unrelated rule must carry no justification");
  });
});

test("removing any one justification makes that file fail again", async () => {
  for (const omitted of FOUR) {
    const kept = FOUR.filter((p) => p !== omitted);
    await withRepo({ files: fourFiles(), entries: kept.map((p) => entry(p)) }, (dir) => {
      const r = result(validate(dir).json, RULE);
      assert.equal(r.status, "failed", `omitting ${omitted} did not fail the rule`);
      assert.deepEqual(r.evidence, [omitted]);
    });
  }
});

test("a justification in one directory does not reach a sibling file in it", async () => {
  const files = { "examples/alpha/one.mjs": EMPTY_CATCH, "examples/alpha/sibling.mjs": EMPTY_CATCH };
  await withRepo({ files, entries: [entry("examples/alpha/one.mjs")] }, (dir) => {
    const r = result(validate(dir).json, RULE);
    assert.equal(r.status, "failed");
    assert.deepEqual(r.evidence, ["examples/alpha/sibling.mjs"]);
  });
});

// --- Determinism ------------------------------------------------------------------------------

test("entry order does not change the report", async () => {
  const forward = FOUR.map((p) => entry(p));
  const reversed = [...forward].reverse();
  const run = async (entries) =>
    withRepo({ files: { ...fourFiles(), "examples/beta/five.mjs": EMPTY_CATCH }, entries }, (dir) => {
      const { json } = validate(dir);
      return JSON.stringify({ results: json.results, justifications: json.justifications, findings: json.findings });
    });
  assert.equal(await run(forward), await run(reversed));
});

// --- Rejections: policy validation -------------------------------------------------------------

/** One entry per mistake, each with the distinct code it must be rejected under. */
const REJECTIONS = [
  ["wildcard star", { path: "examples/alpha/*.mjs" }, "path-wildcard"],
  ["wildcard question mark", { path: "examples/alpha/on?.mjs" }, "path-wildcard"],
  ["wildcard brace", { path: "examples/{alpha,beta}/one.mjs" }, "path-wildcard"],
  ["wildcard bracket", { path: "examples/alpha/[o]ne.mjs" }, "path-wildcard"],
  ["broad directory glob", { path: "examples/*" }, "path-wildcard"],
  ["directory with trailing slash", { path: "examples/" }, "path-directory"],
  ["directory without trailing slash", { path: "examples/alpha" }, "path-directory"],
  ["traversal", { path: "examples/../src/ok.mjs" }, "path-traversal"],
  ["absolute", { path: "/etc/passwd" }, "path-absolute"],
  ["drive letter", { path: "C:/work/one.mjs" }, "path-drive-letter"],
  ["UNC", { path: "//server/share/one.mjs" }, "path-unc"],
  ["backslash", { path: "examples\\alpha\\one.mjs" }, "path-backslash"],
  ["dot-slash prefix", { path: "./examples/alpha/one.mjs" }, "path-non-canonical"],
  ["double slash", { path: "examples//alpha/one.mjs" }, "path-non-canonical"],
  ["dot segment", { path: "examples/./alpha/one.mjs" }, "path-non-canonical"],
  ["surrounding whitespace", { path: " examples/alpha/one.mjs" }, "path-non-canonical"],
  ["nonexistent", { path: "examples/alpha/missing.mjs" }, "path-nonexistent"],
  ["untracked", { path: "examples/alpha/loose.mjs" }, "path-untracked"],
  ["unknown rule", { rule: "errors.no-such-rule" }, "rule-unknown"],
  ["non-allowlisted rule", { rule: "security.no-cert-bypass" }, "rule-not-justifiable"],
  ["non-exemptible rule", { rule: "ai.no-safety-bypass" }, "rule-non-exemptible"],
  ["empty reason", { reason: "   " }, "empty-reason"],
  ["empty approvedBy", { approvedBy: " " }, "empty-approvedBy"],
  ["empty reference", { reference: " " }, "empty-reference"],
  ["empty removeWhen", { removeWhen: " " }, "empty-removeWhen"],
  ["impossible date", { approvedAt: "2026-13-45" }, "approved-at-invalid"],
];

async function rejectionRepo(entries) {
  return build({
    files: { "examples/alpha/one.mjs": EMPTY_CATCH, "src/ok.mjs": CLEAN },
    entries,
    untracked: { "examples/alpha/loose.mjs": EMPTY_CATCH },
  });
}

for (const [name, over, code] of REJECTIONS) {
  test(`policy validation rejects: ${name} [${code}]`, async () => {
    const dir = await rejectionRepo([entry("examples/alpha/one.mjs", over)]);
    try {
      const r = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, TODAY, { root: dir });
      assert.equal(r.status, "invalid", `${name} was accepted`);
      const codes = r.justifications.problems.map((p) => p.code);
      assert.ok(codes.includes(code), `expected ${code}, got ${JSON.stringify(codes)}`);
      assert.ok(
        r.errors.some((e) => e.message.includes(`[${code}]`)),
        "the code must appear in the error a human reads",
      );
    } finally {
      await cleanup(dir);
    }
  });
}

test("a duplicate (rule, path) pair is rejected", async () => {
  const dir = await rejectionRepo([entry("examples/alpha/one.mjs"), entry("examples/alpha/one.mjs", { reason: "again" })]);
  try {
    const r = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, TODAY, { root: dir });
    assert.equal(r.status, "invalid");
    assert.deepEqual(
      r.justifications.problems.map((p) => [p.index, p.code]),
      [[1, "duplicate"]],
    );
  } finally {
    await cleanup(dir);
  }
});

test("a well-formed, tracked, allowlisted justification validates", async () => {
  const dir = await rejectionRepo([entry("examples/alpha/one.mjs")]);
  try {
    const r = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, TODAY, { root: dir });
    assert.equal(r.status, "ok", JSON.stringify(r.errors));
    assert.equal(r.justifications.trackedBasis, "git-index");
  } finally {
    await cleanup(dir);
  }
});

test("a broad exemption is impossible: no directory or pattern form is accepted", async () => {
  for (const broad of ["examples", "examples/", "examples/*", "examples/**", "**/*.mjs", "*", ".", "./", "/"]) {
    const dir = await rejectionRepo([entry(broad)]);
    try {
      const r = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, TODAY, { root: dir });
      assert.equal(r.status, "invalid", `'${broad}' was accepted as a justification path`);
    } finally {
      await cleanup(dir);
    }
  }
});

// --- Rejections reach the verdict: exit 2, nothing partially applied ---------------------------

test("an invalid justification is a configuration error: exit 2, NOT_EVALUATED, none applied", async () => {
  const entries = [entry("examples/alpha/one.mjs"), entry("examples/alpha/*.mjs")];
  const files = { "examples/alpha/one.mjs": EMPTY_CATCH };
  await withRepo({ files, entries }, (dir) => {
    const { code, json, stdout } = validate(dir);
    assert.equal(code, 2, stdout);
    assert.equal(json.status, "NOT_EVALUATED");
    assert.deepEqual(json.justifications.applied, [], "a half-valid list must not be partially applied");
    assert.ok(json.justifications.problems.some((p) => p.code === "path-wildcard"));
  });
});

test("an untracked file is rejected by validate, not silently honoured", async () => {
  const entries = [entry("examples/alpha/loose.mjs")];
  const files = { "examples/alpha/one.mjs": CLEAN };
  await withRepo({ files, entries, untracked: { "examples/alpha/loose.mjs": EMPTY_CATCH } }, (dir) => {
    const { code, json } = validate(dir);
    assert.equal(code, 2);
    assert.ok(json.justifications.problems.some((p) => p.code === "path-untracked"));
  });
});

// --- Schema ------------------------------------------------------------------------------------

test("schema: unknown keys in a justification entry are rejected", async () => {
  const dir = await build({
    files: { "examples/alpha/one.mjs": EMPTY_CATCH },
    entries: [entry("examples/alpha/one.mjs", { severity: "low" })],
  });
  try {
    const r = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, TODAY, { root: dir });
    assert.equal(r.status, "invalid");
    assert.ok(
      r.errors.some((e) => e.path === "justifications[0].severity"),
      JSON.stringify(r.errors),
    );
  } finally {
    await cleanup(dir);
  }
});

test("schema: every field of a justification is required", async () => {
  for (const missing of ["rule", "path", "reason", "approvedBy", "approvedAt", "reference", "removeWhen"]) {
    const e = entry("examples/alpha/one.mjs");
    delete e[missing];
    const dir = await build({ files: { "examples/alpha/one.mjs": EMPTY_CATCH }, entries: [e] });
    try {
      const r = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, TODAY, { root: dir });
      assert.equal(r.status, "invalid", `a justification without ${missing} was accepted`);
      assert.ok(r.errors.some((x) => x.path === `justifications[0].${missing}`), JSON.stringify(r.errors));
    } finally {
      await cleanup(dir);
    }
  }
});

// --- Staleness: visible, never silent ----------------------------------------------------------

test("a justification for a path with no violation is a visible stale warning", async () => {
  const files = { "examples/alpha/one.mjs": EMPTY_CATCH, "examples/alpha/clean.mjs": CLEAN };
  const entries = [entry("examples/alpha/one.mjs"), entry("examples/alpha/clean.mjs")];
  await withRepo({ files, entries }, (dir) => {
    const { json } = validate(dir);
    assert.equal(result(json, RULE).status, "passed");
    assert.deepEqual(json.justifications.stale.map((s) => s.path), ["examples/alpha/clean.mjs"]);
    const warning = json.findings.find((f) => f.id === "stale-justification");
    assert.ok(warning, "stale justification was silent");
    assert.equal(warning.severity, "warning");
    assert.deepEqual(warning.evidence, ["examples/alpha/clean.mjs"]);
    assert.equal(warning.rule, null, "a stale warning must not count as a violation of the rule");
  });
});

test("a justification for a file the rule does not read is reported stale, not applied", async () => {
  const files = { "examples/data.json": "{}\n", "src/ok.mjs": CLEAN };
  await withRepo({ files, entries: [entry("examples/data.json")] }, (dir) => {
    const { json } = validate(dir);
    assert.equal(json.justifications.applied.length, 0);
    assert.equal(json.justifications.stale.length, 1);
  });
});

// --- Tracked-ness basis ------------------------------------------------------------------------

test("outside a git work tree the basis is the discovered file set, and it is stated", async () => {
  const files = { "examples/alpha/one.mjs": EMPTY_CATCH };
  await withRepo({ files, entries: [entry("examples/alpha/one.mjs")], useGit: false }, (dir) => {
    const { json } = validate(dir);
    assert.equal(json.justifications.trackedBasis, "discovered-file-set");
    assert.match(json.justifications.trackedNote, /not a git repository|git/i);
    assert.equal(result(json, RULE).status, "passed");
  });
});

test("outside a git work tree a missing file is still rejected", async () => {
  const files = { "examples/alpha/one.mjs": EMPTY_CATCH };
  await withRepo({ files, entries: [entry("examples/alpha/gone.mjs")], useGit: false }, (dir) => {
    const { code, json } = validate(dir);
    assert.equal(code, 2);
    assert.ok(json.justifications.problems.some((p) => p.code === "path-nonexistent"));
  });
});

// --- Form classifier, unit level ---------------------------------------------------------------

test("pathFormProblem: an exact canonical file path is the only accepted form", () => {
  assert.equal(pathFormProblem("examples/alpha/one.mjs"), null);
  assert.equal(pathFormProblem("one.mjs"), null);
  assert.equal(pathFormProblem("a/b-c/d_e.f.mjs"), null);
  for (const bad of ["", "a/", "./a", "a/../b", "/a", "C:\\a", "a\\b", "a/*", "a//b", "a/./b", "."]) {
    assert.notEqual(pathFormProblem(bad), null, `'${bad}' was accepted`);
  }
});

test("only errors.no-swallowed-exceptions is admitted today", () => {
  assert.deepEqual([...JUSTIFIABLE_RULES], [RULE]);
  assert.throws(() => JUSTIFIABLE_RULES.push("security.no-cert-bypass"), TypeError, "the allowlist must be frozen");
});

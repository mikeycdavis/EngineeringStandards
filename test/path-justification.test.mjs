/**
 * Path-scoped justifications ([ADR 0017](../artifacts/adr/0017-path-scoped-justification-is-not-an-exception.md)).
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
import { mkdtemp, mkdir, writeFile, rm, readFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPolicy } from "../scripts/policy.mjs";
import { pathFormProblem, JUSTIFIABLE_RULES } from "../scripts/justifications.mjs";
import { loadCatalog } from "../scripts/catalog.mjs";
import { evaluate } from "../scripts/compliance.mjs";

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
  reference: "ADR-0017 / owner decision",
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

/**
 * A rule whose every violating path is justified is EXCEPTED, never passed (ADR 0017): disposition
 * `excepted`, the rule's own failing status for its level, and the justified paths listed. The
 * verdict word for that is COMPLIANT_WITH_EXCEPTIONS, which is the existing exception vocabulary.
 */
function assertExcepted(r) {
  assert.equal(r.disposition, "excepted", JSON.stringify(r));
  assert.notEqual(r.status, "passed", "a justified rule must not read as passed");
  assert.ok(Array.isArray(r.justified) && r.justified.length > 0, "justified list missing");
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

test("the four exact path/rule pairs are excepted, not passed, and the subtraction is reported", async () => {
  await withRepo({ files: fourFiles(), entries: FOUR.map((p) => entry(p)) }, (dir) => {
    const { json } = validate(dir);
    const r = result(json, RULE);
    assertExcepted(r);
    assert.deepEqual(r.justified.map((j) => j.path).sort(), [...FOUR].sort());
    for (const j of r.justified) {
      assert.ok(j.reason && j.reference && j.approvedBy && j.approvedAt && j.removeWhen, "provenance missing");
    }
    assert.match(r.message, /path-scoped justification/);
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
    assertExcepted(result(json, RULE));
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
    assertExcepted(result(json, RULE));
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
    assertExcepted(result(withJust, RULE));
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
    assertExcepted(result(json, RULE));
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
    assertExcepted(result(json, RULE));
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

// --- Spellings that reach the same bytes by another name ---------------------------------------
//
// The standalone `policy` command has no git index to be exact for it, so its filesystem basis must
// itself be exact. Otherwise it reports a false green that the engine run then rejects.

async function policyCodes(entries, files, { useGit }) {
  const dir = await build({ files, entries, useGit });
  try {
    const r = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, TODAY, { root: dir });
    return { status: r.status, codes: (r.justifications?.problems ?? []).map((p) => p.code), r, dir };
  } finally {
    await cleanup(dir);
  }
}

const ONE = { "examples/alpha/one.mjs": EMPTY_CATCH };

test("a case variant is rejected on both the git and the filesystem basis", async () => {
  for (const useGit of [true, false]) {
    const { status, codes } = await policyCodes([entry("Examples/Alpha/ONE.mjs")], ONE, { useGit });
    assert.equal(status, "invalid", `case variant accepted (useGit=${useGit})`);
    assert.ok(
      codes.some((c) => ["path-not-exact", "path-nonexistent", "path-untracked"].includes(c)),
      JSON.stringify(codes),
    );
  }
});

test("a trailing dot is rejected (NTFS would otherwise resolve it to the file)", async () => {
  for (const useGit of [true, false]) {
    const { status } = await policyCodes([entry("examples/alpha/one.mjs.")], ONE, { useGit });
    assert.equal(status, "invalid", `trailing dot accepted (useGit=${useGit})`);
  }
});

test("an NTFS alternate data stream is rejected as a colon form", async () => {
  for (const p of ["examples/alpha/one.mjs::$DATA", "examples/alpha/one.mjs:stream"]) {
    const { status, codes } = await policyCodes([entry(p)], ONE, { useGit: false });
    assert.equal(status, "invalid");
    assert.deepEqual(codes, ["path-colon"]);
  }
});

test("a decomposed (NFD) spelling is rejected even when the composed (NFC) file exists", async () => {
  const nfc = "examples/café.mjs";
  const nfd = "examples/café.mjs";
  const accepted = await policyCodes([entry(nfc)], { [nfc]: EMPTY_CATCH }, { useGit: false });
  assert.equal(accepted.status, "ok", "the NFC spelling of an existing file must still be accepted");
  const rejected = await policyCodes([entry(nfd)], { [nfc]: EMPTY_CATCH }, { useGit: false });
  assert.equal(rejected.status, "invalid");
  assert.ok(rejected.codes.includes("path-non-canonical"), JSON.stringify(rejected.codes));
});

test("an over-long path is rejected before it reaches the filesystem", async () => {
  const long = `${"d/".repeat(600)}x.mjs`;
  const { status, codes } = await policyCodes([entry(long)], ONE, { useGit: false });
  assert.equal(status, "invalid");
  assert.deepEqual(codes, ["path-too-long"]);
  const wide = `examples/${"n".repeat(300)}.mjs`;
  assert.deepEqual((await policyCodes([entry(wide)], ONE, { useGit: false })).codes, ["path-too-long"]);
});

test("a path through a symlink or junction is rejected (skipped where one cannot be created)", async (t) => {
  const dir = await build({ files: ONE, entries: [entry("examples/link/one.mjs")], useGit: false });
  try {
    try {
      await symlink(path.join(dir, "examples/alpha"), path.join(dir, "examples/link"), "junction");
    } catch (error) {
      t.skip(`cannot create a directory link here: ${error.code}`);
      return;
    }
    const r = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, TODAY, { root: dir });
    assert.equal(r.status, "invalid");
    assert.ok(
      r.justifications.problems.some((p) => p.code === "path-symlink-in-path"),
      JSON.stringify(r.justifications.problems),
    );
  } finally {
    await cleanup(dir);
  }
});

// --- Evidence loss and the whole-file limit ----------------------------------------------------

test("truncation: justified files plus an unsearched tail give not-evaluated, never passed", async () => {
  // A clean file beyond the per-file read cap was only searched in part, so "nothing found" over it
  // is a statement about the run. Before the justification the rule failed (a violation was
  // confirmed); once every violating path is justified nothing confirms it, and the honest answer is
  // not-evaluated.
  const big = "export const x = 1;\n".repeat(25_000); // ~475 KB, over the 400,000-byte cap
  const files = { ...fourFiles(), "src/big.mjs": big };
  await withRepo({ files, entries: FOUR.map((p) => entry(p)) }, (dir) => {
    const { json } = validate(dir);
    const r = result(json, RULE);
    assert.notEqual(r.status, "passed", "a rule over an unsearched tail must not pass");
    assert.equal(r.status, "skipped");
    assert.equal(r.disposition, "not-evaluated");
    assert.equal(json.justifications.applied.length, 4, "the justifications themselves are still reported");
  });
});

test("known limit: a justification is whole-file, so a second empty catch in the same file stays suppressed", async () => {
  // Documented in ADR 0017. It is bound to a path, not to a digest or a site, which is why its stated
  // use is digest-locked copies whose bytes cannot change. This test pins the limit so widening or
  // narrowing it is a deliberate change rather than a surprise.
  const twice = `${EMPTY_CATCH}export function h() {\n  try {\n    g();\n  } catch (error) {}\n}\n`;
  await withRepo({ files: { "examples/alpha/one.mjs": twice }, entries: [entry("examples/alpha/one.mjs")] }, (dir) => {
    const { json } = validate(dir);
    assertExcepted(result(json, RULE));
    assert.equal(json.justifications.applied.length, 1);
  });
});

// --- Partial reads, the evidence cap, and mixed outcomes ---------------------------------------

test("a justified file read only to the cap is unverified, not stale, and the rule is not-evaluated", async () => {
  // The catch sits after the 400,000-byte prefix, so the run never saw it. "No violation in the
  // prefix" must not be read as "the justification is unneeded": telling the owner to remove it would
  // be advice built on evidence nobody has.
  const prefix = "export const x = 1;\n".repeat(21_000); // 420,000 bytes
  const files = { "examples/tail.mjs": prefix + EMPTY_CATCH };
  await withRepo({ files, entries: [entry("examples/tail.mjs")] }, (dir) => {
    const { json } = validate(dir);
    assert.deepEqual(json.justifications.unverified.map((u) => u.path), ["examples/tail.mjs"]);
    assert.deepEqual(json.justifications.stale, []);
    assert.ok(!json.findings.some((f) => f.id === "stale-justification"), "a removal warning was emitted");
    const r = result(json, RULE);
    assert.equal(r.status, "skipped");
    assert.equal(r.disposition, "not-evaluated");
  });
});

test("more violators than the evidence cap: a justified one beyond the cap is still subtracted", async () => {
  const names = Array.from({ length: 15 }, (_, i) => `examples/v${String(i).padStart(2, "0")}.mjs`);
  const files = Object.fromEntries(names.map((p) => [p, EMPTY_CATCH]));

  // Sorted evidence lists v00..v11 under the cap of 12; v14 is past it and so is not in `evidence`.
  await withRepo({ files, entries: [entry(names[14])] }, (dir) => {
    const { json } = validate(dir);
    const r = result(json, RULE);
    assert.equal(r.status, "failed");
    assert.match(r.message, /^14 file\(s\)/, r.message);
    assert.equal(json.justifications.applied.length, 1);
    assert.ok(!r.evidence.includes(names[14]));
    assert.equal(r.justified.length, 1);
  });

  // Two justified, both past the cap: the count is exact, and the rule still fails on the other 13.
  await withRepo({ files, entries: [entry(names[13]), entry(names[14])] }, (dir) => {
    const r = result(validate(dir).json, RULE);
    assert.equal(r.status, "failed");
    assert.match(r.message, /^13 file\(s\)/, r.message);
    assert.equal(r.justified.length, 2);
  });

  // All fifteen justified: passes, and all fifteen are reported.
  await withRepo({ files, entries: names.map((p) => entry(p)) }, (dir) => {
    const { json } = validate(dir);
    assertExcepted(result(json, RULE));
    assert.equal(json.justifications.applied.length, 15);
  });
});

test("justified violators, one unjustified violator and an unread justified file stay failed", async () => {
  // Total read budget sized to hold exactly the first three files, so the fourth is collected and
  // never opened. The confirmed violation must survive the loss, and the unread justified file must
  // be reported as unverified rather than applied or stale.
  const size = Buffer.byteLength(EMPTY_CATCH);
  const files = {
    "a1.mjs": EMPTY_CATCH,
    "a2.mjs": EMPTY_CATCH,
    "b-unjustified.mjs": EMPTY_CATCH,
    "c-unread.mjs": EMPTY_CATCH,
  };
  const entries = [entry("a1.mjs"), entry("a2.mjs"), entry("c-unread.mjs")];
  await withRepo({ files, entries }, (dir) => {
    const r0 = spawnSync(
      process.execPath,
      [CLI, "validate", dir, "--json", `--max-total-read-bytes=${size * 3 + 4}`],
      { encoding: "utf8", windowsHide: true },
    );
    const json = JSON.parse(r0.stdout);
    const r = result(json, RULE);
    assert.equal(r.status, "failed", JSON.stringify(r));
    assert.deepEqual(r.evidence, ["b-unjustified.mjs"]);
    assert.deepEqual(json.justifications.applied.map((j) => j.path), ["a1.mjs", "a2.mjs"]);
    assert.deepEqual(json.justifications.unverified.map((j) => j.path), ["c-unread.mjs"]);
    assert.deepEqual(json.justifications.stale, []);
  });
});

test("stale reasons differ: an examined clean file versus a file the rule does not read", async () => {
  const files = { "src/clean.mjs": CLEAN, "src/data.json": "{}\n", "src/v.mjs": EMPTY_CATCH };
  const entries = [entry("src/clean.mjs"), entry("src/data.json"), entry("src/v.mjs")];
  await withRepo({ files, entries }, (dir) => {
    const { json } = validate(dir);
    const byPath = Object.fromEntries(json.justifications.stale.map((s) => [s.path, s.why]));
    assert.match(byPath["src/clean.mjs"], /no violation of this rule was observed/);
    assert.match(byPath["src/data.json"], /did not examine the path/);
    assert.equal(Object.keys(byPath).length, 2, "the genuinely violating file must not be stale");
    assert.equal(json.findings.filter((f) => f.id === "stale-justification").length, 2);
  });
});

// --- The standalone command is not authoritative outside git ----------------------------------

test("standalone policy says tracked-ness is not established outside a git work tree", async () => {
  await withRepo({ files: ONE, entries: [entry("examples/alpha/one.mjs")], useGit: false }, async (dir) => {
    const r = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, TODAY, { root: dir });
    assert.equal(r.status, "ok");
    assert.equal(r.justifications.trackedBasis, "filesystem");
    assert.match(r.justifications.trackedNote, /NOT established/);
    assert.match(r.justifications.trackedNote, /only 'standards validate' is authoritative/);

    const cli = spawnSync(
      process.execPath,
      [path.join(ROOT, "scripts/policy.mjs"), path.join(dir, "project-policy.yml"), "--root", dir],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.match(cli.stdout, /NOTE justifications: tracked-ness was not established/);
  });
});

test("standalone policy inside a git work tree carries no such caveat", async () => {
  await withRepo({ files: ONE, entries: [entry("examples/alpha/one.mjs")] }, (dir) => {
    const cli = spawnSync(
      process.execPath,
      [path.join(ROOT, "scripts/policy.mjs"), path.join(dir, "project-policy.yml"), "--root", dir],
      { encoding: "utf8", windowsHide: true },
    );
    assert.equal(cli.status, 0, cli.stderr);
    assert.doesNotMatch(cli.stdout, /tracked-ness was not established/);
  });
});

// --- Status and verdict vocabulary: EXCEPTED, never PASSED -------------------------------------
//
// ADR 0017. A rule whose every violating path is justified reuses the existing exception contract:
// disposition `excepted`, and the verdict COMPLIANT_WITH_EXCEPTIONS that `summarise()` already
// computes. These tests pin each aggregate verdict, the exit code, and the output shapes.

const catalog = await loadCatalog();
const OTHER_RULES = [...catalog.rules.keys()].filter((id) => id !== RULE);

/** Every rule but RULE (and any named exceptions) declared not-applicable, so the verdict depends on RULE alone. */
function isolatedPolicy(except = []) {
  return {
    standardVersion: VERSION,
    applicability: Object.fromEntries(
      OTHER_RULES.filter((id) => !except.includes(id)).map((id) => [id, { status: "not-applicable", reason: "fixture" }]),
    ),
  };
}

const violation = (...paths) => ({ rule: RULE, message: "x", evidence: paths });
const justifiedEntry = (p, over = {}) => ({ ...entry(p), ...over });

function verdict({ findings = [], evaluated = [RULE], justified = [], expiredJustified = [], policy = isolatedPolicy() }) {
  return evaluate({ catalog, policy, findings, evaluated, today: TODAY, freshness: new Map(), justified, expiredJustified });
}

test("verdict: COMPLIANT only when the rule passes and nothing is justified", () => {
  const v = verdict({});
  assert.equal(v.status, "COMPLIANT");
  assert.equal(v.results.find((r) => r.ruleId === RULE).status, "passed");
});

test("verdict: COMPLIANT_WITH_EXCEPTIONS when every violating path is justified", () => {
  const v = verdict({ justified: [justifiedEntry("a.mjs"), justifiedEntry("b.mjs")] });
  assert.equal(v.status, "COMPLIANT_WITH_EXCEPTIONS");
  const r = v.results.find((x) => x.ruleId === RULE);
  assert.equal(r.disposition, "excepted");
  assert.notEqual(r.status, "passed");
  assert.deepEqual(r.justified.map((j) => j.path), ["a.mjs", "b.mjs"]);
  assert.equal(r.justified[0].approvedBy, "project-owner");
});

test("verdict: NON_COMPLIANT when any violating path remains unjustified", () => {
  const v = verdict({ findings: [violation("c.mjs")], justified: [justifiedEntry("a.mjs")] });
  assert.equal(v.status, "NON_COMPLIANT");
  const r = v.results.find((x) => x.ruleId === RULE);
  assert.equal(r.status, "failed");
  assert.notEqual(r.disposition, "excepted");
  assert.deepEqual(r.evidence, ["c.mjs"]);
  assert.equal(r.justified.length, 1);
});

test("verdict: NOT_EVALUATED when the applicable rule was not examined", () => {
  const v = verdict({ evaluated: [], justified: [justifiedEntry("a.mjs")] });
  assert.equal(v.status, "NOT_EVALUATED");
  assert.deepEqual(v.unestablishedProhibitions, [RULE]);
});

test("verdict: an expired justification is not applied and fails with a named result", () => {
  const lapsed = justifiedEntry("a.mjs", { expires: "2026-01-01" });
  const v = verdict({ findings: [violation("a.mjs")], expiredJustified: [lapsed] });
  assert.equal(v.status, "NON_COMPLIANT");
  const named = v.results.find((r) => r.disposition === "expired-justification");
  assert.ok(named, "the lapse must be a named result");
  assert.equal(named.status, "failed");
  assert.deepEqual(named.evidence, ["project-policy.yml", "a.mjs"]);
  const own = v.results.find((r) => r.ruleId === RULE && r.disposition !== "expired-justification");
  assert.equal(own.status, "failed");
});

test("NOT_EVALUATED outranks COMPLIANT_WITH_EXCEPTIONS (owner decision, ADR 0017)", () => {
  // Before ADR 0017 summarise() decided COMPLIANT_WITH_EXCEPTIONS first, so an exception hid an
  // unexamined prohibition in the verdict word. Failure still outranks both.
  const policy = isolatedPolicy(["security.no-cert-bypass"]);
  const v = verdict({ justified: [justifiedEntry("a.mjs")], policy });
  assert.equal(v.status, "NOT_EVALUATED");
  assert.deepEqual(v.unestablishedProhibitions, ["security.no-cert-bypass"]);
  const failing = verdict({ findings: [violation("c.mjs")], justified: [justifiedEntry("a.mjs")], policy });
  assert.equal(failing.status, "NON_COMPLIANT", "failure takes precedence over not-evaluated");
});

test("an existing exceptions[] entry is subject to the same precedence", () => {
  const policy = isolatedPolicy(["security.no-cert-bypass"]);
  policy.exceptions = [{ rule: RULE, reason: "r", approvedBy: "o", approvedAt: "2026-10-11" }];
  const v = verdict({ findings: [violation("a.mjs")], policy });
  assert.equal(v.results.find((r) => r.ruleId === RULE).disposition, "excepted");
  assert.equal(v.status, "NOT_EVALUATED");
});

test("EXCEPTED is stated on the result and in the human report, never PASSED", () => {
  const v = verdict({ justified: [justifiedEntry("a.mjs")] });
  const r = v.results.find((x) => x.ruleId === RULE);
  assert.equal(r.verdictLabel, "EXCEPTED");
  assert.equal(v.status, "COMPLIANT_WITH_EXCEPTIONS");
  assert.ok(!v.results.some((x) => x.status === "passed" && x.verdictLabel === "EXCEPTED"));
});

// The same contract through the real CLI, where only RULE is applicable.

function isolatedPolicyYaml(entries) {
  const lines = [`standardVersion: ${JSON.stringify(VERSION)}`, `project: "isolated"`, "applicability:"];
  for (const id of OTHER_RULES) {
    lines.push(`  ${id}:`, `    status: "not-applicable"`, `    reason: "fixture"`);
  }
  if (entries.length > 0) {
    lines.push("justifications:");
    for (const e of entries) {
      Object.keys(e).forEach((key, i) => lines.push(`${i === 0 ? "  - " : "    "}${key}: ${JSON.stringify(e[key])}`));
    }
  }
  return lines.join("\n") + "\n";
}

async function withIsolated({ files, entries = [] }, body) {
  const dir = await build({ files, entries });
  try {
    await writeFile(path.join(dir, "project-policy.yml"), isolatedPolicyYaml(entries));
    git(dir, "add", "-A");
    git(dir, "commit", "-q", "-m", "policy");
    return await body(dir);
  } finally {
    await cleanup(dir);
  }
}

test("CLI: clean file, no justification: COMPLIANT, exit 0", async () => {
  await withIsolated({ files: { "src/ok.mjs": CLEAN } }, (dir) => {
    const { code, json } = validate(dir);
    assert.equal(json.status, "COMPLIANT");
    assert.equal(code, 0);
    assert.equal(json.justifications.exceptionCount, 0);
  });
});

test("CLI: violation, no justification: NON_COMPLIANT, exit 1", async () => {
  await withIsolated({ files: { "examples/a.mjs": EMPTY_CATCH } }, (dir) => {
    const { code, json } = validate(dir);
    assert.equal(json.status, "NON_COMPLIANT");
    assert.equal(code, 1);
  });
});

test("CLI: every violating path justified: COMPLIANT_WITH_EXCEPTIONS, exit 0, complete JSON shape", async () => {
  const entries = [entry("examples/a.mjs", { expires: "2999-01-01" }), entry("examples/b.mjs")];
  const files = { "examples/a.mjs": EMPTY_CATCH, "examples/b.mjs": EMPTY_CATCH };
  await withIsolated({ files, entries }, (dir) => {
    const { code, json } = validate(dir);
    assert.equal(json.status, "COMPLIANT_WITH_EXCEPTIONS", JSON.stringify(json.results.filter((r) => r.status === "failed")));
    assert.equal(code, 0);
    assert.equal(result(json, RULE).disposition, "excepted");
    assert.equal(json.justifications.exceptionCount, 1);
    assert.equal(json.justifications.justificationCount, 2);
    assert.deepEqual(json.justifications.exceptedRules, [RULE]);
    const byPath = Object.fromEntries(json.justifications.applied.map((j) => [j.path, j]));
    assert.deepEqual(Object.keys(byPath).sort(), ["examples/a.mjs", "examples/b.mjs"]);
    for (const j of Object.values(byPath)) {
      for (const key of ["rule", "path", "reason", "reference", "approvedBy", "approvedAt", "removeWhen", "expires"]) {
        assert.ok(key in j, `${key} missing from the applied record`);
      }
    }
    assert.equal(byPath["examples/a.mjs"].expires, "2999-01-01");
    assert.equal(byPath["examples/b.mjs"].expires, null);
  });
});

test("CLI: the human report states the exception count, rule, path, reason, owner and expiry", async () => {
  const entries = [entry("examples/a.mjs", { expires: "2999-01-01" })];
  await withIsolated({ files: { "examples/a.mjs": EMPTY_CATCH }, entries }, (dir) => {
    const r = spawnSync(process.execPath, [CLI, "validate", dir], { encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stdout);
    assert.match(r.stdout, /Status: COMPLIANT_WITH_EXCEPTIONS/);
    assert.match(r.stdout, /Excepted: 1 rule\(s\) \(0 by exception, 1 by path justification\)/);
    assert.match(r.stdout, new RegExp(`${RULE} @ examples/a\\.mjs`));
    assert.match(r.stdout, /Frozen evaluated copy/);
    assert.match(r.stdout, /owner project-owner/);
    assert.match(r.stdout, /expires 2999-01-01/);
  });
});

test("CLI: an expired justification is not silent: the rule fails, exit 1, and the lapse is named", async () => {
  const entries = [entry("examples/a.mjs", { approvedAt: "2025-01-01", expires: "2026-01-01" })];
  await withIsolated({ files: { "examples/a.mjs": EMPTY_CATCH }, entries }, (dir) => {
    const { code, json } = validate(dir);
    assert.equal(json.status, "NON_COMPLIANT");
    assert.equal(code, 1);
    assert.equal(json.justifications.applied.length, 0);
    assert.deepEqual(json.justifications.expired.map((j) => j.path), ["examples/a.mjs"]);
    assert.ok(json.results.some((r) => r.disposition === "expired-justification"));
    const own = json.results.find((r) => r.ruleId === RULE && r.disposition !== "expired-justification");
    assert.equal(own.status, "failed");
    assert.deepEqual(own.evidence, ["examples/a.mjs"]);
  });
});

test("CLI: an expired justification whose path no longer violates is only a stale warning", async () => {
  const entries = [entry("src/ok.mjs", { approvedAt: "2025-01-01", expires: "2026-01-01" })];
  await withIsolated({ files: { "src/ok.mjs": CLEAN }, entries }, (dir) => {
    const { json } = validate(dir);
    assert.equal(json.status, "COMPLIANT");
    assert.equal(json.justifications.stale.length, 1);
    assert.match(json.justifications.stale[0].why, /expired on 2026-01-01/);
    assert.equal(json.justifications.expired.length, 0);
  });
});

test("CLI: a mismatched path leaves the real violation failing and the entry stale", async () => {
  const entries = [entry("examples/other.mjs")];
  const files = { "examples/a.mjs": EMPTY_CATCH, "examples/other.mjs": CLEAN };
  await withIsolated({ files, entries }, (dir) => {
    const { code, json } = validate(dir);
    assert.equal(json.status, "NON_COMPLIANT");
    assert.equal(code, 1);
    assert.deepEqual(result(json, RULE).evidence, ["examples/a.mjs"]);
    assert.deepEqual(json.justifications.stale.map((s) => s.path), ["examples/other.mjs"]);
  });
});

// --- expires: validation and the standalone command --------------------------------------------

test("expires must be a real date and may not precede approval", async () => {
  for (const [bad, code] of [
    ["2026-13-45", "expires-invalid"],
    ["2026-01-01", "expires-before-approval"],
  ]) {
    const { status, codes } = await policyCodes([entry("examples/alpha/one.mjs", { expires: bad })], ONE, { useGit: true });
    assert.equal(status, "invalid", bad);
    assert.ok(codes.includes(code), `${bad}: ${JSON.stringify(codes)}`);
  }
});

test("standalone policy reports an expired justification as a compliance finding", async () => {
  const dir = await build({ files: ONE, entries: [entry("examples/alpha/one.mjs", { approvedAt: "2026-10-01", expires: "2026-10-10" })] });
  try {
    const r = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, TODAY, { root: dir });
    assert.equal(r.status, "findings");
    assert.deepEqual(r.findings.map((f) => f.id), ["policy.expired-justification"]);
    const onDay = await checkPolicy(path.join(dir, "project-policy.yml"), SCHEMA, "2026-10-10", { root: dir });
    assert.equal(onDay.status, "ok", "an entry expiring today is still in force today");
  } finally {
    await cleanup(dir);
  }
});

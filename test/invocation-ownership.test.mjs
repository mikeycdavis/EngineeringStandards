/**
 * ADR 0014 — execution-specific mutable state is owned by an invocation.
 *
 * These are the falsifiers the decision rests on, not illustrations of it. Each one compares an
 * in-process run against a **fresh-process oracle** — a separate `node` invocation of the same
 * command — because a contaminated in-process run agrees with itself.
 *
 * Two rules govern how they are written, and both were learned the hard way:
 *
 * 1. **Never compare against a globally patched `process.stdout.write`.** Two concurrent runs
 *    interleave into one buffer, and a comparison against that buffer cannot tell independence from
 *    interleaving. Every assertion below reads `result.stdout` — the bytes that invocation itself
 *    rendered.
 * 2. **Output equality is not sufficient.** The negative control at the foot of this file restores
 *    the pre-refactor lifetime for one object and still passes every behavioural check. Only the
 *    identity assertion catches it. That is why the identity assertion exists and why it may not be
 *    removed as redundant.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { main } from "../scripts/standards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const CLI = path.join(ROOT, "scripts/standards.mjs");

// Two distinct targets. Same-root concurrency proves no shared cache; different-root proves no
// cross-target leakage. Fixtures rather than the repository itself, so the suite stays quick.
const A = path.join(HERE, "fixtures/compliant");
const B = path.join(HERE, "fixtures/never-clean");

/** Only `auditedAt` is normalised, by explicit allowlist. Stripping every volatile-looking field
 *  would normalise away exactly the contamination these tests exist to find. */
const norm = (text) => JSON.stringify(JSON.parse(text), (k, v) => (k === "auditedAt" ? "<volatile>" : v));

function freshProcess(args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
  return { stdout: r.stdout, exitCode: r.status };
}

/**
 * An in-process run writes its report to the real stdout, exactly as the CLI does, so this suite is
 * noisy. It is left noisy deliberately.
 *
 * Patching `process.stdout.write` to quieten it was tried and reverted: the test runner reports over
 * that same stream, so silencing it swallowed the runner's own results and turned twelve reported
 * tests into one. The assertions never read the stream in any case — every one of them reads
 * `result.stdout`, the bytes that invocation returned.
 */
const audit = (dir) => main(["audit", `--dir=${dir}`, "--json"]);
const oracleA = freshProcess(["audit", `--dir=${A}`, "--json"]);
const oracleB = freshProcess(["audit", `--dir=${B}`, "--json"]);

test("importing the module runs nothing", () => {
  // If importing performed the audit, this file could not have reached here without output, and the
  // oracles above would be comparing against a module that had already run.
  const r = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `await import(${JSON.stringify(pathToFileURL(CLI).href)});`],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout, "");
});

test("a sequential run does not inherit the previous target's state", async () => {
  await audit(A);
  const second = await audit(B);
  assert.equal(norm(second.stdout), norm(oracleB.stdout));

  await audit(B);
  const third = await audit(A);
  assert.equal(norm(third.stdout), norm(oracleA.stdout));
});

test("the same target twice produces the same result", async () => {
  const first = await audit(A);
  const second = await audit(A);
  assert.equal(norm(first.stdout), norm(second.stdout));
});

test("a failed run does not contaminate the next one", async () => {
  const missing = await main(["audit", `--dir=${path.join(HERE, "fixtures/does-not-exist")}`, "--json"]);
  assert.equal(missing.exitCode, 2);
  const after = await audit(B);
  assert.equal(norm(after.stdout), norm(oracleB.stdout));
});

test("concurrent runs over the same target are independent", async () => {
  const [first, second] = await Promise.all([audit(A), audit(A)]);
  assert.equal(norm(first.stdout), norm(oracleA.stdout));
  assert.equal(norm(second.stdout), norm(oracleA.stdout));
});

test("concurrent runs over different targets do not leak across", async () => {
  const [ra, rb] = await Promise.all([audit(A), audit(B)]);
  assert.equal(norm(ra.stdout), norm(oracleA.stdout));
  assert.equal(norm(rb.stdout), norm(oracleB.stdout));
});

test("no invocation-owned object is shared between two runs", async () => {
  const [first, second] = await Promise.all([audit(A), audit(A)]);
  // Equal CONTENT is expected and is not what is asserted. Shared IDENTITY is the defect: two
  // invocations holding one object cannot be independent however similar their output looks.
  assert.notEqual(first.run.findings, second.run.findings);
  assert.notEqual(first.run.sources, second.run.sources);
  assert.notEqual(first.surface.files, second.surface.files);
  assert.notEqual(first.surface.contents, second.surface.contents);
  assert.notEqual(first.surface.surfaceLoss, second.surface.surfaceLoss);
});

test("mutating a completed result cannot affect a later run", async () => {
  const completed = await audit(A);
  completed.run.sources.set("poison", { code: "x", structure: "x", comments: "" });
  completed.run.findings.push({ id: "poison" });
  completed.surface.files.push("poison");

  const after = await audit(A);
  assert.equal(norm(after.stdout), norm(oracleA.stdout));
});

test("the rendered bytes match a fresh process, timestamp aside", async () => {
  // Stronger than the JSON comparisons above: those tolerate any reordering that survives
  // re-serialisation, this compares the emitted text itself. The timestamp is the one line that
  // legitimately differs between two runs, so it is blanked rather than the whole value normalised.
  const blank = (s) => s.replace(/"auditedAt": "[^"]*"/, '"auditedAt": ""');
  for (const [dir, oracle] of [[A, oracleA], [B, oracleB]]) {
    const inProcess = await audit(dir);
    assert.equal(blank(inProcess.stdout), blank(oracle.stdout));
  }
});

test("the three exit codes survive the refactor", () => {
  assert.equal(freshProcess(["audit", `--dir=${A}`, "--json"]).exitCode, 0);
  assert.equal(freshProcess(["validate", `--dir=${ROOT}`, "--json"]).exitCode, 1);
  assert.equal(freshProcess(["nonsense"]).exitCode, 2);
});

test("only the CLI boundary terminates the process", () => {
  const src = readFileSync(CLI, "utf8");
  const marker = "if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {";
  const boundary = src.indexOf(marker);
  assert.ok(boundary > 0, "the CLI boundary must be recognisable for this check to mean anything");

  // Comments are excluded: this file discusses `process.exit` at length, and a check that could not
  // tell discussion from use would be the very mention-versus-use defect the detectors exist to
  // avoid.
  const above = src
    .slice(0, boundary)
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
    .join("\n");
  const hits = [...above.matchAll(/process\.(exit|exitCode)\b/g)];
  assert.deepEqual(hits.map((h) => h[0]), [], "no helper below the CLI boundary may terminate the process");
});

/**
 * The negative control, and the reason the identity assertion is not redundant.
 *
 * A copy of the evaluator is patched so one object — the source cache — regains its pre-refactor
 * lifetime: created once at module scope and reused by every invocation. That is the exact defect
 * ADR 0014 removes.
 *
 * The measured result, which is the point: the patched module still produces correct output for
 * both targets, so every behavioural check above passes against it. Only the identity assertion
 * fails. A suite that tested output alone would have reported this defect as absent.
 */
test("the identity assertion detects a shared cache that output comparison cannot", async () => {
  const src = readFileSync(CLI, "utf8");
  const anchor = "  const findings = [];\n  const sources = new Map();";
  assert.ok(
    src.includes(anchor),
    "the control must patch real construction code; if this anchor moves, fix the control rather than deleting it",
  );

  const patched = src
    .replace("function createRun({ root, strict, json }) {", "const SHARED = new Map();\nfunction createRun({ root, strict, json }) {")
    .replace(anchor, "  const findings = [];\n  const sources = SHARED;");

  // Beside the real module, because it imports its siblings by relative path. Dot-prefixed and
  // removed in `finally`, so it is never a file the repository audits.
  const copy = path.join(ROOT, "scripts", ".shared-cache-control.mjs");
  writeFileSync(copy, patched);

  try {
    const control = await import(pathToFileURL(copy).href);
    const [first, second] = await Promise.all([
      control.main(["audit", `--dir=${A}`, "--json"]),
      control.main(["audit", `--dir=${A}`, "--json"]),
    ]);

    // Behaviourally indistinguishable from the real thing.
    assert.equal(norm(first.stdout), norm(oracleA.stdout));
    assert.equal(norm(second.stdout), norm(oracleA.stdout));

    // And yet the two runs share one cache.
    assert.equal(first.run.sources, second.run.sources);
  } finally {
    rmSync(copy, { force: true });
  }
});

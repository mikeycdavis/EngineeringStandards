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
import { readFileSync, writeFileSync, rmSync, mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import os from "node:os";
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
  const marker = "if (invokedDirectly(process.argv[1])) {";
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
 * The installed shape of this package, which is the shape consumers actually gate their builds on.
 *
 * `package.json` declares `bin: { standards: "scripts/standards.mjs" }`, so `npm install` links
 * `node_modules/.bin/standards` at this file. Node follows that symlink when it resolves the module,
 * so `import.meta.url` names the real file while `process.argv[1]` still names the link — and the
 * original guard compared those two strings. It answered "not invoked directly", the CLI ran nothing,
 * and the process exited 0.
 *
 * The failure mode is the worst available one: silence that reads as success. `standards validate`
 * is what ADR 0004 tells consuming projects to gate on, and a gate that exits 0 without looking is
 * indistinguishable from a clean repository. Measured before the fix — direct invocation exited 1
 * with a 2914-byte verdict, invocation through the link exited 0 with zero bytes.
 *
 * The assertion is equality with the direct invocation rather than "exit 0", because exit 0 is
 * exactly what the defect produced.
 */
function withBinLink(fn) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "standards-bin-"));
  try {
    const bin = path.join(dir, "node_modules/.bin");
    mkdirSync(bin, { recursive: true });
    const link = path.join(bin, "standards");
    try {
      symlinkSync(CLI, link, "file");
    } catch (error) {
      // Windows refuses symlinks without Developer Mode or elevation. Reported rather than passed
      // quietly: the gating pipeline runs this on Linux, where the branch below always executes, and
      // a skip that looked like a pass is the same class of defect this test exists to catch.
      if (["EPERM", "EACCES"].includes(error.code)) return { skipped: error.code };
      throw error;
    }
    return { skipped: null, result: fn(link) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("invoking through the installed bin symlink runs the CLI, not a silent exit 0", (t) => {
  const outcome = withBinLink((link) => {
    const viaLink = (args) => {
      const r = spawnSync(process.execPath, [link, ...args], { encoding: "utf8", maxBuffer: 1 << 28 });
      return { stdout: r.stdout, exitCode: r.status };
    };
    return {
      audit: viaLink(["audit", `--dir=${A}`, "--json"]),
      bad: viaLink(["nonsense"]),
    };
  });

  if (outcome.skipped) {
    t.skip(`symlink creation refused (${outcome.skipped}); this runs on the Linux CI image`);
    return;
  }

  const direct = freshProcess(["audit", `--dir=${A}`, "--json"]);
  assert.notEqual(outcome.result.audit.stdout, "", "the symlinked CLI produced no output at all");
  assert.equal(norm(outcome.result.audit.stdout), norm(direct.stdout), "the symlinked CLI reported something else");
  assert.equal(outcome.result.audit.exitCode, direct.exitCode);
  // A distinguishing exit code, so the check cannot be satisfied by a process that exits 0 blindly.
  assert.equal(outcome.result.bad.exitCode, 2, "the symlinked CLI did not reach argument handling");
});

test("importing the module still runs nothing, by either of its two paths", (t) => {
  // The other half of the fix. Canonicalising the guard makes two spellings of one path comparable;
  // it must not widen what counts as invocation. An imported module's argv[1] is the *importing*
  // entry point — a different real file — so both the real path and the bin link must stay inert.
  // Asserted because the natural over-correction (comparing realpaths of the module against the
  // module) would make every import execute the CLI, which is the property ADR 0014 rests on.
  const outcome = withBinLink((link) => {
    const dir = path.dirname(path.dirname(path.dirname(link)));
    const entry = path.join(dir, "entry.mjs");
    writeFileSync(
      entry,
      `import ${JSON.stringify(pathToFileURL(CLI).href)};\n` +
        `import ${JSON.stringify(pathToFileURL(link).href)};\n` +
        `process.stdout.write("IMPORTED-AND-NOTHING-ELSE");\n`,
    );
    const r = spawnSync(process.execPath, [entry, "validate"], { encoding: "utf8", maxBuffer: 1 << 28 });
    return { stdout: r.stdout, stderr: r.stderr, exitCode: r.status };
  });

  if (outcome.skipped) {
    t.skip(`symlink creation refused (${outcome.skipped}); this runs on the Linux CI image`);
    return;
  }

  // `validate` is passed as an argument on purpose: if importing were to execute, it would have a
  // command to run and would print a verdict rather than failing on a missing one.
  assert.equal(outcome.result.stdout, "IMPORTED-AND-NOTHING-ELSE", "importing the module executed the CLI");
  assert.equal(outcome.result.exitCode, 0, "importing the module set an exit code");
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
  // Normalised, because the anchor is written with LF and a Windows checkout holds CRLF. The
  // container reads an LF blob and matched; a developer running the suite on the host did not, so
  // this control silently failed on the one platform where running it by hand is most useful.
  const src = readFileSync(CLI, "utf8").split("\r\n").join("\n");
  // `contents` joined `sources` on the run when the derived-view accessors began answering with
  // availability: telling "never obtained" apart from "not a code file" needs both maps. The anchor
  // follows the construction code rather than the construction code being held still for it.
  const anchor = "  const contents = new Map();\n  const sources = new Map();";
  assert.ok(
    src.includes(anchor),
    "the control must patch real construction code; if this anchor moves, fix the control rather than deleting it",
  );

  const patched = src
    .replace("function createRun({ root, strict, json }) {", "const SHARED = new Map();\nfunction createRun({ root, strict, json }) {")
    .replace(anchor, "  const contents = new Map();\n  const sources = SHARED;");

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

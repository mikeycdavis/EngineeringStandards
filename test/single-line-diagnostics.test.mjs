/**
 * ST-41 class closure (Codex P2, scripts/ci-triage.mjs): a user-controlled value that reaches an
 * error or diagnostic message is a SINGLE-LINE field. `humanErr`/`humanOut` keep the line feed and the
 * tab that lay a block of text out, so a value interpolated into one of them must be escaped at the
 * field boundary (`displaySafe`, which escapes LF, CR and TAB too) or it can forge an extra terminal or
 * CI-log line.
 *
 * Two kinds of evidence: each site is exercised with a hostile value and its output checked line by
 * line, and a static guard fails when a `human*` call interpolates anything that is not escaped there.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = (name) => path.join(ROOT, "scripts", name);
const imp = (name) => import(pathToFileURL(script(name)).href);

// An LF followed by a line that looks like a verdict, a TAB, and a C1 control (NEL).
const SINGLE_LINE_BREAKER = new RegExp("[" + String.fromCharCode(10, 13, 9, 0x85) + "]");
const HOSTILE = `bad${String.fromCharCode(10)}FORGED: PASSED${String.fromCharCode(9)}X${String.fromCharCode(0x85)}`;

function run(name, args, { env = {}, input } = {}) {
  const r = spawnSync(process.execPath, [script(name), ...args], {
    encoding: "utf8",
    cwd: ROOT,
    env: { ...process.env, ...env },
    input,
    windowsHide: true,
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

/** No line of `text` starts with the forged marker, and no raw LF-adjacent TAB or C1 control survives. */
function assertNoForgery(text, label) {
  assert.ok(text.includes("FORGED"), `${label}: the hostile value did not reach the output at all: ${JSON.stringify(text)}`);
  for (const line of text.split(/\r?\n/)) {
    assert.ok(!line.startsWith("FORGED"), `${label}: a forged line reached the output: ${JSON.stringify(text)}`);
  }
  assert.ok(!text.includes(String.fromCharCode(9)), `${label}: a raw TAB reached the output: ${JSON.stringify(text)}`);
  assert.ok(!text.includes(String.fromCharCode(0x85)), `${label}: a raw C1 control reached the output`);
  assert.ok(text.includes("\\n"), `${label}: the line feed was not shown escaped: ${JSON.stringify(text)}`);
}

// --- scripts/ci-triage.mjs -------------------------------------------------------------------

test("ci-triage: an unrecognised argument cannot forge a line (the reported reproduction)", () => {
  const r = run("ci-triage.mjs", [HOSTILE]);
  assert.equal(r.status, 2);
  assertNoForgery(r.stderr, "ci-triage argv");
  // One diagnostic line, then the usage line: the value did not add a line of its own.
  assert.equal(r.stderr.trim().split(/\r?\n/).length, 2, r.stderr);
});

test("ci-triage: the parseTarget message is itself single-line, for any caller", async () => {
  const { parseTarget } = await imp("ci-triage.mjs");
  for (const argv of [[HOSTILE], ["--sha", HOSTILE, "--branch", HOSTILE], ["--sha", HOSTILE, "12"]]) {
    const { error } = parseTarget(argv);
    assert.ok(error, JSON.stringify(argv));
    assert.ok(!/[\n\r\t\u0085]/.test(error), JSON.stringify(error));
  }
});

test("ci-triage: a check-run page error carrying hostile gh output is single-line", async () => {
  const { collectCheckRunPages } = await imp("ci-triage.mjs");
  const { error } = collectCheckRunPages(() => ({ ok: false, out: HOSTILE }));
  assert.ok(!/[\n\r\t\u0085]/.test(error), JSON.stringify(error));
});

/** A `gh` that answers `repo view` and fails every other call with hostile stderr. */
function withFakeGh(body) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "st41-gh-"));
  try {
    const hostileStderr = JSON.stringify(`boom${String.fromCharCode(10)}FORGED: PASSED${String.fromCharCode(9)}X`);
    const logic =
      `const a=process.argv.join(" ");` +
      `if(/\\brepo\\b/.test(a)){process.stdout.write('{"nameWithOwner":"o/r"}');process.exit(0);}` +
      `process.stderr.write(${hostileStderr});process.exit(1);`;
    writeFileSync(path.join(dir, "fake-gh.cjs"), logic);
    const env = {};
    if (process.platform === "win32") {
      copyFileSync(process.execPath, path.join(dir, "gh.exe"));
      env.NODE_OPTIONS = `--require ${path.join(dir, "fake-gh.cjs").replace(/\\/g, "/")}`;
      // Only the copy named gh may act on the preload; the real runner is node.exe.
      writeFileSync(path.join(dir, "fake-gh.cjs"), `if(/gh\.exe$/i.test(process.execPath)){${logic}}`);
    } else {
      const sh = path.join(dir, "gh");
      writeFileSync(
        sh,
        `#!/bin/sh\ncase "$*" in *repo*) printf '{"nameWithOwner":"o/r"}'; exit 0;; esac\nprintf 'boom\\nFORGED: PASSED\\tX' >&2\nexit 1\n`,
      );
      chmodSync(sh, 0o755);
    }
    env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
    return body(env);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("ci-triage: hostile gh stderr and a hostile --sha/--branch value are single-line in the diagnostic", () => {
  withFakeGh((env) => {
    for (const args of [["--sha", HOSTILE], ["--branch", HOSTILE], ["123"]]) {
      const r = run("ci-triage.mjs", args, { env });
      assert.equal(r.status, 2, `${args[0]}: ${r.stderr}`);
      assert.ok(r.stderr.includes("FORGED"), `${args[0]}: gh output did not reach the diagnostic: ${JSON.stringify(r.stderr)}`);
      for (const line of r.stderr.split(/\r?\n/)) assert.ok(!line.startsWith("FORGED"), JSON.stringify(r.stderr));
      assert.ok(!r.stderr.includes(String.fromCharCode(9)), JSON.stringify(r.stderr));
      assert.equal(r.stderr.trim().split(/\r?\n/).length, 1, JSON.stringify(r.stderr));
    }
  });
});

test("ci-triage: extractEvidence returns single-line errors, whatever the gh output and target value", async () => {
  const { extractEvidence } = await imp("ci-triage.mjs");
  withFakeGh((env) => {
    const saved = { PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS };
    Object.assign(process.env, env);
    try {
      for (const target of [
        { mode: "sha", value: HOSTILE },
        { mode: "branch", value: HOSTILE },
        { mode: "pr", value: HOSTILE },
      ]) {
        const { error } = extractEvidence(target);
        assert.ok(error?.includes("FORGED"), `${target.mode}: ${JSON.stringify(error)}`);
        assert.ok(!SINGLE_LINE_BREAKER.test(error), `${target.mode}: ${JSON.stringify(error)}`);
      }
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

// --- scripts/standards.mjs -------------------------------------------------------------------

test("standards: an unknown subcommand cannot forge a line", () => {
  const r = run("standards.mjs", [HOSTILE]);
  assert.equal(r.status, 2);
  assertNoForgery(r.stderr, "standards subcommand");
});

test("standards: a hostile --max-total-read-bytes value cannot forge a line", () => {
  const r = run("standards.mjs", ["validate", `--max-total-read-bytes=${HOSTILE}`]);
  assert.equal(r.status, 2);
  assertNoForgery(r.stderr, "standards --max-total-read-bytes");
});

// --- scripts/inventory.mjs ------------------------------------------------------------------

test("inventory: a hostile expectedCount in the inventory file cannot forge a line", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "st41-inv-"));
  try {
    mkdirSync(path.join(dir, "scripts"));
    mkdirSync(path.join(dir, "artifacts"));
    mkdirSync(path.join(dir, "standards"));
    for (const f of ["inventory.mjs", "display-safe.mjs", "sections.mjs"]) copyFileSync(script(f), path.join(dir, "scripts", f));
    const inventory = JSON.parse(readFileSync(path.join(ROOT, "artifacts", "standards-source-inventory.json"), "utf8"));
    inventory.expectedCount = HOSTILE;
    writeFileSync(path.join(dir, "artifacts", "standards-source-inventory.json"), JSON.stringify(inventory));
    // Every named source exists and is empty, so the run reaches the summary lines.
    for (const source of inventory.sources) {
      mkdirSync(path.dirname(path.join(dir, source.path)), { recursive: true });
      writeFileSync(path.join(dir, source.path), "");
    }
    const r = spawnSync(process.execPath, [path.join(dir, "scripts", "inventory.mjs")], { encoding: "utf8", cwd: dir, windowsHide: true });
    assertNoForgery(r.stdout, "inventory");
    assert.ok(r.stdout.split(String.fromCharCode(10)).some((l) => l.startsWith("! inventory declares expectedCount")), r.stdout);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// --- scripts/pipeline.mjs --------------------------------------------------------------------

test("pipeline: git's own diagnostic, which names an environment-controlled path, cannot forge a line", () => {
  const r = run("pipeline.mjs", ["run"], { env: { GIT_DIR: `/nonexistent-${HOSTILE}` } });
  assert.equal(r.status, 2);
  assertNoForgery(r.stderr, "pipeline preflight");
});

// --- scripts/submit-gate.mjs -----------------------------------------------------------------

test("submit-gate: refusal messages (printed by the shell wrappers) are escaped per field", async () => {
  const { evaluateSubmission } = await imp("submit-gate.mjs");
  const sha = "a".repeat(40);
  const base = { isRepository: true, branch: "feature/x", base: "develop", dirty: [], shaBefore: sha, shaAfter: sha, ciExitCode: 0 };
  const cases = {
    protectedBranchValue: { ...base, branch: HOSTILE, base: HOSTILE },
    dirtyPath: { ...base, dirty: [` M ${HOSTILE}`] },
    badPreSha: { ...base, shaBefore: HOSTILE },
    scope: { ...base, evidence: { scope: HOSTILE } },
    result: { ...base, evidence: { scope: "complete", environment: { containerized: true }, result: HOSTILE } },
    record: {
      ...base,
      evidence: { scope: "complete", environment: { containerized: true }, result: "passed", commit: HOSTILE },
    },
  };
  for (const [name, facts] of Object.entries(cases)) {
    const { message } = evaluateSubmission(facts);
    assert.ok(message.includes("FORGED"), `${name}: ${message}`);
    for (const line of message.split("\n")) assert.ok(!line.startsWith("FORGED"), `${name}: ${JSON.stringify(message)}`);
    assert.ok(!/[\t\r\u0085]/.test(message), `${name}: ${JSON.stringify(message)}`);
  }
});

test("submit-gate: the PR-body evidence block escapes every field it interpolates", async () => {
  const { evidenceBlock } = await imp("submit-gate.mjs");
  const text = evidenceBlock({
    commit: HOSTILE,
    branch: HOSTILE,
    environment: { image: HOSTILE, node: HOSTILE },
    completedAt: HOSTILE,
    checks: [{ id: HOSTILE, outcome: HOSTILE, exitCode: HOSTILE, gating: true }],
  });
  for (const line of text.split("\n")) assert.ok(!line.startsWith("FORGED"), JSON.stringify(text));
  assert.ok(!/[\t\r\u0085]/.test(text), JSON.stringify(text));
  assert.equal(text.split("\n").length, evidenceBlock({ checks: [{ id: "a", outcome: "b", exitCode: 0, gating: true }] }).split("\n").length);
});

// --- Static class guard ----------------------------------------------------------------------

/**
 * Every interpolation inside a `humanErr` / `humanOut` / `humanLog` call must be a whole `displaySafe(...)`
 * call or appear here with the reason it cannot carry a user-controlled value. A new interpolation fails
 * until it is escaped or justified, and an entry that no longer matches fails too, so this list cannot rot.
 */
const SAFE = {
  "pipeline.mjs": {
    "stage.id": "constant stage table",
    "stage.command": "constant stage table",
    "stage.gating ? \"\" : \"  [advisory]\"": "constant stage table",
    "outcome": "derived from an exit status",
    "code": "numeric exit status",
    "stage.why": "constant stage table",
    "s.gating ? \"gate    \" : \"advisory\"": "constant stage table",
    "s.id.padEnd(10)": "constant stage table",
    "s.command": "constant stage table",
    "field(\"repository\")": "constant label",
    "field(\"branch\")": "constant label",
    "field(\"verified commit\")": "constant label",
    "field(\"scope\")": "constant label",
    "field(\"environment\")": "constant label",
    "field(\"stages\")": "constant label",
    "field(\"result\")": "constant label",
    "field(\"completed\")": "constant label",
    "report.scope": "\"partial\" or \"complete\"",
    "report.environment.containerized ? \"Docker\" : \"host\"": "boolean",
    "report.environment.node": "process.version",
    "c.outcome.padEnd(16)": "derived from an exit status",
    "c.gating ? \"\" : \"  [advisory]\"": "constant stage table",
    "report.result.toUpperCase()": "\"passed\" or \"failed\"",
    "report.completedAt": "an ISO timestamp produced here",
    "ready.message": "built in preflight() with each field escaped there",
  },
  "standards.mjs": {
    "message": "VERSION_MISMATCH text: its one interpolated field is escaped where it is built",
    "FRAMEWORK_VERSION": "read from the framework's own VERSION file",
  },
  "attestations.mjs": {
    "out.join(\"\\n\")": "every line is built with per-field displaySafe; the counts and statuses are fixed",
    "preflight.status.toUpperCase()": "one of four fixed statuses",
  },
  "ci-triage.mjs": {},
  "fidelity.mjs": {
    "out.join(\"\\n\")": "every field of every line is escaped where it is pushed",
  },
  "inventory.mjs": {
    "out.join(\"\\n\")": "rows go through line(), which escapes the value; the two free-text lines escape their field",
  },
  "diagrams.mjs": {
    "result.sources.length": "a count",
    "[...result.embedded.values()].flat().length": "a count",
    "result.findings.length": "a count",
  },
  "policy.mjs": {
    "result.errors.length": "a count",
    "result.findings.length": "a count",
  },
  "ownership.mjs": {},
  "links.mjs": {
    "result.checked": "a count",
    "result.files": "a count",
    "b.line": "a line number",
    "result.broken.length": "a count",
  },
  "submit-gate.mjs": {
    "evidenceBlock(input)": "evidenceBlock escapes each field it interpolates (tested above)",
  },
};

/** Index just past the string, template or comment starting at `i`, or `i` when none starts there. */
function skipLiteral(src, i) {
  const c = src[i];
  if (c === "'" || c === '"') {
    let j = i + 1;
    while (j < src.length && src[j] !== c) j += src[j] === "\\" ? 2 : 1;
    return j + 1;
  }
  if (c === "`") {
    let j = i + 1;
    while (j < src.length && src[j] !== "`") {
      if (src[j] === "\\") j += 2;
      else if (src[j] === "$" && src[j + 1] === "{") j = skipBalanced(src, j + 1, "{", "}");
      else j += 1;
    }
    return j + 1;
  }
  if (c === "/" && src[i + 1] === "/") return src.indexOf("\n", i) === -1 ? src.length : src.indexOf("\n", i);
  if (c === "/" && src[i + 1] === "*") return src.indexOf("*/", i) + 2;
  return i;
}

/** Index just past the bracket that closes the one at `i`. */
function skipBalanced(src, i, open, close) {
  let depth = 0;
  for (let j = i; j < src.length; ) {
    const k = skipLiteral(src, j);
    if (k !== j) {
      j = k;
      continue;
    }
    if (src[j] === open) depth += 1;
    else if (src[j] === close) {
      depth -= 1;
      if (depth === 0) return j + 1;
    }
    j += 1;
  }
  throw new Error("unbalanced source");
}

/** Interpolation expressions and bare non-literal arguments inside every human* call in `src`. */
function humanCallExpressions(src) {
  const expressions = [];
  const callPattern = /\bhuman(?:Err|Out|Log)\(/g;
  for (let m; (m = callPattern.exec(src)); ) {
    const lineStart = src.lastIndexOf("\n", m.index) + 1;
    if (/^\s*(?:import|export)\b/.test(src.slice(lineStart, m.index))) continue;
    const open = m.index + m[0].length - 1;
    const end = skipBalanced(src, open, "(", ")");
    const args = src.slice(open + 1, end - 1);
    // Walk the top level of the arguments: literals are inspected, everything else is an expression.
    let part = "";
    const flush = () => {
      const text = part.trim();
      if (text) expressions.push(text);
      part = "";
    };
    for (let i = 0; i < args.length; ) {
      const k = skipLiteral(args, i);
      if (k !== i) {
        const literal = args.slice(i, k);
        if (literal.startsWith("//") || literal.startsWith("/*")) {
          i = k;
          continue;
        }
        if (literal[0] === "`") {
          for (let j = 1; j < literal.length - 1; ) {
            if (literal[j] === "\\") j += 2;
            else if (literal[j] === "$" && literal[j + 1] === "{") {
              const close = skipBalanced(literal, j + 1, "{", "}");
              expressions.push(literal.slice(j + 2, close - 1).trim());
              j = close;
            } else j += 1;
          }
        }
        // A string or template literal on its own is not an expression; one inside a larger expression
        // stays part of it.
        if (part.trim()) part += literal;
        i = k;
        continue;
      }
      if (args[i] === "(" || args[i] === "[" || args[i] === "{") {
        const close = skipBalanced(args, i, args[i], { "(": ")", "[": "]", "{": "}" }[args[i]]);
        part += args.slice(i, close);
        i = close;
        continue;
      }
      if (args[i] === "+" || args[i] === ",") flush();
      else part += args[i];
      i += 1;
    }
    flush();
  }
  return expressions;
}

const isWholeDisplaySafe = (expr) => {
  if (!expr.startsWith("displaySafe(") && !expr.startsWith("displaySafeText(")) return false;
  const open = expr.indexOf("(");
  return skipBalanced(expr, open, "(", ")") === expr.length;
};

test("class guard: every interpolation in a human* call is escaped at the field or justified", () => {
  const used = {};
  const unaccounted = [];
  for (const name of readdirSync(path.join(ROOT, "scripts")).filter((n) => n.endsWith(".mjs") && n !== "display-safe.mjs")) {
    const src = readFileSync(path.join(ROOT, "scripts", name), "utf8");
    for (const expr of humanCallExpressions(src)) {
      if (isWholeDisplaySafe(expr)) continue;
      if (Object.hasOwn(SAFE[name] ?? {}, expr)) {
        (used[name] ??= new Set()).add(expr);
        continue;
      }
      unaccounted.push(`${name}: ${expr}`);
    }
  }
  assert.deepEqual(unaccounted, [], "an interpolation reaches a human* call without displaySafe");
  const stale = [];
  for (const [name, entries] of Object.entries(SAFE)) {
    for (const expr of Object.keys(entries)) if (!used[name]?.has(expr)) stale.push(`${name}: ${expr}`);
  }
  assert.deepEqual(stale, [], "an allow-list entry no longer matches any call");
});

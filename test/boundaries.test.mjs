/**
 * The boundary declaration is checked, not decorative, and the check fails closed (Standard 51 R2,
 * ADR 0018).
 *
 * Pinned here:
 *   1. this repository's own declaration is well-formed and its tree conforms to it;
 *   2. an undeclared cross-boundary import, an undeclared interface, an unowned file, an
 *      unacknowledged subprocess site, a termination below the CLI boundary and an undeclared
 *      external dependency each FAIL the check, mutation-tested on a copy of the real scripts/;
 *   3. every construct the scanner cannot classify (computed import, require, createRequire,
 *      new URL(..., import.meta.url), import.meta.resolve, indirect process termination) is
 *      REPORTED, never OK, unless the declaration acknowledges that file;
 *   4. the recognised forms (several imports on a line, apostrophes in comments, string-named
 *      imports, multi-line import(), re-exports, side-effect imports, every direct termination
 *      form) are read correctly, and a termination inside a comment or string is not one;
 *   5. a structurally inconsistent or incomplete declaration is rejected;
 *   6. the declaration is additive: with and without it, `validate` reports the same bytes and exit.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "../scripts/yaml.mjs";
import { validate } from "../scripts/jsonschema.mjs";
import {
  declarationProblems,
  checkBoundaries,
  scanRepository,
  scanSource,
  loadDeclaration,
  DECLARATION_FILE,
  MECHANISMS,
  SCAN_LISTS,
  resolveSpecifier,
  DETECTED_MECHANISMS,
} from "../scripts/boundaries.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(path.join(ROOT, "schemas/architecture-boundaries.schema.json"), "utf8"));
const DECLARATION_TEXT = readFileSync(path.join(ROOT, DECLARATION_FILE), "utf8").replace(/\r\n/g, "\n");
const DECLARATION = parseYaml(DECLARATION_TEXT);
const VERSION = readFileSync(path.join(ROOT, "VERSION"), "utf8").trim();

function tmp() {
  return mkdtempSync(path.join(os.tmpdir(), "boundaries-test-"));
}

function node(args, cwd = ROOT) {
  const r = spawnSync(process.execPath, args, { cwd, encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

/** A copy of the real scripts/ and declaration, so a mutation never touches the working tree. */
function copyOfRepo() {
  const dir = tmp();
  cpSync(path.join(ROOT, "scripts"), path.join(dir, "scripts"), { recursive: true });
  cpSync(path.join(ROOT, "rules"), path.join(dir, "rules"), { recursive: true });
  writeFileSync(path.join(dir, DECLARATION_FILE), DECLARATION_TEXT);
  // The files the declaration cites as evidence, so only the mutation under test can fail.
  const cited = new Set(
    [...DECLARATION.members, ...DECLARATION.edges, DECLARATION.external]
      .flatMap((x) => x.evidence)
      .map((e) => e.slice(0, e.lastIndexOf(":")))
      .filter((f) => !f.startsWith("scripts/")),
  );
  for (const f of cited) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    cpSync(path.join(ROOT, f), path.join(dir, f));
  }
  return dir;
}

function tiny(files, declaration) {
  const dir = tmp();
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return { dir, declaration };
}

const observation = (knownSites = {}) => ({
  method: "static-import-graph",
  roots: ["src"],
  extensions: [".mjs"],
  cannotObserve: MECHANISMS.map((m) => ({ mechanism: m, reason: "stated", knownSites: knownSites[m] ?? [] })),
});

const baseDeclaration = (knownSites) => ({
  observation: observation(knownSites),
  members: [
    { id: "core", kind: "layer", description: "d", paths: ["src/core.mjs"], evidence: ["NOTES.md:1"] },
    { id: "app", kind: "layer", description: "d", paths: ["src/app.mjs"], evidence: ["NOTES.md:1"] },
  ],
  edges: [{ from: "app", to: "core", via: ["run"], evidence: ["src/app.mjs:1"] }],
  external: { allowPrefixes: ["node:"], evidence: ["NOTES.md:1"] },
});

const FILES = {
  "NOTES.md": "boundary notes\n",
  "src/core.mjs": "export function run() {}\nexport function other() {}\n",
  "src/app.mjs": 'import { run } from "./core.mjs";\nexport const go = run;\n',
};

const kinds = (violations) => violations.map((v) => v.kind).sort();
const specs = (scan) => scan.imports.map((i) => i.spec);

// ------------------------------------------------------------------------------------------
// 1. This repository
// ------------------------------------------------------------------------------------------

test("the declaration file validates against its own schema and is internally consistent", () => {
  assert.ok(DECLARATION, "architecture-boundaries.yml must exist");
  assert.deepEqual(validate(DECLARATION, SCHEMA), []);
  assert.deepEqual(declarationProblems(DECLARATION), []);
  assert.equal(loadDeclaration(ROOT).state, "ok");
});

test("the declaration is not in project-policy.yml, so recording an attestation cannot stale it", () => {
  const policy = parseYaml(readFileSync(path.join(ROOT, "project-policy.yml"), "utf8"));
  assert.equal(policy.boundaries, undefined);
});

test("every scripts/*.mjs file is owned, every observed edge is declared and every unresolved construct acknowledged", () => {
  const scan = scanRepository(ROOT, DECLARATION);
  assert.ok(scan.files.length >= 22, "the scan must see the scripts it is meant to govern");
  assert.deepEqual(checkBoundaries(ROOT, DECLARATION, scan), []);
});

test("the declaration lists the whole closed vocabulary of unobservable mechanisms, each with knownSites", () => {
  const names = DECLARATION.observation.cannotObserve.map((u) => u.mechanism).sort();
  assert.deepEqual(names, [...MECHANISMS].sort());
  for (const u of DECLARATION.observation.cannotObserve) assert.ok(Array.isArray(u.knownSites), u.mechanism);
});

test("CLI: exit 0 and OK on this repository; --json carries the observation limits", () => {
  const r = node(["scripts/boundaries-check.mjs", "--json"]);
  assert.equal(r.code, 0, r.out + r.err);
  const report = JSON.parse(r.out);
  assert.equal(report.status, "OK");
  assert.deepEqual(report.violations, []);
  assert.equal(report.cannotObserve.length, MECHANISMS.length);
  assert.equal(MECHANISMS.length, 13);
});

// ------------------------------------------------------------------------------------------
// 2. Mutations on a copy of the real tree
// ------------------------------------------------------------------------------------------

test("MUTATION: an undeclared cross-boundary import in the real tree fails the check", () => {
  const dir = copyOfRepo();
  try {
    appendFileSync(path.join(dir, "scripts/catalog.mjs"), '\nimport { evaluate as leaked } from "./compliance.mjs";\n');
    const r = node([path.join(ROOT, "scripts/boundaries-check.mjs"), `--dir=${dir}`, "--json"]);
    assert.equal(r.code, 1, r.out);
    const v = JSON.parse(r.out).violations;
    assert.ok(v.some((x) => x.kind === "undeclared-edge" && x.file === "scripts/catalog.mjs"), r.out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MUTATION: importing a name the edge does not permit fails the check", () => {
  const dir = copyOfRepo();
  try {
    appendFileSync(path.join(dir, "scripts/compliance.mjs"), '\nimport { loadCatalog as sneaky } from "./catalog.mjs";\n');
    const v = checkBoundaries(dir, DECLARATION);
    assert.deepEqual(kinds(v), ["undeclared-interface"], JSON.stringify(v));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("MUTATION: an unowned file, an unacknowledged subprocess site, a termination below the CLI boundary and a bare external all fail", () => {
  const dir = copyOfRepo();
  try {
    writeFileSync(path.join(dir, "scripts/new-module.mjs"), "export const x = 1;\n");
    appendFileSync(path.join(dir, "scripts/reviews.mjs"), "\nprocess.exit(3);\n");
    appendFileSync(path.join(dir, "scripts/yaml.mjs"), '\nimport { execSync } from "child_process";\n');
    appendFileSync(path.join(dir, "scripts/jsonschema.mjs"), '\nimport left from "left-pad";\n');
    const v = checkBoundaries(dir, DECLARATION);
    assert.deepEqual(
      kinds(v),
      ["process-termination", "undeclared-external", "undeclared-external", "unobserved-mechanism", "unowned-file"],
      JSON.stringify(v),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------
// 3. Unclassifiable constructs are reported, never OK
// ------------------------------------------------------------------------------------------

const UNCLASSIFIED = [
  ["dynamic-import-computed", "const m = await import(name);"],
  ["dynamic-import-computed", "const m = await import(`./${name}.mjs`);"],
  ["dynamic-import-computed", 'const m = await import("./" + name);'],
  ["require-call", 'const r = require("./x.cjs");'],
  ["require-call", 'import { createRequire } from "node:module";\nconst r = createRequire(import.meta.url);'],
  ["import-meta-resolve", 'const p = import.meta.resolve("./x.mjs");'],
  ["url-module-path", 'const u = new URL("./x.mjs", import.meta.url);'],
  ["termination-indirect", "const p = process;\np.exit(1);"],
  ["termination-indirect", "const f = process[name];"],
  ["termination-indirect", 'import p from "node:process";\np.exit(1);'],
  ["termination-indirect", 'import * as proc from "process";\nproc.exit(1);'],
  ["termination-indirect", 'globalThis["pro" + "cess"].exit(1);'],
  ["subprocess", 'import cp from "child_process";'],
  ["subprocess", 'import cp from "node:child_process";'],
  ["subprocess", 'const cp = await import("node:child_process");'],
  ["subprocess", 'import { Worker } from "worker_threads";'],
  ["reflection", 'eval("1");'],
  ["reflection", 'const f = new Function("return 1");'],
  ["reflection", "const p = new Proxy({}, {});"],
  ["network", 'import http from "node:http";'],
  ["network", 'const r = await fetch("https://example.invalid");'],
  ["network", 'const es = new EventSource("https://example.invalid");'],
  // Review round 2: aliasing and indirection
  ["termination-indirect", 'import {default as p} from "node:process";\np.exit(1);'],
  ["termination-indirect", 'import { default as q } from "process";\nq.exit(1);'],
  ["termination-indirect", 'const m = await import("node:process");\nm.default.exit(1);'],
  ["reflection", '(0, eval)("1");'],
  ["reflection", 'const e = eval;\ne("1");'],
  ["reflection", 'const F = Function;\nF("return 1")();'],
  ["reflection", '(function () {}).constructor("return 1")();'],
  ["reflection", 'import vm from "node:vm";'],
  ["reflection", 'const b = process.binding("fs");'],
  ["reflection", 'process.dlopen(module, "x.node");'],
  ["reflection", 'process["binding"]("fs");'],
  ["import-meta-resolve", 'const r = import.meta["resolve"]("./x.mjs");'],
  ["import-meta-resolve", 'const m = import.meta;\nconst r = m.resolve("./x.mjs");'],
  ["import-meta-resolve", 'const { resolve } = import.meta;'],
  ["require-call", 'const c = process.getBuiltinModule("child_process");'],
  ["require-call", 'import { register } from "node:module";'],
  ["require-call", 'import { createRequire as make } from "node:module";'],
  ["reflection", '(function () {})["constructor"]("return 1")();'],
  ["reflection", "(function () {})['constructor']('return 1')();"],
  ["reflection", 'const C = (async function () {}).constructor;'],
  ["reflection", 'const F = Object.getPrototypeOf(async function () {}).constructor;'],
  ["reflection", 'const p = Object.getPrototypeOf(x);'],
  ["reflection", 'const p = x.__proto__;'],
  ["ambiguous-token", 'const caf\u0065 = 1;\n\\u0069mport("x");'],
  ["ambiguous-token", 'const a = 1; \u2603 import { z } from "../c/z.mjs";'],
  ["ambiguous-token", 'if (x) /"/.test(y); import { z } from "../c/z.mjs";'],
  ["ambiguous-token", 'let i = 0;\ni++ / 2; await import("../c/z.mjs");'],
];

for (const [mechanism, source] of UNCLASSIFIED) {
  test(`UNCLASSIFIED ${mechanism}: ${source.split("\n").pop().slice(0, 50)}`, () => {
    const scan = scanSource(source);
    assert.ok(scan.mechanisms[mechanism].length > 0, `${mechanism} must be recorded: ${JSON.stringify(scan.mechanisms)}`);

    const t = tiny({ ...FILES, "src/app.mjs": FILES["src/app.mjs"] + source + "\n" }, baseDeclaration());
    const violations = checkBoundaries(t.dir, t.declaration);
    assert.ok(
      violations.some((v) => v.kind === "unobserved-mechanism" && v.file === "src/app.mjs"),
      `${mechanism} must make the check fail: ${JSON.stringify(violations)}`,
    );

    // Acknowledged in knownSites, the same file no longer fails that mechanism's rule.
    const ack = tiny({ ...FILES, "src/app.mjs": FILES["src/app.mjs"] + source + "\n" }, baseDeclaration({ [mechanism]: ["src/app.mjs"] }));
    assert.ok(
      !checkBoundaries(ack.dir, ack.declaration).some((v) => v.kind === "unobserved-mechanism" && v.message.includes(`'${mechanism}'`)),
    );
  });
}

test("a knownSite where the mechanism is no longer used is an error, so the list cannot rot", () => {
  const t = tiny(FILES, baseDeclaration({ "require-call": ["src/app.mjs"] }));
  assert.deepEqual(kinds(checkBoundaries(t.dir, t.declaration)), ["known-site-missing"]);
});

test("an unclassifiable construct in a CLI member is still reported", () => {
  const t = tiny({ ...FILES, "src/app.mjs": 'const r = require("x");\n' }, baseDeclaration());
  t.declaration.members[1].processExit = "permitted";
  t.declaration.edges = [];
  assert.deepEqual(kinds(checkBoundaries(t.dir, t.declaration)), ["unobserved-mechanism"]);
});

// ------------------------------------------------------------------------------------------
// 4. Recognised forms are read correctly
// ------------------------------------------------------------------------------------------

test("several imports on one line are all read", () => {
  const scan = scanSource('import a from "./a.mjs"; import { b } from "./b.mjs"; export { c } from "./c.mjs";\n');
  assert.deepEqual(specs(scan), ["./a.mjs", "./b.mjs", "./c.mjs"]);
});

test("an apostrophe in a comment does not hide the import that follows", () => {
  const scan = scanSource("// it's the reviewer's note\n/* don't */ import { x } from './x.mjs'; // isn't it\n");
  assert.deepEqual(specs(scan), ["./x.mjs"]);
  assert.deepEqual(scan.imports[0].names, ["x"]);
});

test("string-named imports and aliases give the exported name", () => {
  const scan = scanSource('import { "a-b" as q, c as d, e } from "./m.mjs";\n');
  assert.deepEqual(scan.imports[0].names, ["a-b", "c", "e"]);
});

test("a multi-line literal import() is a dynamic import, not an unresolved one", () => {
  const scan = scanSource('const m = await import(\n  "./x.mjs"\n);\n');
  assert.deepEqual(specs(scan), ["./x.mjs"]);
  assert.equal(scan.imports[0].kind, "dynamic");
  assert.deepEqual(scan.mechanisms["dynamic-import-computed"], []);
});

test("import() with an import-attributes second argument is still literal", () => {
  const scan = scanSource('await import("./x.json", { with: { type: "json" } });\n');
  assert.deepEqual(specs(scan), ["./x.json"]);
});

test("a destructured dynamic import records the destructured names", () => {
  const scan = scanSource('const { a, b: c } = await import("./x.mjs");\n');
  assert.deepEqual(scan.imports[0].names, ["a", "b"]);
});

test("re-exports and side-effect imports are imports", () => {
  const scan = scanSource('export * from "./a.mjs";\nexport * as ns from "./b.mjs";\nexport { x as y } from "./c.mjs";\nimport "./d.mjs";\n');
  assert.deepEqual(specs(scan), ["./a.mjs", "./b.mjs", "./c.mjs", "./d.mjs"]);
  assert.deepEqual(scan.imports.map((i) => i.kind), ["reexport", "reexport", "reexport", "static"]);
  assert.deepEqual(scan.imports[3].names, ["side-effect"]);
  assert.deepEqual(scan.imports[2].names, ["x"]);
});

test("a side-effect import across an edge is a use of the interface 'side-effect'", () => {
  const files = { ...FILES, "src/app.mjs": 'import "./core.mjs";\n' };
  const strict = tiny(files, baseDeclaration());
  assert.deepEqual(kinds(checkBoundaries(strict.dir, strict.declaration)), ["undeclared-interface"]);

  const named = tiny(files, baseDeclaration());
  named.declaration.edges[0].via = ["side-effect"];
  assert.deepEqual(checkBoundaries(named.dir, named.declaration), []);

  const star = tiny(files, baseDeclaration());
  star.declaration.edges[0].via = ["*"];
  assert.deepEqual(checkBoundaries(star.dir, star.declaration), []);
});

const TERMINATIONS = [
  "process.exit(1);",
  "process.exitCode = 1;",
  "process.kill(process.pid);",
  "process.abort();",
  "process?.exit(1);",
  'process["exit"](1);',
  "const { exit } = process;\nexit(1);",
  'import { exit } from "node:process";\nexit(1);',
  'import { exit as bye } from "process";\nbye(1);',
  "globalThis.process.exit(1);",
  "const t = `${process.exit(1)}`;",
];

for (const source of TERMINATIONS) {
  test(`TERMINATION recognised: ${source.split("\n").pop()}`, () => {
    const scan = scanSource(source + "\n");
    assert.ok(scan.terminates.length > 0, JSON.stringify(scan));
    const t = tiny({ ...FILES, "src/app.mjs": FILES["src/app.mjs"] + source + "\n" }, baseDeclaration());
    assert.ok(checkBoundaries(t.dir, t.declaration).some((v) => v.kind === "process-termination"));
  });
}

test("a termination form inside a comment, a string, a regex or a template's text is not a termination", () => {
  const scan = scanSource(
    [
      "// process.exit(1)",
      "/* process.kill(1) */",
      'const s = "process.exit(1)";',
      "const t = `process.exit(1) is how it ends`;",
      "const r = /process\\.exit\\(/;",
      "const a = process.argv.slice(2);",
      "const e = process.env.HOME;",
      "process.stdout.write('x');",
      "",
    ].join("\n"),
  );
  assert.deepEqual(scan.terminates, []);
  assert.deepEqual(Object.values(scan.mechanisms).flat(), []);
});

test("an ambiguous slash can never hide a same-line import: the union of both readings is returned", () => {
  const afterParen = scanSource('if (x) /"/.test(y); import { z } from "../c/z.mjs";\n');
  assert.ok(specs(afterParen).includes("../c/z.mjs"), JSON.stringify(afterParen.imports));
  assert.ok(afterParen.mechanisms["ambiguous-token"].length > 0);
  const afterPostfix = scanSource('let i = 0;\ni++ / 2; await import("../c/z.mjs");\n');
  assert.ok(specs(afterPostfix).includes("../c/z.mjs"), JSON.stringify(afterPostfix.imports));
  assert.ok(afterPostfix.mechanisms["ambiguous-token"].length > 0);
});

test("a division after a parenthesis is not reported when both readings agree", () => {
  const scan = scanSource('const h = (a + b) / 2;\nconst k = f(x) / g(y);\nimport { y } from "./y.mjs";\n');
  assert.deepEqual(scan.mechanisms["ambiguous-token"], []);
  assert.deepEqual(specs(scan), ["./y.mjs"]);
});

test("safe import.meta members and safe node:module names are not reported", () => {
  const scan = scanSource(
    'import { builtinModules } from "node:module";\nconst d = import.meta.dirname;\nconst u = import.meta.url;\nconst f = import.meta.filename;\nimport process from "node:process";\nprocess.stdout.write("x");\n',
  );
  assert.deepEqual(Object.values(scan.mechanisms).flat(), []);
  assert.deepEqual(scan.terminates, []);
});

// A non-ASCII separator must never glue the import keyword to the previous token.
const SEPARATORS = [
  ["U+2003 EM SPACE", "\u2003"],
  ["U+3000 IDEOGRAPHIC SPACE", "\u3000"],
  ["U+2028 LINE SEPARATOR", "\u2028"],
  ["U+2029 PARAGRAPH SEPARATOR", "\u2029"],
  ["U+00A0 NO-BREAK SPACE", "\u00a0"],
  ["U+FEFF BYTE ORDER MARK", "\ufeff"],
  ["U+200A HAIR SPACE", "\u200a"],
];
for (const [name, ch] of SEPARATORS) {
  test(`UNICODE whitespace ${name} before an import and before process.exit is read as whitespace`, () => {
    const imp = scanSource(`const s = 1;${ch}import { z } from "../c/z.mjs";\n`);
    assert.deepEqual(specs(imp), ["../c/z.mjs"], JSON.stringify(imp));
    assert.deepEqual(imp.mechanisms["ambiguous-token"], []);
    const term = scanSource(`const s = 1;${ch}process.exit(1);\n`);
    assert.equal(term.terminates.length, 1, JSON.stringify(term));
    // The check itself sees the cross-boundary import.
    const t = tiny({ ...FILES, "src/app.mjs": FILES["src/app.mjs"] + `const s = 1;${ch}import { zz } from "./core.mjs";\n` }, baseDeclaration());
    assert.ok(checkBoundaries(t.dir, t.declaration).some((v) => v.kind === "undeclared-interface"));
  });
}

test("a non-ASCII identifier is accepted and does not hide the import after it", () => {
  const scan = scanSource('const é = 1; const 変数 = 2; import { z } from "./z.mjs"; process.exit(é);\n');
  assert.deepEqual(specs(scan), ["./z.mjs"]);
  assert.equal(scan.terminates.length, 1);
  assert.deepEqual(Object.values(scan.mechanisms).flat(), []);
});

test("non-ASCII inside strings, comments, templates and regex literals is ignored", () => {
  const scan = scanSource(
    [
      'const s = "\u3000import x from \'./nope.mjs\'\u2028 ☃";',
      "// ☃ \u3000 import y from './nope2.mjs';",
      "/* \u2028 ☃ */",
      "const t = `☃ \u3000 process.exit(1)`;",
      "const r = /☃\u3000/u;",
      'import { real } from "./real.mjs";',
      "",
    ].join("\n"),
  );
  assert.deepEqual(specs(scan), ["./real.mjs"]);
  assert.deepEqual(scan.terminates, []);
  assert.deepEqual(Object.values(scan.mechanisms).flat(), []);
});

test("a non-ASCII character that is neither whitespace nor an identifier character is reported", () => {
  const scan = scanSource('const a = 1 \u2603 ;\nimport { z } from "./z.mjs";\n');
  assert.deepEqual(scan.mechanisms["ambiguous-token"], [1]);
  assert.deepEqual(specs(scan), ["./z.mjs"]);
});

test("a unicode escape in an identifier outside a string is reported, never followed", () => {
  const scan = scanSource('\\u0069mport("./x.mjs");\n');
  assert.ok(scan.mechanisms["ambiguous-token"].length > 0);
});

test("a quote inside a regex literal does not swallow the following import", () => {
  const scan = scanSource("const re = /[\"']x/;\nimport { y } from './y.mjs';\n");
  assert.deepEqual(specs(scan), ["./y.mjs"]);
});

// ------------------------------------------------------------------------------------------
// 5. Checker behaviour and structural errors
// ------------------------------------------------------------------------------------------

test("a conforming tiny repository passes; each departure is a distinct violation", () => {
  const ok = tiny({ ...FILES, "src/app.mjs": 'import {\n  run,\n} from "./core.mjs";\nexport const go = run;\n' }, baseDeclaration());
  assert.deepEqual(checkBoundaries(ok.dir, ok.declaration), [], "multi-line imports are read");

  const reverse = tiny({ ...FILES, "src/core.mjs": 'import { go } from "./app.mjs";\nexport function run() {}\n' }, baseDeclaration());
  assert.deepEqual(kinds(checkBoundaries(reverse.dir, reverse.declaration)), ["undeclared-edge"]);

  const wide = tiny({ ...FILES, "src/app.mjs": 'import { run, other } from "./core.mjs";\n' }, baseDeclaration());
  assert.deepEqual(kinds(checkBoundaries(wide.dir, wide.declaration)), ["undeclared-interface"]);

  const star = tiny({ ...FILES, "src/app.mjs": 'import * as core from "./core.mjs";\n' }, baseDeclaration());
  assert.deepEqual(kinds(checkBoundaries(star.dir, star.declaration)), ["undeclared-interface"]);

  const badEvidence = baseDeclaration();
  badEvidence.members[0].evidence = ["MISSING.md:1", "NOTES.md:99"];
  const ev = tiny(FILES, badEvidence);
  assert.deepEqual(kinds(checkBoundaries(ev.dir, ev.declaration)), ["evidence-missing", "evidence-out-of-range"]);
});

test("edge evidence must be an import of the target by the source member", () => {
  const d = baseDeclaration();
  d.edges[0].evidence = ["src/app.mjs:2"]; // line 2 is not the import
  const t = tiny(FILES, d);
  assert.deepEqual(kinds(checkBoundaries(t.dir, t.declaration)), ["evidence-mismatch"]);
});

test("a directory path owns everything beneath it, and a member path matching nothing is an error", () => {
  const decl = baseDeclaration();
  decl.members[0].paths = ["src/lib/"];
  const t = tiny(
    { "NOTES.md": "x\n", "src/lib/core.mjs": "export function run() {}\n", "src/app.mjs": 'import { run } from "./lib/core.mjs";\n' },
    decl,
  );
  assert.deepEqual(checkBoundaries(t.dir, t.declaration), []);

  const dead = baseDeclaration();
  dead.members[0].paths = ["src/core.mjs", "src/gone.mjs"];
  const d = tiny(FILES, dead);
  assert.deepEqual(kinds(checkBoundaries(d.dir, d.declaration)), ["dead-member-path"]);
});

test("structurally inconsistent declarations are rejected", () => {
  const overlap = baseDeclaration();
  overlap.members[1].paths = ["src/"];
  assert.match(declarationProblems(overlap).join("\n"), /overlapping/);

  const dup = baseDeclaration();
  dup.members[1].id = "core";
  assert.match(declarationProblems(dup).join("\n"), /more than once/);

  const unknown = baseDeclaration();
  unknown.edges[0].to = "ghost";
  assert.match(declarationProblems(unknown).join("\n"), /unknown member 'ghost'/);

  const self = baseDeclaration();
  self.edges.push({ from: "core", to: "core", via: ["*"], evidence: ["NOTES.md:1"] });
  assert.match(declarationProblems(self).join("\n"), /self edge/);

  const cycle = baseDeclaration();
  cycle.edges.push({ from: "core", to: "app", via: ["*"], evidence: ["NOTES.md:1"] });
  assert.match(declarationProblems(cycle).join("\n"), /cycle/);

  assert.deepEqual(declarationProblems(undefined), [], "an absent declaration has no problems");
  assert.deepEqual(declarationProblems(baseDeclaration()), []);
});

test("cannotObserve must list the whole closed vocabulary, once each, with knownSites", () => {
  const partial = baseDeclaration();
  partial.observation.cannotObserve = partial.observation.cannotObserve.filter((u) => u.mechanism !== "network");
  assert.match(declarationProblems(partial).join("\n"), /must list the mechanism 'network'/);

  const dup = baseDeclaration();
  dup.observation.cannotObserve.push({ mechanism: "network", reason: "again", knownSites: [] });
  assert.match(declarationProblems(dup).join("\n"), /lists 'network' twice/);

  const unknown = baseDeclaration();
  unknown.observation.cannotObserve.push({ mechanism: "telepathy", reason: "x", knownSites: [] });
  assert.match(declarationProblems(unknown).join("\n"), /unknown mechanism 'telepathy'/);

  const noSites = baseDeclaration();
  delete noSites.observation.cannotObserve[0].knownSites;
  assert.match(declarationProblems(noSites).join("\n"), /must declare knownSites/);
  assert.ok(validate(noSites, SCHEMA).length > 0, "the schema requires knownSites too");

  const badId = baseDeclaration();
  badId.observation.cannotObserve[0].mechanism = "telepathy";
  assert.ok(validate(badId, SCHEMA).length > 0, "the schema's mechanism enum is closed");
});

test("external is required by the schema (an empty allowPrefixes list is allowed)", () => {
  const d = baseDeclaration();
  assert.deepEqual(validate(d, SCHEMA), []);
  delete d.external;
  assert.ok(validate(d, SCHEMA).length > 0);
  const none = baseDeclaration();
  none.external.allowPrefixes = [];
  assert.deepEqual(validate(none, SCHEMA), []);
});

test("'..' and '.' segments are rejected by the schema and by the structural check", () => {
  for (const bad of ["../outside.mjs", "src/../x.mjs", "./x.mjs", "src/./x.mjs", "/abs.mjs"]) {
    const d = baseDeclaration();
    d.members[0].paths = [bad];
    assert.ok(validate(d, SCHEMA).length > 0, `schema must reject ${bad}`);
    assert.match(declarationProblems(d).join("\n"), /repository-relative/, `structure must reject ${bad}`);
  }
  const ev = baseDeclaration();
  ev.members[0].evidence = ["../secret.txt:1"];
  assert.ok(validate(ev, SCHEMA).length > 0);
  assert.match(declarationProblems(ev).join("\n"), /repository-relative/);
});

test("every detected mechanism is in the closed vocabulary", () => {
  for (const m of DETECTED_MECHANISMS) assert.ok(MECHANISMS.includes(m));
  assert.equal(new Set(MECHANISMS).size, MECHANISMS.length);
});

// ------------------------------------------------------------------------------------------
// 6. policy, validate, additivity, template
// ------------------------------------------------------------------------------------------

test("policy and validate reject an inconsistent, incomplete or schema-invalid declaration beside the policy", () => {
  const dir = tmp();
  try {
    writeFileSync(path.join(dir, "project-policy.yml"), `standardVersion: "${VERSION}"\n`);
    const bad = DECLARATION_TEXT.replace(/^  - id: "reviews"$/m, '  - id: "catalog"');
    assert.notEqual(bad, DECLARATION_TEXT, "the mutation must apply");
    writeFileSync(path.join(dir, DECLARATION_FILE), bad);
    const p = node(["scripts/policy.mjs", path.join(dir, "project-policy.yml")]);
    assert.equal(p.code, 2, p.out + p.err);
    assert.match(p.out, /more than once/);
    const v = node(["scripts/standards.mjs", "validate", `--dir=${dir}`, "--json"]);
    assert.notEqual(v.code, 0);
    assert.match(v.out + v.err, /architecture-boundaries\.yml is invalid|NOT_EVALUATED/);

    writeFileSync(path.join(dir, DECLARATION_FILE), "observation: {}\n");
    assert.equal(node(["scripts/policy.mjs", path.join(dir, "project-policy.yml")]).code, 2);

    // A declaration missing a mechanism from the closed vocabulary is invalid, not merely incomplete.
    const missing = DECLARATION_TEXT.replace(/    - mechanism: "network"\n(?:      .*\n)+?(?=    - mechanism)/, "");
    assert.notEqual(missing, DECLARATION_TEXT);
    writeFileSync(path.join(dir, DECLARATION_FILE), missing);
    const m = node(["scripts/policy.mjs", path.join(dir, "project-policy.yml")]);
    assert.equal(m.code, 2, m.out + m.err);
    assert.match(m.out, /must list the mechanism 'network'/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("ADDITIVE: validate reports identical bytes and exit with and without a declaration", () => {
  const without = tmp();
  const withDecl = tmp();
  try {
    const head = `standardVersion: "${VERSION}"\nproject: "additive-fixture"\n`;
    writeFileSync(path.join(without, "project-policy.yml"), head);
    writeFileSync(path.join(withDecl, "project-policy.yml"), head);
    writeFileSync(path.join(withDecl, DECLARATION_FILE), DECLARATION_TEXT);
    const a = node(["scripts/standards.mjs", "validate", `--dir=${without}`, "--json"]);
    const b = node(["scripts/standards.mjs", "validate", `--dir=${withDecl}`, "--json"]);
    assert.equal(a.code, b.code, "exit codes must match");
    const strip = (s) => s.replace(/"(auditedAt|generatedAt|today)":\s*"[^"]*"/g, '"$1": ""');
    assert.equal(strip(a.out), strip(b.out), "validate output must be byte-identical modulo timestamps");
    assert.ok(a.out.length > 0);
  } finally {
    rmSync(without, { recursive: true, force: true });
    rmSync(withDecl, { recursive: true, force: true });
  }
});

test("boundaries-check without a declaration is NOT_EVALUATED (exit 2), never a pass", () => {
  const dir = tmp();
  try {
    writeFileSync(path.join(dir, "project-policy.yml"), `standardVersion: "${VERSION}"\n`);
    assert.equal(loadDeclaration(dir).state, "absent");
    const r = node(["scripts/boundaries-check.mjs", `--dir=${dir}`, "--json"]);
    assert.equal(r.code, 2);
    assert.equal(JSON.parse(r.out).status, "NOT_EVALUATED");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the shipped template is schema-valid and internally consistent", () => {
  const template = parseYaml(readFileSync(path.join(ROOT, "templates/architecture-boundaries/architecture-boundaries.yml"), "utf8"));
  assert.deepEqual(validate(template, SCHEMA), []);
  assert.deepEqual(declarationProblems(template), []);
});

// ------------------------------------------------------------------------------------------
// 8. Review findings: type re-exports, evidence scope, file roots, symbolic links
// ------------------------------------------------------------------------------------------

test("TYPE re-exports are read as re-exports: export type { X } from, export type * from, export type * as ns from", () => {
  const scan = scanSource(
    'export type { A } from "./a.mjs";\nexport type * from "./b.mjs";\nexport type * as ns from "./c.mjs";\nexport type { D };\n',
  );
  assert.deepEqual(specs(scan).sort(), ["./a.mjs", "./b.mjs", "./c.mjs"]);
  assert.ok(scan.imports.every((i) => i.kind === "reexport"));
});

test("an undeclared edge through export type * from is reported, not missed", () => {
  const files = { ...FILES, "src/core.mjs": 'export type * from "./app.mjs";\nexport function run() {}\n' };
  const t = tiny(files, baseDeclaration());
  try {
    const v = checkBoundaries(t.dir, t.declaration);
    assert.ok(kinds(v).includes("undeclared-edge"), JSON.stringify(v));
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("edge evidence naming a file outside observation.roots or an unobserved extension is rejected", () => {
  const files = { ...FILES, "other/app.mjs": 'import { run } from "../src/core.mjs";\n', "NOTES.md": "import { run } from './src/core.mjs'\n" };
  for (const evidence of ["other/app.mjs:1", "NOTES.md:1"]) {
    const d = baseDeclaration();
    d.edges[0].evidence = [evidence];
    const t = tiny(files, d);
    try {
      const v = checkBoundaries(t.dir, t.declaration);
      assert.deepEqual(kinds(v), ["evidence-outside-observation"], evidence + JSON.stringify(v));
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  }
});

test("a root that is a single file is observed, and the walk does not crash on it", () => {
  const d = baseDeclaration();
  d.observation.roots = ["src/app.mjs", "src/core.mjs"];
  const t = tiny(FILES, d);
  try {
    const scan = scanRepository(t.dir, t.declaration);
    assert.deepEqual([...scan.files], ["src/app.mjs", "src/core.mjs"]);
    assert.deepEqual(checkBoundaries(t.dir, t.declaration, scan), []);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

function linkOrSkip(target, link, type) {
  try {
    symlinkSync(target, link, type);
    return true;
  } catch {
    return false; // symlinks need privilege on some Windows hosts
  }
}

test("a directory symlink that points back at its parent is not followed and is reported", (t0) => {
  const t = tiny(FILES, baseDeclaration());
  try {
    if (!linkOrSkip(".", path.join(t.dir, "src", "loop"), "dir")) return t0.skip("symlinks not permitted here");
    const scan = scanRepository(t.dir, t.declaration);
    assert.deepEqual([...scan.files], ["src/app.mjs", "src/core.mjs"]);
    assert.deepEqual(scan.links, ["src/loop"]);
    assert.deepEqual(kinds(checkBoundaries(t.dir, t.declaration, scan)), ["symlink-not-followed"]);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("a symlink to a file outside the repository is not read as an in-repository file", (t0) => {
  const outside = tiny({ "secret.mjs": 'export const leaked = 1;\n' }, null);
  const t = tiny(FILES, baseDeclaration());
  try {
    if (!linkOrSkip(path.join(outside.dir, "secret.mjs"), path.join(t.dir, "src", "ext.mjs"), "file")) return t0.skip("symlinks not permitted here");
    const scan = scanRepository(t.dir, t.declaration);
    assert.ok(!scan.files.includes("src/ext.mjs"));
    assert.deepEqual(scan.links, ["src/ext.mjs"]);
    assert.ok(kinds(checkBoundaries(t.dir, t.declaration, scan)).includes("symlink-not-followed"));
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
    rmSync(outside.dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------
// 9. Review findings: module.require, computed destructuring keys, evidence targets
// ------------------------------------------------------------------------------------------

for (const src of [
  'const r = module.require("./other.cjs");',
  'const r = module?.require("./other.cjs");',
  'const r = module["require"]("./other.cjs");',
  'const k = "require"; const r = module[k]("./other.cjs");',
]) {
  test(`REQUIRE reached through module is a require-call: ${src}`, () => {
    assert.ok(scanSource(src).mechanisms["require-call"].length > 0, src);
  });
}

test("an unrelated .require method on another object is not a require-call", () => {
  assert.equal(scanSource("const r = checker.require(1);").mechanisms["require-call"].length, 0);
});

for (const src of [
  'const { ["exit"]: quit } = process; quit(1);',
  "const { ['exit']: quit } = process; quit(1);",
  'const { a, ["kill"]: k } = process;',
]) {
  test(`TERMINATION through a computed destructuring key is classified: ${src}`, () => {
    assert.ok(scanSource(src).terminates.length > 0, src);
  });
}

for (const src of ["const k = 'exit'; const { [k]: quit } = process; quit(1);", "const { ...all } = process; all.exit(1);"]) {
  test(`UNCLASSIFIED termination-indirect: unresolved key or rest in process destructuring: ${src}`, () => {
    assert.ok(scanSource(src).mechanisms["termination-indirect"].length > 0, src);
  });
}

test("evidence naming a directory is a violation, not a crash", () => {
  const d = baseDeclaration();
  d.members[0].evidence = ["src:1"];
  const t = tiny(FILES, d);
  try {
    const v = checkBoundaries(t.dir, t.declaration);
    assert.deepEqual(kinds(v), ["evidence-not-regular-file"], JSON.stringify(v));
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("evidence that is a symlink to a file outside the repository is not followed", (t0) => {
  const outside = tiny({ "secret.txt": "line\n" }, null);
  const t = tiny(FILES, baseDeclaration());
  try {
    if (!linkOrSkip(path.join(outside.dir, "secret.txt"), path.join(t.dir, "LINK.md"), "file")) return t0.skip("symlinks not permitted here");
    const d = baseDeclaration();
    d.members[0].evidence = ["LINK.md:1"];
    const v = checkBoundaries(t.dir, d);
    assert.deepEqual(kinds(v), ["evidence-not-regular-file"], JSON.stringify(v));
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
    rmSync(outside.dir, { recursive: true, force: true });
  }
});

test("evidence reached through a symlinked directory that leaves the repository is a violation", (t0) => {
  const outside = tiny({ "docs/n.md": "line\n" }, null);
  const t = tiny(FILES, baseDeclaration());
  try {
    if (!linkOrSkip(outside.dir, path.join(t.dir, "linked"), "dir")) return t0.skip("symlinks not permitted here");
    const d = baseDeclaration();
    d.members[0].evidence = ["linked/docs/n.md:1"];
    const v = checkBoundaries(t.dir, d);
    assert.deepEqual(kinds(v), ["evidence-not-regular-file"], JSON.stringify(v));
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
    rmSync(outside.dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------
// 10. Review findings: global-object forms, optional module access, linked ancestors, packages
// ------------------------------------------------------------------------------------------

for (const src of [
  "globalThis?.process.exit(1);",
  "(globalThis).process.exit(1);",
  "global?.process?.exit(1);",
  "(global).process.exit(1);",
  "window.process.exit(1);",
  "self?.process.exitCode = 1;",
  "globalThis.process.exit(1);",
]) {
  test(`TERMINATION through a global-object form is classified: ${src}`, () => {
    assert.ok(scanSource(src).terminates.length > 0, src);
  });
}

for (const src of ['globalThis?.["process"].exit(1);', '(globalThis)["process"].exit(1);', 'globalThis["pro" + "cess"].exit(1);']) {
  test(`UNCLASSIFIED termination-indirect: bracketed global object: ${src}`, () => {
    assert.ok(scanSource(src).mechanisms["termination-indirect"].length > 0 || scanSource(src).terminates.length > 0, src);
  });
}

for (const src of [
  'module?.["require"]("./other.cjs");',
  '(module).require("./other.cjs");',
  '(module)["require"]("./other.cjs");',
  'module?.[name]("./other.cjs");',
]) {
  test(`REQUIRE through optional or parenthesised module access is a require-call: ${src}`, () => {
    assert.ok(scanSource(src).mechanisms["require-call"].length > 0, src);
  });
}

test("an observation root reached through a symlinked ancestor is reported, not walked", (t0) => {
  const outside = tiny({ "src/leak.mjs": "export const x = 1;\n" }, null);
  const d = baseDeclaration();
  d.observation.roots = ["linked/src"];
  const t = tiny(FILES, d);
  try {
    if (!linkOrSkip(outside.dir, path.join(t.dir, "linked"), "dir")) return t0.skip("symlinks not permitted here");
    const scan = scanRepository(t.dir, t.declaration);
    assert.deepEqual([...scan.files], []);
    assert.deepEqual(scan.links, ["linked"]);
    assert.ok(kinds(checkBoundaries(t.dir, t.declaration, scan)).includes("symlink-not-followed"));
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
    rmSync(outside.dir, { recursive: true, force: true });
  }
});

const withPackage = (extra = {}) => ({
  ...FILES,
  "package.json": JSON.stringify({ name: "@acme/core" }),
  ...extra,
});

test("a bare import naming a repository package is not read as external", () => {
  const t = tiny(withPackage({ "src/app.mjs": 'import { run } from "./core.mjs";\nimport { thing } from "@acme/core/lib";\n' }), {
    ...baseDeclaration(),
    external: { allowPrefixes: ["node:", "@acme/"], evidence: ["NOTES.md:1"] },
  });
  try {
    const v = checkBoundaries(t.dir, t.declaration);
    assert.ok(kinds(v).includes("repository-package-import"), JSON.stringify(v));
    assert.ok(kinds(v).includes("external-prefix-shadows-member"), JSON.stringify(v));
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("an allowPrefix matching a repository package name is a violation even when nothing imports it", () => {
  const d = { ...baseDeclaration(), external: { allowPrefixes: ["node:", "@acme/"], evidence: ["NOTES.md:1"] } };
  const t = tiny(withPackage(), d);
  try {
    assert.deepEqual(kinds(checkBoundaries(t.dir, t.declaration)), ["external-prefix-shadows-member"]);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("a repository with a package name no prefix admits, and no import of it, is unaffected", () => {
  const t = tiny(withPackage(), baseDeclaration());
  try {
    assert.deepEqual(checkBoundaries(t.dir, t.declaration), []);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

// ------------------------------------------------------------------------------------------
// 10. Reviewer: every reference to require that is not a plain call is unexaminable. A crossing
//     reached through .call, .apply, .bind, an alias or a passed value must never come back OK.
// ------------------------------------------------------------------------------------------

const CROSSING_REQUIRE_SPELLINGS = [
  'module.require.call(module, "./core.mjs");',
  'module.require.apply(module, ["./core.mjs"]);',
  'module.require.bind(module)("./core.mjs");',
  'module?.require.call(module, "./core.mjs");',
  'require.call(null, "./core.mjs");',
  'require.apply(null, ["./core.mjs"]);',
  'require.bind(null)("./core.mjs");',
  'const q = require; q("./core.mjs");',
  'const { call } = require; call("./core.mjs");',
  'const m = module; m.require("./core.mjs");',
  'const f = module.require; f("./core.mjs");',
  'run(require, "./core.mjs");',
  'module.require("./core.mjs");',
];

for (const src of CROSSING_REQUIRE_SPELLINGS) {
  test(`REQUIRE spelling is flagged, never OK, when it crosses an undeclared boundary: ${src}`, () => {
    assert.ok(scanSource(src).mechanisms["require-call"].length > 0, `not detected: ${src}`);
    const t = tiny({ ...FILES, "src/app.mjs": src + "\n" }, { ...baseDeclaration(), edges: [] });
    try {
      const v = checkBoundaries(t.dir, t.declaration);
      assert.ok(v.length > 0, `false pass for: ${src}`);
      assert.ok(kinds(v).includes("unobserved-mechanism"), JSON.stringify(v));
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  });
}

for (const src of [
  "const o = { require: 1 };",
  "const r = checker.require(1);",
  "const r = this.module.exports;",
  "module.exports = { a: 1 };",
  "module.exports.run = function () {};",
]) {
  test(`not a require reference: ${src}`, () => {
    assert.equal(scanSource(src).mechanisms["require-call"].length, 0, src);
  });
}

test("a longer external prefix does not collide with a shorter repository package name", () => {
  // package "@acme/core"; allowPrefix "@acme/core-extra/" cannot admit an import of "@acme/core".
  const d = { ...baseDeclaration(), external: { allowPrefixes: ["node:", "@acme/core-extra/"], evidence: ["NOTES.md:1"] } };
  const t = tiny(withPackage(), d);
  try {
    assert.deepEqual(checkBoundaries(t.dir, t.declaration), []);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

test("a prefix naming a subpath of a repository package still shadows it", () => {
  const d = { ...baseDeclaration(), external: { allowPrefixes: ["node:", "@acme/core/lib/"], evidence: ["NOTES.md:1"] } };
  const t = tiny(withPackage(), d);
  try {
    assert.deepEqual(kinds(checkBoundaries(t.dir, t.declaration)), ["external-prefix-shadows-member"]);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
// Closing the class (review rounds 4 to 6): the scanner is a token scanner, not a parser. What it
// cannot fully classify is reported, never OK. These tests are generated families, not a list of
// spellings: global-object roots x access forms x call/assign, so a spelling nobody wrote down is
// covered by the same rule.
// ---------------------------------------------------------------------------------------------

const notOk = (r) => r.terminates.length > 0 || Object.values(r.mechanisms).some((l) => l.length > 0);
const GLOBAL_ROOTS = ["globalThis", "global", "window", "self"];

// How a root reaches the member `name`: dot, optional dot, bracket, optional bracket, and each of
// those with the root parenthesised or the whole access parenthesised.
const reach = (root, name) => [
  `${root}.${name}`,
  `${root}?.${name}`,
  `${root}["${name}"]`,
  `${root}?.["${name}"]`,
  `(${root}).${name}`,
  `(${root})?.${name}`,
  `(${root})["${name}"]`,
  `(${root})?.["${name}"]`,
  `(${root}.${name})`,
  `(${root}?.["${name}"])`,
  `${root}.globalThis.${name}`,
  `${root}["self"]?.["${name}"]`,
];

const TERMINATION_FAMILY = [];
for (const root of GLOBAL_ROOTS) {
  for (const p of reach(root, "process")) {
    TERMINATION_FAMILY.push(`${p}.exit(1);`, `${p}?.exit(1);`, `${p}["exit"](1);`, `${p}.exitCode = 1;`, `${p}["exitCode"] = 1;`);
  }
}
for (const p of ["process.exit", "process?.exit", 'process["exit"]', 'process?.["exit"]', "(process).exit", "(process)?.exit", '(process)["exit"]', "(process.exit)"]) {
  TERMINATION_FAMILY.push(`${p}(1);`);
}
for (const root of GLOBAL_ROOTS) {
  TERMINATION_FAMILY.push(`${root}[k].exit(1);`, `${root}?.[k](1);`, `const g = ${root};`, `f(${root});`, `const { process: p } = ${root};`);
}
TERMINATION_FAMILY.push("const p = process;", "f(process);", "(0, process).exit(1);");

test(`generated family: ${TERMINATION_FAMILY.length} termination spellings through a global root are never OK`, () => {
  const bad = TERMINATION_FAMILY.filter((src) => !notOk(scanSource(src)));
  assert.deepEqual(bad, []);
});

const REQUIRE_FAMILY = [];
const ARGS = ['("./other.cjs")', '?.("./other.cjs")'];
for (const root of ["module", ...GLOBAL_ROOTS]) {
  const bases = root === "module" ? reach("module", "require").slice(0, 10) : reach(root, "require");
  for (const b of bases) for (const a of ARGS) REQUIRE_FAMILY.push(`const r = ${b}${a};`);
}
for (const root of GLOBAL_ROOTS) {
  REQUIRE_FAMILY.push(`${root}.module.require("./o.cjs");`, `${root}["module"]["require"]("./o.cjs");`, `${root}?.["module"]?.require("./o.cjs");`, `(${root}.module).require("./o.cjs");`);
}
REQUIRE_FAMILY.push(
  '(0, module).require("./o.cjs");',
  '(module || x).require("./o.cjs");',
  "const m = module;",
  "f(module);",
  "const { require: q } = module;",
  'module[`require`]("./o.cjs");',
);

test(`generated family: ${REQUIRE_FAMILY.length} require spellings through module or a global root are never OK`, () => {
  const bad = REQUIRE_FAMILY.filter((src) => !scanSource(src).mechanisms["require-call"].length);
  assert.deepEqual(bad, []);
});

const REFLECTION_NETWORK = [];
for (const root of GLOBAL_ROOTS) {
  for (const p of reach(root, "eval")) REFLECTION_NETWORK.push([`${p}("1");`, "reflection"]);
  for (const p of reach(root, "Function")) REFLECTION_NETWORK.push([`${p}("return 1")();`, "reflection"]);
  for (const p of reach(root, "fetch")) REFLECTION_NETWORK.push([`${p}("https://example.test");`, "network"]);
}
test(`generated family: ${REFLECTION_NETWORK.length} eval, Function and fetch spellings through a global root are reported`, () => {
  const bad = REFLECTION_NETWORK.filter(([src, m]) => scanSource(src).mechanisms[m].length === 0).map(([s]) => s);
  assert.deepEqual(bad, []);
});

test("global-object uses that cannot reach a terminating or loading member stay OK", () => {
  for (const src of [
    "const o = { self: 1, window: 2, global: 3 };",
    "const x = this.self.foo; const y = foo.window;",
    "const t = typeof window !== 'undefined';",
    "process.stdout.write('x');",
    "globalThis.setTimeout(f, 1);",
    "const l = window.location.href;",
    "const s = a ? b : c;",
    "export const z = (globalThis.process ? 1 : 2);".replace("globalThis.process ? 1 : 2", "1"),
  ]) {
    assert.equal(notOk(scanSource(src)), false, src);
  }
});

// Named regressions from the Reviewer and Codex rounds.
for (const [src, mech] of [
  ['window["process"].exit(1);', null],
  ['self?.["process"].exitCode = 1;', null],
  ['(module)?.require("./other.cjs");', "require-call"],
  ['(module)?.["require"]("./other.cjs");', "require-call"],
]) {
  test(`named regression: ${src}`, () => {
    const r = scanSource(src);
    if (mech) assert.ok(r.mechanisms[mech].length > 0, src);
    else assert.ok(r.terminates.length > 0, src);
  });
}

// No token cutoff: a statement of any length is read to its end.
const manyNames = (n) => Array.from({ length: n }, (_, i) => `name${i}`).join(", ");
for (const n of [200, 2000]) {
  test(`a named import of ${n} specifiers is recorded, not cut off`, () => {
    const r = scanSource(`import { ${manyNames(n)} } from "./far.mjs";\n`);
    assert.deepEqual(specs(r), ["./far.mjs"]);
    assert.equal(r.imports[0].names.length, n);
  });
  test(`a default plus ${n} named import is recorded`, () => {
    const r = scanSource(`import def, { ${manyNames(n)} } from "./far.mjs";\n`);
    assert.deepEqual(specs(r), ["./far.mjs"]);
  });
  test(`a re-export of ${n} names is recorded`, () => {
    const r = scanSource(`export { ${manyNames(n)} } from "./far.mjs";\n`);
    assert.deepEqual(specs(r), ["./far.mjs"]);
  });
}
test("export * as namespace from is a re-export", () => {
  assert.deepEqual(specs(scanSource('export * as ns from "./a.mjs";')), ["./a.mjs"]);
});
for (const src of [
  "import { a, b",
  "import { a, b } fro \"./x.mjs\";",
  "import a b",
  "export * as from",
  "export { a, b",
  "export * from",
]) {
  test(`an unparseable import or export-from is reported, never OK: ${JSON.stringify(src)}`, () => {
    const r = scanSource(src);
    assert.ok(r.mechanisms["ambiguous-token"].length > 0 || r.mechanisms["dynamic-import-computed"].length > 0, src);
  });
}

test("a far-away import crossing a boundary is a violation through checkBoundaries", () => {
  const t = tiny(
    {
      ...FILES,
      "src/core.mjs": `import { ${manyNames(300)} } from "./app.mjs";\nexport function run() {}\n`,
    },
    baseDeclaration(),
  );
  try {
    const v = checkBoundaries(t.dir, t.declaration);
    assert.ok(v.length > 0, JSON.stringify(v));
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
// Round 5: allowlist, not denylist. A string-literal member access is the dotted access; a chain
// rooted at a built-in namespace that is not recognised-benign is reported.
// ---------------------------------------------------------------------------------------------

test("named regression: `import type, { Foo }` binds the default; an edge permitting only Foo rejects it", () => {
  const r = scanSource('import type, { Foo } from "./x.mjs";');
  assert.deepEqual(r.imports[0].names.sort(), ["Foo", "default"]);
  const t = tiny(
    { ...FILES, "src/app.mjs": 'import type, { run } from "./core.mjs";\n' },
    baseDeclaration(),
  );
  assert.deepEqual(kinds(checkBoundaries(t.dir, t.declaration)), ["undeclared-interface"]);
});
test("a type-only import is still read as one", () => {
  assert.deepEqual(scanSource('import type { Foo } from "./x.mjs";').imports[0].names, ["Foo"]);
  assert.deepEqual(scanSource('import type * as ns from "./x.mjs";').imports[0].names, ["*"]);
  assert.deepEqual(scanSource('import type Foo from "./x.mjs";').imports[0].names, ["default"]);
  assert.deepEqual(scanSource('import type from "./x.mjs";').imports[0].names, ["default"]);
});

test("named regression: Object[\"getPrototypeOf\"] and Object[\"setPrototypeOf\"] are reflection", () => {
  for (const src of ['Object["getPrototypeOf"](x);', 'Object["setPrototypeOf"](x, y);', "Object?.['getPrototypeOf'](x);"]) {
    assert.ok(scanSource(src).mechanisms.reflection.length > 0, src);
  }
});

test("named regression: evidence in a segment that merely starts with two dots is in the repository", () => {
  const files = { ...FILES, "..cache/note.md": "evidence\n" };
  const d = baseDeclaration();
  d.members[0].evidence = ["..cache/note.md:1"];
  const t = tiny(files, d);
  assert.deepEqual(kinds(checkBoundaries(t.dir, t.declaration)), []);
  const out = baseDeclaration();
  out.members[0].evidence = ["../outside.md:1"];
  const o = tiny(files, out);
  assert.deepEqual(kinds(checkBoundaries(o.dir, o.declaration)), ["evidence-missing"]);
});

// Every member of every enumerated list, in every spelling of the access: the dotted and the
// bracketed forms must give the same result, and every denylisted member must be reported.
const NAMESPACES = ["globalThis", "global", "window", "self", "process", "module", "Object"];
const MEMBERS = new Set([
  ...SCAN_LISTS.terminating,
  ...SCAN_LISTS.processReach,
  "eval", "Function", "Reflect", "Proxy", "fetch", "WebSocket", "EventSource", "XMLHttpRequest",
  "process", "module", "require", "getPrototypeOf", "setPrototypeOf", "__proto__", "constructor",
  "defineProperty", "getOwnPropertyDescriptor", "getOwnPropertyDescriptors", "prototype",
  ...SCAN_LISTS.object, ...SCAN_LISTS.process, ...SCAN_LISTS.module,
]);
const SPELLINGS = [
  [(ns, m) => `${ns}.${m}(1);`, (ns, m) => `${ns}["${m}"](1);`],
  [(ns, m) => `${ns}?.${m}(1);`, (ns, m) => `${ns}?.["${m}"](1);`],
  [(ns, m) => `(${ns}).${m}(1);`, (ns, m) => `(${ns})["${m}"](1);`],
  [(ns, m) => `(${ns}?.${m})(1);`, (ns, m) => `(${ns}?.["${m}"])(1);`],
  [(ns, m) => `x = ${ns}.${m};`, (ns, m) => `x = ${ns}['${m}'];`],
  [(ns, m) => `const { a } = ${ns}.${m}.b;`, (ns, m) => `const { a } = ${ns}["${m}"].b;`],
];
const shape = (r) => JSON.stringify({ t: r.terminates, m: r.mechanisms });
test(`generated family: ${NAMESPACES.length * MEMBERS.size * SPELLINGS.length} namespace x member x spelling cases, dot equals bracket`, () => {
  const bad = [];
  for (const ns of NAMESPACES) {
    for (const m of MEMBERS) {
      for (const [dot, bracket] of SPELLINGS) {
        if (shape(scanSource(dot(ns, m))) !== shape(scanSource(bracket(ns, m)))) bad.push(`${dot(ns, m)} vs ${bracket(ns, m)}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test("generated family: every denylisted member through its namespace is reported in the bracket form", () => {
  const reported = (src) => notOk(scanSource(src));
  const bad = [];
  for (const m of SCAN_LISTS.terminating) for (const ns of ["process", "globalThis.process", "self.process"]) {
    const src = `${ns}["${m}"](1);`;
    if (!reported(src)) bad.push(src);
  }
  for (const m of SCAN_LISTS.processReach) {
    const src = `process["${m}"]("x");`;
    if (!reported(src)) bad.push(src);
  }
  for (const m of ["getPrototypeOf", "setPrototypeOf", "defineProperty", "getOwnPropertyDescriptor", "getOwnPropertyDescriptors", "prototype", "__proto__", "constructor"]) {
    const src = `Object["${m}"](x);`;
    if (!reported(src)) bad.push(src);
  }
  for (const m of ["eval", "Function", "Reflect", "Proxy", "fetch", "WebSocket", "EventSource", "XMLHttpRequest"]) {
    for (const ns of ["globalThis", "global", "window", "self"]) {
      const src = `${ns}["${m}"]("x");`;
      if (!reported(src)) bad.push(src);
    }
  }
  assert.deepEqual(bad, []);
});

test("allowlist: an unrecognised member of Object, process or module is reported, never OK", () => {
  for (const src of [
    "Object.someFutureMethod(x);",
    'Object["someFutureMethod"](x);',
    "const O = Object; O.keys(x);",
    "const { getPrototypeOf: g } = Object;",
    'const { ["getPrototypeOf"]: g } = Object;',
    "globalThis.Object.defineProperty(a, 'b', {});",
    "process.someFutureMember();",
    "module.someFutureMember;",
  ]) {
    assert.equal(notOk(scanSource(src)), true, src);
  }
});
test("allowlist: recognised-benign Object, process and module uses stay OK", () => {
  for (const src of [
    "Object.keys(x); Object.entries(x); Object.assign({}, x); Object.freeze(x); Object.fromEntries(y);",
    "Object.prototype.hasOwnProperty.call(x, 'k');",
    "const o = Object(x); const p = new Object(); if (a instanceof Object) {}",
    "const { keys, values } = Object;",
    "const o = { Object: 1, process: 2 };",
    "process.argv.slice(2); process.env.HOME; process.cwd(); process.stdout.write('x');",
    "module.exports = { a };",
    "return [\"a\", \"b\"];",
    "const m = { [\"k\"]: 1 };",
  ]) {
    assert.equal(notOk(scanSource(src)), false, src);
  }
});

// ---------------------------------------------------------------------------------------------
// Round 6: binding positions in import/export clauses; specifier resolution before allowances
// ---------------------------------------------------------------------------------------------

test("named regression: clause binding names that spell a global are not references to it", () => {
  for (const src of [
    'export { process } from "./core.mjs";',
    'export { module, Object, require } from "./core.mjs";',
    'export { x as process } from "./core.mjs";',
    'export * as process from "./core.mjs";',
    'export * as Object from "./core.mjs";',
    'import { process } from "./core.mjs";',
    'import { module, Object } from "./core.mjs";',
    'import * as Object from "./core.mjs";',
    'import * as process from "./core.mjs";',
    'import module from "./core.mjs";',
  ]) {
    const r = scanSource(src);
    assert.equal(notOk(r), false, src + JSON.stringify(r.mechanisms));
    assert.equal(r.imports.length, 1, src);
  }
});
test("a real global reference next to a clause is still seen", () => {
  assert.ok(scanSource('export { a } from "./core.mjs"; process.exit(1);').terminates.length > 0);
  assert.ok(scanSource('export { process } from "./core.mjs"; Object.getPrototypeOf(x);').mechanisms.reflection.length > 0);
});

const RES_ROOT = path.resolve(os.tmpdir(), "res-root");
const abs = path.join(RES_ROOT, "src", "core.mjs").split(path.sep).join("/");
const fileUrl = `file:///${abs.replace(/^\//, "")}`;
const RESOLUTIONS = [
  // [specifier, kind, target]
  ["./core.mjs", "internal", "src/core.mjs"],
  ["../src/core.mjs", "internal", "src/core.mjs"],
  ["./core.mjs?v=1", "internal", "src/core.mjs"],
  ["./core.mjs#frag", "internal", "src/core.mjs"],
  ["./co%72e.mjs", "internal", "src/core.mjs"],
  ["./c%6Fre.mjs?x#y", "internal", "src/core.mjs"],
  ["./..%2Fsrc%2Fcore.mjs", "unresolved"],
  ["../../outside.mjs", "unresolved"],
  [".\core.mjs", "unresolved"],
  [fileUrl, "internal", "src/core.mjs"],
  [`${fileUrl}?q=1#h`, "internal", "src/core.mjs"],
  [fileUrl.replace("core", "c%6Fre"), "internal", "src/core.mjs"],
  ["file:///elsewhere/other.mjs", "external"],
  ["node:fs", "external"],
  ["fs", "external"],
  ["lodash", "external"],
  ["@acme/pkg/x", "external"],
  ["data:text/javascript,export default 1", "external"],
  ["https://example.test/x.mjs", "external"],
];
for (const [spec, kind, target] of RESOLUTIONS) {
  test(`specifier resolution: ${spec} is ${kind}${target ? " " + target : ""}`, () => {
    const r = resolveSpecifier(RES_ROOT, "src/app.mjs", spec);
    assert.equal(r.kind, kind, JSON.stringify(r));
    if (target) assert.equal(r.target, target);
  });
}

test("named regression: an absolute or file: specifier naming a repository file is checked, whatever external prefixes allow", () => {
  const file = (name) => path.join("PLACEHOLDER", name);
  for (const mk of [(d) => `file://${pathToFileURLish(d)}/src/core.mjs`, (d) => `${d.split(path.sep).join("/").replace(/^[A-Za-z]:/, "")}/src/core.mjs`]) {
    const d = baseDeclaration();
    d.external.allowPrefixes = ["node:", "file:", "/"];
    const t = tiny({ ...FILES }, d);
    try {
      writeFileSync(path.join(t.dir, "src/app.mjs"), `import { other } from ${JSON.stringify(mk(t.dir))};\n`);
      const v = checkBoundaries(t.dir, t.declaration);
      assert.deepEqual(kinds(v), ["undeclared-interface"], JSON.stringify(v));
    } finally {
      rmSync(t.dir, { recursive: true, force: true });
    }
  }
  void file;
});
function pathToFileURLish(d) {
  const p = d.split(path.sep).join("/");
  return p.startsWith("/") ? p : `/${p}`;
}
test("an absolute specifier outside the repository stays external and obeys the prefixes", () => {
  const d = baseDeclaration();
  d.edges = [];
  const t = tiny(FILES, d);
  try {
    writeFileSync(path.join(t.dir, "src/app.mjs"), 'import "file:///elsewhere/x.mjs";\n');
    assert.deepEqual(kinds(checkBoundaries(t.dir, t.declaration)), ["undeclared-external"]);
    t.declaration.external.allowPrefixes = ["node:", "file:"];
    assert.deepEqual(kinds(checkBoundaries(t.dir, t.declaration)), []);
  } finally {
    rmSync(t.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------------------------
// Round 7: destructuring from process and the global objects; re-export clauses are not calls
// ---------------------------------------------------------------------------------------------

test("named regression: destructuring a loader member from process is a require-call", () => {
  const r = scanSource('const { mainModule } = process; mainModule.require("./core.mjs");');
  assert.ok(r.mechanisms["require-call"].length > 0);
  for (const src of ['process.mainModule.require("./c.mjs");', 'require.main.require("./c.mjs");', 'module.parent.require("./c.mjs");']) {
    assert.ok(scanSource(src).mechanisms["require-call"].length > 0, src);
  }
});
test("named regression: re-exporting a terminating name is a binding, not a termination", () => {
  for (const src of ['export { exit } from "node:process";', 'export { exit as quit, kill } from "process";']) {
    assert.deepEqual(scanSource(src).terminates, [], src);
  }
  assert.ok(scanSource('export { default } from "node:process";').mechanisms["termination-indirect"].length > 0);
  assert.ok(scanSource('export * as p from "node:process";').mechanisms["termination-indirect"].length > 0);
  assert.ok(scanSource('import { exit } from "node:process"; exit(1);').terminates.length > 0);
  assert.ok(scanSource('const { exit } = await import("node:process"); exit(1);').terminates.length > 0);
});
test(`generated family: destructuring each enumerated member from its namespace is the same mechanism as the dotted access`, () => {
  const bad = [];
  const members = {
    process: [...SCAN_LISTS.terminating, ...SCAN_LISTS.processReach, "someFutureMember", ...SCAN_LISTS.process],
    globalThis: ["eval", "Function", "Reflect", "Proxy", "fetch", "WebSocket", "EventSource", "XMLHttpRequest", "require", "module", "process"],
  };
  for (const [ns, list] of Object.entries(members)) {
    for (const ns2 of ns === "globalThis" ? ["globalThis", "global", "window", "self"] : [ns]) {
      for (const m of list) {
        const d = scanSource(`const { ${m} } = ${ns2};`);
        const dot = scanSource(`${ns2}.${m};`);
        const fire = (r) => [r.terminates.length > 0, ...Object.entries(r.mechanisms).filter(([k]) => k !== "ambiguous-token").map(([, v]) => v.length > 0)];
        const df = fire(d);
        const tf = fire(dot);
        // anything the dotted form reports, the destructuring reports too
        if (tf.some((x, i) => x && !df[i]) && !df.some(Boolean)) bad.push(`const { ${m} } = ${ns2}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

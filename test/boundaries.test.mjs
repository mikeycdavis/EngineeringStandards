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
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
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
  DETECTED_MECHANISMS,
} from "../scripts/boundaries.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = JSON.parse(readFileSync(path.join(ROOT, "schemas/architecture-boundaries.schema.json"), "utf8"));
const DECLARATION_TEXT = readFileSync(path.join(ROOT, DECLARATION_FILE), "utf8");
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

/**
 * The boundary declaration is checked, not decorative (Standard 51 R2, ADR 0018).
 *
 * Four things are pinned here:
 *   1. this repository's own declaration is well-formed and its tree conforms to it;
 *   2. an undeclared cross-boundary import, an undeclared interface, an unowned file, an undeclared
 *      subprocess site, a process termination below the CLI boundary and an undeclared external
 *      dependency each FAIL the check (mutation-tested on a copy of the real scripts/);
 *   3. a structurally inconsistent declaration (overlap, unknown member, self edge, cycle) is rejected;
 *   4. the declaration is additive: with and without it, `validate` reports the same bytes and exit.
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

/** A copy of the real scripts/ and policy, so a mutation never touches the working tree. */
function copyOfRepo() {
  const dir = tmp();
  cpSync(path.join(ROOT, "scripts"), path.join(dir, "scripts"), { recursive: true });
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

/** A tiny repository with its own declaration, for the cases the real tree cannot express. */
function tiny(files, declaration) {
  const dir = tmp();
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), text);
  }
  return { dir, declaration };
}

const baseDeclaration = () => ({
  observation: {
    method: "static-import-graph",
    roots: ["src"],
    extensions: [".mjs"],
    cannotObserve: [{ mechanism: "subprocess", reason: "only imports are seen", knownSites: [] }],
  },
  members: [
    { id: "core", kind: "layer", description: "d", paths: ["src/core.mjs"], evidence: ["NOTES.md:1"] },
    { id: "app", kind: "layer", description: "d", paths: ["src/app.mjs"], evidence: ["NOTES.md:1"] },
  ],
  edges: [{ from: "app", to: "core", via: ["run"], evidence: ["NOTES.md:1"] }],
  external: { allowPrefixes: ["node:"], evidence: ["NOTES.md:1"] },
});

const kinds = (violations) => violations.map((v) => v.kind).sort();

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

test("every scripts/*.mjs file is owned and every observed edge is declared", () => {
  const scan = scanRepository(ROOT, DECLARATION);
  assert.ok(scan.files.length >= 22, "the scan must see the scripts it is meant to govern");
  assert.deepEqual(checkBoundaries(ROOT, DECLARATION, scan), []);
});

test("the declaration states what it cannot observe", () => {
  const names = DECLARATION.observation.cannotObserve.map((u) => u.mechanism);
  for (const required of ["reflection", "generated-code", "subprocess", "network", "dynamic-import-computed"]) {
    assert.ok(names.includes(required), `cannotObserve must list ${required}`);
  }
});

test("CLI: exit 0 and OK on this repository; --json carries the observation limits", () => {
  const r = node(["scripts/boundaries-check.mjs", "--json"]);
  assert.equal(r.code, 0, r.out + r.err);
  const report = JSON.parse(r.out);
  assert.equal(report.status, "OK");
  assert.deepEqual(report.violations, []);
  assert.ok(report.cannotObserve.length >= 5);
});

test("MUTATION: an undeclared cross-boundary import in the real tree fails the check", () => {
  const dir = copyOfRepo();
  try {
    // The catalog layer reaching up to the evaluator is exactly the three-way-separation breach.
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

test("MUTATION: a new unowned file, a new subprocess site and a termination below the CLI boundary all fail", () => {
  const dir = copyOfRepo();
  try {
    writeFileSync(path.join(dir, "scripts/new-module.mjs"), "export const x = 1;\n");
    appendFileSync(path.join(dir, "scripts/reviews.mjs"), '\nprocess.exit(3);\n');
    appendFileSync(path.join(dir, "scripts/yaml.mjs"), '\nimport { execSync } from "node:child_process";\n');
    appendFileSync(path.join(dir, "scripts/jsonschema.mjs"), '\nimport left from "left-pad";\n');
    const v = checkBoundaries(dir, DECLARATION);
    assert.deepEqual(
      kinds(v),
      ["process-termination", "undeclared-external", "undeclared-subprocess", "unowned-file"],
      JSON.stringify(v),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a conforming tiny repository passes; each departure is a distinct violation", () => {
  const files = {
    "NOTES.md": "boundary notes\n",
    "src/core.mjs": "export function run() {}\nexport function other() {}\n",
    "src/app.mjs": 'import {\n  run,\n} from "./core.mjs";\nexport const go = run;\n',
  };
  const ok = tiny(files, baseDeclaration());
  assert.deepEqual(checkBoundaries(ok.dir, ok.declaration), [], "multi-line imports are read");

  const reverse = tiny({ ...files, "src/core.mjs": 'import { go } from "./app.mjs";\nexport function run() {}\n' }, baseDeclaration());
  assert.deepEqual(kinds(checkBoundaries(reverse.dir, reverse.declaration)), ["undeclared-edge"]);

  const wide = tiny({ ...files, "src/app.mjs": 'import { run, other } from "./core.mjs";\n' }, baseDeclaration());
  assert.deepEqual(kinds(checkBoundaries(wide.dir, wide.declaration)), ["undeclared-interface"]);

  const star = tiny({ ...files, "src/app.mjs": 'import * as core from "./core.mjs";\n' }, baseDeclaration());
  assert.deepEqual(kinds(checkBoundaries(star.dir, star.declaration)), ["undeclared-interface"]);

  const badEvidence = baseDeclaration();
  badEvidence.members[0].evidence = ["MISSING.md:1", "NOTES.md:99"];
  const ev = tiny(files, badEvidence);
  assert.deepEqual(kinds(checkBoundaries(ev.dir, ev.declaration)), ["evidence-missing", "evidence-out-of-range"]);

  const declaredMissing = baseDeclaration();
  declaredMissing.observation.cannotObserve[0].knownSites = ["src/app.mjs"];
  const sub = tiny(files, declaredMissing);
  assert.deepEqual(kinds(checkBoundaries(sub.dir, sub.declaration)), ["subprocess-site-missing"]);
});

test("a directory path owns everything beneath it", () => {
  const decl = baseDeclaration();
  decl.members[0].paths = ["src/lib/"];
  const t = tiny(
    { "NOTES.md": "x\n", "src/lib/core.mjs": "export function run() {}\n", "src/app.mjs": 'import { run } from "./lib/core.mjs";\n' },
    decl,
  );
  assert.deepEqual(checkBoundaries(t.dir, t.declaration), []);
});

test("comments and strings that mention an import are not imports", () => {
  const scan = scanSource(
    [
      "// import { x } from './nope.mjs';",
      " * import { y } from './nope2.mjs';",
      'const s = "import z from \'./nope3.mjs\'";',
      'import { real } from "./real.mjs";',
    ].join("\n"),
  );
  assert.deepEqual(scan.imports.map((i) => i.spec), ["./real.mjs"]);
});

test("a computed dynamic import is counted as unobserved, not resolved", () => {
  const scan = scanSource('const m = await import(`./${name}.mjs`);\n');
  assert.deepEqual(scan.imports, []);
  assert.deepEqual(scan.computedDynamic, [1]);
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
});

test("policy and validate reject an inconsistent or schema-invalid declaration beside the policy", () => {
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
    const p2 = node(["scripts/policy.mjs", path.join(dir, "project-policy.yml")]);
    assert.equal(p2.code, 2, "a schema-invalid declaration is rejected");
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

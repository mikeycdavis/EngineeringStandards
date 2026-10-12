/**
 * Boundary declaration: structural validation and the static-import-graph check (Standard 51 R2,
 * ADR 0018).
 *
 * A library. It never terminates the process and never reads project-policy.yml itself; the caller
 * hands it the parsed `boundaries` object. The CLI is `scripts/boundaries-check.mjs`.
 *
 * WHAT THIS OBSERVES, AND NOTHING ELSE. String-literal `import ... from "x"`, `export ... from "x"`,
 * bare `import "x"` at the start of a line, and `import("x")` calls with a string literal, in files
 * under the declared roots with a declared extension. Plus two text scans per file: a call that
 * terminates the process, and an import of `node:child_process`. It cannot see computed import
 * specifiers, reflection, generated or evaluated code, what a subprocess executes, network paths,
 * data-access paths, or files outside the declared roots. Those are listed by the declaration
 * itself under `observation.cannotObserve` and are excluded from any claim made from this check.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./yaml.mjs";
import { validate } from "./jsonschema.mjs";

/**
 * The declaration's conventional name and location: a root-level file beside project-policy.yml,
 * discovered by name. A consumer opts in by creating it; nothing else changes (ADR 0018).
 */
export const DECLARATION_FILE = "architecture-boundaries.yml";

const DECLARATION_SCHEMA = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas/architecture-boundaries.schema.json",
);

/**
 * Discover and load the declaration in `dir`.
 *
 * Returns `{ state: "absent" }` when there is no such file (the caller must then change nothing),
 * `{ state: "invalid", errors }` when it is unreadable, unparseable, schema-invalid or structurally
 * inconsistent, and `{ state: "ok", declaration }` otherwise.
 */
export function loadDeclaration(dir) {
  const file = path.join(dir, DECLARATION_FILE);
  if (!existsSync(file)) return { state: "absent" };
  let declaration;
  try {
    declaration = parseYaml(readFileSync(file, "utf8"));
    const schema = JSON.parse(readFileSync(DECLARATION_SCHEMA, "utf8"));
    const errors = validate(declaration, schema);
    if (errors.length > 0) {
      return { state: "invalid", errors: errors.map((e) => `${e.path || "(document)"} ${e.message}`) };
    }
  } catch (error) {
    return { state: "invalid", errors: [`${DECLARATION_FILE} could not be read: ${error.message}`] };
  }
  const problems = declarationProblems(declaration);
  if (problems.length > 0) return { state: "invalid", errors: problems };
  return { state: "ok", declaration };
}

const DIRECTORY = "/";
// Assembled so that this file does not read as a subprocess site to its own scan.
const CHILD_PROCESS = "node:" + "child_process";

/** Normalise a declared path: files stay as written, directories keep a trailing slash. */
function isDirectoryPath(p) {
  return p.endsWith(DIRECTORY);
}

function covers(owner, file) {
  return isDirectoryPath(owner) ? file.startsWith(owner) : file === owner;
}

function overlaps(a, b) {
  return covers(a, b) || covers(b, a) || (isDirectoryPath(a) && isDirectoryPath(b) && (a.startsWith(b) || b.startsWith(a)));
}

/**
 * Structural problems in a declaration that the JSON schema cannot express and that need no
 * filesystem. Every entry is an error: a declaration with any of these cannot be enforced.
 *
 * Decided and documented (ADR 0018): overlapping member paths are errors (a file with two owners has
 * no direction to check), unknown edge endpoints are errors, a self edge is an error (intra-member
 * imports are always permitted, so one would be noise), duplicate members and duplicate edges are
 * errors, and a cycle among declared edges is an error because a declared circular dependency is the
 * very failure R2 names.
 */
export function declarationProblems(declaration) {
  const problems = [];
  if (declaration === undefined || declaration === null) return problems;
  const members = Array.isArray(declaration.members) ? declaration.members : [];
  const edges = Array.isArray(declaration.edges) ? declaration.edges : [];

  const ids = new Set();
  for (const m of members) {
    if (ids.has(m.id)) problems.push(`member '${m.id}' is declared more than once`);
    ids.add(m.id);
  }

  for (const [i, a] of members.entries()) {
    for (const b of members.slice(i + 1)) {
      for (const pa of a.paths ?? []) {
        for (const pb of b.paths ?? []) {
          if (overlaps(pa, pb)) {
            problems.push(`members '${a.id}' and '${b.id}' both own '${pa}' / '${pb}' (overlapping paths are not allowed)`);
          }
        }
      }
    }
    const own = a.paths ?? [];
    for (const [j, pa] of own.entries()) {
      for (const pb of own.slice(j + 1)) {
        if (pa === pb) problems.push(`member '${a.id}' lists '${pa}' twice`);
      }
    }
  }

  const seen = new Set();
  for (const e of edges) {
    if (!ids.has(e.from)) problems.push(`edge ${e.from} -> ${e.to}: unknown member '${e.from}'`);
    if (!ids.has(e.to)) problems.push(`edge ${e.from} -> ${e.to}: unknown member '${e.to}'`);
    if (e.from === e.to) problems.push(`edge ${e.from} -> ${e.to}: a member's own imports are always permitted; declare no self edge`);
    const key = `${e.from}->${e.to}`;
    if (seen.has(key)) problems.push(`edge ${key} is declared more than once`);
    seen.add(key);
  }

  // Cycle among declared edges.
  const graph = new Map();
  for (const e of edges) {
    if (!graph.has(e.from)) graph.set(e.from, []);
    graph.get(e.from).push(e.to);
  }
  const state = new Map();
  const visit = (n, trail) => {
    state.set(n, 1);
    for (const t of graph.get(n) ?? []) {
      if (state.get(t) === 1) problems.push(`declared edges form a cycle: ${[...trail, n, t].join(" -> ")}`);
      else if (!state.get(t)) visit(t, [...trail, n]);
    }
    state.set(n, 2);
  };
  for (const n of graph.keys()) if (!state.get(n)) visit(n, []);

  const mechanisms = new Set();
  for (const u of declaration.observation?.cannotObserve ?? []) {
    if (mechanisms.has(u.mechanism)) problems.push(`observation.cannotObserve lists '${u.mechanism}' twice`);
    mechanisms.add(u.mechanism);
  }
  return problems;
}

/** Repository-relative, forward-slash files under `root` for the declared roots and extensions. */
export function inScopeFiles(repoRoot, observation) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(repoRoot, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs).sort()) {
      const child = path.posix.join(rel, name);
      const st = statSync(path.join(repoRoot, child));
      if (st.isDirectory()) {
        if (name === "node_modules" || name === ".git") continue;
        walk(child);
      } else if (observation.extensions.some((ext) => name.endsWith(ext))) {
        out.push(child);
      }
    }
  };
  for (const r of observation.roots) walk(r.replace(/\/$/, ""));
  return out.sort();
}

const STATIC_IMPORT = /^(?:import|export)\b([^;'"]*?)\bfrom\s*["']([^"']+)["']/gm;
const BARE_IMPORT = /^import\s*["']([^"']+)["']/gm;
const DYNAMIC_IMPORT = /\bimport\(\s*(["'])([^"']+)\1\s*\)/;
const DYNAMIC_ANY = /\bimport\(/;
const DESTRUCTURED_DYNAMIC = /const\s*\{([^}]*)\}\s*=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/;

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function namedImports(clause) {
  const c = clause.trim();
  if (c.startsWith("*") || /\*\s*as\b/.test(c)) return ["*"];
  const names = [];
  const braces = /\{([^}]*)\}/.exec(c);
  const outside = braces ? c.replace(braces[0], "") : c;
  if (/[A-Za-z_$]/.test(outside.replace(/^\s*(type)\b/, ""))) names.push("default");
  if (braces) {
    for (const part of braces[1].split(",")) {
      const n = part.trim().split(/\s+as\s+/)[0].trim();
      if (n) names.push(n);
    }
  }
  return names.length > 0 ? names : ["*"];
}

function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/** Scan one file's text. Pure; exported so tests can exercise it without a repository. */
export function scanSource(text) {
  const imports = [];
  for (const m of text.matchAll(STATIC_IMPORT)) {
    imports.push({ spec: m[2], kind: "static", names: namedImports(m[1]), line: lineOf(text, m.index) });
  }
  for (const m of text.matchAll(BARE_IMPORT)) {
    imports.push({ spec: m[1], kind: "static", names: [], line: lineOf(text, m.index) });
  }
  const terminates = [];
  const childProcess = [];
  const computedDynamic = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    if (isCommentLine(raw)) return;
    const d = DYNAMIC_IMPORT.exec(raw);
    if (d) {
      const destructured = DESTRUCTURED_DYNAMIC.exec(raw);
      const names = destructured
        ? destructured[1].split(",").map((s) => s.trim().split(/\s*:\s*/)[0]).filter(Boolean)
        : ["*"];
      imports.push({ spec: d[2], kind: "dynamic", names, line: i + 1 });
    } else if (DYNAMIC_ANY.test(raw) && !/^\s*(import|export)\b/.test(raw)) {
      computedDynamic.push(i + 1);
    }
    if (/\bprocess\.(exit|exitCode)\b/.test(raw)) terminates.push(i + 1);
    if (raw.includes(CHILD_PROCESS) && /\b(import|from|require)\b/.test(raw)) childProcess.push(i + 1);
  });
  return { imports, terminates, childProcess, computedDynamic };
}

/** Read and scan every in-scope file. */
export function scanRepository(repoRoot, declaration) {
  const files = inScopeFiles(repoRoot, declaration.observation);
  const scanned = new Map();
  for (const f of files) scanned.set(f, scanSource(readFileSync(path.join(repoRoot, f), "utf8")));
  return { files, scanned };
}

function ownerOf(members, file) {
  return members.find((m) => m.paths.some((p) => covers(p, file))) ?? null;
}

function parseEvidence(e) {
  const i = e.lastIndexOf(":");
  return { file: e.slice(0, i), line: Number(e.slice(i + 1)) };
}

/**
 * Check a scan against a declaration. Returns violations; an empty array means that, within the
 * observation limits the declaration states, every observed edge is permitted.
 *
 * Violation kinds: unowned-file, undeclared-edge, undeclared-interface, undeclared-external,
 * unresolved-import, process-termination, undeclared-subprocess, subprocess-site-missing,
 * evidence-missing, evidence-out-of-range.
 */
export function checkBoundaries(repoRoot, declaration, scan = scanRepository(repoRoot, declaration)) {
  const violations = [];
  const members = declaration.members;
  const edgeMap = new Map(declaration.edges.map((e) => [`${e.from}->${e.to}`, e]));
  const fileSet = new Set(scan.files);
  const allowPrefixes = declaration.external?.allowPrefixes ?? [];

  for (const file of scan.files) {
    const owner = ownerOf(members, file);
    const info = scan.scanned.get(file);
    if (!owner) {
      violations.push({ kind: "unowned-file", file, line: 1, message: `${file} is inside the observed roots but owned by no member` });
      continue;
    }
    for (const imp of info.imports) {
      if (imp.spec.startsWith(".")) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), imp.spec));
        if (!fileSet.has(target)) {
          violations.push({ kind: "unresolved-import", file, line: imp.line, message: `${file}:${imp.line} imports '${imp.spec}', which is not an in-scope file` });
          continue;
        }
        const targetOwner = ownerOf(members, target);
        if (!targetOwner || targetOwner.id === owner.id) continue;
        const edge = edgeMap.get(`${owner.id}->${targetOwner.id}`);
        if (!edge) {
          violations.push({
            kind: "undeclared-edge",
            file,
            line: imp.line,
            message: `${file}:${imp.line} (${owner.id}) imports ${target} (${targetOwner.id}); no edge ${owner.id} -> ${targetOwner.id} is declared`,
          });
        } else if (!edge.via.includes("*")) {
          const bad = imp.names.filter((n) => !edge.via.includes(n));
          if (bad.length > 0 || imp.names.includes("*")) {
            violations.push({
              kind: "undeclared-interface",
              file,
              line: imp.line,
              message: `${file}:${imp.line} imports ${(bad.length ? bad : ["*"]).join(", ")} from ${target}; edge ${owner.id} -> ${targetOwner.id} permits only ${edge.via.join(", ")}`,
            });
          }
        }
      } else if (declaration.external && !allowPrefixes.some((p) => imp.spec.startsWith(p))) {
        violations.push({ kind: "undeclared-external", file, line: imp.line, message: `${file}:${imp.line} imports '${imp.spec}', outside the allowed prefixes ${allowPrefixes.join(", ") || "(none)"}` });
      }
    }
    if (info.terminates.length > 0 && owner.processExit !== "permitted") {
      violations.push({
        kind: "process-termination",
        file,
        line: info.terminates[0],
        message: `${file}:${info.terminates[0]} terminates the process but member '${owner.id}' does not declare processExit: permitted`,
      });
    }
  }

  const subprocessDecl = (declaration.observation.cannotObserve ?? []).find((u) => u.mechanism === "subprocess");
  if (subprocessDecl?.knownSites) {
    const declared = new Set(subprocessDecl.knownSites);
    const observed = new Set(scan.files.filter((f) => scan.scanned.get(f).childProcess.length > 0));
    for (const f of observed) {
      if (!declared.has(f)) violations.push({ kind: "undeclared-subprocess", file: f, line: scan.scanned.get(f).childProcess[0], message: `${f} uses the child-process module but is not a declared subprocess site` });
    }
    for (const f of declared) {
      if (!observed.has(f)) violations.push({ kind: "subprocess-site-missing", file: f, line: 1, message: `${f} is declared as a subprocess site but does not use the child-process module` });
    }
  }

  const evidence = [
    ...members.flatMap((m) => m.evidence.map((e) => ({ owner: `member ${m.id}`, e }))),
    ...declaration.edges.flatMap((x) => x.evidence.map((e) => ({ owner: `edge ${x.from} -> ${x.to}`, e }))),
    ...(declaration.external?.evidence ?? []).map((e) => ({ owner: "external", e })),
  ];
  for (const { owner, e } of evidence) {
    const { file, line } = parseEvidence(e);
    const abs = path.join(repoRoot, file);
    if (!existsSync(abs)) {
      violations.push({ kind: "evidence-missing", file, line, message: `${owner}: evidence '${e}' names a file that does not exist` });
    } else if (line > readFileSync(abs, "utf8").split(/\r?\n/).length) {
      violations.push({ kind: "evidence-out-of-range", file, line, message: `${owner}: evidence '${e}' is past the end of the file` });
    }
  }
  return violations;
}

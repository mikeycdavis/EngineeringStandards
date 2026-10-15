/**
 * Boundary declaration: structural validation and the static-import-graph check (Standard 51 R2,
 * ADR 0018).
 *
 * A library. It never terminates the process and never reads project-policy.yml; callers hand it a
 * parsed declaration, or call loadDeclaration(dir) to discover `architecture-boundaries.yml`.
 * The CLI is `scripts/boundaries-check.mjs`.
 *
 * FAIL CLOSED. The scanner is a small tokenizer, not a set of line regexes: comments, strings,
 * template literals and regex literals are recognised, so an apostrophe in a comment or a
 * process-exit call inside a string cannot mislead it, and an import split across lines or sharing
 * a line with another is read like any other. Where it meets a construct that can reach a module,
 * end the process or leave the repository and it cannot classify the target, it does not skip it:
 * it records the construct under a named mechanism (see MECHANISMS), and the check reports
 * `unobserved-mechanism` unless the declaration lists that file as a known site of the mechanism.
 * A result of OK therefore means: every observed edge is permitted AND every unclassifiable
 * construct was acknowledged by the declaration.
 *
 * WHAT STILL CANNOT BE SEEN, and is listed by the declaration as excluded: what a subprocess runs,
 * network traffic, which data a module reads or writes, generated or evaluated code beyond the
 * constructs named here, shell and workflow scripts, files outside the declared roots, a module
 * reached by a string built elsewhere and handed to something other than import(), and aliases of
 * built-in objects other than the ones named here.
 */

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { builtinModules } from "node:module";
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
 * The closed vocabulary of mechanisms a declaration must list under `observation.cannotObserve`.
 * DETECTED mechanisms are found by the scanner and compared with the declared `knownSites`;
 * the rest are declarative: they state a limit the scanner has no way to measure.
 */
export const DETECTED_MECHANISMS = [
  "dynamic-import-computed",
  "require-call",
  "import-meta-resolve",
  "url-module-path",
  "termination-indirect",
  "subprocess",
  "reflection",
  "network",
  "ambiguous-token",
];
export const DECLARATIVE_MECHANISMS = ["generated-code", "data-access", "shell-and-workflow-scripts", "outside-roots"];
export const MECHANISMS = [...DETECTED_MECHANISMS, ...DECLARATIVE_MECHANISMS];

const isDirectoryPath = (p) => p.endsWith("/");
const covers = (owner, file) => (isDirectoryPath(owner) ? file.startsWith(owner) : file === owner);
const overlaps = (a, b) => covers(a, b) || covers(b, a);
const hasDotSegment = (p) => p.split("/").some((s) => s === ".." || s === ".");

/**
 * Structural problems the JSON schema cannot express and that need no filesystem. Every entry is an
 * error: a declaration with any of these cannot be enforced.
 *
 * Decided and documented (ADR 0018): overlapping member paths are errors; unknown edge endpoints,
 * self edges, duplicate members and duplicate edges are errors; a cycle among declared edges is an
 * error; `.` or `..` segments in any path are errors; and `cannotObserve` must list every
 * mechanism of the closed vocabulary exactly once, each with an explicit `knownSites`.
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

  const evidenceFiles = [
    ...members.flatMap((m) => m.evidence ?? []),
    ...edges.flatMap((e) => e.evidence ?? []),
    ...(declaration.external?.evidence ?? []),
  ].map((e) => e.slice(0, e.lastIndexOf(":")));
  const allPaths = [
    ...members.flatMap((m) => m.paths ?? []),
    ...(declaration.observation?.roots ?? []),
    ...(declaration.observation?.cannotObserve ?? []).flatMap((u) => u.knownSites ?? []),
    ...evidenceFiles,
  ];
  for (const p of allPaths) {
    if (p.startsWith("/") || p.includes("\\") || /^[A-Za-z]:/.test(p) || hasDotSegment(p.replace(/\/$/, ""))) {
      problems.push(`path '${p}' must be repository-relative with no '.' or '..' segment`);
    }
  }

  const declared = new Map();
  for (const u of declaration.observation?.cannotObserve ?? []) {
    if (!MECHANISMS.includes(u.mechanism)) problems.push(`observation.cannotObserve lists unknown mechanism '${u.mechanism}'`);
    if (declared.has(u.mechanism)) problems.push(`observation.cannotObserve lists '${u.mechanism}' twice`);
    declared.set(u.mechanism, u);
    if (!Array.isArray(u.knownSites)) problems.push(`mechanism '${u.mechanism}' must declare knownSites (an explicit empty list is allowed)`);
  }
  for (const m of MECHANISMS) {
    if (!declared.has(m)) problems.push(`observation.cannotObserve must list the mechanism '${m}'`);
  }
  return problems;
}

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

/**
 * Repository-relative, forward-slash files under `repoRoot` for the declared roots and extensions.
 *
 * A root may be a directory or a single file. Symbolic links are never followed: a link met inside
 * a root is recorded on the returned array's `links` and reported by checkBoundaries as
 * `symlink-not-followed`, so a link cannot recurse, and cannot be read as a repository-relative file
 * when it points outside the repository. Windows junctions that lstat reports as directories are
 * not detected as links; that is a stated limit (ADR 0018).
 */
export function inScopeFiles(repoRoot, observation) {
  const out = [];
  const links = [];
  // A root reached through a symlinked ancestor (linked/src, linked a link) is a link too.
  const linkedAncestor = (rel) => {
    const parts = rel.split("/").filter((x) => x && x !== ".");
    for (let n = 1; n < parts.length; n++) {
      const prefix = parts.slice(0, n).join("/");
      try {
        if (lstatSync(path.join(repoRoot, prefix)).isSymbolicLink()) return prefix;
      } catch {
        return null;
      }
    }
    return null;
  };
  const walk = (rel, root = false) => {
    if (root) {
      const link = linkedAncestor(rel);
      if (link) {
        links.push(link);
        return;
      }
    }
    const abs = path.join(repoRoot, rel);
    let st;
    try {
      st = lstatSync(abs);
    } catch {
      return;
    }
    if (st.isSymbolicLink()) {
      links.push(rel);
      return;
    }
    if (st.isFile()) {
      if (observation.extensions.some((ext) => rel.endsWith(ext))) out.push(rel);
      return;
    }
    if (!st.isDirectory()) return;
    for (const name of readdirSync(abs).sort()) {
      if (name === "node_modules" || name === ".git") continue;
      walk(path.posix.join(rel, name));
    }
  };
  for (const r of observation.roots) walk(r.replace(/\/$/, "") || ".", true);
  const result = [...new Set(out)].sort();
  result.links = [...new Set(links)].sort();
  return result;
}

// ---------------------------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------------------------

// Stands in a destructuring pattern for a key that is not a plain name (computed or rest).
const COMPUTED_KEY = "<computed-key>";

const REGEX_AFTER_KEYWORD = new Set([
  "return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await",
]);
// ASCII identifier characters, and the Unicode ID_Start / ID_Continue classes for the rest. A
// non-ASCII character that is neither whitespace nor an identifier character is not guessed at: it
// is recorded as unclassified, which the scanner reports as ambiguous-token.
const ID_START_UNICODE = /[\p{ID_Start}]/u;
const ID_CONTINUE_UNICODE = /[\p{ID_Continue}\u200c\u200d]/u;
const isAsciiIdPart = (c) => /[A-Za-z0-9_$]/.test(c);

/**
 * Tokens: { t: "id" | "str" | "num" | "re" | "tmpl" | "p", v, line }. Comments are dropped. A
 * template literal yields the tokens of its ${...} expressions followed by one "tmpl" token.
 */
export function tokenize(src, ambiguous = "regex") {
  const toks = [];
  toks.ambiguousLines = [];
  toks.unclassifiedLines = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  if (src.startsWith("#!")) while (i < n && src[i] !== "\n") i++;

  function regexAllowed() {
    const prev = toks[toks.length - 1];
    if (!prev) return true;
    if (prev.t === "p") {
      if (prev.v === "]") return false;
      const before = toks[toks.length - 2];
      const postfix = (prev.v === "+" || prev.v === "-") && before?.t === "p" && before.v === prev.v;
      if (prev.v === ")" || prev.v === "}" || postfix) {
        // A slash here may open a regex literal or divide; the scanner reads both ways and
        // reports ambiguous-token if the two readings disagree about modules or terminations.
        toks.ambiguousLines.push(line);
        return ambiguous === "regex";
      }
      return true;
    }
    if (prev.t === "id") return REGEX_AFTER_KEYWORD.has(prev.v);
    return false;
  }

  function run(nested) {
    let depth = 0;
    while (i < n) {
      const c = src[i];
      if (c === "\n") { line++; i++; continue; }
      if (c === " " || c === "\t" || c === "\r" || c === "\f" || c === "\v" || c === " " || c === "﻿") { i++; continue; }
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") {
        i += 2;
        while (i < n && !(src[i] === "*" && src[i + 1] === "/")) { if (src[i] === "\n") line++; i++; }
        i += 2;
        continue;
      }
      if (c === '"' || c === "'") {
        const start = line;
        let v = "";
        i++;
        while (i < n && src[i] !== c) {
          if (src[i] === "\\") {
            if (src[i + 1] === "\n") line++;
            v += src[i + 1] ?? "";
            i += 2;
            continue;
          }
          if (src[i] === "\n") break;
          v += src[i];
          i++;
        }
        i++;
        toks.push({ t: "str", v, line: start });
        continue;
      }
      if (c === "`") {
        const start = line;
        i++;
        while (i < n) {
          const ch = src[i];
          if (ch === "\\") { if (src[i + 1] === "\n") line++; i += 2; continue; }
          if (ch === "`") { i++; break; }
          if (ch === "$" && src[i + 1] === "{") { i += 2; run(true); continue; }
          if (ch === "\n") line++;
          i++;
        }
        toks.push({ t: "tmpl", v: "", line: start });
        continue;
      }
      if (c === "/" && regexAllowed()) {
        const start = line;
        i++;
        let inClass = false;
        while (i < n) {
          const ch = src[i];
          if (ch === "\\") { i += 2; continue; }
          if (ch === "\n") break;
          if (ch === "[") inClass = true;
          else if (ch === "]") inClass = false;
          else if (ch === "/" && !inClass) { i++; break; }
          i++;
        }
        while (i < n && isAsciiIdPart(src[i])) i++;
        toks.push({ t: "re", v: "", line: start });
        continue;
      }
      if (c > "\u007f") {
        const cp = src.codePointAt(i);
        const ch = String.fromCodePoint(cp);
        if (/\s/u.test(ch)) {
          // Unicode space separators, U+00A0, U+FEFF and the line separators U+2028 / U+2029.
          if (cp === 0x2028 || cp === 0x2029) line++;
          i += ch.length;
          continue;
        }
        if (!ID_START_UNICODE.test(ch)) {
          toks.unclassifiedLines.push(line);
          toks.push({ t: "p", v: ch, line });
          i += ch.length;
          continue;
        }
      }
      if (c === "\\") {
        // A backslash outside a string can only be an identifier escape (\u0069mport): not followed.
        toks.unclassifiedLines.push(line);
        toks.push({ t: "p", v: c, line });
        i++;
        continue;
      }
      if (/[A-Za-z_$]/.test(c) || c > "\u007f") {
        let j = i;
        while (j < n) {
          const cp = src.codePointAt(j);
          const ch = String.fromCodePoint(cp);
          if (isAsciiIdPart(ch) || (cp > 0x7f && ID_CONTINUE_UNICODE.test(ch))) j += ch.length;
          else break;
        }
        toks.push({ t: "id", v: src.slice(i, j), line });
        i = j;
        continue;
      }
      if (c >= "0" && c <= "9") {
        let j = i + 1;
        while (j < n && (isAsciiIdPart(src[j]) || src[j] === ".")) j++;
        toks.push({ t: "num", v: src.slice(i, j), line });
        i = j;
        continue;
      }
      if (c === "{") depth++;
      if (c === "}") {
        if (nested && depth === 0) { i++; return; }
        depth--;
      }
      toks.push({ t: "p", v: c, line });
      i++;
    }
  }

  run(false);
  return toks;
}

// ---------------------------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------------------------

const TERMINATING = new Set(["exit", "exitCode", "kill", "abort", "reallyExit"]);
// Members of the process object that reach modules or native code without an import statement.
const PROCESS_REACH = new Map([
  ["getBuiltinModule", "require-call"],
  ["mainModule", "require-call"],
  ["binding", "reflection"],
  ["_linkedBinding", "reflection"],
  ["dlopen", "reflection"],
]);
// Names of node:module that are safe to import: they reach nothing.
const MODULE_SAFE = new Set(["builtinModules", "isBuiltin"]);
const SUBPROCESS_MODULES = new Set(["child_process", "worker_threads", "cluster"]);
const NETWORK_MODULES = new Set(["http", "https", "http2", "net", "tls", "dgram", "dns", "dns/promises"]);
const BUILTINS = new Set(builtinModules);

/** `node:fs` and `fs` are the same module; so are the two spellings of every built-in. */
function builtinName(spec) {
  const bare = spec.startsWith("node:") ? spec.slice(5) : spec;
  return spec.startsWith("node:") || BUILTINS.has(bare) ? bare : null;
}

/**
 * Scan one file's text. Pure; exported so tests can exercise it without a repository.
 *
 * Returns { imports, terminates, mechanisms } where imports are
 * { spec, kind: "static" | "dynamic" | "reexport", names, line, sideEffect }, terminates is the list
 * of lines holding a recognised process-terminating form, and mechanisms maps each detected
 * mechanism id to the lines of constructs the scanner could not classify further.
 */
function analyse(toks) {
  const imports = [];
  const terminates = [];
  const mechanisms = Object.fromEntries(DETECTED_MECHANISMS.map((m) => [m, []]));
  const skip = new Set();
  const isP = (k, v) => toks[k]?.t === "p" && toks[k].v === v;
  const isId = (k, v) => toks[k]?.t === "id" && (v === undefined || toks[k].v === v);
  const isStr = (k) => toks[k]?.t === "str";
  const flag = (m, line) => mechanisms[m].push(line);
  const matching = (open, k) => {
    const close = { "(": ")", "{": "}", "[": "]" }[open];
    let d = 0;
    for (let x = k; x < toks.length; x++) {
      if (isP(x, open)) d++;
      else if (isP(x, close)) { d--; if (d === 0) return x; }
    }
    return -1;
  };
  // Names bound or exported by a { a, b as c, "d-e" as f } list, between token indexes.
  const namesInBraces = (from, to) => {
    const out = [];
    let x = from;
    while (x < to) {
      if (isId(x, "type") && (isId(x + 1) || isStr(x + 1)) && !isId(x + 1, "as")) x++;
      if (isP(x, "[")) {
        // A computed key: a string literal is a plain name, anything else cannot be resolved.
        if (isStr(x + 1) && isP(x + 2, "]")) out.push(toks[x + 1].v);
        else out.push(COMPUTED_KEY);
      } else if (isP(x, ".") && isP(x + 1, ".") && isP(x + 2, ".")) {
        out.push(COMPUTED_KEY); // a rest element aliases everything not named
      } else if (isId(x) || isStr(x)) {
        out.push(toks[x].v);
        if (isId(x + 1, "as")) x += 2;
      }
      x++;
      while (x < to && !isP(x, ",")) x++;
      x++;
    }
    return out;
  };
  const bracedBefore = (k) => {
    // `const { a, b } = <k>` : the names between the braces that end at k - 2.
    let o = k - 3;
    while (o >= 0 && !isP(o, "{")) o--;
    return o >= 0 ? namesInBraces(o + 1, k - 2) : [];
  };

  // Every global object and every name that reaches modules, termination or native code is a ROOT.
  // An access chain rooted at one is normalised once, for all roots alike: grouping parentheses,
  // `.`, `?.`, `["x"]`, `?.["x"]` and a repeated global (globalThis.window.self.process) are read
  // the same way. A chain the scan cannot fully classify (a computed key, the object used as a
  // value, a call on it) is reported, never OK. This is a token scan, not a parser.
  const GLOBAL_OBJECTS = new Set(["globalThis", "global", "window", "self"]);
  const ROOTS = new Set([...GLOBAL_OBJECTS, "process", "module", "require"]);
  const NETWORK_GLOBALS = new Set(["fetch", "WebSocket", "EventSource", "XMLHttpRequest"]);
  const GROUPING_KEYWORDS = new Set([
    "return", "typeof", "void", "await", "yield", "delete", "new", "in", "of", "case", "throw", "else", "do", "instanceof",
  ]);
  const isSpread = (k) => isP(k - 1, ".") && isP(k - 2, ".") && isP(k - 3, ".");
  // Is the "(" at p a call or a grouping paren? A call follows a value; a grouping follows an operator.
  const isCallParen = (p) => {
    const b = toks[p - 1];
    if (!b) return false;
    if (b.t === "id") return !GROUPING_KEYWORDS.has(b.v);
    if (b.t === "p") return b.v === ")" || b.v === "]";
    return b.t === "str" || b.t === "tmpl" || b.t === "num";
  };
  const groupingBefore = (k) => {
    let n = 0;
    for (let p = k - 1; isP(p, "(") && !isCallParen(p); p--) n++;
    return n;
  };
  // One access at q: .x  ?.x  ["x"]  ?.["x"]  [expr]; closing grouping parens are consumed first.
  const readAccess = (q, st) => {
    while (st.opens > 0 && isP(q, ")")) { q++; st.opens--; }
    if (isP(q, "?") && isP(q + 1, ".")) q += 2;
    else if (isP(q, ".") && !isP(q + 1, ".")) q += 1;
    else if (!isP(q, "[")) return { kind: "none", next: q };
    if (isP(q, "[")) {
      if (isStr(q + 1) && isP(q + 2, "]")) return { kind: "name", v: toks[q + 1].v, next: q + 3 };
      const close = matching("[", q);
      return { kind: "computed", next: close < 0 ? toks.length : close + 1 };
    }
    if (isId(q)) return { kind: "name", v: toks[q].v, next: q + 1 };
    return { kind: "none", next: q };
  };
  // Classify the chain rooted at token k. Reports into terminates / mechanisms.
  const resolveRoot = (k) => {
    const tk = toks[k];
    const opens = groupingBefore(k);
    const start = k - opens;
    const st = { opens };
    let name = tk.v;
    let q = k + 1;
    for (let hops = 0; hops < 64; hops++) {
      if (name === "require") { flag("require-call", tk.line); return; }
      const a = readAccess(q, st);
      if (GLOBAL_OBJECTS.has(name)) {
        if (a.kind === "name" && ROOTS.has(a.v)) { name = a.v; q = a.next; continue; }
        if (a.kind === "name") {
          if (a.v === "eval" || a.v === "Function" || a.v === "Reflect" || a.v === "Proxy") flag("reflection", tk.line);
          else if (NETWORK_GLOBALS.has(a.v)) flag("network", tk.line);
          return;
        }
        // computed key, or the global object itself used as a value (typeof g is only a string)
        if (a.kind === "none" && isId(start - 1, "typeof")) return;
        flag("termination-indirect", tk.line);
        return;
      }
      if (name === "process") {
        if (a.kind === "name") {
          if (TERMINATING.has(a.v)) terminates.push(tk.line);
          else if (PROCESS_REACH.has(a.v)) flag(PROCESS_REACH.get(a.v), tk.line);
          return;
        }
        if (a.kind === "none" && isP(start - 1, "=") && isP(start - 2, "}")) {
          const bound = bracedBefore(start);
          if (bound.some((b) => TERMINATING.has(b))) terminates.push(tk.line);
          else if (bound.includes(COMPUTED_KEY)) flag("termination-indirect", tk.line);
          return;
        }
        flag("termination-indirect", tk.line);
        return;
      }
      // module
      if (a.kind === "name") {
        if (a.v === "require") flag("require-call", tk.line);
        return;
      }
      // computed key, or the module object used as a value: it carries .require with it
      flag("require-call", tk.line);
      return;
    }
    flag("termination-indirect", tk.line); // a chain too long to follow is not guessed at
  };

  for (let k = 0; k < toks.length; k++) {
    const tk = toks[k];
    if (tk.t === "str" && isP(k - 1, "[") && isP(k + 1, "]") && (tk.v === "constructor" || tk.v === "__proto__")) {
      flag("reflection", tk.line);
      continue;
    }
    if (tk.t !== "id" || skip.has(k)) continue;
    const afterDot = isP(k - 1, ".") && !isSpread(k);
    if (ROOTS.has(tk.v)) {
      // an object key ({ self: 1 }) or a property of some other object (x.window) is not a root
      const key = isP(k + 1, ":") && (isP(k - 1, "{") || isP(k - 1, ","));
      if (!afterDot && !key) resolveRoot(k);
      continue;
    }

    switch (tk.v) {
      case "import": {
        if (afterDot || isP(k + 1, ":")) break;
        if (isP(k + 1, "(")) {
          if (isStr(k + 2) && (isP(k + 3, ")") || isP(k + 3, ","))) {
            let names = ["*"];
            if (isId(k - 1, "await") && isP(k - 2, "=") && isP(k - 3, "}")) names = bracedBefore(k - 1);
            imports.push({ spec: toks[k + 2].v, kind: "dynamic", names, line: tk.line, sideEffect: false });
          } else {
            flag("dynamic-import-computed", tk.line);
          }
          break;
        }
        if (isP(k + 1, ".")) {
          if (isId(k + 2, "meta")) {
            const plain = isP(k + 3, ".") && (isId(k + 4, "url") || isId(k + 4, "dirname") || isId(k + 4, "filename"));
            if (!plain) flag("import-meta-resolve", tk.line);
          }
          break;
        }
        if (isStr(k + 1)) {
          imports.push({ spec: toks[k + 1].v, kind: "static", names: ["side-effect"], line: tk.line, sideEffect: true });
          break;
        }
        // Read to the end of the statement, bounded only by the end of the file: no token cutoff.
        // A braced list is skipped as a whole. A statement that does not reach `from "x"` before a
        // semicolon, another import or the end of the file is unrecognised and reported.
        let j = k + 1;
        let truncated = false;
        while (j < toks.length && !(isId(j, "from") && isStr(j + 1)) && !isP(j, ";") && !isId(j, "import")) {
          if (isP(j, "{")) {
            const c = matching("{", j);
            if (c < 0) { truncated = true; break; }
            j = c;
          }
          j++;
        }
        if (truncated || !(isId(j, "from") && isStr(j + 1))) {
          flag("ambiguous-token", tk.line);
          break;
        }
        const names = [];
        const bindings = [];
        let x = k + 1;
        if (isId(x, "type") && !isId(x + 1, "from")) x++;
        while (x < j) {
          if (isP(x, "*")) {
            names.push("*");
            if (isId(x + 1, "as") && isId(x + 2)) { bindings.push({ kind: "namespace", local: toks[x + 2].v }); x += 2; }
          } else if (isP(x, "{")) {
            const close = matching("{", x);
            const stop = close < 0 ? j : close;
            names.push(...namesInBraces(x + 1, stop));
            x = stop;
          } else if (isId(x) && !isId(x, "as")) {
            names.push("default");
            bindings.push({ kind: "default", local: toks[x].v });
          }
          x++;
        }
        for (let s = k; s <= j; s++) skip.add(s);
        imports.push({ spec: toks[j + 1].v, kind: "static", names: names.length ? names : ["*"], line: tk.line, sideEffect: false, bindings });
        break;
      }
      case "export": {
        if (afterDot) break;
        // `export type { X } from` and `export type * from` are re-exports like the untyped forms.
        let a = k + 1;
        if (isId(a, "type") && (isP(a + 1, "{") || isP(a + 1, "*"))) a++;
        if (isP(a, "*")) {
          // export * from "x"   export * as ns from "x"   export * as "str" from "x"
          const j = isId(a + 1, "as") ? a + 3 : a + 1;
          if (isId(j, "from") && isStr(j + 1)) {
            imports.push({ spec: toks[j + 1].v, kind: "reexport", names: ["*"], line: tk.line, sideEffect: false });
          } else {
            flag("ambiguous-token", tk.line);
          }
        } else if (isP(a, "{")) {
          const close = matching("{", a);
          if (close < 0) flag("ambiguous-token", tk.line);
          else if (isId(close + 1, "from") && isStr(close + 2)) {
            imports.push({ spec: toks[close + 2].v, kind: "reexport", names: namesInBraces(a + 1, close), line: tk.line, sideEffect: false });
          } else if (isId(close + 1, "from")) {
            flag("ambiguous-token", tk.line);
          }
        }
        break;
      }
      case "createRequire":
        flag("require-call", tk.line);
        break;
      case "eval":
      case "Function":
        // Any bare mention, not only a call: `(0, eval)(s)`, `const e = eval` and `const F = Function`
        // reach the same place.
        if (!afterDot && !isP(k + 1, ":")) flag("reflection", tk.line);
        break;
      case "constructor":
        // f.constructor reaches Function from any function value, called or assigned.
        if (afterDot) flag("reflection", tk.line);
        break;
      case "getPrototypeOf":
      case "setPrototypeOf":
      case "__proto__":
        flag("reflection", tk.line);
        break;
      case "Reflect":
      case "Proxy":
        flag("reflection", tk.line);
        break;
      case "fetch":
        if (!afterDot && isP(k + 1, "(")) flag("network", tk.line);
        break;
      case "WebSocket":
      case "EventSource":
      case "XMLHttpRequest":
        flag("network", tk.line);
        break;
      case "URL": {
        if (isId(k - 1, "new") && isP(k + 1, "(")) {
          const close = matching("(", k + 1);
          for (let x = k + 2; close > 0 && x < close; x++) {
            if (isId(x, "import") && isP(x + 1, ".") && isId(x + 2, "meta") && isP(x + 3, ".") && isId(x + 4, "url")) {
              flag("url-module-path", tk.line);
              break;
            }
          }
        }
        break;
      }
      default:
        break;
    }
  }

  for (const imp of imports) {
    const b = builtinName(imp.spec);
    if (b === null) continue;
    if (SUBPROCESS_MODULES.has(b)) flag("subprocess", imp.line);
    if (NETWORK_MODULES.has(b)) flag("network", imp.line);
    if (b === "process") {
      if (imp.names.some((nm) => TERMINATING.has(nm))) terminates.push(imp.line);
      const bindings = imp.bindings ?? [];
      for (const bind of bindings) {
        if (bind.local !== "process") flag("termination-indirect", imp.line);
      }
      // `import { default as p }` and any default or namespace import not bound as `process`: the
      // process object is reachable under a name the scan does not follow.
      const wholeObject = imp.names.some((nm) => nm === "default" || nm === "*");
      if (wholeObject && bindings.length === 0 && !imp.sideEffect) flag("termination-indirect", imp.line);
      if (imp.kind !== "static" && wholeObject) flag("termination-indirect", imp.line);
    }
    if (b === "vm") flag("reflection", imp.line);
    if (b === "module" && (imp.sideEffect || imp.names.some((nm) => !MODULE_SAFE.has(nm)))) {
      flag("require-call", imp.line);
    }
  }

  return { imports, terminates, mechanisms };
}

/**
 * Scan one file's text. Pure; exported so tests can exercise it without a repository.
 *
 * Returns { imports, terminates, mechanisms } where imports are
 * { spec, kind: "static" | "dynamic" | "reexport", names, line, sideEffect }, terminates is the list
 * of lines holding a recognised process-terminating form, and mechanisms maps each detected
 * mechanism id to the lines of constructs the scanner could not classify further.
 *
 * Where a slash could open a regex literal or divide, the file is read both ways. If the readings
 * agree the result is used; if they disagree the union of both is returned and the file is reported
 * under `ambiguous-token`, so a disagreement can never hide an import or a termination.
 */
export function scanSource(text) {
  const first = tokenize(text, "regex");
  const a = analyse(first);
  const unclassified = [...new Set(first.unclassifiedLines)];
  if (unclassified.length > 0) a.mechanisms["ambiguous-token"].push(...unclassified);
  if (first.ambiguousLines.length === 0) return a;
  const b = analyse(tokenize(text, "div"));
  if (unclassified.length > 0) b.mechanisms["ambiguous-token"].push(...unclassified);
  const key = (r) =>
    JSON.stringify({
      i: r.imports.map((x) => [x.kind, x.spec, x.names, x.line]),
      t: r.terminates,
      m: r.mechanisms,
    });
  if (key(a) === key(b)) return a;
  const seen = new Set();
  const imports = [];
  for (const imp of [...a.imports, ...b.imports]) {
    const k = `${imp.kind}|${imp.spec}|${imp.line}|${imp.names.join(",")}`;
    if (!seen.has(k)) { seen.add(k); imports.push(imp); }
  }
  const mechanisms = {};
  for (const m of DETECTED_MECHANISMS) mechanisms[m] = [...new Set([...a.mechanisms[m], ...b.mechanisms[m]])].sort((x, y) => x - y);
  mechanisms["ambiguous-token"] = [...new Set([...first.ambiguousLines, ...unclassified])];
  return { imports, terminates: [...new Set([...a.terminates, ...b.terminates])].sort((x, y) => x - y), mechanisms };
}

/** Read and scan every in-scope file. */
export function scanRepository(repoRoot, declaration) {
  const files = inScopeFiles(repoRoot, declaration.observation);
  const scanned = new Map();
  for (const f of files) scanned.set(f, scanSource(readFileSync(path.join(repoRoot, f), "utf8")));
  return { files, scanned, links: files.links ?? [] };
}

// ---------------------------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------------------------

/**
 * Names of the packages the repository itself defines: the `name` of every package.json found at
 * the repository root or in a directory above an observed file. A workspace resolver is out of
 * scope (ADR 0018); this is the set a bare specifier must not be read as "external" for.
 */
function repositoryPackageNames(repoRoot, files) {
  const dirs = new Set([""]);
  for (const f of files) {
    let d = path.posix.dirname(f);
    while (d && d !== ".") {
      dirs.add(d);
      d = path.posix.dirname(d);
    }
  }
  const names = new Set();
  for (const d of dirs) {
    const file = path.join(repoRoot, d, "package.json");
    try {
      if (!lstatSync(file).isFile()) continue;
      const name = JSON.parse(readFileSync(file, "utf8")).name;
      if (typeof name === "string" && name) names.add(name);
    } catch {
      // absent or unreadable: no package name from this directory
    }
  }
  return names;
}

function ownerOf(members, file) {
  return members.find((m) => m.paths.some((p) => covers(p, file))) ?? null;
}

/** "file" | "missing" | a description of why an evidence path is not a regular in-repository file. */
function evidenceTarget(repoRoot, abs) {
  let st;
  try {
    st = lstatSync(abs);
  } catch {
    return "missing";
  }
  if (st.isSymbolicLink()) return "a symbolic link";
  if (!st.isFile()) return "not a regular file (a directory or special file)";
  try {
    const rel = path.relative(realpathSync(repoRoot), realpathSync(abs));
    if (rel.startsWith("..") || path.isAbsolute(rel)) return "reached through a link that leaves the repository";
  } catch {
    return "missing";
  }
  return "file";
}

function parseEvidence(e) {
  const i = e.lastIndexOf(":");
  return { file: e.slice(0, i), line: Number(e.slice(i + 1)) };
}

/**
 * Check a scan against a declaration. Returns violations; an empty array means that, within the
 * observation limits the declaration states, every observed edge is permitted and every
 * construct the scanner could not classify is acknowledged by the declaration.
 *
 * Violation kinds: unowned-file, dead-member-path, undeclared-edge, undeclared-interface,
 * undeclared-external, unresolved-import, process-termination, unobserved-mechanism,
 * known-site-missing, symlink-not-followed, evidence-missing, evidence-out-of-range, evidence-mismatch,
 * evidence-outside-observation, evidence-not-regular-file, repository-package-import,
 * external-prefix-shadows-member.
 *
 * A side-effect import across a declared edge is a use of the interface named "side-effect": the
 * edge's `via` must list it, or `*`.
 */
export function checkBoundaries(repoRoot, declaration, scan = scanRepository(repoRoot, declaration)) {
  const violations = [];
  const members = declaration.members;
  const edgeMap = new Map(declaration.edges.map((e) => [`${e.from}->${e.to}`, e]));
  const fileSet = new Set(scan.files);
  const allowPrefixes = declaration.external?.allowPrefixes ?? [];
  const crossings = new Map(); // file -> Map(line -> [{ from, to }])

  const packageNames = repositoryPackageNames(repoRoot, scan.files);
  for (const prefix of allowPrefixes) {
    for (const name of packageNames) {
      if (name.startsWith(prefix) || prefix === name || prefix.startsWith(`${name}/`)) {
        violations.push({
          kind: "external-prefix-shadows-member",
          file: DECLARATION_FILE,
          line: 1,
          message: `external allowPrefix '${prefix}' matches the repository package '${name}'; an external prefix must not admit a package this repository defines`,
        });
      }
    }
  }

  for (const link of scan.links ?? []) {
    violations.push({
      kind: "symlink-not-followed",
      file: link,
      line: 1,
      message: `${link} is a symbolic link inside the observed roots; links are not followed, so what it points to is not observed`,
    });
  }

  for (const m of members) {
    for (const p of m.paths) {
      const abs = path.join(repoRoot, p);
      const empty = existsSync(abs) && isDirectoryPath(p) && readdirSync(abs).length === 0;
      if (!existsSync(abs) || empty) {
        violations.push({ kind: "dead-member-path", file: p, line: 1, message: `member '${m.id}' owns '${p}', which matches no file` });
      }
    }
  }

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
        if (!targetOwner) continue; // reported once, as unowned-file
        if (!crossings.has(file)) crossings.set(file, new Map());
        const byLine = crossings.get(file);
        if (!byLine.has(imp.line)) byLine.set(imp.line, []);
        byLine.get(imp.line).push({ from: owner.id, to: targetOwner.id });
        if (targetOwner.id === owner.id) continue;
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
      } else if ([...packageNames].some((n) => imp.spec === n || imp.spec.startsWith(`${n}/`))) {
        violations.push({
          kind: "repository-package-import",
          file,
          line: imp.line,
          message: `${file}:${imp.line} imports '${imp.spec}', which names a package this repository defines; bare imports of repository packages are not resolved by this check, so the crossing is not observed`,
        });
      } else if (!allowPrefixes.some((p) => imp.spec.startsWith(p))) {
        const hint = builtinName(imp.spec) !== null ? `; write the built-in as node:${builtinName(imp.spec)}` : "";
        violations.push({
          kind: "undeclared-external",
          file,
          line: imp.line,
          message: `${file}:${imp.line} imports '${imp.spec}', outside the allowed prefixes ${allowPrefixes.join(", ") || "(none)"}${hint}`,
        });
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

  // A construct the scanner could not classify must be acknowledged, per file, by the declaration;
  // an acknowledged site that is no longer observed is also an error, so the list cannot rot.
  for (const u of declaration.observation.cannotObserve) {
    if (!DETECTED_MECHANISMS.includes(u.mechanism)) continue;
    const declared = new Set(u.knownSites ?? []);
    const observed = new Map();
    for (const f of scan.files) {
      const lines = scan.scanned.get(f).mechanisms[u.mechanism];
      if (lines.length > 0) observed.set(f, lines[0]);
    }
    for (const [f, line] of observed) {
      if (!declared.has(f)) {
        violations.push({
          kind: "unobserved-mechanism",
          file: f,
          line,
          message: `${f}:${line} uses '${u.mechanism}', which the check cannot resolve, and ${f} is not one of its declared knownSites`,
        });
      }
    }
    for (const f of declared) {
      if (!observed.has(f)) {
        violations.push({ kind: "known-site-missing", file: f, line: 1, message: `${f} is declared a known site of '${u.mechanism}' but no use was observed` });
      }
    }
  }

  const evidence = [
    ...members.flatMap((m) => m.evidence.map((e) => ({ owner: `member ${m.id}`, e }))),
    ...declaration.edges.flatMap((x) => x.evidence.map((e) => ({ owner: `edge ${x.from} -> ${x.to}`, e, edge: x }))),
    ...(declaration.external?.evidence ?? []).map((e) => ({ owner: "external", e })),
  ];
  for (const { owner, e, edge } of evidence) {
    const { file, line } = parseEvidence(e);
    const abs = path.resolve(repoRoot, file);
    const target = evidenceTarget(repoRoot, abs);
    if (path.relative(path.resolve(repoRoot), abs).startsWith("..") || path.isAbsolute(path.relative(path.resolve(repoRoot), abs))) {
      violations.push({ kind: "evidence-missing", file, line, message: `${owner}: evidence '${e}' points outside the repository` });
    } else if (target === "missing") {
      violations.push({ kind: "evidence-missing", file, line, message: `${owner}: evidence '${e}' names a file that does not exist` });
    } else if (target !== "file") {
      violations.push({
        kind: "evidence-not-regular-file",
        file,
        line,
        message: `${owner}: evidence '${e}' is ${target}; evidence must be a regular file inside the repository, not a directory or a link`,
      });
    } else if (line > readFileSync(abs, "utf8").split(/\r?\n/).length) {
      violations.push({ kind: "evidence-out-of-range", file, line, message: `${owner}: evidence '${e}' is past the end of the file` });
    } else if (edge && !fileSet.has(file)) {
      violations.push({
        kind: "evidence-outside-observation",
        file,
        line,
        message: `${owner}: evidence '${e}' names a file outside observation.roots or with an unobserved extension; edge evidence must be an import in the scanned graph`,
      });
    } else if (edge) {
      const hits = crossings.get(file)?.get(line) ?? [];
      if (!hits.some((h) => h.from === edge.from && h.to === edge.to)) {
        violations.push({
          kind: "evidence-mismatch",
          file,
          line,
          message: `${owner}: ${e} is not an import, by a file of '${edge.from}', of a file owned by '${edge.to}'`,
        });
      }
    }
  }
  return violations;
}

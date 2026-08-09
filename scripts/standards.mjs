#!/usr/bin/env node
/**
 * standards — audit a repository against the engineering standards.
 *
 * Usage:
 *   standards audit [path] [--json] [--dir=<path>] [--strict]
 *   node scripts/standards.mjs audit .
 *
 * Implements all sixteen finding categories from design/standards-audit-cli.md: six descriptive ones
 * that report what a repository has (always `info`), and ten that report something absent, unproven,
 * or contradictory (`warning` or `error`). Coverage within several categories is deliberately
 * shallow; the report says so rather than leaving a reader to assume a clean run means compliant.
 *
 * No third-party dependencies, by the decision recorded in design/standards-audit-cli.md.
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadCatalog, assertBindings, coverage } from "./catalog.mjs";
import { evaluate, envelope } from "./compliance.mjs";
import { plan as planInit, apply as applyInit, render as renderInit } from "./init.mjs";
import { parseYaml } from "./yaml.mjs";
import { validate } from "./jsonschema.mjs";

/**
 * This file lists the very package names it searches for, so scanning it would report every SDK it
 * knows about as a dependency of whatever repository it is auditing. It excludes itself from the
 * content scan for that reason. Any other file that merely *names* an SDK is handled by requiring an
 * import-shaped match rather than a bare mention — see importPattern().
 */
const SELF = fileURLToPath(import.meta.url);

const SCHEMA_VERSION = "1.0.0";

/**
 * The rules this evaluator actually examines.
 *
 * This set is the difference between "no violation was observed" and "nothing looked". Every rule in
 * the catalog that is NOT here is reported `skipped / not-evaluated` rather than passing, which is
 * the whole of Standard 24 R4 and the reason Standard 38 R3 can refuse to let unknown satisfy
 * completion. Adding a detector means adding its rule here; a test asserts the set and the
 * detectors agree, so the two cannot drift apart silently.
 */
const EVALUATED_RULES = [
  "architecture.project-manifest",
  "architecture.adr",
  "documentation.architecture",
  "documentation.code-consistency",
  "planning.breakdown-directory",
  "planning.item-fields",
  "planning.plan-code-consistency",
  "audit.business-state",
  "verification.before-completion",
  "quality.unfinished-work",
  "quality.dead-code",
  "reconstruction.baseline-artifacts",
  "reconstruction.open-questions",
];

/**
 * Read and validate the target repository's project-policy.yml.
 *
 * A malformed or unreadable policy is an ERROR condition, never a compliance failure: the verdict
 * becomes NOT_EVALUATED and the process exits 2 (Standard 30 R1). Reporting a broken configuration
 * as NON_COMPLIANT would be a false red for the project and a false green for this tool.
 */
async function loadProjectPolicy(repoRoot) {
  const file = path.join(repoRoot, "project-policy.yml");
  if (!existsSync(file)) {
    return { document: null, error: null, reason: "no project-policy.yml — nothing declares what applies here" };
  }
  const schemaPath = path.join(path.dirname(SELF), "..", "schemas/project-policy.schema.json");
  try {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    const document = parseYaml(await readFile(file, "utf8"));
    const errors = validate(document, schema);
    if (errors.length > 0) {
      return {
        document: null,
        error: `project-policy.yml does not match the schema (${errors.length} error(s)): ` +
          errors.slice(0, 3).map((e) => `${e.path || "(document)"} ${e.message}`).join("; "),
      };
    }
    return { document, error: null };
  } catch (error) {
    return { document: null, error: `project-policy.yml could not be read: ${error.message}` };
  }
}

/** Render the Standard 30 verdict beneath the human report. */
function renderVerdict(report, policy) {
  const out = [];
  out.push("Compliance");
  if (policy.error) {
    out.push(`  ${policy.error}`);
    out.push("  Status: NOT_EVALUATED — a policy that cannot be read is a configuration error,");
    out.push("  not a compliance failure.");
    return out.join("\n");
  }
  if (!policy.document) {
    out.push(`  ${policy.reason}.`);
    out.push("  Status: NOT_EVALUATED — findings above are observations, not a verdict.");
    out.push("  Add project-policy.yml to get one; see INSTRUCTIONS.md.");
    return out.join("\n");
  }

  const s = report.summary;
  const a = report.assurance;
  out.push(`  Status: ${report.status}`);
  out.push(`  Score:  ${report.score === null ? "n/a" : report.score + "%"}  (${report.denominator.basis}: ${report.denominator.scored})`);
  out.push(`  Rules:  ${s.passed} passed, ${s.failed} failed, ${s.warnings} warning(s), ${s.skipped} skipped`);
  out.push(`  Cover:  ${a.automated} automated, ${a.manualReview} manual-review, ${a.notEvaluated} not-evaluated`);
  out.push("");

  const failed = report.results.filter((r) => r.status === "failed");
  if (failed.length) {
    out.push("  Failing:");
    for (const r of failed) {
      out.push(`    ${r.ruleId} [${r.level}] ${r.message}`);
      out.push(`      -> ${r.remediation}`);
    }
    out.push("");
  }
  // Standard 45 R6. Named individually rather than counted: "3 unestablished prohibitions" tells a
  // reader there is a problem, and this tells them which four things to do about it.
  const unestablished = report.unestablishedProhibitions ?? [];
  if (unestablished.length) {
    out.push("  Unestablished prohibitions — nobody looked for these:");
    for (const ruleId of unestablished) out.push(`    ${ruleId}`);
    out.push("");
    out.push("  A forbidden rule is satisfied by the absence of a violation, so a rule nothing has");
    out.push("  examined has established nothing, and the verdict is capped at NOT_EVALUATED rather");
    out.push("  than reporting COMPLIANT over an unexamined prohibition (Standard 45 R6).");
    out.push("  Resolve each: evaluate it, attest to it after a human review, declare it");
    out.push("  not-applicable with a revisitWhen, or except it where the rule is exemptible.");
    out.push("");
  }

  const excepted = report.results.filter((r) => r.disposition === "excepted");
  if (excepted.length) {
    out.push("  Excepted:");
    for (const r of excepted) out.push(`    ${r.ruleId} — ${r.exception.reason} (expires ${r.exception.expires ?? "never"})`);
    out.push("");
  }
  const attested = report.results.filter((r) => r.disposition === "attested");
  if (attested.length) {
    out.push("  Attested (human review):");
    for (const r of attested) out.push(`    ${r.ruleId} — ${r.attestation.reviewedBy}, ${r.attestation.reviewedAt}`);
    out.push("");
  }

  const na = report.results.filter((r) => r.disposition === "not-applicable");
  if (na.length) {
    out.push(`  Not applicable (${na.length}): ${na.map((r) => r.ruleId).join(", ")}`);
    out.push("");
  }

  const c = report.frameworkCoverage;
  if (c) {
    out.push(
      `  Framework: ${c.cataloguedRules} rule(s) catalogued across ${c.standardsWithRules} of ` +
        `${c.standards ?? "?"} standards; ${c.fullyMachineRepresentedStandards} fully machine-represented.`,
    );
    out.push("");
  }

  out.push("  The score is a summary statistic over evaluated required rules, not a measure of");
  out.push("  how much of the standard was verified. Status is the verdict; a skipped rule is");
  out.push("  neither a pass nor a failure. Framework coverage is maturity of the tooling, not");
  out.push("  compliance of this project — the two never combine into one number.");
  return out.join("\n");
}
const STD44 = "standards/44-existing-project-reconstruction.md";

/**
 * Requirement anchors, verified against the headings in that file. A standardRef that does not
 * resolve is worse than none: it sends a reader to a page that does not explain the finding.
 */
const R = {
  evidence: `${STD44}#r1--evidence-before-questions`,
  fabrication: `${STD44}#r2--no-historical-fabrication`,
  labeling: `${STD44}#r3--evidence-labeling`,
  artifacts: `${STD44}#r4--required-artifacts-and-canonical-paths`,
  baseline: `${STD44}#r5--baseline-contents`,
  prompt: `${STD44}#r6--reconstructed-prompt`,
  plan: `${STD44}#r7--reconstructed-plan-and-plan-items`,
  questions: `${STD44}#r8--question-list`,
  resolution: `${STD44}#r9--question-resolution`,
  done: `${STD44}#r10--definition-of-done`,
};

/**
 * Directories never worth walking: build output, dependencies, virtualenvs, caches.
 *
 * `fixtures` is here for a different reason than the rest. Test fixtures are deliberately malformed —
 * that is their job — so scanning them reports the test data's planted defects as the repository's
 * own. This tool's own fixtures would otherwise make it report itself as non-compliant. The cost is
 * that a genuine `fixtures/` directory of production code is skipped; that trade is worth it, and a
 * repository can still audit one directly with `--dir=`.
 */
const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "bin", "obj", ".next", ".nuxt",
  ".venv", "venv", "__pycache__", "target", "vendor", "coverage", ".turbo",
  ".gradle", ".idea", ".vs", ".vscode", "packages-cache", ".pytest_cache", "fixtures",
]);

/** Extensions whose contents are worth pattern-scanning at all. */
const TEXT_EXT = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".cs", ".py", ".go", ".rb", ".java",
  ".kt", ".php", ".rs", ".yml", ".yaml", ".json", ".toml", ".md", ".razor", ".vue",
  ".svelte", ".sql", ".sh", ".ps1",
]);

/**
 * Extensions that contain *code*. Any scan looking for a code signal — a route registration, a
 * scheduler annotation, a TODO marker, an SDK import — must be restricted to these.
 *
 * This tool has produced the same bug four times: prose that *names* a technology or marker being
 * reported as an instance of it. The fourth was this repository's own architecture document, which
 * describes the scheduler patterns the job detector looks for and was duly reported as a background
 * job. Documentation describes; it does not implement. Scanning it for code signals is always wrong.
 */
const CODE_EXT = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".cs", ".py", ".go", ".rb", ".java",
  ".kt", ".php", ".rs", ".razor", ".vue", ".svelte", ".sql", ".sh", ".ps1",
]);

/** True when this file's *content* may be scanned for a code signal. */
const isCode = (f) => CODE_EXT.has(path.extname(f));

// ---------------------------------------------------------------------------
// Use versus mention
// ---------------------------------------------------------------------------

/**
 * THE recurring defect in this tool, stated once so it is not rediscovered a sixth time.
 *
 * Every detector answers "does this repository use X?" by searching text for a string associated
 * with X. That string occurs in two unrelated kinds of place: files that *use* X, and files that
 * merely *mention* it — documentation, comments, test names, and this file's own pattern tables.
 * Raw text search cannot distinguish the two, and five separate bugs have come from trying to fix it
 * by narrowing which *files* are read. That was always the wrong axis: the fifth instance was a
 * mention inside a code file.
 *
 * The fix is to scan only the positions where a use can occur, which means three scan modes matching
 * the three kinds of evidence. Every content scan in this file goes through one of them, and a new
 * detector that reaches for raw text is reintroducing the bug.
 *
 *   structureOf(f) code with comments removed AND string contents blanked — for structural signals
 *                  like `app.get(`, `@Scheduled`, `new Queue(`. A call is never inside a string.
 *   sourceOf(f)    code with comments removed, strings intact — for import matching only, because an
 *                  import specifier *is* a string: `from "bullmq"`.
 *   commentsOf(f)  comment text only — TODO/FIXME markers, which are by definition a comment
 *                  convention, so a marker named in a string or in prose is correctly invisible.
 */

/** Comment syntax by extension. Enabling the wrong one corrupts the split — `//` is floor division
 *  in Python, `--` is decrement in JavaScript, `#` starts a private field in JavaScript. */
const C_LIKE = [".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".cs", ".go", ".java", ".kt", ".rs", ".php", ".vue", ".svelte", ".razor"];
const HASH = [".py", ".rb", ".sh", ".ps1"];
const COMMENT_SYNTAX = new Map([
  ...C_LIKE.map((e) => [e, { line: "//", block: true }]),
  ...HASH.map((e) => [e, { line: "#", block: false }]),
  [".sql", { line: "--", block: true }],
]);

/**
 * Split source into code and comments with a small state machine. String literals stay in the code
 * half deliberately — import specifiers live inside them, so stripping strings would break the very
 * detection this exists to protect.
 *
 * Approximate by design: it does not understand regex literals, Python docstrings, or heredocs. It
 * only has to be right enough that a sentence in a comment stops being mistaken for a call.
 */
function splitSource(text, ext) {
  const syntax = COMMENT_SYNTAX.get(ext);
  if (!syntax) return { code: text, structure: text, comments: "" };

  let code = "";
  let structure = "";
  let comments = "";
  let mode = "code";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const rest2 = text.substr(i, 2);

    if (mode === "code") {
      if (rest2 === syntax.line || (syntax.line.length === 1 && c === syntax.line)) {
        mode = "line";
        i += syntax.line.length;
        continue;
      }
      if (syntax.block && rest2 === "/*") {
        mode = "block";
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        mode = c;
        code += c;
        structure += c; // the quote survives; its contents do not
        i++;
        continue;
      }
      code += c;
      structure += c;
      i++;
      continue;
    }

    if (mode === "line") {
      if (c === "\n") {
        mode = "code";
        code += "\n";
        comments += "\n";
        i++;
        continue;
      }
      comments += c;
      i++;
      continue;
    }

    if (mode === "block") {
      if (rest2 === "*/") {
        mode = "code";
        comments += "\n";
        i += 2;
        continue;
      }
      comments += c;
      i++;
      continue;
    }

    // Inside a string literal: preserved in the code half, escapes skipped.
    if (c === "\\") {
      code += text.substr(i, 2);
      i += 2;
      continue;
    }
    if (c === mode) {
      mode = "code";
      structure += c;
    }
    code += c;
    i++;
  }
  return { code, structure, comments };
}

/** Populated once per run, alongside `contents`, so the split cost is paid a single time. */
const sources = new Map();
const sourceOf = (f) => sources.get(f)?.code ?? "";
const structureOf = (f) => sources.get(f)?.structure ?? "";
const commentsOf = (f) => sources.get(f)?.comments ?? "";

const MAX_FILES = 20000;
const MAX_READ_BYTES = 400_000;
const MAX_EVIDENCE = 12;

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);
const subcommand = argv[0];
const JSON_OUT = argv.includes("--json");
const STRICT = argv.includes("--strict");
const dirFlag = argv.find((a) => a.startsWith("--dir="))?.slice("--dir=".length);
const positional = argv.slice(1).find((a) => !a.startsWith("--"));

function usage(stream = process.stderr) {
  stream.write(
    "Usage: standards <audit|validate|init> [path] [flags]\n\n" +
      "  audit          Evidence discovery. What a repository has and where it departs from\n" +
      "                 the standards. Needs no policy; never produces a verdict.\n" +
      "  validate       Policy-aware compliance evaluation. Loads project-policy.yml, applies\n" +
      "                 applicability and exceptions, and produces the authoritative status.\n" +
      "  init           Bootstrap a project. Creates missing artifacts, never overwrites\n" +
      "                 without an explicit per-path opt-in.\n\n" +
      "  --dry-run      init only: report what would happen, write nothing.\n" +
      "  --force-overwrite=<path>   init only: approve replacing one existing file.\n" +
      "  --json         Emit the structured report on stdout instead of the readable one.\n" +
      "  --dir=<path>   Target a directory other than the resolved project root.\n" +
      "  --strict       audit only: exit 1 when any finding needs attention.\n\n" +
      "Gate CI on `validate`. Use `audit` for diagnostics, discovery, and reconstruction.\n" +
      "See artifacts/adr/0004-audit-and-validate-are-separate-commands.md.\n",
  );
}

/**
 * Exit codes, per Standard 23 R3:
 *   0 = validation completed; project compliant
 *   1 = validation completed; compliance failures found
 *   2 = validator / configuration / invocation error
 *
 * The 1/2 split matters to CI: 1 means this tool worked and the repository has problems; 2 means it
 * could not reach a verdict at all. Collapsing them tells CI that a broken validator is a failing
 * project, and the usual response to that is to weaken the check.
 */
const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  usage(process.stdout);
  process.exit(subcommand ? EXIT_OK : EXIT_INVOCATION);
}
const COMMANDS = new Set(["audit", "validate", "init"]);
if (!COMMANDS.has(subcommand)) {
  process.stderr.write(`standards: unknown subcommand '${subcommand}'\n\n`);
  usage();
  process.exit(EXIT_INVOCATION);
}

/**
 * The two commands have genuinely different jobs, and ADR 0004 keeps them apart rather than
 * making one an alias for the other:
 *
 *   audit     evidence discovery — what was observed. No status, no score, no policy required.
 *   validate  the verdict — policy-aware, and the command CI gates on.
 *
 * Their exit-code contracts differ, which is the practical reason they cannot be one command: the
 * survey exits 0 on warnings unless --strict, while the verdict exits 1 on a required-rule failure
 * regardless of it. One command cannot hold both without a flag selecting which contract applies,
 * and a flag that changes the exit contract is a trap.
 */
const VALIDATING = subcommand === "validate";

// ---------------------------------------------------------------------------
// init — bootstrap (Standard 33)
//
// Handled before the scan: init does not need an evidence survey, and running one would make a
// bootstrap command slower than the thing it bootstraps.
// ---------------------------------------------------------------------------

if (subcommand === "init") {
  const dryRun = argv.includes("--dry-run");
  const modeFlag = argv.find((a) => a.startsWith("--mode="))?.slice("--mode=".length) ?? null;
  const overwrite = argv
    .filter((a) => a.startsWith("--force-overwrite="))
    .map((a) => a.slice("--force-overwrite=".length));
  const target = path.resolve(dirFlag ?? positional ?? ".");

  let report;
  try {
    report = await planInit(target, { mode: modeFlag, overwrite });
  } catch (error) {
    process.stderr.write(`standards init: ${error.message}\n`);
    process.exit(EXIT_INVOCATION);
  }

  // The dry run and the real run share one computation, so the report cannot disagree with what
  // apply() then does (Standard 33 R5).
  if (!dryRun) await applyInit(target, report);

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify({ ...report, dryRun }, null, 2) + "\n");
  } else {
    process.stdout.write(renderInit(report, { dryRun }) + "\n");
  }

  // A conflict is unfinished work, not a failure of the command: nothing was changed and the
  // operator has to decide. Exit 1 so a script notices, distinct from 2 which means init could
  // not run at all.
  process.exit(report.conflicts.length > 0 ? EXIT_FINDINGS : EXIT_OK);
}

// ---------------------------------------------------------------------------
// Repository scan
// ---------------------------------------------------------------------------

/** Walk up for a .git or package.json marker, so the command works from any subdirectory. */
function findRoot(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (existsSync(path.join(dir, ".git")) || existsSync(path.join(dir, "package.json"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return path.resolve(start);
    dir = parent;
  }
}

const target = dirFlag ?? positional ?? ".";
if (!existsSync(target)) {
  process.stderr.write(`standards: no such directory: ${target}\n`);
  process.exit(EXIT_INVOCATION);
}
const root = dirFlag ? path.resolve(dirFlag) : findRoot(target);

/** Repo-relative path with forward slashes, so output is stable across platforms. */
const rel = (p) => path.relative(root, p).split(path.sep).join("/");

async function collectFiles(dir, acc) {
  if (acc.length >= MAX_FILES) return acc;
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc; // unreadable directory: skip rather than abort the audit
  }
  for (const entry of entries) {
    if (acc.length >= MAX_FILES) return acc;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await collectFiles(full, acc);
    } else if (entry.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

async function readText(file) {
  try {
    const buf = await readFile(file);
    if (buf.length > MAX_READ_BYTES) return buf.subarray(0, MAX_READ_BYTES).toString("utf8");
    return buf.toString("utf8");
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Finding construction
// ---------------------------------------------------------------------------

const findings = [];

/**
 * `label` is the Standard 44 evidence label and is not decorative. A detection that rests on a file
 * existing at a path with a defined meaning is OBSERVED. A detection that rests on matching a naming
 * convention or a content pattern is INFERRED — reporting a heuristic as observed is the fabrication
 * error R2 prohibits.
 */
function addFinding({ id, category, severity = "info", label, evidence, message, standardRef, rule }) {
  const shown = evidence.slice(0, MAX_EVIDENCE);
  const omitted = evidence.length - shown.length;
  findings.push({
    id,
    category,
    severity,
    label,
    evidence: shown,
    message: omitted > 0 ? `${message} (${evidence.length} total; ${omitted} not listed)` : message,
    standardRef: standardRef ?? R.baseline,
    // The canonical rule this finding is evidence for (Standard 26, ADR 0002). Descriptive
    // "observed/detected" findings carry none: they report what the repository HAS, not whether it
    // complies, and binding them to a rule would manufacture a verdict out of an observation.
    rule: rule ?? null,
  });
}

const uniq = (xs) => [...new Set(xs)].sort();

// ---------------------------------------------------------------------------
// Detectors — the six descriptive categories
// ---------------------------------------------------------------------------

const MANIFESTS = [
  "package.json", "go.mod", "Cargo.toml", "pyproject.toml", "requirements.txt",
  "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json",
];

function detectArchitecture(files, contents) {
  const archDoc = files.find((f) => rel(f).toLowerCase() === "docs/architecture.md");
  if (archDoc) {
    addFinding({
      id: "observed-architecture",
      category: "Observed architecture",
      label: "OBSERVED",
      evidence: [rel(archDoc)],
      message: "An architecture document exists and is the authoritative description of structure.",
    });
    return;
  }

  const manifests = files.filter((f) => MANIFESTS.includes(path.basename(f)));
  const solutions = files.filter((f) => f.endsWith(".sln") || f.endsWith(".csproj"));
  const topDirs = uniq(
    files
      .map((f) => rel(f).split("/")[0])
      .filter((d) => d && !d.includes(".")),
  );
  const evidence = uniq([...manifests, ...solutions].map(rel)).slice(0, MAX_EVIDENCE);
  if (evidence.length === 0 && topDirs.length === 0) return;

  addFinding({
    id: "observed-architecture",
    category: "Observed architecture",
    label: "INFERRED",
    evidence,
    message:
      `No docs/architecture.md; structure inferred from ${evidence.length} manifest(s) and ` +
      `top-level directories: ${topDirs.slice(0, 10).join(", ") || "none"}.`,
  });
}

function detectCapabilities(files, contents) {
  const evidence = [];
  const notes = [];

  const pkgPath = files.find((f) => rel(f) === "package.json");
  if (pkgPath) {
    try {
      const pkg = JSON.parse(contents.get(pkgPath) ?? "{}");
      const bins = pkg.bin ? Object.keys(pkg.bin) : [];
      const scripts = pkg.scripts ? Object.keys(pkg.scripts) : [];
      if (bins.length) {
        notes.push(`${bins.length} CLI entry point(s): ${bins.join(", ")}`);
        evidence.push("package.json");
      }
      if (scripts.length) notes.push(`${scripts.length} npm script(s)`);
    } catch {
      /* malformed manifest is not this detector's problem */
    }
  }

  const entryPatterns = [
    [/(^|\/)(Program|Startup)\.cs$/i, "a .NET entry point"],
    [/(^|\/)__main__\.py$/, "a Python module entry point"],
    [/(^|\/)main\.(go|rs|py|ts|js)$/, "a main entry point"],
    [/(^|\/)index\.html$/, "a web entry point"],
    [/(^|\/)App\.(tsx|jsx|vue|svelte)$/, "a UI root component"],
  ];
  for (const [re, label] of entryPatterns) {
    const hits = files.filter((f) => re.test(rel(f)));
    if (hits.length) {
      notes.push(`${label} (${hits.length})`);
      evidence.push(...hits.map(rel));
    }
  }

  if (notes.length === 0) return;
  addFinding({
    id: "detected-capabilities",
    category: "Detected application capabilities",
    label: "INFERRED",
    evidence: uniq(evidence),
    message: `Entry points and capabilities inferred from naming conventions: ${notes.join("; ")}.`,
  });
}

const API_CONTENT = [
  /@app\.(route|get|post|put|delete)/,
  /@(Rest)?Controller\b/,
  /@(Get|Post|Put|Delete|Request)Mapping\b/,
  /\[Http(Get|Post|Put|Delete|Patch)\]/,
  /\b(app|router)\.(get|post|put|delete|patch)\s*\(/,
  /func\s+\w*Handler\s*\(\s*w\s+http\.ResponseWriter/,
];

function detectApis(files, contents) {
  const specs = files.filter((f) =>
    /(^|\/)(openapi|swagger)\.(ya?ml|json)$/i.test(rel(f)),
  );
  if (specs.length) {
    addFinding({
      id: "detected-apis",
      category: "Detected APIs",
      label: "OBSERVED",
      evidence: specs.map(rel),
      message: `${specs.length} API specification file(s) define the HTTP surface directly.`,
    });
  }

  const handlers = files.filter((f) => {
    const r = rel(f);
    if (/(^|\/)\w*Controller\.(cs|java|ts|js|py|rb)$/i.test(r)) return true;
    if (/(^|\/)(routes?|controllers?|api|endpoints?)\//i.test(r) && isCode(f)) return true;
    if (!isCode(f)) return false; // prose describing a route table is not a route
    const code = structureOf(f); // a commented-out or quoted route is not a route
    return code ? API_CONTENT.some((re) => re.test(code)) : false;
  });
  if (handlers.length === 0) return;

  addFinding({
    id: "detected-apis",
    category: "Detected APIs",
    label: "INFERRED",
    evidence: uniq(handlers.map(rel)),
    message: `${handlers.length} file(s) match route-handler naming or request-mapping patterns.`,
  });
}

const JOB_NAME = /(Job|Worker|Processor|Scheduler|Consumer|Poller|Cron|Task)s?\.(cs|ts|js|mjs|py|go|rb|java|kt)$/i;
/**
 * Code-shaped signals: an annotation, a base class, or a call. These are safe to match anywhere in a
 * code file because prose does not contain `@Scheduled` or `cron.schedule(` by accident.
 */
const JOB_CONTENT = [
  /@Scheduled\b/,
  /\bBackgroundService\b|\bIHostedService\b/,
  /\bnew Queue\(|\bcron\.schedule\(/,
];

/**
 * Library names, which must be import-shaped. A comment naming Celery is not a Celery worker — this
 * file's own test suite was flagged as a background job for exactly that reason. Every bare library
 * name in this tool goes through importPattern(); none is matched as a loose substring.
 */
const JOB_PACKAGES = "celery|sidekiq|bullmq|bull|agenda|node-cron|apscheduler|resque";

function detectJobs(files, contents) {
  const workflowCron = files.filter((f) => {
    if (!/\.github\/workflows\/.*\.ya?ml$/.test(rel(f))) return false;
    const text = contents.get(f) ?? "";
    return /^\s*schedule:/m.test(text);
  });
  if (workflowCron.length) {
    addFinding({
      id: "detected-jobs",
      category: "Detected background jobs",
      label: "OBSERVED",
      evidence: workflowCron.map(rel),
      message: `${workflowCron.length} CI workflow(s) declare a schedule: trigger.`,
    });
  }

  const jobs = files.filter((f) => {
    if (JOB_NAME.test(path.basename(f))) return true;
    if (!isCode(f)) return false; // prose naming Celery or BullMQ is not a scheduler
    if (JOB_CONTENT.some((re) => re.test(structureOf(f)))) return true;
    return importPattern(JOB_PACKAGES).test(sourceOf(f)); // imports live in strings
  });
  if (jobs.length === 0) return;

  addFinding({
    id: "detected-jobs",
    category: "Detected background jobs",
    label: "INFERRED",
    evidence: uniq(jobs.map(rel)),
    message: `${jobs.length} file(s) match background-job naming or scheduler patterns.`,
  });
}

/**
 * Match a package only where it is actually pulled in — a JS/TS import or require, a Python import,
 * or a C# using. A bare mention in prose or in a list of names is not usage, and treating it as such
 * is how an audit reports integrations a project does not have.
 */
function importPattern(pkg) {
  return new RegExp(
    `(?:from|require\\s*\\(|import)\\s*\\(?\\s*['"\`][^'"\`]*(?:${pkg})` + // JS/TS
      `|^\\s*(?:import|from)\\s+[\\w.]*(?:${pkg})` + // Python
      `|^\\s*using\\s+[\\w.]*(?:${pkg})`, // C#
    "im",
  );
}

const INTEGRATION_SDK = [
  ["aws-sdk|aws_sdk|Amazon\\.", "AWS"], ["@azure/|Azure\\.", "Azure"], ["@google-cloud/|google\\.cloud", "Google Cloud"],
  ["stripe", "Stripe"], ["twilio", "Twilio"], ["sendgrid", "SendGrid"],
  ["redis|ioredis", "Redis"], ["mongodb|mongoose|pymongo", "MongoDB"],
  ["psycopg|Npgsql|node-postgres", "PostgreSQL"], ["mysql2?|MySql\\.", "MySQL"],
  ["@slack/|slack_sdk", "Slack"], ["octokit|PyGithub", "GitHub"],
];

function detectIntegrations(files, contents) {
  const envTemplates = files.filter((f) =>
    /(^|\/)\.env\.(example|template|sample)$|(^|\/)appsettings\.(Example|Template)\.json$/i.test(rel(f)),
  );
  if (envTemplates.length) {
    addFinding({
      id: "detected-integrations",
      category: "Detected integrations",
      label: "OBSERVED",
      evidence: envTemplates.map(rel),
      message:
        `${envTemplates.length} environment template(s) enumerate the external services this ` +
        "project expects to be configured.",
    });
  }

  const found = new Map();
  for (const [pattern, name] of INTEGRATION_SDK) {
    const re = importPattern(pattern);
    for (const f of files) {
      const code = sourceOf(f);
      if (code && re.test(code)) {
        if (!found.has(name)) found.set(name, []);
        found.get(name).push(rel(f));
      }
    }
  }
  const webhooks = files.filter((f) => /webhook/i.test(rel(f)));
  if (webhooks.length) found.set("webhook handlers", webhooks.map(rel));
  if (found.size === 0) return;

  addFinding({
    id: "detected-integrations",
    category: "Detected integrations",
    label: "INFERRED",
    evidence: uniq([...found.values()].flat()),
    message: `External services referenced in source: ${[...found.keys()].sort().join(", ")}.`,
  });
}

const AI_SDK = [
  ["@anthropic-ai/|anthropic", "Anthropic"],
  ["openai", "OpenAI"],
  ["@ai-sdk/|ai-sdk", "Vercel AI SDK"],
  ["langchain", "LangChain"],
  ["google\\.generativeai|@google/generative-ai", "Google Generative AI"],
  ["ollama", "Ollama"],
  ["cohere", "Cohere"],
  ["mistralai", "Mistral"],
];

function detectAiInterfaces(files, contents) {
  const skillFiles = files.filter((f) => /(^|\/)SKILL\.md$/.test(rel(f)));
  const promptFiles = files.filter((f) => /(^|\/)prompts?\//i.test(rel(f)) || /prompt.*\.md$/i.test(rel(f)));
  const declared = [...skillFiles, ...promptFiles];
  if (declared.length) {
    addFinding({
      id: "detected-ai-interfaces",
      category: "Detected AI interfaces",
      label: "OBSERVED",
      evidence: uniq(declared.map(rel)),
      message:
        `${skillFiles.length} skill definition(s) and ${promptFiles.length} prompt file(s) exist ` +
        "as declared agent-facing artifacts.",
    });
  }

  const providers = new Map();
  for (const [pattern, name] of AI_SDK) {
    const re = importPattern(pattern);
    for (const f of files) {
      const code = sourceOf(f);
      if (code && re.test(code)) {
        if (!providers.has(name)) providers.set(name, []);
        providers.get(name).push(rel(f));
      }
    }
  }
  if (providers.size === 0) return;

  addFinding({
    id: "detected-ai-interfaces",
    category: "Detected AI interfaces",
    label: "INFERRED",
    evidence: uniq([...providers.values()].flat()),
    message: `Model provider SDKs referenced in source: ${[...providers.keys()].sort().join(", ")}.`,
  });
}

// ---------------------------------------------------------------------------
// Detectors — absence, unfinished work, and discrepancy
// ---------------------------------------------------------------------------

const has = (p) => existsSync(path.join(root, p));
const TEST_RE = /(^|\/)(tests?|spec|__tests__)\/|\.(test|spec)\.[jt]sx?$|_test\.(go|py)$|Tests?\.cs$|test_.*\.py$/i;
const CI_FILES = [
  ".github/workflows", "azure-pipelines.yml", ".gitlab-ci.yml", "Jenkinsfile",
  ".circleci/config.yml", ".travis.yml", "bitbucket-pipelines.yml",
];

function detectMissingDocs(files, contents) {
  const missing = [];
  if (!files.some((f) => rel(f).toLowerCase() === "docs/architecture.md")) missing.push("docs/architecture.md");
  const readme = files.find((f) => /^readme\.md$/i.test(rel(f)));
  if (!readme) missing.push("README.md");
  else if ((contents.get(readme) ?? "").trim().length < 400) missing.push(`${rel(readme)} (under 400 characters)`);
  if (missing.length === 0) return;

  addFinding({
    id: "missing-documentation",
      rule: "documentation.architecture",
    category: "Missing documentation",
    severity: "warning",
    label: "OBSERVED",
    evidence: missing,
    message: `No substantive architecture or overview documentation: ${missing.join(", ")}.`,
    standardRef: R.done,
  });
}

/**
 * Structural checks for the two architecture rules. Both are `assurance: partial` in the catalog:
 * the file existing is not the same as the file being correct or current, and the catalog says so
 * rather than leaving a reader to infer it (Standard 24 R2).
 */
function detectArchitectureArtifacts() {
  const manifest = ["PROJECT.md", "artifacts/project-manifest.md"];
  if (!manifest.some((f) => has(f))) {
    addFinding({
      id: "missing-project-manifest",
      rule: "architecture.project-manifest",
      category: "Missing planning artifacts",
      severity: "warning",
      label: "OBSERVED",
      evidence: manifest,
      message: "No project manifest exists; a fresh agent has nowhere to learn what this is or what state it is in.",
      standardRef: R.artifacts,
    });
  }
  if (!has("artifacts/adr")) {
    addFinding({
      id: "missing-adr-directory",
      rule: "architecture.adr",
      category: "Missing planning artifacts",
      severity: "warning",
      label: "OBSERVED",
      evidence: ["artifacts/"],
      message: "No artifacts/adr/ directory exists; consequential decisions have nowhere durable to live.",
      standardRef: R.artifacts,
    });
  }
}

/**
 * Standard 44 R11: content, not presence.
 *
 * `standards init` creates artifacts/project-plan-breakdown/ EMPTY in reconstruction mode, on
 * purpose — scaffolding template sections over existing code is a fabricated history. A detector
 * that tests for the directory therefore reports "this project has a plan" on the strength of the
 * tool's own output, which is the same defect hasContent() fixed inside init one level down.
 *
 * The test is deliberately structural and stops where structure stops: an overview with no line
 * outside its headings says nothing, and that is checkable. Whether prose that IS there is a real
 * plan or an untouched template is a judgement no scan makes, and Standard 44's Implementation
 * section says so rather than implying this check covers it.
 */
function detectMissingPlanningArtifacts(files, contents) {
  const dir = "artifacts/project-plan-breakdown";
  if (!has(dir)) {
    addFinding({
      id: "missing-planning-artifacts",
      rule: "planning.breakdown-directory",
      category: "Missing planning artifacts",
      severity: "warning",
      label: "OBSERVED",
      evidence: ["artifacts/"],
      message: `No ${dir}/ directory exists.`,
      standardRef: R.artifacts,
    });
    return;
  }
  const overview = files.find((f) => rel(f) === `${dir}/00-overview.md`);
  if (!overview) {
    addFinding({
      id: "missing-planning-artifacts",
      rule: "planning.breakdown-directory",
      category: "Missing planning artifacts",
      severity: "warning",
      label: "OBSERVED",
      evidence: [`${dir}/`],
      message: `${dir}/ exists but has no 00-overview.md.`,
      standardRef: R.artifacts,
    });
    return;
  }

  const body = (contents.get(overview) ?? "")
    .split("\n")
    .filter((line) => line.trim() && !line.trimStart().startsWith("#"));
  if (body.length === 0) {
    addFinding({
      id: "missing-planning-artifacts",
      rule: "planning.breakdown-directory",
      category: "Missing planning artifacts",
      severity: "warning",
      label: "OBSERVED",
      evidence: [`${dir}/00-overview.md`],
      message: `${dir}/00-overview.md is headings only; a plan directory is evidence of a plan only when it has content (Standard 44 R11).`,
      standardRef: R.artifacts,
    });
  }
}

function detectMissingAuditInfrastructure(files) {
  const tests = files.filter((f) => TEST_RE.test(rel(f)));
  const ci = CI_FILES.filter((c) => has(c));
  const missing = [];
  if (tests.length === 0) missing.push("no test suite");
  if (ci.length === 0) missing.push("no CI configuration");
  if (missing.length === 0) return;

  addFinding({
    id: "missing-audit-infrastructure",
      rule: "audit.business-state",
    category: "Missing audit infrastructure",
    severity: "warning",
    label: "OBSERVED",
    evidence: missing,
    message: `The repository has ${missing.join(" and ")}; nothing mechanically verifies its behavior.`,
    standardRef: R.done,
  });
}

function detectUnverifiedFunctionality(files) {
  const tests = files.filter((f) => TEST_RE.test(rel(f)));
  if (tests.length > 0) return; // per-capability coverage mapping is not attempted; see the report note
  const capabilities = findings.filter((f) =>
    ["detected-apis", "detected-jobs", "detected-capabilities"].includes(f.id),
  );
  if (capabilities.length === 0) return;

  addFinding({
    id: "unverified-functionality",
      rule: "verification.before-completion",
    category: "Unverified functionality",
    severity: "warning",
    label: "INFERRED",
    evidence: uniq(capabilities.flatMap((f) => f.evidence)),
    message:
      `${capabilities.length} capability categor(ies) were detected but the repository has no test ` +
      "files, so none of that functionality is verified.",
    standardRef: R.done,
  });
}

/**
 * Markers are a *comment* convention — that is what a TODO is. Scanned against commentsOf(), so a
 * test named "a Markdown file naming TODO" and a sentence in a design document are both invisible to
 * it, without needing either to be excluded by hand.
 */
const UNFINISHED_COMMENTS = [
  [/\b(TODO|FIXME|HACK|XXX)\b\s*[:(]/, "TODO/FIXME markers"],
];

/** Stubs and skipped tests are code constructs, so they are scanned against sourceOf(). */
const UNFINISHED_CODE = [
  [/\bNotImplemented(Error|Exception)?\b|\braise NotImplementedError\b|\bthrow new NotImplementedException\b/, "unimplemented stubs"],
  [/\b(it|test|describe)\.skip\(|\bxit\(|@pytest\.mark\.skip|\[Ignore\]|\bt\.Skip\(/, "skipped tests"],
];

function detectUnfinished(files) {
  const byKind = new Map();
  const record = (kind, f) => {
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(rel(f));
  };
  for (const f of files) {
    if (!isCode(f)) continue; // a TODO in a Markdown file is a note, not an unfinished code path
    const comments = commentsOf(f);
    const code = structureOf(f);
    for (const [re, kind] of UNFINISHED_COMMENTS) if (comments && re.test(comments)) record(kind, f);
    for (const [re, kind] of UNFINISHED_CODE) if (code && re.test(code)) record(kind, f);
  }
  if (byKind.size === 0) return;

  addFinding({
    id: "potential-unfinished-features",
      rule: "quality.unfinished-work",
    category: "Potential unfinished features",
    severity: "warning",
    label: "INFERRED",
    evidence: uniq([...byKind.values()].flat()),
    message: `Signals of unfinished work: ${[...byKind.keys()].sort().join(", ")}.`,
    standardRef: R.done,
  });
}

const ENTRYISH = /(^|\/)(index|main|app|Program|Startup|__init__|__main__|setup|conftest)\.[a-z]+$/i;

function detectDeadCode(files, contents) {
  const candidates = files.filter((f) => {
    const r = rel(f);
    if (!/\.(m?[jt]sx?|py|cs|go|rb)$/.test(r)) return false;
    if (TEST_RE.test(r) || ENTRYISH.test(r)) return false;
    return true;
  });
  const orphans = [];
  for (const f of candidates) {
    const stem = path.basename(rel(f)).replace(/\.[^.]+$/, "");
    if (stem.length < 3) continue;
    const referenced = files.some((other) => {
      if (other === f) return false;
      const text = contents.get(other);
      return text ? text.includes(stem) : false;
    });
    if (!referenced) orphans.push(rel(f));
  }
  if (orphans.length === 0) return;

  addFinding({
    id: "potential-dead-code",
      rule: "quality.dead-code",
    category: "Potential dead code",
    severity: "info",
    label: "INFERRED",
    evidence: orphans,
    message:
      `${orphans.length} source file(s) whose name is referenced nowhere else in the repository. ` +
      "Dynamic imports and reflection defeat this check, so treat each as a question, not a verdict.",
    standardRef: R.done,
  });
}

function detectOpenQuestions(files, contents) {
  const qFile = files.find((f) => rel(f) === "artifacts/project-baseline/open-questions.md");
  if (!qFile) return;
  const text = contents.get(qFile) ?? "";
  // Fixed, greppable marker written by the project-reconstruction skill's questions template.
  const open = (text.match(/^\s*-?\s*\*\*Status:\*\*\s*open\s*$/gim) ?? []).length;

  // Standard 44 R3/R9: a confirmation with no date cannot be reassessed when the product changes,
  // because nothing says how old the answer is. Scoped to this one document deliberately — it is
  // the file already in hand, and claiming to check every labeled claim in the repository would be
  // a wider assurance than this scan earns (Standard 24).
  const undated = (text.match(/CONFIRMED_BY_OWNER(?!\s*\(\d{4}-\d{2}-\d{2}\))/g) ?? []).length;
  if (undated > 0) {
    addFinding({
      id: "undated-owner-confirmation",
      rule: "reconstruction.open-questions",
      category: "Open reconstruction questions",
      severity: "warning",
      label: "OBSERVED",
      evidence: [rel(qFile)],
      message: `${undated} CONFIRMED_BY_OWNER label(s) carry no (YYYY-MM-DD) date, so the answer cannot be reassessed.`,
      standardRef: R.questions,
    });
  }

  if (open === 0) return;

  addFinding({
    id: "open-reconstruction-questions",
      rule: "reconstruction.open-questions",
    category: "Open reconstruction questions",
    severity: "warning",
    label: "OBSERVED",
    evidence: [rel(qFile)],
    message: `${open} reconstruction question(s) remain unanswered by the project owner.`,
    standardRef: R.questions,
  });
}

/** Parse `### Title` items and their `- **Field:** value` lines out of a plan-breakdown file. */
function parsePlanItems(text, file) {
  const items = [];
  let current = null;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(/^###\s+(.*)$/);
    if (heading) {
      if (current) items.push(current);
      current = { title: heading[1].trim(), file, fields: new Map() };
      continue;
    }
    const field = line.match(/^\s*-\s+\*\*([^:*]+):\*\*\s*(.*)$/);
    if (field && current) current.fields.set(field[1].trim(), field[2].trim());
  }
  if (current) items.push(current);
  return items;
}

const PLAN_FIELDS = ["Status", "Purpose", "Deliverables", "Acceptance Criteria", "Verification", "Dependencies"];

/**
 * The canonical lifecycle vocabulary — Standard 8, decided in ADR 0001. Legacy tokens are accepted
 * as aliases during migration (Standard 8 R6); a reference to another system is never a status, so
 * `tracked as <id>` has no entry here and is read from a separate `Tracked by` field instead.
 */
const STATUS_ALIASES = {
  "not-started": "NOT_STARTED", backlog: "NOT_STARTED", ready: "READY",
  "in-progress": "IN_PROGRESS", blocked: "BLOCKED", "ready-for-review": "IN_REVIEW",
  "in-review": "IN_REVIEW", done: "COMPLETE", dropped: "CANCELLED", declined: "CANCELLED",
};
const canonicalStatus = (raw) => {
  const first = String(raw ?? "").trim().split(/[\s—-]+/)[0];
  const upper = first.toUpperCase();
  if (/^(NOT_STARTED|READY|IN_PROGRESS|BLOCKED|IN_REVIEW|COMPLETE|DEFERRED|CANCELLED)$/.test(upper)) return upper;
  return STATUS_ALIASES[first.toLowerCase()] ?? upper;
};

async function detectPlanDiscrepancies(files, contents) {
  const planFiles = files.filter((f) => /^artifacts\/project-plan-breakdown\/.+\.md$/.test(rel(f)));
  if (planFiles.length === 0) return;

  const items = planFiles.flatMap((f) => parsePlanItems(contents.get(f) ?? "", rel(f)));
  const executable = items.filter((i) => i.fields.has("Status"));
  if (executable.length === 0) return;

  const dangling = [];
  const missingDeliverables = [];
  const incomplete = [];

  for (const item of executable) {
    for (const field of PLAN_FIELDS) {
      if (!item.fields.has(field)) incomplete.push(`${item.file} :: ${item.title} (no ${field})`);
    }

    let status = canonicalStatus(item.fields.get("Status"));
    // The trap: where liveness is delegated to a backlog, the plan item's own status is a cached
    // copy and the backlog is authoritative, so a check that trusts the plan item reports zero
    // findings on the repositories that follow the standard most closely. Resolve the reference
    // first, and treat one that resolves to nothing as a finding in itself.
    //
    // `Tracked by` is a separate field: a reference to another system is not a status (Standard 8
    // R2). The legacy `Status: tracked as <id>` form is still read so older plans keep working.
    const legacyTracked = String(item.fields.get("Status") ?? "").match(/tracked as\s+([A-Z]{2}-\d+)/i);
    const trackedBy = (item.fields.get("Tracked by") ?? item.fields.get("TrackedBy") ?? "").match(/([A-Z]{2}-\d+)/i);
    const tracked = trackedBy ?? legacyTracked;
    if (tracked) {
      const id = tracked[1].toUpperCase();
      const itemPath = path.join(root, "artifacts/backlog/items", `${id}.md`);
      if (!existsSync(itemPath)) {
        dangling.push(`${item.file} :: ${item.title} -> ${id}`);
        continue;
      }
      const backlogText = await readText(itemPath);
      status = canonicalStatus((backlogText.match(/^status:\s*(\S+)/im) ?? [, "unknown"])[1]);
    }

    if (status !== "COMPLETE") continue;

    const deliverables = item.fields.get("Deliverables") ?? "";
    for (const token of deliverables.match(/`([^`]+)`/g) ?? []) {
      const p = token.slice(1, -1).trim();
      if (!/[\/.]/.test(p) || /\s/.test(p) || p.startsWith("http")) continue;
      if (p.startsWith("C:") || p.startsWith("~")) continue; // outside the audited repository by design
      if (!existsSync(path.join(root, p))) {
        missingDeliverables.push(`${item.file} :: ${item.title} -> ${p}`);
      }
    }
  }

  if (dangling.length) {
    addFinding({
      id: "plan-code-discrepancies",
      rule: "planning.plan-code-consistency",
      category: "Plan/code discrepancies",
      severity: "error",
      label: "OBSERVED",
      evidence: dangling,
      message:
        `${dangling.length} plan item(s) delegate status to a backlog id that does not exist. ` +
        "Untracked work is presented as tracked.",
      standardRef: R.plan,
    });
  }
  if (missingDeliverables.length) {
    addFinding({
      id: "plan-code-discrepancies",
      rule: "planning.plan-code-consistency",
      category: "Plan/code discrepancies",
      severity: "error",
      label: "OBSERVED",
      evidence: missingDeliverables,
      message: `${missingDeliverables.length} plan item(s) are complete but name a deliverable that does not exist.`,
      standardRef: R.plan,
    });
  }
  if (incomplete.length) {
    addFinding({
      id: "standards-violations",
      rule: "planning.item-fields",
      category: "Standards violations",
      severity: "error",
      label: "OBSERVED",
      evidence: incomplete,
      message: `${incomplete.length} plan item field(s) are missing; R7 requires all six on every executable item.`,
      standardRef: R.plan,
    });
  }
}

function detectDocDiscrepancies(files, contents) {
  const readme = files.find((f) => /^readme\.md$/i.test(rel(f)));
  if (!readme) return;
  const text = contents.get(readme) ?? "";
  const broken = [];

  for (const token of text.match(/`([^`\n]+)`/g) ?? []) {
    const p = token.slice(1, -1).trim();
    if (!p.includes("/") || /\s/.test(p) || p.startsWith("http") || p.startsWith("-")) continue;
    if (p.startsWith("C:") || p.startsWith("~") || p.startsWith("<")) continue;
    const clean = p.replace(/\/$/, "");
    if (!existsSync(path.join(root, clean))) broken.push(`${rel(readme)} -> ${p}`);
  }

  const pkgPath = files.find((f) => rel(f) === "package.json");
  if (pkgPath) {
    try {
      const scripts = Object.keys(JSON.parse(contents.get(pkgPath) ?? "{}").scripts ?? {});
      for (const m of text.match(/npm run ([\w:-]+)/g) ?? []) {
        const name = m.replace("npm run ", "");
        if (!scripts.includes(name)) broken.push(`${rel(readme)} -> npm run ${name}`);
      }
    } catch {
      /* handled by other detectors */
    }
  }

  if (broken.length === 0) return;
  addFinding({
    id: "doc-code-discrepancies",
      rule: "documentation.code-consistency",
    category: "Documentation/code discrepancies",
    severity: "error",
    label: "OBSERVED",
    evidence: uniq(broken),
    message: `${broken.length} path(s) or command(s) named in the README do not exist.`,
    standardRef: R.done,
  });
}

function detectStandardsViolations(files, contents) {
  const violations = [];
  if (has("artifacts/project-baseline")) {
    if (!has("artifacts/project-baseline/reconstructed-baseline.md")) {
      violations.push(["artifacts/project-baseline/", "R4: baseline directory exists without reconstructed-baseline.md", R.artifacts]);
    }
    const promptFile = files.find((f) => rel(f) === "artifacts/project-baseline/RECONSTRUCTED-PROMPT.md");
    if (promptFile) {
      const t = contents.get(promptFile) ?? "";
      if (!/reconstructed from the existing codebase/i.test(t)) {
        violations.push([rel(promptFile), "R6: reconstructed prompt does not declare itself reconstructed", R.prompt]);
      }
    }
  }
  for (const [evidence, message, ref] of violations) {
    addFinding({
      id: "standards-violations",
      rule: "reconstruction.baseline-artifacts",
      category: "Standards violations",
      severity: "error",
      label: "OBSERVED",
      evidence: [evidence],
      message,
      standardRef: ref,
    });
  }
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

const DESCRIPTIVE = [
  ["observed-architecture", "Observed architecture"],
  ["detected-capabilities", "Detected application capabilities"],
  ["detected-apis", "Detected APIs"],
  ["detected-jobs", "Detected background jobs"],
  ["detected-integrations", "Detected integrations"],
  ["detected-ai-interfaces", "Detected AI interfaces"],
];

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

function renderHuman(fileCount) {
  const lines = [];
  lines.push(`standards audit — ${path.basename(root)} (${root.split(path.sep).join("/")})`);
  lines.push(`${fileCount} file(s) scanned, ${findings.length} finding(s).`);

  lines.push("");
  lines.push("What the repository has");
  for (const [id, title] of DESCRIPTIVE) {
    const hits = findings.filter((f) => f.id === id);
    if (hits.length === 0) {
      lines.push(`  ${title}: nothing detected`);
      continue;
    }
    for (const f of hits) {
      lines.push(`  ${title} [${f.label}]`);
      lines.push(`    ${f.message}`);
      for (const e of f.evidence) lines.push(`      ${e}`);
    }
  }

  const attention = findings
    .filter((f) => f.severity !== "info" || !DESCRIPTIVE.some(([id]) => id === f.id))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  lines.push("");
  if (attention.length === 0) {
    lines.push("Nothing needing attention was detected.");
  } else {
    lines.push("What needs attention");
    for (const f of attention) {
      lines.push(`  [${f.severity}] ${f.category} [${f.label}]`);
      lines.push(`    ${f.message}`);
      for (const e of f.evidence) lines.push(`      ${e}`);
      lines.push(`    see ${f.standardRef}`);
    }
  }

  const failing = findings.filter((f) => f.severity !== "info").length;
  lines.push("");
  lines.push(
    `${findings.filter((f) => f.severity === "error").length} error(s), ` +
      `${findings.filter((f) => f.severity === "warning").length} warning(s), ` +
      `${findings.filter((f) => f.severity === "info").length} informational.`,
  );
  lines.push("");
  lines.push("Coverage is partial by design. Detection is pattern-based and language-agnostic, so a");
  lines.push("clean run means nothing matched the patterns — not that the repository is compliant.");
  lines.push("Per-capability test coverage, dead-code reachability, and most standards requirements");
  lines.push("are not mechanically checked. See design/standards-audit-cli.md.");
  if (STRICT && failing > 0) lines.push(`--strict: exiting 1 because ${failing} finding(s) need attention.`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const files = await collectFiles(root, []);
const contents = new Map();
for (const f of files) {
  if (path.resolve(f) === SELF) continue; // see the SELF declaration above
  if (!TEXT_EXT.has(path.extname(f))) continue;
  const text = await readText(f);
  contents.set(f, text);
  if (isCode(f)) sources.set(f, splitSource(text, path.extname(f)));
}

// Descriptive first: detectUnverifiedFunctionality reads the capability findings they produce.
detectArchitecture(files, contents);
detectCapabilities(files, contents);
detectApis(files, contents);
detectJobs(files, contents);
detectIntegrations(files, contents);
detectAiInterfaces(files, contents);

detectMissingDocs(files, contents);
detectArchitectureArtifacts();
detectMissingPlanningArtifacts(files, contents);
detectMissingAuditInfrastructure(files);
detectUnverifiedFunctionality(files);
detectUnfinished(files);
detectDeadCode(files, contents);
detectOpenQuestions(files, contents);
await detectPlanDiscrepancies(files, contents);
detectDocDiscrepancies(files, contents);
detectStandardsViolations(files, contents);

// ---------------------------------------------------------------------------
// Verdict — catalog + policy + findings (Standards 25, 27, 30)
//
// The three-way separation is deliberate and must not be violated here: the catalog defines rule
// identity and metadata, project-policy.yml defines what applies to THIS project, and everything
// above produces evidence. Nothing in this section redefines a rule or invents applicability.

const catalog = await loadCatalog();
assertBindings(
  catalog,
  findings.map((f) => f.rule).filter(Boolean),
);

if (!VALIDATING) {
  // audit: evidence only. No status, no score, no policy required — ADR 0004.
  if (JSON_OUT) {
    process.stdout.write(
      JSON.stringify(
        {
          schemaVersion: SCHEMA_VERSION,
          repo: root.split(path.sep).join("/"),
          auditedAt: new Date().toISOString(),
          findings,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(renderHuman(files.length) + "\n");
    process.stdout.write(
      "\nThis is evidence, not a verdict. Run `standards validate` for a compliance status.\n",
    );
  }
  process.exit(STRICT && findings.some((f) => f.severity !== "info") ? EXIT_FINDINGS : EXIT_OK);
}

// ---------------------------------------------------------------------------
// validate — the verdict (Standards 25, 27, 30)
//
// The three-way separation must not be violated here: the catalog defines rule identity and
// metadata, project-policy.yml defines what applies to THIS project, and everything above produces
// evidence. Nothing in this section redefines a rule or invents applicability.

const policy = await loadProjectPolicy(root);

/**
 * Digest the paths each attestation says it reviewed, so a material change to them makes the
 * attestation stale (ADR 0005 rule 4).
 *
 * Content-based rather than revision-based on purpose: invalidating every attestation on every
 * commit would make the mechanism unusable, and it would be abandoned. Digesting what was actually
 * reviewed invalidates on material change, which is the real requirement.
 */
async function attestationDigests(document, repoRoot) {
  const { createHash } = await import("node:crypto");
  const out = new Map();
  for (const [ruleId, attestation] of Object.entries(document?.attestations ?? {})) {
    const paths = attestation?.reviewedAgainst?.paths;
    if (!Array.isArray(paths) || paths.length === 0) continue;
    const hash = createHash("sha256");
    for (const rel of [...paths].sort()) {
      hash.update(rel);
      try {
        hash.update(await readFile(path.join(repoRoot, rel), "utf8"));
      } catch {
        hash.update("<missing>"); // A reviewed path that has since gone is itself a material change.
      }
    }
    out.set(ruleId, hash.digest("hex").slice(0, 32));
  }
  return out;
}

const digests = await attestationDigests(policy.document, root);
const verdict = evaluate({
  catalog,
  policy: policy.document,
  findings,
  evaluated: EVALUATED_RULES,
  today: new Date().toISOString().slice(0, 10),
  digests,
});

// Framework maturity, read from this framework's own inventory rather than the target repository.
// It travels beside the verdict and never inside it: a coverage improvement must never be able to
// look like a compliance improvement.
const totalStandards = await (async () => {
  try {
    const inventoryPath = path.join(path.dirname(SELF), "..", "artifacts/standards-source-inventory.json");
    const inv = JSON.parse(await readFile(inventoryPath, "utf8"));
    return inv.expectedCount ?? inv.standards?.length ?? null;
  } catch {
    return null;
  }
})();

const report = envelope({
  verdict,
  project: policy.document?.project,
  standardVersion: policy.document?.standardVersion,
  auditedAt: new Date().toISOString(),
  repo: root.split(path.sep).join("/"),
  frameworkCoverage: coverage(catalog, { evaluated: EVALUATED_RULES, totalStandards }),
});

if (JSON_OUT) {
  // Standard 25's envelope. `findings` is additive detail beyond the contract Standard 31 R2
  // guarantees — a consumer joins on results[].ruleId, never on a finding category.
  process.stdout.write(JSON.stringify({ ...report, findings }, null, 2) + "\n");
} else {
  process.stdout.write(renderVerdict(report, policy) + "\n");
  // Print the current digest for any attestation that lacks one, so it can be recorded
  // rather than computed by hand (ADR 0005).
  for (const [ruleId, digest] of digests) {
    const recorded = policy.document?.attestations?.[ruleId]?.reviewedAgainst?.digest;
    if (!recorded) {
      process.stdout.write(`\n  attestation ${ruleId}: current digest is ${digest}\n`);
      process.stdout.write(`  Record it as reviewedAgainst.digest to make staleness detectable.\n`);
    }
  }
}

// A policy that could not be read, or none at all, is exit 2: a verdict was requested and there is
// nothing to evaluate against. That is a configuration problem, not a compliance failure
// (Standard 30 R1, ADR 0004). A required-level failure is exit 1 regardless of score.
if (policy.error || !policy.document) process.exit(EXIT_INVOCATION);
if (report.status === "NON_COMPLIANT") process.exit(EXIT_FINDINGS);
// Standard 45 R6: a must-never rule nobody examined must not gate-pass CI. This is exit 1 rather
// than exit 2 because it is a statement about the project, not about the configuration — the policy
// read fine, and what it says is that a prohibition went unexamined.
if (report.unestablishedProhibitions?.length) process.exit(EXIT_FINDINGS);
process.exit(EXIT_OK);

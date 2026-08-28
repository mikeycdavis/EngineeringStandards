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
import { existsSync, realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { loadCatalog, assertBindings, coverage } from "./catalog.mjs";
import { evaluate, envelope } from "./compliance.mjs";
import { plan as planInit, apply as applyInit, render as renderInit } from "./init.mjs";
import { parseYaml } from "./yaml.mjs";
import { discoverBacklog, resolveTracked, OUTCOME } from "./tracking.mjs";
import { validate } from "./jsonschema.mjs";
import {
  classifyFreshness,
  ignoredEntries,
  repositoryAvailable,
  repositoryDigest,
  trackedMatching,
  DIGEST_ALGORITHM,
  FRESHNESS,
} from "./repository.mjs";
import { currentReview } from "./reviews.mjs";

/**
 * This file's own location, used to resolve framework-relative paths — the schema, VERSION, the
 * source inventory. It is NOT excluded from the content scan, and the history of why is worth
 * keeping.
 *
 * It used to be. The stated reason was that this file lists the very package names it searches for,
 * so scanning it would report every SDK it knows about as a dependency of whatever repository it is
 * auditing. That reason was superseded by importPattern(), which requires an import-shaped match
 * rather than a bare mention and therefore already handles every other file that merely *names* an
 * SDK. The exclusion outlived it, and its scope was never the same as its justification: one
 * detector's vocabulary problem had become a whole-file blind spot across every detector.
 *
 * What that cost was measured, not estimated. A framework validating its own directory skipped this
 * file; the same framework validating an identical checkout as an ordinary target did not — so the
 * two paths evaluated different repository surfaces and reached different verdicts for identical
 * content (25 passed / 3 failed against 23 / 4). A self-exemption that changes the verdict is the
 * Standard 34 R3 failure this framework exists to refuse, and the two findings it was concealing
 * were both real detector defects.
 *
 * The invariant that replaces it: **a framework validating itself and the same framework validating
 * an identical checkout as a target must evaluate the same repository surface**, except where an
 * individual detector owns and justifies an exclusion its own implementation creates.
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
  "scm.no-committed-env-files",
  "security.no-secrets-in-artifacts",
  "errors.no-swallowed-exceptions",
  "security.no-cert-bypass",
  "security.no-sql-concat",
];

/**
 * Rules whose evidence is the contents of the repository's files.
 *
 * Each is satisfied by the ABSENCE of something in what was read, so each passes most confidently
 * exactly when the least was read. That is tolerable while the surface is whole and is not tolerable
 * when whole files in scope went unsearched: a prohibited construct in a file no detector opened
 * would otherwise produce a passing rule, and a passing rule can produce a COMPLIANT verdict over
 * evidence nobody has.
 *
 * Withdrawing them is the same move `scm.no-committed-env-files` already makes when the repository
 * cannot be read, generalised to the surface: a rule whose evidence could not be obtained was not
 * evaluated this run, whatever the static set says (Standard 45 R6, ADR 0008).
 *
 * **Truncation is deliberately not a trigger HERE.** A truncated file was opened and its prefix
 * searched, and findings from a prefix are real findings that are kept; the run says how much it
 * read. The triggers are the two states in which files in scope were never searched at all.
 *
 * That holds for every PRESENCE-based rule in this list and fails for the one absence-based rule in
 * it. `quality.dead-code` concludes from what it did not find across all other files, so a prefix
 * leaves its claim unsupported in the over-reporting direction — a live file named as dead. It
 * measures its own reference space inside `detectDeadCode` and withdraws there, so the
 * presence-based rules keep the findings a prefix genuinely establishes.
 */
const CONTENT_DERIVED_RULES = [
  "documentation.code-consistency",
  "planning.plan-code-consistency",
  "verification.before-completion",
  "quality.unfinished-work",
  "quality.dead-code",
  "security.no-secrets-in-artifacts",
  "errors.no-swallowed-exceptions",
  "security.no-cert-bypass",
  "security.no-sql-concat",
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
    // Unestablished is one verdict consequence with two very different causes, and collapsing them
    // would tell a reader nobody looked at a rule a human demonstrably reviewed. A rule whose
    // attestation could not be established is listed with the reason it could not be, because
    // "no search happened" and "the search happened and its provenance cannot be verified" call for
    // different work.
    const freshnessOf = new Map(
      report.results.filter((r) => r.freshness).map((r) => [r.ruleId, r]),
    );
    const unexamined = unestablished.filter((id) => !freshnessOf.has(id));
    const unverified = unestablished.filter((id) => freshnessOf.has(id));

    if (unexamined.length) {
      out.push("  Unestablished prohibitions — nobody looked for these:");
      for (const ruleId of unexamined) out.push(`    ${ruleId}`);
      out.push("");
    }
    if (unverified.length) {
      out.push("  Unestablished prohibitions — reviewed, but the review does not establish the");
      out.push("  current state:");
      for (const ruleId of unverified) {
        out.push(`    ${ruleId} [${freshnessOf.get(ruleId).freshness}]`);
      }
      out.push("");
      out.push("  A human recorded a review of each of these. What cannot be established is that the");
      out.push("  review still describes what is here now, and an approval that cannot be established");
      out.push("  does not establish the rule. This is not a finding against the project.");
      out.push("");
    }
    out.push("  A forbidden rule is satisfied by the absence of a violation, so a rule nothing has");
    out.push("  established has established nothing, and the verdict is capped at NOT_EVALUATED");
    out.push("  rather than reporting COMPLIANT over an unexamined prohibition (Standard 45 R6).");
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
const STD46 = "standards/46-source-control-safety.md";
const STD48 = "standards/48-error-handling-and-observability.md";
const STD50 = "standards/50-security-prohibitions.md";

/** Anchors for the must-never layer's evaluated rules (Standards 45-53). */
const N = {
  secrets: `${STD46}#r1--never-commit-secrets`,
  envFiles: `${STD46}#r2--never-commit-environment-files`,
  swallowed: `${STD48}#r1--never-silently-swallow-an-exception`,
  certBypass: `${STD50}#r2--never-bypass-certificate-validation`,
  sqlConcat: `${STD50}#r3--never-build-sql-by-concatenating-untrusted-input`,
};

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
  // Standard 44 R12 is the invariant the evidence-surface findings exist to honour: a negative
  // discovery result is evidence about the search mechanism before it is evidence about the project.
  search: `${STD44}#r12--the-validated-search-invariant`,
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
  ".mypy_cache",
]);

/**
 * The members of `SKIP_DIRS` that are not candidate project evidence in the first place.
 *
 * `.git` is the repository's own storage, not content the repository is made of. Skipping it removes
 * nothing anyone could have audited, so it must not bear on whether the evidence surface is
 * complete. Everything else in `SKIP_DIRS` is a judgement about content that could have been the
 * project's — `vendor`, `fixtures`, `dist` and the rest can all hold tracked first-party code — and
 * those do bear on it.
 *
 * This set exists because the completeness criterion's falsifier caught its absence: an
 * implementation that treated every tool exclusion as lost evidence reported **every** repository
 * incomplete, including one with nothing excluded but `.git`. That is the blanket rule the criterion
 * was written to forbid, and it was the first thing written.
 */
const NOT_PROJECT_EVIDENCE = new Set([".git"]);

/**
 * Files that identify their own directory as a dependency tree rather than the project's code.
 *
 * A name list cannot do this job, and the defect that produced this constant is the proof: the
 * virtualenv was called `test-env-3.13`, `SKIP_DIRS` knows `.venv` and `venv`, and the walk
 * descended into 13,536 files that were not the project's. Adding one more name would have fixed
 * one repository. The directory name is a user choice and the set of choices is unbounded.
 *
 * A marker file is not a choice. `pyvenv.cfg` is written by the `venv` module itself and is present
 * in every virtualenv it creates, whatever the operator called the directory — so this identifies
 * the *kind* of tree instead of guessing its name.
 *
 * Kept deliberately narrow. A marker earns a place here only if the tooling that owns it writes it
 * unconditionally; a conventional-but-optional file would exclude directories on a guess, and
 * silently excluding real code is worse than the noise this removes.
 */
const VENDOR_MARKERS = new Set(["pyvenv.cfg"]);

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
  let comments = "";
  // One entry per character of `text`, so an index into `structure` is an index into the source.
  // That alignment is the whole point: a detector can find a construct in the structural view and
  // then read the same span in the raw text, which is what makes site identity possible. Before it,
  // the only thing a detector could do was count matches in one view and count them in another —
  // and two counts never establish that they refer to the same site.
  const structure = [];
  const keep = (c) => structure.push(c);
  const drop = (c) => structure.push(c === "\n" ? "\n" : " ");

  // The last non-whitespace character already emitted as code. Used only to tell a regex literal
  // from a division: `/` after a value divides, `/` after an operator or an opening bracket starts
  // a pattern.
  const lastCode = () => {
    for (let j = code.length - 1; j >= 0; j -= 1) if (!/\s/.test(code[j])) return code[j];
    return "";
  };
  const REGEX_MAY_START_AFTER = new Set(["", "(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

  let mode = "code";
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    const rest2 = text.substr(i, 2);

    if (mode === "code") {
      if (rest2 === syntax.line || (syntax.line.length === 1 && c === syntax.line)) {
        mode = "line";
        for (let k = 0; k < syntax.line.length; k += 1) drop(text[i + k]);
        i += syntax.line.length;
        continue;
      }
      if (syntax.block && rest2 === "/*") {
        mode = "block";
        drop("/");
        drop("*");
        i += 2;
        continue;
      }
      if (c === "'" || c === '"' || c === "`") {
        mode = c;
        code += c;
        keep(c); // the quote survives; its contents do not
        i++;
        continue;
      }
      // A regex literal is code, but its *contents* are a pattern rather than a construct. Leaving
      // them in the structural view made this file report itself: `raise NotImplementedError`
      // inside the unfinished-work pattern table is a description of a stub, not a stub, and the
      // detector could not tell the difference. Contents stay in `code`, because sourceOf() exists
      // for import matching and a specifier is never a regex.
      if (syntax.block && c === "/" && REGEX_MAY_START_AFTER.has(lastCode())) {
        const close = regexLiteralEnd(text, i);
        if (close !== -1) {
          code += text.slice(i, close + 1);
          keep("/");
          for (let k = i + 1; k < close; k += 1) drop(text[k]);
          keep("/");
          i = close + 1;
          continue;
        }
      }
      code += c;
      keep(c);
      i++;
      continue;
    }

    if (mode === "line") {
      if (c === "\n") {
        mode = "code";
        code += "\n";
        comments += "\n";
        drop("\n");
        i++;
        continue;
      }
      comments += c;
      drop(c);
      i++;
      continue;
    }

    if (mode === "block") {
      if (rest2 === "*/") {
        mode = "code";
        comments += "\n";
        drop("*");
        drop("/");
        i += 2;
        continue;
      }
      comments += c;
      drop(c);
      i++;
      continue;
    }

    // Inside a string literal: preserved in the code half, escapes skipped.
    if (c === "\\") {
      code += text.substr(i, 2);
      drop(c);
      drop(text[i + 1] ?? " ");
      i += 2;
      continue;
    }
    if (c === mode) {
      mode = "code";
      keep(c);
    } else {
      drop(c);
    }
    code += c;
    i++;
  }
  return { code, structure: structure.join(""), comments };
}

/**
 * The closing `/` of a regex literal beginning at `open`, or -1 if there is not one on that line.
 *
 * Deliberately conservative, and the conservative direction is stated: an unrecognised regex is
 * treated as ordinary code, which is exactly the behaviour that existed before this function. The
 * failure mode is therefore the old false positive, never a construct silently disappearing from
 * the structural view — a tokenizer that swallowed real code would hide violations, which is the
 * direction that must not be possible.
 */
function regexLiteralEnd(text, open) {
  let inClass = false;
  for (let i = open + 1; i < text.length; i += 1) {
    const c = text[i];
    if (c === "\n") return -1; // a regex literal does not span lines
    if (c === "\\") {
      i += 1;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) return i;
  }
  return -1;
}

const MAX_FILES = 20000;
const MAX_READ_BYTES = 400_000;
const MAX_EVIDENCE = 12;

/**
 * The aggregate retained-evidence bound, and why a third cap was needed beside the other two.
 *
 * `MAX_FILES` bounds how many files are collected; `MAX_READ_BYTES` bounds each individual read.
 * Neither is a total, and two per-unit caps do not compose into one. The audit holds every text
 * simultaneously — once in `contents`, and again in derived form in `sources` for code files — so
 * the retained ceiling was `MAX_FILES x MAX_READ_BYTES`, about 8 GB, against a default heap of
 * roughly 4 GB.
 *
 * The report that produced this blamed a vendored virtualenv, and the exclusion boundary removed
 * that instance. It did not remove the class: a large enough tree of the project's OWN tracked code
 * reaches the same ceiling with nothing to exclude and no signal that could honestly exclude it.
 *
 * 256 MB sits far above any plausible first-party source tree — the largest observed adopter read
 * under 40 MB — and an order of magnitude below the heap, so exhausting it means something has gone
 * wrong rather than that a project grew. It is a frozen framework constant in the sense ADR 0014
 * permits: its value does not depend on which repository is being audited. The per-run override is
 * a flag on the invocation, not a module-scoped read of the environment, for the same reason.
 */
const DEFAULT_MAX_TOTAL_READ_BYTES = 256 * 1024 * 1024;

/**
 * How many paths an aggregated exclusion names.
 *
 * Enough that a reader can recognise the kind of thing that left, few enough that it cannot bury the
 * directory-level exclusions that actually change what a run covers.
 */
const EXCLUDED_FILE_SAMPLE = 5;

// ---------------------------------------------------------------------------
// Argument parsing
//
// Derived from the arguments the invocation was given, never from `process.argv` — ADR 0014. Reading
// the process here would make the invocation's own configuration a property of the process, which is
// the lifetime this design removes.
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  return {
    argv,
    subcommand: argv[0],
    json: argv.includes("--json"),
    strict: argv.includes("--strict"),
    dirFlag: argv.find((a) => a.startsWith("--dir="))?.slice("--dir=".length),
    maxTotalReadBytes: argv
      .find((a) => a.startsWith("--max-total-read-bytes="))
      ?.slice("--max-total-read-bytes=".length),
    positional: argv.slice(1).find((a) => !a.startsWith("--")),
  };
}

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
      "  --max-total-read-bytes=<n>   audit and validate: bound the total file\n" +
      "                 content one run retains. Defaults to 256 MB. `init` returns\n" +
      "                 before the walk, so a valid value is inert there; an unusable\n" +
      "                 one is still refused, because the value is checked first.\n" +
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

const COMMANDS = new Set(["audit", "validate", "init"]);

/**
 * Returns an exit code when the invocation cannot proceed, and `null` when it can.
 *
 * It returns rather than exits. Nothing below the CLI boundary may terminate the process (ADR 0014):
 * a helper that calls `process.exit` cannot be tested, cannot be called twice, and takes a decision
 * that belongs to the caller.
 */
function checkInvocation({ subcommand, maxTotalReadBytes }) {
  if (!subcommand || subcommand === "--help" || subcommand === "-h") {
    usage(process.stdout);
    return subcommand ? EXIT_OK : EXIT_INVOCATION;
  }
  if (!COMMANDS.has(subcommand)) {
    process.stderr.write(`standards: unknown subcommand '${subcommand}'\n\n`);
    usage();
    return EXIT_INVOCATION;
  }
  // An unusable budget is refused rather than absorbed. Falling back to the default would run the
  // audit under a bound the caller did not ask for and report the resulting surface as though they
  // had — the same silence this cap exists to remove, committed by the thing that removes it.
  if (maxTotalReadBytes !== undefined) {
    const bytes = Number(maxTotalReadBytes);
    if (!Number.isFinite(bytes) || bytes <= 0) {
      process.stderr.write(
        `standards: --max-total-read-bytes must be a positive number of bytes, got '${maxTotalReadBytes}'.\n`,
      );
      return EXIT_INVOCATION;
    }
  }
  return null;
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

// ---------------------------------------------------------------------------
// init — bootstrap (Standard 33)
//
// Handled before the scan: init does not need an evidence survey, and running one would make a
// bootstrap command slower than the thing it bootstraps.
// ---------------------------------------------------------------------------

async function runInit({ argv, dirFlag, positional, json }, emit) {
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
    return EXIT_INVOCATION;
  }

  // The dry run and the real run share one computation, so the report cannot disagree with what
  // apply() then does (Standard 33 R5).
  if (!dryRun) await applyInit(target, report);

  if (json) {
    emit(JSON.stringify({ ...report, dryRun }, null, 2) + "\n");
  } else {
    emit(renderInit(report, { dryRun }) + "\n");
  }

  // A conflict is unfinished work, not a failure of the command: nothing was changed and the
  // operator has to decide. Exit 1 so a script notices, distinct from 2 which means init could
  // not run at all.
  return report.conflicts.length > 0 ? EXIT_FINDINGS : EXIT_OK;
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

/**
 * Everything one invocation owns, constructed once per run and passed explicitly — ADR 0014.
 *
 * **Construction, not reset.** Each object below is created here, per call. There is deliberately no
 * `reset()` and no `clear()` at run start: clearing makes sequential runs look independent while
 * leaving two concurrent runs sharing one object, and only an identity assertion can tell those two
 * situations apart. Creating removes the possibility instead of policing it.
 *
 * **What is NOT here.** Frozen lookup tables, extension sets and matching configuration stay at
 * module scope. Their values do not depend on which repository is being audited and they have no
 * mutation sites; the invariant is that no *execution-specific* mutable state outlives its
 * invocation, not that module scope is empty.
 *
 * `contents` and `sources` are here because they are execution-specific: their values are the
 * audited project's file contents, so the same key yields a different correct value for a different
 * target. `contents` moved onto the run when the derived-view accessors began answering with
 * availability — telling "never obtained" apart from "not a code file" needs both maps, and an
 * accessor that had to be handed one of them at every call site would be a seam with a hole in it.
 */
/**
 * One content lookup, answered with whether the run actually has the content.
 *
 * `contents` holds an entry for every file the run opened and retained. A file that is in `files`
 * and absent from `contents` was collected and never searched — the read budget was spent, or the
 * read failed. The second of those was not true when this comment was first written: a failed read
 * stored `readText`'s empty-string fallback, so `available` came back true over content nobody had.
 * The read loop was corrected to match; the sentence is load-bearing, not descriptive.
 *
 * The prevailing idiom `contents.get(f) ?? ""` erased exactly that distinction, and
 * because empty is meaningful evidence in BOTH polarities the erasure did not merely lose coverage,
 * it manufactured a verdict: a README nobody opened is "under 400 characters", and a plan file
 * nobody opened has no incomplete items.
 *
 * Returning a value a caller cannot accidentally use as text is the whole mechanism. There is no
 * `?? ""` to reach for, because there is no string to reach.
 *
 * EXPORTED, and only for its own contract test. This function and `viewOf` are the safety property
 * that Standard 44 R12 makes normative, and every other test in the repository reaches them through a
 * whole audit — where the coarse surface withdrawal fires on the same runs and masks whatever they
 * return. Two mutations proved that: coercing an unavailable derived view back to `""`, and
 * collapsing its three states into two, both survived the entire behavioural suite. A safety property
 * whose every observation is confounded by a second mechanism has not been tested, and criterion 1 is
 * specifically about the mechanism rather than about today's verdicts.
 */
export function contentOf(contents, f) {
  if (contents.has(f)) return { available: true, text: contents.get(f) };
  // THREE STATES, and the third was found by a guard rather than reasoned out in advance. Absence
  // from `contents` has two causes: a file that was ELIGIBLE to be read and was not — the loss this
  // seam exists for — and a file the read loop never offered to open at all, because its extension is
  // not a recognised text type. A repository's `.gitignore` has no extension and is in every file
  // list; answering "lost" for it would report evidence loss in every repository on earth, which is
  // the blanket failure the exclusion-authority filter refuses one layer up. Eligibility is asked
  // here rather than at the call site because a caller that had to know the read loop's extension
  // policy to interpret the answer is a caller that can get it wrong.
  return TEXT_EXT.has(path.extname(f))
    ? { available: false, text: null, lost: true, reason: "collected but never searched" }
    : { available: false, text: null, lost: false, reason: "no text content: not a recognised text file" };
}

/**
 * One DERIVED-view lookup, answered the same way, because the coercion was here too.
 *
 * `sourceOf`/`structureOf`/`commentsOf` used to resolve `sources.get(f)?.code ?? ""` — the identical
 * substitution one indirection away, and the one that fed most of the rules that matter, since every
 * code-scanning detector reads a view rather than the raw text. A file the run never obtained has no
 * derived view, so the fallback said "this file contains no import, no catch block, no SQL" about a
 * file nobody opened.
 *
 * THREE STATES, not two, and the third is why this is not just `contentOf` again. A view is absent
 * for two unrelated reasons and they must not be answered alike:
 *
 *   available            the view exists and `text` is it
 *   unavailable, lost    the content was never obtained — evidence loss, and a check must say so
 *   unavailable, kept    the file is not code, so no view was ever derivable — nothing was lost
 *
 * Collapsing the last two would withdraw a rule for every Markdown file in the repository, which is
 * the blanket failure this seam exists to avoid, arrived at from the inside. That collapse is
 * currently unobservable through the CLI — every rule-binding caller guards with `isCode(f)` first,
 * so the third state is reached only by detectors that bind no rule — which is exactly why the
 * contract is pinned directly rather than through behaviour. Defensive today, load-bearing the moment
 * a detector scans without that guard, and the point of a primitive is that it is right before it
 * has to be.
 *
 * Exported for the same reason as `contentOf`; see there.
 */
export function viewOf(sources, contents, f, which) {
  const derived = sources.get(f);
  if (derived) return { available: true, text: derived[which] };
  return contents.has(f)
    ? { available: false, text: null, lost: false, reason: "no derived view: not a recognised code file" }
    : { available: false, text: null, lost: true, reason: "collected but never searched" };
}

function createRun({ root, strict, json }) {
  const findings = [];
  const contents = new Map();
  const sources = new Map();
  // Files opened and read only in part. Carried beside `contents` rather than folded into it,
  // because a prefix IS content and the entry is genuinely available: every presence-based detector
  // is right to search it and right to keep what it finds. This records the one thing the retained
  // text cannot say about itself — that there was more of it.
  const truncated = new Set();

  /**
   * Checks that could not run, by the rule they would have fed.
   *
   * The CHECK is the unit, not the rule, and that is load-bearing rather than tidy. A rule can be
   * established by one check and unknown in another — `reconstruction.baseline-artifacts` fails R4
   * structurally, needing no content at all, while its R6 content test reads a file this run may not
   * have. Withdrawing the whole rule would erase a violation that was genuinely established; leaving
   * it evaluated would report one that was not. Recording per check lets aggregation keep the first
   * and drop the second.
   */
  const unknownChecks = new Map();

  return {
    root,
    strict,
    json,
    findings,
    truncated,
    unknownChecks,

    /**
     * The ONE write door for collected content, and the reason the two maps above are no longer
     * properties of this object.
     *
     * While `contents` and `sources` were exposed, every detector received a live map beside its
     * accessors, so `contents.get(f) ?? ""` stayed one keystroke away at fifteen call sites and the
     * seam held because nobody took it — an invariant maintained by discipline, which is the thing
     * the criterion this closes says it must not be. The read loop is the only caller that has any
     * business writing, so it gets a verb and everyone else gets nothing.
     *
     * Deriving the code view HERE rather than at the call site is part of the same move: the two
     * maps can no longer disagree about which files were retained, because one call fills both.
     */
    retain(f, text) {
      contents.set(f, text);
      if (isCode(f)) sources.set(f, splitSource(text, path.extname(f)));
    },

    /**
     * Record that a check could not be performed, and emit nothing.
     *
     * Deliberately not a finding. A finding is a claim about the project; this is a fact about the
     * run, and Standard 44 R12's whole point is that the two must not be confused. The evidence
     * surface already reports what went unread; this records which conclusions therefore cannot be
     * drawn from it.
     */
    unknown(rule, file, reason) {
      if (!unknownChecks.has(rule)) unknownChecks.set(rule, []);
      unknownChecks.get(rule).push({ file, reason });
    },

    /** Repo-relative path with forward slashes, so output is stable across platforms. */
    rel: (p) => path.relative(root, p).split(path.sep).join("/"),

    has: (p) => existsSync(path.join(root, p)),

    // Availability-returning, exactly like `contentOf`. There is deliberately no accessor on this
    // run that hands back a bare string: a caller cannot forget to branch on evidence it was never
    // given, and `test/read-seam.test.mjs` holds the boundary shut against the next raw `.get`.
    // The raw-text sibling of the three derived views. It completes the set deliberately: while it
    // was missing, a detector needing plain text had exactly one route to it — the `contents` map
    // passed in beside `run` — so the seam was opt-in at every call site rather than enforced. With
    // this here, `contents` no longer has to leave `createRun` at all.
    textOf: (f) => contentOf(contents, f),
    sourceOf: (f) => viewOf(sources, contents, f, "code"),
    structureOf: (f) => viewOf(sources, contents, f, "structure"),
    commentsOf: (f) => viewOf(sources, contents, f, "comments"),

    /**
     * `label` is the Standard 44 evidence label and is not decorative. A detection that rests on a
     * file existing at a path with a defined meaning is OBSERVED. A detection that rests on matching
     * a naming convention or a content pattern is INFERRED — reporting a heuristic as observed is the
     * fabrication error R2 prohibits.
     *
     * This remains the only writer of `findings`, which is what keeps the accumulator auditable. The
     * single-writer property ADR 0007 identified is preserved; what changed is the lifetime.
     */
    addFinding({ id, category, severity = "info", label, evidence, message, standardRef, rule, remediation }) {
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
        // "observed/detected" findings carry none: they report what the repository HAS, not whether
        // it complies, and binding them to a rule would manufacture a verdict out of an observation.
        rule: rule ?? null,
        // Present only when the catalog's rule-level remediation would be untrue for THIS finding,
        // so a finding that says nothing here keeps the catalog's text. Spread rather than set to
        // `undefined`, because an absent key and a key holding undefined are the same thing to
        // `JSON.stringify` and different things to a reader of the audit output.
        ...(remediation ? { remediation } : {}),
      });
    },
  };
}

/**
 * Walk the tree, recording what could not be walked.
 *
 * `loss` is an out-parameter and it is the whole point. An unreadable directory used to return the
 * accumulator unchanged, which is indistinguishable from an empty one: every detector then found
 * nothing under it and the run exited 0 having said nothing about the gap. A negative result over a
 * surface that was never opened is evidence about the walk, not about the project — Standard 44 R12.
 *
 * `excluded` is the same idea pointed the other way. Skipping is not free of consequence: a
 * directory left out of the walk is a directory no detector can report on, so every exclusion is
 * recorded and surfaced in the report. The difference between an exclusion and a loss is that an
 * exclusion is a *decision* about what is not the project's code, and a decision nobody can see is
 * indistinguishable from a tool that quietly went blind.
 *
 * Exclusions are recorded at two granularities, and the difference is deliberate rather than an
 * inconsistency the comment is papering over:
 *
 *   directories  one entry each in `loss.excluded`, carrying the reason that removed it. Three
 *                reasons exist — `ignored by the repository`, `vendored dependency tree`, and
 *                `conventional non-project directory` for `SKIP_DIRS`. The third used to be a bare
 *                `continue`: `.mypy_cache/` was 98 MB in one reproduction and left no trace at all,
 *                which is the same defect class as a silent cap.
 *
 * Each entry also carries `authorizedBy`, and it is a different question from `reason`. `reason`
 * says which branch removed the directory; `authorizedBy` says **who decided** it was disposable —
 * the project, or this tool. Only the project's own decision leaves the evidence surface complete,
 * so the two cannot be collapsed:
 *
 *   repository   the project marked the path ignored. It said this is not its code, and a run that
 *                honours that has lost nothing it was ever owed.
 *   framework    this tool decided, from a hardcoded name or a marker file. Nobody declared the
 *                content disposable; it may be tracked, committed and first-party.
 *   not-project-evidence
 *                the path was never candidate evidence — see `NOT_PROJECT_EVIDENCE`. Recorded so
 *                the exclusion stays visible, but it cannot make a surface incomplete.
 *
 * `SKIP_DIRS` is checked before the repository-ignore set, so a name match wins the `reason` even
 * when the repository independently ignores the same path — which is most real dependency trees.
 * Attributing authority from `reason` alone would therefore report almost every repository as having
 * lost evidence it had in fact declared disposable, so the `SKIP_DIRS` branch asks the ignore set
 * directly rather than inferring. The ordering is left alone: it decides which reason is reported
 * and this decides what the reason is worth, and changing the first to serve the second would
 * rewrite evidence to suit a conclusion.
 *   files        an aggregate count and a bounded sample in `loss.excludedFiles`, never one entry
 *                each. A generated artifact beside tracked code is not a surface anyone expected to
 *                be audited, and listing every one would bury the directory-level exclusions that
 *                actually change what a run covers. Aggregated is not silent; per-file would be
 *                honest and unreadable, which is its own way of hiding something.
 *
 * This comment previously claimed every exclusion was recorded while the code a few lines below
 * dropped two kinds without a word. The comment was wrong and the criterion it contradicted was
 * right, so the code moved rather than the wording.
 */
async function collectFiles(dir, acc, loss, excluded, run) {
  const { root, rel } = run;
  if (acc.length >= MAX_FILES) {
    loss.capped = true;
    return acc;
  }
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    loss.dirs.push(dir); // Skipped rather than aborting the audit, but never skipped silently.
    return acc;
  }

  // A vendored tree identifies itself from the inside, so the marker is checked once the directory
  // has been listed rather than guessed from its name. The root is exempt: a project that IS a
  // virtualenv is a project someone deliberately pointed the audit at, and excluding everything
  // would report a clean run over a repository nothing examined.
  if (dir !== root && entries.some((e) => e.isFile() && VENDOR_MARKERS.has(e.name))) {
    // Always `framework`: the parent loop consults the ignore set before recursing, so a tree
    // that reaches this branch is one the repository did not declare disposable.
    loss.excluded.push({ path: rel(dir), reason: "vendored dependency tree", authorizedBy: "framework" });
    return acc;
  }

  for (const entry of entries) {
    if (acc.length >= MAX_FILES) {
      loss.capped = true;
      return acc;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        loss.excluded.push({
          path: rel(full),
          reason: "conventional non-project directory",
          // Three authorities, not two. The repository's own storage was never project evidence; a
          // path the repository declares ignored is the project's decision; anything else here is
          // this tool's decision about content nobody declared disposable.
          authorizedBy: NOT_PROJECT_EVIDENCE.has(entry.name)
            ? "not-project-evidence"
            : excluded.dirs.has(rel(full))
              ? "repository"
              : "framework",
        });
        continue;
      }
      if (excluded.dirs.has(rel(full))) {
        loss.excluded.push({ path: rel(full), reason: "ignored by the repository", authorizedBy: "repository" });
        continue;
      }
      await collectFiles(full, acc, loss, excluded, run);
    } else if (entry.isFile()) {
      // Aggregated rather than listed — see the granularity note above. The count is what tells a
      // reader coverage shrank; the sample is what lets them recognise the kind of thing that left.
      if (excluded.files.has(rel(full))) {
        loss.excludedFiles.count += 1;
        if (loss.excludedFiles.sample.length < EXCLUDED_FILE_SAMPLE) {
          loss.excludedFiles.sample.push(rel(full));
        }
        continue;
      }
      acc.push(full);
    }
  }
  return acc;
}

/**
 * Read a file, and say what was actually read.
 *
 * Returns `{ ok, text, truncated, bytes }` rather than a bare string. The old signature returned ""
 * for an unreadable file, so a failed read and an empty file were the same value, and it truncated
 * at MAX_READ_BYTES without telling anyone — a detector reported a clean prefix as a clean file.
 *
 * `text` is still usable in both degraded cases: "" for a failed read, and the readable prefix for
 * a truncated one. Findings from a prefix are real findings and are kept. What changes is that the
 * caller can no longer mistake a partial search for a complete one.
 */
async function readText(file) {
  try {
    const buf = await readFile(file);
    const truncated = buf.length > MAX_READ_BYTES;
    const text = truncated ? buf.subarray(0, MAX_READ_BYTES).toString("utf8") : buf.toString("utf8");
    return { ok: true, text, truncated, bytes: buf.length };
  } catch {
    return { ok: false, text: "", truncated: false, bytes: 0 };
  }
}

// ---------------------------------------------------------------------------
// Finding construction
//
// `findings` and its single writer `addFinding` live on the run object (`createRun`), because the
// accumulator belongs to the invocation that produced it. Detectors receive the run and destructure
// what they need; none of them touches the array directly.
// ---------------------------------------------------------------------------

const uniq = (xs) => [...new Set(xs)].sort();

// ---------------------------------------------------------------------------
// Detectors — the six descriptive categories
// ---------------------------------------------------------------------------

const MANIFESTS = [
  "package.json", "go.mod", "Cargo.toml", "pyproject.toml", "requirements.txt",
  "pom.xml", "build.gradle", "build.gradle.kts", "Gemfile", "composer.json",
];

function detectArchitecture(files, run) {
  const { rel, addFinding } = run;
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

function detectCapabilities(files, run) {
  const { rel, addFinding } = run;
  const evidence = [];
  const notes = [];

  const pkgPath = files.find((f) => rel(f) === "package.json");
  const manifest = pkgPath ? run.textOf(pkgPath) : null;
  // `?? "{}"` parsed a manifest nobody read into an empty object, and an empty object has no bin and
  // no scripts — so an unread package.json reported a project with no CLI entry point. This detector
  // binds no rule, so nothing is withdrawn; it simply declines to describe what it did not read.
  if (manifest?.available) {
    try {
      const pkg = JSON.parse(manifest.text);
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

function detectApis(files, run) {
  const { rel, addFinding, structureOf } = run;
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
    if (!code.available) return false; // unread: not a route handler this run can name, and it says so below
    return API_CONTENT.some((re) => re.test(code.text));
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

function detectJobs(files, run) {
  const { rel, addFinding, structureOf, sourceOf } = run;
  const workflowCron = files.filter((f) => {
    if (!/\.github\/workflows\/.*\.ya?ml$/.test(rel(f))) return false;
    const workflow = run.textOf(f);
    if (!workflow.available) return false; // unread: no schedule found is not "no schedule declared"
    return /^\s*schedule:/m.test(workflow.text);
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
    const structure = structureOf(f);
    const code = sourceOf(f);
    if (!structure.available || !code.available) return false; // unread: no claim either way
    if (JOB_CONTENT.some((re) => re.test(structure.text))) return true;
    return importPattern(JOB_PACKAGES).test(code.text); // imports live in strings
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

function detectIntegrations(files, run) {
  const { rel, addFinding, sourceOf } = run;
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
      if (!code.available) continue; // not code, or never read; neither is an integration
      if (re.test(code.text)) {
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

function detectAiInterfaces(files, run) {
  const { rel, addFinding, sourceOf } = run;
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
      if (!code.available) continue; // not code, or never read; neither is a provider SDK
      if (re.test(code.text)) {
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

const TEST_RE = /(^|\/)(tests?|spec|__tests__)\/|\.(test|spec)\.[jt]sx?$|_test\.(go|py)$|Tests?\.cs$|test_.*\.py$/i;
const CI_FILES = [
  ".github/workflows", "azure-pipelines.yml", ".gitlab-ci.yml", "Jenkinsfile",
  ".circleci/config.yml", ".travis.yml", "bitbucket-pipelines.yml",
];

function detectMissingDocs(files, run) {
  const { rel, addFinding } = run;
  const missing = [];
  if (!files.some((f) => rel(f).toLowerCase() === "docs/architecture.md")) missing.push("docs/architecture.md");
  const readme = files.find((f) => /^readme\.md$/i.test(rel(f)));
  if (!readme) missing.push("README.md");
  else {
    // The presence check above is structural and always valid. Only the length test needs content,
    // so only the length test is withdrawn — the missing `docs/architecture.md` beside it still
    // fails the rule, because that was established.
    const c = run.textOf(readme);
    if (!c.available) run.unknown("documentation.architecture", rel(readme), c.reason);
    else if (c.text.trim().length < 400) missing.push(`${rel(readme)} (under 400 characters)`);
  }
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
 * Template prompts still standing in a manifest, and headings with nothing beneath them.
 *
 * The rule's `remediation` says "copy the template and fill it in", and until now only the copying
 * was checked. `standards init` writes `templates/PROJECT.md` with no substitution — PROJECT.md
 * carries neither a `standardVersion:` line for `stampVersion` to stamp nor the agent-instruction
 * markers — so the untouched template and the file `init` just wrote are byte-identical here. Issues
 * #6 and #8 are therefore one specimen for this artifact, but the check does not rely on that: it
 * measures the manifest's own substance rather than comparing against the template, so a template
 * that later gains a generated line does not silently start passing.
 *
 * **A prompt is angle-bracketed and ends its line.** Code spans and fences are removed first, which
 * is what keeps this repository's own `standards/NN-<kebab-title>.md` from reading as an unfilled
 * field — a path inside backticks is documentation, not a prompt. Closing HTML tags and spaceless
 * ones like `<br>` are excluded too. What remains reachable as a false positive is raw HTML with an
 * attribute at end of line, e.g. `<img src="x">`; that is stated rather than hidden, and the finding
 * is phrased as a question for the same reason the catalog calls this assurance `partial`.
 */
function unfilledManifestPrompts(text) {
  // A template comment is not an answer, so neither scan below counts it.
  const prose = text.replace(/<!--[\s\S]*?-->/g, "");

  // Code is removed for the prompt scan and kept for the emptiness scan, because it means opposite
  // things to the two questions. A fenced line like `<html lang="en">` ends in `>` and would read as
  // an unanswered field; the same block under a heading is unmistakably an answer. Stripping code
  // once, for both, was wrong in the second direction and is what the two falsifiers below hold.
  const prompts = (
    prose
      .replace(/```[\s\S]*?```/g, "")
      .replace(/`[^`\n]*`/g, "")
      .match(/<(?!\/)[^<>]*\s[^<>]*>[ \t]*$/gm) || []
  ).map((p) => p.trim());

  // A section whose body is empty once the table skeleton is removed. This exists because a prompt
  // check alone is defeated by deleting the angle brackets and writing nothing, which would leave a
  // manifest that is emptier than the template and passes where the template fails.
  const empty = [];
  const sections = prose.split(/^##\s+(.+)$/m);
  for (let i = 1; i < sections.length; i += 2) {
    if (withoutTableSkeletons(sections[i + 1]).trim() === "") empty.push(sections[i].trim());
  }
  return { prompts, empty };
}

/**
 * Drop table blocks that carry no data, keeping ones that do.
 *
 * A header row is part of the skeleton, not an answer: `| Layer | Technology |` over a separator and
 * nothing else is the template's Stack section verbatim, and counting the header as content made the
 * whole section read as filled in. Rows are indexed rather than pattern-matched — row 0 is the
 * header and row 1 the separator, by markdown's own definition — so a block survives only when some
 * row from the third onwards has a cell in it.
 */
function withoutTableSkeletons(body) {
  const out = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; ) {
    if (!/^\s*\|/.test(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }
    const block = [];
    while (i < lines.length && /^\s*\|/.test(lines[i])) block.push(lines[i++]);
    const hasData = block
      .slice(2)
      .some((row) => row.split("|").slice(1, -1).some((cell) => cell.trim() !== ""));
    if (hasData) out.push(...block);
  }
  return out.join("\n");
}

/**
 * Structural checks for the two architecture rules. Both are `assurance: partial` in the catalog:
 * the file existing is not the same as the file being correct or current, and the catalog says so
 * rather than leaving a reader to infer it (Standard 24 R2).
 *
 * The manifest rule now also asks whether the file was filled in, which moves one case out of
 * `partial` and leaves the rest there. Currency is what remains unestablished, and nothing here can
 * establish it: a manifest answered once and never revisited is indistinguishable, in its bytes,
 * from one answered today.
 */
function detectArchitectureArtifacts(files, run) {
  const { has, rel, addFinding } = run;
  const manifest = ["PROJECT.md", "artifacts/project-manifest.md"];
  const present = manifest.filter((f) => has(f));
  if (present.length === 0) {
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
  } else {
    // Presence was established above and stands on its own. Only the content test needs the file's
    // text, so only the content test withdraws when that text is unavailable (#38): a manifest the
    // run never read is not a manifest observed to be unfilled.
    for (const name of present) {
      const f = files.find((p) => rel(p) === name);
      if (!f) continue;
      const c = run.textOf(f);
      if (!c.available) {
        run.unknown("architecture.project-manifest", name, c.reason);
        continue;
      }
      const { prompts, empty } = unfilledManifestPrompts(c.text);
      if (prompts.length === 0 && empty.length === 0) continue;
      const evidence = [
        ...prompts.map((p) => `${name}: unfilled field ${p}`),
        ...empty.map((h) => `${name}: heading "${h}" has nothing beneath it`),
      ];
      addFinding({
        id: "unfilled-project-manifest",
        rule: "architecture.project-manifest",
        category: "Missing planning artifacts",
        severity: "warning",
        label: "OBSERVED",
        evidence,
        // Named from what was actually found. A finding that reports prompts where it measured
        // empty headings is the same category error one layer out: evidence describing something
        // other than what established it.
        message:
          `${name} ${[
            prompts.length > 0 ? "still carries the template's own prompts" : "",
            empty.length > 0 ? "has headings with nothing beneath them" : "",
          ]
            .filter(Boolean)
            .join(" and ")}, so it records what a manifest should say rather than what this ` +
          "project is. Scaffolding a tool wrote is not evidence that anyone answered it " +
          "(Standard 44 R11).",
        standardRef: R.artifacts,
      });
    }
  }
  // Standard 11 R1 is a SHOULD, and it names one location out of several the industry settled on.
  // `docs/adr/` and `doc/adr/` are what Nygard's original article and adr-tools established, and a
  // project that followed the convention has recorded its decisions durably — which is the whole
  // requirement. Failing it invites the one repair that helps nobody: moving files to satisfy a
  // detector. The manifest check above already accepts two locations for exactly this reason.
  //
  // Deliberately not policy-declared. Detectors also serve `audit`, which takes no policy at all
  // (ADR 0004), so a configurable path would make evidence discovery depend on configuration and
  // give the two commands different answers about what the repository contains.
  const adrDirs = ["artifacts/adr", "docs/adr", "doc/adr"];
  if (!adrDirs.some((d) => has(d))) {
    addFinding({
      id: "missing-adr-directory",
      rule: "architecture.adr",
      category: "Missing planning artifacts",
      severity: "warning",
      label: "OBSERVED",
      evidence: adrDirs,
      message:
        "No ADR directory exists (artifacts/adr/, docs/adr/ or doc/adr/); consequential decisions " +
        "have nowhere durable to live.",
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
function detectMissingPlanningArtifacts(files, run) {
  const { has, addFinding, rel } = run;
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

  const overviewContent = run.textOf(overview);
  if (!overviewContent.available) {
    // "A plan directory is evidence of a plan only when it has content" is a claim about the file's
    // body. Over a body nobody read it is a claim about the run.
    run.unknown("planning.breakdown-directory", rel(overview), overviewContent.reason);
    return;
  }
  const body = overviewContent.text
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

function detectMissingAuditInfrastructure(files, run) {
  const { rel, has, addFinding } = run;
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

function detectUnverifiedFunctionality(files, run) {
  const { rel, findings, addFinding } = run;
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

/**
 * Stubs and skipped tests are code constructs, so they are scanned against structureOf() — not
 * sourceOf(), which this comment claimed for several releases while the code did the right thing.
 * The distinction matters: a stub name inside a string literal is a mention, and only the structural
 * view blanks it.
 *
 * That view is also where this table used to find *itself*. Its own patterns are regex literals, and
 * `splitSource` had no regex mode, so `raise NotImplementedError` on the line below was
 * structural code like any other — the word preceded by a space, the word boundary satisfied, the
 * detector reporting the file that defines it as a file containing an unimplemented stub. It went
 * unseen only because this file was excluded from its own audit. `splitSource` now blanks regex
 * contents in the structural view, which fixes it at the tokenizer rather than by exempting a file.
 */
const UNFINISHED_CODE = [
  [/\bNotImplemented(Error|Exception)?\b|\braise NotImplementedError\b|\bthrow new NotImplementedException\b/, "unimplemented stubs"],
  [/\b(it|test|describe)\.skip\(|\bxit\(|@pytest\.mark\.skip|\[Ignore\]|\bt\.Skip\(/, "skipped tests"],
];

function detectUnfinished(files, run) {
  const { rel, commentsOf, structureOf, addFinding } = run;
  const byKind = new Map();
  const record = (kind, f) => {
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(rel(f));
  };
  for (const f of files) {
    if (!isCode(f)) continue; // a TODO in a Markdown file is a note, not an unfinished code path
    const comments = commentsOf(f);
    const code = structureOf(f);
    if (comments.lost || code.lost) {
      run.unknown("quality.unfinished-work", rel(f), comments.reason ?? code.reason);
      continue; // a file nobody read holds no markers only in the sense that nobody looked
    }
    if (!comments.available || !code.available) continue;
    for (const [re, kind] of UNFINISHED_COMMENTS) if (re.test(comments.text)) record(kind, f);
    for (const [re, kind] of UNFINISHED_CODE) if (re.test(code.text)) record(kind, f);
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

function detectDeadCode(files, run) {
  const { rel, addFinding } = run;
  const candidates = files.filter((f) => {
    const r = rel(f);
    if (!/\.(m?[jt]sx?|py|cs|go|rb)$/.test(r)) return false;
    if (TEST_RE.test(r) || ENTRYISH.test(r)) return false;
    return true;
  });
  // THE SEARCH IS THE EVIDENCE HERE, and that makes this the sharpest case in the file. "Nothing
  // references this name" is established by reading every OTHER file, so a single unread file is
  // enough to make the conclusion unsupported — the reference that would have cleared the orphan may
  // be sitting in exactly the file nobody opened. The raw `.get` treated absent as "does not contain
  // the stem", which is the fabricated-failure polarity: an orphan reported over a search that did
  // not happen. A rule cannot be established file by file when the check ranges over all of them, so
  // the unknown is recorded once for the run rather than per candidate.
  // MEASURED OVER THE REFERENCE SPACE ITSELF, rather than by enumerating the ways a file can go
  // missing. `lost` alone named one of them, and the enumeration was short by two: a file whose
  // extension the read loop never offers to open, and a file opened and retained only in part. Both
  // leave the same hole — a stem the search never saw — and both were measured reporting a live file
  // as dead. A fourth cause would be short again, so the question asked here is the one the claim
  // actually rests on: was every file searched, whole.
  //
  // THE ASYMMETRY THAT MAKES THIS DETECTOR DIFFERENT. Truncation is deliberately not a global
  // withdrawal trigger, and for a presence-based rule that is right: a secret in the first 400 KB is
  // in the file, and a finding from a prefix is a real finding. This rule concludes from what it did
  // NOT find across every other file, so the line that would have cleared an orphan may sit in
  // exactly the bytes past the cap — and unlike a missed secret, which under-reports, this
  // over-reports, naming something live as dead. Withdrawal is per-detector for that reason, so the
  // presence-based rules keep what a prefix genuinely establishes.
  //
  // The cost is real and is the accepted price of the proposition: a repository holding one image or
  // one over-cap file reaches no dead-code verdict. A rule claiming absence cannot honestly pass or
  // fail without searching the whole domain it claims over, and preserving the verdict because most
  // repositories contain a non-text file would be preserving it over a search that did not happen.
  const unsearchable = files.filter((other) => !run.textOf(other).available || run.truncated.has(other));
  if (unsearchable.length > 0) {
    run.unknown(
      "quality.dead-code",
      rel(unsearchable[0]),
      `${unsearchable.length} file(s) went unsearched or were read in part, so "referenced nowhere" ` +
        "is not established",
    );
    return;
  }

  const orphans = [];
  for (const f of candidates) {
    const stem = path.basename(rel(f)).replace(/\.[^.]+$/, "");
    if (stem.length < 3) continue;
    const referenced = files.some((other) => {
      if (other === f) return false;
      const candidate = run.textOf(other);
      // Every unsearchable file already returned above, so this is now a total function over a
      // reference space that was read whole. The branch is kept because the type still admits the
      // other answer, not because it can be reached.
      return candidate.available ? candidate.text.includes(stem) : false;
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

function detectOpenQuestions(files, run) {
  const { rel, addFinding } = run;
  const qFile = files.find((f) => rel(f) === "artifacts/project-baseline/open-questions.md");
  if (!qFile) return;
  const questions = run.textOf(qFile);
  if (!questions.available) {
    // The quiet polarity. Both counts below come from matching this text, so an unread file scores
    // zero on each and the rule passes — silence indistinguishable from a clean document.
    run.unknown("reconstruction.open-questions", rel(qFile), questions.reason);
    return;
  }
  const text = questions.text;
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

async function detectPlanDiscrepancies(files, run) {
  const { rel, root, addFinding } = run;
  const planFiles = files.filter((f) => /^artifacts\/project-plan-breakdown\/.+\.md$/.test(rel(f)));
  if (planFiles.length === 0) return;

  // One read, two rules, and they must move together. `planning.item-fields` and
  // `planning.plan-code-consistency` are both derived from these bytes, and today one is withdrawn
  // by CONTENT_DERIVED_RULES while the other is not — byte-identical evidence classified two ways by
  // a table that is not addressing the thing that varies. Recording the unknown against both is what
  // makes the read site, rather than the table, the thing that decides.
  //
  // Files that WERE read are still parsed: a violation found in one plan file is established
  // regardless of another going unread, and aggregation keeps it.
  for (const f of planFiles.filter((f) => !run.textOf(f).available)) {
    const reason = run.textOf(f).reason;
    run.unknown("planning.item-fields", rel(f), reason);
    run.unknown("planning.plan-code-consistency", rel(f), reason);
  }
  const items = planFiles
    .filter((f) => run.textOf(f).available)
    .flatMap((f) => parsePlanItems(run.textOf(f).text, rel(f)));
  const executable = items.filter((i) => i.fields.has("Status"));
  if (executable.length === 0) return;

  const dangling = [];
  const unverifiable = [];
  const missingDeliverables = [];
  const incomplete = [];

  // Discovered once per run, not per item: the backlog a repository has does not change between two
  // plan items, and asking the filesystem the same question forty times would be forty chances for
  // two items to get different answers. Discovery reads the repository rather than a policy, so
  // `audit` — which takes no policy at all (ADR 0004) — reaches the same result as `validate`.
  const backlog = discoverBacklog(root);

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
    const legacyTracked = String(item.fields.get("Status") ?? "").match(/tracked as\s+(.+)$/i);
    const declared = String(
      item.fields.get("Tracked by") ?? item.fields.get("TrackedBy") ?? (legacyTracked ? legacyTracked[1] : ""),
    ).trim();

    if (declared) {
      // Three outcomes, not a boolean. `scripts/tracking.mjs` separates *the authority was asked and
      // does not have this* from *there was no authority to ask*, which the previous existsSync
      // check collapsed into one branch — and which is the difference between a defect in the plan
      // and a limit on what this run could establish (Standard 44 R12).
      const ref = resolveTracked(declared, { root, backlog });

      if (ref.outcome === OUTCOME.missing) {
        dangling.push(`${item.file} :: ${item.title} -> ${ref.id} (${ref.reason})`);
        continue;
      }

      if (ref.outcome === OUTCOME.unverifiable) {
        // Recorded, and deliberately NOT resolved into a status. The plan says this item's liveness
        // lives elsewhere; this run did not go there. Falling through to the item's own Status — as
        // the previous implementation silently did for every reference it could not parse — turns
        // "I did not ask" into "the authority agrees".
        unverifiable.push(
          `${item.file} :: ${item.title} -> ${declared} (${ref.reason}); the item's own ` +
            `Status ${canonicalStatus(item.fields.get("Status"))} is a cached copy this run did not validate`,
        );
      } else {
        const backlogText = (await readText(ref.path)).text;
        status = canonicalStatus((backlogText.match(/^status:\s*(\S+)/im) ?? [, "unknown"])[1]);
      }
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
  if (unverifiable.length) {
    // Carries NO `rule`, and that is the load-bearing part of this finding rather than an omission.
    //
    // A finding bound to `planning.plan-code-consistency` fails that rule outright, whatever its own
    // severity. Binding this one would mean a repository is non-compliant with "a completed plan
    // item's deliverables exist" because it tracks work in GitHub issues — converting a limit on
    // what the run could reach into a claim that the plan is inconsistent, which is precisely the
    // inversion this finding exists to stop. Not-knowing is reported as not-knowing and scores
    // nothing, in either direction (Standard 44 R12, ADR 0008).
    //
    // A new catalog rule would be the other way to carry it, and that is a versioning decision with
    // adopter consequences rather than a detail of this fix. Recorded as available and not taken.
    addFinding({
      id: "delegated-liveness-unverifiable",
      category: "Plan/code discrepancies",
      severity: "warning",
      label: "OBSERVED",
      evidence: unverifiable,
      message:
        `${unverifiable.length} plan item(s) delegate status to an authority this run did not consult. ` +
        "Their own Status is a cached copy, and this run neither confirms nor contradicts it.",
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

/**
 * Whether a backticked README token is a claim about a file in THIS working tree.
 *
 * Not everything containing a slash is a path. A README for a web service is full of `/api/health`
 * and `/users/:id`, which are HTTP routes: they resolve against a running server, not a checkout.
 * Reporting them as missing files tells an author to correct a document that was already right, and
 * the likely repair — deleting a true statement, or adding a caveat Standard 32 forbids — leaves the
 * README worse than the detector found it.
 *
 * The discriminator is the leading slash. Repository paths are written relative to the root
 * (`src/index.ts`, `scripts/build.sh`); a leading slash means a URL path or a filesystem-absolute
 * path, and neither is a claim about this repository. The exception is root-relative prose like
 * `/src/index.ts`, so a leading-slash token still counts when its last segment carries a file
 * extension — routes rarely do, files nearly always do.
 *
 * Erring toward silence is deliberate. A missed discrepancy is a check that did not fire; a false
 * one spends an author's trust and teaches them to work around the tool. Both bugs this detector
 * layer has shipped were false positives, and this was the third.
 */
function looksLikeRepositoryPath(p) {
  if (!p.includes("/") || /\s/.test(p)) return false;
  if (p.startsWith("http") || p.startsWith("//")) return false; // URL
  if (p.startsWith("-")) return false; // a CLI flag that happens to carry a path
  if (p.startsWith("~") || /^[A-Za-z]:/.test(p)) return false; // outside this repository
  if (/[:{}<>*?#]/.test(p)) return false; // route parameter, glob, template, query, fragment
  if (p.startsWith("/")) return /\.[a-z0-9]+$/i.test(path.basename(p));
  return true;
}

function detectDocDiscrepancies(files, run) {
  const { rel, root, addFinding } = run;
  const readme = files.find((f) => /^readme\.md$/i.test(rel(f)));
  if (!readme) return;
  const doc = run.textOf(readme);
  if (!doc.available) {
    // A README nobody opened names no broken path. Both polarities were reachable from `?? ""`: this
    // one reported clean, and the length check in another detector reported the same file as short.
    run.unknown("documentation.code-consistency", rel(readme), doc.reason);
    return;
  }
  const text = doc.text;
  const broken = [];
  const unresolved = [];

  for (const token of text.match(/`([^`\n]+)`/g) ?? []) {
    const p = token.slice(1, -1).trim();
    if (!looksLikeRepositoryPath(p)) continue;
    const clean = p.replace(/\/$/, "");

    // A LEADING `./` NAMES A WORKING DIRECTORY, AND THIS DOCUMENT MAY NOT ESTABLISH ONE.
    //
    // `./x` asserts a location relative to wherever the reader is standing, which for a command is
    // whatever they last changed to. Joining it to the repository root answers a question the
    // document never asked, and the answer looks authoritative: issue #4's `./mvnw` was reported
    // missing against an adopter whose README named it correctly, as the Maven Wrapper, in prose
    // that never claimed it sat at the root.
    //
    // So the base is UNAVAILABLE rather than root, and an unavailable base is a fact about the run
    // (Standard 44 R12) — recorded through `unknown`, never as a finding. The aggregation's
    // precedence rule is what makes this safe per token: a rule with a confirmed violation stays
    // `failed` and keeps that finding, so withdrawing one ambiguous token cannot launder a real one
    // beside it. Only a README whose every candidate is ambiguous reports `not-evaluated`.
    //
    // The cost is stated rather than discovered: a genuinely broken `./does-not-exist` in bare prose
    // is now unreported too. That is the honest outcome and not a gap to close by trying prefixes
    // until one matches — a base guessed from the filesystem is not a base the document stated, and
    // a check that resolves eagerly enough to always succeed has stopped being a check.
    if (clean.startsWith("./")) {
      run.unknown(
        "documentation.code-consistency",
        rel(readme),
        `\`${p}\` is stated relative to a working directory, and this document does not establish one`,
      );
      continue;
    }

    if (existsSync(path.join(root, clean))) continue;

    // NOT FOUND AT THE ROOT IS TWO DIFFERENT OBSERVATIONS, AND THEY EARN DIFFERENT INSTRUCTIONS.
    //
    // `src/nope.ts` where `src/` exists: the run resolved the base the document implied and the leaf
    // is absent. That is a claim observed to be wrong, and "correct the document" is the right thing
    // to say.
    //
    // `overlays/prod` where no `overlays/` exists at the root: the run found nothing corroborating
    // that the root is the base at all. It has established that the token does not resolve from the
    // root — nothing more. Calling that "does not exist" states a conclusion the run did not reach,
    // and issue #4 is what that costs: an adopter told to correct a document that was right.
    //
    // The finding is still raised and the rule still fails. This is not the withdrawal rejected on
    // the way here — withdrawing every token with an absent parent stops reporting a deleted
    // directory tree, which is the stale-documentation case this rule exists for. Detection is
    // identical; only the sentence and the instruction change, and they change to what was measured.
    // A single-segment token's parent is `.`, which joins back to the root — so a bare `nope/` is
    // corroborated by the root's own existence and needs no special case. One was written here and
    // removed: it was unreachable, and an unreachable branch is a mutant nothing can kill.
    const parent = path.dirname(clean);
    const baseCorroborated = existsSync(path.join(root, parent));
    (baseCorroborated ? broken : unresolved).push(`${rel(readme)} -> ${p}`);
  }

  const pkgPath = files.find((f) => rel(f) === "package.json");
  const manifest = pkgPath ? run.textOf(pkgPath) : null;
  if (manifest && !manifest.available) {
    // The opposite polarity of the same coercion: an unread manifest parsed to `{}`, which has no
    // scripts, so EVERY `npm run` in the README became a broken command. A fabricated failure.
    run.unknown("documentation.code-consistency", rel(pkgPath), manifest.reason);
    return;
  }
  if (manifest) {
    try {
      const scripts = Object.keys(JSON.parse(manifest.text).scripts ?? {});
      for (const m of text.match(/npm run ([\w:-]+)/g) ?? []) {
        const name = m.replace("npm run ", "");
        if (!scripts.includes(name)) broken.push(`${rel(readme)} -> npm run ${name}`);
      }
    } catch {
      /* handled by other detectors */
    }
  }

  // Emitted before the unresolved finding on purpose. Where a README carries both, the rule's
  // one-line message and remediation are taken from the first hit, and an established violation is
  // the more useful thing to put in front of a reader than an ambiguity standing beside it.
  if (broken.length > 0) {
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

  if (unresolved.length > 0) {
    addFinding({
      id: "doc-path-base-unestablished",
      rule: "documentation.code-consistency",
      category: "Documentation/code discrepancies",
      severity: "error",
      // INFERRED, not OBSERVED. The observation is that the token does not resolve from the root;
      // reading that as a defect rests on the convention that a bare path is root-relative, and
      // Standard 44 reserves OBSERVED for what a defined meaning establishes.
      label: "INFERRED",
      evidence: uniq(unresolved),
      message:
        `${unresolved.length} path(s) named in the README could not be resolved from the repository ` +
        "root, and nothing in the repository corroborates the root as their base — their containing " +
        "directories are not present there either. Whether the document is wrong, or states its base " +
        "somewhere this run cannot read, was not established.",
      // Overrides the catalog's "Correct the document, or remove the wrong claim", which would
      // instruct a content change over a conclusion no check reached.
      remediation:
        "Establish the base: link or name the directory these paths are relative to, or make them " +
        "relative to the repository root. Correct the paths only if they are actually wrong — this " +
        "run did not establish that, and a correct document should not be edited to satisfy it.",
      standardRef: R.done,
    });
  }
}

function detectStandardsViolations(files, run) {
  const { has, rel, addFinding } = run;
  const violations = [];
  if (has("artifacts/project-baseline")) {
    if (!has("artifacts/project-baseline/reconstructed-baseline.md")) {
      violations.push(["artifacts/project-baseline/", "R4: baseline directory exists without reconstructed-baseline.md", R.artifacts]);
    }
    const promptFile = files.find((f) => rel(f) === "artifacts/project-baseline/RECONSTRUCTED-PROMPT.md");
    if (promptFile) {
      // The mixed case in one detector. R4 above is structural and may already have failed; R6 here
      // needs the prompt's text. Withdrawing both because this one is unknown would erase R4's
      // established violation, which is precisely why the check rather than the rule is the unit.
      const prompt = run.textOf(promptFile);
      if (!prompt.available) {
        run.unknown("reconstruction.baseline-artifacts", rel(promptFile), prompt.reason);
      } else if (!/reconstructed from the existing codebase/i.test(prompt.text)) {
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

// ---------------------------------------------------------------------------
// Detectors — the must-never layer (Standards 45-53)
//
// Standard 45 R5's brittle-check prohibition governs every one of these: a check that fires often
// enough to be ignored is worse than none, because its clean runs are still counted as assurance.
// So each covers a narrow, high-confidence subset, and its standard states the subset rather than
// the aspiration.
//
// Each detector's doc comment MUST declare which source view it scans and why that view is right
// for its signal. That is not documentation discipline — it is the structural fix for the defect
// this tool has shipped five times, and a detector reaching for raw `contents` to find a code
// signal is reintroducing it.
// ---------------------------------------------------------------------------

/**
 * scm.no-committed-env-files — Standard 46 R2.
 *
 * VIEW: the repository index, for both halves of the question. No content is read and none needs to
 * be: the question is whether a file of that name is *tracked*, not what is in it. Reading it would
 * also duplicate security.no-secrets-in-artifacts, which excludes these files for exactly that
 * reason — one defect, one finding.
 *
 * The index both *enumerates* the candidates and *decides* them, and the first half is the one that
 * is easy to get wrong. An earlier version of this detector took its candidates from the directory
 * walk and asked Git only to confirm them, which sounds equivalent and is not: a file that is
 * committed but absent from the working tree — deleted without staging the deletion, excluded by a
 * sparse checkout — proposes no candidate, so nothing is asked about it and the rule returns a pass
 * it never established. The reviewer who found that was right that confirming filesystem-proposed
 * candidates is still the filesystem answering a question about the repository.
 *
 * `present on disk` and `tracked` are different facts, and this rule is `forbidden` — satisfied by
 * the absence of a violation — so asserting an unproven one is not a rounding error: the remediation
 * is credential rotation, and the cost of being wrong lands on somebody who did nothing (ADR 0008).
 * The working-tree list survives only to describe what a reader can see when the index cannot be
 * read, and absence from disk is never read as a pass.
 */
const ENV_FILE_RE = /(^|\/)\.env(\.[\w.-]+)?$/;
const ENV_PERMITTED = /\.(example|template|sample|vault)$/;
// A prefilter for the index query, never the decision. `*` matches `/` in a pathspec, so this asks
// Git for every tracked path containing `.env` anywhere and ENV_FILE_RE decides which of them are
// environment files. One definition of what counts, in the detector that owns it.
const ENV_PATHSPECS = ["*.env*"];

function detectCommittedEnvFiles(files, repoRoot, repo, run) {
  const { rel, addFinding } = run;
  const isCandidate = (p) => ENV_FILE_RE.test(p) && !ENV_PERMITTED.test(p);

  // Present on disk, and used only to describe what a reader can see when the index cannot be read.
  // It is deliberately NOT the candidate set: see the comment above the query below.
  const onDisk = files.map((f) => rel(f)).filter(isCandidate).sort();

  const listed = repo.available ? trackedMatching(repoRoot, ENV_PATHSPECS) : { ok: false, files: null };
  if (!listed.ok) {
    // Not evaluated either way — absence from an unreadable index establishes nothing. The finding
    // is emitted only when there is something concrete to name, because a project that is simply
    // not a Git repository would otherwise collect an evidence-surface warning on every run for a
    // question it never asked. The disposition still says the rule was not evaluated; what is
    // suppressed is noise, never the not-evaluated verdict.
    if (onDisk.length === 0) return { evaluated: false };
    addFinding({
      id: "repository-evidence-unavailable",
      category: "evidence-surface",
      severity: "warning",
      label: "OBSERVED",
      evidence: onDisk,
      message:
        `Which environment files this repository tracks could not be established: ` +
        `${repo.reason ?? "the repository index could not be read"}. Presence on disk is not a ` +
        `violation and absence from disk is not a pass, so scm.no-committed-env-files reports ` +
        `not-evaluated${onDisk.length ? `; ${onDisk.length} such file(s) are present here` : ""}. ` +
        `Check \`git ls-files\` against them before rotating anything.`,
      standardRef: R.search,
    });
    return { evaluated: false };
  }

  // The index does not know what the walk skips, and the walk's exclusions are not cosmetic: this
  // repository's own `test/fixtures/never-violations/.env` is a tracked file that exists precisely
  // so the detector has something to find, and reporting it as a violation of this repository would
  // be the tool auditing its own test data (Standard 29, Standard 34 R4). Filtered through the same
  // SKIP_DIRS the walk uses, so one exclusion rule governs both halves of the seam rather than two
  // that drift.
  const skipped = (p) => p.split("/").some((segment) => SKIP_DIRS.has(segment));
  const tracked = listed.files.filter((p) => isCandidate(p) && !skipped(p)).sort();
  if (tracked.length === 0) return { evaluated: true };

  addFinding({
    id: "committed-env-file",
    rule: "scm.no-committed-env-files",
    category: "Standards violations",
    severity: "error",
    label: "OBSERVED",
    evidence: tracked,
    message: `${tracked.length} environment file(s) are tracked. Rotate anything they contained; an example variant is the supported alternative.`,
    standardRef: N.envFiles,
  });
  return { evaluated: true };
}

/**
 * security.no-secrets-in-artifacts — Standard 16 R2, evaluated from 2.0.0 (Standard 46 R1).
 *
 * VIEW: `sourceOf` for code — comments removed, strings intact — because a credential lives inside
 * a string literal and `structureOf` would blank exactly the thing being looked for. Raw text for
 * .yml/.yaml/.json/.toml, which have no code structure to extract. NEVER Markdown: documentation
 * names credential shapes in order to prohibit them, and this file's own patterns would be findings.
 *
 * Excludes .env files entirely — scm.no-committed-env-files owns those by filename.
 *
 * High-confidence shapes only. No entropy scoring: a check that flags every base64 blob is the
 * brittle check Standard 45 R5 forbids, and its clean runs would be counted as assurance.
 */
const CONFIG_EXT = new Set([".yml", ".yaml", ".json", ".toml"]);
const SECRET_PATTERNS = [
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, "private key block"],
  [/\bAKIA[0-9A-Z]{16}\b/, "AWS access key id"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}/, "GitHub token"],
  [/\bglpat-[A-Za-z0-9_-]{20,}/, "GitLab personal access token"],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}/, "Slack token"],
  [/\bsk_live_[A-Za-z0-9]{16,}/, "Stripe live secret key"],
];

function detectSecretsInArtifacts(files, run) {
  const { rel, sourceOf, addFinding } = run;
  const hits = [];
  for (const f of files) {
    const p = rel(f);
    if (ENV_FILE_RE.test(p)) continue; // Single owner: scm.no-committed-env-files.
    const ext = path.extname(f);
    let evidence = null;
    if (isCode(f)) evidence = sourceOf(f);
    else if (CONFIG_EXT.has(ext)) evidence = run.textOf(f);
    if (!evidence) continue; // neither code nor config: not this detector's subject at all
    if (evidence.lost) {
      run.unknown("security.no-secrets-in-artifacts", p, evidence.reason);
      continue;
    }
    if (!evidence.available) continue;

    for (const [re, what] of SECRET_PATTERNS) {
      if (re.test(evidence.text)) hits.push(`${p} (${what})`);
    }
  }
  if (hits.length === 0) return;

  addFinding({
    id: "secret-in-artifact",
    rule: "security.no-secrets-in-artifacts",
    category: "Standards violations",
    severity: "error",
    label: "INFERRED",
    evidence: uniq(hits).sort(),
    message: `${hits.length} credential-shaped value(s) in tracked files. Rotate first — removing it from HEAD does not remove it from history.`,
    standardRef: N.secrets,
  });
}

/**
 * errors.no-swallowed-exceptions — Standard 48 R1.
 *
 * VIEW: `structureOf` AND raw contents, both required, for different halves of the question.
 * `structureOf` proves a real catch construct — a `catch {}` inside a string or a comment is
 * invisible there, which is correct. Raw text proves the absence of a justification comment inside
 * the braces, because comments survive only in the raw text. The standard treats the comment at the
 * catch site as the documented contract, so a detector that could not see comments would report
 * every justified catch as a violation.
 */
// Matched against the offset-aligned structural view, so a `catch {}` written inside a string or a
// comment is not here to be found — those positions are blanked. The opening brace is where the
// match ends: the body is then read by brace matching rather than by pattern, because a body
// containing anything at all is exactly what the pattern cannot express.
// Sources rather than compiled matchers, and the distinction is the point. A `RegExp` carrying `g`
// is a mutable object: `lastIndex` is state, and whether that state escapes an invocation depends on
// the calling idiom rather than on anything visible at the declaration. `matchAll` happens to clone,
// `exec` in a loop does not, and a module-level binding whose safety rests on which one a future
// caller reaches for is exactly the ambiguity ADR 0007 exists to remove. A string cannot hold
// `lastIndex`, so no judgement about it is required: module-level values describe matching
// behaviour, and the matcher itself is constructed once per invocation.
const CATCH_OPEN_SOURCE = String.raw`\bcatch\s*(\([^)]*\))?\s*\{`;
const EXCEPT_PASS_SOURCE = String.raw`\bexcept\b[^\n:]*:[ \t]*\n[ \t]*pass\b`;

/** The index just past the `}` closing the block opened at `open`, or -1 if it is unbalanced. */
function blockEnd(structure, open) {
  let depth = 0;
  for (let i = open; i < structure.length; i += 1) {
    if (structure[i] === "{") depth += 1;
    else if (structure[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * A span carries a justification when the raw text holds something the structural view dropped.
 *
 * That is the whole test, and it is exact rather than heuristic: `structure` blanks comments and
 * string contents in place, so any non-whitespace character present in the raw span and absent from
 * the structural span *is* a comment or a string — which is precisely what a justification is made
 * of ([Standard 48](../standards/48-error-handling-and-observability.md) R1 accepts a comment at the
 * catch site as the documented contract).
 */
function carriesJustification(raw, structure, from, to) {
  const strip = (s) => s.replace(/\s+/g, "");
  return strip(raw.slice(from, to)) !== strip(structure.slice(from, to));
}

/**
 * Empty catch blocks — by site, never by count.
 *
 * The previous implementation counted empty-catch matches in the structural view, counted them in
 * the raw view, and took the smaller number. That is a conjunction without subject identity: two
 * counts can both be non-zero while referring to different places in the file, and this repository
 * is where that was demonstrated. `scripts/standards.mjs` holds two comment-justified catches, which
 * the structural view sees as empty because the justification is a comment, and exactly one raw
 * match — the sentence in this very comment block explaining that a `catch {}` inside a comment is
 * not a violation. min(2, 1) reported one violating catch site. There was none. The file went
 * unnoticed only because it was excluded from its own audit.
 *
 * Site matching removes the possibility rather than tuning the counts: each catch construct is
 * located in the offset-aligned structural view, its body span is found by brace matching, and that
 * same span is read in the raw text. One site, two readings of it.
 *
 * VIEW: structureOf() to find the construct, and the raw contents over the SAME span to decide
 * whether it is justified. Both are required and neither would do alone — the structural view proves
 * a real catch rather than one quoted in a string or described in a comment, and only the raw text
 * still holds the justification comment, because that is the one thing the structural view removes.
 * The span is what binds them: two readings of one site, not two searches of one file.
 */
function detectSwallowedExceptions(files, run) {
  const { rel, structureOf, addFinding } = run;
  const hits = [];
  for (const f of files) {
    if (!isCode(f)) continue;
    const view = structureOf(f);
    const source = run.textOf(f);
    if (view.lost || source.lost) {
      run.unknown("errors.no-swallowed-exceptions", rel(f), view.reason ?? source.reason);
      continue;
    }
    if (!view.available || !source.available) continue;
    const structure = view.text;
    const raw = source.text;
    if (raw.length !== structure.length) continue; // views are not aligned; say nothing rather than guess

    // Constructed here, so their `lastIndex` cannot outlive this file's turn through the loop.
    const catchOpen = new RegExp(CATCH_OPEN_SOURCE, "g");
    const exceptPass = new RegExp(EXCEPT_PASS_SOURCE, "g");

    let unjustified = 0;
    for (const m of structure.matchAll(catchOpen)) {
      const open = m.index + m[0].length - 1;
      const close = blockEnd(structure, open);
      if (close === -1) continue;
      const body = structure.slice(open + 1, close);
      if (body.trim() !== "") continue; // real handling code
      if (carriesJustification(raw, structure, open + 1, close)) continue; // a documented contract
      unjustified += 1;
    }
    for (const m of structure.matchAll(exceptPass)) {
      if (carriesJustification(raw, structure, m.index, m.index + m[0].length)) continue;
      unjustified += 1;
    }
    if (unjustified > 0) hits.push(rel(f));
  }
  if (hits.length === 0) return;

  addFinding({
    id: "swallowed-exception",
    rule: "errors.no-swallowed-exceptions",
    category: "Standards violations",
    severity: "error",
    label: "INFERRED",
    evidence: uniq(hits).sort(),
    message: `${hits.length} file(s) contain a catch block empty of both handling code and justification.`,
    standardRef: N.swallowed,
  });
}

/**
 * security.no-cert-bypass — Standard 50 R2.
 *
 * VIEW: `structureOf` — comments removed, string contents blanked. A pattern named in documentation
 * or quoted in a string is not a bypass, and this framework's own standards documents name every
 * one of these patterns in order to prohibit them.
 *
 * `curl -k` is matched in shell scripts only, where it is a command rather than a mention.
 */
const CERT_BYPASS = [
  /\brejectUnauthorized\s*:\s*false/,
  /\bNODE_TLS_REJECT_UNAUTHORIZED\b/,
  /\bverify\s*=\s*False\b/,
  /\bInsecureSkipVerify\s*:\s*true/,
  /ServerCertificateValidationCallback\s*(\+?=)\s*[^;]*=>\s*true/,
  /ServerCertificateCustomValidationCallback\s*=\s*[^;]*=>\s*true/,
];

function detectCertBypass(files, run) {
  const { rel, structureOf, addFinding } = run;
  const hits = [];
  for (const f of files) {
    if (!isCode(f)) continue;
    const code = structureOf(f);
    if (code.lost) {
      run.unknown("security.no-cert-bypass", rel(f), code.reason);
      continue; // a forbidden rule reporting clean over a file nobody opened is the whole defect
    }
    if (!code.available) continue;
    if (CERT_BYPASS.some((re) => re.test(code.text))) hits.push(rel(f));
    else if (path.extname(f) === ".sh" && /\bcurl\b[^\n|]*\s-[a-zA-Z]*k\b/.test(code.text)) hits.push(rel(f));
  }
  if (hits.length === 0) return;

  addFinding({
    id: "certificate-validation-bypass",
    rule: "security.no-cert-bypass",
    category: "Standards violations",
    severity: "error",
    label: "INFERRED",
    evidence: uniq(hits).sort(),
    message: `${hits.length} file(s) disable TLS certificate or hostname verification.`,
    standardRef: N.certBypass,
  });
}

/**
 * security.no-sql-concat — Standard 50 R3.
 *
 * VIEW: `sourceOf` — comments removed, strings intact — because the interpolation being detected
 * lives inside a string literal, which `structureOf` blanks.
 *
 * COVERED SUBSET, and it is narrower than the prohibition: a template literal or Python f-string
 * containing a whole SQL STATEMENT and an interpolation after it. The string-concatenation form
 * ("SELECT ..." + id) is deliberately NOT detected — it was implemented, produced too many false
 * positives on ordinary string building, and was removed rather than shipped as a check that would
 * be silenced. Standard 50 R3 states this, and states what follows: a clean result means "no
 * supported pattern was detected", never "this project has no SQL injection risk".
 *
 * A whole statement rather than a bare keyword, because the first version of this matched any of
 * SELECT / WHERE / ORDER BY and immediately reported `const where = `${file}: ...`` in this
 * repository's own catalog loader — an ordinary variable named `where`. That is precisely the
 * brittle check Standard 45 R5 forbids, caught by the self-audit on its first run.
 */
const SQL_STATEMENT = String.raw`(SELECT\b[\s\S]*?\bFROM|INSERT\s+INTO|UPDATE\b[\s\S]*?\bSET|DELETE\s+FROM)`;
const SQL_TEMPLATE = new RegExp("`[^`]*\\b" + SQL_STATEMENT + "\\b[^`]*\\$\\{[^}]+\\}[^`]*`", "i");
const SQL_FSTRING = new RegExp('f["\'][^"\']*\\b' + SQL_STATEMENT + '\\b[^"\']*\\{[^}]+\\}[^"\']*["\']', "i");

function detectSqlConcat(files, run) {
  const { rel, sourceOf, addFinding } = run;
  const hits = [];
  for (const f of files) {
    if (!isCode(f)) continue;
    const code = sourceOf(f);
    if (code.lost) {
      run.unknown("security.no-sql-concat", rel(f), code.reason);
      continue;
    }
    if (!code.available) continue;
    if (SQL_TEMPLATE.test(code.text) || SQL_FSTRING.test(code.text)) hits.push(rel(f));
  }
  if (hits.length === 0) return;

  addFinding({
    id: "sql-string-interpolation",
    rule: "security.no-sql-concat",
    category: "Standards violations",
    severity: "error",
    label: "INFERRED",
    evidence: uniq(hits).sort(),
    message: `${hits.length} file(s) interpolate a value into SQL text. Use a parameterized query, or validate an identifier against an allow-list.`,
    standardRef: N.sqlConcat,
  });
}

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

function renderHuman(fileCount, surface, run) {
  const { root, findings, strict } = run;
  const lines = [];
  lines.push(`standards audit — ${path.basename(root)} (${root.split(path.sep).join("/")})`);
  lines.push(`${fileCount} file(s) scanned, ${findings.length} finding(s).`);
  // The scanned count above is the sentence that would otherwise imply a complete search. When the
  // surface has holes in it, say so on the same line rather than leaving it to be inferred from a
  // warning further down.
  if (!surface.complete) {
    const parts = [];
    if (surface.unreadableFiles.length) parts.push(`${surface.unreadableFiles.length} file(s) unreadable`);
    if (surface.unreadableDirectories.length) parts.push(`${surface.unreadableDirectories.length} directory(ies) unlistable`);
    if (surface.truncatedFiles.length) parts.push(`${surface.truncatedFiles.length} file(s) read in part`);
    if (surface.fileCapReached) parts.push(`the ${MAX_FILES}-file cap was reached`);
    if (surface.readBudget.exhausted) {
      parts.push(
        `${surface.readBudget.unreadFiles} file(s) never opened once the ` +
          `${surface.readBudget.limitBytes}-byte read budget was spent`,
      );
    }
    // Six terms here, six in `complete`. The two lists are parallel by obligation and not by
    // construction — one lives on the evidence surface and one lives in this renderer — and this
    // term was missing for exactly as long as it took to notice. The sixth was added to `complete`
    // and not to this list, so on a run whose only loss was a tool-decided exclusion the header
    // printed `Evidence surface INCOMPLETE — .`: a run announcing it had lost evidence and then
    // naming none of it. Measured on this repository, where `test/fixtures` is the only loss.
    //
    // That is the same defect this whole boundary exists to prevent, one layer up: the predicate
    // told the truth and the sentence a reader actually sees did not. The paths are named rather
    // than counted because the exclusion summary below lists EVERY exclusion, repository-authorized
    // ones included, so a count alone would leave the reader unable to tell which subset was the
    // cause. Anything added to `complete` after this belongs here in the same commit.
    if (surface.frameworkExcludedDirectories.length) {
      const all = surface.frameworkExcludedDirectories;
      const rest = all.length > 6 ? ` and ${all.length - 6} more` : "";
      parts.push(
        `${all.length} directory(ies) excluded by this tool rather than by the repository ` +
          `(${all.slice(0, 6).join(", ")}${rest})`,
      );
    }
    lines.push(`Evidence surface INCOMPLETE — ${parts.join(", ")}. Results below cover what was read, and nothing else.`);
  }
  // Stated separately from incompleteness, and always — not only when something else went wrong.
  // An exclusion is a decision about what is not the project's code, and a reader who cannot see
  // which directories were left out cannot tell a focused audit from a blind one. The count is the
  // part that matters at a glance; the paths are in `evidenceSurface.excludedDirectories`.
  if (surface.excludedDirectories.length) {
    const shown = surface.excludedDirectories.slice(0, 6).map((e) => e.path).join(", ");
    const rest = surface.excludedDirectories.length - 6;
    lines.push(
      `${surface.excludedDirectories.length} directory(ies) excluded as not this project's own code: ` +
        `${shown}${rest > 0 ? `, and ${rest} more` : ""}.`,
    );
  }
  // Ignored FILES, stated at the granularity they are recorded: enough for a reader to see that
  // coverage shrank, not so much that it buries the directory-level exclusions above.
  if (surface.excludedFiles.count) {
    const shown = surface.excludedFiles.sample.join(", ");
    lines.push(
      `${surface.excludedFiles.count} file(s) excluded as ignored by the repository` +
        `${shown ? ` (for example ${shown})` : ""}.`,
    );
  }

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
  if (strict && failing > 0) lines.push(`--strict: exiting 1 because ${failing} finding(s) need attention.`);
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main — one invocation, start to finish
//
// Every mutable object below is created here and dies here (ADR 0014). `main` returns an exit code
// rather than calling process.exit, so it can be called twice, called concurrently, and compared
// against a fresh-process run. Only the CLI boundary at the foot of this file terminates anything.
// ---------------------------------------------------------------------------

export async function main(args) {
  /**
   * Returns `{ exitCode, stdout, run, surface }`, not a bare code.
   *
   * The extra fields exist so independence can be *falsified*. A concurrency test that compares
   * against a globally patched `process.stdout.write` cannot distinguish two independent runs from
   * two interleaved ones, so each invocation hands back the bytes it wrote and the objects it owned,
   * and the test compares those. They are observation, not CLI surface: the rendered JSON envelope
   * is unchanged, and no consumer reads these.
   */
  const written = [];
  const emit = (s) => {
    written.push(String(s));
    return process.stdout.write(s);
  };
  let run = null;
  let surface = null;
  const done = (exitCode) => ({ exitCode, stdout: written.join(""), run, surface });

  const cli = parseArgs(args);
  const invalid = checkInvocation(cli);
  if (invalid !== null) return done(invalid);

  if (cli.subcommand === "init") return done(await runInit(cli, emit));

  const target = cli.dirFlag ?? cli.positional ?? ".";
  if (!existsSync(target)) {
    process.stderr.write(`standards: no such directory: ${target}\n`);
    return done(EXIT_INVOCATION);
  }
  const root = cli.dirFlag ? path.resolve(cli.dirFlag) : findRoot(target);
  const validating = cli.subcommand === "validate";

  run = createRun({ root, strict: cli.strict, json: cli.json });
  const { rel, findings, addFinding } = run;

  // Created here, by the invocation that uses it, and carrying the budget this invocation was given
  // rather than one read from the process — ADR 0014.
  const surfaceLoss = {
    dirs: [],
    capped: false,
    excluded: [],
    excludedFiles: { count: 0, sample: [] },
    budget: {
      limitBytes: cli.maxTotalReadBytes === undefined ? DEFAULT_MAX_TOTAL_READ_BYTES : Number(cli.maxTotalReadBytes),
      retainedBytes: 0,
      exhausted: false,
      unreadFiles: 0,
      sample: [],
    },
  };

  // What the repository already treats as not-its-own. Asked before the walk so the answer costs one
  // subprocess rather than one per candidate directory, and so an unavailable repository degrades to
  // "exclude nothing" in one place instead of at every decision point.
  const ignored = ignoredEntries(root);
  const exclusions = {
    dirs: new Set(ignored.ok ? ignored.directories : []),
    files: new Set(ignored.ok ? ignored.files : []),
  };
  const files = await collectFiles(root, [], surfaceLoss, exclusions, run);
  // The repository surface this invocation measured. Named so two runs can be compared by identity.
  // It carries the file list and the loss record; the retained text is reachable only through the
  // run's accessors, which is the point of the seam rather than an omission.
  surface = { files, surfaceLoss };
  const unreadableFiles = [];
  const truncatedFiles = [];
  const budget = surfaceLoss.budget;

  /**
   * One eligible file whose contents are absent from this run.
   *
   * A single claim rather than two, because the difference between "never opened" and "opened and
   * discarded at the boundary" is invisible to a reader and identical in consequence: nothing was
   * searched in it. What it must never be confused with is the file-count cap, which never collected
   * the file, or truncation, which searched a prefix and kept the findings.
   */
  const unsearched = (f) => {
    budget.unreadFiles += 1;
    if (budget.sample.length < EXCLUDED_FILE_SAMPLE) budget.sample.push(rel(f));
  };
  for (const f of files) {
    if (!TEXT_EXT.has(path.extname(f))) continue;

    // Once the budget is spent nothing further is opened at all.
    if (budget.exhausted) {
      unsearched(f);
      continue;
    }

    const read = await readText(f);

    // The cost is what is RETAINED, and only the decoded text can say what that is. The file's size
    // on disk cannot: decoding replaces each invalid byte with U+FFFD, three bytes each, so 300 KB
    // of `0xff` in a recognised text file passes a size precheck and then retains 900 KB. That was a
    // real defect in this accounting, found in review — the invariant it broke is the one this cap
    // exists to hold, so the check moved to where the true figure is known rather than being
    // approximated earlier and hoped over.
    const cost = Buffer.byteLength(read.text, "utf8");
    if (budget.retainedBytes + cost > budget.limitBytes) {
      // Opened, and deliberately not retained: nothing is searched in it and nothing is held. The
      // transient decode is bounded by the per-file cap and is gone by the next iteration.
      budget.exhausted = true;
      unsearched(f);
      continue;
    }

    if (!read.ok) {
      // Opened, and the content NOT obtained. No entry is set, and that is the whole point: on
      // failure `readText` returns `text: ""`, so storing it would hand `contentOf` an empty string
      // to call available — the identical coercion this seam exists to remove, arriving through the
      // other door. It read as safe because the two halves are eighteen hundred lines apart: the
      // lookup asks `contents.has(f)`, and only the reader of THIS line knows that a file which
      // could not be read still answers yes.
      //
      // Nothing is retained, so nothing is charged to the budget either; the `continue` skips the
      // accounting below deliberately rather than incidentally.
      unreadableFiles.push(f);
      continue;
    }
    if (read.truncated) {
      truncatedFiles.push(`${rel(f)} (read ${MAX_READ_BYTES} of ${read.bytes} bytes)`);
      run.truncated.add(f);
    }
    run.retain(f, read.text);

    // The derived `sources` entry is proportional to the same text, so one accounting bounds both.
    budget.retainedBytes += cost;
  }

  // Evidence-surface findings: what the audit could NOT search.
  //
  // These carry `rule: null` deliberately. Evidence loss is a property of the run, not a violation by
  // the project, and binding it to a rule would make one unreadable file fail every rule whose
  // detector would have read it — one defect producing dozens of findings, and a second compliance
  // owner for every detector in the file. Detector results stay scoped to what they actually saw;
  // this says how much that was.
  if (unreadableFiles.length) {
    addFinding({
      id: "evidence-unreadable-file",
      category: "evidence-surface",
      severity: "warning",
      label: "OBSERVED",
      evidence: uniq(unreadableFiles.map(rel)),
      message: `${unreadableFiles.length} file(s) could not be read. Nothing was searched in them, so no clean result covers them.`,
      standardRef: R.search,
    });
  }
  if (surfaceLoss.dirs.length) {
    addFinding({
      id: "evidence-unreadable-dir",
      category: "evidence-surface",
      severity: "warning",
      label: "OBSERVED",
      evidence: uniq(surfaceLoss.dirs.map(rel)),
      message: `${surfaceLoss.dirs.length} directory(ies) could not be listed. Anything beneath them is outside every result in this run.`,
      standardRef: R.search,
    });
  }
  if (truncatedFiles.length) {
    addFinding({
      id: "evidence-truncated-file",
      category: "evidence-surface",
      // Informational rather than a warning: the cap is a deliberate bound, not a fault, and findings
      // from the prefix are kept. What it must never be is invisible.
      severity: "info",
      label: "OBSERVED",
      evidence: uniq(truncatedFiles),
      message: `${truncatedFiles.length} file(s) exceeded the ${MAX_READ_BYTES}-byte read cap and were searched in part.`,
      standardRef: R.search,
    });
  }
  if (surfaceLoss.budget.exhausted) {
    addFinding({
      id: "evidence-read-budget",
      category: "evidence-surface",
      severity: "warning",
      label: "OBSERVED",
      evidence: [`${surfaceLoss.budget.limitBytes}-byte aggregate read budget`],
      message:
        `The ${surfaceLoss.budget.limitBytes}-byte aggregate read budget was spent. ` +
        `${surfaceLoss.budget.unreadFiles} eligible file(s) were collected and nothing was searched ` +
        `in them, so they are outside every result in this run. This is neither the file-count cap ` +
        `nor per-file truncation: those files were in scope and no detector saw their contents.`,
      standardRef: R.search,
    });
  }
  if (surfaceLoss.capped) {
    addFinding({
      id: "evidence-file-cap",
      category: "evidence-surface",
      severity: "warning",
      label: "OBSERVED",
      evidence: [`${MAX_FILES} file limit`],
      message: `The walk stopped at the ${MAX_FILES}-file cap. Files beyond it were never collected and are outside every result in this run.`,
      standardRef: R.search,
    });
  }
  // Exclusions are reported through the envelope and the header, deliberately NOT as a finding.
  //
  // A finding carries `evidence`, and evidence is read as "paths this run has something to say
  // about". An excluded tree is the opposite: the run has nothing to say about it, by decision. Every
  // consumer that scans findings for paths — including this repository's own regression that a
  // vendored tree must not appear in the findings — would read the exclusion record as the very
  // pollution it exists to prevent, and could not tell the two apart.
  //
  // So it goes where the other properties-of-the-run live, beside `fileCapReached`, and the header
  // states it in the same breath as the scanned count.
  // Every loss of eligible project evidence that this framework caused, whatever removed it. The
  // filter is on who decided, never on which branch reported it — see `authorizedBy` on
  // `collectFiles`.
  const frameworkExcluded = surfaceLoss.excluded.filter((e) => e.authorizedBy === "framework");

  const evidenceSurface = {
    // Budget exhaustion belongs here with the other loss modes. An eligible file nothing opened is
    // exactly as absent from the results as one beyond the file cap, so a surface that still claimed
    // completeness would be making the stronger available claim on the weaker evidence.
    //
    // That sentence was written for budget exhaustion and generalises to exclusion without a word
    // changed, which is how this expression came to contradict its own comment: a directory this
    // tool dropped from a hardcoded name is exactly as absent as one beyond the cap, and `complete`
    // stayed true over it. Measured on this repository — `test/fixtures` is tracked, committed,
    // first-party, and was excluded while the surface reported itself whole. A repository-authorized
    // exclusion is the one case that does not count: content the project marked ignored was never
    // owed to the run, so honouring the declaration loses nothing. Tool-decided exclusion is not a
    // declaration by anyone.
    complete:
      !unreadableFiles.length &&
      !surfaceLoss.dirs.length &&
      !truncatedFiles.length &&
      !surfaceLoss.capped &&
      !surfaceLoss.budget.exhausted &&
      !frameworkExcluded.length,
    unreadableFiles: uniq(unreadableFiles.map(rel)),
    unreadableDirectories: uniq(surfaceLoss.dirs.map(rel)),
    truncatedFiles: uniq(truncatedFiles),
    fileCapReached: surfaceLoss.capped,
    excludedDirectories: surfaceLoss.excluded,
    // The subset of the above that this tool decided rather than the project, and therefore the
    // reason `complete` can be false while every exclusion is nonetheless recorded. Named rather
    // than left to be re-derived: the distinction is the whole content of the completeness claim.
    frameworkExcludedDirectories: frameworkExcluded.map((e) => e.path),
    // A count and a bounded sample, never one entry per file — see the granularity note on
    // `collectFiles`. Reported even though it is not incompleteness: an ignored file is a decision
    // about what is not the project's code, and a reader who cannot see the count cannot tell a
    // focused run from a blind one.
    excludedFiles: surfaceLoss.excludedFiles,
    // The third evidence-loss state, reported as itself. `fileCapReached` means never collected;
    // `truncatedFiles` means opened and read in part; this means collected, eligible, and never
    // opened at all.
    readBudget: surfaceLoss.budget,
    // Recorded because the exclusion set is only as good as the source that produced it. A run with
    // no repository excluded nothing, and a reader comparing two runs needs to know which they have.
    exclusionsFrom: ignored.ok ? "repository" : "unavailable",
  };

  // Descriptive first: detectUnverifiedFunctionality reads the capability findings they produce.
  detectArchitecture(files, run);
  detectCapabilities(files, run);
  detectApis(files, run);
  detectJobs(files, run);
  detectIntegrations(files, run);
  detectAiInterfaces(files, run);

  detectMissingDocs(files, run);
  detectArchitectureArtifacts(files, run);
  detectMissingPlanningArtifacts(files, run);
  detectMissingAuditInfrastructure(files, run);
  detectUnverifiedFunctionality(files, run);
  detectUnfinished(files, run);
  detectDeadCode(files, run);
  detectOpenQuestions(files, run);
  await detectPlanDiscrepancies(files, run);
  detectDocDiscrepancies(files, run);
  detectStandardsViolations(files, run);

  // Availability is probed once and shared: the env detector and attestation freshness both need the
  // repository, and asking twice would spend a second subprocess to learn the same thing.
  const repoAvailability = repositoryAvailable(root);
  const envCheck = detectCommittedEnvFiles(files, root, repoAvailability, run);
  detectSecretsInArtifacts(files, run);
  detectSwallowedExceptions(files, run);
  detectCertBypass(files, run);
  detectSqlConcat(files, run);

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

  if (!validating) {
    // audit: evidence only. No status, no score, no policy required — ADR 0004.
    if (cli.json) {
      emit(
        JSON.stringify(
          {
            schemaVersion: SCHEMA_VERSION,
            repo: root.split(path.sep).join("/"),
            auditedAt: new Date().toISOString(),
            // What the run could not search. Additive field: a consumer that ignores it reads the
            // findings exactly as before, and one that reads it can tell a clean result from an
            // unexamined one.
            evidenceSurface,
            findings,
          },
          null,
          2,
        ) + "\n",
      );
    } else {
      emit(renderHuman(files.length, evidenceSurface, run) + "\n");
      emit(
        "\nThis is evidence, not a verdict. Run `standards validate` for a compliance status.\n",
      );
    }
    return done(cli.strict && findings.some((f) => f.severity !== "info") ? EXIT_FINDINGS : EXIT_OK);
  }

  // ---------------------------------------------------------------------------
  // validate — the verdict (Standards 25, 27, 30)
  //
  // The three-way separation must not be violated here: the catalog defines rule identity and
  // metadata, project-policy.yml defines what applies to THIS project, and everything above produces
  // evidence. Nothing in this section redefines a rule or invents applicability.

  const policy = await loadProjectPolicy(root);

  /**
   * The version-identity guard — a verdict may not be reported for version X unless the framework
   * executing the run identifies itself as X.
   *
   * `standardVersion` declares which framework version governs a project, and nothing resolves that
   * declaration: every run evaluates against the catalog on disk, whichever version that happens to
   * be. While this repository was the framework's only consumer the two were the same working tree
   * and could not disagree, so the gap was recorded and deferred (Standard 21 R5).
   *
   * Distribution ends that. Once a project pins a version and a workflow checks out a ref, the pin
   * and the ref are independent sources of truth: a policy declaring 2.0.0 can be evaluated by 2.1.0,
   * and the envelope would carry `standardVersion: "2.0.0"` beside a verdict the 2.0.0 rule set never
   * produced. That is not a compliance failure — it is a provenance lie, and a verdict that misstates
   * which rules produced it is the false green this tool exists to refuse.
   *
   * This is an honesty guard, NOT historical rule-set resolution. It detects the disagreement and
   * stops; it cannot evaluate the declared version, and does not pretend to. Standard 21 R5 remains
   * unimplemented and this narrows rather than closes it.
   *
   * Exit 2, beside the unreadable-policy case below: the policy and the framework disagree about what
   * is being evaluated, which is a configuration error. Exit 1 would assert the project failed a
   * rule, and no rule was reached. No envelope is emitted in either output mode — an envelope carries
   * a `status`, and that status is precisely the claim that must not be made. The JSON branch emits a
   * typed error instead of nothing, so a consumer parsing stdout gets a loud object rather than a
   * parse failure it might mistake for an empty result.
   *
   * A missing or malformed `standardVersion` cannot reach here: the schema makes it required and pins
   * it to a full semver triple, so loadProjectPolicy() has already returned `document: null` and the
   * configuration path below owns that case. The guard is deliberately confined to `validate` —
   * `audit` reports evidence and claims no standards version, so widening it there would attach a
   * version precondition to a command whose contract does not depend on one.
   */
  const FRAMEWORK_VERSION = (
    await readFile(path.join(path.dirname(SELF), "..", "VERSION"), "utf8")
  ).trim();
  const declaredVersion = policy.document?.standardVersion;

  if (declaredVersion && declaredVersion !== FRAMEWORK_VERSION) {
    const message =
      `project-policy.yml declares standardVersion ${declaredVersion}, but the framework executing ` +
      `this run is ${FRAMEWORK_VERSION}. No verdict was produced: a compliance status reported under ` +
      `a version that did not evaluate it would misstate its own provenance.`;
    if (cli.json) {
      emit(
        JSON.stringify(
          {
            error: "VERSION_MISMATCH",
            policyStandardVersion: declaredVersion,
            frameworkVersion: FRAMEWORK_VERSION,
            message,
            historicalResolution: "not implemented (Standard 21 R5)",
          },
          null,
          2,
        ) + "\n",
      );
    } else {
      process.stderr.write(
        `VERSION_MISMATCH\n  ${message}\n\n` +
          `  Resolving a historical rule set is not implemented (Standard 21 R5), so this run cannot\n` +
          `  evaluate ${declaredVersion}. Either execute the framework at ${declaredVersion}, or update\n` +
          `  project-policy.yml to ${FRAMEWORK_VERSION} deliberately and review the failures the newer\n` +
          `  rule set reports. Upgrading the governing version is an engineering event, not a default.\n`,
      );
    }
    return done(EXIT_INVOCATION);
  }

  /**
   * Digest the paths each attestation says it reviewed, so a material change to them makes the
   * attestation stale (ADR 0005 rule 4).
   *
   * Content-based rather than revision-based on purpose: invalidating every attestation on every
   * commit would make the mechanism unusable, and it would be abandoned. Digesting what was actually
   * reviewed invalidates on material change, which is the real requirement.
   */
  function attestationFreshness(document, repoRoot, repo) {
    const out = new Map();
    for (const [ruleId, record] of Object.entries(document?.attestations ?? {})) {
      // Freshness describes what may establish the rule now, so it is computed for the newest review
      // event. Earlier events keep their own recorded provenance and are reported by
      // `npm run attestations`; they are history, and history does not go stale.
      const against = currentReview(ruleId, record)?.reviewedAgainst;
      if (!against?.paths?.length) continue;
      out.set(ruleId, classifyFreshness(repoRoot, against, repo));
    }
    return { states: out, repo };
  }

  const { states: freshness, repo } = attestationFreshness(policy.document, root, repoAvailability);

  // Repository content is the source of truth for attestation freshness, and its absence is a fact
  // about the search mechanism rather than about the project (Standard 44 R12). It is reported as an
  // infrastructure finding carrying no rule, exactly as evidence-surface loss is, so that it can never
  // become a second compliance owner — the affected attestations independently fail to establish their
  // rules, and that is where the compliance consequence lives. It does not exit 2: one unavailable
  // provenance source must not discard every other result the run established.
  if (!repo.available && freshness.size > 0) {
    addFinding({
      id: "repository-evidence-unavailable",
      category: "evidence-surface",
      severity: "warning",
      label: "OBSERVED",
      evidence: [...freshness.keys()],
      message:
        `Attestation freshness could not be established for ${freshness.size} rule(s): ${repo.reason}. ` +
        `Repository content identifies what was reviewed; without it, no approval establishes a rule.`,
      standardRef: R.search,
    });
  }
  // A rule whose evidence could not be obtained was not evaluated this run, whatever the static set
  // says. Withdrawing it here rather than letting it report a clean pass is what keeps `nobody could
  // look` distinct from `nobody found anything` — a distinction that matters most for a `forbidden`
  // rule, which is satisfied by absence and would otherwise pass precisely when it knows least
  // (Standard 45 R6).
  //
  // The same reasoning applies to the evidence SURFACE, not only to one detector's own input. When
  // files that were in scope were never searched — the file-count cap, or the aggregate read budget
  // — every rule whose evidence is file contents is in the position `scm.no-committed-env-files` is
  // in when the repository cannot be read: it can report only that it found nothing, which over an
  // unsearched file is a statement about the run rather than about the project.
  //
  // A file that could not be READ belongs in this condition for exactly the same reason as one the
  // budget never opened: its content was not obtained, and the derived views the nine rules below
  // scan resolve it through `sources.get(f)?.code ?? ""` — the same coercion, one indirection away.
  // The trigger is corrected rather than the table extended: the table's membership is not what was
  // wrong, the question it was being asked was.
  //
  // `frameworkExcluded` is the fourth term and the one the read seam structurally cannot reach. A
  // file this tool excluded never enters the walk, never enters `contents`, and no accessor is ever
  // called for it — so no check ever asks, and `unknownChecks` records nothing. The other three
  // terms describe content that was collected and then lost; this one describes content that was
  // never collected, and the two need separate observation points because there is no moment in a
  // detector's execution where the second is visible. Measured: a detector whose candidates are all
  // excluded simply iterates zero times and reports clean.
  //
  // THE FILTER IS THE WHOLE CONTROL, and it is `authorizedBy`, not "was something excluded". A
  // repository that declares its own ignore set has NARROWED WHAT ITS PROJECT IS, which is a
  // legitimate answer and leaves the run complete; a framework that removes tracked project code by
  // matching a directory name has LOST EVIDENCE and must not report a clean forbidden rule over it.
  // `.git` is neither — it is `not-project-evidence` — and if it counted here, every run in every
  // repository would withdraw nine rules forever. That distinction is PR #42's, and this term is the
  // second consumer of it rather than a new judgement.
  //
  // This repository is its own specimen, which is why its verdict moves when this lands: it excludes
  // `test/fixtures` by name, 71 tracked committed files, two of which carry deliberate SQL-concat
  // and cert-bypass bait. `security.no-sql-concat: passed` was never true here. Nine rules go to
  // not-evaluated and that is the honest state, not a regression to be tuned away.
  const filesWentUnsearched =
    surfaceLoss.capped ||
    surfaceLoss.budget.exhausted ||
    unreadableFiles.length > 0 ||
    frameworkExcluded.length > 0;

  // Aggregation from checks, which is the part the two mechanisms above cannot do.
  //
  //   any confirmed violation      -> failed, carrying only the checks that confirmed it
  //   no violation + any unknown   -> not-evaluated
  //   all known and no violation   -> passed
  //
  // The first line is the one that needs the check-level record. A rule with an unknown check AND a
  // confirmed violation stays evaluated and stays failed: the violation was established by a check
  // that ran, and withdrawing the rule would discard a real finding because a DIFFERENT check went
  // unread. `reconstruction.baseline-artifacts` is exactly that shape — structural R4, content R6 —
  // and it is why no table over rule ids can express this.
  const confirmed = new Set(findings.filter((f) => f.rule).map((f) => f.rule));

  // TWO OBSERVATION POINTS, ONE QUESTION, and the question is asked of the RULE's checks rather than
  // of the rule. `unknownChecks` carries the checks that asked `contentOf` for content and were told
  // it was unavailable. The surface term carries the class no check can report, because nothing was
  // collected for it to ask about — the coarse mechanism is coarse precisely because it stands in for
  // checks that never got to run. Either way the answer is the same shape: at least one check of this
  // rule did not obtain its evidence.
  const someCheckWentUnknown = (id) =>
    run.unknownChecks.has(id) || (filesWentUnsearched && CONTENT_DERIVED_RULES.includes(id));

  // PRECEDENCE, AND IT APPLIES TO BOTH MECHANISMS OR IT IS NOT THE CONTRACT. `confirmed` was
  // previously consulted only for the fine-grained record, so a rule with a real violation still
  // withdrew wholesale whenever the surface term fired — the same erasure the check-level record was
  // built to prevent, arriving through the other door. The coarse term is a statement about SOME of a
  // rule's evidence, never about all of it: a violation established by a check that DID run is not
  // unestablished by a file that went unread, whichever way the loss was observed. Applying it once,
  // here, is what makes the truth table a property of the aggregation rather than of one mechanism.
  //
  //   confirmed violation + unknown check   -> failed, evaluated, carrying ONLY the confirmed finding
  //   no violation + unknown check          -> not-evaluated
  //   no violation + everything known       -> passed
  const unestablished = (id) => someCheckWentUnknown(id) && !confirmed.has(id);

  const evaluatedThisRun = EVALUATED_RULES.filter(
    (id) => !(id === "scm.no-committed-env-files" && envCheck.evaluated === false) && !unestablished(id),
  );

  const verdict = evaluate({
    catalog,
    policy: policy.document,
    findings,
    evaluated: evaluatedThisRun,
    today: new Date().toISOString().slice(0, 10),
    freshness,
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

  if (cli.json) {
    // Standard 25's envelope. `findings` is additive detail beyond the contract Standard 31 R2
    // guarantees — a consumer joins on results[].ruleId, never on a finding category.
    emit(JSON.stringify({ ...report, findings }, null, 2) + "\n");
  } else {
    emit(renderVerdict(report, policy) + "\n");
    // Report the current digest for any attestation that lacks one, so it can be recorded rather
    // than computed by hand (ADR 0005). A digest is offered ONLY where none is recorded: computing a
    // replacement for a record that already carries one would invite exactly the substitution this
    // mechanism forbids — a legacy value swapped for a reproducible one without a new review.
    for (const [ruleId, state] of freshness) {
      if (state.state !== FRESHNESS.unrecorded) continue;
      const against = currentReview(ruleId, policy.document?.attestations?.[ruleId])?.reviewedAgainst;
      const current = repositoryDigest(root, against?.paths ?? []);
      if (!current.ok) {
        emit(
          `\n  attestation ${ruleId}: no digest can be offered — ${current.missing.join(", ")} ` +
            `has no committed identity.\n`,
        );
        continue;
      }
      emit(`\n  attestation ${ruleId}: current digest is ${current.digest}\n`);
      emit(
        `  Record it as reviewedAgainst.digest with digestAlgorithm: ${DIGEST_ALGORITHM}.\n`,
      );
    }
  }

  // A policy that could not be read, or none at all, is exit 2: a verdict was requested and there is
  // nothing to evaluate against. That is a configuration problem, not a compliance failure
  // (Standard 30 R1, ADR 0004). A required-level failure is exit 1 regardless of score.
  if (policy.error || !policy.document) return done(EXIT_INVOCATION);
  if (report.status === "NON_COMPLIANT") return done(EXIT_FINDINGS);
  // Standard 45 R6: a must-never rule nobody examined must not gate-pass CI. This is exit 1 rather
  // than exit 2 because it is a statement about the project, not about the configuration — the policy
  // read fine, and what it says is that a prohibition went unexamined.
  if (report.unestablishedProhibitions?.length) return done(EXIT_FINDINGS);
  return done(EXIT_OK);
}

// ---------------------------------------------------------------------------
// The CLI boundary — the only place in this file that terminates the process.
//
// Importing this module runs nothing: no walk, no output, no exit. That is what makes `main`
// testable against a fresh-process oracle, and it is the property ADR 0014 turns into a test.
// ---------------------------------------------------------------------------

// Compared on canonical paths, because the two sides describe the same file in different
// representations and a string comparison silently answered "no".
//
// `import.meta.url` is where Node *resolved* this module: loading an ESM entry point follows
// symlinks. `process.argv[1]` is the path the process was *invoked* with, symlink intact. When this
// package is installed, npm links `node_modules/.bin/standards` to `scripts/standards.mjs`, so the
// two name the same file by different spellings, the comparison is false, and the CLI does nothing while
// exiting 0.
//
// That is a false success at the one place consumers are told to gate their build (ADR 0004):
// `standards validate` reporting no findings because it never ran, which is indistinguishable from
// a clean repository to every caller. Reproduced on Linux before this was changed — invoked directly
// the command exits 1 with a 2914-byte verdict; invoked through the bin link it exited 0 with no
// output at all.
//
// Canonicalising does not widen what counts as direct invocation. It makes two spellings of one path
// comparable; an imported module's `argv[1]` is the *importing* entry point, a genuinely different
// real file, so importing this module still runs nothing. Both properties are asserted in
// test/invocation-ownership.test.mjs — the symlink form must execute, and the import form must not.
function invokedDirectly(argv1) {
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(SELF);
  } catch {
    // An unresolvable argv[1] is not this file being run. Falling back to the original comparison
    // keeps that case behaving as it always did rather than inventing a new answer for it.
    return import.meta.url === pathToFileURL(argv1).href;
  }
}

if (invokedDirectly(process.argv[1])) {
  process.exitCode = (await main(process.argv.slice(2))).exitCode;
}

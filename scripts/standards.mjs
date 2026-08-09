#!/usr/bin/env node
/**
 * standards — audit a repository against the engineering standards.
 *
 * Usage:
 *   standards audit [path] [--json] [--dir=<path>] [--strict]
 *   node scripts/standards.mjs audit .
 *
 * This file implements the six descriptive finding categories only. They report what a repository
 * *has* and are always severity `info`. The judgemental categories (missing-*, potential-*,
 * *-discrepancies, standards-violations) are specified in design/standards-audit-cli.md and are not
 * implemented yet; `--strict` therefore cannot fail a run today, which is stated in the report
 * rather than left for a reader to discover.
 *
 * No third-party dependencies, by the decision recorded in design/standards-audit-cli.md.
 */

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * This file lists the very package names it searches for, so scanning it would report every SDK it
 * knows about as a dependency of whatever repository it is auditing. It excludes itself from the
 * content scan for that reason. Any other file that merely *names* an SDK is handled by requiring an
 * import-shaped match rather than a bare mention — see importPattern().
 */
const SELF = fileURLToPath(import.meta.url);

const SCHEMA_VERSION = 1;
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

/** Extensions whose contents are worth pattern-scanning. */
const TEXT_EXT = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".cs", ".py", ".go", ".rb", ".java",
  ".kt", ".php", ".rs", ".yml", ".yaml", ".json", ".toml", ".md", ".razor", ".vue",
  ".svelte", ".sql", ".sh", ".ps1",
]);

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
    "Usage: standards audit [path] [--json] [--dir=<path>] [--strict]\n\n" +
      "  audit          Report what a repository has and where it departs from the standards.\n\n" +
      "  --json         Emit the structured report on stdout instead of the readable one.\n" +
      "  --dir=<path>   Audit a directory other than the resolved project root.\n" +
      "  --strict       Exit 1 when any finding needs attention.\n",
  );
}

if (!subcommand || subcommand === "--help" || subcommand === "-h") {
  usage(process.stdout);
  process.exit(subcommand ? 0 : 1);
}
if (subcommand !== "audit") {
  process.stderr.write(`standards: unknown subcommand '${subcommand}'\n\n`);
  usage();
  process.exit(1);
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
  process.exit(1);
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
function addFinding({ id, category, severity = "info", label, evidence, message, standardRef }) {
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
    if (/(^|\/)(routes?|controllers?|api|endpoints?)\//i.test(r) && TEXT_EXT.has(path.extname(f)))
      return true;
    const text = contents.get(f);
    return text ? API_CONTENT.some((re) => re.test(text)) : false;
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
const JOB_CONTENT = [
  /@Scheduled\b/,
  /\bBackgroundService\b|\bIHostedService\b/,
  /\bcelery\b|\bsidekiq\b|\bBullMQ\b|\bnew Queue\(/i,
  /\bcron\.schedule\(|\bnode-cron\b/,
];

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
    const text = contents.get(f);
    return text ? JOB_CONTENT.some((re) => re.test(text)) : false;
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
      const text = contents.get(f);
      if (text && re.test(text)) {
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
      const text = contents.get(f);
      if (text && re.test(text)) {
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
    category: "Missing documentation",
    severity: "warning",
    label: "OBSERVED",
    evidence: missing,
    message: `No substantive architecture or overview documentation: ${missing.join(", ")}.`,
    standardRef: R.done,
  });
}

function detectMissingPlanningArtifacts(files) {
  const dir = "artifacts/project-plan-breakdown";
  if (!has(dir)) {
    addFinding({
      id: "missing-planning-artifacts",
      category: "Missing planning artifacts",
      severity: "warning",
      label: "OBSERVED",
      evidence: ["artifacts/"],
      message: `No ${dir}/ directory exists.`,
      standardRef: R.artifacts,
    });
    return;
  }
  if (!has(`${dir}/00-overview.md`)) {
    addFinding({
      id: "missing-planning-artifacts",
      category: "Missing planning artifacts",
      severity: "warning",
      label: "OBSERVED",
      evidence: [`${dir}/`],
      message: `${dir}/ exists but has no 00-overview.md.`,
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

const UNFINISHED = [
  // Require the punctuation a real marker carries — `TODO:` or `TODO(owner)`. Without it, any file
  // that discusses markers matches, which is how this tool's own test suite got flagged.
  [/\b(TODO|FIXME|HACK|XXX)\b\s*[:(]/, "TODO/FIXME markers"],
  [/\bNotImplemented(Error|Exception)?\b|\braise NotImplementedError\b|\bthrow new NotImplementedException\b/, "unimplemented stubs"],
  [/\b(it|test|describe)\.skip\(|\bxit\(|@pytest\.mark\.skip|\[Ignore\]|\bt\.Skip\(/, "skipped tests"],
];

/**
 * Markers like TODO and NotImplemented are code signals. Scanning prose for them flags any document
 * that *names* a marker as *containing* one — this file's own design document was the first false
 * positive. Restricting the scan to code extensions is the fix; a TODO in a Markdown file is a note,
 * not an unfinished code path.
 */
const CODE_EXT = new Set([
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".cs", ".py", ".go", ".rb", ".java",
  ".kt", ".php", ".rs", ".razor", ".vue", ".svelte", ".sql", ".sh", ".ps1",
]);

function detectUnfinished(files, contents) {
  const byKind = new Map();
  for (const f of files) {
    if (!CODE_EXT.has(path.extname(f))) continue;
    const text = contents.get(f);
    if (!text) continue;
    for (const [re, kind] of UNFINISHED) {
      if (re.test(text)) {
        if (!byKind.has(kind)) byKind.set(kind, []);
        byKind.get(kind).push(rel(f));
      }
    }
  }
  if (byKind.size === 0) return;

  addFinding({
    id: "potential-unfinished-features",
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
  if (open === 0) return;

  addFinding({
    id: "open-reconstruction-questions",
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

    let status = item.fields.get("Status") ?? "";
    // The trap: under delegated liveness no plan item is ever `done`, so a check that only looks
    // for `done` reports zero findings on the repositories that follow the standard most closely.
    // Resolve the reference first, and treat one that resolves to nothing as a finding in itself.
    const tracked = status.match(/tracked as\s+([A-Z]{2}-\d+)/i);
    if (tracked) {
      const id = tracked[1].toUpperCase();
      const itemPath = path.join(root, "artifacts/backlog/items", `${id}.md`);
      if (!existsSync(itemPath)) {
        dangling.push(`${item.file} :: ${item.title} -> ${id}`);
        continue;
      }
      const backlogText = await readText(itemPath);
      status = (backlogText.match(/^status:\s*(\S+)/im) ?? [, "unknown"])[1];
    }

    if (!/^done\b/i.test(status)) continue;

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
  if (TEXT_EXT.has(path.extname(f))) contents.set(f, await readText(f));
}

// Descriptive first: detectUnverifiedFunctionality reads the capability findings they produce.
detectArchitecture(files, contents);
detectCapabilities(files, contents);
detectApis(files, contents);
detectJobs(files, contents);
detectIntegrations(files, contents);
detectAiInterfaces(files, contents);

detectMissingDocs(files, contents);
detectMissingPlanningArtifacts(files);
detectMissingAuditInfrastructure(files);
detectUnverifiedFunctionality(files);
detectUnfinished(files, contents);
detectDeadCode(files, contents);
detectOpenQuestions(files, contents);
await detectPlanDiscrepancies(files, contents);
detectDocDiscrepancies(files, contents);
detectStandardsViolations(files, contents);

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
}

process.exit(STRICT && findings.some((f) => f.severity !== "info") ? 1 : 0);

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

/** Directories never worth walking: build output, dependencies, virtualenvs, caches. */
const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", "bin", "obj", ".next", ".nuxt",
  ".venv", "venv", "__pycache__", "target", "vendor", "coverage", ".turbo",
  ".gradle", ".idea", ".vs", ".vscode", "packages-cache", ".pytest_cache",
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
function addFinding({ id, category, label, evidence, message, standardRef }) {
  const shown = evidence.slice(0, MAX_EVIDENCE);
  const omitted = evidence.length - shown.length;
  findings.push({
    id,
    category,
    severity: "info",
    label,
    evidence: shown,
    message: omitted > 0 ? `${message} (${evidence.length} total; ${omitted} not listed)` : message,
    standardRef: standardRef ?? `${STD44}#r5--reconstructed-baseline-contents`,
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

function renderHuman(fileCount) {
  const lines = [];
  lines.push(`standards audit — ${rel(root) || path.basename(root)} (${root.split(path.sep).join("/")})`);
  lines.push(`${fileCount} file(s) scanned, ${findings.length} finding(s).`);
  lines.push("");

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

  lines.push("");
  lines.push("Only the six descriptive categories are implemented. The categories that report");
  lines.push("something missing, unproven, or contradictory are specified in");
  lines.push("design/standards-audit-cli.md and are not yet detected, so this run cannot tell you");
  lines.push("the repository is compliant — only what it contains.");
  if (STRICT) lines.push("--strict had no effect: no category that can fail a run is implemented yet.");
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

detectArchitecture(files, contents);
detectCapabilities(files, contents);
detectApis(files, contents);
detectJobs(files, contents);
detectIntegrations(files, contents);
detectAiInterfaces(files, contents);

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

// No implemented category can currently produce a non-info finding, so --strict never fails.
// When the judgemental categories land, this becomes: findings.some(f => f.severity !== "info").
process.exit(0);

/**
 * `standards init` — bootstrap a project into the framework (Standard 33).
 *
 * The safety contract IS the design, so the module is split in two:
 *
 *   plan()   pure. Inspects the target, decides the mode, and returns the actions it WOULD take.
 *            Touches nothing.
 *   apply()  executes a plan. The only function in this file that writes.
 *
 * `--dry-run` is therefore not a separate code path that has to be kept in step with the real one —
 * it is `plan()` without `apply()`. A dry-run whose output does not predict the real run is worse
 * than none, because it is trusted (Standard 33 R5), and the only way to guarantee that is to make
 * them the same computation.
 *
 * Mutating is not the same as destructive (Standard 2):
 *
 *   create a missing artifact   → ordinary execute. No approval; this is what init is for.
 *   replace an existing one     → destructive. Refused by default, and reported as a conflict.
 *                                 Overwriting requires --force-overwrite AND naming each path.
 *
 * That distinction is why init can be useful without prompting for approval on every harmless
 * scaffold creation, while an overwrite stays guarded.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { readdirSync, readFileSync, lstatSync, statSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { injectAgentInstructions } from "./agent-instructions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRAMEWORK = path.resolve(HERE, "..");

export const MODES = {
  GREENFIELD: "greenfield",
  EXISTING_WITH_PLAN: "existing-with-plan",
  RECONSTRUCTION_REQUIRED: "reconstruction-required",
};

/** Files init can create, and where their content comes from. */
const ARTIFACTS = [
  { path: "project-policy.yml", template: "templates/project-policy.yml" },
  { path: "PROJECT.md", template: "templates/PROJECT.md" },
  { path: "AGENTS.md", template: "templates/AGENTS.md" },
  { path: "CLAUDE.md", template: "templates/CLAUDE.md" },
  { path: ".github/copilot-instructions.md", template: "templates/copilot-instructions.md" },
  { path: "artifacts/project-plan-breakdown/", directory: true },
  // `satisfiedBy` names the other locations that already meet the requirement. The ADR check accepts
  // three (Standard 11 R1); creating a fourth, empty, beside a populated docs/adr/ would leave the
  // project with two directories where one holds the decisions — the tool manufacturing the
  // ambiguity it then reports. Found by running init against the first outside adopter, after the
  // detector learned the alternatives and init did not.
  { path: "artifacts/adr/", directory: true, satisfiedBy: ["docs/adr", "doc/adr"] },
];

/**
 * Signals that a repository already contains meaningful implementation.
 *
 * Deliberately conservative: a false "greenfield" is the dangerous direction, because it lets a
 * clean-room plan be scaffolded over real code, and that is a fabricated history
 * (Standard 33 R4, Standard 44 R2). A false "existing" only costs a routing decision the operator
 * can override with --mode.
 */
const DIRECTORY_MARKERS = ["src", "lib", "app", "source", "cmd", "internal", "pkg"];
const MANIFEST_MARKERS = ["package.json", "go.mod", "Cargo.toml", "pyproject.toml", "pom.xml", "build.gradle"];
const IMPLEMENTATION_MARKERS = [...DIRECTORY_MARKERS, ...MANIFEST_MARKERS];

const PLAN_MARKERS = ["artifacts/project-plan-breakdown", "PLAN.md", "plan.md"];
const PROMPT_MARKERS = ["artifacts/prompts"];

const has = (root, p) => existsSync(path.join(root, p));

/**
 * The search one directory below the root, and exactly where it stops (issue #2).
 *
 * A monorepo keeps its manifests one level down, so a root-only search found nothing and reported
 * greenfield over real code — the dangerous direction named above. The root is still searched as it
 * always was; each directory directly under it is now searched too, within these limits:
 *
 *   manifests only     One level down, only MANIFEST_MARKERS count. A manifest is a build system's
 *                      declaration; a directory name is not. `book/src/` (mdBook) and `docs/source/`
 *                      (Sphinx) are populated documentation trees, so counting DIRECTORY_MARKERS
 *                      there would make a documentation-only repository "existing" — destroying
 *                      greenfield where it is currently right. Populated-or-not cannot tell those
 *                      apart, which is why the rule is "not at all" rather than hasContent().
 *   content            A manifest counts only as a regular file holding a non-whitespace character: a
 *                      placeholder of zero bytes or only whitespace declares nothing, and a directory
 *                      that happens to be named package.json is not a manifest. This takes
 *                      hasContent()'s principle — content, not existence — and not its code, which
 *                      answers on existence alone for anything that is not a directory. Only a bounded
 *                      prefix is read; a longer file counts unread, because the dangerous direction is
 *                      greenfield. Nothing reads what a manifest builds, so one that declares only
 *                      documentation tooling (a docs site's `docs/package.json`) counts too.
 *   one level          Deeper manifests with nothing above them are not found. The evidence says so,
 *                      so "nothing found" never reads as "nothing there".
 *   skipped            Dot-directories (VCS, tool and editor state) and SKIPPED_DIRECTORIES
 *                      (installed dependencies) hold other people's manifests, not this project's.
 *                      Symbolic links are not followed, so nothing outside the repository is counted.
 *                      Every skip actually present is named in the evidence.
 *   unreadable         A directory that could not be read was not searched, and an unsearched
 *                      directory cannot support "no implementation". It is named, and the mode falls
 *                      to the non-greenfield outcomes rather than to the one that fabricates history.
 *
 * Entries are ordered by code unit, not locale, so the evidence is identical on every platform.
 */
const SKIPPED_DIRECTORIES = ["node_modules"];

const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** How much of a manifest is read to decide whether it holds anything. */
const MANIFEST_PREFIX_BYTES = 64 * 1024;

/**
 * True for a regular file holding a non-whitespace character, or too long to read in full. Throws when
 * the file or its directory cannot be read, so the caller reports the directory as unsearched.
 */
function isManifest(file) {
  let stat;
  try {
    stat = lstatSync(file);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  }
  if (!stat.isFile() || stat.size === 0) return false;
  if (stat.size > MANIFEST_PREFIX_BYTES) return true;
  return /\S/.test(readFileSync(file, "utf8")); // \S excludes U+FEFF, so a lone byte-order mark is empty
}

/** Whether a link names a directory. Resolves the link's target type only; never reads into it. */
function linksToDirectory(link) {
  try {
    return statSync(link).isDirectory();
  } catch (error) {
    // A dangling link is not a directory. One that cannot be resolved for another reason (a loop, a
    // permission) might be, so it is reported as skipped rather than dropped from the evidence.
    return error.code !== "ENOENT";
  }
}

function searchOneLevelDown(root) {
  const found = [];
  const skipped = [];
  const unread = [];
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch (error) {
    // A root that does not exist has nothing below it — the answer the root-level checks already
    // give. Any other failure means the root was not listed, and that is reported, not absorbed.
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") unread.push("./");
    return { found, skipped, unread };
  }

  for (const entry of entries.sort((a, b) => byCodeUnit(a.name, b.name))) {
    const full = path.join(root, entry.name);
    if (entry.isSymbolicLink()) {
      if (linksToDirectory(full)) skipped.push(`${entry.name}/`);
      continue;
    }
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.includes(entry.name)) {
      skipped.push(`${entry.name}/`);
      continue;
    }
    try {
      const here = MANIFEST_MARKERS.filter((m) => isManifest(path.join(full, m)));
      found.push(...here.map((m) => `${entry.name}/${m}`));
    } catch {
      unread.push(`${entry.name}/`); // a partial answer for this directory is not an answer
    }
  }
  return { found, skipped, unread };
}

/** The evidence lines that say where the search went, where it stopped, and what it passed over. */
function searchBoundary({ skipped, unread }) {
  const lines = [
    `searched: the root for ${IMPLEMENTATION_MARKERS.join(", ")}; ` +
      `each directory one level below the root for ${MANIFEST_MARKERS.join(", ")}`,
    "not searched: anything deeper than one level below the root, dot-directories, " +
      `${SKIPPED_DIRECTORIES.join(", ")}, and symbolic links`,
  ];
  if (skipped.length > 0) lines.push(`skipped here: ${skipped.join(", ")}`);
  if (unread.length > 0) lines.push(`could not be read, so not searched: ${unread.join(", ")}`);
  return lines;
}

/**
 * A directory counts as evidence only when it has content.
 *
 * This exists because of a bug the tests caught: init creates an EMPTY
 * artifacts/project-plan-breakdown/ in reconstruction mode, and a second run then read its own
 * output as proof that a plan exists — flipping the mode to existing-with-plan and erasing the
 * `reconstructionRequired` signal. An empty plan directory is not a plan, and a tool must not treat
 * its own scaffolding as evidence about the project.
 */
/**
 * The framework version, read at write time rather than baked into the templates.
 *
 * `templates/project-policy.yml` carried a literal `standardVersion`, which meant every release
 * left it one behind and each new adopter declared a version nobody chose — then failed the
 * outdated-version check on their first run, for a value the bootstrap had just written for them.
 * A constant in a file that a release does not touch is a maintenance obligation nobody signed up
 * for; reading VERSION removes it rather than adding another thing to remember.
 *
 * One reader, one answer. `frameworkVersion()` is the only place in the framework that decides what
 * version governs a bootstrap, and both the policy stamp and the generated agent instructions go
 * through it — a second read of VERSION elsewhere would be a second implementation of the same
 * decision, which is what `architecture.no-duplicate-implementations` forbids.
 */
export function frameworkVersion() {
  return readFileSync(path.join(FRAMEWORK, "VERSION"), "utf8").trim();
}

export function stampVersion(content) {
  const version = frameworkVersion();
  // Not anchored to end-of-line — though not for the reason this arrived with. The ported comment
  // said a trailing `$` fails on a `core.autocrlf` checkout because of the `\r`. That was checked
  // during reconciliation and is **false in JavaScript**, whose LineTerminator set includes CR, so
  // `$` under `/m` matches before it and both forms stamp CRLF correctly. Left unanchored because
  // that is the form that shipped and the behaviour is identical; the claim is corrected rather than
  // carried, since an unverified statement about the runtime is the defect this framework rejects
  // elsewhere. The CRLF case is pinned by a test rather than by argument either way.
  return content.replace(/^standardVersion: "[^"]*"/m, `standardVersion: "${version}"`);
}

/**
 * The content init would write for one artifact: the template, stamped and generated.
 *
 * Both `plan()` and `apply()` call this and nothing else, for the same reason `--dry-run` is
 * `plan()` without `apply()` — a transformation applied on one path and not the other produces a
 * dry run that promises what the real run does not do (Standard 33 R5). It is also what keeps the
 * idempotence comparison honest: `plan()` compares the file on disk against the *generated* text,
 * so a project whose block is a version behind is reported as differing rather than as matching.
 */
async function renderTemplate(artifact) {
  const raw = await readFile(path.join(FRAMEWORK, artifact.template), "utf8");
  return injectAgentInstructions(stampVersion(raw), frameworkVersion());
}

function hasContent(root, p) {
  const target = path.join(root, p);
  if (!existsSync(target)) return false;
  try {
    return readdirSync(target).some((f) => f.endsWith(".md"));
  } catch {
    return true; // Not a directory — a plain PLAN.md counts on its own.
  }
}

/**
 * Decide which of the three outcomes applies. Returns { mode, evidence, confidence }.
 *
 * `confidence` is INFERRED for everything except an explicit override, because this is a judgement
 * made from file presence. A wrong guess is recoverable only if the reader can see which guess was
 * made (Standard 33 R4).
 */
export function detectMode(root, override = null) {
  const evidence = [];
  if (override) {
    return { mode: override, evidence: ["--mode was given explicitly"], confidence: "CONFIRMED_BY_OWNER" };
  }

  const nested = searchOneLevelDown(root);
  // Root markers first, in their declared order, so a root-only repository's evidence is unchanged.
  const implementation = [...IMPLEMENTATION_MARKERS.filter((m) => has(root, m)), ...nested.found];
  const plans = PLAN_MARKERS.filter((m) => hasContent(root, m));
  const prompts = PROMPT_MARKERS.filter((m) => hasContent(root, m));

  if (implementation.length === 0) {
    const complete = nested.unread.length === 0;
    evidence.push(complete ? "no implementation markers found" : "no implementation markers found in what could be read");
    evidence.push(...searchBoundary(nested));
    if (complete) return { mode: MODES.GREENFIELD, evidence, confidence: "INFERRED" };
    evidence.push("greenfield is not inferred while part of the search could not be read");
  } else {
    evidence.push(`implementation markers: ${implementation.join(", ")}`);
    if (nested.unread.length > 0) {
      evidence.push(`could not be read, so not searched: ${nested.unread.join(", ")}`);
    }
  }

  if (plans.length > 0) {
    evidence.push(`planning artifacts: ${plans.join(", ")}`);
    return { mode: MODES.EXISTING_WITH_PLAN, evidence, confidence: "INFERRED" };
  }
  if (prompts.length > 0) {
    evidence.push(`prompt artifacts: ${prompts.join(", ")}`);
    return { mode: MODES.EXISTING_WITH_PLAN, evidence, confidence: "INFERRED" };
  }

  evidence.push("no plan or original prompt found");
  return { mode: MODES.RECONSTRUCTION_REQUIRED, evidence, confidence: "INFERRED" };
}

/**
 * Compute what init would do. Pure — reads the target and the templates, writes nothing.
 *
 * @param root      target repository
 * @param options   { mode, overwrite: string[] } — `overwrite` names paths the operator has
 *                  explicitly approved replacing. An empty list means no overwrite is authorised,
 *                  which is the default.
 */
export async function plan(root, options = {}) {
  const { mode, evidence, confidence } = detectMode(root, options.mode ?? null);
  const approvedOverwrites = new Set(options.overwrite ?? []);

  const actions = [];
  for (const artifact of ARTIFACTS) {
    const target = path.join(root, artifact.path);
    const exists = existsSync(target);

    if (artifact.directory) {
      // Creating a directory alongside existing contents is safe and expected; only writing a FILE
      // over one of that name is destructive (Standard 33 R2).
      const alternative = (artifact.satisfiedBy ?? []).find((p) => hasContent(root, p));
      actions.push(
        exists
          ? { action: "preserve", path: artifact.path, reason: "directory already exists" }
          : alternative
            ? { action: "preserve", path: artifact.path, reason: `${alternative}/ already serves this` }
            : { action: "create", path: artifact.path, kind: "directory" },
      );
      continue;
    }

    const content = await renderTemplate(artifact);

    if (!exists) {
      actions.push({ action: "create", path: artifact.path, kind: "file", bytes: content.length });
      continue;
    }

    const current = await readFile(target, "utf8");
    if (current === content) {
      // Idempotence: a second run finds what the first wrote and leaves it alone (Standard 33 R3).
      actions.push({ action: "preserve", path: artifact.path, reason: "already matches the template" });
      continue;
    }

    if (approvedOverwrites.has(artifact.path)) {
      actions.push({
        action: "overwrite",
        path: artifact.path,
        kind: "file",
        reason: "explicitly approved for replacement",
        destructive: true,
      });
      continue;
    }

    actions.push({
      action: "conflict",
      path: artifact.path,
      reason: "exists and differs from the template; nothing was changed",
      remediation: `Review it. To replace it, re-run with --force-overwrite=${artifact.path}.`,
    });
  }

  // Reconstruction is Standard 44's job. init detects the condition, records it, and hands off — it
  // must not reimplement the logic, because the copy inside a bootstrap command is the one that
  // would quietly lose the evidence labelling (Standard 33 R4).
  const reconstructionRequired = mode === MODES.RECONSTRUCTION_REQUIRED;

  return {
    schemaVersion: "1.0.0",
    mode,
    modeConfidence: confidence,
    modeEvidence: evidence,
    created: actions.filter((a) => a.action === "create").map((a) => a.path),
    preserved: actions.filter((a) => a.action === "preserve").map((a) => a.path),
    conflicts: actions.filter((a) => a.action === "conflict"),
    overwrites: actions.filter((a) => a.action === "overwrite").map((a) => a.path),
    reconstructionRequired,
    nextStep: reconstructionRequired
      ? "Run the project-reconstruction skill (Standard 44). Do NOT author a plan as though this project were starting now."
      : mode === MODES.EXISTING_WITH_PLAN
        ? "Normalise the existing plan against Standards 4, 7, 8, and 9; do not replace it."
        : "Run /plan-structure and /plan-handoff, then standards validate.",
    actions,
  };
}

/**
 * Execute a plan. The only writing function here.
 *
 * A partially-completed run must leave no partial files: content is written in one call per file,
 * and a failure stops the run rather than continuing to the next artifact. A truncated
 * project-policy.yml fails validation in a way that looks like the project's fault
 * (Standard 33 R2).
 */
export async function apply(root, planned) {
  const done = [];
  for (const action of planned.actions) {
    if (action.action === "create" && action.kind === "directory") {
      await mkdir(path.join(root, action.path), { recursive: true });
      done.push(action.path);
      continue;
    }
    if (action.action === "create" || action.action === "overwrite") {
      const artifact = ARTIFACTS.find((a) => a.path === action.path);
      // Through the same helper as plan(). These two read the templates independently, so any
      // transformation applied to one and not the other lands in the report or on disk but never
      // both — a divergence that shows up as a dry run promising what the real run does not do.
      const content = await renderTemplate(artifact);
      await mkdir(path.dirname(path.join(root, action.path)), { recursive: true });
      await writeFile(path.join(root, action.path), content, "utf8");
      done.push(action.path);
    }
    // `preserve` and `conflict` write nothing, by construction.
  }
  return done;
}

/** Human-readable rendering of a plan or a completed run. */
export function render(report, { dryRun }) {
  const out = [];
  out.push(dryRun ? "standards init — dry run, nothing was written" : "standards init");
  out.push("");
  out.push(`  Mode: ${report.mode} [${report.modeConfidence}]`);
  for (const line of report.modeEvidence) out.push(`        ${line}`);
  out.push("");

  const label = dryRun ? "would create" : "created";
  if (report.created.length) {
    out.push(`  ${label}:`);
    for (const p of report.created) out.push(`    + ${p}`);
  }
  if (report.overwrites.length) {
    out.push(`  ${dryRun ? "would overwrite" : "overwrote"} (approved):`);
    for (const p of report.overwrites) out.push(`    ! ${p}`);
  }
  if (report.preserved.length) {
    out.push("  preserved:");
    for (const p of report.preserved) out.push(`    = ${p}`);
  }
  if (report.conflicts.length) {
    out.push("  conflicts — nothing was changed:");
    for (const c of report.conflicts) {
      out.push(`    ? ${c.path}`);
      out.push(`        ${c.reason}`);
      out.push(`        ${c.remediation}`);
    }
  }
  out.push("");

  if (report.reconstructionRequired) {
    out.push("  This project has an implementation and no trustworthy plan.");
    out.push("  The plan directory was created EMPTY on purpose: scaffolding template sections over");
    out.push("  existing code is a fabricated history, indistinguishable from a real plan later.");
    out.push("");
  }
  out.push(`  Next: ${report.nextStep}`);

  if (!dryRun && report.conflicts.length === 0 && report.created.length === 0) {
    out.push("");
    out.push("  Nothing to do — this project is already bootstrapped.");
  }
  return out.join("\n");
}

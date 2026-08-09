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
import { readdirSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  { path: "artifacts/project-plan-breakdown/", directory: true },
  { path: "artifacts/adr/", directory: true },
];

/**
 * Signals that a repository already contains meaningful implementation.
 *
 * Deliberately conservative: a false "greenfield" is the dangerous direction, because it lets a
 * clean-room plan be scaffolded over real code, and that is a fabricated history
 * (Standard 33 R4, Standard 44 R2). A false "existing" only costs a routing decision the operator
 * can override with --mode.
 */
const IMPLEMENTATION_MARKERS = [
  "src", "lib", "app", "source", "cmd", "internal", "pkg",
  "package.json", "go.mod", "Cargo.toml", "pyproject.toml", "pom.xml", "build.gradle",
];

const PLAN_MARKERS = ["artifacts/project-plan-breakdown", "PLAN.md", "plan.md"];
const PROMPT_MARKERS = ["artifacts/prompts"];

const has = (root, p) => existsSync(path.join(root, p));

/**
 * A directory counts as evidence only when it has content.
 *
 * This exists because of a bug the tests caught: init creates an EMPTY
 * artifacts/project-plan-breakdown/ in reconstruction mode, and a second run then read its own
 * output as proof that a plan exists — flipping the mode to existing-with-plan and erasing the
 * `reconstructionRequired` signal. An empty plan directory is not a plan, and a tool must not treat
 * its own scaffolding as evidence about the project.
 */
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

  const implementation = IMPLEMENTATION_MARKERS.filter((m) => has(root, m));
  const plans = PLAN_MARKERS.filter((m) => hasContent(root, m));
  const prompts = PROMPT_MARKERS.filter((m) => hasContent(root, m));

  if (implementation.length === 0) {
    evidence.push("no implementation markers found");
    return { mode: MODES.GREENFIELD, evidence, confidence: "INFERRED" };
  }
  evidence.push(`implementation markers: ${implementation.join(", ")}`);

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
      actions.push(
        exists
          ? { action: "preserve", path: artifact.path, reason: "directory already exists" }
          : { action: "create", path: artifact.path, kind: "directory" },
      );
      continue;
    }

    const content = await readFile(path.join(FRAMEWORK, artifact.template), "utf8");

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
      const content = await readFile(path.join(FRAMEWORK, artifact.template), "utf8");
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

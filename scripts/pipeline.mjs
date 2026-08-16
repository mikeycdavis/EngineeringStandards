#!/usr/bin/env node
/**
 * The pipeline definition — one place that says what "this repository's CI" means.
 *
 * Two things execute this repository's checks: `.github/workflows/ci.yml` on a GitHub runner, and
 * `compose.ci.yml` in a local container. Before this file existed there was one of those, and its
 * step list was the only statement of what CI covered. A second executor written independently
 * would have been a second definition, and the two would have agreed right up until someone added a
 * check to one of them — which is the failure mode this repository already documents for standards
 * copied between projects (Standard 22 R6) and for domain logic duplicated across layers
 * (Standard 51 R3). So the list lives here, both executors read it, and `test/local-ci.test.mjs`
 * fails when the workflow and this file disagree.
 *
 * **Commands are `npm run <script>` on purpose.** package.json already names the authoritative
 * invocation of each check; restating `node scripts/inventory.mjs` here would be a third definition
 * of the same thing. This file decides *which* checks run and *what their failure means* — not how
 * a check is spelled.
 *
 * ## Gating versus advisory, and why the distinction is not a softening
 *
 * `validate` is the authoritative verdict (ADR 0004) and this repository is *intentionally*
 * `NON_COMPLIANT`: rules carry recorded human rejections, so exit 1 is the correct answer and will
 * stay the correct answer until those rejections are withdrawn. `ci.yml` already separates it into
 * its own job for exactly this reason — a required check that can never pass leaves no legal path to
 * change `develop`, which this repository learned by making `develop` unmergeable.
 *
 * This file reproduces that boundary rather than inventing one. The gating set is precisely what
 * branch protection requires on GitHub; `validate` runs on every local run, its exit code is
 * recorded, and it is never suppressed, hidden, or reported as a pass. What it does not do is decide
 * whether a pull request may be opened, because on GitHub it does not decide that either.
 *
 * Holds no module-level run state: every mutable value is local to a call.
 */

import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const EXIT_FAILED = 1;
const EXIT_INVOCATION = 2;

/**
 * Every check this repository runs, in execution order.
 *
 * `gating: true` means a failure blocks a pull request. It must match, exactly, the step list of the
 * `test` job in `.github/workflows/ci.yml` — the job branch protection names.
 *
 * `gating: false` means the stage runs and reports and cannot block. There is one, and adding a
 * second should be an argued decision rather than a convenience: an advisory stage is a check whose
 * failure nobody has to answer for.
 */
export const STAGES = [
  {
    id: "inventory",
    command: "npm run inventory",
    gating: true,
    title: "Source inventory",
    why: "The standards series has not silently changed shape; extraction is compared against the reviewed, committed inventory rather than re-derived.",
  },
  {
    id: "fidelity",
    command: "npm run fidelity",
    gating: true,
    title: "Source fidelity",
    why: "Every block claiming to be verbatim source is verified against that standard's own declared source sections.",
  },
  {
    id: "policy",
    command: "npm run policy",
    gating: true,
    title: "Project policy",
    why: "This repository's project-policy.yml validates against its schema. An unreadable policy (exit 2) and a compliance condition such as an expired exception (exit 1) are both failures here.",
  },
  {
    id: "diagrams",
    command: "npm run diagrams",
    gating: true,
    title: "Diagram freshness",
    why: "Standard 39 R4: Mermaid source and its embedded copies must not drift. Text comparison, not rendering — which is what lets a zero-dependency repository enforce the rule at all.",
  },
  {
    id: "test",
    command: "npm test",
    gating: true,
    title: "Test suite",
    why: "The full node:test suite, including the assertion that this repository's own audit produces no error-severity finding.",
  },
  {
    id: "audit",
    command: "npm run audit",
    gating: true,
    title: "Self-audit",
    why: "The audit tool is run against the repository that defines it. Deliberately not --strict: that flag fails on warnings, which turns every advisory heuristic into a broken build and gets the step disabled.",
  },
  {
    id: "validate",
    command: "npm run validate",
    gating: false,
    title: "Compliance verdict (advisory — reported, never gating)",
    why: "ADR 0004's authoritative verdict. Expected to exit 1: this repository is intentionally NON_COMPLIANT while recorded human rejections stand. Non-gating here for the same reason it is a separate, non-required job in ci.yml — not because a failure is acceptable, but because this failure is the honest answer and gating on it would leave no legal path to change develop.",
  },
];

/** The gating set, as the workflow's required job must also run it. */
export const gatingStages = () => STAGES.filter((s) => s.gating);

/**
 * Restore/install, stated rather than omitted.
 *
 * There is no dependency-installation stage and its absence is a decision, not an oversight: this
 * repository has zero third-party dependencies, recorded in design/standards-audit-cli.md and
 * enforced structurally by CI having no install step. An `npm ci` appearing in this pipeline would
 * mean that decision changed. A reader comparing this pipeline against a conventional one should
 * find the answer here rather than concluding a step was forgotten.
 */
export const RESTORE = {
  stage: "none",
  reason:
    "Zero third-party dependencies by decision (design/standards-audit-cli.md). No install step exists, in this pipeline or in ci.yml, and its absence is what enforces the decision.",
};

function runStage(stage, cwd, verbose) {
  const started = new Date();
  process.stdout.write(`\n=== ${stage.id} :: ${stage.command}${stage.gating ? "" : "  [advisory]"}\n`);
  // `--verbose` adds the rationale, not the output. Stage output is always inherited: a CI log that
  // hides what a check said until someone remembers a flag is a log nobody reads when it matters.
  if (verbose) process.stdout.write(`    ${stage.why}\n`);
  const result = spawnSync(stage.command, { cwd, shell: true, stdio: "inherit" });
  // A signal death carries no exit status. Treating it as 0 would report a killed stage as a passing
  // one, which is the false green the whole framework exists to refuse.
  const code = result.error ? EXIT_INVOCATION : (result.status ?? EXIT_INVOCATION);
  const outcome = code === 0 ? "passed" : stage.gating ? "failed" : "advisory-failed";
  process.stdout.write(`--- ${stage.id}: ${outcome} (exit ${code})\n`);
  return {
    id: stage.id,
    command: stage.command,
    gating: stage.gating,
    exitCode: code,
    outcome,
    startedAt: started.toISOString(),
    completedAt: new Date().toISOString(),
    ...(result.error ? { error: result.error.message } : {}),
  };
}

/**
 * Run stages and produce the machine-readable record.
 *
 * The record reports every stage including the advisory one, with its real exit code. That is
 * deliberate: a report that listed only gating stages would let a reader conclude the compliance
 * verdict passed, and this repository's verdict does not pass.
 */
/**
 * What this run was run *against*, established by the runner rather than asserted by its caller.
 *
 * The commit is read from the repository the pipeline is executing on — inside the container, that
 * is the copy baked into the image. This matters for the submission invariant: `submit-pr` compares
 * the host's HEAD against *this* value, so a stale image announces itself instead of passing under
 * the current commit's name. A host-supplied commit would have been the host describing itself, and
 * would agree with the host no matter what the container actually checked.
 */
function provenance(cwd) {
  const git = (args) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    return r.status === 0 ? r.stdout.trim() : null;
  };
  return {
    commit: git(["rev-parse", "HEAD"]),
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
    repository: git(["config", "--get", "remote.origin.url"]),
    environment: {
      node: process.version,
      platform: `${process.platform}/${process.arch}`,
      // Set by compose from the image it built, so the record names the environment that produced it.
      image: process.env.CI_IMAGE ?? null,
      containerized: process.env.LOCAL_CI_CONTAINER === "1",
    },
  };
}

export function runPipeline({ cwd, only = null, verbose = false } = {}) {
  const selected = only ? STAGES.filter((s) => only.includes(s.id)) : STAGES;
  if (only) {
    const unknown = only.filter((id) => !STAGES.some((s) => s.id === id));
    if (unknown.length) throw new Error(`unknown stage(s): ${unknown.join(", ")}`);
  }

  const startedAt = new Date().toISOString();
  const checks = [];
  let firstFailure = null;
  for (const stage of selected) {
    const record = runStage(stage, cwd, verbose);
    checks.push(record);
    // Fail fast, but only on a gating stage. An advisory failure is recorded and the run continues,
    // because stopping there would make the advisory stage gating by another name.
    if (record.outcome === "failed") {
      firstFailure = record.id;
      break;
    }
  }

  const ranEveryGatingStage = gatingStages()
    .filter((s) => !only || only.includes(s.id))
    .every((s) => checks.some((c) => c.id === s.id && c.outcome === "passed"));

  return {
    result: firstFailure === null && ranEveryGatingStage ? "passed" : "failed",
    failedStage: firstFailure,
    ...provenance(cwd),
    // A partial run must never look like a full one. `submit-pr` refuses anything but "complete",
    // so `pipeline.mjs run audit` cannot be used to manufacture a passing record for one stage.
    scope: only ? "partial" : "complete",
    startedAt,
    completedAt: new Date().toISOString(),
    restore: RESTORE,
    checks,
  };
}

/**
 * Refuse to run at all if the repository seam is unavailable.
 *
 * The audit asks `git` which paths this repository ignores and which are tracked, and the tracked
 * half has no filesystem fallback: without git it reports evidence unavailability rather than
 * guessing. That is the right behaviour and it is also why a run with a broken git is not a weaker
 * run — it is a run answering a different question, and the exit code cannot tell you which one you
 * got. Containerising this pipeline broke exactly this on the first attempt (the copied tree was
 * owned by root while the process ran as `node`, and git refused it), so the condition is checked
 * once, up front, with a message that names the cause.
 */
function preflight(cwd) {
  const r = spawnSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" });
  if (r.error) return { ok: false, message: `git is not available: ${r.error.message}` };
  if (r.status !== 0) return { ok: false, message: `git could not read this repository:\n${(r.stderr ?? "").trim()}` };
  return { ok: true, commit: r.stdout.trim() };
}

function usage() {
  process.stderr.write(
    "usage: node scripts/pipeline.mjs <list|run> [--json] [--verbose] [--report=PATH] [stage ...]\n",
  );
}

function main(argv) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const mode = argv[0];
  const flags = argv.filter((a) => a.startsWith("--"));
  const stages = argv.slice(1).filter((a) => !a.startsWith("--"));
  const reportPath = flags.find((f) => f.startsWith("--report="))?.slice("--report=".length);

  if (mode === "list") {
    if (flags.includes("--json")) {
      process.stdout.write(`${JSON.stringify({ stages: STAGES, restore: RESTORE }, null, 2)}\n`);
    } else {
      for (const s of STAGES) {
        process.stdout.write(`${s.gating ? "gate    " : "advisory"}  ${s.id.padEnd(10)} ${s.command}\n`);
      }
    }
    return 0;
  }

  if (mode !== "run") {
    usage();
    return EXIT_INVOCATION;
  }

  const ready = preflight(root);
  if (!ready.ok) {
    process.stderr.write(
      `pipeline: ${ready.message}\n` +
        "The audit resolves repository membership and ignore rules through git, so a run without it\n" +
        "covers a different surface than CI does. Refusing to report a result for it.\n",
    );
    return EXIT_INVOCATION;
  }

  let report;
  try {
    report = runPipeline({
      cwd: root,
      only: stages.length ? stages : null,
      // The environment variable exists because the command line is fixed in compose.ci.yml; the
      // host scripts pass `--verbose` through as an env var rather than rewriting the command.
      verbose: flags.includes("--verbose") || process.env.LOCAL_CI_VERBOSE === "1",
    });
  } catch (err) {
    process.stderr.write(`pipeline: ${err.message}\n`);
    return EXIT_INVOCATION;
  }

  if (reportPath) {
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  // The human-readable verification evidence, rendered here rather than in the host scripts. Two
  // shells formatting the same record would be two renderings that drift, and the container is the
  // only party that actually knows what it ran.
  const field = (k) => `${k}`.padEnd(17);
  process.stdout.write("\n");
  process.stdout.write(`${field("repository")}: ${report.repository ?? "(no origin remote)"}\n`);
  process.stdout.write(`${field("branch")}: ${report.branch}\n`);
  process.stdout.write(`${field("verified commit")}: ${report.commit}\n`);
  process.stdout.write(`${field("scope")}: ${report.scope}\n`);
  process.stdout.write(
    `${field("environment")}: ${report.environment.containerized ? "Docker" : "host"} ` +
      `${report.environment.image ?? ""} Node ${report.environment.node}\n`,
  );
  process.stdout.write(`${field("stages")}:\n`);
  for (const c of report.checks) {
    process.stdout.write(`  ${c.outcome.padEnd(16)} ${c.id}${c.gating ? "" : "  [advisory]"}\n`);
  }
  process.stdout.write(`${field("result")}: ${report.result.toUpperCase()}\n`);
  process.stdout.write(`${field("completed")}: ${report.completedAt}\n`);
  return report.result === "passed" ? 0 : EXIT_FAILED;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}

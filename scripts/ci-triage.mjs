/**
 * Classify a pull request's checks by what they mean, not by what colour they are.
 *
 * This repository has three intentionally different CI signals, and a reader that treats
 * `conclusion: failure` as "something is broken" flattens them into one:
 *
 *   test                      required   green expected
 *   validate                  advisory   red is meaningful and expected
 *   validate-self / validate  advisory   red is meaningful and expected
 *
 * The two advisory jobs are red permanently and correctly: four prohibitions were reviewed by the
 * project owner and found unmet, and a recorded rejection is a failure rather than silence. Alerting
 * on them is a false alarm, and repeated false alarms train a reader to ignore the real one.
 *
 * Silencing them would be worse. Those jobs carry evidence nothing else produces: `validate` runs the
 * evaluator from inside the repository, `validate-self` installs the framework and evaluates the
 * repository as an external project. Their *agreement* is what establishes that placement does not
 * change a verdict — the invariant neither arm can report alone — and their exit code distinguishes
 * "a verdict was produced and it is red" from "no verdict was produced at all". Both facts disappear
 * the moment the job is ignored.
 *
 * ## What a red check can mean
 *
 * Four different things, and collapsing them is the defect this file exists to prevent:
 *
 *   EXPECTED       the evidence establishes the expected state          exit 0
 *   ACTIONABLE     the evidence establishes an unexpected state         exit 1
 *   INDETERMINATE  the evidence cannot establish the state at all       exit 2
 *
 * `INDETERMINATE` is not a softer `ACTIONABLE`. An unreadable GitHub API, a job that executed no
 * steps, an unreadable policy — none of these are evidence that anything is wrong with the
 * repository, and reporting them as though the repository were proven defective is its own false
 * claim. It still deserves attention, which is why it exits non-zero; it simply does not assert what
 * it has not measured. The same distinction `standards validate` already draws between
 * `NON_COMPLIANT` and `NOT_EVALUATED`.
 *
 * ## Scope
 *
 * A reader and a classifier. It consumes GitHub evidence and `project-policy.yml`, classifies, and
 * exits. It does not modify the policy, re-run checks, form a compliance opinion of its own, or
 * suppress the red jobs it interprets. It is not a gate and must not become one.
 *
 * ## Structure
 *
 *   GitHub + policy  ->  extractEvidence()  ->  observation  ->  classify()  ->  verdict
 *
 * `classify` is pure: an observation in, a verdict out, no I/O. That is what lets every semantic
 * branch be tested from a small structured fixture rather than a fabricated ten-thousand-line runner
 * log — and it is why a use/mention defect cannot hide inside a fixture nobody reads. Log parsing is
 * separated into `parseValidatorLog` and tested against a few tiny raw specimens.
 *
 * The established rejection set is **derived from the policy**, never listed here. A second copy of
 * that list would be a second source of truth whose first act is to drift, still calling a cleared
 * rejection "expected".
 *
 * ## Addressing
 *
 * Evidence is addressed three ways, and the difference matters after a rebase merge. A pull request's
 * `statusCheckRollup` describes its own head, which GitHub does not update when it rewrites the commit
 * onto the base branch: after #29 merged, `gh pr view 29` still reported `4d7088f` and that commit's
 * check runs, while the merged `69de0c8` on `develop` carried its own. Classifying the pull request and
 * calling the answer a statement about the merged branch is the identity-versus-content substitution
 * this repository's submission gate already refuses — a true verdict about the wrong commit.
 *
 * So `--sha` and `--branch` read check runs for a commit directly. The observation always names the
 * commit it describes, in every mode, because a verdict that does not name its subject cannot be
 * checked against one.
 *
 * Usage:
 *   node scripts/ci-triage.mjs <pr-number> [--json]
 *   node scripts/ci-triage.mjs --sha <commit-sha> [--json]
 *   node scripts/ci-triage.mjs --branch <branch-name> [--json]
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parseYaml } from "./yaml.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const EXPECTED = "EXPECTED";
export const ACTIONABLE = "ACTIONABLE";
export const INDETERMINATE = "INDETERMINATE";

/** Exit codes, matching the epistemic split rather than a pass/fail binary. */
export const EXIT = { [EXPECTED]: 0, [ACTIONABLE]: 1, [INDETERMINATE]: 2 };

/** The two jobs that run the evaluator, and the placement each represents. */
export const VALIDATION_ARMS = {
  "validate": "inside — the evaluator run from within the repository",
  "validate-self / validate": "outside — the framework installed, this repository as its subject",
};

// ---------------------------------------------------------------------------------------------
// Log parsing — separated so it can be tested against tiny raw specimens
// ---------------------------------------------------------------------------------------------

/**
 * A runner log reduced to what the job actually emitted.
 *
 * Two transformations, both load-bearing.
 *
 * Every line carries a leading ISO timestamp, so a pattern anchored at the start of a line matches
 * nothing without stripping it. The first version of this file anchored on `^\s*Status:` and found no
 * verdict at all — then reported that four expected rejections had disappeared.
 *
 * More importantly, a runner log contains *the script it is about to run* as well as that script's
 * output, rendered inside a colour escape. This repository's workflow contains the literal text
 * `echo "::error::NO VERDICT (exit 2)"` inside a `case` branch, so a naive search for that phrase
 * matches the source of a branch that never executed. The first version did exactly that and reported
 * exit 2 for a job that had produced a verdict — the use-versus-mention defect this repository has
 * now shipped seven times, committed inside the tool written to classify its own CI honestly.
 * Emitted annotations appear as `##[error]…`; an echoed command cannot produce one.
 */
export function logLines(raw) {
  return String(raw)
    .split(/\r?\n/)
    .map((line) => line.replace(/^\S+Z\s/, ""))
    .filter((line) => !/\[36;1m/.test(line));
}

/**
 * What a validator job said, as a structured observation.
 *
 * `validatorExit` is 2 when the job emitted the no-verdict annotation, 1 when it emitted a red
 * verdict, and null when neither was emitted — never inferred from prose.
 */
export function parseValidatorLog(raw) {
  const lines = logLines(raw);
  const annotations = lines.filter((l) => l.startsWith("##[error]")).map((l) => l.slice("##[error]".length));

  let status = null;
  const reportedRules = [];
  for (const line of lines) {
    const s = /^\s*Status:\s*(\S+)\s*$/.exec(line);
    if (s) status = s[1];
    const f = /^\s+([a-z][\w.-]*\.[\w.-]+)\s+\[(forbidden|required|recommended)\]/.exec(line);
    if (f) reportedRules.push(f[1]);
  }

  const noVerdict = annotations.some((a) => /^NO VERDICT/.test(a));
  const redVerdict = annotations.some((a) => /^NON-COMPLIANT/.test(a));

  return {
    status,
    reportedRules: [...new Set(reportedRules)].sort(),
    annotations,
    validatorExit: noVerdict ? 2 : redVerdict ? 1 : null,
  };
}

/**
 * The rules a policy currently records as reviewed and rejected.
 *
 * Each rule's live review is the one no other review supersedes, so a rejection later re-reviewed and
 * approved is absent without anyone maintaining a list. Returns null when the policy cannot be read
 * or has no attestations — an unreadable policy establishes nothing, and must not read as "no
 * rejections are expected".
 */
export function establishedRejectionsFrom(policy) {
  const attestations = policy?.attestations;
  if (!attestations || typeof attestations !== "object" || Array.isArray(attestations)) return null;

  const rejected = [];
  for (const [rule, node] of Object.entries(attestations)) {
    const reviews = Array.isArray(node?.reviews) ? node.reviews : [];
    const superseded = new Set(reviews.map((r) => r?.supersedes).filter(Boolean));
    const live = reviews.filter((r) => !superseded.has(r?.id));
    if (live.some((r) => r?.status === "rejected")) rejected.push(rule);
  }
  return rejected.sort();
}

// ---------------------------------------------------------------------------------------------
// Classification — pure
// ---------------------------------------------------------------------------------------------

/**
 * Classify an observation.
 *
 * Pure. Everything it needs is in the observation:
 *
 *   {
 *     establishedRejections: string[] | null,   // null when the policy could not be read
 *     requiredChecksNote: string,               // why required-ness is unknown, when it is
 *     jobs: [{
 *       name, conclusion, stepsExecuted, required,   // required: boolean | null (null = unreadable)
 *       logRead, status, reportedRules, validatorExit, annotations
 *     }]
 *   }
 *
 * `ACTIONABLE` outranks `INDETERMINATE`, which outranks `EXPECTED`: a run that both proved something
 * wrong and failed to establish something else is a run that needs a human for the first reason.
 */
export function classify(observation) {
  const established = observation?.establishedRejections ?? null;
  const jobs = Array.isArray(observation?.jobs) ? observation.jobs : [];
  const findings = [];
  const arms = [];

  for (const job of jobs) {
    const name = job?.name ?? "(unnamed)";
    const isArm = name in VALIDATION_ARMS;

    // 1. Did it execute? A job that concluded without running a step is infrastructure, not code.
    //    Calling it a failure sends someone hunting a defect in something that never ran; calling it
    //    a pass is worse.
    if (job?.stepsExecuted === 0) {
      findings.push({
        check: name, class: INDETERMINATE,
        why: "the job concluded without executing any step — infrastructure blocked, neither a pass nor a failing code path",
      });
      if (isArm) arms.push({ name, usable: false });
      continue;
    }
    if (typeof job?.stepsExecuted !== "number") {
      findings.push({
        check: name, class: INDETERMINATE,
        why: "whether the job executed could not be read, so its conclusion cannot be interpreted",
      });
      if (isArm) arms.push({ name, usable: false });
      continue;
    }

    if (job.conclusion === "success") {
      findings.push({ check: name, class: EXPECTED, why: "passed" });
      if (isArm) arms.push({ name, usable: true, status: "COMPLIANT", reportedRules: [] });
      continue;
    }

    // 2. A non-validation job that ran real steps and did not succeed is an established unexpected
    //    state whether or not it is required. Required-ness changes how loud it is, not whether it
    //    happened, so an unreadable protection setting is reported without downgrading the finding.
    if (!isArm) {
      const unknown = observation?.requiredChecksNote ?? "whether it is required could not be read from branch protection";
      const note = job.required === null || job.required === undefined
        ? ` (${unknown})`
        : job.required ? " (required)" : " (not required)";
      findings.push({
        check: name, class: ACTIONABLE,
        why: `concluded ${job.conclusion} after executing ${job.stepsExecuted} step(s)${note}`,
      });
      continue;
    }

    // 3. A validation arm.
    if (!job.logRead) {
      findings.push({ check: name, class: INDETERMINATE, why: "the job log could not be read, so its red is uninterpreted" });
      arms.push({ name, usable: false });
      continue;
    }
    if (job.validatorExit === 2) {
      findings.push({
        check: name, class: ACTIONABLE,
        why: "exit 2 — the validator produced no verdict. The policy could not be read, or the declared standards version is not the one executing",
      });
      arms.push({ name, usable: false });
      continue;
    }

    // An arm's outcome can be established two independent ways: the emitted exit annotation, or the
    // printed report. Only one workflow here emits the annotation, so a missing exit class is normal
    // and must not be treated as a failure to observe. When *neither* is present the log was read and
    // yielded nothing — and the rejection-set comparison below would then read an empty reported set
    // as "every established rejection has been cleared" and call the repository changed, which is a
    // claim about the project made from a defect in reading it.
    if (job.validatorExit === null && (job.status === null || job.status === undefined)) {
      findings.push({
        check: name, class: INDETERMINATE,
        why: "the log was read but yielded neither a verdict line nor an exit annotation, so the arm's outcome is unestablished",
      });
      arms.push({ name, usable: false });
      continue;
    }
    if (established === null) {
      findings.push({
        check: name, class: INDETERMINATE,
        why: "project-policy.yml could not be read, so no rejection set is established to compare against",
      });
      arms.push({ name, usable: true, status: job.status, reportedRules: job.reportedRules ?? [] });
      continue;
    }

    const reported = job.reportedRules ?? [];
    const added = reported.filter((r) => !established.includes(r));
    const removed = established.filter((r) => !reported.includes(r));
    arms.push({ name, usable: true, status: job.status, reportedRules: reported });

    if (added.length || removed.length) {
      const parts = [];
      if (added.length) parts.push(`newly failing: ${added.join(", ")}`);
      if (removed.length) parts.push(`established rejection(s) no longer reported: ${removed.join(", ")}`);
      findings.push({ check: name, class: ACTIONABLE, why: `the rejection set changed — ${parts.join("; ")}` });
      continue;
    }

    findings.push({
      check: name, class: EXPECTED,
      why: `${job.status} over the established rejection set (${reported.length}) — ${VALIDATION_ARMS[name]}`,
    });
  }

  // 4. Do the placements agree? Disagreement means where the evaluator ran changed its verdict, which
  //    is the one result neither arm can report on its own.
  const present = Object.keys(VALIDATION_ARMS).filter((n) => arms.some((a) => a.name === n));
  const usable = arms.filter((a) => a.usable);
  if (present.length < 2) {
    findings.push({
      check: "inside vs outside", class: INDETERMINATE,
      why: `only ${present.length} of 2 validation arms reported, so placement equivalence was not established this run`,
    });
  } else if (usable.length < 2) {
    findings.push({
      check: "inside vs outside", class: INDETERMINATE,
      why: "an arm produced nothing comparable, so placement equivalence was not established this run",
    });
  } else {
    const [a, b] = usable;
    const same = a.status === b.status && a.reportedRules.join() === b.reportedRules.join();
    if (!same) {
      findings.push({
        check: "inside vs outside", class: ACTIONABLE,
        why: `the two evaluator placements disagree — ${a.name}: ${a.status} [${a.reportedRules.join(" ")}] vs ${b.name}: ${b.status} [${b.reportedRules.join(" ")}]`,
      });
    }
  }

  const verdict = findings.some((f) => f.class === ACTIONABLE)
    ? ACTIONABLE
    : findings.some((f) => f.class === INDETERMINATE)
      ? INDETERMINATE
      : EXPECTED;

  return { verdict, findings };
}

// ---------------------------------------------------------------------------------------------
// Evidence extraction — impure
// ---------------------------------------------------------------------------------------------

function gh(args, { json = false } = {}) {
  const r = spawnSync("gh", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error || r.status !== 0) return { ok: false, out: `${r.stderr ?? r.error?.message ?? ""}`.trim() };
  let data;
  if (json) {
    try {
      data = JSON.parse(r.stdout);
    } catch {
      return { ok: false, out: "the response was not valid JSON" };
    }
  }
  return { ok: true, out: r.stdout, data };
}

/** The job id embedded in a check run's details URL, or null when it is not a job URL. */
export function jobIdFrom(detailsUrl) {
  const m = /\/job\/(\d+)/.exec(detailsUrl ?? "");
  return m ? m[1] : null;
}

/**
 * Which checks a branch requires.
 *
 * Only GitHub knows, and it may be unreadable — no branch protection, or no permission. Reported as
 * null rather than as an empty set: assuming nothing is required would silently downgrade a real
 * gating failure.
 */
function requiredChecks(repo, branch) {
  if (!branch) return null;
  const r = gh(["api", `repos/${repo}/branches/${branch}/protection/required_status_checks`], { json: true });
  if (!r.ok) return null;
  const contexts = r.data?.contexts ?? r.data?.checks?.map((c) => c.context) ?? [];
  return contexts;
}

/**
 * Read the target out of the argument list. Pure, so the addressing rules are testable without gh.
 *
 * Two targets are an error rather than a precedence rule. A reader asked about both a pull request and
 * a commit has been asked two different questions, and answering the one that happens to be checked
 * first is how a verdict ends up attached to the wrong subject — the defect this mode exists to fix.
 */
export function parseTarget(argv) {
  const args = argv.filter((a) => a !== "--json");
  const targets = [];

  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--sha" || a === "--branch") {
      const value = args[i + 1];
      if (!value || value.startsWith("--")) return { error: `${a} needs a value` };
      targets.push({ mode: a.slice(2), value });
      i += 1;
    } else if (/^\d+$/.test(a)) {
      targets.push({ mode: "pr", value: a });
    } else {
      return { error: `unrecognised argument: ${a}` };
    }
  }

  if (targets.length === 0) return { error: "no target given" };
  if (targets.length > 1) {
    return { error: `more than one target given (${targets.map((t) => `${t.mode} ${t.value}`).join(", ")}) — name one subject` };
  }
  return targets[0];
}

/**
 * The commit whose checks are being read, the checks themselves, and which branch — if any — governs
 * required-ness.
 *
 * Required-ness is deliberately different per mode rather than defaulting.
 *
 *   pr      the base branch the request would merge into. That is what would block the merge.
 *   branch  that branch's own protection. A commit on `develop` is gated by `develop`'s rules.
 *   sha     no branch is named, so the question is not asked. A commit can sit on any number of
 *           branches with different protection, and picking one would be a guess reported as a fact.
 *
 * All three can also come back unreadable, which is a different thing from unasked, so they are
 * distinguished in the note rather than collapsed into a single "unreadable".
 */
function resolveSubject(target, repo) {
  if (target.mode === "pr") {
    const view = gh(["pr", "view", target.value, "--json", "statusCheckRollup,baseRefName,headRefOid,number,url"], { json: true });
    if (!view.ok) return { error: `could not read pull request ${target.value}: ${view.out}` };
    return {
      pr: view.data.number,
      url: view.data.url,
      head: view.data.headRefOid,
      base: view.data.baseRefName,
      protectedBranch: view.data.baseRefName,
      checks: (view.data.statusCheckRollup ?? []).map((c) => ({
        name: c.name,
        conclusion: c.conclusion,
        jobId: jobIdFrom(c.detailsUrl),
      })),
    };
  }

  // `commits/<ref>` accepts a branch name or a sha, and always answers with the resolved sha. Asking
  // it even when a sha was given is what turns an abbreviated or stale sha into an explicit failure
  // rather than an empty check list read as "nothing ran".
  const commit = gh(["api", `repos/${repo}/commits/${target.value}`], { json: true });
  if (!commit.ok) return { error: `could not resolve ${target.mode} ${target.value}: ${commit.out}` };
  const head = commit.data?.sha;
  if (!head) return { error: `${target.mode} ${target.value} resolved to no commit` };

  const runs = gh(["api", `repos/${repo}/commits/${head}/check-runs`], { json: true });
  if (!runs.ok) return { error: `could not read check runs for ${head}: ${runs.out}` };

  return {
    pr: null,
    url: `https://github.com/${repo}/commit/${head}`,
    head,
    base: target.mode === "branch" ? target.value : null,
    protectedBranch: target.mode === "branch" ? target.value : null,
    // For a GitHub Actions check run the check-run id is the job id, which is what `actions/jobs/<id>`
    // and its `/logs` want. `details_url` states the same id, so it is preferred where present and the
    // id is the fallback rather than the other way round.
    checks: (runs.data?.check_runs ?? []).map((c) => ({
      name: c.name,
      conclusion: c.conclusion,
      jobId: jobIdFrom(c.details_url) ?? (c.id === undefined || c.id === null ? null : String(c.id)),
    })),
  };
}

/**
 * Build the observation `classify` consumes. All I/O lives here.
 *
 * Accepts a target from `parseTarget`, or a bare pull request number for the original call shape.
 */
export function extractEvidence(target) {
  const subjectTarget = typeof target === "object" && target !== null ? target : { mode: "pr", value: String(target) };

  const repoView = gh(["repo", "view", "--json", "nameWithOwner"], { json: true });
  if (!repoView.ok) return { error: "could not determine the repository" };
  const repo = repoView.data.nameWithOwner;

  const subject = resolveSubject(subjectTarget, repo);
  if (subject.error) return subject;

  let policy = null;
  try {
    policy = parseYaml(readFileSync(path.join(ROOT, "project-policy.yml"), "utf8"));
  } catch {
    // Left null on purpose: an unreadable policy establishes no rejection set, and the classifier
    // reports that as INDETERMINATE rather than guessing one.
    policy = null;
  }

  const required = requiredChecks(repo, subject.protectedBranch);
  const requiredChecksNote = subject.protectedBranch === null
    ? "no branch was named, so which checks gate this commit was not asked"
    : required === null
      ? `branch protection on ${subject.protectedBranch} could not be read`
      : `required on ${subject.protectedBranch}`;

  const jobs = [];

  for (const check of subject.checks) {
    const name = check.name;
    const jobId = check.jobId;
    const conclusion = String(check.conclusion ?? "").toLowerCase();

    let stepsExecuted;
    if (jobId) {
      const jobApi = gh(["api", `repos/${repo}/actions/jobs/${jobId}`], { json: true });
      if (jobApi.ok && Array.isArray(jobApi.data?.steps)) {
        stepsExecuted = jobApi.data.steps.filter((s) => s?.conclusion && s.conclusion !== "skipped").length;
      }
    }

    const job = {
      name,
      conclusion,
      stepsExecuted,
      required: required === null ? null : required.includes(name),
      logRead: false,
      status: null,
      reportedRules: [],
      validatorExit: null,
      annotations: [],
    };

    if (name in VALIDATION_ARMS && conclusion !== "success" && jobId) {
      const logs = gh(["api", `repos/${repo}/actions/jobs/${jobId}/logs`]);
      if (logs.ok) Object.assign(job, { logRead: true }, parseValidatorLog(logs.out));
    } else if (name in VALIDATION_ARMS && conclusion === "success") {
      job.logRead = true;
    }

    jobs.push(job);
  }

  return {
    pr: subject.pr,
    url: subject.url,
    head: subject.head,
    base: subject.base,
    repo,
    requiredChecks: required,
    requiredChecksNote,
    establishedRejections: establishedRejectionsFrom(policy),
    jobs,
  };
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

function render(observation, result) {
  const out = [];
  // The subject is named the same way in every mode. A verdict that does not say which commit it is
  // about cannot be checked against one, and after a rebase merge that is exactly the mistake to make.
  const sha = String(observation.head ?? "").slice(0, 7);
  out.push(observation.pr ? `PR #${observation.pr} — ${sha}` : `commit ${sha}${observation.base ? ` on ${observation.base}` : ""}`);
  out.push(`required checks        : ${observation.requiredChecks === null ? observation.requiredChecksNote ?? "unreadable" : observation.requiredChecks.join(", ") || "none"}`);
  out.push(`established rejections : ${observation.establishedRejections === null ? "unreadable" : observation.establishedRejections.join(", ") || "none"}`);
  out.push("");
  for (const f of result.findings) {
    out.push(`  ${f.class.padEnd(14)}${f.check}`);
    out.push(`                ${f.why}`);
  }
  out.push("");
  out.push(result.verdict);
  if (result.verdict === EXPECTED) {
    out.push("Both evaluator placements executed, agreed, and named exactly the rejections the policy records.");
  } else if (result.verdict === INDETERMINATE) {
    out.push("Nothing here says the repository is wrong. It says the evidence could not establish what happened.");
  }
  return out.join("\n") + "\n";
}

export function main(argv) {
  const json = argv.includes("--json");
  const target = parseTarget(argv);
  if (target.error) {
    process.stderr.write(`${target.error}\n`);
    process.stderr.write("usage: node scripts/ci-triage.mjs <pr-number> | --sha <commit> | --branch <name> [--json]\n");
    return EXIT[INDETERMINATE];
  }

  const observation = extractEvidence(target);
  if (observation.error) {
    process.stderr.write(`${observation.error}\n`);
    return EXIT[INDETERMINATE];
  }

  const result = classify(observation);
  process.stdout.write(json ? JSON.stringify({ ...observation, ...result }, null, 2) + "\n" : render(observation, result));
  return EXIT[result.verdict];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main(process.argv.slice(2));
}

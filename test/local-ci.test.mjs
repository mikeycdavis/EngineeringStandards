/**
 * The local Docker CI workflow, and the invariant it exists to enforce:
 *
 *   A pull request may only be submitted if the exact commit SHA being pushed has successfully
 *   passed the repository's complete containerized CI pipeline.
 *
 * Two kinds of assertion live here, and the split is deliberate.
 *
 * **The decision is tested directly.** `evaluateSubmission` is a pure function precisely so that
 * every refusal — dirty tree, protected branch, red CI, and above all a HEAD that moved between
 * verification and push — can be driven without a remote, without a real branch, and without
 * mutating history to demonstrate a guard. The SHA-mismatch case is the one this whole workflow is
 * built around, so it is tested from both directions: a moved HEAD, and a stale verification record
 * that names a different commit while HEAD sat still.
 *
 * **The environment is tested as text**, the same limitation `test/workflow.test.mjs` already
 * records for GitHub's YAML: these checks confirm that a line is present or absent, and they cannot
 * confirm that Docker behaves as intended. Only running the pipeline establishes that, which is
 * what `scripts/ci.ps1` is for.
 *
 * Nothing here starts a container. A test suite that required Docker could not run inside the
 * container that runs the test suite.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { STAGES, gatingStages, RESTORE } from "../scripts/pipeline.mjs";
import { evaluateSubmission, evidenceBlock, MESSAGES, PROTECTED_BRANCHES } from "../scripts/submit-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

/**
 * A script with its comments removed, for checks that must distinguish use from mention.
 *
 * This exists because the first version of the prune check below failed against `scripts/ci.ps1` —
 * on the sentence *"There is no `docker system prune` here and there must never be one"*. A check
 * that cannot tell a prohibition from its violation is the use-versus-mention defect this tool has
 * now produced six times, and there is no reason a test should be exempt from the rule its
 * detectors follow.
 *
 * Handles `#` line comments (both shells) and PowerShell `<# … #>` blocks. It is not a parser and
 * does not need to be: a `#` inside a string would be over-stripped, which can only make these
 * assertions blinder, never falsely confident.
 */
const withoutComments = (text) =>
  text
    .replace(/<#[\s\S]*?#>/g, "")
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

// --- One definition of what CI runs ------------------------------------------------------------

/** The body of one top-level job in ci.yml, from its key to the next one or the end of the file. */
function jobBody(text, name) {
  const at = text.search(new RegExp(`^  ${name}:$`, "m"));
  if (at === -1) return "";
  const after = text.slice(at + 1).search(/^  [a-z][\w-]*:$/m);
  return after === -1 ? text.slice(at) : text.slice(at, at + 1 + after);
}

test("every gating stage is a step of the required GitHub job", () => {
  // The drift guard. Two executors run this repository's checks — a GitHub runner and a local
  // container — and before scripts/pipeline.mjs existed, adding a check to one of them was a silent
  // way to have two different definitions of CI. This fails the moment they disagree.
  const testJob = jobBody(read(".github/workflows/ci.yml"), "test");
  assert.ok(testJob.length > 0, "ci.yml no longer declares a test job");
  for (const stage of gatingStages()) {
    assert.ok(
      testJob.includes(stage.command),
      `pipeline.mjs gates on '${stage.command}' and the required GitHub job does not run it`,
    );
  }
});

test("the required GitHub job runs nothing the pipeline does not know about", () => {
  // The other direction, and the one that actually catches drift in practice: a step added to the
  // workflow by hand would pass the test above and still mean local CI covers less than GitHub does.
  const testJob = jobBody(read(".github/workflows/ci.yml"), "test");
  const commands = [...testJob.matchAll(/^\s+run:\s*(npm .+)$/gm)].map((m) => m[1].trim());
  assert.ok(commands.length > 0, "the required job runs no npm command — has its shape changed?");
  const known = new Set(STAGES.map((s) => s.command));
  for (const command of commands) {
    assert.ok(known.has(command), `ci.yml runs '${command}', which is in no pipeline stage`);
  }
});

test("the advisory stage is the one GitHub also keeps out of the required job", () => {
  // `validate` is non-gating here for the same reason it is a separate, non-required job there: this
  // repository is intentionally NON_COMPLIANT, so exit 1 is the honest answer and gating on it would
  // leave no legal path to change develop. If that ever stops being true in one place it must stop
  // being true in both.
  const ci = read(".github/workflows/ci.yml");
  const advisory = STAGES.filter((s) => !s.gating);
  assert.deepEqual(advisory.map((s) => s.id), ["validate"], "the advisory set changed without an argument");
  assert.ok(jobBody(ci, "validate").includes("npm run validate"));
  assert.ok(!jobBody(ci, "test").includes("npm run validate"), "the required job runs the validator");
});

test("the pipeline still has no dependency-installation stage", () => {
  // Zero third-party dependencies is enforced structurally by CI having no install step. A stage
  // appearing here, or an install command in the image, would mean that decision changed.
  assert.equal(RESTORE.stage, "none");
  for (const stage of STAGES) {
    assert.doesNotMatch(stage.command, /npm (ci|install|i)\b/, `${stage.id} installs dependencies`);
  }
  const dockerfile = read("ci/Dockerfile");
  assert.doesNotMatch(dockerfile, /^\s*RUN\s+(apt-get|npm|yarn|pnpm)\b/m, "the CI image installs packages");
});

// --- The container is the isolation boundary ---------------------------------------------------

test("the CI image is pinned by digest, not by a moving tag", () => {
  // The same rule the reusable workflow applies to the framework revision it executes. A tag is
  // rebuilt; two runs of the same commit a month apart would not be the same run.
  const dockerfile = read("ci/Dockerfile");
  const from = dockerfile.match(/^FROM\s+(\S+)/m);
  assert.ok(from, "the CI image declares no base");
  assert.match(from[1], /@sha256:[0-9a-f]{64}$/, `the base image '${from[1]}' is not pinned by digest`);
});

test("the CI container reaches nothing on the host", () => {
  // Comments stripped for the same reason as everywhere else here: compose.ci.yml documents, at
  // length, the volume and healthcheck shape a future dependency would use.
  const active = withoutComments(read("compose.ci.yml"));
  assert.match(active, /network_mode:\s*none/, "the CI container has network access");
  assert.doesNotMatch(active, /^\s*volumes:/m, "the CI service declares a volume or bind mount");
  assert.doesNotMatch(active, /docker\.sock/, "the Docker socket is exposed to the CI container");
  assert.doesNotMatch(active, /privileged:\s*true/, "the CI container runs privileged");
  assert.match(read("ci/Dockerfile"), /^USER node$/m, "the pipeline runs as root");
});

test("teardown can only remove what the run created", () => {
  // A CI script that garbage-collects the host is a CI script that deletes someone's work. Every
  // teardown in both entry points is scoped to the run's unique compose project.
  for (const file of ["scripts/ci.ps1", "scripts/ci.sh"]) {
    const text = withoutComments(read(file));
    assert.doesNotMatch(text, /docker\s+system\s+prune/, `${file} prunes the host`);
    assert.doesNotMatch(text, /docker\s+(volume|image|container|network)\s+prune/, `${file} prunes shared resources`);
    assert.match(text, /down --volumes --remove-orphans/, `${file} does not tear its project down`);
  }
});

test("both entry points derive their names from the repository rather than hardcoding them", () => {
  // The pattern is meant to be copied into other repositories unchanged; a hardcoded project name
  // would collide the moment two of them ran at once.
  assert.match(read("scripts/ci.ps1"), /RepoSlug/, "ci.ps1 hardcodes its resource names");
  assert.match(read("scripts/ci.sh"), /repo_slug/, "ci.sh hardcodes its resource names");
});

test("the image a run executes is the image that run built", () => {
  // A tag derived from the directory basename is shared by every clone with that name. If one run's
  // build lands between another run's build and its `compose run`, the second container executes the
  // first checkout's code and reports a result for a tree nobody asked about. Submission would still
  // refuse it — the record names the wrong commit — but `ci.*` alone would have printed a pass.
  // The tag therefore carries the per-run project, and no `:local` tag is used by either entry point.
  const ps = withoutComments(read("scripts/ci.ps1"));
  const sh = withoutComments(read("scripts/ci.sh"));
  assert.match(ps, /\$Image\s*=\s*"\$RepoSlug-ci:\$Project"/, "ci.ps1 does not tag the image per run");
  assert.match(sh, /image="\$\{repo_slug\}-ci:\$\{project\}"/, "ci.sh does not tag the image per run");
  for (const [file, text] of [["scripts/ci.ps1", ps], ["scripts/ci.sh", sh]]) {
    assert.doesNotMatch(text, /-ci:local/, `${file} still uses a tag shared across checkouts`);
    // Removed by that exact name — never by a filter, a dangling sweep, or a prune.
    assert.match(text, /docker image rm/, `${file} leaves its run tag behind`);
  }
});

test("the gate is built from the tree being submitted, never inherited from an earlier one", () => {
  // The gate decides whether a pull request may be opened. Executing a previously built image means
  // that decision comes from whichever checkout last built the tag: a rule deleted in this commit
  // still refuses, and a refusal added in this commit does not fire. Both are silent.
  const text = withoutComments(read("scripts/submit-decide.ps1"));
  assert.doesNotMatch(text, /docker image inspect/, "submit-decide reuses an existing image if it finds one");
  assert.match(text, /compose -p \$Project[^\n]*build/, "submit-decide does not build the current context");
  assert.match(text, /\$Image\s*=\s*"\$\{RepoSlug\}-ci:\$Project"/, "the gate image tag is not per invocation");
  assert.match(text, /finally\s*\{[\s\S]*docker image rm \$Image/, "the gate image is not removed on every path");
});

test("a linked worktree is refused by name rather than failing inside the container", () => {
  // `.git` in a linked worktree is a file holding `gitdir: <absolute host path>`. The build context
  // copies the pointer, not its target, so every `git` call in the container fails and the pipeline
  // aborts in preflight with an exit code that explains nothing about the cause.
  for (const [file, pattern] of [
    ["scripts/ci.ps1", /Test-Path \(Join-Path \$RepoRoot '\.git'\) -PathType Leaf/],
    ["scripts/ci.sh", /if \[ -f "\$repo_root\/\.git" \]/],
  ]) {
    const text = withoutComments(read(file));
    assert.match(text, pattern, `${file} does not detect a linked worktree`);
    assert.match(text, /linked git worktree/, `${file} does not name the cause`);
  }
});

// --- The submission gate -----------------------------------------------------------------------

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

/** A verification record that would be accepted, so each test can spoil exactly one thing. */
const passingEvidence = (commit = SHA_A) => ({
  result: "passed",
  scope: "complete",
  commit,
  branch: "feature/x",
  completedAt: "2026-08-15T00:00:00.000Z",
  environment: { containerized: true, image: "x-ci:local", node: "v20.20.2" },
  checks: [{ id: "test", outcome: "passed", exitCode: 0, gating: true }],
});

/** Facts that would be accepted, so each test can spoil exactly one thing. */
const goodFacts = (over = {}) => ({
  isRepository: true,
  branch: "feature/x",
  base: "develop",
  dirty: [],
  shaBefore: SHA_A,
  shaAfter: SHA_A,
  ciExitCode: 0,
  evidence: passingEvidence(),
  ...over,
});

test("a clean, verified, unchanged commit is allowed", () => {
  const verdict = evaluateSubmission(goodFacts());
  assert.equal(verdict.allowed, true, verdict.message);
  assert.equal(verdict.reason, "verified");
  assert.match(verdict.message, new RegExp(SHA_A));
});

test("submission is refused when HEAD moved after verification", () => {
  // THE test. Everything else in this workflow exists to make this comparison meaningful.
  const verdict = evaluateSubmission(goodFacts({ shaAfter: SHA_B }));
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, "head-moved");
  assert.ok(verdict.message.startsWith(MESSAGES.headMoved), "the specified message is not the one produced");
  assert.match(verdict.message, new RegExp(SHA_A), "the refusal does not name the verified commit");
  assert.match(verdict.message, new RegExp(SHA_B), "the refusal does not name the current commit");
});

test("submission is refused when the record names a commit other than the one being pushed", () => {
  // The subtler half of the same invariant, and the reason the SHA comparison alone is not enough:
  // HEAD never moved here, so shaBefore === shaAfter and that check passes cleanly. What is wrong is
  // that the run which produced the pass was a different commit's run — a stale latest.json left by
  // an earlier verification. Comparing HEAD against itself can never detect that.
  const verdict = evaluateSubmission(goodFacts({ evidence: passingEvidence(SHA_B) }));
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, "evidence-commit-mismatch");
  assert.match(verdict.message, /record:\s+b{40}/);
  assert.match(verdict.message, /pushing:\s+a{40}/);
});

test("submission is refused when CI failed, with the specified message", () => {
  const verdict = evaluateSubmission(goodFacts({ ciExitCode: 1, evidence: null }));
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, "ci-failed");
  assert.equal(verdict.message, MESSAGES.ciFailed);
});

test("CI failure is decided before the record is consulted", () => {
  // Ordering matters: a red run that still produced a record must be reported as a failed run, not
  // as a record problem. The reason string is what a developer acts on.
  const verdict = evaluateSubmission(goodFacts({ ciExitCode: 2 }));
  assert.equal(verdict.reason, "ci-failed");
});

test("submission is refused from every protected branch", () => {
  for (const branch of PROTECTED_BRANCHES) {
    const verdict = evaluateSubmission(goodFacts({ branch, base: "develop" }));
    assert.equal(verdict.allowed, false, `${branch} was allowed`);
    assert.ok(
      ["protected-branch", "branch-is-base"].includes(verdict.reason),
      `${branch} was refused for the wrong reason: ${verdict.reason}`,
    );
  }
});

test("submission is refused on a dirty tree, before CI is allowed to matter", () => {
  const verdict = evaluateSubmission(goodFacts({ dirty: [" M scripts/pipeline.mjs", "?? scratch.txt"] }));
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, "dirty-tree");
  assert.match(verdict.message, /scratch\.txt/, "the refusal does not say what is uncommitted");
});

test("submission is refused outside a repository and on a detached HEAD", () => {
  assert.equal(evaluateSubmission(goodFacts({ isRepository: false })).reason, "not-a-repository");
  assert.equal(evaluateSubmission(goodFacts({ branch: "HEAD" })).reason, "detached-head");
});

test("submission is refused when the pipeline left no record at all", () => {
  const verdict = evaluateSubmission(goodFacts({ evidence: null }));
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, "no-evidence");
});

test("a partial pipeline run cannot be presented as a passing pipeline", () => {
  // `pipeline.mjs run audit` produces a genuine record in which one stage genuinely passed. It is
  // not a pipeline pass, and the scope field is what stops it being read as one.
  const partial = { ...passingEvidence(), scope: "partial" };
  const verdict = evaluateSubmission(goodFacts({ evidence: partial }));
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, "evidence-partial");
});

test("a run on the developer's host cannot stand in for the containerized run", () => {
  // `node scripts/pipeline.mjs run` works fine outside Docker and is useful while iterating. It does
  // not verify anything for submission purposes: it proves the developer's machine, which is what
  // containerizing CI exists to stop relying on.
  const onHost = { ...passingEvidence(), environment: { containerized: false, node: "v24.15.0" } };
  const verdict = evaluateSubmission(goodFacts({ evidence: onHost }));
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, "evidence-not-containerized");
});

test("a record that does not say 'passed' is not a pass", () => {
  const failed = { ...passingEvidence(), result: "failed" };
  assert.equal(evaluateSubmission(goodFacts({ evidence: failed })).reason, "evidence-not-passed");
});

test("the gate is a pure function of its facts", () => {
  // ADR 0014's property, applied to this module: no invocation may leave state behind for the next.
  const facts = goodFacts();
  const snapshot = JSON.stringify(facts);
  evaluateSubmission(facts);
  evaluateSubmission(goodFacts({ shaAfter: SHA_B }));
  assert.equal(JSON.stringify(facts), snapshot, "evaluateSubmission mutated its argument");
  assert.equal(evaluateSubmission(facts).allowed, true, "a later call changed an earlier answer");
});

// --- What the pull request is allowed to claim -------------------------------------------------

test("the pull request block claims local Docker verification and never a GitHub run", () => {
  const block = evidenceBlock(passingEvidence());
  assert.match(block, /Local CI/);
  assert.match(block, /ephemeral Docker container/);
  assert.match(block, new RegExp(SHA_A), "the block does not name the verified commit");
  assert.match(block, /\*\*PASS\*\*/);
  // The prohibition, stated as a test: reporting a success semantics for something that did not
  // happen is the same defect `errors.no-false-success` names, one level up from the code.
  assert.match(block, /not\*{0,2} a GitHub-hosted Actions run/i, "the block does not disclaim GitHub Actions");
  assert.doesNotMatch(block, /Actions passed|CI passed on GitHub|checks? passed on GitHub/i);
});

test("the pull request block marks an advisory stage as advisory", () => {
  // A reader scanning the stage list must not read `validate` exiting 1 as a gating failure that
  // somehow shipped, nor as a pass.
  const evidence = passingEvidence();
  evidence.checks.push({ id: "validate", outcome: "advisory-failed", exitCode: 1, gating: false });
  const block = evidenceBlock(evidence);
  assert.match(block, /`validate` — advisory-failed \(exit 1\).*advisory, non-gating/);
});

// --- The submission script may not take shortcuts ----------------------------------------------

test("the submission script pushes an explicit SHA and never commits on the author's behalf", () => {
  const text = withoutComments(read("scripts/submit-pr.ps1"));
  // Pushing by branch name would send whatever the branch points at when git runs, which is exactly
  // the window the SHA comparison exists to close.
  assert.match(text, /git push origin "\$\{shaBefore\}:refs\/heads\/\$branch"/, "the push does not name the verified SHA");
  for (const forbidden of [/git commit/, /git stash/, /--force/, /commit --amend/]) {
    assert.doesNotMatch(text, forbidden, `submit-pr.ps1 contains ${forbidden}`);
  }
  // No token handling of any kind: the developer's existing gh session is used as-is.
  assert.doesNotMatch(text, /GH_TOKEN|GITHUB_TOKEN|gh auth login --with-token/, "submit-pr.ps1 handles a token");
  assert.match(text, /gh auth status/, "submit-pr.ps1 never checks that gh is authenticated");
});

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
import { spawnSync } from "node:child_process";
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

// --- The build context is the commit, not the checkout ------------------------------------------

test("Docker is given a materialised context, never the working directory", () => {
  // The defect this replaced: `context: .` made the run verify one platform's materialisation of
  // the tree rather than the tree. Measured on a373d4c — 273 pass / 1 fail from a CRLF checkout,
  // 274 pass / 0 fail from an LF one, identical committed content — so the gate produced a red the
  // runner did not, and the same mechanism runs the other way.
  const compose = withoutComments(read("compose.ci.yml"));
  assert.match(compose, /context:\s*\$\{CI_CONTEXT:-\.\}/, "the compose build context is not parameterised");

  const ps = withoutComments(read("scripts/ci.ps1"));
  const sh = withoutComments(read("scripts/ci.sh"));
  assert.match(ps, /ci-context\.ps1/, "ci.ps1 does not materialise a context");
  assert.match(ps, /\$env:CI_CONTEXT\s*=\s*\$ContextRoot/, "ci.ps1 does not hand the context to compose");
  assert.match(sh, /ci-context\.sh/, "ci.sh does not materialise a context");
  assert.match(sh, /export CI_CONTEXT="\$context_root"/, "ci.sh does not hand the context to compose");
});

test("the gate that decides submission is built from committed content too", () => {
  // The gate deciding whether a pull request may be opened must not depend on which platform
  // rendered the tree, for the same reason the pipeline must not.
  const text = withoutComments(read("scripts/submit-decide.ps1"));
  assert.match(text, /ci-context\.ps1/, "submit-decide builds from the working directory");
  assert.match(text, /\$env:CI_CONTEXT\s*=\s*\$ContextRoot/, "submit-decide does not hand the context to compose");
  assert.match(text, /finally\s*\{[\s\S]*Remove-Item \$ContextRoot/, "submit-decide leaves its context behind");
});

test("the context is a real repository, not an export", () => {
  // `git archive HEAD` would give committed file content and no repository. scripts/repository.mjs
  // asks git which paths are tracked and ignored, what blob identity a reviewed path has at HEAD,
  // and whether a reviewed path is dirty — with no fallback, deliberately. An export plus a
  // synthesised repository would answer those from something that is not the repository, trading
  // this defect for ADR 0008's.
  for (const file of ["scripts/ci-context.ps1", "scripts/ci-context.sh"]) {
    const text = withoutComments(read(file));
    // Spelled two ways — `git clone …` in the shell twin, `@('clone', …)` in the PowerShell one —
    // so the assertion is on the subcommand rather than on one file's calling convention.
    assert.match(text, /(?:^|\W)clone(?:\W|$)/, `${file} does not clone the repository`);
    assert.match(text, /--no-checkout/, `${file} materialises files before pinning how they materialise`);
    assert.doesNotMatch(text, /\barchive\b/, `${file} exports a tree instead of cloning a repository`);
    assert.match(text, /--no-hardlinks/, `${file} shares object storage with a directory that can change`);
  }
});

test("the context's checkout attributes are pinned rather than inherited from the host", () => {
  // The whole point. A context materialised under the host's `core.autocrlf` would reproduce the
  // defect inside the fix.
  for (const file of ["scripts/ci-context.ps1", "scripts/ci-context.sh"]) {
    const text = withoutComments(read(file));
    assert.match(text, /core\.autocrlf=false/, `${file} inherits the host's line-ending conversion`);
    assert.match(text, /core\.eol=lf/, `${file} does not pin the materialised line ending`);
  }
});

test("the context is confirmed to be the commit that was asked for", () => {
  // A context that silently landed on another revision would produce a record naming a commit
  // nobody asked to verify, and the submission SHA comparison would compare two wrong things that
  // agree with each other.
  for (const file of ["scripts/ci-context.ps1", "scripts/ci-context.sh"]) {
    const text = withoutComments(read(file));
    assert.match(text, /rev-parse['", ]+HEAD/, `${file} never reads the commit it materialised`);
    assert.match(text, /materialised/i, `${file} does not confirm what it materialised`);
  }
});

test("a dirty tree is refused before anything is verified", () => {
  // Once the context is committed content, an uncommitted edit is invisible to the run — a pass
  // would describe a tree the developer is not looking at, which is the false-success class
  // `errors.no-false-success` names. Submission already refused a dirty tree; this moves the same
  // requirement to the point where it first has consequences.
  for (const file of ["scripts/ci-context.ps1", "scripts/ci-context.sh"]) {
    const text = withoutComments(read(file));
    assert.match(text, /status['", ]+--porcelain/, `${file} does not check for uncommitted changes`);
    assert.match(text, /uncommitted changes/, `${file} does not name the cause`);
  }
});

test("the context is removed by exact path and never by a sweep of the temp directory", () => {
  // The same rule as container teardown: this can remove what this run created and nothing else.
  for (const file of ["scripts/ci.ps1", "scripts/ci.sh", "scripts/verify-materialisation.ps1"]) {
    const text = withoutComments(read(file));
    assert.doesNotMatch(text, /Remove-Item[^\n]*\*/, `${file} removes temp paths by wildcard`);
    assert.doesNotMatch(text, /rm -rf[^\n]*\*/, `${file} removes temp paths by wildcard`);
  }
  assert.match(withoutComments(read("scripts/ci.ps1")), /Remove-CiContext/, "ci.ps1 leaves its context behind");
  assert.match(withoutComments(read("scripts/ci.sh")), /rm -rf "\$context_root"/, "ci.sh leaves its context behind");
});

test("moving the context out of the working tree did not open a hole in the container", () => {
  // The fix had to make the input deterministic without weakening what #27 established. The context
  // is built on the host and copied in; nothing was mounted to compensate afterwards.
  const compose = withoutComments(read("compose.ci.yml"));
  assert.doesNotMatch(compose, /^\s*volumes:/m, "a volume appeared alongside the context change");
  assert.doesNotMatch(compose, /docker\.sock/, "the Docker socket is exposed");
  assert.match(compose, /network_mode:\s*none/, "the CI container gained network access");
  for (const file of ["scripts/ci-context.ps1", "scripts/ci-context.sh"]) {
    const text = withoutComments(read(file));
    // The context builder is a git operation and nothing else. If it ever needs to talk to Docker —
    // to mount, to bind, to reach back at the host — the isolation argument has changed and should
    // be re-argued rather than absorbed.
    assert.doesNotMatch(text, /\bdocker\b/i, `${file} touches Docker at all`);
  }
});

test("the tree a verifying run executes is the committed tree, byte for byte", (t) => {
  // The invariant, asserted from inside the run rather than from the shape of the scripts that set
  // it up. Everything else in this section is a text assertion about ci.ps1 and compose.ci.yml; this
  // is the one check that would notice if all of that were wired correctly and still delivered the
  // wrong bytes.
  //
  // It is also what makes the cross-materialisation harness non-vacuous. That harness proves two
  // checkouts agree, and two checkouts agree trivially when nothing in the suite can tell them
  // apart. This can: under the old `COPY .` behaviour a CRLF checkout fails here and an LF one does
  // not, which is exactly the divergence the harness needs to be able to observe.
  //
  // Deliberately scoped to runs that make verification claims. On a developer's Windows host the
  // working tree legitimately is not the committed bytes — that is what `core.autocrlf` does — and
  // failing `npm test` there would be reporting a checkout convention as a defect. Skipped with a
  // reason rather than silently passing, because a check that quietly does nothing is the failure
  // this repository names most often.
  const verifying = process.env.LOCAL_CI_CONTAINER === "1" || process.env.GITHUB_ACTIONS === "true";
  if (!verifying) {
    t.skip("not a verifying run — the host checkout's byte representation is its own business");
    return;
  }

  const git = (args, input) =>
    spawnSync("git", ["-C", ROOT, ...args], { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024 });

  // Committed identity for every regular file at HEAD. Modes other than 100644/100755 — symlinks,
  // gitlinks — are excluded because their working-tree representation is not their blob content.
  const tree = git(["ls-tree", "-r", "-z", "HEAD"]);
  assert.equal(tree.status, 0, "git could not read the tree at HEAD");
  const committed = new Map();
  for (const entry of tree.stdout.split("\0").filter(Boolean)) {
    const m = entry.match(/^(\d{6}) blob ([0-9a-f]{40})\t(.*)$/);
    if (m && (m[1] === "100644" || m[1] === "100755")) committed.set(m[3], m[2]);
  }
  assert.ok(committed.size > 100, `only ${committed.size} committed files found — has the tree shape changed?`);

  // Identity of the bytes actually on disk. `--no-filters` is the whole point: it hashes the file as
  // it lies there, without re-applying the normalisation that makes git call a CRLF checkout clean.
  // One process for every path rather than one process per path.
  const paths = [...committed.keys()];
  const onDisk = git(["hash-object", "--no-filters", "--stdin-paths"], `${paths.join("\n")}\n`);
  assert.equal(onDisk.status, 0, `git could not hash the working tree: ${onDisk.stderr}`);
  const hashes = onDisk.stdout.split("\n").filter(Boolean);
  assert.equal(hashes.length, paths.length, "git hashed a different number of files than were asked about");

  const differing = paths.filter((rel, i) => hashes[i] !== committed.get(rel));
  assert.deepEqual(
    differing.slice(0, 10),
    [],
    `${differing.length} file(s) on disk differ from their committed content. This run is verifying a ` +
      "materialisation of the commit rather than the commit — see ADR 0015.",
  );
});

test("the cross-materialisation falsifier can fail, and says so in both directions", () => {
  // The acceptance test is only worth its runtime if it can fail. `-Mutate` restores the
  // host-context defect and inverts the verdict: agreement under the defect is reported as the
  // check being incapable, not as a pass. This asserts the harness keeps both halves — a falsifier
  // quietly reduced to a one-way check is the failure mode.
  const text = read("scripts/verify-materialisation.ps1");
  const active = withoutComments(text);
  assert.match(active, /\[switch\]\s*\$Mutate/, "the falsifier has no mutation mode");
  assert.match(active, /FALSIFIER FAILED/, "agreement under the defect is not reported as a failure");
  assert.match(active, /the two checkouts materialised identical bytes/, "the harness does not verify the inputs differ");
  // The comparison must cover more than the exit code: a run can agree on pass/fail while
  // disagreeing about what it verified.
  for (const field of ["verified commit", "stage outcomes", "validate", "audit"]) {
    assert.ok(active.includes(field), `the falsifier does not compare ${field}`);
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

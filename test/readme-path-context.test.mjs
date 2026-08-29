/**
 * A leading `./` names a working directory, and a README need not establish one.
 *
 * Issue #4 was filed as a base-resolution defect — document-relative versus root-relative — and the
 * measurement against the adopter falsifies that framing. Both reported paths came from inline code
 * spans; neither came from the fenced command block the issue names as the cause, and deleting both
 * fences changes the output not at all. The triggers at ReleasePilot `f94dbe0` are exactly:
 *
 *   README.md:33   "For backend development: JDK 21 (the Maven Wrapper ./mvnw bootstraps Maven itself)."
 *   README.md:126  "Kubernetes manifests: deploy/k8s (kustomize base + overlays/prod)." — where the
 *                  first of those is a markdown link and the second a bare code span.
 *
 * (Both are written here without backticks or link syntax on purpose: this file is itself checked
 * for broken links, and quoting the specimen faithfully would make the test suite report it.)
 *
 * Line 33 sits under `## Prerequisites`, forty lines from the `from ./backend` comment and under a
 * different heading, so no working directory is established for it. `./mvnw` therefore has no base
 * this run can resolve, and joining it to the repository root fabricates one.
 *
 * Only that correction is implemented. `overlays/prod` stays reported, because the only thing
 * suggesting `deploy/k8s` as its base is an adjacent link, and no contract states that proximity
 * establishes a base. Resolving it would be inference dressed as measurement, so the finding stands
 * and the remaining ambiguity is the owner's to adjudicate.
 *
 * Both directions are asserted throughout. The withdrawal tests are paired with the cases that must
 * still fail, because a check that resolves eagerly enough to always succeed has stopped being a
 * check — and the last test is the one that keeps this honest: withdrawing an ambiguous token must
 * not launder a real broken path standing beside it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");

const RULE = "documentation.code-consistency";

/** Ample enough that nothing in these small fixtures goes unread, so no coarse withdrawal fires. */
const AMPLE = 8_000_000;

const POLICY = [
  'standardVersion: "2.0.0"',
  'project: "README path context fixture"',
  "rules:",
  "  documentation.code-consistency:",
  "    level: required",
  "",
].join("\n");

function cli(command, dir) {
  const r = spawnSync(
    process.execPath,
    [CLI, command, `--dir=${dir}`, "--json", `--max-total-read-bytes=${AMPLE}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    return assert.fail(
      `${command} stdout was not JSON.\nstatus: ${r.status}\nstderr: ${r.stderr.slice(0, 2000)}`,
    );
  }
}

const evidenceOf = (json) =>
  (json.findings ?? []).filter((f) => f.rule === RULE).flatMap((f) => f.evidence ?? []);

const resultFor = (json) => {
  const r = (json.results ?? []).find((x) => x.ruleId === RULE);
  assert.ok(r, `no result for ${RULE}; the policy fixture did not declare it`);
  return r;
};

/**
 * A real tree, because the check is `existsSync` and a stub over it would test the stub. `src/` and
 * `deploy/k8s/overlays/prod` exist in every fixture so that each README below differs only in what
 * it says, never in what is there.
 */
async function withReadme(readme, fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "readme-path-"));
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await mkdir(path.join(root, "deploy", "k8s", "overlays", "prod"), { recursive: true });
    await mkdir(path.join(root, "backend"), { recursive: true });
    await writeFile(path.join(root, "src", "index.ts"), "export const x = 1;\n");
    await writeFile(path.join(root, "backend", "mvnw"), "#!/bin/sh\n");
    await mkdir(path.join(root, ".github", "workflows"), { recursive: true });
    await writeFile(path.join(root, ".github", "workflows", "ci.yml"), "on: push\n");
    await writeFile(path.join(root, "README.md"), readme);
    await writeFile(path.join(root, "project-policy.yml"), POLICY);
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** The disposition an unresolvable base requires: withdrawn, not passed and not failed. */
function assertNotEvaluated(json) {
  const r = resultFor(json);
  assert.equal(
    r.disposition,
    "not-evaluated",
    `${RULE} reported disposition "${r.disposition}" (status ${r.status}) over a base it could not resolve`,
  );
  assert.equal(r.status, "skipped", `${RULE} must not carry a scored status when the base is unavailable`);
}

// --- The measured specimen ----------------------------------------------------------------------

test("a cwd-relative token in prose that establishes no working directory is not a missing file", async () => {
  const readme = [
    "# Fixture",
    "",
    "## Prerequisites",
    "",
    "- For backend development: JDK 21 (the Maven Wrapper `./mvnw` bootstraps Maven itself).",
    "",
  ].join("\n");
  await withReadme(readme, (root) => {
    assert.deepEqual(
      evidenceOf(cli("audit", root)),
      [],
      "`./mvnw` was reported missing against a document that never claimed it sits at the root",
    );
    assertNotEvaluated(cli("validate", root));
  });
});

test("the coverage cost is recorded: a broken cwd-relative token withdraws identically", async () => {
  // Deliberately the same shape with a path that genuinely does not exist anywhere. It must behave
  // exactly as the case above, because the run cannot tell them apart without a base — and that is
  // the price of refusing to guess one, stated here rather than discovered by an adopter later.
  const readme = ["# Fixture", "", "Run `./does-not-exist` to begin.", ""].join("\n");
  await withReadme(readme, (root) => {
    assert.deepEqual(
      evidenceOf(cli("audit", root)),
      [],
      "a cwd-relative token was resolved against the root after all",
    );
    assertNotEvaluated(cli("validate", root));
  });
});

// --- The directions that must still work ---------------------------------------------------------

test("ordinary root-scoped paths still pass and still fail", async () => {
  const readme = [
    "# Fixture",
    "",
    "Present: `src/index.ts`.",
    "Absent: `src/nope.ts`.",
    "",
  ].join("\n");
  await withReadme(readme, (root) => {
    const json = cli("audit", root);
    assert.deepEqual(
      evidenceOf(json),
      ["README.md -> src/nope.ts"],
      "a root-relative path stopped being checked against the root",
    );
    assert.equal(resultFor(cli("validate", root)).disposition, "evaluated");
  });
});

test("a dot-prefixed root path is a root claim and is still checked", async () => {
  // The guard keys on `./`, not on a leading dot, and this is the test that holds the difference.
  // `.github/workflows/ci.yml` is an ordinary root-relative claim that happens to start with a dot;
  // withdrawing it would silently stop checking every dotfile path a README names. Found by a
  // surviving mutant (`startsWith(".")`), not by review.
  const readme = [
    "# Fixture",
    "",
    "CI lives in `.github/workflows/ci.yml`.",
    "Gone: `.github/workflows/nope.yml`.",
    "",
  ].join("\n");
  await withReadme(readme, (root) => {
    assert.deepEqual(
      evidenceOf(cli("audit", root)),
      ["README.md -> .github/workflows/nope.yml"],
      "a dot-prefixed root-relative path stopped being checked against the root",
    );
  });
});

test("an HTTP route is still not a missing file (78f3afb)", async () => {
  const readme = [
    "# Fixture",
    "",
    "The API is served at `/api/v1/users` and health at `/actuator`.",
    "",
  ].join("\n");
  await withReadme(readme, (root) => {
    assert.deepEqual(evidenceOf(cli("audit", root)), [], "a route was read as a repository path");
  });
});

test("a nearby link does not establish a base for an ambiguous sibling token", async () => {
  // `deploy/k8s/overlays/prod` exists in the fixture, so resolving `overlays/prod` against the
  // linked directory would make this pass. It must not: nothing states that a link one clause away
  // is a base, and a detector that inferred it would be guessing in the direction of silence.
  const readme = [
    "# Fixture",
    "",
    "- Kubernetes manifests: [`deploy/k8s`](deploy/k8s) (kustomize base + `overlays/prod`).",
    "",
  ].join("\n");
  await withReadme(readme, (root) => {
    assert.deepEqual(
      evidenceOf(cli("audit", root)),
      ["README.md -> overlays/prod"],
      "the detector resolved a token by proximity to a link, which no contract states",
    );
  });
});

// --- Anti-vacuity: the withdrawal must not launder a real finding ---------------------------------

test("an ambiguous token withdraws without taking a confirmed violation with it", async () => {
  // ReleasePilot's exact shape, and the case that decides whether this change is safe. The token
  // scan reports one unknown check and one real breakage from the same file; the rule must stay
  // failed and keep the finding it established, or a single `./x` anywhere in a README would become
  // a way to silence every broken path beside it.
  const readme = [
    "# Fixture",
    "",
    "- For backend development: the Maven Wrapper `./mvnw` bootstraps Maven itself.",
    "- Manifests: [`deploy/k8s`](deploy/k8s) (kustomize base + `overlays/prod`).",
    "",
  ].join("\n");
  await withReadme(readme, (root) => {
    assert.deepEqual(
      evidenceOf(cli("audit", root)),
      ["README.md -> overlays/prod"],
      "the confirmed violation was withdrawn along with the ambiguous token",
    );
    const r = resultFor(cli("validate", root));
    assert.equal(r.disposition, "evaluated", "a rule with a confirmed violation withdrew wholesale");
    assert.equal(r.status, "failed", "the confirmed violation stopped being scored");
  });
});

// --- The remediation contract ---------------------------------------------------------------------
//
// The second half of issue #4 is not a path-resolution defect. `overlays/prod` cannot be resolved
// without semantic proximity inference that no contract states, so it stays reported — but the
// instruction under it presumed a conclusion the run never reached. A rule that is required,
// structurally evaluated and non-attestable leaves an adopter no truthful way to disagree with a
// wrong instruction, which is measured directly below.

const REMEDIATION_CATALOG =
  "Correct the document, or remove the wrong claim. Do not leave it with a caveat.";

test("an unresolvable base is reported, and does not pass by proximity to a link", async () => {
  const readme = [
    "# Fixture",
    "",
    "- Kubernetes manifests: [`deploy/k8s`](deploy/k8s) (kustomize base + `overlays/prod`).",
    "",
  ].join("\n");
  await withReadme(readme, (root) => {
    assert.deepEqual(evidenceOf(cli("audit", root)), ["README.md -> overlays/prod"]);
    const r = resultFor(cli("validate", root));
    assert.equal(r.status, "failed", "an unresolvable token stopped failing the rule");
    assert.equal(r.disposition, "evaluated");
  });
});

test("an unresolvable base does not instruct a content change", async () => {
  const readme = [
    "# Fixture",
    "",
    "- Kubernetes manifests: [`deploy/k8s`](deploy/k8s) (kustomize base + `overlays/prod`).",
    "",
  ].join("\n");
  await withReadme(readme, (root) => {
    const r = resultFor(cli("validate", root));
    assert.notEqual(
      r.remediation,
      REMEDIATION_CATALOG,
      "an adopter is still told to correct a document this run never established was wrong",
    );
    assert.ok(
      !/correct the document/i.test(r.remediation),
      `remediation still instructs a content change: ${r.remediation}`,
    );
    assert.ok(
      !/do not exist/i.test(r.message),
      `the message still asserts non-existence the run did not establish: ${r.message}`,
    );
  });
});

test("a missing path under a corroborated base still gets actionable remediation", async () => {
  // The direction that keeps the change honest. `src/` exists, so the run did resolve the base the
  // document implied and the leaf really is absent — the catalog's instruction is correct here and
  // must survive untouched.
  const readme = ["# Fixture", "", "Absent: `src/nope.ts`.", ""].join("\n");
  await withReadme(readme, (root) => {
    const r = resultFor(cli("validate", root));
    assert.equal(r.status, "failed");
    assert.equal(
      r.remediation,
      REMEDIATION_CATALOG,
      "the ordinary stale-documentation case lost its actionable remediation",
    );
    assert.ok(/do not exist/.test(r.message), "the established case stopped saying what it observed");
  });
});

test("a deleted directory tree is still detected, not softened into silence", async () => {
  // The constraint that rejected the alternative fix. Withdrawing every token whose parent is absent
  // would stop reporting a whole deleted tree — the stale-documentation case this rule exists for.
  // Detection must be identical; only the sentence and the instruction differ.
  const readme = [
    "# Fixture",
    "",
    "See `docs/api.md`, `docs/erd.md` and `docs/threat-model.md`.",
    "",
  ].join("\n");
  await withReadme(readme, (root) => {
    assert.deepEqual(
      evidenceOf(cli("audit", root)).sort(),
      ["README.md -> docs/api.md", "README.md -> docs/erd.md", "README.md -> docs/threat-model.md"],
      "a deleted directory tree stopped being reported",
    );
    const r = resultFor(cli("validate", root));
    assert.equal(r.status, "failed", "a deleted directory tree stopped failing the rule");
  });
});

test("both classes in one README keep the established violation in front", async () => {
  const readme = [
    "# Fixture",
    "",
    "Absent: `src/nope.ts`.",
    "- Manifests: [`deploy/k8s`](deploy/k8s) (kustomize base + `overlays/prod`).",
    "",
  ].join("\n");
  await withReadme(readme, (root) => {
    const r = resultFor(cli("validate", root));
    assert.equal(
      r.remediation,
      REMEDIATION_CATALOG,
      "an ambiguous token displaced the actionable instruction for a real one",
    );
    assert.deepEqual(
      evidenceOf(cli("audit", root)).sort(),
      ["README.md -> overlays/prod", "README.md -> src/nope.ts"],
      "one class of finding swallowed the other's evidence",
    );
  });
});

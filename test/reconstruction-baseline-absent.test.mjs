/**
 * Issue #63: an absent baseline directory is not a satisfied reconstruction rule.
 *
 * THE DEFECT. Every check in `detectStandardsViolations` sat inside `if (has("artifacts/project-
 * baseline"))`, so a repository with no baseline directory produced no violation and the rule was
 * reported `passed / evaluated`. The verdict was monotone in the wrong direction: create the directory
 * and the result got worse, delete it and the result got better. Measured on the issue's own fixture —
 * `src/index.ts`, `package.json`, `README.md` — which `init` classifies reconstruction-required.
 *
 * WHAT IS ASSERTED, AND WHAT IS DELIBERATELY NOT. Absent is `skipped / not-evaluated`, never `passed`.
 * It is also never `failed`: this rule does not distinguish a greenfield project from one that needs
 * reconstruction, because the only classifier that separates them is `init`'s INFERRED mode, which no
 * detector may consume (#32, ADR 0008). The implemented-repository case therefore asserts the SAME
 * result as the bare case — identical bytes are the evidence that no classification was consulted,
 * the same property `test/remediation-state.test.mjs` buys for remediation text. `init` is not run
 * here for the same reason: these fixtures must not depend on what `init` concludes.
 *
 * CONTROLS, EACH POINTING THE OTHER WAY. A mechanism that withdrew the rule whenever anything looked
 * unusual would pass both absent cases and fail all three controls: a partially-present directory
 * still fails R4, a prompt without its declaration still fails R6, and a complete baseline still
 * passes — the last one is what proves the rule can pass at all.
 *
 * NOT DUPLICATED HERE: a prompt the run could not read. That is #38's mixed case — R4 established,
 * R6 unknown, the established failure kept — and it is pinned in `test/evidence-availability.test.mjs`
 * ("reconstruction.baseline-artifacts cannot report a missing declaration it never opened", "an
 * established violation survives beside an unknown check on the same rule", and "a starved run
 * reaches no verdict that needed content, in either polarity").
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");

const RULE = "reconstruction.baseline-artifacts";
const BASELINE = "artifacts/project-baseline";

/** Comfortably above every fixture, so no result below can be a read-budget withdrawal. */
const AMPLE = 64 * 1024 * 1024;

const POLICY = [
  'standardVersion: "2.0.0"',
  'project: "Reconstruction baseline absence fixture"',
  "rules:",
  `  ${RULE}:`,
  "    level: required",
  "",
].join("\n");

const README =
  "# Legacy service\n\nAn existing codebase with an implementation and no reconstruction artifacts, " +
  "written long enough that nothing about its length is under measurement here.\n";

/** The issue's fixture: implementation markers present, no baseline in any form. */
const IMPLEMENTED = {
  "README.md": README,
  "src/index.ts": "export const x = 1;\n",
  "package.json": '{"name":"legacy","version":"1.0.0"}\n',
};

const PROMPT_DECLARED =
  "# Reconstructed prompt\n\nThis prompt was reconstructed from the existing codebase, not recorded.\n";
const PROMPT_UNDECLARED = "# Prompt\n\nBuild a service that does the thing.\n";
const BASELINE_BODY = "# Reconstructed baseline\n\n## Observed\n\n- A service exists in src/. [OBSERVED]\n";

/** A committed first-party repository, so no exclusion boundary can be what decides a result. */
async function withRepo(files, fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "reconstruction-baseline-absent-"));
  try {
    const git = (...args) => {
      const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
    };
    git("init", "-q");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "test");
    for (const [rel, body] of Object.entries(files)) {
      const full = path.join(root, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
    }
    await writeFile(path.join(root, "project-policy.yml"), POLICY);
    git("add", "-A");
    git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

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
    return assert.fail(`${command} stdout was not JSON.\nstatus: ${r.status}\nstderr: ${r.stderr.slice(0, 2000)}`);
  }
}

const resultFor = (json) => {
  const r = (json.results ?? []).find((x) => x.ruleId === RULE);
  assert.ok(r, `no result for ${RULE}; the policy fixture did not declare it`);
  return r;
};

const boundFindings = (json) => (json.findings ?? []).filter((f) => f.rule === RULE);

/**
 * Run the absent case and assert everything it must satisfy. Returns the rule's result for comparison.
 *
 * The evidence surface is asserted complete first. Without that, a `not-evaluated` here could be the
 * unread-evidence mechanism firing for some other reason, and the test would pass for the wrong one.
 */
function assertAbsentWithdrawn(root) {
  assert.equal(existsSync(path.join(root, BASELINE)), false, `the fixture has ${BASELINE}/, so it is not the absent case`);
  assert.equal(
    cli("audit", root).evidenceSurface.complete,
    true,
    "the run did not read everything, so a withdrawal here could be evidence loss rather than absence",
  );

  const json = cli("validate", root);
  const r = resultFor(json);
  assert.notEqual(
    r.status,
    "passed",
    `${RULE} reported passed with no ${BASELINE}/ at all — the run established nothing about baseline artifacts`,
  );
  assert.equal(r.status, "skipped", `expected skipped, got ${r.status} (${r.disposition}): ${r.message}`);
  assert.equal(r.disposition, "not-evaluated");
  assert.deepEqual(r.evidence, [], "a withdrawn rule must rest on no evidence");
  assert.deepEqual(boundFindings(json), [], "absence produced a violation, which asserts reconstruction was required");
  return r;
}

// ------------------------------------------------------------------------------- absent

test("absent: no baseline directory is not a pass", async () => {
  await withRepo({ "README.md": README }, (root) => {
    assertAbsentWithdrawn(root);
  });
});

test("absent in an implemented repository: the same result, because nothing classifies the repository", async () => {
  const bare = await withRepo({ "README.md": README }, (root) => assertAbsentWithdrawn(root));
  const implemented = await withRepo(IMPLEMENTED, (root) => {
    // Anti-vacuity: the fixture really carries the markers the issue's fixture carries.
    for (const marker of ["src/index.ts", "package.json"]) {
      assert.ok(existsSync(path.join(root, marker)), `the implemented fixture lacks ${marker}`);
    }
    return assertAbsentWithdrawn(root);
  });
  assert.deepEqual(implemented, bare, "the rule's result varied with implementation presence");
});

// ----------------------------------------------------------------------------- controls

test("incomplete: a baseline directory without reconstructed-baseline.md still fails R4", async () => {
  await withRepo({ ...IMPLEMENTED, [`${BASELINE}/open-questions.md`]: "# Open questions\n\nNone yet.\n" }, (root) => {
    const json = cli("validate", root);
    const r = resultFor(json);
    assert.equal(r.status, "failed", `expected failed, got ${r.status} (${r.disposition}): ${r.message}`);
    assert.equal(r.disposition, "evaluated");
    const found = boundFindings(json);
    assert.equal(found.length, 1, `expected the R4 finding alone, got ${JSON.stringify(found.map((f) => f.message))}`);
    assert.match(found[0].message, /^R4:/);
  });
});

test("incomplete: a prompt without its reconstruction declaration still fails R6", async () => {
  await withRepo(
    {
      ...IMPLEMENTED,
      [`${BASELINE}/reconstructed-baseline.md`]: BASELINE_BODY,
      [`${BASELINE}/RECONSTRUCTED-PROMPT.md`]: PROMPT_UNDECLARED,
    },
    (root) => {
      const json = cli("validate", root);
      const r = resultFor(json);
      assert.equal(r.status, "failed", `expected failed, got ${r.status} (${r.disposition}): ${r.message}`);
      assert.equal(r.disposition, "evaluated");
      const found = boundFindings(json);
      assert.equal(found.length, 1, `expected the R6 finding alone, got ${JSON.stringify(found.map((f) => f.message))}`);
      assert.match(found[0].message, /^R6:/);
    },
  );
});

test("sufficient: a complete, self-declaring baseline still passes", async () => {
  // The honest control. Without it, a rule that could no longer pass at all would satisfy every
  // assertion above that says it must not pass.
  await withRepo(
    {
      ...IMPLEMENTED,
      [`${BASELINE}/reconstructed-baseline.md`]: BASELINE_BODY,
      [`${BASELINE}/RECONSTRUCTED-PROMPT.md`]: PROMPT_DECLARED,
    },
    (root) => {
      const json = cli("validate", root);
      const r = resultFor(json);
      assert.equal(r.status, "passed", `expected passed, got ${r.status} (${r.disposition}): ${r.message}`);
      assert.equal(r.disposition, "evaluated");
      assert.deepEqual(boundFindings(json), []);
    },
  );
});

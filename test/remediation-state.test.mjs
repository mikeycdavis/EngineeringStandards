/**
 * Remediation states its prerequisite as a condition, and claims no branch.
 *
 * Issue #32's specimen: `planning.breakdown-directory` emitted the same bytes in two repository
 * states that `scripts/init.mjs` itself distinguishes — one where "run /plan-structure and
 * /plan-handoff" is the whole repair, and one where `init`'s own next step reads "Do NOT author a
 * plan as though this project were starting now."
 *
 * The measurement that decided the fix: following that advice in the second state moved the
 * repository from `reconstruction-required` to `existing-with-plan`, whose next step is to
 * *preserve* the plan just written, and flipped the finding to `passed`. The advice erased the
 * evidence that it had been wrong, which is why this is not a presentation defect.
 *
 * Neither `audit` nor `validate` computes the repository's mode — `detectMode` has one caller, in
 * `init` — so the remediation cannot be specialised per state without giving a detector a
 * dependency on an INFERRED classification of intent. Instead both remediations state the
 * prerequisite conditionally and say outright that the run has not established which branch holds.
 * That text is true in every state, so it needs no signal and asserts none (Standard 27 R6).
 *
 * Every fixture is a real repository run through the real `init` and the real `validate`. Asserting
 * the catalog strings directly would pass while the emitted envelope said something else, which is
 * the layer the defect lived in.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CLI = path.join(ROOT, "scripts", "standards.mjs");
const AMPLE = 8_000_000;

const PLAN_RULE = "planning.breakdown-directory";
const MANIFEST_RULE = "architecture.project-manifest";

/** Long enough that `documentation.architecture` does not fire and clutter the comparison. */
const README =
  "# Fixture\n\nA repository built for one test, with a README long enough to clear the " +
  "four-hundred character threshold the documentation rule applies, so that the only thing under " +
  "measurement is the remediation text for the planning and manifest rules rather than an " +
  "unrelated finding about documentation that would say nothing about the question being asked " +
  "here, which is whether two repository states receive advice that is safe in both of them.\n";

function cli(args, dir) {
  const r = spawnSync(process.execPath, [CLI, ...args, `--dir=${dir}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  return r;
}

/**
 * Build a repository in one of the two states, bootstrap it, and return what `validate` emitted.
 *
 * `implemented` is the whole difference between the fixtures: implementation markers with no plan
 * and no prompt is what `init` classifies as reconstruction-required.
 */
async function withState(implemented, fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "remediation-state-"));
  try {
    await writeFile(path.join(root, "README.md"), README);
    if (implemented) {
      await mkdir(path.join(root, "src"), { recursive: true });
      await writeFile(path.join(root, "src", "index.ts"), "export const x = 1;\n");
      await writeFile(path.join(root, "package.json"), '{"name":"legacy","version":"1.0.0"}\n');
    }
    const init = cli(["init"], root);
    assert.equal(init.status, 0, `init failed: ${init.stderr}`);

    const run = cli(["validate", ".", "--json", `--max-total-read-bytes=${AMPLE}`], root);
    let json;
    try {
      json = JSON.parse(run.stdout);
    } catch {
      return assert.fail(`validate stdout was not JSON.\nstderr: ${run.stderr.slice(0, 2000)}`);
    }
    const byRule = new Map(json.results.map((r) => [r.ruleId, r]));
    return await fn({ root, initOutput: init.stdout, byRule });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// --------------------------------------------------------------- the fixtures are the two states

test("the fixtures really are the two states init distinguishes", async () => {
  // Anti-vacuity for everything below. If both fixtures landed in the same mode, every assertion
  // about "two states" would be an assertion about one.
  await withState(true, ({ initOutput }) => {
    assert.match(initOutput, /Mode: reconstruction-required/);
    assert.match(initOutput, /Do NOT author a plan/);
  });
  await withState(false, ({ initOutput }) => {
    assert.match(initOutput, /Mode: greenfield/);
    assert.doesNotMatch(initOutput, /Do NOT author a plan/);
  });
});

test("both rules actually fail in both states", async () => {
  // The second half of anti-vacuity: a remediation assertion over a rule nobody evaluated proves
  // nothing, and both of these rules pass as soon as a fixture is built slightly differently.
  for (const implemented of [true, false]) {
    await withState(implemented, ({ byRule }) => {
      for (const id of [PLAN_RULE, MANIFEST_RULE]) {
        assert.equal(byRule.get(id)?.status, "failed", `${id} did not fail (implemented=${implemented})`);
      }
    });
  }
});

// ------------------------------------------------- falsifier 1: greenfield stays actionable

test("greenfield remediation still names the skills and the destination", async () => {
  await withState(false, ({ byRule }) => {
    const text = byRule.get(PLAN_RULE).remediation;
    assert.match(text, /\/plan-structure and \/plan-handoff/);
    assert.match(text, /artifacts\/project-plan-breakdown\//);
  });
});

// ------------------------ falsifier 2: plan authoring is never the first unconditional action

test("plan authoring is never the first unconditional instruction", async () => {
  await withState(true, ({ byRule }) => {
    const text = byRule.get(PLAN_RULE).remediation;
    assert.doesNotMatch(
      text,
      /^\s*Run \/plan-structure/,
      "the remediation opens by telling a reconstruction-state project to author a plan",
    );
    const reconstruct = text.indexOf("project-reconstruction");
    const author = text.search(/Otherwise run \/plan-structure/);
    assert.ok(reconstruct >= 0, "reconstruction is not mentioned at all");
    assert.ok(author >= 0, "the ordinary repair is not offered at all");
    assert.ok(
      reconstruct < author,
      "a reader following the text in order would author the plan before reconstructing",
    );
  });
});

// ---------------- falsifier 3: following the text cannot erase the evidence, and claims no branch

test("the remediation states a condition and refuses to say which branch holds", async () => {
  // The self-concealing failure is what this guards. Advice that asserted "you are greenfield"
  // would, when wrong, be executed and then be unfalsifiable — the act of following it moves the
  // repository to `existing-with-plan` and the finding to `passed`.
  for (const implemented of [true, false]) {
    await withState(implemented, ({ byRule }) => {
      const text = byRule.get(PLAN_RULE).remediation;
      assert.match(text, /^If this project already has an implementation and has not been reconstructed/);
      assert.match(text, /has not established which of the two holds/);
    });
  }
});

test("the same bytes are emitted in both states, which is the property being bought", async () => {
  // Not incidental. Text that varied by state would mean something computed the state, and nothing
  // on this path may (Standard 27 R6; ADR 0008).
  const seen = [];
  for (const implemented of [true, false]) {
    await withState(implemented, ({ byRule }) => {
      seen.push([byRule.get(PLAN_RULE).remediation, byRule.get(MANIFEST_RULE).remediation]);
    });
  }
  assert.deepEqual(seen[0], seen[1], "remediation varied by repository state");
});

// ------------------------------- falsifier 4: an existing manifest is never copied over

test("an existing PROJECT.md is never instructed to be copied afresh", async () => {
  await withState(true, ({ byRule, root }) => {
    const text = byRule.get(MANIFEST_RULE).remediation;
    assert.doesNotMatch(
      text,
      /^\s*Copy templates\/PROJECT\.md/,
      "the remediation opens by telling the reader to copy over a file init has already written",
    );
    assert.match(text, /complete it in place rather than copying over it/);
    assert.match(text, /has not established which of the two holds/);
    assert.ok(root, "fixture root missing");
  });
});

test("init really did write the manifest the remediation must not overwrite", async () => {
  // Without this the test above is a claim about a string. The hazard is only real because the file
  // exists by the time the advice is read, and a reader following "copy" would discard their work.
  await withState(true, async ({ root }) => {
    const manifest = await readFile(path.join(root, "PROJECT.md"), "utf8");
    assert.ok(manifest.length > 0, "init did not create PROJECT.md, so there is nothing to overwrite");
  });
});

// -------------------------------- falsifier 5: no detector gains an inferred state dependency

test("no detector depends on init's inferred mode", async () => {
  // `detectMode` labels its answer INFERRED, and #53's precedent permits narrowing remediation on
  // MEASURED state only. Specialising prose is never a good enough reason to route a heuristic
  // classification of intent into the evaluation path — which is the fix this item did not take,
  // pinned here so a later slice has to argue for it rather than drift into it.
  const source = await readFile(path.join(ROOT, "scripts", "standards.mjs"), "utf8");
  assert.doesNotMatch(
    source,
    /\bdetectMode\b/,
    "standards.mjs referenced detectMode; audit and validate must not classify the repository's mode",
  );
});

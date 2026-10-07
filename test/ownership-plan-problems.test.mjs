/**
 * ST-20 (#98) Q1, Q3, Q4: what the ownership check does with plan text the one grammar will not read as a
 * claim. Each of these is a reported problem (or NOT_EVALUATED), never a silent absence and never a claim.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CLASS, checkOwnership, collectPlanOwnership } from "../scripts/ownership.mjs";
import { collectSurface } from "../scripts/standards.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "ownership.mjs");
const PLAN = "artifacts/project-plan-breakdown";
const U = (n) => `https://github.com/o/r/issues/${n}`;

async function scratch(files, snapshot = [1, 2]) {
  const root = await mkdtemp(path.join(tmpdir(), "problems-"));
  const all = { "artifacts/backlog/github-mapping.json": JSON.stringify({ target: "o/r" }), ...files };
  for (const [rel, text] of Object.entries(all)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text, "utf8");
  }
  await writeFile(path.join(root, "issues.json"), JSON.stringify(snapshot), "utf8");
  return root;
}
const cli = (root, ...args) =>
  spawnSync(process.execPath, [SCRIPT, "--root", root, "--issues", path.join(root, "issues.json"), ...args], { encoding: "utf8" });

test("Q1: a Tracked by under a ## section heading is a reported problem; the issue stays unowned, not silently absent", async () => {
  const root = await scratch({ [`${PLAN}/a.md`]: `### Item\n- **Tracked by:** ${U(1)}\n\n## Section\n- **Tracked by:** ${U(2)}\n` });
  try {
    const own = await collectPlanOwnership(root);
    assert.deepEqual(own.claims.map((c) => c.issue), [1]);
    assert.deepEqual(own.problems.map((p) => p.kind), ["plan-claim-outside-item"]);
    const r = cli(root);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /a\.md:5 :: \(after item "Item"\) :: Tracked by is outside a `###` plan item/);
    assert.match(r.stdout, /#2 {2}absent-from-plan/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Q1: a #### heading stays inside the ### item, and the claim keeps the ### title", async () => {
  const root = await scratch({ [`${PLAN}/a.md`]: `### Item\n#### Detail\n- **Tracked by:** ${U(1)}\n` });
  try {
    const own = await collectPlanOwnership(root);
    assert.deepEqual(own.claims, [{ file: `${PLAN}/a.md`, title: "Item", issue: 1 }]);
    assert.deepEqual(own.problems, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Q1: a ## heading is not an item, so it cannot own a claim, and a following ### item still can", async () => {
  const root = await scratch({ [`${PLAN}/a.md`]: `## Section\n- **Tracked by:** ${U(1)}\n### Item\n- **Tracked by:** ${U(2)}\n` });
  try {
    const own = await collectPlanOwnership(root);
    assert.deepEqual(own.claims.map((c) => `${c.issue}@${c.title}`), ["2@Item"]);
    assert.deepEqual(own.problems.map((p) => `${p.kind}@${p.line}`), ["plan-claim-outside-item@2"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Q3: a second Tracked by is a duplicate problem; the first claim survives and the issue is claimed once, not twice", async () => {
  const root = await scratch({ [`${PLAN}/a.md`]: `### Item\n- **Tracked by:** ${U(1)}\n- **Tracked by:** ${U(1)}\n- **TrackedBy:** ${U(2)}\n` });
  try {
    const own = await collectPlanOwnership(root);
    assert.deepEqual(own.claims.map((c) => c.issue), [1]);
    assert.deepEqual(own.problems.map((p) => `${p.kind}@${p.line}`), ["plan-tracked-by-duplicate@3", "plan-tracked-by-duplicate@4"]);
    const result = checkOwnership({ openIssues: [1, 2], claims: own.claims, unscoped: [], planProblems: own.problems });
    assert.equal(result.issues.find((i) => i.number === 1).classification, CLASS.claimedOnce);
    assert.equal(result.issues.find((i) => i.number === 2).classification, CLASS.absent);
    assert.equal(result.ok, false, "a plan problem makes the result not ok");
    assert.equal(result.releaseReady, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a malformed Tracked by is named as malformed, with its line, and exits 1", async () => {
  const root = await scratch({ [`${PLAN}/a.md`]: `### Item\n- **Tracked by - ext:** ${U(1)}\n` }, [1]);
  try {
    const r = cli(root, "--json");
    assert.equal(r.status, 1);
    const json = JSON.parse(r.stdout);
    assert.equal(json.ok, false);
    assert.deepEqual(json.problems.map((p) => [p.kind, p.line]), [["plan-tracked-by-malformed", 2]]);
    assert.equal(json.issues[0].classification, CLASS.absent);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Q4: a plan file in a subdirectory is read, and the JSON issues shape is unchanged", async () => {
  const root = await scratch({ [`${PLAN}/sub/deep/a.md`]: `### Item\n- **Tracked by:** ${U(1)}\n` }, [1]);
  try {
    const r = cli(root, "--json");
    assert.equal(r.status, 0);
    const json = JSON.parse(r.stdout);
    assert.deepEqual(json.issues[0], {
      number: 1,
      classification: CLASS.claimedOnce,
      owners: [{ file: `${PLAN}/sub/deep/a.md`, title: "Item" }],
      releaseEligible: true,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Q4: a plan file over the read cap makes the CLI NOT_EVALUATED (exit 2), not a pass", async () => {
  const big = `### Item\n- **Tracked by:** ${U(1)}\n\n${"filler line\n".repeat(40000)}`;
  const root = await scratch({ [`${PLAN}/a.md`]: big }, [1]);
  try {
    const r = cli(root);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /NOT_EVALUATED: plan files were not fully read/);
    assert.equal(r.stdout, "");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Q4: a repository with no plan directory still evaluates, with no claims and no problems", async () => {
  const root = await scratch({}, [1]);
  try {
    assert.deepEqual(await collectPlanOwnership(root), { claims: [], problems: [] });
    assert.equal(cli(root).status, 1, "the issue is simply absent from the plan");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a ### heading with no title cannot own a claim: reported, never a claim", async () => {
  const root = await scratch({ [`${PLAN}/a.md`]: `### \n- **Tracked by:** ${U(1)}\n` }, [1]);
  try {
    const own = await collectPlanOwnership(root);
    assert.deepEqual(own.claims, []);
    assert.deepEqual(own.problems.map((p) => p.kind), ["plan-claim-untitled-item"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Q4: a plan file the read budget skipped, a capped walk and an unlistable plan directory each end NOT_EVALUATED", async () => {
  const root = await scratch({ [`${PLAN}/a.md`]: `### Item\n- **Tracked by:** ${U(1)}\n` }, [1]);
  try {
    const spent = await collectSurface(root, { maxTotalReadBytes: 1 });
    await assert.rejects(() => collectPlanOwnership(root, { surface: spent }), /a\.md was not read/);

    const capped = await collectSurface(root);
    capped.surfaceLoss.capped = true;
    await assert.rejects(() => collectPlanOwnership(root, { surface: capped }), /file cap/);

    for (const dir of [path.join(root, PLAN), path.join(root, "artifacts"), root]) {
      const unlistable = await collectSurface(root);
      unlistable.surfaceLoss.dirs.push(dir);
      await assert.rejects(() => collectPlanOwnership(root, { surface: unlistable }), /could not be listed/);
    }

    const unrelated = await collectSurface(root);
    unrelated.surfaceLoss.dirs.push(path.join(root, "docs"));
    const own = await collectPlanOwnership(root, { surface: unrelated });
    assert.deepEqual(own.claims.map((c) => c.issue), [1], "an unlistable directory elsewhere does not withhold the plan");

    const whole = await collectSurface(root);
    assert.deepEqual((await collectPlanOwnership(root, { surface: whole })).problems, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

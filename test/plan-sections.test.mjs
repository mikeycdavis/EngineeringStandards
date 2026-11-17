/**
 * ST-27 (#120): `planning.one-file-per-section`, a PARTIAL detector (owner decisions D1 to D3).
 *
 * A clean run is NOT_EVALUATED with assurance `partial`, never a pass. Nested plan files are an
 * unknown (never recursed, never passed). Only the `NN-` ordering convention is accepted. A
 * `README.md` is supporting documentation and never a section file.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { topLevelHeadings } from "../scripts/standards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const PLAN = "artifacts/project-plan-breakdown";
const RULE = "planning.one-file-per-section";
const CAP = 400_000;

const POLICY = [
  'standardVersion: "2.0.0"',
  'project: "Plan sections fixture"',
  "rules:",
  "  planning.breakdown-directory:",
  "    level: required",
  "  planning.one-file-per-section:",
  "    level: required",
  "",
].join("\n");

async function withRepo(files, fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plan-sections-"));
  try {
    const git = (...args) => {
      const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
    };
    git("init", "-q");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "test");
    for (const [rel, body] of Object.entries({ ...files, "project-policy.yml": POLICY })) {
      const full = path.join(root, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
    }
    git("add", "-A");
    git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function validate(dir) {
  const r = spawnSync(process.execPath, [CLI, "validate", `--dir=${dir}`, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    assert.fail(`stdout was not JSON.\nstderr: ${r.stderr.slice(0, 2000)}`);
  }
}
const result = (json) => json.results.find((x) => x.ruleId === RULE);
const findings = (json) => (json.findings ?? []).filter((f) => f.rule === RULE);

const ok = (t) => `# ${t}\n\nBody.\n`;

test("ordered single-heading files give no finding and a partial NOT_EVALUATED, never a pass", async () => {
  await withRepo({ [`${PLAN}/00-overview.md`]: ok("O"), [`${PLAN}/01-a.md`]: ok("A"), [`${PLAN}/02-b.md`]: ok("B") }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    const r = result(j);
    assert.equal(r.status, "skipped");
    assert.equal(r.disposition, "not-evaluated");
    assert.equal(r.assurance, "partial");
    assert.match(r.observedScope, /3 section file\(s\) read whole/);
    assert.ok(r.blindSpots.length >= 2);
    assert.notEqual(r.status, "passed");
  });
});

test("one file with two top-level headings is a violation naming the file and both heading lines", async () => {
  await withRepo({ [`${PLAN}/00-overview.md`]: "# One\n\ntext\n\n# Two\n" }, (dir) => {
    const f = findings(validate(dir)).find((x) => x.id === "plan-section-heading-count");
    assert.ok(f);
    assert.match(f.message, /00-overview\.md/);
    assert.match(f.message, /line 1: # One/);
    assert.match(f.message, /line 5: # Two/);
  });
});

test("two files sharing an ordering number are a violation naming both", async () => {
  await withRepo({ [`${PLAN}/03-a.md`]: ok("A"), [`${PLAN}/03-b.md`]: ok("B") }, (dir) => {
    const f = findings(validate(dir)).find((x) => x.id === "plan-section-number-duplicated");
    assert.deepEqual(f.evidence.sort(), [`${PLAN}/03-a.md`, `${PLAN}/03-b.md`]);
  });
});

test("an unnumbered overview.md is a violation naming the file; a letter prefix is not accepted (D3)", async () => {
  await withRepo({ [`${PLAN}/overview.md`]: ok("O"), [`${PLAN}/a-first.md`]: ok("A"), [`${PLAN}/01-x.md`]: ok("X") }, (dir) => {
    const f = findings(validate(dir)).find((x) => x.id === "plan-section-file-unnumbered");
    assert.deepEqual(f.evidence.sort(), [`${PLAN}/a-first.md`, `${PLAN}/overview.md`]);
  });
});

test("a # line in a fence, in an HTML comment, or a setext underline in a fence is not a heading", () => {
  const text = [
    "# Real",
    "",
    "```",
    "# not a heading",
    "Title",
    "=====",
    "```",
    "<!--",
    "# commented",
    "-->",
    "<!-- # inline -->",
    "",
  ].join("\n");
  assert.deepEqual(topLevelHeadings(text).map((h) => h.line), [1]);
});

test("a setext underline outside a fence is a heading, and ## is not", () => {
  assert.deepEqual(topLevelHeadings("Title\n=====\n\n## Sub\n").map((h) => h.line), [1]);
});

test("README.md is never a section file, with or without an index link", async () => {
  await withRepo({ [`${PLAN}/00-overview.md`]: "# O\n\nSee [r](README.md)\n", [`${PLAN}/README.md`]: "# One\n\n# Two\n" }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).assurance, "partial");
  });
});

test("a plan directory holding only a README yields NOT_EVALUATED with no finding", async () => {
  await withRepo({ [`${PLAN}/README.md`]: "# One\n\n# Two\n" }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
    assert.match(result(j).message, /no section file/);
  });
});

test("a nested plan file is an unknown naming the path: never recursed, never passed (D1)", async () => {
  await withRepo({ [`${PLAN}/00-overview.md`]: ok("O"), [`${PLAN}/phase-1/01-x.md`]: "# A\n\n# B\n" }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
    assert.match(result(j).message, /phase-1\/01-x\.md/);
    assert.notEqual(result(j).assurance, "full");
  });
});

test("a second heading past the read cap is NOT_EVALUATED, while a name-derived violation still stands", async () => {
  const big = `# Big\n\n${"p".repeat(79)}\n`.repeat(1) + `${"p".repeat(79)}\n`.repeat(Math.ceil(CAP / 80)) + "\n# Second\n";
  await withRepo({ [`${PLAN}/00-overview.md`]: ok("O"), [`${PLAN}/01-big.md`]: big }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
    assert.match(result(j).message, /cap/);
  });
  await withRepo({ [`${PLAN}/01-big.md`]: big, [`${PLAN}/01-dup.md`]: ok("D") }, (dir) => {
    const j = validate(dir);
    assert.equal(findings(j).some((f) => f.id === "plan-section-number-duplicated"), true);
    assert.equal(result(j).status, "failed");
  });
});

test("the rule is wired: catalog assurance is partial and the rule is evaluated", async () => {
  const catalog = JSON.parse((await import("node:fs")).readFileSync(path.join(HERE, "..", "rules", "planning.json"), "utf8"));
  assert.equal(catalog.rules.find((r) => r.id === RULE).assurance, "partial");
});

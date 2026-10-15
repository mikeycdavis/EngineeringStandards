/**
 * A recorded rejection must stay in force however deep it is wrapped (ST-44 follow-up to #143).
 *
 * `recordedRejections` once capped its walk at depth 6; a rejection below that read as "no events", the
 * effective record kept neither the rejection nor the approval, and `validate` skipped the rule. These
 * tests drive the reader directly and end to end through `standards validate`.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recordedRejections } from "../scripts/reviews.mjs";
import { parseYaml } from "../scripts/yaml.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const RULE = "ai.destructive-approval";

const wrappedObject = (depth) => {
  let node = { id: "r1", status: "rejected", reviewedBy: "synthetic-reviewer" };
  for (let i = 0; i < depth; i += 1) node = { wrapper: node };
  return { reviews: node };
};

test("a rejection is seen at any wrapping depth, with no stack overflow", () => {
  for (const depth of [0, 6, 7, 50, 5000, 200000]) {
    assert.equal(recordedRejections(wrappedObject(depth)).length, 1, `depth ${depth}`);
  }
});

test("a cyclic structure terminates and still reports the rejection it holds", () => {
  const cycle = { id: "r1", status: "rejected" };
  cycle.again = cycle;
  const outer = { loop: cycle };
  cycle.outer = outer;
  assert.equal(recordedRejections({ reviews: outer }).length, 1);
  const list = [];
  list.push(list, { status: "rejected" });
  assert.equal(recordedRejections({ reviews: list }).length, 1);
});

test("the policy parser accepts a deeply nested document", () => {
  let text = "a:\n";
  let indent = 2;
  for (let i = 0; i < 5000; i += 1) {
    text += `${" ".repeat(indent)}w:\n`;
    indent += 2;
  }
  text += `${" ".repeat(indent)}status: rejected\n`;
  let node = parseYaml(text).a;
  let depth = 0;
  while (node.w) {
    node = node.w;
    depth += 1;
  }
  assert.equal(depth, 5000);
  assert.equal(node.status, "rejected");
});

function git(cwd, ...args) {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
}

const header = `standardVersion: "2.0.0"\nproject: "synthetic"\nattestations:\n  ${RULE}:\n`;
const approved = [
  "    reviews:",
  '      - id: "g1"',
  "        status: approved",
  '        reviewedBy: "synthetic-reviewer"',
  '        reviewerRole: "synthetic-role"',
  '        reviewedAt: "2026-10-01"',
  '        evidence: "synthetic evidence"',
  '        reference: "synthetic-reference"',
  "        reviewedAgainst:",
  `          revision: "${"1".repeat(40)}"`,
  `          tree: "${"2".repeat(40)}"`,
  '          digest: "abcdef1234567890"',
  '          digestAlgorithm: "git-blob-set-sha256-v1"',
  '          source: "git"',
  "          paths:",
  '            - "s.txt"',
  "",
].join("\n");

function wrapped(depth) {
  let text = "    reviews:\n";
  let indent = 6;
  for (let i = 0; i < depth; i += 1) {
    text += `${" ".repeat(indent)}wrapper:\n`;
    indent += 2;
  }
  text += `${" ".repeat(indent)}id: "r1"\n${" ".repeat(indent)}status: rejected\n`;
  return header + text;
}

test("end to end: a wrapped trusted rejection replaced by an approval still fails the rule", async () => {
  for (const depth of [0, 7, 50, 5000]) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "rejection-depth-"));
    try {
      git(dir, "init", "-q", "-b", "develop");
      git(dir, "config", "user.email", "synthetic@example.invalid");
      git(dir, "config", "user.name", "Synthetic");
      git(dir, "config", "commit.gpgsign", "false");
      await writeFile(path.join(dir, "s.txt"), "s\n");
      await writeFile(path.join(dir, "project-policy.yml"), wrapped(depth));
      git(dir, "add", ".");
      git(dir, "commit", "-q", "-m", "trusted base");
      git(dir, "update-ref", "refs/remotes/origin/develop", git(dir, "rev-parse", "HEAD"));
      git(dir, "checkout", "-q", "-b", "feature");
      await writeFile(path.join(dir, "project-policy.yml"), header + approved);
      git(dir, "commit", "-q", "-a", "-m", "replace with approval");
      const r = spawnSync(process.execPath, [CLI, "validate", `--dir=${dir}`, "--json"], {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
      });
      const report = JSON.parse(r.stdout);
      const result = report.results.find((x) => x.ruleId === RULE);
      assert.equal(result.status, "failed", `depth ${depth}: the rejection must survive the rewrite`);
      assert.equal(result.disposition, "invalid-attestation", `depth ${depth}`);
      assert.notEqual(report.status, "COMPLIANT", `depth ${depth}`);
      assert.notEqual(r.status, 0, `depth ${depth}`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

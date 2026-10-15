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

// --- follow-up: `__proto__` keys and an oversized trusted base ----------------------------------------

test("a __proto__ key in a mapping is an ordinary entry the readers can see", () => {
  const doc = parseYaml("reviews:\n  __proto__:\n    id: r1\n    status: rejected\n  other: 1\n");
  assert.deepEqual(Object.keys(doc.reviews), ["__proto__", "other"]);
  assert.equal(Object.getPrototypeOf(doc.reviews), Object.prototype, "the prototype is not replaced");
  assert.equal(recordedRejections(doc).length, 1);
});

async function endToEnd(baseText, headText, extraFiles = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "rejection-follow-"));
  try {
    git(dir, "init", "-q", "-b", "develop");
    git(dir, "config", "user.email", "synthetic@example.invalid");
    git(dir, "config", "user.name", "Synthetic");
    git(dir, "config", "commit.gpgsign", "false");
    await writeFile(path.join(dir, "s.txt"), "s\n");
    for (const [name, content] of Object.entries(extraFiles)) await writeFile(path.join(dir, name), content);
    await writeFile(path.join(dir, "project-policy.yml"), baseText);
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "trusted base");
    git(dir, "update-ref", "refs/remotes/origin/develop", git(dir, "rev-parse", "HEAD"));
    git(dir, "checkout", "-q", "-b", "feature");
    await writeFile(path.join(dir, "project-policy.yml"), headText);
    git(dir, "commit", "-q", "-a", "-m", "replace");
    const r = spawnSync(process.execPath, [CLI, "validate", `--dir=${dir}`, "--json"], {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    });
    return { r, report: r.stdout ? JSON.parse(r.stdout) : null };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("end to end: a rejection under a __proto__ key survives its replacement", async () => {
  const base = header + "    reviews:\n      __proto__:\n        id: \"r1\"\n        status: rejected\n";
  const { report } = await endToEnd(base, header + approved);
  const result = report.results.find((x) => x.ruleId === RULE);
  assert.equal(result.status, "failed");
  assert.equal(result.disposition, "invalid-attestation");
});

test("end to end: a trusted base beyond the string limit is a structured not-evaluated, not a crash", async () => {
  // A 600 MB base, past V8's string cap, built as a Buffer so the test itself never holds it as a string.
  const NL = String.fromCharCode(10);
  const base = Buffer.concat([
    Buffer.from(header + "    reviews: []" + NL + "# "),
    Buffer.alloc(600 * 1024 * 1024, 120),
    Buffer.from(NL),
  ]);
  const { r, report } = await endToEnd(base, header + approved);
  assert.ok(report, "validate must produce a JSON report; stderr: " + String(r.stderr).slice(0, 300));
  assert.doesNotMatch(String(r.stderr), /ERR_STRING_TOO_LONG/);
  const message = JSON.stringify(report.findings.map((f) => f.message));
  assert.match(message, /NOT_EVALUATED/);
});

test("the git read bound never exceeds this runtime's maximum string length", async () => {
  const { constants } = await import("node:buffer");
  const { GIT_MAX_BUFFER } = await import("../scripts/review-history.mjs");
  // One pipe chunk (64 KiB) can arrive past the bound before ENOBUFS is reported: keep at least 256 KiB of headroom.
  assert.ok(GIT_MAX_BUFFER <= constants.MAX_STRING_LENGTH - 256 * 1024, GIT_MAX_BUFFER + " leaves no headroom under " + constants.MAX_STRING_LENGTH);
  assert.ok(GIT_MAX_BUFFER >= 64 * 1024 * 1024, "the bound stays far above any real policy");
});

test("end to end: an attestation keyed by an Object.prototype member name does not crash validate", async () => {
  for (const key of ["constructor", "toString", "__proto__"]) {
    const NL = String.fromCharCode(10);
    const head =
      'standardVersion: "2.0.0"' + NL + 'project: "synthetic"' + NL + "attestations:" + NL + "  " + key + ":" + NL +
      approved.split(NL).join(NL);
    const base = 'standardVersion: "2.0.0"' + NL + 'project: "synthetic"' + NL;
    const { r, report } = await endToEnd(base, head);
    assert.ok(report, key + ": validate must produce a JSON report; stderr: " + String(r.stderr).slice(0, 300));
    assert.doesNotMatch(String(r.stderr), /TypeError/, key);
  }
});

test("effectiveAttestations keeps a rejection recorded under a __proto__ rule key as an own entry", async () => {
  const { effectiveAttestations } = await import("../scripts/review-history.mjs");
  const base = parseYaml("__proto__:\n  reviews:\n    - id: \"r1\"\n      status: rejected\n");
  const kept = effectiveAttestations({}, { effective: false, baseAttestations: base });
  assert.deepEqual(Object.keys(kept), ["__proto__"]);
});

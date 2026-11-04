/**
 * ST-25 (#118), the message half: a rule WITHDRAWN AFTER ITS DETECTOR RAN says that a check ran and
 * names the reasons it did not establish the rule; a rule with NO detector keeps
 * "No implemented check evaluates <rule>.". Both sentences are pinned here.
 *
 * Why two sentences: the old one is true only of a rule nothing checks. Said of a rule whose detector
 * ran and then lost evidence to a truncated or unreadable file, it points the reader at a missing
 * detector when the remedy is to restore the evidence. The message is the ONLY thing this changes, and
 * the last test pins that: with and without the new input, every other field of every result is equal.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../scripts/catalog.mjs";
import { evaluate } from "../scripts/compliance.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
const CLI = path.join(ROOT, "scripts", "standards.mjs");
const CAP = 400_000;
const PLAN = "artifacts/project-plan-breakdown";
const OLD = (id) => `No implemented check evaluates ${id}.`;

const POLICY = [
  'standardVersion: "2.0.0"',
  'project: "Withdrawn message fixture"',
  "rules:",
  "  planning.breakdown-directory:",
  "    level: required",
  "  planning.item-fields:",
  "    level: required",
  "  planning.plan-code-consistency:",
  "    level: required",
  "",
].join("\n");

const OVERVIEW = "# Overview\n\nWhat this plan is for.\n\n## Sections\n\n- 01-plan\n";
const GOOD = "### One\n\n- **Status:** NOT_STARTED\n- **Purpose:** p\n- **Deliverables:** `scripts/standards.mjs`\n- **Acceptance Criteria:** a\n- **Verification:** v\n- **Dependencies:** none\n";

function sized(head, size) {
  const line = `${"p".repeat(79)}\n`;
  let body = head;
  while (body.length + line.length <= size) body += line;
  if (body.length < size) body += `${"p".repeat(size - body.length - 1)}\n`;
  return body;
}

async function withRepo(files, body) {
  const root = await mkdtemp(path.join(os.tmpdir(), "withdrawn-message-"));
  try {
    const git = (...args) => {
      const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
    };
    git("init", "-q");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "test");
    for (const [rel, text] of Object.entries({ ...files, "project-policy.yml": POLICY })) {
      const full = path.join(root, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, text);
    }
    git("add", "-A");
    git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
    return await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function validate(root) {
  const r = spawnSync(process.execPath, [CLI, "validate", `--dir=${root}`, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(r.stdout);
}
const resultFor = (json, id) => {
  const r = json.results.find((x) => x.ruleId === id);
  assert.ok(r, `no result for ${id}`);
  return r;
};

async function evaluatedRules() {
  const source = await readFile(path.join(ROOT, "scripts", "standards.mjs"), "utf8");
  const block = source.match(/const EVALUATED_RULES = \[([\s\S]*?)\];/);
  assert.ok(block, "EVALUATED_RULES not found");
  return new Set([...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]));
}

// --- end to end ---------------------------------------------------------------------------------

test("a rule withdrawn over a truncated plan file says a check ran and names the file and the cap", async () => {
  const big = sized(`${GOOD}\n`, CAP + 160 * 1024);
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-plan.md`]: big }, (root) => {
    const r = resultFor(validate(root), "planning.item-fields");
    assert.equal(r.disposition, "not-evaluated");
    assert.equal(
      r.message,
      `A check for planning.item-fields ran, but the rule is not established because some of its evidence was not obtained: ${PLAN}/01-plan.md: plan file read only up to the ${CAP}-byte cap, so its remaining items were not checked.`,
    );
    assert.notEqual(r.message, OLD("planning.item-fields"));
  });
});

test("a rule withdrawn by the coarse truncation term names the truncated path", async () => {
  await withRepo(
    { [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-plan.md`]: GOOD, "docs/notes.md": sized("# Notes\n\n", CAP + 20 * 1024) },
    (root) => {
      const r = resultFor(validate(root), "planning.plan-code-consistency");
      assert.equal(r.disposition, "not-evaluated");
      assert.match(r.message, /^A check for planning\.plan-code-consistency ran, but the rule is not established /);
      assert.ok(r.message.includes(`docs/notes.md read only up to the ${CAP}-byte cap`), r.message);
    },
  );
});

test("a rule withdrawn only by a spent read budget names the budget, not a file", async () => {
  const files = { [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-plan.md`]: GOOD };
  for (let i = 0; i < 20; i += 1) files[`src/m${String(i).padStart(2, "0")}.js`] = `export const a = ${i};\n${"// pad\n".repeat(50)}`;
  await withRepo(files, (root) => {
    const json = JSON.parse(
      spawnSync(process.execPath, [CLI, "validate", `--dir=${root}`, "--json", "--max-total-read-bytes=4000"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout,
    );
    const r = resultFor(json, "planning.plan-code-consistency");
    assert.equal(r.disposition, "not-evaluated");
    assert.equal(
      r.message,
      "A check for planning.plan-code-consistency ran, but the rule is not established because some of its evidence was not obtained: the read budget was exhausted.",
    );
    // The plan files were read whole, so the rule that reads only them is not withdrawn by the budget.
    assert.equal(resultFor(json, "planning.item-fields").disposition, "evaluated");
  });
});

test("a rule withdrawn over several truncated files names three of them and counts the rest", async () => {
  const files = { [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-plan.md`]: GOOD };
  for (const n of ["a", "b", "c", "d"]) files[`docs/${n}.md`] = sized(`# ${n}\n\n`, CAP + 20 * 1024);
  await withRepo(files, (root) => {
    const r = resultFor(validate(root), "planning.plan-code-consistency");
    assert.equal(r.disposition, "not-evaluated");
    assert.ok(
      r.message.includes(`docs/a.md, docs/b.md, docs/c.md and 1 more read only up to the ${CAP}-byte cap`),
      r.message,
    );
  });
});

// The two changes meet here: the plan reader (ST-24 part B) says a truncated README is a supporting document
// and not plan-item evidence, and the message (ST-25) must then name it only for the rule whose own domain
// reaches it, and must not describe planning.item-fields as withdrawn.
test("a truncated README withdraws plan-code-consistency by name and leaves planning.item-fields evaluated", async () => {
  await withRepo(
    { [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-plan.md`]: GOOD, [`${PLAN}/README.md`]: sized("# Guide\n\n", CAP + 20 * 1024) },
    (root) => {
      const json = validate(root);
      const fields = resultFor(json, "planning.item-fields");
      assert.equal(fields.disposition, "evaluated");
      assert.ok(!fields.message.startsWith("A check for "), fields.message);
      const consistency = resultFor(json, "planning.plan-code-consistency");
      assert.equal(consistency.disposition, "not-evaluated");
      assert.ok(consistency.message.includes(`${PLAN}/README.md read only up to the ${CAP}-byte cap`), consistency.message);
    },
  );
});

test("a rule with no detector keeps the old sentence, and no rule is described as having run unless its detector exists", async () => {
  const detectors = await evaluatedRules();
  const big = sized(`${GOOD}\n`, CAP + 160 * 1024);
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-plan.md`]: big, "docs/notes.md": sized("# Notes\n\n", CAP + 20 * 1024) }, (root) => {
    const json = validate(root);
    const ran = json.results.filter((x) => x.message.startsWith("A check for "));
    const noDetector = json.results.filter((x) => x.message.startsWith("No implemented check evaluates "));
    assert.ok(ran.length >= 2, "precondition: the fixture withdrew at least two rules after their detectors ran");
    assert.ok(noDetector.length >= 5, "precondition: rules with no detector are present");
    for (const r of ran) assert.ok(detectors.has(r.ruleId), `${r.ruleId} said a check ran but has no detector`);
    for (const r of noDetector) {
      assert.equal(r.message, OLD(r.ruleId), r.ruleId);
    }
    // The control named by the criterion.
    assert.equal(resultFor(json, "audit.business-state").message, OLD("audit.business-state"));
    assert.equal(detectors.has("audit.business-state"), false);
  });
});

test("a clean plan is unaffected: the rule passes and no result gains the new sentence", async () => {
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-plan.md`]: GOOD }, (root) => {
    const json = validate(root);
    assert.equal(resultFor(json, "planning.item-fields").disposition, "evaluated");
    assert.equal(json.results.filter((x) => x.message.startsWith("A check for ")).length, 0);
  });
});

// --- the engine ---------------------------------------------------------------------------------

const catalog = await loadCatalog();
const TODAY = "2026-01-01";
const run = (withdrawn) => evaluate({ catalog, policy: null, findings: [], evaluated: [], withdrawn, today: TODAY });
const msg = (verdict, id) => verdict.results.find((r) => r.ruleId === id).message;

test("evaluate: reasons are shown, at most three, with a count of the rest, and are display-safe", () => {
  const v = run(new Map([["planning.item-fields", ["a: one", "b: two", "c: three", "d: four", "e: five"]]]));
  assert.equal(
    msg(v, "planning.item-fields"),
    "A check for planning.item-fields ran, but the rule is not established because some of its evidence was not obtained: a: one; b: two; c: three; and 2 more.",
  );
  const forged = run(new Map([["planning.item-fields", [`x.md: bad\u001b[31m\nFORGED`]]]));
  assert.ok(!/[\u001b]/.test(msg(forged, "planning.item-fields")));
  assert.ok(!msg(forged, "planning.item-fields").includes("\nFORGED"));
});

test("evaluate: a rule absent from the map, or with an empty list, keeps the old sentence", () => {
  const v = run(new Map([["planning.item-fields", []]]));
  assert.equal(msg(v, "planning.item-fields"), OLD("planning.item-fields"));
  assert.equal(msg(run(null), "planning.item-fields"), OLD("planning.item-fields"));
  assert.equal(msg(run(undefined), "planning.item-fields"), OLD("planning.item-fields"));
});

test("evaluate: a manual-review rule keeps the old sentence even if the map names it", () => {
  const manual = [...catalog.rules.values()].find((r) => r.validationType === "manual-review");
  assert.ok(manual, "the catalog has a manual-review rule");
  const v = run(new Map([[manual.id, ["x: y"]]]));
  assert.equal(msg(v, manual.id), OLD(manual.id));
});

test("evaluate: the message is the ONLY difference the new input makes", () => {
  const ids = [...catalog.rules.keys()];
  const withdrawn = new Map(ids.map((id) => [id, [`${id}.md: truncated`]]));
  const plain = run(null);
  const rich = run(withdrawn);
  const strip = (v) => JSON.stringify({ ...v, results: v.results.map(({ message, ...rest }) => rest) });
  assert.equal(strip(rich), strip(plain));
  assert.ok(rich.results.some((r, i) => r.message !== plain.results[i].message), "non-vacuous: some message changed");
});

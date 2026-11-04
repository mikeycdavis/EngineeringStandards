/**
 * ST-25 (#118), truncation half: `planning.item-fields` must not PASS over a plan file that was only
 * read up to the cap.
 *
 * THE DEFECT. A plan file larger than the 400,000-byte read cap is parsed from its prefix. A
 * missing field on an item AFTER the cap was never seen, and the rule reported `passed / evaluated`
 * while its sibling `planning.plan-code-consistency` over the same bytes was withdrawn.
 *
 * THE MECHANISM UNDER TEST. `detectPlanDiscrepancies` records `run.unknown("planning.item-fields",
 * <path>, <reason>)` for each plan file `readPlanItems` listed as truncated. It is a read-site record
 * scoped by the one plan-file predicate (`isPlanFile`), NOT a `CONTENT_DERIVED_RULES` entry: that
 * table would also subject the rule to the coarse whole-walk term, so a fully read valid plan beside
 * a framework-excluded `fixtures/` directory would be withdrawn. The over-withdrawal cases below pin
 * that choice.
 *
 * CURRENT cases pin what the plan-file predicate is today and what ST-24 part B (README and
 * unnumbered files stop being plan items) will change on purpose, so that change is a visible edit
 * to a test and not a silent one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { main } from "../scripts/standards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const CAP = 400_000;
const AMPLE = 64 * 1024 * 1024;
const PLAN = "artifacts/project-plan-breakdown";
const RULE = "planning.item-fields";

const POLICY = [
  'standardVersion: "2.0.0"',
  'project: "Item fields truncation fixture"',
  "rules:",
  "  planning.breakdown-directory:",
  "    level: required",
  "  planning.item-fields:",
  "    level: required",
  "  planning.plan-code-consistency:",
  "    level: required",
  "  security.no-sql-concat:",
  "    level: required",
  "",
].join("\n");

const OVERVIEW = "# Overview\n\nWhat this plan is for.\n\n## Sections\n\n- 01-plan\n";

const GOOD = (title) =>
  [
    `### ${title}`,
    "",
    "- **Status:** NOT_STARTED",
    "- **Purpose:** Exercise the rule.",
    "- **Deliverables:** `scripts/standards.mjs`",
    "- **Acceptance Criteria:** It parses.",
    "- **Verification:** The suite.",
    "- **Dependencies:** none",
    "",
  ].join("\n");

/** An executable item missing four required fields. */
const BAD = (title) => `### ${title}\n\n- **Status:** READY\n- **Purpose:** Incomplete on purpose.\n- **Dependencies:** none\n`;

/**
 * `head` followed by prose with no plan syntax, to EXACTLY `size` bytes (ASCII), then `tail`
 * (so the total is `size + tail.length`). The filler never contains `###`.
 */
function sized(head, size, tail = "") {
  assert.ok(head.length < size, "head already exceeds the requested size");
  const line = `${"p".repeat(79)}\n`;
  let body = head;
  while (body.length + line.length <= size) body += line;
  if (body.length < size) body += `${"p".repeat(size - body.length - 1)}\n`;
  assert.equal(Buffer.byteLength(body), size);
  return body + tail;
}

const tmp = () => mkdtemp(path.join(os.tmpdir(), "item-fields-truncation-"));

async function fixture(root, files) {
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
}

function cli(command, dir, budget = AMPLE) {
  const r = spawnSync(
    process.execPath,
    [CLI, command, `--dir=${dir}`, "--json", `--max-total-read-bytes=${budget}`],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    assert.fail(`${command} stdout was not JSON.\nstderr: ${r.stderr.slice(0, 2000)}`);
  }
}

const resultFor = (json, id) => {
  const r = (json.results ?? []).find((x) => x.ruleId === id);
  assert.ok(r, `no result for ${id}`);
  return r;
};
const findingsFor = (json, id) => (json.findings ?? []).filter((f) => f.rule === id);
const shape = (json, id) => {
  const r = resultFor(json, id);
  return `${r.disposition}/${r.status}`;
};

/** `main` writes its JSON envelope to stdout; keep it out of the TAP stream. */
async function quietMain(args) {
  const write = process.stdout.write;
  process.stdout.write = () => true;
  try {
    return await main(args);
  } finally {
    process.stdout.write = write;
  }
}

/** Run one scenario in a fresh repository and tear it down. */
async function withRepo(files, fn) {
  const root = await tmp();
  try {
    await fixture(root, files);
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const PLAN_FILE = `${PLAN}/01-plan.md`;

test("a bad item AFTER the cap: not-evaluated, never passed, and the truncated path is named", async () => {
  const text = sized(GOOD("First, before the cap"), 560 * 1024, `\n${BAD("Second, after the cap")}`);
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [PLAN_FILE]: text }, async (root) => {
    const json = cli("validate", root);
    const r = resultFor(json, RULE);
    assert.equal(r.disposition, "not-evaluated", `reported ${r.disposition}/${r.status} over a plan it read only in part`);
    assert.equal(r.status, "skipped");
    assert.deepEqual(findingsFor(json, RULE), [], "a withdrawn rule must carry no finding about content it never read");

    // The truncated path is named by the run's own evidence record ...
    const truncated = (json.findings ?? []).find((f) => f.id === "evidence-truncated-file");
    assert.ok(truncated, "the run must report the truncated file");
    assert.ok(truncated.evidence.some((e) => e.startsWith(PLAN_FILE)), JSON.stringify(truncated.evidence));

    // ... and by the unknown check that withdrew the rule.
    const { run } = await quietMain(["validate", `--dir=${root}`, "--json"]);
    const unknown = run.unknownChecks.get(RULE);
    assert.ok(unknown && unknown.length === 1, `expected one unknown check, got ${JSON.stringify(unknown)}`);
    assert.equal(unknown[0].file, PLAN_FILE);
    assert.match(unknown[0].reason, /400000-byte cap/);
  });
});

test("a bad item BEFORE the cap in a truncated plan still FAILS with only the confirmed finding", async () => {
  const text = sized(`${BAD("Bad, before the cap")}\n${GOOD("Good")}`, 560 * 1024, `\n${BAD("Second bad, after the cap")}`);
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [PLAN_FILE]: text }, async (root) => {
    const json = cli("validate", root);
    const r = resultFor(json, RULE);
    assert.equal(r.disposition, "evaluated");
    assert.equal(r.status, "failed");
    const found = findingsFor(json, RULE);
    assert.equal(found.length, 1, JSON.stringify(found.map((f) => f.message)));
    const evidence = found[0].evidence.join("\n");
    assert.match(evidence, /Bad, before the cap/);
    assert.doesNotMatch(evidence, /after the cap/, "the item past the cap was never read and must not be reported");
  });
});

/** `tail` starts `before` bytes ahead of the cap, so the cap lands `before` bytes into it. */
const straddle = (head, tail, before) => sized(head, CAP - before, tail);

test("an item the cap cuts through is UNKNOWN: a valid plan is not-evaluated, never failed", async () => {
  const last = GOOD("Cut item");
  // The cap lands after Purpose, so Deliverables, Acceptance Criteria and Verification are past it.
  const at = last.indexOf("- **Deliverables:**");
  const text = straddle(GOOD("First"), last, at + 5);
  assert.equal(Buffer.byteLength(text) - (CAP - (at + 5)), last.length);
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [PLAN_FILE]: text }, async (root) => {
    const json = cli("validate", root);
    assert.equal(shape(json, RULE), "not-evaluated/skipped");
    assert.deepEqual(findingsFor(json, RULE), [], "the cut item was reported as missing fields it has");
  });
});

test("a field label the cap cuts before its colon is not a syntax violation", async () => {
  const last = GOOD("Cut item");
  const at = last.indexOf("- **Acceptance Criteria:**") + "- **Acceptance Criteria".length;
  const text = straddle(GOOD("First"), last, at);
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [PLAN_FILE]: text }, async (root) => {
    const json = cli("validate", root);
    assert.equal(shape(json, RULE), "not-evaluated/skipped");
    assert.deepEqual(findingsFor(json, RULE), []);
  });
});

test("an earlier real violation still FAILS beside a cut item, carrying only that finding", async () => {
  const last = GOOD("Cut item");
  const at = last.indexOf("- **Deliverables:**");
  const text = straddle(`${BAD("Real violation")}
${GOOD("Fine")}`, last, at + 5);
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [PLAN_FILE]: text }, async (root) => {
    const json = cli("validate", root);
    assert.equal(shape(json, RULE), "evaluated/failed");
    const found = findingsFor(json, RULE);
    assert.equal(found.length, 1);
    const evidence = found[0].evidence.join("\n");
    assert.match(evidence, /Real violation/);
    assert.doesNotMatch(evidence, /Cut item/);
  });
});

test("a malformed field heading in the read part still FAILS as before, beside a cut item", async () => {
  const last = GOOD("Cut item");
  const at = last.indexOf("- **Deliverables:**");
  const malformed = GOOD("Malformed").replace("- **Purpose:**", "- **Purpose - amended:**");
  const text = straddle(`${GOOD("First")}
${malformed}`, last, at + 5);
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [PLAN_FILE]: text }, async (root) => {
    const json = cli("validate", root);
    assert.equal(shape(json, RULE), "evaluated/failed");
    const found = findingsFor(json, RULE);
    assert.ok(found.length >= 1);
    assert.ok(found.some((f) => f.id === "plan-item-field-syntax"), JSON.stringify(found.map((f) => f.id)));
    assert.ok(found.every((f) => !/Cut item/.test(f.evidence.join("\n"))));
  });
});

test("boundary: 399999 and 400000 bytes are read whole, 400001 is truncated", async () => {
  const expectations = [
    [CAP - 1, "evaluated/passed"],
    [CAP, "evaluated/passed"],
    [CAP + 1, "not-evaluated/skipped"],
  ];
  for (const [size, expected] of expectations) {
    const text = sized(GOOD("Only item"), size);
    await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [PLAN_FILE]: text }, async (root) => {
      assert.equal(shape(cli("validate", root), RULE), expected, `a ${size}-byte plan`);
    });
  }
});

test("boundary: a bad item in the final bytes of a file of exactly the cap is read and fails", async () => {
  const text = sized(GOOD("First"), CAP - BAD("Last").length - 1, `\n${BAD("Last")}`);
  assert.equal(Buffer.byteLength(text), CAP);
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [PLAN_FILE]: text }, async (root) => {
    assert.equal(shape(cli("validate", root), RULE), "evaluated/failed");
  });
});

test("a valid, fully read plan beside a framework-excluded directory stays PASSED (no over-withdrawal)", async () => {
  await withRepo(
    {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [PLAN_FILE]: `${GOOD("One")}\n${GOOD("Two")}`,
      "fixtures/sample.js": "export const x = 1;\n",
    },
    async (root) => {
      const json = cli("validate", root);
      assert.equal(shape(json, RULE), "evaluated/passed");
      // The precondition that makes this test mean something: the whole-walk term DID fire, so a
      // rule withdrawn by `CONTENT_DERIVED_RULES` membership would have been withdrawn here.
      assert.equal(
        resultFor(json, "security.no-sql-concat").disposition,
        "not-evaluated",
        "fixtures/ no longer makes the walk go short; this test has stopped proving anything",
      );
    },
  );
});

test("no plan directory: the result is whatever it is without the change, even beside fixtures/", async () => {
  const withFixtures = await withRepo({ "fixtures/sample.js": "export const x = 1;\n" }, (root) =>
    shape(cli("validate", root), RULE),
  );
  const without = await withRepo({ "src/sample.js": "export const x = 1;\n" }, (root) => shape(cli("validate", root), RULE));
  assert.equal(withFixtures, without, "a framework-excluded directory must not move a rule that has no plan to read");
  assert.doesNotMatch(withFixtures, /^not-evaluated/, `a repository with no plan reported ${withFixtures}`);
});

test("a truncated Markdown file OUTSIDE the plan directory does not withdraw the rule", async () => {
  await withRepo(
    {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [PLAN_FILE]: GOOD("One"),
      "docs/notes.md": sized("# Notes\n\n", CAP + 20 * 1024),
    },
    async (root) => {
      const json = cli("validate", root);
      assert.ok((json.findings ?? []).some((f) => f.id === "evidence-truncated-file"), "precondition: a file was truncated");
      assert.equal(shape(json, RULE), "evaluated/passed");
      // plan-code-consistency's own domain (any truncated `.md`) is unchanged.
      assert.equal(resultFor(json, "planning.plan-code-consistency").disposition, "not-evaluated");
    },
  );
});

test("CURRENT (ST-24 part B will narrow this): a truncated README.md under the plan directory counts as a plan file", async () => {
  await withRepo(
    {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [PLAN_FILE]: GOOD("One"),
      [`${PLAN}/README.md`]: sized("# How to read this plan\n\n", CAP + 20 * 1024),
    },
    async (root) => {
      // `isPlanFile` is the single predicate and today it accepts any `.md` under the directory. The
      // owner rule (a README is never a plan item) is part B of #117, not this change.
      assert.equal(shape(cli("validate", root), RULE), "not-evaluated/skipped");
    },
  );
});

test("budget exhausted before the plan files are read: not-evaluated", async () => {
  const text = sized(BAD("Never read"), 200 * 1024);
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [PLAN_FILE]: text }, async (root) => {
    const json = cli("validate", root, 32 * 1024);
    assert.equal(shape(json, RULE), "not-evaluated/skipped");
    assert.deepEqual(findingsFor(json, RULE), []);
  });
});

test("presence-only semantics are preserved: an item with the key present and empty passes", async () => {
  const item = GOOD("Empty criteria").replace("- **Acceptance Criteria:** It parses.", "- **Acceptance Criteria:**");
  await withRepo({ [`${PLAN}/00-overview.md`]: OVERVIEW, [PLAN_FILE]: item }, async (root) => {
    assert.equal(shape(cli("validate", root), RULE), "evaluated/passed");
  });
});

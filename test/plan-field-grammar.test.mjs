/**
 * A malformed field heading is rejected loudly, never converted into an absent field.
 *
 * Issue #19 recorded two failure shapes. Measurement found three, and the one it missed is the
 * worst: a malformed `Status` does not produce "missing Status", it removes the item from the
 * executable set entirely, so every check on that item stops running and nothing is reported. The
 * other two are a misleading "(no Acceptance Criteria)" against an item that visibly has one, and a
 * malformed `Tracked by`, which deletes the disclosure that a status is a cached copy of an
 * authority nobody consulted — turning an unverified status into an apparently established one.
 *
 * PR #54 is the live specimen and is deliberately still rejected here. Its heading dropped the
 * colon and wrapped across two lines, and no grammar admitting that would be worth having. The
 * defect was never that a human-readable qualification failed to parse; it was that the rejection
 * was silent in one case and misdiagnosed in another.
 *
 * The diagnostic's boundary is the part that had to be measured rather than reasoned about, because
 * the obvious version of it — report any bold bullet that is not a known field — fires 136 times on
 * this repository's own plan, which is correct. Plan items legitimately carry keyed bullets nothing
 * reads (`Evidence` appears in eight of the nine files) and bold prose lead-ins (72 of them). So the
 * diagnostic fires only where a label's canonical key is EXACTLY a field the plan reads, or is one
 * followed by a dash where the separator belongs. Measured against every plan file in the
 * repository and every fixture: zero findings.
 *
 * The last four tests are the anti-vacuity half. A diagnostic that fires on everything would pass
 * every positive test in this file.
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

const RULE = "planning.item-fields";
const AMPLE = 8_000_000;

const POLICY = [
  'standardVersion: "2.0.0"',
  'project: "plan field grammar fixture"',
  "rules:",
  "  planning.item-fields:",
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
    return assert.fail(`${command} stdout was not JSON.\nstderr: ${r.stderr.slice(0, 2000)}`);
  }
}

const findingsById = (json, id) => (json.findings ?? []).filter((f) => f.id === id);
const syntaxEvidence = (json) => findingsById(json, "plan-item-field-syntax").flatMap((f) => f.evidence ?? []);
const missingEvidence = (json) => findingsById(json, "standards-violations").flatMap((f) => f.evidence ?? []);
const delegationEvidence = (json) =>
  findingsById(json, "delegated-liveness-unverifiable").flatMap((f) => f.evidence ?? []);

/** The six fields, well formed, so a fixture differs from the next only in the line under test. */
const SIX = [
  "- **Status:** READY",
  "- **Purpose:** p",
  "- **Deliverables:** d",
  "- **Acceptance Criteria:** a",
  "- **Verification:** v",
  "- **Dependencies:** none",
];

/** Build a plan whose single item is `SIX` with one line replaced, or with extra lines appended. */
function item(title, { replace = {}, extra = [] } = {}) {
  const lines = SIX.map((l) => {
    for (const [prefix, replacement] of Object.entries(replace)) {
      if (l.startsWith(prefix)) return replacement;
    }
    return l;
  });
  return [`### ${title}`, ...lines, ...extra, ""].join("\n");
}

async function withPlan(planBody, fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plan-grammar-"));
  try {
    await mkdir(path.join(root, "artifacts", "project-plan-breakdown"), { recursive: true });
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "index.ts"), "export const x = 1;\n");
    await writeFile(path.join(root, "README.md"), "# Fixture\n");
    await writeFile(path.join(root, "project-policy.yml"), POLICY);
    await writeFile(
      path.join(root, "artifacts", "project-plan-breakdown", "01-p.md"),
      ["# 01 — P", "", planBody].join("\n"),
    );
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- the grammar accepts a qualifier

test("a qualified key parses as the canonical field", async () => {
  await withPlan(
    item("Qualified acceptance criteria", {
      replace: { "- **Acceptance Criteria:**": "- **Acceptance Criteria — amended today:** a" },
    }),
    (root) => {
      const json = cli("audit", root);
      assert.deepEqual(missingEvidence(json), [], "a qualified heading was read as an absent field");
      assert.deepEqual(syntaxEvidence(json), [], "a well-formed qualified heading was reported as malformed");
    },
  );
});

test("a qualified Status keeps the item evaluable rather than making it disappear", async () => {
  await withPlan(
    item("Qualified status", {
      replace: { "- **Status:**": "- **Status — as of today:** READY" },
      // Deliberately drop nothing: if the item is evaluated, this is silent. The falsifier is the
      // NEXT test, which proves the fixture can produce a missing-field finding at all.
    }),
    (root) => {
      const json = cli("audit", root);
      assert.deepEqual(syntaxEvidence(json), []);
      assert.deepEqual(missingEvidence(json), [], "the item reported a missing field");
    },
  );
});

test("the qualified-Status fixture is not vacuous — dropping a field still fails", async () => {
  const body = item("Qualified status, missing a field", {
    replace: { "- **Status:**": "- **Status — as of today:** READY", "- **Verification:**": "" },
  });
  await withPlan(body, (root) => {
    const json = cli("audit", root);
    const missing = missingEvidence(json);
    assert.equal(missing.length, 1, `expected exactly one missing field, got ${JSON.stringify(missing)}`);
    assert.match(missing[0], /no Verification/);
  });
});

test("a qualified Tracked by preserves the delegated-status disclosure", async () => {
  await withPlan(
    item("Delegated with a qualified label", {
      replace: { "- **Status:**": "- **Status:** COMPLETE" },
      extra: ["- **Tracked by — see the migration note:** GitHub issue #99"],
    }),
    (root) => {
      const json = cli("audit", root);
      const delegated = delegationEvidence(json);
      assert.equal(delegated.length, 1, "the delegation disclosure was lost, so COMPLETE reads as established");
      assert.match(delegated[0], /cached copy/);
    },
  );
});

// ------------------------------------------------------------- malformed syntax is reported loudly

test("a colon-less qualified label is reported, and names the heading", async () => {
  await withPlan(
    item("Colon-less label", {
      replace: { "- **Acceptance Criteria:**": "- **Acceptance Criteria — amended today.** a" },
    }),
    (root) => {
      const json = cli("audit", root);
      const syntax = syntaxEvidence(json);
      assert.equal(syntax.length, 1, `expected one syntax finding, got ${JSON.stringify(syntax)}`);
      assert.match(syntax[0], /Acceptance Criteria/);
      assert.match(syntax[0], /01-p\.md:\d+/, "the finding does not name the line");
    },
  );
});

test("a malformed Status is reported even though it stops the item being executable", async () => {
  await withPlan(
    item("Wrong separator on status", {
      replace: { "- **Status:**": "- **Status - as of today:** READY" },
    }),
    (root) => {
      const json = cli("audit", root);
      const syntax = syntaxEvidence(json);
      assert.equal(syntax.length, 1, "the item vanished silently, which is the defect this closes");
      assert.match(syntax[0], /Status/);
      // And the item really is non-executable, so this finding is the ONLY thing that reports it.
      assert.deepEqual(missingEvidence(json), []);
    },
  );
});

test("a wrapped label is reported rather than treated as an absent field", async () => {
  await withPlan(
    [
      "### Wrapped label",
      ...SIX.filter((l) => !l.startsWith("- **Acceptance Criteria:**")),
      "- **Acceptance Criteria — amended by the owner on 2026-08-29. This is a",
      "  correction to the contract:** a",
      "",
    ].join("\n"),
    (root) => {
      const json = cli("audit", root);
      assert.equal(syntaxEvidence(json).length, 1, "a wrapped label was silently absent");
      // The field genuinely is missing, and now the reason is stated beside it rather than alone.
      assert.equal(missingEvidence(json).length, 1);
      assert.match(missingEvidence(json)[0], /no Acceptance Criteria/);
    },
  );
});

test("a duplicate canonical key does not let a qualified label overwrite the field", async () => {
  await withPlan(
    item("Duplicate status", { extra: ["- **Status — a second one:** CANCELLED"] }),
    (root) => {
      const json = cli("audit", root);
      assert.equal(syntaxEvidence(json).length, 1, "a second Status was absorbed silently");
      assert.match(syntaxEvidence(json)[0], /a second Status field/);
    },
  );
});

// ------------------------------------------------------------------------------- anti-vacuity half

test("the four near-misses stay unknown keys and raise nothing", async () => {
  await withPlan(
    item("Near misses", {
      extra: [
        "- **Verification of the digest:** unrelated",
        "- **Statuses:** unrelated",
        "- **Acceptance Criteria-ish:** unrelated",
        "- **Dependencies and risks:** unrelated",
      ],
    }),
    (root) => {
      const json = cli("audit", root);
      assert.deepEqual(syntaxEvidence(json), [], "a near-miss was read as a malformed field");
      assert.deepEqual(missingEvidence(json), [], "a near-miss displaced a real field");
    },
  );
});

test("ordinary bold prose inside an item is not a field-syntax finding", async () => {
  await withPlan(
    item("Prose bullets", {
      extra: [
        "- **Evidence:** open as of today.",
        "- **The bug worth remembering: it detected itself.** prose",
        "- **Status is not a claim about the world.** prose",
        "- **Amendment — why the criterion is superseded.** prose",
      ],
    }),
    (root) => {
      const json = cli("audit", root);
      assert.deepEqual(syntaxEvidence(json), [], "explanatory prose became a parser error");
    },
  );
});

test("a qualified label maps only to its own field, never to another", async () => {
  await withPlan(
    item("One qualified field", {
      replace: { "- **Verification:**": "- **Verification — how it was run:** v" },
      extra: ["- **Acceptance Criteria — a second one:** a"],
    }),
    (root) => {
      const json = cli("audit", root);
      // `Verification — how it was run` must not satisfy `Acceptance Criteria`, and the duplicate
      // Acceptance Criteria must be reported as a duplicate rather than filling some other field.
      assert.equal(syntaxEvidence(json).length, 1);
      assert.match(syntaxEvidence(json)[0], /a second Acceptance Criteria field/);
      assert.deepEqual(missingEvidence(json), [], "a qualified Verification stopped satisfying Verification");
    },
  );
});

test("field-shaped bullets that miss the bold-and-colon form are still reported", async () => {
  // Two shapes no test covered until a mutant survived by deleting the handling for them: a `*`
  // bullet, which markdown allows and the field regex does not, and a colon outside the bold run.
  await withPlan(
    [
      "### Broken bullet shapes",
      ...SIX.filter((l) => !l.startsWith("- **Verification:**")),
      "* **Verification:** v",
      "",
    ].join("\n"),
    (root) => {
      const json = cli("audit", root);
      assert.equal(syntaxEvidence(json).length, 1, "a `*` bullet field was read as prose");
      assert.match(syntaxEvidence(json)[0], /Verification/);
    },
  );
  await withPlan(
    [
      "### Colon outside the bold run",
      ...SIX.filter((l) => !l.startsWith("- **Verification:**")),
      "- **Verification**: v",
      "",
    ].join("\n"),
    (root) => {
      const json = cli("audit", root);
      assert.equal(syntaxEvidence(json).length, 1, "a colon outside the bold run was read as prose");
    },
  );
});

test("a field name mentioned inside prose is not a field heading", async () => {
  // The key must be a PREFIX of the label, not merely present in it. A mutant relaxing that to a
  // substring test survived the rest of this suite, and the case that kills it is ordinary: the
  // lead-in before the dash happens to be the same length as the field name mentioned after it.
  await withPlan(
    item("Prose mentioning a field name", {
      extra: [
        "- **Caveat — Status is cached here.** prose",
        "- **Note — the Verification below is partial.** prose",
      ],
    }),
    (root) => {
      const json = cli("audit", root);
      assert.deepEqual(syntaxEvidence(json), [], "prose mentioning a field name became a parser error");
    },
  );
});

test("a well-formed plan raises nothing at all", async () => {
  await withPlan(item("Entirely well formed"), (root) => {
    const json = cli("audit", root);
    assert.deepEqual(syntaxEvidence(json), []);
    assert.deepEqual(missingEvidence(json), []);
  });
});

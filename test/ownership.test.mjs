import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CLASS,
  collectPlanClaims,
  readUnscoped,
  checkOwnership,
  parseIssueSnapshot,
} from "../scripts/ownership.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = path.join(ROOT, "scripts", "ownership.mjs");
const URL = (n) => `https://github.com/o/r/issues/${n}`;

const item = (title, tracked) =>
  `### ${title}\n\n- **Status:** NOT_STARTED\n- **Tracked by:** ${tracked}\n- **Purpose:** x\n\n`;

async function scratch(files = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "ownership-"));
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text, "utf8");
  }
  return root;
}
const PLAN = "artifacts/project-plan-breakdown";
const MAP = "artifacts/backlog/github-mapping.json";
const run = (root, ...args) =>
  spawnSync(process.execPath, [SCRIPT, "--root", root, ...args], { encoding: "utf8" });

// --- the four fixtures the plan item names -------------------------------------------------------

test("claimed once: the issue is release-eligible", () => {
  const claims = [{ file: "a.md", title: "A", issue: 10 }];
  const r = checkOwnership({ openIssues: [10], claims, unscoped: [] });
  assert.equal(r.issues[0].classification, CLASS.claimedOnce);
  assert.equal(r.issues[0].releaseEligible, true);
  assert.equal(r.ok, true);
});

test("claimed twice: a violation naming both owners, never eligible", () => {
  const claims = [
    { file: "a.md", title: "A", issue: 10 },
    { file: "b.md", title: "B", issue: 10 },
  ];
  const r = checkOwnership({ openIssues: [10], claims, unscoped: [] });
  assert.equal(r.issues[0].classification, CLASS.claimedTwice);
  assert.equal(r.issues[0].releaseEligible, false);
  assert.equal(r.issues[0].owners.length, 2);
  assert.equal(r.ok, false);
});

test("absent from the plan and not declared: a violation, not eligible", () => {
  const r = checkOwnership({ openIssues: [11], claims: [], unscoped: [] });
  assert.equal(r.issues[0].classification, CLASS.absent);
  assert.equal(r.issues[0].releaseEligible, false);
  assert.equal(r.ok, false);
});

test("deliberately temporary-unscoped: legal, passes, and is never release-eligible", () => {
  const unscoped = [{ number: 12, since: "2026-10-01", reason: "filed, not yet scoped" }];
  const r = checkOwnership({ openIssues: [12], claims: [], unscoped });
  assert.equal(r.issues[0].classification, CLASS.temporaryUnscoped);
  assert.equal(r.issues[0].releaseEligible, false);
  assert.equal(r.ok, true, "temporary unscoped is a legal state, not a failure");
  assert.equal(r.releaseReady, false, "but it blocks release readiness");
});

test("both truths survive together: a mixed set is ok but not release-ready", () => {
  const r = checkOwnership({
    openIssues: [10, 12],
    claims: [{ file: "a.md", title: "A", issue: 10 }],
    unscoped: [{ number: 12, since: "2026-10-01", reason: "r" }],
  });
  assert.equal(r.ok, true);
  assert.equal(r.releaseReady, false);
  assert.deepEqual(r.issues.map((i) => i.releaseEligible), [true, false]);
});

test("a fully claimed set is release-ready", () => {
  const r = checkOwnership({ openIssues: [10], claims: [{ file: "a.md", title: "A", issue: 10 }], unscoped: [] });
  assert.equal(r.releaseReady, true);
});

test("a violation is never release-ready even when the other issues are fine", () => {
  const r = checkOwnership({ openIssues: [10, 11], claims: [{ file: "a.md", title: "A", issue: 10 }], unscoped: [] });
  assert.equal(r.releaseReady, false);
});

// --- declarations must not rot -------------------------------------------------------------------

test("an unscoped declaration for an issue a plan item now claims is a stale-declaration violation", () => {
  const r = checkOwnership({
    openIssues: [10],
    claims: [{ file: "a.md", title: "A", issue: 10 }],
    unscoped: [{ number: 10, since: "2026-10-01", reason: "r" }],
  });
  assert.equal(r.issues[0].classification, CLASS.staleDeclaration);
  assert.equal(r.ok, false);
  assert.equal(r.issues[0].releaseEligible, false);
});

test("an unscoped declaration for an issue that is not open is a violation", () => {
  const r = checkOwnership({ openIssues: [], claims: [], unscoped: [{ number: 99, since: "2026-10-01", reason: "r" }] });
  assert.equal(r.ok, false);
  assert.equal(r.problems[0].kind, "declaration-for-non-open-issue");
});

test("a claim on an issue that is not open is not a problem", () => {
  const r = checkOwnership({ openIssues: [], claims: [{ file: "a.md", title: "A", issue: 7 }], unscoped: [] });
  assert.equal(r.ok, true);
});

test("a duplicate declaration is a violation", () => {
  const d = { number: 12, since: "2026-10-01", reason: "r" };
  const r = checkOwnership({ openIssues: [12], claims: [], unscoped: [d, d] });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.kind === "duplicate-declaration"));
});

test("malformed declarations passed in make the result not ok", () => {
  const r = checkOwnership({ openIssues: [], claims: [], unscoped: [], malformed: ["entry 0"] });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.kind === "malformed-declaration"));
});

test("no open issues is evaluated and ok, which is not the same as not evaluated", () => {
  const r = checkOwnership({ openIssues: [], claims: [], unscoped: [] });
  assert.equal(r.ok, true);
  assert.equal(r.issues.length, 0);
});

// --- reading the plan: the Tracked by field, not a mention ---------------------------------------

test("a claim is the Tracked by field, not a mention in prose or another field", async () => {
  const root = await scratch({
    [`${PLAN}/08.md`]:
      item("Owner", `GitHub issue [#10](${URL(10)})`) +
      `### Mentions only\n\n- **Status:** NOT_STARTED\n- **Purpose:** see [#11](${URL(11)}) and #12\n\nSee ${URL(13)}.\n`,
  });
  try {
    const claims = collectPlanClaims(root);
    assert.deepEqual(claims.map((c) => c.issue), [10]);
    assert.equal(claims[0].title, "Owner");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a multi-line Tracked by field yields every issue it names, once per item", async () => {
  const root = await scratch({
    [`${PLAN}/04.md`]: item("Two", `GitHub issues\n  [#10](${URL(10)}) and\n  [#11](${URL(11)}) and again [#10](${URL(10)})`),
  });
  try {
    assert.deepEqual(collectPlanClaims(root).map((c) => c.issue).sort(), [10, 11]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a pull request reference in Tracked by is not an issue claim", async () => {
  const root = await scratch({
    [`${PLAN}/08.md`]: item("PR", "[PR #15](https://github.com/o/r/pull/15), **merged**"),
  });
  try {
    assert.deepEqual(collectPlanClaims(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("claims in two different files for one issue are both found", async () => {
  const root = await scratch({
    [`${PLAN}/04.md`]: item("A", `[#10](${URL(10)})`),
    [`${PLAN}/08.md`]: item("B", `[#10](${URL(10)})`),
  });
  try {
    const claims = collectPlanClaims(root);
    assert.equal(claims.length, 2);
    const r = checkOwnership({ openIssues: [10], claims, unscoped: [] });
    assert.equal(r.issues[0].classification, CLASS.claimedTwice);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- the durable representation and the snapshot -------------------------------------------------

test("readUnscoped reads temporarilyUnscoped from the mapping; absent means none", async () => {
  const root = await scratch({
    [MAP]: JSON.stringify({ temporarilyUnscoped: [{ number: 12, since: "2026-10-01", reason: "r" }] }),
  });
  const bare = await scratch({ [MAP]: JSON.stringify({ items: {} }) });
  const none = await scratch({});
  try {
    assert.deepEqual(readUnscoped(root).entries, [{ number: 12, since: "2026-10-01", reason: "r" }]);
    assert.deepEqual(readUnscoped(bare).entries, []);
    assert.deepEqual(readUnscoped(none).entries, []);
  } finally {
    for (const r of [root, bare, none]) await rm(r, { recursive: true, force: true });
  }
});

test("a malformed declaration is reported rather than silently dropped", async () => {
  const root = await scratch({
    [MAP]: JSON.stringify({ temporarilyUnscoped: [{ number: 12 }, { number: "x", since: "2026-10-01", reason: "r" }, 5] }),
  });
  try {
    const u = readUnscoped(root);
    assert.deepEqual(u.entries, []);
    assert.equal(u.malformed.length, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a non-array temporarilyUnscoped is malformed, not empty", async () => {
  const root = await scratch({ [MAP]: JSON.stringify({ temporarilyUnscoped: { number: 12 } }) });
  try {
    assert.equal(readUnscoped(root).malformed.length, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an unreadable mapping is an error, not an empty set", async () => {
  const root = await scratch({ [MAP]: "{not json" });
  try {
    assert.throws(() => readUnscoped(root), /github-mapping\.json/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parseIssueSnapshot keeps only open issues of a gh-shaped list, and accepts bare numbers", () => {
  assert.deepEqual(
    parseIssueSnapshot([{ number: 1, state: "OPEN" }, { number: 2, state: "CLOSED" }, { number: 3 }]),
    [1, 3],
  );
  assert.deepEqual(parseIssueSnapshot([4, 5]), [4, 5]);
  assert.throws(() => parseIssueSnapshot({ number: 1 }));
  assert.throws(() => parseIssueSnapshot([{ nope: 1 }]));
});

// --- the command: three exit codes, and NOT_EVALUATED is not a pass ------------------------------

test("CLI without an issue snapshot is NOT_EVALUATED, exit 2", async () => {
  const root = await scratch({ [`${PLAN}/08.md`]: item("A", `[#10](${URL(10)})`) });
  try {
    const r = run(root);
    assert.equal(r.status, 2);
    assert.match(r.stdout + r.stderr, /NOT_EVALUATED/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI: exit 0 when owned, 1 on a violation, with the issue named", async () => {
  const root = await scratch({
    [`${PLAN}/08.md`]: item("A", `[#10](${URL(10)})`),
    "issues.json": JSON.stringify([{ number: 10, state: "OPEN" }]),
    "bad.json": JSON.stringify([{ number: 10, state: "OPEN" }, { number: 11, state: "OPEN" }]),
  });
  try {
    const ok = run(root, "--issues", path.join(root, "issues.json"));
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /PASSED/);
    const bad = run(root, "--issues", path.join(root, "bad.json"));
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /#11/);
    assert.match(bad.stdout, /absent-from-plan/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI: temporary unscoped exits 0 but says it is not release-eligible", async () => {
  const root = await scratch({
    [MAP]: JSON.stringify({ temporarilyUnscoped: [{ number: 12, since: "2026-10-01", reason: "r" }] }),
    "issues.json": JSON.stringify([12]),
  });
  try {
    const r = run(root, "--issues", path.join(root, "issues.json"));
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /temporary-unscoped/);
    assert.match(r.stdout, /not release-eligible/i);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("CLI: an unreadable snapshot, missing snapshot or bad mapping is exit 2, never a pass", async () => {
  const root = await scratch({ "issues.json": "nope", [MAP]: "{bad" });
  const good = await scratch({ "issues.json": "[]" });
  try {
    assert.equal(run(root, "--issues", path.join(root, "issues.json")).status, 2);
    assert.equal(run(good, "--issues", path.join(good, "missing.json")).status, 2);
    assert.equal(run(good, "--issues", path.join(good, "issues.json"), "--bogus").status, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
    await rm(good, { recursive: true, force: true });
  }
});

test("CLI: --json emits the machine-readable result", async () => {
  const root = await scratch({ "issues.json": JSON.stringify([11]) });
  try {
    const r = run(root, "--issues", path.join(root, "issues.json"), "--json");
    assert.equal(r.status, 1);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, false);
    assert.equal(out.issues[0].classification, "absent-from-plan");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("this repository's own mapping and plan parse cleanly", () => {
  const u = readUnscoped(ROOT);
  assert.deepEqual(u.malformed, []);
  assert.ok(collectPlanClaims(ROOT).length > 10);
});

// --- hierarchy containers: owned by the mapping, not claimable by a plan item --------------------

test("an unclaimed hierarchy container is legal and does not block release", () => {
  const r = checkOwnership({
    openIssues: [10, 70],
    claims: [{ file: "a.md", title: "A", issue: 10 }],
    unscoped: [],
    containers: [70],
  });
  assert.equal(r.issues[1].classification, CLASS.hierarchyContainer);
  assert.equal(r.issues[1].releaseEligible, false);
  assert.equal(r.ok, true);
  assert.equal(r.releaseReady, true);
});

test("a story the mapping does not list as a container is still absent-from-plan", () => {
  const r = checkOwnership({ openIssues: [49], claims: [], unscoped: [], containers: [70] });
  assert.equal(r.issues[0].classification, CLASS.absent);
});

test("a container cannot be declared temporarily unscoped", () => {
  const r = checkOwnership({
    openIssues: [70],
    claims: [],
    unscoped: [{ number: 70, since: "2026-10-01", reason: "r" }],
    containers: [70],
  });
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.kind === "declaration-for-container"));
});

test("a container claimed by two plan items is still claimed-twice", () => {
  const claims = [
    { file: "a.md", title: "A", issue: 70 },
    { file: "b.md", title: "B", issue: 70 },
  ];
  const r = checkOwnership({ openIssues: [70], claims, unscoped: [], containers: [70] });
  assert.equal(r.issues[0].classification, CLASS.claimedTwice);
  assert.equal(r.ok, false);
});

test("readUnscoped derives containers from non-story mapping ids", async () => {
  const root = await scratch({
    [MAP]: JSON.stringify({
      items: {
        "TH-01": { number: 69 },
        "FE-01": { number: 72 },
        "ST-01": { number: 2 },
      },
    }),
  });
  try {
    assert.deepEqual(readUnscoped(root).containers.sort(), [69, 72]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- survivors of the first mutation round ---------------------------------------------------------

test("releaseReady is false when a problem exists even if every issue is claimed once", () => {
  const r = checkOwnership({
    openIssues: [10],
    claims: [{ file: "a.md", title: "A", issue: 10 }],
    unscoped: [{ number: 99, since: "2026-10-01", reason: "r" }],
  });
  assert.equal(r.issues[0].classification, CLASS.claimedOnce);
  assert.equal(r.ok, false);
  assert.equal(r.releaseReady, false);
});

test("the Tracked by value ends at the next field, a blank line or a heading", async () => {
  const root = await scratch({
    [`${PLAN}/a.md`]:
      `### Next field\n\n- **Tracked by:** [#10](${URL(10)})\n- **Evidence:** discussed [#20](${URL(20)})\n\n` +
      `### Blank line\n\n- **Tracked by:** [#11](${URL(11)})\n\nprose naming [#21](${URL(21)})\n\n` +
      `### Heading\n\n- **Tracked by:** [#12](${URL(12)})\n### Other\n[#22](${URL(22)})\n`,
  });
  try {
    assert.deepEqual(collectPlanClaims(root).map((c) => c.issue).sort((x, y) => x - y), [10, 11, 12]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a Tracked by line before any heading, and non-markdown files, are not claims", async () => {
  const root = await scratch({
    [`${PLAN}/a.md`]: `- **Tracked by:** [#10](${URL(10)})\n\n### Real\n\n- **Tracked by:** [#11](${URL(11)})\n`,
    [`${PLAN}/notes.txt`]: item("Text", `[#12](${URL(12)})`),
  });
  try {
    assert.deepEqual(collectPlanClaims(root).map((c) => c.issue), [11]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("each declaration field is validated on its own", async () => {
  const root = await scratch({
    [MAP]: JSON.stringify({
      temporarilyUnscoped: [
        { number: 1, since: "October 1", reason: "r" },
        { number: 2, since: "2026-10-01", reason: "  " },
        { number: 3, since: "2026-10-01", reason: "r" },
      ],
    }),
  });
  try {
    const u = readUnscoped(root);
    assert.equal(u.malformed.length, 2);
    assert.deepEqual(u.entries.map((e) => e.number), [3]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * ST-24 (#117) part A: one plan-item reader, one plan-directory constant, one fence-aware line walk,
 * and a proof that extracting them changed no behaviour.
 *
 * WHAT IS PROVEN, AND BY WHAT.
 *
 *   1. READER EQUIVALENCE (always runs). `readPlanItems` is compared with a FROZEN copy of the inline
 *      logic it replaced (`test/fixtures/plan-reader-reference/legacy.mjs`, develop d88c694) over the
 *      corpus in `corpus.mjs`, run through the real collector so "unread" and "truncated" are real
 *      states and not stubs. Plan files, items, executable items, unreadable and truncated lists must be
 *      deep-equal.
 *   2. FENCE-WALK EQUIVALENCE (always runs). `conflictGroups`, now a consumer of `markdownLines`, is
 *      compared with the frozen original over the six fence shapes the issue names, markers inside a
 *      group, and a seeded fuzz of 3000 documents.
 *   3. ENVELOPE EQUIVALENCE (runs when `ES_GOLDEN_BASE` names a checkout of the code to compare with).
 *      `validate --json` and `audit --json` and `init --dry-run --json` of that checkout and of this one
 *      are run over the corpus, every test fixture and, when the target is this repository, this
 *      repository, and compared after normalising `auditedAt` and the absolute path. The ownership
 *      collector is compared the same way. This part is not a committed golden file on purpose: any
 *      unrelated change to a message would invalidate such a file for every open pull request, and it
 *      would then be regenerated without anyone reading it. A comparison against a named baseline fails
 *      only when THIS change moved something.
 *
 *        ES_GOLDEN_BASE=/path/to/clean/develop/checkout node scripts/test.mjs
 *
 *   4. ONE DEFINITION. No `scripts/*.mjs` outside its comments names the plan directory except at its
 *      single definition.
 *
 * The cases marked CURRENT pin what is true today and what part B of ST-24 will change on purpose
 * (README and nested files stop being plan items). They are here so that change is a visible edit to a
 * test, not a silent one.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm, readdir } from "node:fs/promises";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  PLAN_DIR,
  collectSurface,
  conflictGroups,
  isExecutableItem,
  isPlanFile,
  markdownLines,
  readPlanItems,
} from "../scripts/standards.mjs";
import { PLAN_DIR as INIT_PLAN_DIR } from "../scripts/init.mjs";
import { collectPlanOwnership } from "../scripts/ownership.mjs";
import { legacyConflictGroups, legacyReadPlan, LEGACY_PLAN_FILE } from "./fixtures/plan-reader-reference/legacy.mjs";
import { CASES, POLICY, PLAN } from "./fixtures/plan-reader-reference/corpus.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const AMPLE = 64 * 1024 * 1024;
const BASE = process.env.ES_GOLDEN_BASE ? path.resolve(process.env.ES_GOLDEN_BASE) : null;

async function materialise(files) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "plan-reader-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(dir, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  await writeFile(path.join(dir, "project-policy.yml"), POLICY);
  return dir;
}

/** The comparable shape of a reader result: relative paths, and items reduced to what detectors read. */
const shape = (r, run) => ({
  planFiles: r.planFiles.map((f) => run.rel(f)),
  items: r.items.map((i) => ({ title: i.title, file: i.file, line: i.line, fields: [...i.fields], syntax: i.syntax })),
  executable: r.executable.map((i) => `${i.file}:${i.line}`),
  unreadable: r.unreadable,
  truncated: r.truncated,
});

// --- 1. reader equivalence ---------------------------------------------------------------------------

const observed = { truncated: 0, unreadable: 0, executable: 0, nonExecutable: 0, nested: 0, readme: 0 };

for (const c of CASES) {
  test(`readPlanItems equals the frozen inline reader: ${c.id}`, async () => {
    const dir = await materialise(c.files);
    try {
      const { run, files } = await collectSurface(dir, { maxTotalReadBytes: c.budget ?? AMPLE });
      const now = readPlanItems(files, run);
      const then = legacyReadPlan(files, run);
      assert.deepEqual(shape(now, run), shape(then, run));
      // The reader is the same object graph, not merely an equal one, for the parts detectors consume.
      assert.deepEqual(now.executable, then.executable);

      observed.truncated += now.truncated.length;
      observed.unreadable += now.unreadable.length;
      observed.executable += now.executable.length;
      observed.nonExecutable += now.items.length - now.executable.length;
      observed.nested += now.planFiles.filter((f) => run.rel(f).slice(PLAN.length + 1).includes("/")).length;
      observed.readme += now.planFiles.filter((f) => run.rel(f).endsWith("/README.md")).length;

      // An unread file is never given text, and a truncated one is never listed as whole.
      for (const u of now.unreadable) assert.ok(!now.items.some((i) => i.file === u.file), `${u.file} must contribute no items`);
      for (const f of now.truncated) assert.ok(run.truncated.has(files.find((x) => run.rel(x) === f)));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

test("the corpus exercises every reader state (it is not vacuous)", () => {
  assert.ok(observed.truncated >= 1, "a truncated plan file");
  assert.ok(observed.unreadable >= 1, "an unreadable plan file");
  assert.ok(observed.executable >= 5, "executable items");
  assert.ok(observed.nonExecutable >= 3, "items that are not executable");
  assert.ok(observed.nested >= 2, "nested plan files");
  assert.ok(observed.readme >= 2, "README plan files");
});

test("the exported predicates are the single plan-file and executable definitions", () => {
  for (const p of [
    `${PLAN}/01-a.md`,
    `${PLAN}/README.md`,
    `${PLAN}/notes/scratch.md`,
    `${PLAN}/.md`,
    `${PLAN}/a.MD`,
    `${PLAN}-old/01-a.md`,
    `docs/${PLAN}/01-a.md`,
    `${PLAN}/a.md.txt`,
    `${PLAN}`,
    `${PLAN}/`,
    "",
  ]) {
    assert.equal(isPlanFile(p), LEGACY_PLAN_FILE.test(p), p);
  }
  assert.equal(isExecutableItem({ fields: new Map([["Status", ""]]) }), true, "an empty Status is still a Status field");
  assert.equal(isExecutableItem({ fields: new Map([["Purpose", "p"]]) }), false);
});

test("CURRENT behaviour (ST-24 part B changes it): README.md and nested files are plan files", () => {
  assert.equal(isPlanFile(`${PLAN}/README.md`), true);
  assert.equal(isPlanFile(`${PLAN}/notes/scratch.md`), true);
  assert.equal(isPlanFile(`${PLAN}/unnumbered.md`), true);
});

test("CURRENT behaviour (ST-24 part B changes it): a README with an item and a Status is executable", async () => {
  const c = CASES.find((x) => x.id === "readme-item-shaped");
  const dir = await materialise(c.files);
  try {
    const { run, files } = await collectSurface(dir, { maxTotalReadBytes: AMPLE });
    const read = readPlanItems(files, run);
    assert.deepEqual(read.executable.map((i) => i.file).sort(), [`${PLAN}/01-a.md`, `${PLAN}/README.md`]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a field's continuation text reaches the reader through the item spans", async () => {
  const dir = await materialise({
    [`${PLAN}/01-a.md`]: "### Nested\n\n- **Status:** READY\n- **Acceptance Criteria:**\n  - first criterion\n  - second criterion\n- **Purpose:** p\n",
  });
  try {
    const { run, files } = await collectSurface(dir, { maxTotalReadBytes: AMPLE });
    const [one] = readPlanItems(files, run).items;
    assert.equal(one.fields.get("Acceptance Criteria"), "", "the first line of the value is empty");
    const span = one.spans.find((s) => s.key === "Acceptance Criteria");
    assert.match(span.text, /first criterion/);
    assert.match(span.text, /second criterion/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- 2. fence-walk equivalence -----------------------------------------------------------------------

const OPEN = "<".repeat(7);
const BASE_M = "|".repeat(7);
const SEP = "=".repeat(7);
const END = ">".repeat(7);
const group = [`${OPEN} ours`, "a", SEP, "b", `${END} theirs`];
const doc = (...lines) => lines.join("\n");

const FENCE_SAMPLES = {
  "backtick fence around a group": doc("```", ...group, "```"),
  "tilde fence around a group": doc("~~~", ...group, "~~~"),
  "indented fence (three spaces) around a group": doc("   ```", ...group, "   ```"),
  "four spaces is not a fence": doc("    ```", ...group, "    ```"),
  "a longer terminating fence": doc("```", ...group, "`````", ...group),
  "a shorter fence does not terminate": doc("`````", ...group, "```", ...group, "`````", ...group),
  "a different character does not terminate": doc("```", ...group, "~~~", ...group, "```", ...group),
  "an unterminated fence runs to the end": doc(...group, "```", ...group, ...group),
  "markers inside a group survive a fence": doc(OPEN, "a", "```", "x", "```", SEP, "b", END),
  "a fence cut by a conflict": doc("```", OPEN, "```", SEP, "```", END, "```", ...group),
  "diff3 base section": doc(OPEN, "a", BASE_M, "base", SEP, "b", END),
  "a fence line is never a marker": doc("```", END, "```"),
  "CRLF line endings": doc("```", ...group, "```", ...group).replace(/\n/g, "\r\n"),
  "an info string on the opener": doc("```js", ...group, "```", ...group),
  "a closer with an info string": doc("```", ...group, "```js", ...group),
  "empty text": "",
};

for (const [name, text] of Object.entries(FENCE_SAMPLES)) {
  for (const fenced of [true, false]) {
    test(`conflictGroups equals the frozen original: ${name} (fenced=${fenced})`, () => {
      assert.deepEqual(conflictGroups(text, fenced), legacyConflictGroups(text, fenced));
    });
  }
}

test("the fence samples are not vacuous: fences change the answer and groups are found", () => {
  const t = FENCE_SAMPLES["backtick fence around a group"];
  assert.deepEqual(conflictGroups(t, true), []);
  assert.equal(conflictGroups(t, false).length, 1);
  assert.equal(conflictGroups(FENCE_SAMPLES["a longer terminating fence"], true).length, 1);
});

test("conflictGroups equals the frozen original over a seeded fuzz of 3000 documents", () => {
  const alphabet = [
    "```", "~~~", "````", "~~~~", "  ```", "   ~~~", "    ```", "```js", "text", "", "# heading",
    `${OPEN} a`, SEP, `${BASE_M} b`, `${END} c`, OPEN, `${OPEN}<`, `${SEP}=`, " ```", "```` ",
  ];
  let seed = 0x5eed1234;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  let withGroups = 0;
  let fencedAway = 0;
  for (let n = 0; n < 3000; n += 1) {
    const lines = [];
    for (let k = 1 + Math.floor(next() * 10); k > 0; k -= 1) {
      // A whole group a third of the time, so the walk is asked about fences around real groups.
      if (next() < 0.33) lines.push(`${OPEN} a`, "x", SEP, "y", `${END} c`);
      else lines.push(alphabet[Math.floor(next() * alphabet.length)]);
    }
    const text = lines.join(next() < 0.2 ? "\r\n" : "\n");
    for (const fenced of [true, false]) {
      const now = conflictGroups(text, fenced);
      assert.deepEqual(now, legacyConflictGroups(text, fenced), JSON.stringify({ text, fenced }));
      if (fenced && now.length > 0) withGroups += 1;
    }
    if (conflictGroups(text, true).length !== conflictGroups(text, false).length) fencedAway += 1;
  }
  assert.ok(withGroups > 50, `fuzz found groups in only ${withGroups} documents`);
  assert.ok(fencedAway > 50, `fuzz exercised the fence in only ${fencedAway} documents`);
});

test("markdownLines exposes the in-fence flag and the fence-line flag per line", () => {
  const text = ["before", "```", "inside", "~~~", "```", "after", "~~~~", "tail"].join("\n");
  const rows = markdownLines(text).map((l) => [l.line, l.text, l.inFence, l.fenceLine]);
  assert.deepEqual(rows, [
    [1, "before", false, false],
    [2, "```", true, true],
    [3, "inside", true, false],
    [4, "~~~", true, false], // a different character is content, not a fence
    [5, "```", true, true],
    [6, "after", false, false],
    [7, "~~~~", true, true],
    [8, "tail", true, false], // unterminated: runs to the end
  ]);
});

test("markdownLines without fences reports nothing as fenced, and numbers CRLF lines", () => {
  const rows = markdownLines("a\r\n```\r\nb", { fenced: false });
  assert.deepEqual(rows.map((l) => [l.line, l.text, l.inFence, l.fenceLine]), [
    [1, "a", false, false],
    [2, "```", false, false],
    [3, "b", false, false],
  ]);
});

// --- 4. one definition -------------------------------------------------------------------------------

test("the plan directory is named in exactly one place in scripts/", () => {
  const dir = path.join(ROOT, "scripts");
  const hits = [];
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".mjs"))) {
    const lines = readFileSync(path.join(dir, name), "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!line.includes("project-plan-breakdown")) return;
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return; // documentation, not a use
      hits.push(`scripts/${name}:${i + 1}`);
    });
  }
  assert.equal(hits.length, 1, `plan directory literal outside comments: ${hits.join(", ")}`);
  assert.match(hits[0], /^scripts\/init\.mjs:/);
  assert.equal(PLAN_DIR, "artifacts/project-plan-breakdown");
  assert.equal(INIT_PLAN_DIR, PLAN_DIR, "standards.mjs re-exports the one constant");
});

// --- 3. envelope equivalence against a named baseline ------------------------------------------------

const normalise = (text, roots) => {
  let out = text;
  for (const r of roots) out = out.split(r).join("<ROOT>").split(r.split(path.sep).join("/")).join("<ROOT>");
  return out.replace(/"auditedAt":\s*"[^"]*"/g, '"auditedAt": "<TIME>"');
};

function cli(checkout, args) {
  const r = spawnSync(process.execPath, [path.join(checkout, "scripts", "standards.mjs"), ...args], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

function firstDifference(a, b) {
  const x = a.split("\n");
  const y = b.split("\n");
  for (let i = 0; i < Math.max(x.length, y.length); i += 1) {
    if (x[i] !== y[i]) return `line ${i + 1}\n  base: ${x[i]}\n  head: ${y[i]}`;
  }
  return "(no line difference)";
}

const baselineTargets = async () => {
  const targets = [];
  for (const c of CASES) targets.push({ id: `corpus:${c.id}`, files: c.files, budget: c.budget });
  const fixtures = path.join(HERE, "fixtures");
  for (const e of await readdir(fixtures, { withFileTypes: true })) {
    if (e.isDirectory()) targets.push({ id: `fixture:${e.name}`, dir: path.join(fixtures, e.name) });
  }
  targets.push({ id: "self", dir: ROOT });
  return targets;
};

test(
  "validate, audit, init and ownership are unchanged against the baseline checkout",
  { skip: BASE === null ? "set ES_GOLDEN_BASE to a clean checkout of the code to compare with" : false, timeout: 3_600_000 },
  async () => {
    assert.ok(existsSync(path.join(BASE, "scripts", "standards.mjs")), `ES_GOLDEN_BASE is not a checkout: ${BASE}`);
    assert.notEqual(BASE, ROOT, "the baseline must be a different checkout from the one under test");
    const baseOwnership = await import(pathToFileURL(path.join(BASE, "scripts", "ownership.mjs")).href);

    let compared = 0;
    for (const t of await baselineTargets()) {
      const made = t.files ? await materialise(t.files) : null;
      const dir = made ?? t.dir;
      try {
        const budget = `--max-total-read-bytes=${t.budget ?? AMPLE}`;
        const runs = [
          ["validate", `--dir=${dir}`, "--json", budget],
          ["audit", `--dir=${dir}`, "--json", budget],
          ["init", `--dir=${dir}`, "--dry-run", "--json"],
        ];
        for (const args of runs) {
          const roots = [dir, BASE, ROOT];
          const before = cli(BASE, args);
          const after = cli(ROOT, args);
          const label = `${t.id} :: ${args[0]}`;
          assert.equal(after.status, before.status, `${label}: exit code`);
          assert.equal(normalise(after.stderr, roots), normalise(before.stderr, roots), `${label}: stderr`);
          const a = normalise(after.stdout, roots);
          const b = normalise(before.stdout, roots);
          assert.ok(a === b, `${label}: output differs at ${firstDifference(b, a)}`);
          assert.ok(a.length > 0 || args[0] === "init", `${label}: produced no output`);
          compared += 1;
        }

        // Ownership: the same claims, problems and refusals, from the two collectors.
        const settle = async (collect) => {
          try {
            return { ok: await collect(dir) };
          } catch (e) {
            return { threw: normalise(String(e.message), [dir, BASE, ROOT]) };
          }
        };
        const head = await settle((d) => collectPlanOwnership(d));
        const base = await settle((d) => baseOwnership.collectPlanOwnership(d));
        assert.equal(
          normalise(JSON.stringify(head), [dir]),
          normalise(JSON.stringify(base), [dir]),
          `${t.id} :: ownership`,
        );
        compared += 1;
      } finally {
        if (made) await rm(made, { recursive: true, force: true });
      }
    }
    assert.ok(compared >= 3 * CASES.length, `compared only ${compared} outputs`);
    console.log(`# envelope equivalence: ${compared} comparisons against ${BASE}`);
  },
);

test("the baseline comparison is not itself blind: it normalises time and path and nothing else", () => {
  const s = normalise('{"auditedAt": "2026-01-01T00:00:00Z", "repo": "/x/y", "n": 1}', ["/x/y"]);
  assert.equal(s, '{"auditedAt": "<TIME>", "repo": "<ROOT>", "n": 1}');
  assert.notEqual(normalise('{"n": 1}', []), normalise('{"n": 2}', []));
});

/**
 * Issue #7, dimension B: the aggregate retained-evidence bound.
 *
 * Every fixture here is tracked, committed, first-party, ignored by nothing, carrying no vendor
 * marker, and outside `SKIP_DIRS` — content the exclusion boundary is REQUIRED to keep. That is what
 * keeps this dimension from being satisfiable by dimension A: if exclusion regressed to excluding
 * too much, these tests would fail rather than pass.
 *
 * WHAT IS ACTUALLY UNBOUNDED. `collectFiles` caps the file COUNT at `MAX_FILES`; `readText` caps each
 * individual read at `MAX_READ_BYTES`. Neither is a total, and two per-unit caps do not compose into
 * one. The audit then holds every text simultaneously — once in `contents`, and again in derived form
 * in `sources` for code files — so the retained ceiling is `MAX_FILES x MAX_READ_BYTES`, 20000 x
 * 400_000, about 8 GB, against a default heap of roughly 4 GB.
 *
 * WHY THIS IS NOT ALREADY FIXED BY THE EXCLUSION BOUNDARY. The original report blamed a vendored
 * virtualenv, and excluding it removed that instance. It did not remove the class: a large enough
 * tree of the project's OWN tracked code reaches the same ceiling with nothing to exclude and no
 * signal that could honestly exclude it. Dimension A cannot close this, which is why #7's closure
 * contract names it separately.
 *
 * WHY NOT PROVOKE A REAL OOM. A test whose pass depends on exhausting a real heap passes or fails on
 * the size of the machine running it: it needs `--max-old-space-size` tuning, it is slow, and it goes
 * green for the wrong reason on a larger host. Proving the bound HOLDS is a stronger claim than
 * proving a crash happens, so the budget is injectable per invocation and the assertions are on the
 * accounting. Injection is a CLI flag rather than an environment variable because ADR 0014 gives run
 * configuration to the invocation: a module-scoped read of `process.env` would put the run's own
 * configuration back into the process lifetime that ADR removed.
 *
 * THREE EVIDENCE-LOSS STATES, which must not collapse into one. They are different claims about what
 * a reader may conclude from a quiet result:
 *
 *   fileCapReached   never collected           (MAX_FILES)
 *   truncatedFiles   collected, read in part   (MAX_READ_BYTES)
 *   readBudget       collected, never opened   (the aggregate total)
 *
 * A run reporting the wrong one tells a reader a file was searched and found clean when nothing ever
 * looked at it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");

const SWALLOWED = ["def run():", "    try:", "        work()", "    except ValueError:", "        pass", ""].join("\n");

function audit(dir, { budget = null } = {}) {
  const flags = budget === null ? [] : [`--max-total-read-bytes=${budget}`];
  const r = spawnSync(process.execPath, [CLI, "audit", `--dir=${dir}`, "--json", ...flags], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  return r;
}

function surfaceOf(r) {
  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    assert.fail(`stdout was not JSON.\nstatus: ${r.status}\nstderr: ${r.stderr.slice(0, 2000)}`);
  }
  assert.ok(json.evidenceSurface, "the run reported no evidenceSurface at all");
  return json.evidenceSurface;
}

/**
 * A repository of tracked, committed, first-party Python files.
 *
 * Nothing here can be excluded: no `.gitignore` entry covers it, no `pyvenv.cfg` sits in it, no
 * directory name is in `SKIP_DIRS`, and every file is committed, so `ignoredEntries()` cannot claim
 * any of it. Returns the total content size so a test can ask for a budget that is genuinely ample
 * rather than one that merely looks large.
 */
async function buildTrackedTree(root, { files, kbEach }) {
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");

  await mkdir(path.join(root, "myapp"), { recursive: true });
  await writeFile(path.join(root, "pyproject.toml"), '[project]\nname = "myapp"\n');
  const padding = "x = 1  # padding\n".repeat(Math.ceil((kbEach * 1024) / 18));
  for (let i = 0; i < files; i++) {
    await writeFile(path.join(root, "myapp", `mod_${i}.py`), `${SWALLOWED}\n${padding}`);
  }
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "tracked first-party tree");
  return files * kbEach * 1024;
}

const tmp = () => mkdtemp(path.join(os.tmpdir(), "audit-budget-"));

/** ~2.5 MB of tracked content, well inside both per-unit caps and well outside the test budget. */
const TREE = { files: 40, kbEach: 64 };
const BUDGET = 512 * 1024;

test("retained evidence cannot exceed the budget the invocation was given", async () => {
  const root = await tmp();
  try {
    // Under the committed design the per-file cap (400 KB) and the file cap (20000) both pass on
    // this tree and the whole 2.5 MB is retained. The aggregate budget is the only thing that can
    // stop it, so this fails on the baseline for the right reason.
    await buildTrackedTree(root, TREE);
    const s = surfaceOf(audit(root, { budget: BUDGET }));

    assert.ok(s.readBudget, "the run reported no readBudget accounting at all");
    assert.equal(s.readBudget.limitBytes, BUDGET, "the budget the invocation asked for was not the one applied");
    assert.ok(
      s.readBudget.retainedBytes <= BUDGET,
      `retained ${s.readBudget.retainedBytes} bytes against a ${BUDGET}-byte budget`,
    );
    assert.equal(s.readBudget.exhausted, true, "a 2.5 MB tree under a 512 KB budget did not exhaust it");
    assert.ok(s.readBudget.unreadFiles > 0, "the budget was exhausted but no eligible file was reported unread");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unread eligible files are reported rather than silently treated as clean", async () => {
  const root = await tmp();
  try {
    await buildTrackedTree(root, TREE);
    const s = surfaceOf(audit(root, { budget: BUDGET }));

    assert.equal(s.complete, false, "the surface claimed completeness while eligible files went unread");
    assert.ok(
      Array.isArray(s.readBudget.sample) && s.readBudget.sample.length > 0,
      "no sample of the unread files was reported, so a reader cannot tell what went unsearched",
    );
    assert.ok(
      s.readBudget.sample.length < s.readBudget.unreadFiles,
      `the sample must be bounded below the count, got ${s.readBudget.sample.length} of ${s.readBudget.unreadFiles}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the three evidence-loss states stay distinct", async () => {
  const root = await tmp();
  try {
    await buildTrackedTree(root, TREE);
    const s = surfaceOf(audit(root, { budget: BUDGET }));

    // 64 KB files are far inside the 400 KB per-file cap and 40 files far inside the 20000 file cap,
    // so neither of the other two states may fire. Reporting one of them here would tell a reader a
    // file was searched in part, or never collected, when it was collected and never opened.
    assert.equal(s.fileCapReached, false, "budget exhaustion was misreported as the file-count cap");
    assert.deepEqual(s.truncatedFiles, [], "budget exhaustion was misreported as per-file truncation");
    assert.equal(s.readBudget.exhausted, true, "budget exhaustion was not reported as itself");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a tree inside the budget reports no loss and stays fully covered", async () => {
  const root = await tmp();
  try {
    // The green constraint, mirroring `tracked first-party code stays in scope`. A budget that is
    // never reached must change nothing at all. Without this, "bound the reads" would be satisfiable
    // by reading almost nothing — the same failure as excluding too much, one dimension over.
    const total = await buildTrackedTree(root, { files: 5, kbEach: 4 });
    const s = surfaceOf(audit(root, { budget: total * 100 }));

    assert.equal(s.readBudget.exhausted, false, "an ample budget was reported as exhausted");
    assert.equal(s.readBudget.unreadFiles, 0, "files went unread under an ample budget");
    assert.deepEqual(s.readBudget.sample, [], "an ample budget still named unread files");
    assert.equal(s.complete, true, "the surface reported incomplete coverage under an ample budget");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a default run applies a real budget rather than none at all", async () => {
  const root = await tmp();
  try {
    await buildTrackedTree(root, { files: 5, kbEach: 4 });
    const s = surfaceOf(audit(root));

    // The flag is for tests; the default is what every real invocation gets. A default of Infinity
    // would leave the ceiling exactly where it was and make every assertion above a statement about
    // test configuration rather than about the tool.
    assert.ok(Number.isFinite(s.readBudget.limitBytes), "the default run has no finite budget");
    assert.ok(s.readBudget.limitBytes > 0, "the default budget is not a positive number of bytes");
    assert.equal(s.readBudget.exhausted, false, "a five-file repository exhausted the default budget");
    assert.ok(s.readBudget.retainedBytes > 0, "the run retained nothing, so the accounting measures nothing");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an unusable budget is an invocation error, not a silent fallback", async () => {
  const root = await tmp();
  try {
    await buildTrackedTree(root, { files: 2, kbEach: 1 });
    for (const bad of ["nonsense", "0", "-1"]) {
      const r = audit(root, { budget: bad });
      // Falling back to the default would run the audit under a bound the caller did not ask for and
      // report a surface as though it had. That is the same silence this issue exists to remove.
      assert.equal(r.status, 2, `--max-total-read-bytes=${bad} was accepted; exit was ${r.status}`);
      assert.match(r.stderr, /max-total-read-bytes/, `the refusal did not name the flag: ${r.stderr.slice(0, 200)}`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Review findings, both reproduced before they were fixed
// ---------------------------------------------------------------------------

/**
 * A recognised text file whose bytes are not valid UTF-8.
 *
 * Decoding replaces each invalid byte with U+FFFD, three bytes each, so the retained text is three
 * times the file's size on disk. A cap that measured cost from the size would let this through and
 * then retain triple its own limit.
 */
async function buildInvalidUtf8Tree(root, { bytes }) {
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  await mkdir(path.join(root, "myapp"), { recursive: true });
  await writeFile(path.join(root, "pyproject.toml"), '[project]\nname = "myapp"\n');
  await writeFile(path.join(root, "myapp", "blob.js"), Buffer.alloc(bytes, 0xff));
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "invalid utf-8");
}

test("a file that expands when decoded cannot breach the budget", async () => {
  const root = await tmp();
  try {
    // 300 KB of 0xff sits inside the 400 KB per-file cap on disk and decodes to 900 KB of
    // replacement characters. Measuring the cost from the size on disk admitted it and then retained
    // 900_000 bytes against a 400_000-byte limit, which is the invariant this cap exists to hold.
    await buildInvalidUtf8Tree(root, { bytes: 300_000 });
    const limit = 400_000;
    const s = surfaceOf(audit(root, { budget: limit }));

    assert.ok(
      s.readBudget.retainedBytes <= limit,
      `retained ${s.readBudget.retainedBytes} bytes against a ${limit}-byte budget`,
    );
    // And the file is accounted for rather than silently dropped: opened at the boundary, not
    // retained, and reported among the files nothing searched.
    assert.equal(s.readBudget.exhausted, true, "the oversized file was absorbed instead of reported");
    assert.ok(s.readBudget.unreadFiles > 0, "a file went unsearched with no record");
    assert.equal(s.complete, false, "the surface claimed completeness over a file nothing searched");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * A repository whose policy governs the rules whose evidence is file contents.
 *
 * Each is satisfied by an absence, so each passes most confidently when the least was read. That is
 * the shape this test exists to refuse: a passing rule over a file no detector opened.
 */
async function buildGovernedTree(root, { files, kbEach }) {
  const total = await buildTrackedTree(root, { files, kbEach });
  // The framework refuses a policy declaring a different standardVersion, and rightly: a verdict
  // reported under a version that did not evaluate it would misstate its own provenance. Read rather
  // than hardcoded, so the next version bump does not silently turn this test into a VERSION_MISMATCH
  // that never reaches the assertions.
  const version = JSON.parse(await readFile(path.join(HERE, "..", "package.json"), "utf8")).version;
  await writeFile(
    path.join(root, "project-policy.yml"),
    [
      `standardVersion: "${version}"`,
      "",
      "rules:",
      "  errors.no-swallowed-exceptions:",
      "    level: forbidden",
      "  security.no-sql-concat:",
      "    level: forbidden",
      "  quality.dead-code:",
      "    level: required",
      "",
    ].join("\n"),
  );
  const git = (...args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  git("add", "-A");
  git("-c", "commit.gpgsign=false", "commit", "-qm", "policy");
  return total;
}

function validate(dir, { budget = null } = {}) {
  const flags = budget === null ? [] : [`--max-total-read-bytes=${budget}`];
  const r = spawnSync(process.execPath, [CLI, "validate", `--dir=${dir}`, "--json", ...flags], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  try {
    return JSON.parse(r.stdout);
  } catch {
    assert.fail(`stdout was not JSON.\nstatus: ${r.status}\nstderr: ${r.stderr.slice(0, 2000)}`);
  }
}

const CONTENT_RULES = ["errors.no-swallowed-exceptions", "security.no-sql-concat", "quality.dead-code"];

const statusOf = (report, ruleId) => report.results.find((r) => r.ruleId === ruleId);

test("a content rule cannot pass over files nothing searched", async () => {
  const root = await tmp();
  try {
    await buildGovernedTree(root, TREE);

    // The control: with the whole surface read, these rules really are evaluated. Without this the
    // assertion below would also hold for a run in which they were never evaluated at all, and would
    // establish nothing.
    const whole = validate(root);
    for (const id of CONTENT_RULES) {
      const hit = statusOf(whole, id);
      assert.ok(hit, `${id} is not in the report at all, so the comparison below is vacuous`);
      assert.equal(hit.disposition, "evaluated", `${id} was not evaluated even over a complete surface`);
    }

    // The same repository, read under a budget that leaves files unsearched. A prohibited construct
    // in a file no detector opened would otherwise produce a passing rule, and a passing rule can
    // produce a COMPLIANT verdict over evidence nobody has.
    const partial = validate(root, { budget: BUDGET });
    // `validate`'s envelope carries findings rather than the audit's evidenceSurface, so the
    // exhaustion is confirmed from the finding the run emitted for it.
    assert.ok(
      (partial.findings ?? []).some((f) => f.id === "evidence-read-budget"),
      "the run did not report an exhausted budget, so the assertions below prove nothing",
    );
    for (const id of CONTENT_RULES) {
      const hit = statusOf(partial, id);
      assert.ok(hit, `${id} disappeared from the report entirely`);
      assert.notEqual(
        hit.status,
        "passed",
        `${id} passed over a surface with unsearched files: ${JSON.stringify(hit)}`,
      );
      assert.notEqual(hit.disposition, "evaluated", `${id} claimed evaluation over unsearched files`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

/**
 * NOT TESTED, and disclosed rather than implied: the file-count cap.
 *
 * `surfaceLoss.capped` shares the withdrawal expression with the budget — `filesWentUnsearched` is
 * one condition covering both — so the rule set and the withdrawal are exercised above. What no test
 * drives is the `capped` half of that OR, because reaching `MAX_FILES` means creating twenty
 * thousand files. This is the same limitation the evidence-surface work already recorded for the
 * traversal cap, stated here for the same reason: a gap that is disclosed is a known gap, and a gap
 * that is implied to be covered is a false green.
 */

/**
 * The documented scope of `--max-total-read-bytes`, pinned against the commands that honour it.
 *
 * The help text said `audit only` while this file's own tests drove the flag through `validate`,
 * where the budget decides whether content-derived rules stay evaluated — the flag's most
 * consequential effect was reachable by a command the help said it did not apply to. A reader
 * checking whether a verdict was taken under a reduced surface would have been told to look at the
 * wrong command.
 *
 * Prose alone would drift again, so scope is asserted from BEHAVIOUR in both directions: each
 * command the help names must demonstrably honour the flag, and the command it excludes must
 * demonstrably ignore it. Restoring `audit only`, or making the flag inert under `validate`, fails
 * here and nowhere else.
 */
test("--max-total-read-bytes is documented for exactly the commands that honour it", async () => {
  const help = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, "--help must succeed");
  const documented = help.stdout
    .split("\n")
    .find((l) => l.includes("--max-total-read-bytes"));
  assert.ok(documented, "the flag must be documented at all");

  // The claim under test, read from the help rather than assumed.
  assert.match(documented, /audit and validate/, "the help must name both commands that honour the flag");
  assert.doesNotMatch(documented, /audit only/, "`audit only` was the false claim this test exists to catch");

  const root = await tmp();
  try {
    await buildGovernedTree(root, TREE);

    // audit honours it: the bound it was given is the bound it reports.
    const audited = JSON.parse(audit(root, { budget: BUDGET }).stdout);
    assert.equal(
      audited.evidenceSurface.readBudget.limitBytes,
      BUDGET,
      "audit did not run under the budget it was given",
    );
    assert.equal(
      audited.evidenceSurface.readBudget.exhausted,
      true,
      "the fixture must exhaust the budget, or this proves nothing about either command",
    );

    // validate honours it too — the half the help used to deny, and the half that reaches a verdict.
    const validated = validate(root, { budget: BUDGET });
    assert.ok(
      (validated.findings ?? []).some((f) => f.id === "evidence-read-budget"),
      "validate ignored the budget, so the documented scope overstates it",
    );

    // init is excluded, and the help says why: it returns before the walk. Accepted, and inert.
    const inited = spawnSync(
      process.execPath,
      [CLI, "init", `--dir=${root}`, "--dry-run", "--json", `--max-total-read-bytes=${BUDGET}`],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    assert.notEqual(inited.status, 2, `init must accept the flag, not refuse it: ${inited.stderr.slice(0, 500)}`);
    assert.doesNotMatch(
      inited.stdout,
      /readBudget/,
      "init reported a read budget, so excluding it from the documented scope is wrong",
    );

    // `inert` is about the BUDGET, not about validation. The value is checked in
    // `checkInvocation` before `init` returns, so an unusable one is refused there too — and the
    // help says so, because `accepted and inert` on its own reads as though `init` would take any
    // value at all. Review caught that the first wording overclaimed and the first test only
    // exercised a valid value, which could not have detected it.
    for (const bad of ["0", "-5", "nonsense"]) {
      const refused = spawnSync(
        process.execPath,
        [CLI, "init", `--dir=${root}`, "--dry-run", "--json", `--max-total-read-bytes=${bad}`],
        { encoding: "utf8" },
      );
      assert.equal(
        refused.status,
        2,
        `init must refuse the unusable value ${bad} rather than fall back to the default`,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

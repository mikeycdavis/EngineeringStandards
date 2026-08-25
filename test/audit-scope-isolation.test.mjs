/**
 * Issue #7, dimension A: what the audit's evidence surface covers, and whether it says so.
 *
 * The exclusion boundary landed on `develop` already. These are the acceptance criteria it did NOT
 * establish. They are kept apart from the aggregate read bound (dimension B, in
 * `audit-read-budget.test.mjs`) deliberately, and the separation is a property rather than a filing
 * convention: a tree excluded from the walk can never exhaust memory, so a green exclusion suite
 * says nothing whatever about a large TRACKED tree — and a green budget suite, whose every fixture
 * is content exclusion is required to keep, says nothing about exclusion. Neither dimension can
 * close #7 on the other's behalf.
 *
 * WHY THE EXISTING FIXTURE PROVES ONLY HALF OF THIS. `audit-exclusions.test.mjs` builds its fixture
 * with `buildRepo`, which writes a `.gitignore` and never runs `git init` — the file contains no
 * `git` invocation at all. With no repository, `ignoredEntries()` fails, the run reports
 * `exclusionsFrom: "unavailable"`, the exclusion set is empty, and the `.gitignore` it wrote is
 * inert. Measured against the committed baseline, that fixture excludes its virtualenv with the
 * reason `vendored dependency tree`: the MARKER signal, every time. The repository-ignore signal has
 * never been exercised by any test in this repository.
 *
 * ORDERING IS NOT THE REASON, AND IS NOT PROOF. The ignore check does run before the marker check —
 * a child directory is tested against the ignore set in its parent's loop, while `VENDOR_MARKERS` is
 * consulted only after the directory is entered — so in a real repository a tree carrying both
 * signals is excluded by the ignore branch and the marker branch is masked. But ordering only
 * decides an outcome when both signals are available, and in that fixture one of them is not. A
 * fixture carrying both signals therefore cannot demonstrate either one, whichever fires: with no
 * repository it proves the marker, and with a repository it proves the ignore branch while hiding
 * whether the marker works at all.
 *
 * So isolation needs two fixtures, each a real repository, each carrying exactly one signal, and
 * each asserting the recorded REASON. Asserting on the absence of findings would not distinguish
 * which signal fired — nor a signal firing from a tree the walk simply never reached.
 *
 * `.mypy_cache/` cannot serve as the marker-less fixture: it is in `SKIP_DIRS`, so it is removed by
 * a third path entirely and would prove nothing about the repository signal.
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

/** The offending content, defined once. Every paired assertion below uses these exact bytes. */
const SWALLOWED = ["def run():", "    try:", "        work()", "    except ValueError:", "        pass", ""].join("\n");

function audit(dir) {
  const r = spawnSync(process.execPath, [CLI, "audit", `--dir=${dir}`, "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  return r;
}

function parse(r) {
  try {
    return JSON.parse(r.stdout);
  } catch {
    assert.fail(`stdout was not JSON.\nstatus: ${r.status}\nstderr: ${r.stderr.slice(0, 2000)}`);
  }
}

function surfaceOf(r) {
  const s = parse(r).evidenceSurface;
  assert.ok(s, "the run reported no evidenceSurface at all");
  return s;
}

/** Every evidence string across every finding, flattened — the detectors vary in shape. */
function evidenceOf(json) {
  const out = [];
  for (const f of json.findings ?? []) {
    for (const e of f.evidence ?? f.files ?? f.paths ?? []) out.push(String(e));
  }
  return out;
}

/**
 * A real git repository, because the repository-ignore signal cannot be exercised without one.
 *
 * Committing is what makes the distinction observable: `git ls-files --others --ignored` answers
 * only relative to a repository that exists, and it reports a path as ignored only when that path is
 * also untracked. A fixture that writes `.gitignore` into a bare temp directory has neither.
 */
async function initRepo(root) {
  const git = (...args) => {
    const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
    assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  return () => {
    git("add", "-A");
    git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
  };
}

/**
 * First-party code every fixture carries, including one genuine defect.
 *
 * The defect is the load-bearing part: without it, a fix that excluded everything would satisfy each
 * exclusion assertion below and report nothing at all. This is the same constraint
 * `tracked first-party code stays in scope` exists for, restated so every fixture in this file
 * carries it rather than one.
 */
async function firstParty(root) {
  await mkdir(path.join(root, "myapp"), { recursive: true });
  await writeFile(path.join(root, "pyproject.toml"), '[project]\nname = "myapp"\n');
  await writeFile(path.join(root, "myapp", "service.py"), SWALLOWED);
  await writeFile(path.join(root, "myapp", "clean.py"), "def add(a, b):\n    return a + b\n");
}

function excludedDir(surface, p) {
  return (surface.excludedDirectories ?? []).find((e) => e.path === p);
}

const tmp = () => mkdtemp(path.join(os.tmpdir(), "audit-scope-"));

// ---------------------------------------------------------------------------
// 1. Signal isolation — each signal proved where it is the only one available
// ---------------------------------------------------------------------------

test("an ignored tree carrying no marker is excluded BY THE REPOSITORY signal", async () => {
  const root = await tmp();
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    // Ignored, untracked, no `pyvenv.cfg`, and a name `SKIP_DIRS` does not know. Neither of the
    // other two exclusion paths can apply, so a correct exclusion here has exactly one explanation.
    const gen = path.join(root, "generated-cache");
    await mkdir(gen, { recursive: true });
    await writeFile(path.join(gen, "blob.py"), SWALLOWED);
    await writeFile(path.join(root, ".gitignore"), "generated-cache/\n");
    commit();

    const s = surfaceOf(audit(root));
    assert.equal(s.exclusionsFrom, "repository", "the repository signal was unavailable, so this proves nothing");
    const hit = excludedDir(s, "generated-cache");
    assert.ok(hit, `generated-cache was not recorded as excluded; got ${JSON.stringify(s.excludedDirectories)}`);
    assert.equal(
      hit.reason,
      "ignored by the repository",
      `excluded for the wrong reason: ${hit.reason} — no marker and no SKIP_DIRS name applies to this tree`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a marker tree the repository does not ignore is excluded BY THE MARKER signal", async () => {
  const root = await tmp();
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    // Carries `pyvenv.cfg`, is committed, and is not named in `.gitignore`, so the repository cannot
    // claim it. The repository exists and answers — which is what separates this case from "no
    // signal was available", where the marker would fire for want of an alternative.
    const venv = path.join(root, "env-3.13");
    await mkdir(path.join(venv, "Lib", "site-packages"), { recursive: true });
    await writeFile(path.join(venv, "pyvenv.cfg"), "home = C\nversion = 3.13.0\n");
    await writeFile(path.join(venv, "Lib", "site-packages", "dep.py"), SWALLOWED);
    await writeFile(path.join(root, ".gitignore"), "nothing-here/\n");
    commit();

    const s = surfaceOf(audit(root));
    assert.equal(s.exclusionsFrom, "repository", "the repository was unavailable, so the marker won by default");
    const hit = excludedDir(s, "env-3.13");
    assert.ok(hit, `env-3.13 was not recorded as excluded; got ${JSON.stringify(s.excludedDirectories)}`);
    assert.equal(
      hit.reason,
      "vendored dependency tree",
      `excluded for the wrong reason: ${hit.reason} — this tree is committed and is not ignored`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the fixture that carries both signals cannot isolate either", async () => {
  const root = await tmp();
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    // The shape `audit-exclusions.test.mjs` builds, plus the repository it lacks. Both signals apply.
    const venv = path.join(root, "test-env-3.13");
    await mkdir(venv, { recursive: true });
    await writeFile(path.join(venv, "pyvenv.cfg"), "version = 3.13.0\n");
    await writeFile(path.join(venv, "dep.py"), SWALLOWED);
    await writeFile(path.join(root, ".gitignore"), "test-env-3.13/\n");
    commit();

    // The ignore branch runs in the parent's loop, before the directory is entered and before
    // `VENDOR_MARKERS` is ever consulted. So this records the ignore reason and says nothing about
    // whether the marker works — which is precisely why the two tests above exist as separate
    // fixtures, and why ordering is not a substitute for isolating a signal.
    const hit = excludedDir(surfaceOf(audit(root)), "test-env-3.13");
    assert.ok(hit, "the tree was not excluded at all");
    assert.equal(hit.reason, "ignored by the repository", `unexpected reason: ${hit.reason}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. Paired scope invariance — the same bytes, at the same path, judged differently
// ---------------------------------------------------------------------------

test("identical content is reported when governed and excluded when ignored", async () => {
  const ignoredRoot = await tmp();
  const trackedRoot = await tmp();
  try {
    // Same relative path, same bytes, same repository shape. The ONLY difference between the two is
    // which line `.gitignore` carries, so nothing but scope can explain a difference in the verdict.
    const REL = path.join("thirdparty", "widget.py");

    for (const root of [ignoredRoot, trackedRoot]) {
      const commit = await initRepo(root);
      await firstParty(root);
      await mkdir(path.join(root, "thirdparty"), { recursive: true });
      await writeFile(path.join(root, REL), SWALLOWED);
      await writeFile(path.join(root, ".gitignore"), root === ignoredRoot ? "thirdparty/\n" : "unrelated/\n");
      commit();
    }

    const ignoredEvidence = evidenceOf(parse(audit(ignoredRoot)));
    const trackedEvidence = evidenceOf(parse(audit(trackedRoot)));

    assert.ok(
      trackedEvidence.some((e) => e.includes("widget.py")),
      `governed content was not reported; evidence was ${JSON.stringify(trackedEvidence.slice(0, 10))}`,
    );
    assert.ok(
      !ignoredEvidence.some((e) => e.includes("widget.py")),
      `ignored content was still reported; evidence was ${JSON.stringify(ignoredEvidence.slice(0, 10))}`,
    );

    // The invariance half, and the half that stops a fix passing by excluding too much: the verdict
    // changed because scope changed, not because the audit went quieter in general. First-party
    // coverage must be byte-for-byte identical on both sides.
    const [ignoredFirstParty, trackedFirstParty] = [ignoredEvidence, trackedEvidence].map((ev) =>
      ev.filter((e) => e.includes("myapp")).sort(),
    );
    assert.ok(ignoredFirstParty.length > 0, "neither run reported first-party code, so this compares nothing");
    assert.deepEqual(
      ignoredFirstParty,
      trackedFirstParty,
      "first-party coverage differed between the two repositories, so scope was not the only variable",
    );
  } finally {
    await rm(ignoredRoot, { recursive: true, force: true });
    await rm(trackedRoot, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. Honest exclusion accounting — no path leaves the walk without a record
// ---------------------------------------------------------------------------

test("a SKIP_DIRS directory is recorded rather than silently dropped", async () => {
  const root = await tmp();
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    // `.mypy_cache` is in `SKIP_DIRS`, where a directory used to leave through a bare `continue`.
    // An exclusion nobody can see is indistinguishable from a detector that missed something, which
    // is the same defect class as a silent cap.
    const cache = path.join(root, ".mypy_cache");
    await mkdir(cache, { recursive: true });
    await writeFile(path.join(cache, "cached.py"), SWALLOWED);
    commit();

    const s = surfaceOf(audit(root));
    const hit = excludedDir(s, ".mypy_cache");
    assert.ok(
      hit,
      "`.mypy_cache` left the walk with no record; excludedDirectories was " +
        JSON.stringify(s.excludedDirectories),
    );
    assert.equal(hit.reason, "conventional non-project directory", `unexpected reason: ${hit.reason}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("ignored files are accounted for in aggregate rather than per file", async () => {
  const root = await tmp();
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    // Individual ignored FILES, not a directory, and code files the walk would otherwise have
    // scanned. The contract is deliberately not one entry each: listing every generated artifact
    // beside tracked code would bury the directory-level exclusions that actually change what a run
    // covers. Aggregated is not silent; per-file would be honest and unreadable.
    for (let i = 0; i < 12; i++) {
      await writeFile(path.join(root, "myapp", `generated_${i}.py`), SWALLOWED);
    }
    await writeFile(path.join(root, ".gitignore"), "myapp/generated_*.py\n");
    commit();

    const s = surfaceOf(audit(root));
    assert.ok(s.excludedFiles, "ignored files were dropped with no aggregate record at all");
    assert.equal(s.excludedFiles.count, 12, `expected 12 ignored files, got ${s.excludedFiles.count}`);
    assert.ok(
      Array.isArray(s.excludedFiles.sample) && s.excludedFiles.sample.length > 0,
      "the aggregate named none of the excluded files, so a reader cannot tell what kind of thing left",
    );
    assert.ok(
      s.excludedFiles.sample.length < s.excludedFiles.count,
      `the sample must be bounded below the count, got ${s.excludedFiles.sample.length} of ${s.excludedFiles.count}`,
    );
    assert.ok(
      s.excludedFiles.sample.every((p) => p.includes("generated_")),
      `the sample did not name the excluded files: ${JSON.stringify(s.excludedFiles.sample)}`,
    );
    // And the exclusion really did remove them from the results, rather than merely counting them.
    const evidence = evidenceOf(parse(audit(root)));
    assert.ok(!evidence.some((e) => e.includes("generated_")), "ignored files were counted AND still reported");
    assert.ok(
      evidence.some((e) => e.includes("service.py")),
      "first-party code was excluded along with the ignored files",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Completeness is a claim about evidence, and only the project may narrow it
//
// Acceptance criterion 7 on the audit-exclusions item. The three exclusion authorities are not
// interchangeable: a project that marks content ignored has declared it disposable, and a run that
// skips it has lost nothing. A hardcoded name list has declared nothing, so when it removes tracked
// content the run has lost project evidence and may not go on calling its surface complete.
//
// Both halves are load-bearing. A fix that simply made every exclusion incomplete would satisfy the
// first test and fail the second, which is why the second exists.
// ---------------------------------------------------------------------------

/** Rule dispositions, for the polarity the surface flags alone cannot show. */
function validateRules(dir) {
  const r = spawnSync(process.execPath, [CLI, "validate", `--dir=${dir}`, "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  let json;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    assert.fail(`stdout was not JSON. status: ${r.status} stderr: ${r.stderr.slice(0, 2000)}`);
  }
  return new Map(json.results.map((x) => [x.ruleId, x]));
}

async function policy(root) {
  await writeFile(path.join(root, "project-policy.yml"), `standardVersion: "2.0.0"\n`);
}

test("a tool-decided exclusion over tracked content makes the surface incomplete", async () => {
  const root = await tmp();
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    // `fixtures` is in SKIP_DIRS. Nothing here is ignored, nothing carries a marker, and the content
    // is committed, so the ONLY thing removing it is the name.
    await mkdir(path.join(root, "fixtures"), { recursive: true });
    await writeFile(path.join(root, "fixtures", "vendored.py"), SWALLOWED);
    commit();

    const s = surfaceOf(audit(root));
    const hit = excludedDir(s, "fixtures");
    assert.ok(hit, `fixtures left no record; excludedDirectories was ${JSON.stringify(s.excludedDirectories)}`);
    assert.equal(hit.authority, "framework", "the name list is not the project speaking");
    assert.equal(hit.evidenceLost, true, "committed content under the excluded tree was not recognised as lost");
    assert.equal(
      s.complete,
      false,
      `the run dropped tracked content and still claimed a complete surface: ${JSON.stringify(s)}`,
    );
    assert.ok(
      (s.evidenceLosses ?? []).includes("framework-exclusion"),
      `the loss was not attributed; evidenceLosses was ${JSON.stringify(s.evidenceLosses)}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a repository-authorized exclusion leaves the surface complete", async () => {
  // The over-correction guard, and the reason criterion 7 names two outcomes rather than one. The
  // cheap way to pass the test above is to make every exclusion defeat completeness; that fix fails
  // here, because the project declaring content disposable is not the framework losing evidence.
  const root = await tmp();
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    await mkdir(path.join(root, "thirdparty"), { recursive: true });
    await writeFile(path.join(root, "thirdparty", "widget.py"), SWALLOWED);
    await writeFile(path.join(root, ".gitignore"), "thirdparty/\n");
    commit();

    const s = surfaceOf(audit(root));
    const hit = excludedDir(s, "thirdparty");
    assert.ok(hit, `thirdparty left no record; excludedDirectories was ${JSON.stringify(s.excludedDirectories)}`);
    assert.equal(hit.authority, "project", "an ignored tree is the project's own decision");
    assert.equal(
      s.complete,
      true,
      `an exclusion the project declared was treated as lost evidence: ${JSON.stringify(s)}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a tool-decided exclusion that removes no committed content leaves the surface complete", async () => {
  // `.git` and `dist` are excluded by name in every run of every repository. If the name alone were
  // the test, no repository could ever report a complete surface and the flag would carry no
  // information at all. What makes an exclusion a loss is committed content behind it, which is a
  // question for the repository rather than for the name.
  const root = await tmp();
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    commit();
    // Written after the commit so it is genuinely untracked rather than merely ignored.
    await mkdir(path.join(root, "dist"), { recursive: true });
    await writeFile(path.join(root, "dist", "bundle.py"), SWALLOWED);

    const s = surfaceOf(audit(root));
    for (const p of ["dist", ".git"]) {
      const hit = excludedDir(s, p);
      if (!hit) continue;
      assert.equal(hit.authority, "framework", `${p} should be excluded on the framework's authority`);
      assert.equal(hit.evidenceLost, false, `${p} holds nothing committed but was counted as lost evidence`);
    }
    assert.ok(excludedDir(s, "dist"), "dist was not recorded at all");
    assert.equal(
      s.complete,
      true,
      `an exclusion that cost the run nothing was treated as incompleteness: ${JSON.stringify(s)}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a content rule does not report passed over a tool-excluded tracked tree", async () => {
  // The surface flag and the verdict are two claims, and only the second is what a reader acts on.
  // Criterion 1 is defeated by the pair: the report names the exclusion AND asserts the rule passed,
  // so the exclusion is visible while its consequence is not. Withdrawal is what separates them.
  const root = await tmp();
  try {
    const commit = await initRepo(root);
    await policy(root);
    await mkdir(path.join(root, "myapp"), { recursive: true });
    await writeFile(path.join(root, "myapp", "clean.py"), "def add(a, b):\n    return a + b\n");
    await mkdir(path.join(root, "fixtures"), { recursive: true });
    await writeFile(path.join(root, "fixtures", "vendored.py"), SWALLOWED);
    commit();

    const hidden = validateRules(root).get("errors.no-swallowed-exceptions");
    assert.ok(hidden, "the rule is absent from the report entirely");
    assert.notEqual(
      hidden.status,
      "passed",
      "a content rule reported passed over a tracked tree the run never opened",
    );
    assert.equal(hidden.disposition, "not-evaluated", `unexpected disposition: ${hidden.disposition}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

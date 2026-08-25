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

/**
 * The same run without `--json`. Every other assertion in this file reads the machine surface, and
 * that is exactly how the rendering defect below survived: `frameworkExcludedDirectories` was
 * correct in the JSON while the sentence a person reads named nothing at all.
 */
function auditHuman(dir) {
  const r = spawnSync(process.execPath, [CLI, "audit", `--dir=${dir}`], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(r.error, undefined, `spawn failed: ${r.error}`);
  return r.stdout;
}

/** The reason list from the incomplete-surface header, or `null` if no such header was printed. */
function incompleteHeader(out) {
  const m = out.match(/^Evidence surface INCOMPLETE — (.*)\. Results below/m);
  return m ? m[1] : null;
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

/**
 * Criterion 7: a framework-caused loss of eligible project evidence makes the evidence surface
 * incomplete.
 *
 * This is the criterion that reopened #7 after the item had closed on six. The exclusion boundary
 * records what it removed — criterion 2, met — and then asserted `complete: true` beside the record,
 * so a consumer reading the surface was told the evidence was whole while a tracked first-party tree
 * had never been opened. Measured on this repository itself: `test/fixtures` is tracked, committed,
 * first-party, excluded by name, and the run called its surface complete.
 *
 * The four tests below are one specimen and three controls, and the controls are not decoration. The
 * criterion forbids a blanket rule as explicitly as it requires the fix: repository-ignored content
 * is legitimately outside the evidence surface, so an implementation that made every exclusion mean
 * incompleteness must FAIL here rather than pass. It did. The first implementation of this criterion
 * counted `.git` as lost project evidence and reported every repository on earth incomplete,
 * including one with nothing excluded at all — caught by the last test in this file, before review.
 *
 * What these do NOT assert is the rule verdict. `security.no-sql-concat` still reports `passed` over
 * the excluded bait, and that is #38's defect, not this one. Keeping the two apart is why each
 * falsifier can prove one invariant without the other fix making its test green by accident.
 */

/** A tracked, committed, first-party defect inside a directory `SKIP_DIRS` removes by name. */
async function baitIn(root, dir) {
  await mkdir(path.join(root, dir), { recursive: true });
  await writeFile(path.join(root, dir, "service.py"), SWALLOWED);
}

test("a tool-decided exclusion of tracked first-party code makes the surface incomplete", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-excl-complete-"));
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    await baitIn(root, "fixtures");
    commit();

    const surface = surfaceOf(audit(root));
    const hit = excludedDir(surface, "fixtures");
    assert.ok(hit, `fixtures was not excluded at all: ${JSON.stringify(surface.excludedDirectories)}`);
    assert.equal(hit.reason, "conventional non-project directory");
    assert.equal(hit.authorizedBy, "framework", "a name match is this tool's decision, not the project's");

    assert.equal(
      surface.complete,
      false,
      "the surface claimed completeness over a tracked tree this tool dropped from a hardcoded name",
    );
    assert.deepEqual(surface.frameworkExcludedDirectories, ["fixtures"]);

    // Load-bearing: without it, an implementation that excluded the whole repository would satisfy
    // every assertion above by reporting nothing and losing everything.
    assert.ok(
      evidenceOf(parse(audit(root))).some((e) => e.includes("service.py")),
      "first-party code outside the exclusion went unreported, so the run lost more than the tree",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a repository-authorized exclusion leaves the surface complete", async () => {
  // THE FALSIFIER the criterion names. A blanket "any exclusion means incomplete" fails here, and
  // that is the point: the project declared this tree disposable, so honouring the declaration loses
  // nothing the run was ever owed. Content, and the defect in it, are identical to the test above.
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-excl-authorized-"));
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    await baitIn(root, "thirdparty");
    await writeFile(path.join(root, ".gitignore"), "thirdparty/\n");
    commit();

    const surface = surfaceOf(audit(root));
    const hit = excludedDir(surface, "thirdparty");
    assert.ok(hit, `thirdparty was not excluded: ${JSON.stringify(surface.excludedDirectories)}`);
    assert.equal(hit.reason, "ignored by the repository");
    assert.equal(hit.authorizedBy, "repository");

    assert.equal(surface.complete, true, "a project's own declaration was counted as this tool's loss");
    assert.deepEqual(surface.frameworkExcludedDirectories, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a SKIP_DIRS name the repository also ignores is the project's decision, not this tool's", async () => {
  // The case that decides whether the criterion is meaningful in practice rather than only in a
  // fixture. SKIP_DIRS is consulted BEFORE the ignore set, so a name match wins the reported reason
  // even when the repository independently ignores the same path — which is the ordinary state of
  // every real dependency tree. Attributing authority from the reason alone would therefore report
  // almost every repository as having lost evidence it had itself declared disposable.
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-excl-both-"));
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    await baitIn(root, "vendor");
    await writeFile(path.join(root, ".gitignore"), "vendor/\n");
    commit();

    const surface = surfaceOf(audit(root));
    const hit = excludedDir(surface, "vendor");
    assert.ok(hit, `vendor was not excluded: ${JSON.stringify(surface.excludedDirectories)}`);
    // The reason still reports which branch removed it. Only the authority is re-derived.
    assert.equal(hit.reason, "conventional non-project directory");
    assert.equal(hit.authorizedBy, "repository", "the repository's declaration was overridden by a name match");

    assert.equal(surface.complete, true);
    assert.deepEqual(surface.frameworkExcludedDirectories, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the repository's own .git directory cannot make a surface incomplete", async () => {
  // The negative control, and it earned its place: the first implementation of this criterion
  // treated .git as framework-caused loss, so EVERY repository reported an incomplete surface — the
  // blanket rule the criterion exists to forbid, arrived at from the other direction. Nothing here
  // is excluded but .git, and the surface must be complete.
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-excl-dotgit-"));
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    commit();

    const surface = surfaceOf(audit(root));
    const hit = excludedDir(surface, ".git");
    assert.ok(hit, "the .git directory was not recorded as excluded at all");
    assert.equal(hit.authorizedBy, "not-project-evidence");

    assert.equal(surface.complete, true, "a repository's own storage was counted as lost project evidence");
    assert.deepEqual(surface.frameworkExcludedDirectories, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the incomplete-surface header names the tool-decided exclusion that caused it", async () => {
  // THE REGRESSION. Adding the sixth term to `complete` without adding it to `renderHuman`'s reason
  // list made this very repository print:
  //
  //     Evidence surface INCOMPLETE — . Results below cover what was read, and nothing else.
  //
  // A run announcing it had lost evidence and then naming none of it — the same failure the sixth
  // term was added to fix, moved one layer up into the sentence a person actually reads. It was
  // invisible to every other test in this file because they all read `--json`, where the field was
  // correct all along.
  //
  // The property, stated once: whenever `complete` is false, the header must name at least one
  // actual loss mode that caused it. Not a generic phrase, and not a bare count the reader has to
  // match up against some later line.
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-render-excl-"));
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    await baitIn(root, "fixtures");
    commit();

    // The exclusion is the ONLY loss mode here: nothing unreadable, nothing truncated, no cap, no
    // budget. So the reason list has exactly one thing it can say, and an empty list is the defect.
    const surface = surfaceOf(audit(root));
    assert.equal(surface.complete, false, JSON.stringify(surface, null, 2));
    assert.deepEqual(surface.frameworkExcludedDirectories, ["fixtures"]);
    assert.deepEqual(surface.unreadableFiles, []);
    assert.deepEqual(surface.truncatedFiles, []);
    assert.equal(surface.fileCapReached, false);
    assert.equal(surface.readBudget.exhausted, false);

    const out = auditHuman(root);
    const reasons = incompleteHeader(out);
    assert.ok(reasons !== null, `no incomplete-surface header was printed at all: ${out.slice(0, 1200)}`);
    assert.notEqual(reasons.trim(), "", "the header declared incompleteness and then named nothing");
    assert.match(reasons, /fixtures/, `the header did not name the directory that caused it: "${reasons}"`);
    assert.match(
      reasons,
      /this tool rather than by the repository/,
      `the header did not say who decided the exclusion: "${reasons}"`,
    );

    // Load-bearing, and the reason this asserts on the header rather than on the output as a whole:
    // the exclusion summary further down lists EVERY exclusion, repository-authorized ones included,
    // so a reader who has only that line cannot tell which subset made the surface incomplete.
    // Remove it, and the cause must still be named.
    const withoutSummary = out.replace(/^\d+ directory\(ies\) excluded as not this project's own code.*$/m, "");
    assert.match(incompleteHeader(withoutSummary) ?? "", /fixtures/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a repository-authorized exclusion prints no incompleteness header at all", async () => {
  // The control that stops the fix above from being satisfied by always printing something. The
  // project declared this tree disposable, so there is no loss to name and no header to print. A
  // renderer that manufactured a reason here would be fabricating incompleteness to keep its own
  // reason list non-empty, which is the defect inverted rather than repaired.
  const root = await mkdtemp(path.join(os.tmpdir(), "standards-render-authorized-"));
  try {
    const commit = await initRepo(root);
    await firstParty(root);
    await baitIn(root, "thirdparty");
    await writeFile(path.join(root, ".gitignore"), "thirdparty/\n");
    commit();

    assert.equal(surfaceOf(audit(root)).complete, true);
    const out = auditHuman(root);
    assert.equal(
      incompleteHeader(out),
      null,
      `an incompleteness header was printed over a complete surface: ${out.slice(0, 1200)}`,
    );
    // The exclusion is still reported. It is a decision about scope, not a loss.
    assert.match(out, /thirdparty/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

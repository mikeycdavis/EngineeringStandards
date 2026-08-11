/**
 * Regressions for project-level audit exclusions.
 *
 * These are RED until the defect is fixed. They exist to pin the two properties that a fix must
 * deliver together, because either one alone is a worse outcome than the bug:
 *
 *   1. An untracked dependency tree cannot POLLUTE the findings.
 *   2. Tracked first-party code STAYS IN SCOPE.
 *
 * Property 2 is the one that makes this hard. Excluding a directory is trivial; excluding it
 * without also silencing the project's own code is the requirement. A fix that broadened the
 * exclusion until the audit went quiet would satisfy (1) and be strictly more dangerous than the
 * present behaviour, which is at least loud.
 *
 * Found adopting v2.0.1 into a Python + React repository whose virtualenv is checked out in-tree
 * as `test-env-3.13/` — a name `SKIP_DIRS` does not know, so the walk descends into it.
 *
 * Fixtures are built in a temp dir rather than committed, because the scale test needs several
 * thousand files and committing a synthetic dependency tree into this repository would put the
 * very thing under test into its own audit surface.
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

/**
 * Run the audit against `dir`, treating it as the repository root.
 *
 * `maxHeapMb` is a parameter because the OOM regression is the whole point of one of these tests:
 * the failure it pins is not "the wrong answer" but "no answer at all", and a run given unbounded
 * memory cannot demonstrate it.
 */
function audit(dir, { maxHeapMb = null } = {}) {
  const nodeArgs = maxHeapMb ? [`--max-old-space-size=${maxHeapMb}`] : [];
  const r = spawnSync(process.execPath, [...nodeArgs, CLI, "audit", `--dir=${dir}`, "--json"], {
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

/** Every evidence string across every finding, flattened — the detectors vary in shape. */
function evidenceOf(json) {
  const out = [];
  for (const f of json.findings ?? []) {
    for (const e of f.evidence ?? f.files ?? f.paths ?? []) out.push(String(e));
  }
  return out;
}

/**
 * A repository with first-party code and a vendored Python virtualenv.
 *
 * The virtualenv carries `pyvenv.cfg`, which is what actually identifies one: the directory NAME is
 * a user choice (`.venv`, `venv`, `env`, `test-env-3.13`, …) and cannot be enumerated, but
 * `pyvenv.cfg` is written by the `venv` module itself and is present in every one.
 *
 * `.gitignore` lists the directory, so the tree is also untracked — the second, tool-independent
 * signal that this is not the project's own code.
 */
async function buildRepo(root, { depFiles = 3, bigFileKb = 0 } = {}) {
  await mkdir(path.join(root, "myapp"), { recursive: true });
  await writeFile(path.join(root, "pyproject.toml"), '[project]\nname = "myapp"\n');
  await writeFile(path.join(root, ".gitignore"), "test-env-3.13/\n");

  // First-party code, tracked, with exactly ONE genuine swallowed exception.
  await writeFile(
    path.join(root, "myapp", "service.py"),
    ["def run():", "    try:", "        work()", "    except ValueError:", "        pass", ""].join("\n"),
  );
  // First-party code that is clean, so a fix cannot pass by reporting nothing at all.
  await writeFile(path.join(root, "myapp", "clean.py"), "def add(a, b):\n    return a + b\n");

  // The vendored virtualenv. Untracked, name unknown to SKIP_DIRS, and full of the same pattern.
  const site = path.join(root, "test-env-3.13", "Lib", "site-packages");
  await mkdir(site, { recursive: true });
  await writeFile(path.join(root, "test-env-3.13", "pyvenv.cfg"), "home = C:\\Python313\ninclude-system-site-packages = false\nversion = 3.13.0\n");
  for (let i = 0; i < depFiles; i++) {
    const pkg = path.join(site, `dep${i}`);
    await mkdir(pkg, { recursive: true });
    await writeFile(
      path.join(pkg, "__init__.py"),
      ["def helper():", "    try:", "        thing()", "    except Exception:", "        pass", ""].join("\n"),
    );
    // Real site-packages is not uniform: the largest single .py in the observed virtualenv was
    // 1.36 MB. File COUNT alone under-represents the walk, so a fraction of the tree is bulked out.
    if (bigFileKb > 0 && i % 10 === 0) {
      const body = "x = 1  # padding\n".repeat(Math.ceil((bigFileKb * 1024) / 18));
      await writeFile(path.join(pkg, "_big.py"), body);
    }
  }
}

test("an untracked virtualenv does not pollute the findings", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-excl-"));
  try {
    await buildRepo(root, { depFiles: 25 });
    const json = parse(audit(root));
    const evidence = evidenceOf(json);

    const fromVenv = evidence.filter((e) => e.includes("test-env-3.13"));
    assert.deepEqual(
      fromVenv,
      [],
      `the audit reported ${fromVenv.length} finding(s) inside the vendored virtualenv, ` +
        `e.g. ${fromVenv.slice(0, 3).join(", ")}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tracked first-party code stays in scope", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-excl-"));
  try {
    await buildRepo(root, { depFiles: 25 });
    const evidence = evidenceOf(parse(audit(root)));

    // This is the assertion that stops the bug being "fixed" by excluding everything.
    assert.ok(
      evidence.some((e) => e.includes("service.py")),
      `the project's own swallowed exception was not reported; evidence was ${JSON.stringify(evidence.slice(0, 10))}`,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the reported count reflects first-party code only", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-excl-"));
  try {
    await buildRepo(root, { depFiles: 200 });
    const json = parse(audit(root));
    const swallowed = (json.findings ?? []).find((f) => String(f.id ?? f.rule).includes("swallowed"));
    assert.ok(swallowed, "no swallowed-exception finding at all");

    // 1 real file, 200 in the virtualenv. A count in the hundreds is the symptom operators actually
    // see: it is what makes the number unusable rather than merely imprecise.
    const n = swallowed.count ?? (swallowed.evidence ?? []).length;
    assert.ok(n <= 2, `reported ${n} swallowed-exception file(s); only 1 is first-party`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a large vendored tree does not exhaust the default heap", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "audit-excl-"));
  try {
    // Sized against the virtualenv this was found in: 13,536 scannable files, largest .py 1.36 MB.
    // Scaled down to keep the suite usable, then given a constrained heap so the ratio is what is
    // being tested rather than the absolute size.
    await buildRepo(root, { depFiles: 6000, bigFileKb: 400 });
    const r = audit(root, { maxHeapMb: 256 });

    assert.ok(
      !/JavaScript heap out of memory|Ineffective mark-compacts/.test(r.stderr),
      "the audit exhausted the heap walking a vendored dependency tree",
    );
    assert.notEqual(r.status, null, "the audit was killed rather than exiting");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

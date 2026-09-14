import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, chmod, symlink } from "node:fs/promises";
import { readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { plan, detectMode, MODES } from "../scripts/init.mjs";

/**
 * Mode detection one directory below the root (issue #2).
 *
 * `detectMode` looked for implementation markers at the repository root only, so a monorepo — whose
 * manifests all sit one level down — was reported as greenfield and offered a clean-room plan over
 * real code. That is the direction `init` itself names as dangerous. These tests hold both halves
 * of the fix: the nested implementation is found, and a repository that genuinely has none is
 * still greenfield, with evidence that says where the search went and where it stopped.
 */

/** A throwaway target repository. Built rather than committed: every fixture here is defined as much
 *  by what it does not contain, and an empty directory does not survive git. A key ending in `/`
 *  is an empty directory. */
async function repo(files = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-init-nested-"));
  for (const [file, content] of Object.entries(files)) {
    if (file.endsWith("/")) {
      await mkdir(path.join(dir, file), { recursive: true });
      continue;
    }
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), content, "utf8");
  }
  return dir;
}
const cleanup = (dir) => rm(dir, { recursive: true, force: true });

async function withRepo(files, fn) {
  const dir = await repo(files);
  try {
    return await fn(dir);
  } finally {
    await cleanup(dir);
  }
}

const MANIFESTS = ["package.json", "go.mod", "Cargo.toml", "pyproject.toml", "pom.xml", "build.gradle"];

/** The repository from the issue, verbatim in shape: no root marker, no plan, no prompt. */
const MONOREPO = {
  "backend/pom.xml": "<project/>\n",
  "backend/releasepilot-api/pom.xml": "<project/>\n",
  "frontend/package.json": '{"name":"frontend"}\n',
  "e2e/package.json": '{"name":"e2e"}\n',
  "playwright-runner/package.json": '{"name":"playwright-runner"}\n',
  "docs/architecture.md": "# Architecture\n",
  "deploy/compose.yml": "services: {}\n",
  "scripts/build.sh": "echo build\n",
  "data/seed.sql": "select 1;\n",
};

const markersLine = (evidence) => evidence.find((line) => line.startsWith("implementation markers: "));

/** A greenfield verdict is only trustworthy if its evidence says how far the search went. */
function assertBoundaryStated(evidence) {
  assert.ok(evidence.includes("no implementation markers found"), `evidence: ${evidence.join(" | ")}`);
  assert.ok(
    evidence.some((line) => /^searched: the root .*one level below the root/.test(line)),
    `greenfield evidence must name what was searched: ${evidence.join(" | ")}`,
  );
  assert.ok(
    evidence.some((line) => /^not searched: anything deeper than one level below the root/.test(line)),
    `greenfield evidence must name where the search stopped: ${evidence.join(" | ")}`,
  );
}

// --- A: the issue's own repository -----------------------------------------------------------------

test("a monorepo with manifests one level down, and no plan or prompt, requires reconstruction", async () => {
  await withRepo(MONOREPO, (dir) => {
    const detected = detectMode(dir);
    assert.equal(detected.mode, MODES.RECONSTRUCTION_REQUIRED, detected.evidence.join(" | "));
    assert.equal(detected.confidence, "INFERRED", "a guess must be reported as a guess");
  });
});

test("the monorepo's plan routes to reconstruction, never to greenfield scaffolding", async () => {
  await withRepo(MONOREPO, async (dir) => {
    const report = await plan(dir);
    assert.equal(report.mode, MODES.RECONSTRUCTION_REQUIRED);
    assert.equal(report.reconstructionRequired, true);
    assert.match(report.nextStep, /project-reconstruction|Standard 44/);
  });
});

// --- B: every manifest type, alone, one level down --------------------------------------------------

for (const manifest of MANIFESTS) {
  test(`a lone ${manifest} one directory below the root is not greenfield`, async () => {
    await withRepo({ "README.md": "# Service\n", [`service/${manifest}`]: "x\n" }, (dir) => {
      const detected = detectMode(dir);
      assert.notEqual(detected.mode, MODES.GREENFIELD, detected.evidence.join(" | "));
      assert.equal(detected.mode, MODES.RECONSTRUCTION_REQUIRED);
      assert.equal(markersLine(detected.evidence), `implementation markers: service/${manifest}`);
    });
  });
}

// --- C: plan and prompt precedence is unchanged once implementation is found ------------------------

test("a monorepo with a populated plan is existing-with-plan", async () => {
  const files = { ...MONOREPO, "artifacts/project-plan-breakdown/00-overview.md": "# Overview\n" };
  await withRepo(files, (dir) => {
    const detected = detectMode(dir);
    assert.equal(detected.mode, MODES.EXISTING_WITH_PLAN, detected.evidence.join(" | "));
    assert.ok(detected.evidence.includes("planning artifacts: artifacts/project-plan-breakdown"));
  });
});

test("a monorepo with only an original prompt is existing-with-plan", async () => {
  const files = { ...MONOREPO, "artifacts/prompts/x.md": "# The original prompt\n" };
  await withRepo(files, (dir) => {
    const detected = detectMode(dir);
    assert.equal(detected.mode, MODES.EXISTING_WITH_PLAN, detected.evidence.join(" | "));
    assert.ok(detected.evidence.includes("prompt artifacts: artifacts/prompts"));
  });
});

test("an empty plan directory beside a monorepo is still not a plan", async () => {
  // hasContent() one level down: init's own empty scaffolding must not flip the mode on a re-run.
  await withRepo({ ...MONOREPO, "artifacts/project-plan-breakdown/": null }, (dir) => {
    assert.equal(detectMode(dir).mode, MODES.RECONSTRUCTION_REQUIRED);
  });
});

// --- D: honest greenfield stays greenfield ---------------------------------------------------------

const GREENFIELD_CONTROLS = {
  "an empty repository": {},
  "a README-only repository": { "README.md": "# Idea\n" },
  "a documentation-only repository": {
    "README.md": "# Idea\n",
    "docs/guide.md": "# Guide\n",
    "docs/sub/page.md": "# Page\n",
  },
  "an empty marker-named directory one level down": { "frontend/src/": null, "tools/pkg/": null },
  // Directory markers are not searched one level down (see init.mjs): these are the two common
  // documentation generators whose populated source trees would otherwise read as implementation.
  "populated documentation source trees one level down": {
    "book/src/SUMMARY.md": "# Summary\n",
    "docs/source/index.rst": "Index\n=====\n",
  },
  "a manifest two directories below the root": { "a/b/package.json": '{"name":"deep"}\n' },
  "a zero-byte manifest one level down": { "service/package.json": "" },
  "a directory named like a manifest one level down": { "service/package.json/": null },
};

for (const [name, files] of Object.entries(GREENFIELD_CONTROLS)) {
  test(`${name} is still greenfield, and says where it searched`, async () => {
    await withRepo(files, (dir) => {
      const detected = detectMode(dir);
      assert.equal(detected.mode, MODES.GREENFIELD, detected.evidence.join(" | "));
      assert.equal(detected.confidence, "INFERRED");
      assertBoundaryStated(detected.evidence);
    });
  });
}

// --- E: directories that are skipped do not count --------------------------------------------------

test("manifests inside node_modules and dot-directories do not count, and the skip is named", async () => {
  const files = {
    "README.md": "# Idea\n",
    "node_modules/package.json": '{"name":"installed"}\n',
    "node_modules/left-pad/package.json": '{"name":"left-pad"}\n',
    ".git/package.json": "{}\n",
    ".cache/pyproject.toml": "[project]\n",
  };
  await withRepo(files, (dir) => {
    const detected = detectMode(dir);
    assert.equal(detected.mode, MODES.GREENFIELD, detected.evidence.join(" | "));
    assertBoundaryStated(detected.evidence);
    assert.ok(
      detected.evidence.includes("skipped here: .cache/, .git/, node_modules/"),
      `skipped directories must be named, in sorted order: ${detected.evidence.join(" | ")}`,
    );
  });
});

test("a linked directory is not followed out of the repository", async (t) => {
  const outside = await repo({ "package.json": '{"name":"elsewhere"}\n' });
  const dir = await repo({ "README.md": "# Idea\n" });
  try {
    try {
      // "junction" needs no privilege on Windows and is ignored elsewhere.
      await symlink(outside, path.join(dir, "linked"), "junction");
    } catch (error) {
      t.skip(`this platform cannot create a directory link here: ${error.code}`);
      return;
    }
    const detected = detectMode(dir);
    assert.equal(detected.mode, MODES.GREENFIELD, detected.evidence.join(" | "));
    assert.ok(detected.evidence.includes("skipped here: linked/"), detected.evidence.join(" | "));
  } finally {
    await cleanup(dir);
    await cleanup(outside);
  }
});

// --- F: evidence names what was found, where, in a stable order ------------------------------------

test("nested markers are named by repo-relative forward-slash path, sorted, stopping at one level", async () => {
  await withRepo(MONOREPO, (dir) => {
    assert.equal(
      markersLine(detectMode(dir).evidence),
      "implementation markers: backend/pom.xml, e2e/package.json, frontend/package.json, playwright-runner/package.json",
    );
  });
});

test("root markers keep their evidence, and precede nested ones", async () => {
  await withRepo({ "src/index.js": "export const x = 1;\n", "package.json": "{}\n" }, (dir) => {
    const detected = detectMode(dir);
    assert.equal(detected.mode, MODES.RECONSTRUCTION_REQUIRED);
    assert.deepEqual(detected.evidence, [
      "implementation markers: src, package.json",
      "no plan or original prompt found",
    ]);
  });
  await withRepo({ "package.json": "{}\n", "web/package.json": "{}\n" }, (dir) => {
    assert.equal(markersLine(detectMode(dir).evidence), "implementation markers: package.json, web/package.json");
  });
});

test("a directory that could not be read is reported as unsearched, and does not support greenfield", async (t) => {
  const dir = await repo({ "README.md": "# Idea\n", "data/": null });
  const locked = path.join(dir, "data");
  try {
    await chmod(locked, 0o000);
    let readable = true;
    try {
      readdirSync(locked);
    } catch {
      readable = false;
    }
    if (readable) {
      // Windows ignores the mode bits and root bypasses them; neither can produce the condition.
      t.skip("this platform cannot make a directory unreadable to the current user");
      return;
    }
    const detected = detectMode(dir);
    assert.notEqual(detected.mode, MODES.GREENFIELD, detected.evidence.join(" | "));
    assert.ok(
      detected.evidence.includes("could not be read, so not searched: data/"),
      detected.evidence.join(" | "),
    );
  } finally {
    await chmod(locked, 0o755);
    await cleanup(dir);
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { plan, apply, detectMode, MODES, stampVersion } from "../scripts/init.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A throwaway target repository. Fixtures are built rather than committed, because every one of
 *  them is defined by what it does NOT contain, and an empty directory does not survive git. */
async function repo(files = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-init-"));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, file)), { recursive: true });
    await writeFile(path.join(dir, file), content, "utf8");
  }
  return dir;
}
const cleanup = (dir) => rm(dir, { recursive: true, force: true });

const GREENFIELD = {};
const EXISTING_WITH_PLAN = {
  "src/index.js": "export const x = 1;\n",
  "artifacts/project-plan-breakdown/00-overview.md": "# Overview\n",
};
const RECONSTRUCTION = { "src/index.js": "export const x = 1;\n", "package.json": "{}\n" };

// --- Mode detection --------------------------------------------------------------------------

test("an empty repository is greenfield", async () => {
  const dir = await repo(GREENFIELD);
  try {
    assert.equal(detectMode(dir).mode, MODES.GREENFIELD);
  } finally {
    await cleanup(dir);
  }
});

test("an implementation with a plan is existing-with-plan", async () => {
  const dir = await repo(EXISTING_WITH_PLAN);
  try {
    assert.equal(detectMode(dir).mode, MODES.EXISTING_WITH_PLAN);
  } finally {
    await cleanup(dir);
  }
});

test("an implementation with no plan requires reconstruction", async () => {
  const dir = await repo(RECONSTRUCTION);
  try {
    const detected = detectMode(dir);
    assert.equal(detected.mode, MODES.RECONSTRUCTION_REQUIRED);
    assert.equal(detected.confidence, "INFERRED", "a guess must be reported as a guess");
  } finally {
    await cleanup(dir);
  }
});

test("an explicit --mode overrides detection and says so", async () => {
  const dir = await repo(RECONSTRUCTION);
  try {
    const detected = detectMode(dir, MODES.GREENFIELD);
    assert.equal(detected.mode, MODES.GREENFIELD);
    assert.equal(detected.confidence, "CONFIRMED_BY_OWNER");
  } finally {
    await cleanup(dir);
  }
});

// --- The safety contract ----------------------------------------------------------------------

test("a dry run writes nothing", async () => {
  const dir = await repo(GREENFIELD);
  try {
    await plan(dir); // planning alone must not touch the filesystem
    assert.ok(!existsSync(path.join(dir, "PROJECT.md")));
    assert.ok(!existsSync(path.join(dir, "project-policy.yml")));
  } finally {
    await cleanup(dir);
  }
});

test("the dry run predicts the real run exactly", async () => {
  // A dry run whose output does not predict the real run is worse than none, because it is trusted
  // (Standard 33 R5). They share one computation, and this asserts it.
  for (const files of [GREENFIELD, EXISTING_WITH_PLAN, RECONSTRUCTION]) {
    const dir = await repo(files);
    try {
      const predicted = await plan(dir);
      await apply(dir, predicted);
      const after = await plan(dir);

      assert.equal(after.mode, predicted.mode, "the mode changed between the dry run and the run");
      for (const created of predicted.created) {
        assert.ok(
          existsSync(path.join(dir, created)),
          `predicted the creation of ${created}, and it does not exist`,
        );
        assert.ok(
          after.preserved.includes(created),
          `${created} was created but a re-plan does not recognise its own output`,
        );
      }
      assert.deepEqual(after.created, [], "the run left work the dry run did not predict");
      assert.deepEqual(after.conflicts, [], "the run produced output that conflicts with itself");
    } finally {
      await cleanup(dir);
    }
  }
});

test("an existing file that differs is a conflict, and is left untouched", async () => {
  const dir = await repo({ "PROJECT.md": "# mine\n" });
  try {
    const report = await plan(dir);
    const conflict = report.conflicts.find((c) => c.path === "PROJECT.md");
    assert.ok(conflict, "differing file was not reported as a conflict");
    assert.ok(!report.created.includes("PROJECT.md"));

    await apply(dir, report);
    assert.equal(await readFile(path.join(dir, "PROJECT.md"), "utf8"), "# mine\n", "content was overwritten");
  } finally {
    await cleanup(dir);
  }
});

test("overwriting requires naming the exact path, not a blanket flag", async () => {
  const dir = await repo({ "PROJECT.md": "# mine\n", "project-policy.yml": "# mine\n" });
  try {
    const report = await plan(dir, { overwrite: ["PROJECT.md"] });
    assert.deepEqual(report.overwrites, ["PROJECT.md"]);
    assert.ok(
      report.conflicts.some((c) => c.path === "project-policy.yml"),
      "approving one path approved another",
    );

    await apply(dir, report);
    assert.notEqual(await readFile(path.join(dir, "PROJECT.md"), "utf8"), "# mine\n");
    assert.equal(await readFile(path.join(dir, "project-policy.yml"), "utf8"), "# mine\n");
  } finally {
    await cleanup(dir);
  }
});

test("an approved overwrite is marked destructive; a creation is not", async () => {
  // Mutating is not destructive. Creating a missing artifact is ordinary execute; replacing an
  // existing one is the privileged operation (Standard 2).
  const dir = await repo({ "PROJECT.md": "# mine\n" });
  try {
    const report = await plan(dir, { overwrite: ["PROJECT.md"] });
    const overwrite = report.actions.find((a) => a.action === "overwrite");
    assert.equal(overwrite.destructive, true);
    for (const create of report.actions.filter((a) => a.action === "create")) {
      assert.ok(!create.destructive, "a creation was marked destructive");
    }
  } finally {
    await cleanup(dir);
  }
});

test("running init repeatedly is safe and converges", async () => {
  const dir = await repo(GREENFIELD);
  try {
    const first = await plan(dir);
    await apply(dir, first);
    const second = await plan(dir);
    assert.deepEqual(second.created, [], "a second run wanted to create something again");
    assert.deepEqual(second.conflicts, [], "a second run conflicted with its own output");
    // Derived from the first run rather than hardcoded: a count literal here goes stale silently
    // the next time an artifact is added, and passes for the wrong reason in between.
    assert.deepEqual(
      [...second.preserved].sort(),
      [...first.created].sort(),
      "a second run did not recognise everything the first one wrote",
    );

    await apply(dir, second);
    const third = await plan(dir);
    assert.deepEqual(third.created, []);
    assert.deepEqual(third.conflicts, []);
  } finally {
    await cleanup(dir);
  }
});

// --- Reconstruction routing ---------------------------------------------------------------------

test("reconstruction mode creates the plan directory but never populates it", async () => {
  // Scaffolding template sections over existing code is a fabricated history — the single worst
  // outcome of a careless adoption (Standard 33 R4, Standard 44 R2).
  const dir = await repo(RECONSTRUCTION);
  try {
    const report = await plan(dir);
    assert.equal(report.reconstructionRequired, true);
    await apply(dir, report);

    const planDir = path.join(dir, "artifacts/project-plan-breakdown");
    assert.ok(existsSync(planDir), "the plan directory should exist");
    const { readdir } = await import("node:fs/promises");
    assert.deepEqual(await readdir(planDir), [], "init populated a plan over an existing codebase");
  } finally {
    await cleanup(dir);
  }
});

test("reconstruction is routed to Standard 44, not reimplemented", async () => {
  const dir = await repo(RECONSTRUCTION);
  try {
    const report = await plan(dir);
    assert.match(report.nextStep, /project-reconstruction|Standard 44/);
    const source = await readFile(new URL("../scripts/init.mjs", import.meta.url), "utf8");
    for (const marker of ["OBSERVED", "reconstructed-baseline", "RECONSTRUCTED-PROMPT"]) {
      assert.ok(
        !source.includes(`"${marker}"`),
        `init appears to implement reconstruction itself (${marker})`,
      );
    }
  } finally {
    await cleanup(dir);
  }
});

test("a greenfield project is not told to reconstruct", async () => {
  const dir = await repo(GREENFIELD);
  try {
    const report = await plan(dir);
    assert.equal(report.reconstructionRequired, false);
    assert.doesNotMatch(report.nextStep, /reconstruction/i);
  } finally {
    await cleanup(dir);
  }
});

// --- The report is a machine interface ------------------------------------------------------------

test("the report carries the fields a continuing agent needs", async () => {
  const dir = await repo(RECONSTRUCTION);
  try {
    const report = await plan(dir);
    for (const field of ["schemaVersion", "mode", "created", "preserved", "conflicts", "reconstructionRequired"]) {
      assert.ok(field in report, `bootstrap report is missing ${field}`);
    }
    assert.equal(report.schemaVersion, "1.0.0");
  } finally {
    await cleanup(dir);
  }
});

test("preserved and conflicts are separate: both wrote nothing, only one is success", async () => {
  const dir = await repo({ "PROJECT.md": "# mine\n" });
  try {
    await apply(dir, await plan(dir)); // creates the policy, conflicts on the manifest
    const report = await plan(dir);
    assert.ok(report.preserved.includes("project-policy.yml"), "matching file should be preserved");
    assert.ok(report.conflicts.some((c) => c.path === "PROJECT.md"), "differing file should conflict");
  } finally {
    await cleanup(dir);
  }
});

test("a bootstrapped greenfield project validates against the real schema", async () => {
  // The end-to-end claim: what init writes is not merely well-formed, it passes the policy checker
  // an adopter runs next. A template that failed here would break their first command.
  const dir = await repo(GREENFIELD);
  try {
    await apply(dir, await plan(dir));
    const { checkPolicy } = await import("../scripts/policy.mjs");
    const schema = new URL("../schemas/project-policy.schema.json", import.meta.url);
    const result = await checkPolicy(path.join(dir, "project-policy.yml"), schema, "2026-08-09");
    assert.deepEqual(result.errors, []);
    assert.equal(result.status, "ok");
  } finally {
    await cleanup(dir);
  }
});

test("an existing docs/adr/ is not duplicated by an empty artifacts/adr/", async () => {
  // Found against the first outside adopter. The audit learned that Standard 11 R1 accepts three
  // locations; init still knew one, so it offered to create a fourth directory — empty — beside the
  // populated one. Two ADR directories where one holds the decisions is the tool manufacturing the
  // ambiguity it then reports.
  const dir = await repo({
    "src/index.js": "export const x = 1;\n",
    "docs/adr/0001-a-decision.md": "# 1. A decision\n",
  });
  try {
    const report = await plan(dir);
    const adr = report.actions.find((a) => a.path === "artifacts/adr/");
    assert.equal(adr.action, "preserve", "artifacts/adr/ must not be created when docs/adr/ holds ADRs");
    assert.match(adr.reason, /docs\/adr/, "the reason must name what already serves the requirement");

    await apply(dir, report);
    assert.ok(!existsSync(path.join(dir, "artifacts/adr")), "nothing should have been created");
  } finally {
    await cleanup(dir);
  }
});

test("the policy it writes declares the framework version that wrote it", async () => {
  // templates/project-policy.yml carried a literal standardVersion, so every release left it one
  // behind and each new adopter declared a version nobody chose - then failed the outdated-version
  // check on their first run, for a value the bootstrap had just written for them.
  const { readFile: read } = await import("node:fs/promises");
  const expected = (await read(path.join(REPO_ROOT, "VERSION"), "utf8")).trim();
  const dir = await repo({ "src/index.js": "export const x = 1;\n" });
  try {
    await apply(dir, await plan(dir));
    const policy = await read(path.join(dir, "project-policy.yml"), "utf8");
    assert.match(
      policy,
      new RegExp(`^standardVersion: "${expected.replace(/\./g, "\.")}"$`, "m"),
      "the written policy must declare the current framework version",
    );
  } finally {
    await cleanup(dir);
  }
});

test("stampVersion takes the version from VERSION, not from the template it was given", async () => {
  // The end-to-end test above cannot tell stamping from luck: templates/project-policy.yml and
  // VERSION currently agree, so it passes whether or not the stamp happens. This one creates the
  // mismatch that actually occurred on the parallel branch — VERSION 2.0.1 against a template still
  // reading 2.0.0 — and proves the canonical source wins over whatever text the template carries.
  const { readFile: read } = await import("node:fs/promises");
  const expected = (await read(path.join(REPO_ROOT, "VERSION"), "utf8")).trim();
  const pattern = new RegExp(`^standardVersion: "${expected.replace(/\./g, "\.")}"$`, "m");

  const stamped = stampVersion('standardVersion: "0.0.1-stale"\nproject: "X"\n');
  assert.match(stamped, pattern, "the written version must come from VERSION");
  assert.ok(!stamped.includes("0.0.1-stale"), "the stale template value survived the stamp");
  assert.ok(stamped.includes('project: "X"'), "stamping must not disturb the rest of the document");

  // CRLF: a checkout with core.autocrlf leaves \r before the \n, so an end-anchored pattern would
  // silently fail to match on Windows and the stamp would quietly not happen — the kind of no-op
  // that looks like it worked everywhere it was tested.
  const crlf = stampVersion('standardVersion: "0.0.1-stale"\r\nproject: "X"\r\n');
  assert.ok(!crlf.includes("0.0.1-stale"), "the stamp must survive CRLF line endings");
});

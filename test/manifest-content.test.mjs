/**
 * `architecture.project-manifest` checks that the manifest was filled in, not that it exists.
 *
 * The rule's own remediation says "copy the template and fill it in", and only the copying was
 * checked: `standards init` wrote the scaffolding and the rule then passed because the file existed.
 * That is the exact defect Standard 44 R11 was written about, occurring in the tool that enforces
 * R11 — tool-generated scaffolding read as evidence of intent.
 *
 * Issues #6 and #8 are one item because they are one specimen. #6 is the untouched template and #8
 * is init's own output; for this artifact those are the same bytes, and the test below establishes
 * that by running init's generator rather than by asserting it.
 *
 * Every case is asserted in both directions, per this suite's standing rule: a check that only ever
 * fires is as uninformative as one that never does. The direction that constrains the design is the
 * passing one — this repository's own PROJECT.md contains an angle-bracketed path, and a naive
 * prompt scan would report the framework's own manifest as unfilled.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stampVersion } from "../scripts/init.mjs";
import { injectAgentInstructions } from "../scripts/agent-instructions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const REPO = path.join(HERE, "..");
const TEMPLATE = path.join(REPO, "templates", "PROJECT.md");

const RULE = "architecture.project-manifest";
const FINDING = "unfilled-project-manifest";

/** Ample enough that nothing in these one-file fixtures goes unread. */
const AMPLE = 8_000_000;

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
    return assert.fail(
      `${command} stdout was not JSON.\nstatus: ${r.status}\nstderr: ${r.stderr.slice(0, 2000)}`,
    );
  }
}

const unfilled = (json) => (json.findings ?? []).filter((f) => f.id === FINDING);
const evidenceOf = (json) => unfilled(json).flatMap((f) => f.evidence ?? []);

async function withFixture(manifest, fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "manifest-content-"));
  await writeFile(path.join(root, "PROJECT.md"), manifest);
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const FILLED = [
  "# PROJECT — Widget Press",
  "",
  "## Purpose",
  "",
  "Widget Press renders widgets for the print desk. It replaces the manual paste-up step.",
  "",
  "## Stack",
  "",
  "| Layer | Technology |",
  "| --- | --- |",
  "| Runtime | Node 20 |",
  "",
  "## Current state",
  "",
  "- **Current status:** IN_PROGRESS",
  "- **Known blockers:** none recorded",
  "",
].join("\n");

// --- The specimen, from both directions it was reported ------------------------------------------

test("the untouched template does not satisfy the rule that tells you to copy it", async () => {
  const template = await readFile(TEMPLATE, "utf8");
  await withFixture(template, (root) => {
    const json = cli("audit", root);
    const found = unfilled(json);
    assert.equal(found.length, 1, "the untouched template was accepted as a project manifest");
    assert.equal(found[0].rule, RULE);
    assert.ok(
      evidenceOf(json).some((e) => e.includes("<Project name>")),
      "the finding does not name a field that was left unanswered",
    );
  });
});

test("what `standards init` writes is that same specimen, measured rather than assumed", async () => {
  // #8 was filed against init's output and #6 against the template. They are the same bytes here:
  // PROJECT.md carries no `standardVersion:` line for stampVersion to stamp and no agent-instruction
  // markers for injectAgentInstructions to replace, so init's generator is the identity on it. This
  // runs that generator instead of restating the claim, so a template that later gains a generated
  // line turns this into a second specimen rather than into a silent gap.
  const template = await readFile(TEMPLATE, "utf8");
  const written = injectAgentInstructions(stampVersion(template), "9.9.9");
  await withFixture(written, (root) => {
    assert.equal(
      unfilled(cli("audit", root)).length,
      1,
      "init's own output is accepted as a filled-in manifest",
    );
  });
});

// --- Deleting the prompts is not filling them in -------------------------------------------------

test("headings with nothing beneath them are not a manifest", async () => {
  const bare = "# PROJECT — Widget Press\n\n## Purpose\n\n## Stack\n\n## Current state\n";
  await withFixture(bare, (root) => {
    const json = cli("audit", root);
    assert.equal(
      unfilled(json).length,
      1,
      "a manifest emptier than the template passed where the template fails",
    );
    assert.deepEqual(
      evidenceOf(json).sort(),
      [
        'PROJECT.md: heading "Current state" has nothing beneath it',
        'PROJECT.md: heading "Purpose" has nothing beneath it',
        'PROJECT.md: heading "Stack" has nothing beneath it',
      ],
      "the finding does not name the headings it measured",
    );
    assert.match(
      unfilled(json)[0].message,
      /has headings with nothing beneath them/,
      "the message reports prompts it did not find",
    );
  });
});

test("a table skeleton with no rows in it is not content", async () => {
  const skeleton =
    "# PROJECT — Widget Press\n\n## Stack\n\n| Layer | Technology |\n| --- | --- |\n| | |\n";
  await withFixture(skeleton, (root) => {
    assert.equal(
      unfilled(cli("audit", root)).length,
      1,
      "an empty table counted as a filled-in section",
    );
  });
});

// --- The direction that constrains the design ----------------------------------------------------

test("a genuinely filled-in manifest satisfies the rule", async () => {
  await withFixture(FILLED, (root) => {
    assert.deepEqual(unfilled(cli("audit", root)), [], "a filled-in manifest was reported unfilled");
  });
});

test("an angle-bracketed path inside a code span is documentation, not an unanswered field", async () => {
  // This repository's own PROJECT.md contains `standards/NN-<kebab-title>.md`. A prompt scan that
  // did not strip code spans would report the framework's manifest as unfilled — the false-positive
  // failure mode this suite exists for, in the file the rule is dogfooded against.
  // The two differ by the backticks and nothing else, so a pass on the first is attributable to the
  // code-span rule rather than to the check being blind to this shape of text anywhere.
  const SPAN = "<the standards directory>";
  const inCode = `${FILLED}\n## Artifact locations\n\nStandards live in \`${SPAN}\`\n`;
  const inProse = `${FILLED}\n## Artifact locations\n\nStandards live in ${SPAN}\n`;
  await withFixture(inCode, (root) => {
    assert.deepEqual(
      unfilled(cli("audit", root)),
      [],
      "a path inside backticks was read as an unfilled field",
    );
  });
  await withFixture(inProse, (root) => {
    assert.equal(
      unfilled(cli("audit", root)).length,
      1,
      "stripping code spans also blinded the check outside them, so the exemption is not the reason the case above passes",
    );
  });
});

test("code means opposite things to the two scans, and is read that way", async () => {
  // Removing code once, for both questions, passed every other test here and was still wrong. A
  // fenced line ending in `>` is not an unanswered field, and a section whose whole body is a code
  // block is not a section with nothing beneath it. Each direction is held separately because a
  // single strip satisfies one of them by breaking the other.
  const fencedTag = `${FILLED}\n## Architectural rules\n\n\`\`\`html\n<html lang="en">\n\`\`\`\n`;
  await withFixture(fencedTag, (root) => {
    assert.deepEqual(
      unfilled(cli("audit", root)),
      [],
      "a tag inside a fenced block was read as an unanswered field",
    );
  });

  const onlyCode = `${FILLED}\n## Commands\n\n\`\`\`bash\nnpm run build\n\`\`\`\n`;
  await withFixture(onlyCode, (root) => {
    assert.deepEqual(
      unfilled(cli("audit", root)),
      [],
      "a section whose whole answer is a code block was reported as having nothing beneath it",
    );
  });
});

test("this repository's own manifest satisfies the rule", async () => {
  assert.deepEqual(
    unfilled(cli("audit", REPO)).map((f) => f.evidence),
    [],
    "the framework's own PROJECT.md is reported unfilled",
  );
});

// --- A manifest the run never read is not a manifest observed to be unfilled ---------------------

test("the content check withdraws when the manifest went unread", async () => {
  // The same fixture that fails above, under a budget that retains nothing. Presence is structural
  // and still established; only the content test needs the bytes, so only it withdraws (#38).
  const template = await readFile(TEMPLATE, "utf8");
  await withFixture(template, (root) => {
    const surface = cli("audit", root, 1).evidenceSurface;
    assert.equal(surface.complete, false, "the starved run read everything, so this proves nothing");
    const starved = cli("validate", root, 1);
    assert.deepEqual(
      unfilled(starved),
      [],
      "an unfilled manifest was reported from content the run never read",
    );
    const r = (starved.results ?? []).find((x) => x.ruleId === RULE);
    assert.equal(
      r.disposition,
      "not-evaluated",
      `${RULE} reported "${r.disposition}" over content it never read`,
    );
    assert.equal(
      r.status,
      "skipped",
      `${RULE} carried a scored status while its evidence was unavailable`,
    );
  });
});

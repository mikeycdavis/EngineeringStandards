/**
 * Committed conflict markers are reported; documentation of them is not.
 *
 * Issue #21 framed this as one question about one layer. The measurement split it into two
 * propositions that share a vocabulary and nothing else, and this file covers only the first:
 * *this tracked file's committed content contains a conflict-marker group*. The second — *this
 * working tree is mid-conflict* — cannot reach a commit at all, so it lives in the local preflight
 * (`scripts/ci-context.sh` / `.ps1`) rather than here.
 *
 * They are disjoint, and each misses the other's case entirely. A delete/modify conflict leaves
 * unmerged stages in the index over a file whose content holds no markers. A committed marker
 * leaves a clean index and clean status. `git diff --check` sees neither: it reads added lines in a
 * diff, so it went silent the moment `8870a43` committed the specimen this file is built from.
 *
 * The known-negative half is the hard half, and it is why every fixture here is a real repository
 * rather than a directory. A well-formed group is lexically identical to an illustration of one, so
 * the only discriminator left is where the lines sit — outside a fenced block, or inside it. That
 * buys the real specimen and the real documentation at the price of a genuine group inside a fence,
 * which is missed. The last test asserts the miss rather than leaving it as untested behaviour
 * somebody could mistake for coverage.
 *
 * The markers are built with `repeat` rather than written out, so this file is not itself a
 * specimen of what it tests.
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
const AMPLE = 8_000_000;

const OPEN = "<".repeat(7);
const SEP = "=".repeat(7);
const BASE = "|".repeat(7);
const END = ">".repeat(7);
const FENCE = "`".repeat(3);

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
const markerEvidence = (json) =>
  findingsById(json, "committed-conflict-markers").flatMap((f) => f.evidence ?? []);
const unavailableEvidence = (json) =>
  findingsById(json, "repository-evidence-unavailable").flatMap((f) => f.evidence ?? []);

function git(root, args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
}

/**
 * Build a repository whose files are `files`, commit everything except `untracked`, and run the
 * audit over it.
 *
 * A real repository rather than a directory, because the detector asks the index which paths are
 * tracked and refuses to answer from the filesystem. A fixture that skipped `git init` would
 * exercise the unavailable branch on every test and prove nothing about the other one.
 */
async function withRepo(files, fn, { init = true, untracked = [] } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "conflict-markers-"));
  try {
    await mkdir(path.join(root, "src"), { recursive: true });
    await writeFile(path.join(root, "src", "index.ts"), "export const x = 1;\n");
    await writeFile(path.join(root, "README.md"), "# Fixture\n\nA repository built for one test.\n");
    for (const [rel, body] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, rel)), { recursive: true });
      await writeFile(path.join(root, rel), body);
    }
    if (init) {
      git(root, ["init", "--quiet"]);
      git(root, ["config", "user.email", "fixture@example.invalid"]);
      git(root, ["config", "user.name", "fixture"]);
      git(root, ["config", "core.autocrlf", "false"]);
      const add = ["add", "--"];
      for (const rel of ["src/index.ts", "README.md", ...Object.keys(files)]) {
        if (!untracked.includes(rel)) add.push(rel);
      }
      git(root, add);
      git(root, ["commit", "--quiet", "-m", "fixture"]);
    }
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** The `8870a43` shape: a closing fence, then a marker group in ordinary Markdown prose. */
const REAL_SPECIMEN = [
  "# 08 — Open defects",
  "",
  "### An item",
  "",
  `${FENCE}bash`,
  "gh api repos/:owner/:repo/actions/jobs/93929943347",
  FENCE,
  `${OPEN} HEAD`,
  "The first command verifies the deliverable. The second and third verify the *absence* of the",
  "evidence the acceptance criterion required.",
  SEP,
  `${END} 344d15a (An adoption attempt found three defects; two of them were new)`,
  "- **Dependencies:** account-side restoration.",
  "",
].join("\n");

/** The canonical shape of documentation about the subject: the same bytes, inside a fence. */
const CANONICAL_DOC = [
  "# Explaining merge conflicts",
  "",
  "An unresolved conflict looks like this:",
  "",
  `${FENCE}text`,
  `${OPEN} HEAD`,
  "ours",
  SEP,
  "theirs",
  `${END} other-branch`,
  FENCE,
  "",
  "Resolve it by choosing one side and deleting the markers.",
  "",
].join("\n");

// ------------------------------------------------------------------- falsifier 1: the real thing

test("the unfenced Markdown specimen from 8870a43 is reported", async () => {
  await withRepo({ "artifacts/08.md": REAL_SPECIMEN }, (root) => {
    const json = cli("audit", root);
    assert.deepEqual(
      markerEvidence(json),
      ["artifacts/08.md:8-12"],
      "the specimen that actually reached develop was not reported",
    );
  });
});

test("the finding says fenced content is outside the check, so absence is not proof", async () => {
  await withRepo({ "artifacts/08.md": REAL_SPECIMEN }, (root) => {
    const json = cli("audit", root);
    const [finding] = findingsById(json, "committed-conflict-markers");
    assert.ok(finding, "no finding to read");
    assert.equal(finding.label, "INFERRED", "a heuristic reported as OBSERVED");
    assert.equal(finding.rule, null, "an audit heuristic must not be bound to a catalog rule");
    assert.match(finding.message, /fenced blocks are\s+outside this check/);
    assert.match(finding.message, /file types this audit does not read/);
    assert.match(finding.message, /not proof that none exists/);
  });
});

// -------------------------------------------------------------- falsifier 2: the known negative

test("the canonical fenced documentation example is not reported", async () => {
  await withRepo({ "docs/merge-conflicts.md": CANONICAL_DOC }, (root) => {
    const json = cli("audit", root);
    assert.deepEqual(
      markerEvidence(json),
      [],
      "documentation explaining the subject was reported as an instance of it",
    );
  });
});

test("a document that both explains and contains one reports only the unfenced group", async () => {
  // The non-vacuity partner for the test above: the same file holds a fenced illustration and a
  // real group, so a detector that had simply stopped reading Markdown would fail here.
  const mixed = [CANONICAL_DOC, "", `${OPEN} HEAD`, "left", SEP, "right", `${END} other`, ""].join("\n");
  await withRepo({ "docs/merge-conflicts.md": mixed }, (root) => {
    const json = cli("audit", root);
    assert.deepEqual(markerEvidence(json), ["docs/merge-conflicts.md:16-20"]);
  });
});

// --------------------------------------------------------- falsifier 3: a group, never a token

test("an isolated opener in prose is not enough to fire", async () => {
  const prose = [
    "# Notes",
    "",
    `A conflict begins with a line of seven less-than characters, ${OPEN}, followed by a label.`,
    "",
    `${OPEN} HEAD`,
    "and nothing closes it",
    "",
  ].join("\n");
  await withRepo({ "docs/notes.md": prose }, (root) => {
    assert.deepEqual(markerEvidence(cli("audit", root)), [], "a lone opener was reported as a group");
  });
});

test("an opener and a separator with no terminator is not a group", async () => {
  const partial = ["x", `${OPEN} HEAD`, "a", SEP, "b", ""].join("\n");
  await withRepo({ "src/partial.mjs": partial }, (root) => {
    assert.deepEqual(markerEvidence(cli("audit", root)), []);
  });
});

test("an opener and a terminator with no separator between them is not a group", async () => {
  const partial = ["x", `${OPEN} HEAD`, "a", `${END} other`, ""].join("\n");
  await withRepo({ "src/partial.mjs": partial }, (root) => {
    assert.deepEqual(markerEvidence(cli("audit", root)), []);
  });
});

test("eight characters is not a marker; Git writes exactly seven", async () => {
  const eight = ["x", `${"<".repeat(8)} HEAD`, "a", "=".repeat(8), "b", `${">".repeat(8)} other`, ""].join("\n");
  await withRepo({ "src/eight.mjs": eight }, (root) => {
    assert.deepEqual(markerEvidence(cli("audit", root)), []);
  });
});

test("a longer run is not a marker even when the rest of the group is well formed", async () => {
  // The narrower case the test above does not reach: mutation testing showed that relaxing the
  // OPENER alone to "seven or more" survived, because that fixture lengthened all three lines and
  // the separator's own exactness rejected it anyway. Each of the three carries the constraint
  // independently, and an ASCII divider of eight or more angle brackets above ordinary prose is
  // exactly what would start firing without it.
  const mixed = ["x", `${"<".repeat(9)} decorative`, "a", SEP, "b", `${END} other`, ""].join("\n");
  await withRepo({ "src/divider.mjs": mixed }, (root) => {
    assert.deepEqual(markerEvidence(cli("audit", root)), []);
  });
});

// ------------------------------------------------------ falsifier 4: non-Markdown is covered

test("non-Markdown tracked content is covered", async () => {
  const group = ["const a = 1;", `${OPEN} HEAD`, "const b = 2;", SEP, "const b = 3;", `${END} other`, ""].join("\n");
  await withRepo({ "src/merged.mjs": group, "config/data.json": group }, (root) => {
    assert.deepEqual(markerEvidence(cli("audit", root)), ["config/data.json:2-6", "src/merged.mjs:2-6"]);
  });
});

test("a file type the audit does not read is outside this check - the second limitation", async () => {
  // Not a property of this detector. `TEXT_EXT` decides which files the walk reads at all, and it
  // governs every content detector in this tool; `.txt`, `.xml` and `.csv` are outside it. Pinned
  // here because the falsifier for "non-Markdown content is covered" would otherwise read as a
  // stronger claim than the code makes, and because the untracked-file test below would be vacuous
  // if it used one of these extensions - the group would go unreported for the wrong reason.
  const group = ["x", `${OPEN} HEAD`, "a", SEP, "b", `${END} other`, ""].join("\n");
  await withRepo({ "data/notes.txt": group }, (root) => {
    assert.deepEqual(
      markerEvidence(cli("audit", root)),
      [],
      "the readable-extension set changed; this limitation and the finding's message move together",
    );
  });
});

test("a backtick run in a non-Markdown file does not shelter a group", async () => {
  // A fence is a Markdown construct. Three backticks in a .mjs file are three backticks, so the
  // same bytes that would be excluded in a .md are reported here — which is what makes the exclusion a
  // property of the file type rather than of the characters.
  const withTicks = ["x", FENCE, `${OPEN} HEAD`, "a", SEP, "b", `${END} other`, FENCE, ""].join("\n");
  await withRepo({ "src/ticks.mjs": withTicks }, (root) => {
    assert.deepEqual(markerEvidence(cli("audit", root)), ["src/ticks.mjs:3-7"]);
  });
});

test("the diff3 conflict style is covered", async () => {
  const diff3 = [
    "x",
    `${OPEN} HEAD`,
    "ours",
    `${BASE} merged common ancestors`,
    "base",
    SEP,
    "theirs",
    `${END} other`,
    "",
  ].join("\n");
  await withRepo({ "src/diff3.mjs": diff3 }, (root) => {
    assert.deepEqual(markerEvidence(cli("audit", root)), ["src/diff3.mjs:2-8"]);
  });
});

// ---------------------------------------------------------------- tracked files only

test("an untracked file holding a real group is not reported", async () => {
  const group = ["x", `${OPEN} HEAD`, "a", SEP, "b", `${END} other`, ""].join("\n");
  await withRepo(
    { "src/scratch.mjs": group },
    (root) => {
      assert.deepEqual(
        markerEvidence(cli("audit", root)),
        [],
        "one developer's untracked working state was reported as repository content",
      );
    },
    { untracked: ["src/scratch.mjs"] },
  );
});

test("where the index cannot be read, tracked-ness is unknown rather than clean", async () => {
  const group = ["x", `${OPEN} HEAD`, "a", SEP, "b", `${END} other`, ""].join("\n");
  await withRepo(
    { "src/notes.mjs": group },
    (root) => {
      const json = cli("audit", root);
      assert.deepEqual(markerEvidence(json), [], "a finding was asserted over an unreadable index");
      assert.ok(
        unavailableEvidence(json).includes("src/notes.mjs:2-6"),
        "absence of the repository was reported as absence of the marker",
      );
    },
    { init: false },
  );
});

// ------------------------------------------- the known limitation, asserted rather than implied

test("a genuine group inside a fence is NOT reported — the recorded limitation", async () => {
  // This is a real miss, not a preference. A conflict can land inside a fenced example, and this
  // check will not see it. The test exists so the gap is a pinned, deliberate property rather than
  // untested behaviour a later reader mistakes for coverage. Issue #58 owns whether the trade is
  // acceptable as a normative rule; until then the finding's own message discloses it.
  const insideFence = [
    "# A plan item",
    "",
    `${FENCE}text`,
    `${OPEN} HEAD`,
    "ours",
    SEP,
    "theirs",
    `${END} other`,
    FENCE,
    "",
  ].join("\n");
  await withRepo({ "artifacts/08.md": insideFence }, (root) => {
    assert.deepEqual(
      markerEvidence(cli("audit", root)),
      [],
      "the fence exclusion changed; update issue #58 and this test together",
    );
  });
});

// ------------------------------------------------------------------------------- anti-vacuity

test("a repository with no markers raises nothing", async () => {
  await withRepo({ "docs/plain.md": "# Plain\n\nNothing to see.\n" }, (root) => {
    const json = cli("audit", root);
    assert.deepEqual(markerEvidence(json), []);
    assert.deepEqual(unavailableEvidence(json), []);
  });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { check, normalize, mermaidBlocks } from "../scripts/diagrams.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(ROOT, "test/fixtures/diagrams");

// --- Known-positive ----------------------------------------------------------------------------

test("this repository's diagrams are in sync", async () => {
  const result = await check(ROOT);
  assert.deepEqual(result.findings, []);
  assert.ok(result.sources.length > 0, "no .mmd source found — the check would pass vacuously");
});

test("an embedded copy matching its source is not reported", async () => {
  const result = await check(path.join(FIXTURES, "in-sync"));
  assert.deepEqual(result.findings, []);
});

// --- Known-negative ----------------------------------------------------------------------------

test("an embedded copy that drifted from its source is caught", async () => {
  const result = await check(path.join(FIXTURES, "drifted"));
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].message, /no embedded copy matches this source/);
});

test("an SVG with no Mermaid source is caught", async () => {
  // The exact state ADR 0003 abolished: a hand-authored diagram with nothing it derives from.
  const result = await check(path.join(FIXTURES, "orphan-svg"));
  assert.equal(result.findings.length, 1);
  assert.match(result.findings[0].message, /no \.mmd source/);
});

// --- Mutation ----------------------------------------------------------------------------------

test("mutating the canonical source makes the check fail — mutation test", async () => {
  // A freshness check never observed failing is an assumption about the check, not evidence about
  // the diagrams (Standard 29 R5). Reintroduce the drift and confirm it is caught.
  //
  // THE DRIFT IS INTRODUCED IN A COPY, NOT IN THE TREE. This test used to write the mutated diagram
  // over `docs/architecture.mmd` and restore it in a `finally`. Restoring is not enough: the test
  // runner executes files concurrently, so for the width of that window the repository on disk did
  // not match its commit — and `test/local-ci.test.mjs`'s byte-for-byte invariant, which hashes the
  // whole tree with `--no-filters`, can run inside it. It did, the first time a tenth test file
  // changed the scheduling, and the gate reported `docs/architecture.mmd` as differing from its
  // committed content. That was true while it lasted and nothing was left behind, which is what
  // makes the failure worth fixing at the source rather than tolerating: a check whose result
  // depends on which other test happens to be running is not evidence.
  //
  // The mutation still uses the real canonical source and the real document that embeds it — copied
  // into a scratch tree — so what is being falsified is unchanged. Only the tree being written to
  // is.
  const source = path.join(ROOT, "docs/architecture.mmd");
  const original = await readFile(source, "utf8");

  // Which document embeds it is discovered rather than named, so moving the diagram's home does not
  // silently reduce this to a test of an empty directory.
  const baseline = await check(ROOT);
  const host = [...baseline.embedded.entries()].find(([, blocks]) => blocks.includes(normalize(original)))?.[0];
  assert.ok(host, "the canonical source is embedded in no document — there would be nothing to drift from");

  const dir = await mkdtemp(path.join(tmpdir(), "diagrams-mutation-"));
  try {
    await mkdir(path.join(dir, "docs"), { recursive: true });
    await writeFile(path.join(dir, "docs/architecture.mmd"), original);
    await writeFile(path.join(dir, path.basename(host)), await readFile(host, "utf8"));

    // The control: faithfully copied, the pair is clean. Without this the assertion below would
    // also pass against a scratch tree that was simply broken on arrival.
    assert.deepEqual((await check(dir)).findings, [], "the copied pair does not reproduce a clean result");

    await writeFile(path.join(dir, "docs/architecture.mmd"), original.replace("flowchart TB", "flowchart LR"));
    const result = await check(dir);
    assert.equal(result.findings.length, 1, "drift in the canonical source went undetected");
    assert.match(result.findings[0].file, /architecture\.mmd$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- Units -------------------------------------------------------------------------------------

test("comparison ignores line endings and trailing whitespace, not content", () => {
  assert.equal(normalize("a\r\nb  \n"), normalize("a\nb"));
  assert.notEqual(normalize("a\nb"), normalize("a\nc"));
});

test("every mermaid fence in a document is extracted", () => {
  const blocks = mermaidBlocks("x\n```mermaid\nA\n```\ny\n```mermaid\nB\n```\n");
  assert.deepEqual(blocks.map((b) => b.trim()), ["A", "B"]);
});

test("non-mermaid fences are not treated as diagrams", () => {
  assert.deepEqual(mermaidBlocks("```js\nflowchart TB\n```\n"), []);
});

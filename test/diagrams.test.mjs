import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
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
  // the diagrams (Standard 29 R5). Reintroduce the drift, confirm it is caught, restore.
  const source = path.join(ROOT, "docs/architecture.mmd");
  const original = await readFile(source, "utf8");
  try {
    await writeFile(source, original.replace("flowchart TB", "flowchart LR"));
    const result = await check(ROOT);
    assert.equal(result.findings.length, 1, "drift in the canonical source went undetected");
    assert.match(result.findings[0].file, /architecture\.mmd$/);
  } finally {
    await writeFile(source, original);
  }
  assert.deepEqual((await check(ROOT)).findings, [], "fixture was not restored");
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

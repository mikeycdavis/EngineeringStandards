import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MARKER_BEGIN,
  MARKER_END,
  OPERATING_RULES,
  renderAgentInstructions,
  injectAgentInstructions,
} from "../scripts/agent-instructions.mjs";
import { plan, apply, frameworkVersion } from "../scripts/init.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFile(p, "utf8");

const scratch = () => mkdtemp(path.join(tmpdir(), "standards-agent-instructions-"));

// --- The generated block ------------------------------------------------------------------------

test("the generated block states the framework version it was generated from", async () => {
  // An instruction block that does not say which revision it indexes is unfalsifiable: a reader
  // cannot tell a current index from one written two majors ago, and both look authoritative.
  const version = (await read(path.join(ROOT, "VERSION"))).trim();
  assert.equal(frameworkVersion(), version, "init reads a different version than VERSION holds");
  assert.match(renderAgentInstructions(version), new RegExp(`standards ${version.replace(/\./g, "\\.")}`));
});

test("the version is not a hardcoded literal anywhere in the generator", async () => {
  // The defect this repeats otherwise is the one `stampVersion` was written to end: a version
  // constant in a file releases do not touch, left one behind by every release. The generator takes
  // the version as a parameter and the CLI supplies it from VERSION, so there is nothing to forget.
  const src = await read(path.join(ROOT, "scripts/agent-instructions.mjs"));
  assert.doesNotMatch(src, /\d+\.\d+\.\d+/, "agent-instructions.mjs contains a literal version");
  assert.throws(() => renderAgentInstructions(""), TypeError);
  assert.throws(() => renderAgentInstructions(undefined), TypeError);
});

test("every operating rule names the canonical text that governs it", async () => {
  // This is what keeps the block an index rather than a copy (Standard 17 R4). A line with no
  // governing source is a free-floating prohibition — the fork R2 prohibits, in miniature.
  assert.ok(OPERATING_RULES.length >= 10, "the operating rules have shrunk below the agreed set");
  for (const { rule, governs } of OPERATING_RULES) {
    assert.ok(rule.trim().length > 0);
    assert.match(
      governs,
      /Standard \d+ R\d+|ADR \d{4}|`[a-z][\w.-]*`/,
      `operating rule names no governing source: ${rule}`,
    );
  }
});

test("every standard and ADR the block cites actually exists", async () => {
  // A prohibition pointing at a requirement that is not there is worse than no pointer: it reads as
  // canonical backing and cannot be followed to anything. Resolved against the files, not asserted.
  const { readdirSync } = await import("node:fs");
  const standards = readdirSync(path.join(ROOT, "standards"));
  const adrs = readdirSync(path.join(ROOT, "artifacts/adr"));

  for (const { governs, rule } of OPERATING_RULES) {
    for (const [, number, requirement] of governs.matchAll(/Standard (\d+) (R\d+)/g)) {
      const file = standards.find((f) => f.startsWith(`${number}-`));
      assert.ok(file, `${rule} cites Standard ${number}, which does not exist`);
      const text = await read(path.join(ROOT, "standards", file));
      assert.match(
        text,
        new RegExp(`^### ${requirement} `, "m"),
        `${rule} cites Standard ${number} ${requirement}, which that standard does not define`,
      );
    }
    for (const [, id] of governs.matchAll(/ADR (\d{4})/g)) {
      assert.ok(adrs.some((f) => f.startsWith(`${id}-`)), `${rule} cites ADR ${id}, which does not exist`);
    }
  }
});

test("every rule id the block cites is in the catalog", async () => {
  // The rule ids are the machine-checkable half of the same pointer. An id that the catalog does
  // not define would send an agent looking for a rule the evaluator has never heard of.
  const { loadCatalog } = await import("../scripts/catalog.mjs");
  const catalog = await loadCatalog(path.join(ROOT, "rules"));
  const known = catalog.rules; // Map<id, rule>
  for (const { governs, rule } of OPERATING_RULES) {
    for (const [, id] of governs.matchAll(/`([a-z][a-z0-9]*(?:\.[a-z0-9-]+)+)`/g)) {
      assert.ok(known.has(id), `${rule} cites rule ${id}, which the catalog does not define`);
    }
  }
});

test("the block says the standards govern it, not the other way round", async () => {
  // Without this it reads as the authority rather than as an index of one, which is precisely how a
  // bootstrap copy comes to win in practice (Standard 17 R2).
  const text = renderAgentInstructions("9.9.9");
  assert.match(text, /index/i);
  // Line-wrap tolerant: the block is prose, and a wrap must not be able to silently drop the
  // sentence that stops it reading as the authority.
  assert.match(text, /not a\s+substitute for reading the standards/i);
  assert.match(text, /replaced when it is regenerated/i);
});

// --- Injection ----------------------------------------------------------------------------------

test("injection replaces the marked region and nothing outside it", () => {
  const doc = `before\n${MARKER_BEGIN}\nold content\n${MARKER_END}\nafter\n`;
  const out = injectAgentInstructions(doc, "1.2.3");
  assert.ok(out.startsWith("before\n"), "content before the block was disturbed");
  assert.ok(out.endsWith("\nafter\n"), "content after the block was disturbed");
  assert.doesNotMatch(out, /old content/);
  assert.match(out, /standards 1\.2\.3/);
});

test("injection is idempotent", () => {
  const doc = `x\n${MARKER_BEGIN}\n${MARKER_END}\ny\n`;
  const once = injectAgentInstructions(doc, "1.2.3");
  assert.equal(injectAgentInstructions(once, "1.2.3"), once);
});

test("a document with no markers is returned unchanged", () => {
  // init writes five files and only AGENTS.md carries the block, so absence is the ordinary case.
  const doc = "# CLAUDE.md\n\nnothing to inject here\n";
  assert.equal(injectAgentInstructions(doc, "1.2.3"), doc);
});

test("a half-marked document throws rather than being written over", () => {
  // The dangerous direction: writing over one boundary leaves an instruction file whose markers no
  // longer delimit anything, and the next run would eat whatever followed.
  assert.throws(() => injectAgentInstructions(`a\n${MARKER_BEGIN}\nb\n`, "1.2.3"), /malformed/);
  assert.throws(() => injectAgentInstructions(`a\n${MARKER_END}\nb\n`, "1.2.3"), /malformed/);
  assert.throws(() => injectAgentInstructions(`${MARKER_END}\nx\n${MARKER_BEGIN}\n`, "1.2.3"), /malformed/);
});

test("the AGENTS.md template still carries both markers", async () => {
  // This is what stops "returned unchanged" from quietly becoming "the block was dropped". If a
  // template edit removes a marker, init would write an instruction file with no operating rules
  // and report success — a false green in the bootstrap itself.
  const template = await read(path.join(ROOT, "templates/AGENTS.md"));
  assert.ok(template.includes(MARKER_BEGIN), "templates/AGENTS.md lost its BEGIN marker");
  assert.ok(template.includes(MARKER_END), "templates/AGENTS.md lost its END marker");
});

// --- What init actually writes -------------------------------------------------------------------

test("init writes the operating rules into AGENTS.md", async () => {
  const root = await scratch();
  await apply(root, await plan(root));

  const written = await read(path.join(root, "AGENTS.md"));
  assert.match(written, new RegExp(`standards ${frameworkVersion().replace(/\./g, "\\.")}`));
  for (const { rule } of OPERATING_RULES) {
    assert.ok(written.includes(rule), `init wrote AGENTS.md without: ${rule}`);
  }
  // The template's explanatory comment lives between the markers and is replaced by generation, so
  // an adopter never sees instructions addressed to whoever maintains the template.
  assert.doesNotMatch(written, /Do not write rules here by hand/);
});

test("the dry run predicts the bytes the real run writes", async () => {
  // Standard 33 R5: a dry run that does not predict the real run is worse than none, because it is
  // trusted. Generation is the transformation most likely to exist on one path and not the other.
  const root = await scratch();
  const dry = await plan(root);
  const predicted = dry.actions.find((a) => a.path === "AGENTS.md");
  await apply(root, dry);
  const written = await read(path.join(root, "AGENTS.md"));
  assert.equal(predicted.bytes, written.length, "the dry run predicted a different size");
});

test("a second init leaves an already-generated AGENTS.md alone", async () => {
  // Idempotence (Standard 33 R3), and the comparison now includes generated content: if plan()
  // compared against the raw template it would report a conflict against text it had just written.
  const root = await scratch();
  await apply(root, await plan(root));
  const second = await plan(root);
  assert.ok(second.preserved.includes("AGENTS.md"), `AGENTS.md was not preserved: ${JSON.stringify(second.actions.find((a) => a.path === "AGENTS.md"))}`);
  assert.deepEqual(second.conflicts, []);
});

test("an AGENTS.md edited by hand is a conflict, not an overwrite", async () => {
  // The block is generated, but the file around it belongs to the project. init still refuses to
  // replace a file that differs (Standard 33 R2) — including one whose block is out of date, which
  // is the case an adopter is most likely to hit at an upgrade.
  const root = await scratch();
  await apply(root, await plan(root));
  const file = path.join(root, "AGENTS.md");
  await writeFile(file, (await read(file)).replace(/standards \d+\.\d+\.\d+/, "standards 0.0.1"), "utf8");

  const replanned = await plan(root);
  assert.deepEqual(replanned.overwrites, []);
  assert.equal(replanned.conflicts.length, 1);
  assert.equal(replanned.conflicts[0].path, "AGENTS.md");
  assert.match(await read(file), /standards 0\.0\.1/, "init changed the file it reported as a conflict");
});

test("the generated instruction file stays shorter than the standard it routes to", async () => {
  // Standard 17 R2's own test, applied to what an adopter actually receives rather than to the
  // template. The template passes that check trivially now that the rules are injected at write
  // time; this is the check that still bites.
  const root = await scratch();
  await mkdir(root, { recursive: true });
  await apply(root, await plan(root));

  const generated = (await read(path.join(root, "AGENTS.md"))).length;
  const standard = (await read(path.join(ROOT, "standards/17-agent-instruction-files.md"))).length;
  assert.ok(
    generated < standard,
    `the generated AGENTS.md (${generated} bytes) is longer than Standard 17 (${standard}) — it is duplicating rather than routing`,
  );
});

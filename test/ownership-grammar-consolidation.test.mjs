/**
 * ST-20 (#98): the plan-grammar (class A) Codex findings, pinned against the CONSOLIDATED behaviour.
 *
 * Five of the eleven findings raised on #82, #87, #89, #93 and #94 were the ownership check's own copy of the
 * plan grammar disagreeing with the canonical one. Each test here states the finding's input and requires
 * what only one shared grammar gives: the claim ownership makes equals the issue links in the span the
 * CANONICAL parser (`parsePlanDocument`) draws for that field, boundaries included, and a `Tracked by`
 * written in a form the grammar rejects is a reported problem rather than a silent absence. They fail on
 * develop before ST-20 (there is no shared span to agree with, and a malformed `Tracked by` was silent) and
 * pass after. The link-extraction findings (class B) live in test/ownership-link-boundaries.test.mjs and
 * the classification finding (#82 container) in test/ownership.test.mjs, unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import * as std from "../scripts/standards.mjs";
import * as own from "../scripts/ownership.mjs";

const PLAN = "artifacts/project-plan-breakdown";
const U = (n) => `https://github.com/o/r/issues/${n}`;

async function owned(text) {
  const root = await mkdtemp(path.join(tmpdir(), "grammar-"));
  try {
    await mkdir(path.join(root, "artifacts/backlog"), { recursive: true });
    await mkdir(path.join(root, PLAN), { recursive: true });
    await writeFile(path.join(root, "artifacts/backlog/github-mapping.json"), JSON.stringify({ target: "o/r" }), "utf8");
    await writeFile(path.join(root, PLAN, "p.md"), text, "utf8");
    return await own.collectPlanOwnership(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

const L = (...x) => x.join("\n");
const trackedSpans = (text) =>
  std.parsePlanDocument(text, "p.md").items.flatMap((i) => i.spans.filter((s) => s.key === "Tracked by" || s.key === "TrackedBy"));
/** The claims the canonical spans imply: first readable Tracked by per item, links to o/r. */
const fromSpans = (text) =>
  std.parsePlanDocument(text, "p.md").items.flatMap((item) => {
    const first = item.spans.find((s) => (s.key === "Tracked by" || s.key === "TrackedBy") && s.kind === "field" && s.attributed);
    return first ? [...new Set(own.extractIssueLinks(first.text).filter((l) => `${l.owner}/${l.repo}` === "o/r").map((l) => l.issue))] : [];
  });

test("A1 #82 (b98f736, L92): a qualified Tracked by is read through the canonical field grammar; a rejected qualifier is reported", async () => {
  const text = L(
    "### A", `- **Tracked by — ext:** ${U(1)}`,
    "### B", `- **TrackedBy — ext:** ${U(2)}`,
    "### C", `- **Tracked by – ext:** ${U(3)}`,
    "",
  );
  const spans = trackedSpans(text);
  assert.deepEqual(spans.map((s) => [s.key, s.kind]), [["Tracked by", "field"], ["TrackedBy", "field"], ["Tracked by", "separator"]]);
  const o = await owned(text);
  assert.deepEqual(o.claims.map((c) => c.issue), fromSpans(text));
  assert.deepEqual(o.claims.map((c) => `${c.issue}@${c.title}`), ["1@A", "2@B"]);
  assert.deepEqual(o.problems.map((p) => `${p.kind}@${p.line}`), ["plan-tracked-by-malformed@6"]);
});

test("A2 #87 (873345f, L119): a value ends at an indented next field, as the canonical grammar draws the span", async () => {
  const text = L("### A", `- **Tracked by:** [#10](${U(10)})`, `  - **Evidence:** [#20](${U(20)})`, "- **Purpose:** x", "");
  const [span] = trackedSpans(text);
  assert.equal(span.endLine, 2);
  assert.ok(!span.text.includes("issues/20"));
  const o = await owned(text);
  assert.deepEqual(o.claims.map((c) => c.issue), [10]);
  assert.deepEqual(o.claims.map((c) => c.issue), fromSpans(text));
});

test("A3 #89 (1e8b882, L126): a value stops only at an actual next field; bold list items continue it", async () => {
  const text = L(
    "### A",
    "- **Tracked by:**",
    `  - **[#10](${U(10)})**`,
    `  - **[#11](${U(11)})** and trailing text`,
    `- **Evidence:** ${U(20)}`,
    "",
  );
  const [span] = trackedSpans(text);
  assert.equal(span.endLine, 4);
  const o = await owned(text);
  assert.deepEqual(o.claims.map((c) => c.issue), [10, 11]);
  assert.deepEqual(o.claims.map((c) => c.issue), fromSpans(text));
});

test("A4 #93 (2758726, L84): a colon-less or wrapped malformed field ends the value, and a malformed Tracked by is reported", async () => {
  const text = L(
    "### A",
    `- **Tracked by:** ${U(10)}`,
    `- **Purpose** ${U(20)}`,
    "### B",
    `- **Tracked by:** ${U(11)}`,
    "- **Acceptance Criteria",
    `  ${U(21)}`,
    "### C",
    `- **Tracked by** ${U(12)}`,
    "",
  );
  const doc = std.parsePlanDocument(text, "p.md");
  assert.deepEqual(doc.items.map((i) => i.spans.find((s) => s.key === "Tracked by").endLine), [2, 5, 9]);
  assert.deepEqual(doc.items[0].syntax.map((s) => `${s.kind}:${s.key}`), ["syntax:Purpose"]);
  const o = await owned(text);
  assert.deepEqual(o.claims.map((c) => c.issue), [10, 11]);
  assert.deepEqual(o.claims.map((c) => c.issue), fromSpans(text));
  assert.deepEqual(o.problems.map((p) => `${p.kind}@${p.line}`), ["plan-tracked-by-malformed@9"]);
});

test("A5 #93 (2758726, L84): a misplaced-colon field whose label has parentheses or a slash ends the value", async () => {
  const text = L(
    "### A",
    `- **Tracked by:** ${U(10)}`,
    `- **Verification (CI/local)**: ${U(20)}`,
    "### B",
    `- **Tracked by:** ${U(11)}`,
    `- **Purpose (why)**: ${U(21)}`,
    "### C",
    `- **Tracked by:** ${U(12)}`,
    `  - **[${U(13)}](${U(13)})**`,
    "",
  );
  const spans = trackedSpans(text);
  assert.deepEqual(spans.map((s) => s.endLine), [2, 5, 9]);
  const o = await owned(text);
  assert.deepEqual(o.claims.map((c) => c.issue), [10, 11, 12, 13]);
  assert.deepEqual(o.claims.map((c) => c.issue), fromSpans(text));
});

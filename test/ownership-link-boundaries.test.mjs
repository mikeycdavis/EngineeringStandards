/**
 * ST-20 (#98): the link-extraction (class B) Codex findings, kept pinned through the consolidation.
 *
 * Five findings were about reading an issue link out of a `Tracked by` VALUE: repository matching and link
 * boundaries. No plan-item parser models that, so consolidation does not touch what they require: these tests
 * pass on develop before ST-20 and after, and stay owned by ownership's link extraction. They call only
 * `collectPlanClaims`, which returned an array before ST-20 and returns a promise of one after (`await` is
 * correct for both).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectPlanClaims } from "../scripts/ownership.mjs";

const PLAN = "artifacts/project-plan-breakdown";
const U = (n) => `https://github.com/o/r/issues/${n}`;

async function claimed(...values) {
  const root = await mkdtemp(path.join(tmpdir(), "links-"));
  try {
    await mkdir(path.join(root, "artifacts/backlog"), { recursive: true });
    await mkdir(path.join(root, PLAN), { recursive: true });
    await writeFile(path.join(root, "artifacts/backlog/github-mapping.json"), JSON.stringify({ target: "o/r" }), "utf8");
    const text = values.map((v, i) => `### I${i}\n\n- **Tracked by:** ${v}\n\n`).join("");
    await writeFile(path.join(root, PLAN, "p.md"), text, "utf8");
    const claims = await collectPlanClaims(root);
    return values.map((_, i) => claims.filter((c) => c.title === `I${i}`).map((c) => c.issue));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("B1 #82 (b98f736, L69): only links into the mapped repository are claims; the match ignores case and www", async () => {
  const r = await claimed(
    "https://github.com/x/y/issues/1",
    "https://github.com/o/r/pull/2",
    "HTTP://WWW.GITHUB.COM/O/R/issues/3",
    "https://github.com/o/r/issues/4",
  );
  assert.deepEqual(r, [[], [], [3], [4]]);
});

test("B2 #87 (873345f, L78): an issue URL embedded inside a longer URL or word is not a claim", async () => {
  const r = await claimed(
    `https://x.example/?u=${U(1)}`,
    `prefixhttps://github.com/o/r/issues/2`,
    `https://github.com/o/r/issues/3/comments`,
    `[#4](${U(4)})`,
  );
  assert.deepEqual(r, [[], [], [3], [4]]);
});

test("B3 #93 (e47cfcd, L85): a separator inside an already-started URL does not make the URL after it a claim", async () => {
  const r = await claimed(
    `https://x.example/?next;${U(1)}`,
    `https://x.example/?next,${U(2)}`,
    `${U(3)},${U(4)};${U(5)}`,
    `see (${U(6)}), and ${U(7)}`,
  );
  assert.deepEqual(r, [[], [], [3], [6, 7]]);
});

test("B4 #93 (2758726, L123): an issue URL inside a non-hierarchical URL (data:, mailto:, urn:, javascript:) is not a claim", async () => {
  const r = await claimed(
    `data:text/plain,${U(1)}`,
    `mailto:a@b.c?x=${U(2)}`,
    `urn:x:${U(3)}`,
    `javascript:go("${U(4)}")`,
    `plain ${U(5)}`,
  );
  assert.deepEqual(r, [[], [], [], [], [5]]);
});

test("B5 #94 (69b7902, L129): an opening ( < [ inside a token that began with a scheme is not a claim", async () => {
  const r = await claimed(
    `data:text/plain,(${U(1)})`,
    `mailto:a@b.c?x=[${U(2)}]`,
    `urn:x:<${U(3)}>`,
    `see (${U(4)}) <${U(5)}> [${U(6)}]`,
    `x:[#7](${U(7)})`,
  );
  assert.deepEqual(r, [[], [], [], [4, 5, 6], [7]]);
});

/**
 * Correction forward for the Codex review of #101 (ST-20) and the open P2 of #99, each pinned red-first:
 *
 *   #101 P2 scripts/standards.mjs:2211  an empty ATX heading (`##`, `#`) ends attribution like any other
 *   #101 P2 scripts/ownership.mjs:184   a framework-excluded directory inside the plan tree is incomplete evidence
 *   #99  P2 scripts/ownership.mjs:127   `](` exempts a destination from the enclosing-scheme check only when
 *                                       that `]` closes a Markdown label
 *   #102 P2 scripts/ownership.mjs:125   a backslash-escaped `[` opens no label and a backslash-escaped `]`
 *                                       closes none, so an escaped label before a parenthesised destination is still inside the enclosing URL
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { parsePlanDocument, collectSurface } from "../scripts/standards.mjs";
import { collectPlanOwnership, collectPlanClaims, extractIssueLinks } from "../scripts/ownership.mjs";

const PLAN = "artifacts/project-plan-breakdown";
const U = (n) => `https://github.com/o/r/issues/${n}`;

async function scratch(files) {
  const root = await mkdtemp(path.join(tmpdir(), "followup-"));
  const all = { "artifacts/backlog/github-mapping.json": JSON.stringify({ target: "o/r" }), ...files };
  for (const [rel, text] of Object.entries(all)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text, "utf8");
  }
  return root;
}

test("#101 P2 (standards.mjs:2211): an empty `##` or `#` heading ends attribution, so a later Tracked by is not the item's claim", async () => {
  for (const heading of ["##", "#", "## ", "##\t"]) {
    const text = `### A\n${heading}\n- **Tracked by:** ${U(2)}\n`;
    const { items } = parsePlanDocument(text, "p.md");
    assert.deepEqual(items[0].spans.map((s) => s.attributed), [false], JSON.stringify(heading));
    const root = await scratch({ [`${PLAN}/p.md`]: text });
    try {
      const own = await collectPlanOwnership(root);
      assert.deepEqual(own.claims, [], JSON.stringify(heading));
      assert.deepEqual(own.problems.map((p) => `${p.kind}@${p.line}`), ["plan-claim-outside-item@3"], JSON.stringify(heading));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test("#101 P2 (standards.mjs:2211): text that only starts with # is not a heading, and `###` items are unchanged", async () => {
  const text = `### A\n##x\n#hashtag\n- **Tracked by:** ${U(2)}\n`;
  assert.deepEqual(parsePlanDocument(text, "p.md").items[0].spans.map((s) => s.attributed), [true]);
});

for (const dir of ["fixtures", "vendor", "build", "node_modules"]) {
  test(`#101 P2 (ownership.mjs:184): a plan file under a framework-excluded \`${dir}\` directory is NOT_EVALUATED, not silently absent`, async () => {
    const root = await scratch({
      [`${PLAN}/a.md`]: `### Item\n- **Tracked by:** ${U(1)}\n`,
      [`${PLAN}/${dir}/b.md`]: `### Hidden\n- **Tracked by:** ${U(2)}\n- **Tracked by:** ${U(2)}\n`,
    });
    try {
      await assert.rejects(() => collectPlanOwnership(root), new RegExp(`plan files were not fully read.*${PLAN}/${dir} was excluded`));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("#101 P2 (ownership.mjs:184): an exclusion elsewhere, or one the repository itself declared, does not withhold the plan", async () => {
  const root = await scratch({
    [`${PLAN}/a.md`]: `### Item\n- **Tracked by:** ${U(1)}\n`,
    "docs/fixtures/x.md": "x\n",
    "artifacts/vendor/y.md": "y\n",
  });
  try {
    assert.deepEqual((await collectPlanClaims(root)).map((c) => c.issue), [1]);
    const surface = await collectSurface(root);
    surface.surfaceLoss.excluded.push({ path: `${PLAN}/sub`, reason: "ignored by the repository", authorizedBy: "repository" });
    assert.deepEqual((await collectPlanOwnership(root, { surface })).claims.map((c) => c.issue), [1]);
    surface.surfaceLoss.excluded.push({ path: "artifacts", reason: "conventional non-project directory", authorizedBy: "framework" });
    await assert.rejects(() => collectPlanOwnership(root, { surface }), /artifacts was excluded/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("#99 P2 (ownership.mjs:127): `](` bypasses the enclosing-scheme check only when the `]` closes a Markdown label", () => {
  const issues = (v) => extractIssueLinks(v).map((l) => l.issue);
  // no label was opened: the destination is inside the enclosing URL
  assert.deepEqual(issues(`data:text/plain,](${U(10)})`), []);
  assert.deepEqual(issues(`mailto:a@b.c?x=](${U(11)})`), []);
  assert.deepEqual(issues(`x:](${U(12)})`), []);
  assert.deepEqual(issues(`urn:x:]](${U(13)})`), []);
  // a real label: still a link, even in a token that began with a scheme
  assert.deepEqual(issues(`x:[#7](${U(7)})`), [7]);
  assert.deepEqual(issues(`data:[a [b]](${U(14)})`), [14]);
  assert.deepEqual(issues(`[see this issue](${U(15)})`), [15]);
  assert.deepEqual(issues(`([${U(16)}](${U(16)}))`), [16, 16]);
  // an unbalanced closer does not count: the second ] has no label to close
  assert.deepEqual(issues(`x:[a]](${U(17)})`), []);
  // outside any enclosing scheme the destination is read as before
  assert.deepEqual(issues(`see ](${U(18)})`), [18]);
});

test("#99 P2 (ownership.mjs:127): end to end, a stray `](` inside a scheme token is not a claim", async () => {
  const root = await scratch({
    [`${PLAN}/a.md`]:
      `### Bad\n- **Tracked by:** data:text/plain,](${U(10)})\n` +
      `### Good\n- **Tracked by:** x:[#11](${U(11)})\n`,
  });
  try {
    assert.deepEqual((await collectPlanClaims(root)).map((c) => `${c.issue}@${c.title}`), ["11@Good"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("#102 P2 (ownership.mjs:125): a backslash-escaped bracket opens or closes no label, so the `](` shortcut does not fire", () => {
  const issues = (v) => extractIssueLinks(v).map((l) => l.issue);
  const B = "\\"; // one backslash
  // firing: escaped brackets hide the label, the destination stays inside the enclosing scheme token
  assert.deepEqual(issues(`data:${B}[x](${U(20)})`), []);
  assert.deepEqual(issues(`data:${B}[x${B}](${U(21)})`), []);
  assert.deepEqual(issues(`data:[x${B}](${U(22)})`), []); // the `[` is real but never closed
  assert.deepEqual(issues(`data:${B}${B}${B}[x](${U(23)})`), []); // an escaped backslash, then an escaped `[`
  assert.deepEqual(issues(`data:${B}]${B}[x](${U(24)})`), []);
  assert.deepEqual(issues(`data:[a${B}[b]](${U(25)})`), []); // one real label, closed once, then an unbalanced `]`
  assert.deepEqual(issues(`x:${B}${B}](${U(26)})`), []); // two backslashes are an escaped backslash; the `]` has no label
  // non-firing: a real label is still a label
  assert.deepEqual(issues(`data:${B}${B}[x](${U(30)})`), [30]); // an escaped backslash, then a real `[x]`
  assert.deepEqual(issues(`data:[a${B}]](${U(31)})`), [31]); // the escaped `]` is text; the second one closes
  assert.deepEqual(issues(`x:[#7](${U(7)})`), [7]);
  // neighbouring forms: outside an enclosing scheme the destination is a plain link whatever the escapes
  assert.deepEqual(issues(`${B}[x](${U(32)})`), [32]);
  assert.deepEqual(issues(`[x${B}](${U(33)})`), [33]);
  // an escaped `(` or an escaped first character of the destination is not a destination at all
  assert.deepEqual(issues(`data:[x]${B}(${U(34)})`), []);
  assert.deepEqual(issues(`data:[x](${B}${U(35)})`), []);
  // an escape does not carry the scheme run across it: `x` then an escaped `[` then `:` is not a scheme
  assert.deepEqual(issues(`x${B}[:*${U(38)}`), [38]);
  assert.deepEqual(issues(`x:*${U(39)}`), []);
  // a backslash before whitespace is not an escape: the whitespace still ends the token (and its scheme)
  assert.deepEqual(issues(`data:${B} *${U(40)}`), [40]);
  assert.deepEqual(issues(`data:${B}\n*${U(41)}`), [41]);
  // a later, genuine link in the same value is read independently
  assert.deepEqual(issues(`data:[x${B}](${U(36)}) y [z](${U(37)})`), [37]);
});

test("#102 P2 (ownership.mjs:125): end to end, an escaped label opener inside a scheme token is not a claim", async () => {
  const B = "\\";
  const root = await scratch({
    [`${PLAN}/a.md`]:
      `### Bad\n- **Tracked by:** data:${B}[x](${U(20)})\n` +
      `### Good\n- **Tracked by:** data:[x](${U(21)})\n`,
  });
  try {
    assert.deepEqual((await collectPlanClaims(root)).map((c) => `${c.issue}@${c.title}`), ["21@Good"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

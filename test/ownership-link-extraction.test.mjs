/**
 * ST-20 (#98) Q5: link extraction is linear in the value, and reads exactly what the old extractor read.
 *
 * Complexity is asserted with a deterministic step counter, never a clock: `extractIssueLinks(value, stats)`
 * counts the characters its single forward pass moves over (`steps`) and the links it judges (`links`). The old
 * extractor rescanned back to the previous whitespace for every link, so on an unspaced run of n links its work
 * grew as n squared (one 20,000-link value took about 139 s once); here `steps` can never exceed the length.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { extractIssueLinks, collectPlanClaims, collectPlanOwnership } from "../scripts/ownership.mjs";
import { legacyExtractLinks } from "./fixtures/legacy-plan-grammar/legacy.mjs";

const BASE = "https://github.com/o/r/issues/";
const starJoined = (n) => Array.from({ length: n }, (_, i) => `*${BASE}${i + 1}`).join("");

test("the 20,000 star-joined URL value costs at most one step per character and yields its one claim", () => {
  const value = starJoined(20000);
  const stats = { steps: 0, links: 0 };
  const links = extractIssueLinks(value, stats);
  assert.equal(value.length > 600000, true);
  assert.equal(stats.links, 20000);
  assert.ok(stats.steps <= value.length, `steps ${stats.steps} for ${value.length} characters`);
  assert.deepEqual(links, [{ owner: "o", repo: "r", issue: 1 }], "only the first link is outside an enclosing URL");
});

test("work scales linearly: one pass at every size, whatever the value's length", () => {
  for (const n of [1000, 2000, 4000, 8000]) {
    const value = starJoined(n);
    const stats = { steps: 0, links: 0 };
    extractIssueLinks(value, stats);
    assert.equal(stats.links, n);
    // One forward pass: every character before the last link is passed exactly once, none twice.
    assert.equal(stats.steps, value.lastIndexOf("https://"), `n=${n}`);
    assert.ok(stats.steps <= value.length);
  }
});

test("other adversarial shapes stay within one step per character", () => {
  const shapes = {
    "unspaced comma run": Array.from({ length: 5000 }, (_, i) => `,${BASE}${i + 1}`).join(""),
    "scheme chars before every link": Array.from({ length: 3000 }, (_, i) => `a1+.-:(${BASE}${i + 1}`).join(" "),
    "one long token then many links": `x`.repeat(50000) + starJoined(2000),
    "colons only": ":".repeat(100000) + BASE + "1",
  };
  for (const [name, value] of Object.entries(shapes)) {
    const stats = { steps: 0, links: 0 };
    extractIssueLinks(value, stats);
    assert.ok(stats.steps <= value.length, `${name}: ${stats.steps} steps for ${value.length} characters`);
  }
});

/** A small deterministic generator, so the fuzz below is the same on every run and every machine. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * The reference reading, written the slow obvious way (a backward scan per link) with the #99 P2 correction:
 * a `](` exempts a link from the enclosing-scheme check only when that `]` closes a `[` opened earlier.
 */
function referenceExtract(value) {
  const out = [];
  const SCHEME = /[A-Za-z][A-Za-z0-9+.-]*:/;
  for (const m of value.matchAll(/https?:\/\/(?:www\.)?github\.com\/([^/\s)]+)\/([^/\s)]+)\/issues\/(\d+)\b/gi)) {
    const i = m.index;
    let ok;
    if (i === 0 || /\s/.test(value[i - 1])) ok = true;
    else if (value[i - 1] === "(" && value[i - 2] === "]" && closesLabel(value, i - 2)) ok = true;
    else if (!/[(<[*"'>,;]/.test(value[i - 1])) ok = false;
    else {
      let s = i;
      while (s > 0 && !/\s/.test(value[s - 1])) s--;
      ok = !SCHEME.test(value.slice(s, i));
    }
    if (ok) out.push({ owner: m[1], repo: m[2], issue: Number(m[3]) });
  }
  return out;
}
function closesLabel(value, at) {
  let depth = 0;
  for (let k = 0; k <= at; k++) {
    if (value[k] === "[") depth++;
    else if (value[k] === "]" && depth > 0) {
      depth--;
      if (k === at) return true;
    }
  }
  return false;
}

test("equivalence: the linear extractor reads exactly what the reference (backward-scanning, label-verified) reader reads", () => {
  const pieces = [
    `${BASE}1`, `${BASE}22`, "https://github.com/x/y/issues/3", "http://www.github.com/o/r/issues/4", " ", "\t", "\n",
    "(", ")", "[", "]", "<", ">", "*", '"', "'", ",", ";", ":", "a", "Z", "1", ".", "+", "-", "x:", "mailto:", "data:", "](", "/", "~", "`", "\u00a0", "\u200b",
  ];
  const rnd = lcg(20261007);
  let judged = 0;
  let legacyOnly = 0;
  for (let i = 0; i < 8000; i++) {
    const n = 1 + Math.floor(rnd() * 14);
    let value = "";
    for (let j = 0; j < n; j++) value += pieces[Math.floor(rnd() * pieces.length)];
    const want = referenceExtract(value);
    judged += want.length;
    assert.deepEqual(extractIssueLinks(value), want, JSON.stringify(value));
    // Before the #99 P2 correction the two differed only through the `](` shortcut, so without `](` they must agree.
    if (!value.includes("](")) {
      legacyOnly++;
      assert.deepEqual(extractIssueLinks(value), legacyExtractLinks(value), JSON.stringify(value));
    }
  }
  assert.ok(judged > 1000, `the fuzz must actually accept links (${judged})`);
  assert.ok(legacyOnly > 1000, `the legacy comparison must actually run (${legacyOnly})`);
});

test("equivalence at scale: a 300-link star-joined value and a 300-link spaced value agree with the legacy extractor", () => {
  for (const value of [starJoined(300), Array.from({ length: 300 }, (_, i) => `(${BASE}${i + 1})`).join(" ")]) {
    assert.deepEqual(extractIssueLinks(value), legacyExtractLinks(value));
  }
});

async function plan(text) {
  const root = await mkdtemp(path.join(tmpdir(), "extract-"));
  await mkdir(path.join(root, "artifacts/backlog"), { recursive: true });
  await mkdir(path.join(root, "artifacts/project-plan-breakdown"), { recursive: true });
  await writeFile(path.join(root, "artifacts/backlog/github-mapping.json"), JSON.stringify({ target: "o/r" }), "utf8");
  await writeFile(path.join(root, "artifacts/project-plan-breakdown/p.md"), text, "utf8");
  return root;
}

test("end to end: a star-joined plan value that fits the read cap yields its one claim", async () => {
  const text = `### A\n\n- **Tracked by:** ${starJoined(9000)}\n`;
  assert.ok(Buffer.byteLength(text) < 400000);
  const root = await plan(text);
  try {
    assert.deepEqual(await collectPlanClaims(root), [{ file: "artifacts/project-plan-breakdown/p.md", title: "A", issue: 1 }]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("end to end: a plan over the 400,000-byte read cap is NOT evaluated, never a clean or partial result (Q4)", async () => {
  const text = `### A\n\n- **Tracked by:** ${BASE}1\n\n${"padding line\n".repeat(40000)}`;
  assert.ok(Buffer.byteLength(text) > 400000);
  const root = await plan(text);
  try {
    await assert.rejects(() => collectPlanOwnership(root), /not fully read.*p\.md was read only in part/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

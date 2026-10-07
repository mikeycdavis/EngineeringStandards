/**
 * ST-20 (#98) differential: the frozen pre-consolidation plan grammar against the consolidated one.
 *
 * `test/fixtures/legacy-plan-grammar/legacy.mjs` is a FROZEN copy of the old canonical parser and the old
 * ownership collector (develop 77687ba). This file runs both over one corpus and asserts:
 *
 *   1. Canonical parity. `fields` and `syntax` of every plan item are deep-equal between the old parser
 *      and the new one. The new parser only ADDS `line`, `level`, `spans` and `orphans`.
 *   2. Ownership parity with an enumerated allow-list. Every probe's claims equal the legacy claims, except
 *      the probes in APPROVED_DIFFERENCES, each pinned to the exact new claims AND the exact problem kinds
 *      that replace what was lost.
 *   3. Monotonic fail-closed. No input turns a claim the legacy grammar did not make into a claim (nested
 *      plan files, approved in Q4, are the one stated exception and are tested separately), and every
 *      legacy claim the new grammar drops is replaced by a reported problem in the same file.
 *
 * Corpus: this repository's plan files, every fixture plan file, every plan literal the existing tests write
 * (recorded once into recorded-literals.json), and the probe set (probes.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePlanItems, parsePlanDocument } from "../scripts/standards.mjs";
import { collectPlanOwnership } from "../scripts/ownership.mjs";
import { legacyParsePlanItems, legacyCollectPlanClaims } from "./fixtures/legacy-plan-grammar/legacy.mjs";
import { PROBES, FILE_PROBES } from "./fixtures/legacy-plan-grammar/probes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PLAN = "artifacts/project-plan-breakdown";
const MAP = "artifacts/backlog/github-mapping.json";
const FIXTURES = path.join(ROOT, "test", "fixtures", "legacy-plan-grammar");
const literals = JSON.parse(await readFile(path.join(FIXTURES, "recorded-literals.json"), "utf8"));

async function planFilesUnder(dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await planFilesUnder(full, out);
    else if (e.isFile() && e.name.endsWith(".md") && full.split(path.sep).join("/").includes("/project-plan-breakdown/")) {
      out.push(full);
    }
  }
  return out;
}

const repoPlans = await planFilesUnder(path.join(ROOT, "artifacts"));
const fixturePlans = await planFilesUnder(path.join(ROOT, "test", "fixtures"));
const corpus = [
  ...(await Promise.all(repoPlans.map(async (f) => ({ id: `repo ${path.basename(f)}`, text: await readFile(f, "utf8") })))),
  ...(await Promise.all(fixturePlans.map(async (f) => ({ id: `fixture ${path.relative(ROOT, f)}`, text: await readFile(f, "utf8") })))),
  ...PROBES.map((p) => ({ id: `probe ${p.id}`, text: p.text })),
  ...FILE_PROBES.map((p) => ({ id: `file-probe ${p.id}`, text: p.text })),
  ...literals.map((text, i) => ({ id: `literal ${i}`, text })),
];

const view = (items) => items.map((i) => ({ title: i.title, file: i.file, fields: [...i.fields], syntax: i.syntax }));

test("the corpus is not vacuous", () => {
  assert.ok(repoPlans.length >= 9, `repository plan files: ${repoPlans.length}`);
  assert.ok(fixturePlans.length >= 2, `fixture plan files: ${fixturePlans.length}`);
  assert.ok(PROBES.length >= 90, `probes: ${PROBES.length}`);
  assert.ok(literals.length >= 40, `recorded test literals: ${literals.length}`);
  const repoItems = corpus.filter((c) => c.id.startsWith("repo ")).flatMap((c) => legacyParsePlanItems(c.text, "x"));
  assert.ok(repoItems.length >= 60, `repository plan items: ${repoItems.length}`);
});

test("canonical parity: fields and syntax are deep-equal between the old parser and the new one, over the whole corpus", () => {
  for (const c of corpus) {
    assert.deepEqual(view(parsePlanItems(c.text, "p.md")), view(legacyParsePlanItems(c.text, "p.md")), c.id);
  }
});

test("the additive members describe the items without changing them", () => {
  for (const c of corpus) {
    const { items, orphans } = parsePlanDocument(c.text, "p.md");
    const lines = c.text.split(/\r?\n/);
    for (const item of items) {
      assert.equal(item.level, 3, c.id);
      assert.match(lines[item.line - 1], /^###\s+/, c.id);
      for (const s of item.spans) {
        assert.ok(s.line > item.line && s.endLine >= s.line && s.endLine <= lines.length, c.id);
        assert.equal(typeof s.text, "string");
      }
    }
    for (const s of orphans) assert.equal(s.attributed, false, c.id);
  }
});

/**
 * Probes where a legacy CLAIM is dropped with no problem, on purpose: the claim was a false positive (#99 Codex P2,
 * corrected after #101): a `](` inside a token that began with a scheme, with no `[` before it, is not a
 * Markdown link destination, so the link is inside the enclosing URL like every other enclosing-scheme case.
 * That turns a false claim into absence, the direction fail-closed requires; it never turns absence into a claim.
 */
const FALSE_POSITIVE_CORRECTIONS = new Set(["U26 stray ]( inside a scheme token", "U27 stray ]( inside a mailto token"]);

/** Pinned new behaviour for every probe whose ownership result differs from the legacy one. */
const APPROVED_DIFFERENCES = {
  "H1 level-2 heading item": { claims: [], problems: ["plan-claim-outside-item"] },
  "H2 level-4 heading item": { claims: [], problems: ["plan-claim-outside-item"] },
  "H3 level-1 heading item": { claims: [], problems: ["plan-claim-outside-item"] },
  "H4 level-2 heading after a ### item": { claims: ["1@A"], problems: ["plan-claim-outside-item"] },
  "H5 ### followed by spaces only": { claims: [], problems: ["plan-claim-untitled-item"] },
  "H6 no space after hashes": { claims: [], problems: ["plan-claim-outside-item"] },
  "H8 #### inside a ### item": { claims: ["1@A"], problems: [] },
  "H9 ### item then #### with its own Tracked by": { claims: ["1@A"], problems: ["plan-tracked-by-duplicate"] },
  "H14 empty ## heading after a ### item": { claims: [], problems: ["plan-claim-outside-item"] },
  "H15 empty # heading after a ### item": { claims: [], problems: ["plan-claim-outside-item"] },
  "U26 stray ]( inside a scheme token": { claims: [], problems: [] },
  "U27 stray ]( inside a mailto token": { claims: [], problems: [] },
  "H11 level-1 heading after a ### item": { claims: ["1@A"], problems: ["plan-claim-outside-item"] },
  "D1 duplicate Tracked by": { claims: ["1@A"], problems: ["plan-tracked-by-duplicate"] },
  "D2 duplicate via qualified and plain": { claims: ["1@A"], problems: ["plan-tracked-by-duplicate"] },
  "D4 both spellings": { claims: ["1@A"], problems: ["plan-tracked-by-duplicate"] },
  "D6 same issue in two fields": { claims: ["1@A"], problems: ["plan-tracked-by-duplicate"] },
  "D7 first duplicate malformed second valid": { claims: ["2@A"], problems: ["plan-tracked-by-malformed"] },
  "Q2 en dash qualifier with colon": { claims: [], problems: ["plan-tracked-by-malformed"] },
  "Q3 hyphen qualifier with colon": { claims: [], problems: ["plan-tracked-by-malformed"] },
  "Q4 colon-less qualified": { claims: [], problems: ["plan-tracked-by-malformed"] },
  "Q5 misplaced colon": { claims: [], problems: ["plan-tracked-by-malformed"] },
  "Q6 star bullet": { claims: [], problems: ["plan-tracked-by-malformed"] },
  "Q9 NBSP around em dash": { claims: [], problems: ["plan-tracked-by-malformed"] },
  "Q14 field before any heading": { claims: [], problems: ["plan-claim-outside-item"] },
  "Q16 BOM at file start": { claims: [], problems: ["plan-claim-outside-item"] },
  "Q18 colon-less Tracked by": { claims: [], problems: ["plan-tracked-by-malformed"] },
  "M5 empty-title heading": { claims: [], problems: ["plan-claim-untitled-item"] },
  "M6 Setext heading": { claims: [], problems: ["plan-claim-outside-item"] },
  "M7 four-space-indented heading": { claims: [], problems: ["plan-claim-outside-item"] },
};

async function scratch(files) {
  const root = await mkdtemp(path.join(tmpdir(), "differential-"));
  await mkdir(path.join(root, path.dirname(MAP)), { recursive: true });
  await writeFile(path.join(root, MAP), JSON.stringify({ target: "o/r" }), "utf8");
  for (const [name, text] of Object.entries(files)) {
    const full = path.join(root, PLAN, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text, "utf8");
  }
  return root;
}

const key = (c) => `${c.issue}@${c.title}`;

test("ownership parity: every probe matches the legacy claims, or is a pinned approved difference", async () => {
  const files = {};
  const names = new Map();
  PROBES.forEach((p, i) => {
    const name = `probe-${String(i).padStart(3, "0")}.md`;
    files[name] = p.text;
    names.set(`${PLAN}/${name}`, p.id);
  });
  const root = await scratch(files);
  try {
    const legacy = legacyCollectPlanClaims(root);
    const now = await collectPlanOwnership(root);
    const seen = new Set();
    for (const [file, id] of names) {
      const L = legacy.filter((c) => c.file === file).map(key);
      const N = now.claims.filter((c) => c.file === file).map(key);
      const P = now.problems.filter((p) => p.file === file).map((p) => p.kind);
      const approved = APPROVED_DIFFERENCES[id];
      if (approved) {
        seen.add(id);
        assert.deepEqual({ claims: N, problems: P }, approved, `${id}: pinned new behaviour`);
        assert.notDeepEqual({ claims: N, problems: P }, { claims: L, problems: [] }, `${id}: listed as a difference but is not one`);
      } else {
        assert.deepEqual(N, L, `${id}: claims must equal the legacy claims`);
        assert.deepEqual(P, [], `${id}: no problem expected`);
      }
    }
    assert.deepEqual([...seen].sort(), Object.keys(APPROVED_DIFFERENCES).sort(), "every approved difference is exercised");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("monotonic fail-closed: no new claim, and every dropped legacy claim is replaced by a reported problem", async () => {
  const files = {};
  const corrected = new Set();
  [...PROBES.map((p) => p.text), ...literals].forEach((text, i) => {
    files[`c-${String(i).padStart(3, "0")}.md`] = text;
    if (i < PROBES.length && FALSE_POSITIVE_CORRECTIONS.has(PROBES[i].id)) corrected.add(`c-${String(i).padStart(3, "0")}.md`);
  });
  const root = await scratch(files);
  try {
    const legacy = legacyCollectPlanClaims(root);
    const now = await collectPlanOwnership(root);
    const byFile = (xs, f) => xs.filter((x) => x.file === f);
    for (const name of Object.keys(files)) {
      const file = `${PLAN}/${name}`;
      const L = byFile(legacy, file).map((c) => c.issue);
      const N = byFile(now.claims, file).map((c) => c.issue);
      const P = byFile(now.problems, file);
      for (const issue of N) assert.ok(L.includes(issue), `${name}: #${issue} is a claim now and was not before`);
      const count = (xs, n) => xs.filter((x) => x === n).length;
      for (const issue of new Set(L)) {
        if (count(N, issue) < count(L, issue) && !corrected.has(name)) {
          assert.ok(P.length > 0, `${name}: a legacy claim for #${issue} disappeared with no problem reported`);
        }
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("this repository's own plan files: the same claims as the legacy collector, and no problem", async () => {
  const legacy = legacyCollectPlanClaims(ROOT).map((c) => `${c.file}|${c.issue}|${c.title}`).sort();
  const now = await collectPlanOwnership(ROOT);
  assert.deepEqual(now.problems, []);
  assert.deepEqual(now.claims.map((c) => `${c.file}|${c.issue}|${c.title}`).sort(), legacy);
  assert.ok(legacy.length >= 20, `claims: ${legacy.length}`);
});

test("file discovery (Q4): a nested plan file is read; case and extension rules follow the canonical collector", async () => {
  const root = await scratch(Object.fromEntries(FILE_PROBES.map((p) => [p.file, p.text])));
  try {
    assert.deepEqual(legacyCollectPlanClaims(root), [], "the legacy discovery saw none of them");
    const now = await collectPlanOwnership(root);
    assert.deepEqual(now.claims.map((c) => `${c.file}|${c.issue}`), [`${PLAN}/sub/p.md|1`], "only the nested .md is a plan file");
    assert.deepEqual(now.problems, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

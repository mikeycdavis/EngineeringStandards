#!/usr/bin/env node
/**
 * Prove that the standards series has not silently changed shape.
 *
 * WHY THIS EXISTS. A scan of the source once reported that item 8 did not exist, because every item
 * is written as a bare `N. Title` except item 8, which carries a Markdown heading prefix. The regex
 * was anchored on the bare form, found 43 items, and that number was written into three documents as
 * a fact about the world. It was a fact about the regex.
 *
 * So the fix is not a better regex. It is that **the inventory is not derived on every run.**
 * `artifacts/standards-source-inventory.json` was reviewed by a human once and committed as the
 * canonical enumeration. This script extracts from the source and compares the result *against* that
 * file. A parser that becomes more or less forgiving cannot redefine how many standards exist — it
 * can only disagree with the inventory, and disagreeing fails.
 *
 * MULTIPLE SOURCES. Standards derive from more than one reviewed document, so the inventory lists
 * its sources and every entry names the one it came from. Each source declares how it is extracted,
 * because the two documents are not the same shape:
 *
 *   numbered-items     the original spec, where each standard is an `N. Title` item. Extraction
 *                      finds the numbers and the comparison above applies unchanged.
 *   reviewed-sections  a prompt with no numbered items at all. There is nothing to count, so an
 *                      entry names the `##`/`###` headings it realizes and the check verifies those
 *                      headings exist. A standard claiming provenance from a section that is not
 *                      there is the same class of error as a missing item number.
 *
 * A section may be claimed by only one standard, unless the entry sets `sharedSections: true`. Two
 * standards silently claiming the same section as their whole provenance would make the mapping
 * decorative — and it is not decorative: scripts/fidelity.mjs verifies each standard's quotes
 * against the text of the sections it claims.
 *
 * Usage:
 *   node scripts/inventory.mjs           report, exit 1 on any mismatch
 *   node scripts/inventory.mjs --json    machine-readable
 *
 * No third-party dependencies, matching scripts/standards.mjs.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const INVENTORY = path.join(ROOT, "artifacts/standards-source-inventory.json");
const JSON_OUT = process.argv.includes("--json");

/**
 * Deliberately forgiving: an optional Markdown heading prefix, any leading whitespace. If this is
 * ever tightened or loosened, the comparison below is what catches the consequence.
 */
const ITEM_RE = /^#{0,3}\s*(\d{1,2})\.\s+([A-Z][^\n]{2,60})$/gm;

/**
 * Top-level items ascend monotonically through the document; a number lower than the last accepted
 * one is a nested list inside an item, not a standard. Item 22 (Adoption and Migration) contains its
 * own 1–10 list, and treating those as items would report ten false duplicates — which it did, and
 * which masked whether this check worked at all.
 *
 * A number equal to the last accepted one is a genuine duplicate heading and is reported.
 */
function extract(sourceText) {
  const found = new Map();
  const duplicates = [];
  let last = 0;
  for (const m of sourceText.matchAll(ITEM_RE)) {
    const number = Number(m[1]);
    const title = m[2].trim();
    if (number === last) {
      duplicates.push({ number, title });
    } else if (number > last) {
      found.set(number, title);
      last = number;
    }
    // number < last: nested list inside the current item — not a standard.
  }
  return { found, duplicates };
}

/** A `##` or `###` heading with exactly this text. Anchored per line, like the item regex. */
export const sectionRe = (name) =>
  new RegExp(`^#{2,3}\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");

const inventory = JSON.parse(await readFile(INVENTORY, "utf8"));

const missing = [];
const unknown = [];
const duplicates = [];
const titleMismatches = [];
const brokenSections = [];
const duplicateSections = [];
let detectedCount = 0;
let countMismatch = 0;

const orphans = inventory.standards.filter(
  (s) => !inventory.sources.some((src) => src.path === s.source),
);

for (const source of inventory.sources) {
  const sourcePath = path.join(ROOT, source.path);
  if (!existsSync(sourcePath)) {
    process.stderr.write(`inventory: source not found: ${source.path}\n`);
    process.exit(1);
  }
  const text = await readFile(sourcePath, "utf8");
  const entries = inventory.standards.filter((s) => s.source === source.path);
  if (entries.length !== source.expectedCount) countMismatch++;

  if (source.extraction === "numbered-items") {
    const { found, duplicates: dupes } = extract(text);
    detectedCount += found.size;
    if (found.size !== source.expectedCount) countMismatch++;
    duplicates.push(...dupes);

    const expected = new Map(entries.map((s) => [s.number, s.title]));
    missing.push(...[...expected.keys()].filter((n) => !found.has(n)).sort((a, b) => a - b));
    unknown.push(...[...found.keys()].filter((n) => !expected.has(n)).sort((a, b) => a - b));
    titleMismatches.push(
      ...[...expected.entries()]
        .filter(([n, t]) => found.has(n) && found.get(n) !== t)
        .map(([n, t]) => ({ number: n, expected: t, found: found.get(n) })),
    );
    continue;
  }

  if (source.extraction === "reviewed-sections") {
    // Nothing to count, so an entry counts as detected when every section it claims is really there.
    const claimedBy = new Map();
    for (const entry of entries) {
      const sections = entry.sourceSections ?? [];
      if (sections.length === 0) {
        brokenSections.push({ number: entry.number, section: "(none declared)", source: source.path });
        continue;
      }
      let ok = true;
      for (const section of sections) {
        if (!sectionRe(section).test(text)) {
          brokenSections.push({ number: entry.number, section, source: source.path });
          ok = false;
        }
        if (claimedBy.has(section) && !entry.sharedSections) {
          duplicateSections.push({ section, claimedBy: [claimedBy.get(section), entry.number] });
        } else if (!claimedBy.has(section)) {
          claimedBy.set(section, entry.number);
        }
      }
      if (ok) detectedCount++;
    }
    continue;
  }

  process.stderr.write(`inventory: unknown extraction mode: ${source.extraction}\n`);
  process.exit(1);
}

// Implementation state, and integrity of the paths the inventory claims.
const standardFiles = (await readdir(path.join(ROOT, "standards"))).filter((f) => /^\d\d-.*\.md$/.test(f));
const claimed = inventory.standards.filter((s) => s.implementedBy);
const brokenPaths = claimed.filter((s) => !existsSync(path.join(ROOT, s.implementedBy)));
const unclaimedFiles = standardFiles
  .map((f) => `standards/${f}`)
  .filter((p) => !claimed.some((s) => s.implementedBy === p));

const sumOfSources = inventory.sources.reduce((n, s) => n + s.expectedCount, 0);

const problems =
  (inventory.expectedCount !== inventory.standards.length ? 1 : 0) +
  (inventory.expectedCount !== sumOfSources ? 1 : 0) +
  (inventory.expectedCount !== detectedCount ? 1 : 0) +
  countMismatch + orphans.length +
  missing.length + unknown.length + duplicates.length + titleMismatches.length +
  brokenSections.length + duplicateSections.length +
  brokenPaths.length + unclaimedFiles.length;

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify(
      {
        expectedCount: inventory.expectedCount,
        detectedCount,
        declaredCount: inventory.standards.length,
        implementedCount: claimed.length,
        missing, unknown, duplicates, titleMismatches, brokenPaths, unclaimedFiles,
        brokenSections, duplicateSections,
        orphans: orphans.map((s) => s.number),
        sources: inventory.sources.map((s) => ({
          path: s.path,
          extraction: s.extraction,
          expectedCount: s.expectedCount,
          declaredCount: inventory.standards.filter((e) => e.source === s.path).length,
        })),
        ok: problems === 0,
      },
      null,
      2,
    ) + "\n",
  );
  process.exit(problems === 0 ? 0 : 1);
}

const line = (label, value) => `${label.padEnd(28)} ${value}`;
const list = (xs) => (xs.length === 0 ? "none" : xs.join(", "));

const out = [
  line("Expected source standards:", inventory.expectedCount),
  line("Detected source standards:", detectedCount),
  line("Implemented standards:", claimed.length),
  "",
];

for (const source of inventory.sources) {
  const declared = inventory.standards.filter((e) => e.source === source.path).length;
  out.push(line(`  ${source.extraction}:`, `${declared}/${source.expectedCount}  ${source.path}`));
}

out.push(
  "",
  line("Missing source numbers:", list(missing)),
  line("Duplicate source numbers:", list(duplicates.map((d) => `${d.number} (${d.title})`))),
  line("Unknown standards:", list(unknown)),
  line("Title mismatches:", list(titleMismatches.map((t) => `${t.number}: "${t.found}" ≠ "${t.expected}"`))),
  line("Missing source sections:", list(brokenSections.map((b) => `${b.number}: "${b.section}"`))),
  line("Doubly-claimed sections:", list(duplicateSections.map((d) => `"${d.section}" (${d.claimedBy.join(", ")})`))),
  line("Entries with no source:", list(orphans.map((s) => s.number))),
  line("Broken implementedBy paths:", list(brokenPaths.map((s) => s.implementedBy))),
  line("Unclaimed standard files:", list(unclaimedFiles)),
);

if (inventory.expectedCount !== inventory.standards.length) {
  out.push("", `! inventory declares expectedCount ${inventory.expectedCount} but lists ${inventory.standards.length} standards`);
}
if (inventory.expectedCount !== sumOfSources) {
  out.push("", `! expectedCount ${inventory.expectedCount} is not the sum of its sources (${sumOfSources})`);
}
if (problems > 0) {
  out.push(
    "",
    "The inventory is the canonical enumeration and was reviewed by a human. A disagreement means",
    "either the source changed, or the extraction changed. Establish which before editing the",
    "inventory — regenerating it from a run would destroy the guarantee it exists to provide.",
  );
} else {
  out.push("", "Source extraction agrees with the reviewed inventory.");
}

process.stdout.write(out.join("\n") + "\n");
process.exit(problems === 0 ? 0 : 1);

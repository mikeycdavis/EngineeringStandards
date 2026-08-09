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

const inventory = JSON.parse(await readFile(INVENTORY, "utf8"));
const sourcePath = path.join(ROOT, inventory.source);
if (!existsSync(sourcePath)) {
  process.stderr.write(`inventory: source not found: ${inventory.source}\n`);
  process.exit(1);
}
const { found, duplicates } = extract(await readFile(sourcePath, "utf8"));

const expected = new Map(inventory.standards.map((s) => [s.number, s.title]));
const missing = [...expected.keys()].filter((n) => !found.has(n)).sort((a, b) => a - b);
const unknown = [...found.keys()].filter((n) => !expected.has(n)).sort((a, b) => a - b);
const titleMismatches = [...expected.entries()]
  .filter(([n, t]) => found.has(n) && found.get(n) !== t)
  .map(([n, t]) => ({ number: n, expected: t, found: found.get(n) }));

// Implementation state, and integrity of the paths the inventory claims.
const standardFiles = (await readdir(path.join(ROOT, "standards"))).filter((f) => /^\d\d-.*\.md$/.test(f));
const claimed = inventory.standards.filter((s) => s.implementedBy);
const brokenPaths = claimed.filter((s) => !existsSync(path.join(ROOT, s.implementedBy)));
const unclaimedFiles = standardFiles
  .map((f) => `standards/${f}`)
  .filter((p) => !claimed.some((s) => s.implementedBy === p));

const problems =
  (inventory.expectedCount !== inventory.standards.length ? 1 : 0) +
  (inventory.expectedCount !== found.size ? 1 : 0) +
  missing.length + unknown.length + duplicates.length +
  titleMismatches.length + brokenPaths.length + unclaimedFiles.length;

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify(
      {
        expectedCount: inventory.expectedCount,
        detectedCount: found.size,
        declaredCount: inventory.standards.length,
        implementedCount: claimed.length,
        missing, unknown, duplicates, titleMismatches, brokenPaths, unclaimedFiles,
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
  line("Detected source standards:", found.size),
  line("Implemented standards:", claimed.length),
  "",
  line("Missing source numbers:", list(missing)),
  line("Duplicate source numbers:", list(duplicates.map((d) => `${d.number} (${d.title})`))),
  line("Unknown standards:", list(unknown)),
  line("Title mismatches:", list(titleMismatches.map((t) => `${t.number}: "${t.found}" ≠ "${t.expected}"`))),
  line("Broken implementedBy paths:", list(brokenPaths.map((s) => s.implementedBy))),
  line("Unclaimed standard files:", list(unclaimedFiles)),
];

if (inventory.expectedCount !== inventory.standards.length) {
  out.push("", `! inventory declares expectedCount ${inventory.expectedCount} but lists ${inventory.standards.length} standards`);
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

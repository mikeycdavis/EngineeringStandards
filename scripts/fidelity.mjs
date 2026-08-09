#!/usr/bin/env node
/**
 * Verify that every block a standard claims is verbatim source actually is.
 *
 * WHY THIS EXISTS. Twice now, quoted source text has been rendered with backticks added around
 * identifiers — `/plan-structure` where the source says /plan-structure. Each time the document
 * still claimed the text was reproduced verbatim, and each time it was caught by a hand-written
 * check that happened to look. Twice is a failure mode, not a mistake, so this makes it mechanical.
 *
 * WHAT IT CHECKS. Only blocks whose claim is explicit. A standard that says "reproduced verbatim
 * from the source" (or a close variant) immediately before a fenced block, blockquote, or bullet
 * list is asserting something falsifiable; this falsifies it. Authored content makes no such claim
 * and is not checked — the point is to hold the document to its own word, not to forbid original
 * writing.
 *
 * NORMALIZATION. Line wrapping differs between a standard and its source, so both sides are
 * collapsed to single-spaced text before comparison. Backticks, punctuation, and wording are NOT
 * normalized away — those are exactly what this exists to catch.
 *
 * Usage:
 *   node scripts/fidelity.mjs           report, exit 1 on any unverified claim
 *   node scripts/fidelity.mjs --json    machine-readable
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.join(ROOT, "artifacts/prompts/engineering-standards-spec.md");
const JSON_OUT = process.argv.includes("--json");

/** A sentence asserting that what follows is source text. */
const CLAIM_RE = /reproduced\s+(?:verbatim\s+)?from\s+the\s+source|verbatim\s+from\s+the\s+source|from\s+the\s+source[,:]?\s*$|^From the source[,:]/i;

const normalize = (s) =>
  s
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.replace(/^\s*>\s?/, "").replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Collect the block immediately following a claim: a fenced block, a blockquote run, or a bullet
 * list. Prose paragraphs are skipped — a claim followed by explanation rather than a quotation is
 * not making a checkable assertion about a specific block.
 */
function blockAfter(lines, start) {
  let i = start;
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i >= lines.length) return null;

  if (lines[i].trim().startsWith("```")) {
    const body = [];
    i++;
    while (i < lines.length && !lines[i].trim().startsWith("```")) body.push(lines[i++]);
    return { kind: "fence", text: body.join("\n"), line: start + 1 };
  }
  if (lines[i].trim().startsWith(">")) {
    const body = [];
    while (i < lines.length && (lines[i].trim().startsWith(">") || lines[i].trim() === "")) {
      if (lines[i].trim() === "" && !(lines[i + 1] ?? "").trim().startsWith(">")) break;
      body.push(lines[i++]);
    }
    return { kind: "quote", text: body.join("\n"), line: start + 1 };
  }
  if (/^\s*[-*]\s+/.test(lines[i])) {
    const body = [];
    while (i < lines.length && (/^\s*[-*]\s+/.test(lines[i]) || /^\s{2,}\S/.test(lines[i]))) body.push(lines[i++]);
    return { kind: "list", text: body.join("\n"), line: start + 1 };
  }
  return null;
}

const sourceNorm = normalize(await readFile(SOURCE, "utf8"));
const files = (await readdir(path.join(ROOT, "standards"))).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();

const failures = [];
let claims = 0;

for (const file of files) {
  const text = await readFile(path.join(ROOT, "standards", file), "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (!CLAIM_RE.test(lines[i])) continue;
    const block = blockAfter(lines, i + 1);
    if (!block) continue;
    claims++;
    const norm = normalize(block.text);
    if (!norm || sourceNorm.includes(norm)) continue;

    // Report the first fragment that diverges, so the message points at the actual edit.
    const words = norm.split(" ");
    let longest = "";
    for (let a = 0; a < words.length; a++) {
      for (let b = words.length; b > a; b--) {
        const frag = words.slice(a, b).join(" ");
        if (frag.length > longest.length && sourceNorm.includes(frag)) longest = frag;
      }
    }
    const cut = longest ? norm.indexOf(longest) + longest.length : 0;
    failures.push({
      file: `standards/${file}`,
      line: block.line,
      kind: block.kind,
      diverges: norm.slice(cut, cut + 120).trim() || norm.slice(0, 120),
      claimed: norm.slice(0, 160),
    });
  }
}

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ claims, failures, ok: failures.length === 0 }, null, 2) + "\n");
  process.exit(failures.length === 0 ? 0 : 1);
}

const out = [`Verbatim claims checked: ${claims}`, `Unverified claims:       ${failures.length}`, ""];
for (const f of failures) {
  out.push(`! ${f.file}:${f.line} (${f.kind})`);
  out.push(`    claimed verbatim: ${f.claimed}${f.claimed.length >= 160 ? "…" : ""}`);
  out.push(`    diverges at:      ${f.diverges}`);
  out.push("");
}
if (failures.length > 0) {
  out.push("A block claimed as source text does not appear in the source. The usual cause is");
  out.push("formatting added to the quotation — backticks around an identifier, a changed dash, a");
  out.push("reworded line. Reproduce the source exactly, or drop the verbatim claim.");
} else {
  out.push("Every block claimed as source text appears in the source.");
}
process.stdout.write(out.join("\n") + "\n");
process.exit(failures.length === 0 ? 0 : 1);

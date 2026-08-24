#!/usr/bin/env node
/**
 * Resolve every relative Markdown link in the repository, and report the ones that do not.
 *
 * WHY THIS EXISTS. `scripts/repository.mjs` cited ADR 0008 under a filename that has never existed
 * in any commit — not a rename that missed a reference, but a name invented from the concept
 * because the ADR's title supplies none. `artifacts/adr/0011-...` did the same thing, in the same
 * sentence shape, written by a different hand. Neither was found by review; the second was not even
 * known about until a scan went looking. That is the argument for a mechanical check rather than a
 * corrected path: a defect two independent authors reached independently will be reached again.
 *
 * Running the scan for the first time found four more broken references that had nothing to do with
 * ADR 0008 — two standards renamed with citations left behind, and a template link that resolves in
 * this repository and breaks in the adopter's. None of them are allowlisted. A check that carries a
 * list of the failures it is willing to tolerate reports the state of the list, not the repository.
 *
 * TWO RESOLUTION RULES, BECAUSE THERE ARE TWO KINDS OF FILE.
 *
 *   ordinary     A link resolves against the directory of the file that contains it. This is what
 *                every Markdown renderer does and needs no explanation.
 *
 *   template     `templates/` is not read where it is stored. `scripts/init.mjs` copies each
 *                template to a destination in the adopter's repository, and the link has to resolve
 *                THERE. `templates/copilot-instructions.md` links to `../AGENTS.md`: nonsense from
 *                `templates/`, exactly right from `.github/`, which is where init writes it.
 *                Checking it where it is stored reports a defect that is not there — and the
 *                obvious repair, deleting the `../`, would break the file for every adopter.
 *
 * A template link is resolved against the installed layout and NOTHING ELSE — not against this
 * repository's own files. The set is parsed out of `scripts/init.mjs` rather than restated here,
 * because a mapping written down twice is a mapping that disagrees with itself later, and this
 * check exists because of a reference that stopped matching its target.
 *
 * The temptation is to accept a template target that exists in this repository as a fallback. That
 * answers the wrong question in the more dangerous direction: `templates/PROJECT.md` linking to
 * `INSTRUCTIONS.md` resolves here, where that file sits at the root, and dangles in every adopter,
 * because init does not copy it. Same defect as the `../project-policy.yml` this check caught on its
 * first run, one step subtler because the target does exist — somewhere that is not the reader's
 * repository.
 *
 * WHAT IS SCANNED. Every `.md` file, and Markdown links inside `.mjs` comments — the phantom this
 * was written for lived in a JSDoc header, and issue #17's criterion is about paths cited *from
 * `scripts/`*. Code lines are not scanned: `]( ` appears in regular expressions.
 *
 * Both link syntaxes are read: the inline parenthesised form, and the reference-definition form
 * that names a label and its destination. (Neither is spelled out here, because a file describing
 * this pattern cannot contain it — the check reads its own prose and reports the example. That is
 * the same rule as the code spans above, applied to the one file guaranteed to trip it.) Reading
 * only the first would leave an entire syntax unguarded, and the count assertion in the test would
 * stay green while it was, because the links that ARE read still number in the thousands. Reference
 * definitions are read outside fenced code blocks only — `[label]: value` is imitated exactly by a
 * computed object key, and this repository's own tests are full of them.
 *
 * WHAT IS NOT SCANNED. `test/fixtures/` — each fixture is a miniature repository whose links
 * resolve inside itself, and several are deliberately malformed because that is what they are for.
 * Resolving them against this repository's root would measure the wrong tree.
 *
 * Inline code spans are NOT exempt: a link written inside backticks is still resolved. That is
 * deliberate, and it fired immediately — a paragraph quoting one of the phantom citations was
 * itself reported, because a quoted-but-unresolvable link is indistinguishable to a reader from a
 * real one. Quote the prose, not the markup.
 *
 * Link fragments (`#anchor`) are stripped and not verified. This check answers *does the file
 * exist*, which is the question the two phantom citations got wrong; heading anchors are a separate
 * claim and are not asserted here.
 *
 * Usage:
 *   node scripts/links.mjs           report, exit 1 on any unresolved link
 *   node scripts/links.mjs --json    machine-readable
 *
 * No third-party dependencies, matching scripts/standards.mjs.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Directories no scan descends into. */
const SKIP = new Set([".git", "node_modules", "fixtures", ".vs", "dist", "coverage"]);

/** A Markdown inline link whose target is relative — not a URL, not a bare fragment. */
const LINK = /\]\((?!https?:|mailto:|#)([^)\s]+)\)/g;

/**
 * A reference-style definition: `[adr]: ../artifacts/adr/0008-....md`.
 *
 * `[ADR][adr]` renders identically to an inline link and breaks identically when the target moves,
 * so a check reading only the inline form would let a whole syntax through — and the count assertion
 * would stay green while it did, because the links it does read still number in the thousands.
 *
 * CommonMark also allows the destination on the line after the label. That form is not read here,
 * and the limitation is stated rather than papered over: nothing in this repository uses it, and
 * inventing multi-line parsing for a form nothing writes would be untested code guarding nothing.
 */
const REFDEF = /^ {0,3}\[[^\]]+\]:[ \t]+(?!https?:|mailto:|#|<)(\S+)/;

/** Opening or closing fence of a fenced code block. */
const FENCE = /^\s*(?:```|~~~)/;

/** A line of a `.mjs` file that is comment rather than code. */
const isComment = (line) => {
  const t = line.trimStart();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
};

/**
 * Where `scripts/init.mjs` installs each template, and everything else it creates.
 *
 * Parsed from the source rather than imported, because `ARTIFACTS` is deliberately private — the
 * same approach `test/instructions.test.mjs` already takes to the same table.
 */
export async function installedLayout(root = ROOT) {
  const src = await readFile(path.join(root, "scripts/init.mjs"), "utf8");
  const entries = [...src.matchAll(/\{\s*path:\s*"([^"]+)"([^}]*)\}/g)].map(([, p, rest]) => ({
    path: p,
    template: (rest.match(/template:\s*"([^"]+)"/) ?? [])[1],
    directory: /directory:\s*true/.test(rest),
  }));
  // A regex that silently stops matching would report an empty install map, and every template link
  // would then be checked from the wrong directory. Compare against the raw count instead of
  // asserting a number: init's table grows, and a check pinned to today's length would be noise.
  const declared = (src.match(/^\s*\{\s*path:\s*"/gm) ?? []).length;
  if (declared !== entries.length) {
    throw new Error(`scripts/init.mjs declares ${declared} artifacts and ${entries.length} parsed — has ARTIFACTS moved?`);
  }

  const destinationOf = new Map();
  for (const e of entries) if (e.template) destinationOf.set(e.template, e.path);

  return {
    entries,
    /** `templates/copilot-instructions.md` -> `.github/copilot-instructions.md` */
    destinationOf,
    /** Paths that exist in an initialised repository even when they do not exist here. */
    created: entries.map((e) => e.path),
  };
}

/** Every file this check reads, repository-relative, in a stable order. */
async function sources(root) {
  const found = [];
  const walk = async (dir) => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP.has(entry.name)) await walk(full);
      } else if (entry.name.endsWith(".md") || entry.name.endsWith(".mjs")) {
        found.push(path.relative(root, full).split(path.sep).join("/"));
      }
    }
  };
  await walk(root);
  return found;
}

/** Every relative link in one file, with the line it was written on. */
export function linksIn(file, text) {
  const code = file.endsWith(".mjs");
  const out = [];
  let fenced = false;

  text.split("\n").forEach((line, i) => {
    if (code && !isComment(line)) return;
    if (!code && FENCE.test(line)) {
      fenced = !fenced;
      return;
    }
    for (const m of line.matchAll(LINK)) out.push({ target: m[1], line: i + 1 });

    // Reference definitions are read outside fenced blocks only. Unlike the inline form, which is a
    // distinctive shape, a label-and-destination line is imitated exactly by a computed object key — this
    // repository's own tests are full of `[FORBIDDEN_MANUAL]: { level: "forbidden" }` — so inside a
    // code block the pattern means something else entirely. Inline links are deliberately still
    // read everywhere, including inside backticks; that is recorded above and has not misfired.
    if (fenced) return;
    const ref = line.match(REFDEF);
    if (ref) out.push({ target: ref[1], line: i + 1 });
  });

  return out;
}

/**
 * Check every relative link in the repository.
 *
 * Returns `{ checked, broken }` where each broken entry names the file, the line, the target as
 * written, the path it resolved to, and which rule resolved it. The rule is reported rather than
 * assumed so a template failure cannot be mistaken for an ordinary one — they have opposite repairs.
 */
export async function checkLinks(root = ROOT) {
  const layout = await installedLayout(root);
  const created = new Set(layout.created);
  const files = await sources(root);

  let checked = 0;
  const broken = [];

  for (const file of files) {
    const text = await readFile(path.join(root, file), "utf8");
    const destination = layout.destinationOf.get(file);
    const rule = destination ? "template" : "ordinary";
    // A template is read where init put it, so its links resolve from there. Everything else
    // resolves from where it is stored.
    const base = path.posix.dirname(destination ?? file);

    for (const { target, line } of linksIn(file, text)) {
      checked += 1;
      const resolved = path.posix.normalize(path.posix.join(base, target.split("#")[0]));

      // A template is resolved against the installed layout and ONLY the installed layout. Falling
      // back to "does it exist here" would answer the wrong question in the more dangerous
      // direction: `templates/PROJECT.md` linking to `INSTRUCTIONS.md` resolves in this repository,
      // where INSTRUCTIONS.md sits at the root, and is dangling in every adopter, because init does
      // not copy it. That link would read as correct here and be broken everywhere it was used —
      // the same defect as the `../project-policy.yml` this check already caught, one step subtler
      // because the target does exist somewhere.
      const ok =
        rule === "template"
          ? created.has(resolved) || created.has(`${resolved}/`)
          : existsSync(path.join(root, resolved));

      if (resolved.startsWith("..") || !ok) broken.push({ file, line, target, resolved, rule });
    }
  }

  return { checked, broken, files: files.length };
}

async function main(argv) {
  const json = argv.includes("--json");
  const result = await checkLinks(ROOT);

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.broken.length === 0) {
    console.log(`OK — ${result.checked} relative links across ${result.files} files all resolve.`);
  } else {
    console.log(`${result.broken.length} of ${result.checked} relative links do not resolve:\n`);
    for (const b of result.broken) {
      console.log(`  ${b.file}:${b.line}`);
      console.log(`    target   ${b.target}`);
      console.log(`    resolved ${b.resolved}  (${b.rule} rule)\n`);
    }
  }
  return result.broken.length === 0 ? 0 : 1;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}

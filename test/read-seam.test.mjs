/**
 * The read seam is the mechanism, and this file is what makes that true rather than aspirational.
 *
 * Issue #38's first acceptance criterion is not "today's verdicts are right". It is:
 *
 *     No call site can reach `""` or `"{}"` for unread content, and the MECHANISM enforces this
 *     rather than a comment asserting it.
 *
 * Every other test in this repository checks the seam's OUTPUT — that a rule withdraws when a file
 * went unread. Output tests cannot distinguish "the seam is universal" from "the seam covers the
 * sites we happened to think of, and whole-rule withdrawal is quietly covering the rest". Those two
 * repositories behave identically today and diverge the moment someone adds a detector, which is
 * exactly when nobody is looking. Whole-rule withdrawal compensating for an unsafe read primitive is
 * the recognition-table problem one layer up: correctness that depends on a maintained list of rule
 * ids rather than on the primitive being safe.
 *
 * So these assertions are about the SOURCE, and they are deliberately the crude kind. A structural
 * check that reads the file and counts is the only thing that can fail on a call site that does not
 * exist yet.
 *
 * THE ALLOWANCE IS NAMED, NOT PATTERNED. Both raw accessors are legitimate in exactly one place
 * each — inside the primitive that answers with availability — so the allowance is a line-number-free
 * assertion that the only occurrences are the ones inside `contentOf` and `viewOf`. Widening it means
 * editing this file, which is the point: a seam whose exceptions are self-service is not a seam.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { contentOf, viewOf } from "../scripts/standards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const SRC = readFileSync(CLI, "utf8");

/**
 * Source with COMMENTS removed, and deliberately not with string literals removed.
 *
 * The first draft stripped strings too, on the reasoning that prose about the idiom is not a use of
 * it. It stripped template literals by scanning to the next backtick — which desynchronises on the
 * first `${...}` containing one, and this file is full of them. The stripper swallowed whole regions
 * of real code, so both sides of the comparison were computed from the same corrupted text and the
 * guard agreed with itself while seeing almost nothing. It was caught by a mutation that restored a
 * raw read and SURVIVED, which is the only way a guard like this ever gets caught: a structural
 * check that silently measures less than it claims passes exactly as loudly as one that works.
 *
 * Comments are what actually carry the prose — every mention of the old idiom in the evaluator is in
 * a doc comment — and stripping them needs no bracket matching. A string literal containing
 * `contents.get(` would be a false positive; none exists, and one would be a strange thing to write.
 */
function stripComments(text) {
  let out = "";
  let i = 0;
  const n = text.length;
  while (i < n) {
    const two = text.slice(i, i + 2);
    if (two === "//") {
      while (i < n && text[i] !== "\n") i++;
      continue;
    }
    if (two === "/*") {
      i += 2;
      while (i < n && text.slice(i, i + 2) !== "*/") i++;
      i += 2;
      continue;
    }
    out += text[i];
    i++;
  }
  return out;
}

const CODE = stripComments(SRC);

/** The body of a top-level `function name(...) { ... }`, by brace matching. */
function bodyOf(name) {
  const at = CODE.indexOf(`function ${name}(`);
  assert.notEqual(at, -1, `${name} is gone from scripts/standards.mjs; this guard cannot hold a seam that moved`);
  const open = CODE.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < CODE.length; i++) {
    if (CODE[i] === "{") depth++;
    else if (CODE[i] === "}" && --depth === 0) return CODE.slice(open, i + 1);
  }
  assert.fail(`${name} has no closing brace`);
}

const count = (haystack, re) => (haystack.match(re) ?? []).length;

const CONTENTS_GET = /\bcontents\s*\.\s*get\s*\(/g;
const SOURCES_GET = /\bsources\s*\.\s*get\s*\(/g;

test("no content read reaches past the availability primitive", () => {
  // `contents.get` is legitimate exactly once, in `contentOf`, on the branch that has already
  // established the entry exists. Anywhere else it hands a caller a string or `undefined`, and the
  // caller then decides what to do with a value it cannot tell apart from empty evidence.
  const inside = count(bodyOf("contentOf"), CONTENTS_GET);
  const everywhere = count(CODE, CONTENTS_GET);

  assert.equal(inside, 1, "contentOf no longer reads contents directly; this guard is measuring the wrong function");
  assert.equal(
    everywhere,
    inside,
    `${everywhere - inside} raw contents.get() call(s) outside contentOf. Each is a site that can read ` +
      "unavailable evidence as text. Use contentOf(contents, f) and branch on .available.",
  );
});

test("no derived-view read reaches past the availability primitive", () => {
  // The same rule for the views, and it matters more: `sourceOf`/`structureOf`/`commentsOf` are what
  // the code-scanning detectors actually read, so `sources.get(f)?.code ?? ""` was the coercion with
  // the widest reach in the file.
  const inside = count(bodyOf("viewOf"), SOURCES_GET);
  const everywhere = count(CODE, SOURCES_GET);

  assert.equal(inside, 1, "viewOf no longer reads sources directly; this guard is measuring the wrong function");
  assert.equal(
    everywhere,
    inside,
    `${everywhere - inside} raw sources.get() call(s) outside viewOf. Use run.sourceOf/structureOf/` +
      "commentsOf, which answer with availability.",
  );
});

test("the primitives answer with availability rather than with a fallback string", () => {
  // The failure this forbids is a one-character edit: `text: contents.get(f) ?? ""` on the branch
  // where the content is absent. It reads as defensive and it is the entire defect.
  for (const name of ["contentOf", "viewOf"]) {
    const body = bodyOf(name);
    assert.equal(
      count(body, /\?\?\s*""/g),
      0,
      `${name} coerces an unavailable lookup back to a string; the seam then has nothing to report`,
    );
    assert.ok(/available:\s*false/.test(body), `${name} has no unavailable branch at all`);
    assert.ok(
      /text:\s*null/.test(body),
      `${name} returns text on a branch where it has none; a caller cannot tell that apart from empty`,
    );
  }
});

test("the run exposes no accessor that hands back a bare string", () => {
  // A single availability-returning accessor beside a legacy string-returning one is worse than
  // neither: the unsafe call is shorter to write and reads the same at the call site.
  for (const accessor of ["sourceOf", "structureOf", "commentsOf"]) {
    const re = new RegExp(`${accessor}:\\s*\\(f\\)\\s*=>\\s*viewOf\\(`);
    assert.ok(re.test(CODE), `run.${accessor} does not resolve through viewOf`);
  }
});

// --- The primitives' own contract ----------------------------------------------------------------
//
// Everything above is structural: it proves no site reads the maps raw. It says nothing about what
// the primitives RETURN, and that gap is not hypothetical — two mutations of exactly that kind
// survived the whole behavioural suite before these tests existed. Coercing an unavailable derived
// view back to empty text, and collapsing viewOf's three states into two, are both invisible through
// the CLI: the coarse surface withdrawal fires on every run that could expose them, so the wrong
// answer is masked by a second mechanism doing the right thing for a different reason.
//
// THAT MASKING IS THE ARGUMENT FOR THE SEAM, not an argument that the seam is unnecessary. Whole-rule
// withdrawal is a maintained list of rule ids; the primitive is the property. Testing the property
// through the compensating mechanism measures the compensation.

test("contentOf never answers a lookup it cannot satisfy with text", () => {
  const held = new Map([["/r/read.md", "real content"]]);

  const present = contentOf(held, "/r/read.md");
  assert.equal(present.available, true);
  assert.equal(present.text, "real content");

  // Eligible and absent: the loss this seam exists for.
  const lost = contentOf(held, "/r/never-opened.md");
  assert.equal(lost.available, false, "an unread file was reported as available");
  assert.equal(lost.text, null, "an unread file was handed back as text");
  assert.equal(lost.lost, true, "an unread eligible file was not reported as evidence loss");

  // Never eligible: not loss. A .gitignore has no extension and is in every repository's file list,
  // so answering `lost` here would report evidence loss everywhere and withdraw rules forever.
  const ineligible = contentOf(held, "/r/.gitignore");
  assert.equal(ineligible.available, false);
  assert.equal(ineligible.text, null);
  assert.equal(ineligible.lost, false, "a file the read loop never offered to open was reported as lost");

  // An empty file is CONTENT, and this is the distinction the whole issue rests on: the seam must
  // tell an empty README apart from one nobody opened, and both were `\"\"` before it existed.
  const empty = contentOf(new Map([["/r/empty.md", ""]]), "/r/empty.md");
  assert.equal(empty.available, true, "a genuinely empty file was reported as unavailable");
  assert.equal(empty.text, "", "an empty file's content is the empty string, not an absence");
});

test("viewOf keeps evidence loss and absence-of-a-view apart", () => {
  const derived = { code: "import x", structure: "import x", comments: "" };
  const sources = new Map([["/r/a.js", derived]]);
  const contents = new Map([
    ["/r/a.js", "import x"],
    ["/r/notes.md", "prose about import x"],
  ]);

  for (const which of ["code", "structure", "comments"]) {
    const v = viewOf(sources, contents, "/r/a.js", which);
    assert.equal(v.available, true, `${which} view of a read code file is unavailable`);
    assert.equal(v.text, derived[which], `${which} view returned the wrong slice`);
  }

  // Read, but not code: there is no view to derive and nothing was lost. Answering `lost` here
  // would withdraw a rule for every Markdown file in the repository.
  const prose = viewOf(sources, contents, "/r/notes.md", "code");
  assert.equal(prose.available, false, "a Markdown file was reported as having a code view");
  assert.equal(prose.text, null, "a file with no derived view was handed back as text");
  assert.equal(prose.lost, false, "a file that is simply not code was reported as evidence loss");

  // Never obtained: no content, so no view, and that IS loss.
  const unread = viewOf(sources, contents, "/r/unread.js", "code");
  assert.equal(unread.available, false);
  assert.equal(unread.text, null, "an unread code file was handed back as text");
  assert.equal(unread.lost, true, "an unread code file was not reported as evidence loss");

  // The two unavailable answers must be distinguishable, which is the whole reason for `lost`.
  assert.notEqual(prose.lost, unread.lost, "the two reasons a view is absent have collapsed into one");
});

test("neither primitive ever returns a string on an unavailable answer", () => {
  // The single property both mutations violated, asserted directly rather than inferred from a
  // verdict. `text` is null or the caller cannot tell missing evidence from empty evidence.
  const answers = [
    contentOf(new Map(), "/r/x.md"),
    contentOf(new Map(), "/r/x.bin"),
    viewOf(new Map(), new Map(), "/r/x.js", "code"),
    viewOf(new Map(), new Map([["/r/x.md", ""]]), "/r/x.md", "code"),
  ];
  for (const a of answers) {
    assert.equal(a.available, false);
    assert.equal(typeof a.text, "object", `an unavailable answer carried ${JSON.stringify(a.text)}`);
    assert.equal(a.text, null);
    assert.equal(typeof a.reason, "string", "an unavailable answer gave no reason a run could report");
  }
});

/**
 * WHAT THIS FILE DOES NOT ESTABLISH, stated rather than implied.
 *
 * It proves no site reads the maps raw. It does not prove every site BRANCHES correctly — a detector
 * can call `contentOf` and then use `.text` without checking `.available`, and would read `null`
 * rather than `""`. That is a loud failure instead of a silent wrong answer, which is the trade this
 * seam is making, but it is not the same as proof. The behavioural falsifiers in
 * `test/evidence-availability.test.mjs` are what cover the branching, per rule, per polarity.
 *
 * It also says nothing about the never-collected class. A file this tool excluded is not in `files`
 * at all, so no call site of any kind is reached for it, and no source-level guard can see that.
 * That class is answered from the evidence surface and its authority filter, and is pinned by the
 * four exclusion specimens rather than here.
 */

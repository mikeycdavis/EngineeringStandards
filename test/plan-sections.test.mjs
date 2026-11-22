/**
 * ST-27 (#120): `planning.one-file-per-section`, a PARTIAL detector (owner decisions D1 to D3).
 *
 * A clean run is NOT_EVALUATED with assurance `partial`, never a pass. Nested plan files are an
 * unknown (never recursed, never passed). Only the `NN-` ordering convention is accepted. A
 * `README.md` is supporting documentation and never a section file.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { topLevelHeadings, headingAmbiguity } from "../scripts/standards.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const PLAN = "artifacts/project-plan-breakdown";
const RULE = "planning.one-file-per-section";
const CAP = 400_000;

const POLICY = [
  'standardVersion: "2.0.0"',
  'project: "Plan sections fixture"',
  "rules:",
  "  planning.breakdown-directory:",
  "    level: required",
  "  planning.one-file-per-section:",
  "    level: required",
  "",
].join("\n");

async function withRepo(files, fn) {
  const root = await mkdtemp(path.join(os.tmpdir(), "plan-sections-"));
  try {
    const git = (...args) => {
      const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
      assert.equal(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
    };
    git("init", "-q");
    git("config", "user.email", "test@example.invalid");
    git("config", "user.name", "test");
    for (const [rel, body] of Object.entries({ ...files, "project-policy.yml": POLICY })) {
      const full = path.join(root, rel);
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, body);
    }
    git("add", "-A");
    git("-c", "commit.gpgsign=false", "commit", "-qm", "fixture");
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function validate(dir) {
  const r = spawnSync(process.execPath, [CLI, "validate", `--dir=${dir}`, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  try {
    return JSON.parse(r.stdout);
  } catch {
    assert.fail(`stdout was not JSON.\nstderr: ${r.stderr.slice(0, 2000)}`);
  }
}
const result = (json) => json.results.find((x) => x.ruleId === RULE);
const findings = (json) => (json.findings ?? []).filter((f) => f.rule === RULE);

const ok = (t) => `# ${t}\n\nBody.\n`;

test("ordered single-heading files give no finding and a partial NOT_EVALUATED, never a pass", async () => {
  await withRepo({ [`${PLAN}/00-overview.md`]: ok("O"), [`${PLAN}/01-a.md`]: ok("A"), [`${PLAN}/02-b.md`]: ok("B") }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    const r = result(j);
    assert.equal(r.status, "skipped");
    assert.equal(r.disposition, "not-evaluated");
    assert.equal(r.assurance, "partial");
    assert.match(r.observedScope, /3 section file\(s\) read whole/);
    assert.ok(r.blindSpots.length >= 2);
    assert.notEqual(r.status, "passed");
  });
});

test("one file with two top-level headings is a violation naming the file and both heading lines", async () => {
  await withRepo({ [`${PLAN}/00-overview.md`]: "# One\n\ntext\n\n# Two\n" }, (dir) => {
    const f = findings(validate(dir)).find((x) => x.id === "plan-section-heading-count");
    assert.ok(f);
    assert.match(f.message, /00-overview\.md/);
    assert.match(f.message, /line 1: # One/);
    assert.match(f.message, /line 5: # Two/);
  });
});

test("two files sharing an ordering number are a violation naming both", async () => {
  await withRepo({ [`${PLAN}/03-a.md`]: ok("A"), [`${PLAN}/03-b.md`]: ok("B") }, (dir) => {
    const f = findings(validate(dir)).find((x) => x.id === "plan-section-number-duplicated");
    assert.deepEqual(f.evidence.sort(), [`${PLAN}/03-a.md`, `${PLAN}/03-b.md`]);
  });
});

test("an unnumbered overview.md is a violation naming the file; a letter prefix is not accepted (D3)", async () => {
  await withRepo({ [`${PLAN}/overview.md`]: ok("O"), [`${PLAN}/a-first.md`]: ok("A"), [`${PLAN}/01-x.md`]: ok("X") }, (dir) => {
    const f = findings(validate(dir)).find((x) => x.id === "plan-section-file-unnumbered");
    assert.deepEqual(f.evidence.sort(), [`${PLAN}/a-first.md`, `${PLAN}/overview.md`]);
  });
});

test("a # line in a fence, in an HTML comment, or a setext underline in a fence is not a heading", () => {
  const text = [
    "# Real",
    "",
    "```",
    "# not a heading",
    "Title",
    "=====",
    "```",
    "<!--",
    "# commented",
    "-->",
    "<!-- # inline -->",
    "",
  ].join("\n");
  assert.deepEqual(topLevelHeadings(text).map((h) => h.line), [1]);
});

test("a setext underline outside a fence is a heading, and ## is not", () => {
  assert.deepEqual(topLevelHeadings("Title\n=====\n\n## Sub\n").map((h) => h.line), [1]);
});

test("README.md is never a section file, with or without an index link", async () => {
  await withRepo({ [`${PLAN}/00-overview.md`]: "# O\n\nSee [r](README.md)\n", [`${PLAN}/README.md`]: "# One\n\n# Two\n" }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).assurance, "partial");
  });
});

test("a plan directory holding only a README yields NOT_EVALUATED with no finding", async () => {
  await withRepo({ [`${PLAN}/README.md`]: "# One\n\n# Two\n" }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
    assert.match(result(j).message, /no section file/);
  });
});

test("a nested plan file is an unknown naming the path: never recursed, never passed (D1)", async () => {
  await withRepo({ [`${PLAN}/00-overview.md`]: ok("O"), [`${PLAN}/phase-1/01-x.md`]: "# A\n\n# B\n" }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
    assert.match(result(j).message, /phase-1\/01-x\.md/);
    assert.notEqual(result(j).assurance, "full");
  });
});

test("a second heading past the read cap is NOT_EVALUATED, while a name-derived violation still stands", async () => {
  const big = `# Big\n\n${"p".repeat(79)}\n`.repeat(1) + `${"p".repeat(79)}\n`.repeat(Math.ceil(CAP / 80)) + "\n# Second\n";
  await withRepo({ [`${PLAN}/00-overview.md`]: ok("O"), [`${PLAN}/01-big.md`]: big }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
    assert.match(result(j).message, /cap/);
  });
  await withRepo({ [`${PLAN}/01-big.md`]: big, [`${PLAN}/01-dup.md`]: ok("D") }, (dir) => {
    const j = validate(dir);
    assert.equal(findings(j).some((f) => f.id === "plan-section-number-duplicated"), true);
    assert.equal(result(j).status, "failed");
  });
});

test("the rule is wired: catalog assurance is partial and the rule is evaluated", async () => {
  const catalog = JSON.parse((await import("node:fs")).readFileSync(path.join(HERE, "..", "rules", "planning.json"), "utf8"));
  assert.equal(catalog.rules.find((r) => r.id === RULE).assurance, "partial");
});

test("a UTF-8 BOM before a first-line heading does not hide it", () => {
  assert.deepEqual(topLevelHeadings("﻿# One\n\n# Two\n").map((h) => h.line), [1, 3]);
});

test("CRLF line endings are handled", () => {
  assert.deepEqual(topLevelHeadings("# One\r\n\r\n# Two\r\n").map((h) => h.line), [1, 3]);
});

test("an inline-code <!-- does not open a comment that swallows later headings", () => {
  assert.deepEqual(topLevelHeadings("# One\n\nUse `<!--` to open.\n\n# Two\n").map((h) => h.line), [1, 5]);
});

test("a setext underline after a list item is not a heading", () => {
  assert.deepEqual(topLevelHeadings("# One\n\n- item\n===\n").map((h) => h.line), [1]);
});

test("a plan directory with only a .txt file yields NOT_EVALUATED with no finding", async () => {
  await withRepo({ [`${PLAN}/notes.txt`]: "x\n" }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
  });
});

test("an absent plan directory yields NOT_EVALUATED with no finding bound to this rule", async () => {
  await withRepo({ "README.md": "# x\n" }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
  });
});

test("read-budget exhaustion leaves the rule NOT_EVALUATED, never partial-clean", async () => {
  await withRepo({ [`${PLAN}/00-a.md`]: ok("A"), [`${PLAN}/01-b.md`]: ok("B") }, (dir) => {
    const r = spawnSync(process.execPath, [CLI, "validate", `--dir=${dir}`, "--json", "--max-total-read-bytes=1"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const j = JSON.parse(r.stdout);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
    assert.notEqual(result(j).status, "passed");
  });
});

test("a multi-backtick code span containing <!-- does not open a comment", () => {
  assert.deepEqual(topLevelHeadings("Use `` <!-- ` `` as an example.\n\n# Title\n").map((h) => h.line), [3]);
});

test("a ## line before a setext underline is not a top-level heading", () => {
  assert.deepEqual(topLevelHeadings("# Title\n\n## Sub\n===\n").map((h) => h.line), [1]);
});

test("a fence marker inside an HTML comment, or a raw HTML block, is an unknown, never a count", async () => {
  for (const body of ["# First\n\n<!--\n```\n-->\n# Second\n", "# Title\n\n<pre>\n# example\n</pre>\n"]) {
    await withRepo({ [`${PLAN}/00-a.md`]: body }, (dir) => {
      const j = validate(dir);
      assert.deepEqual(findings(j), []);
      assert.equal(result(j).disposition, "not-evaluated");
      assert.match(result(j).message, /00-a\.md/);
    });
  }
});

test("an inline code span that wraps across lines around <!-- is an unknown", async () => {
  await withRepo({ [`${PLAN}/00-a.md`]: "# First\n\nUse `some\n<!--` here.\n\n# Second\n" }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
    assert.match(result(j).message, /00-a\.md/);
  });
});

test("a comment opener inside a real fenced example does not make the file ambiguous", async () => {
  await withRepo({ [`${PLAN}/00-a.md`]: "# First\n\n```html\n<!--\n```\n\n# Second\n" }, (dir) => {
    const f = findings(validate(dir)).find((x) => x.id === "plan-section-heading-count");
    assert.ok(f);
    assert.match(f.message, /line 1: # First; line 7: # Second/);
  });
});

test("a closing-fence lookalike with trailing text is an unknown, never a count", async () => {
  await withRepo({ [`${PLAN}/00-a.md`]: "# Title\n\n```\n```not-a-close\n# example\n```\n" }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
    assert.match(result(j).message, /00-a\.md/);
  });
});

test("removing an inline comment never manufactures a heading", () => {
  assert.deepEqual(topLevelHeadings("# Real\n\n#<!-- note --> Fake\n").map((h) => h.line), [1]);
  assert.deepEqual(topLevelHeadings("# Real <!-- note -->\n").map((h) => h.line), [1]);
});

test("a backslash-escaped comment opener is reported as ambiguous, not silently swallowed", () => {
  assert.match(headingAmbiguity("# First\n\nUse \\<!-- literally.\n\n# Second\n"), /backslash-escaped/);
  assert.equal(headingAmbiguity("# First\n\nUse <!-- real --> here.\n"), null);
});

test("a read cap that cuts a paragraph after '#' does not manufacture a heading", async () => {
  const cut = `# Real\n\n${"p".repeat(79)}\n`.repeat(1) + `${"p".repeat(79)}\n`.repeat(Math.ceil(CAP / 80) - 2);
  const body = cut.slice(0, CAP - 2) + "\n#not-a-heading\n";
  await withRepo({ [`${PLAN}/00-overview.md`]: ok("O"), [`${PLAN}/01-big.md`]: body }, (dir) => {
    const j = validate(dir);
    assert.deepEqual(findings(j), []);
    assert.equal(result(j).disposition, "not-evaluated");
  });
});

test("comment delimiters beside backticks, and openers in indented text, are reported as ambiguous", () => {
  assert.match(headingAmbiguity("# First\n\n<!-- ` --> `\n\n# Second\n"), /backtick/);
  assert.match(headingAmbiguity("# First\n\n    <!-- literal example\n\n# Second\n"), /indented/);
});

test("a code fence opened inside a list item or block quote is reported as ambiguous", () => {
  assert.match(headingAmbiguity("# Real\n\n- ```markdown\n  # example heading\n  ```\n"), /list item or block quote/);
  assert.match(headingAmbiguity("# Real\n\n> ```\n> # x\n> ```\n"), /list item or block quote/);
});

test("a heading whose content starts with Unicode whitespace is still a heading", () => {
  assert.deepEqual(topLevelHeadings("#  Title\n").map((h) => h.line), [1]);
  assert.deepEqual(topLevelHeadings("# Title\n").map((h) => h.line), []);
});

test("a thematic break, comment-only line, indented code or reference definition before '===' is not a setext heading", () => {
  for (const body of ["# One\n\n---\n===\n", "# One\n\n<!-- c -->\n===\n", "# One\n\nfoo\n<!--\nx\n-->\n===\n", "# One\n\n    code\n===\n", "# One\n\n[ref]: http://x\n===\n"]) {
    assert.deepEqual(topLevelHeadings(body).map((h) => h.line), [1], JSON.stringify(body));
  }
  assert.deepEqual(topLevelHeadings("# One\n\nTitle\n===\n").map((h) => h.line), [1, 3]);
  // A title that merely carries an inline comment is still paragraph text.
  assert.deepEqual(topLevelHeadings("Title <!-- editorial note -->\n===\n\nBody.\n").map((h) => h.line), [1]);
  // `[label]:` may or may not be a reference definition; the file is reported as not countable, not guessed at.
  assert.match(headingAmbiguity("[text]: not a valid destination\n===\n"), /link reference definition/);
  // Indented text inside a running paragraph continues it; indented code cannot interrupt one.
  assert.deepEqual(topLevelHeadings("Title\n    continued\n===\n").map((h) => h.line), [1]);
});

test("use versus mention: headings named only in a comment, a fence, inline code or prose are not violations", async () => {
  const body = "# Only\n\n<!-- # not a heading -->\n\n```md\n# nor this\n```\n\nWrite `# like this` to make one, or put a # sign mid-line.\n";
  await withRepo({ [`${PLAN}/00-only.md`]: body }, (dir) => {
    assert.deepEqual(findings(validate(dir)), []);
  });
});

test("README beside a violating section file: the README is not evaluated and the violation stands", async () => {
  await withRepo({ [`${PLAN}/README.md`]: "# Index\n\n# Another\n", [`${PLAN}/00-overview.md`]: ok("O"), [`${PLAN}/overview.md`]: ok("X") }, (dir) => {
    const j = validate(dir);
    const f = findings(j);
    assert.equal(f.length, 1);
    assert.match(JSON.stringify(f[0]), /overview\.md/);
    assert.doesNotMatch(JSON.stringify(f), /README/);
    assert.equal(result(j).status, "failed");
  });
});

test("a section file that cannot be read leaves the rule NOT_EVALUATED, never passed", async () => {
  await withRepo({ [`${PLAN}/00-overview.md`]: ok("O"), [`${PLAN}/01-a.md`]: ok("A") }, async (dir) => {
    await rm(path.join(dir, PLAN, "01-a.md"));
    const j = validate(dir);
    assert.equal(findings(j).length, 0);
    assert.notEqual(result(j).status, "passed");
    assert.notEqual(result(j).disposition, "evaluated");
  });
});

test("mutation: inverting the heading-count predicate in a copy of the tool makes the two-heading fixture pass unnoticed", async () => {
  const fs = await import("node:fs");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "plan-mut-"));
  try {
    fs.cpSync(path.join(HERE, "..", "scripts"), path.join(tmp, "scripts"), { recursive: true });
    fs.cpSync(path.join(HERE, "..", "rules"), path.join(tmp, "rules"), { recursive: true });
    fs.cpSync(path.join(HERE, "..", "VERSION"), path.join(tmp, "VERSION"));
    const target = path.join(tmp, "scripts", "standards.mjs");
    const src = fs.readFileSync(target, "utf8");
    assert.ok(src.includes("headings.length > 1 ||"), "the predicate under mutation exists");
    fs.writeFileSync(target, src.replace("headings.length > 1 ||", "headings.length > 99 ||"));
    await withRepo({ [`${PLAN}/plan.md`]: "# A\n\n# B\n" }, (dir) => {
      const run = (cli) => JSON.parse(spawnSync(process.execPath, [cli, "validate", `--dir=${dir}`, "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout);
      const count = (j) => findings(j).filter((f) => f.id === "plan-section-heading-count").length;
      assert.equal(count(run(CLI)), 1, "the real tool reports the monolith");
      assert.equal(count(run(target)), 0, "the mutated tool misses it, so the fixture detects the mutation");
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("self-versus-target parity: the same plan gives the same rule result as the tool's own repository and as a target", async () => {
  const fs = await import("node:fs");
  const files = { [`${PLAN}/00-overview.md`]: ok("O"), [`${PLAN}/01-a.md`]: "# A\n\n# A2\n", [`${PLAN}/overview.md`]: ok("X") };
  await withRepo(files, (dir) => {
    fs.cpSync(path.join(HERE, "..", "scripts"), path.join(dir, "scripts"), { recursive: true });
    fs.cpSync(path.join(HERE, "..", "rules"), path.join(dir, "rules"), { recursive: true });
    fs.cpSync(path.join(HERE, "..", "VERSION"), path.join(dir, "VERSION"));
    const shape = (j) => ({ r: { status: result(j).status, disposition: result(j).disposition, assurance: result(j).assurance }, f: findings(j).map((x) => x.id).sort() });
    const target = validate(dir);
    const self = JSON.parse(spawnSync(process.execPath, [path.join(dir, "scripts", "standards.mjs"), "validate", "--json"], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }).stdout);
    assert.deepEqual(shape(self), shape(target));
    assert.ok(shape(target).f.length >= 2);
  });
});

async function fixtureFiles(name) {
  const fs = await import("node:fs");
  const base = path.join(HERE, "fixtures", "plan-sections", name);
  const out = {};
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out[path.relative(base, p).split(path.sep).join("/")] = fs.readFileSync(p, "utf8");
    }
  };
  walk(base);
  return out;
}

test("fixtures under test/fixtures/plan-sections: the compliant plan is clean and the monolith is a violation naming its file", async () => {
  await withRepo(await fixtureFiles("compliant"), (dir) => {
    assert.deepEqual(findings(validate(dir)), []);
  });
  await withRepo(await fixtureFiles("monolith"), (dir) => {
    const f = findings(validate(dir));
    assert.equal(f.length, 1);
    assert.equal(f[0].id, "plan-section-heading-count");
    assert.match(f[0].message, /00-plan\.md has 2 top-level headings/);
  });
});

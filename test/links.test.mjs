import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLinks, linksIn, installedLayout } from "../scripts/links.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** The filename two independent authors invented for ADR 0008, which has never existed. */
const PHANTOM = "0008-the-source-of-truth-gap-working-tree-versus-repository.md";
const CANONICAL = "0008-detectors-do-not-assert-repository-state-they-have-not-measured.md";

/** A miniature repository. `scripts/init.mjs` is stubbed because `installedLayout` parses it. */
async function scratch(files, artifacts = []) {
  const root = await mkdtemp(path.join(tmpdir(), "links-"));
  const table = artifacts.map((a) => `  { ${a} },`).join("\n");
  files["scripts/init.mjs"] = `const ARTIFACTS = [\n${table}\n];\n`;
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text, "utf8");
  }
  return root;
}

// --- The repository itself ----------------------------------------------------------------------

test("every relative link in the repository resolves", async () => {
  // Issue #17's third acceptance criterion, made mechanical. The two ADR 0008 phantoms are the
  // reason it exists; the four it found on its first run are the reason it is repository-wide
  // rather than scoped to `scripts/`.
  const { broken, checked } = await checkLinks(ROOT);
  assert.deepEqual(
    broken.map((b) => `${b.file}:${b.line} -> ${b.target}`),
    [],
  );
  // A regex that stops matching would report a clean repository having examined nothing. The count
  // is asserted so silence has to mean *resolved*, not *unread*.
  assert.ok(checked > 1000, `only ${checked} links examined — has the link pattern stopped matching?`);
});

test("ADR 0008 has one file, and the name both phantom citations used is not it", async () => {
  // The identity conclusion, held mechanically: not a rename that missed a reference — the phantom
  // never named anything. If a second ADR 0008 is ever written this fails, which is correct: that
  // would be a decision to record, not a link to repoint.
  assert.ok(existsSync(path.join(ROOT, "artifacts/adr", CANONICAL)));
  assert.ok(!existsSync(path.join(ROOT, "artifacts/adr", PHANTOM)));
});

test("the seam citations resolve to the canonical file and name the level they mean", async () => {
  // The correction is not only that the path resolves. Both citations are reaching for ADR 0008's
  // *second* decision level, which the title does not name — so each points at the subsection that
  // now does, and the subsection has to exist for that to be true.
  const adr = await readFile(path.join(ROOT, "artifacts/adr", CANONICAL), "utf8");
  assert.match(adr, /^### The repository-metadata seam$/m);
  assert.match(adr, /^### The detector constraint$/m);

  for (const citer of ["scripts/repository.mjs", `artifacts/adr/0011-attestation-freshness-is-repository-content-not-checkout-bytes.md`]) {
    const text = await readFile(path.join(ROOT, citer), "utf8");
    assert.ok(!text.includes(PHANTOM), `${citer} still cites the phantom filename`);
    assert.ok(
      text.includes(`${CANONICAL}#the-repository-metadata-seam`),
      `${citer} cites ADR 0008 without naming the level it means`,
    );
  }
});

// --- Falsifiers: each correction, shown failing before it was made -------------------------------

test("each phantom ADR 0008 citation fails the check before correction", async () => {
  // Both citations verbatim as they stood, against a tree where ADR 0008 exists under its real
  // name. Two, not one: issue #17 recorded `repository.mjs` and did not know about ADR 0011.
  const root = await scratch({
    [`artifacts/adr/${CANONICAL}`]: "# 0008\n",
    "scripts/repository.mjs":
      ` * This is the repository-metadata seam [ADR 0008](../artifacts/adr/${PHANTOM})\n * anticipated.\n`,
    "artifacts/adr/0011-attestation-freshness.md":
      `**This opens the repository-metadata seam** [ADR 0008](${PHANTOM})\nanticipated, as the first subprocess.\n`,
  });
  try {
    const { broken } = await checkLinks(root);
    assert.equal(broken.length, 2, "both phantom citations must fail, not one");
    for (const b of broken) {
      assert.equal(b.rule, "ordinary");
      assert.ok(b.resolved.endsWith(PHANTOM));
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a citation left behind by a renamed standard fails the check", async () => {
  // The three the first run found beside the ADR phantoms: Standard 20 and Standard 32 were both
  // renamed and three citations were not. Repointed rather than allowlisted — a check carrying a
  // list of tolerated failures reports the state of the list.
  const root = await scratch({
    "standards/20-exceptions.md": "# 20\n",
    "standards/32-documentation-quality.md": "# 32\n",
    "artifacts/plan/04.md": "[Standard 20](../../standards/20-exceptions-and-deviations.md)\n",
    "standards/51-architecture-integrity.md":
      "[Standard 32](32-documentation-standards.md) and again [Standard 32](32-documentation-standards.md)\n",
  });
  try {
    const { broken } = await checkLinks(root);
    assert.equal(broken.length, 3);
    assert.deepEqual(
      [...new Set(broken.map((b) => path.posix.basename(b.resolved)))].sort(),
      ["20-exceptions-and-deviations.md", "32-documentation-standards.md"],
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the Copilot template link passes only under destination-relative semantics", async () => {
  // The discriminator. `templates/copilot-instructions.md` links to `../AGENTS.md`, and init writes
  // it to `.github/`. Resolved where the file is stored the target is `<root>/AGENTS.md`, which
  // does not exist in this repository — a source-relative checker reports a defect that is not
  // there, and the obvious repair breaks the file for every adopter.
  const files = {
    "templates/copilot-instructions.md": "Read [`../AGENTS.md`](../AGENTS.md) first.\n",
    "templates/AGENTS.md": "# agents\n",
  };
  const artifacts = [
    `path: "AGENTS.md", template: "templates/AGENTS.md"`,
    `path: ".github/copilot-instructions.md", template: "templates/copilot-instructions.md"`,
  ];
  const root = await scratch(files, artifacts);
  try {
    const { broken } = await checkLinks(root);
    assert.deepEqual(broken, [], "the template link must resolve at its installed destination");

    // ...and it genuinely would not resolve the other way, so the rule is load-bearing rather than
    // a spelling of the same answer.
    assert.ok(
      !existsSync(path.join(root, "AGENTS.md")),
      "the destination-relative target must be absent from the repository for this to prove anything",
    );
    const sourceRelative = path.posix.normalize(path.posix.join("templates", "../AGENTS.md"));
    assert.ok(!existsSync(path.join(root, sourceRelative)), "source-relative resolution must fail here");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a template link that escapes the installed root is caught", async () => {
  // The destination rule is not a licence. `templates/PROJECT.md` cited `../project-policy.yml`,
  // which resolved in this repository and pointed outside the adopter's, so it read as correct
  // here and was broken everywhere it was actually used.
  const root = await scratch(
    { "templates/PROJECT.md": "[`project-policy.yml`](../project-policy.yml)\n", "project-policy.yml": "x\n" },
    [`path: "PROJECT.md", template: "templates/PROJECT.md"`],
  );
  try {
    const { broken } = await checkLinks(root);
    assert.equal(broken.length, 1);
    assert.equal(broken[0].rule, "template");
    assert.ok(broken[0].resolved.startsWith(".."), "escaping the root must be reported, not resolved");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a template link to a file init does not install is caught", async () => {
  // Raised in review, and it is the subtler half of the same defect. `templates/PROJECT.md` linking
  // to `INSTRUCTIONS.md` resolves in this repository, where that file sits at the root — so a check
  // that fell back to "does it exist here" would pass it, and it would dangle in every adopter,
  // because init does not copy it. The target existing somewhere is not the question.
  const root = await scratch(
    {
      "templates/PROJECT.md": "See [the guide](INSTRUCTIONS.md).\n",
      "INSTRUCTIONS.md": "# guide\n",
    },
    [`path: "PROJECT.md", template: "templates/PROJECT.md"`],
  );
  try {
    // The target really is present, so this cannot pass by the file simply being absent.
    assert.ok(existsSync(path.join(root, "INSTRUCTIONS.md")));
    const { broken } = await checkLinks(root);
    assert.equal(broken.length, 1, "a template target outside the installed layout must be reported");
    assert.equal(broken[0].rule, "template");
    assert.equal(broken[0].resolved, "INSTRUCTIONS.md");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a reference-style definition is resolved like any other link", async () => {
  // Also raised in review. `[ADR][adr]` renders identically to an inline link and breaks identically
  // when the target moves. Reading only the inline form would leave a whole syntax unguarded, and
  // the count assertion would stay green while it was.
  const root = await scratch({
    "docs/real.md": "# real\n",
    "docs/index.md": "[good][a] and [gone][b]\n\n[a]: real.md\n[b]: moved-away.md\n",
  });
  try {
    const { broken, checked } = await checkLinks(root);
    assert.equal(checked, 2, "both definitions must be examined, not only the failing one");
    assert.equal(broken.length, 1);
    assert.equal(broken[0].target, "moved-away.md");
    assert.equal(broken[0].line, 4);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a label-shaped line inside a fenced code block is not a link", async () => {
  // The cost of reading the reference form: a computed object key is written the same way, and this
  // repository's own tests are full of them. Fenced blocks are therefore excluded from that pattern
  // — and only from that pattern, since the inline form is distinctive enough not to need it.
  const root = await scratch({
    "docs/index.md": "```js\nconst x = {\n  [FORBIDDEN_MANUAL]: { level: \"forbidden\" },\n};\n```\n",
  });
  try {
    const { broken, checked } = await checkLinks(root);
    assert.equal(checked, 0, "code inside a fence was read as a link");
    assert.deepEqual(broken, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a deliberately broken ordinary relative link is caught", async () => {
  // Standard 42's own trigger: the next rename is caught by a failing check rather than by someone
  // reading the file.
  const root = await scratch({
    "docs/real.md": "# real\n",
    "docs/index.md": "[good](real.md) and [gone](moved-away.md)\n",
  });
  try {
    const { broken, checked } = await checkLinks(root);
    assert.equal(checked, 2, "both links must be examined, not only the failing one");
    assert.equal(broken.length, 1);
    assert.equal(broken[0].target, "moved-away.md");
    assert.equal(broken[0].line, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- Files that are not there when the scan reaches them ----------------------------------------

test("a dot-prefixed file beside real sources is not scanned", async () => {
  // The failure this exists for. `test/invocation-ownership.test.mjs` writes its negative control to
  // `scripts/.shared-cache-control.mjs` and removes it in a `finally`, dot-prefixed precisely so
  // nothing treats it as a source file. This scan did, the runner deleted it between the listing and
  // the read, and the check died on ENOENT — passing locally and losing the race in CI.
  //
  // Dot-prefixing is a convention the repository already keeps; honouring it costs no coverage,
  // which the repository-wide count above holds.
  const root = await scratch({
    "scripts/real.mjs": " * see [a doc](../docs/gone.md)\n",
    "scripts/.shared-cache-control.mjs": " * see [b doc](../docs/also-gone.md)\n",
    "docs/.draft.md": "[c](nowhere.md)\n",
  });
  try {
    const { broken } = await checkLinks(root);
    assert.deepEqual(
      broken.map((b) => b.file),
      ["scripts/real.mjs"],
      "only the undotted file may be scanned",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a file that cannot be opened is reported as unread rather than crashing the scan", async (t) => {
  // The general case behind that specific one: listing and reading are two moments, and a file can
  // stop existing in between. Neither fatal nor silent — a clean result over files nobody opened is
  // the shape this repository names most often, so the file is named and the run continues.
  const root = await scratch({ "docs/real.md": "# real\n", "docs/index.md": "[ok](real.md)\n" });
  try {
    try {
      await symlink(path.join(root, "docs/absent-target.md"), path.join(root, "docs/dangling.md"));
    } catch {
      // Windows refuses symlink creation without privilege, the same reason the installed-bin cases
      // in test/invocation-ownership.test.mjs skip. Skipped with a reason rather than passing
      // quietly, because a check that silently does nothing is what this file exists to prevent.
      t.skip("this host refuses symlink creation; the unread path runs on the Linux image");
      return;
    }
    const { broken, unread, checked } = await checkLinks(root);
    assert.deepEqual(broken, [], "an unreadable file is not a broken link");
    assert.deepEqual(unread.map((u) => u.file), ["docs/dangling.md"]);
    assert.equal(checked, 1, "the readable file must still have been checked");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a healthy repository reports nothing unread", async () => {
  // The other half of the pair: `unread` must be part of the answer even when it is empty, or the
  // field would only ever appear in the failing case and nothing would notice it going missing.
  const { unread } = await checkLinks(ROOT);
  assert.deepEqual(unread, []);
});

// --- Scope of the scan --------------------------------------------------------------------------

test("links in .mjs comments are read and links in code are not", async () => {
  // The phantom this exists for lived in a JSDoc header, so comments must be scanned. Code must not
  // be: `](` occurs inside regular expressions, and a checker that reported those would be muted.
  const source = [
    ` * see [ADR 0008](../artifacts/adr/${CANONICAL})`,
    `const LINK = /\\]\\(([^)]+)\\)/g;`,
    `// and [a comment link](./neighbour.md)`,
  ].join("\n");
  const found = linksIn("scripts/example.mjs", source).map((l) => l.target);
  assert.deepEqual(found, [`../artifacts/adr/${CANONICAL}`, "./neighbour.md"]);
  assert.deepEqual(linksIn("docs/example.md", "[x](y.md)").map((l) => l.target), ["y.md"]);
});

test("the installed layout is read from init rather than restated", async () => {
  // A mapping written down twice disagrees with itself later, which is the class of defect this
  // whole check exists for. If init's table moves, this fails rather than silently checking
  // templates against the wrong destinations.
  const layout = await installedLayout(ROOT);
  assert.equal(layout.destinationOf.get("templates/copilot-instructions.md"), ".github/copilot-instructions.md");
  assert.equal(layout.destinationOf.get("templates/AGENTS.md"), "AGENTS.md");
  assert.ok(layout.created.includes("project-policy.yml"));
});

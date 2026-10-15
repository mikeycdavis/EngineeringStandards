// The golden-equivalence corpus for ST-24 part A (test/plan-reader.test.mjs).
//
// Every case is a set of files written into a scratch repository, so it is deterministic and carries no
// absolute path. Cases are chosen to put each classification predicate on both sides of its boundary:
// plan-file or not, executable or not, read whole, truncated, or unread, fenced or not. Part B of ST-24 will
// change what README, unnumbered and nested files mean; the cases that pin today's answer for them are marked.
//
// `budget` is the `--max-total-read-bytes` value for a case that must leave a file unread.

export const PLAN = "artifacts/project-plan-breakdown";

/** The six required fields of an executable item (Standard 4 R7), complete. */
export const item = (title, extra = {}) =>
  [
    `### ${title}`,
    "",
    `- **Status:** ${extra.status ?? "NOT_STARTED"}`,
    "- **Purpose:** Exercise the reader.",
    `- **Deliverables:** ${extra.deliverables ?? "`scripts/standards.mjs`"}`,
    "- **Acceptance Criteria:** It parses.",
    "- **Verification:** The suite.",
    "- **Dependencies:** none",
    ...(extra.tracked ? [`- **Tracked by:** ${extra.tracked}`] : []),
    "",
  ].join("\n");

const OVERVIEW = "# Overview\n\nWhat this plan is for, in prose.\n\n## Sections\n\n- 01-a\n";

const fence = (open, close = open) => `${open}\n### Not an item\n\n- **Status:** NOT_STARTED\n${close}\n`;

/** About 420 kB: over the 400000-byte read cap, so the tail is never seen. */
const PAD = "padding that carries no plan syntax\n".repeat(12000);

/** ~200 kB: under the per-file cap, over a 32 kB aggregate budget, so it is unread rather than truncated. */
const BULK = "prose that is read only when the budget allows it\n".repeat(4200);

export const CASES = [
  { id: "complete-item", files: { [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-a.md`]: `${item("One")}\n${item("Two")}` } },
  {
    id: "multi-file-mixed",
    files: {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [`${PLAN}/01-a.md`]: `${item("Complete")}\n### Status only\n\n- **Status:** NOT_STARTED\n`,
      [`${PLAN}/02-b.md`]: "### No status\n\n- **Purpose:** an item with no Status is not executable\n",
      [`${PLAN}/03-c.md`]: "### Malformed\n\n- **Status - amended:** IN_PROGRESS\n- **Purpose:** p\n\n### Duplicate\n\n- **Status:** READY\n- **Status:** DONE\n",
    },
  },
  {
    id: "malformed-status-only",
    files: { [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-a.md`]: "### Only item\n\n- **Status - amended:** READY\n- **Purpose:** p\n" },
  },
  {
    id: "readme-item-shaped", // current behaviour: README.md is a plan file and its `###` with Status is executable (part B changes this)
    files: {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [`${PLAN}/01-a.md`]: item("One"),
      [`${PLAN}/README.md`]: "# Reading this plan\n\n### How to read\n\n- **Status:** NOT_STARTED\n",
    },
  },
  {
    id: "readme-linked-from-index", // current behaviour: a link changes nothing, README.md is a plan file anyway
    files: {
      [`${PLAN}/00-overview.md`]: `${OVERVIEW}\nSee [the guide](README.md).\n`,
      [`${PLAN}/01-a.md`]: item("One"),
      [`${PLAN}/README.md`]: "# Guide\n\n### Guide item\n\n- **Status:** READY\n- **Purpose:** p\n",
    },
  },
  {
    id: "nested-and-unnumbered", // current behaviour: any .md anywhere under the directory is a plan file (part B changes this)
    files: {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [`${PLAN}/01-a.md`]: item("One"),
      [`${PLAN}/notes/scratch.md`]: "### Scratch\n\n- **Status:** NOT_STARTED\n",
      [`${PLAN}/notes.md`]: "### Loose\n\n- **Status:** NOT_STARTED\n",
      [`${PLAN}/archive/2025/01-old.md`]: item("Archived", { status: "COMPLETE" }),
    },
  },
  {
    id: "fenced-headings", // current behaviour: the plan parser does not recognise fences (ST-20 Q2)
    files: {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [`${PLAN}/01-a.md`]: `${item("Real")}\n${fence("```")}\n${fence("~~~")}\n${fence("  ```")}\n${fence("````", "`````")}`,
      [`${PLAN}/02-b.md`]: `# Unterminated\n\n${item("Before")}\n\`\`\`\n### Inside an unterminated fence\n\n- **Status:** NOT_STARTED\n`,
    },
  },
  {
    id: "crlf-plan",
    files: { [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-a.md`]: `${item("One")}\n${item("Two")}`.replace(/\n/g, "\r\n") },
  },
  {
    id: "delegated-and-complete",
    files: {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [`${PLAN}/01-a.md`]: [
        item("Tracked elsewhere", { tracked: "ST-9999" }),
        item("Complete, deliverable missing", { status: "COMPLETE", deliverables: "`scripts/does-not-exist.mjs`" }),
        item("Complete, deliverable present", { status: "COMPLETE", deliverables: "`src/index.js`" }),
      ].join("\n"),
      "src/index.js": "export const a = 1;\n",
    },
  },
  {
    id: "truncated-plan", // the bad item sits past the 400000-byte cap; the first item is whole
    files: {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [`${PLAN}/01-big.md`]: `${item("Good")}\n${PAD}\n### Bad, past the cap\n\n- **Status:** NOT_STARTED\n`,
    },
  },
  {
    id: "unread-plan-budget",
    budget: 32 * 1024,
    files: { [`${PLAN}/00-overview.md`]: OVERVIEW, [`${PLAN}/01-a.md`]: `${item("One")}\n${BULK}`, [`${PLAN}/02-b.md`]: item("Two") },
  },
  { id: "empty-plan-dir", files: { [`${PLAN}/.gitkeep`]: "" } },
  { id: "no-plan-dir", files: { "src/index.js": "export const a = 1;\n" } },
  { id: "overview-headings-only", files: { [`${PLAN}/00-overview.md`]: "# Overview\n\n## Goals\n" } },
  {
    id: "predicate-edges",
    files: {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [`${PLAN}/.md`]: "### Dot md\n\n- **Status:** NOT_STARTED\n", // `.+` needs a character before `.md`
      [`${PLAN}/upper.MD`]: "### Upper\n\n- **Status:** NOT_STARTED\n", // the test is case-sensitive
      [`${PLAN}/text.md.txt`]: "### Text\n\n- **Status:** NOT_STARTED\n",
      [`${PLAN}-old/01-a.md`]: item("Sibling directory"),
      [`docs/${PLAN}/01-a.md`]: item("Nested under docs"),
      [`${PLAN}/01-a.md`]: item("Real"),
    },
  },
  {
    id: "conflict-markers-and-fences",
    files: {
      [`${PLAN}/00-overview.md`]: OVERVIEW,
      [`${PLAN}/01-a.md`]: item("One"),
      "docs/merge.md": ["text", "<".repeat(7) + " ours", "a", "=".repeat(7), "b", ">".repeat(7) + " theirs", ""].join("\n"),
      "docs/fenced.md": ["```", "<".repeat(7) + " ours", "=".repeat(7), ">".repeat(7) + " theirs", "```", ""].join("\n"),
      "src/real.js": ["<".repeat(7) + " ours", "a", "=".repeat(7), "b", ">".repeat(7) + " theirs", ""].join("\n"),
    },
  },
];

/** Policy that holds exactly the planning rules; written into every case. */
export const POLICY = [
  'standardVersion: "2.0.0"',
  'project: "Plan reader golden corpus"',
  "rules:",
  "  planning.breakdown-directory:",
  "    level: required",
  "  planning.item-fields:",
  "    level: required",
  "  planning.plan-code-consistency:",
  "    level: required",
  "",
].join("\n");

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discoverBacklog, classifyReference, resolveTracked, OUTCOME, BACKLOG_LAYOUTS } from "../scripts/tracking.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A miniature repository containing only what a resolution question needs. */
async function scratch(files = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "tracking-"));
  for (const [rel, text] of Object.entries(files)) {
    const full = path.join(root, rel);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, text, "utf8");
  }
  return root;
}

const resolveIn = (root, raw) => resolveTracked(raw, { root, backlog: discoverBacklog(root) });

// --- 1 & 2. Discovery replaces the hardcoded path, and finds more than one layout ---------------

test("the conventional layout resolves, exactly as it did when the path was hardcoded", async () => {
  // Issue #5's second acceptance criterion in miniature: the default must not move. Everything else
  // here is new behaviour; this is the one that must be indistinguishable from what shipped.
  const root = await scratch({ "artifacts/backlog/items/ST-001.md": "---\nstatus: done\n---\n" });
  try {
    const r = resolveIn(root, "ST-001");
    assert.equal(r.outcome, OUTCOME.resolved);
    assert.equal(r.id, "ST-001");
    assert.equal(r.path, path.join(root, "artifacts/backlog/items/ST-001.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an alternative supported layout resolves, with no policy consulted", async () => {
  // The defect issue #5 was opened for. A project that keeps its backlog somewhere else got every
  // tracked item reported dangling — a wall of red saying "untracked work presented as tracked"
  // about work that was tracked. Discovery is a repository fact, so `audit`, which takes no policy
  // at all (ADR 0004), reaches the same answer as `validate`.
  const root = await scratch({ "backlog/items/ST-007.md": "---\nstatus: in-progress\n---\n" });
  try {
    const backlog = discoverBacklog(root);
    assert.equal(backlog.dir, "backlog/items");
    const r = resolveTracked("ST-007", { root, backlog });
    assert.equal(r.outcome, OUTCOME.resolved);
    assert.equal(r.path, path.join(root, "backlog/items/ST-007.md"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("discovery reports where it looked, and every declared layout is a real candidate", () => {
  // A discovery that cannot say what it searched is indistinguishable from one that searched
  // nothing, which is the shape Standard 44 R12 exists to forbid.
  const backlog = discoverBacklog(ROOT);
  assert.deepEqual(backlog.searched, BACKLOG_LAYOUTS);
  assert.equal(backlog.dir, null, "this repository has no backlog; discovery must say so plainly");
});

// --- 3. Present backlog, absent item -------------------------------------------------------------

test("an id-shaped reference the discovered backlog does not contain is missing, not unverifiable", async () => {
  // The distinction the three outcomes exist to draw. A backlog WAS found, so the authority was
  // consulted and gave an answer: the item is not there. That is a defect in the plan, and
  // downgrading it to "cannot tell" would be the regression this item's first criterion forbids.
  const root = await scratch({ "artifacts/backlog/items/ST-001.md": "---\nstatus: done\n---\n" });
  try {
    const r = resolveIn(root, "ST-999");
    assert.equal(r.outcome, OUTCOME.missing);
    assert.equal(r.id, "ST-999");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

// --- 4 & 5. References to an authority this run did not consult ----------------------------------

test("a GitHub issue reference is unverifiable — neither valid nor dangling", async () => {
  // Today this matches no pattern, so the reference is dropped and the item falls through to its own
  // cached status. That silently converts "I did not ask the authority" into "the authority agrees",
  // which is the quiet direction and the worse one.
  const root = await scratch({ "artifacts/backlog/items/ST-001.md": "---\nstatus: done\n---\n" });
  try {
    const r = resolveIn(root, "GitHub issue [#5](https://github.com/mikeycdavis/EngineeringStandards/issues/5)");
    assert.equal(r.outcome, OUTCOME.unverifiable, "an external reference must not be reported as missing");
    assert.equal(r.system, "GitHub");
    assert.ok(r.reason.length > 0, "an unverifiable result must say what it could not reach");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an unrecognised or Jira-style reference is unverifiable when no backlog was discovered", async () => {
  // `PROJ-1234` is shaped exactly like a backlog id, so syntax alone cannot separate a Jira key from
  // a local item. What separates them is whether a local authority exists to consult: with none
  // discovered, reporting `missing` would assert the item is absent from a backlog that does not
  // exist. Not knowing is represented as not knowing (Standard 44 R12).
  const root = await scratch({ "README.md": "# no backlog here\n" });
  try {
    assert.equal(resolveIn(root, "PROJ-1234").outcome, OUTCOME.unverifiable);
    assert.equal(resolveIn(root, "tracked in the spreadsheet").outcome, OUTCOME.unverifiable);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the seam locates the item and deliberately does not read it", async () => {
  // The read stays with the caller so a backlog item passes through the same read accounting as
  // every other file the run opens. A seam that opened files itself would be a second, unbudgeted
  // way into the repository — the evidence-surface hole issue #7 closed, reopened one module along.
  const root = await scratch({ "artifacts/backlog/items/ST-001.md": "---\nstatus: done\n---\n" });
  try {
    const r = resolveIn(root, "ST-001");
    assert.equal(r.outcome, OUTCOME.resolved);
    assert.ok(r.path, "a resolved reference must say where the item is");
    assert.ok(!("status" in r), "the seam must not report a status it would have had to read");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("classification separates the two kinds of reference before anything is resolved", () => {
  // The seam's own contract, tested without a filesystem: what KIND of thing this is must not
  // depend on what happens to be on disk, or the two commands could classify differently.
  assert.equal(classifyReference("ST-014").kind, "local-id");
  assert.equal(classifyReference("**Tracked by:** ST-014").kind, "local-id");
  assert.equal(classifyReference("GitHub issue [#5](https://github.com/x/y/issues/5)").kind, "external");
  assert.equal(classifyReference("[PR #15](https://github.com/x/y/pull/15)").kind, "external");
  assert.equal(classifyReference("JIRA-1 in Jira").kind, "external");
  assert.equal(classifyReference("someone's notebook").kind, "unrecognised");
});

test("the outcome vocabulary is explicit rather than a nullable success", () => {
  // Issue #5's defect is not only the hardcoded path — it is that the resolver answered a
  // three-valued question with a boolean, so "could not reach" and "reached and found nothing"
  // arrived at the same branch. Three named outcomes, and no fourth.
  assert.deepEqual(Object.keys(OUTCOME).sort(), ["missing", "resolved", "unverifiable"]);
  for (const v of Object.values(OUTCOME)) assert.equal(typeof v, "string");
});


// --- 6 & 7. Against this repository, through both commands --------------------------------------

/** Run a CLI command against this repository and return its parsed report. */
function cli(command) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/standards.mjs"), command, ROOT, "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(r.stdout);
}

const unverifiableIn = (report) =>
  (report.findings ?? []).find((f) => f.id === "delegated-liveness-unverifiable") ?? null;

test("this repository's externally tracked items produce evidence rather than silence", () => {
  // The defect, measured on the repository that has it. This plan delegates liveness to GitHub
  // issues; before this change those references matched no pattern, were dropped, and the audit
  // reported a clean plan over items whose authority it had never contacted. Zero findings was the
  // wrong answer, and it was indistinguishable from the right one.
  const finding = unverifiableIn(cli("audit"));
  assert.ok(finding, "the audit must report the references it could not resolve");
  assert.ok(finding.evidence.length > 0);
  assert.match(finding.message, /\d+ plan item\(s\) delegate status to an authority this run did not consult/);

  // Every piece of evidence names the item, what it points at, and why that could not be reached.
  for (const line of finding.evidence) {
    assert.match(line, /^artifacts\/project-plan-breakdown\/.+ :: .+ -> /, `unreadable evidence: ${line}`);
    assert.match(line, /the reference names .+, which this run does not contact/);
    assert.match(line, /cached copy this run did not validate/);
  }

  // And it is a report, not a verdict: bound to no rule, so a repository is not made non-compliant
  // for tracking work somewhere this run cannot read.
  assert.equal(finding.rule ?? null, null, "an unconsulted authority must not fail a compliance rule");
  assert.equal(finding.severity, "warning");
});

test("audit and validate resolve the same references identically", () => {
  // The property the seam exists to guarantee, asserted end to end rather than argued from the fact
  // that both call one function. Discovery reads the repository and never a policy, so the command
  // that HAS no policy (ADR 0004) cannot see a different repository than the one that does.
  const fromAudit = unverifiableIn(cli("audit"));
  const fromValidate = unverifiableIn(cli("validate"));

  assert.ok(fromAudit && fromValidate, "both commands must report the same detector's finding");
  assert.deepEqual(fromValidate.evidence, fromAudit.evidence);
  assert.equal(fromValidate.message, fromAudit.message);
  assert.equal(fromValidate.severity, fromAudit.severity);
});

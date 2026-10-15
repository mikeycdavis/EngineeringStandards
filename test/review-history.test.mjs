/**
 * Append-only review-history verification against disposable local Git repositories.
 *
 * Actor and role strings in this file are synthetic structural fixtures. They do not represent
 * authenticated people, provider reviews, or an authorization decision.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { verifyReviewHistoryAppend, ReviewHistoryVerificationError } from "../scripts/review-history.mjs";

const POLICY_PATH = "project-policy.yml";

const git = (cwd, ...args) => {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout.trim();
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const event = (over = {}) => ({
  id: "r1",
  status: "rejected",
  reviewedBy: "synthetic-reviewer",
  reviewerRole: "synthetic-role",
  reviewedAt: "2026-10-01",
  evidence: "synthetic structural evidence",
  reference: "synthetic-reference",
  reviewedAgainst: {
    revision: "1111111111111111111111111111111111111111",
    tree: "2222222222222222222222222222222222222222",
    digest: "abcdef1234567890",
    digestAlgorithm: "git-blob-set-sha256-v1",
    source: "git",
    paths: ["synthetic.txt"],
  },
  ...over,
});

function policySource(events) {
  const lines = ['standardVersion: "2.0.0"', "attestations:", "  testing.synthetic:", "    reviews:"];
  for (const item of events) {
    lines.push(`      - id: "${item.id}"`);
    if (item.supersedes !== undefined) lines.push(`        supersedes: "${item.supersedes}"`);
    lines.push(`        status: "${item.status}"`);
    lines.push(`        reviewedBy: "${item.reviewedBy}"`);
    if (item.reviewerRole !== undefined) lines.push(`        reviewerRole: "${item.reviewerRole}"`);
    lines.push(`        reviewedAt: "${item.reviewedAt}"`);
    lines.push(`        evidence: "${item.evidence}"`);
    lines.push(`        reference: "${item.reference}"`);
    lines.push("        reviewedAgainst:");
    if (item.reviewedAgainst.revision !== undefined) {
      lines.push(`          revision: "${item.reviewedAgainst.revision}"`);
    }
    if (item.reviewedAgainst.tree !== undefined) lines.push(`          tree: "${item.reviewedAgainst.tree}"`);
    if (item.reviewedAgainst.digest !== undefined) {
      lines.push(`          digest: "${item.reviewedAgainst.digest}"`);
    }
    lines.push(`          digestAlgorithm: "${item.reviewedAgainst.digestAlgorithm}"`);
    lines.push(`          source: "${item.reviewedAgainst.source}"`);
    lines.push("          paths:");
    for (const reviewedPath of item.reviewedAgainst.paths ?? []) lines.push(`            - "${reviewedPath}"`);
  }
  return `${lines.join("\n")}\n`;
}

const baseEvents = () => [
  event(),
  event({
    id: "r2",
    supersedes: "r1",
    status: "approved",
    reviewedAt: "2026-10-02",
    reviewedAgainst: {
      ...event().reviewedAgainst,
      revision: "3333333333333333333333333333333333333333",
      tree: "4444444444444444444444444444444444444444",
    },
  }),
];

const successor = (id, supersedes, reviewedAt = "2026-10-03") =>
  event({
    id,
    supersedes,
    status: "approved",
    reviewedAt,
    reviewedAgainst: {
      ...event().reviewedAgainst,
      revision: "5555555555555555555555555555555555555555",
      tree: "6666666666666666666666666666666666666666",
    },
  });

async function repositoryFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "review-history-repo-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "synthetic@example.invalid");
  git(dir, "config", "user.name", "Synthetic Fixture");
  git(dir, "config", "commit.gpgsign", "false");
  await writeFile(path.join(dir, "synthetic.txt"), "synthetic reviewed content\n");
  await writeFile(path.join(dir, POLICY_PATH), policySource(baseEvents()));
  git(dir, "add", POLICY_PATH, "synthetic.txt");
  git(dir, "commit", "-q", "-m", "synthetic base policy");
  return {
    dir,
    baseCommit: git(dir, "rev-parse", "HEAD"),
    baseTree: git(dir, "rev-parse", "HEAD^{tree}"),
  };
}

const verify = (fixture, proposedPolicySource, over = {}) =>
  verifyReviewHistoryAppend({
    repositoryPath: fixture.dir,
    baseCommit: fixture.baseCommit,
    expectedBaseTree: fixture.baseTree,
    policyPath: POLICY_PATH,
    proposedPolicySource,
    ...over,
  });

test("trusted Git history accepts an unchanged prefix and one or multiple valid appended successors", async () => {
  const fixture = await repositoryFixture();
  try {
    const before = git(fixture.dir, "status", "--porcelain=v2");
    const unchanged = await verify(fixture, policySource(baseEvents()));
    assert.equal(unchanged.appendedEvents, 0);
    assert.equal(unchanged.diff.exitCode, 0);

    const one = await verify(fixture, policySource([...baseEvents(), successor("r3", "r2")]));
    assert.equal(one.appendedEvents, 1);
    assert.equal(one.diff.exitCode, 1);
    assert.match(one.diff.stdout, /base\/project-policy\.yml/);
    assert.match(one.diff.stdout, /proposed\/project-policy\.yml/);

    const many = await verify(
      fixture,
      policySource([...baseEvents(), successor("r3", "r2"), successor("r4", "r3", "2026-10-04")]),
    );
    assert.equal(many.appendedEvents, 2);
    assert.equal(git(fixture.dir, "status", "--porcelain=v2"), before, "verification must not modify the repository");
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("formatting-only policy changes do not masquerade as history mutation", async () => {
  const fixture = await repositoryFixture();
  try {
    const formatted = policySource(baseEvents()).replaceAll("\n", "\r\n");
    const result = await verify(fixture, formatted);
    assert.equal(result.appendedEvents, 0);
    assert.ok(result.diff.exitCode === 0 || result.diff.exitCode === 1);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("historical deletion, edit, reorder, insertion, relabel, identity, role, and reviewed-scope mutation fail closed", async () => {
  const fixture = await repositoryFixture();
  try {
    const cases = new Map();
    cases.set("deletion", baseEvents().slice(0, 1));

    for (const [name, mutate] of [
      ["status", (events) => (events[0].status = "approved")],
      ["evidence", (events) => (events[0].evidence = "changed evidence")],
      ["reference", (events) => (events[0].reference = "changed rationale reference")],
      ["actor", (events) => (events[0].reviewedBy = "different synthetic reviewer")],
      ["role", (events) => (events[0].reviewerRole = "different synthetic role")],
      ["commit", (events) => (events[0].reviewedAgainst.revision = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")],
      ["tree", (events) => (events[0].reviewedAgainst.tree = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")],
      ["digest", (events) => (events[0].reviewedAgainst.digest = "1111111111111111")],
      ["scope", (events) => (events[0].reviewedAgainst.paths = ["different.txt"])],
    ]) {
      const events = clone(baseEvents());
      mutate(events);
      cases.set(name, events);
    }

    cases.set("reorder", baseEvents().reverse());
    cases.set("insertion", [baseEvents()[0], successor("inserted", "r1"), baseEvents()[1]]);

    for (const [name, events] of cases) {
      await assert.rejects(verify(fixture, policySource(events)), ReviewHistoryVerificationError, name);
    }
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("newly appended successors cannot omit the structural reviewer role, reviewed tree, or digest", async () => {
  const fixture = await repositoryFixture();
  try {
    const missingRole = successor("r3", "r2");
    delete missingRole.reviewerRole;
    await assert.rejects(verify(fixture, policySource([...baseEvents(), missingRole])), /reviewerRole/);

    const missingTree = successor("r3", "r2");
    delete missingTree.reviewedAgainst.tree;
    await assert.rejects(verify(fixture, policySource([...baseEvents(), missingTree])), /reviewedAgainst\.tree/);

    const missingDigest = successor("r3", "r2");
    delete missingDigest.reviewedAgainst.digest;
    await assert.rejects(verify(fixture, policySource([...baseEvents(), missingDigest])), /reviewedAgainst\.digest/);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

test("wrong or ambiguous base, wrong tree, missing path or object, and parse failure all fail closed", async () => {
  const fixture = await repositoryFixture();
  try {
    const source = await readFile(path.join(fixture.dir, POLICY_PATH), "utf8");
    await assert.rejects(verify(fixture, source, { baseCommit: "HEAD" }), /full, unambiguous/);
    await assert.rejects(
      verify(fixture, source, { baseCommit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
      ReviewHistoryVerificationError,
    );
    await assert.rejects(
      verify(fixture, source, { expectedBaseTree: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
      /does not match expected/,
    );
    await assert.rejects(verify(fixture, source, { policyPath: "missing-policy.yml" }), ReviewHistoryVerificationError);
    await assert.rejects(verify(fixture, "attestations:\n   broken: value\n"), /could not be parsed/);
  } finally {
    await rm(fixture.dir, { recursive: true, force: true });
  }
});

// ST-44: which malformed shapes in an already-trusted history have a recovery path. The wording in
// compliance.mjs, INSTRUCTIONS.md and ADR 0005 is pinned to this behaviour in repository.test.mjs.
async function fixtureWithBase(baseSource) {
  const fixture = await repositoryFixture();
  await writeFile(path.join(fixture.dir, POLICY_PATH), baseSource);
  git(fixture.dir, "add", POLICY_PATH);
  git(fixture.dir, "commit", "-q", "-m", "malformed trusted base");
  return {
    dir: fixture.dir,
    baseCommit: git(fixture.dir, "rev-parse", "HEAD"),
    baseTree: git(fixture.dir, "rev-parse", "HEAD^{tree}"),
  };
}

const policyHead = ['standardVersion: "2.0.0"', "attestations:", "  testing.synthetic:"].join("\n");
const genesisSource = policySource([event({ id: "g1" })]);

test("trusted history whose reviews container is null or an empty list can be replaced by a well-formed list", async () => {
  const shapes = {
    "empty list": `${policyHead}
    reviews: []
`,
    "null container": `${policyHead}
    reviews:
`,
  };
  for (const [name, base] of Object.entries(shapes)) {
    const fixture = await fixtureWithBase(base);
    try {
      const result = await verify(fixture, genesisSource);
      assert.equal(result.appendedEvents, 1, name);
    } finally {
      await rm(fixture.dir, { recursive: true, force: true });
    }
  }
});

test("a non-list reviews container may hide events and cannot be replaced, so a recorded rejection is not erasable", async () => {
  const shapes = {
    "scalar container": `${policyHead}
    reviews: "oops"
`,
    "mapping container": `${policyHead}
    reviews:
      a: 1
`,
    "mapping holding a rejected event": `${policyHead}
    reviews:
      id: "r1"
      status: "rejected"
      reviewedBy: "synthetic-reviewer"
`,
  };
  const approvedGenesis = policySource([event({ id: "g1", status: "approved" })]);
  for (const [name, base] of Object.entries(shapes)) {
    const fixture = await fixtureWithBase(base);
    try {
      await assert.rejects(verify(fixture, approvedGenesis), ReviewHistoryVerificationError, name + ": approved genesis");
      await assert.rejects(verify(fixture, genesisSource), ReviewHistoryVerificationError, name + ": genesis");
    } finally {
      await rm(fixture.dir, { recursive: true, force: true });
    }
  }
});

test("trusted history with malformed events inside a well-formed list has no recovery path", async () => {
  const missingPredecessor = policySource([event(), successor("r2", "no-such-event")]);
  const incompleteEvent = `${policyHead}\n    reviews:\n      - id: "r1"\n        status: "rejected"\n`;
  for (const [name, base] of Object.entries({ missingPredecessor, incompleteEvent })) {
    const fixture = await fixtureWithBase(base);
    try {
      await assert.rejects(verify(fixture, genesisSource), ReviewHistoryVerificationError, `${name}: replace`);
      await assert.rejects(verify(fixture, base), ReviewHistoryVerificationError, `${name}: leave as is`);
      const appended = base.includes("no-such-event")
        ? policySource([event(), successor("r2", "no-such-event"), successor("r3", "r2", "2026-10-04")])
        : `${base}      - id: "r2"\n`;
      await assert.rejects(verify(fixture, appended), ReviewHistoryVerificationError, `${name}: append`);
    } finally {
      await rm(fixture.dir, { recursive: true, force: true });
    }
  }
});

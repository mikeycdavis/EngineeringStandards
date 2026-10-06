#!/usr/bin/env node
/**
 * Issue -> plan-item ownership: does each open issue have exactly one canonical owner, or a recorded
 * reason it has none yet?
 *
 * WHY THIS EXISTS. `scripts/tracking.mjs` runs item -> issue: given a plan item, is its authority
 * reachable. Nothing ran the other direction, so section 08's bold sentence "every open GitHub issue
 * is claimed by exactly one plan item" was asserted by prose and established by nobody. It was wrong
 * within an hour of being derived by hand (issue #49).
 *
 * TWO TRUTHS, NOT ONE RULE. The owner decision of 2026-10-01 (PRs #78 and #79) settles that a newly
 * filed issue may legitimately be unscoped for a while, but is never release-eligible in that state,
 * and that every release-relevant issue has exactly one canonical owner. A zero-unclaimed rule would
 * collapse those: it would fail permanently on an honest repository, or force items to be minted
 * before anyone had scoped them. So every open issue lands in exactly one class:
 *
 *   claimed-once        exactly one plan item's `Tracked by` names it.   Release-eligible.
 *   claimed-twice       two or more plan items name it.                  Violation.
 *   absent-from-plan    no item names it and it is not declared.         Violation.
 *   temporary-unscoped  no item names it and it IS declared.             Legal, never release-eligible.
 *   stale-declaration   declared AND claimed.                            Violation: the declaration
 *                       outlived the state it described.
 *   hierarchy-container the mapping records it as a theme, initiative, epic or feature (TH/IN/EP/FE),
 *                       and no plan item claims it. Legal and does not block release: plan items
 *                       are stories, and a container is owned by the mapping's parent links, not by
 *                       a plan item. Not release-eligible work in itself.
 *   container-claimed   the mapping records it as a hierarchy container AND exactly one plan item
 *                       names it. Violation: a plan item cannot own a container, and the claim must
 *                       not make it release-eligible. (Two or more claims is claimed-twice.)
 *
 * REPRESENTATION. The state is recorded as `temporarilyUnscoped` in
 * `artifacts/backlog/github-mapping.json`: a list of `{ number, since, reason }`. The mapping is
 * already the durable issue-number record, a declaration there is reviewed in a pull request like any
 * other change, and nothing is added to GitHub (no label to drift from the file). No expiry is
 * invented: `since` records when, and releaseReady stays false while any entry exists, which is how
 * "never release-eligible in that state" is enforced rather than merely stated.
 *
 * WHAT A CLAIM IS. An item's `Tracked by` field, and only that, read as the issue links it contains.
 * The field is recognised by the canonical plan-field grammar (scripts/standards.mjs), so the
 * qualified form `- **Tracked by — <qualifier>:**` counts as well as the plain one. A link counts
 * only when it points at the mapping's `target` repository on github.com: an issue number in
 * another repository says nothing about this one.
 * An issue mentioned in prose or another field is not a claim (ADR 0009, the use/mention
 * distinction), and a pull request link is not an issue claim.
 *
 * WHAT THIS DOES NOT DO. It never contacts GitHub. The open set is a snapshot the caller supplies
 * (`gh issue list --state open --json number,state > issues.json`), because a check that silently
 * went to the network would turn "could not reach" into a verdict (Standard 44 R12). Without a
 * snapshot the answer is NOT_EVALUATED, exit 2, which is not a pass (Standard 24 R4). It is not a
 * pipeline stage: CI has no snapshot to give it, and wiring one in is a separate decision.
 *
 * Exit codes: 0 evaluated, no violation; 1 a violation; 2 not evaluated or unusable input.
 *
 * No third-party dependencies, matching scripts/standards.mjs.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_LINE, canonicalFieldKey } from "./standards.mjs";

const EXIT_OK = 0;
const EXIT_VIOLATION = 1;
const EXIT_NOT_EVALUATED = 2;

export const CLASS = Object.freeze({
  claimedOnce: "claimed-once",
  claimedTwice: "claimed-twice",
  absent: "absent-from-plan",
  temporaryUnscoped: "temporary-unscoped",
  staleDeclaration: "stale-declaration",
  hierarchyContainer: "hierarchy-container",
  containerClaimed: "container-claimed",
});

const PLAN_DIR = "artifacts/project-plan-breakdown";
const MAPPING = "artifacts/backlog/github-mapping.json";
const ISSUE_LINK = /https?:\/\/(?:www\.)?github\.com\/([^/\s)]+)\/([^/\s)]+)\/issues\/(\d+)\b/gi;

/** The repository the mapping's issue numbers belong to, or throws: a link cannot be judged without it. */
function mappedRepository(root) {
  const file = path.join(root, MAPPING);
  let data = null;
  if (existsSync(file)) {
    try {
      data = JSON.parse(readFileSync(file, "utf8"));
    } catch (e) {
      throw new Error(`could not read ${MAPPING}: ${e.message}`);
    }
  }
  const target = data?.target;
  if (typeof target !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(target)) {
    throw new Error(`${MAPPING} names no \`target\` repository (owner/repo), so plan issue links cannot be matched to it`);
  }
  return target.toLowerCase();
}

/**
 * Every (item, issue) claim in the plan files.
 *
 * An item is a heading of level 2-4 and its body up to the next such heading. The `Tracked by` value
 * is the field's line plus continuation lines, up to the next field or a blank line.
 */
export function collectPlanClaims(root) {
  const dir = path.join(root, PLAN_DIR);
  if (!existsSync(dir)) return [];
  const claims = [];
  let repository = null;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md")).sort()) {
    const file = `${PLAN_DIR}/${name}`;
    const lines = readFileSync(path.join(dir, name), "utf8").split(/\r?\n/);
    let title = null;
    for (let i = 0; i < lines.length; i++) {
      const heading = lines[i].match(/^#{2,4}\s+(.*\S)\s*$/);
      if (heading) {
        title = heading[1];
        continue;
      }
      const field = lines[i].match(FIELD_LINE);
      if (!field || title === null) continue;
      const key = canonicalFieldKey(field[1].trim());
      if (key !== "Tracked by" && key !== "TrackedBy") continue;
      let value = field[2];
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "" || /^-\s+\*\*/.test(lines[j]) || /^#/.test(lines[j])) break;
        value += `\n${lines[j]}`;
      }
      const seen = new Set();
      for (const m of value.matchAll(ISSUE_LINK)) {
        repository ??= mappedRepository(root);
        if (`${m[1]}/${m[2]}`.toLowerCase() !== repository) continue;
        const issue = Number(m[3]);
        if (seen.has(issue)) continue;
        seen.add(issue);
        claims.push({ file, title, issue });
      }
    }
  }
  return claims;
}

/**
 * The declared temporarily-unscoped set. Absent mapping or absent key means none declared; an
 * unreadable mapping throws, because an empty set read from a broken file would turn declared
 * unscoped issues into violations or, worse, hide that the file was unreadable.
 */
export function readUnscoped(root) {
  const file = path.join(root, MAPPING);
  if (!existsSync(file)) return { entries: [], malformed: [], containers: [] };
  let data;
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`could not read ${MAPPING}: ${e.message}`);
  }
  // Hierarchy containers: mapped items whose id is not a story. Read from the same file so the
  // mapping stays the single record of what the numbers are.
  const containers = Object.entries(data?.items ?? {})
    .filter(([id, v]) => !/^ST-/.test(id) && Number.isInteger(v?.number))
    .map(([, v]) => v.number);
  const raw = data?.temporarilyUnscoped;
  if (raw === undefined) return { entries: [], malformed: [], containers };
  if (!Array.isArray(raw)) return { entries: [], malformed: ["temporarilyUnscoped is not a list"], containers };
  const entries = [];
  const malformed = [];
  raw.forEach((e, i) => {
    const ok =
      e && typeof e === "object" && Number.isInteger(e.number) && e.number > 0 &&
      typeof e.since === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.since) &&
      typeof e.reason === "string" && e.reason.trim() !== "";
    if (ok) entries.push({ number: e.number, since: e.since, reason: e.reason });
    else malformed.push(`temporarilyUnscoped[${i}] needs integer number, YYYY-MM-DD since and non-empty reason`);
  });
  return { entries, malformed, containers };
}

/** Open issue numbers from a `gh issue list --json number,state` list, or a list of bare numbers. */
export function parseIssueSnapshot(data) {
  if (!Array.isArray(data)) throw new Error("issue snapshot must be a JSON list");
  const open = [];
  for (const e of data) {
    if (Number.isInteger(e)) {
      open.push(e);
    } else if (e && Number.isInteger(e.number)) {
      if (e.state === undefined || String(e.state).toUpperCase() === "OPEN") open.push(e.number);
    } else {
      throw new Error("issue snapshot entries must be numbers or objects with a numeric `number`");
    }
  }
  return open;
}

/**
 * Classify every open issue. Pure: no filesystem, no network, no clock.
 *
 * `ok` means no violation. `releaseReady` is stricter and is the half of the pair that keeps
 * "legal" from becoming "shippable": it requires ok AND every open issue claimed once.
 */
export function checkOwnership({ openIssues, claims, unscoped, malformed = [], containers = [] }) {
  const open = [...new Set(openIssues)].sort((a, b) => a - b);
  const declared = new Map();
  const containerSet = new Set(containers);
  const problems = [];

  for (const m of malformed) problems.push({ kind: "malformed-declaration", message: m });
  for (const d of unscoped) {
    if (declared.has(d.number)) {
      problems.push({ kind: "duplicate-declaration", issue: d.number, message: `#${d.number} is declared unscoped twice` });
    } else {
      declared.set(d.number, d);
    }
    if (!open.includes(d.number)) {
      problems.push({
        kind: "declaration-for-non-open-issue",
        issue: d.number,
        message: `#${d.number} is declared temporarily unscoped but is not in the open set`,
      });
    }
  }

  const issues = open.map((number) => {
    const owners = claims.filter((c) => c.issue === number).map((c) => ({ file: c.file, title: c.title }));
    const isDeclared = declared.has(number);
    const isContainer = containerSet.has(number);
    let classification;
    if (owners.length > 1) classification = CLASS.claimedTwice;
    else if (owners.length === 1 && isContainer) classification = CLASS.containerClaimed;
    else if (owners.length === 1) classification = isDeclared ? CLASS.staleDeclaration : CLASS.claimedOnce;
    else if (isContainer) classification = CLASS.hierarchyContainer;
    else classification = isDeclared ? CLASS.temporaryUnscoped : CLASS.absent;
    if (isContainer && isDeclared) {
      problems.push({
        kind: "declaration-for-container",
        issue: number,
        message: `#${number} is a hierarchy container in the mapping and cannot be declared temporarily unscoped`,
      });
    }
    return {
      number,
      classification,
      owners,
      releaseEligible: classification === CLASS.claimedOnce,
    };
  });

  const violations = new Set([CLASS.claimedTwice, CLASS.absent, CLASS.staleDeclaration, CLASS.containerClaimed]);
  const ok = problems.length === 0 && issues.every((i) => !violations.has(i.classification));
  const releaseReady =
    ok && issues.every((i) => i.releaseEligible || i.classification === CLASS.hierarchyContainer);
  return { ok, releaseReady, issues, problems };
}

function render(result, claimCount) {
  const out = [];
  out.push(`Issue-to-item ownership: ${result.issues.length} open issue(s), ${claimCount} plan claim(s) read.`);
  for (const i of result.issues) {
    const by = i.owners.map((o) => `${o.file} :: ${o.title}`).join("; ");
    const tail = i.releaseEligible ? "release-eligible" : "not release-eligible";
    out.push(`  #${i.number}  ${i.classification}  (${tail})${by ? `  ${by}` : ""}`);
  }
  for (const p of result.problems) out.push(`  problem: ${p.message}`);
  out.push(
    result.ok
      ? `PASSED: no ownership violation. Release-ready: ${result.releaseReady ? "yes" : "no (temporary-unscoped issues are legal but not release-eligible)"}.`
      : "FAILED: ownership violation(s) above.",
  );
  return out.join("\n");
}

function main(argv) {
  let root = process.cwd();
  let issuesFile = null;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") root = path.resolve(argv[++i] ?? "");
    else if (a === "--issues") issuesFile = argv[++i];
    else if (a === "--json") json = true;
    else {
      process.stderr.write(`Unknown argument: ${a}\nUsage: ownership.mjs [--root dir] --issues <open-issues.json> [--json]\n`);
      return EXIT_NOT_EVALUATED;
    }
  }
  if (!issuesFile) {
    process.stdout.write(
      "NOT_EVALUATED: no open-issue snapshot was supplied, so no ownership claim can be made.\n" +
        "Supply one: gh issue list -R <owner/repo> --state open --limit 500 --json number,state > issues.json\n" +
        "then: node scripts/ownership.mjs --issues issues.json\n",
    );
    return EXIT_NOT_EVALUATED;
  }
  let result;
  let claims;
  try {
    const openIssues = parseIssueSnapshot(JSON.parse(readFileSync(path.resolve(issuesFile), "utf8")));
    claims = collectPlanClaims(root);
    const { entries, malformed, containers } = readUnscoped(root);
    result = checkOwnership({ openIssues, claims, unscoped: entries, malformed, containers });
  } catch (e) {
    process.stderr.write(`NOT_EVALUATED: ${e.message}\n`);
    return EXIT_NOT_EVALUATED;
  }
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${render(result, claims.length)}\n`);
  return result.ok ? EXIT_OK : EXIT_VIOLATION;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

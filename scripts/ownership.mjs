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
 * WHAT A CLAIM IS. A `###` plan item's first `Tracked by` field, and only that, read as the issue links it contains.
 * Items, fields and value boundaries come from the one canonical plan grammar (scripts/standards.mjs,
 * design/plan-item-grammar.md), so the qualified form `- **Tracked by — <qualifier>:**` counts as well as the
 * plain one, and a `Tracked by` the grammar will not read as a claim is a reported problem, never silence. A link counts
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

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectSurface, parsePlanDocument, TRACKED_BY_KEYS } from "./standards.mjs";

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
/** The plan files the canonical audit reads (`detectPlanDiscrepancies`): `.md` anywhere under the plan directory. */
const PLAN_FILE = /^artifacts\/project-plan-breakdown\/.+\.md$/;

const SCHEME_CHAR = /[A-Za-z0-9+.-]/;
/** The characters a Markdown backslash escapes (CommonMark: any ASCII punctuation). */
const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const ISSUE_LINK = /https?:\/\/(?:www\.)?github\.com\/([^/\s)]+)\/([^/\s)]+)\/issues\/(\d+)\b/gi;

/**
 * The issue links in one `Tracked by` value that are standalone links rather than parts of longer ones.
 *
 * A link must start the value, follow whitespace, or follow the `(` of a markdown link destination (a `(`
 * right after a `]` that closes a `[`; a `](` with no label before it is just characters). After any other `(`, `<`, `[`, `*`, a quote, `>`, `,` or `;` it still counts, unless the
 * whitespace-delimited token it sits in already holds a `scheme:` (`https://x/?next;https://github.com/...`,
 * `data:text/plain,https://github.com/...`, `mailto:`, `urn:`): inside an enclosing URL those are ordinary
 * characters, and reading the inner link as a claim could pass a check falsely. A token is a run without
 * whitespace, so `go("<url>")` after `javascript:` is inside it too. Two bare URLs joined by a separator
 * with no space are one token, so only the first is read.
 *
 * A backslash before ASCII punctuation makes that character literal (#102): an escaped `[` opens no label
 * and an escaped `]` closes none, so `\[x]` and `[x\]` before a `(` are not a label for the `](` shortcut.
 *
 * LINEAR TIME (ST-20, Q5). Whether the token holds a scheme depends only on the characters before the
 * match, so one forward pass keeps it (`tokenScheme`: a `:` was seen in this token right after a run of
 * scheme characters holding a letter) and the matches, which arrive in ascending order, read it at their
 * index. Nothing scans backwards. `stats`, when given, counts the characters passed (`steps`) and the links
 * judged (`links`) so a test can bound the work deterministically: `steps` never exceeds `value.length`.
 *
 * Returns `[{ owner, repo, issue }]` in order, for every standalone link to any repository.
 */
export function extractIssueLinks(value, stats = null) {
  const out = [];
  let pos = 0;
  let tokenScheme = false;
  let runHasLetter = false;
  let openLabels = 0; // `[` not yet closed
  let labelClosedAt = -1; // index of the last `]` that closed a `[`
  for (const m of value.matchAll(ISSUE_LINK)) {
    for (; pos < m.index; pos++) {
      if (stats) stats.steps++;
      const c = value[pos];
      if (c === "\\" && pos + 1 < m.index && ASCII_PUNCT.test(value[pos + 1])) {
        // A backslash escape: the punctuation after it is literal text, so an escaped `[` opens no label and an
        // escaped `]` closes none (`\\[` is an escaped backslash and a real bracket). The pair is passed in one move and
        // cannot reach the link itself (`pos + 1 < m.index`), so the work stays one step per character.
        if (stats) stats.steps++;
        pos++;
        runHasLetter = false;
      } else if (/\s/.test(c)) {
        tokenScheme = false;
        runHasLetter = false;
      } else if (c === ":") {
        if (runHasLetter) tokenScheme = true;
        runHasLetter = false;
      } else if (/[A-Za-z]/.test(c)) {
        runHasLetter = true;
      } else if (c === "[") {
        openLabels++;
        runHasLetter = false;
      } else if (c === "]") {
        if (openLabels > 0) {
          openLabels--;
          labelClosedAt = pos;
        }
        runHasLetter = false;
      } else if (!SCHEME_CHAR.test(c)) {
        runHasLetter = false;
      }
    }
    if (stats) stats.links++;
    const prev = value[m.index - 1];
    const standalone =
      m.index === 0 ||
      /\s/.test(prev) ||
      (prev === "(" && labelClosedAt === m.index - 2) || // a Markdown link destination: that `]` closed a `[`
      (/[(<[*"'>,;]/.test(prev) && !tokenScheme);
    if (standalone) out.push({ owner: m[1], repo: m[2], issue: Number(m[3]) });
  }
  return out;
}

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
 * Every (item, issue) claim in the plan files, and every plan-grammar problem that stopped a `Tracked by`
 * from being read as one.
 *
 * Plan items, fields, spans and value boundaries come from the canonical parser (`parsePlanDocument` in
 * scripts/standards.mjs); the file set and read state come from the canonical audit collector
 * (`collectSurface`): `.md` files anywhere under the plan directory, the repository's exclusions, the
 * per-file read cap, the total read budget. If any plan file could not be read whole (unreadable, truncated
 * at the cap, or skipped once the budget was spent), or the walk could not reach the plan directory, this
 * THROWS, and the caller reports NOT_EVALUATED: a plan that was not fully read never yields a clean result.
 *
 * A plan item is a `###` heading; a `#` or `##` heading ends it for attribution. The claim is the item's
 * FIRST `Tracked by` / `TrackedBy` field: its line plus continuation lines, read as the issue links it
 * names (`extractIssueLinks`), kept only when they point at the mapped repository. Everything else that
 * names `Tracked by` is a reported problem, never a claim and never silence:
 *   plan-claim-outside-item     a `Tracked by` before the first item or after a `#`/`##` heading
 *   plan-tracked-by-malformed   a `Tracked by` written in a form the plan grammar rejects (separator or syntax)
 *   plan-tracked-by-duplicate   a later `Tracked by` on the same item
 *   plan-claim-untitled-item    a `Tracked by` under a `###` heading with no title (it cannot be named as an owner)
 * Fenced code is not recognised, as in the canonical parser (accepted behaviour, ST-20 Q2).
 */
export async function collectPlanOwnership(root, { surface = null } = {}) {
  // `surface` is the collector's result for a caller that already holds one (and for tests that need a
  // degraded one: a spent budget, a capped walk); otherwise the collector runs here.
  const { run, files, surfaceLoss } = surface ?? (await collectSurface(root));
  const planFiles = files.filter((f) => PLAN_FILE.test(run.rel(f))).sort((a, b) => (run.rel(a) < run.rel(b) ? -1 : 1));

  const incomplete = [];
  if (surfaceLoss.capped) incomplete.push("the file walk stopped at its file cap, so plan files may be missing");
  // A path is "on the plan tree" when it is the plan directory, inside it, or a parent of it.
  const onPlanTree = (r) => r === "" || r === PLAN_DIR || PLAN_DIR.startsWith(`${r}/`) || r.startsWith(`${PLAN_DIR}/`);
  for (const dir of surfaceLoss.dirs) {
    const r = run.rel(dir);
    if (onPlanTree(r)) incomplete.push(`directory ${r || "."} could not be listed, so plan files may be missing`);
  }
  // A directory the walk skipped on the FRAMEWORK's say-so (a conventional name such as fixtures, vendor or
  // build, or a vendored-tree marker) is evidence nobody declared disposable. One the repository declared
  // ignored is the project's own decision and is honoured, as the audit honours it.
  for (const e of surfaceLoss.excluded) {
    if (e.authorizedBy === "framework" && onPlanTree(e.path)) {
      incomplete.push(`${e.path} was excluded by the audit walk (${e.reason}), so plan files under it were not read`);
    }
  }
  for (const f of planFiles) {
    const text = run.textOf(f);
    if (!text.available) incomplete.push(`${run.rel(f)} was not read (${text.reason})`);
    else if (run.truncated.has(f)) incomplete.push(`${run.rel(f)} was read only in part (over the read cap)`);
  }
  if (incomplete.length > 0) {
    throw new Error(`plan files were not fully read, so no ownership claim can be made: ${incomplete.join("; ")}`);
  }

  const claims = [];
  const problems = [];
  let repository = null;
  for (const f of planFiles) {
    const file = run.rel(f);
    const { items, orphans } = parsePlanDocument(run.textOf(f).text, file);
    const outside = (s, title) =>
      problems.push({
        kind: "plan-claim-outside-item",
        file,
        line: s.line,
        title,
        message: `${file}:${s.line} :: ${title === null ? "(before the first item)" : `(after item "${title}")`} :: ${s.key} is outside a \`###\` plan item (before the first item or after a \`#\`/\`##\` heading), so it was not read as a claim`,
      });
    for (const s of orphans) if (TRACKED_BY_KEYS.includes(s.key)) outside(s, null);
    for (const item of items) {
      const tracked = item.spans.filter((s) => TRACKED_BY_KEYS.includes(s.key));
      if (item.title === "") {
        // An item with no title cannot be named as an owner, so nothing under it is read as a claim.
        for (const s of tracked) {
          problems.push({
            kind: "plan-claim-untitled-item",
            file,
            line: s.line,
            title: item.title,
            message: `${file}:${s.line} :: (untitled item) :: ${s.key} is under a ### heading with no title, so it was not read as a claim`,
          });
        }
        continue;
      }
      const readable = [];
      for (const s of tracked) {
        if (!s.attributed) outside(s, item.title);
        else if (s.kind !== "field") {
          problems.push({
            kind: "plan-tracked-by-malformed",
            file,
            line: s.line,
            title: item.title,
            message: `${file}:${s.line} :: ${item.title} :: ${s.key} written in a form the plan grammar does not accept (${s.kind}: ${s.label}), so it was not read as a claim`,
          });
        } else readable.push(s);
      }
      readable.forEach((s, i) => {
        if (i > 0) {
          problems.push({
            kind: "plan-tracked-by-duplicate",
            file,
            line: s.line,
            title: item.title,
            message: `${file}:${s.line} :: ${item.title} :: a second Tracked by field; only the first is read as this item's claim`,
          });
          return;
        }
        const seen = new Set();
        for (const link of extractIssueLinks(s.text)) {
          repository ??= mappedRepository(root);
          if (`${link.owner}/${link.repo}`.toLowerCase() !== repository) continue;
          if (seen.has(link.issue)) continue;
          seen.add(link.issue);
          claims.push({ file, title: item.title, issue: link.issue });
        }
      });
    }
  }
  return { claims, problems };
}

/** The claims alone (see `collectPlanOwnership` for the problems that were reported instead of claims). */
export async function collectPlanClaims(root) {
  return (await collectPlanOwnership(root)).claims;
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
export function checkOwnership({ openIssues, claims, unscoped, malformed = [], containers = [], planProblems = [] }) {
  const open = [...new Set(openIssues)].sort((a, b) => a - b);
  const declared = new Map();
  const containerSet = new Set(containers);
  const problems = [];

  for (const m of malformed) problems.push({ kind: "malformed-declaration", message: m });
  for (const p of planProblems) problems.push(p);
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

async function main(argv) {
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
  let owned;
  try {
    const openIssues = parseIssueSnapshot(JSON.parse(readFileSync(path.resolve(issuesFile), "utf8")));
    owned = await collectPlanOwnership(root);
    claims = owned.claims;
    const { entries, malformed, containers } = readUnscoped(root);
    result = checkOwnership({ openIssues, claims, unscoped: entries, malformed, containers, planProblems: owned.problems });
  } catch (e) {
    process.stderr.write(`NOT_EVALUATED: ${e.message}\n`);
    return EXIT_NOT_EVALUATED;
  }
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${render(result, claims.length)}\n`);
  return result.ok ? EXIT_OK : EXIT_VIOLATION;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}

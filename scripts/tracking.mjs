#!/usr/bin/env node
/**
 * Resolve a plan item's delegated-liveness reference, and say which of three things happened.
 *
 * WHY THIS EXISTS. `detectPlanDiscrepancies` built one path — `artifacts/backlog/items/<ID>.md` —
 * and asked one question of it: does the file exist. That made a storage layout part of the
 * validation semantics, and it answered a three-valued question with a boolean, so *reached the
 * authority and found nothing* and *never reached an authority at all* arrived at the same branch.
 *
 * The second half is the quiet one, and it is live in this repository. Its plan delegates liveness
 * to GitHub issues; those references match no backlog-id pattern, so the reference was dropped and
 * the item fell through to its own cached status. The audit then reported a clean plan while more
 * than a dozen items pointed at an authority it had never contacted. Silence read as agreement.
 *
 * THREE OUTCOMES, NAMED, WITH NO FOURTH.
 *
 *   resolved      An authority was found and answered. Its status is the item's real status.
 *   missing       An authority was found and does NOT contain this id. A defect in the plan.
 *   unverifiable  No authority this run can consult. Not a defect, and NOT a pass.
 *
 * The distinction between the last two is the whole point (Standard 44 R12): a run that cannot
 * reach an authority must say so, never convert not-knowing into a fact about the project. Reporting
 * an external reference as `missing` would accuse the plan of a dangling pointer on the strength of
 * not having looked; reporting it as resolved would be worse.
 *
 * DISCOVERY, NOT CONFIGURATION — AND THIS IS DELIBERATE AGAINST THE ISSUE THAT ASKED FOR IT.
 * Issue #5 proposes declaring a backlog root in `project-policy.yml`. That is the option
 * [ADR 0008](../artifacts/adr/0008-detectors-do-not-assert-repository-state-they-have-not-measured.md)
 * already rejected by name: detectors also serve `audit`, which takes no policy at all
 * ([ADR 0004](../artifacts/adr/0004-audit-and-validate-are-separate-commands.md)), so sourcing
 * evidence discovery from configuration would give the two commands different answers about what a
 * repository contains. Layouts are therefore discovered from the repository, which both commands see
 * identically — the same shape `adrDirs` already uses in `scripts/standards.mjs` for the same
 * problem, where three conventional ADR locations are accepted rather than one being imposed.
 *
 * WHY AN ID-SHAPED REFERENCE IS NOT ALWAYS LOCAL. A Jira key is written `PROJ-1234` and a backlog id
 * is written `ST-014`; syntax cannot separate them. What separates them is whether a local authority
 * exists to consult. With a backlog discovered, an id it does not contain is `missing` — the
 * authority was asked. With none discovered, the same string is `unverifiable`, because reporting it
 * absent from a backlog that does not exist would be asserting something nothing checked.
 *
 * The consequence is worth stating plainly: a project using Jira keys AND keeping a local backlog
 * will see its Jira references reported `missing`. That is honest rather than ideal — the local
 * authority genuinely was consulted and genuinely does not contain them — and the fix is an adapter
 * contract for reachable external systems, which is a larger decision than this seam.
 *
 * No third-party dependencies, matching scripts/standards.mjs.
 */

import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * The three things that can happen to a reference. Exported as a frozen vocabulary rather than bare
 * strings so a caller cannot invent a fourth outcome by typo and have it silently mean "not
 * resolved" — which is how the boolean version of this failed.
 */
export const OUTCOME = Object.freeze({
  resolved: "resolved",
  missing: "missing",
  unverifiable: "unverifiable",
});

/**
 * Conventional backlog layouts, in the order they are searched.
 *
 * Ordered most specific first: `artifacts/backlog/items` is what the `backlog` skill writes and what
 * the hardcoded path assumed, so the existing default is found before any alternative and its
 * behaviour cannot change. The bare directories come last because a repository with
 * `backlog/items/` also has `backlog/`, and the item files live in the deeper one.
 */
export const BACKLOG_LAYOUTS = Object.freeze([
  "artifacts/backlog/items",
  "docs/backlog/items",
  "backlog/items",
  "artifacts/backlog",
  "backlog",
]);

/** A backlog item id: two or more letters, a hyphen, digits. `ST-014`, `EP-7`, `PROJ-1234`. */
const ID = /\b([A-Z]{2,})-(\d+)\b/;

/** Systems whose name in the reference is enough to know this run cannot reach them. */
const EXTERNAL_SYSTEMS = [
  [/\bgithub\b/i, "GitHub"],
  [/\bgitlab\b/i, "GitLab"],
  [/\bjira\b/i, "Jira"],
  [/\blinear\b/i, "Linear"],
  [/\bbitbucket\b/i, "Bitbucket"],
  [/\bazure\s*devops\b|\bado\b/i, "Azure DevOps"],
];

/**
 * Which kind of reference this is, decided from the text alone.
 *
 * Deliberately independent of the filesystem. If classification consulted the repository, two
 * commands reading the same plan could disagree about what a reference even IS before either had
 * resolved anything, and the seam would have reintroduced the divergence it exists to prevent.
 */
export function classifyReference(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return { kind: "unrecognised", id: null, system: null };

  // A URL is conclusive: whatever it points at, it is not a file in this repository.
  const url = text.match(/https?:\/\/([^/\s)]+)/i);
  if (url) {
    const named = EXTERNAL_SYSTEMS.find(([re]) => re.test(text) || re.test(url[1]));
    return { kind: "external", id: null, system: named ? named[1] : url[1] };
  }

  const named = EXTERNAL_SYSTEMS.find(([re]) => re.test(text));
  if (named) return { kind: "external", id: null, system: named[1] };

  // `#5` is an issue number in every tracker that uses them and is never a backlog id.
  if (/#\d+/.test(text)) return { kind: "external", id: null, system: "issue tracker" };

  const id = text.match(ID);
  if (id) return { kind: "local-id", id: `${id[1].toUpperCase()}-${id[2]}`, system: null };

  return { kind: "unrecognised", id: null, system: null };
}

/**
 * Find the repository's backlog, if it has one.
 *
 * A layout counts only when it actually contains an id-shaped file. An empty `backlog/` directory is
 * not an authority, and treating it as one would turn every reference into `missing` — the wall of
 * red this item exists to remove, produced by a different route.
 *
 * `searched` is returned whether or not anything was found, because a discovery that cannot say
 * where it looked is indistinguishable from one that looked nowhere.
 */
export function discoverBacklog(root) {
  for (const dir of BACKLOG_LAYOUTS) {
    const full = path.join(root, dir);
    if (!existsSync(full)) continue;
    let entries;
    try {
      entries = readdirSync(full);
    } catch {
      continue; // unreadable is not "absent", but it is equally not an authority this run can use
    }
    if (entries.some((f) => f.endsWith(".md") && ID.test(path.basename(f, ".md")))) {
      return { dir, searched: [...BACKLOG_LAYOUTS] };
    }
  }
  return { dir: null, searched: [...BACKLOG_LAYOUTS] };
}

/**
 * Resolve one reference against a discovered backlog.
 *
 * Returns `{ outcome, id, system, path, reason }`. `path` is set only for `resolved`, and the file
 * is deliberately NOT read here: the caller owns reading, so the item passes through the same read
 * accounting as every other file the run opens and cannot slip past the evidence budget.
 */
export function resolveTracked(raw, { root, backlog }) {
  const { kind, id, system } = classifyReference(raw);

  if (kind === "external") {
    return {
      outcome: OUTCOME.unverifiable,
      id: null,
      system,
      path: null,
      reason: `the reference names ${system}, which this run does not contact`,
    };
  }

  if (kind === "unrecognised") {
    return {
      outcome: OUTCOME.unverifiable,
      id: null,
      system: null,
      path: null,
      reason: "the reference names no system this run can resolve",
    };
  }

  if (!backlog.dir) {
    // Id-shaped, and nothing to ask. Saying `missing` here would assert absence from an authority
    // that does not exist; the honest answer is that no authority was available.
    return {
      outcome: OUTCOME.unverifiable,
      id,
      system: null,
      path: null,
      reason: `no backlog was found in this repository (searched ${backlog.searched.join(", ")})`,
    };
  }

  const file = path.join(root, backlog.dir, `${id}.md`);
  if (!existsSync(file)) {
    return {
      outcome: OUTCOME.missing,
      id,
      system: null,
      path: null,
      reason: `${backlog.dir} exists and does not contain ${id}.md`,
    };
  }

  return { outcome: OUTCOME.resolved, id, system: null, path: file, reason: null };
}

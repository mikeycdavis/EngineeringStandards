/**
 * Path-scoped justifications ([ADR 0016](../artifacts/adr/0016-path-scoped-justification-is-not-an-exception.md)).
 *
 * A justification records that ONE rule is knowingly unmet at ONE exact repository path, with who
 * approved it, why, what decision carries it, and what condition removes it. It is not an exception
 * ([Standard 20](../standards/20-exceptions.md)): an exception waives a rule for the whole project,
 * so using one to cover a single frozen file would also waive the rule for every other file. A
 * justification is the narrower instrument and is deliberately hard to widen — a path, never a
 * pattern, never a directory, never a rule that has not been explicitly admitted below.
 *
 * This module is pure. It reads the filesystem only through the `tracked` provider the caller passes
 * in, holds no module-level mutable state (ADR 0007), and every function returns the same answer for
 * the same inputs regardless of the order the entries were written in.
 *
 * What it does NOT do: it never decides what a detector finds. Detectors observe; this module
 * subtracts a declared, validated set of paths from ONE rule's observed violating paths and reports
 * what it subtracted. Every other rule still inspects every file.
 */

import { lstatSync } from "node:fs";
import path from "node:path";
import { repositoryAvailable, trackedMatching } from "./repository.mjs";

/**
 * The rules that may be path-justified. An explicit allowlist INSIDE the engine, not policy data and
 * not a catalog flag: widening it is a code change that carries a review, which is the point. A rule
 * belongs here only when its detector reports violations per path and can therefore be subtracted
 * from without hiding anything else.
 */
export const JUSTIFIABLE_RULES = Object.freeze(["errors.no-swallowed-exceptions"]);

const WILDCARD = /[*?[\]{}]/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const DRIVE = /^[A-Za-z]:/;
const UNC = /^(\\\\|\/\/)/;

/**
 * Classify a declared path by form alone — no filesystem, no repository. Returns `null` when the
 * path is an exact, canonical, repository-relative, forward-slash file path, otherwise
 * `{ code, message }`. The codes are distinct on purpose: a wildcard and a directory are different
 * mistakes with different fixes, and one blanket "invalid path" would hide which.
 */
export function pathFormProblem(input) {
  if (typeof input !== "string" || input.length === 0) {
    return { code: "path-empty", message: "path is empty; a justification names exactly one file" };
  }
  if (CONTROL.test(input)) {
    return { code: "path-control-character", message: "path contains a control character" };
  }
  if (WILDCARD.test(input)) {
    return {
      code: "path-wildcard",
      message: `path '${input}' contains a wildcard character (* ? [ ] { }); a justification names one exact file, never a pattern`,
    };
  }
  if (UNC.test(input)) {
    return { code: "path-unc", message: `path '${input}' is a UNC path; it must be repository-relative` };
  }
  if (DRIVE.test(input)) {
    return { code: "path-drive-letter", message: `path '${input}' begins with a drive letter; it must be repository-relative` };
  }
  if (input.startsWith("/")) {
    return { code: "path-absolute", message: `path '${input}' is absolute; it must be repository-relative` };
  }
  if (input.includes("\\")) {
    return { code: "path-backslash", message: `path '${input}' contains a backslash; use forward slashes` };
  }
  const segments = input.split("/");
  if (segments.includes("..")) {
    return { code: "path-traversal", message: `path '${input}' contains a '..' segment` };
  }
  if (input.endsWith("/")) {
    return { code: "path-directory", message: `path '${input}' is a directory; a justification names a file` };
  }
  if (input !== input.trim()) {
    return {
      code: "path-non-canonical",
      message: `path ${JSON.stringify(input)} has leading or trailing whitespace; write ${JSON.stringify(input.trim())}`,
    };
  }
  const canonical = segments.filter((s) => s !== "" && s !== ".").join("/");
  if (canonical === "") {
    return { code: "path-directory", message: `path '${input}' names the repository root, not a file` };
  }
  if (canonical !== input) {
    return {
      code: "path-non-canonical",
      message: `path '${input}' is not in canonical form; write '${canonical}'`,
    };
  }
  return null;
}

/** True for an ISO calendar date that actually exists (the schema pattern alone accepts 2026-13-45). */
function isCalendarDate(value) {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * What counts as "tracked", and the basis for saying so.
 *
 * `git`: the path is in the audited root's index (`git ls-files`). When the root is not a git work
 * tree, no fallback to a guess is made silently: the caller supplies the discovered file set (the
 * engine) or the filesystem answers (the standalone policy command), and the basis is named in the
 * result so a reader can tell which question was asked.
 *
 * @param root       absolute path of the audited repository root
 * @param discovered optional iterable of repo-relative forward-slash paths the audit walk found
 */
export function trackedProvider(root, discovered = null) {
  const available = repositoryAvailable(root);
  if (available.available) {
    const listed = trackedMatching(root, []);
    if (listed.ok) {
      const set = new Set(listed.files);
      return { basis: "git-index", note: null, has: (p) => set.has(p) };
    }
  }
  const reason = available.available ? "git could not list tracked files" : available.reason;
  if (discovered) {
    const set = new Set(discovered);
    return {
      basis: "discovered-file-set",
      note: `${reason}; a path is accepted when it is a regular file in the audited file set`,
      has: (p) => set.has(p),
    };
  }
  return {
    basis: "filesystem",
    note: `${reason}; a path is accepted when it is a regular file under the root`,
    has: () => true, // existence and file-ness are established by lstat in `justificationProblems`
  };
}

/**
 * Every reason this declaration list must be rejected. An empty array means every entry is
 * well-formed, names a justifiable rule, and names a tracked regular file; it does NOT mean the
 * justifications are still needed — staleness is an evaluation-time fact (`applyJustifications`).
 *
 * @param entries  the `justifications` array of a schema-valid policy
 * @param context  `{ catalog, root, tracked }` where `tracked` is from `trackedProvider`
 * @returns        `[{ index, field, code, message }]`, ordered by entry then check
 */
export function justificationProblems(entries, { catalog, root, tracked }) {
  const problems = [];
  const seen = new Map();
  const list = Array.isArray(entries) ? entries : [];

  list.forEach((entry, index) => {
    const add = (field, code, message) => problems.push({ index, field, code, message });
    const rule = entry?.rule;

    // Rule: exactly one canonical id, known to the catalog, exemptible, and explicitly admitted.
    const known = catalog?.rules?.get(rule);
    if (!known) {
      const alias = catalog?.aliases?.get(rule);
      add(
        "rule",
        alias ? "rule-alias" : "rule-unknown",
        alias
          ? `rule '${rule}' is a legacy alias; use the canonical id '${alias}' (and note that only ${JUSTIFIABLE_RULES.join(", ")} may be path-justified)`
          : `rule '${rule}' is not in the rule catalog`,
      );
    } else if (known.nonExemptible) {
      add("rule", "rule-non-exemptible", `rule '${rule}' is non-exemptible; it cannot be justified at any path`);
    } else if (!JUSTIFIABLE_RULES.includes(rule)) {
      add(
        "rule",
        "rule-not-justifiable",
        `rule '${rule}' may not be path-justified; the engine admits only ${JUSTIFIABLE_RULES.join(", ")}`,
      );
    }

    // Path: form first (no I/O), then existence and tracking.
    const form = pathFormProblem(entry?.path);
    if (form) {
      add("path", form.code, form.message);
    } else {
      const p = entry.path;
      let stat = null;
      try {
        stat = lstatSync(path.join(root, p));
      } catch (error) {
        stat = { missing: error.code ?? "unreadable" };
      }
      if (stat.missing) {
        add("path", "path-nonexistent", `path '${p}' does not exist under the audited root (${stat.missing})`);
      } else if (stat.isDirectory()) {
        add("path", "path-directory", `path '${p}' resolves to a directory; a justification names a file`);
      } else if (!stat.isFile()) {
        add("path", "path-not-regular-file", `path '${p}' is not a regular file`);
      } else if (!tracked.has(p)) {
        add(
          "path",
          "path-untracked",
          tracked.basis === "git-index"
            ? `path '${p}' is not a tracked file in this repository (not in 'git ls-files')`
            : `path '${p}' is not in the audited file set (${tracked.note})`,
        );
      }
    }

    // Duplicates are by (rule, path), and only well-formed pairs can be compared.
    if (typeof rule === "string" && typeof entry?.path === "string") {
      const key = `${rule}\u0000${entry.path}`;
      if (seen.has(key)) {
        add("path", "duplicate", `duplicates justifications[${seen.get(key)}] (same rule and path)`);
      } else {
        seen.set(key, index);
      }
    }

    for (const field of ["reason", "approvedBy", "reference", "removeWhen"]) {
      const value = entry?.[field];
      if (typeof value !== "string" || value.trim() === "") {
        add(field, `empty-${field}`, `${field} is required and must not be empty`);
      }
    }
    if (!isCalendarDate(entry?.approvedAt)) {
      add("approvedAt", "approved-at-invalid", `approvedAt '${entry?.approvedAt}' is not a real YYYY-MM-DD date`);
    }
  });

  return problems;
}

/** The justifications that name this rule, as a stable (path-sorted) list. */
function forRule(entries, rule) {
  return entries
    .filter((e) => e.rule === rule)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Subtract justified paths from what each rule's detector observed.
 *
 * @param entries       validated justification entries (any order)
 * @param observations  Map<ruleId, { violating: string[], examined: Iterable<string>, unreadable: Iterable<string> }>
 *                      `violating`: every path the detector found in violation, before any subtraction.
 *                      `examined`:  every path the detector actually looked at this run.
 *                      `unreadable`: paths it was asked to look at and could not.
 * @returns `{ remaining, applied, stale, unverified }`, every list sorted by (rule, path):
 *   remaining   Map<ruleId, string[]> — violating paths still unjustified
 *   applied     entries whose path really did violate the rule, and was therefore subtracted
 *   stale       entries whose path was examined and does NOT violate the rule (or was never examined)
 *   unverified  entries whose path could not be read this run — neither applied nor shown stale
 *
 * Order independence is structural: the result is built from sets and sorted at the end, so
 * `[a, b]` and `[b, a]` produce byte-identical output.
 */
export function applyJustifications(entries, observations) {
  const remaining = new Map();
  const applied = [];
  const stale = [];
  const unverified = [];

  for (const rule of [...observations.keys()].sort()) {
    const seen = observations.get(rule);
    const violating = new Set(seen.violating);
    const examined = new Set(seen.examined);
    const unreadable = new Set(seen.unreadable);
    const justifiedPaths = new Set();

    for (const entry of forRule(entries, rule)) {
      if (violating.has(entry.path)) {
        applied.push(entry);
        justifiedPaths.add(entry.path);
      } else if (unreadable.has(entry.path)) {
        unverified.push({ ...entry, why: "the path could not be read this run, so the justification was neither used nor shown to be unneeded" });
      } else if (examined.has(entry.path)) {
        stale.push({ ...entry, why: "no violation of this rule was observed at this path; the justification is no longer needed" });
      } else {
        stale.push({
          ...entry,
          why: "this rule did not examine the path in this run (not a file the rule reads, or outside the audited file set)",
        });
      }
    }
    remaining.set(
      rule,
      [...violating].filter((p) => !justifiedPaths.has(p)).sort(),
    );
  }
  return { remaining, applied, stale, unverified };
}

/** The report shape for one applied justification. Kept in one place so every surface agrees. */
export function justifiedRecord(entry) {
  return {
    rule: entry.rule,
    path: entry.path,
    reason: entry.reason,
    reference: entry.reference,
    approvedBy: entry.approvedBy,
    approvedAt: entry.approvedAt,
    removeWhen: entry.removeWhen,
  };
}

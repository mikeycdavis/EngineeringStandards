// FROZEN COPY of the pre-ST-24 plan reader and fence walk, for the differential test only
// (test/plan-reader.test.mjs). Source: scripts/standards.mjs `detectPlanDiscrepancies` (the inline plan-file
// test, the read loop and the executable filter) and `conflictGroups` / `FENCE_OPEN` at develop d88c694.
// Do not edit and do not import any of it from product code: the point is that it does not move.
import { parsePlanItems } from "../../../scripts/standards.mjs";

/** The inline plan-file test, as `detectPlanDiscrepancies` and `ownership.mjs` each spelled it. */
export const LEGACY_PLAN_FILE = /^artifacts\/project-plan-breakdown\/.+\.md$/;

/**
 * What `detectPlanDiscrepancies` derived inline: plan files, the unread ones, the items of the read ones,
 * and the `Status` filter. `truncated` is added for comparison only: the old code did not collect it, but
 * `run.truncated` was the thing it would have consulted.
 */
export function legacyReadPlan(files, run) {
  const planFiles = files.filter((f) => LEGACY_PLAN_FILE.test(run.rel(f)));
  const unreadable = planFiles
    .filter((f) => !run.textOf(f).available)
    .map((f) => ({ file: run.rel(f), reason: run.textOf(f).reason }));
  const items = planFiles
    .filter((f) => run.textOf(f).available)
    .flatMap((f) => parsePlanItems(run.textOf(f).text, run.rel(f)));
  const executable = items.filter((i) => i.fields.has("Status"));
  const truncated = planFiles.filter((f) => run.textOf(f).available && run.truncated.has(f)).map((f) => run.rel(f));
  return { planFiles, items, executable, unreadable, truncated };
}

const CONFLICT_OPEN = /^<{7}(?!<)/;
const CONFLICT_BASE = /^\|{7}(?!\|)/;
const CONFLICT_SEP = /^={7}(?!=)\s*$/;
const CONFLICT_END = /^>{7}(?!>)/;
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Line numbers of every conflict-marker group in a file, ignoring fenced regions where the file
 * type has them.
 *
 * Returns one entry per complete group. An opener with no terminator is not reported: it is either
 * prose or a file so damaged that a marker group is the least of it, and reporting partial groups
 * would reintroduce the token-level matching this check exists to avoid.
 */
export function legacyConflictGroups(text, fenced) {
  const lines = text.split(/\r?\n/);
  const groups = [];
  let fence = null; // the opening run, when inside a fenced block
  // `open` and `sep` deliberately survive a fenced block rather than resetting at its edge. A real
  // conflict region can contain a fence -- the merge cut through a code example -- and pairing
  // across it catches that case. The cost is theoretical: two column-0 marker lines of opposite
  // kinds, in prose, on either side of a block.
  let open = null;
  let sep = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (fenced) {
      const f = line.match(FENCE_OPEN);
      if (fence !== null) {
        // Closing requires the same character and at least the opening length; anything else is
        // ordinary content inside the block, and out of scope.
        if (f && f[1][0] === fence[0] && f[1].length >= fence.length) fence = null;
        continue;
      }
      // A fence line is never itself a marker. Everything else outside a block falls through to
      // the matching below, which is where the `8870a43` specimen lived: immediately after a
      // closing fence, not inside one.
      if (f) {
        fence = f[1];
        continue;
      }
    }
    if (CONFLICT_OPEN.test(line)) {
      open = i + 1;
      sep = null;
      continue;
    }
    if (open === null) continue;
    // The diff3 style inserts a common-ancestor section between the opener and the separator. It is
    // consumed rather than treated as a reset, so `merge.conflictStyle=diff3` is covered.
    if (CONFLICT_BASE.test(line)) continue;
    if (CONFLICT_SEP.test(line)) {
      sep = i + 1;
      continue;
    }
    if (sep !== null && CONFLICT_END.test(line)) {
      groups.push({ open, end: i + 1 });
      open = null;
      sep = null;
    }
  }
  return groups;
}


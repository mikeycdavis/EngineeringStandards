// FROZEN COPY of the pre-ST-20 plan grammar, for the differential test only (test/plan-grammar-differential.test.mjs).
// Source: scripts/standards.mjs (FIELD_SEPARATOR .. parsePlanItems) and scripts/ownership.mjs (FIELD_ATTEMPT ..
// collectPlanClaims) at develop 77687ba. Do not edit and do not import from product code: the point is that it does not move.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const PLAN_DIR = "artifacts/project-plan-breakdown";
const MAPPING = "artifacts/backlog/github-mapping.json";
const FIELD_SEPARATOR = " — ";
const PLAN_FIELDS = ["Status", "Purpose", "Deliverables", "Acceptance Criteria", "Verification", "Dependencies"];

/**
 * Every key any consumer reads. `Tracked by` is here and not in PLAN_FIELDS because it is optional,
 * but losing it is worse than losing an optional field: it is the disclosure that an item's status
 * is a cached copy of an authority nobody consulted, and without it that status reads as established.
 */
const READABLE_FIELDS = new Set([...PLAN_FIELDS, "Tracked by", "TrackedBy"]);

/** A well-formed field line, unchanged from the form every existing plan already uses. */
const FIELD_LINE = /^\s*-\s+\*\*([^:*]+):\*\*\s*(.*)$/;

/**
 * A bullet that OPENS a bold run. Deliberately looser than FIELD_LINE in three ways, because its
 * job is to notice a field that was written wrongly rather than to read one: `*` bullets count,
 * no closing `**` is required, so a label wrapped across two source lines is still seen.
 */
const BOLD_OPEN = /^\s*[-*]\s+\*\*(.*)$/;

/**
 * A separator that was attempted and missed. An em or en dash is never intra-word, so it is always
 * an attempt at structure; a plain hyphen usually is intra-word, so it counts only when whitespace
 * surrounds it. That distinction is the whole reason `Acceptance Criteria-ish` stays an ordinary
 * unknown key while `Acceptance Criteria - amended` is reported as a malformed separator.
 */
const NEAR_SEPARATOR = /^(?:\s*[–—]\s*|\s+-\s+)/;

/** The text before the first separator. The qualifier after it is for people, and is discarded. */
function canonicalFieldKey(label) {
  const at = label.indexOf(FIELD_SEPARATOR);
  return (at === -1 ? label : label.slice(0, at)).trim();
}

/**
 * Did this label mean to name `key` and miss the separator? Returns the intended key or null.
 * Exact prefix, then a dash where the separator belongs — never a fuzzy resemblance.
 */
function intendedKey(label) {
  const trimmed = label.trim();
  for (const field of READABLE_FIELDS) {
    if (!trimmed.startsWith(field)) continue;
    const rest = trimmed.slice(field.length);
    if (rest.trim() !== "" && NEAR_SEPARATOR.test(rest)) return field;
  }
  return null;
}

/**
 * Parse `### Title` items and their field lines out of a plan-breakdown file.
 *
 * Each item also carries `syntax`: labels that were trying to be a field and failed. That list is
 * the point of the reader rather than a by-product. Before it existed, a malformed label was
 * indistinguishable from an absent field, and the three ways that went wrong all reported something
 * untrue — a qualified `Status` removed the item from evaluation entirely and said nothing, a
 * qualified required field produced "(no Acceptance Criteria)" against an item that visibly had one,
 * and a qualified `Tracked by` deleted the cached-status disclosure so a delegated status read as
 * established. Rejecting malformed syntax is right; converting it into absence is not.
 */
export function legacyParsePlanItems(text, file) {
  const items = [];
  let current = null;
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const heading = line.match(/^###\s+(.*)$/);
    if (heading) {
      if (current) items.push(current);
      current = { title: heading[1].trim(), file, fields: new Map(), syntax: [] };
      continue;
    }
    if (!current) continue;
    const lineNumber = index + 1;

    const field = line.match(FIELD_LINE);
    if (field) {
      const label = field[1].trim();
      const key = canonicalFieldKey(label);
      if (READABLE_FIELDS.has(key)) {
        // First occurrence wins. Canonicalisation makes two labels able to collide where the raw
        // strings could not, and silently overwriting one with the other would let a qualified
        // duplicate replace the field a reader can see.
        if (current.fields.has(key)) {
          current.syntax.push({ line: lineNumber, key, kind: "duplicate", label });
        } else {
          current.fields.set(key, field[2].trim());
        }
        continue;
      }
      const intended = intendedKey(label);
      if (intended) current.syntax.push({ line: lineNumber, key: intended, kind: "separator", label });
      // An unknown key is not an error. `Evidence` is a house convention on most items here, and a
      // label nothing reads is a label nothing reads — it is stored exactly as before.
      else current.fields.set(label, field[2].trim());
      continue;
    }

    const bold = line.match(BOLD_OPEN);
    if (!bold) continue;
    // Strip a closing `**` and a trailing colon, so `- **Status**:` and `* **Status:**` are seen as
    // broken field syntax rather than read as ordinary prose.
    const label = bold[1].split("**")[0].replace(/:\s*$/, "");
    const key = canonicalFieldKey(label);
    const intended = READABLE_FIELDS.has(key) ? key : intendedKey(label);
    if (intended) current.syntax.push({ line: lineNumber, key: intended, kind: "syntax", label: label.trim() });
  }
  if (current) items.push(current);
  return items;
}

const FIELD_ATTEMPT = /^\s*[-*]\s+\*\*(?![^*]*:\/\/)[^*[\]]*?(?::\*\*|\*\*\s*:)/;

/**
 * The field names scripts/standards.mjs reads (its PLAN_FIELDS and `Tracked by`). `parsePlanItems` reports a
 * bold bullet naming one of them as malformed field syntax even with no colon (`- **Purpose** x`) or with the
 * label wrapped across lines (`- **Purpose`), so ownership ends the value there too. Mirrors that list; the
 * canonical module does not export it.
 */
const PLAN_FIELD_NAMES = ["Status", "Purpose", "Deliverables", "Acceptance Criteria", "Verification", "Dependencies", "Tracked by", "TrackedBy"];

/** Does this line open a bold run that names a plan field, the way parsePlanItems' BOLD_OPEN branch reads it? */
function namesPlanField(line) {
  const bold = line.match(BOLD_OPEN);
  if (!bold) return false;
  const label = bold[1].split("**")[0].replace(/:\s*$/, "");
  const key = canonicalFieldKey(label);
  if (PLAN_FIELD_NAMES.includes(key)) return true;
  const trimmed = label.trim();
  return PLAN_FIELD_NAMES.some((name) => {
    if (!trimmed.startsWith(name)) return false;
    const rest = trimmed.slice(name.length);
    return rest.trim() !== "" && NEAR_SEPARATOR.test(rest);
  });
}

/** Any `scheme:` start; a token holding one is already inside some URL, hierarchical or not. */
const URL_SCHEME = /[A-Za-z][A-Za-z0-9+.-]*:/;

/**
 * Is the `https://github.com/...` at `index` a standalone link rather than part of a longer one? It must start
 * the value, follow whitespace, or follow the `(` of a markdown link destination (a `(` right after `]`). After any other `(`, `<`,
 * `[`, `*`, a quote, `>`, `,` or `;` it still counts, unless
 * the token it sits in already began with a URL or any `scheme:` (`https://x/?next;https://github.com/...`,
 * `data:text/plain,https://github.com/...`, `mailto:`, `urn:`): inside an
 * enclosing URL those are ordinary characters, and reading the inner link as a claim could pass a check falsely.
 * A token is a run without whitespace, so `go("<url>")` after `javascript:` is inside it too.
 * Two bare URLs joined by a separator with no space are one token, so only the first is read.
 */
function atUrlBoundary(value, index) {
  if (index === 0 || /\s/.test(value[index - 1])) return true;
  if (value[index - 1] === "(" && value[index - 2] === "]") return true; // a markdown link destination
  if (!/[(<[*"'>,;]/.test(value[index - 1])) return false;
  let start = index;
  while (start > 0 && !/\s/.test(value[start - 1])) start--;
  return !URL_SCHEME.test(value.slice(start, index));
}
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
 * is the field's line plus continuation lines, up to the next field or a blank line. A next field is
 * a line the canonical plan-field grammar reads as one (`FIELD_LINE`, indented or not) or a malformed
 * attempt at one (`FIELD_ATTEMPT`, or a bold run naming a plan field, `namesPlanField`); a bold list item that is not a field, such as `  - **<issue link>**`,
 * continues the value.
 * An issue URL counts only at a URL boundary (`atUrlBoundary`): start of value, whitespace, just after `(`,
 * `<` or `[`, or after emphasis, quoting or a separator (`*`, `"`, `'`, `>`, `,`, `;`) outside an enclosing URL.
 */
export function legacyCollectPlanClaims(root) {
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
        if (lines[j].trim() === "" || FIELD_LINE.test(lines[j]) || FIELD_ATTEMPT.test(lines[j]) || namesPlanField(lines[j]) || /^#/.test(lines[j])) break;
        value += `\n${lines[j]}`;
      }
      const seen = new Set();
      for (const m of value.matchAll(ISSUE_LINK)) {
        if (!atUrlBoundary(value, m.index)) continue;
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

// The legacy link loop, isolated so the new linear extractor can be compared with it value by value.
export function legacyExtractLinks(value) {
  const out = [];
  for (const m of value.matchAll(ISSUE_LINK)) {
    if (!atUrlBoundary(value, m.index)) continue;
    out.push({ owner: m[1], repo: m[2], issue: Number(m[3]) });
  }
  return out;
}

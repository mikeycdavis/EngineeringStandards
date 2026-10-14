/**
 * Fixture exemptions — exact path + content digest + rule (ST-19a, ADR 0020).
 *
 * A directory NAME is not an authority. The walk used to drop every directory called `fixtures`,
 * which removed whatever it held from EVERY detector at once: a deliberately violating test file and
 * a production file that happened to live under a directory of that name were indistinguishable, and
 * the run reported a surface it had not read. An exemption here is the opposite shape: it names one
 * file, pins the bytes it was reviewed at, and waives one rule. Anything that differs — another path,
 * other bytes, another rule — is inspected as ordinary content.
 *
 * Pure and stateless (ADR 0007): every function takes what it needs and returns its answer.
 *
 * THE DIGEST. SHA-256 over the file's bytes with each CRLF pair read as LF. Line-ending conversion is
 * the one transformation a checkout applies to content that Git itself regards as unmodified
 * (ADR 0011, ADR 0015): hashing raw working-tree bytes would make an entry fresh on one platform and
 * stale on another for the same commit. Every other byte change changes the digest. A lone CR, or a
 * file whose only change is LF to CRLF, is the documented consequence of this choice.
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The rules whose detector reports violations per file and routes them through
 * `run.settleFixtureHits`. A rule not listed cannot be exempted this way: its findings are not
 * attributable to one file, so an exact-path waiver would have nothing to be exact about.
 * `test/fixture-exemptions.test.mjs` pins that every member is wired.
 */
export const FIXTURE_EXEMPTIBLE_RULES = [
  "errors.no-swallowed-exceptions",
  "scm.no-committed-env-files",
  "security.no-cert-bypass",
  "security.no-secrets-in-artifacts",
  "security.no-sql-concat",
  "quality.unfinished-work",
];

const SHA256_RE = /^[0-9a-f]{64}$/;
const DATE_RE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/**
 * A calendar date that exists. `Date.parse` normalises impossible dates (2026-02-30 becomes March 2),
 * so the parsed UTC components must round-trip to the written year, month and day.
 */
function isRealDate(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
const WILDCARD_RE = /[*?]/;

/** SHA-256 hex of `bytes` with CRLF read as LF. See the module comment. */
export function contentDigest(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const out = [];
  let from = 0;
  for (let i = 0; i < buf.length - 1; i += 1) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a) {
      out.push(buf.subarray(from, i));
      from = i + 1;
    }
  }
  out.push(buf.subarray(from));
  return createHash("sha256").update(out.length === 1 ? out[0] : Buffer.concat(out)).digest("hex");
}

/**
 * Why `p` is not an exact repository-relative file path, or null when it is.
 * Canonical form: forward slashes, no leading `./` or `/`, no `.` or `..` or empty segment, no
 * trailing slash (a directory), no drive prefix, no wildcard or glob character.
 */
export function pathProblem(p) {
  if (typeof p !== "string" || p === "") return "path is empty";
  if (p !== p.trim()) return "path has leading or trailing whitespace";
  if (p.includes("\\")) return "path uses a backslash; write it with forward slashes";
  if (p.includes("\0")) return "path contains a NUL byte";
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return "path is absolute; write it relative to the repository root";
  if (p.endsWith("/")) return "path names a directory; an exemption names one file";
  if (WILDCARD_RE.test(p)) return "path contains a wildcard or glob character; an exemption names one file exactly";
  for (const segment of p.split("/")) {
    if (segment === "") return "path has an empty segment";
    if (segment === "." || segment === "..") return "path is not canonical (contains '.' or '..')";
  }
  return null;
}

/**
 * Validate the declared entries against the catalog and the calendar.
 *
 * Returns `{ valid, problems }`. A problem leaves its entry NON-APPLYING, which is the safe default:
 * the file is inspected as ordinary content. Nothing here throws, so an adopter's typo is reported
 * rather than turned into a crash or, worse, a silently honoured entry.
 *
 * `catalog` may be null (policy.mjs tolerates a missing catalog); rule-aware checks are then skipped
 * rather than faked.
 */
export function checkEntries(entries, { catalog, today }) {
  const problems = [];
  const candidates = [];
  const list = Array.isArray(entries) ? entries : [];
  list.forEach((entry, index) => {
    const problem = (id, message) => problems.push({ index, id, path: entry?.path ?? null, rule: entry?.rule ?? null, message });
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      problem("fixture-exemption-malformed", `fixtureExemptions[${index}] is not an object`);
      return;
    }
    const before = problems.length;
    const pp = pathProblem(entry.path);
    if (pp) problem("fixture-exemption-bad-path", `${pp}`);
    if (typeof entry.sha256 !== "string" || !SHA256_RE.test(entry.sha256)) {
      problem("fixture-exemption-bad-digest", "sha256 must be 64 lower-case hexadecimal characters");
    }
    for (const field of ["reason", "owner"]) {
      if (typeof entry[field] !== "string" || entry[field].trim() === "") {
        problem("fixture-exemption-missing-field", `${field} is required and must be non-empty`);
      }
    }
    const hasExpiry = entry.expires !== undefined && entry.expires !== null;
    const hasReview = typeof entry.reviewWhen === "string" && entry.reviewWhen.trim() !== "";
    if (!hasExpiry && !hasReview) {
      problem("fixture-exemption-no-lifetime", "an expiry date (expires) or a review condition (reviewWhen) is required");
    }
    if (hasExpiry && (typeof entry.expires !== "string" || !isRealDate(entry.expires))) {
      problem("fixture-exemption-bad-expiry", "expires must be a real YYYY-MM-DD date");
    }
    // The rule must be named canonically. An alias would be a second spelling of one identity
    // (ADR 0002), and a wildcard-ish or unknown id would exempt nothing.
    if (typeof entry.rule !== "string" || entry.rule === "") {
      problem("fixture-exemption-missing-field", "rule is required");
    } else if (!FIXTURE_EXEMPTIBLE_RULES.includes(entry.rule)) {
      problem(
        "fixture-exemption-rule-not-exemptible",
        `'${entry.rule}' cannot be exempted per fixture file; exemptible rules: ${FIXTURE_EXEMPTIBLE_RULES.join(", ")}`,
      );
    } else if (catalog) {
      const rule = catalog.rules.get(entry.rule);
      if (!rule) problem("fixture-exemption-unknown-rule", `'${entry.rule}' is not a catalogued rule id`);
      else if (rule.nonExemptible) problem("fixture-exemption-non-exemptible", `'${entry.rule}' is non-exemptible (Standard 20 R4)`);
    }
    if (problems.length === before && hasExpiry && entry.expires < today) {
      problem("fixture-exemption-expired", `expired on ${entry.expires}; it no longer applies`);
    }
    if (problems.length === before) candidates.push({ ...entry, index });
  });

  // Duplicates: two entries for one (path, rule). There is no safe pick between them — which digest
  // is the reviewed one? — so every member of the group is rejected.
  const groups = new Map();
  for (const c of candidates) {
    const key = `${c.rule}\0${c.path}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const valid = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      valid.push(group[0]);
      continue;
    }
    for (const c of group) {
      problems.push({
        index: c.index,
        id: "fixture-exemption-duplicate",
        path: c.path,
        rule: c.rule,
        message: `${group.length} entries exempt ${c.rule} for ${c.path}; none applies, because nothing says which digest was reviewed`,
      });
    }
  }
  valid.sort((a, b) => a.index - b.index);
  problems.sort((a, b) => a.index - b.index);
  return { valid, problems };
}

/**
 * Bind each valid entry to the bytes actually on disk.
 *
 * `scanned` is the set of repository-relative paths the walk collected. An entry whose path is not in
 * it cannot apply — ignored by the repository, skipped as a vendored tree, or absent — and is
 * reported as such. A digest mismatch is recorded with the observed digest so the maintainer can
 * review the change and re-pin deliberately.
 *
 * Reads only the declared paths, once each, and never follows a path outside `root`.
 */
export async function bindEntries(valid, { root, scanned }) {
  const bound = [];
  for (const entry of valid) {
    const base = { ...entry, state: "unbound", observedSha256: null };
    if (!scanned.has(entry.path)) {
      bound.push({ ...base, state: "not-scanned" });
      continue;
    }
    const abs = path.resolve(root, entry.path);
    const within = path.relative(path.resolve(root), abs);
    if (within.startsWith("..") || path.isAbsolute(within)) {
      bound.push({ ...base, state: "not-scanned" });
      continue;
    }
    try {
      const observed = contentDigest(await readFile(abs));
      bound.push({ ...base, observedSha256: observed, state: observed === entry.sha256 ? "matches" : "digest-mismatch" });
    } catch {
      bound.push({ ...base, state: "unreadable" });
    }
  }
  return bound;
}

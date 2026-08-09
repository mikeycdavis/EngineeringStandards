/**
 * What counts as a claimable source section, defined once.
 *
 * WHY THIS EXISTS. A standard derived from a `reviewed-sections` source declares the `##`/`###`
 * headings it realizes, and two scripts need that definition for different jobs:
 *
 *   scripts/inventory.mjs  does the heading a standard claims actually exist in the source?
 *   scripts/fidelity.mjs   does a quote claimed as verbatim appear inside one of those sections?
 *
 * Both were written with their own hand-escaped regex, in the same commit, and that is the defect
 * Standard 51 R3 names: two implementations of one concept, each with its own escaping, guaranteed
 * to disagree the first time either is fixed. There is no shared definition to disagree with now —
 * `sectionRe` is the single answer to "which headings count", and `sectionText` is built on it, so
 * a change to the heading rule cannot reach one caller and miss the other.
 *
 * No third-party dependencies, matching the rest of scripts/.
 */

/** Escape a section name for use inside a regular expression. */
const escape = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A `##` or `###` heading whose text is exactly `name`. Anchored per line, like the item regex in
 * scripts/inventory.mjs, and multiline so it can be tested against a whole document.
 *
 * `##` and `###` only: a `#` is the document title, and a `####` is a detail inside a section rather
 * than a section a standard would claim as its provenance.
 */
export const sectionRe = (name) => new RegExp(`^#{2,3}\\s*${escape(name)}\\s*$`, "m");

/**
 * The text of one section: from its heading to the next heading at the same or a higher level.
 *
 * A `###` under a claimed `##` therefore belongs to the claim, which is what a reader would expect
 * of "the X section". Returns `null` when the heading is not present — which is a different answer
 * from an empty section, and callers must not conflate them.
 */
export function sectionText(sourceText, name) {
  const lines = sourceText.split("\n");
  const re = sectionRe(name);
  const start = lines.findIndex((l) => re.test(l));
  if (start === -1) return null;

  const level = lines[start].match(/^#+/)[0].length;
  const body = [lines[start]];
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+)\s/);
    if (m && m[1].length <= level) break;
    body.push(lines[i]);
  }
  return body.join("\n");
}

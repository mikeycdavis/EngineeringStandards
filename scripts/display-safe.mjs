/**
 * Text taken from a policy file is repository-controlled. Before it is written into a message a person
 * reads (a terminal or a CI log), control characters are replaced by visible escapes so that a crafted
 * value cannot recolour output, move the cursor or forge a line. Printable text, including non-ASCII
 * letters, is returned unchanged. JSON output is not touched here: the serializer already escapes
 * control characters.
 *
 * Beyond C0/C1 and the line/paragraph separators, the escaped set is the characters that change how text
 * is laid out or hide it without being visible: soft hyphen (U+00AD), Arabic letter mark (U+061C), Mongolian
 * vowel separator (U+180E), zero-width and directional marks (U+200B-U+200F), embedding and override
 * controls (U+202A-U+202E), word joiner and invisible operators (U+2060-U+2064), isolates (U+2066-U+2069),
 * byte order mark (U+FEFF), interlinear annotation (U+FFF9-U+FFFB) and tag characters (U+E0000-U+E007F).
 * These can reorder or conceal what a reader sees and so forge a line's appearance.
 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb\u{e0000}-\u{e007f}]/gu;

export function displaySafe(value) {
  return String(value).replace(CONTROL, (character) => {
    if (character === "\n") return "\\n";
    if (character === "\r") return "\\r";
    if (character === "\t") return "\\t";
    const code = character.codePointAt(0);
    return code > 0xffff ? `\\u{${code.toString(16)}}` : `\\u${code.toString(16).padStart(4, "0")}`;
  });
}

/**
 * Human-readable output chokepoint. A whole block of text is written with every control character
 * escaped except the line feed and the tab that lay the text out. Per-field `displaySafe` still applies
 * where one value must not be able to forge a line (it escapes the line feed too); this is the second
 * layer, so a string that reaches a terminal or CI log without its own call is still neutralised.
 * JSON output does not go through here: the serializer escapes it and its bytes must not change.
 */
export function displaySafeText(value) {
  return String(value).replace(CONTROL, (character) => {
    if (character === "\n" || character === "\t") return character;
    return displaySafe(character);
  });
}

export const humanOut = (text) => process.stdout.write(displaySafeText(text));
export const humanErr = (text) => process.stderr.write(displaySafeText(text));
export const humanLog = (text = "") => process.stdout.write(`${displaySafeText(text)}\n`);

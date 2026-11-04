/**
 * Text taken from a policy file is repository-controlled. Before it is written into a message a person
 * reads (a terminal or a CI log), control characters are replaced by visible escapes so that a crafted
 * value cannot recolour output, move the cursor or forge a line. Printable text, including non-ASCII
 * letters, is returned unchanged. JSON output goes through `jsonText` below, which keeps the parsed value
 * and escapes every character this module would escape.
 *
 * Beyond C0/C1 and the line/paragraph separators, the escaped set is the characters that change how text
 * is laid out or hide it without being visible: soft hyphen (U+00AD), Arabic letter mark (U+061C), Mongolian
 * vowel separator (U+180E), zero-width and directional marks (U+200B-U+200F), embedding and override
 * controls (U+202A-U+202E), word joiner and invisible operators (U+2060-U+2064), isolates (U+2066-U+2069),
 * byte order mark (U+FEFF), interlinear annotation (U+FFF9-U+FFFB) and tag characters (U+E0000-U+E007F).
 * These can reorder or conceal what a reader sees and so forge a line's appearance.
 *
 * ST-48 closes the classes ST-41 left open. Each is escaped, not exempted, with the reason it is:
 *   - variation selectors U+FE00-FE0F and U+E0100-E01EF: invisible, and a run of them carries hidden data
 *     after any base character (the emoji presentation selector is escaped too, which costs a legible emoji
 *     in a diagnostic and is accepted);
 *   - combining grapheme joiner U+034F: invisible, and changes how adjacent text is compared and selected;
 *   - Hangul fillers U+115F, U+1160, U+3164 and Khmer inherent vowels U+17B4, U+17B5: render as blank, so
 *     a value can look empty or equal to another;
 *   - U+2065 and the deprecated format characters U+206A-206F: unassigned or deprecated, invisible;
 *   - U+FFFC object replacement: stands for an object the terminal cannot show, so it hides a position;
 *   - lone surrogates U+D800-DFFF: not text at all, and a consumer that re-encodes them may substitute any
 *     character (a well-formed pair is one supplementary character and is not matched).
 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\u3164\ufe00-\ufe0f\ufeff\ufff9-\ufffc\ud800-\udfff\u{e0000}-\u{e007f}\u{e0100}-\u{e01ef}]/gu;

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
 * JSON output goes through `jsonText` and not through here.
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

/**
 * JSON output chokepoint (ST-48 d). `JSON.stringify` escapes C0 (inside strings; the line feeds between tokens are layout and stay), quote,
 * backslash and lone surrogates, and leaves U+007F, C1 (including U+0085) and every format and bidi character raw, so a terminal or CI log that
 * shows the JSON text can still reorder or hide it. Outside a string a JSON text holds only ASCII, so every
 * character in the escaped set lies inside a string and is replaced there by a \uXXXX escape (a surrogate pair
 * above U+FFFF). `JSON.parse` of the result is deep-equal to `JSON.parse` of the plain serialisation.
 */
const JSON_ESCAPED = new RegExp(CONTROL.source.replace("\\ud800-\\udfff", "").replace("\\u0000-\\u001f", ""), "gu");
export function jsonText(value, replacer, space) {
  const text = JSON.stringify(value, replacer, space);
  if (text === undefined) return text;
  return text.replace(JSON_ESCAPED, (character) => {
    const code = character.codePointAt(0);
    const unit = (n) => `\\u${n.toString(16).padStart(4, "0")}`;
    if (code <= 0xffff) return unit(code);
    const offset = code - 0x10000;
    return unit(0xd800 + (offset >> 10)) + unit(0xdc00 + (offset & 0x3ff));
  });
}

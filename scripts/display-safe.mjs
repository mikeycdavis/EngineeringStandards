/**
 * Text taken from a policy file is repository-controlled. Before it is written into a message a person
 * reads (a terminal or a CI log), control characters are replaced by visible escapes so that a crafted
 * value cannot recolour output, move the cursor or forge a line. Printable text, including non-ASCII
 * letters, is returned unchanged. JSON output is not touched here: the serializer already escapes
 * control characters.
 */
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/gu;

export function displaySafe(value) {
  return String(value).replace(CONTROL, (character) => {
    if (character === "\n") return "\\n";
    if (character === "\r") return "\\r";
    if (character === "\t") return "\\t";
    return `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`;
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

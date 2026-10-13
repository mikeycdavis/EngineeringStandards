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

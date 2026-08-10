// A pattern table, which is what a detector's own source looks like. Every marker below appears
// inside a regex literal: this file describes unfinished work, it does not contain any.
//
// This is the shape that reported scripts/standards.mjs as holding an unimplemented stub. The
// tokenizer had no regex mode, so `\braise NotImplementedError\b` was structural code, the word
// boundary held because a space preceded it, and the detector matched the table that defines it.
export const UNFINISHED = [
  [/\bNotImplemented(Error|Exception)?\b|\braise NotImplementedError\b|\bthrow new NotImplementedException\b/, "unimplemented stubs"],
  [/\b(it|test|describe)\.skip\(|\bxit\(|@pytest\.mark\.skip/, "skipped tests"],
];

export const ratio = (a, b) => a / b; // a real division, which must not be read as a regex

export function count() {
  return UNFINISHED.length;
}

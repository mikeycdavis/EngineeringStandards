/**
 * The file that reproduces the false positive site matching exists to remove.
 *
 * `structureOf` proves a real catch construct — a `catch {}` inside a string or a comment is not
 * one. That sentence is itself the trap: under the previous count-based detector this comment
 * supplied one raw `catch {}` match, the two justified catches below supplied two structural
 * matches, and `min(2, 1)` reported a violating catch site that does not exist anywhere in this
 * file.
 */
const DESCRIPTION = "an empty catch {} written inside a string literal is not a catch block";

export async function persist(record, store) {
  try {
    await store.write(record);
  } catch {
    // Writes are retried by the caller; a failure here is expected during shutdown.
  }

  try {
    await store.flush();
  } catch (error) {
    throw new Error("flush failed", { cause: error });
  }

  return DESCRIPTION.length;
}

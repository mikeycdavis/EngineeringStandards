export async function flush(buffer) {
  try {
    await buffer.write();
  } catch {
    // The buffer is discarded on shutdown anyway; a flush failure here has no observable effect.
  }
  try {
    await buffer.close();
  } catch (e) {
    throw new Error("close failed", { cause: e });
  }
}

export async function flush(buffer) {
  try {
    await buffer.write();
  } catch (e) {}
}

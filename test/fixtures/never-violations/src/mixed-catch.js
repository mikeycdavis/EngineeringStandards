// One justified catch and one that swallows, in the same file. Under count matching the justified
// site could mask the unjustified one; under site matching each is decided on its own body.
export async function sync(client) {
  try {
    await client.pull();
  } catch {
    // Offline is the normal case here; the next run picks up where this one stopped.
  }

  try {
    await client.push();
  } catch (error) {}
}

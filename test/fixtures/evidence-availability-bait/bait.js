// Bait for test/evidence-availability.test.mjs, kept HERE rather than inline in that test because
// this directory is exactly what those specimens are about: `test/fixtures` is excluded by name, so
// content inside it is never scanned. Inline, the SQL interpolation below is a real finding against
// this repository -- `security.no-sql-concat` reads `sourceOf`, where string contents stay intact,
// so a bait string in a test file is indistinguishable from the construct it imitates. It is not a
// use/mention question and blanking it would be evading a detector rather than satisfying it.
//
// Three rules in one file, so one specimen covers all three: certificate bypass, SQL interpolation,
// and an unreferenced export.
const https = require("https");
const agent = new https.Agent({ rejectUnauthorized: false });
function q(id) {
  return db.query(`SELECT * FROM users WHERE id = ${id}`);
}
function neverCalled() {
  return 42;
}
module.exports = { agent, q };

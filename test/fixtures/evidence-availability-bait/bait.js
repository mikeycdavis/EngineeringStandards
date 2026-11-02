// Deliberate bait for test/evidence-availability.test.mjs. Not a module this repository runs.
//
// It lives here, in a fixture directory, rather than inline in the test that uses it, because
// inline the SQL interpolation below would be a real finding against THIS repository:
// `security.no-sql-concat` reads `sourceOf`, where string contents stay intact, so bait sitting in a
// test file is indistinguishable from the construct it imitates. Blanking it would be evading the
// detector rather than satisfying it. Here it is a scanned file like any other (ST-19a); the two
// violations it carries are waived by exact path + content digest + rule in project-policy.yml.
//
// One file trips three content-derived rules at once, so one specimen covers all three:
// cert bypass, SQL interpolation, and dead code.
const https = require('https');
const agent = new https.Agent({ rejectUnauthorized: false });
function q(id) { return db.query(`SELECT * FROM users WHERE id = ${id}`); }
function neverCalled() { return 42; }
module.exports = { agent, q };

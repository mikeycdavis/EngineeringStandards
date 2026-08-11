#!/usr/bin/env node
/**
 * Run the test suite.
 *
 * `npm test` used to be `node --test "test/*.test.mjs"`, which worked on the author's machine and
 * nowhere else that mattered: Node did not learn to expand a glob passed to `--test` until 22, the
 * CI runner pins 20, and `package.json` declares `engines: >=18`. On 20 the quoted pattern is a
 * literal path, so the run died with *Could not find …/test/\*.test.mjs* before a single test
 * executed. It had been that way since the suite existed and nobody knew, because the account could
 * not start a runner — the first CI job that actually ran found it immediately.
 *
 * The unquoted form would have worked too, by accident: bash expands it on the runner and Node
 * expands it on Windows. A command whose meaning depends on which shell invoked it and which Node
 * received it is not a fixed contract, and this repository does not get to enforce reproducibility
 * on other projects while its own gate is shell-dependent.
 *
 * So the file list is computed here, explicitly, with no glob anywhere:
 *
 *   * **Top level of `test/` only.** Node's own directory discovery would match
 *     `test/fixtures/compliant/tests/routes.test.js` — a fixture, deliberately *not* a test of this
 *     repository, and excluded from the self-audit by the same reasoning ([Standard 29](../standards/29-testing.md)).
 *     Running the repository's fixtures as its suite would be the same category error one level up.
 *   * **Zero discovered files is an error, not an empty pass.** A suite that silently runs nothing
 *     and exits 0 is the false green this framework exists to prevent, and it is exactly what a
 *     glob that stops matching would produce.
 *
 * Holds no module-level run state: everything is local to `main()`, so ADR 0007's governed set is
 * unchanged by this file's existence.
 */

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXIT_INVOCATION = 2;

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dir = path.join(root, "test");

  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
    .map((entry) => path.join("test", entry.name))
    .sort();

  if (files.length === 0) {
    process.stderr.write(
      `No test files found in ${dir}.\n` +
        "A suite that runs nothing must not report success; this is exit 2 rather than a green run.\n",
    );
    process.exit(EXIT_INVOCATION);
  }

  const result = spawnSync(process.execPath, ["--test", ...files, ...process.argv.slice(2)], {
    cwd: root,
    stdio: "inherit",
  });

  if (result.error) {
    process.stderr.write(`Could not start the test runner: ${result.error.message}\n`);
    process.exit(EXIT_INVOCATION);
  }
  // A signal death has no exit status; treating it as 0 would report a killed suite as a passing one.
  process.exit(result.status ?? EXIT_INVOCATION);
}

main();

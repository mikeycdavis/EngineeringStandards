#!/usr/bin/env node
/**
 * Check a repository's declared architectural boundaries against its static import graph
 * (Standard 51 R2, ADR 0018).
 *
 *   0  a declaration exists, is internally consistent, and no observed edge departs from it
 *   1  the declaration is valid but at least one observed edge, file, subprocess site or process
 *      termination departs from it
 *   2  nothing could be checked: no architecture-boundaries.yml, or an unreadable, schema-invalid or
 *      structurally inconsistent one. This is NOT_EVALUATED, and
 *      it is deliberately not exit 0: an absent declaration establishes nothing.
 *
 * Exit 0 is a statement about the observation limits the declaration lists, and about nothing
 * outside them: it does not cover computed imports, reflection, generated code, subprocess
 * behaviour, network or data-access paths.
 *
 * Usage: node scripts/boundaries-check.mjs [--dir=<repo>] [--json]
 */

import path from "node:path";
import process from "node:process";
import { loadDeclaration, scanRepository, checkBoundaries, DECLARATION_FILE } from "./boundaries.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_NOT_EVALUATED = 2;

const args = process.argv.slice(2);
const json = args.includes("--json");
const dirArg = args.find((a) => a.startsWith("--dir="));
const root = path.resolve(dirArg ? dirArg.slice("--dir=".length) : ".");

function finish(report, exit) {
  if (json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    process.stdout.write(`Boundaries: ${report.status}\n`);
    if (report.reason) process.stdout.write(`  ${report.reason}\n`);
    for (const p of report.problems ?? []) process.stdout.write(`  declaration: ${p}\n`);
    for (const v of report.violations ?? []) process.stdout.write(`  ${v.kind}: ${v.message}\n`);
    if (report.observed) {
      process.stdout.write(
        `  observed ${report.observed.files} file(s), ${report.observed.members} member(s), ${report.observed.edges} declared edge(s)\n`,
      );
      process.stdout.write("  cannot observe: " + report.cannotObserve.map((u) => u.mechanism).join(", ") + "\n");
    }
  }
  process.exit(exit);
}

const loaded = loadDeclaration(root);
if (loaded.state === "absent") {
  finish({ status: "NOT_EVALUATED", reason: `no ${DECLARATION_FILE}; nothing declares boundaries here, so nothing was checked` }, EXIT_NOT_EVALUATED);
}
if (loaded.state === "invalid") {
  finish({ status: "NOT_EVALUATED", reason: `${DECLARATION_FILE} is invalid`, problems: loaded.errors }, EXIT_NOT_EVALUATED);
}
const declaration = loaded.declaration;

const scan = scanRepository(root, declaration);
const violations = checkBoundaries(root, declaration, scan);
finish(
  {
    status: violations.length === 0 ? "OK" : "VIOLATIONS",
    violations,
    observed: { files: scan.files.length, members: declaration.members.length, edges: declaration.edges.length },
    cannotObserve: declaration.observation.cannotObserve,
  },
  violations.length === 0 ? EXIT_OK : EXIT_FINDINGS,
);

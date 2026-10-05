import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODES, plan, render } from "../scripts/init.mjs";

/**
 * Issue #9 (ST-03): `--mode` is the only override for a decision the tool itself labels INFERRED,
 * and `--help` did not mention it. The issue has no numbered criteria; these tests assert its
 * Expected section plus the acceptance test the plan breakdown already states for #9 (every flag
 * the parser accepts appears in the help text).
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "..", "scripts", "standards.mjs");
const help = () => spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });

test("--help names --mode, every accepted value, init-only scope and the confidence it records", () => {
  const r = help();
  assert.equal(r.status, 0);
  const modeLine = r.stdout.split("\n").findIndex((l) => l.includes("--mode="));
  assert.ok(modeLine >= 0, "--help must name --mode");
  // The entry spans its continuation lines; read from the flag to the next flag or blank line.
  const lines = r.stdout.split("\n");
  let end = modeLine + 1;
  while (end < lines.length && lines[end].startsWith("                 ")) end++;
  const entry = lines.slice(modeLine, end).join("\n");
  for (const value of Object.values(MODES)) assert.ok(entry.includes(value), `--mode entry must name ${value}`);
  assert.match(entry, /init only/);
  assert.match(entry, /CONFIRMED_BY_OWNER/);
  assert.match(entry, /INFERRED/);
});

test("every flag the argument parser accepts appears in --help", async () => {
  const source = await readFile(CLI, "utf8");
  const accepted = new Set(
    [...source.matchAll(/argv\s*\.\s*(?:includes|find|filter)\(\s*(?:\(a\)\s*=>\s*a\.startsWith\()?\s*"(--[a-z][a-z-]*)=?"/g)].map((m) => m[1]),
  );
  // The parser is the source of truth: if this set shrinks to nothing the extraction broke.
  for (const flag of ["--json", "--strict", "--dir", "--dry-run", "--mode", "--force-overwrite", "--max-total-read-bytes"]) {
    assert.ok(accepted.has(flag), `extraction missed ${flag}; the parser scan is no longer trustworthy`);
  }
  const text = help().stdout;
  for (const flag of accepted) assert.ok(text.includes(flag), `parser accepts ${flag} but --help does not name it`);
});

test("init names the --mode override when the mode is INFERRED, and not when it was given", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-mode-help-"));
  try {
    await writeFile(path.join(dir, "package.json"), "{}\n", "utf8");
    const inferred = render(await plan(dir, {}), { dryRun: true });
    assert.match(inferred, /\[INFERRED\]/);
    const lines = inferred.split("\n");
    const modeAt = lines.findIndex((l) => l.includes("Mode:"));
    const hintAt = lines.findIndex((l) => l.includes("--mode="));
    assert.ok(hintAt > modeAt, "the override must be named after the Mode line");
    assert.ok(lines.slice(modeAt, hintAt).some((l) => l.includes("no plan or original prompt found")), "the hint must sit after the evidence it corrects, not before it");
    assert.ok(lines.slice(modeAt, hintAt + 1).every((l) => l.trim() !== ""), "the hint must be in the same block as the mode and evidence");
    for (const value of Object.values(MODES)) assert.ok(lines[hintAt].includes(value), `the hint must name ${value}`);

    const given = render(await plan(dir, { mode: MODES.GREENFIELD }), { dryRun: true });
    assert.match(given, /\[CONFIRMED_BY_OWNER\]/);
    assert.ok(!given.includes("--mode=<"), "an explicit override needs no hint to override itself");
    assert.ok(!given.split("\n").some((l) => l.includes("override") && l.includes("--mode")), "no override hint when already confirmed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the CLI's readable init output carries the hint end to end; --json is unchanged", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "standards-mode-help-"));
  try {
    await writeFile(path.join(dir, "package.json"), "{}\n", "utf8");
    const run = (extra) => spawnSync(process.execPath, [CLI, "init", dir, "--dry-run", ...extra], { encoding: "utf8" });
    assert.match(run([]).stdout, /--mode=<greenfield\|existing-with-plan\|reconstruction-required>/);
    assert.ok(!run(["--mode=reconstruction-required"]).stdout.includes("--mode=<"));
    const json = JSON.parse(run(["--json"]).stdout);
    assert.equal(json.modeConfidence, "INFERRED");
    assert.ok(!JSON.stringify(json).includes("--mode=<"), "the structured report must not change shape");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

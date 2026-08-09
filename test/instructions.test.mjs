import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPolicy } from "../scripts/policy.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");
const GUIDE = path.join(ROOT, "INSTRUCTIONS.md");
const TODAY = "2026-08-08";

const read = (p) => readFile(p, "utf8");

// --- The templates an adopter copies must work -------------------------------------------------

test("every template policy validates against the real schema", async () => {
  // An adopter's first command is validating the policy they copied. A template that fails it
  // teaches them the framework is broken before they have used any of it.
  const templates = (await readdir(path.join(ROOT, "templates")))
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"));
  assert.ok(templates.length > 0, "no policy template found");

  for (const name of templates) {
    const result = await checkPolicy(path.join(ROOT, "templates", name), SCHEMA, TODAY);
    assert.deepEqual(result.errors, [], `templates/${name} does not validate`);
    assert.deepEqual(result.aliases, [], `templates/${name} contains legacy rule IDs`);
  }
});

test("the policy template uses only canonical rule IDs", async () => {
  const text = await read(path.join(ROOT, "templates/project-policy.yml"));
  // A camelCase key in the template would seed every adopting project with the form ADR 0002
  // abolished — and the comments are copied along with the keys.
  const uncommented = text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  const keys = [...uncommented.matchAll(/^\s{2}([A-Za-z][\w.-]*):/gm)].map((m) => m[1]);
  const ruleKeys = keys.filter((k) => k.includes("."));
  assert.ok(ruleKeys.length > 0, "template declares no rules");
  for (const key of ruleKeys) {
    assert.match(key, /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/, `non-canonical rule ID: ${key}`);
  }
});

// --- The agent bootstrap templates (Standard 17) -------------------------------------------------

test("every template init writes actually exists", async () => {
  // init reads its templates at apply() time, so a missing one is a crash in an adopter's
  // repository, half-bootstrapped. Parsed from the source rather than imported because ARTIFACTS
  // is deliberately private.
  const src = await read(path.join(ROOT, "scripts/init.mjs"));
  const templates = [...src.matchAll(/template:\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(templates.length >= 4, "init declares fewer templates than expected — has the list moved?");
  for (const t of templates) {
    assert.ok(existsSync(path.join(ROOT, t)), `init writes a missing template: ${t}`);
  }
});

test("a bootstrap document is shorter than the standard it routes to", async () => {
  // Standard 17 R2's own test, made mechanical: an instruction file should get SHORTER as the
  // standards grow. A template longer than Standard 17 itself is duplicating rather than routing,
  // which is the failure that makes the copy authoritative in practice.
  const standard = (await read(path.join(ROOT, "standards/17-agent-instruction-files.md"))).length;
  for (const name of ["AGENTS.md", "CLAUDE.md"]) {
    const template = (await read(path.join(ROOT, "templates", name))).length;
    assert.ok(
      template < standard,
      `templates/${name} (${template} bytes) is longer than the standard it points at (${standard})`,
    );
  }
});

test("the agent template routes to every canonical source in the load sequence", async () => {
  // Standard 17 R3 is a load sequence, not a checklist: each step tells the agent what to read
  // next. A template missing a step sends an agent to the standards without knowing which version
  // or which exceptions apply.
  const text = await read(path.join(ROOT, "templates/AGENTS.md"));
  for (const source of [
    "PROJECT.md",
    "project-policy.yml",
    "standardVersion",
    "standards/",
    "artifacts/project-plan-breakdown/",
    "artifacts/adr/",
  ]) {
    assert.ok(text.includes(source), `templates/AGENTS.md never routes to ${source}`);
  }
  // R5, and the one repetition Standard 17 endorses, because it is routing rather than restatement.
  assert.match(text, /never rely on chat history/i);
  // R4: when the two disagree the standard wins. Without this an adopter's edits quietly become
  // a competing definition.
  assert.match(text, /the standard governs/i);
});

test("CLAUDE.md defers to AGENTS.md instead of copying it", async () => {
  // The fork Standard 17 R2 prohibits, one level down: two instruction files carrying the same
  // content drift apart, and nothing records which one an agent actually followed.
  const claude = await read(path.join(ROOT, "templates/CLAUDE.md"));
  const agents = await read(path.join(ROOT, "templates/AGENTS.md"));
  assert.match(claude, /AGENTS\.md/, "CLAUDE.md never points at AGENTS.md");
  assert.ok(
    claude.length < agents.length,
    "CLAUDE.md is not smaller than AGENTS.md — it is carrying content rather than deferring",
  );
  // The load sequence lives in exactly one file. Its steps must not be restated here.
  for (const step of ["artifacts/project-plan-breakdown/", "artifacts/adr/", "standardVersion"]) {
    assert.ok(!claude.includes(step), `CLAUDE.md restates the load sequence: ${step}`);
  }
});

// --- The adoption guide must describe things that exist -----------------------------------------

test("every path the guide references exists", async () => {
  const text = await read(GUIDE);
  const targets = [...text.matchAll(/\]\((?!https?:)([^)#\s]+)/g)].map((m) => m[1]);
  assert.ok(targets.length > 0);
  for (const target of targets) {
    assert.ok(existsSync(path.join(ROOT, target)), `INSTRUCTIONS.md references missing path: ${target}`);
  }
});

test("every script the guide tells an adopter to run exists", async () => {
  // Standard 32 R3: a documented command that does not exist is a defect, not stale prose. This is
  // the check that stops the adoption recipe rotting into one.
  const text = await read(GUIDE);
  const scripts = [...text.matchAll(/scripts\/([\w.-]+\.mjs)/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 2, "the guide names no scripts — has the recipe changed?");
  for (const script of new Set(scripts)) {
    assert.ok(existsSync(path.join(ROOT, "scripts", script)), `guide names missing script: ${script}`);
  }
});

test("the guide names every subcommand the CLI implements", async () => {
  // This test previously fired when only `audit` shipped and asserted the guide said so. It fired
  // for real when `validate` landed (ADR 0004), which is what it was for: the guide had to be
  // updated in the same change set (Standard 42 R2). It now guards both commands.
  const cli = await read(path.join(ROOT, "scripts/standards.mjs"));
  const commands = [...cli.matchAll(/COMMANDS = new Set\(\[([^\]]+)\]\)/g)]
    .flatMap((m) => [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]));
  assert.ok(commands.length >= 2, "expected the CLI to declare its commands in one place");

  const guide = await read(GUIDE);
  for (const command of commands) {
    assert.match(
      guide,
      new RegExp(`standards\.mjs ${command}`),
      `the CLI implements \`${command}\` but the guide never shows it`,
    );
  }
});

test("the guide tells an adopter which command to gate CI on", async () => {
  // Two commands with different exit-code contracts is a trap unless the guide is explicit about
  // which one is the gate (ADR 0004).
  const guide = await read(GUIDE);
  assert.match(guide, /gate .{0,40}`?validate`?/i);
});

test("the guide covers every section the adoption standard requires", async () => {
  const text = await read(GUIDE);
  for (const heading of [
    "What this repository is",
    "Declaring the standards version",
    "Adding `project-policy.yml`",
    "Validating the policy",
    "Running the audit",
    "Classifying required / not-applicable / exception",
    "Bootstrapping — `standards init`",
    "Onboarding an existing project",
    "The adoption decision flow",
    "Reconstruction mode",
    "Required artifacts and directories",
    "How agents should read the standards",
    "Planning",
    "Architecture decision records",
    "Documentation and `/codebase-docs`",
    "Upgrading to a newer standards version",
    "What not to do",
  ]) {
    assert.ok(text.includes(heading), `INSTRUCTIONS.md is missing the section: ${heading}`);
  }
});

test("the guide prohibits copying the standards into a consuming repository", async () => {
  // Standard 22 R6's strongest requirement. A copied standard is a fork with no merge.
  const text = await read(GUIDE);
  assert.match(text, /Do not copy the standards/i);
});

test("the guide states the tooling's current limitations", async () => {
  // An adopter who discovers by experience that the validator ignores their policy has been misled
  // by omission (Standard 22 R6).
  const text = await read(GUIDE);
  assert.match(text, /Current limitations/i);

  // The section must carry concrete gaps, not a reassuring heading over an empty table.
  const section = text.slice(text.indexOf("Current limitations"));
  const rows = [...section.matchAll(/^\| [^|-].*\|.*\|$/gm)];
  assert.ok(rows.length >= 3, "the limitations section lists almost nothing — is it still honest?");

  // And it must not still claim a limitation that has been closed. This guards the direction a
  // documentation check usually misses: prose that was true when written and now understates the
  // tooling is as wrong as prose that overstates it (Standard 32 R3).
  const cli = await read(path.join(ROOT, "scripts/standards.mjs"));
  if (/loadProjectPolicy/.test(cli)) {
    assert.doesNotMatch(
      section,
      /audit does not read `project-policy\.yml`/,
      "the audit reads the policy now; the limitations table is stale",
    );
  }
});

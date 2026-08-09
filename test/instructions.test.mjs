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

test("the guide names the subcommand the CLI actually implements", async () => {
  // Standard 23 R2 specifies `standards validate`; the tool ships `standards audit`. The guide must
  // track the implementation, and this test fails when the rename lands — deliberately, so the
  // guide is updated in the same change set (Standard 42 R2).
  const cli = await read(path.join(ROOT, "scripts/standards.mjs"));
  const implementsAudit = /"audit"/.test(cli);
  const implementsValidate = /"validate"/.test(cli);
  const guide = await read(GUIDE);

  assert.ok(implementsAudit || implementsValidate, "the CLI implements neither subcommand");
  if (implementsAudit && !implementsValidate) {
    assert.match(guide, /standards\.mjs audit/, "guide should show `audit` while that is what ships");
  }
  if (implementsValidate) {
    assert.match(guide, /standards\.mjs validate/, "the CLI now implements `validate`; update the guide");
  }
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
    "Bootstrapping a greenfield project",
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
  assert.match(text, /does not read `project-policy\.yml`/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkPolicy, LEGACY_ALIASES } from "../scripts/policy.mjs";
import { parseYaml, YamlError } from "../scripts/yaml.mjs";
import { validate, assertSchemaSupported, SchemaError } from "../scripts/jsonschema.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");
const FIXTURES = path.join(ROOT, "test/fixtures/policies");
const TODAY = "2026-08-08";

const fixture = (name) => path.join(FIXTURES, `${name}.yml`);
const check = (name) => checkPolicy(fixture(name), SCHEMA, TODAY);

// --- Known-positive ---------------------------------------------------------------------------

test("this repository's own policy is valid", async () => {
  const result = await checkPolicy(path.join(ROOT, "project-policy.yml"), SCHEMA, TODAY);
  assert.deepEqual(result.errors, [], "schema errors in the repository's own policy");
  assert.deepEqual(result.findings, []);
  assert.equal(result.status, "ok");
});

test("a well-formed example policy validates", async () => {
  const result = await check("valid");
  assert.deepEqual(result.errors, []);
  assert.equal(result.status, "ok");
});

test("the compliant example exercises every section", async () => {
  const result = await check("valid");
  for (const section of ["rules", "applicability", "exceptions"]) {
    assert.ok(result.document[section], `example policy does not exercise '${section}'`);
  }
});

// --- Known-negative ---------------------------------------------------------------------------

test("a malformed policy is rejected, and every distinct violation is reported", async () => {
  const result = await check("invalid-shape");
  assert.equal(result.status, "invalid");
  const paths = result.errors.map((e) => e.path);
  assert.ok(paths.includes("standardVersion"), "bad version not caught");
  assert.ok(paths.includes("rules.planning.acceptance-criteria.level"), "bad level not caught");
  assert.ok(paths.includes("rules.planning.verification.level"), "missing level not caught");
  assert.ok(paths.includes("rules.planning.verification.severity"), "unknown property not caught");
  assert.ok(paths.includes("applicability.audit.business-state.reason"), "missing reason not caught");
  assert.ok(paths.includes("exceptions[0].approvedBy"), "unapproved exception not caught");
});

test("legacy camelCase keys are rejected and reported with their canonical form", async () => {
  const result = await check("legacy-aliases");
  assert.equal(result.status, "invalid", "aliases must not validate");
  const mapped = new Map(result.aliases.map((a) => [a.alias, a.canonical]));
  assert.equal(mapped.get("ai.uiCapabilitiesMustBeAgentOperable"), "ai.non-ui-capabilities");
  assert.equal(mapped.get("ai.providerNeutral"), "ai.provider-neutral");
  assert.equal(mapped.get("architecture.requireProjectManifest"), "architecture.project-manifest");
});

test("every legacy alias maps to a canonically-shaped rule ID", () => {
  const canonical = /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;
  for (const [alias, target] of LEGACY_ALIASES) {
    assert.match(target, canonical, `alias ${alias} maps to a non-canonical ID`);
    assert.ok(!LEGACY_ALIASES.has(target), `${target} is both canonical and an alias`);
  }
});

test("this repository's policy contains no legacy aliases", async () => {
  const result = await checkPolicy(path.join(ROOT, "project-policy.yml"), SCHEMA, TODAY);
  assert.deepEqual(result.aliases, []);
});

// --- Exit-code semantics ----------------------------------------------------------------------

test("an expired exception is a compliance failure, not a configuration error", async () => {
  const result = await check("expired-exception");
  assert.equal(result.status, "findings", "an expired exception must not be reported as invalid config");
  assert.equal(result.findings[0].id, "policy.expired-exception");
  assert.deepEqual(result.errors, []);
});

test("not-applicable and an exception on the same rule is a conflict", async () => {
  const result = await check("conflicting-classification");
  assert.equal(result.status, "findings");
  assert.equal(result.findings[0].id, "policy.conflicting-classification");
});

test("a schema-invalid policy never reports compliance findings", async () => {
  // Standard 30 R1: could-not-evaluate and checked-and-failed are different facts. A malformed
  // policy must not produce a compliance verdict at all.
  for (const name of ["invalid-shape", "legacy-aliases"]) {
    const result = await check(name);
    assert.equal(result.status, "invalid");
    assert.deepEqual(result.findings, [], `${name} produced compliance findings from invalid config`);
  }
});

// --- The evaluator's own honesty ---------------------------------------------------------------

test("the schema uses only keywords the evaluator implements", async () => {
  const schema = JSON.parse(await readFile(SCHEMA, "utf8"));
  assert.doesNotThrow(() => assertSchemaSupported(schema));
});

test("an unimplemented schema keyword throws rather than being ignored", () => {
  // The guard against silent under-validation: skipping a constraint reports PASS for a document
  // that was never fully checked (Standard 24 R2).
  //
  // This test used `oneOf` as its example until `oneOf` was implemented for the attestation-record
  // migration window, at which point the assertion stopped proving anything. The example is
  // replaced rather than deleted: what is under test is the refusal to ignore an unimplemented
  // keyword, not any particular keyword, so it needs one the evaluator genuinely lacks.
  assert.throws(() => assertSchemaSupported({ type: "object", allOf: [] }), SchemaError);
  assert.throws(() => validate({}, { type: "object", maxProperties: 1 }), SchemaError);

  // And implementing `oneOf` must not have opened a hole one level down: an unsupported keyword
  // inside a branch is still an unimplemented constraint, and must still throw rather than be
  // swallowed by the branch's throwaway error list.
  assert.throws(() => validate({}, { oneOf: [{ type: "object", maxProperties: 1 }] }), SchemaError);
});

test("oneOf accepts exactly one shape, and reports both failure modes", () => {
  // The migration window depends on this: an attestation record is either a review sequence or the
  // legacy single record, and must not be able to be both at once.
  const either = {
    oneOf: [
      { type: "object", required: ["reviews"], additionalProperties: false, properties: { reviews: { type: "array" } } },
      { type: "object", required: ["status"], additionalProperties: false, properties: { status: { type: "string" } } },
    ],
  };
  assert.deepEqual(validate({ reviews: [] }, either), []);
  assert.deepEqual(validate({ status: "approved" }, either), []);
  assert.equal(validate({}, either).length, 1, "a value matching no shape is reported");
  assert.match(validate({}, either)[0].message, /matched none/);
});

test("the evaluator rejects what the schema forbids — mutation check", () => {
  // Reintroduce the defect the propertyNames pattern exists to prevent, and confirm it is caught.
  // A pattern that accepted camelCase would let ADR 0002's decision be violated silently.
  const schema = {
    type: "object",
    propertyNames: { type: "string", pattern: "^[a-z][a-z0-9]*(\\.[a-z0-9]+(-[a-z0-9]+)*)+$" },
    additionalProperties: { type: "string" },
  };
  assert.deepEqual(validate({ "ai.provider-neutral": "required" }, schema), []);
  assert.equal(validate({ "ai.providerNeutral": "required" }, schema).length, 1);
});

// --- The YAML subset ----------------------------------------------------------------------------

test("the parser reads the policy shape", () => {
  const parsed = parseYaml(
    ['a: "1"', "b:", "  c: two", "d:", "  - e: three", "    f: four", "g: []"].join("\n"),
  );
  assert.deepEqual(parsed, {
    a: "1",
    b: { c: "two" },
    d: [{ e: "three", f: "four" }],
    g: [],
  });
});

test("scalars are never coerced", () => {
  // `standardVersion: 1.0` must reach the schema as a string so its pattern can reject it. A parser
  // that produced a number would make that check unreachable.
  const parsed = parseYaml('version: 1.0\nflag: true\ndate: 2026-08-08');
  assert.equal(parsed.version, "1.0");
  assert.equal(parsed.flag, "true");
  assert.equal(parsed.date, "2026-08-08");
});

test("comments are stripped outside quotes and kept inside them", () => {
  const parsed = parseYaml('a: value # trailing\nb: "has # inside"');
  assert.equal(parsed.a, "value");
  assert.equal(parsed.b, "has # inside");
});

test("unsupported YAML constructs are errors, not guesses", () => {
  for (const source of [
    "a: &anchor 1",
    "a: *alias",
    "a: |\n  block",
    "a: {b: 1}",
    "a: [1, 2]",
    "---\na: 1",
    "a: 1\na: 2",
    "a:\n\tb: 1",
  ]) {
    assert.throws(() => parseYaml(source), YamlError, `accepted unsupported construct: ${source}`);
  }
});

test("duplicate keys are rejected rather than silently overwritten", () => {
  assert.throws(() => parseYaml("rules:\n  a.b:\n    level: required\n  a.b:\n    level: optional"), YamlError);
});

test("an exception against a non-exemptible rule is reported by the policy checker", async () => {
  // Caught here so an adopter learns it from `standards policy`, and independently in the compliance
  // engine so skipping this command cannot bypass it (Standard 20 R4).
  const result = await check("non-exemptible-exception");
  assert.equal(result.status, "findings", "a non-exemptible waiver validated cleanly");
  assert.equal(result.findings[0].id, "policy.non-exemptible-rule");
  assert.match(result.findings[0].message, /security\.no-secrets-in-artifacts/);
});

test("the non-exemptible check does not fire on exemptible rules", async () => {
  // The known-negative. Without it, a blanket rejection of all exceptions would pass the test above.
  const result = await check("valid");
  assert.equal(result.status, "ok");
  assert.equal(result.findings.length, 0);
});

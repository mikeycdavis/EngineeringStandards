#!/usr/bin/env node
/**
 * Validate a project policy against schemas/project-policy.schema.json.
 *
 * Exit codes follow Standard 23 R3, and the distinction is the point:
 *
 *   0  the policy is valid
 *   1  the policy is valid but a compliance condition fails — today, an expired exception
 *   2  the policy could not be evaluated: unreadable, unparseable, or schema-invalid
 *
 * Invalid configuration is a `2`, never a `1`. "This policy is malformed" and "this project fails a
 * rule" are different facts, and collapsing them reports a broken config as non-compliance
 * (Standard 30 R1).
 *
 * Usage: node scripts/policy.mjs [path/to/project-policy.yml] [--json] [--schema <path>]
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseYaml, YamlError } from "./yaml.mjs";
import { validate, assertSchemaSupported, SchemaError } from "./jsonschema.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");
const DEFAULT_POLICY = path.join(ROOT, "project-policy.yml");

/**
 * Legacy policy keys and the canonical rule IDs they normalize to (ADR 0002), derived from the rule
 * catalog's `aliases` field rather than restated here.
 *
 * This used to be a hand-maintained table in this file. Once the catalog landed that became a second
 * definition of the same mapping — the dual identity ADR 0002 abolished, reintroduced one layer down.
 * The catalog is the single source of rule identity and metadata; this module reads it.
 */
export const LEGACY_ALIASES = await (async () => {
  const { loadCatalog } = await import("./catalog.mjs");
  const catalog = await loadCatalog();
  return new Map(catalog.aliases);
})();

/**
 * Flatten a nested policy section into dotted keys, so the source's `ai:` → `providerNeutral:`
 * shape can be recognised as the alias `ai.providerNeutral` and reported with its canonical form.
 * Recognition only — the schema still rejects the document.
 */
function collectNestedKeys(node, prefix, out) {
  if (node === null || typeof node !== "object" || Array.isArray(node)) return;
  for (const [key, child] of Object.entries(node)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    out.push(dotted);
    collectNestedKeys(child, dotted, out);
  }
}

function detectAliases(document) {
  const found = [];
  const keys = [];
  for (const section of ["rules", "applicability"]) {
    collectNestedKeys(document?.[section], "", keys);
  }
  for (const entry of Array.isArray(document?.exceptions) ? document.exceptions : []) {
    if (typeof entry?.rule === "string") keys.push(entry.rule);
  }
  for (const key of keys) {
    const canonical = LEGACY_ALIASES.get(key);
    if (canonical) found.push({ alias: key, canonical });
  }
  return found;
}

/** Compliance conditions that a well-formed policy can still fail. */
function complianceFindings(document, today) {
  const findings = [];

  const exceptions = Array.isArray(document.exceptions) ? document.exceptions : [];
  for (const entry of exceptions) {
    if (entry.expires && entry.expires < today) {
      findings.push({
        id: "policy.expired-exception",
        severity: "error",
        message: `exception for '${entry.rule}' expired on ${entry.expires}`,
        remediation: "Renew the exception with a new approval, or satisfy the rule.",
      });
    }
  }

  // An exception says the rule applies and is knowingly unmet; not-applicable says the rule has no
  // subject here. A rule cannot be both, and a policy asserting both is ambiguous rather than
  // strict — there is no safe way to pick one (Standard 34 R3).
  const notApplicable = new Set(
    Object.entries(document.applicability ?? {})
      .filter(([, decl]) => decl?.status === "not-applicable")
      .map(([id]) => id),
  );
  for (const entry of exceptions) {
    if (notApplicable.has(entry.rule)) {
      findings.push({
        id: "policy.conflicting-classification",
        severity: "error",
        message: `'${entry.rule}' is declared not-applicable and also carries an exception`,
        remediation: "Remove one. not-applicable means the rule has no subject; an exception means it applies and is unmet.",
      });
    }
  }

  return findings;
}

function parseArgs(argv) {
  const options = { policy: null, schema: DEFAULT_SCHEMA, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--schema") options.schema = argv[++i];
    else if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
    else if (options.policy === null) options.policy = arg;
    else throw new Error(`unexpected argument '${arg}'`);
  }
  if (options.policy === null) options.policy = DEFAULT_POLICY;
  if (!options.schema) throw new Error("--schema requires a path");
  return options;
}

/** Returns { status, errors, findings, aliases, document }. status is one of ok|findings|invalid. */
export async function checkPolicy(policyPath, schemaPath, today) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assertSchemaSupported(schema);

  let document;
  try {
    document = parseYaml(await readFile(policyPath, "utf8"));
  } catch (error) {
    if (error instanceof YamlError) {
      return { status: "invalid", errors: [{ path: "", message: error.message }], findings: [], aliases: [] };
    }
    throw error;
  }

  const aliases = detectAliases(document);
  const errors = validate(document, schema);
  if (errors.length > 0) return { status: "invalid", errors, findings: [], aliases, document };

  const findings = complianceFindings(document, today);
  return { status: findings.length > 0 ? "findings" : "ok", errors: [], findings, aliases, document };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`standards policy: ${error.message}\n`);
    process.exit(EXIT_INVOCATION);
  }

  const today = new Date().toISOString().slice(0, 10);
  let result;
  try {
    result = await checkPolicy(options.policy, options.schema, today);
  } catch (error) {
    const detail = error instanceof SchemaError ? `schema: ${error.message}` : error.message;
    process.stderr.write(`standards policy: ${detail}\n`);
    process.exit(EXIT_INVOCATION);
  }

  const relative = path.relative(ROOT, options.policy).replace(/\\/g, "/") || options.policy;

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          schemaVersion: "1.0",
          policy: relative,
          status: result.status,
          errors: result.errors,
          findings: result.findings,
          legacyAliases: result.aliases,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(`Policy: ${relative}\n\n`);
    for (const alias of result.aliases) {
      process.stdout.write(`  legacy key '${alias.alias}' — canonical form is '${alias.canonical}' (ADR 0002)\n`);
    }
    if (result.aliases.length > 0) process.stdout.write("\n");
    for (const error of result.errors) {
      process.stdout.write(`  ${error.path || "(document)"}: ${error.message}\n`);
    }
    for (const finding of result.findings) {
      process.stdout.write(`  ${finding.severity.toUpperCase()} ${finding.id}: ${finding.message}\n`);
      process.stdout.write(`        ${finding.remediation}\n`);
    }
    if (result.status === "ok") {
      process.stdout.write("Valid against schemas/project-policy.schema.json.\n\n");
      process.stdout.write(
        "This says the policy is well-formed and internally consistent. It says nothing\n" +
          "about whether the project satisfies the rules it declares — that is a validation\n" +
          "run, not a schema check.\n",
      );
    } else if (result.status === "invalid") {
      process.stdout.write(`\n${result.errors.length} schema error(s). The policy could not be evaluated.\n`);
    } else {
      process.stdout.write(`\n${result.findings.length} compliance finding(s).\n`);
    }
  }

  if (result.status === "invalid") process.exit(EXIT_INVOCATION);
  if (result.status === "findings") process.exit(EXIT_FINDINGS);
  process.exit(EXIT_OK);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}`) {
  await main();
} else if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}

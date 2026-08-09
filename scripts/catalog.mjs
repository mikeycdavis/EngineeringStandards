/**
 * The rule catalog: the single source of machine truth for rule identity and metadata
 * (Standard 27).
 *
 * The architectural rule this module exists to hold, and which the whole compliance system rests on:
 *
 *   The catalog defines rule identity and metadata.
 *   project-policy.yml defines project applicability.
 *   The evaluator produces evidence.
 *   None of the three may redefine the others.
 *
 * So: a level or severity in the catalog is the framework's default and a policy may select a
 * different level for a project, but a policy may not invent a rule the catalog does not define, and
 * an evaluator may not report against an id the catalog does not carry. `assertBindings` enforces
 * the last of those mechanically, because a detector reporting an unknown rule id is exactly the
 * dual-vocabulary drift ADR 0002 abolished.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = path.join(ROOT, "rules");

export const VALIDATION_TYPES = new Set([
  "structural",
  "document",
  "configuration",
  "code-analysis",
  "manual-review",
]);
export const ASSURANCE = new Set(["full", "partial", "none"]);
export const LEVELS = new Set(["required", "recommended", "optional", "forbidden"]);
export const SEVERITIES = new Set(["error", "warning", "info"]);

const CANONICAL_ID = /^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

export class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogError";
  }
}

/**
 * Load every rules/*.json file into one catalog.
 *
 * Returns { rules: Map<id, rule>, aliases: Map<alias, id>, byCategory: Map<category, rule[]> }.
 * Throws CatalogError on a malformed entry — a catalog that loads partially would silently shrink
 * the denominator every score is computed over.
 */
export async function loadCatalog(dir = CATALOG_DIR) {
  const rules = new Map();
  const aliases = new Map();

  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new CatalogError(`no rule files found in ${dir}`);

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    } catch (error) {
      throw new CatalogError(`${file}: ${error.message}`);
    }
    if (!Array.isArray(parsed.rules)) throw new CatalogError(`${file}: missing a 'rules' array`);

    for (const rule of parsed.rules) {
      const where = `${file}:${rule.id ?? "(no id)"}`;
      if (typeof rule.id !== "string" || !CANONICAL_ID.test(rule.id)) {
        throw new CatalogError(`${where}: id is not a canonical category.kebab-case-name (ADR 0002)`);
      }
      if (rules.has(rule.id)) throw new CatalogError(`${where}: duplicate rule id`);

      for (const [field, allowed] of [
        ["level", LEVELS],
        ["severity", SEVERITIES],
        ["validationType", VALIDATION_TYPES],
        ["assurance", ASSURANCE],
      ]) {
        if (!allowed.has(rule[field])) {
          throw new CatalogError(`${where}: ${field} '${rule[field]}' is not one of ${[...allowed].join(", ")}`);
        }
      }
      for (const field of ["title", "description", "remediation", "introducedIn"]) {
        if (typeof rule[field] !== "string" || rule[field].trim() === "") {
          throw new CatalogError(`${where}: ${field} is required`);
        }
      }
      if (typeof rule.standard !== "number") throw new CatalogError(`${where}: standard must be a number`);
      if (typeof rule.nonExemptible !== "boolean") {
        throw new CatalogError(`${where}: nonExemptible must be a boolean`);
      }
      // Present from the first release even when empty: adding them later means every existing rule
      // silently lacks them, and consumers treat their absence as meaningful (Standard 27 R2).
      for (const field of ["deprecatedIn", "supersededBy", "removedIn"]) {
        if (!(field in rule)) throw new CatalogError(`${where}: lifecycle field '${field}' must be present`);
      }
      if (!Array.isArray(rule.aliases)) throw new CatalogError(`${where}: aliases must be an array`);

      for (const alias of rule.aliases) {
        if (aliases.has(alias)) throw new CatalogError(`${where}: alias '${alias}' is already claimed`);
        if (rules.has(alias)) throw new CatalogError(`${where}: '${alias}' is both a rule id and an alias`);
        aliases.set(alias, rule.id);
      }
      rules.set(rule.id, Object.freeze({ ...rule, source: file }));
    }
  }

  // A second pass: an alias must never collide with a rule id defined in a later file.
  for (const alias of aliases.keys()) {
    if (rules.has(alias)) throw new CatalogError(`'${alias}' is both a rule id and an alias`);
  }

  const byCategory = new Map();
  for (const rule of rules.values()) {
    if (!byCategory.has(rule.category)) byCategory.set(rule.category, []);
    byCategory.get(rule.category).push(rule);
  }

  return { rules, aliases, byCategory };
}

/** Resolve an id or a legacy alias to a canonical rule. Returns undefined if neither. */
export function resolve(catalog, id) {
  return catalog.rules.get(id) ?? catalog.rules.get(catalog.aliases.get(id));
}

/**
 * Assert every rule id an evaluator reports against exists in the catalog.
 *
 * This is the mechanical guard on the architectural rule. Without it an evaluator can grow its own
 * vocabulary one detector at a time, which is how the audit came to speak in finding categories
 * while the policy spoke in rule ids.
 */
export function assertBindings(catalog, ids) {
  const unknown = [...new Set(ids)].filter((id) => !catalog.rules.has(id));
  if (unknown.length > 0) {
    throw new CatalogError(
      `evaluator reports against rule id(s) the catalog does not define: ${unknown.join(", ")}`,
    );
  }
}

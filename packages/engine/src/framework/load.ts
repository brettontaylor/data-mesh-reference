// Load the governed contract set from /contracts into typed objects.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type {
  AccessModel,
  Contract,
  Entity,
  Pdm,
  SemanticModel,
  Source,
  Spec,
} from "./types";

// Repo root = two levels up from src/framework.
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONTRACTS = join(ROOT, "contracts");

function readYaml<T>(path: string): T {
  return parse(readFileSync(path, "utf8")) as T;
}

function listYaml(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort()
    .map((f) => join(dir, f));
}

export function loadContract(): Contract {
  const spec = readYaml<Spec>(join(CONTRACTS, "spec.yaml"));
  const entities = listYaml(join(CONTRACTS, "bdm")).map((p) => readYaml<Entity>(p));
  const pdms = listYaml(join(CONTRACTS, "pdm")).map((p) => readYaml<Pdm>(p));
  const semanticModels = listYaml(join(CONTRACTS, "semantic")).map((p) =>
    readYaml<SemanticModel>(p),
  );
  const sources = listYaml(join(CONTRACTS, "sources")).map((p) =>
    readYaml<Source>(p),
  );
  const access = readYaml<AccessModel>(join(CONTRACTS, "access.yaml"));
  return { spec, entities, pdms, semanticModels, sources, access };
}

/**
 * Build a Contract from an in-memory file list (paths relative to the models
 * root, e.g. "spec.yaml", "bdm/trade.yaml"). Used by the reconciler so it can
 * parse a tree fetched from any GitProvider without touching the filesystem.
 */
export function parseContract(
  files: { path: string; content: string }[],
): Contract {
  const byPrefix = (prefix: string) =>
    files
      .filter(
        (f) =>
          f.path.startsWith(prefix) &&
          (f.path.endsWith(".yaml") || f.path.endsWith(".yml")),
      )
      .sort((a, b) => a.path.localeCompare(b.path));
  const one = (name: string) => files.find((f) => f.path === name);

  const specFile = one("spec.yaml");
  if (!specFile) throw new Error("parseContract: spec.yaml not found in tree");
  const accessFile = one("access.yaml") ?? one("policy/access.yaml");

  return {
    spec: parse(specFile.content) as Spec,
    entities: byPrefix("bdm/").map((f) => parse(f.content) as Entity),
    pdms: byPrefix("pdm/").map((f) => parse(f.content) as Pdm),
    semanticModels: byPrefix("semantic/").map((f) => parse(f.content) as SemanticModel),
    sources: byPrefix("sources/").map((f) => parse(f.content) as Source),
    access: accessFile
      ? (parse(accessFile.content) as AccessModel)
      : { roles: [], defaultRole: "" },
  };
}

// Convenience lookups.
export function entityById(c: Contract, id: string): Entity | undefined {
  return c.entities.find((e) => e.entity === id);
}
export function sourceById(c: Contract, id: string): Source | undefined {
  return c.sources.find((s) => s.source === id);
}
export function pkOf(e: Entity) {
  return e.fields.find((f) => f.pk);
}

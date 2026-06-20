// Load the governed contract set from /contracts into typed objects.
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import type { AccessModel, Contract, Entity, Source, Spec } from "./types";

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
  const entities = listYaml(join(CONTRACTS, "entities")).map((p) =>
    readYaml<Entity>(p),
  );
  const sources = listYaml(join(CONTRACTS, "sources")).map((p) =>
    readYaml<Source>(p),
  );
  const access = readYaml<AccessModel>(join(CONTRACTS, "access.yaml"));
  return { spec, entities, sources, access };
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

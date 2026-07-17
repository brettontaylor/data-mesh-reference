// Orchestrate all generators and write the generated/ tree.
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROOT } from "../framework/load";
import type { Contract } from "../framework/types";
import { generateDatabricks, type GeneratedFile } from "./databricks";
import { generateSnowflake } from "./snowflake";
import { generatePostgres } from "./postgres";
import { generateCube } from "./cube";
import { generateCatalog } from "./catalog";
import { generateAccess } from "./access";
import { generateRegistry } from "./registry";

export function generateAll(c: Contract): GeneratedFile[] {
  return [
    ...generateDatabricks(c),
    ...generateSnowflake(c),
    ...generatePostgres(c),
    ...generateCube(c),
    ...generateCatalog(c),
    ...generateAccess(c),
    ...generateRegistry(c),
  ];
}

export function writeGenerated(files: GeneratedFile[]): string {
  const out = join(ROOT, "generated");
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  for (const f of files) {
    const full = join(out, f.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, f.content, "utf8");
  }
  return out;
}

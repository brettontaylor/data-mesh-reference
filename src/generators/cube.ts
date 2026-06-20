// Generate Cube semantic models (Cube v2 YAML) from the contract.
// Cubes point at the Snowflake gold tables; dimensions/measures come from the
// contract; classification rides along in `meta` for governed access.
import type { Contract, Entity } from "../framework/types";
import type { GeneratedFile } from "./databricks";

function dimensionType(t: string): string {
  if (t === "date") return "time";
  if (t === "int" || t.startsWith("decimal")) return "number";
  return "string";
}

function cubeYaml(e: Entity): string {
  const fieldsByName = new Map(e.fields.map((f) => [f.name, f]));

  // Dimensions: declared dims, minus any restricted (governance forbids those).
  const dims = (e.dimensions ?? [])
    .map((d) => fieldsByName.get(d))
    .filter((f): f is NonNullable<typeof f> => !!f && f.classification !== "restricted")
    .map(
      (f) => `    - name: ${f.name}
      sql: ${f.name}
      type: ${dimensionType(f.type)}
      meta:
        classification: ${f.classification}`,
    )
    .join("\n");

  // Measures: from declared metrics.
  const measures = (e.metrics ?? [])
    .map((m) => {
      const f = fieldsByName.get(m.field);
      const cls = f?.classification ?? "internal";
      return `    - name: ${m.name}
      sql: ${m.field}
      type: ${m.agg}
      meta:
        classification: ${cls}`;
    })
    .join("\n");

  return `# AUTO-GENERATED from contracts/entities/${e.entity}.yaml — DO NOT EDIT. Regenerate: npm run generate
cubes:
  - name: ${e.entity}
    sql_table: GOLD.${e.entity.toUpperCase()}
    title: ${e.label}
    description: ${e.grain}
    meta:
      owner: ${e.owner}
      group: ${e.group}
${dims ? `    dimensions:\n${dims}\n` : ""}${measures ? `    measures:\n${measures}\n` : ""}`;
}

export function generateCube(c: Contract): GeneratedFile[] {
  return c.entities.map((e) => ({
    path: `cube/${e.entity}.yml`,
    content: cubeYaml(e),
  }));
}

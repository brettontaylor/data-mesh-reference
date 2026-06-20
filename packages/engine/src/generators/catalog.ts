// Generate the data-product catalog: a machine-readable descriptor per entity,
// plus an index. This is the discoverable, published face of the mesh.
import { sourceById } from "../framework/load";
import type { Contract } from "../framework/types";
import type { GeneratedFile } from "./databricks";

export function generateCatalog(c: Contract): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  for (const e of c.entities) {
    const src = sourceById(c, e.source);
    const classCounts: Record<string, number> = {};
    for (const f of e.fields) {
      classCounts[f.classification] = (classCounts[f.classification] ?? 0) + 1;
    }
    const descriptor = {
      dataProduct: e.entity,
      title: e.label,
      version: c.spec.version,
      group: e.group,
      grain: e.grain,
      owner: e.owner,
      source: { id: e.source, kind: src?.kind, cadenceDays: src?.cadenceDays ?? null },
      classificationSummary: classCounts,
      schema: e.fields.map((f) => ({
        name: f.name,
        type: f.type,
        classification: f.classification,
        ...(f.pii ? { pii: true } : {}),
        ...(f.mnpi ? { mnpi: true } : {}),
        ...(f.pk ? { primaryKey: true } : {}),
        ...(f.fk ? { references: `${f.fk.entity}.${f.fk.field}` } : {}),
      })),
      lineage: {
        bronze: `bronze_${e.entity}`,
        silver: `silver_${e.entity}`,
        gold: `GOLD.${e.entity.toUpperCase()}`,
        semantic: `cube:${e.entity}`,
      },
      metrics: (e.metrics ?? []).map((m) => ({
        name: m.name,
        agg: m.agg,
        field: m.field,
        ...(m.description ? { description: m.description } : {}),
      })),
    };
    files.push({
      path: `catalog/${e.entity}.json`,
      content: JSON.stringify(descriptor, null, 2),
    });
  }

  const index = {
    catalog: c.spec.name,
    version: c.spec.version,
    description: c.spec.description,
    classifications: c.spec.classifications,
    products: c.entities.map((e) => ({
      id: e.entity,
      title: e.label,
      group: e.group,
      owner: e.owner,
      descriptor: `catalog/${e.entity}.json`,
    })),
  };
  files.push({ path: "catalog/index.json", content: JSON.stringify(index, null, 2) });
  return files;
}

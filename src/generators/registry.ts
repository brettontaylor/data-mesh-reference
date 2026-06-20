// Generate the published model registry — every BDM, PDM, and semantic model with
// its version, status, dependencies, and a content signature. This is what the
// API and CLI serve.
import { bdmSurface, pdmSurface, semanticSurface, hashSurface } from "../registry/surface";
import type { Contract } from "../framework/types";
import type { GeneratedFile } from "./databricks";

export function generateRegistry(c: Contract): GeneratedFile[] {
  const models: unknown[] = [];

  for (const e of c.entities)
    models.push({
      id: e.entity,
      kind: "bdm",
      version: e.version,
      status: e.status ?? "active",
      owner: e.owner,
      upstream: e.upstream ?? null,
      dependsOn: [`source:${e.source}`],
      signature: hashSurface(bdmSurface(e)),
      detail: { group: e.group, grain: e.grain, fields: e.fields.length },
    });

  for (const p of c.pdms)
    models.push({
      id: p.pdm,
      kind: "pdm",
      version: p.version,
      status: p.status ?? "active",
      owner: p.owner ?? null,
      dependsOn: [`bdm:${p.bdm}`, `source:${p.source}`],
      signature: hashSurface(pdmSurface(p)),
      detail: { bdm: p.bdm, ...p.physical },
    });

  for (const s of c.semanticModels)
    models.push({
      id: s.semanticModel,
      kind: "semantic",
      version: s.version,
      status: s.status ?? "active",
      owner: s.owner ?? null,
      dependsOn: s.sources.map((x) => `bdm:${x}`),
      signature: hashSurface(semanticSurface(s)),
      detail: {
        description: s.description ?? "",
        sources: s.sources,
        dimensions: s.dimensions.map((d) => `${d.entity}.${d.field}`),
        measures: s.measures.map((m) => `${m.entity}.${m.metric}`),
      },
    });

  const registry = {
    standardVersion: c.spec.version,
    counts: {
      bdm: c.entities.length,
      pdm: c.pdms.length,
      semantic: c.semanticModels.length,
    },
    models,
  };

  return [{ path: "registry/registry.json", content: JSON.stringify(registry, null, 2) }];
}

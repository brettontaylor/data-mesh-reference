// Map an engine Contract into a projection snapshot (the read-model).
import { type Contract, type Entity, buildModels, hashSurface } from "@dct/engine";
import type {
  DomainRecord,
  FieldRecord,
  ModelRecord,
  ProjectionSnapshot,
} from "@dct/projection";

function bdmDomain(e: Entity): string {
  return e.group === "reference" ? "reference" : "trading";
}

export function toSnapshot(c: Contract, sourceSha: string): ProjectionSnapshot {
  const domainByBdm = new Map(c.entities.map((e) => [e.entity, bdmDomain(e)]));
  const built = buildModels(c);
  const sig = new Map(built.map((m) => [`${m.kind}:${m.id}`, hashSurface(m.surface)]));
  const models: ModelRecord[] = [];

  for (const e of c.entities) {
    const fields: FieldRecord[] = e.fields.map((f) => ({
      name: f.name,
      type: f.type,
      classification: f.classification,
      pii: !!f.pii,
      mnpi: !!f.mnpi,
      isPk: !!f.pk,
      fkRef: f.fk ? `${f.fk.entity}.${f.fk.field}` : null,
    }));
    models.push({
      kind: "bdm",
      id: e.entity,
      domain: bdmDomain(e),
      version: e.version,
      status: e.status ?? "active",
      owner: e.owner ?? null,
      description: e.label ?? null,
      upstream: e.upstream ?? null,
      signature: sig.get(`bdm:${e.entity}`) ?? "",
      tags: [],
      dependsOn: [`source:${e.source}`],
      fields,
      detail: {
        group: e.group,
        grain: e.grain,
        metrics: (e.metrics ?? []).map((m) => m.name),
        dimensions: e.dimensions ?? [],
      },
      spec: e as unknown as Record<string, unknown>,
    });
  }

  for (const p of c.pdms) {
    models.push({
      kind: "pdm",
      id: p.pdm,
      domain: domainByBdm.get(p.bdm) ?? "platform",
      version: p.version,
      status: p.status ?? "active",
      owner: p.owner ?? null,
      description: `Physical binding for ${p.bdm}`,
      upstream: null,
      signature: sig.get(`pdm:${p.pdm}`) ?? "",
      tags: [],
      dependsOn: [`bdm:${p.bdm}`, `source:${p.source}`],
      fields: [],
      detail: { bdm: p.bdm, ...p.physical },
      spec: p as unknown as Record<string, unknown>,
    });
  }

  for (const s of c.semanticModels) {
    models.push({
      kind: "semantic",
      id: s.semanticModel,
      domain: "analytics",
      version: s.version,
      status: s.status ?? "active",
      owner: s.owner ?? null,
      description: s.description ?? null,
      upstream: null,
      signature: sig.get(`semantic:${s.semanticModel}`) ?? "",
      tags: [],
      dependsOn: s.sources.map((x) => `bdm:${x}`),
      fields: [],
      detail: {
        sources: s.sources,
        dimensions: s.dimensions.map((d) => `${d.entity}.${d.field}`),
        measures: s.measures.map((m) => `${m.entity}.${m.metric}`),
      },
      spec: s as unknown as Record<string, unknown>,
    });
  }

  for (const src of c.sources) {
    models.push({
      kind: "source",
      id: src.source,
      domain: "platform",
      version: "1.0.0",
      status: "active",
      owner: null,
      description: src.label ?? null,
      upstream: null,
      signature: hashSurface({
        kind: "source",
        produces: [...src.produces].sort(),
        cadenceDays: src.cadenceDays ?? null,
      }),
      tags: [],
      dependsOn: [],
      fields: [],
      detail: {
        sourceKind: src.kind,
        cadenceDays: src.cadenceDays ?? null,
        produces: src.produces,
      },
      spec: src as unknown as Record<string, unknown>,
    });
  }

  const counts = new Map<string, number>();
  for (const m of models) counts.set(m.domain, (counts.get(m.domain) ?? 0) + 1);
  const domains: DomainRecord[] = [...counts.entries()].map(([id, n]) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    modelCount: n,
  }));

  const access = {
    defaultRole: c.access.defaultRole,
    tiers: c.spec.classifications,
    roles: c.access.roles.map((r) => ({
      role: r.role,
      label: r.label,
      description: r.description,
      maxTier: r.maxTier,
      pii: r.pii,
      mnpi: r.mnpi,
    })),
  };

  return { sourceSha, domains, models, access };
}

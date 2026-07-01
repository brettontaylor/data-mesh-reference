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
      bk: !!f.bk,
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

  for (const m of c.mappings ?? []) {
    models.push({
      kind: "mapping", id: m.mapping,
      domain: domainByBdm.get(m.to.id) ?? domainByBdm.get(m.from.id) ?? "platform",
      version: m.version, status: m.status ?? "active", owner: m.owner ?? null,
      description: `Mapping ${m.from.kind}:${m.from.id} → ${m.to.kind}:${m.to.id}`,
      upstream: null, signature: sig.get(`mapping:${m.mapping}`) ?? "",
      tags: [], dependsOn: [`${m.from.kind}:${m.from.id}`, `${m.to.kind}:${m.to.id}`],
      fields: [],
      detail: { from: m.from, to: m.to, rules: m.rules },
      spec: m as unknown as Record<string, unknown>,
    });
  }

  for (const d of c.dqRuleSets ?? []) {
    models.push({
      kind: "dq", id: d.dqRuleSet,
      domain: domainByBdm.get(d.target.id) ?? "governance",
      version: d.version, status: d.status ?? "active", owner: d.owner ?? null,
      description: `Data-quality rules for ${d.target.kind}:${d.target.id}`,
      upstream: null, signature: sig.get(`dq:${d.dqRuleSet}`) ?? "",
      tags: [], dependsOn: [`${d.target.kind}:${d.target.id}`],
      fields: [],
      detail: { target: d.target, rules: d.rules },
      spec: d as unknown as Record<string, unknown>,
    });
  }

  for (const x of c.extracts ?? []) {
    models.push({
      kind: "extract", id: x.extract, domain: "consumption",
      version: x.version, status: x.status ?? "active", owner: x.owner ?? null,
      description: `Extract for ${x.consumer}`,
      upstream: null, signature: sig.get(`extract:${x.extract}`) ?? "",
      tags: [], dependsOn: x.from.map((f) => `${f.kind}:${f.id}`),
      // columns surfaced as fields so the detail table + classification badges work
      fields: x.columns.map((col) => ({
        name: col.name, type: "string", classification: col.classification ?? "internal",
        pii: false, mnpi: false, isPk: false, fkRef: col.from,
      })),
      detail: { consumer: x.consumer, grain: x.grain ?? null, filters: x.filters ?? null, delivery: x.delivery ?? null, columns: x.columns },
      spec: x as unknown as Record<string, unknown>,
    });
  }

  for (const t of c.transformations ?? []) {
    models.push({
      kind: "transformation", id: t.transformation,
      domain: domainByBdm.get(t.sources[0]?.entity ?? "") ?? "consumption",
      version: t.version, status: t.status ?? "active", owner: t.owner ?? null,
      description: `Silver→Gold transformation → ${t.target.kind}:${t.target.id} (${t.complexity ?? "n/a"})`,
      upstream: null, signature: sig.get(`transformation:${t.transformation}`) ?? "",
      tags: t.complexity ? [t.complexity] : [],
      dependsOn: [
        `${t.target.kind}:${t.target.id}`,
        ...t.sources.map((s) => `bdm:${s.entity}`),
        ...(t.uses ?? []).map((u) => `refmap:${u}`),
      ],
      fields: [],
      detail: {
        layer: t.layer, complexity: t.complexity ?? null, target: t.target,
        sources: t.sources, assembly: t.assembly ?? null,
        keyResolution: t.keyResolution ?? [], uses: t.uses ?? [], fields: t.fields,
      },
      spec: t as unknown as Record<string, unknown>,
    });
  }

  for (const r of c.refMaps ?? []) {
    models.push({
      kind: "refmap", id: r.refmap, domain: "reference",
      version: r.version, status: r.status ?? "active", owner: r.owner ?? null,
      description: r.description ?? r.keyType ?? "Reference map",
      upstream: r.source ?? null, signature: sig.get(`refmap:${r.refmap}`) ?? "",
      tags: [], dependsOn: [],
      fields: [],
      detail: { keyType: r.keyType ?? null, source: r.source ?? null, entries: r.entries ?? [] },
      spec: r as unknown as Record<string, unknown>,
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

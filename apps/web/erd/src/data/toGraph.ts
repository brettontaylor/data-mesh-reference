// Pure projection: SourceModel[] -> { nodes, edges }. No React, no graph lib.
import {
  asTier,
  type EdgeSpec,
  type EntityData,
  type FieldView,
  type GraphModel,
  type SourceModel,
  type Tier,
  type ToGraphOptions,
} from "./types";

export function toGraph(models: SourceModel[], opts: ToGraphOptions = {}): GraphModel {
  const include = opts.kinds ? models.filter((m) => opts.kinds!.includes(m.kind)) : models.slice();
  const ids = new Set(include.map((m) => m.id));

  const nodes = include.map((m) => {
    const fields: FieldView[] = m.fields.map((f) => ({
      ...f,
      fkTarget: f.fkRef ? (f.fkRef.split(".")[0] ?? null) : null,
    }));
    const tierCounts: Record<Tier, number> = { public: 0, internal: 0, confidential: 0, restricted: 0 };
    for (const f of fields) tierCounts[asTier(f.classification)]++;
    const data: EntityData = {
      id: m.id, kind: m.kind, domain: m.domain, version: m.version, status: m.status, fields, tierCounts,
    };
    return { id: m.id, data };
  });

  const edges: EdgeSpec[] = [];
  const seen = new Set<string>();
  for (const m of include) {
    for (const f of m.fields) {
      if (!f.fkRef) continue;
      const [target, targetField] = f.fkRef.split(".");
      if (!target || !ids.has(target)) continue; // dangling FK still shows as a badge, just no edge
      const id = `${m.id}.${f.name}->${target}`;
      if (seen.has(id)) continue;
      seen.add(id);
      edges.push({
        id,
        source: m.id,
        target,
        sourceField: f.name,
        targetField: targetField ?? "",
        tier: asTier(f.classification),
        selfRef: target === m.id,
      });
    }
  }

  return { nodes, edges };
}

/** 1-hop neighbourhood of an entity (for explore/ego mode). */
export function egoNetwork(graph: GraphModel, focusId: string): Set<string> {
  const keep = new Set<string>([focusId]);
  for (const e of graph.edges) {
    if (e.source === focusId) keep.add(e.target);
    if (e.target === focusId) keep.add(e.source);
  }
  return keep;
}

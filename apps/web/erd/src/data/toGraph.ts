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

// Canonical field ordering (bank convention):
// 1 PK · 2 business key · 3 process date (datetime) · 4 decimal · 5 integer ·
// 6 string · 7 date · 8 boolean · 9 flags.
function fieldOrder(f: FieldView): number {
  if (f.isPk) return 0;
  if (f.bk) return 1;
  const t = f.type.toLowerCase();
  const n = f.name.toLowerCase();
  const isFlag = /^(is_|has_)|_(flag|ind|indicator)$|flag/.test(n);
  if (/datetime|timestamp/.test(t) || /(process|load|etl|record|updated|created)[_a-z]*date|_ts$/.test(n)) return 2;
  if (/^(decimal|numeric|number|float|double|money)/.test(t)) return 3;
  if (/^(int|integer|bigint|smallint|tinyint|long)/.test(t)) return 4;
  if (/^(string|varchar|char|text|nvarchar)/.test(t)) return 5;
  if (t === "date") return 6;
  if (/^(bool|boolean|bit)/.test(t)) return isFlag ? 8 : 7;
  return isFlag ? 8 : 5;
}

export function toGraph(models: SourceModel[], opts: ToGraphOptions = {}): GraphModel {
  const include = opts.kinds ? models.filter((m) => opts.kinds!.includes(m.kind)) : models.slice();
  const ids = new Set(include.map((m) => m.id));

  const nodes = include.map((m) => {
    const fields: FieldView[] = m.fields
      .map((f, i) => ({ f: { ...f, fkTarget: f.fkRef ? (f.fkRef.split(".")[0] ?? null) : null }, i }))
      .sort((a, b) => fieldOrder(a.f) - fieldOrder(b.f) || a.i - b.i) // canonical order, stable within a group
      .map((x) => x.f);
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

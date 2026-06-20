// A model's "control surface" — the structural fingerprint that governance
// versions against. Cosmetic fields (description/owner/upstream) are excluded:
// they don't require a breaking bump.
import { createHash } from "node:crypto";
import type { Entity, Pdm, SemanticModel } from "../framework/types";
import type { Level } from "../framework/version";

export type Surface = Record<string, unknown>;

export function bdmSurface(e: Entity): Surface {
  const fields: Record<string, unknown> = {};
  for (const f of e.fields) {
    fields[f.name] = {
      type: f.type,
      classification: f.classification,
      pii: !!f.pii,
      mnpi: !!f.mnpi,
      pk: !!f.pk,
      fk: f.fk ? `${f.fk.entity}.${f.fk.field}` : null,
    };
  }
  return { kind: "bdm", grain: e.grain, group: e.group, fields };
}

export function pdmSurface(p: Pdm): Surface {
  return {
    kind: "pdm",
    bdm: p.bdm,
    physical: {
      table: p.physical.table,
      loadStrategy: p.physical.loadStrategy,
      partitionBy: p.physical.partitionBy ?? null,
      uniqueKey: p.physical.uniqueKey,
    },
  };
}

export function semanticSurface(s: SemanticModel): Surface {
  return {
    kind: "semantic",
    sources: [...s.sources].sort(),
    dimensions: s.dimensions.map((d) => `${d.entity}.${d.field}`).sort(),
    measures: s.measures.map((m) => `${m.entity}.${m.metric}`).sort(),
  };
}

function stable(o: unknown): string {
  if (o === null || typeof o !== "object") return JSON.stringify(o);
  if (Array.isArray(o)) return `[${o.map(stable).join(",")}]`;
  const keys = Object.keys(o as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable((o as Record<string, unknown>)[k])}`).join(",")}}`;
}

export function hashSurface(s: Surface): string {
  return createHash("sha256").update(stable(s)).digest("hex").slice(0, 16);
}

const eq = (a: unknown, b: unknown) => stable(a) === stable(b);

/** Classify the change from `prev` surface to `next` surface. */
export function severity(prev: Surface, next: Surface): Level {
  if (next.kind === "bdm") {
    const oldF = (prev.fields ?? {}) as Record<string, unknown>;
    const newF = (next.fields ?? {}) as Record<string, unknown>;
    let added = false;
    for (const k of Object.keys(oldF)) {
      if (!(k in newF)) return "major"; // removed field — breaking
      if (!eq(oldF[k], newF[k])) return "major"; // type/class/tag/key change
    }
    for (const k of Object.keys(newF)) if (!(k in oldF)) added = true;
    if (added) return "minor";
    if (prev.grain !== next.grain) return "minor";
    if (prev.group !== next.group) return "patch";
    return "none";
  }
  if (next.kind === "pdm") {
    const a = prev.physical as Record<string, unknown>;
    const b = next.physical as Record<string, unknown>;
    if (prev.bdm !== next.bdm) return "major";
    if (a?.table !== b?.table || a?.uniqueKey !== b?.uniqueKey || a?.partitionBy !== b?.partitionBy)
      return "major";
    if (a?.loadStrategy !== b?.loadStrategy) return "minor";
    return "none";
  }
  // semantic
  const removed = (k: "dimensions" | "measures" | "sources") =>
    (prev[k] as string[]).some((x) => !(next[k] as string[]).includes(x));
  const addedAny = (k: "dimensions" | "measures" | "sources") =>
    (next[k] as string[]).some((x) => !(prev[k] as string[]).includes(x));
  if (removed("dimensions") || removed("measures") || removed("sources")) return "major";
  if (addedAny("dimensions") || addedAny("measures") || addedAny("sources")) return "minor";
  return "none";
}

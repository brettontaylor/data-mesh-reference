// Lineage service (Phase 6): build a column-level lineage graph from the model
// registry (static), enrich with observed pipeline-run events (OpenLineage), and
// traverse upstream/downstream for impact analysis.
import type { Store } from "@dct/projection";
import type { OLEvent } from "@dct/catalog-adapter";

export interface LineageEdge {
  from: string;
  to: string;
  observed?: boolean;
}
export interface LineageGraph {
  nodes: string[];
  edges: LineageEdge[];
}

export class LineageService {
  private observed = new Set<string>(); // "from→to" keys seen in runs

  constructor(private store: Store) {}

  /** Record OpenLineage events from a pipeline run (marks edges observed). */
  ingest(events: OLEvent[]) {
    const norm = (s: string) => s.replace(/^(bronze|silver|gold)_/, "$1:");
    for (const e of events)
      for (const i of e.inputs)
        for (const o of e.outputs) this.observed.add(`${norm(i)}→${norm(o)}`);
  }

  async graph(): Promise<LineageGraph> {
    const models = await this.store.listModels();
    const nodes = new Set<string>();
    const edges: LineageEdge[] = [];
    const add = (from: string, to: string) => {
      nodes.add(from);
      nodes.add(to);
      edges.push({ from, to, observed: this.observed.has(`${from}→${to}`) });
    };

    for (const m of models) {
      if (m.kind === "bdm") {
        const src = (m.dependsOn.find((d) => d.startsWith("source:")) ?? "source:unknown").split(":")[1];
        const e = m.id;
        add(`source:${src}`, `bronze:${e}`);
        add(`bronze:${e}`, `silver:${e}`);
        add(`silver:${e}`, `gold:${e}`);
        for (const f of m.fields) add(`gold:${e}`, `gold:${e}.${f.name}`);
      }
      if (m.kind === "semantic") {
        for (const srcEntity of (m.detail.sources as string[]) ?? [])
          add(`gold:${srcEntity}`, `semantic:${m.id}`);
      }
    }
    return { nodes: [...nodes].sort(), edges };
  }

  /** Traverse from a node in a direction, depth-limited. */
  async traverse(
    urn: string,
    direction: "upstream" | "downstream",
    depth = 10,
  ): Promise<{ root: string; direction: string; nodes: string[]; edges: LineageEdge[] }> {
    const g = await this.graph();
    const adj = new Map<string, LineageEdge[]>();
    for (const e of g.edges) {
      const key = direction === "downstream" ? e.from : e.to;
      if (!adj.has(key)) adj.set(key, []);
      adj.get(key)!.push(e);
    }
    const seen = new Set<string>([urn]);
    const usedEdges: LineageEdge[] = [];
    let frontier = [urn];
    for (let d = 0; d < depth && frontier.length; d++) {
      const next: string[] = [];
      for (const n of frontier) {
        for (const e of adj.get(n) ?? []) {
          const other = direction === "downstream" ? e.to : e.from;
          usedEdges.push(e);
          if (!seen.has(other)) {
            seen.add(other);
            next.push(other);
          }
        }
      }
      frontier = next;
    }
    seen.delete(urn);
    return { root: urn, direction, nodes: [...seen].sort(), edges: usedEdges };
  }

  /** Impact = downstream closure of an entity (everything derived from it). */
  async impact(entityId: string): Promise<string[]> {
    const down = await this.traverse(`bronze:${entityId}`, "downstream", 20);
    return down.nodes;
  }
}

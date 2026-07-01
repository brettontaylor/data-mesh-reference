// ELK layered layout + ORTHOGONAL edge routing. This is what gives the bank
// gold-standard look: nodes placed without overlap AND edges routed with right angles
// that go AROUND boxes (obstacle avoidance) instead of behind them. Async (ELK runs its
// algorithm off the render path); callers apply the result and fall back to the simple
// layout if it ever rejects.
import ELK from "elkjs/lib/elk.bundled.js";
import type { GraphModel } from "./data/types";

// Lazily construct ELK on first use (client only) — `new ELK()` spins up a worker and
// must not run during SSR module evaluation.
let _elk: InstanceType<typeof ELK> | null = null;
function getElk() {
  _elk ??= new ELK();
  return _elk;
}

export interface ElkResult {
  positions: Record<string, { x: number; y: number }>;
  routes: Record<string, { x: number; y: number }[]>; // orthogonal poly-line per edge id
}

export async function elkLayout(
  graph: GraphModel,
  size: (id: string) => { w: number; h: number },
  dir: "RIGHT" | "DOWN" = "RIGHT",
): Promise<ElkResult> {
  const children = graph.nodes.map((n) => {
    const s = size(n.id);
    return { id: n.id, width: s.w, height: s.h };
  });
  const edges = graph.edges
    .filter((e) => e.source !== e.target)
    .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] }));

  const laid = await getElk().layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": dir,
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "120",
      "elk.spacing.nodeNode": "64",
      "elk.spacing.edgeNode": "28",
      "elk.spacing.edgeEdge": "18",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.mergeEdges": "false",
    },
    children,
    edges,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const c of laid.children ?? []) positions[c.id!] = { x: c.x ?? 0, y: c.y ?? 0 };

  const routes: Record<string, { x: number; y: number }[]> = {};
  for (const e of laid.edges ?? []) {
    const sec = e.sections?.[0];
    if (!sec) continue;
    routes[e.id!] = [sec.startPoint, ...(sec.bendPoints ?? []), sec.endPoint].map((p) => ({ x: p.x, y: p.y }));
  }
  return { positions, routes };
}

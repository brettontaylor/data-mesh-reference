import {
  BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useInternalNode, Position,
  type Edge, type EdgeProps,
} from "@xyflow/react";
import type { Tier } from "./data/types";
import { CORP, T } from "./theme";
import { getEdgeParams } from "./floating";

export interface RelEdgeData {
  tier: Tier;
  sourceField: string;
  targetField: string;
  points?: { x: number; y: number }[]; // ELK orthogonal route (source→…→target)
  [key: string]: unknown;
}
export type RelEdgeType = Edge<RelEdgeData, "rel">;

// Nudge a cardinality label inward along the connector so it clears the entity box.
const off = (pos: Position, gap = 16): [number, number] =>
  pos === Position.Left ? [-gap, 0]
  : pos === Position.Right ? [gap, 0]
  : pos === Position.Top ? [0, -gap]
  : [0, gap];

// A point `dist` px from `a` toward `b`.
function along(a: { x: number; y: number }, b: { x: number; y: number }, dist: number) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: a.x + (dx / len) * dist, y: a.y + (dy / len) * dist };
}

export function RelationshipEdge({ id, source, target, markerEnd, data }: EdgeProps<RelEdgeType>) {
  // Hooks must run unconditionally.
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  const color = CORP.edge;
  const card = (x: number, y: number, text: string) => (
    <div
      style={{
        position: "absolute", transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
        fontFamily: T.mono, fontSize: 10, fontWeight: 700, color, background: T.paper,
        border: `1px solid ${color}`, borderRadius: 4, padding: "0 4px", pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );

  const pts = data?.points;
  let path: string;
  let sLab: { x: number; y: number };
  let tLab: { x: number; y: number };

  if (pts && pts.length >= 2) {
    // ELK orthogonal route: sharp right-angle poly-line that avoids boxes.
    path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
    sLab = along(pts[0]!, pts[1]!, 16);
    tLab = along(pts[pts.length - 1]!, pts[pts.length - 2]!, 16);
  } else {
    // Fallback: floating smooth-step (until ELK routing arrives / for self-refs).
    if (!sourceNode?.measured?.width || !targetNode?.measured?.width) return null;
    const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);
    [path] = getSmoothStepPath({
      sourceX: sx, sourceY: sy, sourcePosition: sourcePos,
      targetX: tx, targetY: ty, targetPosition: targetPos, borderRadius: 0, offset: 26,
    });
    const os = off(sourcePos), ot = off(targetPos);
    sLab = { x: sx + os[0], y: sy + os[1] };
    tLab = { x: tx + ot[0], y: ty + ot[1] };
  }

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd}
        style={{ stroke: color, strokeWidth: 1.5, opacity: 0.9 }} />
      <EdgeLabelRenderer>
        {/* cardinality: many (0..*) at the FK holder, one (1) at the referenced PK */}
        {card(sLab.x, sLab.y, "0..*")}
        {card(tLab.x, tLab.y, "1")}
      </EdgeLabelRenderer>
    </>
  );
}

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import type { Tier } from "./data/types";
import { T, TIER_COLOR } from "./theme";

export interface RelEdgeData {
  tier: Tier;
  sourceField: string;
  targetField: string;
  [key: string]: unknown;
}
export type RelEdgeType = Edge<RelEdgeData, "rel">;

export function RelationshipEdge(props: EdgeProps<RelEdgeType>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, data } = props;
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const tier = data?.tier ?? "internal";
  const color = TIER_COLOR[tier];
  const dashed = tier === "restricted";

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

  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={markerEnd}
        style={{ stroke: color, strokeWidth: 1.5, strokeDasharray: dashed ? "5 4" : undefined, opacity: 0.85 }} />
      <EdgeLabelRenderer>
        {/* crow's-foot cardinality: many (∗) at the FK holder, one (1) at the referenced PK */}
        {card(sourceX + (targetX > sourceX ? 12 : -12), sourceY, "∗")}
        {card(targetX + (targetX > sourceX ? -12 : 12), targetY, "1")}
      </EdgeLabelRenderer>
    </>
  );
}

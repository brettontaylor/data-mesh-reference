// Floating-edge geometry: compute where an edge should attach on each node's border
// so it connects on the sides that FACE each other and never routes across a node body.
// (WineGraph-style edge routing.) Standard React Flow floating-edges math.
import { Position, type InternalNode, type Node } from "@xyflow/react";

function nodeCenter(n: InternalNode<Node>) {
  return {
    x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2,
    y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2,
  };
}

// Point on `node`'s border along the line toward `toward`.
function getNodeIntersection(node: InternalNode<Node>, toward: InternalNode<Node>) {
  const w = (node.measured.width ?? 0) / 2;
  const h = (node.measured.height ?? 0) / 2;
  const x2 = node.internals.positionAbsolute.x + w;
  const y2 = node.internals.positionAbsolute.y + h;
  const c1 = nodeCenter(toward);
  const xx1 = (c1.x - x2) / (2 * w) - (c1.y - y2) / (2 * h);
  const yy1 = (c1.x - x2) / (2 * w) + (c1.y - y2) / (2 * h);
  const a = 1 / (Math.abs(xx1) + Math.abs(yy1) || 1);
  const xx3 = a * xx1;
  const yy3 = a * yy1;
  return { x: w * (xx3 + yy3) + x2, y: h * (-xx3 + yy3) + y2 };
}

function getEdgePosition(node: InternalNode<Node>, p: { x: number; y: number }): Position {
  const nx = Math.round(node.internals.positionAbsolute.x);
  const ny = Math.round(node.internals.positionAbsolute.y);
  const w = node.measured.width ?? 0;
  const h = node.measured.height ?? 0;
  const px = Math.round(p.x);
  const py = Math.round(p.y);
  if (px <= nx + 1) return Position.Left;
  if (px >= nx + w - 1) return Position.Right;
  if (py <= ny + 1) return Position.Top;
  if (py >= ny + h - 1) return Position.Bottom;
  return Position.Top;
}

export function getEdgeParams(source: InternalNode<Node>, target: InternalNode<Node>) {
  const sp = getNodeIntersection(source, target);
  const tp = getNodeIntersection(target, source);
  return {
    sx: sp.x, sy: sp.y, tx: tp.x, ty: tp.y,
    sourcePos: getEdgePosition(source, sp),
    targetPos: getEdgePosition(target, tp),
  };
}

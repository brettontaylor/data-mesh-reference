"use client";
import {
  Background, Controls, ReactFlow, ReactFlowProvider,
  MarkerType, useEdgesState, useNodesState, useReactFlow,
  type Edge, type Node,
} from "@xyflow/react";
import { xyflowCss } from "./generated/xyflowCss";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityNode, type EntityNodeType } from "./EntityNode";
import { RelationshipEdge, type RelEdgeType, type RelEdgeData } from "./RelationshipEdge";
import { egoNetwork, toGraph } from "./data/toGraph";
import { layout } from "./layout";
import { elkLayout } from "./elk-layout";
import { ROLE_VIEWS, fieldVisible } from "./data/access";
import type { GraphModel, SourceModel } from "./data/types";
import { CORP, T, TIER_COLOR, TIER_LABEL } from "./theme";

export interface ErdExplorerProps {
  models: SourceModel[];
  /** Initial model kinds to show. Default: BDMs only. */
  kinds?: string[];
  /** CSS height of the canvas. Default 70vh. */
  height?: string;
  /** Entity id to open expanded + centered on load (deep-link from a model page). */
  initialFocus?: string;
  /** Stripped-back thumbnail: no toolbar/legend/zoom-controls, just the diagram + a
   *  floating Open-full-ERD / Fullscreen control. */
  compact?: boolean;
  /** URL for the "Open full ERD" control (used in compact mode). */
  openHref?: string;
}

const nodeTypes = { entity: EntityNode };
const edgeTypes = { rel: RelationshipEdge };
// Approximate node dimensions so the layout reserves real space and expanded entities
// push neighbours apart instead of overlapping them.
const NODE_W = 256, HDR_H = 46, COLLAPSED_H = 80, ROW_H = 26, NOTE_H = 22;

// Inject React Flow's stylesheet once (bundled as raw text — see tsup loader).
let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  stylesInjected = true;
  const el = document.createElement("style");
  el.setAttribute("data-dct-erd", "");
  el.textContent = xyflowCss;
  document.head.appendChild(el);
}

function btn(active = false): React.CSSProperties {
  return {
    fontFamily: T.mono, fontSize: 11, padding: "5px 9px", borderRadius: 6, cursor: "pointer",
    border: `1px solid ${active ? T.accent : T.line}`, color: active ? T.accent : T.ink,
    background: active ? `${T.accent}12` : T.paper,
  };
}
const sel: React.CSSProperties = {
  fontFamily: T.mono, fontSize: 11, padding: "5px 9px", borderRadius: 6,
  border: `1px solid ${T.line}`, color: T.ink, background: T.paper,
};

function Inner({ models, kinds, height, initialFocus, compact, openHref }: Required<Pick<ErdExplorerProps, "models">> & ErdExplorerProps) {
  const [kindFilter, setKindFilter] = useState<string[]>(kinds ?? ["bdm"]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialFocus ? [initialFocus] : []));
  const [roleId, setRoleId] = useState<string>("compliance");
  const [focus, setFocus] = useState<string | null>(initialFocus ?? null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<string | null>(initialFocus ?? null); // entity to recenter on after next layout
  const { fitView } = useReactFlow();
  ensureStyles();

  const role = useMemo(() => ROLE_VIEWS.find((r) => r.id === roleId) ?? ROLE_VIEWS[4]!, [roleId]);
  const graph: GraphModel = useMemo(() => toGraph(models, { kinds: kindFilter }), [models, kindFilter]);

  // Size a node by its state so the layout reserves real space (expanded → taller →
  // neighbours get pushed apart instead of overlapped).
  const sizeOf = useCallback((id: string) => {
    const n = graph.nodes.find((x) => x.id === id);
    if (!n || !expanded.has(id)) return { w: NODE_W, h: COLLAPSED_H };
    const anyMasked = n.data.fields.some((f) => !fieldVisible(f, role));
    return { w: NODE_W, h: HDR_H + n.data.fields.length * ROW_H + (anyMasked ? NOTE_H : 0) };
  }, [graph, expanded, role]);

  const onToggle = useCallback((id: string) => {
    centerRef.current = id; // recenter on it after the reflow (handled in the layout effect)
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const fitAll = useCallback(() => fitView({ padding: 0.15, duration: 400 }), [fitView]);
  const onFocus = useCallback((id: string) => { centerRef.current = id; setFocus(id); }, []);
  const fitTo = useCallback((id: string | null) => {
    if (id) fitView({ nodes: [...egoNetwork(graph, id)].map((n) => ({ id: n })), padding: 0.28, duration: 400, maxZoom: 1.0 });
    else fitView({ padding: 0.15, duration: 400 });
  }, [fitView, graph]);

  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RelEdgeType>([]);

  // STRUCT — build node/edge objects with immediate (simple) positions on graph change.
  useEffect(() => {
    const pos = layout(graph, sizeOf, { dir: "LR" });
    setNodes(graph.nodes.map((n) => ({
      id: n.id, type: "entity", position: pos[n.id] ?? { x: 0, y: 0 },
      data: { ...n.data, expanded: expanded.has(n.id), role, focused: n.id === focus, dimmed: false, onToggle, onFocus },
    })));
    setEdges(graph.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, type: "rel",
      markerEnd: { type: MarkerType.ArrowClosed, color: CORP.edge, width: 16, height: 16 },
      data: { tier: e.tier, sourceField: e.sourceField, targetField: e.targetField },
    })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // LAYOUT — ELK layered + orthogonal routing (async); reflows on expand/role/focus and
  // falls back to the simple layout if ELK rejects.
  useEffect(() => {
    let cancelled = false;
    const apply = (positions: Record<string, { x: number; y: number }>, routes?: Record<string, { x: number; y: number }[]>) => {
      if (cancelled) return;
      setNodes((nds) => nds.map((n) => ({ ...n, position: positions[n.id] ?? n.position })));
      setEdges((eds) => eds.map((e) => ({ ...e, data: { ...(e.data as RelEdgeData), points: routes?.[e.id] } })));
      const c = centerRef.current ?? focus;
      centerRef.current = null;
      setTimeout(() => fitTo(c), 40);
    };
    elkLayout(graph, sizeOf, "RIGHT")
      .then((r) => apply(r.positions, r.routes))
      .catch(() => apply(layout(graph, sizeOf, { dir: "LR" }), undefined));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, expanded, roleId, focus]);

  // DATA — refresh per-node expand/role/focus/dim flags + edge visibility.
  useEffect(() => {
    const ego = focus ? egoNetwork(graph, focus) : null;
    setNodes((nds) => nds.map((n) => ({
      ...n, data: { ...n.data, expanded: expanded.has(n.id), role, focused: n.id === focus, dimmed: ego ? !ego.has(n.id) : false },
    })));
    setEdges((eds) => eds.map((e) => ({ ...e, hidden: ego ? !(ego.has(e.source) && ego.has(e.target)) : false })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, roleId, focus]);

  const fullscreen = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  }, []);

  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 12, overflow: "hidden", background: T.paper }}>
      {/* toolbar (hidden in compact mode) */}
      {!compact && (
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 10, borderBottom: `1px solid ${T.line}`, background: T.paperSoft }}>
        <select style={sel} value={focus ?? ""} onChange={(e) => { const v = e.target.value || null; centerRef.current = v; setFocus(v); }} title="Focus an entity (explore mode)">
          <option value="">Focus entity…</option>
          {graph.nodes.map((n) => <option key={n.id} value={n.id}>{n.id}</option>)}
        </select>
        {focus && <button style={btn()} onClick={() => setFocus(null)}>Clear focus</button>}
        <span style={{ width: 1, height: 20, background: T.line }} />
        <label style={{ fontFamily: T.mono, fontSize: 10.5, color: T.muted }}>View as</label>
        <select style={sel} value={roleId} onChange={(e) => setRoleId(e.target.value)} title="Mask attributes by role clearance">
          {ROLE_VIEWS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <span style={{ width: 1, height: 20, background: T.line }} />
        <button style={btn(kindFilter.length === 1)} onClick={() => setKindFilter(["bdm"])}>BDM</button>
        <button style={btn(kindFilter.length > 1)} onClick={() => setKindFilter(["bdm", "pdm", "semantic", "source"])}>All</button>
        <span style={{ width: 1, height: 20, background: T.line }} />
        <button style={btn()} onClick={() => setExpanded(new Set(graph.nodes.map((n) => n.id)))}>Expand all</button>
        <button style={btn()} onClick={() => setExpanded(new Set())}>Collapse all</button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button style={btn()} onClick={fitAll} title="Show the whole model">Fit model</button>
          <button style={btn()} onClick={fullscreen}>Fullscreen</button>
        </div>
      </div>
      )}

      {/* canvas */}
      <div ref={wrapRef} style={{ position: "relative", height: height ?? "70vh", background: T.paper }}>
        {compact && (
          <div style={{ position: "absolute", top: 8, right: 8, zIndex: 5, display: "flex", gap: 6 }}>
            {openHref && (
              <a href={openHref} style={{ ...btn(), textDecoration: "none" }} title="Open the full ERD">Open full ERD ↗</a>
            )}
            <button style={btn()} onClick={fullscreen} title="Fullscreen">⛶ Fullscreen</button>
          </div>
        )}
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          fitView minZoom={0.2} maxZoom={2} proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "rel" }}
          zoomOnScroll zoomOnPinch zoomOnDoubleClick panOnDrag
        >
          <Background color={T.line} gap={20} />
          {!compact && <Controls showInteractive={false} />}
        </ReactFlow>
      </div>

      {/* legend (hidden in compact mode) */}
      {!compact && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "8px 12px", borderTop: `1px solid ${T.line}`, background: T.paperSoft, fontFamily: T.mono, fontSize: 10.5, color: T.muted }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 10, background: CORP.pkRow, border: `1px solid ${CORP.border}`, borderRadius: 2 }} /> PK (primary key)
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 12, height: 10, background: CORP.bkRow, border: `1px solid ${CORP.border}`, borderRadius: 2 }} /> BK (business key)
        </span>
        <span><b style={{ color: "#2a5aa0" }}>FK→</b> foreign key · click to traverse</span>
        <span>cardinality: <b>1</b> — <b>0..*</b></span>
        {(Object.keys(TIER_LABEL) as (keyof typeof TIER_LABEL)[]).map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: TIER_COLOR[t] }} /> {TIER_LABEL[t]}
          </span>
        ))}
      </div>
      )}
    </div>
  );
}

export function ErdExplorer(props: ErdExplorerProps) {
  return (
    <ReactFlowProvider>
      <Inner {...props} />
    </ReactFlowProvider>
  );
}

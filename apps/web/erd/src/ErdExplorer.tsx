"use client";
import {
  Background, Controls, MiniMap, ReactFlow, ReactFlowProvider,
  MarkerType, useEdgesState, useNodesState, useReactFlow,
  type Edge, type Node,
} from "@xyflow/react";
import { xyflowCss } from "./generated/xyflowCss";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EntityNode, type EntityNodeType } from "./EntityNode";
import { RelationshipEdge, type RelEdgeType } from "./RelationshipEdge";
import { egoNetwork, toGraph } from "./data/toGraph";
import { layout } from "./layout";
import { ROLE_VIEWS } from "./data/access";
import type { GraphModel, SourceModel } from "./data/types";
import { T, TIER_COLOR, TIER_LABEL } from "./theme";

export interface ErdExplorerProps {
  models: SourceModel[];
  /** Initial model kinds to show. Default: BDMs only. */
  kinds?: string[];
  /** CSS height of the canvas. Default 70vh. */
  height?: string;
}

const nodeTypes = { entity: EntityNode };
const edgeTypes = { rel: RelationshipEdge };
const COLLAPSED = { w: 248, h: 104 };

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

function Inner({ models, kinds, height }: Required<Pick<ErdExplorerProps, "models">> & ErdExplorerProps) {
  const [kindFilter, setKindFilter] = useState<string[]>(kinds ?? ["bdm"]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [roleId, setRoleId] = useState<string>("compliance");
  const [focus, setFocus] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();
  ensureStyles();

  const role = useMemo(() => ROLE_VIEWS.find((r) => r.id === roleId) ?? ROLE_VIEWS[4]!, [roleId]);
  const graph: GraphModel = useMemo(() => toGraph(models, { kinds: kindFilter }), [models, kindFilter]);

  const onToggle = useCallback((id: string) => {
    setExpanded((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }, []);
  const onFocus = useCallback((id: string) => setFocus(id), []);

  const [nodes, setNodes, onNodesChange] = useNodesState<EntityNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<RelEdgeType>([]);

  // Effect A — structural rebuild + layout (only when the graph itself changes).
  useEffect(() => {
    const pos = layout(graph, () => COLLAPSED, { dir: "LR" });
    const ns: EntityNodeType[] = graph.nodes.map((n) => ({
      id: n.id, type: "entity", position: pos[n.id] ?? { x: 0, y: 0 },
      data: { ...n.data, expanded: false, role, focused: false, dimmed: false, onToggle, onFocus },
    }));
    const es: RelEdgeType[] = graph.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, type: "rel",
      markerEnd: { type: MarkerType.ArrowClosed, color: TIER_COLOR[e.tier], width: 16, height: 16 },
      data: { tier: e.tier, sourceField: e.sourceField, targetField: e.targetField },
    }));
    setNodes(ns); setEdges(es);
    setTimeout(() => fitView({ padding: 0.15, duration: 300 }), 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph]);

  // Effect B — refresh per-node data (expand / role / focus) without losing drag positions.
  useEffect(() => {
    const ego = focus ? egoNetwork(graph, focus) : null;
    setNodes((nds) => nds.map((n) => ({
      ...n,
      data: { ...n.data, expanded: expanded.has(n.id), role, focused: n.id === focus, dimmed: ego ? !ego.has(n.id) : false },
    })));
    setEdges((eds) => eds.map((e) => ({
      ...e, hidden: ego ? !(ego.has(e.source) && ego.has(e.target)) : false,
    })));
    if (focus) setTimeout(() => fitView({ nodes: [{ id: focus }], padding: 0.4, duration: 400, maxZoom: 1.3 }), 20);
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
      {/* toolbar */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 10, borderBottom: `1px solid ${T.line}`, background: T.paperSoft }}>
        <select style={sel} value={focus ?? ""} onChange={(e) => setFocus(e.target.value || null)} title="Focus an entity (explore mode)">
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
          <button style={btn()} onClick={fullscreen}>Fullscreen</button>
        </div>
      </div>

      {/* canvas */}
      <div ref={wrapRef} style={{ height: height ?? "70vh", background: T.paper }}>
        <ReactFlow
          nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          fitView minZoom={0.2} maxZoom={2} proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: "rel" }}
        >
          <Background color={T.line} gap={20} />
          <Controls showInteractive={false} />
          <MiniMap pannable zoomable nodeColor={() => T.accent} maskColor="rgba(13,27,42,0.06)" style={{ background: T.paperSoft }} />
        </ReactFlow>
      </div>

      {/* legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "8px 12px", borderTop: `1px solid ${T.line}`, background: T.paperSoft, fontFamily: T.mono, fontSize: 10.5, color: T.muted }}>
        <span><b style={{ color: T.brass }}>PK</b> primary key</span>
        <span><b style={{ color: T.accent }}>FK→</b> foreign key · click to traverse</span>
        <span style={{ marginLeft: 4 }}>edges: <b>∗</b> many → <b>1</b> one</span>
        {(Object.keys(TIER_LABEL) as (keyof typeof TIER_LABEL)[]).map((t) => (
          <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: TIER_COLOR[t] }} /> {TIER_LABEL[t]}
          </span>
        ))}
        <span style={{ color: T.restricted }}>restricted edges dashed</span>
      </div>
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

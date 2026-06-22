import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { fieldVisible, type RoleView } from "./data/access";
import { asTier, type FieldView } from "./data/types";
import { T, TIER_COLOR } from "./theme";

export interface EntityNodeData {
  id: string;
  kind: string;
  domain: string;
  version: string;
  fields: FieldView[];
  expanded: boolean;
  role: RoleView;
  focused: boolean;
  dimmed: boolean;
  onToggle: (id: string) => void;
  onFocus: (id: string) => void;
  [key: string]: unknown;
}
export type EntityNodeType = Node<EntityNodeData, "entity">;

const pill = (bg: string, fg: string): React.CSSProperties => ({
  fontFamily: T.mono, fontSize: 9, fontWeight: 700, lineHeight: 1, letterSpacing: "0.04em",
  padding: "2px 5px", borderRadius: 4, background: bg, color: fg, whiteSpace: "nowrap",
});

function Dot({ tier }: { tier: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: 99, background: TIER_COLOR[asTier(tier)], display: "inline-block", flex: "none" }} />;
}

export function EntityNode({ data }: NodeProps<EntityNodeType>) {
  const d = data;
  const visible = d.fields.filter((f) => fieldVisible(f, d.role));
  const pk = d.fields.find((f) => f.isPk);

  return (
    <div
      onClick={() => d.onToggle(d.id)}
      style={{
        width: 248, fontFamily: T.sans, cursor: "pointer", opacity: d.dimmed ? 0.28 : 1,
        background: T.paper, border: `1.5px solid ${d.focused ? T.accent : T.line}`,
        borderRadius: 10, boxShadow: d.focused ? `0 0 0 3px ${T.accent}22` : "0 1px 3px rgba(13,27,42,0.10)",
        transition: "opacity .15s, box-shadow .15s, border-color .15s", overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: T.muted, border: "none", width: 7, height: 7 }} />
      <Handle type="source" position={Position.Right} style={{ background: T.muted, border: "none", width: 7, height: 7 }} />

      {/* header */}
      <div style={{ padding: "9px 11px", background: T.paperSoft, borderBottom: `1px solid ${T.line}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: T.ink }}>{d.id}</span>
          <span style={pill(`${T.accent}1a`, T.accent)}>{d.kind.toUpperCase()}</span>
        </div>
        <div style={{ marginTop: 3, fontSize: 10.5, color: T.muted }}>
          {d.domain} · v{d.version} · {d.fields.length} fields
        </div>
      </div>

      {/* body */}
      {!d.expanded ? (
        <div style={{ padding: "8px 11px", display: "flex", alignItems: "center", gap: 7 }}>
          {pk && (
            <>
              <span style={pill(`${T.brass}26`, T.brass)}>PK</span>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: T.ink }}>{pk.name}</span>
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: 10, color: T.muted }}>click to expand ▾</span>
        </div>
      ) : (
        <div style={{ padding: "5px 0" }}>
          {d.fields.map((f) => {
            const shown = fieldVisible(f, d.role);
            const isFk = !!f.fkRef;
            return (
              <div
                key={f.name}
                onClick={(e) => { if (shown && f.fkTarget) { e.stopPropagation(); d.onFocus(f.fkTarget); } }}
                title={shown ? (isFk ? `FK → ${f.fkRef}` : f.type) : "masked at this clearance"}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "3px 11px",
                  cursor: shown && f.fkTarget ? "pointer" : "default", opacity: shown ? 1 : 0.4,
                }}
              >
                <Dot tier={f.classification} />
                <span style={{
                  fontFamily: T.mono, fontSize: 11, color: T.ink, flex: "none",
                  textDecoration: shown ? "none" : "line-through",
                }}>{f.name}</span>
                {f.isPk && <span style={pill(`${T.brass}26`, T.brass)}>PK</span>}
                {isFk && shown && <span style={pill(`${T.accent}1a`, T.accent)}>FK→{f.fkTarget}</span>}
                {f.pii && <span style={pill(`${T.pii}22`, T.pii)}>PII</span>}
                {f.mnpi && <span style={pill(`${T.mnpi}26`, T.mnpi)}>MNPI</span>}
                <span style={{ marginLeft: "auto", fontSize: 9.5, color: T.muted, fontFamily: T.mono }}>
                  {shown ? f.type : "•••"}
                </span>
              </div>
            );
          })}
          {visible.length < d.fields.length && (
            <div style={{ padding: "4px 11px 2px", fontSize: 9.5, color: T.muted }}>
              {d.fields.length - visible.length} field(s) masked at {d.role.label} clearance
            </div>
          )}
        </div>
      )}
    </div>
  );
}

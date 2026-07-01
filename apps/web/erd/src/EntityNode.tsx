import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { fieldVisible, type RoleView } from "./data/access";
import { asTier, type FieldView } from "./data/types";
import { CORP, T, TIER_COLOR } from "./theme";

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
  padding: "2px 5px", borderRadius: 3, background: bg, color: fg, whiteSpace: "nowrap",
});

function Dot({ tier }: { tier: string }) {
  return <span style={{ width: 7, height: 7, borderRadius: 99, background: TIER_COLOR[asTier(tier)], display: "inline-block", flex: "none" }} />;
}

// Row background follows the canonical scheme: PK = light blue, business key = light green.
const rowBg = (f: FieldView): string => (f.isPk ? CORP.pkRow : f.bk ? CORP.bkRow : CORP.body);

export function EntityNode({ data }: NodeProps<EntityNodeType>) {
  const d = data;
  const visible = d.fields.filter((f) => fieldVisible(f, d.role));
  const pk = d.fields.find((f) => f.isPk);

  return (
    <div
      onClick={() => d.onToggle(d.id)}
      style={{
        width: 256, fontFamily: T.sans, cursor: "pointer", opacity: d.dimmed ? 0.3 : 1,
        background: CORP.body, border: `1.5px solid ${d.focused ? CORP.focus : CORP.outline}`,
        borderRadius: 2, boxShadow: d.focused ? `0 0 0 3px ${CORP.focus}33` : "0 1px 2px rgba(23,43,77,0.10)",
        transition: "opacity .15s, box-shadow .15s, border-color .15s", overflow: "hidden",
      }}
    >
      {/* Handles exist so edges instantiate, but are hidden — RelationshipEdge is a
          floating edge that computes its own border-attachment points. */}
      <Handle type="target" position={Position.Left} style={{ opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: "none" }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: "none" }} />

      {/* header — light blue, corporate ER style */}
      <div style={{ padding: "8px 11px", background: CORP.body, borderBottom: `1px solid ${CORP.outline}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
          <span style={{ fontFamily: T.mono, fontSize: 13, fontWeight: 700, color: CORP.headerText }}>{d.id}</span>
          <span style={pill(CORP.pkRow, CORP.pkText)}>{d.kind.toUpperCase()}</span>
        </div>
        <div style={{ marginTop: 3, fontSize: 10.5, color: CORP.muted }}>
          {d.domain} · v{d.version} · {d.fields.length} fields
        </div>
      </div>

      {/* body */}
      {!d.expanded ? (
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 11px", background: pk ? rowBg(pk) : CORP.body }}>
          {pk && (
            <>
              <span style={pill(CORP.pkRow, CORP.pkText)}>PK</span>
              <span style={{ fontFamily: T.mono, fontSize: 11, color: CORP.text }}>{pk.name}</span>
            </>
          )}
          <span style={{ marginLeft: "auto", fontSize: 10, color: CORP.muted }}>click to expand ▾</span>
        </div>
      ) : (
        <div>
          {d.fields.map((f) => {
            const shown = fieldVisible(f, d.role);
            const isFk = !!f.fkRef;
            return (
              <div
                key={f.name}
                onClick={(e) => { if (shown && f.fkTarget) { e.stopPropagation(); d.onFocus(f.fkTarget); } }}
                title={shown ? (isFk ? `FK → ${f.fkRef}` : f.type) : "masked at this clearance"}
                style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "4px 11px",
                  background: shown ? rowBg(f) : CORP.body,
                  borderBottom: `1px solid ${CORP.header}`,
                  cursor: shown && f.fkTarget ? "pointer" : "default", opacity: shown ? 1 : 0.45,
                }}
              >
                <Dot tier={f.classification} />
                <span style={{
                  fontFamily: T.mono, fontSize: 11, color: CORP.text, flex: "none",
                  textDecoration: shown ? "none" : "line-through",
                }}>{f.name}</span>
                {f.isPk && <span style={pill(CORP.pkRow, CORP.pkText)}>PK</span>}
                {f.bk && !f.isPk && <span style={pill(CORP.bkRow, CORP.bkText)}>BK</span>}
                {isFk && shown && <span style={pill("#e8f0fe", "#2a5aa0")}>FK→{f.fkTarget}</span>}
                {f.pii && <span style={pill(`${T.pii}22`, T.pii)}>PII</span>}
                {f.mnpi && <span style={pill(`${T.mnpi}26`, T.mnpi)}>MNPI</span>}
                <span style={{ marginLeft: "auto", fontSize: 9.5, color: CORP.muted, fontFamily: T.mono }}>
                  {shown ? f.type : "•••"}
                </span>
              </div>
            );
          })}
          {visible.length < d.fields.length && (
            <div style={{ padding: "4px 11px", fontSize: 9.5, color: CORP.muted }}>
              {d.fields.length - visible.length} field(s) masked at {d.role.label} clearance
            </div>
          )}
        </div>
      )}
    </div>
  );
}

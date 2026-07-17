import { Link } from "react-router";
import type { CSSProperties } from "react";
import type { Catalog, FlowNode, FlowStage } from "../lib/api";
import "./MedallionFlow.css";

/** Stable, muted hue per domain id — subtle tint only (see design system). */
const DOMAIN_HUES: Record<string, number> = {
  reference: 210,
  trading: 145,
  analytics: 265,
  consumption: 25,
  platform: 190,
  governance: 330,
};
function domainHue(domain: string): number {
  const known = DOMAIN_HUES[domain];
  if (known !== undefined) return known;
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) % 360;
  return h;
}

interface StageMeta {
  stage: FlowStage;
  kicker: string;
}
const STAGES: StageMeta[] = [
  { stage: "bronze", kicker: "BRONZE — sources" },
  { stage: "silver", kicker: "SILVER — conformed (BDM)" },
  { stage: "gold", kicker: "GOLD — serving" },
];

/** Sort nodes so same-domain products cluster within a column. */
function byDomainThenId(a: FlowNode, b: FlowNode): number {
  return a.domain.localeCompare(b.domain) || a.id.localeCompare(b.id);
}

function NodeCard({ node, linkTo }: { node: FlowNode; linkTo: string | null }) {
  const hue = domainHue(node.domain);
  const style = { "--mf-hue": String(hue) } as CSSProperties;
  const body = (
    <>
      <span className="mf-node-id">{node.id}</span>
      <span className="mf-node-kind">{node.kind}</span>
    </>
  );
  if (linkTo) {
    return (
      <Link className="mf-node mf-node-link" to={linkTo} style={style} title={`${node.label} · ${node.domain}`}>
        {body}
      </Link>
    );
  }
  return (
    <div className="mf-node mf-node-static" style={style} title={`${node.label} · ${node.domain}`}>
      {body}
    </div>
  );
}

function Column({ meta, nodes }: { meta: StageMeta; nodes: FlowNode[] }) {
  const sorted = [...nodes].sort(byDomainThenId);
  return (
    <div className={`mf-col mf-col-${meta.stage}`}>
      <div className="mf-col-head">
        <p className="mf-col-kicker">{meta.kicker}</p>
        <span className="mf-col-count">{sorted.length}</span>
      </div>
      <div className="mf-nodes">
        {sorted.map((node) => (
          <NodeCard
            key={`${node.kind}-${node.id}`}
            node={node}
            // Silver/Gold assets resolve to a detail page; bronze sources are non-link.
            linkTo={meta.stage === "bronze" ? null : `/assets/${node.kind}/${node.id}`}
          />
        ))}
      </div>
    </div>
  );
}

function Arrow() {
  return (
    <div className="mf-arrow" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

/** The hero visual: products flow Bronze → Silver → Gold, left to right. */
export default function MedallionFlow({ flow }: { flow: Catalog["flow"] }) {
  return (
    <div className="mf">
      <div className="mf-track">
        {STAGES.map((meta, i) => (
          <div className="mf-cell" key={meta.stage}>
            {i > 0 && <Arrow />}
            <Column meta={meta} nodes={flow[meta.stage]} />
          </div>
        ))}
      </div>
    </div>
  );
}

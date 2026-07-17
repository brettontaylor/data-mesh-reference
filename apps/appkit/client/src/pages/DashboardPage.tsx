import type { CSSProperties, KeyboardEvent } from "react";
import { Link, useNavigate } from "react-router";
import { getCatalog } from "../lib/api";
import type { DomainOverview } from "../lib/api";
import { useApi } from "../lib/useApi";
import { ErrorNote, Loading } from "../lib/ui";
import { PageHeader, Section } from "../lib/page";
import MedallionFlow from "./MedallionFlow";
import "./DashboardPage.css";

/** Governed asset kinds in narrative order — org kinds (domain/product) excluded. */
const KIND_ORDER = [
  "bdm",
  "pdm",
  "semantic",
  "mapping",
  "dq",
  "dqrule",
  "extract",
  "transformation",
  "refmap",
];

function kindBreakdown(byKind: Record<string, number>): string {
  return KIND_ORDER.filter((k) => (byKind[k] ?? 0) > 0)
    .map((k) => `${byKind[k]} ${k}`)
    .join(" · ");
}

/** Stable, muted hue per domain id (mirrors MedallionFlow tinting). */
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

function DomainCard({ d }: { d: DomainOverview }) {
  const nav = useNavigate();
  const cardTo = `/registry?domain=${encodeURIComponent(d.domain)}`;
  const style = { "--mf-hue": String(domainHue(d.domain)) } as CSSProperties;

  const go = () => nav(cardTo);
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go();
    }
  };

  return (
    <div
      className="cat-card"
      style={style}
      role="link"
      tabIndex={0}
      onClick={go}
      onKeyDown={onKey}
    >
      <div className="cat-card-head">
        <h3 className="cat-card-title">{d.label ?? d.domain}</h3>
        <span className="chip chip-muted">v{d.version}</span>
      </div>

      {d.description && <p className="cat-card-desc">{d.description}</p>}

      <div className="cat-card-stats">
        <span>
          <strong>{d.productCount}</strong> {d.productCount === 1 ? "product" : "products"}
        </span>
        <span className="cat-dot">·</span>
        <span>
          <strong>{d.assetCount}</strong> {d.assetCount === 1 ? "asset" : "assets"}
        </span>
      </div>

      {d.products.length > 0 && (
        <div className="cat-card-products">
          {d.products.map((p) => (
            <Link
              key={p.product}
              className="chip chip-accent cat-product-chip"
              to={`/registry?product=${encodeURIComponent(p.product)}`}
              onClick={(e) => e.stopPropagation()}
              title={`${p.label} · v${p.version} · ${p.memberCount} members`}
            >
              {p.product}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const cat = useApi(() => getCatalog(), []);

  return (
    <div className="page">
      {cat.loading && <Loading />}
      {cat.error && <ErrorNote message={cat.error} onRetry={cat.reload} />}

      {cat.data && (
        <>
          <PageHeader
            kicker="CATALOG"
            title={`${cat.data.totals.assets} models across ${cat.data.totals.domains} domains`}
            sub={`Live from the governed contract — ${kindBreakdown(cat.data.totals.byKind)}`}
          />

          <MedallionFlow flow={cat.data.flow} />

          <Section kicker="DOMAINS">
            <div className="cat-domains">
              {cat.data.domains.map((d) => (
                <DomainCard key={d.domain} d={d} />
              ))}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

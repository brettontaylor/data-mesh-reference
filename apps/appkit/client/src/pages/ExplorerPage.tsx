import "./Explorer.css";
import { useMemo, useState } from "react";
import { ErdExplorer, type SourceModel } from "../vendor/erd/erd";
import { getCatalog, getErdModels, getRegistry } from "../lib/api";
import { Breadcrumbs, PageHeader } from "../lib/page";
import { useApi } from "../lib/useApi";
import { ErrorNote, Loading } from "../lib/ui";

const ALL = "__all__";

/** Interactive data-model explorer — the vendored, pre-built ERD (React Flow +
 *  layered orthogonal layout) over the live contract, with a domain / product
 *  overlay that narrows the diagram to a slice of the governed model. */
export default function ExplorerPage() {
  const erd = useApi(() => getErdModels(), []);
  const registry = useApi(() => getRegistry(), []);
  const catalog = useApi(() => getCatalog(), []);

  const [domain, setDomain] = useState<string>(ALL);
  const [product, setProduct] = useState<string>(ALL);

  const models = erd.data?.models ?? null;

  // registry row → domain / product membership, keyed by "kind:id".
  const membership = useMemo(() => {
    const dom = new Map<string, string>();
    const prod = new Map<string, string | undefined>();
    for (const r of registry.data?.rows ?? []) {
      dom.set(`${r.kind}:${r.id}`, r.domain);
      prod.set(`${r.kind}:${r.id}`, r.product);
    }
    return { dom, prod };
  }, [registry.data]);

  // Domain options: the registry's domains, kept to those that actually carry
  // an ERD entity so every choice yields a non-empty diagram.
  const domainOptions = useMemo(() => {
    const present = new Set((models ?? []).map((m) => membership.dom.get(`${m.kind}:${m.id}`) ?? m.domain));
    return (registry.data?.domains ?? []).filter((d) => present.has(d));
  }, [models, membership, registry.data]);

  // Product options: distinct products from the catalog (id + label).
  const productOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of catalog.data?.domains ?? []) {
      for (const p of d.products) {
        if (!seen.has(p.product)) seen.set(p.product, p.label ?? p.product);
      }
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  }, [catalog.data]);

  const filtered: SourceModel[] | null = useMemo(() => {
    if (!models) return null;
    return models.filter((m) => {
      const key = `${m.kind}:${m.id}`;
      if (domain !== ALL) {
        const d = membership.dom.get(key) ?? m.domain;
        if (d !== domain) return false;
      }
      if (product !== ALL) {
        if (membership.prod.get(key) !== product) return false;
      }
      return true;
    });
  }, [models, membership, domain, product]);

  const error = erd.error;
  const activeFilter = domain !== ALL || product !== ALL;

  return (
    <div className="page">
      <Breadcrumbs
        items={[{ label: "Dashboard", to: "/" }, { label: "Data Model" }]}
      />
      <PageHeader
        kicker="DATA MODEL"
        title="Model explorer"
        sub="Interactive ERD over the governed contract — expand entities for fields (PK / FK / classification / PII), follow foreign keys, and slice by domain or data product."
      />

      {error && <ErrorNote message={error} onRetry={erd.reload} />}
      {!models && !error && <Loading />}

      {models && (
        <>
          <div className="exp-filters">
            <label className="exp-field">
              <span className="exp-field-label">Domain</span>
              <select
                className="input exp-select"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                <option value={ALL}>All domains</option>
                {domainOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="exp-field">
              <span className="exp-field-label">Product</span>
              <select
                className="input exp-select"
                value={product}
                onChange={(e) => setProduct(e.target.value)}
              >
                <option value={ALL}>All products</option>
                {productOptions.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <span className="exp-count muted">
              {(filtered ?? []).length} of {models.length} entities
              {activeFilter && (
                <button
                  type="button"
                  className="btn btn-small exp-clear"
                  onClick={() => {
                    setDomain(ALL);
                    setProduct(ALL);
                  }}
                >
                  Clear
                </button>
              )}
            </span>
          </div>

          {filtered && filtered.length > 0 ? (
            <div className="erd-host">
              <ErdExplorer models={filtered} height="70vh" />
            </div>
          ) : (
            <p className="muted exp-empty">
              No entities match this domain / product combination.
            </p>
          )}
        </>
      )}
    </div>
  );
}

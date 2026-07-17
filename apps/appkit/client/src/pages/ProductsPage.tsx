import { useState } from "react";
import { Link } from "react-router";
import type { Product, Run } from "../lib/api";
import { getProducts, listRuns } from "../lib/api";
import {
  ErrorNote,
  IssueList,
  Loading,
  StatusChip,
  fmtDate,
  fmtDuration,
} from "../lib/ui";
import { useApi } from "../lib/useApi";

export default function ProductsPage() {
  const products = useApi(() => getProducts(), []);
  const runs = useApi(() => listRuns(), []);

  const incrementRuns = (runs.data ?? [])
    .filter((r) => r.trigger === "product-increment")
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  return (
    <div className="page">
      <h2>Data products</h2>
      <div className="banner">
        <div>
          <span className="banner-title">Products version independently</span>
          <div className="muted banner-sub">
            Any merged change to a member asset increments the product on its own semver
            line — <strong>minor</strong> for tier-1 changes, <strong>major</strong> for
            tier-2/breaking — and triggers a full re-run checked into git.
          </div>
        </div>
      </div>

      {products.loading && <Loading />}
      {products.error && <ErrorNote message={products.error} onRetry={products.reload} />}

      {products.data && (
        <div className="product-cards">
          {products.data.length === 0 && (
            <p className="muted">No data products defined in the contract.</p>
          )}
          {products.data.map((p) => (
            <ProductCard key={p.product} product={p} />
          ))}
        </div>
      )}

      <div className="panel table-panel">
        <div className="panel-head">
          <h3>Product-increment runs</h3>
          <Link to="/pipelines" className="muted small-link">
            all runs →
          </Link>
        </div>
        {runs.loading && <Loading />}
        {runs.error && <ErrorNote message={runs.error} onRetry={runs.reload} />}
        {runs.data && (
          <IncrementRunTable runs={incrementRuns} />
        )}
      </div>
    </div>
  );
}

function ProductCard({ product: p }: { product: Product }) {
  return (
    <div className="product-card">
      <div className="product-head">
        <div>
          <div className="product-name">{p.label ?? p.product}</div>
          <code className="mono-id">{p.product}</code>
        </div>
        <span className="version-badge" title="Product version — incremented automatically on merge">
          v{p.version}
        </span>
      </div>
      <div className="product-meta">
        <span className="chip chip-muted domain-chip">{p.domain}</span>
        <StatusChip status={p.status} />
        {p.owner && <span className="muted">owner: {p.owner}</span>}
      </div>
      {p.description && <p className="product-desc muted">{p.description}</p>}
      <div className="product-members-head muted">
        {p.memberCount} member asset{p.memberCount === 1 ? "" : "s"}
      </div>
      <div className="product-members">
        {p.includes.map((m) => (
          <Link
            key={`${m.kind}/${m.id}`}
            to={`/assets/${m.kind}/${m.id}`}
            className="chip chip-muted member-chip"
            title={`${m.kind}/${m.id}`}
          >
            <span className="member-kind">{m.kind}</span> {m.id}
          </Link>
        ))}
      </div>
    </div>
  );
}

function IncrementRunTable({ runs }: { runs: Run[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th></th>
          <th>Run</th>
          <th>Products</th>
          <th>Status</th>
          <th>Merged by</th>
          <th>Started</th>
          <th>Duration</th>
        </tr>
      </thead>
      <tbody>
        {runs.length === 0 && (
          <tr>
            <td colSpan={7} className="muted">
              No product-increment runs yet — merge a changeset touching a product member.
            </td>
          </tr>
        )}
        {runs.map((r) => (
          <IncrementRunRow
            key={r.id}
            run={r}
            expanded={expanded === r.id}
            onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
          />
        ))}
      </tbody>
    </table>
  );
}

function IncrementRunRow({
  run: r,
  expanded,
  onToggle,
}: {
  run: Run;
  expanded: boolean;
  onToggle: () => void;
}) {
  const gatesGreen = r.gates.contract.length === 0 && r.gates.propagation.length === 0;
  return (
    <>
      <tr className="row-click" onClick={onToggle}>
        <td className="expander">{expanded ? "▾" : "▸"}</td>
        <td>
          <code className="mono-id">{r.id}</code>
        </td>
        <td>
          <span className="chip-row">
            {r.products.map((p) => (
              <span key={p.product} className="chip chip-accent product-tag">
                {p.product}@{p.version}
              </span>
            ))}
          </span>
        </td>
        <td>
          <StatusChip status={r.status} />
        </td>
        <td className="muted">{r.triggeredBy}</td>
        <td className="muted">{fmtDate(r.startedAt)}</td>
        <td className="muted">{fmtDuration(r.durationMs)}</td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={7}>
            <div className="detail-body">
              <h4>Layer stats</h4>
              <table className="data-table stats-table">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Bronze</th>
                    <th>Silver</th>
                    <th>Gold</th>
                    <th>Dropped (no PK)</th>
                    <th>Dropped (dup)</th>
                  </tr>
                </thead>
                <tbody>
                  {r.stats.map((s) => (
                    <tr key={s.entity}>
                      <td>
                        <code className="mono-id">{s.entity}</code>
                      </td>
                      <td>{s.bronze}</td>
                      <td>{s.silver}</td>
                      <td>{s.gold}</td>
                      <td className={s.droppedNoPk > 0 ? "drop-warn" : "muted"}>
                        {s.droppedNoPk}
                      </td>
                      <td className={s.droppedDup > 0 ? "drop-warn" : "muted"}>
                        {s.droppedDup}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <h4>Gates</h4>
              {gatesGreen ? (
                <p className="ok-note">All gates green — contract and propagation clean.</p>
              ) : (
                <>
                  {r.gates.contract.length > 0 && <IssueList issues={r.gates.contract} />}
                  {r.gates.propagation.length > 0 && (
                    <IssueList issues={r.gates.propagation} />
                  )}
                </>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

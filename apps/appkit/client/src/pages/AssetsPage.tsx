import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ASSET_KINDS, listAssets } from "../lib/api";
import { useApi } from "../lib/useApi";
import { ErrorNote, Loading, StatusChip } from "../lib/ui";

export default function AssetsPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const kind = params.get("kind") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const [debouncedQ, setDebouncedQ] = useState(q);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  const assets = useApi(
    () => listAssets(kind || undefined, debouncedQ || undefined),
    [kind, debouncedQ],
  );

  const selectKind = (k: string) => {
    const next = new URLSearchParams(params);
    if (k) next.set("kind", k);
    else next.delete("kind");
    setParams(next, { replace: true });
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>Governed Assets</h2>
        <button type="button" className="btn btn-primary" onClick={() => navigate("/assets/new")}>
          + New asset
        </button>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={`tab ${kind === "" ? "tab-active" : ""}`}
          onClick={() => selectKind("")}
        >
          All
        </button>
        {ASSET_KINDS.map((k) => (
          <button
            type="button"
            key={k}
            className={`tab ${kind === k ? "tab-active" : ""}`}
            onClick={() => selectKind(k)}
          >
            {k}
          </button>
        ))}
      </div>

      <input
        className="input search"
        type="search"
        placeholder="Search assets…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {assets.loading && <Loading />}
      {assets.error && <ErrorNote message={assets.error} onRetry={assets.reload} />}

      {assets.data && (
        <div className="panel table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kind</th>
                <th>ID</th>
                <th>Label</th>
                <th>Version</th>
                <th>Status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {assets.data.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No assets match.
                  </td>
                </tr>
              )}
              {assets.data.map((a) => (
                <tr
                  key={`${a.kind}/${a.id}`}
                  className="row-click"
                  onClick={() => navigate(`/assets/${a.kind}/${a.id}`)}
                >
                  <td>
                    <span className="chip chip-muted">{a.kind}</span>
                  </td>
                  <td>
                    <code className="mono-id">{a.id}</code>
                  </td>
                  <td>{a.label ?? <span className="muted">—</span>}</td>
                  <td>{a.version ?? <span className="muted">—</span>}</td>
                  <td>
                    <StatusChip status={a.status} />
                  </td>
                  <td className="muted">{a.owner ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

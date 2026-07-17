import { useState } from "react";
import type { MigrationTable } from "../lib/api";
import { getMigration } from "../lib/api";
import { ClassificationChip, ErrorNote, Loading } from "../lib/ui";
import { useApi } from "../lib/useApi";

export default function MigrationPage() {
  const migration = useApi(() => getMigration(), []);
  const [expanded, setExpanded] = useState<string | null>(null);

  const data = migration.data;
  const tables: MigrationTable[] = data?.manifest?.tables ?? [];

  return (
    <div className="page">
      <h2>Delta → Lakebase Migration</h2>
      <p className="muted">
        The same contracts that generate Delta tables generate the Postgres (Lakebase)
        DDL — one source of truth, two engines.
      </p>

      {migration.loading && <Loading />}
      {migration.error && <ErrorNote message={migration.error} onRetry={migration.reload} />}

      {data && !data.generated && (
        <div className="banner banner-warn">
          <div>
            <span className="banner-title">DDL not generated yet</span>
            <div className="muted banner-sub">
              Run <code className="mono-id">pnpm generate</code> to emit the Postgres schema
              from the contracts, then refresh this page.
            </div>
          </div>
        </div>
      )}

      {data && data.generated && data.manifest && (
        <>
          <div className="banner">
            <div>
              <span className="banner-title">DDL generated from contracts</span>
              <div className="muted banner-sub">
                {data.manifest.generated_from} → {data.manifest.target} · schema{" "}
                <code className="mono-id">{data.manifest.schema}</code>
              </div>
            </div>
            <div className="banner-facts">
              <span className="chip chip-ok">generated</span>
              <code className="mono-id">{data.schemaSqlPath}</code>
            </div>
          </div>

          <div className="panel table-panel">
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Table</th>
                  <th>Entity</th>
                  <th>Layer</th>
                  <th>Columns</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((t) => (
                  <TableRow
                    key={t.table}
                    table={t}
                    expanded={expanded === t.table}
                    onToggle={() => setExpanded(expanded === t.table ? null : t.table)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function TableRow({
  table: t,
  expanded,
  onToggle,
}: {
  table: MigrationTable;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="row-click" onClick={onToggle}>
        <td className="expander">{expanded ? "▾" : "▸"}</td>
        <td>
          <code className="mono-id">{t.table}</code>
        </td>
        <td>{t.entity}</td>
        <td>
          <span className="chip chip-warn">{t.layer}</span>
        </td>
        <td className="muted">{t.columns.length}</td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={5}>
            <div className="detail-body">
              <table className="data-table stats-table">
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>PG type</th>
                    <th>Classification</th>
                    <th>Nullable</th>
                  </tr>
                </thead>
                <tbody>
                  {t.columns.map((c) => (
                    <tr key={c.name}>
                      <td>
                        <code className="mono-id">{c.name}</code>
                      </td>
                      <td className="muted">{c.pgType}</td>
                      <td>
                        <ClassificationChip value={c.classification} />
                      </td>
                      <td className="muted">{c.nullable ? "yes" : "NOT NULL"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

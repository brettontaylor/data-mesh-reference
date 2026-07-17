import { type CSSProperties, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { Catalog, DqResult, FlowNode, MigrationTable, Run } from "../lib/api";
import {
  ApiError,
  errorMessage,
  getCatalog,
  getMigration,
  listRuns,
  triggerRun,
} from "../lib/api";
import { Breadcrumbs, PageHeader } from "../lib/page";
import { useToast } from "../lib/toast";
import {
  ClassificationChip,
  ErrorNote,
  IssueList,
  Loading,
  StatusChip,
  fmtDate,
  fmtDuration,
} from "../lib/ui";
import { type ApiState, useApi } from "../lib/useApi";
import "./Pipelines.css";

type Tab = "runs" | "migration";

/** Stable, muted per-domain hue for the flow strip (accent family). */
function domainHue(domain: string): number {
  let h = 0;
  for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) % 360;
  return h;
}
function domainStyle(domain: string): CSSProperties {
  const hue = domainHue(domain);
  return {
    background: `hsl(${hue} 62% 96%)`,
    borderColor: `hsl(${hue} 45% 82%)`,
    color: `hsl(${hue} 45% 34%)`,
  };
}

export default function PipelinesPage() {
  const runs = useApi(() => listRuns(), []);
  const catalog = useApi(() => getCatalog(), []);
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("tab") === "migration" ? "migration" : "runs";
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === "runs") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true });
  };

  const sorted = (runs.data ?? [])
    .slice()
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));

  const onRun = async () => {
    setRunning(true);
    try {
      const run = await triggerRun();
      toast(`Pipeline run ${run.id} ${run.status}.`, run.status === "succeeded" ? "ok" : "err");
      runs.reload();
    } catch (e) {
      let msg = errorMessage(e);
      if (e instanceof ApiError && e.status === 403) {
        msg += " — switch persona to Pat (Platform Eng) to trigger pipelines.";
      }
      toast(msg, "err");
    } finally {
      setRunning(false);
    }
  };

  const runButton = (
    <button
      type="button"
      className="btn btn-primary"
      disabled={running}
      onClick={() => void onRun()}
    >
      {running ? "Running…" : "Run medallion pipeline"}
    </button>
  );

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Dashboard", to: "/" }, { label: "Pipelines" }]} />
      <PageHeader
        kicker="ORCHESTRATION"
        title="Pipelines"
        sub="Metadata-driven medallion pipelines over the governed contract."
        actions={tab === "runs" ? runButton : undefined}
      />

      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === "runs" ? "tab-active" : ""}`}
          onClick={() => setTab("runs")}
        >
          Runs
        </button>
        <button
          type="button"
          className={`tab ${tab === "migration" ? "tab-active" : ""}`}
          onClick={() => setTab("migration")}
        >
          Migration
        </button>
      </div>

      {tab === "runs" ? (
        <RunsTab
          runs={runs}
          catalog={catalog}
          sorted={sorted}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      ) : (
        <MigrationTab />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Runs tab
// ---------------------------------------------------------------------------

function RunsTab({
  runs,
  catalog,
  sorted,
  expanded,
  setExpanded,
}: {
  runs: ApiState<Run[]>;
  catalog: ApiState<Catalog>;
  sorted: Run[];
  expanded: string | null;
  setExpanded: (id: string | null) => void;
}) {
  return (
    <>
      {catalog.data && <FlowStrip flow={catalog.data.flow} />}

      {runs.loading && <Loading />}
      {runs.error && <ErrorNote message={runs.error} onRetry={runs.reload} />}

      {runs.data && (
        <div className="panel table-panel">
          <table className="data-table">
            <thead>
              <tr>
                <th></th>
                <th>Run</th>
                <th>Pipeline</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Data quality</th>
                <th>Triggered by</th>
                <th>Started</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={9} className="muted">
                    No runs yet.
                  </td>
                </tr>
              )}
              {sorted.map((r) => (
                <RunRow
                  key={r.id}
                  run={r}
                  expanded={expanded === r.id}
                  onToggle={() => setExpanded(expanded === r.id ? null : r.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const STAGE_META: { key: keyof Catalog["flow"]; label: string; sub: string }[] = [
  { key: "bronze", label: "Bronze", sub: "sources" },
  { key: "silver", label: "Silver", sub: "bdms" },
  { key: "gold", label: "Gold", sub: "pdm · transforms · semantic · extract" },
];

/** Compact left→right medallion flow strip, grouped by domain within each stage. */
function FlowStrip({ flow }: { flow: Catalog["flow"] }) {
  return (
    <div className="pl-flow" aria-label="Medallion flow">
      {STAGE_META.map((stage, i) => (
        <div className="pl-flow-cell" key={stage.key}>
          <div className="pl-stage">
            <div className="pl-stage-head">
              <span className={`pl-stage-name pl-stage-${stage.key}`}>{stage.label}</span>
              <span className="pl-stage-count">{flow[stage.key].length}</span>
            </div>
            <div className="pl-stage-sub">{stage.sub}</div>
            <FlowNodes nodes={flow[stage.key]} />
          </div>
          {i < STAGE_META.length - 1 && <span className="pl-arrow" aria-hidden="true">→</span>}
        </div>
      ))}
    </div>
  );
}

function FlowNodes({ nodes }: { nodes: FlowNode[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, FlowNode[]>();
    for (const n of nodes) {
      const g = map.get(n.domain) ?? [];
      g.push(n);
      map.set(n.domain, g);
    }
    return Array.from(map.entries());
  }, [nodes]);

  return (
    <div className="pl-groups">
      {groups.map(([domain, ns]) => (
        <div className="pl-group" key={domain}>
          <span className="pl-group-domain" style={domainStyle(domain)}>
            {domain}
          </span>
          <span className="pl-nodes">
            {ns.map((n) => (
              <span className="pl-node" key={`${n.kind}/${n.id}`} title={`${n.kind} · ${n.label}`}>
                {n.label}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function RunRow({
  run: r,
  expanded,
  onToggle,
}: {
  run: Run;
  expanded: boolean;
  onToggle: () => void;
}) {
  const maxRows = Math.max(1, ...r.stats.map((s) => s.bronze));
  const gatesGreen =
    r.gates.contract.length === 0 && r.gates.propagation.length === 0;
  const dqEntities = r.stats.filter(
    (s): s is typeof s & { dq: DqResult[] } => s.dq !== undefined && s.dq.length > 0,
  );
  const dqRollup = dqEntities
    .flatMap((s) => s.dq)
    .reduce(
      (acc, d) => {
        acc[d.status] += 1;
        return acc;
      },
      { pass: 0, fail: 0, skipped: 0 },
    );
  const hasDq = dqEntities.length > 0;

  return (
    <>
      <tr className="row-click" onClick={onToggle}>
        <td className="expander">{expanded ? "▾" : "▸"}</td>
        <td>
          <code className="mono-id">{r.id}</code>
        </td>
        <td>{r.pipeline}</td>
        <td>
          <span className="chip-row">
            <span
              className={`chip ${r.trigger === "product-increment" ? "chip-accent" : "chip-muted"}`}
              title={
                r.trigger === "product-increment"
                  ? "Auto-triggered by a product version increment on merge"
                  : "Manually triggered"
              }
            >
              {r.trigger}
            </span>
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
        <td>
          {hasDq ? (
            <span
              className={`chip ${dqRollup.fail > 0 ? "chip-err" : "chip-ok"} dq-rollup`}
              title="Applied DQ rules executed at gold — expand for per-rule results"
            >
              DQ: {dqRollup.pass} pass · {dqRollup.fail} fail · {dqRollup.skipped} skipped
            </span>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        <td className="muted">{r.triggeredBy}</td>
        <td className="muted">{fmtDate(r.startedAt)}</td>
        <td className="muted">{fmtDuration(r.durationMs)}</td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={9}>
            <div className="detail-body">
              <h4>Layer stats</h4>
              <table className="data-table stats-table">
                <thead>
                  <tr>
                    <th>Entity</th>
                    <th>Bronze → Silver → Gold</th>
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
                      <td className="bars-cell">
                        <LayerBar label="bronze" value={s.bronze} max={maxRows} cls="bar-bronze" />
                        <LayerBar label="silver" value={s.silver} max={maxRows} cls="bar-silver" />
                        <LayerBar label="gold" value={s.gold} max={maxRows} cls="bar-gold" />
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

              {dqEntities.map((s) => (
                <DqResultTable key={s.entity} entity={s.entity} results={s.dq} />
              ))}

              <h4>Gates</h4>
              {gatesGreen ? (
                <p className="ok-note">All gates green — contract and propagation clean.</p>
              ) : (
                <>
                  {r.gates.contract.length > 0 && (
                    <>
                      <h5 className="muted">Contract</h5>
                      <IssueList issues={r.gates.contract} />
                    </>
                  )}
                  {r.gates.propagation.length > 0 && (
                    <>
                      <h5 className="muted">Propagation</h5>
                      <IssueList issues={r.gates.propagation} />
                    </>
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

const DQ_STATUS_CLASS: Record<DqResult["status"], string> = {
  pass: "chip-ok",
  fail: "chip-err",
  skipped: "chip-muted",
};

function DqResultTable({ entity, results }: { entity: string; results: DqResult[] }) {
  return (
    <>
      <h4>
        Data quality — <code className="mono-id">{entity}</code>
      </h4>
      <table className="data-table stats-table">
        <thead>
          <tr>
            <th>Rule</th>
            <th>Scope</th>
            <th>Field</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Violations</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {results.map((d, i) => (
            <tr key={`${d.rule}-${d.field ?? "table"}-${i}`}>
              <td>{d.label}</td>
              <td>
                <span className={`chip ${d.scope === "column" ? "chip-accent" : "chip-ok"}`}>
                  {d.scope}
                </span>
              </td>
              <td>
                {d.field !== undefined ? (
                  <code className="mono-id">{d.field}</code>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <span className={`chip ${d.severity === "error" ? "chip-err" : "chip-warn"}`}>
                  {d.severity}
                </span>
              </td>
              <td>
                <span className={`chip ${DQ_STATUS_CLASS[d.status]}`}>{d.status}</span>
              </td>
              <td className={d.violations > 0 ? "drop-warn" : "muted"}>{d.violations}</td>
              <td className="muted">{d.detail ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function LayerBar({
  label,
  value,
  max,
  cls,
}: {
  label: string;
  value: number;
  max: number;
  cls: string;
}) {
  const pct = Math.max(2, Math.round((value / max) * 100));
  return (
    <div className="bar-row" title={`${label}: ${value}`}>
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className={`bar-fill ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="bar-value">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Migration tab — Delta → Lakebase (Postgres) DDL generated from the contracts.
// ---------------------------------------------------------------------------

function MigrationTab() {
  const migration = useApi(() => getMigration(), []);
  const [expanded, setExpanded] = useState<string | null>(null);

  const data = migration.data;
  const tables: MigrationTable[] = data?.manifest?.tables ?? [];

  return (
    <>
      <p className="muted pl-tab-intro">
        The same contracts that generate Delta tables generate the Postgres (Lakebase) DDL —
        one source of truth, two engines.
      </p>

      {migration.loading && <Loading />}
      {migration.error && <ErrorNote message={migration.error} onRetry={migration.reload} />}

      {data && !data.generated && (
        <div className="banner banner-warn">
          <div>
            <span className="banner-title">DDL not generated yet</span>
            <div className="muted banner-sub">
              Run <code className="mono-id">pnpm generate</code> to emit the Postgres schema from
              the contracts, then refresh this page.
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
                  <MigrationRow
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
    </>
  );
}

function MigrationRow({
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

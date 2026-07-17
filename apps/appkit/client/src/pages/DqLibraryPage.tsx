import { useState } from "react";
import { Link } from "react-router";
import type { DqApplication, DqLibraryRule, DqParamDecl, DqSeverity } from "../lib/api";
import { getDqLibrary } from "../lib/api";
import { ErrorNote, Loading, StatusChip } from "../lib/ui";
import { useApi } from "../lib/useApi";

function ScopeChip({ scope }: { scope: "column" | "table" }) {
  return (
    <span
      className={`chip ${scope === "column" ? "chip-accent" : "chip-ok"}`}
      title={
        scope === "column"
          ? "Bound to a single field of the target entity"
          : "Evaluated against the whole target table"
      }
    >
      {scope}
    </span>
  );
}

function SeverityChip({ severity }: { severity: DqSeverity }) {
  return (
    <span className={`chip ${severity === "error" ? "chip-err" : "chip-warn"}`}>
      {severity}
    </span>
  );
}

/** "min?, max?" style summary — required params plain, optional marked with `?`. */
function paramsSummary(params?: DqParamDecl[]): string {
  if (!params || params.length === 0) return "—";
  return params.map((p) => (p.required === true ? p.name : `${p.name}?`)).join(", ");
}

export default function DqLibraryPage() {
  const dq = useApi(() => getDqLibrary(), []);
  const [expanded, setExpanded] = useState<string | null>(null);

  const library = dq.data?.library ?? [];
  const applications = dq.data?.applications ?? [];

  return (
    <div className="page">
      <div className="page-head">
        <h2>DQ rules library</h2>
        <Link to="/assets/new?kind=dqrule" className="btn btn-primary">
          + New rule
        </Link>
      </div>
      <div className="banner">
        <div>
          <span className="banner-title">
            Generic rules, defined once — applied at table or column level by rule sets;
            executed on every pipeline run.
          </span>
          <div className="muted banner-sub">
            Library rules are governed assets (kind <code className="mono-id">dqrule</code>) —
            edits go through the changeset flow, and editing a rule that is in use is
            automatically <strong>tier 2</strong>.
          </div>
        </div>
      </div>

      {dq.loading && <Loading />}
      {dq.error && <ErrorNote message={dq.error} onRetry={dq.reload} />}

      {dq.data && (
        <>
          <div className="panel table-panel">
            <div className="panel-head">
              <h3>Library</h3>
              <span className="muted">
                {library.length} rule{library.length === 1 ? "" : "s"}
              </span>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Rule</th>
                  <th>Label</th>
                  <th>Scope</th>
                  <th>Check</th>
                  <th>Severity</th>
                  <th>Version</th>
                  <th>Params</th>
                  <th>Used by</th>
                </tr>
              </thead>
              <tbody>
                {library.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted">
                      No library rules defined in the contract.
                    </td>
                  </tr>
                )}
                {library.map((r) => (
                  <LibraryRuleRow
                    key={r.rule}
                    rule={r}
                    expanded={expanded === r.rule}
                    onToggle={() => setExpanded(expanded === r.rule ? null : r.rule)}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel table-panel">
            <div className="panel-head">
              <h3>Applications</h3>
              <span className="muted">
                {applications.length} binding{applications.length === 1 ? "" : "s"} via rule sets
              </span>
            </div>
            <ApplicationsTable applications={applications} />
          </div>
        </>
      )}
    </div>
  );
}

function LibraryRuleRow({
  rule: r,
  expanded,
  onToggle,
}: {
  rule: DqLibraryRule;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="row-click" onClick={onToggle}>
        <td className="expander">{expanded ? "▾" : "▸"}</td>
        <td>
          <code className="mono-id">{r.rule}</code>
        </td>
        <td>{r.label ?? <span className="muted">—</span>}</td>
        <td>
          <ScopeChip scope={r.scope} />
        </td>
        <td>
          <code className="mono-id">{r.check}</code>
        </td>
        <td>
          <SeverityChip severity={r.severity} />
        </td>
        <td className="muted">{r.version}</td>
        <td>
          <span className="params-inline">{paramsSummary(r.params)}</span>
        </td>
        <td className={r.usage.length > 0 ? "" : "muted"}>
          {r.usage.length} binding{r.usage.length === 1 ? "" : "s"}
        </td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={9}>
            <div className="detail-body">
              <div className="dq-detail-meta">
                <StatusChip status={r.status} />
                {r.owner !== undefined && <span className="muted">owner: {r.owner}</span>}
              </div>
              {r.description !== undefined && (
                <p className="dq-description">{r.description}</p>
              )}

              {r.expression !== undefined && (
                <>
                  <h4>Expression</h4>
                  <pre className="dq-expr">{r.expression}</pre>
                </>
              )}

              <h4>Parameters</h4>
              {r.params === undefined || r.params.length === 0 ? (
                <p className="muted enforcer-sub">No parameters — applies as-is.</p>
              ) : (
                <table className="data-table stats-table dq-param-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Required</th>
                      <th>Default</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.params.map((p) => (
                      <tr key={p.name}>
                        <td>
                          <code className="mono-id">{p.name}</code>
                        </td>
                        <td className="muted">{p.type}</td>
                        <td>
                          {p.required === true ? (
                            <span className="chip chip-warn">required</span>
                          ) : (
                            <span className="chip chip-muted">optional</span>
                          )}
                        </td>
                        <td className="muted">
                          {p.default === undefined ? "—" : JSON.stringify(p.default)}
                        </td>
                        <td className="muted">{p.description ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <h4>Used by</h4>
              {r.usage.length === 0 ? (
                <p className="muted enforcer-sub">
                  Not applied by any rule set yet — edits stay tier 1.
                </p>
              ) : (
                <ul className="dq-usage-list">
                  {r.usage.map((u, i) => (
                    <li key={`${u.ruleSet}-${u.target}-${u.field ?? "table"}-${i}`}>
                      <Link to={`/assets/dq/${encodeURIComponent(u.ruleSet)}`} className="chip chip-muted member-chip">
                        <span className="member-kind">dq</span> {u.ruleSet}
                      </Link>
                      <span className="muted">→</span>
                      <code className="mono-id">{u.target}</code>
                      {u.field !== undefined ? (
                        <code className="mono-id">.{u.field}</code>
                      ) : (
                        <span className="chip chip-ok">table</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="form-actions">
                <Link to={`/assets/dqrule/${encodeURIComponent(r.rule)}/edit`} className="btn btn-small">
                  Propose edit
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function ApplicationsTable({ applications }: { applications: DqApplication[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Rule set</th>
          <th>Target</th>
          <th>Rule</th>
          <th>Binding</th>
          <th>Severity</th>
          <th>Params</th>
        </tr>
      </thead>
      <tbody>
        {applications.length === 0 && (
          <tr>
            <td colSpan={6} className="muted">
              No rule sets apply library rules yet.
            </td>
          </tr>
        )}
        {applications.map((a, i) => {
          const res = a.resolved;
          const key = `${a.ruleSet}-${a.target}-${res?.id ?? "unresolved"}-${res?.field ?? "table"}-${i}`;
          if (res === null) {
            return (
              <tr key={key}>
                <td>
                  <Link to={`/assets/dq/${encodeURIComponent(a.ruleSet)}`} className="chip chip-muted member-chip">
                    <span className="member-kind">dq</span> {a.ruleSet}
                  </Link>
                </td>
                <td>
                  <code className="mono-id">{a.target}</code>
                </td>
                <td colSpan={4}>
                  <span className="chip chip-err">unresolved</span>{" "}
                  <span className="muted">
                    binding references a rule that is not in the library
                  </span>
                </td>
              </tr>
            );
          }
          const paramsJson = JSON.stringify(res.params);
          return (
            <tr key={key}>
              <td>
                <Link to={`/assets/dq/${encodeURIComponent(a.ruleSet)}`} className="chip chip-muted member-chip">
                  <span className="member-kind">dq</span> {a.ruleSet}
                </Link>
              </td>
              <td>
                <code className="mono-id">{a.target}</code>
              </td>
              <td>
                <span className="chip-row">
                  {res.label}
                  <span className={`chip ${res.source === "library" ? "chip-accent" : "chip-muted"}`}>
                    {res.source}
                  </span>
                </span>
              </td>
              <td>
                {res.field !== undefined ? (
                  <code className="mono-id">{res.field}</code>
                ) : (
                  <span className="muted">table</span>
                )}
                {res.ref !== undefined && (
                  <>
                    {" "}
                    <span className="muted">→</span>{" "}
                    <code className="mono-id">{res.ref}</code>
                  </>
                )}
              </td>
              <td>
                <SeverityChip severity={res.severity} />
              </td>
              <td>
                {paramsJson === "{}" ? (
                  <span className="muted">—</span>
                ) : (
                  <span className="params-inline">{paramsJson}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

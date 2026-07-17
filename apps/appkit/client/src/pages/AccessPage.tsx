import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import type { AccessCheckResult, AccessInfo } from "../lib/api";
import { checkAccess, errorMessage, getAccess } from "../lib/api";
import { Breadcrumbs, PageHeader } from "../lib/page";
import {
  ClassificationChip,
  ClearanceBadges,
  DomainChips,
  ErrorNote,
  Loading,
} from "../lib/ui";
import { useApi } from "../lib/useApi";
import "./Access.css";

const KNOWN_DOMAINS = [
  "reference",
  "trading",
  "analytics",
  "governance",
  "consumption",
  "platform",
];

const TABS = [
  { key: "users", label: "Users" },
  { key: "matrix", label: "Role matrix" },
  { key: "clearance", label: "Data clearance" },
  { key: "policy", label: "Approval policy" },
  { key: "checker", label: "Checker" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default function AccessPage() {
  const access = useApi(() => getAccess(), []);
  const [params, setParams] = useSearchParams();
  const raw = params.get("tab");
  const tab: TabKey = TABS.some((t) => t.key === raw) ? (raw as TabKey) : "users";

  const setTab = (next: TabKey) => {
    const p = new URLSearchParams(params);
    if (next === "users") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true });
  };

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Dashboard", to: "/" }, { label: "Access" }]} />
      <PageHeader
        kicker="ACCESS"
        title="Access management"
        sub="Roles, capabilities, domain scopes, the two-tier approval policy, and the data-clearance model."
      />

      <div className="tabs">
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            className={`tab ${tab === t.key ? "tab-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {access.loading && <Loading />}
      {access.error && <ErrorNote message={access.error} onRetry={access.reload} />}

      {access.data && (
        <>
          {tab === "users" && <UsersSection info={access.data} />}
          {tab === "matrix" && <RoleMatrixSection info={access.data} />}
          {tab === "clearance" && <DataClearanceSection info={access.data} />}
          {tab === "policy" && <ApprovalPolicySection info={access.data} />}
          {tab === "checker" && <AccessCheckerSection info={access.data} />}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

function UsersSection({ info }: { info: AccessInfo }) {
  return (
    <section className="panel table-panel">
      <div className="panel-head">
        <h3>Users</h3>
        <span className="muted">{info.users.length} dev-auth principals</span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Sub</th>
            <th>Label</th>
            <th>Roles</th>
            <th>Domains</th>
            <th>Clearance</th>
            <th>Capabilities</th>
          </tr>
        </thead>
        <tbody>
          {info.users.map((u) => (
            <tr key={u.sub}>
              <td>
                <code className="mono-id">{u.sub}</code>
              </td>
              <td>{u.label}</td>
              <td>
                <span className="chip-row">
                  {u.roles.map((r) => (
                    <span key={r} className="chip chip-accent">
                      {r}
                    </span>
                  ))}
                </span>
              </td>
              <td>
                <DomainChips domains={u.domains} />
              </td>
              <td>
                <span className="chip-row">
                  <ClassificationChip value={u.clearance.maxTier} />
                  <ClearanceBadges pii={u.clearance.pii} mnpi={u.clearance.mnpi} />
                </span>
              </td>
              <td>
                <span className="chip-row cap-chips">
                  {u.capabilities.map((c) => (
                    <span key={c} className="chip chip-muted cap-chip">
                      {c}
                    </span>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Role matrix (roles × capabilities)
// ---------------------------------------------------------------------------

function RoleMatrixSection({ info }: { info: AccessInfo }) {
  return (
    <section className="panel table-panel">
      <div className="panel-head">
        <h3>Role matrix</h3>
        <span className="muted">platform roles × capabilities</span>
      </div>
      <div className="matrix-scroll">
        <table className="data-table matrix-table">
          <thead>
            <tr>
              <th>Role</th>
              {info.capabilities.map((cap) => (
                <th key={cap} className="matrix-cap">
                  {cap}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {info.roles.map((r) => (
              <tr key={r.role}>
                <td>
                  <code className="mono-id">{r.role}</code>
                </td>
                {info.capabilities.map((cap) => {
                  const has = r.capabilities.includes(cap);
                  return (
                    <td
                      key={cap}
                      className={`matrix-cell ${has ? "matrix-yes" : "matrix-no"}`}
                    >
                      {has ? "✓" : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Data clearance (from access.yaml data-access model)
// ---------------------------------------------------------------------------

function DataClearanceSection({ info }: { info: AccessInfo }) {
  return (
    <section className="panel table-panel">
      <div className="panel-head">
        <h3>Data-clearance roles</h3>
        <span className="muted">
          row/column security at query time · default role:{" "}
          <code className="mono-id">{info.dataAccessModel.defaultRole}</code>
        </span>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Role</th>
            <th>Label</th>
            <th>Description</th>
            <th>Max tier</th>
            <th>PII / MNPI</th>
          </tr>
        </thead>
        <tbody>
          {info.dataAccessModel.roles.map((r) => (
            <tr key={r.role}>
              <td>
                <code className="mono-id">{r.role}</code>
              </td>
              <td>{r.label}</td>
              <td className="muted">{r.description}</td>
              <td>
                <ClassificationChip value={r.maxTier} />
              </td>
              <td>
                <ClearanceBadges pii={r.pii} mnpi={r.mnpi} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Approval policy
// ---------------------------------------------------------------------------

function ApprovalPolicySection({ info }: { info: AccessInfo }) {
  const p = info.approvalPolicy;
  return (
    <section>
      <div className="policy-cards">
        <div className="policy-card policy-tier1">
          <div className="policy-title">{p.tier1.label}</div>
          <div className="policy-req">
            requires <code className="mono-id">{p.tier1.requires}</code>
          </div>
          <p className="muted policy-routing">{p.tier1.routing}</p>
        </div>
        <div className="policy-card policy-tier2">
          <div className="policy-title">{p.tier2.label}</div>
          <div className="policy-req">
            requires <code className="mono-id">{p.tier2.requires}</code>
          </div>
          <p className="muted policy-routing">{p.tier2.routing}</p>
        </div>
        <div className="policy-card policy-merge">
          <div className="policy-title">Merge</div>
          <div className="policy-req">
            requires <code className="mono-id">{p.merge.requires}</code>
          </div>
          <p className="muted policy-routing">
            Applies after approval or sign-off, regardless of tier.
          </p>
        </div>
        <div className="policy-card policy-sod">
          <div className="policy-title">Segregation of duties</div>
          <p className="muted policy-routing">{p.segregationOfDuties}</p>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Access checker
// ---------------------------------------------------------------------------

function AccessCheckerSection({ info }: { info: AccessInfo }) {
  const [sub, setSub] = useState(info.users[0]?.sub ?? "");
  const [capability, setCapability] = useState(info.capabilities[0] ?? "");
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<AccessCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const domainOptions = useMemo(() => {
    const set = new Set<string>(KNOWN_DOMAINS);
    for (const u of info.users) {
      for (const d of u.domains) {
        if (d !== "*") set.add(d);
      }
    }
    return Array.from(set).sort();
  }, [info.users]);

  const runCheck = async () => {
    if (!sub || !capability || checking) return;
    setChecking(true);
    setError(null);
    setResult(null);
    try {
      const r = await checkAccess(sub, capability, domain || undefined);
      setResult(r);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  };

  return (
    <section className="panel checker-panel">
      <div className="panel-head">
        <h3>Access checker</h3>
        <span className="muted">would this user be allowed to…?</span>
      </div>
      <div className="checker-form">
        <label className="form-row checker-field">
          <span className="form-label">User</span>
          <select
            className="input"
            value={sub}
            onChange={(e) => {
              setSub(e.target.value);
              setResult(null);
            }}
          >
            {info.users.map((u) => (
              <option key={u.sub} value={u.sub}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
        <label className="form-row checker-field">
          <span className="form-label">Capability</span>
          <select
            className="input"
            value={capability}
            onChange={(e) => {
              setCapability(e.target.value);
              setResult(null);
            }}
          >
            {info.capabilities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="form-row checker-field">
          <span className="form-label">Domain (optional)</span>
          <select
            className="input"
            value={domain}
            onChange={(e) => {
              setDomain(e.target.value);
              setResult(null);
            }}
          >
            <option value="">— any —</option>
            {domainOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <div className="form-row checker-field checker-submit">
          <button
            type="button"
            className="btn btn-primary"
            disabled={checking || !sub || !capability}
            onClick={() => void runCheck()}
          >
            {checking ? "Checking…" : "Check"}
          </button>
        </div>
      </div>

      {error && <ErrorNote message={error} />}

      {result && (
        <div className={`checker-result ${result.allowed ? "checker-ok" : "checker-err"}`}>
          <span className={`chip ${result.allowed ? "chip-ok" : "chip-err"}`}>
            {result.allowed ? "ALLOWED" : "DENIED"}
          </span>
          <span className="checker-summary">
            <code className="mono-id">{sub}</code> →{" "}
            <code className="mono-id">{capability}</code>
            {domain && (
              <>
                {" "}
                in <code className="mono-id">{domain}</code>
              </>
            )}
          </span>
          {result.reasons.length > 0 && (
            <ul className="checker-reasons">
              {result.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

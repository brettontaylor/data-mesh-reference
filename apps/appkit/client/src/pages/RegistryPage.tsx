import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Changeset, ChangesetAction, RegistryRow } from "../lib/api";
import {
  decideChangeset,
  errorMessage,
  getPersona,
  getRegistry,
  listChangesets,
  mergeChangeset,
  withdrawChangeset,
} from "../lib/api";
import { Breadcrumbs, PageHeader } from "../lib/page";
import { useToast } from "../lib/toast";
import {
  DomainChips,
  ErrorNote,
  IssueList,
  Loading,
  StatusChip,
  TierBadge,
  fmtDate,
} from "../lib/ui";
import { useApi } from "../lib/useApi";
import "./Registry.css";

type Tab = "all" | "changesets";

export default function RegistryPage() {
  const [params, setParams] = useSearchParams();
  const registry = useApi(() => getRegistry(), []);
  const changesets = useApi(() => listChangesets(), []);

  const tab: Tab = params.get("tab") === "changesets" ? "changesets" : "all";
  const changesetCount = changesets.data?.length ?? 0;

  const setTab = (next: Tab) => {
    const p = new URLSearchParams(params);
    if (next === "all") p.delete("tab");
    else p.set("tab", next);
    setParams(p, { replace: true });
  };

  const rows = useMemo(() => registry.data?.rows ?? [], [registry.data]);

  const kindBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) counts.set(r.kind, (counts.get(r.kind) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => `${n} ${k}`)
      .join(" · ");
  }, [rows]);

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Dashboard", to: "/" }, { label: "Registry" }]} />
      <PageHeader
        kicker="MODEL REGISTRY"
        title={`${rows.length} registered assets`}
        sub={kindBreakdown || "The governed model registry across every domain and product."}
      />

      <div className="tabs">
        <button
          type="button"
          className={`tab ${tab === "all" ? "tab-active" : ""}`}
          onClick={() => setTab("all")}
        >
          All
        </button>
        <button
          type="button"
          className={`tab ${tab === "changesets" ? "tab-active" : ""}`}
          onClick={() => setTab("changesets")}
        >
          Changesets
          <span className="reg-badge">{changesetCount}</span>
        </button>
      </div>

      {tab === "all" ? (
        <AllTab
          registry={registry.data}
          loading={registry.loading}
          error={registry.error}
          onRetry={registry.reload}
          params={params}
          setParams={setParams}
        />
      ) : (
        <ChangesetsTab
          data={changesets.data}
          loading={changesets.loading}
          error={changesets.error}
          onRetry={changesets.reload}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// All tab — flat filterable registry table
// ---------------------------------------------------------------------------

function AllTab({
  registry,
  loading,
  error,
  onRetry,
  params,
  setParams,
}: {
  registry: { rows: RegistryRow[]; domains: string[] } | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  params: URLSearchParams;
  setParams: (next: URLSearchParams, opts?: { replace?: boolean }) => void;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const domain = params.get("domain") ?? "";
  const product = params.get("product") ?? "";
  const kind = params.get("kind") ?? "";

  const setFilter = (key: "domain" | "product" | "kind", value: string) => {
    const p = new URLSearchParams(params);
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p, { replace: true });
  };

  const rows = registry?.rows ?? [];

  const domainOptions = useMemo(() => {
    const set = new Set<string>(registry?.domains ?? []);
    for (const r of rows) if (r.domain) set.add(r.domain);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [registry?.domains, rows]);

  const productOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.product) set.add(r.product);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const kindOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.kind);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (domain && r.domain !== domain) return false;
      if (product && r.product !== product) return false;
      if (kind && r.kind !== kind) return false;
      if (needle) {
        const hay = `${r.id} ${r.label ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, domain, product, kind, q]);

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={onRetry} />;

  return (
    <>
      <div className="reg-filters">
        <select
          className="input reg-select"
          value={domain}
          onChange={(e) => setFilter("domain", e.target.value)}
          aria-label="Filter by domain"
        >
          <option value="">All domains</option>
          {domainOptions.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          className="input reg-select"
          value={product}
          onChange={(e) => setFilter("product", e.target.value)}
          aria-label="Filter by product"
        >
          <option value="">All products</option>
          {productOptions.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          className="input reg-select"
          value={kind}
          onChange={(e) => setFilter("kind", e.target.value)}
          aria-label="Filter by kind"
        >
          <option value="">All kinds</option>
          {kindOptions.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          className="input reg-search"
          type="search"
          placeholder="Search id or label…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <span className="reg-count">
          {filtered.length === rows.length
            ? `${rows.length} assets`
            : `${filtered.length} of ${rows.length} assets`}
        </span>
      </div>

      <div className="panel table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th>Model</th>
              <th>Kind</th>
              <th>Version</th>
              <th>Status</th>
              <th>Domain</th>
              <th>Product</th>
              <th>Depends on</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No assets match these filters.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr
                key={`${r.kind}/${r.id}`}
                className="row-click"
                onClick={() => navigate(`/assets/${r.kind}/${r.id}`)}
              >
                <td>
                  <div className="reg-model">
                    <code className="mono-id">{r.id}</code>
                    {r.label && <span className="reg-label">{r.label}</span>}
                  </div>
                </td>
                <td>
                  <span className="chip chip-muted">{r.kind}</span>
                </td>
                <td>
                  {r.version ? (
                    <span className="chip chip-muted">{r.version}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <StatusChip status={r.status} />
                </td>
                <td>
                  <span className="chip chip-muted reg-domain-chip">{r.domain}</span>
                </td>
                <td>
                  {r.product ? (
                    <span className="chip chip-accent">{r.product}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  {r.dependsOn.length === 0 ? (
                    <span className="muted">—</span>
                  ) : (
                    <div className="reg-deps">
                      {r.dependsOn.map((d) => (
                        <span key={d} className="reg-dep">
                          {d}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Changesets tab — maker/checker queue (mirrors ChangesetsPage, inline)
// ---------------------------------------------------------------------------

const ACTION_PAST: Record<ChangesetAction, string> = {
  approve: "approved",
  reject: "rejected",
  merge: "merged",
};

function ChangesetsTab({
  data,
  loading,
  error,
  onRetry,
}: {
  data: Changeset[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const toast = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const persona = getPersona();

  const reload = onRetry;

  const sorted = (data ?? [])
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const act = async (id: string, action: ChangesetAction) => {
    setBusy(`${id}:${action}`);
    try {
      if (action === "merge") {
        const merged = await mergeChangeset(id);
        toast(`Changeset ${id} merged.`, "ok");
        for (const pi of merged.productIncrements) {
          toast(`${pi.product}: ${pi.from} → ${pi.to} (${pi.level})`, "info");
        }
        const notes: string[] = [];
        if (merged.run !== undefined) notes.push(`auto-run ${merged.run} triggered`);
        if (merged.writeback.mode !== "off") {
          notes.push(
            `write-back: ${merged.writeback.mode}${
              merged.writeback.commit !== undefined ? ` @ ${merged.writeback.commit}` : ""
            } (${merged.writeback.files.length} file${merged.writeback.files.length === 1 ? "" : "s"})`,
          );
        }
        if (notes.length > 0) toast(notes.join(" · "), "info");
      } else {
        await decideChangeset(id, action);
        toast(`Changeset ${id} ${ACTION_PAST[action]}.`, "ok");
      }
      reload();
    } catch (e) {
      toast(errorMessage(e), "err");
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async (id: string) => {
    setBusy(`${id}:withdraw`);
    try {
      await withdrawChangeset(id);
      toast(`Changeset ${id} withdrawn.`, "info");
      reload();
    } catch (e) {
      toast(errorMessage(e), "err");
    } finally {
      setBusy(null);
    }
  };

  const actionButtons = (c: Changeset): ReactNode => {
    if (c.status === "proposed") {
      return (
        <>
          <button
            type="button"
            className="btn btn-small btn-ok"
            disabled={busy !== null}
            onClick={(e) => {
              e.stopPropagation();
              void act(c.id, "approve");
            }}
          >
            {busy === `${c.id}:approve` ? "…" : "Approve"}
          </button>
          <button
            type="button"
            className="btn btn-small btn-err"
            disabled={busy !== null}
            onClick={(e) => {
              e.stopPropagation();
              void act(c.id, "reject");
            }}
          >
            {busy === `${c.id}:reject` ? "…" : "Reject"}
          </button>
          {c.author === persona.sub && (
            <button
              type="button"
              className="btn btn-small"
              disabled={busy !== null}
              title="Withdraw your own proposal (author-only)"
              onClick={(e) => {
                e.stopPropagation();
                void withdraw(c.id);
              }}
            >
              {busy === `${c.id}:withdraw` ? "…" : "Withdraw"}
            </button>
          )}
        </>
      );
    }
    if (c.status === "approved") {
      return (
        <button
          type="button"
          className="btn btn-small btn-primary"
          disabled={busy !== null}
          onClick={(e) => {
            e.stopPropagation();
            void act(c.id, "merge");
          }}
        >
          {busy === `${c.id}:merge` ? "…" : "Merge"}
        </button>
      );
    }
    return <span className="muted">—</span>;
  };

  if (loading) return <Loading />;
  if (error) return <ErrorNote message={error} onRetry={onRetry} />;

  return (
    <>
      <p className="muted">
        Maker/checker queue — modelers propose, stewards approve or reject, domain owners
        merge. Authors cannot decide their own changesets, but may withdraw them while still
        proposed.
      </p>
      <div className="panel table-panel">
        <table className="data-table">
          <thead>
            <tr>
              <th></th>
              <th>ID</th>
              <th>Title</th>
              <th>Author</th>
              <th>Tier</th>
              <th>Domains</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  No changesets yet — propose one from an asset page.
                </td>
              </tr>
            )}
            {sorted.map((c) => (
              <ChangesetRow
                key={c.id}
                changeset={c}
                expanded={expanded === c.id}
                onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                actions={actionButtons(c)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ChangesetRow({
  changeset: c,
  expanded,
  onToggle,
  actions,
}: {
  changeset: Changeset;
  expanded: boolean;
  onToggle: () => void;
  actions: ReactNode;
}) {
  return (
    <>
      <tr className="row-click" onClick={onToggle}>
        <td className="expander">{expanded ? "▾" : "▸"}</td>
        <td>
          <code className="mono-id">{c.id}</code>
        </td>
        <td>{c.title}</td>
        <td className="muted">{c.author}</td>
        <td>
          <TierBadge tier={c.tier} reasons={c.tierReasons} />
        </td>
        <td>
          <DomainChips domains={c.domains} />
        </td>
        <td>
          <StatusChip status={c.status} />
        </td>
        <td className="muted">{fmtDate(c.createdAt)}</td>
        <td className="actions-cell">{actions}</td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={9}>
            <div className="detail-body">
              <h4>
                Approval tier <TierBadge tier={c.tier} reasons={c.tierReasons} />
              </h4>
              {c.tierReasons.length > 0 ? (
                <ul className="tier-reasons">
                  {c.tierReasons.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">
                  Tier 1 — minor change; routed to steward(s) of{" "}
                  {c.domains.length > 0 ? c.domains.join(", ") : "its owning domain"}.
                </p>
              )}
              <h4>Version plan</h4>
              {c.versionNotes.length === 0 ? (
                <p className="muted">No version changes recorded.</p>
              ) : (
                <ul className="version-plan">
                  {c.versionNotes.map((n, i) => (
                    <li key={i}>
                      <code className="version-note">{n}</code>
                    </li>
                  ))}
                </ul>
              )}
              <h4>Edits ({c.edits.length})</h4>
              {c.edits.map((e, i) => (
                <div key={`${e.kind}-${e.id}-${i}`} className="edit-block">
                  <div className="edit-head">
                    <span className="chip chip-muted">{e.kind}</span>
                    <code className="mono-id">{e.id}</code>
                    {e.action === "delete" && (
                      <span className="chip chip-err">DELETE</span>
                    )}
                  </div>
                  {e.action === "delete" ? (
                    <p className="muted delete-note">
                      Retires {e.kind}/{e.id} from the governed catalog on merge.
                    </p>
                  ) : (
                    <pre className="spec-json compact">
                      {JSON.stringify(e.spec, null, 2)}
                    </pre>
                  )}
                </div>
              ))}
              <h4>Governance issues</h4>
              {c.issues.length === 0 ? (
                <p className="ok-note">No issues raised.</p>
              ) : (
                <IssueList issues={c.issues} />
              )}
              {c.decidedAt && (
                <p className="muted">
                  Decided by {c.decidedBy} at {fmtDate(c.decidedAt)}
                </p>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

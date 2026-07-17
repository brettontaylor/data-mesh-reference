import { useState } from "react";
import { Link } from "react-router";
import type { Changeset, ChangesetAction } from "../lib/api";
import {
  decideChangeset,
  errorMessage,
  getPersona,
  listChangesets,
  mergeChangeset,
  withdrawChangeset,
} from "../lib/api";
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

const ACTION_PAST: Record<ChangesetAction, string> = {
  approve: "approved",
  reject: "rejected",
  merge: "merged",
};

export default function ChangesetsPage() {
  const changesets = useApi(() => listChangesets(), []);
  const toast = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const persona = getPersona();

  const sorted = (changesets.data ?? [])
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
      changesets.reload();
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
      changesets.reload();
    } catch (e) {
      toast(errorMessage(e), "err");
    } finally {
      setBusy(null);
    }
  };

  const actionButtons = (c: Changeset) => {
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

  return (
    <div className="page">
      <div className="page-head">
        <h2>Changesets</h2>
        <Link to="/assets/new" className="btn btn-primary">
          + Propose asset
        </Link>
      </div>
      <p className="muted">
        Maker/checker queue — modelers propose, stewards approve or reject, domain owners
        merge. Tier 1 routes to the owning domain&apos;s stewards; Tier 2 requires chief
        data architect / architecture review board sign-off. Authors cannot decide their
        own changesets, but may withdraw them while still proposed.
      </p>

      {changesets.loading && <Loading />}
      {changesets.error && (
        <ErrorNote message={changesets.error} onRetry={changesets.reload} />
      )}

      {changesets.data && (
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
                <th>Decided by</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={10} className="muted">
                    No changesets yet — propose one from an asset page.
                  </td>
                </tr>
              )}
              {sorted.map((c) => (
                <ExpandableRow
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
      )}
    </div>
  );
}

function ExpandableRow({
  changeset: c,
  expanded,
  onToggle,
  actions,
}: {
  changeset: Changeset;
  expanded: boolean;
  onToggle: () => void;
  actions: React.ReactNode;
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
        <td className="muted">{c.decidedBy ?? "—"}</td>
        <td className="actions-cell">{actions}</td>
      </tr>
      {expanded && (
        <tr className="detail-row">
          <td colSpan={10}>
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
              <p className="muted version-plan-note">
                Versions are computed by the platform — patch for cosmetic, minor for
                additive, major for breaking.
              </p>
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

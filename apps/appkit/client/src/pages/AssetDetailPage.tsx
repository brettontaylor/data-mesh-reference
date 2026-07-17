import "./AssetDetail.css";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { AssetKind, AssetSpec, RegistryRow } from "../lib/api";
import {
  ASSET_KINDS,
  createChangeset,
  errorMessage,
  getAsset,
  getRegistry,
} from "../lib/api";
import { Breadcrumbs, Section } from "../lib/page";
import { useToast } from "../lib/toast";
import { useApi } from "../lib/useApi";
import { ClassificationChip, ErrorNote, Loading, StatusChip, specStr } from "../lib/ui";
import FocusedErd from "./FocusedErd";

/** Kinds that participate in the entity-relationship diagram. */
const ERD_KINDS = new Set<string>(["bdm", "pdm", "semantic"]);

interface FieldRow {
  name: string;
  type: string;
  classification?: string;
  pk: boolean;
  bk: boolean;
  pii: boolean;
  mnpi: boolean;
  fkEntity?: string;
  fkField?: string;
}

function extractFields(spec: AssetSpec): FieldRow[] | null {
  const raw = spec["fields"];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const rows: FieldRow[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o["name"] !== "string") continue;
    let fkEntity: string | undefined;
    let fkField: string | undefined;
    const fk = o["fk"];
    if (fk !== null && typeof fk === "object") {
      const f = fk as Record<string, unknown>;
      if (typeof f["entity"] === "string") fkEntity = f["entity"];
      if (typeof f["field"] === "string") fkField = f["field"];
    }
    rows.push({
      name: o["name"],
      type: typeof o["type"] === "string" ? o["type"] : "",
      classification:
        typeof o["classification"] === "string" ? o["classification"] : undefined,
      pk: o["pk"] === true,
      bk: o["bk"] === true,
      pii: o["pii"] === true,
      mnpi: o["mnpi"] === true,
      fkEntity,
      fkField,
    });
  }
  return rows.length > 0 ? rows : null;
}

/** Split a registry `kind:id` dependency token into a linkable target. */
function parseDep(dep: string): { kind: string; id: string; to?: string } {
  const idx = dep.indexOf(":");
  if (idx === -1) return { kind: "", id: dep };
  const kind = dep.slice(0, idx);
  const id = dep.slice(idx + 1);
  const to = (ASSET_KINDS as string[]).includes(kind)
    ? `/assets/${kind}/${id}`
    : undefined;
  return { kind, id, to };
}

export default function AssetDetailPage() {
  const { kind = "", id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const asset = useApi(() => getAsset(kind, id), [kind, id]);
  const registry = useApi(() => getRegistry(), []);

  const [retireOpen, setRetireOpen] = useState(false);
  const [retireTitle, setRetireTitle] = useState(`Retire ${kind}/${id}`);
  const [retiring, setRetiring] = useState(false);

  useEffect(() => {
    setRetireOpen(false);
    setRetireTitle(`Retire ${kind}/${id}`);
    setRetiring(false);
  }, [kind, id]);

  const spec = asset.data;
  const fields = spec ? extractFields(spec) : null;

  const row: RegistryRow | undefined = registry.data?.rows.find(
    (r) => r.kind === kind && r.id === id,
  );
  const domain = row?.domain;
  const product = row?.product;
  const deps = row?.dependsOn ?? [];

  const label = spec ? specStr(spec, "label") : undefined;
  const version = spec ? specStr(spec, "version") : undefined;
  const status = spec ? specStr(spec, "status") : undefined;
  const owner = spec ? specStr(spec, "owner") : undefined;
  const upstream = spec ? specStr(spec, "upstream") : undefined;

  const proposeRetirement = async () => {
    if (retireTitle.trim() === "" || retiring) return;
    if (!(ASSET_KINDS as string[]).includes(kind)) return;
    setRetiring(true);
    try {
      const cs = await createChangeset({
        title: retireTitle.trim(),
        edits: [{ kind: kind as AssetKind, id, action: "delete", spec: {} }],
      });
      toast(
        `Retirement proposed as Tier ${cs.tier}${
          cs.tier === 2 ? " — requires CDA sign-off" : ""
        }.`,
        "ok",
      );
      navigate("/changesets");
    } catch (e) {
      toast(errorMessage(e), "err");
      setRetiring(false);
    }
  };

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: "Dashboard", to: "/" },
          { label: "Registry", to: "/registry" },
          { label: `${kind}/${id}` },
        ]}
      />

      {asset.loading && <Loading />}
      {asset.error && <ErrorNote message={asset.error} onRetry={asset.reload} />}

      {spec && (
        <>
          <div className="ad-head">
            <div className="ad-head-main">
              <div className="ad-meta-line">
                <span className="chip chip-muted ad-kind">{kind}</span>
                {version && <span className="chip chip-muted">v{version}</span>}
                <StatusChip status={status} />
                {domain && (
                  <span className="chip chip-accent ad-domain">{domain}</span>
                )}
              </div>
              <h1 className="page-title ad-title">
                <code>{id}</code>
              </h1>
              <div className="ad-sub">
                {label && <span className="ad-label">{label}</span>}
                {(upstream || owner || product) && (
                  <div className="ad-sub-line">
                    {upstream && (
                      <span>
                        upstream: <span className="ad-sub-val">{upstream}</span>
                      </span>
                    )}
                    {owner && (
                      <span>
                        owner: <span className="ad-sub-val">{owner}</span>
                      </span>
                    )}
                    {product && (
                      <span>
                        product: <span className="ad-sub-val">{product}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="head-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(`/assets/${kind}/${id}/edit`)}
              >
                Propose edit
              </button>
              <button
                type="button"
                className="btn btn-err"
                onClick={() => setRetireOpen((v) => !v)}
              >
                Propose retirement
              </button>
            </div>
          </div>

          {retireOpen && (
            <div className="panel retire-confirm">
              <p className="retire-note">
                This proposes <strong>deleting {kind}/{id}</strong> from the governed
                catalog. Nothing is removed until the changeset is approved and merged.
              </p>
              <label className="form-row">
                <span className="form-label">Changeset title</span>
                <input
                  className="input"
                  type="text"
                  value={retireTitle}
                  onChange={(e) => setRetireTitle(e.target.value)}
                />
              </label>
              <div className="form-actions">
                <button
                  type="button"
                  className="btn btn-err"
                  disabled={retireTitle.trim() === "" || retiring}
                  onClick={() => void proposeRetirement()}
                >
                  {retiring ? "Submitting…" : "Submit retirement changeset"}
                </button>
                <button type="button" className="btn" onClick={() => setRetireOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {ERD_KINDS.has(kind) && (
            <Section kicker="Model">
              <FocusedErd focusId={id} />
            </Section>
          )}

          {fields && (
            <Section kicker="Schema">
              <div className="panel table-panel ad-panel">
                <table className="data-table ad-schema">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Type</th>
                      <th>Classification</th>
                      <th>Refs</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map((f) => (
                      <tr key={f.name}>
                        <td>
                          <code className="mono-id">{f.name}</code>
                          {f.pk && (
                            <span className="chip chip-accent ad-badge">PK</span>
                          )}
                          {f.bk && (
                            <span className="chip chip-muted ad-badge">BK</span>
                          )}
                        </td>
                        <td className="muted">{f.type || "—"}</td>
                        <td>
                          <span className="chip-row">
                            <ClassificationChip value={f.classification} />
                            {f.pii && <span className="chip chip-warn">PII</span>}
                            {f.mnpi && <span className="chip chip-warn">MNPI</span>}
                          </span>
                        </td>
                        <td>
                          {f.fkEntity ? (
                            <Link
                              className="ad-fk"
                              to={`/assets/bdm/${f.fkEntity}`}
                            >
                              <code className="mono-id">
                                {f.fkEntity}
                                {f.fkField ? `.${f.fkField}` : ""}
                              </code>
                            </Link>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {deps.length > 0 && (
            <Section kicker="Dependencies">
              <div className="ad-deps">
                {deps.map((dep) => {
                  const { kind: dk, id: di, to } = parseDep(dep);
                  const text = dk ? `${dk}: ${di}` : di;
                  return to ? (
                    <Link key={dep} to={to} className="chip chip-muted ad-dep-link">
                      {text}
                    </Link>
                  ) : (
                    <span key={dep} className="chip chip-muted">
                      {text}
                    </span>
                  );
                })}
              </div>
            </Section>
          )}

          <Section kicker="Detail">
            <pre className="spec-json ad-detail">{JSON.stringify(spec, null, 2)}</pre>
          </Section>
        </>
      )}
    </div>
  );
}

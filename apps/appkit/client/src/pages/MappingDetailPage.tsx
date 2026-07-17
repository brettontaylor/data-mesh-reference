import { Link, useParams } from "react-router";
import type {
  AssetSpec,
  MappingCoverage,
  MappingDoc,
  TransformationComplexity,
  TransformationDoc,
} from "../lib/api";
import { getAsset, getMappingDocuments } from "../lib/api";
import { Breadcrumbs } from "../lib/page";
import { ClassificationChip, ErrorNote, Loading } from "../lib/ui";
import { useApi } from "../lib/useApi";
import "./Mappings.css";

// ---------------------------------------------------------------------------
// Shared chips
// ---------------------------------------------------------------------------

/** ALL_CAPS keywords (IDENTITY, DIRECT, SCD2_START, …) vs derivation expressions. */
const KEYWORD_LOGIC = /^[A-Z][A-Z0-9_]*$/;

function LogicChip({ logic }: { logic?: string }) {
  if (logic === undefined || logic === "") return <span className="muted">—</span>;
  const keyword = KEYWORD_LOGIC.test(logic);
  return (
    <code
      className={`chip wb-logic ${keyword ? "chip-muted" : "chip-accent"}`}
      title={logic}
    >
      {logic}
    </code>
  );
}

const COMPLEXITY_CLASS: Record<TransformationComplexity, string> = {
  simple: "chip-ok",
  medium: "chip-warn",
  complex: "chip-err",
};

function ComplexityChip({ complexity }: { complexity?: string }) {
  if (complexity === undefined || complexity === "") return <span className="muted">—</span>;
  const cls =
    complexity in COMPLEXITY_CLASS
      ? COMPLEXITY_CLASS[complexity as TransformationComplexity]
      : "chip-muted";
  return <span className={`chip ${cls}`}>{complexity}</span>;
}

function CoverageMeter({ coverage }: { coverage?: MappingCoverage }) {
  if (coverage === undefined) return null;
  const pct =
    coverage.targetFields === 0
      ? 0
      : Math.round((coverage.mapped / coverage.targetFields) * 100);
  const full = coverage.targetFields > 0 && coverage.unmapped.length === 0;
  return (
    <div className="coverage-meter">
      <div className="coverage-track">
        <div
          className={`coverage-fill ${full ? "" : "coverage-partial"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="coverage-count">
        {coverage.mapped}/{coverage.targetFields} mapped
      </span>
      {full ? (
        <span className="chip chip-ok">full coverage</span>
      ) : (
        <span className="chip chip-err">{coverage.unmapped.length} unmapped</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page shell — resolve the doc by :kind/:id, wrap in the full-bleed container
// ---------------------------------------------------------------------------

export default function MappingDetailPage() {
  const { kind, id } = useParams();
  const docs = useApi(() => getMappingDocuments(), []);

  const mappingDoc =
    kind === "mapping" && id !== undefined
      ? docs.data?.bronzeToSilver.find((m) => m.mapping === id)
      : undefined;
  const transformationDoc =
    kind === "transformation" && id !== undefined
      ? docs.data?.silverToGold.find((t) => t.transformation === id)
      : undefined;

  return (
    <div className="page">
      <div className="wb-bleed">
        <Breadcrumbs
          items={[
            { label: "Dashboard", to: "/" },
            { label: "Mappings", to: "/mappings" },
            { label: id ?? "—" },
          ]}
        />

        {docs.loading && <Loading />}
        {docs.error && <ErrorNote message={docs.error} onRetry={docs.reload} />}

        {docs.data && mappingDoc && <MappingWorkbench doc={mappingDoc} />}
        {docs.data && transformationDoc && (
          <TransformationWorkbench doc={transformationDoc} />
        )}
        {docs.data && !mappingDoc && !transformationDoc && (
          <ErrorNote
            message={`No ${kind ?? "mapping"} document "${id ?? ""}" found in the contract.`}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bronze → Silver workbench (kind = mapping)
// ---------------------------------------------------------------------------

/** name → {type, classification} pulled from the target BDM, when it loads. */
type BdmFieldMeta = Map<string, { type?: string; classification?: string }>;

function readBdmFields(spec: AssetSpec | null): BdmFieldMeta {
  const map: BdmFieldMeta = new Map();
  if (spec === null) return map;
  const fields = spec.fields;
  if (!Array.isArray(fields)) return map;
  for (const f of fields) {
    if (f === null || typeof f !== "object") continue;
    const rec = f as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : undefined;
    if (name === undefined) continue;
    map.set(name, {
      type: typeof rec.type === "string" ? rec.type : undefined,
      classification:
        typeof rec.classification === "string" ? rec.classification : undefined,
    });
  }
  return map;
}

function MappingWorkbench({ doc }: { doc: MappingDoc }) {
  // Cheaply enrich each target field with its BDM type + classification.
  const bdm = useApi(() => getAsset("bdm", doc.to.id), [doc.to.id]);
  const fieldMeta = readBdmFields(bdm.data);
  const hasBdm = fieldMeta.size > 0;
  const unmapped = doc.coverage?.unmapped ?? [];
  const colCount = hasBdm ? 6 : 4;

  return (
    <>
      <header className="wb-head">
        <div className="wb-head-top">
          <div>
            <h1 className="wb-title">{doc.mapping}</h1>
            <p className="wb-flow">
              <code className="mono-id">{doc.from.id}</code>
              <span className="wb-arrow">→</span>
              <Link
                to={`/assets/bdm/${encodeURIComponent(doc.to.id)}`}
                className="chip chip-muted member-chip"
              >
                <span className="member-kind">bdm</span> {doc.to.id}
              </Link>
            </p>
            <div className="wb-meta">
              <span className="chip chip-accent wb-version">v{doc.version}</span>
              <span>
                owner <strong>{doc.owner ?? "—"}</strong>
              </span>
              <CoverageMeter coverage={doc.coverage} />
            </div>
          </div>
          <Link
            to={`/assets/mapping/${encodeURIComponent(doc.mapping)}/edit`}
            className="btn btn-primary"
          >
            Propose edit
          </Link>
        </div>
      </header>

      {unmapped.length > 0 && (
        <p className="inline-error">
          Unmapped target fields:{" "}
          {unmapped.map((f, i) => (
            <span key={f}>
              {i > 0 && ", "}
              <code className="mono-id">{f}</code>
            </span>
          ))}
        </p>
      )}

      <div className="wb-table-shell">
        <div className="wb-table-title">
          <h3>Field rules</h3>
          <span className="muted">
            {doc.rules.length} rule{doc.rules.length === 1 ? "" : "s"}
            {hasBdm ? " · typed from target BDM" : ""}
          </span>
        </div>
        <div className="wb-table-scroll">
          <table className="wb-table">
            <thead>
              <tr>
                <th>Target field</th>
                {hasBdm && <th>Type</th>}
                {hasBdm && <th>Classification</th>}
                <th>Sources</th>
                <th>Logic</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {doc.rules.map((r) => {
                const meta = fieldMeta.get(r.target);
                return (
                  <tr key={r.target}>
                    <td>
                      <code className="mono-id">{r.target}</code>
                    </td>
                    {hasBdm && (
                      <td className="wb-cell-num">
                        {meta?.type !== undefined ? (
                          <code className="mono-id">{meta.type}</code>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    )}
                    {hasBdm && (
                      <td>
                        <ClassificationChip value={meta?.classification} />
                      </td>
                    )}
                    <td className="wb-sources-cell">
                      {r.sources !== undefined && r.sources.length > 0 ? (
                        <code className="mono-id">{r.sources.join(" + ")}</code>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <LogicChip logic={r.logic} />
                    </td>
                    <td className="wb-desc">{r.description ?? "—"}</td>
                  </tr>
                );
              })}
              {unmapped.map((name) => {
                const meta = fieldMeta.get(name);
                return (
                  <tr key={`ghost-${name}`} className="wb-ghost">
                    <td>
                      <code className="mono-id">{name}</code>
                    </td>
                    {hasBdm && (
                      <td className="wb-cell-num">
                        {meta?.type !== undefined ? (
                          <code className="mono-id">{meta.type}</code>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    )}
                    {hasBdm && (
                      <td>
                        <ClassificationChip value={meta?.classification} />
                      </td>
                    )}
                    <td colSpan={colCount - (hasBdm ? 3 : 1)}>— not mapped —</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Silver → Gold workbench (kind = transformation)
// ---------------------------------------------------------------------------

function TransformationWorkbench({ doc }: { doc: TransformationDoc }) {
  const union = doc.assembly?.union ?? [];
  const subqueries = doc.assembly?.subqueries ?? [];
  const keyResolution = doc.keyResolution ?? [];

  return (
    <>
      <header className="wb-head">
        <div className="wb-head-top">
          <div>
            <h1 className="wb-title">{doc.transformation}</h1>
            <p className="wb-flow">
              <span className="wb-sources-cell">
                {doc.sourceEntities.map((e, i) => (
                  <span key={e}>
                    {i > 0 && <span className="muted"> · </span>}
                    <code className="mono-id">{e}</code>
                  </span>
                ))}
              </span>
              <span className="wb-arrow">→</span>
              <Link
                to={`/assets/pdm/${encodeURIComponent(doc.target.id)}`}
                className="chip chip-muted member-chip"
              >
                <span className="member-kind">pdm</span> {doc.target.id}
              </Link>
            </p>
            <div className="wb-meta">
              <span className="chip chip-accent wb-version">v{doc.version}</span>
              <span>
                owner <strong>{doc.owner ?? "—"}</strong>
              </span>
              <ComplexityChip complexity={doc.complexity} />
              <span>
                {doc.fieldCount} field{doc.fieldCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <Link
            to={`/assets/transformation/${encodeURIComponent(doc.transformation)}/edit`}
            className="btn btn-primary"
          >
            Propose edit
          </Link>
        </div>
      </header>

      <div className="wb-panels">
        <div className="wb-panel">
          <p className="wb-panel-title">Sources</p>
          <table className="data-table">
            <thead>
              <tr>
                <th>Alias</th>
                <th>Entity</th>
                <th>Join</th>
              </tr>
            </thead>
            <tbody>
              {doc.sources.map((s) => (
                <tr key={s.alias}>
                  <td>
                    <code className="mono-id">{s.alias}</code>
                  </td>
                  <td>
                    <Link
                      to={`/assets/bdm/${encodeURIComponent(s.entity)}`}
                      className="chip chip-muted member-chip"
                    >
                      <span className="member-kind">bdm</span> {s.entity}
                    </Link>
                  </td>
                  <td>
                    {s.join !== undefined ? (
                      <code className="mono-id">{s.join}</code>
                    ) : (
                      <span className="muted">driving table</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {keyResolution.length > 0 && (
          <div className="wb-panel">
            <p className="wb-panel-title">Key resolution</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Dimension</th>
                  <th>Dim key</th>
                </tr>
              </thead>
              <tbody>
                {keyResolution.map((k, i) => (
                  <tr key={`${k.when}-${i}`}>
                    <td>
                      <code className="mono-id">{k.when}</code>
                    </td>
                    <td className="muted">{k.dim}</td>
                    <td>
                      <code className="mono-id">{k.dimId}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {union.length > 0 && (
          <div className="wb-panel wb-panel-wide">
            <p className="wb-panel-title">Union branches</p>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Branch</th>
                  <th>Filter</th>
                  <th>Column overrides</th>
                </tr>
              </thead>
              <tbody>
                {union.map((b) => (
                  <tr key={b.branch}>
                    <td>
                      <code className="mono-id">{b.branch}</code>
                    </td>
                    <td>
                      {b.filter !== undefined ? (
                        <code className="mono-id">{b.filter}</code>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">
                      {b.columns === undefined || Object.keys(b.columns).length === 0
                        ? "—"
                        : Object.entries(b.columns)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {subqueries.length > 0 && (
          <div className="wb-panel wb-panel-wide">
            <p className="wb-panel-title">Subqueries</p>
            {subqueries.map((sq) => (
              <div key={sq.alias}>
                <code className="mono-id wb-sql-alias">{sq.alias}</code>
                <pre className="wb-sql">{sq.sql.trimEnd()}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="wb-table-shell">
        <div className="wb-table-title">
          <h3>Fields</h3>
          <span className="muted">
            {doc.fields.length} field{doc.fields.length === 1 ? "" : "s"} · bronze lineage
          </span>
        </div>
        <div className="wb-table-scroll">
          <table className="wb-table">
            <thead>
              <tr>
                <th>Target</th>
                <th>From</th>
                <th>Logic</th>
                <th>Refmap</th>
                <th>Join</th>
                <th title="Raw-layer column this gold field ultimately descends from">
                  Bronze lineage
                </th>
                <th>Complexity</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {doc.fields.map((f) => (
                <tr key={f.target}>
                  <td>
                    <code className="mono-id">{f.target}</code>
                  </td>
                  <td>
                    {f.from !== undefined ? (
                      <code className="mono-id">{f.from}</code>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <LogicChip logic={f.logic} />
                  </td>
                  <td>
                    {f.refmap !== undefined ? (
                      <Link
                        to={`/assets/refmap/${encodeURIComponent(f.refmap)}`}
                        className="chip chip-muted member-chip"
                      >
                        <span className="member-kind">refmap</span> {f.refmap}
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {f.join !== undefined ? (
                      <code className="mono-id">{f.join}</code>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    {f.bronze !== undefined ? (
                      <code className="mono-id wb-lineage">{f.bronze}</code>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <ComplexityChip complexity={f.complexity} />
                  </td>
                  <td className="wb-desc">{f.description ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

import { Link, useNavigate } from "react-router";
import type {
  MappingCoverage,
  MappingDoc,
  TransformationComplexity,
  TransformationDoc,
} from "../lib/api";
import { getMappingDocuments } from "../lib/api";
import { Breadcrumbs, PageHeader, Section } from "../lib/page";
import { ErrorNote, Loading } from "../lib/ui";
import { useApi } from "../lib/useApi";
import "./Mappings.css";

// ---------------------------------------------------------------------------
// Shared chips
// ---------------------------------------------------------------------------

const COMPLEXITY_CLASS: Record<TransformationComplexity, string> = {
  simple: "chip-ok",
  medium: "chip-warn",
  complex: "chip-err",
};

function ComplexityChip({ complexity }: { complexity?: TransformationComplexity }) {
  if (complexity === undefined) return <span className="muted">—</span>;
  return <span className={`chip ${COMPLEXITY_CLASS[complexity]}`}>{complexity}</span>;
}

function CoverageMeter({ coverage }: { coverage?: MappingCoverage }) {
  if (coverage === undefined) return <span className="muted">—</span>;
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
        {coverage.mapped}/{coverage.targetFields}
      </span>
      {full ? (
        <span className="chip chip-ok">full coverage</span>
      ) : (
        <span className="chip chip-err" title={coverage.unmapped.join(", ")}>
          {coverage.unmapped.length} unmapped
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MappingsPage() {
  const docs = useApi(() => getMappingDocuments(), []);

  const bronzeToSilver = docs.data?.bronzeToSilver ?? [];
  const silverToGold = docs.data?.silverToGold ?? [];

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: "Dashboard", to: "/" }, { label: "Mappings" }]} />
      <PageHeader
        kicker="MAPPINGS"
        title="Mapping documents"
        sub="Governed bronze→silver source mappings and silver→gold transformations."
        actions={
          <Link to="/assets/new?kind=mapping" className="btn btn-primary">
            + New mapping
          </Link>
        }
      />

      {docs.loading && <Loading />}
      {docs.error && <ErrorNote message={docs.error} onRetry={docs.reload} />}

      {docs.data && (
        <>
          <Section kicker="BRONZE → SILVER · SOURCE MAPPINGS">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Mapping</th>
                  <th>From source</th>
                  <th>To BDM</th>
                  <th>Version</th>
                  <th>Owner</th>
                  <th>Coverage</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {bronzeToSilver.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      No bronze→silver mapping documents in the contract.
                    </td>
                  </tr>
                )}
                {bronzeToSilver.map((m) => (
                  <MappingRow key={m.mapping} doc={m} />
                ))}
              </tbody>
            </table>
          </Section>

          <Section kicker="SILVER → GOLD · TRANSFORMATIONS">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Transformation</th>
                  <th>Target PDM</th>
                  <th>Complexity</th>
                  <th>Version</th>
                  <th>Owner</th>
                  <th>Sources</th>
                  <th>Refmaps</th>
                  <th>Fields</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {silverToGold.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted">
                      No silver→gold transformation documents in the contract.
                    </td>
                  </tr>
                )}
                {silverToGold.map((t) => (
                  <TransformationRow key={t.transformation} doc={t} />
                ))}
              </tbody>
            </table>
          </Section>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bronze → Silver rows — link to /mappings/mapping/<id>
// ---------------------------------------------------------------------------

function MappingRow({ doc: m }: { doc: MappingDoc }) {
  const navigate = useNavigate();
  const to = `/mappings/mapping/${encodeURIComponent(m.mapping)}`;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <tr className="mp-row" onClick={() => navigate(to)}>
      <td>
        <Link to={to} className="mp-id-link" onClick={stop}>
          <code className="mono-id">{m.mapping}</code>
        </Link>
      </td>
      <td>
        <code className="mono-id">{m.from.id}</code>
      </td>
      <td onClick={stop}>
        <Link
          to={`/assets/bdm/${encodeURIComponent(m.to.id)}`}
          className="chip chip-muted member-chip"
        >
          <span className="member-kind">bdm</span> {m.to.id}
        </Link>
      </td>
      <td className="muted">{m.version}</td>
      <td className="muted">{m.owner ?? "—"}</td>
      <td className="coverage-cell">
        <CoverageMeter coverage={m.coverage} />
      </td>
      <td className="mp-chevron" aria-hidden="true">
        ›
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Silver → Gold rows — link to /mappings/transformation/<id>
// ---------------------------------------------------------------------------

function TransformationRow({ doc: t }: { doc: TransformationDoc }) {
  const navigate = useNavigate();
  const to = `/mappings/transformation/${encodeURIComponent(t.transformation)}`;
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <tr className="mp-row" onClick={() => navigate(to)}>
      <td>
        <Link to={to} className="mp-id-link" onClick={stop}>
          <code className="mono-id">{t.transformation}</code>
        </Link>
      </td>
      <td onClick={stop}>
        <Link
          to={`/assets/pdm/${encodeURIComponent(t.target.id)}`}
          className="chip chip-muted member-chip"
        >
          <span className="member-kind">pdm</span> {t.target.id}
        </Link>
      </td>
      <td>
        <ComplexityChip complexity={t.complexity} />
      </td>
      <td className="muted">{t.version}</td>
      <td className="muted">{t.owner ?? "—"}</td>
      <td>
        <span className="mp-sources">
          {t.sources.map((s, i) => (
            <span key={s.alias}>
              {i > 0 && <span className="muted"> · </span>}
              <span className="muted">{s.alias}:</span>{" "}
              <code className="mono-id">{s.entity}</code>
            </span>
          ))}
        </span>
      </td>
      <td onClick={stop}>
        {t.refmaps.length === 0 ? (
          <span className="muted">—</span>
        ) : (
          <span className="chip-row">
            {t.refmaps.map((r) => (
              <Link
                key={r}
                to={`/assets/refmap/${encodeURIComponent(r)}`}
                className="chip chip-muted member-chip"
              >
                <span className="member-kind">refmap</span> {r}
              </Link>
            ))}
          </span>
        )}
      </td>
      <td className="muted mp-count">{t.fieldCount}</td>
      <td className="mp-chevron" aria-hidden="true">
        ›
      </td>
    </tr>
  );
}

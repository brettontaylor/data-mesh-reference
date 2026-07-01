// Renders a silver→gold transformation as a published spec page (from the governed asset).
type Ref = { kind: string; id: string };
type Src = { alias: string; entity: string; join?: string };
type Key = { when: string; dim: string; dimId: string };
type Union = { branch: string; filter?: string; columns?: Record<string, string> };
type Sub = { alias: string; sql: string };
type FieldMap = {
  target: string; from?: string; logic?: string; lookupDim?: string;
  refmap?: string; join?: string; bronze?: string; complexity?: string;
};
type Detail = {
  layer?: string; complexity?: string; target?: Ref; sources?: Src[];
  assembly?: { union?: Union[]; subqueries?: Sub[] } | null;
  keyResolution?: Key[]; uses?: string[]; fields?: FieldMap[];
};

const th = "px-3 py-2 font-mono text-[0.6rem] uppercase tracking-wider text-muted";
const td = "px-3 py-2 align-top";

function complexityChip(c?: string) {
  const map: Record<string, string> = {
    simple: "bg-accent/10 text-accent border-accent/25",
    medium: "bg-brass/15 text-brass border-brass/30",
    complex: "bg-red-500/10 text-red-700 border-red-500/25",
  };
  if (!c) return null;
  return <span className={`rounded-sm border px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider ${map[c] ?? map.medium}`}>{c}</span>;
}

export function TransformationSpec({ detail }: { detail: Detail }) {
  const d = detail ?? {};
  const fields = d.fields ?? [];
  return (
    <div className="mt-8 space-y-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm text-muted">
          <span className="text-accent">SILVER</span> → <span className="text-brass">GOLD</span>
          {d.target && <> · target <b className="text-ink">{d.target.kind}:{d.target.id}</b></>}
        </span>
        {complexityChip(d.complexity)}
        {(d.uses ?? []).map((u) => (
          <span key={u} className="rounded-sm border border-line bg-paper-soft px-2 py-0.5 font-mono text-[0.6rem] text-ink">refmap:{u}</span>
        ))}
      </div>

      {(d.sources?.length ?? 0) > 0 && (
        <section>
          <h2 className="font-mono text-sm uppercase tracking-wider text-accent">Data sourcing</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-soft"><tr><th className={th}>Alias</th><th className={th}>Silver entity</th><th className={th}>Join</th></tr></thead>
              <tbody>
                {d.sources!.map((s) => (
                  <tr key={s.alias} className="border-t border-line">
                    <td className={`${td} font-mono text-ink`}>{s.alias}</td>
                    <td className={`${td} font-mono text-ink`}>{s.entity}</td>
                    <td className={`${td} font-mono text-xs text-muted`}>{s.join ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(d.keyResolution?.length ?? 0) > 0 && (
        <section>
          <h2 className="font-mono text-sm uppercase tracking-wider text-accent">Key resolution</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-soft"><tr><th className={th}>When</th><th className={th}>Dimension</th><th className={th}>DimID</th></tr></thead>
              <tbody>
                {d.keyResolution!.map((k, i) => (
                  <tr key={i} className="border-t border-line">
                    <td className={`${td} font-mono text-xs text-ink`}>{k.when}</td>
                    <td className={`${td} font-mono text-ink`}>{k.dim}</td>
                    <td className={`${td} font-mono text-xs text-muted`}>{k.dimId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {(d.assembly?.subqueries?.length ?? 0) > 0 && (
        <section>
          <h2 className="font-mono text-sm uppercase tracking-wider text-accent">Subqueries</h2>
          {d.assembly!.subqueries!.map((s) => (
            <div key={s.alias} className="mt-3">
              <p className="font-mono text-xs text-ink">{s.alias}</p>
              <pre className="mt-1 overflow-x-auto rounded border border-line bg-paper-soft p-3 font-mono text-xs text-ink">{s.sql}</pre>
            </div>
          ))}
        </section>
      )}

      <section>
        <h2 className="font-mono text-sm uppercase tracking-wider text-accent">Transformation mapping</h2>
        <div className="mt-3 overflow-x-auto rounded-xl border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper-soft">
              <tr>
                <th className={th}>Gold field</th><th className={th}>From (silver)</th><th className={th}>Logic</th>
                <th className={th}>Lookup dim</th><th className={th}>RefMap / join</th><th className={th}>Bronze</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.target} className="border-t border-line">
                  <td className={`${td} font-mono text-ink`}>{f.target}</td>
                  <td className={`${td} font-mono text-xs text-muted`}>{f.from ?? "—"}</td>
                  <td className={`${td} font-mono text-[0.7rem]`}>
                    <span className="rounded-sm border border-line bg-paper-soft px-1.5 py-0.5 text-ink">{f.logic ?? "DIRECT"}</span>
                  </td>
                  <td className={`${td} font-mono text-xs text-muted`}>{f.lookupDim ?? "—"}</td>
                  <td className={`${td} font-mono text-xs text-muted`}>{[f.refmap, f.join].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={`${td} font-mono text-xs text-muted`}>{f.bronze ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

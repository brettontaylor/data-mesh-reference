import { dct } from "../lib/client";

export const dynamic = "force-dynamic";

export default async function Pipelines() {
  const pipelines = await dct.pipelines();
  const withRuns = await Promise.all(
    pipelines.map(async (p) => ({ p, runs: await dct.pipelineRuns(p.id) })),
  );

  return (
    <>
      <p className="eyebrow">Orchestration</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Pipelines</h1>
      <p className="mt-2 text-sm text-muted">
        Metadata-driven medallion pipelines, derived from registered sources and
        driven by the orchestration adapter ({pipelines[0]?.engine ?? "local"}).
        Trigger via API/CLI: <code className="font-mono">POST /api/v1/pipelines/&lt;id&gt;/trigger</code>.
      </p>

      <div className="mt-6 space-y-4">
        {withRuns.map(({ p, runs }) => {
          const last = runs[0];
          return (
            <div key={p.id} className="rounded-xl border border-line bg-paper p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-mono font-semibold text-ink">{p.id}</h2>
                  <p className="mt-1 font-mono text-xs text-muted">
                    {p.domain} · {p.engine} · produces {p.produces.join(", ")}
                    {p.cadenceDays ? ` · every ${p.cadenceDays}d` : ""}
                  </p>
                </div>
                <div className="text-right font-mono text-xs">
                  {last ? (
                    <>
                      <span className={last.status === "success" ? "text-accent" : "text-red-600"}>
                        ● {last.status}
                      </span>
                      <div className="text-muted">
                        in {last.metrics.rowsIn ?? "—"} → out {last.metrics.rowsOut ?? "—"} ·{" "}
                        {last.lineageEvents} lineage · {runs.length} run(s)
                      </div>
                    </>
                  ) : (
                    <span className="text-muted">no runs yet</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

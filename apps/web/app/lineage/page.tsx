import { dct } from "../lib/client";

export const dynamic = "force-dynamic";

export default async function Lineage() {
  const g = await dct.lineage();
  const edges = g.edges;
  const isObserved = (from: string, to: string) =>
    edges.some((e) => e.from === from && e.to === to && e.observed);

  // entities = gold table nodes (gold:<e> without a column suffix)
  const entities = g.nodes
    .filter((n) => n.startsWith("gold:") && !n.includes("."))
    .map((n) => n.slice("gold:".length))
    .sort();

  const sourceFor = (e: string) =>
    edges.find((x) => x.to === `bronze:${e}`)?.from?.replace("source:", "") ?? "—";
  const columnsFor = (e: string) => g.nodes.filter((n) => n.startsWith(`gold:${e}.`)).length;
  const consumersFor = (e: string) =>
    edges.filter((x) => x.from === `gold:${e}` && x.to.startsWith("semantic:")).map((x) => x.to.replace("semantic:", ""));

  const Arrow = ({ from, to }: { from: string; to: string }) => (
    <span className={isObserved(from, to) ? "text-accent" : "text-muted"} title={isObserved(from, to) ? "observed in a run" : "static"}>
      →
    </span>
  );

  return (
    <>
      <p className="eyebrow">Lineage</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">Column-level lineage</h1>
      <p className="mt-2 text-sm text-muted">
        {g.nodes.length} nodes · {edges.length} edges · static from the models, enriched
        by observed pipeline runs (<span className="text-accent">→</span> = observed).
      </p>

      <div className="mt-6 space-y-3">
        {entities.map((e) => (
          <div key={e} className="rounded-xl border border-line bg-paper p-4">
            <div className="flex flex-wrap items-center gap-2 font-mono text-sm">
              <span className="rounded bg-paper-soft px-2 py-1 text-muted">source:{sourceFor(e)}</span>
              <Arrow from={`source:${sourceFor(e)}`} to={`bronze:${e}`} />
              <span className="rounded bg-paper-soft px-2 py-1">bronze:{e}</span>
              <Arrow from={`bronze:${e}`} to={`silver:${e}`} />
              <span className="rounded bg-paper-soft px-2 py-1">silver:{e}</span>
              <Arrow from={`silver:${e}`} to={`gold:${e}`} />
              <span className="rounded bg-accent/10 px-2 py-1 text-accent">gold:{e}</span>
              <span className="text-xs text-muted">({columnsFor(e)} cols)</span>
              {consumersFor(e).map((c) => (
                <span key={c} className="ml-1 rounded border border-brass/30 bg-brass/10 px-2 py-1 text-xs text-brass">
                  → semantic:{c}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

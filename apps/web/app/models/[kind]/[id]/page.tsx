import Link from "next/link";
import { notFound } from "next/navigation";
import { dct } from "../../../lib/client";
import type { ModelKind } from "@dct/sdk";
import { ClassificationBadge, TagBadge, VersionBadge } from "@/components/Badges";
import { TransformationSpec } from "@/components/TransformationSpec";
import { ErdExplorer } from "../../../../erd";

export const dynamic = "force-dynamic";

export default async function ModelDetail({
  params,
}: {
  params: Promise<{ kind: string; id: string }>;
}) {
  const { kind, id } = await params;
  let model;
  try {
    model = await dct.model(kind as ModelKind, id);
  } catch {
    notFound();
  }
  if (!model) notFound();

  // For a BDM, pull the full BDM set so we can embed an entity-focused ERD.
  const bdms = model.kind === "bdm" ? (await dct.models({ kind: "bdm" })).models : [];

  return (
    <>
      <Link href="/" className="font-mono text-xs text-muted hover:text-accent">← catalog</Link>
      <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-start">
        <div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs uppercase tracking-wider text-accent">{model.kind}</span>
            <VersionBadge version={model.version} />
            <span className="font-mono text-xs text-muted">{model.status} · {model.domain}</span>
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{model.id}</h1>
          <p className="mt-2 text-muted">{model.description ?? "—"}</p>
          {model.upstream && (
            <p className="mt-1 font-mono text-xs text-muted">upstream: {model.upstream}</p>
          )}
        </div>

        {model.kind === "bdm" && bdms.length > 0 && (
          <ErdExplorer
            models={bdms}
            initialFocus={model.id}
            compact
            openHref={`/model?focus=${model.id}`}
            height="200px"
          />
        )}
      </div>

      {model.kind === "transformation" && (
        <TransformationSpec detail={model.detail as Parameters<typeof TransformationSpec>[0]["detail"]} />
      )}

      {model.kind === "refmap" && (
        <section className="mt-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-accent">Reference map</h2>
          {(() => {
            const rm = model.detail as { keyType?: string; source?: string; entries?: { from: string; to: string }[] };
            return (
              <>
                <p className="mt-2 text-sm text-muted">{rm.keyType ?? "—"}{rm.source ? ` · source: ${rm.source}` : ""}</p>
                {(rm.entries?.length ?? 0) > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-xl border border-line">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-paper-soft"><tr><th className="px-3 py-2 font-mono text-[0.6rem] uppercase tracking-wider text-muted">From</th><th className="px-3 py-2 font-mono text-[0.6rem] uppercase tracking-wider text-muted">To</th></tr></thead>
                      <tbody>
                        {rm.entries!.map((e) => (
                          <tr key={e.from} className="border-t border-line"><td className="px-3 py-2 font-mono text-ink">{e.from}</td><td className="px-3 py-2 font-mono text-muted">{e.to}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}
        </section>
      )}

      {model.fields.length > 0 && (
        <section className="mt-8">
          <h2 className="font-mono text-sm uppercase tracking-wider text-accent">Schema</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper-soft font-mono text-[0.65rem] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-2">Field</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Classification</th>
                  <th className="px-4 py-2">Refs</th>
                </tr>
              </thead>
              <tbody>
                {model.fields.map((f) => (
                  <tr key={f.name} className="border-t border-line">
                    <td className="px-4 py-2 font-mono text-ink">
                      {f.name}
                      {f.isPk && <span className="ml-1.5 font-mono text-[0.55rem] uppercase text-brass">pk</span>}
                    </td>
                    <td className="px-4 py-2 font-mono text-muted">{f.type}</td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1">
                        <ClassificationBadge level={f.classification} />
                        {f.pii && <TagBadge tag="pii" />}
                        {f.mnpi && <TagBadge tag="mnpi" />}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted">{f.fkRef ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="mt-8 grid gap-8 sm:grid-cols-2">
        <div>
          <h2 className="font-mono text-sm uppercase tracking-wider text-accent">Dependencies</h2>
          <ul className="mt-3 space-y-1.5 font-mono text-xs">
            {model.dependsOn.length === 0 && <li className="text-muted">—</li>}
            {model.dependsOn.map((d) => (
              <li key={d} className="rounded border border-line bg-paper-soft px-2.5 py-1.5 text-ink">{d}</li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-mono text-sm uppercase tracking-wider text-accent">Detail</h2>
          <pre className="mt-3 overflow-x-auto rounded border border-line bg-paper-soft p-3 font-mono text-xs text-ink">
            {JSON.stringify(model.detail, null, 2)}
          </pre>
        </div>
      </section>

      <p className="mt-8 font-mono text-xs text-muted">
        contract: <a className="text-accent hover:underline" href={`${process.env.DCT_API_URL ?? "http://localhost:4400"}/api/v1/models/${model.kind}/${model.id}/schema.json`}>schema.json</a> · signature {model.signature}
      </p>
    </>
  );
}

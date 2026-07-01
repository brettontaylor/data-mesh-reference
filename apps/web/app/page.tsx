import Link from "next/link";
import { dct } from "./lib/client";
import { ClassificationBadge, TagBadge, VersionBadge } from "@/components/Badges";

export const dynamic = "force-dynamic";

export default async function Catalog() {
  let models: Awaited<ReturnType<typeof dct.registry>> | null = null;
  let domains: Awaited<ReturnType<typeof dct.domains>> = [];
  let err: string | null = null;
  try {
    models = await dct.registry();
    domains = await dct.domains();
  } catch (e) {
    err = String(e);
  }

  if (err || !models) {
    return (
      <div className="rounded-xl border border-line bg-paper-soft p-8">
        <p className="eyebrow">Catalog</p>
        <h1 className="mt-3 text-2xl font-semibold">Control plane unreachable</h1>
        <p className="mt-2 text-sm text-muted">
          Could not reach the DEAL Control Tower API at{" "}
          <code className="font-mono">{process.env.DCT_API_URL ?? "http://localhost:4400"}</code>.
          Start it with <code className="font-mono">pnpm --filter @dct/api start</code>.
        </p>
        <p className="mt-2 font-mono text-xs text-red-700">{err}</p>
      </div>
    );
  }

  const byDomain = new Map<string, typeof models.models>();
  for (const m of models.models) {
    if (!byDomain.has(m.domain)) byDomain.set(m.domain, []);
    byDomain.get(m.domain)!.push(m);
  }

  return (
    <>
      <p className="eyebrow">Catalog</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {models.count} models across {domains?.length ?? 0} domains
      </h1>
      <p className="mt-2 text-sm text-muted">
        Live from the control-plane API — projected from the Git models repo.
        {" "}
        {Object.entries(models.counts).map(([k, n]) => `${n} ${k}`).join(" · ")}
      </p>

      {[...byDomain.entries()].sort().map(([domain, list]) => (
        <section key={domain} className="mt-10">
          <h2 className="font-mono text-sm uppercase tracking-wider text-accent">{domain}</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((m) => (
              <div
                key={`${m.kind}:${m.id}`}
                className="group flex flex-col rounded-xl border border-line bg-paper p-5 transition-colors hover:border-accent/40"
              >
                <Link href={`/models/${m.kind}/${m.id}`} className="block">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs uppercase tracking-wider text-muted">{m.kind}</span>
                    <VersionBadge version={m.version} />
                  </div>
                  <h3 className="mt-2 font-semibold text-ink">{m.id}</h3>
                  <p className="mt-1 text-sm text-muted">{m.description ?? "—"}</p>
                  {m.upstream && (
                    <p className="mt-2 font-mono text-[0.65rem] text-muted">↑ {m.upstream}</p>
                  )}
                  {m.fields.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {[...new Set(m.fields.map((f) => f.classification))].sort().map((c) => (
                        <ClassificationBadge key={c} level={c} />
                      ))}
                      {m.fields.some((f) => f.pii) && <TagBadge tag="pii" />}
                      {m.fields.some((f) => f.mnpi) && <TagBadge tag="mnpi" />}
                    </div>
                  )}
                </Link>
                {m.kind === "bdm" && (
                  <Link
                    href={`/model?focus=${m.id}`}
                    className="mt-3 inline-block font-mono text-xs text-accent hover:underline"
                  >
                    Open in ERD →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}

import Link from "next/link";
import { dct } from "../lib/client";
import { VersionBadge } from "@/components/Badges";

export const dynamic = "force-dynamic";

export default async function Registry() {
  const reg = await dct.registry();
  return (
    <>
      <p className="eyebrow">Model registry</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {reg.count} registered models
      </h1>
      <p className="mt-2 text-sm text-muted">
        {Object.entries(reg.counts).map(([k, n]) => `${n} ${k}`).join(" · ")}
      </p>
      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper-soft font-mono text-[0.65rem] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2.5">Model</th>
              <th className="px-4 py-2.5">Kind</th>
              <th className="px-4 py-2.5">Version</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Domain</th>
              <th className="px-4 py-2.5">Depends on</th>
            </tr>
          </thead>
          <tbody>
            {reg.models.map((m) => (
              <tr key={`${m.kind}:${m.id}`} className="border-t border-line">
                <td className="px-4 py-2.5 font-mono text-ink">
                  <Link href={`/models/${m.kind}/${m.id}`} className="hover:text-accent">{m.id}</Link>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{m.kind}</td>
                <td className="px-4 py-2.5"><VersionBadge version={m.version} /></td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{m.status}</td>
                <td className="px-4 py-2.5 font-mono text-xs text-muted">{m.domain}</td>
                <td className="px-4 py-2.5 font-mono text-[0.65rem] text-muted">{m.dependsOn.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

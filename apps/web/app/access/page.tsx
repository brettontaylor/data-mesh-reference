import { dct } from "../lib/client";
import { ClassificationBadge } from "@/components/Badges";

export const dynamic = "force-dynamic";

export default async function Access() {
  const access = await dct.access();
  return (
    <>
      <p className="eyebrow">Access control</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        Roles &amp; clearance
      </h1>
      <p className="mt-2 text-sm text-muted">
        Attribute-level access governed by classification (tier + PII + MNPI), not a
        paywall. Default role: <span className="font-mono text-ink">{access.defaultRole}</span>.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {access.tiers.map((t) => <ClassificationBadge key={t} level={t} />)}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="bg-paper-soft font-mono text-[0.65rem] uppercase tracking-wider text-muted">
            <tr>
              <th className="px-4 py-2.5">Role</th>
              <th className="px-4 py-2.5">Max tier</th>
              <th className="px-4 py-2.5">PII</th>
              <th className="px-4 py-2.5">MNPI</th>
              <th className="px-4 py-2.5">Description</th>
            </tr>
          </thead>
          <tbody>
            {access.roles.map((r) => (
              <tr key={r.role} className="border-t border-line">
                <td className="px-4 py-2.5 font-mono text-ink">{r.label}</td>
                <td className="px-4 py-2.5"><ClassificationBadge level={r.maxTier} /></td>
                <td className="px-4 py-2.5">{r.pii ? <span className="text-accent">✓</span> : <span className="text-red-600">✗</span>}</td>
                <td className="px-4 py-2.5">{r.mnpi ? <span className="text-accent">✓</span> : <span className="text-red-600">✗</span>}</td>
                <td className="px-4 py-2.5 text-muted">{r.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

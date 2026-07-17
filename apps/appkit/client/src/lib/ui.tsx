import type { ChangesetTier, Issue, VersionLevel } from "./api";

const STATUS_CLASS: Record<string, string> = {
  active: "chip-ok",
  merged: "chip-ok",
  approved: "chip-ok",
  succeeded: "chip-ok",
  draft: "chip-accent",
  proposed: "chip-accent",
  deprecated: "chip-warn",
  rejected: "chip-err",
  failed: "chip-err",
  withdrawn: "chip-muted",
};

export function StatusChip({ status }: { status?: string }) {
  if (!status) return <span className="muted">—</span>;
  const cls = STATUS_CLASS[status.toLowerCase()] ?? "chip-muted";
  return <span className={`chip ${cls}`}>{status}</span>;
}

/** Tier badge — T1 minor (accent) / T2 impactful (warn). */
export function TierBadge({
  tier,
  reasons,
}: {
  tier: ChangesetTier;
  reasons?: string[];
}) {
  const cls = tier === 2 ? "chip-warn" : "chip-accent";
  const title =
    reasons && reasons.length > 0
      ? reasons.join("\n")
      : tier === 2
        ? "Tier 2 — impactful/breaking change"
        : "Tier 1 — minor change";
  return (
    <span className={`chip tier-badge ${cls}`} title={title}>
      T{tier}
    </span>
  );
}

/** Small domain chip list ("*" renders as all-domains). */
export function DomainChips({ domains }: { domains: string[] }) {
  if (domains.length === 0) return <span className="muted">—</span>;
  return (
    <span className="chip-row">
      {domains.map((d) => (
        <span key={d} className="chip chip-muted domain-chip">
          {d === "*" ? "all domains" : d}
        </span>
      ))}
    </span>
  );
}

/** Semver bump level chip — initial/none muted, patch ok, minor accent, major warn, delete err. */
const LEVEL_CLASS: Record<VersionLevel, string> = {
  initial: "chip-muted",
  none: "chip-muted",
  patch: "chip-ok",
  minor: "chip-accent",
  major: "chip-warn",
  delete: "chip-err",
};

export function VersionLevelChip({ level }: { level: VersionLevel }) {
  return (
    <span className={`chip version-level-chip ${LEVEL_CLASS[level]}`}>{level}</span>
  );
}

/** PII / MNPI clearance badges. */
export function ClearanceBadges({ pii, mnpi }: { pii: boolean; mnpi: boolean }) {
  return (
    <span className="chip-row">
      <span className={`chip ${pii ? "chip-warn" : "chip-muted"}`}>
        {pii ? "PII" : "no PII"}
      </span>
      <span className={`chip ${mnpi ? "chip-warn" : "chip-muted"}`}>
        {mnpi ? "MNPI" : "no MNPI"}
      </span>
    </span>
  );
}

const CLASSIFICATION_CLASS: Record<string, string> = {
  public: "chip-ok",
  internal: "chip-accent",
  confidential: "chip-warn",
  restricted: "chip-err",
};

export function ClassificationChip({ value }: { value?: string }) {
  if (!value) return <span className="muted">—</span>;
  const cls = CLASSIFICATION_CLASS[value.toLowerCase()] ?? "chip-muted";
  return <span className={`chip ${cls}`}>{value}</span>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="muted loading">{label}</p>;
}

export function ErrorNote({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="error-note">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn-small" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="issue-list">
      {issues.map((issue, i) => (
        <li key={`${issue.code}-${i}`} className={`issue issue-${issue.level}`}>
          <span className={`chip ${issue.level === "error" ? "chip-err" : "chip-warn"}`}>
            {issue.level}
          </span>
          <code className="issue-code">{issue.code}</code>
          <span>{issue.message}</span>
        </li>
      ))}
    </ul>
  );
}

export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Safe string extraction from an arbitrary spec object. */
export function specStr(spec: Record<string, unknown>, key: string): string | undefined {
  const v = spec[key];
  return typeof v === "string" ? v : undefined;
}

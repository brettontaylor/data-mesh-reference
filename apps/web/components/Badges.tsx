const cls: Record<string, string> = {
  public: "bg-accent/10 text-accent border-accent/25",
  internal: "bg-ink/[0.06] text-ink/70 border-line",
  confidential: "bg-brass/15 text-brass border-brass/30",
  restricted: "bg-red-500/10 text-red-700 border-red-500/25",
};

export function ClassificationBadge({ level }: { level: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[0.6rem] uppercase tracking-wider ${cls[level] ?? cls.internal}`}>
      {level}
    </span>
  );
}

export function TagBadge({ tag }: { tag: "pii" | "mnpi" }) {
  const styles = tag === "pii"
    ? "bg-violet-500/12 text-violet-700 border-violet-500/30"
    : "bg-amber-500/15 text-amber-700 border-amber-500/30";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[0.55rem] font-medium uppercase tracking-wider ${styles}`}>
      {tag}
    </span>
  );
}

export function VersionBadge({ version }: { version: string }) {
  return (
    <span className="rounded border border-accent/25 bg-accent/10 px-1.5 py-0.5 font-mono text-xs text-accent">
      v{version}
    </span>
  );
}

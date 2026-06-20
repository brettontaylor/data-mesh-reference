// Semantic-versioning utilities for model control.
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parseSemver(v: string | undefined | null): SemVer | null {
  if (!v || typeof v !== "string") return null;
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) return null;
  return { major: +m[1]!, minor: +m[2]!, patch: +m[3]! };
}

export type Level = "none" | "patch" | "minor" | "major";
const RANK: Record<Level, number> = { none: 0, patch: 1, minor: 2, major: 3 };

export function levelRank(l: Level): number {
  return RANK[l];
}

/** How `next` differs from `prev`. "decrease" if next < prev. */
export function bumpKind(prev: string, next: string): Level | "decrease" | "invalid" {
  const a = parseSemver(prev);
  const b = parseSemver(next);
  if (!a || !b) return "invalid";
  if (b.major < a.major) return "decrease";
  if (b.major > a.major) return "major";
  if (b.minor < a.minor) return "decrease";
  if (b.minor > a.minor) return "minor";
  if (b.patch < a.patch) return "decrease";
  if (b.patch > a.patch) return "patch";
  return "none";
}

/** Suggest the next version for a required bump level. */
export function nextVersion(prev: string, level: Level): string {
  const a = parseSemver(prev) ?? { major: 0, minor: 0, patch: 0 };
  if (level === "major") return `${a.major + 1}.0.0`;
  if (level === "minor") return `${a.major}.${a.minor + 1}.0`;
  if (level === "patch") return `${a.major}.${a.minor}.${a.patch + 1}`;
  return prev;
}

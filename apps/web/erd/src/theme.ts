// Single place to re-skin the ERD. Colors reference the host's DCT design tokens
// (defined in apps/web/app/globals.css), so the diagram inherits the project theme
// automatically; fallbacks keep it sane if a token is missing.
import type { Tier } from "./data/types";

export const T = {
  ink: "var(--color-ink, #0d1b2a)",
  inkSoft: "var(--color-ink-soft, #16283a)",
  paper: "var(--color-paper, #f6f4ef)",
  paperSoft: "var(--color-paper-soft, #efece3)",
  accent: "var(--color-accent, #15756b)",
  brass: "var(--color-brass, #b5893f)",
  muted: "var(--color-muted, #59636f)",
  line: "var(--color-line, rgba(13,27,42,0.12))",
  restricted: "#b23b3b",
  pii: "#7c4dbc",
  mnpi: "#b5893f",
  mono: 'var(--font-mono, ui-monospace, "JetBrains Mono", monospace)',
  sans: "system-ui, -apple-system, sans-serif",
};

export const TIER_COLOR: Record<Tier, string> = {
  public: T.accent,
  internal: T.muted,
  confidential: T.brass,
  restricted: T.restricted,
};

// Generic corporate ER scheme (matches the bank canonical-model drawio look):
// light-blue entity headers, white bodies, light-blue PK rows, light-green business-key
// rows, neutral blue-grey connectors.
export const CORP = {
  header: "#dae8fc",
  headerText: "#12315e",
  border: "#9fb3d1",
  focus: "#3b6fb5",
  body: "#ffffff",
  pkRow: "#e8f0fe", // light blue
  bkRow: "#e6f4ea", // light green
  pkText: "#12315e",
  bkText: "#1e6b3a",
  text: "#1f2937",
  muted: "#5b6675",
  edge: "#6c8ebf",
  outline: "#6c8ebf", // entity card border (white body + blue outline)
};

export const TIER_LABEL: Record<Tier, string> = {
  public: "Public",
  internal: "Internal",
  confidential: "Confidential",
  restricted: "Restricted",
};

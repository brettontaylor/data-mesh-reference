// Build a single-page Word (.docx) operating-model handout (Node `docx`).
import { writeFileSync } from "node:fs";
import {
  Document, Packer, Paragraph, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType,
} from "docx";

const INK = "0D1B2A", TEAL = "15756B", BRASS = "B5893F", MUTED = "59636F", ZEBRA = "F1EFE9", LINE = "D9D5CD";
const FONT = "Calibri", HEAD = "Georgia";

const noBorder = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } };
const thin = (c = LINE) => ({ style: BorderStyle.SINGLE, size: 4, color: c });
const allThin = (c = LINE) => ({ top: thin(c), bottom: thin(c), left: thin(c), right: thin(c) });

const t = (text, o = {}) => new TextRun({ text, font: o.font || FONT, size: o.size ?? 18, bold: o.bold, italics: o.italics, color: o.color || INK });
const p = (children, o = {}) => new Paragraph({ children: Array.isArray(children) ? children : [children], alignment: o.align, spacing: { before: o.before ?? 0, after: o.after ?? 60, line: o.line ?? 240, lineRule: "auto" }, shading: o.shading });

// inline **bold** + `code` → runs
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(t(text.slice(last, m.index), base));
    if (m[2]) out.push(t(m[2], { ...base, bold: true }));
    else if (m[3]) out.push(t(m[3], { ...base, font: "Consolas", color: TEAL }));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(t(text.slice(last), base));
  return out;
}

function cell(text, o = {}) {
  return new TableCell({
    width: { size: o.w ?? 0, type: WidthType.PERCENTAGE },
    shading: o.shade ? { type: ShadingType.CLEAR, fill: o.shade } : undefined,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    borders: o.borders || allThin(),
    verticalAlign: "center",
    children: (Array.isArray(text) ? text : [text]).map((line) =>
      new Paragraph({ alignment: o.align, spacing: { before: 0, after: 0, line: 220, lineRule: "auto" }, children: runs(line, { size: o.size ?? 16, bold: o.bold, color: o.color }) })),
  });
}
const row = (cells) => new TableRow({ children: cells, cantSplit: true });
const table = (rows) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows, borders: allThin() });

const bullet = (text) => new Paragraph({ bullet: { level: 0 }, spacing: { before: 0, after: 30, line: 220, lineRule: "auto" }, children: runs(text, { size: 16 }) });

const children = [];

// ---- header band ----
children.push(new Paragraph({
  shading: { type: ShadingType.CLEAR, fill: INK },
  spacing: { before: 0, after: 0, line: 260, lineRule: "auto" },
  children: [t("Federated Data Operating Model", { font: HEAD, size: 26, bold: true, color: "FFFFFF" })],
  border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: BRASS } },
}));
children.push(new Paragraph({
  shading: { type: ShadingType.CLEAR, fill: INK },
  spacing: { before: 0, after: 120, line: 220, lineRule: "auto" },
  children: [t("DEAL Control Tower  ·  how BDM / PDM change is owned, proposed, and approved", { size: 17, color: "CFE3DF" })],
}));

// ---- principle ----
children.push(p(runs("**The principle.** Domains own and propose their data models; the **Chief Data Architect** signs off on enterprise-significant change. Autonomy within guardrails — neither a free-for-all nor a central bottleneck.", { size: 18 }), { after: 120 }));

// ---- two tiers heading ----
children.push(p([t("Two tiers of control", { font: HEAD, size: 20, bold: true, color: TEAL })], { after: 60 }));

const hdr = (s) => cell(s, { shade: INK, color: "FFFFFF", bold: true, size: 16, align: AlignmentType.LEFT });
children.push(table([
  row([hdr(""), hdr("Tier 1 — Domain autonomy"), hdr("Tier 2 — Enterprise sign-off")]),
  row([
    cell("Who", { w: 16, bold: true, shade: ZEBRA, size: 15 }),
    cell("Domain modeler (maker) → steward / owner (checker)", { w: 42, size: 15 }),
    cell("Chief Data Architect, or ARB by delegated quorum", { w: 42, size: 15 }),
  ]),
  row([
    cell("Decides", { w: 16, bold: true, shade: ZEBRA, size: 15 }),
    cell("Routine, in-domain change", { w: 42, size: 15 }),
    cell("Enterprise-significant change", { w: 42, size: 15 }),
  ]),
  row([
    cell("Examples", { w: 16, bold: true, shade: ZEBRA, size: 15 }),
    cell("PDM tuning · docs · minor additive fields · in-domain semantic models", { w: 42, size: 15 }),
    cell("Any BDM change · breaking change · new entity · cross-domain reference · classification (PII/MNPI/tier) · shared / conformed models", { w: 42, size: 15 }),
  ]),
  row([
    cell("Outcome", { w: 16, bold: true, shade: ZEBRA, size: 15 }),
    cell("Completes at the domain tier", { w: 42, size: 15 }),
    cell("CDA sign-off required on top of domain approval", { w: 42, size: 15 }),
  ]),
]));

// ---- lifecycle ----
children.push(p([t("The lifecycle", { font: HEAD, size: 20, bold: true, color: TEAL })], { before: 140, after: 50 }));
children.push(p([
  t("Propose (maker)", { bold: true, size: 17 }), t("  →  ", { color: BRASS, size: 17 }),
  t("Standards gates (policy-as-code)", { bold: true, size: 17 }), t("  →  ", { color: BRASS, size: 17 }),
  t("Domain approval (Tier 1)", { bold: true, size: 17 }), t("  →  ", { color: BRASS, size: 17 }),
  t("CDA / ARB sign-off (Tier 2)", { bold: true, size: 17 }), t("  →  ", { color: BRASS, size: 17 }),
  t("Merge · reconcile · publish", { bold: true, size: 17 }),
], { after: 40 }));
children.push(p(runs("Every step is captured in an append-only, hash-chained audit log.", { size: 15, italics: true, color: MUTED }), { after: 120 }));

// ---- two-column: roles | in the platform ----
children.push(new Table({
  width: { size: 100, type: WidthType.PERCENTAGE },
  borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE } },
  rows: [row([
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorder, margins: { right: 160 },
      children: [
        p([t("Roles", { font: HEAD, size: 19, bold: true, color: TEAL })], { after: 50 }),
        bullet("**Domain modeler** — authors & proposes (maker)."),
        bullet("**Steward / owner** — approves in-domain change; accountable for the domain's models."),
        bullet("**Chief Data Architect** — accountable for enterprise coherence; signs off Tier 2; sets standards."),
        bullet("**ARB** — delegated enterprise sign-off by quorum."),
        bullet("**Governance / Compliance** — separate approval for PII / MNPI & classification."),
        bullet("**Platform engineering** — operates merge, generation & deploy."),
      ],
    }),
    new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE }, borders: noBorder, margins: { left: 160 },
      children: [
        p([t("Baked into the platform", { font: HEAD, size: 19, bold: true, color: TEAL })], { after: 50 }),
        bullet("Roles `chief_data_architect` & `architecture_review_board` with a `change:signoff` capability (RBAC/ABAC)."),
        bullet("**Scope-aware routing** computes `requiresEnterpriseSignoff` and withholds approval until a CDA/ARB sign-off is recorded — domain quorum alone cannot merge Tier-2 change."),
        bullet("**Standards-as-code** gates: schema, referential integrity, classification coverage, semver, propagation."),
        bullet("**Graduated autonomy** — routing is configuration; the CDA widens domain autonomy as domains mature."),
      ],
    }),
  ])],
}));

// ---- proof footer ----
children.push(new Paragraph({
  shading: { type: ShadingType.CLEAR, fill: ZEBRA },
  spacing: { before: 160, after: 0, line: 220, lineRule: "auto" },
  border: { left: { style: BorderStyle.SINGLE, size: 24, color: BRASS } },
  children: runs("Verified end-to-end: a domain quorum on a BDM change sits in review until the Chief Data Architect signs off; a PII change additionally requires a Governance approval. (`scripts/gov-e2e.mjs`)", { size: 15, italics: true, color: INK }),
}));

const doc = new Document({
  creator: "Semantic Quay",
  title: "Federated Data Operating Model — One Page",
  styles: { default: { document: { run: { font: FONT, size: 18, color: INK } } } },
  sections: [{
    properties: { page: { margin: { top: 600, bottom: 600, left: 720, right: 720 } } },
    children,
  }],
});

const out = "../operating-model/DEAL-Operating-Model-One-Pager.docx";
Packer.toBuffer(doc).then((b) => { writeFileSync(out, b); console.log("wrote", out, b.length, "bytes"); });

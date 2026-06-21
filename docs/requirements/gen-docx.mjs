// Build a Word (.docx) SRS from the requirement markdown files (Node `docx`).
import { readFileSync, writeFileSync } from "node:fs";
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, PageBreak,
} from "docx";

const INK = "0D1B2A", TEAL = "15756B", MUTED = "59636F", HEADBG = "0D1B2A", ZEBRA = "F1EFE9";
const FILES = [
  "01-introduction.md",
  "02-functional-requirements.md",
  "03-non-functional-requirements.md",
  "04-data-and-classification.md",
  "05-compliance-and-security.md",
  "07-federated-operating-model.md",
  "06-traceability-matrix.md",
];

// inline: **bold** and `code`
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    if (m[2] !== undefined) out.push(new TextRun({ text: m[2], bold: true, ...base }));
    else out.push(new TextRun({ text: m[3], font: "Consolas", ...base }));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out.length ? out : [new TextRun({ text, ...base })];
}
const noBorder = { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } };
const cellBorder = (c = "D9D5CD") => ({ top: { style: BorderStyle.SINGLE, size: 2, color: c }, bottom: { style: BorderStyle.SINGLE, size: 2, color: c }, left: { style: BorderStyle.SINGLE, size: 2, color: c }, right: { style: BorderStyle.SINGLE, size: 2, color: c } });

function cell(text, { header = false, zebra = false } = {}) {
  return new TableCell({
    width: { size: 100, type: WidthType.AUTO },
    margins: { top: 60, bottom: 60, left: 90, right: 90 },
    borders: cellBorder(),
    shading: header ? { type: ShadingType.SOLID, color: HEADBG } : zebra ? { type: ShadingType.SOLID, color: ZEBRA } : undefined,
    children: [new Paragraph({ children: runs(text, header ? { bold: true, color: "FFFFFF" } : { color: INK }), spacing: { after: 0 } })],
  });
}

function parseTable(lines, start) {
  const block = [];
  let i = start;
  while (i < lines.length && lines[i].trim().startsWith("|")) { block.push(lines[i]); i++; }
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const header = cells(block[0]);
  const dataRows = block.slice(2).map(cells); // skip separator row
  const rows = [new TableRow({ tableHeader: true, children: header.map((h) => cell(h, { header: true })) })];
  dataRows.forEach((r, idx) => rows.push(new TableRow({ children: header.map((_, c) => cell(r[c] ?? "", { zebra: idx % 2 === 1 })) })));
  return { table: new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: cellBorder(), rows }), next: i };
}

const children = [];
// ---- cover ----
children.push(
  new Paragraph({ spacing: { before: 2400 }, children: [new TextRun({ text: "DEAL Control Tower", bold: true, size: 60, color: INK, font: "Georgia" })] }),
  new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Software Requirements Specification", size: 32, color: TEAL, font: "Georgia" })] }),
  new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: "Metadata management & governance control plane for the DEAL lakehouse", size: 22, color: MUTED })] }),
  new Paragraph({ spacing: { before: 600 }, children: [new TextRun({ text: "Version 0.1 (Draft for review)   ·   Generated from the requirements baseline", size: 18, color: MUTED })] }),
  new Paragraph({ children: [new TextRun({ text: "Normative keywords per RFC 2119 (SHALL / SHOULD / MAY). Priority: MoSCoW (M/S/C/W).", size: 18, color: MUTED })] }),
  new Paragraph({ children: [new PageBreak()] }),
);

for (const f of FILES) {
  const lines = readFileSync(new URL(f, import.meta.url), "utf8").split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();
    if (t === "") { i++; continue; }
    if (t.startsWith("|")) { const { table, next } = parseTable(lines, i); children.push(table); children.push(new Paragraph({ spacing: { after: 120 }, children: [] })); i = next; continue; }
    if (t.startsWith("> ")) { children.push(new Paragraph({ spacing: { before: 60, after: 60 }, indent: { left: 240 }, children: runs(t.slice(2), { italics: true, color: MUTED }) })); i++; continue; }
    if (t.startsWith("### ")) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_3, spacing: { before: 160, after: 60 }, children: runs(t.slice(4), { bold: true, color: INK }) })); i++; continue; }
    if (t.startsWith("## ")) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220, after: 80 }, children: runs(t.slice(3), { bold: true, color: TEAL }) })); i++; continue; }
    if (t.startsWith("# ")) { children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, spacing: { after: 120 }, children: runs(t.slice(2), { bold: true, color: INK }) })); i++; continue; }
    if (/^[-*] /.test(t)) { children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: runs(t.slice(2)) })); i++; continue; }
    children.push(new Paragraph({ spacing: { after: 80 }, children: runs(t) }));
    i++;
  }
}

const doc = new Document({
  creator: "DEAL Control Tower",
  title: "DEAL Control Tower — SRS",
  styles: { default: { document: { run: { font: "Calibri", size: 21, color: INK } } } },
  sections: [{ properties: { page: { margin: { top: 1000, bottom: 1000, left: 1000, right: 1000 } } }, children }],
});
const buf = await Packer.toBuffer(doc);
writeFileSync("DEAL-Control-Tower-SRS.docx", buf);
console.log("wrote DEAL-Control-Tower-SRS.docx", buf.length, "bytes");

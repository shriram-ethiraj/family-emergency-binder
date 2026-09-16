import type { JsonObject, PdfTemplate, TemplateNode } from "@/lib/domain";
import { APP_NAME } from "@/lib/branding";

type PdfContent = Record<string, unknown>;
type PdfWindow = Window & typeof globalThis & { showSaveFilePicker(options?: object): Promise<FileSystemFileHandle> };
const MM = 72 / 25.4;

interface PdfMakeEngine {
  vfs: Record<string, string>;
  fonts: Record<string, unknown>;
  createPdf(definition: Record<string, unknown>): { getBlob(callback: (blob: Blob) => void): void };
}

interface PdfAssetWindow extends Window {
  pdfMake?: PdfMakeEngine;
  __FEBC_PDF_FONTS__?: { vfs: Record<string, string>; fonts: Record<string, unknown> };
}

let configuredEngine: PdfMakeEngine | undefined;

export interface PdfContext { document: JsonObject; system: JsonObject }

export async function savePdf(template: PdfTemplate, context: PdfContext, password: string | undefined, suggestedName: string, openInTab = false): Promise<string> {
  const name = safeName(suggestedName);
  if (typeof (window as Partial<PdfWindow>).showSaveFilePicker !== "function") {
    const blob = await renderPdf(template, context, password); if (!openInTab || !openInNewTab(blob)) downloadBlob(blob, name); return name;
  }
  const handle = await (window as PdfWindow).showSaveFilePicker({ suggestedName: name, types: [{ description: "Password-protected PDF", accept: { "application/pdf": [".pdf"] } }] });
  const blob = await renderPdf(template, context, password);
  const writable = await handle.createWritable({ keepExistingData: false });
  try { await writable.write(blob); await writable.close(); } catch (error) { await writable.abort().catch(() => undefined); throw error; }
  if (openInTab) openInNewTab(blob);
  return handle.name;
}

export async function previewTemplate(template: PdfTemplate): Promise<void> {
  const blob = await renderPdf(template, { document: template.syntheticData, system: { generatedAt: new Date().toISOString(), documentRevision: 1, profileRevision: 1 } }, undefined);
  if (!openInNewTab(blob)) downloadBlob(blob, `${template.name}-sample.pdf`);
}

export function renderPdf(template: PdfTemplate, context: PdfContext, password?: string): Promise<Blob> {
  const make = pdfEngine();
  const [left, top, right, bottom] = template.page.marginsMm.map((value) => value * MM);
  const definition: Record<string, unknown> = {
    pageSize: template.page.size,
    pageMargins: [left, top, right, bottom],
    defaultStyle: { font: "NotoSans", fontSize: 8.5, color: "#000000", lineHeight: 1.04 },
    content: template.nodes.flatMap((node) => renderNode(node, context)),
    version: "1.7ext3",
    ...(password ? { userPassword: password } : {}),
    info: { title: template.name, author: APP_NAME, creator: APP_NAME, producer: APP_NAME },
    styles: { title: { fontSize: 15, bold: true, alignment: "center", margin: [0, 0, 0, 1] }, subtitle: { fontSize: 8.5, italics: true, alignment: "center", margin: [0, 0, 0, 6] }, section: { fontSize: 9.5, bold: true, margin: [0, 4, 0, 2] }, note: { fontSize: 7.5, italics: true, margin: [0, 4, 0, 0] } },
    footer: template.footer ? () => ({ text: interpolate(template.footer!, context), font: "NotoSans", fontSize: 6.5, color: "#555555", alignment: "center", margin: [left, 2, right, 0] }) : undefined,
  };
  return new Promise((resolve) => make.createPdf(definition).getBlob(resolve));
}

function renderNode(node: TemplateNode, context: PdfContext): PdfContent[] {
  if ("when" in node && node.when && !resolvePath(context, node.when)) return [];
  switch (node.type) {
    case "title": case "subtitle": return [{ text: interpolate(node.text, context), style: node.type }];
    case "spacer": return [{ text: "", margin: [0, 0, 0, node.height] }];
    case "pageBreak": return [{ text: "", pageBreak: "after" }];
    case "text": return [{ text: node.value ? format(resolvePath(context, node.value), node.formatter) : interpolate(node.text ?? "", context), style: node.style }];
    case "section": { const rows = node.rows.map((row) => [{ text: row.label, bold: true, fillColor: "#F2F2F2" }, { text: format(resolvePath(context, row.value), row.formatter) }]); return rows.length ? [{ text: node.title, style: "section" }, table(rows, [155, "*"])] : []; }
    case "pairedTable": { const rows = node.rows.map((row, index) => [{ text: String(index + 1), alignment: "center", fillColor: "#F2F2F2" }, { text: format(resolvePath(context, `document.${row.left}`)) }, { text: format(resolvePath(context, `document.${row.right}`)) }]); return [{ text: node.title, style: "section" }, table([[{ text: "No.", bold: true }, { text: node.columns[0], bold: true }, { text: node.columns[1], bold: true }], ...rows], [28, "*", "*"])]; }
  }
}

function table(body: unknown[][], widths: unknown[]): PdfContent { return { table: { widths, headerRows: widths.length === 3 ? 1 : 0, dontBreakRows: true, body }, layout: { hLineColor: () => "#D9D9D9", vLineColor: () => "#D9D9D9", hLineWidth: () => 0.65, vLineWidth: () => 0.65, paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3.2, paddingBottom: () => 3.2 } }; }
function resolvePath(context: PdfContext, path: string): unknown { return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, context); }
function interpolate(text: string, context: PdfContext) { return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, path: string) => format(resolvePath(context, path))); }
function format(value: unknown, formatter?: string): string { if (value === null || value === undefined) return ""; if (formatter === "date") { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date); } if (formatter === "money") return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value)); if (formatter === "masked") { const raw = String(value); return raw.length <= 4 ? "••••" : `${"•".repeat(Math.min(8, raw.length - 4))}${raw.slice(-4)}`; } if (formatter === "multiline" && Array.isArray(value)) return value.join("\n"); if (typeof value === "boolean") return value ? "Yes" : "No"; return String(value); }
function pdfEngine(): PdfMakeEngine {
  if (configuredEngine) return configuredEngine;
  const target = window as PdfAssetWindow;
  if (!target.pdfMake || !target.__FEBC_PDF_FONTS__) throw new Error("PDF assets are missing. Re-extract the complete application folder and try again.");
  target.pdfMake.vfs = target.__FEBC_PDF_FONTS__.vfs;
  target.pdfMake.fonts = target.__FEBC_PDF_FONTS__.fonts;
  configuredEngine = target.pdfMake;
  return configuredEngine;
}
function safeName(value: string) { const stem = value.replace(/\.pdf$/i, "").normalize("NFKD").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "binder-document"; return `${stem}.pdf`; }
function downloadBlob(blob: Blob, name: string) { const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = name; anchor.hidden = true; document.body.append(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1_000); }
function openInNewTab(blob: Blob): boolean { const url = URL.createObjectURL(blob); const tab = window.open(url, "_blank"); if (tab) tab.opener = null; window.setTimeout(() => URL.revokeObjectURL(url), 60_000); return Boolean(tab); }

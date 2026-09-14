import { createHash, randomBytes, randomUUID } from "node:crypto";
import { constants, copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import PdfPrinter from "pdfmake";
import type { GenerationReceipt, JsonObject, LoadedTemplate, TemplateDefinition, TemplateNode, TemplateRow } from "./types.js";
import { safeOutputName } from "./utils.js";
import { APP_NAME } from "./branding.js";

type Content = any;
type TableCell = any;
type TDocumentDefinitions = any;

const MM = 72 / 25.4;

function fontPaths(template: TemplateDefinition, assetRoot: string) {
  const fonts = template.assets.fonts;
  return {
    NotoSans: {
      normal: resolve(assetRoot, fonts.normal),
      bold: resolve(assetRoot, fonts.bold),
      italics: resolve(assetRoot, fonts.italics),
      bolditalics: resolve(assetRoot, fonts.bolditalics)
    }
  };
}

export interface PdfContext {
  document: JsonObject;
  system: JsonObject;
}

export async function renderPdf(template: TemplateDefinition, context: PdfContext, password: string | undefined, assetRoot: string): Promise<Buffer> {
  const printer = new PdfPrinter(fontPaths(template, assetRoot));
  const [left, top, right, bottom] = template.page.marginsMm.map((value) => value * MM);
  const content = template.nodes.flatMap((node) => renderNode(node, context));
  const definition: TDocumentDefinitions & Record<string, unknown> = {
    pageSize: template.page.size,
    pageMargins: [left, top, right, bottom],
    defaultStyle: { font: "NotoSans", fontSize: 8.5, color: "#000000", lineHeight: 1.04 },
    content,
    version: "1.7ext3",
    ...(password ? { userPassword: password } : {}),
    info: { title: interpolate(template.name, context), author: APP_NAME, creator: APP_NAME, producer: APP_NAME },
    styles: {
      title: { fontSize: 15, bold: true, alignment: "center", margin: [0, 0, 0, 1] },
      subtitle: { fontSize: 8.5, italics: true, alignment: "center", margin: [0, 0, 0, 6] },
      section: { fontSize: 9.5, bold: true, margin: [0, 4, 0, 2] },
      note: { fontSize: 7.5, italics: true, margin: [0, 4, 0, 0] }
    },
    footer: template.footer ? () => ({
      text: interpolate(template.footer!, context),
      font: "NotoSans", fontSize: 6.5, color: "#555555", alignment: "center", margin: [left, 2, right, 0]
    }) : undefined
  };
  const pdf = printer.createPdfKitDocument(definition);
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.end();
  });
}

function renderNode(node: TemplateNode, context: PdfContext): Content[] {
  if ("when" in node && node.when && !resolvePath(context, node.when)) return [];
  switch (node.type) {
    case "title": return [{ text: interpolate(node.text, context), style: "title" }];
    case "subtitle": return [{ text: interpolate(node.text, context), style: "subtitle" }];
    case "spacer": return [{ text: "", margin: [0, 0, 0, node.height] }];
    case "pageBreak": return [{ text: "", pageBreak: "after" }];
    case "text": return [{ text: node.value ? format(resolvePath(context, node.value), node.formatter) : interpolate(node.text ?? "", context), style: node.style ?? undefined }];
    case "section": {
      const rows = node.rows.filter((row) => !row.when || resolvePath(context, row.when)).map((row) => renderRow(row, context));
      if (!rows.length) return [];
      return [
        { text: node.title, style: "section" },
        {
          table: { widths: [155, "*"], dontBreakRows: true, body: rows },
          layout: {
            hLineColor: () => "#D9D9D9", vLineColor: () => "#D9D9D9", hLineWidth: () => 0.65, vLineWidth: () => 0.65,
            paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3.2, paddingBottom: () => 3.2
          }
        }
      ];
    }
    case "pairedTable": {
      const rows = node.rows.map((row, index) => [
        { text: String(index + 1), alignment: "center", fillColor: "#F2F2F2" },
        { text: format(resolvePath(context, `document.${row.left}`)) },
        { text: format(resolvePath(context, `document.${row.right}`)) }
      ]);
      return [
        { text: node.title, style: "section" },
        {
          table: {
            widths: [28, "*", "*"],
            headerRows: 1,
            dontBreakRows: true,
            body: [[
              { text: "No.", bold: true, fillColor: "#F2F2F2", alignment: "center" },
              { text: node.columns[0], bold: true, fillColor: "#F2F2F2" },
              { text: node.columns[1], bold: true, fillColor: "#F2F2F2" }
            ], ...rows]
          },
          layout: {
            hLineColor: () => "#D9D9D9", vLineColor: () => "#D9D9D9", hLineWidth: () => 0.65, vLineWidth: () => 0.65,
            paddingLeft: () => 5, paddingRight: () => 5, paddingTop: () => 3.2, paddingBottom: () => 3.2
          }
        }
      ];
    }
  }
}

function renderRow(row: TemplateRow, context: PdfContext): TableCell[] {
  const value = format(resolvePath(context, row.value), row.formatter);
  return [
    { text: row.label, bold: true, fillColor: "#F2F2F2" },
    { text: value ? `${row.prefix ?? ""}${value}` : (row.fallback ?? "") }
  ];
}

function resolvePath(context: PdfContext, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, context);
}

function interpolate(text: string, context: PdfContext): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, path: string) => format(resolvePath(context, path)));
}

function format(value: unknown, formatter?: string): string {
  if (value === null || value === undefined) return "";
  if (formatter === "date") {
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }).format(date);
  }
  if (formatter === "money") return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));
  if (formatter === "masked") {
    const raw = String(value); return raw.length <= 4 ? "••••" : `${"•".repeat(Math.min(8, raw.length - 4))}${raw.slice(-4)}`;
  }
  if (formatter === "multiline" && Array.isArray(value)) return value.join("\n");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export async function persistPdf(args: {
  buffer: Buffer; outputDir: string; template: LoadedTemplate;
  profileName: string; profileRevision: number; documentId: string; documentLabel: string;
  documentRevision: number; passwordEpoch: number; generationNumber: number;
}): Promise<GenerationReceipt> {
  await mkdir(args.outputDir, { recursive: true, mode: 0o700 });
  const generatedAt = new Date().toISOString();
  const date = generatedAt.slice(0, 10).replaceAll("-", "");
  const names = [...new Set([
    safeOutputName(args.template.template.name),
    safeOutputName(args.profileName),
    safeOutputName(args.documentLabel)
  ])];
  const uniqueSuffix = randomUUID().replaceAll("-", "").slice(0, 8);
  const filename = [...names, date, String(args.generationNumber).padStart(3, "0"), uniqueSuffix].join("_") + ".pdf";
  const target = join(args.outputDir, filename);
  const temporary = join(args.outputDir, `.${randomUUID()}.part`);
  await writeFile(temporary, args.buffer, { mode: 0o600, flag: "wx" });
  try {
    await copyFile(temporary, target, constants.COPYFILE_EXCL);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
  return {
    id: randomUUID(), documentId: args.documentId,
    templateId: args.template.template.templateId, templateVersion: args.template.template.version, templateHash: args.template.hash,
    profileRevision: args.profileRevision, documentRevision: args.documentRevision, passwordEpoch: args.passwordEpoch,
    generatedAt, filename, outputHash: createHash("sha256").update(args.buffer).digest("hex")
  };
}

export function randomOwnerPassword(): string {
  return randomBytes(32).toString("base64url");
}

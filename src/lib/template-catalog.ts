import type { DocumentTemplate, JsonObject, PdfTemplate, TemplateNode } from "@/lib/domain";

interface SourceField {
  label: string;
  type: "string" | "number" | "boolean";
  example: string | number | boolean;
  required?: boolean;
  input?: string;
  formatter?: string;
  placeholder?: string;
  format?: string;
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

interface SourceTemplate {
  templateId: string;
  version: string;
  name: string;
  description: string;
  page?: { size?: string; marginsMm?: [number, number, number, number] };
  fields: Record<string, SourceField>;
  layout: Array<Record<string, unknown>>;
  footer?: string;
}

export interface TemplateFileLike {
  name: string;
  size: number;
  lastModified: number;
  webkitRelativePath?: string;
  text(): Promise<string>;
}

export interface TemplateDiagnostic {
  level: "warning" | "error";
  path: string;
  message: string;
}

export interface LoadedTemplateCatalog {
  templates: PdfTemplate[];
  diagnostics: TemplateDiagnostic[];
  folderName: string;
  fileCount: number;
}

export const TEMPLATE_LIMITS = {
  maximumFiles: 256,
  maximumFileBytes: 512 * 1024,
  maximumTotalBytes: 16 * 1024 * 1024,
  maximumPathDepth: 12,
} as const;

let catalog: PdfTemplate[] = [];

export function replaceTemplates(next: PdfTemplate[]): void {
  catalog = next;
}

export function clearTemplates(): void {
  catalog = [];
}

export function templates(): Promise<PdfTemplate[]> {
  return Promise.resolve(catalog);
}

export async function latestTemplates(): Promise<DocumentTemplate[]> {
  const all = await templates();
  return all.filter((item, index) => all.findIndex((candidate) => candidate.templateId === item.templateId) === index);
}

export async function templateById(id: string, version: string): Promise<PdfTemplate> {
  const found = (await templates()).find((item) => item.templateId === id && item.version === version);
  if (!found) throw new Error("Template version not found");
  return found;
}

export async function loadTemplateFiles(input: Iterable<TemplateFileLike>): Promise<LoadedTemplateCatalog> {
  const files = [...input].map((file) => ({ file, path: normalizedPath(file) })).filter(({ path }) => path.toLowerCase().endsWith(".json"));
  if (!files.length) throw new Error("Choose a folder containing at least one JSON template");
  if (files.length > TEMPLATE_LIMITS.maximumFiles) throw new Error(`Template folder contains more than ${TEMPLATE_LIMITS.maximumFiles} JSON files`);
  const totalBytes = files.reduce((total, { file }) => total + file.size, 0);
  if (totalBytes > TEMPLATE_LIMITS.maximumTotalBytes) throw new Error("Template folder is too large");

  const diagnostics: TemplateDiagnostic[] = [];
  const candidates = new Map<string, { template: PdfTemplate; path: string; lastModified: number }>();
  for (const { file, path } of files) {
    if (path.split("/").filter(Boolean).length > TEMPLATE_LIMITS.maximumPathDepth) {
      diagnostics.push({ level: "error", path, message: "Template path is nested too deeply" });
      continue;
    }
    if (!file.size || file.size > TEMPLATE_LIMITS.maximumFileBytes) {
      diagnostics.push({ level: "error", path, message: `Template must be between 1 byte and ${TEMPLATE_LIMITS.maximumFileBytes / 1024} KiB` });
      continue;
    }
    try {
      const value = JSON.parse(await file.text()) as unknown;
      const template = await compile(parseSourceTemplate(value));
      const key = `${template.templateId}@${template.version}`;
      const candidate = { template, path, lastModified: Number.isFinite(file.lastModified) ? file.lastModified : 0 };
      const previous = candidates.get(key);
      if (!previous) candidates.set(key, candidate);
      else {
        const winner = newer(candidate, previous) ? candidate : previous;
        const ignored = winner === candidate ? previous : candidate;
        candidates.set(key, winner);
        diagnostics.push({ level: "warning", path: winner.path, message: `Duplicate ${key}: using ${winner.path}; ignoring ${ignored.path}` });
      }
    } catch (error) {
      diagnostics.push({ level: "error", path, message: error instanceof Error ? error.message : "Template is invalid" });
    }
  }
  const loaded = [...candidates.values()].map(({ template }) => template).sort((a, b) => a.name.localeCompare(b.name) || b.version.localeCompare(a.version, undefined, { numeric: true }));
  if (!loaded.length) {
    const detail = diagnostics[0]?.message;
    throw new Error(detail ? `No valid templates were found. ${detail}` : "No valid templates were found");
  }
  return { templates: loaded, diagnostics, folderName: folderName(files.map(({ path }) => path)), fileCount: files.length };
}

export function validateTemplateData(template: DocumentTemplate, value: unknown): asserts value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Document data is invalid");
  const data = value as JsonObject;
  const properties = template.schema.properties ?? {};
  const labels = new Map<string, string>();
  for (const section of template.ui.sections) for (const field of section.fields) if (field.label) labels.set(field.path, field.label);
  const describe = (key: string) => labels.get(key) ?? key;
  for (const required of template.schema.required ?? []) {
    if (data[required] === undefined || data[required] === "") throw new Error(`${describe(required)} is required`);
  }
  for (const [key, item] of Object.entries(data)) {
    const rule = properties[key];
    const label = describe(key);
    if (!rule) throw new Error(`Unknown document field: ${key}`);
    if (item !== "" && item !== undefined && rule.type && typeof item !== rule.type) throw new Error(`Invalid value for ${label}`);
    if (typeof item === "string") {
      if (rule.enum && !rule.enum.includes(item)) throw new Error(`Invalid value for ${label}`);
      if (rule.minLength !== undefined && item.length < rule.minLength) throw new Error(`${label} must be at least ${rule.minLength} characters`);
      if (rule.maxLength !== undefined && item.length > rule.maxLength) throw new Error(`${label} must be at most ${rule.maxLength} characters`);
      if (rule.format === "date" && item && Number.isNaN(Date.parse(item))) throw new Error(`Invalid date for ${label}`);
      if (rule.format === "email" && item && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(item)) throw new Error(`Invalid email for ${label}`);
      if (rule.format === "uri" && item) { try { new URL(item); } catch { throw new Error(`Invalid URL for ${label}`); } }
    }
    if (typeof item === "number" && (!Number.isFinite(item) || (rule.minimum !== undefined && item < rule.minimum) || (rule.maximum !== undefined && item > rule.maximum))) throw new Error(`Invalid value for ${label}`);
  }
}

async function compile(source: SourceTemplate): Promise<PdfTemplate> {
  const properties: NonNullable<DocumentTemplate["schema"]["properties"]> = {};
  const required: string[] = [];
  const syntheticData: JsonObject = {};
  for (const [id, field] of Object.entries(source.fields)) {
    properties[id] = { type: field.type, enum: field.enum, minLength: field.minLength, maxLength: field.maxLength, minimum: field.minimum, maximum: field.maximum, format: field.format };
    syntheticData[id] = field.example;
    if (field.required) required.push(id);
  }
  const sections: DocumentTemplate["ui"]["sections"] = [];
  const nodes: TemplateNode[] = [];
  const seen = new Set<string>();
  for (const raw of source.layout) {
    const type = String(raw.type);
    if (type === "section") {
      const fields = (raw.fields as string[]).map((path) => {
        const field = source.fields[path];
        if (!field || seen.has(path)) throw new Error(`Invalid field reference ${path}`);
        seen.add(path);
        return { path, label: field.label, input: field.input ?? inferredInput(field), placeholder: field.placeholder };
      });
      sections.push({ title: String(raw.title), fields });
      nodes.push({ type, title: String(raw.title), rows: fields.map((field) => ({ label: field.label ?? field.path, value: `document.${field.path}`, formatter: source.fields[field.path].formatter })) });
    } else if (type === "pairedTable") {
      const rows = raw.rows as Array<{ left: string; right: string }>;
      const fields = rows.flatMap((row) => [row.left, row.right]).map((path) => {
        const field = source.fields[path];
        if (!field || seen.has(path)) throw new Error(`Invalid field reference ${path}`);
        seen.add(path);
        return { path, label: field.label, input: field.input ?? inferredInput(field), placeholder: field.placeholder };
      });
      sections.push({ title: String(raw.title), fields });
      nodes.push({ type, title: String(raw.title), columns: raw.columns as [string, string], rows });
    } else if (type === "title" || type === "subtitle") nodes.push({ type, text: String(raw.text) });
    else if (type === "text") nodes.push({ type, text: raw.text as string | undefined, value: raw.value as string | undefined, formatter: raw.formatter as string | undefined, style: raw.style as string | undefined, when: raw.when as string | undefined });
    else if (type === "spacer") nodes.push({ type, height: Number(raw.height) });
    else if (type === "pageBreak") nodes.push({ type });
  }
  if (seen.size !== Object.keys(source.fields).length) throw new Error(`Template ${source.templateId} has unbound fields`);
  const canonical = JSON.stringify(source);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return {
    templateId: source.templateId,
    version: source.version,
    name: source.name,
    description: source.description,
    thumbnailUrl: thumbnail(source.name, source.description),
    page: { size: source.page?.size ?? "A4", marginsMm: source.page?.marginsMm ?? [14, 11, 14, 11] },
    schema: { required, properties },
    ui: { sections }, hash, syntheticData, nodes,
    ...(source.footer ? { footer: source.footer } : {}),
  };
}

function parseSourceTemplate(value: unknown): SourceTemplate {
  const source = object(value, "Template must be a JSON object");
  exactKeys(source, ["templateId", "version", "name", "description", "page", "fields", "layout", "footer"], "template");
  const templateId = string(source.templateId, "templateId", 200);
  const version = string(source.version, "version", 50);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(templateId) || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Template ID or semantic version is invalid");
  const name = string(source.name, "name", 160);
  const description = string(source.description, "description", 600);
  const rawFields = object(source.fields, "fields must be an object");
  const entries = Object.entries(rawFields);
  if (!entries.length || entries.length > 256) throw new Error("Template must contain between 1 and 256 fields");
  const fields: Record<string, SourceField> = Object.create(null) as Record<string, SourceField>;
  for (const [id, raw] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(id)) throw new Error(`Invalid field ID ${id}`);
    const field = object(raw, `Field ${id} must be an object`);
    exactKeys(field, ["label", "type", "example", "required", "input", "formatter", "placeholder", "format", "enum", "minLength", "maxLength", "minimum", "maximum"], `field ${id}`);
    const type = choice(field.type, ["string", "number", "boolean"] as const, `${id}.type`);
    if (typeof field.example !== type || (type === "number" && !Number.isFinite(field.example))) throw new Error(`${id}.example must match its field type`);
    const parsed: SourceField = { label: string(field.label, `${id}.label`, 160), type, example: field.example as string | number | boolean };
    if (field.required !== undefined) parsed.required = boolean(field.required, `${id}.required`);
    if (field.input !== undefined) parsed.input = choice(field.input, ["text", "number", "boolean", "enum", "date", "money", "phone", "email", "url", "secret", "multiline"] as const, `${id}.input`);
    if (field.formatter !== undefined) parsed.formatter = choice(field.formatter, ["date", "money", "masked", "multiline"] as const, `${id}.formatter`);
    if (field.placeholder !== undefined) parsed.placeholder = string(field.placeholder, `${id}.placeholder`, 300);
    if (field.format !== undefined) parsed.format = choice(field.format, ["date", "email", "uri"] as const, `${id}.format`);
    if (field.enum !== undefined) {
      if (!Array.isArray(field.enum) || !field.enum.length || field.enum.length > 100) throw new Error(`${id}.enum is invalid`);
      parsed.enum = field.enum.map((item, index) => string(item, `${id}.enum[${index}]`, 160));
    }
    for (const key of ["minLength", "maxLength", "minimum", "maximum"] as const) if (field[key] !== undefined) parsed[key] = number(field[key], `${id}.${key}`, 0, 1_000_000);
    if (parsed.minLength !== undefined && parsed.maxLength !== undefined && parsed.minLength > parsed.maxLength) throw new Error(`${id}.minLength cannot exceed maxLength`);
    if (parsed.minimum !== undefined && parsed.maximum !== undefined && parsed.minimum > parsed.maximum) throw new Error(`${id}.minimum cannot exceed maximum`);
    fields[id] = parsed;
  }
  if (!Array.isArray(source.layout) || !source.layout.length || source.layout.length > 512) throw new Error("layout must contain between 1 and 512 nodes");
  const layout = source.layout.map((raw, index) => parseLayoutNode(raw, index));
  let page: SourceTemplate["page"];
  if (source.page !== undefined) {
    const rawPage = object(source.page, "page must be an object");
    exactKeys(rawPage, ["size", "marginsMm"], "page");
    page = {};
    if (rawPage.size !== undefined) page.size = string(rawPage.size, "page.size", 20);
    if (rawPage.marginsMm !== undefined) {
      if (!Array.isArray(rawPage.marginsMm) || rawPage.marginsMm.length !== 4) throw new Error("page.marginsMm must contain four numbers");
      page.marginsMm = rawPage.marginsMm.map((item, index) => number(item, `page.marginsMm[${index}]`, 0, 100)) as [number, number, number, number];
    }
  }
  const footer = source.footer === undefined ? undefined : string(source.footer, "footer", 2_000);
  return { templateId, version, name, description, fields, layout, ...(page ? { page } : {}), ...(footer ? { footer } : {}) };
}

function parseLayoutNode(value: unknown, index: number): Record<string, unknown> {
  const node = object(value, `layout[${index}] must be an object`);
  const type = choice(node.type, ["title", "subtitle", "section", "pairedTable", "text", "spacer", "pageBreak"] as const, `layout[${index}].type`);
  if (type === "title" || type === "subtitle") {
    exactKeys(node, ["type", "text"], `layout[${index}]`);
    return { type, text: string(node.text, `layout[${index}].text`, 2_000) };
  }
  if (type === "section") {
    exactKeys(node, ["type", "title", "fields"], `layout[${index}]`);
    if (!Array.isArray(node.fields) || !node.fields.length || node.fields.length > 256) throw new Error(`layout[${index}].fields is invalid`);
    return { type, title: string(node.title, `layout[${index}].title`, 200), fields: node.fields.map((item, at) => string(item, `layout[${index}].fields[${at}]`, 120)) };
  }
  if (type === "pairedTable") {
    exactKeys(node, ["type", "title", "columns", "rows"], `layout[${index}]`);
    if (!Array.isArray(node.columns) || node.columns.length !== 2) throw new Error(`layout[${index}].columns is invalid`);
    if (!Array.isArray(node.rows) || !node.rows.length || node.rows.length > 256) throw new Error(`layout[${index}].rows is invalid`);
    return { type, title: string(node.title, `layout[${index}].title`, 200), columns: node.columns.map((item, at) => string(item, `layout[${index}].columns[${at}]`, 160)), rows: node.rows.map((raw, at) => { const row = object(raw, `layout[${index}].rows[${at}] is invalid`); exactKeys(row, ["left", "right"], `layout[${index}].rows[${at}]`); return { left: string(row.left, "left", 120), right: string(row.right, "right", 120) }; }) };
  }
  if (type === "text") {
    exactKeys(node, ["type", "text", "value", "formatter", "style", "when"], `layout[${index}]`);
    if (node.text === undefined && node.value === undefined) throw new Error(`layout[${index}] requires text or value`);
    return { type, ...(node.text !== undefined ? { text: string(node.text, `layout[${index}].text`, 4_000) } : {}), ...(node.value !== undefined ? { value: binding(node.value, `layout[${index}].value`) } : {}), ...(node.formatter !== undefined ? { formatter: choice(node.formatter, ["date", "money", "masked", "multiline"] as const, `layout[${index}].formatter`) } : {}), ...(node.style !== undefined ? { style: choice(node.style, ["note"] as const, `layout[${index}].style`) } : {}), ...(node.when !== undefined ? { when: binding(node.when, `layout[${index}].when`) } : {}) };
  }
  if (type === "spacer") {
    exactKeys(node, ["type", "height"], `layout[${index}]`);
    return { type, height: number(node.height, `layout[${index}].height`, 0, 1_000) };
  }
  exactKeys(node, ["type"], `layout[${index}]`);
  return { type };
}

function inferredInput(field: SourceField): string {
  if (field.type === "boolean") return "boolean";
  if (field.enum) return "enum";
  if (field.format === "date") return "date";
  if (field.type === "number") return "number";
  return "text";
}

function thumbnail(name: string, description: string): string {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#f4f0e8"/><rect x="175" y="70" width="850" height="1060" rx="8" fill="white" stroke="#d2c9b8" stroke-width="3"/><text x="600" y="175" text-anchor="middle" font-family="sans-serif" font-size="38" font-weight="700" fill="#24342d">${escape(name.toUpperCase())}</text><text x="600" y="225" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#607168">${escape(description.slice(0, 72))}</text>${[300,390,480,570,660,750].map((y) => `<rect x="245" y="${y}" width="710" height="52" rx="4" fill="#f7f7f5" stroke="#d8ddd9"/><rect x="245" y="${y}" width="235" height="52" fill="#e9edea"/>`).join("")}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function normalizedPath(file: TemplateFileLike): string {
  return (file.webkitRelativePath || file.name).replaceAll("\\", "/").replace(/^\/+/, "");
}

function folderName(paths: string[]): string {
  const first = paths[0]?.split("/")[0];
  return first && paths.every((path) => path.startsWith(`${first}/`)) ? first : "Selected templates";
}

function newer(left: { lastModified: number; path: string }, right: { lastModified: number; path: string }): boolean {
  return left.lastModified > right.lastModified || (left.lastModified === right.lastModified && left.path.localeCompare(right.path) < 0);
}

function object(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void {
  const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
  if (unexpected) throw new Error(`${label} contains unsupported property ${unexpected}`);
}

function string(value: unknown, label: string, maximum: number): string {
  if (typeof value !== "string" || !value.length || value.length > maximum) throw new Error(`${label} must be a non-empty string of at most ${maximum} characters`);
  return value;
}

function boolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean`);
  return value;
}

function number(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  return value;
}

function choice<const T extends readonly string[]>(value: unknown, allowed: T, label: string): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${label} must be one of ${allowed.join(", ")}`);
  return value as T[number];
}

function binding(value: unknown, label: string): string {
  const result = string(value, label, 240);
  if (!/^(document\.[A-Za-z][A-Za-z0-9]*|system\.(generatedAt|documentRevision|profileRevision))$/.test(result)) throw new Error(`${label} is not an allowed binding`);
  return result;
}

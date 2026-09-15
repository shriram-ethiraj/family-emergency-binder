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

const sources = import.meta.glob<SourceTemplate>("../../definitions/templates/**/*.json", {
  eager: true,
  import: "default",
});

let catalogPromise: Promise<PdfTemplate[]> | undefined;

export function templates(): Promise<PdfTemplate[]> {
  catalogPromise ??= Promise.all(Object.values(sources).map(compile)).then((items) =>
    items.sort((a, b) => a.name.localeCompare(b.name) || b.version.localeCompare(a.version, undefined, { numeric: true })),
  );
  return catalogPromise;
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

export function validateTemplateData(template: DocumentTemplate, value: unknown): asserts value is JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Document data is invalid");
  const data = value as JsonObject;
  const properties = template.schema.properties ?? {};
  const labels = new Map<string, string>();
  for (const section of template.ui.sections) {
    for (const field of section.fields) {
      if (field.label) labels.set(field.path, field.label);
    }
  }
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
      if (rule.format === "uri" && item) { try { new URL(item); } catch { throw new Error(`Invalid URL for ${label}`); } }
    }
    if (typeof item === "number" && (!Number.isFinite(item) || (rule.minimum !== undefined && item < rule.minimum) || (rule.maximum !== undefined && item > rule.maximum))) throw new Error(`Invalid value for ${label}`);
  }
}

async function compile(source: SourceTemplate): Promise<PdfTemplate> {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.templateId) || !/^\d+\.\d+\.\d+$/.test(source.version)) throw new Error("Invalid bundled template identity");
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
    else throw new Error(`Unsupported template node ${type}`);
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

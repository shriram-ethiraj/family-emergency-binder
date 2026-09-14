import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import AjvModule from "ajv/dist/2020.js";
import semver from "semver";
import { prepareTemplateThumbnail } from "./template-thumbnails.js";
import type {
  FieldUi,
  LoadedTemplate,
  PaperSize,
  SourceField,
  SourceLayoutNode,
  SourceTemplateDefinition,
  TemplateDefinition,
  TemplateNode,
} from "./types.js";

const Ajv = (AjvModule as unknown as { default?: new (options?: object) => any })?.default ?? (AjvModule as unknown as new (options?: object) => any);

export const PAPER_SIZES: readonly PaperSize[] = [
  "4A0", "2A0", "A0", "A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8", "A9", "A10",
  "B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10",
  "C0", "C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8", "C9", "C10",
  "RA0", "RA1", "RA2", "RA3", "RA4", "SRA0", "SRA1", "SRA2", "SRA3", "SRA4", "EXECUTIVE", "FOLIO", "LEGAL", "LETTER", "TABLOID"
];

const DEFAULT_PAGE = { size: "A4" as PaperSize, marginsMm: [14, 11, 14, 11] as [number, number, number, number] };
const FONT_NAMES = ["normal", "bold", "italics", "bolditalics"] as const;
const FONT_FILES = { normal: "NotoSans-Regular.ttf", bold: "NotoSans-Bold.ttf", italics: "NotoSans-Italic.ttf", bolditalics: "NotoSans-BoldItalic.ttf" } as const;
const INPUTS = new Set(["text", "secret", "date", "money", "number", "enum", "multiline", "phone", "email", "url", "boolean"]);
const FORMATTERS = new Set([undefined, "date", "money", "masked", "multiline"]);
const FIELD_TYPES = new Set(["string", "number", "boolean"]);
const FORMATS = new Set(["date", "email", "uri"]);
const VALID_SYSTEM_PATHS = new Set(["system.generatedAt", "system.documentRevision", "system.profileRevision"]);

export class TemplateCatalog {
  private templates: LoadedTemplate[] = [];
  private readonly ajv: any;
  readonly cacheDir: string;

  constructor(readonly root: string, options: { cacheDir?: string } = {}) {
    this.cacheDir = resolve(options.cacheDir ?? process.env.TEMPLATE_CACHE_DIR ?? join("runtime-data", "template-cache"));
    this.ajv = new Ajv({ allErrors: true, strict: false });
    this.ajv.addFormat("date", /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);
    this.ajv.addFormat("email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    this.ajv.addFormat("uri", /^[a-z][a-z0-9+.-]*:\S+$/i);
  }

  async load(): Promise<void> {
    this.templates = [];
    const templateRoot = join(this.root, "templates");
    const previousManifest = await readManifest(join(this.cacheDir, "manifest.json"));
    const nextManifest = { ...previousManifest };
    const seenVersions = new Set<string>();
    for (const templateId of await safeDirectories(templateRoot)) {
      const directory = join(templateRoot, templateId);
      for (const filename of await safeJsonFiles(directory)) {
        const sourcePath = join(directory, filename);
        let source: SourceTemplateDefinition;
        try { source = parseSourceTemplate(JSON.parse((await readFile(sourcePath)).toString("utf8"))); }
        catch (error) { throw templateError(`${templateId}/${filename}`, error); }
        if (source.templateId !== templateId || !semver.valid(source.version)) throw new Error(`${templateId}/${filename}: templateId must match its category folder and version must be valid semver`);
        const versionKey = `template:${source.templateId}@${source.version}`;
        if (seenVersions.has(versionKey)) throw new Error(`${versionKey} is declared by more than one JSON file`);
        seenVersions.add(versionKey);
        const compiled = compileTemplate(source, directory, this.root);
        let assetPaths: string[];
        let sourceBytes: Buffer;
        try {
          assetPaths = FONT_NAMES.map((name) => this.assertAssetOrBundled(directory, compiled.assets.fonts[name], this.root));
          sourceBytes = await readFile(sourcePath);
        } catch (error) { throw templateError(`${templateId}/${filename}`, error); }
        const hash = createHash("sha256").update(sourceBytes);
        try { for (const assetPath of assetPaths.sort()) hash.update(await readFile(assetPath)); }
        catch (error) { throw templateError(`${templateId}/${filename}`, error); }
        const digest = hash.digest("hex");
        const key = `template:${source.templateId}@${source.version}`;
        if (previousManifest[key] && previousManifest[key] !== digest) throw new Error(`${key} content changed without a version change`);
        nextManifest[key] = digest;
        let thumbnailPath: string;
        try { thumbnailPath = await prepareTemplateThumbnail({ template: compiled, assetRoot: directory, cacheDir: this.cacheDir, hash: digest }); }
        catch (error) { throw templateError(`${templateId}/${filename}`, error); }
        this.templates.push({ template: compiled, hash: digest, directory, thumbnailPath });
      }
    }
    this.templates.sort((a, b) => a.template.name.localeCompare(b.template.name) || semver.rcompare(a.template.version, b.template.version));
    await writeManifest(join(this.cacheDir, "manifest.json"), nextManifest);
  }

  list(): LoadedTemplate[] { return [...this.templates]; }
  latest(): LoadedTemplate[] { return this.templates.filter((entry, index, all) => index === all.findIndex((candidate) => candidate.template.templateId === entry.template.templateId)); }
  get(id: string, version: string): LoadedTemplate { const found = this.templates.find((entry) => entry.template.templateId === id && entry.template.version === version); if (!found) throw new Error("Template version not found"); return found; }
  validateData(template: TemplateDefinition, data: unknown): void { const validate = this.ajv.compile(template.schema); if (!validate(data)) throw new Error(`Document data is invalid: ${this.ajv.errorsText(validate.errors)}`); }
  assertAsset(directory: string, assetPath: string): string {
    if (/^[a-z]+:/i.test(assetPath)) throw new Error("Remote template assets are forbidden");
    const resolved = resolve(directory, assetPath); const rel = relative(resolve(directory), resolved);
    if (rel.startsWith(`..${sep}`) || rel === "..") throw new Error("Template asset escapes its directory");
    return resolved;
  }
  private assertAssetOrBundled(directory: string, assetPath: string, root: string): string {
    const bundledRoot = resolve(root, "assets", "fonts"); const resolved = resolve(directory, assetPath); const rel = relative(bundledRoot, resolved);
    if (!rel.startsWith(`..${sep}`) && rel !== "..") return resolved;
    return this.assertAsset(directory, assetPath);
  }
}

function compileTemplate(source: SourceTemplateDefinition, directory: string, root: string): TemplateDefinition {
  const fonts = source.assets?.fonts ?? Object.fromEntries(FONT_NAMES.map((name) => [name, relative(directory, resolve(root, "assets", "fonts", FONT_FILES[name]))])) as Record<string, string>;
  const template: TemplateDefinition = {
    templateId: source.templateId, version: source.version, name: source.name, description: source.description,
    thumbnail: "thumbnail.png", assets: { fonts: fonts as TemplateDefinition["assets"]["fonts"] },
    page: { size: source.page?.size ?? DEFAULT_PAGE.size, marginsMm: source.page?.marginsMm ?? DEFAULT_PAGE.marginsMm },
    schema: { type: "object", additionalProperties: false, required: [], properties: {} }, ui: { sections: [] }, syntheticData: {}, nodes: [],
    ...(source.footer ? { footer: source.footer } : {})
  };
  const required: string[] = [];
  for (const [path, field] of Object.entries(source.fields)) {
    const property: Record<string, unknown> = { type: field.type };
    for (const key of ["minLength", "maxLength", "minimum", "maximum", "format", "enum"] as const) if (field[key] !== undefined) property[key] = field[key];
    (template.schema.properties as Record<string, unknown>)[path] = property;
    if (field.required) required.push(path); template.syntheticData[path] = field.example;
  }
  (template.schema.required as string[]).push(...required);
  const seen = new Set<string>();
  for (const node of source.layout) {
    if (node.type === "section") {
      const fields: FieldUi[] = []; const rows: { label: string; value: string; formatter?: string }[] = [];
      for (const fieldId of node.fields) {
        const field = source.fields[fieldId]; if (!field) throw new Error(`unknown field reference: ${fieldId}`); if (seen.has(fieldId)) throw new Error(`duplicate field reference: ${fieldId}`); seen.add(fieldId);
        fields.push({ path: fieldId, label: field.label, input: fieldInput(field), placeholder: field.placeholder });
        rows.push({ label: field.label, value: `document.${fieldId}`, ...(field.formatter ? { formatter: field.formatter } : {}) });
      }
      template.ui.sections.push({ title: node.title, fields }); template.nodes.push({ type: "section", title: node.title, rows });
    } else if (node.type === "pairedTable") {
      const fields: FieldUi[] = [];
      for (const fieldId of node.rows.flatMap((row) => [row.left, row.right])) {
        const field = source.fields[fieldId]; if (!field) throw new Error(`unknown field reference: ${fieldId}`); if (seen.has(fieldId)) throw new Error(`duplicate field reference: ${fieldId}`); seen.add(fieldId);
        fields.push({ path: fieldId, label: field.label, input: fieldInput(field), placeholder: field.placeholder });
      }
      template.ui.sections.push({ title: node.title, fields });
      template.nodes.push({ type: "pairedTable", title: node.title, columns: node.columns, rows: node.rows });
    } else template.nodes.push(node as TemplateNode);
  }
  const missing = Object.keys(source.fields).filter((field) => !seen.has(field)); if (missing.length) throw new Error(`fields are not referenced by layout sections: ${missing.join(", ")}`);
  validateCompiledTemplate(template); return template;
}

function fieldInput(field: SourceField): FieldUi["input"] { if (field.input) return field.input; if (field.type === "boolean") return "boolean"; if (field.enum) return "enum"; if (field.format === "date") return "date"; if (field.type === "number") return "number"; return "text"; }

function validateCompiledTemplate(template: TemplateDefinition): void {
  if (!PAPER_SIZES.includes(template.page.size)) throw new Error(`unsupported paper size: ${template.page.size}`);
  if (template.page.marginsMm.some((value) => !Number.isFinite(value) || value < 0)) throw new Error("page margins must be non-negative numbers");
  const ajv = new Ajv({ allErrors: true, strict: false });
  ajv.addFormat("date", /^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/);
  ajv.addFormat("email", /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  ajv.addFormat("uri", /^[a-z][a-z0-9+.-]*:\S+$/i);
  const check = ajv.compile(template.schema); if (!check(template.syntheticData)) throw new Error(`example data is invalid: ${ajv.errorsText(check.errors)}`);
  for (const font of Object.values(template.assets.fonts)) if (!/^[a-z0-9._/-]+$/i.test(font)) throw new Error(`invalid font asset path: ${font}`);
  const paths = template.nodes.flatMap((node) => node.type === "text" ? [...(node.value ? [node.value] : []), ...(node.when ? [node.when] : [])] : node.type === "section" ? node.rows.flatMap((row) => [row.value, ...(row.when ? [row.when] : [])]) : node.type === "pairedTable" ? node.rows.flatMap((row) => [`document.${row.left}`, `document.${row.right}`]) : []);
  for (const path of paths) if (!VALID_SYSTEM_PATHS.has(path) && (!path.startsWith("document.") || !schemaHasPath(template.schema, path.slice(9)))) throw new Error(`unknown template binding: ${path}`);
}

function parseSourceTemplate(value: unknown): SourceTemplateDefinition {
  if (!isRecord(value)) throw new Error("template must be an object");
  assertKeys(value, ["templateId", "version", "name", "description", "page", "assets", "fields", "layout", "footer"], "template");
  for (const key of ["templateId", "version", "name", "description"]) if (typeof value[key] !== "string" || !value[key].trim()) throw new Error(`${key} is required`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.templateId as string)) throw new Error("templateId must use lowercase kebab-case");
  if (!isRecord(value.fields)) throw new Error("fields must be an object"); if (!Array.isArray(value.layout)) throw new Error("layout must be an array");
  const fields: Record<string, SourceField> = {};
  for (const [id, raw] of Object.entries(value.fields)) {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(id)) throw new Error(`field ID ${id} must contain only letters, numbers, and underscores`);
    fields[id] = parseField(raw, id);
  }
  const layout = value.layout.map((node, index) => parseLayoutNode(node, index)); const page = value.page === undefined ? undefined : parsePage(value.page); const assets = value.assets === undefined ? undefined : parseAssets(value.assets);
  if (value.footer !== undefined && typeof value.footer !== "string") throw new Error("footer must be a string");
  return { templateId: value.templateId as string, version: value.version as string, name: value.name as string, description: value.description as string, fields, layout, ...(page ? { page } : {}), ...(assets ? { assets } : {}), ...(value.footer !== undefined ? { footer: value.footer } : {}) };
}

function parseField(value: unknown, id: string): SourceField {
  if (!isRecord(value)) throw new Error(`field ${id} must be an object`); if (typeof value.label !== "string" || !value.label.trim()) throw new Error(`field ${id} requires a label`); if (!FIELD_TYPES.has(value.type)) throw new Error(`field ${id} has unsupported type`); if (!Object.prototype.hasOwnProperty.call(value, "example")) throw new Error(`field ${id} requires an example`);
  assertKeys(value, ["label", "type", "example", "required", "input", "formatter", "placeholder", "format", "enum", "minLength", "maxLength", "minimum", "maximum"], `field ${id}`);
  if (value.required !== undefined && typeof value.required !== "boolean") throw new Error(`field ${id} required must be boolean`); if (value.placeholder !== undefined && typeof value.placeholder !== "string") throw new Error(`field ${id} placeholder must be a string`); if (value.input !== undefined && (!INPUTS.has(value.input) || value.input === "number" && value.type !== "number")) throw new Error(`field ${id} has unsupported input`); if (value.formatter !== undefined && !FORMATTERS.has(value.formatter)) throw new Error(`field ${id} has unsupported formatter`); if (value.format !== undefined && (!FORMATS.has(value.format) || value.type !== "string")) throw new Error(`field ${id} has unsupported format`);
  if (value.enum !== undefined && (!Array.isArray(value.enum) || value.enum.some((item) => typeof item !== "string"))) throw new Error(`field ${id} enum must be a string array`); if (value.enum && value.type !== "string") throw new Error(`field ${id} enum requires a string type`);
  if (value.type === "number" && typeof value.example !== "number") throw new Error(`field ${id} example must be a number`); if (value.type === "boolean" && typeof value.example !== "boolean") throw new Error(`field ${id} example must be boolean`); if (value.type === "string" && typeof value.example !== "string") throw new Error(`field ${id} example must be a string`);
  for (const key of ["minLength", "maxLength", "minimum", "maximum"]) if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] < 0)) throw new Error(`field ${id} has invalid ${key}`);
  if ((value.minLength !== undefined || value.maxLength !== undefined) && value.type !== "string") throw new Error(`field ${id} length constraints require a string type`); if ((value.minimum !== undefined || value.maximum !== undefined) && value.type !== "number") throw new Error(`field ${id} numeric constraints require a number type`);
  if (value.minLength !== undefined && value.maxLength !== undefined && value.minLength > value.maxLength) throw new Error(`field ${id} has an invalid length range`); if (value.minimum !== undefined && value.maximum !== undefined && value.minimum > value.maximum) throw new Error(`field ${id} has an invalid numeric range`);
  return value as unknown as SourceField;
}

function parseLayoutNode(value: unknown, index: number): SourceLayoutNode {
  if (!isRecord(value) || typeof value.type !== "string") throw new Error(`layout node ${index} is invalid`);
  if (value.type === "title" || value.type === "subtitle") { assertKeys(value, ["type", "text"], `layout node ${index}`); if (typeof value.text !== "string" || !value.text.trim()) throw new Error(`layout node ${index} requires text`); return { type: value.type, text: value.text }; }
  if (value.type === "section") { assertKeys(value, ["type", "title", "fields"], `layout node ${index}`); if (typeof value.title !== "string" || !Array.isArray(value.fields) || value.fields.some((field) => typeof field !== "string")) throw new Error(`layout node ${index} is an invalid section`); return { type: "section", title: value.title, fields: value.fields as string[] }; }
  if (value.type === "pairedTable") return parsePairedTable(value, index);
  if (value.type === "text") { assertKeys(value, ["type", "text", "value", "formatter", "style", "when"], `layout node ${index}`); if (value.text !== undefined && typeof value.text !== "string") throw new Error(`layout node ${index} text is invalid`); if (value.value !== undefined && typeof value.value !== "string") throw new Error(`layout node ${index} value is invalid`); if (value.when !== undefined && typeof value.when !== "string") throw new Error(`layout node ${index} when is invalid`); if (value.style !== undefined && typeof value.style !== "string") throw new Error(`layout node ${index} style is invalid`); if (value.formatter !== undefined && !FORMATTERS.has(value.formatter)) throw new Error(`layout node ${index} formatter is invalid`); if (value.text === undefined && value.value === undefined) throw new Error(`layout node ${index} requires text or value`); return value as unknown as SourceLayoutNode; }
  if (value.type === "spacer") { assertKeys(value, ["type", "height"], `layout node ${index}`); if (typeof value.height !== "number" || !Number.isFinite(value.height) || value.height < 0) throw new Error(`layout node ${index} height is invalid`); return { type: "spacer", height: value.height }; }
  if (value.type === "pageBreak") { assertKeys(value, ["type"], `layout node ${index}`); return { type: "pageBreak" }; } throw new Error(`layout node ${index} has unsupported type`);
}

function parsePairedTable(value: Record<string, any>, index: number): SourceLayoutNode {
  assertKeys(value, ["type", "title", "columns", "rows"], `layout node ${index}`);
  if (typeof value.title !== "string" || !value.title.trim()) throw new Error(`layout node ${index} requires a table title`);
  if (!Array.isArray(value.columns) || value.columns.length !== 2 || value.columns.some((column) => typeof column !== "string" || !column.trim())) throw new Error(`layout node ${index} requires two table columns`);
  if (!Array.isArray(value.rows) || !value.rows.length) throw new Error(`layout node ${index} requires table rows`);
  const rows = value.rows.map((row, rowIndex) => {
    if (!isRecord(row)) throw new Error(`layout node ${index} table row ${rowIndex} is invalid`);
    assertKeys(row, ["left", "right"], `layout node ${index} table row ${rowIndex}`);
    if (typeof row.left !== "string" || typeof row.right !== "string" || !row.left || !row.right) throw new Error(`layout node ${index} table row ${rowIndex} requires two field references`);
    return { left: row.left, right: row.right };
  });
  return { type: "pairedTable", title: value.title, columns: [value.columns[0], value.columns[1]], rows };
}

function parsePage(value: unknown): SourceTemplateDefinition["page"] { if (!isRecord(value)) throw new Error("page must be an object"); assertKeys(value, ["size", "marginsMm"], "page"); if (value.size !== undefined && !PAPER_SIZES.includes(value.size as PaperSize)) throw new Error("page size is invalid"); if (value.marginsMm !== undefined && (!Array.isArray(value.marginsMm) || value.marginsMm.length !== 4 || value.marginsMm.some((item) => typeof item !== "number" || item < 0))) throw new Error("page margins must contain four non-negative numbers"); return value as SourceTemplateDefinition["page"]; }
function parseAssets(value: unknown): SourceTemplateDefinition["assets"] {
  if (!isRecord(value)) throw new Error("assets must be an object"); assertKeys(value, ["fonts"], "assets");
  if (value.fonts === undefined) return {};
  if (!isRecord(value.fonts)) throw new Error("assets.fonts must be an object"); assertKeys(value.fonts, ["normal", "bold", "italics", "bolditalics"], "assets.fonts");
  for (const name of FONT_NAMES) if (typeof value.fonts[name] !== "string") throw new Error(`assets.fonts.${name} is required`);
  return value as SourceTemplateDefinition["assets"];
}
function schemaHasPath(schema: unknown, path: string): boolean { let cursor = schema as Record<string, unknown>; for (const part of path.split(".")) { const properties = cursor?.properties as Record<string, unknown> | undefined; if (!properties || !(part in properties)) return false; cursor = properties[part] as Record<string, unknown>; } return true; }
function assertKeys(value: Record<string, unknown>, allowed: readonly string[], context: string): void { for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${context} has unknown property: ${key}`); }
function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function templateError(location: string, error: unknown): Error { return new Error(`${location}: ${error instanceof Error ? error.message : String(error)}`); }
async function safeDirectories(path: string): Promise<string[]> { try { return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name).sort(); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } }
async function safeJsonFiles(path: string): Promise<string[]> { try { return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } }
async function readManifest(path: string): Promise<Record<string, string>> { try { const parsed: unknown = JSON.parse(await readFile(path, "utf8")); if (!isRecord(parsed) || Object.values(parsed).some((value) => typeof value !== "string")) throw new Error("template cache manifest is invalid"); return parsed as Record<string, string>; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; } }
async function writeManifest(path: string, manifest: Record<string, string>): Promise<void> { await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 }); const temporary = `${path}.tmp`; await writeFile(temporary, JSON.stringify(manifest, null, 2), { mode: 0o600 }); await rename(temporary, path); }

export type JsonObject = Record<string, unknown>;

export interface KeyWrap {
  nonce: string;
  ciphertext: string;
  tag: string;
}

export interface ProfileHeader {
  id: string;
  name: string;
  createdAt: string;
  passwordEpoch: number;
  kdf: {
    algorithm: "scrypt";
    salt: string;
    N: number;
    r: number;
    p: number;
    keyLength: number;
  };
  passwordWrap: KeyWrap;
  recoveryWrap: KeyWrap;
  failedAttempts: number;
  blockedUntil?: string;
}

export interface StorageStatus {
  databaseFile: string;
  schemaVersion: number;
  saveState: "saved" | "saving" | "error";
  locked: boolean;
}

export interface FieldUi {
  path: string;
  label?: string;
  input?: "text" | "secret" | "date" | "money" | "number" | "enum" | "multiline" | "phone" | "email" | "url" | "boolean";
  placeholder?: string;
}

export interface UiSection {
  title: string;
  fields: FieldUi[];
}

export type PaperSize = "4A0" | "2A0" | "A0" | "A1" | "A2" | "A3" | "A4" | "A5" | "A6" | "A7" | "A8" | "A9" | "A10" | "B0" | "B1" | "B2" | "B3" | "B4" | "B5" | "B6" | "B7" | "B8" | "B9" | "B10" | "C0" | "C1" | "C2" | "C3" | "C4" | "C5" | "C6" | "C7" | "C8" | "C9" | "C10" | "RA0" | "RA1" | "RA2" | "RA3" | "RA4" | "SRA0" | "SRA1" | "SRA2" | "SRA3" | "SRA4" | "EXECUTIVE" | "FOLIO" | "LEGAL" | "LETTER" | "TABLOID";

export interface TemplateDefinition {
  templateId: string;
  version: string;
  name: string;
  description: string;
  thumbnail: string;
  assets: {
    fonts: { normal: string; bold: string; italics: string; bolditalics: string };
  };
  page: { size: PaperSize; marginsMm: [number, number, number, number] };
  schema: JsonObject;
  ui: { sections: UiSection[] };
  syntheticData: JsonObject;
  nodes: TemplateNode[];
  footer?: string;
}

export type SourceFieldType = "string" | "number" | "boolean";
export type SourceFieldInput = "text" | "secret" | "date" | "money" | "number" | "enum" | "multiline" | "phone" | "email" | "url" | "boolean";
export type SourceFieldFormatter = "date" | "money" | "masked" | "multiline";

export interface SourceField {
  label: string;
  type: SourceFieldType;
  example: string | number | boolean;
  required?: boolean;
  input?: SourceFieldInput;
  formatter?: SourceFieldFormatter;
  placeholder?: string;
  format?: "date" | "email" | "uri";
  enum?: string[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

export type SourceLayoutNode =
  | { type: "title" | "subtitle"; text: string }
  | { type: "section"; title: string; fields: string[] }
  | { type: "pairedTable"; title: string; columns: [string, string]; rows: Array<{ left: string; right: string }> }
  | { type: "text"; text?: string; value?: string; formatter?: SourceFieldFormatter; style?: string; when?: string }
  | { type: "spacer"; height: number }
  | { type: "pageBreak" };

export interface SourceTemplateDefinition {
  templateId: string;
  version: string;
  name: string;
  description: string;
  page?: { size?: PaperSize; marginsMm?: [number, number, number, number] };
  assets?: { fonts?: { normal: string; bold: string; italics: string; bolditalics: string } };
  fields: Record<string, SourceField>;
  layout: SourceLayoutNode[];
  footer?: string;
}

export type TemplateNode =
  | { type: "title"; text: string }
  | { type: "subtitle"; text: string }
  | { type: "section"; title: string; rows: TemplateRow[] }
  | { type: "pairedTable"; title: string; columns: [string, string]; rows: Array<{ left: string; right: string }> }
  | { type: "text"; text?: string; value?: string; formatter?: string; style?: string; when?: string }
  | { type: "spacer"; height: number }
  | { type: "pageBreak" };

export interface TemplateRow {
  label: string;
  value: string;
  formatter?: string;
  prefix?: string;
  fallback?: string;
  when?: string;
}

export interface LoadedTemplate {
  template: TemplateDefinition;
  hash: string;
  directory: string;
  thumbnailPath: string;
}

export interface DocumentRow {
  id: string;
  templateId: string;
  templateVersion: string;
  label: string;
  currentRevision: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentRevision {
  documentId: string;
  revision: number;
  parentRevision: number | null;
  data: JsonObject;
  createdAt: string;
}

export interface GenerationReceipt {
  id: string;
  documentId: string;
  templateId: string;
  templateVersion: string;
  templateHash: string;
  profileRevision: number;
  documentRevision: number;
  passwordEpoch: number;
  generatedAt: string;
  filename: string;
  outputHash: string;
}

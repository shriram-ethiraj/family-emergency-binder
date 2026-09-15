export type JsonObject = Record<string, unknown>;

export type SaveState = "saved" | "saving" | "dirty" | "error";

export interface SessionInfo {
  profileId: string;
  profileName: string;
  passwordEpoch: number;
  profileRevision: number;
  profile: { fullName?: string };
  csrfToken: string;
  expiresAt: string;
}

export interface VaultStatus {
  selected: boolean;
  unlocked: boolean;
  fileName: string | null;
  saveState: SaveState;
  persistence: "direct" | "download";
  error?: string;
}

export interface ProfileSummary {
  id: string;
  name: string;
  createdAt: string;
  passwordEpoch: number;
}

export interface FieldUi {
  path: string;
  label?: string;
  input?: string;
  placeholder?: string;
}

export interface DocumentTemplate {
  templateId: string;
  version: string;
  name: string;
  description: string;
  thumbnailUrl: string;
  page: { size: string; marginsMm: [number, number, number, number] };
  schema: {
    required?: string[];
    properties?: Record<string, { type?: string; enum?: string[]; minLength?: number; maxLength?: number; minimum?: number; maximum?: number; format?: string }>;
  };
  ui: { sections: Array<{ title: string; fields: FieldUi[] }> };
  hash: string;
}

export interface PdfTemplate extends DocumentTemplate {
  syntheticData: JsonObject;
  nodes: TemplateNode[];
  footer?: string;
}

export type TemplateNode =
  | { type: "title" | "subtitle"; text: string }
  | { type: "section"; title: string; rows: TemplateRow[] }
  | { type: "pairedTable"; title: string; columns: [string, string]; rows: Array<{ left: string; right: string }> }
  | { type: "text"; text?: string; value?: string; formatter?: string; style?: string; when?: string }
  | { type: "spacer"; height: number }
  | { type: "pageBreak" };

export interface TemplateRow {
  label: string;
  value: string;
  formatter?: string;
}

export interface DocumentSummary {
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

export interface DocumentDetail extends DocumentSummary {
  revision: DocumentRevision;
}

export type JsonObject = Record<string, unknown>;

export interface SessionInfo {
  profileId: string;
  profileName: string;
  passwordEpoch: number;
  profileRevision: number;
  profile: { fullName?: string };
  csrfToken: string;
  expiresAt: string;
}

export interface ProfileSummary {
  id: string;
  name: string;
  createdAt: string;
  passwordEpoch: number;
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
    properties?: Record<string, { type?: string; enum?: string[]; minLength?: number; maxLength?: number }>;
  };
  ui: { sections: Array<{ title: string; fields: FieldUi[] }> };
  hash: string;
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

export interface Generation {
  id: string;
  filename: string;
  documentId: string;
  documentRevision: number;
  templateVersion: string;
  generatedAt: string;
  passwordEpoch: number;
  outputHash: string;
}

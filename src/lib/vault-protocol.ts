import type { DocumentRevision, DocumentSummary, JsonObject, PdfTemplate, ProfileSummary, SaveState, SessionInfo, VaultStatus } from "@/lib/domain";

export interface CipherEnvelope { nonce: string; ciphertext: string }
export interface VaultEnvelopeV1 {
  magic: "FEBVAULT";
  version: 1;
  vaultId: string;
  generation: number;
  kdf: { algorithm: "PBKDF2-HMAC-SHA-256"; salt: string; iterations: number; keyLength: 32 };
  passwordWrap: CipherEnvelope;
  recoveryWrap: CipherEnvelope;
  payload: CipherEnvelope;
}

export interface ProfileRecord {
  id: string;
  name: string;
  createdAt: string;
  revisions: Array<{ revision: number; data: JsonObject; createdAt: string }>;
}

export interface DocumentRecord extends DocumentSummary {
  profileId: string;
  revisions: DocumentRevision[];
}

export interface VaultPayloadV1 {
  schemaVersion: 1;
  generation: number;
  createdAt: string;
  updatedAt: string;
  profiles: ProfileRecord[];
  documents: DocumentRecord[];
  templates: Record<string, PdfTemplate>;
}

export type WorkerCommand =
  | { type: "create"; id: number; handle: FileSystemFileHandle; password: string }
  | { type: "createPortable"; id: number; fileName: string; password: string }
  | { type: "select"; id: number; handle: FileSystemFileHandle }
  | { type: "selectBytes"; id: number; fileName: string; bytes: Uint8Array }
  | { type: "unlock"; id: number; password: string }
  | { type: "recover"; id: number; recoveryKey: string; newPassword: string }
  | { type: "call"; id: number; path: string; method: string; body?: unknown }
  | { type: "saveCopy"; id: number; handle: FileSystemFileHandle }
  | { type: "export"; id: number }
  | { type: "markExported"; id: number; generation: number }
  | { type: "lock"; id: number };

export type WorkerResult =
  | { type: "result"; id: number; value: unknown }
  | { type: "error"; id: number; message: string }
  | { type: "status"; status: VaultStatus };

export type VaultCallResult = SessionInfo | ProfileSummary | DocumentSummary | DocumentRevision | unknown;
export interface SaveStatusEvent { saveState: SaveState; error?: string }

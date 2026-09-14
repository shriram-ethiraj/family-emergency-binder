import { randomBytes, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  assertPassword, decryptJson, encryptJson, keyWrapAad, makeRecoveryKey, newKdf, passwordKey,
  recordAad, recoveryKeyMaterial, sameKey, unwrapKey, wrapKey
} from "./crypto.js";
import { get, PortableVaultStore, run } from "./storage.js";
import type { DocumentRevision, DocumentRow, GenerationReceipt, JsonObject, KeyWrap, ProfileHeader, StorageStatus } from "./types.js";

export interface UnlockedVault {
  profile: ProfileHeader;
  dbKey: Buffer;
  mutationQueue: Promise<void>;
}

interface ProfileRow {
  id: string; name: string; created_at: string; password_epoch: number; kdf_json: string;
  password_wrap_json: string; recovery_wrap_json: string; failed_attempts: number; blocked_until: string | null;
}

interface DocumentDatabaseRow extends Record<string, unknown> {
  profile_id: string; id: string; template_id: string; template_version: string; encrypted_metadata_json: string;
  current_revision: number; archived: number; created_at: string; updated_at: string;
}

interface RevisionDatabaseRow {
  profile_id: string; document_id: string; revision: number; parent_revision: number | null;
  encrypted_payload_json: string; created_at: string;
}

export class VaultService {
  readonly store: PortableVaultStore;

  constructor(readonly dataDir: string) { this.store = new PortableVaultStore(dataDir); }
  async init(): Promise<void> { await this.store.init(); }
  async close(): Promise<void> { await this.store.close(); }
  storageStatus(locked: boolean): StorageStatus { return this.store.status(locked); }

  async listProfiles(): Promise<Array<{ id: string; name: string; createdAt: string; passwordEpoch: number }>> {
    const rows = await this.store.readAll<ProfileRow>("SELECT * FROM profiles ORDER BY name COLLATE NOCASE, created_at");
    return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at, passwordEpoch: Number(row.password_epoch) }));
  }

  async createProfile(password: string, identity: JsonObject): Promise<{ profile: ProfileHeader; recoveryKey: string; vault: UnlockedVault }> {
    assertPassword(password);
    const name = profileName(identity);
    if ((await this.listProfiles()).some((profile) => profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      throw new Error("A profile with this name already exists");
    }
    const id = randomUUID();
    const dbKey = randomBytes(32);
    const kdf = newKdf();
    const recovery = makeRecoveryKey();
    const recoveryWrappingKey = recoveryKeyMaterial(recovery.raw, id);
    const passwordWrappingKey = await passwordKey(password, kdf);
    const createdAt = new Date().toISOString();
    const profile: ProfileHeader = {
      id, name, createdAt, passwordEpoch: 1, kdf,
      passwordWrap: wrapKey(dbKey, passwordWrappingKey, keyWrapAad(id, "password", kdf)),
      recoveryWrap: wrapKey(dbKey, recoveryWrappingKey, keyWrapAad(id, "recovery")), failedAttempts: 0
    };
    passwordWrappingKey.fill(0);
    recoveryWrappingKey.fill(0);
    const encryptedIdentity = encryptPayload(identity, dbKey, id, "profile-revision", id, 1);
    try {
      await this.store.mutate((database) => {
        insertProfile(database, profile);
        run(database, "INSERT INTO profile_revisions(profile_id, revision, encrypted_payload_json, created_at) VALUES(?, 1, ?, ?)", [id, encryptedIdentity, createdAt]);
        insertAudit(database, profile, dbKey, "profile.created", "profile", id, createdAt);
      });
      return { profile, recoveryKey: recovery.display, vault: { profile, dbKey, mutationQueue: Promise.resolve() } };
    } catch (error) {
      dbKey.fill(0);
      if (isUniqueError(error)) throw new Error("A profile with this name already exists");
      throw error;
    }
  }

  async unlock(id: string, password: string): Promise<UnlockedVault> {
    const profile = await this.profile(id);
    if (profile.blockedUntil && Date.parse(profile.blockedUntil) > Date.now()) throw new Error("Too many failed attempts. Try again later");
    let dbKey: Buffer;
    let wrappingKey: Buffer | undefined;
    try {
      wrappingKey = await passwordKey(password, profile.kdf);
      dbKey = unwrapKey(profile.passwordWrap, wrappingKey, keyWrapAad(profile.id, "password", profile.kdf));
    } catch {
      await this.recordFailedAttempt(profile);
      throw new Error("Invalid profile password");
    } finally { wrappingKey?.fill(0); }
    try { await this.decryptLatestProfileRevision(profile.id, dbKey); }
    catch { dbKey.fill(0); throw new Error("Vault data is damaged or was modified"); }
    const cleanProfile = { ...profile, failedAttempts: 0, blockedUntil: undefined };
    if (profile.failedAttempts || profile.blockedUntil) await this.store.mutate((database) => updateProfile(database, cleanProfile));
    return { profile: cleanProfile, dbKey, mutationQueue: Promise.resolve() };
  }

  async recover(id: string, recoveryKey: string, newPassword: string): Promise<UnlockedVault> {
    assertPassword(newPassword);
    const profile = await this.profile(id);
    const recoveryWrappingKey = recoveryKeyMaterial(recoveryKey, id);
    let dbKey: Buffer;
    try { dbKey = unwrapKey(profile.recoveryWrap, recoveryWrappingKey, keyWrapAad(id, "recovery")); }
    finally { recoveryWrappingKey.fill(0); }
    try { await this.decryptLatestProfileRevision(id, dbKey); }
    catch { dbKey.fill(0); throw new Error("Vault data is damaged or was modified"); }
    const kdf = newKdf();
    const wrappingKey = await passwordKey(newPassword, kdf);
    const updated: ProfileHeader = {
      ...profile, kdf, passwordWrap: wrapKey(dbKey, wrappingKey, keyWrapAad(id, "password", kdf)),
      passwordEpoch: profile.passwordEpoch + 1, failedAttempts: 0, blockedUntil: undefined
    };
    wrappingKey.fill(0);
    const vault: UnlockedVault = { profile: updated, dbKey, mutationQueue: Promise.resolve() };
    try {
      await this.mutateVault(vault, (database) => { updateProfile(database, updated); insertAudit(database, updated, dbKey, "profile.recovered", "profile", id); });
      return vault;
    } catch (error) { dbKey.fill(0); throw error; }
  }

  async verifyPassword(vault: UnlockedVault, password: string): Promise<boolean> {
    let wrappingKey: Buffer | undefined;
    let candidate: Buffer | undefined;
    try {
      wrappingKey = await passwordKey(password, vault.profile.kdf);
      candidate = unwrapKey(vault.profile.passwordWrap, wrappingKey, keyWrapAad(vault.profile.id, "password", vault.profile.kdf));
      return sameKey(candidate, vault.dbKey);
    } catch { return false; }
    finally { wrappingKey?.fill(0); candidate?.fill(0); }
  }

  async changePassword(vault: UnlockedVault, currentPassword: string, newPassword: string): Promise<ProfileHeader> {
    assertPassword(newPassword);
    if (!(await this.verifyPassword(vault, currentPassword))) throw new Error("Current password is incorrect");
    const kdf = newKdf();
    const wrappingKey = await passwordKey(newPassword, kdf);
    const updated = { ...vault.profile, kdf, passwordWrap: wrapKey(vault.dbKey, wrappingKey, keyWrapAad(vault.profile.id, "password", kdf)), passwordEpoch: vault.profile.passwordEpoch + 1 };
    wrappingKey.fill(0);
    await this.mutateVault(vault, (database) => { updateProfile(database, updated); insertAudit(database, updated, vault.dbKey, "profile.password-changed", "profile", updated.id); });
    vault.profile = updated;
    return updated;
  }

  async rotateRecoveryKey(vault: UnlockedVault, password: string): Promise<string> {
    if (!(await this.verifyPassword(vault, password))) throw new Error("Profile password is incorrect");
    const recovery = makeRecoveryKey();
    const wrappingKey = recoveryKeyMaterial(recovery.raw, vault.profile.id);
    const updated = { ...vault.profile, recoveryWrap: wrapKey(vault.dbKey, wrappingKey, keyWrapAad(vault.profile.id, "recovery")) };
    wrappingKey.fill(0);
    await this.mutateVault(vault, (database) => { updateProfile(database, updated); insertAudit(database, updated, vault.dbKey, "profile.recovery-key-rotated", "profile", updated.id); });
    vault.profile = updated;
    return recovery.display;
  }

  async closeVault(vault: UnlockedVault): Promise<void> { await vault.mutationQueue.catch(() => undefined); vault.dbKey.fill(0); }

  async deleteProfile(vault: UnlockedVault, password: string): Promise<void> {
    if (!(await this.verifyPassword(vault, password))) throw new Error("Profile password is incorrect");
    await this.mutateVault(vault, (database) => {
      const result = run(database, "DELETE FROM profiles WHERE id = ?", [vault.profile.id]);
      if (!result.changes) throw new Error("Profile not found");
    });
    await this.closeVault(vault);
  }

  async profileRevision(vault: UnlockedVault): Promise<{ revision: number; data: JsonObject; createdAt: string }> {
    const row = await this.store.readOne<{ revision: number; encrypted_payload_json: string; created_at: string }>(
      "SELECT revision, encrypted_payload_json, created_at FROM profile_revisions WHERE profile_id = ? ORDER BY revision DESC LIMIT 1", [vault.profile.id]);
    if (!row) throw new Error("Profile details are missing");
    return { revision: Number(row.revision), data: decryptPayload<JsonObject>(row.encrypted_payload_json, vault.dbKey, vault.profile.id, "profile-revision", vault.profile.id, Number(row.revision)), createdAt: row.created_at };
  }

  async updateProfileDetails(vault: UnlockedVault, expectedRevision: number, data: JsonObject) {
    const name = profileName(data);
    if ((await this.listProfiles()).some((profile) => profile.id !== vault.profile.id && profile.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("A profile with this name already exists");
    const result = await this.mutateVault(vault, (database) => {
      const current = get<{ revision: number }>(database, "SELECT revision FROM profile_revisions WHERE profile_id = ? ORDER BY revision DESC LIMIT 1", [vault.profile.id]);
      if (!current) throw new Error("Profile details are missing");
      if (Number(current.revision) !== expectedRevision) throw new Error("STALE_REVISION");
      const revision = expectedRevision + 1;
      const createdAt = new Date().toISOString();
      const encrypted = encryptPayload(data, vault.dbKey, vault.profile.id, "profile-revision", vault.profile.id, revision);
      run(database, "INSERT INTO profile_revisions(profile_id, revision, encrypted_payload_json, created_at) VALUES(?, ?, ?, ?)", [vault.profile.id, revision, encrypted, createdAt]);
      run(database, "UPDATE profiles SET name = ? WHERE id = ?", [name, vault.profile.id]);
      insertAudit(database, vault.profile, vault.dbKey, "profile.details-revised", "profile", vault.profile.id, createdAt);
      return { revision, data, createdAt };
    });
    vault.profile = { ...vault.profile, name };
    return result;
  }

  async listDocuments(vault: UnlockedVault, includeArchived = false): Promise<DocumentRow[]> {
    const rows = await this.store.readAll<DocumentDatabaseRow>(`SELECT * FROM documents WHERE profile_id = ? ${includeArchived ? "" : "AND archived = 0"} ORDER BY updated_at DESC`, [vault.profile.id]);
    return rows.map((row) => mapDocument(row, vault));
  }

  async createDocument(vault: UnlockedVault, templateId: string, templateVersion: string, label: string, data: JsonObject) {
    const id = randomUUID();
    const createdAt = new Date().toISOString();
    await this.mutateVault(vault, (database) => {
      const metadata = encryptPayload({ label: label.trim() }, vault.dbKey, vault.profile.id, "document-metadata", id);
      const payload = encryptPayload(data, vault.dbKey, vault.profile.id, "document-revision", id, 1);
      run(database, `INSERT INTO documents(profile_id, id, template_id, template_version, encrypted_metadata_json, current_revision, archived, created_at, updated_at) VALUES(?, ?, ?, ?, ?, 1, 0, ?, ?)`, [vault.profile.id, id, templateId, templateVersion, metadata, createdAt, createdAt]);
      run(database, `INSERT INTO document_revisions(profile_id, document_id, revision, parent_revision, encrypted_payload_json, created_at) VALUES(?, ?, 1, NULL, ?, ?)`, [vault.profile.id, id, payload, createdAt]);
      insertAudit(database, vault.profile, vault.dbKey, "document.created", "document", id, createdAt);
    });
    return this.getDocument(vault, id, 1);
  }

  async cloneDocument(vault: UnlockedVault, id: string) {
    const clonedId = randomUUID();
    const createdAt = new Date().toISOString();
    await this.mutateVault(vault, (database) => {
      const source = get<DocumentDatabaseRow>(database, "SELECT * FROM documents WHERE profile_id = ? AND id = ?", [vault.profile.id, id]);
      if (!source) throw new Error("Document not found");
      const sourceRevision = get<RevisionDatabaseRow>(database, "SELECT * FROM document_revisions WHERE profile_id = ? AND document_id = ? AND revision = ?", [vault.profile.id, id, source.current_revision]);
      if (!sourceRevision) throw new Error("Document revision not found");
      const sourceDocument = mapDocument(source, vault);
      const sourceData = mapRevision(sourceRevision, vault).data;
      const label = copyLabel(sourceDocument.label);
      const metadata = encryptPayload({ label }, vault.dbKey, vault.profile.id, "document-metadata", clonedId);
      const payload = encryptPayload(sourceData, vault.dbKey, vault.profile.id, "document-revision", clonedId, 1);
      run(database, "INSERT INTO documents(profile_id, id, template_id, template_version, encrypted_metadata_json, current_revision, archived, created_at, updated_at) VALUES(?, ?, ?, ?, ?, 1, 0, ?, ?)", [vault.profile.id, clonedId, source.template_id, source.template_version, metadata, createdAt, createdAt]);
      run(database, "INSERT INTO document_revisions(profile_id, document_id, revision, parent_revision, encrypted_payload_json, created_at) VALUES(?, ?, 1, NULL, ?, ?)", [vault.profile.id, clonedId, payload, createdAt]);
      insertAudit(database, vault.profile, vault.dbKey, "document.cloned", "document", clonedId, createdAt);
    });
    return this.getDocument(vault, clonedId, 1);
  }

  async reviseDocument(vault: UnlockedVault, id: string, expectedRevision: number, label: string, data: JsonObject) {
    const revision = await this.mutateVault(vault, (database) => {
      const row = get<DocumentDatabaseRow>(database, "SELECT * FROM documents WHERE profile_id = ? AND id = ?", [vault.profile.id, id]);
      if (!row) throw new Error("Document not found");
      if (Number(row.current_revision) !== expectedRevision) throw new Error("STALE_REVISION");
      const nextRevision = expectedRevision + 1;
      const updatedAt = new Date().toISOString();
      const metadata = encryptPayload({ label: label.trim() }, vault.dbKey, vault.profile.id, "document-metadata", id);
      const payload = encryptPayload(data, vault.dbKey, vault.profile.id, "document-revision", id, nextRevision);
      run(database, `INSERT INTO document_revisions(profile_id, document_id, revision, parent_revision, encrypted_payload_json, created_at) VALUES(?, ?, ?, ?, ?, ?)`, [vault.profile.id, id, nextRevision, expectedRevision, payload, updatedAt]);
      run(database, "UPDATE documents SET encrypted_metadata_json = ?, current_revision = ?, updated_at = ? WHERE profile_id = ? AND id = ?", [metadata, nextRevision, updatedAt, vault.profile.id, id]);
      insertAudit(database, vault.profile, vault.dbKey, "document.revised", "document", id, updatedAt);
      return nextRevision;
    });
    return this.getDocument(vault, id, revision);
  }

  async getDocument(vault: UnlockedVault, id: string, revision?: number) {
    const row = await this.store.readOne<DocumentDatabaseRow>("SELECT * FROM documents WHERE profile_id = ? AND id = ?", [vault.profile.id, id]);
    if (!row) throw new Error("Document not found");
    const document = mapDocument(row, vault);
    const selected = revision ?? document.currentRevision;
    const rev = await this.store.readOne<RevisionDatabaseRow>("SELECT * FROM document_revisions WHERE profile_id = ? AND document_id = ? AND revision = ?", [vault.profile.id, id, selected]);
    if (!rev) throw new Error("Document revision not found");
    return { ...document, revision: mapRevision(rev, vault) };
  }

  async revisions(vault: UnlockedVault, id: string): Promise<DocumentRevision[]> {
    const document = await this.store.readOne<{ id: string }>("SELECT id FROM documents WHERE profile_id = ? AND id = ?", [vault.profile.id, id]);
    if (!document) throw new Error("Document not found");
    const rows = await this.store.readAll<RevisionDatabaseRow>("SELECT * FROM document_revisions WHERE profile_id = ? AND document_id = ? ORDER BY revision DESC", [vault.profile.id, id]);
    return rows.map((row) => mapRevision(row, vault));
  }

  async setArchived(vault: UnlockedVault, id: string, archived: boolean): Promise<void> {
    await this.mutateVault(vault, (database) => {
      const createdAt = new Date().toISOString();
      const result = run(database, "UPDATE documents SET archived = ?, updated_at = ? WHERE profile_id = ? AND id = ?", [archived ? 1 : 0, createdAt, vault.profile.id, id]);
      if (!result.changes) throw new Error("Document not found");
      insertAudit(database, vault.profile, vault.dbKey, archived ? "document.archived" : "document.restored", "document", id, createdAt);
    });
  }

  async purge(vault: UnlockedVault, id: string, confirmation: string): Promise<void> {
    await this.mutateVault(vault, (database) => {
      const row = get<DocumentDatabaseRow>(database, "SELECT * FROM documents WHERE profile_id = ? AND id = ?", [vault.profile.id, id]);
      if (!row) throw new Error("Document not found");
      if (confirmation !== mapDocument(row, vault).label) throw new Error("Confirmation label does not match");
      run(database, "DELETE FROM documents WHERE profile_id = ? AND id = ?", [vault.profile.id, id]);
      insertAudit(database, vault.profile, vault.dbKey, "document.purged", "document", id);
    });
  }

  async saveGeneration(vault: UnlockedVault, receipt: GenerationReceipt): Promise<void> {
    await this.mutateVault(vault, (database) => {
      const encrypted = encryptPayload(receipt as unknown as JsonObject, vault.dbKey, vault.profile.id, "generation-receipt", receipt.id);
      run(database, `INSERT INTO generation_receipts(profile_id, id, document_id, encrypted_payload_json, generated_at) VALUES(?, ?, ?, ?, ?)`, [vault.profile.id, receipt.id, receipt.documentId, encrypted, receipt.generatedAt]);
      insertAudit(database, vault.profile, vault.dbKey, "document.generated", "document", receipt.documentId, receipt.generatedAt);
    });
  }

  async removeGeneration(vault: UnlockedVault, id: string): Promise<void> {
    await this.mutateVault(vault, (database) => {
      const result = run(database, "DELETE FROM generation_receipts WHERE profile_id = ? AND id = ?", [vault.profile.id, id]);
      if (result.changes) insertAudit(database, vault.profile, vault.dbKey, "document.generation-pruned", "generation", id);
    });
  }

  async generations(vault: UnlockedVault): Promise<GenerationReceipt[]> {
    const rows = await this.store.readAll<{ id: string; encrypted_payload_json: string }>("SELECT id, encrypted_payload_json FROM generation_receipts WHERE profile_id = ? ORDER BY generated_at DESC", [vault.profile.id]);
    return rows.map((row) => decryptPayload<GenerationReceipt>(row.encrypted_payload_json, vault.dbKey, vault.profile.id, "generation-receipt", row.id));
  }

  async generation(vault: UnlockedVault, id: string): Promise<GenerationReceipt> {
    const row = await this.store.readOne<{ encrypted_payload_json: string }>("SELECT encrypted_payload_json FROM generation_receipts WHERE profile_id = ? AND id = ?", [vault.profile.id, id]);
    if (!row) throw new Error("Generated document not found");
    return decryptPayload<GenerationReceipt>(row.encrypted_payload_json, vault.dbKey, vault.profile.id, "generation-receipt", id);
  }

  private async profile(id: string): Promise<ProfileHeader> {
    const row = await this.store.readOne<ProfileRow>("SELECT * FROM profiles WHERE id = ?", [id]);
    if (!row) throw new Error("Profile not found");
    return mapProfile(row);
  }

  private async decryptLatestProfileRevision(profileId: string, dbKey: Buffer): Promise<JsonObject> {
    const row = await this.store.readOne<{ revision: number; encrypted_payload_json: string }>("SELECT revision, encrypted_payload_json FROM profile_revisions WHERE profile_id = ? ORDER BY revision DESC LIMIT 1", [profileId]);
    if (!row) throw new Error("Profile details are missing");
    return decryptPayload<JsonObject>(row.encrypted_payload_json, dbKey, profileId, "profile-revision", profileId, Number(row.revision));
  }

  private async recordFailedAttempt(profile: ProfileHeader): Promise<void> {
    const attempts = profile.failedAttempts + 1;
    const blockedUntil = attempts >= 5 ? new Date(Date.now() + 30_000).toISOString() : undefined;
    await this.store.mutate((database) => updateProfile(database, { ...profile, failedAttempts: attempts >= 5 ? 0 : attempts, blockedUntil }));
  }

  private async mutateVault<T>(vault: UnlockedVault, work: (database: DatabaseSync) => T | Promise<T>): Promise<T> {
    const operation = vault.mutationQueue.catch(() => undefined).then(() => this.store.mutate(work));
    vault.mutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }
}

function insertProfile(database: DatabaseSync, profile: ProfileHeader): void {
  run(database, `INSERT INTO profiles(id, name, created_at, password_epoch, kdf_json, password_wrap_json, recovery_wrap_json, failed_attempts, blocked_until) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`, [profile.id, profile.name, profile.createdAt, profile.passwordEpoch, JSON.stringify(profile.kdf), JSON.stringify(profile.passwordWrap), JSON.stringify(profile.recoveryWrap), profile.failedAttempts, profile.blockedUntil ?? null]);
}

function updateProfile(database: DatabaseSync, profile: ProfileHeader): void {
  const result = run(database, `UPDATE profiles SET name = ?, password_epoch = ?, kdf_json = ?, password_wrap_json = ?, recovery_wrap_json = ?, failed_attempts = ?, blocked_until = ? WHERE id = ?`, [profile.name, profile.passwordEpoch, JSON.stringify(profile.kdf), JSON.stringify(profile.passwordWrap), JSON.stringify(profile.recoveryWrap), profile.failedAttempts, profile.blockedUntil ?? null, profile.id]);
  if (!result.changes) throw new Error("Profile not found");
}

function insertAudit(database: DatabaseSync, profile: ProfileHeader, dbKey: Buffer, action: string, subjectType: string, subjectId?: string, createdAt = new Date().toISOString()): void {
  const id = randomUUID();
  const payload = encryptPayload({ subjectType, subjectId: subjectId ?? null }, dbKey, profile.id, "audit-event", id);
  run(database, "INSERT INTO audit_events(profile_id, id, action, encrypted_payload_json, created_at) VALUES(?, ?, ?, ?, ?)", [profile.id, id, action, payload, createdAt]);
}

function encryptPayload(value: JsonObject, key: Buffer, profileId: string, type: Parameters<typeof recordAad>[1], entityId: string, revision?: number): string {
  return JSON.stringify(encryptJson(value, key, recordAad(profileId, type, entityId, revision)));
}

function decryptPayload<T>(value: string, key: Buffer, profileId: string, type: Parameters<typeof recordAad>[1], entityId: string, revision?: number): T {
  return decryptJson<T>(JSON.parse(value) as KeyWrap, key, recordAad(profileId, type, entityId, revision));
}

function mapProfile(row: ProfileRow): ProfileHeader {
  return { id: row.id, name: row.name, createdAt: row.created_at, passwordEpoch: Number(row.password_epoch), kdf: JSON.parse(row.kdf_json) as ProfileHeader["kdf"], passwordWrap: JSON.parse(row.password_wrap_json) as KeyWrap, recoveryWrap: JSON.parse(row.recovery_wrap_json) as KeyWrap, failedAttempts: Number(row.failed_attempts), blockedUntil: row.blocked_until ?? undefined };
}

function profileName(identity: JsonObject): string {
  const value = typeof identity.fullName === "string" ? identity.fullName.trim() : "";
  if (!value || value.length > 120) throw new Error("Full name is required and must be at most 120 characters");
  return value;
}

function mapDocument(row: DocumentDatabaseRow, vault: UnlockedVault): DocumentRow {
  const metadata = decryptPayload<{ label?: unknown }>(row.encrypted_metadata_json, vault.dbKey, vault.profile.id, "document-metadata", row.id);
  return { id: row.id, templateId: row.template_id, templateVersion: row.template_version, label: typeof metadata.label === "string" ? metadata.label : "", currentRevision: Number(row.current_revision), archived: Boolean(row.archived), createdAt: row.created_at, updatedAt: row.updated_at };
}

function mapRevision(row: RevisionDatabaseRow, vault: UnlockedVault): DocumentRevision {
  return { documentId: row.document_id, revision: Number(row.revision), parentRevision: row.parent_revision === null ? null : Number(row.parent_revision), data: decryptPayload<JsonObject>(row.encrypted_payload_json, vault.dbKey, vault.profile.id, "document-revision", row.document_id, Number(row.revision)), createdAt: row.created_at };
}

function copyLabel(label: string): string {
  const suffix = " (Copy)";
  return `${label.slice(0, 100 - suffix.length).trimEnd()}${suffix}`;
}

function isUniqueError(error: unknown): boolean { return /unique constraint failed: profiles\.name/i.test((error as Error)?.message ?? ""); }

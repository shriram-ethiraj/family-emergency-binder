import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { basename, join, resolve } from "node:path";
import { chmod, mkdir } from "node:fs/promises";
import type { StorageStatus } from "./types.js";
import { VAULT_FILENAME } from "./branding.js";

export const SCHEMA_VERSION = 3;

const OUTER_SCHEMA = `
  CREATE TABLE IF NOT EXISTS app_meta (
    schema_version INTEGER PRIMARY KEY CHECK (schema_version = ${SCHEMA_VERSION}),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL,
    password_epoch INTEGER NOT NULL,
    kdf_json TEXT NOT NULL,
    password_wrap_json TEXT NOT NULL,
    recovery_wrap_json TEXT NOT NULL,
    failed_attempts INTEGER NOT NULL DEFAULT 0,
    blocked_until TEXT
  );
  CREATE TABLE IF NOT EXISTS profile_revisions (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    encrypted_payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, revision)
  );
  CREATE TABLE IF NOT EXISTS documents (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    template_id TEXT NOT NULL,
    template_version TEXT NOT NULL,
    encrypted_metadata_json TEXT NOT NULL,
    current_revision INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, id)
  );
  CREATE TABLE IF NOT EXISTS document_revisions (
    profile_id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    parent_revision INTEGER,
    encrypted_payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, document_id, revision),
    FOREIGN KEY (profile_id, document_id) REFERENCES documents(profile_id, id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id, document_id, parent_revision)
      REFERENCES document_revisions(profile_id, document_id, revision)
  );
  CREATE TABLE IF NOT EXISTS generation_receipts (
    profile_id TEXT NOT NULL,
    id TEXT NOT NULL,
    document_id TEXT NOT NULL,
    encrypted_payload_json TEXT NOT NULL,
    generated_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, id),
    FOREIGN KEY (profile_id, document_id) REFERENCES documents(profile_id, id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS audit_events (
    profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    action TEXT NOT NULL,
    encrypted_payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (profile_id, id)
  );
  CREATE INDEX IF NOT EXISTS documents_template
    ON documents(profile_id, template_id, archived, updated_at);
  CREATE INDEX IF NOT EXISTS audit_created
    ON audit_events(profile_id, created_at);
`;

type DefensiveDatabase = DatabaseSync & { enableDefensive?: (enabled: boolean) => void };

export class PortableVaultStore {
  readonly directory: string;
  readonly path: string;
  private database?: DatabaseSync;
  private initializing?: Promise<void>;
  private mutationQueue: Promise<void> = Promise.resolve();
  private saveState: StorageStatus["saveState"] = "saved";

  constructor(directory: string, filename = VAULT_FILENAME) {
    this.directory = resolve(directory);
    this.path = join(this.directory, basename(filename));
  }

  async init(): Promise<void> {
    this.initializing ??= this.initialize();
    return this.initializing;
  }

  private async initialize(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    let database: DatabaseSync | undefined;
    try {
      database = new DatabaseSync(this.path, {
        timeout: 5_000,
        enableForeignKeyConstraints: true,
        enableDoubleQuotedStringLiterals: false,
        allowExtension: false
      });
      (database as DefensiveDatabase).enableDefensive?.(true);
      database.exec(`
        PRAGMA foreign_keys = ON;
        PRAGMA trusted_schema = OFF;
        PRAGMA secure_delete = ON;
        PRAGMA journal_mode = TRUNCATE;
        PRAGMA synchronous = FULL;
        PRAGMA locking_mode = EXCLUSIVE;
        BEGIN EXCLUSIVE;
        COMMIT;
      `);

      const hasMetadata = get<{ name: string }>(database,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'");
      if (hasMetadata) {
        const meta = get<{ schema_version: number }>(database, "SELECT schema_version FROM app_meta LIMIT 1");
        if (!meta || Number(meta.schema_version) !== SCHEMA_VERSION) {
          throw new Error(`Legacy vault schema ${meta?.schema_version ?? "unknown"} is not supported; archive this vault and create a new one`);
        }
      } else {
        transaction(database, () => {
          database!.exec(OUTER_SCHEMA);
          run(database!, "INSERT INTO app_meta(schema_version, created_at) VALUES(?, ?)", [SCHEMA_VERSION, new Date().toISOString()]);
        });
      }
      database.exec(OUTER_SCHEMA);

      const integrity = get<Record<string, string>>(database, "PRAGMA quick_check");
      if (!integrity || Object.values(integrity)[0] !== "ok") throw new Error("The vault database failed its integrity check");
      await chmod(this.path, 0o600).catch(() => undefined);
      this.database = database;
    } catch (error) {
      if (database?.isOpen) database.close();
      if (isBusyError(error)) throw new Error("The vault is already open in another application");
      throw new Error(`Could not open ${basename(this.path)}: ${(error as Error).message}`);
    }
  }

  async readOne<T>(sql: string, params: SQLInputValue[] = []): Promise<T | undefined> {
    await this.init();
    return get<T>(this.db(), sql, params);
  }

  async readAll<T>(sql: string, params: SQLInputValue[] = []): Promise<T[]> {
    await this.init();
    return all<T>(this.db(), sql, params);
  }

  async mutate<T>(work: (database: DatabaseSync) => T | Promise<T>): Promise<T> {
    await this.init();
    let resolveResult!: (value: T) => void;
    let rejectResult!: (error: unknown) => void;
    const result = new Promise<T>((resolvePromise, rejectPromise) => {
      resolveResult = resolvePromise;
      rejectResult = rejectPromise;
    });
    this.mutationQueue = this.mutationQueue.catch(() => undefined).then(async () => {
      this.saveState = "saving";
      const database = this.db();
      try {
        database.exec("BEGIN IMMEDIATE");
        const value = await work(database);
        database.exec("COMMIT");
        this.saveState = "saved";
        resolveResult(value);
      } catch (error) {
        if (database.isTransaction) {
          try { database.exec("ROLLBACK"); } catch { /* Preserve the original error. */ }
        }
        this.saveState = "error";
        rejectResult(error);
      }
    });
    return result;
  }

  status(locked: boolean): StorageStatus {
    return { databaseFile: basename(this.path), schemaVersion: SCHEMA_VERSION, saveState: this.saveState, locked };
  }

  async close(): Promise<void> {
    await this.initializing?.catch(() => undefined);
    await this.mutationQueue.catch(() => undefined);
    if (this.database?.isOpen) this.database.close();
    this.database = undefined;
    this.initializing = undefined;
  }

  private db(): DatabaseSync {
    if (!this.database?.isOpen) throw new Error("Vault storage is not initialized");
    return this.database;
  }
}

export function run(database: DatabaseSync, sql: string, params: SQLInputValue[] = []): { changes: number; lastInsertRowid: number | bigint } {
  const result = database.prepare(sql).run(...params);
  return { changes: Number(result.changes), lastInsertRowid: result.lastInsertRowid };
}

export function get<T>(database: DatabaseSync, sql: string, params: SQLInputValue[] = []): T | undefined {
  return database.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(database: DatabaseSync, sql: string, params: SQLInputValue[] = []): T[] {
  return database.prepare(sql).all(...params) as T[];
}

function transaction<T>(database: DatabaseSync, work: () => T): T {
  database.exec("BEGIN IMMEDIATE");
  try {
    const value = work();
    database.exec("COMMIT");
    return value;
  } catch (error) {
    if (database.isTransaction) {
      try { database.exec("ROLLBACK"); } catch { /* Preserve the original error. */ }
    }
    throw error;
  }
}

function isBusyError(error: unknown): boolean {
  const value = error as { code?: string; errcode?: number; message?: string };
  return value?.errcode === 5 || value?.code === "SQLITE_BUSY" || /database is locked/i.test(value?.message ?? "");
}

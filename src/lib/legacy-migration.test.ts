import { Buffer } from "node:buffer";
import { createCipheriv, createDecipheriv, hkdfSync, pbkdf2Sync, randomBytes, scrypt } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { migrateLegacyVault } from "../../scripts/migrate-legacy-vault.mjs";

const NAMESPACE = "family-emergency-binder-creator:v1";
const RECOVERY_INFO = "family-emergency-binder:recovery:v1";
const temporary: string[] = [];

afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

interface KeyWrap {
  nonce: string;
  ciphertext: string;
  tag: string;
}

interface ScryptKdf {
  algorithm: "scrypt";
  salt: string;
  N: number;
  r: number;
  p: number;
  keyLength: number;
}

function b64(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function unb64(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function encryptLegacy(value: Uint8Array, key: Uint8Array, aad: Uint8Array): KeyWrap {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return { nonce: b64(nonce), ciphertext: b64(ciphertext), tag: b64(cipher.getAuthTag()) };
}

function encryptLegacyJson(value: unknown, key: Uint8Array, aad: Uint8Array): string {
  return JSON.stringify(encryptLegacy(Buffer.from(JSON.stringify(value), "utf8"), key, aad));
}

function legacyKeyWrapAad(profileId: string, purpose: "password" | "recovery", kdf?: ScryptKdf): Buffer {
  const binding =
    purpose === "password" && kdf
      ? `${kdf.algorithm}:${kdf.salt}:${kdf.N}:${kdf.r}:${kdf.p}:${kdf.keyLength}`
      : "recovery-hkdf-sha256";
  return Buffer.from(`${NAMESPACE}:${profileId}:${purpose}:${binding}`, "utf8");
}

function legacyRecordAad(profileId: string, type: string, entityId: string, revision?: number): Buffer {
  return Buffer.from(`${NAMESPACE}:record:v1:${profileId}:${type}:${entityId}:${revision ?? "-"}`, "utf8");
}

function scryptKey(password: string, kdf: ScryptKdf): Promise<Buffer> {
  return new Promise((resolvePromise, reject) =>
    scrypt(
      password,
      unb64(kdf.salt),
      kdf.keyLength,
      { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: 256 * 1024 * 1024 },
      (error, value) => (error ? reject(error) : resolvePromise(value)),
    ),
  );
}

function decryptNew(value: { nonce: string; ciphertext: string }, key: Uint8Array, aad: Uint8Array): Buffer {
  const combined = unb64(value.ciphertext);
  const decipher = createDecipheriv("aes-256-gcm", key, unb64(value.nonce), { authTagLength: 16 });
  decipher.setAAD(aad);
  decipher.setAuthTag(combined.subarray(combined.length - 16));
  return Buffer.concat([decipher.update(combined.subarray(0, combined.length - 16)), decipher.final()]);
}

const PROFILE_ID = "6a26ab64-adf3-4ee4-99fd-539b2fbd4392";
const PASSWORD = "fictional legacy password";

async function buildLegacyVault(password: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "febc-legacy-"));
  temporary.push(directory);
  const path = join(directory, "legacy.febvault");
  const database = new DatabaseSync(path);
  database.exec(`
    CREATE TABLE app_meta (schema_version INTEGER PRIMARY KEY CHECK (schema_version = 3), created_at TEXT NOT NULL);
    CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE UNIQUE, created_at TEXT NOT NULL, password_epoch INTEGER NOT NULL, kdf_json TEXT NOT NULL, password_wrap_json TEXT NOT NULL, recovery_wrap_json TEXT NOT NULL, failed_attempts INTEGER NOT NULL DEFAULT 0, blocked_until TEXT);
    CREATE TABLE profile_revisions (profile_id TEXT NOT NULL, revision INTEGER NOT NULL, encrypted_payload_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (profile_id, revision));
    CREATE TABLE documents (profile_id TEXT NOT NULL, id TEXT NOT NULL, template_id TEXT NOT NULL, template_version TEXT NOT NULL, encrypted_metadata_json TEXT NOT NULL, current_revision INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (profile_id, id));
    CREATE TABLE document_revisions (profile_id TEXT NOT NULL, document_id TEXT NOT NULL, revision INTEGER NOT NULL, parent_revision INTEGER, encrypted_payload_json TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (profile_id, document_id, revision));
  `);
  const createdAt = "2026-01-01T00:00:00.000Z";
  const kdf: ScryptKdf = {
    algorithm: "scrypt",
    salt: b64(randomBytes(16)),
    N: 131_072,
    r: 8,
    p: 1,
    keyLength: 32,
  };
  const dbKey = randomBytes(32);
  const wrappingKey = await scryptKey(password, kdf);
  const passwordWrap = encryptLegacy(dbKey, wrappingKey, legacyKeyWrapAad(PROFILE_ID, "password", kdf));
  const recoveryWrap = encryptLegacy(dbKey, randomBytes(32), legacyKeyWrapAad(PROFILE_ID, "recovery"));
  database.prepare("INSERT INTO app_meta(schema_version, created_at) VALUES(3, ?)").run(createdAt);
  database
    .prepare(
      "INSERT INTO profiles(id, name, created_at, password_epoch, kdf_json, password_wrap_json, recovery_wrap_json, failed_attempts, blocked_until) VALUES(?, ?, ?, 1, ?, ?, ?, 0, NULL)",
    )
    .run(
      PROFILE_ID,
      "Shriram Ethirajsampathkumar",
      createdAt,
      JSON.stringify(kdf),
      JSON.stringify(passwordWrap),
      JSON.stringify(recoveryWrap),
    );
  database
    .prepare(
      "INSERT INTO profile_revisions(profile_id, revision, encrypted_payload_json, created_at) VALUES(?, 1, ?, ?)",
    )
    .run(
      PROFILE_ID,
      encryptLegacyJson(
        { fullName: "Shriram Ethirajsampathkumar", privateDetail: "FICTIONAL-PRIVATE" },
        dbKey,
        legacyRecordAad(PROFILE_ID, "profile-revision", PROFILE_ID, 1),
      ),
      createdAt,
    );

  const documents = [
    {
      id: "07b08a79-f5bc-47f9-b8c4-60786f8299b8",
      templateId: "term-insurance",
      templateVersion: "1.2.1",
      label: "Term plan",
      archived: 0,
      revisions: [
        { revision: 1, parent: null, data: { policyNumber: "FICTIONAL-1" } },
        { revision: 2, parent: 1, data: { policyNumber: "FICTIONAL-1", insurer: "Example Life" } },
      ],
    },
    {
      id: "89d32de0-382d-4656-a527-4fc94e5ac0cc",
      templateId: "bank-accounts",
      templateVersion: "1.1.1",
      label: "Bank accounts",
      archived: 1,
      revisions: [{ revision: 1, parent: null, data: { bankName: "Example Bank" } }],
    },
  ];
  for (const document of documents) {
    database
      .prepare(
        "INSERT INTO documents(profile_id, id, template_id, template_version, encrypted_metadata_json, current_revision, archived, created_at, updated_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        PROFILE_ID,
        document.id,
        document.templateId,
        document.templateVersion,
        encryptLegacyJson({ label: document.label }, dbKey, legacyRecordAad(PROFILE_ID, "document-metadata", document.id)),
        document.revisions.length,
        document.archived,
        createdAt,
        createdAt,
      );
    for (const revision of document.revisions) {
      database
        .prepare(
          "INSERT INTO document_revisions(profile_id, document_id, revision, parent_revision, encrypted_payload_json, created_at) VALUES(?, ?, ?, ?, ?, ?)",
        )
        .run(
          PROFILE_ID,
          document.id,
          revision.revision,
          revision.parent,
          encryptLegacyJson(
            revision.data,
            dbKey,
            legacyRecordAad(PROFILE_ID, "document-revision", document.id, revision.revision),
          ),
          createdAt,
        );
    }
  }
  database.close();
  return path;
}

describe("legacy vault migration", () => {
  it(
    "converts a legacy SQLite vault into an equivalent new JSON vault",
    async () => {
      const inputPath = await buildLegacyVault(PASSWORD);
      const outputPath = join(resolve(inputPath, ".."), "migrated.febvault");
      const result = await migrateLegacyVault({
        inputPath,
        outputPath,
        password: PASSWORD,
        definitionsDir: resolve("definitions/templates"),
      });
      expect(result.profileCount).toBe(1);
      expect(result.documentCount).toBe(2);
      expect(result.revisionCount).toBe(3);
      expect(result.templateCount).toBe(2);

      const envelope = JSON.parse(await readFile(outputPath, "utf8")) as {
        magic: string;
        version: number;
        vaultId: string;
        generation: number;
        kdf: { algorithm: string; salt: string; iterations: number; keyLength: number };
        passwordWrap: { nonce: string; ciphertext: string };
        recoveryWrap: { nonce: string; ciphertext: string };
        payload: { nonce: string; ciphertext: string };
      };
      expect(envelope.magic).toBe("FEBVAULT");
      expect(envelope.version).toBe(1);
      expect(envelope.generation).toBe(1);
      expect(envelope.kdf).toMatchObject({ algorithm: "PBKDF2-HMAC-SHA-256", iterations: 600_000, keyLength: 32 });

      const wrappingKey = pbkdf2Sync(PASSWORD, unb64(envelope.kdf.salt), envelope.kdf.iterations, 32, "sha256");
      const passwordAad = Buffer.from(
        `FEBVAULT:1:${envelope.vaultId}:wrap:password:${envelope.kdf.algorithm}:${envelope.kdf.salt}:${envelope.kdf.iterations}:${envelope.kdf.keyLength}`,
        "utf8",
      );
      const dataKey = decryptNew(envelope.passwordWrap, wrappingKey, passwordAad);
      const payloadAad = Buffer.from(`FEBVAULT:1:${envelope.vaultId}:payload:${envelope.generation}`, "utf8");
      const payload = JSON.parse(decryptNew(envelope.payload, dataKey, payloadAad).toString("utf8")) as {
        schemaVersion: number;
        generation: number;
        profiles: Array<{ id: string; name: string; createdAt: string; revisions: Array<{ revision: number; data: Record<string, unknown>; createdAt: string }> }>;
        documents: Array<{ id: string; profileId: string; templateId: string; templateVersion: string; label: string; currentRevision: number; archived: boolean; revisions: Array<{ documentId: string; revision: number; parentRevision: number | null; data: Record<string, unknown> }> }>;
        templates: Record<string, { templateId: string; version: string; nodes: unknown[]; schema: { required: string[] } }>;
      };

      expect(payload.schemaVersion).toBe(1);
      expect(payload.profiles).toHaveLength(1);
      expect(payload.profiles[0]).toMatchObject({ id: PROFILE_ID, name: "Shriram Ethirajsampathkumar" });
      expect(payload.profiles[0].revisions[0].data.privateDetail).toBe("FICTIONAL-PRIVATE");

      const termPlan = payload.documents.find((document) => document.id === "07b08a79-f5bc-47f9-b8c4-60786f8299b8");
      expect(termPlan).toMatchObject({
        profileId: PROFILE_ID,
        templateId: "term-insurance",
        templateVersion: "1.2.1",
        label: "Term plan",
        currentRevision: 2,
        archived: false,
      });
      expect(termPlan?.revisions).toHaveLength(2);
      expect(termPlan?.revisions[1]).toMatchObject({ revision: 2, parentRevision: 1 });
      expect(termPlan?.revisions[1].data.insurer).toBe("Example Life");

      const archived = payload.documents.find((document) => document.id === "89d32de0-382d-4656-a527-4fc94e5ac0cc");
      expect(archived).toMatchObject({ templateId: "bank-accounts", archived: true, currentRevision: 1 });

      expect(payload.templates["term-insurance@1.2.1"]).toMatchObject({ templateId: "term-insurance", version: "1.2.1" });
      expect(Array.isArray(payload.templates["term-insurance@1.2.1"].nodes)).toBe(true);
      expect(payload.templates["bank-accounts@1.1.1"]).toMatchObject({ templateId: "bank-accounts", version: "1.1.1" });

      const recoveryRaw = Buffer.from(result.recoveryKey.replaceAll("-", ""), "hex");
      const recoveryMaterial = Buffer.from(
        hkdfSync("sha256", recoveryRaw, Buffer.from(envelope.vaultId, "utf8"), Buffer.from(RECOVERY_INFO, "utf8"), 32),
      );
      const recoveryAad = Buffer.from(`FEBVAULT:1:${envelope.vaultId}:wrap:recovery:HKDF-SHA-256`, "utf8");
      expect(decryptNew(envelope.recoveryWrap, recoveryMaterial, recoveryAad).equals(dataKey)).toBe(true);
    },
    30_000,
  );

  it(
    "rejects an incorrect password",
    async () => {
      const inputPath = await buildLegacyVault(PASSWORD);
      await expect(
        migrateLegacyVault({
          inputPath,
          outputPath: join(resolve(inputPath, ".."), "migrated.febvault"),
          password: "wrong fictional password",
          definitionsDir: resolve("definitions/templates"),
        }),
      ).rejects.toThrow(/Invalid vault password or damaged vault/);
    },
    30_000,
  );
});

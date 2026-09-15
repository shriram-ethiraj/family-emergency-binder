#!/usr/bin/env node
// Converts a legacy SQLite `.febvault` (schema v3, scrypt + AES-256-GCM per
// record) into the browser-only JSON `VaultEnvelopeV1` used by
// `src/lib/vault.worker.ts`.
//
// Usage:
//   node scripts/migrate-legacy-vault.mjs [--in <legacy>] [--out <json>]
//     [--definitions definitions/templates] [--recovery-out <path>]
// The vault password is read from a masked terminal prompt or the
// FEB_VAULT_PASSWORD environment variable. The same password protects the
// migrated vault. A fresh recovery key is generated and printed.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  hkdfSync,
  pbkdf2Sync,
  randomBytes,
  randomUUID,
  scrypt,
} from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const MAGIC = "FEBVAULT";
const LEGACY_NAMESPACE = "family-emergency-binder-creator:v1";
const NEW_PBKDF2_ITERATIONS = 600_000;
const NEW_RECOVERY_INFO = "family-emergency-binder:recovery:v1";
const MAX_VAULT_BYTES = 64 * 1024 * 1024;
const MAX_TEMPLATE_BYTES = 4 * 1024 * 1024;
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;
const SQLITE_HEADER = Buffer.from("SQLite format 3\0", "latin1");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function b64(value) {
  return Buffer.from(value).toString("base64url");
}

function unb64(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encoded value");
  return Buffer.from(value, "base64url");
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

// --- Legacy format (apps/backend/src/crypto.ts) ---------------------------------

function legacyKeyWrapAad(profileId, purpose, kdf) {
  const binding =
    purpose === "password" && kdf
      ? `${kdf.algorithm}:${kdf.salt}:${kdf.N}:${kdf.r}:${kdf.p}:${kdf.keyLength}`
      : "recovery-hkdf-sha256";
  return Buffer.from(`${LEGACY_NAMESPACE}:${profileId}:${purpose}:${binding}`, "utf8");
}

function legacyRecordAad(profileId, entityType, entityId, revision) {
  return Buffer.from(
    `${LEGACY_NAMESPACE}:record:v1:${profileId}:${entityType}:${entityId}:${revision ?? "-"}`,
    "utf8",
  );
}

function decryptLegacyBytes(envelope, key, aad) {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, unb64(envelope.nonce), { authTagLength: 16 });
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(unb64(envelope.tag));
    return Buffer.concat([decipher.update(unb64(envelope.ciphertext)), decipher.final()]);
  } catch {
    throw new Error("Encrypted data failed authentication");
  }
}

function decryptLegacyJson(envelope, key, aad) {
  const plaintext = decryptLegacyBytes(envelope, key, aad);
  try {
    return parseJson(plaintext.toString("utf8"), "Legacy encrypted payload");
  } finally {
    plaintext.fill(0);
  }
}

function scryptPasswordKey(password, kdf) {
  if (!kdf || kdf.algorithm !== "scrypt") throw new Error("Unsupported legacy password KDF");
  return new Promise((resolvePromise, reject) => {
    scrypt(
      password,
      unb64(kdf.salt),
      kdf.keyLength,
      { N: kdf.N, r: kdf.r, p: kdf.p, maxmem: SCRYPT_MAX_MEMORY },
      (error, value) => (error ? reject(error) : resolvePromise(value)),
    );
  });
}

// --- New browser format (src/lib/vault.worker.ts) -------------------------------

function encryptNewBytes(value, key, aad) {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return { nonce: b64(nonce), ciphertext: b64(Buffer.concat([ciphertext, cipher.getAuthTag()])) };
}

function newWrapAad(vaultId, purpose, kdf) {
  const binding =
    purpose === "password"
      ? `${kdf.algorithm}:${kdf.salt}:${kdf.iterations}:${kdf.keyLength}`
      : "HKDF-SHA-256";
  return Buffer.from(`${MAGIC}:1:${vaultId}:wrap:${purpose}:${binding}`, "utf8");
}

function newPayloadAad(vaultId, generation) {
  return Buffer.from(`${MAGIC}:1:${vaultId}:payload:${generation}`, "utf8");
}

function newPasswordKey(password, kdf) {
  return pbkdf2Sync(password, unb64(kdf.salt), kdf.iterations, kdf.keyLength, "sha256");
}

function newRecoveryKey(raw, vaultId) {
  return Buffer.from(
    hkdfSync("sha256", raw, Buffer.from(vaultId, "utf8"), Buffer.from(NEW_RECOVERY_INFO, "utf8"), 32),
  );
}

function formatRecovery(raw) {
  return raw.toString("hex").toUpperCase().match(/.{1,8}/g).join("-");
}

// --- Template compilation (mirrors src/lib/template-catalog.ts compile) ----------

function inferredInput(field) {
  if (field.type === "boolean") return "boolean";
  if (field.enum) return "enum";
  if (field.format === "date") return "date";
  if (field.type === "number") return "number";
  return "text";
}

function thumbnail(name, description) {
  const escape = (value) =>
    value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#f4f0e8"/><rect x="175" y="70" width="850" height="1060" rx="8" fill="white" stroke="#d2c9b8" stroke-width="3"/><text x="600" y="175" text-anchor="middle" font-family="sans-serif" font-size="38" font-weight="700" fill="#24342d">${escape(name.toUpperCase())}</text><text x="600" y="225" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#607168">${escape(description.slice(0, 72))}</text>${[300,390,480,570,660,750].map((y) => `<rect x="245" y="${y}" width="710" height="52" rx="4" fill="#f7f7f5" stroke="#d8ddd9"/><rect x="245" y="${y}" width="235" height="52" fill="#e9edea"/>`).join("")}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function compileTemplate(source) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.templateId) || !/^\d+\.\d+\.\d+$/.test(source.version)) {
    throw new Error("Invalid bundled template identity");
  }
  if (!isPlainObject(source.fields) || !Array.isArray(source.layout)) {
    throw new Error(`Template ${source.templateId} is missing fields or layout`);
  }
  const properties = {};
  const required = [];
  const syntheticData = {};
  for (const [id, field] of Object.entries(source.fields)) {
    properties[id] = {
      type: field.type,
      enum: field.enum,
      minLength: field.minLength,
      maxLength: field.maxLength,
      minimum: field.minimum,
      maximum: field.maximum,
      format: field.format,
    };
    syntheticData[id] = field.example;
    if (field.required) required.push(id);
  }
  const sections = [];
  const nodes = [];
  const seen = new Set();
  for (const raw of source.layout) {
    const type = String(raw.type);
    if (type === "section") {
      const fields = (raw.fields ?? []).map((path) => {
        const field = source.fields[path];
        if (!field || seen.has(path)) throw new Error(`Invalid field reference ${path}`);
        seen.add(path);
        return { path, label: field.label, input: field.input ?? inferredInput(field), placeholder: field.placeholder };
      });
      sections.push({ title: String(raw.title), fields });
      nodes.push({
        type,
        title: String(raw.title),
        rows: fields.map((field) => ({
          label: field.label ?? field.path,
          value: `document.${field.path}`,
          formatter: source.fields[field.path].formatter,
        })),
      });
    } else if (type === "pairedTable") {
      const rows = raw.rows ?? [];
      const fields = rows
        .flatMap((row) => [row.left, row.right])
        .map((path) => {
          const field = source.fields[path];
          if (!field || seen.has(path)) throw new Error(`Invalid field reference ${path}`);
          seen.add(path);
          return { path, label: field.label, input: field.input ?? inferredInput(field), placeholder: field.placeholder };
        });
      sections.push({ title: String(raw.title), fields });
      nodes.push({ type, title: String(raw.title), columns: raw.columns, rows });
    } else if (type === "title" || type === "subtitle") {
      nodes.push({ type, text: String(raw.text) });
    } else if (type === "text") {
      nodes.push({
        type,
        text: raw.text,
        value: raw.value,
        formatter: raw.formatter,
        style: raw.style,
        when: raw.when,
      });
    } else if (type === "spacer") {
      nodes.push({ type, height: Number(raw.height) });
    } else if (type === "pageBreak") {
      nodes.push({ type });
    } else {
      throw new Error(`Unsupported template node ${type}`);
    }
  }
  if (seen.size !== Object.keys(source.fields).length) {
    throw new Error(`Template ${source.templateId} has unbound fields`);
  }
  const hash = createHash("sha256").update(JSON.stringify(source)).digest("hex");
  return {
    templateId: source.templateId,
    version: source.version,
    name: source.name,
    description: source.description,
    thumbnailUrl: thumbnail(source.name, source.description),
    page: { size: source.page?.size ?? "A4", marginsMm: source.page?.marginsMm ?? [14, 11, 14, 11] },
    schema: { required, properties },
    ui: { sections },
    hash,
    syntheticData,
    nodes,
    ...(source.footer ? { footer: source.footer } : {}),
  };
}

async function loadTemplates(definitionsDir, templateKeys) {
  const templates = {};
  for (const key of templateKeys) {
    const separator = key.lastIndexOf("@");
    const templateId = key.slice(0, separator);
    const version = key.slice(separator + 1);
    const definitionPath = join(definitionsDir, templateId, `v${version}.json`);
    let text;
    try {
      text = await readFile(definitionPath, "utf8");
    } catch {
      throw new Error(`Missing template definition for ${key} at ${definitionPath}`);
    }
    if (Buffer.byteLength(text, "utf8") > MAX_TEMPLATE_BYTES) throw new Error(`Template ${key} is too large`);
    const source = parseJson(text, `Template ${key}`);
    if (source.templateId !== templateId || source.version !== version) {
      throw new Error(`Template definition ${key} has a mismatched identity`);
    }
    templates[key] = compileTemplate(source);
  }
  return templates;
}

// --- Legacy database reads ------------------------------------------------------

async function unlockLegacyProfile(database, row, password) {
  const profileId = row.id;
  const kdf = parseJson(row.kdf_json, "Legacy profile KDF");
  const wrappingKey = await scryptPasswordKey(password, kdf);
  let dbKey;
  try {
    dbKey = decryptLegacyBytes(
      parseJson(row.password_wrap_json, "Legacy password wrap"),
      wrappingKey,
      legacyKeyWrapAad(profileId, "password", kdf),
    );
  } catch {
    throw new Error("Invalid vault password or damaged vault");
  } finally {
    wrappingKey.fill(0);
  }
  const latest = database
    .prepare(
      "SELECT revision, encrypted_payload_json FROM profile_revisions WHERE profile_id = ? ORDER BY revision DESC LIMIT 1",
    )
    .get(profileId);
  if (!latest) {
    dbKey.fill(0);
    throw new Error("Legacy profile details are missing");
  }
  try {
    decryptLegacyJson(
      parseJson(latest.encrypted_payload_json, "Legacy profile revision"),
      dbKey,
      legacyRecordAad(profileId, "profile-revision", profileId, Number(latest.revision)),
    );
  } catch {
    dbKey.fill(0);
    throw new Error("Invalid vault password or damaged vault");
  }
  return { row, profileId, dbKey };
}

function readLegacyProfileRecord(database, unlocked) {
  const rows = database
    .prepare(
      "SELECT revision, encrypted_payload_json, created_at FROM profile_revisions WHERE profile_id = ? ORDER BY revision",
    )
    .all(unlocked.profileId);
  if (!rows.length) throw new Error("Legacy profile details are missing");
  const revisions = rows.map((row, index) => {
    const revision = Number(row.revision);
    if (revision !== index + 1) throw new Error("Legacy profile revisions are not contiguous");
    const data = decryptLegacyJson(
      parseJson(row.encrypted_payload_json, "Legacy profile revision"),
      unlocked.dbKey,
      legacyRecordAad(unlocked.profileId, "profile-revision", unlocked.profileId, revision),
    );
    if (!isPlainObject(data)) throw new Error("Legacy profile revision is invalid");
    return { revision, data, createdAt: row.created_at };
  });
  const latest = revisions.at(-1).data;
  const name =
    typeof latest.fullName === "string" && latest.fullName.trim() ? latest.fullName.trim() : String(unlocked.row.name);
  if (!name || name.length > 120) throw new Error("Legacy profile name is invalid");
  return { id: unlocked.profileId, name, createdAt: unlocked.row.created_at, revisions };
}

function readLegacyDocuments(database, unlocked) {
  const rows = database
    .prepare("SELECT * FROM documents WHERE profile_id = ? ORDER BY created_at")
    .all(unlocked.profileId);
  return rows.map((row) => {
    const documentId = row.id;
    const metadata = decryptLegacyJson(
      parseJson(row.encrypted_metadata_json, "Legacy document metadata"),
      unlocked.dbKey,
      legacyRecordAad(unlocked.profileId, "document-metadata", documentId),
    );
    const label = typeof metadata?.label === "string" ? metadata.label.trim() : "";
    if (!label || label.length > 100) throw new Error(`Legacy document ${documentId} has an invalid label`);
    const revisionRows = database
      .prepare(
        "SELECT * FROM document_revisions WHERE profile_id = ? AND document_id = ? ORDER BY revision",
      )
      .all(unlocked.profileId, documentId);
    if (!revisionRows.length) throw new Error(`Legacy document ${documentId} has no revisions`);
    const revisions = revisionRows.map((entry, index) => {
      const revision = Number(entry.revision);
      const parentRevision = entry.parent_revision === null ? null : Number(entry.parent_revision);
      if (revision !== index + 1 || parentRevision !== (index ? index : null)) {
        throw new Error(`Legacy document ${documentId} revisions are not contiguous`);
      }
      const data = decryptLegacyJson(
        parseJson(entry.encrypted_payload_json, "Legacy document revision"),
        unlocked.dbKey,
        legacyRecordAad(unlocked.profileId, "document-revision", documentId, revision),
      );
      if (!isPlainObject(data)) throw new Error(`Legacy document ${documentId} revision is invalid`);
      return {
        documentId,
        revision,
        parentRevision,
        data,
        createdAt: entry.created_at,
      };
    });
    const currentRevision = Number(row.current_revision);
    if (currentRevision !== revisions.length) {
      throw new Error(`Legacy document ${documentId} current revision is invalid`);
    }
    return {
      id: documentId,
      profileId: unlocked.profileId,
      templateId: row.template_id,
      templateVersion: row.template_version,
      label,
      currentRevision,
      archived: Boolean(row.archived),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      revisions,
    };
  });
}

// --- Migration core -------------------------------------------------------------

export async function migrateLegacyVault({ inputPath, outputPath, password, definitionsDir, recoveryOutPath }) {
  if (typeof password !== "string" || password.length === 0) throw new Error("A vault password is required");
  if (!inputPath) throw new Error("A legacy vault path is required");
  if (!outputPath) throw new Error("An output vault path is required");
  const absoluteInput = resolve(inputPath);
  const header = Buffer.alloc(16);
  const file = await readFile(absoluteInput);
  if (file.byteLength === 0) throw new Error("The legacy vault file is empty");
  if (file.byteLength > MAX_VAULT_BYTES) throw new Error("The legacy vault exceeds the 64 MiB limit");
  file.copy(header, 0, 0, 16);
  if (!header.equals(SQLITE_HEADER)) {
    throw new Error("Input is not a legacy SQLite .febvault; it may already be in the new JSON format");
  }
  file.fill(0);

  const database = new DatabaseSync(absoluteInput, { readOnly: true });
  const profiles = [];
  const documents = [];
  const templateKeys = new Set();
  try {
    const meta = database.prepare("SELECT schema_version FROM app_meta").get();
    if (!meta || Number(meta.schema_version) !== 3) {
      throw new Error(`Unsupported legacy schema version: ${meta?.schema_version ?? "unknown"}`);
    }
    const profileRows = database
      .prepare("SELECT * FROM profiles ORDER BY name COLLATE NOCASE, created_at")
      .all();
    if (!profileRows.length) throw new Error("The legacy vault has no profiles");
    for (const row of profileRows) {
      const unlocked = await unlockLegacyProfile(database, row, password);
      try {
        profiles.push(readLegacyProfileRecord(database, unlocked));
        for (const record of readLegacyDocuments(database, unlocked)) {
          documents.push(record);
          templateKeys.add(`${record.templateId}@${record.templateVersion}`);
        }
      } finally {
        unlocked.dbKey.fill(0);
      }
    }
  } finally {
    database.close();
  }

  const templates = await loadTemplates(definitionsDir ?? join("definitions", "templates"), templateKeys);

  const createdAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    generation: 1,
    createdAt,
    updatedAt: createdAt,
    profiles,
    documents,
    templates,
  };
  const vaultId = randomUUID();
  const dataKey = randomBytes(32);
  const kdf = {
    algorithm: "PBKDF2-HMAC-SHA-256",
    salt: b64(randomBytes(16)),
    iterations: NEW_PBKDF2_ITERATIONS,
    keyLength: 32,
  };
  const passwordWrappingKey = newPasswordKey(password, kdf);
  const recoveryRaw = randomBytes(32);
  const recoveryWrappingKey = newRecoveryKey(recoveryRaw, vaultId);
  const envelope = {
    magic: MAGIC,
    version: 1,
    vaultId,
    generation: 1,
    kdf,
    passwordWrap: encryptNewBytes(dataKey, passwordWrappingKey, newWrapAad(vaultId, "password", kdf)),
    recoveryWrap: encryptNewBytes(dataKey, recoveryWrappingKey, newWrapAad(vaultId, "recovery", kdf)),
    payload: encryptNewBytes(
      Buffer.from(JSON.stringify(payload), "utf8"),
      dataKey,
      newPayloadAad(vaultId, 1),
    ),
  };
  dataKey.fill(0);
  passwordWrappingKey.fill(0);
  recoveryWrappingKey.fill(0);

  const serialized = JSON.stringify(envelope);
  if (Buffer.byteLength(serialized, "utf8") > MAX_VAULT_BYTES) {
    throw new Error("The migrated vault exceeds the 64 MiB limit");
  }
  const absoluteOutput = resolve(outputPath);
  await writeFile(absoluteOutput, serialized, { mode: 0o600 });

  const recoveryKey = formatRecovery(recoveryRaw);
  recoveryRaw.fill(0);
  if (recoveryOutPath) await writeFile(resolve(recoveryOutPath), `${recoveryKey}\n`, { mode: 0o600 });

  return {
    inputPath: absoluteInput,
    outputPath: absoluteOutput,
    recoveryKey,
    recoveryOutPath: recoveryOutPath ? resolve(recoveryOutPath) : undefined,
    profileCount: profiles.length,
    documentCount: documents.length,
    revisionCount: documents.reduce((total, document) => total + document.revisions.length, 0),
    templateCount: Object.keys(templates).length,
  };
}

// --- CLI ------------------------------------------------------------------------

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseArgs(argv) {
  const options = {
    inputPath: "family-emergency-binder.febvault",
    outputPath: "family-emergency-binder-new.febvault",
    definitionsDir: join("definitions", "templates"),
    recoveryOutPath: undefined,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--in" || arg === "-i") options.inputPath = requireValue(argv, index++, arg);
    else if (arg === "--out" || arg === "-o") options.outputPath = requireValue(argv, index++, arg);
    else if (arg === "--definitions") options.definitionsDir = requireValue(argv, index++, arg);
    else if (arg === "--recovery-out") options.recoveryOutPath = requireValue(argv, index++, arg);
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

function printUsage() {
  process.stdout.write(
    [
      "Convert a legacy SQLite .febvault into the browser-only JSON vault format.",
      "",
      "Usage: node scripts/migrate-legacy-vault.mjs [options]",
      "",
      "Options:",
      "  -i, --in <path>            Legacy SQLite vault (default family-emergency-binder.febvault)",
      "  -o, --out <path>           Output JSON vault (default family-emergency-binder-new.febvault)",
      "      --definitions <dir>    Template definitions root (default definitions/templates)",
      "      --recovery-out <path>  Also write the new recovery key to this file",
      "  -h, --help                 Show this help",
      "",
      "The password is read from a masked prompt or the FEB_VAULT_PASSWORD env var.",
      "",
    ].join("\n"),
  );
}

function promptPassword(label) {
  return new Promise((resolvePromise, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error("No terminal available. Set FEB_VAULT_PASSWORD to run non-interactively."));
      return;
    }
    let value = "";
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off("data", onData);
    };
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === "\u0003") {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Cancelled"));
          return;
        }
        if (char === "\r" || char === "\n") {
          cleanup();
          process.stdout.write("\n");
          resolvePromise(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
          continue;
        }
        value += char;
      }
    };
    process.stdout.write(label);
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    stdin.on("data", onData);
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  const password = process.env.FEB_VAULT_PASSWORD ?? (await promptPassword("Legacy vault password: "));
  const result = await migrateLegacyVault({
    inputPath: options.inputPath,
    outputPath: options.outputPath,
    password,
    definitionsDir: options.definitionsDir,
    recoveryOutPath: options.recoveryOutPath,
  });
  process.stdout.write(
    [
      "Migration complete.",
      `  Output:    ${result.outputPath}`,
      `  Profiles:  ${result.profileCount}`,
      `  Documents: ${result.documentCount}`,
      `  Revisions: ${result.revisionCount}`,
      `  Templates: ${result.templateCount}`,
      "",
      "Recovery key for the new vault (store it separately from every vault copy):",
      `  ${result.recoveryKey}`,
      result.recoveryOutPath ? `\nRecovery key also written to ${result.recoveryOutPath}` : "",
      "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`Migration failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

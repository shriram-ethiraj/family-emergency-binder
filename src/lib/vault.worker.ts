/// <reference lib="webworker" />
import { assertPassword } from "@/lib/password-policy";
import type { DocumentDetail, DocumentSummary, JsonObject, PdfTemplate, SessionInfo, VaultStatus } from "@/lib/domain";
import type { CipherEnvelope, DocumentRecord, ProfileRecord, VaultEnvelopeV1, VaultPayloadV1, WorkerCommand, WorkerResult } from "@/lib/vault-protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_VAULT_BYTES = 64 * 1024 * 1024;
const PBKDF2_ITERATIONS = 600_000;
const MAGIC = "FEBVAULT";

let handle: FileSystemFileHandle | null = null;
let fileName: string | null = null;
let selectedEnvelope: VaultEnvelopeV1 | null = null;
let currentHash: string | null = null;
let dataKey: CryptoKey | null = null;
let state: VaultPayloadV1 | null = null;
let activeProfileId: string | null = null;
let saveState: VaultStatus["saveState"] = "saved";
let saveError: string | undefined;
let persistence: VaultStatus["persistence"] = "direct";
let queue = Promise.resolve();

scope.onmessage = (event: MessageEvent<WorkerCommand>) => {
  const command = event.data;
  queue = queue.then(() => execute(command), () => execute(command));
};

async function execute(command: WorkerCommand): Promise<void> {
  try {
    let value: unknown;
    if (command.type === "create") value = await createVault(command.handle, command.handle.name, command.password);
    else if (command.type === "createPortable") value = await createVault(null, command.fileName, command.password);
    else if (command.type === "select") value = await selectVault(command.handle);
    else if (command.type === "selectBytes") value = await selectVaultBytes(command.bytes, command.fileName);
    else if (command.type === "unlock") value = await unlockVault(command.password);
    else if (command.type === "recover") value = await recoverVault(command.recoveryKey, command.newPassword);
    else if (command.type === "call") value = await call(command.path, command.method, command.body);
    else if (command.type === "saveCopy") value = await saveCopy(command.handle);
    else if (command.type === "export") value = exportVault();
    else if (command.type === "markExported") value = markExported(command.generation);
    else value = lockVault();
    send({ type: "result", id: command.id, value });
  } catch (error) {
    send({ type: "error", id: command.id, message: error instanceof Error ? error.message : "The operation could not be completed" });
  }
}

async function createVault(nextHandle: FileSystemFileHandle | null, nextFileName: string, password: string) {
  assertPassword(password);
  const vaultId = crypto.randomUUID();
  const rawDataKey = randomBytes(32);
  const recoveryRaw = randomBytes(32);
  const kdf: VaultEnvelopeV1["kdf"] = { algorithm: "PBKDF2-HMAC-SHA-256", salt: b64(randomBytes(16)), iterations: PBKDF2_ITERATIONS, keyLength: 32 };
  const wrappingKey = await passwordKey(password, kdf);
  const recoveryWrappingKey = await recoveryKey(recoveryRaw, vaultId);
  const importedDataKey = await importAes(rawDataKey, false);
  const now = new Date().toISOString();
  const payload: VaultPayloadV1 = { schemaVersion: 1, generation: 1, createdAt: now, updatedAt: now, profiles: [], documents: [], templates: {} };
  const envelope: VaultEnvelopeV1 = {
    magic: MAGIC, version: 1, vaultId, generation: 1, kdf,
    passwordWrap: await encrypt(rawDataKey, wrappingKey, wrapAad(vaultId, "password", kdf)),
    recoveryWrap: await encrypt(rawDataKey, recoveryWrappingKey, wrapAad(vaultId, "recovery")),
    payload: await encrypt(encoder.encode(JSON.stringify(payload)), importedDataKey, payloadAad(vaultId, 1)),
  };
  rawDataKey.fill(0);
  if (nextHandle) await writeFile(nextHandle, envelope);
  handle = nextHandle; fileName = nextFileName; persistence = nextHandle ? "direct" : "download"; selectedEnvelope = envelope; currentHash = await hashBytes(encoder.encode(JSON.stringify(envelope))); dataKey = importedDataKey; state = payload; activeProfileId = null; saveState = nextHandle ? "saved" : "dirty";
  emitStatus();
  return { recoveryKey: formatRecovery(recoveryRaw), profiles: [] };
}

async function selectVault(nextHandle: FileSystemFileHandle) {
  const { envelope, bytes, hash } = await readEnvelope(nextHandle);
  handle = nextHandle; fileName = nextHandle.name; persistence = "direct"; selectedEnvelope = envelope; currentHash = hash; dataKey = null; state = null; activeProfileId = null; saveError = undefined; saveState = "saved";
  emitStatus();
  bytes.fill(0);
  return { fileName };
}

async function selectVaultBytes(input: Uint8Array, nextFileName: string) {
  const bytes = new Uint8Array(input);
  const { envelope, hash } = await parseEnvelopeBytes(bytes);
  handle = null; fileName = nextFileName; persistence = "download"; selectedEnvelope = envelope; currentHash = hash; dataKey = null; state = null; activeProfileId = null; saveError = undefined; saveState = "saved";
  emitStatus(); bytes.fill(0);
  return { fileName };
}

async function unlockVault(password: string) {
  if (!selectedEnvelope) throw new Error("Choose a vault first");
  assertPasswordShape(password);
  try {
    const wrappingKey = await passwordKey(password, selectedEnvelope.kdf);
    const raw = await decrypt(selectedEnvelope.passwordWrap, wrappingKey, wrapAad(selectedEnvelope.vaultId, "password", selectedEnvelope.kdf));
    const imported = await importAes(raw, false); raw.fill(0);
    const plaintext = await decrypt(selectedEnvelope.payload, imported, payloadAad(selectedEnvelope.vaultId, selectedEnvelope.generation));
    const payload = parsePayload(plaintext, selectedEnvelope.generation); plaintext.fill(0);
    dataKey = imported; state = payload; activeProfileId = null;
    emitStatus();
    return { profiles: profileSummaries(payload) };
  } catch {
    throw new Error("Invalid vault password or damaged vault");
  }
}

async function recoverVault(recoveryText: string, newPassword: string) {
  if (!selectedEnvelope) throw new Error("Choose a vault first");
  assertPassword(newPassword);
  const recoveryRaw = parseRecovery(recoveryText);
  let imported: CryptoKey;
  let payload: VaultPayloadV1;
  let candidate: VaultEnvelopeV1;
  try {
    const recoveryWrappingKey = await recoveryKey(recoveryRaw, selectedEnvelope.vaultId);
    const raw = await decrypt(selectedEnvelope.recoveryWrap, recoveryWrappingKey, wrapAad(selectedEnvelope.vaultId, "recovery"));
    imported = await importAes(raw, false);
    const plaintext = await decrypt(selectedEnvelope.payload, imported, payloadAad(selectedEnvelope.vaultId, selectedEnvelope.generation));
    payload = parsePayload(plaintext, selectedEnvelope.generation); plaintext.fill(0);
    const kdf: VaultEnvelopeV1["kdf"] = { algorithm: "PBKDF2-HMAC-SHA-256", salt: b64(randomBytes(16)), iterations: PBKDF2_ITERATIONS, keyLength: 32 };
    const nextPasswordKey = await passwordKey(newPassword, kdf);
    candidate = { ...selectedEnvelope, kdf, passwordWrap: await encrypt(raw, nextPasswordKey, wrapAad(selectedEnvelope.vaultId, "password", kdf)) };
    raw.fill(0);
  } catch {
    throw new Error("Invalid recovery key or damaged vault");
  } finally { recoveryRaw.fill(0); }
  dataKey = imported; state = payload;
  try { await persistEnvelopeOnly(candidate); }
  catch (error) { dataKey = null; state = null; throw error; }
  return { profiles: profileSummaries(payload) };
}

async function call(path: string, method: string, body: unknown): Promise<unknown> {
  requireUnlocked();
  const url = new URL(path, "https://local.invalid");
  const parts = url.pathname.split("/").filter(Boolean);
  if (url.pathname === "/profiles" && method === "GET") return { profiles: profileSummaries(state!) };
  if (url.pathname === "/profiles" && method === "POST") {
    const data = body as { identity?: JsonObject };
    const fullName = profileName(data.identity);
    return mutate(async (draft) => {
      if (draft.profiles.some((item) => item.name.toLocaleLowerCase() === fullName.toLocaleLowerCase())) throw new Error("A profile with this name already exists");
      const now = new Date().toISOString(); const id = crypto.randomUUID();
      draft.profiles.push({ id, name: fullName, createdAt: now, revisions: [{ revision: 1, data: data.identity!, createdAt: now }] });
      activeProfileId = id;
      return sessionFor(draft.profiles.at(-1)!);
    });
  }
  if (url.pathname === "/session" && method === "GET") return { session: activeProfile() ? sessionFor(activeProfile()!) : null };
  if (url.pathname === "/session/select" && method === "POST") {
    const id = String((body as { profileId?: string }).profileId ?? "");
    const profile = state!.profiles.find((item) => item.id === id); if (!profile) throw new Error("Profile not found");
    activeProfileId = id; return { session: sessionFor(profile) };
  }
  if (url.pathname === "/profile" && method === "GET") { const profile = requireProfile(); return profile.revisions.at(-1); }
  if (url.pathname === "/profile" && method === "PUT") {
    const input = body as { expectedRevision: number; data: JsonObject }; const profile = requireProfile();
    return mutate((draft) => {
      const target = draft.profiles.find((item) => item.id === profile.id)!; const latest = target.revisions.at(-1)!;
      if (latest.revision !== input.expectedRevision) throw new Error("STALE_REVISION");
      const name = profileName(input.data); if (draft.profiles.some((item) => item.id !== target.id && item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error("A profile with this name already exists");
      const result = { revision: latest.revision + 1, data: input.data, createdAt: new Date().toISOString() };
      target.name = name; target.revisions.push(result); return result;
    });
  }
  if (url.pathname === "/profile" && method === "DELETE") {
    const input = body as { password?: string }; const profile = requireProfile();
    if (!(await verifyPassword(input.password ?? ""))) throw new Error("Vault password is incorrect");
    return mutate((draft) => { draft.documents = draft.documents.filter((item) => item.profileId !== profile.id); draft.profiles = draft.profiles.filter((item) => item.id !== profile.id); activeProfileId = null; return { deleted: true }; });
  }
  if (url.pathname === "/vault/change-password" && method === "POST") return changePassword(body as { currentPassword: string; newPassword: string });
  if (url.pathname === "/vault/rotate-recovery" && method === "POST") return rotateRecovery(body as { password: string });
  if (url.pathname === "/documents" && method === "GET") return { documents: state!.documents.filter((item) => item.profileId === requireProfile().id).map(summary) };
  if (parts[0] === "template-snapshot" && parts.length === 3 && method === "GET") { const template = state!.templates[`${parts[1]}@${parts[2]}`]; if (!template) throw new Error("Template version not found"); return template; }
  if (url.pathname === "/documents" && method === "POST") {
    const input = body as { template: PdfTemplate; label: string; data: JsonObject }; const profile = requireProfile();
    if (!input.label?.trim() || input.label.trim().length > 100) throw new Error("Document label is required and must be at most 100 characters");
    return mutate((draft) => {
      const id = crypto.randomUUID(); const now = new Date().toISOString(); const key = `${input.template.templateId}@${input.template.version}`;
      draft.templates[key] ??= input.template;
      const record: DocumentRecord = { id, profileId: profile.id, templateId: input.template.templateId, templateVersion: input.template.version, label: input.label.trim(), currentRevision: 1, archived: false, createdAt: now, updatedAt: now, revisions: [{ documentId: id, revision: 1, parentRevision: null, data: input.data, createdAt: now }] };
      draft.documents.push(record); return detail(record);
    });
  }
  if (parts[0] === "documents" && parts.length >= 2) return documentCall(parts, method, body);
  throw new Error("Unsupported vault operation");
}

async function documentCall(parts: string[], method: string, body: unknown) {
  const id = parts[1]; const found = state!.documents.find((item) => item.id === id && item.profileId === requireProfile().id);
  if (!found) throw new Error("Document not found");
  if (parts[2] === "revisions" && method === "GET") return { revisions: [...found.revisions].reverse() };
  if (parts[2] === "clone" && method === "POST") return mutate((draft) => {
    const source = draft.documents.find((item) => item.id === id)!; const cloneId = crypto.randomUUID(); const now = new Date().toISOString(); const current = source.revisions.find((item) => item.revision === source.currentRevision)!;
    const cloned: DocumentRecord = { ...structuredClone(source), id: cloneId, label: copyLabel(source.label), currentRevision: 1, createdAt: now, updatedAt: now, revisions: [{ documentId: cloneId, revision: 1, parentRevision: null, data: structuredClone(current.data), createdAt: now }] };
    draft.documents.push(cloned); return detail(cloned);
  });
  if (parts[2] === "archive" && method === "POST") return mutate((draft) => { const target = draft.documents.find((item) => item.id === id)!; target.archived = Boolean((body as { archived?: boolean }).archived); target.updatedAt = new Date().toISOString(); return { updated: true }; });
  if (parts.length === 2 && method === "DELETE") return mutate((draft) => { const target = draft.documents.find((item) => item.id === id)!; if ((body as { confirmation?: string }).confirmation !== target.label) throw new Error("Confirmation label does not match"); draft.documents = draft.documents.filter((item) => item.id !== id); return undefined; });
  if (parts.length === 2 && method === "PUT") {
    const input = body as { expectedRevision: number; label: string; data: JsonObject };
    if (!input.label?.trim() || input.label.trim().length > 100) throw new Error("Document label is required and must be at most 100 characters");
    return mutate((draft) => { const target = draft.documents.find((item) => item.id === id)!; if (target.currentRevision !== input.expectedRevision) throw new Error("STALE_REVISION"); const next = target.currentRevision + 1; const now = new Date().toISOString(); target.label = input.label.trim(); target.currentRevision = next; target.updatedAt = now; target.revisions.push({ documentId: id, revision: next, parentRevision: input.expectedRevision, data: input.data, createdAt: now }); return detail(target); });
  }
  if (parts.length === 2 && method === "GET") {
    const requested = Number(new URLSearchParams((body as { search?: string })?.search).get("revision"));
    return detail(found, Number.isInteger(requested) && requested > 0 ? requested : undefined);
  }
  throw new Error("Unsupported document operation");
}

async function mutate<T>(operation: (draft: VaultPayloadV1) => T | Promise<T>): Promise<T> {
  requireUnlocked();
  const draft = structuredClone(state!); const result = await operation(draft);
  draft.generation = selectedEnvelope!.generation + 1; draft.updatedAt = new Date().toISOString();
  saveState = "saving"; saveError = undefined; emitStatus();
  try {
    if (persistence === "direct") await assertUnchanged();
    const envelope: VaultEnvelopeV1 = { ...selectedEnvelope!, generation: draft.generation, payload: await encrypt(encoder.encode(JSON.stringify(draft)), dataKey!, payloadAad(selectedEnvelope!.vaultId, draft.generation)) };
    if (persistence === "direct") await writeFile(handle!, envelope);
    selectedEnvelope = envelope; state = draft; currentHash = await hashBytes(encoder.encode(JSON.stringify(envelope))); saveState = persistence === "direct" ? "saved" : "dirty"; emitStatus();
    return result;
  } catch (error) {
    saveState = "error"; saveError = error instanceof Error ? error.message : "Vault save failed"; emitStatus(); throw error;
  }
}

async function persistEnvelopeOnly(candidate: VaultEnvelopeV1 = selectedEnvelope!) {
  requireUnlocked();
  const draft = structuredClone(state!); draft.generation = selectedEnvelope!.generation + 1; draft.updatedAt = new Date().toISOString();
  saveState = "saving"; saveError = undefined; emitStatus();
  try {
    if (persistence === "direct") await assertUnchanged();
    const next = { ...candidate, generation: draft.generation, payload: await encrypt(encoder.encode(JSON.stringify(draft)), dataKey!, payloadAad(candidate.vaultId, draft.generation)) };
    if (persistence === "direct") await writeFile(handle!, next);
    selectedEnvelope = next; state = draft; currentHash = await hashBytes(encoder.encode(JSON.stringify(next))); saveState = persistence === "direct" ? "saved" : "dirty"; emitStatus();
  } catch (error) {
    saveState = "error"; saveError = error instanceof Error ? error.message : "Vault save failed"; emitStatus(); throw error;
  }
}

async function changePassword(input: { currentPassword: string; newPassword: string }) {
  assertPassword(input.newPassword); if (!selectedEnvelope || !(await verifyPassword(input.currentPassword))) throw new Error("Current vault password is incorrect");
  const oldKey = await passwordKey(input.currentPassword, selectedEnvelope.kdf); const raw = await decrypt(selectedEnvelope.passwordWrap, oldKey, wrapAad(selectedEnvelope.vaultId, "password", selectedEnvelope.kdf));
  const kdf: VaultEnvelopeV1["kdf"] = { algorithm: "PBKDF2-HMAC-SHA-256", salt: b64(randomBytes(16)), iterations: PBKDF2_ITERATIONS, keyLength: 32 }; const nextKey = await passwordKey(input.newPassword, kdf);
  const candidate = { ...selectedEnvelope, kdf, passwordWrap: await encrypt(raw, nextKey, wrapAad(selectedEnvelope.vaultId, "password", kdf)) }; raw.fill(0); await persistEnvelopeOnly(candidate); return { changed: true };
}

async function rotateRecovery(input: { password: string }) {
  if (!selectedEnvelope || !(await verifyPassword(input.password))) throw new Error("Vault password is incorrect");
  const passwordWrappingKey = await passwordKey(input.password, selectedEnvelope.kdf); const raw = await decrypt(selectedEnvelope.passwordWrap, passwordWrappingKey, wrapAad(selectedEnvelope.vaultId, "password", selectedEnvelope.kdf));
  const recoveryRaw = randomBytes(32); const wrappingKey = await recoveryKey(recoveryRaw, selectedEnvelope.vaultId); const candidate = { ...selectedEnvelope, recoveryWrap: await encrypt(raw, wrappingKey, wrapAad(selectedEnvelope.vaultId, "recovery")) }; raw.fill(0); const recoveryKeyText = formatRecovery(recoveryRaw); await persistEnvelopeOnly(candidate); return { recoveryKey: recoveryKeyText };
}

async function verifyPassword(password: string): Promise<boolean> { try { if (!selectedEnvelope) return false; const key = await passwordKey(password, selectedEnvelope.kdf); const raw = await decrypt(selectedEnvelope.passwordWrap, key, wrapAad(selectedEnvelope.vaultId, "password", selectedEnvelope.kdf)); raw.fill(0); return true; } catch { return false; } }
async function saveCopy(copyHandle: FileSystemFileHandle) { if (!selectedEnvelope) throw new Error("No vault is open"); await writeFile(copyHandle, selectedEnvelope); return { fileName: copyHandle.name }; }
function exportVault() { if (!selectedEnvelope) throw new Error("No vault is open"); return { fileName, generation: selectedEnvelope.generation, bytes: encoder.encode(JSON.stringify(selectedEnvelope)) }; }
function markExported(generation: number) { if (persistence !== "download" || !selectedEnvelope || generation !== selectedEnvelope.generation) throw new Error("The vault changed while the download was being prepared"); saveState = "saved"; saveError = undefined; emitStatus(); return { saved: true }; }
function lockVault() { dataKey = null; state = null; activeProfileId = null; handle = null; fileName = null; selectedEnvelope = null; currentHash = null; saveState = "saved"; saveError = undefined; persistence = "direct"; emitStatus(); return { locked: true }; }

async function assertUnchanged() { if (!handle || !currentHash) throw new Error("No vault file is selected"); const current = await handle.getFile(); const bytes = new Uint8Array(await current.arrayBuffer()); const digest = await hashBytes(bytes); bytes.fill(0); if (digest !== currentHash) throw new Error("The vault changed outside this window. Reopen it before saving."); }
async function writeFile(target: FileSystemFileHandle, envelope: VaultEnvelopeV1) { const bytes = encoder.encode(JSON.stringify(envelope)); if (bytes.byteLength > MAX_VAULT_BYTES) throw new Error("Vault exceeds the 64 MiB size limit"); const writable = await target.createWritable({ keepExistingData: false }); try { await writable.write(bytes); await writable.close(); } catch (error) { await writable.abort().catch(() => undefined); throw error; } finally { bytes.fill(0); } }
async function readEnvelope(target: FileSystemFileHandle) { const file = await target.getFile(); if (!file.size || file.size > MAX_VAULT_BYTES) throw new Error("Vault file is empty or too large"); const bytes = new Uint8Array(await file.arrayBuffer()); const parsed = await parseEnvelopeBytes(bytes); return { ...parsed, bytes }; }
async function parseEnvelopeBytes(bytes: Uint8Array) { if (!bytes.byteLength || bytes.byteLength > MAX_VAULT_BYTES) throw new Error("Vault file is empty or too large"); let value: unknown; try { value = JSON.parse(decoder.decode(bytes)); } catch { throw new Error("This is not a valid .febvault file"); } const envelope = validateEnvelope(value); return { envelope, hash: await hashBytes(bytes) }; }

function validateEnvelope(value: unknown): VaultEnvelopeV1 { if (!value || typeof value !== "object") throw new Error("This is not a valid .febvault file"); const item = value as VaultEnvelopeV1; if (item.magic !== MAGIC || item.version !== 1 || typeof item.vaultId !== "string" || !Number.isSafeInteger(item.generation) || item.generation < 1) throw new Error("Unsupported vault format"); validateKdf(item.kdf); for (const cipher of [item.passwordWrap, item.recoveryWrap, item.payload]) { if (!cipher || typeof cipher.nonce !== "string" || typeof cipher.ciphertext !== "string" || unb64(cipher.nonce).length !== 12 || !unb64(cipher.ciphertext).length) throw new Error("Vault encryption metadata is invalid"); } return item; }
function validateKdf(kdf: VaultEnvelopeV1["kdf"]) { if (!kdf || kdf.algorithm !== "PBKDF2-HMAC-SHA-256" || kdf.keyLength !== 32 || !Number.isInteger(kdf.iterations) || kdf.iterations < PBKDF2_ITERATIONS || kdf.iterations > 5_000_000 || unb64(kdf.salt).length !== 16) throw new Error("Vault password parameters are unsafe or unsupported"); }
function parsePayload(bytes: Uint8Array, generation: number): VaultPayloadV1 {
  const parsed = JSON.parse(decoder.decode(bytes)) as VaultPayloadV1;
  if (!parsed || parsed.schemaVersion !== 1 || parsed.generation !== generation || !validDate(parsed.createdAt) || !validDate(parsed.updatedAt) || !Array.isArray(parsed.profiles) || !Array.isArray(parsed.documents) || !plainObject(parsed.templates)) throw new Error("Vault payload is invalid");
  const profileIds = new Set<string>();
  for (const profile of parsed.profiles) {
    if (!boundedString(profile?.id, 1, 128) || profileIds.has(profile.id) || !boundedString(profile.name, 1, 120) || !validDate(profile.createdAt) || !Array.isArray(profile.revisions) || !profile.revisions.length) throw new Error("Vault payload is invalid");
    profileIds.add(profile.id);
    if (!profile.revisions.every((revision, index) => revision?.revision === index + 1 && plainObject(revision.data) && validDate(revision.createdAt))) throw new Error("Vault payload is invalid");
  }
  const documentIds = new Set<string>();
  for (const document of parsed.documents) {
    if (!boundedString(document?.id, 1, 128) || documentIds.has(document.id) || !profileIds.has(document.profileId) || !boundedString(document.templateId, 1, 200) || !boundedString(document.templateVersion, 1, 50) || !boundedString(document.label, 1, 100) || !Number.isSafeInteger(document.currentRevision) || document.currentRevision < 1 || typeof document.archived !== "boolean" || !validDate(document.createdAt) || !validDate(document.updatedAt) || !Array.isArray(document.revisions) || !document.revisions.length) throw new Error("Vault payload is invalid");
    documentIds.add(document.id);
    if (!document.revisions.every((revision, index) => revision?.documentId === document.id && revision.revision === index + 1 && revision.parentRevision === (index ? index : null) && plainObject(revision.data) && validDate(revision.createdAt)) || document.currentRevision !== document.revisions.length) throw new Error("Vault payload is invalid");
    if (!plainObject(parsed.templates[`${document.templateId}@${document.templateVersion}`])) throw new Error("Vault payload is invalid");
  }
  return parsed;
}
function plainObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function boundedString(value: unknown, minimum: number, maximum: number): value is string { return typeof value === "string" && value.length >= minimum && value.length <= maximum; }
function validDate(value: unknown): value is string { return typeof value === "string" && value.length <= 40 && Number.isFinite(Date.parse(value)); }

async function passwordKey(password: string, kdf: VaultEnvelopeV1["kdf"]) { validateKdf(kdf); const material = await crypto.subtle.importKey("raw", owned(encoder.encode(password)), "PBKDF2", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: owned(unb64(kdf.salt)), iterations: kdf.iterations }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
async function recoveryKey(raw: Uint8Array, vaultId: string) { const material = await crypto.subtle.importKey("raw", owned(raw), "HKDF", false, ["deriveKey"]); return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: owned(encoder.encode(vaultId)), info: owned(encoder.encode("family-emergency-binder:recovery:v1")) }, material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); }
async function importAes(raw: Uint8Array, extractable: boolean) { return crypto.subtle.importKey("raw", owned(raw), { name: "AES-GCM" }, extractable, ["encrypt", "decrypt"]); }
async function encrypt(value: Uint8Array, key: CryptoKey, aad: Uint8Array): Promise<CipherEnvelope> { const nonce = randomBytes(12); const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: owned(nonce), additionalData: owned(aad), tagLength: 128 }, key, owned(value)); return { nonce: b64(nonce), ciphertext: b64(new Uint8Array(ciphertext)) }; }
async function decrypt(value: CipherEnvelope, key: CryptoKey, aad: Uint8Array): Promise<Uint8Array> { const result = await crypto.subtle.decrypt({ name: "AES-GCM", iv: owned(unb64(value.nonce)), additionalData: owned(aad), tagLength: 128 }, key, owned(unb64(value.ciphertext))); return new Uint8Array(result); }
function wrapAad(vaultId: string, purpose: "password" | "recovery", kdf?: VaultEnvelopeV1["kdf"]) { return encoder.encode(`${MAGIC}:1:${vaultId}:wrap:${purpose}:${purpose === "password" ? `${kdf!.algorithm}:${kdf!.salt}:${kdf!.iterations}:${kdf!.keyLength}` : "HKDF-SHA-256"}`); }
function payloadAad(vaultId: string, generation: number) { return encoder.encode(`${MAGIC}:1:${vaultId}:payload:${generation}`); }
function randomBytes(length: number) { return crypto.getRandomValues(new Uint8Array(length)); }
function b64(value: Uint8Array) { let binary = ""; for (const byte of value) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, ""); }
function unb64(value: string) { if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encoded value"); const standard = value.replaceAll("-", "+").replaceAll("_", "/"); const binary = atob(standard.padEnd(Math.ceil(standard.length / 4) * 4, "=")); return Uint8Array.from(binary, (char) => char.charCodeAt(0)); }
async function hashBytes(value: Uint8Array) { const hash = await crypto.subtle.digest("SHA-256", owned(value)); return b64(new Uint8Array(hash)); }
function owned(value: Uint8Array): Uint8Array<ArrayBuffer> { return new Uint8Array(value); }
function formatRecovery(value: Uint8Array) { const hex = [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase(); value.fill(0); return hex.match(/.{1,8}/g)!.join("-"); }
function parseRecovery(value: string) { const hex = value.replaceAll("-", "").trim(); if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error("Invalid recovery key"); return Uint8Array.from(hex.match(/.{2}/g)!, (pair) => Number.parseInt(pair, 16)); }
function assertPasswordShape(value: string) { if (![...value].length || [...value].length > 128) throw new Error("Invalid vault password or damaged vault"); }
function profileName(identity?: JsonObject) { const name = String(identity?.fullName ?? "").trim(); if (!name || name.length > 120) throw new Error("Profile name is required and must be at most 120 characters"); return name; }
function profileSummaries(payload: VaultPayloadV1) { return payload.profiles.map((item) => ({ id: item.id, name: item.name, createdAt: item.createdAt, passwordEpoch: 1 })); }
function activeProfile() { return state?.profiles.find((item) => item.id === activeProfileId); }
function requireProfile() { const profile = activeProfile(); if (!profile) throw new Error("Choose a profile first"); return profile; }
function requireUnlocked() { if (!selectedEnvelope || !dataKey || !state) throw new Error("Vault is locked"); }
function sessionFor(profile: ProfileRecord): SessionInfo { const latest = profile.revisions.at(-1)!; return { profileId: profile.id, profileName: profile.name, passwordEpoch: 1, profileRevision: latest.revision, profile: latest.data as { fullName?: string }, csrfToken: "", expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() }; }
function summary(item: DocumentRecord): DocumentSummary { return { id: item.id, templateId: item.templateId, templateVersion: item.templateVersion, label: item.label, currentRevision: item.currentRevision, archived: item.archived, createdAt: item.createdAt, updatedAt: item.updatedAt }; }
function detail(item: DocumentRecord, revision?: number): DocumentDetail { const selected = item.revisions.find((entry) => entry.revision === (revision ?? item.currentRevision)); if (!selected) throw new Error("Document revision not found"); return { ...summary(item), revision: selected }; }
function copyLabel(label: string) { const suffix = " (Copy)"; return label.length + suffix.length <= 100 ? `${label}${suffix}` : `${label.slice(0, 100 - suffix.length)}${suffix}`; }
function emitStatus() { send({ type: "status", status: { selected: Boolean(selectedEnvelope), unlocked: Boolean(state && dataKey), fileName, saveState, persistence, ...(saveError ? { error: saveError } : {}) } }); }
function send(message: WorkerResult) { scope.postMessage(message); }

export {};

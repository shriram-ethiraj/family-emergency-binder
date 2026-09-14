import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { JsonObject, KeyWrap, ProfileHeader } from "./types.js";
import { CRYPTO_NAMESPACE, RECOVERY_DERIVATION_LABEL } from "./branding.js";

export const PASSWORD_MIN_LENGTH = 4;
export const KDF_DEFAULTS = { N: 131_072, r: 8, p: 1, keyLength: 32 } as const;
const SCRYPT_MAX_MEMORY = 256 * 1024 * 1024;

function b64(data: Buffer): string {
  return data.toString("base64url");
}

function unb64(data: string): Buffer {
  return Buffer.from(data, "base64url");
}

export function assertPassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters`);
  }
  if (Buffer.byteLength(password, "utf8") > 120) {
    throw new Error("Password is too long");
  }
}

export async function passwordKey(password: string, kdf: ProfileHeader["kdf"]): Promise<Buffer> {
  if (kdf.algorithm !== "scrypt") throw new Error("Unsupported password KDF");
  const derived = await new Promise<Buffer>((resolve, reject) => {
    scrypt(password, unb64(kdf.salt), kdf.keyLength, {
      N: kdf.N,
      r: kdf.r,
      p: kdf.p,
      maxmem: SCRYPT_MAX_MEMORY
    }, (error, value) => error ? reject(error) : resolve(value));
  });
  return derived;
}

export function recoveryKeyMaterial(recoveryKey: string, profileId: string): Buffer {
  const normalized = recoveryKey.replaceAll("-", "").trim();
  if (!/^[a-f0-9]{64}$/i.test(normalized)) throw new Error("Invalid recovery key");
  const raw = Buffer.from(normalized, "hex");
  return Buffer.from(hkdfSync("sha256", raw, Buffer.from(profileId), Buffer.from(RECOVERY_DERIVATION_LABEL), 32));
}

export function wrapKey(key: Buffer, wrappingKey: Buffer, aad?: Buffer): KeyWrap {
  return encryptBytes(key, wrappingKey, aad);
}

export function encryptBytes(value: Uint8Array, key: Buffer, aad?: Buffer): KeyWrap {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()]);
  return { nonce: b64(nonce), ciphertext: b64(ciphertext), tag: b64(cipher.getAuthTag()) };
}

export function unwrapKey(wrap: KeyWrap, wrappingKey: Buffer, aad?: Buffer): Buffer {
  try {
    return decryptBytes(wrap, wrappingKey, aad);
  } catch {
    throw new Error("Invalid password or recovery key");
  }
}

export function decryptBytes(envelope: KeyWrap, key: Buffer, aad?: Buffer): Buffer {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, unb64(envelope.nonce), { authTagLength: 16 });
    if (aad) decipher.setAAD(aad);
    decipher.setAuthTag(unb64(envelope.tag));
    return Buffer.concat([decipher.update(unb64(envelope.ciphertext)), decipher.final()]);
  } catch {
    throw new Error("Encrypted data failed authentication");
  }
}

export function makeRecoveryKey(): { display: string; raw: string } {
  const raw = randomBytes(32).toString("hex").toUpperCase();
  return { raw, display: raw.match(/.{1,8}/g)?.join("-") ?? raw };
}

export function newKdf(): ProfileHeader["kdf"] {
  return { algorithm: "scrypt", salt: b64(randomBytes(16)), ...KDF_DEFAULTS };
}

export function keyWrapAad(profileId: string, purpose: "password" | "recovery", kdf?: ProfileHeader["kdf"]): Buffer {
  const kdfBinding = purpose === "password" && kdf
    ? `${kdf.algorithm}:${kdf.salt}:${kdf.N}:${kdf.r}:${kdf.p}:${kdf.keyLength}`
    : "recovery-hkdf-sha256";
  return Buffer.from(`${CRYPTO_NAMESPACE}:${profileId}:${purpose}:${kdfBinding}`, "utf8");
}

export type EncryptedEntityType =
  | "profile-revision"
  | "document-metadata"
  | "document-revision"
  | "generation-receipt"
  | "audit-event";

export function recordAad(profileId: string, entityType: EncryptedEntityType, entityId: string, revision?: number): Buffer {
  return Buffer.from(`${CRYPTO_NAMESPACE}:record:v1:${profileId}:${entityType}:${entityId}:${revision ?? "-"}`, "utf8");
}

export function encryptJson(value: JsonObject, key: Buffer, aad: Buffer): KeyWrap {
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  try {
    return encryptBytes(plaintext, key, aad);
  } finally {
    plaintext.fill(0);
  }
}

export function decryptJson<T>(envelope: KeyWrap, key: Buffer, aad: Buffer): T {
  const plaintext = decryptBytes(envelope, key, aad);
  try {
    return JSON.parse(plaintext.toString("utf8")) as T;
  } finally {
    plaintext.fill(0);
  }
}

export function sameKey(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

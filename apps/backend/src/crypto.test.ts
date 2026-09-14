import { describe, expect, it } from "vitest";
import { assertPassword, decryptJson, encryptJson, keyWrapAad, makeRecoveryKey, newKdf, passwordKey, recordAad, recoveryKeyMaterial, sameKey, unwrapKey, wrapKey } from "./crypto.js";
import { randomBytes } from "node:crypto";

describe("profile key envelopes", () => {
  it("binds envelopes to the Family Emergency Binder Creator namespace", () => {
    const kdf = { algorithm: "scrypt" as const, salt: "c2FsdA", N: 131_072, r: 8, p: 1, keyLength: 32 };
    expect(keyWrapAad("profile-a", "password", kdf).toString()).toBe("family-emergency-binder-creator:v1:profile-a:password:scrypt:c2FsdA:131072:8:1:32");
  });

  it("accepts four-character numeric passwords and rejects shorter passwords", () => {
    expect(() => assertPassword("1234")).not.toThrow();
    expect(() => assertPassword("123")).toThrow("at least 4 characters");
  });

  it("unwraps the same database key with the password and printable recovery key", async () => {
    const profileId = "95bcf317-e735-4ef0-9e87-3bd4f66b8508";
    const databaseKey = randomBytes(32);
    const kdf = newKdf();
    const passwordWrappingKey = await passwordKey("a long family password", kdf);
    const passwordAad = keyWrapAad(profileId, "password", kdf);
    const passwordEnvelope = wrapKey(databaseKey, passwordWrappingKey, passwordAad);
    expect(sameKey(unwrapKey(passwordEnvelope, passwordWrappingKey, passwordAad), databaseKey)).toBe(true);

    const recovery = makeRecoveryKey();
    expect(recovery.display.split("-")).toHaveLength(8);
    const recoveryWrappingKey = recoveryKeyMaterial(recovery.display, profileId);
    const recoveryAad = keyWrapAad(profileId, "recovery");
    const recoveryEnvelope = wrapKey(databaseKey, recoveryWrappingKey, recoveryAad);
    expect(sameKey(unwrapKey(recoveryEnvelope, recoveryKeyMaterial(recovery.raw, profileId), recoveryAad), databaseKey)).toBe(true);
  });

  it("rejects an incorrect password-derived key", async () => {
    const kdf = newKdf();
    const correct = await passwordKey("correct password 123", kdf);
    const wrong = await passwordKey("incorrect password", kdf);
    const envelope = wrapKey(randomBytes(32), correct);
    expect(() => unwrapKey(envelope, wrong)).toThrow("Invalid password or recovery key");
  });

  it("rejects an envelope moved to a different profile", async () => {
    const kdf = newKdf();
    const key = await passwordKey("correct password 123", kdf);
    const envelope = wrapKey(randomBytes(32), key, keyWrapAad("profile-a", "password", kdf));
    expect(() => unwrapKey(envelope, key, keyWrapAad("profile-b", "password", kdf))).toThrow("Invalid password or recovery key");
  });

  it("rejects encrypted records moved across profiles, entity types, entity IDs, or revisions", () => {
    const key = randomBytes(32);
    const envelope = encryptJson({ privateValue: "Fictional secret" }, key,
      recordAad("profile-a", "document-revision", "document-a", 2));
    expect(decryptJson(envelope, key, recordAad("profile-a", "document-revision", "document-a", 2))).toEqual({ privateValue: "Fictional secret" });
    expect(() => decryptJson(envelope, key, recordAad("profile-b", "document-revision", "document-a", 2))).toThrow("failed authentication");
    expect(() => decryptJson(envelope, key, recordAad("profile-a", "profile-revision", "document-a", 2))).toThrow("failed authentication");
    expect(() => decryptJson(envelope, key, recordAad("profile-a", "document-revision", "document-b", 2))).toThrow("failed authentication");
    expect(() => decryptJson(envelope, key, recordAad("profile-a", "document-revision", "document-a", 3))).toThrow("failed authentication");
  });
});

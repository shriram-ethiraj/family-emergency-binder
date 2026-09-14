import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { VaultService } from "./vault.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("single SQLite encrypted vault", () => {
  it("stores one native SQLite file and supports password rewrap, recovery, and restart", async () => {
    const dir = await makeDirectory("febc-vault-");
    const service = new VaultService(dir);
    await service.init();
    const profileName = "Test Profile";
    const privateDetail = "FICTIONAL-PRIVATE-PROFILE-77192";
    const password = "initial password 123";
    const created = await service.createProfile(password, { fullName: profileName, privateDetail });
    const raw = await readFile(service.store.path);
    expect(raw.subarray(0, 16).toString()).toBe("SQLite format 3\u0000");
    expect(raw.includes(Buffer.from(profileName))).toBe(true);
    expect(raw.includes(Buffer.from(privateDetail))).toBe(false);
    expect(raw.includes(Buffer.from(password))).toBe(false);
    await service.closeVault(created.vault);

    await expect(service.unlock(created.profile.id, "wrong password 123")).rejects.toThrow("Invalid profile password");
    const unlocked = await service.unlock(created.profile.id, password);
    await service.changePassword(unlocked, password, "replacement password 456");
    await service.closeVault(unlocked);
    await expect(service.unlock(created.profile.id, password)).rejects.toThrow("Invalid profile password");
    const changed = await service.unlock(created.profile.id, "replacement password 456");
    expect((await service.profileRevision(changed)).data.privateDetail).toBe(privateDetail);
    await service.closeVault(changed);

    const recovered = await service.recover(created.profile.id, created.recoveryKey, "recovered password 789");
    expect((await service.profileRevision(recovered)).data.fullName).toBe(profileName);
    await service.closeVault(recovered);
    await service.close();

    const restarted = new VaultService(dir);
    await restarted.init();
    const afterRestart = await restarted.unlock(created.profile.id, "recovered password 789");
    expect((await restarted.profileRevision(afterRestart)).data.privateDetail).toBe(privateDetail);
    await restarted.closeVault(afterRestart);
    await restarted.close();
  }, 40_000);

  it("uses SQLite process locks and releases them when the connection closes", async () => {
    const dir = await makeDirectory("febc-lock-");
    const first = new VaultService(dir);
    const second = new VaultService(dir);
    await first.init();
    await expect(second.init()).rejects.toThrow("already open in another application");
    await first.close();

    const restarted = new VaultService(dir);
    await restarted.init();
    await restarted.close();
  }, 15_000);

  it.runIf(process.platform !== "win32")("rolls back an interrupted transaction after a process is killed", async () => {
    const dir = await makeDirectory("febc-crash-");
    const service = new VaultService(dir);
    await service.init();
    await service.store.mutate((database) => database.exec("CREATE TABLE crash_probe(value TEXT NOT NULL)"));
    await service.close();

    const childProgram = `
      const { DatabaseSync } = require("node:sqlite");
      const database = new DatabaseSync(process.argv[1]);
      database.exec("PRAGMA journal_mode=TRUNCATE; PRAGMA synchronous=FULL; BEGIN IMMEDIATE");
      database.prepare("INSERT INTO crash_probe(value) VALUES(?)").run("must roll back");
      process.stdout.write("ready\\n");
      setInterval(() => {}, 1000);
    `;
    const child = spawn(process.execPath, ["-e", childProgram, service.store.path], { stdio: ["ignore", "pipe", "inherit"] });
    await once(child.stdout!, "data");
    child.kill("SIGKILL");
    await once(child, "exit");

    const restarted = new VaultService(dir);
    await restarted.init();
    const count = await restarted.store.readOne<{ count: number }>("SELECT count(*) AS count FROM crash_probe");
    expect(Number(count?.count)).toBe(0);
    await restarted.close();
  }, 15_000);

  it("rejects an old schema without migrating or overwriting it", async () => {
    const dir = await makeDirectory("febc-legacy-");
    const path = join(dir, "family-emergency-binder.febcvault");
    const database = new DatabaseSync(path);
    database.exec("CREATE TABLE app_meta(schema_version INTEGER PRIMARY KEY, created_at TEXT NOT NULL); INSERT INTO app_meta VALUES(2, '2000-01-01T00:00:00.000Z')");
    database.close();
    const before = await readFile(path);

    const service = new VaultService(dir);
    await expect(service.init()).rejects.toThrow("Legacy vault schema 2 is not supported");
    const after = await readFile(path);
    expect(after.includes(Buffer.from("2000-01-01T00:00:00.000Z"))).toBe(true);
    expect(after.length).toBe(before.length);
  });

  it("stores template structure in columns and all user document fields in one authenticated blob", async () => {
    const dir = await makeDirectory("febc-record-");
    const service = new VaultService(dir);
    await service.init();
    const created = await service.createProfile("record password 123", { fullName: "Record Profile", privateNote: "FICTIONAL PROFILE SECRET" });
    const privateValue = "FICTIONAL-DOCUMENT-SECRET-88991";
    const document = await service.createDocument(created.vault, "fictional-template", "7.4.1", "Private document label", {
      policyNumber: privateValue,
      nested: { beneficiary: "Fictional Beneficiary" }
    });
    await service.reviseDocument(created.vault, document.id, 1, "Revised private label", { policyNumber: `${privateValue}-REV2` });
    expect((await service.getDocument(created.vault, document.id)).revision.data.policyNumber).toBe(`${privateValue}-REV2`);
    await service.closeVault(created.vault);
    await service.close();

    const raw = await readFile(service.store.path);
    expect(raw.includes(Buffer.from("fictional-template"))).toBe(true);
    expect(raw.includes(Buffer.from("7.4.1"))).toBe(true);
    expect(raw.includes(Buffer.from(privateValue))).toBe(false);
    expect(raw.includes(Buffer.from("Private document label"))).toBe(false);
    expect(raw.includes(Buffer.from("Fictional Beneficiary"))).toBe(false);

    const database = new DatabaseSync(service.store.path, { readOnly: true });
    const columns = database.prepare("PRAGMA table_info(document_revisions)").all() as Array<{ name: string }>;
    expect(columns.map(({ name }) => name)).toEqual([
      "profile_id", "document_id", "revision", "parent_revision", "encrypted_payload_json", "created_at"
    ]);
    const rows = database.prepare("SELECT revision, encrypted_payload_json FROM document_revisions ORDER BY revision").all() as Array<{ revision: number; encrypted_payload_json: string }>;
    expect(rows).toHaveLength(2);
    expect(Object.keys(JSON.parse(rows[0]!.encrypted_payload_json)).sort()).toEqual(["ciphertext", "nonce", "tag"]);
    expect(database.prepare("PRAGMA quick_check").get()).toMatchObject({ quick_check: "ok" });
    database.close();
  }, 20_000);

  it("rejects ciphertext tampering and substitution between revisions", async () => {
    const dir = await makeDirectory("febc-tamper-");
    const service = new VaultService(dir);
    await service.init();
    const created = await service.createProfile("tamper test password", { fullName: "Private Person" });
    const document = await service.createDocument(created.vault, "fictional-template", "1.0.0", "Private label", { value: "Revision one" });
    await service.reviseDocument(created.vault, document.id, 1, "Private label", { value: "Revision two" });
    await service.closeVault(created.vault);
    await service.close();

    const database = new DatabaseSync(service.store.path);
    const first = database.prepare("SELECT encrypted_payload_json FROM document_revisions WHERE profile_id = ? AND document_id = ? AND revision = 1").get(created.profile.id, document.id) as { encrypted_payload_json: string };
    database.prepare("UPDATE document_revisions SET encrypted_payload_json = ? WHERE profile_id = ? AND document_id = ? AND revision = 2").run(first.encrypted_payload_json, created.profile.id, document.id);
    database.close();

    const reopened = new VaultService(dir);
    await reopened.init();
    const unlocked = await reopened.unlock(created.profile.id, "tamper test password");
    await expect(reopened.getDocument(unlocked, document.id, 2)).rejects.toThrow("failed authentication");
    await reopened.closeVault(unlocked);
    await reopened.close();
  }, 20_000);
});

async function makeDirectory(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporary.push(directory);
  return directory;
}

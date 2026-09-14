import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { buildApp } from "./app.js";

const temporary: string[] = [];
afterEach(async () => Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("localhost application security", () => {
  it("initializes portable storage and rejects invalid host and origin headers", async () => {
    const root = await mkdtemp(join(tmpdir(), "febc-app-")); temporary.push(root);
    const app = await buildApp({ dataDir: join(root, "vault"), outputDir: join(root, "output"), definitionsDir: resolve("../../definitions"), templateCacheDir: join(root, "template-cache") });
    try {
      const health = await app.inject({ method: "GET", url: "/api/health", headers: { host: "127.0.0.1:4173" } });
      expect(health.statusCode).toBe(200);
      expect(health.headers["content-security-policy"]).not.toContain("unsafe-inline");

      const storage = await app.inject({ method: "GET", url: "/api/storage", headers: { host: "127.0.0.1:4173" } });
      expect(storage.json()).toMatchObject({ databaseFile: "family-emergency-binder.febcvault", schemaVersion: 3, saveState: "saved", locked: true });
      expect((await readFile(join(root, "vault", "family-emergency-binder.febcvault"))).subarray(0, 16).toString()).toBe("SQLite format 3\u0000");

      const invalidHost = await app.inject({ method: "GET", url: "/api/health", headers: { host: "evil.example:4173" } });
      expect(invalidHost.statusCode).toBe(403);
      const invalidOrigin = await app.inject({ method: "GET", url: "/api/health", headers: { host: "127.0.0.1:4173", origin: "http://localhost:9999" } });
      expect(invalidOrigin.statusCode).toBe(403);
      const frontendRoute = await app.inject({ method: "GET", url: "/", headers: { host: "127.0.0.1:4173" } });
      expect(frontendRoute.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it("creates a profile using its name as the profile picker label", async () => {
    const root = await mkdtemp(join(tmpdir(), "febc-profile-api-")); temporary.push(root);
    const vaultDirectory = join(root, "vault");
    const app = await buildApp({ dataDir: vaultDirectory, outputDir: join(root, "output"), definitionsDir: resolve("../../definitions"), templateCacheDir: join(root, "template-cache") });
    const profileName = "API Profile Name 77192";
    try {
      const response = await app.inject({
        method: "POST",
        url: "/api/profiles",
        headers: { host: "127.0.0.1:4173" },
        payload: { password: "a strong profile password", identity: { fullName: profileName } }
      });
      expect(response.statusCode).toBe(201);
      expect(response.headers["set-cookie"]).toContain("febc_session=");
      expect(response.json().recoveryKey).toMatch(/^[A-F0-9]{8}(?:-[A-F0-9]{8}){7}$/);
      const duplicate = await app.inject({
        method: "POST",
        url: "/api/profiles",
        headers: { host: "127.0.0.1:4173" },
        payload: { password: "another strong password", identity: { fullName: profileName } }
      });
      expect(duplicate.statusCode).toBe(400);
      expect(duplicate.json().error).toContain("already exists");
      const invalid = await app.inject({
        method: "POST",
        url: "/api/profiles",
        headers: { host: "127.0.0.1:4173" },
        payload: { password: "another strong password", identity: { fullName: " " } }
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json().error).toContain("Full name is required");
      const bytes = await readFile(join(vaultDirectory, "family-emergency-binder.febcvault"));
      expect(bytes.includes(Buffer.from(profileName))).toBe(true);
    } finally {
      await app.close();
    }
  }, 20_000);

  it("permanently deletes a profile after its current password is confirmed", async () => {
    const root = await mkdtemp(join(tmpdir(), "febc-profile-delete-")); temporary.push(root);
    const app = await buildApp({ dataDir: join(root, "vault"), outputDir: join(root, "output"), definitionsDir: resolve("../../definitions"), templateCacheDir: join(root, "template-cache") });
    const password = "delete profile password";
    try {
      const created = await app.inject({ method: "POST", url: "/api/profiles", headers: { host: "127.0.0.1:4173" }, payload: { password, identity: { fullName: "Delete Me" } } });
      expect(created.statusCode).toBe(201);
      const setCookie = created.headers["set-cookie"]!;
      const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];
      const csrf = created.json().session.csrfToken as string;
      const headers = { host: "127.0.0.1:4173", cookie, "x-csrf-token": csrf };

      const wrongPassword = await app.inject({ method: "DELETE", url: "/api/profile", headers, payload: { password: "wrong password" } });
      expect(wrongPassword.statusCode).toBe(400);
      expect((await app.inject({ method: "GET", url: "/api/profiles", headers: { host: "127.0.0.1:4173" } })).json().profiles).toHaveLength(1);

      const deleted = await app.inject({ method: "DELETE", url: "/api/profile", headers, payload: { password } });
      expect(deleted.statusCode).toBe(200);
      expect(deleted.json()).toEqual({ deleted: true });
      expect((await app.inject({ method: "GET", url: "/api/profiles", headers: { host: "127.0.0.1:4173" } })).json().profiles).toHaveLength(0);
      expect((await app.inject({ method: "GET", url: "/api/session", headers: { host: "127.0.0.1:4173", cookie } })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  }, 20_000);

  it("keeps an active session alive and expires it after 30 minutes without activity", async () => {
    const root = await mkdtemp(join(tmpdir(), "febc-session-timeout-")); temporary.push(root);
    let currentTime = Date.parse("2026-09-13T12:00:00.000Z");
    const app = await buildApp({ dataDir: join(root, "vault"), outputDir: join(root, "output"), definitionsDir: resolve("../../definitions"), templateCacheDir: join(root, "template-cache"), now: () => currentTime });
    try {
      const created = await app.inject({
        method: "POST", url: "/api/profiles", headers: { host: "127.0.0.1:4173" },
        payload: { password: "fictional timeout password", identity: { fullName: "Timeout Test Person" } }
      });
      const setCookie = created.headers["set-cookie"]!;
      const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];
      const csrf = created.json().session.csrfToken as string;
      const headers = { host: "127.0.0.1:4173", cookie, "x-csrf-token": csrf };

      const missingCsrf = await app.inject({ method: "POST", url: "/api/session/keepalive", headers: { host: "127.0.0.1:4173", cookie }, payload: {} });
      expect(missingCsrf.statusCode).toBe(403);

      currentTime += 29 * 60 * 1000;
      const keepAlive = await app.inject({ method: "POST", url: "/api/session/keepalive", headers, payload: {} });
      expect(keepAlive.statusCode).toBe(200);
      expect(keepAlive.json().expiresAt).toBe(new Date(currentTime + 30 * 60 * 1000).toISOString());

      currentTime += 30 * 60 * 1000 + 1;
      const expired = await app.inject({ method: "GET", url: "/api/session", headers: { host: "127.0.0.1:4173", cookie } });
      expect(expired.statusCode).toBe(401);
      expect(expired.json()).toEqual({ error: "Profile is locked" });
    } finally {
      await app.close();
    }
  }, 20_000);

  it("persists a document revision and generates with its pinned template", async () => {
    const root = await mkdtemp(join(tmpdir(), "febc-workflow-api-")); temporary.push(root);
    const vaultDirectory = join(root, "vault");
    const outputDirectory = join(root, "output");
    const app = await buildApp({ dataDir: vaultDirectory, outputDir: outputDirectory, definitionsDir: resolve("../../definitions"), templateCacheDir: join(root, "template-cache") });
    const password = "workflow profile password";
    try {
      const created = await app.inject({
        method: "POST", url: "/api/profiles", headers: { host: "127.0.0.1:4173" },
        payload: { password, identity: { fullName: "Workflow Person" } }
      });
      expect(created.statusCode).toBe(201);
      const setCookie = created.headers["set-cookie"]!;
      const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie).split(";")[0];
      const csrf = created.json().session.csrfToken as string;
      const authHeaders = { host: "127.0.0.1:4173", cookie, "x-csrf-token": csrf };

      const templates = await app.inject({ method: "GET", url: "/api/templates", headers: { host: "127.0.0.1:4173" } });
      const template = templates.json().templates.find((item: { templateId: string }) => item.templateId === "term-insurance");
      expect(template).toBeDefined();
      expect(template.page.size).toBe("A4");
      const thumbnail = await app.inject({ method: "GET", url: template.thumbnailUrl, headers: { host: "127.0.0.1:4173" } });
      expect(thumbnail.statusCode).toBe(200); expect(thumbnail.headers["content-type"]).toContain("image/png");
      const preview = await app.inject({ method: "GET", url: `/api/templates/${template.templateId}/${template.version}/preview`, headers: { host: "127.0.0.1:4173" } });
      expect(preview.statusCode).toBe(200); expect(preview.headers["content-type"]).toContain("application/pdf");
      const documentResponse = await app.inject({
        method: "POST", url: "/api/documents", headers: authHeaders,
        payload: { templateId: template.templateId, templateVersion: template.version, label: "Policy workflow", data: template.syntheticData }
      });
      expect(documentResponse.statusCode).toBe(201);
      const documentId = documentResponse.json().id as string;

      const revisedData = { ...template.syntheticData, policyNumber: "WORKFLOW-PRIVATE-002" };
      const revised = await app.inject({
        method: "PUT", url: `/api/documents/${documentId}`, headers: authHeaders,
        payload: { expectedRevision: 1, label: "Policy workflow", data: revisedData }
      });
      expect(revised.statusCode).toBe(200);
      expect(revised.json().currentRevision).toBe(2);

      const cloned = await app.inject({ method: "POST", url: `/api/documents/${documentId}/clone`, headers: authHeaders });
      expect(cloned.statusCode).toBe(201);
      expect(cloned.json().id).not.toBe(documentId);
      expect(cloned.json()).toMatchObject({
        templateId: template.templateId,
        templateVersion: template.version,
        label: "Policy workflow (Copy)",
        currentRevision: 1,
        archived: false,
        revision: {
          revision: 1,
          parentRevision: null,
          data: revisedData
        }
      });

      const generated = await app.inject({
        method: "POST", url: "/api/generate", headers: authHeaders,
        payload: { documentId, revision: 2, password, templateId: "attempted-substitution" }
      });
      expect(generated.statusCode).toBe(201);
      const receipt = generated.json().receipt;
      expect(receipt.documentRevision).toBe(2);
      expect(receipt.templateId).toBe(template.templateId);
      expect(receipt.filename).toMatch(/\.pdf$/);
      expect(receipt.filename).toMatch(/^term-insurance_workflow-person_policy-workflow_\d{8}_\d{3}_[a-f0-9]{8}\.pdf$/);
      expect(receipt.filename).toBe(receipt.filename.toLowerCase());
      expect(receipt.filename).toMatch(/^[a-z0-9_-]+\.pdf$/);
      const pdf = await readFile(join(outputDirectory, receipt.filename));
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      expect(pdf.includes(Buffer.from("WORKFLOW-PRIVATE-002"))).toBe(false);

      const listed = await app.inject({ method: "GET", url: "/api/generations", headers: authHeaders });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().generations).toHaveLength(1);
      const removed = await app.inject({ method: "DELETE", url: `/api/generations/${receipt.id}`, headers: authHeaders });
      expect(removed.statusCode).toBe(204);
      const preservedPdf = await readFile(join(outputDirectory, receipt.filename));
      expect(preservedPdf.subarray(0, 5).toString()).toBe("%PDF-");
      const afterListRemoval = await app.inject({ method: "GET", url: "/api/generations", headers: authHeaders });
      expect(afterListRemoval.statusCode).toBe(200);
      expect(afterListRemoval.json().generations).toEqual([]);

      const regenerated = await app.inject({
        method: "POST", url: "/api/generate", headers: authHeaders,
        payload: { documentId, revision: 2, password }
      });
      expect(regenerated.statusCode).toBe(201);
      const regeneratedReceipt = regenerated.json().receipt;
      expect(regeneratedReceipt.filename).not.toBe(receipt.filename);
      await readFile(join(outputDirectory, regeneratedReceipt.filename));
      await rm(join(outputDirectory, regeneratedReceipt.filename));
      const afterRemoval = await app.inject({ method: "GET", url: "/api/generations", headers: authHeaders });
      expect(afterRemoval.statusCode).toBe(200);
      expect(afterRemoval.json().generations).toEqual([]);
      const missingOutput = await app.inject({ method: "GET", url: `/api/outputs/${regeneratedReceipt.id}`, headers: authHeaders });
      expect(missingOutput.statusCode).toBe(404);

      const portable = await readFile(join(vaultDirectory, "family-emergency-binder.febcvault"));
      expect(portable.includes(Buffer.from("WORKFLOW-PRIVATE-002"))).toBe(false);
    } finally {
      await app.close();
    }
  }, 30_000);
});

import cookie from "@fastify/cookie";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, lstat, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { SESSION_COOKIE_NAME } from "./branding.js";
import { TemplateCatalog } from "./definitions.js";
import { persistPdf, renderPdf } from "./pdf.js";
import type { JsonObject } from "./types.js";
import { VaultService, type UnlockedVault } from "./vault.js";

const SESSION_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

interface Session {
  id: string;
  csrf: string;
  vault: UnlockedVault;
  expiresAt: number;
}

export interface AppOptions {
  dataDir?: string;
  outputDir?: string;
  definitionsDir?: string;
  templateCacheDir?: string;
  now?: () => number;
}

export async function buildApp(options: AppOptions = {}) {
  const dataDir = resolve(options.dataDir ?? process.env.VAULT_DIR ?? "vault-data");
  const outputDir = resolve(options.outputDir ?? process.env.OUTPUT_DIR ?? "output");
  const definitionsDir = resolve(options.definitionsDir ?? process.env.DEFINITIONS_DIR ?? "definitions");
  const templateCacheDir = resolve(options.templateCacheDir ?? process.env.TEMPLATE_CACHE_DIR ?? "runtime-data/template-cache");
  const now = options.now ?? Date.now;
  const vaults = new VaultService(dataDir);
  const catalog = new TemplateCatalog(definitionsDir, { cacheDir: templateCacheDir });
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await catalog.load();
  await vaults.init();

  const app = Fastify({ logger: false, bodyLimit: 512 * 1024, trustProxy: false });
  await app.register(cookie);
  const sessions = new Map<string, Session>();
  const rateLimits = new Map<string, { count: number; resetAt: number }>();

  async function lockAll() {
    const current = [...sessions.values()];
    sessions.clear();
    await Promise.all(current.map((session) => vaults.closeVault(session.vault)));
  }

  const cleanup = setInterval(() => {
    for (const session of sessions.values()) {
      if (session.expiresAt <= now()) {
        sessions.delete(session.id);
        void vaults.closeVault(session.vault);
      }
    }
  }, 30_000);
  cleanup.unref();
  app.addHook("onClose", async () => { clearInterval(cleanup); await lockAll(); await vaults.close(); });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    reply.header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const rawHost = request.headers.host;
    let host = "";
    try { host = new URL(`http://${rawHost ?? ""}`).hostname; } catch { return reply.code(403).send({ error: "Invalid host" }); }
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) return reply.code(403).send({ error: "Invalid host" });
    const origin = request.headers.origin;
    if (origin) {
      let originUrl: URL;
      try { originUrl = new URL(origin); } catch { return reply.code(403).send({ error: "Invalid origin" }); }
      if (originUrl.protocol !== "http:" || originUrl.host !== rawHost) return reply.code(403).send({ error: "Invalid origin" });
    }
  });

  function rateLimit(key: string, reply: FastifyReply, maximum = 8, windowMs = 60_000): boolean {
    const timestamp = now();
    const current = rateLimits.get(key);
    if (!current || current.resetAt <= timestamp) {
      rateLimits.set(key, { count: 1, resetAt: timestamp + windowMs });
      return true;
    }
    current.count += 1;
    if (current.count <= maximum) return true;
    reply.header("Retry-After", String(Math.max(1, Math.ceil((current.resetAt - timestamp) / 1000))));
    reply.code(429).send({ error: "Too many attempts. Try again shortly" });
    return false;
  }

  function session(request: FastifyRequest): Session | undefined {
    const id = request.cookies[SESSION_COOKIE_NAME];
    const value = id ? sessions.get(id) : undefined;
    if (!value) return undefined;
    if (value.expiresAt <= now()) {
      sessions.delete(value.id);
      void vaults.closeVault(value.vault);
      return undefined;
    }
    value.expiresAt = now() + SESSION_INACTIVITY_TIMEOUT_MS;
    return value;
  }

  function requireSession(request: FastifyRequest, reply: FastifyReply, mutate = false): Session | undefined {
    const current = session(request);
    if (!current) { reply.code(401).send({ error: "Profile is locked" }); return undefined; }
    if (mutate && request.headers["x-csrf-token"] !== current.csrf) { reply.code(403).send({ error: "Invalid CSRF token" }); return undefined; }
    return current;
  }

  function setSessionCookie(reply: FastifyReply, id: string) {
    reply.setCookie(SESSION_COOKIE_NAME, id, { path: "/", httpOnly: true, sameSite: "strict", secure: false });
  }

  async function outputFileExists(filename: string): Promise<boolean> {
    try { return (await lstat(join(outputDir, filename))).isFile(); }
    catch (error) { if (isMissingOutput(error)) return false; throw error; }
  }

  async function beginSession(vault: UnlockedVault, reply: FastifyReply) {
    await lockAll();
    const current: Session = { id: randomBytes(24).toString("base64url"), csrf: randomBytes(24).toString("base64url"), vault, expiresAt: now() + SESSION_INACTIVITY_TIMEOUT_MS };
    sessions.set(current.id, current);
    setSessionCookie(reply, current.id);
    const profile = await vaults.profileRevision(vault);
    return { profileId: vault.profile.id, profileName: vault.profile.name, passwordEpoch: vault.profile.passwordEpoch, profileRevision: profile.revision, profile: profile.data, csrfToken: current.csrf, expiresAt: new Date(current.expiresAt).toISOString() };
  }

  app.get("/api/health", async () => ({ status: "ok" }));
  app.get("/api/storage", async () => vaults.storageStatus(sessions.size === 0));
  app.get("/api/profiles", async () => ({ profiles: await vaults.listProfiles() }));
  app.post("/api/profiles", async (request, reply) => {
    if (!rateLimit("profile:create", reply, 4, 60_000)) return;
    const body = request.body as { password?: string; identity?: JsonObject };
    if (!body.identity || typeof body.identity.fullName !== "string" || !body.identity.fullName.trim()) throw new Error("Full name is required");
    const created = await vaults.createProfile(body.password ?? "", { fullName: body.identity.fullName.trim() });
    const active = await beginSession(created.vault, reply);
    return reply.code(201).send({ session: active, recoveryKey: created.recoveryKey });
  });
  app.post("/api/session/unlock", async (request, reply) => {
    const body = request.body as { profileId?: string; password?: string };
    if (!rateLimit(`unlock:${body.profileId ?? "unknown"}`, reply)) return;
    const vault = await vaults.unlock(body.profileId ?? "", body.password ?? "");
    return { session: await beginSession(vault, reply) };
  });
  app.post("/api/session/recover", async (request, reply) => {
    const body = request.body as { profileId?: string; recoveryKey?: string; newPassword?: string };
    if (!rateLimit(`recover:${body.profileId ?? "unknown"}`, reply, 5, 5 * 60_000)) return;
    const vault = await vaults.recover(body.profileId ?? "", body.recoveryKey ?? "", body.newPassword ?? "");
    return { session: await beginSession(vault, reply) };
  });
  app.get("/api/session", async (request, reply) => {
    const current = requireSession(request, reply); if (!current) return;
    const profile = await vaults.profileRevision(current.vault);
    return { session: { profileId: current.vault.profile.id, profileName: current.vault.profile.name, passwordEpoch: current.vault.profile.passwordEpoch, profileRevision: profile.revision, profile: profile.data, csrfToken: current.csrf, expiresAt: new Date(current.expiresAt).toISOString() } };
  });
  app.post("/api/session/keepalive", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return;
    return { expiresAt: new Date(current.expiresAt).toISOString() };
  });
  app.post("/api/session/lock", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return;
    sessions.delete(current.id); await vaults.closeVault(current.vault); reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" }); return { locked: true };
  });

  const templateResponse = (entry: ReturnType<TemplateCatalog["list"]>[number]) => ({ ...entry.template, hash: entry.hash, thumbnailUrl: `/api/templates/${entry.template.templateId}/${entry.template.version}/thumbnail` });
  app.get("/api/templates", async () => ({ templates: catalog.latest().map(templateResponse) }));
  app.get("/api/templates/:templateId/:templateVersion", async (request) => { const params = request.params as Record<string, string>; return templateResponse(catalog.get(params.templateId, params.templateVersion)); });
  app.get("/api/templates/:templateId/:templateVersion/thumbnail", async (request, reply) => {
    const params = request.params as Record<string, string>; const entry = catalog.get(params.templateId, params.templateVersion);
    await access(entry.thumbnailPath);
    return reply.type("image/png").send(createReadStream(entry.thumbnailPath));
  });
  app.get("/api/templates/:templateId/:templateVersion/preview", async (request, reply) => {
    const params = request.params as Record<string, string>; const template = catalog.get(params.templateId, params.templateVersion);
    const pdf = await renderPdf(template.template, { document: template.template.syntheticData, system: { generatedAt: new Date().toISOString(), documentRevision: 1, profileRevision: 1 } }, undefined, template.directory);
    return reply.type("application/pdf").header("Content-Disposition", "inline; filename=template-preview.pdf").send(pdf);
  });

  app.get("/api/profile", async (request, reply) => {
    const current = requireSession(request, reply); if (!current) return; return vaults.profileRevision(current.vault);
  });
  app.put("/api/profile", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return;
    const body = request.body as { expectedRevision: number; data: JsonObject };
    if (!body.data || typeof body.data.fullName !== "string" || !body.data.fullName.trim()) throw new Error("Full name is required");
    return vaults.updateProfileDetails(current.vault, body.expectedRevision, { fullName: body.data.fullName.trim() });
  });
  app.delete("/api/profile", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return;
    const body = request.body as { password?: string };
    await vaults.deleteProfile(current.vault, body.password ?? "");
    sessions.delete(current.id);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return { deleted: true };
  });
  app.post("/api/profile/change-password", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return;
    if (!rateLimit(`change-password:${current.vault.profile.id}`, reply, 5, 5 * 60_000)) return;
    const body = request.body as { currentPassword?: string; newPassword?: string };
    const profile = await vaults.changePassword(current.vault, body.currentPassword ?? "", body.newPassword ?? "");
    return { changed: true, passwordEpoch: profile.passwordEpoch };
  });
  app.post("/api/profile/rotate-recovery", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return;
    if (!rateLimit(`rotate-recovery:${current.vault.profile.id}`, reply, 5, 5 * 60_000)) return;
    const body = request.body as { password?: string };
    return { recoveryKey: await vaults.rotateRecoveryKey(current.vault, body.password ?? "") };
  });

  app.get("/api/documents", async (request, reply) => {
    const current = requireSession(request, reply); if (!current) return;
    const query = request.query as { includeArchived?: string };
    return { documents: await vaults.listDocuments(current.vault, query.includeArchived === "true") };
  });
  app.post("/api/documents", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return;
    const body = request.body as { templateId?: string; templateVersion?: string; label?: string; data?: JsonObject };
    const template = catalog.get(body.templateId ?? "", body.templateVersion ?? ""); catalog.validateData(template.template, body.data);
    if (!body.label?.trim() || body.label.trim().length > 100) throw new Error("Document label is required and must be at most 100 characters");
    return reply.code(201).send(await vaults.createDocument(current.vault, template.template.templateId, template.template.version, body.label, body.data!));
  });
  app.post("/api/documents/:id/clone", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return;
    return reply.code(201).send(await vaults.cloneDocument(current.vault, (request.params as { id: string }).id));
  });
  app.get("/api/documents/:id", async (request, reply) => {
    const current = requireSession(request, reply); if (!current) return; const params = request.params as { id: string }; const query = request.query as { revision?: string };
    return vaults.getDocument(current.vault, params.id, query.revision ? Number(query.revision) : undefined);
  });
  app.put("/api/documents/:id", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return; const params = request.params as { id: string };
    const body = request.body as { expectedRevision: number; label: string; data: JsonObject }; const existing = await vaults.getDocument(current.vault, params.id);
    const template = catalog.get(existing.templateId, existing.templateVersion); catalog.validateData(template.template, body.data);
    return vaults.reviseDocument(current.vault, params.id, body.expectedRevision, body.label, body.data);
  });
  app.get("/api/documents/:id/revisions", async (request, reply) => {
    const current = requireSession(request, reply); if (!current) return; return { revisions: await vaults.revisions(current.vault, (request.params as { id: string }).id) };
  });
  app.post("/api/documents/:id/archive", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return; await vaults.setArchived(current.vault, (request.params as { id: string }).id, Boolean((request.body as { archived?: boolean }).archived)); return { updated: true };
  });
  app.delete("/api/documents/:id", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return; await vaults.purge(current.vault, (request.params as { id: string }).id, (request.body as { confirmation?: string }).confirmation ?? ""); return reply.code(204).send();
  });
  app.get("/api/generations", async (request, reply) => {
    const current = requireSession(request, reply); if (!current) return;
    const generations = await vaults.generations(current.vault);
    const available = [];
    for (const receipt of generations) {
      if (await outputFileExists(receipt.filename)) available.push(receipt);
      else await vaults.removeGeneration(current.vault, receipt.id);
    }
    return { generations: available };
  });
  app.delete("/api/generations/:id", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return;
    await vaults.removeGeneration(current.vault, (request.params as { id: string }).id);
    return reply.code(204).send();
  });
  app.post("/api/generate", async (request, reply) => {
    const current = requireSession(request, reply, true); if (!current) return;
    if (!rateLimit(`generate:${current.vault.profile.id}`, reply, 10, 60_000)) return;
    const body = request.body as { documentId: string; revision?: number; password: string };
    if (!(await vaults.verifyPassword(current.vault, body.password ?? ""))) throw new Error("Profile password is incorrect");
    const document = await vaults.getDocument(current.vault, body.documentId, body.revision); const profile = await vaults.profileRevision(current.vault);
    const template = catalog.get(document.templateId, document.templateVersion);
    const existingGenerations = await vaults.generations(current.vault);
    const pdf = await renderPdf(template.template, { document: document.revision.data, system: { generatedAt: new Date().toISOString(), documentRevision: document.revision.revision, profileRevision: profile.revision } }, body.password, template.directory);
    const receipt = await persistPdf({ buffer: pdf, outputDir, template, profileName: current.vault.profile.name, profileRevision: profile.revision, documentId: document.id, documentLabel: document.label, documentRevision: document.revision.revision, passwordEpoch: current.vault.profile.passwordEpoch, generationNumber: existingGenerations.length + 1 });
    pdf.fill(0); await vaults.saveGeneration(current.vault, receipt);
    return reply.code(201).send({ receipt, url: `/api/outputs/${receipt.id}`, outputPath: join(outputDir, receipt.filename) });
  });
  app.get("/api/outputs/:id", async (request, reply) => {
    const current = requireSession(request, reply); if (!current) return;
    const receipt = await vaults.generation(current.vault, (request.params as { id: string }).id); const path = join(outputDir, receipt.filename);
    if (!(await outputFileExists(receipt.filename))) {
      await vaults.removeGeneration(current.vault, receipt.id);
      throw new Error("Generated document not found");
    }
    await access(path); return reply.type("application/pdf").header("Content-Disposition", `inline; filename=\"${receipt.filename}\"`).send(createReadStream(path));
  });

  app.setErrorHandler((error, _request, reply) => {
    const rawMessage = error instanceof Error ? error.message : "Unknown error";
    const message = rawMessage === "STALE_REVISION" ? "This document changed in another view. Reload it before saving." : rawMessage;
    const status = rawMessage === "STALE_REVISION" ? 409 : /not found/i.test(rawMessage) ? 404 : /invalid|incorrect|required|must|match|blocked|too many|exists/i.test(rawMessage) ? 400 : 500;
    reply.code(status).send({ error: status === 500 ? "The operation could not be completed" : message });
  });

  return app;
}

function isMissingOutput(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT" || (error as NodeJS.ErrnoException)?.code === "ENOTDIR";
}

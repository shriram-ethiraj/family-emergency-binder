import type { DocumentDetail, JsonObject } from "@/lib/domain";
import { latestTemplates, templateById, validateTemplateData } from "@/lib/template-catalog";
import { vaultClient } from "@/lib/vault-client";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function setCsrf(value?: string) {
  void value;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const body = init.body ? JSON.parse(String(init.body)) as JsonObject : undefined;
  try {
    if (path === "/templates" && method === "GET") return { templates: await latestTemplates() } as T;
    const templateMatch = path.match(/^\/templates\/([^/]+)\/([^/]+)$/);
    if (templateMatch && method === "GET") {
      const id = decodeURIComponent(templateMatch[1]); const version = decodeURIComponent(templateMatch[2]);
      try { return await templateById(id, version) as T; } catch { return await vaultClient.call<T>(`/template-snapshot/${id}/${version}`, "GET"); }
    }
    if (path === "/session/lock" && method === "POST") return await vaultClient.lock() as T;
    if (path === "/documents" && method === "POST") {
      const template = await templateById(String(body?.templateId), String(body?.templateVersion));
      validateTemplateData(template, body?.data);
      return await vaultClient.call<T>(path, method, { template, label: body?.label, data: body?.data });
    }
    const updateMatch = path.match(/^\/documents\/([^/?]+)$/);
    if (updateMatch && method === "PUT") {
      const existing = await vaultClient.call<DocumentDetail>(`/documents/${updateMatch[1]}`, "GET");
      let template; try { template = await templateById(existing.templateId, existing.templateVersion); } catch { template = await vaultClient.call<import("@/lib/domain").PdfTemplate>(`/template-snapshot/${existing.templateId}/${existing.templateVersion}`, "GET"); }
      validateTemplateData(template, body?.data);
    }
    const [pathname, search = ""] = path.split("?", 2);
    return await vaultClient.call<T>(pathname, method, search ? { ...(body ?? {}), search } : body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The operation could not be completed";
    throw new ApiError(message === "STALE_REVISION" ? "This document changed in another view. Reload it before saving." : message, message === "STALE_REVISION" ? 409 : 400);
  }
}

export function json(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation could not be completed";
}

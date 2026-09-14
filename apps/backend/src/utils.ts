import { basename } from "node:path";

export function safeOutputName(value: string): string {
  return basename(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 70).toLowerCase() || "document";
}

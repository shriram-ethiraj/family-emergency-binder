import { config } from "dotenv";
import { resolve } from "node:path";
import { buildApp } from "./app.js";

const workspaceRoot = resolve(import.meta.dirname, "../../..");
config({ path: process.env.ENV_FILE ?? resolve(workspaceRoot, ".env"), quiet: true });
process.env.VAULT_DIR ??= resolve(workspaceRoot, "vault-data");
process.env.OUTPUT_DIR ??= resolve(workspaceRoot, "output");
process.env.DEFINITIONS_DIR ??= resolve(workspaceRoot, "definitions");
process.env.TEMPLATE_CACHE_DIR ??= resolve(workspaceRoot, "runtime-data/template-cache");

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";
const app = await buildApp();
try {
  await app.listen({ host, port });
} catch (error) {
  await app.close().catch(() => undefined);
  throw error;
}

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await app.close();
    process.exit(0);
  } catch (error) {
    console.error("Could not shut down cleanly", error);
    process.exit(1);
  }
}

process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());

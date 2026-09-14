import { config } from "dotenv";
import { resolve } from "node:path";
import { TemplateCatalog } from "../apps/backend/src/definitions.js";

const workspaceRoot = resolve(import.meta.dirname, "..");
config({ path: process.env.ENV_FILE ?? resolve(workspaceRoot, ".env"), quiet: true });
const definitionsDir = resolve(process.env.DEFINITIONS_DIR ?? resolve(workspaceRoot, "definitions"));
const cacheDir = resolve(process.env.TEMPLATE_CACHE_DIR ?? resolve(workspaceRoot, "runtime-data/template-cache"));
const catalog = new TemplateCatalog(definitionsDir, { cacheDir });
await catalog.load();
console.log(`Prepared ${catalog.list().length} template version${catalog.list().length === 1 ? "" : "s"} in ${cacheDir}`);

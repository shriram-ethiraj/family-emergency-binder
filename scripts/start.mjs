import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const apiPort = process.env.API_PORT ?? "4174";
const webPort = process.env.WEB_PORT ?? "4173";
const definitionsDir = resolve(root, "definitions");
const templateCacheDir = process.env.TEMPLATE_CACHE_DIR ?? resolve(root, "runtime-data/template-cache");

const commands = [
  ["backend", ["--filter", "@family-emergency-binder/backend", "start"], {
    HOST: "127.0.0.1",
    PORT: apiPort,
    DEFINITIONS_DIR: definitionsDir,
    TEMPLATE_CACHE_DIR: templateCacheDir,
  }],
  ["frontend", ["--filter", "@family-emergency-binder/frontend", "preview", "--", "--host", "127.0.0.1", "--port", webPort], {
    VITE_DEV_API_TARGET: `http://127.0.0.1:${apiPort}`,
    WEB_PORT: webPort,
  }],
];

const children = commands.map(([name, args, extraEnv]) => {
  const child = spawn("pnpm", args, {
    cwd: root,
    detached: true,
    env: { ...process.env, ...extraEnv },
    stdio: "inherit",
  });
  child.on("error", (error) => console.error(`[${name}] could not start`, error));
  return { name, child };
});

let shuttingDown = false;
let exitCode = 0;

function stop(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  exitCode = code;
  for (const { child } of children) {
    if (child.exitCode !== null || !child.pid) continue;
    try { process.kill(-child.pid, signal); } catch { /* The child may have exited. */ }
  }
  setTimeout(() => {
    for (const { child } of children) {
      if (child.exitCode === null && child.pid) {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* The child has exited. */ }
      }
    }
  }, 5_000).unref();
}

for (const { name, child } of children) {
  child.on("exit", (code, signal) => {
    if (!shuttingDown) {
      console.error(`[${name}] stopped unexpectedly with ${signal ? `signal ${signal}` : `exit code ${code ?? 1}`}`);
      stop("SIGTERM", code ?? 1);
    }
    if (children.every(({ child: process }) => process.exitCode !== null || process.signalCode !== null)) process.exit(exitCode);
  });
}

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

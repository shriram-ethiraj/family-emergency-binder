import { chmod, lchown, lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export interface StorageTarget {
  label: string;
  path: string;
}

const CONTAINER_NODE_UID = 1000;
const CONTAINER_NODE_GID = 1000;

export const containerStorageTargets: readonly StorageTarget[] = [
  { label: "vault", path: "/vault" },
  { label: "output", path: "/output" },
  { label: "template-cache", path: "/template-cache" },
];

async function normalizeEntry(path: string, uid: number, gid: number): Promise<void> {
  const metadata = await lstat(path);
  await lchown(path, uid, gid);

  if (metadata.isSymbolicLink()) return;
  if (metadata.isFile()) {
    await chmod(path, 0o600);
    return;
  }
  if (!metadata.isDirectory()) throw new Error("unsupported storage entry");

  await chmod(path, 0o700);
  for (const entry of await readdir(path)) await normalizeEntry(join(path, entry), uid, gid);
}

export async function prepareStorageDirectories(
  targets: readonly StorageTarget[],
  uid = CONTAINER_NODE_UID,
  gid = CONTAINER_NODE_GID,
): Promise<void> {
  for (const target of targets) {
    process.stdout.write(`Preparing ${target.label} storage at ${target.path}\n`);
    try {
      await normalizeEntry(target.path, uid, gid);
    } catch {
      throw new Error(
        `Storage initialization failed for ${target.label} (${target.path}). ` +
        "Use a dedicated directory on a filesystem where Docker can set ownership and permissions.",
      );
    }
  }
}

async function main(): Promise<void> {
  await prepareStorageDirectories(containerStorageTargets);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

import { lstat, mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { prepareStorageDirectories } from "./storage-init.js";

const describeOnPosix = process.platform === "win32" ? describe.skip : describe;

describeOnPosix("Docker storage initializer", () => {
  it("secures directories and files without following symbolic links", async () => {
    const root = await mkdtemp(join(tmpdir(), "febc-storage-init-"));
    const nested = join(root, "nested");
    const file = join(nested, "private-value");
    const outside = join(await mkdtemp(join(tmpdir(), "febc-storage-outside-")), "unchanged");
    const link = join(root, "outside-link");
    await mkdir(nested, { mode: 0o777 });
    await writeFile(file, "fictional private value", { mode: 0o666 });
    await writeFile(outside, "outside", { mode: 0o644 });
    await symlink(outside, link);

    await prepareStorageDirectories([{ label: "test", path: root }], process.getuid!(), process.getgid!());
    await prepareStorageDirectories([{ label: "test", path: root }], process.getuid!(), process.getgid!());

    expect((await stat(root)).mode & 0o777).toBe(0o700);
    expect((await stat(nested)).mode & 0o777).toBe(0o700);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect((await stat(outside)).mode & 0o777).toBe(0o644);
    expect((await lstat(link)).isSymbolicLink()).toBe(true);
    expect(await readFile(outside, "utf8")).toBe("outside");
  });

  it("reports only the configured storage root when preparation fails", async () => {
    const missing = join(tmpdir(), "febc-storage-init-missing", "private-child");
    await expect(prepareStorageDirectories([{ label: "vault", path: missing }], process.getuid!(), process.getgid!()))
      .rejects.toThrow(`Storage initialization failed for vault (${missing})`);
  });
});

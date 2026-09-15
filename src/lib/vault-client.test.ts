import { describe, expect, it, vi } from "vitest";
import { ensureReadWritePermission } from "@/lib/vault-client";

function permissionHandle(queryState: PermissionState, requestState: PermissionState = "granted") {
  return {
    queryPermission: vi.fn().mockResolvedValue(queryState),
    requestPermission: vi.fn().mockResolvedValue(requestState),
  } as unknown as FileSystemFileHandle & {
    queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
    requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  };
}

describe("vault file permissions", () => {
  it("reuses existing read-write permission", async () => {
    const handle = permissionHandle("granted");

    await expect(ensureReadWritePermission(handle)).resolves.toBeUndefined();

    expect(handle.queryPermission).toHaveBeenCalledWith({ mode: "readwrite" });
    expect(handle.requestPermission).not.toHaveBeenCalled();
  });

  it("requests read-write permission for an opened file", async () => {
    const handle = permissionHandle("prompt");

    await expect(ensureReadWritePermission(handle)).resolves.toBeUndefined();

    expect(handle.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
  });

  it("rejects a handle when write permission is denied", async () => {
    const handle = permissionHandle("prompt", "denied");

    await expect(ensureReadWritePermission(handle)).rejects.toMatchObject({
      name: "NotAllowedError",
      message: "Read and write access is required to update the selected vault",
    });
  });
});

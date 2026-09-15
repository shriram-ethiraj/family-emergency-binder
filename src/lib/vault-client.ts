import VaultWorker from "@/lib/vault.worker?worker&inline";
import type { VaultStatus, ProfileSummary } from "@/lib/domain";
import type { WorkerCommand, WorkerResult } from "@/lib/vault-protocol";

type Listener = (status: VaultStatus) => void;
type PickerWindow = Window & typeof globalThis & {
  showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: object) => Promise<FileSystemFileHandle>;
};
type PermissionCapableFileHandle = FileSystemFileHandle & {
  queryPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "readwrite" }): Promise<PermissionState>;
};

class VaultClient {
  private worker = new VaultWorker();
  private sequence = 0;
  private pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
  private listeners = new Set<Listener>();
  private status: VaultStatus = { selected: false, unlocked: false, fileName: null, saveState: "saved", persistence: directSaveSupported() ? "direct" : "download" };

  constructor() {
    this.worker.onmessage = (event: MessageEvent<WorkerResult>) => {
      const message = event.data;
      if (message.type === "status") { this.status = message.status; this.listeners.forEach((listener) => listener(this.status)); return; }
      const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id);
      if (message.type === "error") pending.reject(new Error(message.message)); else pending.resolve(message.value);
    };
  }

  supported() { return window.isSecureContext && typeof Worker === "function" && Boolean(globalThis.crypto?.subtle); }
  directSaveSupported() { return directSaveSupported(); }
  snapshot() { return this.status; }
  subscribe(listener: Listener) { this.listeners.add(listener); listener(this.status); return () => { this.listeners.delete(listener); }; }

  async chooseVault() {
    if (directSaveSupported()) {
      const [handle] = await requiredWindow().showOpenFilePicker!({ multiple: false, types: [{ description: "Family Emergency Binder vault", accept: { "application/json": [".febvault"] } }] });
      await ensureReadWritePermission(handle);
      return this.request("select", { handle });
    }
    const file = await choosePortableFile();
    return this.request("selectBytes", { fileName: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
  }
  async createVault(password: string) {
    if (directSaveSupported()) {
      const handle = await requiredWindow().showSaveFilePicker!({ suggestedName: "family-emergency-binder.febvault", types: [{ description: "Family Emergency Binder vault", accept: { "application/json": [".febvault"] } }] });
      return this.request<{ recoveryKey: string; profiles: ProfileSummary[] }>("create", { handle, password });
    }
    const result = await this.request<{ recoveryKey: string; profiles: ProfileSummary[] }>("createPortable", { fileName: "family-emergency-binder.febvault", password });
    await this.downloadCurrent();
    return result;
  }
  unlock(password: string) { return this.request<{ profiles: ProfileSummary[] }>("unlock", { password }); }
  recover(recoveryKey: string, newPassword: string) { return this.request<{ profiles: ProfileSummary[] }>("recover", { recoveryKey, newPassword }); }
  call<T>(path: string, method: string, body?: unknown) { return this.request<T>("call", { path, method, body }); }
  async saveCopy() {
    if (!directSaveSupported()) return this.downloadCurrent();
    const handle = await requiredWindow().showSaveFilePicker!({ suggestedName: this.status.fileName ?? "family-emergency-binder.febvault", types: [{ description: "Family Emergency Binder vault", accept: { "application/json": [".febvault"] } }] });
    return this.request("saveCopy", { handle });
  }
  async waitForSave() {
    if (this.status.saveState === "saved") return;
    if (this.status.saveState === "dirty") throw new Error("Download the updated vault before locking");
    if (this.status.saveState === "error") throw new Error(this.status.error ?? "The vault has unsaved changes");
    await new Promise<void>((resolve, reject) => {
      const unsubscribe = this.subscribe((status) => {
        if (status.saveState === "saving") return;
        unsubscribe();
        if (status.saveState === "saved") resolve(); else reject(new Error(status.error ?? "The vault has unsaved changes"));
      });
    });
  }
  lock() { return this.request<{ locked: true }>("lock", {}); }

  private async downloadCurrent() {
    const exported = await this.request<{ fileName: string | null; generation: number; bytes: Uint8Array }>("export", {});
    downloadBytes(exported.bytes, exported.fileName ?? "family-emergency-binder.febvault", "application/json");
    await this.request("markExported", { generation: exported.generation });
    exported.bytes.fill(0);
    return { fileName: exported.fileName };
  }

  private request<T>(type: WorkerCommand["type"], values: Record<string, unknown>): Promise<T> {
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => { this.pending.set(id, { resolve: (value) => resolve(value as T), reject }); this.worker.postMessage({ type, id, ...values } as WorkerCommand); });
  }
}

function requiredWindow(): PickerWindow { const browser = window as PickerWindow; if (!directSaveSupported()) throw new Error("This browser cannot update a selected vault in place"); return browser; }
function directSaveSupported() { const browser = window as PickerWindow; return typeof browser.showOpenFilePicker === "function" && typeof browser.showSaveFilePicker === "function" && typeof FileSystemFileHandle !== "undefined" && "createWritable" in FileSystemFileHandle.prototype; }
export async function ensureReadWritePermission(handle: FileSystemFileHandle) {
  const permissionHandle = handle as PermissionCapableFileHandle;
  if (typeof permissionHandle.queryPermission !== "function" || typeof permissionHandle.requestPermission !== "function") {
    throw new DOMException("This browser cannot grant write access to the selected vault", "NotAllowedError");
  }
  const options = { mode: "readwrite" } as const;
  if (await permissionHandle.queryPermission(options) === "granted") return;
  if (await permissionHandle.requestPermission(options) === "granted") return;
  throw new DOMException("Read and write access is required to update the selected vault", "NotAllowedError");
}
function choosePortableFile(): Promise<File> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input"); input.type = "file"; input.accept = ".febvault,application/json";
    input.hidden = true; document.body.append(input);
    const finish = (file?: File) => { input.remove(); if (file) resolve(file); else reject(new DOMException("No vault was selected", "AbortError")); };
    input.addEventListener("change", () => finish(input.files?.[0]), { once: true });
    input.addEventListener("cancel", () => finish(), { once: true });
    input.click();
  });
}
function downloadBytes(bytes: Uint8Array, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = fileName.endsWith(".febvault") ? fileName : `${fileName}.febvault`; anchor.hidden = true; document.body.append(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
export const vaultClient = new VaultClient();

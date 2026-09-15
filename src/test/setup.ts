import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(cleanup);

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub);

class WorkerStub {
  onmessage: ((event: MessageEvent) => void) | null = null;
  postMessage(message: { id: number; type: string }) {
    queueMicrotask(() => this.onmessage?.({ data: { type: "result", id: message.id, value: message.type === "lock" ? { locked: true } : {} } } as MessageEvent));
  }
  terminate() {}
}
class FileSystemFileHandleStub { createWritable() {} }
vi.stubGlobal("Worker", WorkerStub);
vi.stubGlobal("FileSystemFileHandle", FileSystemFileHandleStub);
Object.defineProperty(window, "isSecureContext", { configurable: true, value: true });
Object.defineProperty(window, "showOpenFilePicker", { configurable: true, value: vi.fn() });
Object.defineProperty(window, "showSaveFilePicker", { configurable: true, value: vi.fn() });

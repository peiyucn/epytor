
import { vi } from "vitest";

const mockVscodeApi = {
    postMessage: vi.fn(),
    getState: vi.fn(() => null),
    setState: vi.fn(),
};

Object.defineProperty(globalThis, "acquireVsCodeApi", {
    value: () => mockVscodeApi,
    writable: true,
    configurable: true,
});

if (typeof (globalThis as unknown as Record<string, unknown>).IntersectionObserver === "undefined") {
    (globalThis as unknown as Record<string, unknown>).IntersectionObserver = class {
        observe() {  }
        unobserve() {  }
        disconnect() {  }
        takeRecords() { return []; }
    };
}


export { mockVscodeApi };

/**
 * jsdom 环境 setup：在测试文件加载前注入 acquireVsCodeApi 全局函数，
 * 使 messaging.ts 在模块初始化时能正常调用。
 *
 * 另补 jsdom 缺失的浏览器原生 API：Milkdown 7.22.3 的代码块 NodeView
 * 用 IntersectionObserver 做可见性观察（浏览器原生有），jsdom 没有——
 * 渲染代码块的用例会直接 ReferenceError。这里给一个静默 stub。
 */
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
        observe() { /* noop */ }
        unobserve() { /* noop */ }
        disconnect() { /* noop */ }
        takeRecords() { return []; }
    };
}

/** 供测试断言使用 */
export { mockVscodeApi };

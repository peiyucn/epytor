import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockVscodeApi } from "./setup";
import { attachImgPathComplete, dispatchImagePathResolved, resolveToWebviewUri } from "../components/imageView/imgPathComplete";
import { resolvePathSuggestionRequest } from "../images/pathSuggestionRequests";
import type { PathSuggestionItem } from "../../shared/messages";

const item = (path: string, isDir = false, webviewUri?: string): PathSuggestionItem => ({ path, isDir, webviewUri });


const flush = () => new Promise<void>((resolve) => { queueMicrotask(resolve); });


HTMLElement.prototype.scrollIntoView = HTMLElement.prototype.scrollIntoView ?? (() => {});


function typeAndGetRequestId(input: HTMLInputElement, value: string): string {
    input.value = value;
    input.dispatchEvent(new Event("input"));
    vi.advanceTimersByTime(200);
    const calls = mockVscodeApi.postMessage.mock.calls.filter(
        (call) => (call[0] as { type: string }).type === "getPathSuggestions",
    );
    const last = calls[calls.length - 1]?.[0] as { id: string };
    return last.id;
}

describe("imgPathComplete 补全竞态防护", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        document.body.innerHTML = "";
    });

    afterEach(() => {
        vi.useRealTimers();
        document.body.innerHTML = "";
    });

    it("晚到的旧请求响应 应该 被丢弃，不覆盖当前下拉（回归：A 先发 B 后发，A 晚回覆盖 B）", async () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        attachImgPathComplete(input);

        const idA = typeAndGetRequestId(input, "@/a");
        const idB = typeAndGetRequestId(input, "@/b");
        expect(idA).not.toBe(idB);


        resolvePathSuggestionRequest(idA, [item("a.md"), item("a-dir", true)]);
        await flush();
        expect(document.querySelector(".img-path-complete-list")).toBeNull();


        resolvePathSuggestionRequest(idB, [item("b.md"), item("b-dir", true)]);
        await flush();
        expect(document.querySelector(".img-path-complete-list")).not.toBeNull();
        expect(document.querySelector(".img-complete-label")?.textContent).toBe("b-dir");
    });

    it("查询被清空后 应该 使 in-flight 响应失效（下拉不复活）", async () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        attachImgPathComplete(input);

        const id = typeAndGetRequestId(input, "@/a");

        typeAndGetRequestId(input, "");
        resolvePathSuggestionRequest(id, [item("a.md"), item("a-dir", true)]);
        await flush();
        expect(document.querySelector(".img-path-complete-list")).toBeNull();
    });

    it("detach 后 应该 拒绝渲染（输入框销毁后不游离复活；回归：imagePicker 丢弃 detach 泄漏监听）", async () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        const detach = attachImgPathComplete(input);

        const id = typeAndGetRequestId(input, "@/a");
        detach();
        input.remove();
        resolvePathSuggestionRequest(id, [item("a.md"), item("a-dir", true)]);
        await flush();
        expect(document.querySelector(".img-path-complete-list")).toBeNull();
    });

    it("isConnected 双保险：输入框脱离文档后响应 应该 不渲染", async () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        attachImgPathComplete(input);

        const id = typeAndGetRequestId(input, "@/a");
        input.remove();
        resolvePathSuggestionRequest(id, [item("a.md"), item("a-dir", true)]);
        await flush();
        expect(document.querySelector(".img-path-complete-list")).toBeNull();
    });
});

describe("resolveToWebviewUri（图片路径确认的唯一翻译路径，回归 P8）", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("Extension 回包时 应该 解析为 webviewUri", async () => {
        const promise = resolveToWebviewUri("./images/a.png");
        const sent = mockVscodeApi.postMessage.mock.calls.find(
            (call) => (call[0] as { type: string }).type === "resolveImagePath",
        )?.[0] as { id: string; relPath: string };
        expect(sent.relPath).toBe("./images/a.png");

        dispatchImagePathResolved(sent.id, "https://file+.vscode-resource/a.png");

        await expect(promise).resolves.toBe("https://file+.vscode-resource/a.png");
    });

    it("超时未回包时 应该 回退为原路径（不挂起）", async () => {
        const promise = resolveToWebviewUri("./images/missing.png");

        vi.advanceTimersByTime(3000);

        await expect(promise).resolves.toBe("./images/missing.png");
    });
});

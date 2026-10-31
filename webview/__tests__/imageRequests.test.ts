/**
 * 图片请求编排与插入接线（覆盖 app/imageRequests.ts）。
 * 拆分自 index.ts（audit F1）；用例锁住：请求超时语义（上传/重命名 reject、图库 resolve(null)）、
 * 扩展回复路由、重命名后的 URI 重映射 + 文档节点重写、拖放/粘贴/选择器事件接线。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "@milkdown/kit/core";
import { editorViewCtx } from "@milkdown/kit/core";
import {
    createImageRequestController,
    initImageDropPaste,
    initImagePickerInsertion,
} from "../app/imageRequests";
import { closeImagePicker } from "../components/imagePicker";
import { mockVscodeApi } from "./setup";

const postMessage = mockVscodeApi.postMessage;

/** 最小 Editor 桩：action 把 ctx.get 固定成同一个 view。 */
function fakeEditor(view: unknown): Editor {
    return {
        action: (fn: (ctx: { get(key: unknown): unknown }) => unknown) =>
            fn({ get: (key: unknown) => (key === editorViewCtx ? view : undefined) }),
    } as unknown as Editor;
}

/** 插入图片用的视图桩。 */
function insertionView() {
    const node = { kind: "image-node" };
    const tr = { kind: "transaction" };
    const view = {
        state: {
            schema: { nodes: { image: { create: vi.fn(() => node) } } },
            tr: { replaceSelectionWith: vi.fn(() => tr) },
        },
        dispatch: vi.fn(),
        focus: vi.fn(),
    };
    return { view, node, tr };
}

function lastPostedMessage(): Record<string, unknown> {
    const calls = postMessage.mock.calls;
    return calls[calls.length - 1]?.[0] as Record<string, unknown>;
}

beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
});

describe("图片上传请求", () => {
    it("读取文件后 应该 发送 uploadImage 消息，并在收到 imageUploaded 后解析出 URL", async () => {
        const controller = createImageRequestController({ getEditor: () => null });
        const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });

        const promise = controller.uploadImageFile(file, "alt");
        await vi.waitFor(() => {
            expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "uploadImage" }));
        });
        const sent = lastPostedMessage();
        expect(sent["type"]).toBe("uploadImage");
        expect(sent["mimeType"]).toBe("image/png");
        expect(sent["altText"]).toBe("alt");

        controller.handleMessage({ type: "imageUploaded", id: String(sent["id"]), url: "webview://img" });
        await expect(promise).resolves.toBe("webview://img");
    });

    it("imageUploadError 应该 以用户可读信息 reject", async () => {
        const controller = createImageRequestController({ getEditor: () => null });
        const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
        const promise = controller.uploadImageFile(file, "");
        await vi.waitFor(() => {
            expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "uploadImage" }));
        });
        const id = String(lastPostedMessage()["id"]);
        controller.handleMessage({ type: "imageUploadError", id, error: "Upload failed" });
        await expect(promise).rejects.toThrow("Upload failed");
    });

    it("超时 应该 reject（30s 没有回复不再挂起）", async () => {
        vi.useFakeTimers();
        const controller = createImageRequestController({ getEditor: () => null });
        const file = new File([new Uint8Array([1])], "a.png", { type: "image/png" });
        const promise = controller.uploadImageFile(file, "");
        const settled = expect(promise).rejects.toThrow("Upload timed out");
        await vi.advanceTimersByTimeAsync(30000);
        await settled;
    });
});

describe("项目图库请求", () => {
    it("应该 发送 getProjectImages，并在 projectImagesList 后解析出图片列表", async () => {
        const controller = createImageRequestController({ getEditor: () => null });
        const promise = controller.requestProjectImages();
        const sent = lastPostedMessage();
        expect(sent["type"]).toBe("getProjectImages");

        const images = [{ relPath: "images/a.png", webviewUri: "webview://a", name: "a.png" }];
        controller.handleMessage({ type: "projectImagesList", id: String(sent["id"]), images });
        await expect(promise).resolves.toEqual(images);
    });

    it("超时 应该 resolve(null)（回归：没有回包时选择器一直 Loading）", async () => {
        vi.useFakeTimers();
        const controller = createImageRequestController({ getEditor: () => null });
        const promise = controller.requestProjectImages();
        await vi.advanceTimersByTimeAsync(10000);
        await expect(promise).resolves.toBeNull();
    });
});

describe("图片重命名请求", () => {
    it("应该 发送 renameImage，imageRenamed 后解析并重写打开文档里的旧 URI", async () => {
        const imageNode = { type: { name: "image" }, attrs: { src: "old-uri" } };
        const tr = { setNodeMarkup: vi.fn() };
        const view = {
            state: {
                doc: { descendants: (cb: (node: unknown, pos: number) => void) => cb(imageNode, 5) },
                tr,
            },
            dispatch: vi.fn(),
        };
        const controller = createImageRequestController({ getEditor: () => fakeEditor(view) });

        const promise = controller.renameImage("old-uri", "new-name");
        const sent = lastPostedMessage();
        expect(sent["type"]).toBe("renameImage");
        expect(sent["webviewUri"]).toBe("old-uri");
        expect(sent["newBasename"]).toBe("new-name");

        controller.handleMessage({
            type: "imageRenamed",
            id: String(sent["id"]),
            oldWebviewUri: "old-uri",
            newWebviewUri: "new-uri",
            newRelPath: "images/new-name.png",
        });
        await expect(promise).resolves.toBeUndefined();
        expect(tr.setNodeMarkup).toHaveBeenCalledWith(5, null, { src: "new-uri" });
        expect(view.dispatch).toHaveBeenCalledWith(tr);
    });

    it("imageRenameError 应该 reject", async () => {
        const controller = createImageRequestController({ getEditor: () => null });
        const promise = controller.renameImage("old-uri", "x");
        const id = String(lastPostedMessage()["id"]);
        controller.handleMessage({ type: "imageRenameError", id, error: "Image not found" });
        await expect(promise).rejects.toThrow("Image not found");
    });

    it("超时 应该 reject（15s）", async () => {
        vi.useFakeTimers();
        const controller = createImageRequestController({ getEditor: () => null });
        const promise = controller.renameImage("old-uri", "x");
        const settled = expect(promise).rejects.toThrow("Rename timed out");
        await vi.advanceTimersByTimeAsync(15000);
        await settled;
    });
});

describe("图片节点插入", () => {
    it("有编辑器时 应该在当前选区插入 image 节点并聚焦", () => {
        const { view, node, tr } = insertionView();
        const controller = createImageRequestController({ getEditor: () => fakeEditor(view) });

        controller.insertImageNode("webview://a.png", "alt");

        expect(view.state.schema.nodes.image.create).toHaveBeenCalledWith({
            src: "webview://a.png",
            alt: "alt",
            title: "",
        });
        expect(view.state.tr.replaceSelectionWith).toHaveBeenCalledWith(node);
        expect(view.dispatch).toHaveBeenCalledWith(tr);
        expect(view.focus).toHaveBeenCalled();
    });

    it("没有编辑器时 应该 安全 no-op", () => {
        const controller = createImageRequestController({ getEditor: () => null });
        expect(() => controller.insertImageNode("src", "")).not.toThrow();
    });
});

describe("消息路由", () => {
    it("非图片消息 应该 返回 false（交由入口继续路由）", () => {
        const controller = createImageRequestController({ getEditor: () => null });
        expect(controller.handleMessage({ type: "notice", message: "hi" })).toBe(false);
        expect(controller.handleMessage({ type: "lineMapUpdate", lineMap: [] })).toBe(false);
    });
});

describe("插入接线", () => {
    it("epytor:insertImage 事件 应该 打开图片选择器（选择器浮层出现）", () => {
        const controller = createImageRequestController({ getEditor: () => null });
        initImagePickerInsertion(controller);
        try {
            document.dispatchEvent(new Event("epytor:insertImage"));
            expect(document.querySelector(".epytor-img-picker-overlay")).not.toBeNull();
        } finally {
            closeImagePicker();
        }
    });

    it("粘贴图片文件 应该 发起上传请求", async () => {
        const controller = createImageRequestController({ getEditor: () => null });
        initImageDropPaste(document.createElement("div"), controller);
        const file = new File([new Uint8Array([1])], "paste.png", { type: "image/png" });
        const event = new Event("paste", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "clipboardData", {
            value: { items: [{ type: "image/png", getAsFile: () => file }] },
        });
        document.dispatchEvent(event);
        await vi.waitFor(() => {
            expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "uploadImage" }));
        });
    });

    it("拖拽图片文件到编辑器容器 应该 允许 drop 并发起上传", async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const controller = createImageRequestController({ getEditor: () => null });
        initImageDropPaste(container, controller);

        const file = new File([new Uint8Array([1])], "drop.png", { type: "image/png" });
        const over = new Event("dragover", { bubbles: true, cancelable: true });
        Object.defineProperty(over, "dataTransfer", {
            value: { items: [{ kind: "file", type: "image/png" }], files: [file] },
        });
        container.dispatchEvent(over);
        expect(over.defaultPrevented).toBe(true);

        const drop = new Event("drop", { bubbles: true, cancelable: true });
        Object.defineProperty(drop, "dataTransfer", { value: { files: [file] } });
        container.dispatchEvent(drop);
        await vi.waitFor(() => {
            expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "uploadImage" }));
        });
    });
});

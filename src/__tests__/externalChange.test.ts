import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MarkdownDocument } from "../MarkdownDocument";
import { ExternalChangeCoordinator, type ExternalChangeHost } from "../editor/externalChange";

const URI = vscode.Uri.file(path.join(os.tmpdir(), "epytor-external-change.md"));
const URI_KEY = URI.toString();
const readFileMock = () => vi.mocked(vscode.workspace.fs.readFile);

function setDiskContent(content: string): void {
    readFileMock().mockResolvedValue(Buffer.from(content, "utf-8"));
}

async function makeDocument(content: string): Promise<MarkdownDocument> {
    readFileMock().mockResolvedValueOnce(Buffer.from(content, "utf-8"));
    return MarkdownDocument.create(URI);
}

interface Harness {
    host: ExternalChangeHost;
    panel: { webview: { postMessage: ReturnType<typeof vi.fn> } };
}

function makeHost(overrides: Partial<ExternalChangeHost> = {}): Harness {
    const panel = { webview: { postMessage: vi.fn(async () => true) } };
    const host: ExternalChangeHost = {
        getPanel: vi.fn(() => panel as unknown as vscode.WebviewPanel),
        isPanelActive: vi.fn(() => false),
        getLastSaveTime: vi.fn((): number | undefined => undefined),
        getLastSavedContent: vi.fn((): string | undefined => undefined),
        isWebviewDirty: vi.fn(() => false),
        setWebviewDirty: vi.fn(),
        clearPushedContent: vi.fn(),
        seedLastSavedContent: vi.fn(),
        requestContentDetailed: vi.fn(async () => ({ content: "", authoritative: true })),
        prepareContentForDisplay: vi.fn(
            (_document, _panel, _uriKey, content: string) => `display:${content}`,
        ),
        buildDisplayPayload: vi.fn((_uriKey: string, content: string) => ({
            content,
            lineMap: [0],
            lineEndMap: [0],
            frontmatter: undefined,
            imageUriMap: {},
        })),
        refreshFileSize: vi.fn(async () => {}),
        markDirty: vi.fn(),
        ...overrides,
    };
    return { host, panel };
}

describe("ExternalChangeCoordinator 外部变更采纳", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it("回归（B1 defer-before-revert）：无法读取 webview 时 应该 不改文档模型、不推 revert", async () => {
        const document = await makeDocument("C1");
        setDiskContent("C2"); // 磁盘已被外部改成 C2
        const { host, panel } = makeHost({
            requestContentDetailed: vi.fn(async () => ({ content: "C1", authoritative: false })),
            getLastSavedContent: vi.fn(() => "C1"),
        });
        const coordinator = new ExternalChangeCoordinator(host);

        await coordinator.handle(document, URI_KEY);

        // 旧实现先 document.revert() 再把磁盘内容留在模型里，defer 期间重建会把磁盘内容喂给编辑器。
        expect(document.getText()).toBe("C1");
        expect(panel.webview.postMessage).not.toHaveBeenCalled();
        expect(coordinator.isDeferred(URI_KEY)).toBe(true);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    });

    it("采纳盘上内容时 应该 用读到的盘上文本更新模型并推 revert", async () => {
        const document = await makeDocument("C1");
        setDiskContent("C2");
        const { host, panel } = makeHost({
            requestContentDetailed: vi.fn(async () => ({ content: "C1", authoritative: true })),
            getLastSavedContent: vi.fn(() => "C1"),
        });
        const coordinator = new ExternalChangeCoordinator(host);

        await coordinator.handle(document, URI_KEY);

        expect(document.getText()).toBe("C2");
        expect(host.seedLastSavedContent).toHaveBeenCalledWith(URI_KEY, "C2");
        expect(panel.webview.postMessage).toHaveBeenCalledTimes(1);
        const posted = panel.webview.postMessage.mock.calls[0][0] as {
            type: string;
            content: string;
            lineMap: number[];
        };
        expect(posted.type).toBe("revert");
        expect(posted.content).toBe("display:C2");
        expect(posted.lineMap).toBeInstanceOf(Array);
        expect(host.refreshFileSize).toHaveBeenCalledWith(document, URI_KEY);
    });

    it("用户有未保存编辑时 应该 保留用户内容并报告 dirty", async () => {
        const document = await makeDocument("C1");
        setDiskContent("C2");
        const { host, panel } = makeHost({
            requestContentDetailed: vi.fn(async () => ({ content: "C1 edited", authoritative: true })),
            getLastSavedContent: vi.fn(() => "C1"),
        });
        const coordinator = new ExternalChangeCoordinator(host);

        await coordinator.handle(document, URI_KEY);

        expect(document.getText()).toBe("C1 edited");
        expect(host.markDirty).toHaveBeenCalledWith(document);
        expect(host.setWebviewDirty).toHaveBeenCalledWith(URI_KEY, true);
        expect(panel.webview.postMessage).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);
    });

    it("盘上内容与 webview 一致时 应该 忽略（不修改模型、不推消息）", async () => {
        const document = await makeDocument("C1");
        setDiskContent("same");
        const { host, panel } = makeHost({
            requestContentDetailed: vi.fn(async () => ({ content: "same", authoritative: true })),
            getLastSavedContent: vi.fn(() => "C1"),
        });

        await new ExternalChangeCoordinator(host).handle(document, URI_KEY);

        expect(document.getText()).toBe("C1");
        expect(panel.webview.postMessage).not.toHaveBeenCalled();
        expect(host.setWebviewDirty).not.toHaveBeenCalled();
    });

    it("磁盘暂时读不到时 应该 跳过本轮（不改模型、不弹警告）", async () => {
        const document = await makeDocument("C1");
        readFileMock().mockRejectedValue(new Error("OneDrive placeholder"));
        const { host, panel } = makeHost({
            requestContentDetailed: vi.fn(async () => ({ content: "C1", authoritative: true })),
        });

        await new ExternalChangeCoordinator(host).handle(document, URI_KEY);

        expect(document.getText()).toBe("C1");
        expect(panel.webview.postMessage).not.toHaveBeenCalled();
        expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
    });

    it("自己的保存冷却期内 应该 直接返回（不读盘、不拉取）", async () => {
        const document = await makeDocument("C1");
        setDiskContent("C2");
        const requestMock = vi.fn(async () => ({ content: "C1", authoritative: true }));
        const { host } = makeHost({
            requestContentDetailed: requestMock,
            getLastSaveTime: vi.fn(() => Date.now()),
        });

        await new ExternalChangeCoordinator(host).handle(document, URI_KEY);

        expect(requestMock).not.toHaveBeenCalled();
        expect(readFileMock()).toHaveBeenCalledTimes(1); // 只有打开文档那一次
        expect(document.getText()).toBe("C1");
    });

    it("面板已关闭时 应该 直接返回", async () => {
        const document = await makeDocument("C1");
        const requestMock = vi.fn(async () => ({ content: "C1", authoritative: true }));
        const { host } = makeHost({
            getPanel: vi.fn(() => undefined),
            requestContentDetailed: requestMock,
        });

        await new ExternalChangeCoordinator(host).handle(document, URI_KEY);

        expect(requestMock).not.toHaveBeenCalled();
    });

    it("defer 后活动面板只自动复查一次，避免重试风暴", async () => {
        vi.useFakeTimers();
        const document = await makeDocument("C1");
        setDiskContent("C2");
        const requestMock = vi.fn(async () => ({ content: "C1", authoritative: false }));
        const { host } = makeHost({
            requestContentDetailed: requestMock,
            getLastSavedContent: vi.fn(() => "C1"),
            isPanelActive: vi.fn(() => true),
        });
        const coordinator = new ExternalChangeCoordinator(host);

        await coordinator.handle(document, URI_KEY);
        expect(requestMock).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(1500);
        expect(requestMock).toHaveBeenCalledTimes(2);
        expect(coordinator.isDeferred(URI_KEY)).toBe(true);

        await vi.advanceTimersByTimeAsync(1500);
        expect(requestMock).toHaveBeenCalledTimes(2);
    });

    it("dispose 后 defer 记录与「只警告一次」去重 应该 都清掉", async () => {
        const document = await makeDocument("C1");
        setDiskContent("C2");
        const { host } = makeHost({
            requestContentDetailed: vi.fn(async () => ({ content: "C1", authoritative: false })),
            getLastSavedContent: vi.fn(() => "C1"),
        });
        const coordinator = new ExternalChangeCoordinator(host);

        await coordinator.handle(document, URI_KEY);
        expect(coordinator.isDeferred(URI_KEY)).toBe(true);
        coordinator.dispose(URI_KEY);
        expect(coordinator.isDeferred(URI_KEY)).toBe(false);

        await coordinator.handle(document, URI_KEY);
        expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(2);
    });

    it("保存成功 应该 清掉 defer 与复查标记", async () => {
        const document = await makeDocument("C1");
        setDiskContent("C2");
        const { host } = makeHost({
            requestContentDetailed: vi.fn(async () => ({ content: "C1", authoritative: false })),
            getLastSavedContent: vi.fn(() => "C1"),
        });
        const coordinator = new ExternalChangeCoordinator(host);

        await coordinator.handle(document, URI_KEY);
        expect(coordinator.isDeferred(URI_KEY)).toBe(true);
        coordinator.clearDeferred(URI_KEY);
        expect(coordinator.isDeferred(URI_KEY)).toBe(false);
    });
});

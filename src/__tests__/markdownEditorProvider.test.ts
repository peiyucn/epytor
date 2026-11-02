/**
 * MarkdownEditorProvider 的集成级单测：尽量走公共路径（openCustomDocument / resolveCustomEditor /
 * webview 消息 / onDidDispose 回调），不再直接调 private 方法。
 *
 * 背景：Provider 曾因 18 个 per-uri 容器漏清导致「重开文档被判成有未保存改动 → 失活即落盘」。
 * 第一组用例用反射枚举实例与各状态模块内部的 Map/Set，任何一个漏清都会红——新增容器时不需要
 * 记得改测试。
 */
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MarkdownEditorProvider } from "../MarkdownEditorProvider";
import type { MarkdownDocument } from "../MarkdownDocument";
import type { ToExtensionMessage } from "../../shared/messages";

const DOC_FS_PATH = path.join(os.tmpdir(), "epytor-provider-test-doc.md");
const DOC_URI = vscode.Uri.file(DOC_FS_PATH);
const URI_KEY = DOC_URI.toString();

const TOKEN = {
    isCancellationRequested: false,
    onCancellationRequested: vi.fn(),
} as unknown as vscode.CancellationToken;

const fsMock = vscode.workspace.fs;

/** VSCode FileStat needs timestamps; only `type`/`size` matter to the code under test. */
function fileStat(type: vscode.FileType, size = 0): vscode.FileStat {
    return { type, ctime: 0, mtime: 0, size };
}

interface FakeStatusBarItem {
    show: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    text: string;
    tooltip: string;
}

interface FakePanel {
    active: boolean;
    visible: boolean;
    viewColumn: number;
    posted: Array<Record<string, unknown>>;
    webview: {
        html: string;
        options: Record<string, unknown>;
        cspSource: string;
        asWebviewUri: (uri: { toString(): string }) => { toString(): string };
        postMessage: ReturnType<typeof vi.fn>;
        onDidReceiveMessage: (callback: (message: ToExtensionMessage) => Promise<void>) => { dispose(): void };
    };
    onDidDispose: (callback: () => void) => { dispose(): void };
    onDidChangeViewState: (callback: (event: { webviewPanel: FakePanel }) => void) => { dispose(): void };
    receive(message: ToExtensionMessage): Promise<void>;
    activate(active: boolean): void;
    dispose(): void;
}

interface Harness {
    provider: MarkdownEditorProvider;
    panel: FakePanel;
    document: MarkdownDocument;
    posted: Array<Record<string, unknown>>;
    statusBarItem: FakeStatusBarItem;
    activeEditorHandlers: Array<(editor: unknown) => void>;
    receive(message: ToExtensionMessage): Promise<void>;
    activate(active: boolean): void;
    disposePanel(): void;
    textEditor(): unknown;
}

function makeFakePanel(): FakePanel {
    const posted: Array<Record<string, unknown>> = [];
    const messageHandlers: Array<(message: ToExtensionMessage) => Promise<void>> = [];
    const disposeHandlers: Array<() => void> = [];
    const viewStateHandlers: Array<(event: { webviewPanel: FakePanel }) => void> = [];

    const panel: FakePanel = {
        active: true,
        visible: true,
        viewColumn: vscode.ViewColumn.One,
        posted,
        webview: {
            html: "",
            options: {},
            cspSource: "vscode-resource:",
            asWebviewUri: (uri) => uri,
            postMessage: vi.fn((message: Record<string, unknown>) => {
                posted.push(message);
                return Promise.resolve(true);
            }),
            onDidReceiveMessage: (callback) => {
                messageHandlers.push(callback);
                return { dispose: vi.fn() };
            },
        },
        onDidDispose: (callback) => {
            disposeHandlers.push(callback);
            return { dispose: vi.fn() };
        },
        onDidChangeViewState: (callback) => {
            viewStateHandlers.push(callback);
            return { dispose: vi.fn() };
        },
        async receive(message) {
            for (const handler of messageHandlers) { await handler(message); }
        },
        activate(active) {
            panel.active = active;
            for (const handler of [...viewStateHandlers]) { handler({ webviewPanel: panel }); }
        },
        dispose() {
            for (const callback of [...disposeHandlers]) { callback(); }
        },
    };
    return panel;
}

function perUriContainers(provider: MarkdownEditorProvider): Array<[string, Map<string, unknown> | Set<string>]> {
    const out: Array<[string, Map<string, unknown> | Set<string>]> = [];
    const collect = (owner: object, prefix: string): void => {
        for (const [name, value] of Object.entries(owner)) {
            if (value instanceof Map || value instanceof Set) {
                out.push([`${prefix}${name}`, value as Map<string, unknown> | Set<string>]);
            }
        }
    };
    collect(provider, "");
    // 状态已外移到独立所有者；新增这类所有者时在这里登记，让「一个都不能漏」继续成立。
    for (const ownerName of ["_navigation", "_statusBar", "_externalChange"]) {
        const owner = (provider as unknown as Record<string, unknown>)[ownerName];
        if (owner && typeof owner === "object") { collect(owner, `${ownerName}.`); }
    }
    // 全局容器：键不是 uriKey，不应随面板关闭清理。当前没有。
    return out;
}

function lastStatusBarItem(): FakeStatusBarItem {
    const results = vi.mocked(vscode.window.createStatusBarItem).mock.results;
    return results[results.length - 1].value as FakeStatusBarItem;
}

function testContext(): vscode.ExtensionContext {
    return {
        subscriptions: [],
        extensionUri: vscode.Uri.file(process.cwd()),
        // 目录路径中放一个文件名：WriteAudit 的 mkdir 会失败并被记录，但绝不写真实磁盘。
        logUri: vscode.Uri.file(path.join(process.cwd(), "package.json", "epytor-test-logs")),
    } as unknown as vscode.ExtensionContext;
}

async function waitForPosted(
    posted: Array<Record<string, unknown>>,
    type: string,
): Promise<Record<string, unknown>> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        const found = posted.find((message) => message.type === type);
        if (found) { return found; }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error(`webview 未收到消息：${type}`);
}

describe("MarkdownEditorProvider", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let harness: Harness | undefined;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
            get: vi.fn((_key: string, defaultValue?: unknown) => defaultValue),
            inspect: vi.fn(() => undefined),
        } as unknown as vscode.WorkspaceConfiguration);
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);
        (vscode.workspace as unknown as {
            workspaceFolders: vscode.WorkspaceFolder[] | undefined;
        }).workspaceFolders = undefined;
        vi.mocked(fsMock.stat).mockResolvedValue(fileStat(vscode.FileType.File));
        vi.mocked(fsMock.writeFile).mockResolvedValue();
        vi.mocked(fsMock.readDirectory).mockResolvedValue([]);
        vi.mocked(fsMock.readFile).mockResolvedValue(Buffer.from("base", "utf-8"));
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
        vi.mocked(vscode.env.openExternal).mockResolvedValue(true);
        vi.spyOn(console, "warn").mockImplementation(() => {});
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(async () => {
        harness?.disposePanel();
        harness = undefined;
        // Queued audit writes are asynchronous (and fail with ENOTDIR here); let them settle
        // while the console spies are still installed so they cannot pollute the test output.
        await new Promise((resolve) => setTimeout(resolve, 0));
        vi.restoreAllMocks();
    });

    async function openHarness(initialContent: string): Promise<Harness> {
        const activeEditorHandlers: Array<(editor: unknown) => void> = [];
        vi.mocked(vscode.window.onDidChangeActiveTextEditor).mockImplementation((callback) => {
            activeEditorHandlers.push(callback as (editor: unknown) => void);
            return { dispose: vi.fn() };
        });
        vi.mocked(vscode.window.onDidChangeTextEditorVisibleRanges).mockImplementation(() => ({
            dispose: vi.fn(),
        }));

        const provider = new MarkdownEditorProvider(testContext());
        const statusBarItem = lastStatusBarItem();
        const panel = makeFakePanel();

        vi.mocked(fsMock.readFile).mockResolvedValueOnce(Buffer.from(initialContent, "utf-8"));
        const document = await provider.openCustomDocument(
            DOC_URI,
            {} as vscode.CustomDocumentOpenContext,
            TOKEN,
        );
        await provider.resolveCustomEditor(document, panel as unknown as vscode.WebviewPanel, TOKEN);
        statusBarItem.show.mockClear();
        statusBarItem.hide.mockClear();
        harness = {
            provider,
            panel,
            document,
            posted: panel.posted,
            statusBarItem,
            activeEditorHandlers,
            receive: (message) => panel.receive(message),
            activate: (active) => { panel.activate(active); },
            disposePanel: () => { panel.dispose(); },
            textEditor: () => ({
                document: { uri: DOC_URI, lineCount: 200 },
                selection: undefined,
                revealRange: vi.fn(),
            }),
        };
        return harness;
    }

    function postedOfType(target: Harness, type: string): Record<string, unknown> {
        const found = target.posted.find((message) => message.type === type);
        if (!found) { throw new Error(`未发送消息 ${type}`); }
        return found;
    }

    /** ready + 激活，使保存等拉取路径可用（canAskWebview 前置条件）。 */
    async function readyAndActivate(target: Harness): Promise<void> {
        await target.receive({ type: "ready" });
        target.activate(true);
    }

    describe("状态清理（A1 回归）", () => {
        it("面板 dispose 后 应该 清空**每一个** per-uri 容器（漏一个就会留下陈旧脏标记）", async () => {
            const target = await openHarness("content");
            const containers = perUriContainers(target.provider);
            expect(containers.length).toBeGreaterThan(12);

            for (const [, container] of containers) {
                if (container instanceof Map) { container.set(URI_KEY, 1); }
                else { container.add(URI_KEY); }
            }

            target.disposePanel();

            const leftover = containers
                .filter(([, container]) => container.has(URI_KEY))
                .map(([name]) => name);
            expect(leftover).toEqual([]);
            expect(target.provider.hasPanel(DOC_URI)).toBe(false);
        });
    });

    describe("打开与生命周期", () => {
        it("openCustomDocument 应该 从磁盘读取内容", async () => {
            vi.mocked(fsMock.readFile).mockResolvedValueOnce(Buffer.from("hello", "utf-8"));
            const provider = new MarkdownEditorProvider(testContext());
            const document = await provider.openCustomDocument(
                DOC_URI,
                {} as vscode.CustomDocumentOpenContext,
                TOKEN,
            );
            expect(document.getText()).toBe("hello");
        });

        it("非 file scheme（如 git diff） 应该 渲染空页面且不注册面板", async () => {
            vi.mocked(fsMock.readFile).mockResolvedValueOnce(Buffer.from("", "utf-8"));
            const provider = new MarkdownEditorProvider(testContext());
            const panel = makeFakePanel();
            const diffUri = vscode.Uri.parse("git:doc.md");
            const document = await provider.openCustomDocument(
                diffUri,
                {} as vscode.CustomDocumentOpenContext,
                TOKEN,
            );
            await provider.resolveCustomEditor(document, panel as unknown as vscode.WebviewPanel, TOKEN);

            expect(panel.webview.html).toContain("<html>");
            expect(provider.hasPanel(diffUri)).toBe(false);
        });

        it("ready 应该 下发 init 负载（内容/行映射/序列化模式/激活态）", async () => {
            const target = await openHarness("---\ntitle: t\n---\n\n# hi\n");
            await target.receive({ type: "ready" });

            const init = postedOfType(target, "init");
            expect(init.content).toBe("\n# hi\n");
            expect(init.frontmatter).toBe("---\ntitle: t\n---\n");
            expect(init.serializationMode).toBe("clean");
            expect(init.active).toBe(true);
            expect(init.lineMap).toBeInstanceOf(Array);
            expect((init.lineMap as number[]).length).toBeGreaterThan(0);
            expect(init.scrollToLine).toBeUndefined();
        });

        it("ready 前登记的全局 revealLine 应该 随 init 下发一次", async () => {
            const target = await openHarness("body");
            target.provider.setGlobalRevealLine(9);
            await target.receive({ type: "ready" });
            expect(postedOfType(target, "init").scrollToLine).toBe(9);
        });

        it("ready 前登记的待导航 应该 随 init 下发一次", async () => {
            const target = await openHarness("body");
            target.provider.setPendingNavigation(DOC_FS_PATH, 42);
            await target.receive({ type: "ready" });
            expect(postedOfType(target, "init").scrollToLine).toBe(42);
        });

        it("hasPanel/postToPanel/postToAll 应该 面向已打开的面板", async () => {
            const target = await openHarness("body");
            expect(target.provider.hasPanel(DOC_URI)).toBe(true);
            target.provider.postToPanel(DOC_URI, { type: "requestContent" });
            target.provider.postToAll({ type: "requestContent" });
            expect(target.panel.webview.postMessage).toHaveBeenCalledWith({ type: "requestContent" });
            expect(target.panel.webview.postMessage).toHaveBeenCalledTimes(2);
        });
    });

    describe("消息路由", () => {
        it("wordCount 应该 刷新状态栏；viewportLine 应该 在切回文本编辑器时定位", async () => {
            const target = await openHarness("body");
            await readyAndActivate(target);

            await target.receive({
                type: "wordCount",
                lines: 3,
                words: 10,
                charsNoSpace: 20,
                charsWithSpace: 30,
            });
            expect(target.statusBarItem.text).toContain("Words: 10");
            expect(target.statusBarItem.show).toHaveBeenCalled();

            await target.receive({ type: "viewportLine", line: 7 });
            const editor = target.textEditor() as {
                selection: unknown;
                revealRange: ReturnType<typeof vi.fn>;
            };
            target.activeEditorHandlers[0](editor);
            const revealType = editor.revealRange.mock.calls[0][1] as number;
            expect(revealType).toBe(vscode.TextEditorRevealType.AtTop);
            const range = editor.revealRange.mock.calls[0][0] as vscode.Range;
            expect(range.start.line).toBe(6);
        });

        it("openUrl 应该 只放行白名单 scheme", async () => {
            const target = await openHarness("body");
            await target.receive({ type: "openUrl", url: "javascript:alert(1)" });
            expect(vscode.env.openExternal).not.toHaveBeenCalled();

            await target.receive({ type: "openUrl", url: "https://example.com" });
            expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
        });

        it("openSettings 失败 应该 记录日志而不是静默（A8）", async () => {
            const target = await openHarness("body");
            vi.mocked(vscode.commands.executeCommand).mockRejectedValueOnce(new Error("unknown command"));
            await target.receive({ type: "openSettings" });
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(errorSpy).toHaveBeenCalledWith(
                "[epytor] openSettings failed:",
                expect.any(Error),
            );
            void target;
        });

        it("图片 handler 抛错 应该 记录日志而不是空 catch 吞掉（B9）", async () => {
            const target = await openHarness("body");
            vi.mocked(vscode.workspace.getConfiguration).mockImplementation(() => {
                throw new Error("configuration exploded");
            });

            await target.receive({ type: "getProjectImages", id: "req-images" });
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(errorSpy).toHaveBeenCalledWith(
                "[epytor] project images failed:",
                expect.any(Error),
            );
        });

        it("消息处理抛错 应该 被入口兜住并记录 message.type（A2）", async () => {
            const target = await openHarness("body");
            vi.mocked(vscode.commands.executeCommand).mockImplementation(() => {
                throw new Error("vscode.openWith exploded");
            });

            await expect(target.receive({ type: "openFile", path: "other.md" })).resolves.toBeUndefined();
            expect(errorSpy).toHaveBeenCalledWith(
                "[epytor] webview message handler failed:",
                "openFile",
                expect.any(Error),
            );
        });
    });

    describe("保存链路", () => {
        it("空保存守卫：缓冲等于上次写入、文档模型已是别的文本 应该 跳过写盘", async () => {
            const target = await openHarness("base");
            await readyAndActivate(target);
            // 外部写入被采纳后模型与 lastSaved 不同（模拟）；此时一次 stale flush 不得写回。
            target.document.update("external-version");
            vi.mocked(fsMock.readFile).mockResolvedValue(Buffer.from("external-version", "utf-8"));

            const savePromise = target.provider.saveCustomDocument(target.document, TOKEN);
            await waitForPosted(target.posted, "requestContent");
            await target.receive({ type: "contentResponse", content: "base" });
            await savePromise;

            expect(fsMock.writeFile).not.toHaveBeenCalled();
        });

        it("回归（B2b）：空保存守卫 应该 读真实盘上文本，内存模型滞后时也要拦住回滚", async () => {
            const target = await openHarness("base");
            await readyAndActivate(target);
            // 外部改动尚未采纳：document.getText() 仍是旧内容，但盘上已是新内容。
            vi.mocked(fsMock.readFile).mockResolvedValue(Buffer.from("disk-new", "utf-8"));

            const savePromise = target.provider.saveCustomDocument(target.document, TOKEN);
            await waitForPosted(target.posted, "requestContent");
            await target.receive({ type: "contentResponse", content: "base" });
            await savePromise;

            expect(fsMock.readFile).toHaveBeenCalled();
            expect(fsMock.writeFile).not.toHaveBeenCalled();
        });

        it("有真实编辑 应该 拉取 webview 序列化内容并写盘", async () => {
            const target = await openHarness("base");
            await readyAndActivate(target);

            const savePromise = target.provider.saveCustomDocument(target.document, TOKEN);
            await waitForPosted(target.posted, "requestContent");
            await target.receive({ type: "contentResponse", content: "edited" });
            await savePromise;

            expect(fsMock.writeFile).toHaveBeenCalledWith(
                expect.objectContaining({ fsPath: DOC_FS_PATH }),
                Buffer.from("edited", "utf-8"),
            );
            expect(target.document.getText()).toBe("edited");
        });

        it("回归（B2）：切换源码视图时 缓冲无新内容且磁盘已变 应该 跳过写盘", async () => {
            const target = await openHarness("base");
            await readyAndActivate(target);
            vi.mocked(fsMock.readFile).mockResolvedValue(Buffer.from("disk-new", "utf-8"));

            const switchPromise = target.receive({ type: "switchToTextEditor" });
            await waitForPosted(target.posted, "requestContent");
            await target.receive({ type: "contentResponse", content: "base" });
            await switchPromise;

            expect(fsMock.writeFile).not.toHaveBeenCalled();
            expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith("reopenActiveEditorWith", "default");
        });

        it("切换源码视图时 有真实编辑 应该 先写盘再切换", async () => {
            const target = await openHarness("base");
            await readyAndActivate(target);
            // 磁盘与上次保存相同（无外部写入），本次拉取的内容是真实编辑。
            vi.mocked(fsMock.readFile).mockResolvedValue(Buffer.from("base", "utf-8"));

            const switchPromise = target.receive({ type: "switchToTextEditor" });
            await waitForPosted(target.posted, "requestContent");
            await target.receive({ type: "contentResponse", content: "base+edit" });
            await switchPromise;

            expect(errorSpy).not.toHaveBeenCalled();
            expect(fsMock.writeFile).toHaveBeenCalledWith(
                expect.objectContaining({ fsPath: DOC_FS_PATH }),
                Buffer.from("base+edit", "utf-8"),
            );
        });

        it("saveCustomDocumentAs 应该 先拉取最新内容再写到目标", async () => {
            const target = await openHarness("base");
            await readyAndActivate(target);
            const destination = vscode.Uri.file(path.join(os.tmpdir(), "copy.md"));

            const savePromise = target.provider.saveCustomDocumentAs(target.document, destination, TOKEN);
            await waitForPosted(target.posted, "requestContent");
            await target.receive({ type: "contentResponse", content: "edited-as" });
            await savePromise;

            expect(fsMock.writeFile).toHaveBeenCalledWith(
                expect.objectContaining({ fsPath: destination.fsPath }),
                Buffer.from("edited-as", "utf-8"),
            );
        });

        it("revertCustomDocument 应该 重读磁盘并推 revert 负载", async () => {
            const target = await openHarness("base");
            vi.mocked(fsMock.readFile).mockResolvedValue(Buffer.from("disk-version", "utf-8"));

            await target.provider.revertCustomDocument(target.document, TOKEN);

            expect(target.document.getText()).toBe("disk-version");
            const revert = postedOfType(target, "revert");
            expect(revert.content).toBe("disk-version");
            expect(revert.lineMap).toBeInstanceOf(Array);
        });

        it("backupCustomDocument 应该 先拉取最新内容再备份", async () => {
            const target = await openHarness("base");
            await readyAndActivate(target);
            const destination = vscode.Uri.file(path.join(os.tmpdir(), "backup.md"));

            const backupPromise = target.provider.backupCustomDocument(
                target.document,
                { destination } as vscode.CustomDocumentBackupContext,
                TOKEN,
            );
            await waitForPosted(target.posted, "requestContent");
            await target.receive({ type: "contentResponse", content: "latest" });
            await backupPromise;

            expect(fsMock.writeFile).toHaveBeenCalledWith(
                expect.objectContaining({ fsPath: destination.fsPath }),
                Buffer.from("latest", "utf-8"),
            );
        });

        it("ready 后 应该 用 stat 结果更新状态栏文件大小", async () => {
            const target = await openHarness("body");
            vi.mocked(fsMock.stat).mockResolvedValue(fileStat(vscode.FileType.File, 1024));
            await readyAndActivate(target);
            await target.receive({
                type: "wordCount",
                lines: 1,
                words: 2,
                charsNoSpace: 3,
                charsWithSpace: 4,
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(target.statusBarItem.text).toContain("Size: 1.0 KB");
        });
    });
});

import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
    handleGetPathSuggestions,
    handleGetProjectImages,
    handleImageRename,
    handleImageUpload,
    handleResolveImagePath,
    type ImageHandlerContext,
} from "../editor/imageMessageHandlers";

const ROOT = path.resolve(path.sep, "proj");
const DOC_DIR = path.join(ROOT, "docs");
const DOC_PATH = path.join(DOC_DIR, "note.md");

interface Harness {
    ctx: ImageHandlerContext;
    posted: Array<Record<string, unknown>>;
    mappings: Map<string, string>;
}

function makeHarness(documentPath = DOC_PATH): Harness {
    const posted: Array<Record<string, unknown>> = [];
    const mappings = new Map<string, string>();
    const panel = {
        webview: {
            postMessage: vi.fn((message: Record<string, unknown>) => {
                posted.push(message);
                return Promise.resolve(true);
            }),
            asWebviewUri: vi.fn((uri: { fsPath: string }) => ({
                toString: () => `wv:${uri.fsPath}`,
            })),
        },
    };
    const documentUri = vscode.Uri.file(documentPath);
    return {
        posted,
        mappings,
        ctx: {
            documentUri,
            panel: panel as unknown as vscode.WebviewPanel,
            uriKey: documentUri.toString(),
            registerImageMapping: (webviewUri, displayPath) => { mappings.set(webviewUri, displayPath); },
            getImageMapping: (webviewUri) => mappings.get(webviewUri),
            deleteImageMapping: (webviewUri) => { mappings.delete(webviewUri); },
        },
    };
}

function mockConfiguration(values: Record<string, unknown>, workspaceLevelKeys: string[] = []): void {
    vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
        get: vi.fn((key: string, defaultValue?: unknown) =>
            Object.prototype.hasOwnProperty.call(values, key) ? values[key] : defaultValue),
        inspect: vi.fn((key: string) => (
            workspaceLevelKeys.includes(key) ? { workspaceValue: values[key] } : undefined
        )),
    } as unknown as vscode.WorkspaceConfiguration);
}

function setWorkspaceRoot(root: string | undefined): void {
    const folder = root === undefined
        ? undefined
        : { uri: vscode.Uri.file(root), name: "proj", index: 0 };
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(folder);
    // Path-completion resolves its own folder by prefix, so both views must agree.
    (vscode.workspace as unknown as {
        workspaceFolders: vscode.WorkspaceFolder[] | undefined;
    }).workspaceFolders = folder ? [folder] : undefined;
}

/** VSCode FileStat needs timestamps; only `type`/`size` matter to the code under test. */
function fileStat(type: vscode.FileType, size = 0): vscode.FileStat {
    return { type, ctime: 0, mtime: 0, size };
}

const fsMock = vscode.workspace.fs;

describe("ImageMessageHandlers 图片消息处理", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        setWorkspaceRoot(undefined);
        mockConfiguration({});
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("handleImageUpload 图片上传/本地保存", () => {
        it("超过大小上限 应该 回 imageUploadError 且不写盘", async () => {
            mockConfiguration({ imageStorage: "local" });
            const harness = makeHarness();
            const huge = new Uint8Array(20 * 1024 * 1024 + 1);

            await handleImageUpload(harness.ctx, "req-1", huge, "image/png", "pic");

            expect(harness.posted).toEqual([
                { type: "imageUploadError", id: "req-1", error: expect.stringContaining("Image too large") },
            ]);
            expect(fsMock.writeFile).not.toHaveBeenCalled();
        });

        it("本地保存成功 应该 登记映射并回 imageUploaded", async () => {
            mockConfiguration({ imageStorage: "local" });
            vi.mocked(fsMock.stat).mockRejectedValue(new Error("ENOENT"));
            vi.mocked(fsMock.readDirectory).mockResolvedValue([]);
            vi.mocked(fsMock.writeFile).mockResolvedValue();
            const harness = makeHarness();

            await handleImageUpload(harness.ctx, "req-2", new Uint8Array([1, 2, 3]), "image/png", "pic");

            expect(fsMock.writeFile).toHaveBeenCalledTimes(1);
            expect(harness.posted).toHaveLength(1);
            expect(harness.posted[0].type).toBe("imageUploaded");
            const uploadedUrl = harness.posted[0].url as string;
            expect(harness.mappings.get(uploadedUrl)).toMatch(/^\.\/images\//);
        });

        it("工作区级 imageLocalPath 越界降级 应该 弹一次 notice（A15）", async () => {
            mockConfiguration({ imageStorage: "local", imageLocalPath: "../../outside" }, ["imageLocalPath"]);
            setWorkspaceRoot(ROOT);
            vi.mocked(fsMock.stat).mockRejectedValue(new Error("ENOENT"));
            vi.mocked(fsMock.readDirectory).mockResolvedValue([]);
            vi.mocked(fsMock.writeFile).mockResolvedValue();
            const harness = makeHarness();

            await handleImageUpload(harness.ctx, "req-3", new Uint8Array([1]), "image/png", "pic");

            const notice = harness.posted.find((message) => message.type === "notice");
            expect(notice?.message).toContain("outside the workspace");
            expect(harness.posted.some((message) => message.type === "imageUploaded")).toBe(true);
        });
    });

    describe("handleGetProjectImages 图库列举", () => {
        it("目录读不到 应该 弹可见 notice（A9：不再静默空列表）", async () => {
            const harness = makeHarness();
            vi.mocked(fsMock.stat).mockResolvedValue(fileStat(vscode.FileType.Directory));
            vi.mocked(fsMock.readDirectory).mockRejectedValue(new Error("EACCES"));

            await handleGetProjectImages(harness.ctx, "req-4");

            const notice = harness.posted.find((message) => message.type === "notice");
            expect(notice?.message).toBe("Cannot read image folder: EACCES");
            const list = harness.posted.find((message) => message.type === "projectImagesList");
            expect(list?.images).toEqual([]);
        });

        it("应该 只列出图片并登记 webview 映射", async () => {
            const harness = makeHarness();
            vi.mocked(fsMock.stat).mockResolvedValue(fileStat(vscode.FileType.Directory));
            vi.mocked(fsMock.readDirectory).mockResolvedValue([
                ["a.png", vscode.FileType.File],
                ["b.txt", vscode.FileType.File],
            ]);

            await handleGetProjectImages(harness.ctx, "req-5");

            const list = harness.posted.find((message) => message.type === "projectImagesList");
            const images = list?.images as Array<{ relPath: string; name: string }>;
            expect(images).toHaveLength(1);
            expect(images[0].name).toBe("a.png");
            expect(images[0].relPath).toMatch(/^\.\/images\/a\.png$/);
        });
    });

    describe("handleImageRename 图片重命名", () => {
        it("映射不存在 应该 回错", async () => {
            const harness = makeHarness();
            await handleImageRename(harness.ctx, "req-6", "wv:unknown", "new-name");
            expect(harness.posted[0]).toEqual({
                type: "imageRenameError",
                id: "req-6",
                error: "Image not found in URI map",
            });
        });

        it("回归（B3）：`@/` 写法的图片 应该 按工作区根解析并重命名成功", async () => {
            setWorkspaceRoot(ROOT);
            const oldAbsPath = path.join(ROOT, "assets", "a.png");
            const oldWebviewUri = `wv:${oldAbsPath}`;
            const harness = makeHarness();
            harness.mappings.set(oldWebviewUri, "@/assets/a.png");
            vi.mocked(fsMock.stat)
                .mockResolvedValueOnce(fileStat(vscode.FileType.File))
                .mockRejectedValueOnce(new Error("ENOENT")); // 目标不存在 → 允许重命名
            vi.mocked(fsMock.rename).mockResolvedValue();

            await handleImageRename(harness.ctx, "req-7", oldWebviewUri, "renamed");

            const targetPath = path.join(ROOT, "assets", "renamed.png");
            expect(fsMock.rename).toHaveBeenCalledWith(
                expect.objectContaining({ fsPath: oldAbsPath }),
                expect.objectContaining({ fsPath: targetPath }),
            );
            const renamed = harness.posted.find((message) => message.type === "imageRenamed");
            expect(renamed?.newRelPath).toBe("../assets/renamed.png");
            expect(harness.mappings.has(oldWebviewUri)).toBe(false);
            expect(harness.mappings.get(renamed?.newWebviewUri as string)).toBe("../assets/renamed.png");
        });

        it("目标文件已存在 应该 回错且不覆盖", async () => {
            setWorkspaceRoot(ROOT);
            const oldWebviewUri = `wv:${path.join(ROOT, "assets", "a.png")}`;
            const harness = makeHarness();
            harness.mappings.set(oldWebviewUri, "assets/a.png");
            vi.mocked(fsMock.stat).mockResolvedValue(fileStat(vscode.FileType.File));

            await handleImageRename(harness.ctx, "req-8", oldWebviewUri, "b");

            expect(fsMock.rename).not.toHaveBeenCalled();
            expect(harness.posted[0].type).toBe("imageRenameError");
        });
    });

    describe("handleGetPathSuggestions 路径补全", () => {
        it("空查询 应该 立刻回空列表", async () => {
            const harness = makeHarness();
            await handleGetPathSuggestions(harness.ctx, "req-9", "   ");
            expect(harness.posted).toEqual([{ type: "pathSuggestions", id: "req-9", items: [] }]);
        });

        it("回归（B4）：无工作区时 `@/a/b/` 应该 拼在文档目录下，而不是丢弃剩余路径", async () => {
            setWorkspaceRoot(undefined);
            vi.mocked(fsMock.readDirectory).mockResolvedValue([]);
            const harness = makeHarness();

            await handleGetPathSuggestions(harness.ctx, "req-10", "@/a/b/");

            expect(fsMock.readDirectory).toHaveBeenCalledWith(
                expect.objectContaining({ fsPath: path.join(DOC_DIR, "a", "b") + path.sep }),
            );
        });

        it("有工作区时 `@/` 应该 列出工作区根，目录优先并限制条数", async () => {
            setWorkspaceRoot(ROOT);
            const entries: Array<[string, number]> = [];
            for (let i = 0; i < 20; i += 1) {
                entries.push([`file-${String(i).padStart(2, "0")}.md`, vscode.FileType.File]);
            }
            entries.push(["zz-dir", vscode.FileType.Directory]);
            vi.mocked(fsMock.readDirectory).mockResolvedValue(entries as [string, vscode.FileType][]);
            const harness = makeHarness();

            await handleGetPathSuggestions(harness.ctx, "req-11", "@/");

            const result = harness.posted[0].items as Array<{ path: string; isDir: boolean }>;
            expect(result).toHaveLength(15);
            expect(result[0]).toEqual({ path: "@/zz-dir/", isDir: true, webviewUri: undefined });
            expect(fsMock.readDirectory).toHaveBeenCalledWith(
                expect.objectContaining({ fsPath: ROOT }),
            );
        });

        it("目录读不到 应该 回空列表（保持既有静默语义）", async () => {
            setWorkspaceRoot(ROOT);
            vi.mocked(fsMock.readDirectory).mockRejectedValue(new Error("EACCES"));
            const harness = makeHarness();
            await handleGetPathSuggestions(harness.ctx, "req-12", "@");
            expect(harness.posted).toEqual([{ type: "pathSuggestions", id: "req-12", items: [] }]);
        });
    });

    describe("handleResolveImagePath 图片路径解析", () => {
        it("回归（B5）：用异步 stat 判断存在，存在时回 imagePathResolved", async () => {
            const absPath = path.join(DOC_DIR, "images", "a.png");
            vi.mocked(fsMock.stat).mockResolvedValue(fileStat(vscode.FileType.File));
            const harness = makeHarness();

            await handleResolveImagePath(harness.ctx, "req-13", "./images/a.png");

            expect(harness.posted).toEqual([{
                type: "imagePathResolved",
                id: "req-13",
                webviewUri: `wv:${absPath}`,
            }]);
            expect(harness.mappings.get(`wv:${absPath}`)).toBe("./images/a.png");
        });

        it("文件不存在 应该 不回消息（webview 超时兜底）", async () => {
            vi.mocked(fsMock.stat).mockRejectedValue(new Error("ENOENT"));
            const harness = makeHarness();

            await handleResolveImagePath(harness.ctx, "req-14", "./images/missing.png");

            expect(harness.posted).toEqual([]);
        });

        it("解析异常 应该 记录警告且不抛出", async () => {
            vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation(() => {
                throw new Error("workspace cache broken");
            });
            const harness = makeHarness();

            await expect(handleResolveImagePath(harness.ctx, "req-15", "a.png")).resolves.toBeUndefined();
            expect(warnSpy).toHaveBeenCalled();
        });
    });
});

import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { openPathLink, type PathLinkHost } from "../editor/pathLinks";

const ROOT = path.resolve(path.sep, "proj");
const DOC_PATH = path.join(ROOT, "docs", "note.md");

function setWorkspaceRoot(root: string | undefined): void {
    const folder = root === undefined
        ? undefined
        : { uri: vscode.Uri.file(root), name: "proj", index: 0 };
    vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(folder);
    (vscode.workspace as unknown as {
        workspaceFolders: vscode.WorkspaceFolder[] | undefined;
    }).workspaceFolders = folder ? [folder] : undefined;
}

function makeHost(): PathLinkHost {
    return {
        viewType: "epytor.editor",
        setPendingNavigation: vi.fn(),
    };
}

describe("openPathLink 路径链接", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);
        vi.mocked(vscode.workspace.openTextDocument).mockResolvedValue({
            uri: vscode.Uri.file("ignored"),
        } as unknown as vscode.TextDocument);
        vi.mocked(vscode.window.showTextDocument).mockResolvedValue({} as unknown as vscode.TextEditor);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("工作区内的 md 链接 应该 用自定义编辑器打开并登记导航行", async () => {
        setWorkspaceRoot(ROOT);
        const host = makeHost();

        await openPathLink(DOC_PATH, "b.md#20", host);

        expect(host.setPendingNavigation).toHaveBeenCalledWith(
            path.join(ROOT, "docs", "b.md"),
            20,
        );
        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            "vscode.openWith",
            expect.objectContaining({ fsPath: path.join(ROOT, "docs", "b.md") }),
            "epytor.editor",
            { preview: true },
        );
    });

    it("`@/` 链接 应该 解析到工作区根", async () => {
        setWorkspaceRoot(ROOT);
        const host = makeHost();

        await openPathLink(DOC_PATH, "@/notes/x.md", host);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            "vscode.openWith",
            expect.objectContaining({ fsPath: path.join(ROOT, "notes", "x.md") }),
            "epytor.editor",
            { preview: true },
        );
    });

    it("越界（../ 到工作区外）链接 应该 拒绝打开（回归：恶意仓库打开任意本地文件）", async () => {
        setWorkspaceRoot(ROOT);
        const host = makeHost();

        await openPathLink(DOC_PATH, "../../outside/x.md", host);

        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
        expect(host.setPendingNavigation).not.toHaveBeenCalled();
    });

    it("非 md 链接无行号 应该 交给 vscode.open", async () => {
        setWorkspaceRoot(ROOT);
        const host = makeHost();

        await openPathLink(DOC_PATH, "assets/data.json", host);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            "vscode.open",
            expect.objectContaining({ fsPath: path.join(ROOT, "docs", "assets", "data.json") }),
        );
    });

    it("非 md 链接带行号 应该 在文本编辑器里打开并选中该行", async () => {
        setWorkspaceRoot(ROOT);
        const host = makeHost();

        await openPathLink(DOC_PATH, "code.ts#5", host);

        const showOptions = vi.mocked(vscode.window.showTextDocument).mock.calls[0][1] as {
            selection: vscode.Range;
        };
        expect(showOptions.selection.start.line).toBe(4);
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("无工作区时 相对链接 应该 相对文档目录解析（不做越界限制）", async () => {
        setWorkspaceRoot(undefined);
        const host = makeHost();

        await openPathLink(DOC_PATH, "sibling.md", host);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            "vscode.openWith",
            expect.objectContaining({ fsPath: path.join(ROOT, "docs", "sibling.md") }),
            "epytor.editor",
            { preview: true },
        );
    });

    it("工作区外的独立文档 `@/` 链接 应该 相对文档目录解析（即使开了别的 workspace）", async () => {
        const folder = { uri: vscode.Uri.file(ROOT), name: "proj", index: 0 };
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);
        (vscode.workspace as unknown as {
            workspaceFolders: vscode.WorkspaceFolder[] | undefined;
        }).workspaceFolders = [folder];
        const outsideDoc = path.join(path.resolve(path.sep, "outside"), "note.md");
        const host = makeHost();

        await openPathLink(outsideDoc, "@/sibling.md", host);

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
            "vscode.openWith",
            expect.objectContaining({ fsPath: path.join(path.dirname(outsideDoc), "sibling.md") }),
            "epytor.editor",
            { preview: true },
        );
    });
});

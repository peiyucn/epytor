/**
 * 文档相对路径解析（A4：原来 4 处各写一份，且「无工作区时 `@/` 回退到哪」并不一致）。
 *
 * 这些用例同时是「口径」的文档：`@/` = 工作区根；其余（含 `./`、`../`、裸名）相对文档目录；
 * 无工作区时 `@/` 统一回退文档目录（原 openFile 的父目录口径已按 owner 决定统一，见 task B4）。
 * 期望值用 `path` 自身构造，避免 Windows 盘符/分隔符导致的平台差异。
 */
import * as path from "path";
import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { resolveDocPath, resolveWorkspaceRoot } from "../utils/docPath";

const ROOT = path.resolve(path.sep, "proj");
const DOC = path.join(ROOT, "docs", "note.md");
const WITH_WS = { docFsPath: DOC, workspaceRoot: ROOT };
const NO_WS = { docFsPath: DOC, workspaceRoot: null };

describe("resolveDocPath 文档相对路径", () => {
    it("普通相对路径 应该 相对文档目录解析", () => {
        expect(resolveDocPath("images/a.png", WITH_WS)).toBe(path.join(ROOT, "docs", "images", "a.png"));
        expect(resolveDocPath("./images/a.png", WITH_WS)).toBe(path.join(ROOT, "docs", "images", "a.png"));
        expect(resolveDocPath("../shared/a.png", WITH_WS)).toBe(path.join(ROOT, "shared", "a.png"));
    });

    it("绝对路径 应该 原样保留", () => {
        const abs = path.join(ROOT, "abs", "a.png");
        expect(resolveDocPath(abs, WITH_WS)).toBe(abs);
    });

    it("`@/` 有工作区时 应该 指向工作区根", () => {
        expect(resolveDocPath("@/assets/a.png", WITH_WS)).toBe(path.join(ROOT, "assets", "a.png"));
    });

    it("`@/` 无工作区时 应该 统一回退文档目录（含 openFile 路径）", () => {
        expect(resolveDocPath("@/assets/a.png", NO_WS)).toBe(path.join(ROOT, "docs", "assets", "a.png"));
    });

    it("空串 应该 解析为文档目录（路径补全列目录用）", () => {
        expect(resolveDocPath("", WITH_WS)).toBe(path.join(ROOT, "docs"));
    });

    it("`@/` 带空相对部分 应该 指向根目录", () => {
        expect(resolveDocPath("@/", WITH_WS)).toBe(ROOT);
    });

    it("文档不在任何 workspace 文件夹内 应该 不借用第一个文件夹（回归：工作区外文档 @/ 解析错）", () => {
        const folder = { uri: vscode.Uri.file(ROOT), name: "proj", index: 0 };
        vi.mocked(vscode.workspace.getWorkspaceFolder).mockReturnValue(undefined);
        (vscode.workspace as unknown as {
            workspaceFolders: vscode.WorkspaceFolder[] | undefined;
        }).workspaceFolders = [folder];

        const outsideDoc = path.join(path.resolve(path.sep, "outside"), "note.md");
        expect(resolveWorkspaceRoot(vscode.Uri.file(outsideDoc))).toBeUndefined();
    });
});

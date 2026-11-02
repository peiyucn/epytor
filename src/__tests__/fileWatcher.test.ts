import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchExternalWrites } from "../editor/fileWatcher";

describe("watchExternalWrites 外部写入监听", () => {
    let errorSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "warn").mockImplementation(() => {});
        errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("目录不存在 应该 记录错误并返回可安全调用的 disposer（编辑器仍能打开）", () => {
        const missingDir = path.join(os.tmpdir(), "epytor-missing-dir-for-watcher", "nested");
        const stop = watchExternalWrites(path.join(missingDir, "doc.md"), vi.fn());

        expect(errorSpy).toHaveBeenCalledWith("[epytor] file watcher unavailable:", expect.any(Error));
        expect(() => stop()).not.toThrow();
        expect(() => stop()).not.toThrow();
    });

    it("目录存在 应该 返回可释放的监听（不真实写盘）", () => {
        const stop = watchExternalWrites(path.join(os.tmpdir(), "epytor-watched-doc.md"), vi.fn());

        expect(() => stop()).not.toThrow();
        expect(errorSpy).not.toHaveBeenCalled();
    });
});

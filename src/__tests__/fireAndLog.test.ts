import { afterEach, describe, expect, it, vi } from "vitest";
import { fireAndLog } from "../utils/fireAndLog";

describe("fireAndLog 不可等待的 vscode 调用", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("成功 应该 不记录错误", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        fireAndLog(Promise.resolve(true), "openExternal");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(errorSpy).not.toHaveBeenCalled();
    });

    it("失败 应该 记录日志且不产生未处理拒绝（回归：mailto 无邮件客户端）", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const failure = new Error("no mail client");
        fireAndLog(Promise.reject(failure), "openExternal");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(errorSpy).toHaveBeenCalledWith("[epytor] openExternal failed:", failure);
    });
});

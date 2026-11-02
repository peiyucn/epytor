import { describe, expect, it } from "vitest";
import { decideExternalChange, shouldSkipSave, type ExternalChangeContext } from "../utils/externalChangeDecision";

const ctx = (overrides: Partial<ExternalChangeContext>): ExternalChangeContext => ({
    latest: "same",
    lastSaved: "same",
    disk: "same",
    webviewDirty: false,
    ...overrides,
});

describe("decideExternalChange 外部写盘回退决策", () => {
    it("盘上内容与 webview 一致（自己刚保存 / OneDrive 重写同样字节） 应该 忽略", () => {
        expect(decideExternalChange(ctx({
            latest: "**粗体**\n",
            lastSaved: "**粗体**\n",
            disk: "**粗体**\n",
        })).action).toBe("ignore");
    });

    it("回归（焦点丢失）：自己保存后迟到的 watcher 事件 应该 忽略（不触发 revert 重建）", () => {
        // 时序：自动保存写入 C2 → 1.5s 后 OneDrive 二次写触发 watcher → webview 内容 == 盘上内容。
        // 用户已恢复打字但 markDirty 的 300ms 防抖还没到，脏标记仍是 false——旧实现会误判成
        // 外部变更 → 发 revert → 编辑器重建 → 焦点丢失。
        expect(decideExternalChange(ctx({
            latest: "C2",
            lastSaved: "C2",
            disk: "C2",
            webviewDirty: false,
        })).action).toBe("ignore");
    });

    it("持续打字期间（脏标记未置位）+ 真正外部写盘 应该 保留用户内容", () => {
        // latest 相对 lastSaved 有改动 = 用户确实有未落盘编辑，不能只看防抖脏标记
        expect(decideExternalChange(ctx({
            latest: "用户改过",
            lastSaved: "盘上旧内容",
            disk: "外部新内容",
            webviewDirty: false,
        })).action).toBe("keepUserContent");
    });

    it("webview 无未落盘编辑 + 外部写盘 应该 采纳盘上内容", () => {
        expect(decideExternalChange(ctx({
            latest: "盘上旧内容",
            lastSaved: "盘上旧内容",
            disk: "外部新内容",
            webviewDirty: false,
        })).action).toBe("adoptDisk");
    });

    it("webview 有未落盘编辑 + 外部写盘 应该 保留用户内容并标记 dirty", () => {
        expect(decideExternalChange(ctx({
            latest: "用户改过",
            lastSaved: "盘上旧内容",
            disk: "外部新内容",
            webviewDirty: true,
        })).action).toBe("keepUserContent");
    });

    it("回归：原文含 ~（序列化会转义成 \\~）且用户没编辑 应该 仍然采纳外部写入", () => {
        // 旧实现拿「webview 序列化结果」与「盘上原文快照」逐字节比较：\~ 与 ~ 不同 →
        // 误判成「用户有未落盘编辑」→ 保留 webview 旧内容并置脏 → 自动保存覆盖外部写入。
        // 现在快照是「上次写盘内容」：未编辑时 latest === lastSaved 恒成立（不管规范化）。
        expect(decideExternalChange(ctx({
            latest: "H\\~2\\~O",
            lastSaved: "H\\~2\\~O",
            disk: "H~2~O",
            webviewDirty: false,
        })).action).toBe("adoptDisk");
    });

    it("保存后脏标记清零 + 外部写盘 应该 采纳外部内容", () => {
        expect(decideExternalChange(ctx({
            latest: "C1",
            lastSaved: "C1",
            disk: "C2",
            webviewDirty: false,
        })).action).toBe("adoptDisk");
    });

    it("lastSaved 未播种（理论上不可达） 应该 回退为脏标记判据", () => {
        expect(decideExternalChange(ctx({
            latest: "webview",
            lastSaved: undefined,
            disk: "disk",
            webviewDirty: false,
        })).action).toBe("adoptDisk");
        expect(decideExternalChange(ctx({
            latest: "webview",
            lastSaved: undefined,
            disk: "disk",
            webviewDirty: true,
        })).action).toBe("keepUserContent");
    });

    describe("兜底内容不足以下结论（回归：编辑器自己跳回编辑前的状态）", () => {
        // 场景：面板不活跃 / 拉取超时 / 还没推过副本时，拿到的 "webview 内容" 其实是兜底副本，
        // 它可能等于 lastSaved（用户最近一次保存的文本），于是旧逻辑判定「没有未保存编辑」
        // → adoptDisk → 发 revert → 编辑器显示回磁盘内容，用户刚打的字看起来凭空消失。
        const fallbackCase = ctx({
            latest: "C1",        // 兜底副本 = 上次保存的内容
            lastSaved: "C1",
            disk: "C2",          // 磁盘已被外部（或自动保存）改成别的
            webviewDirty: true,  // 用户其实正在打字
            latestAuthoritative: false,
        });

        it("非权威内容 + 与 lastSaved 相同 + 磁盘不同 应该 defer（不 adopt）", () => {
            expect(decideExternalChange(fallbackCase).action).toBe("defer");
        });

        it("同样条件但内容来自 webview 真回包 应该 adoptDisk", () => {
            expect(decideExternalChange({ ...fallbackCase, latestAuthoritative: true }).action)
                .toBe("adoptDisk");
        });

        it("非权威内容即使看起来有未保存编辑 也应该 defer（不能把兜底文本写进文档模型）", () => {
            // keepUserContent 会用 latest 去 document.update()；latest 若是兜底副本，等于把陈旧
            // 内容写进模型，autoSave 再把它落盘——这是「另一会话的改动被覆盖」那一侧。
            expect(decideExternalChange({ ...fallbackCase, latest: "C1 + 新输入" }).action)
                .toBe("defer");
        });

        it("缺省 latestAuthoritative 应该 保持旧行为（向后兼容）", () => {
            const { latestAuthoritative: _omit, ...withoutFlag } = fallbackCase;
            expect(decideExternalChange(withoutFlag as ExternalChangeContext).action).toBe("adoptDisk");
        });
    });
});

describe("shouldSkipSave 空保存守卫", () => {
    // 触发场景：用户只是把文件打开着（没编辑），另一个写入方改了磁盘；随后一次 flush
    // （切走标签 / 自动保存）因为脏标记陈旧而触发，若照写就会把文件回滚到编辑前。
    it("内容等于上次写入、且文档里已是别的文本 应该 跳过（磁盘被外部改过）", () => {
        expect(shouldSkipSave({ content: "C1", lastSaved: "C1", diskText: "C2" })).toBe(true);
    });

    it("内容等于上次写入、文档也仍是同一文本 应该 照常写（无外部变化）", () => {
        expect(shouldSkipSave({ content: "C1", lastSaved: "C1", diskText: "C1" })).toBe(false);
    });

    it("内容比上次写入新 应该 照常写（真实用户编辑）", () => {
        expect(shouldSkipSave({ content: "C1 + 输入", lastSaved: "C1", diskText: "C1" })).toBe(false);
    });

    it("从未保存过 应该 照常写（无基线可比）", () => {
        expect(shouldSkipSave({ content: "C1", lastSaved: undefined, diskText: "C2" })).toBe(false);
    });
});

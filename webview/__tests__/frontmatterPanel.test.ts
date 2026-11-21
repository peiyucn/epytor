import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFrontmatterPanel } from "../components/frontmatterPanel";

afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = "";
});

describe("frontmatterPanel 组件", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        document.body.innerHTML = "";
    });

    it("编辑 value 防抖后 应该 回调序列化结果", () => {
        const onChange = vi.fn();
        const handle = createFrontmatterPanel("---\ntitle: A\n---\n", onChange)!;
        document.body.appendChild(handle.panel);

        const valueInput = handle.panel.querySelector<HTMLInputElement>(".fm-val-input")!;
        valueInput.value = "B";
        valueInput.dispatchEvent(new Event("input"));

        expect(onChange).not.toHaveBeenCalled();
        vi.advanceTimersByTime(300);
        expect(onChange).toHaveBeenCalledWith("---\ntitle: B\n---\n");
    });

    it("面板重建前 dispose 旧实例 应该 取消旧防抖 timer（无竞态写回）", () => {
        const onChangeOld = vi.fn();
        const onChangeNew = vi.fn();

        const oldHandle = createFrontmatterPanel("---\ntitle: A\n---\n", onChangeOld)!;
        document.body.appendChild(oldHandle.panel);
        const oldInput = oldHandle.panel.querySelector<HTMLInputElement>(".fm-val-input")!;
        oldInput.value = "STALE";
        oldInput.dispatchEvent(new Event("input"));

        oldHandle.dispose();
        const newHandle = createFrontmatterPanel("---\ntitle: A\n---\n", onChangeNew)!;
        document.body.appendChild(newHandle.panel);

        vi.advanceTimersByTime(300);
        expect(onChangeOld).not.toHaveBeenCalled();
        expect(onChangeNew).not.toHaveBeenCalled();
    });

    it("删除全部行 应该 回调空串（YAML 头消失）", () => {
        const onChange = vi.fn();
        const handle = createFrontmatterPanel("---\ntitle: A\n---\n", onChange)!;
        document.body.appendChild(handle.panel);

        const delBtn = handle.panel.querySelector<HTMLButtonElement>(".fm-del-btn")!;
        delBtn.click();
        vi.advanceTimersByTime(300);
        expect(onChange).toHaveBeenCalledWith("");
    });

    it("空 frontmatter 应该 返回 null（不创建面板）", () => {
        expect(createFrontmatterPanel("", vi.fn())).toBeNull();
    });

    it("点击 + 新增行并输入 应该 回调含新行的序列化结果", () => {
        const onChange = vi.fn();
        const handle = createFrontmatterPanel("---\ntitle: A\n---\n", onChange)!;
        document.body.appendChild(handle.panel);

        const addBtn = handle.panel.querySelector<HTMLButtonElement>(".fm-add-btn")!;
        addBtn.click();
        expect(handle.panel.querySelectorAll("tr.fm-row")).toHaveLength(2);

        const newKey = handle.panel.querySelector<HTMLInputElement>('tr:last-child .fm-key-input')!;
        const newVal = handle.panel.querySelector<HTMLInputElement>('tr:last-child .fm-val-input')!;
        newKey.value = "tags";
        newKey.dispatchEvent(new Event("input"));
        newVal.value = "a, b";
        newVal.dispatchEvent(new Event("input"));

        vi.advanceTimersByTime(300);
        expect(onChange).toHaveBeenCalledWith("---\ntitle: A\ntags: a, b\n---\n");
    });

    it("点击 + 新增行 应该 聚焦新行 key 输入框（回归：输入落到上一行 value 框）", () => {
        const onChange = vi.fn();
        const handle = createFrontmatterPanel("---\ntitle: A\n---\n", onChange)!;
        document.body.appendChild(handle.panel);

        handle.panel.querySelector<HTMLButtonElement>(".fm-add-btn")!.click();

        const newKey = handle.panel.querySelector<HTMLInputElement>('tr:last-child .fm-key-input')!;
        expect(document.activeElement).toBe(newKey);
    });

    it("新增行输入后失焦（blur） 应该 立即回调含新行的序列化结果（不等防抖）", () => {
        const onChange = vi.fn();
        const handle = createFrontmatterPanel("---\ntitle: A\n---\n", onChange)!;
        document.body.appendChild(handle.panel);

        handle.panel.querySelector<HTMLButtonElement>(".fm-add-btn")!.click();
        const newKey = handle.panel.querySelector<HTMLInputElement>('tr:last-child .fm-key-input')!;
        const newVal = handle.panel.querySelector<HTMLInputElement>('tr:last-child .fm-val-input')!;
        newKey.value = "date";
        newVal.value = "2026-09-07";

        newVal.dispatchEvent(new FocusEvent("blur"));

        expect(onChange).toHaveBeenCalledWith("---\ntitle: A\ndate: 2026-09-07\n---\n");
    });

    it("嵌套列表行 应该 不渲染为编辑行且随编辑/删除其他字段原样保留（回归：面板编辑曾静默删除非 key:value 行）", () => {
        const onChange = vi.fn();
        const src = "---\ntitle: X\ntags:\n  - a\n  - b\n---\n";
        const handle = createFrontmatterPanel(src, onChange)!;
        document.body.appendChild(handle.panel);

        expect(handle.panel.querySelectorAll("tr.fm-row")).toHaveLength(2);

        const titleVal = handle.panel.querySelector<HTMLInputElement>(".fm-val-input")!;
        titleVal.value = "Y";
        titleVal.dispatchEvent(new Event("input"));
        vi.advanceTimersByTime(300);
        expect(onChange).toHaveBeenLastCalledWith("---\ntitle: Y\ntags:\n  - a\n  - b\n---\n");

        const delBtn = handle.panel.querySelector<HTMLButtonElement>(".fm-del-btn")!;
        delBtn.click();
        vi.advanceTimersByTime(300);
        expect(onChange).toHaveBeenLastCalledWith("---\ntags:\n  - a\n  - b\n---\n");
    });
});

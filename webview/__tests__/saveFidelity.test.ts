
import { afterEach, describe, expect, it } from "vitest";

(window as unknown as Record<string, unknown>).__i18n = {
    translations: {},
    isMac: false,
    serializationMode: "clean",
};

if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {  }
        unobserve() {  }
        disconnect() {  }
    };
}
if (typeof window.matchMedia === "undefined") {
    window.matchMedia = (() => ({
        matches: false, media: "", onchange: null,
        addListener() {  }, removeListener() {  },
        addEventListener() {  }, removeEventListener() {  },
        dispatchEvent() { return false; },
    })) as typeof window.matchMedia;
}

let disposeEditor: (() => void) | null = null;

async function openEditor(markdown: string) {
    const editor = await import("../editor");
    const container = document.createElement("div");
    document.body.appendChild(container);
    await editor.createEditor(container, markdown, () => {  });
    disposeEditor = () => {
        editor.destroyEditor();
        container.remove();
    };
    return {
        save: () => editor.getMarkdownForSave(),
        view: () => editor.getEditorView(),
    };
}

afterEach(() => {
    disposeEditor?.();
    disposeEditor = null;
    document.body.innerHTML = "";
});

describe("保存保真（列表写法不被重写）", () => {
    it("未编辑时 `-` 项目符号列表 应该 逐字保存（回归：此前变 `*`）", async () => {
        const source = "- one\n- two\n";
        const { save } = await openEditor(source);

        expect(save()).toBe(source);
    }, 60_000);

    it("未编辑时任务列表 应该 逐字保存（回归：此前变 `* [ ]`）", async () => {
        const source = "- [ ] todo\n- [x] done\n";
        const { save } = await openEditor(source);

        expect(save()).toBe(source);
    }, 60_000);

    it("未编辑时 4 空格嵌套列表 应该 逐字保存（回归：此前缩进被改成 3 空格）", async () => {
        const source = "1. a\n    1. b\n        - bullet\n";
        const { save } = await openEditor(source);

        expect(save()).toBe(source);
    }, 60_000);

    it("空任务项（`- [ ] ` 后什么都不写）应该 识别成复选框并逐字保存", async () => {

        const source = "- [ ] \n- [x] done\n    - [ ] \n";
        const { save, view } = await openEditor(source);
        const editorView = view();
        expect(editorView).not.toBeNull();

        const checked: Array<boolean | null> = [];
        editorView!.state.doc.descendants((node) => {
            if (node.type.name === "list_item") { checked.push(node.attrs.checked as boolean | null); }
        });
        expect(checked).toEqual([false, true, false]);

        expect(save()).toBe(source);
    }, 60_000);

    it("改了某一行时 该行按新内容保存 且未改行的写法原样保留", async () => {

        const source = "- one\n- two\n\ntail\n";
        const { save, view } = await openEditor(source);
        const editorView = view();
        expect(editorView).not.toBeNull();

        let insertAt = -1;
        editorView!.state.doc.descendants((node, pos) => {
            if (node.isText && node.text === "one") insertAt = pos + node.nodeSize;
        });
        expect(insertAt).toBeGreaterThanOrEqual(0);
        editorView!.dispatch(editorView!.state.tr.insertText("!", insertAt));

        expect(save()).toBe("- one!\n- two\n\ntail\n");
    }, 60_000);

    it("CRLF 文件 应该 逐字保存并保持 CRLF（回归：每存一次被改成 LF、整篇被判为改动）", async () => {
        const source = ["# 标题", "", "- one", "- two", "", "[链接](https://e.com/a?x=1&y=2)", ""]
            .join("\r\n");
        const { save } = await openEditor(source);
        const saved = save();

        expect(saved).toBe(source);
        expect(saved.includes("\r\n")).toBe(true);
        expect(/(?<!\r)\n/.test(saved)).toBe(false);
    }, 60_000);

    it("列表项以代码块开头 应该 保存后不丢代码块（回归：上游 7.22.2 起的 `<br />` 占位会吞块）", async () => {

        const source = "- ```js\n  code\n  ```\n";
        const { save } = await openEditor(source);
        const saved = save();

        expect(saved).toContain("```js");
        expect(saved).toContain("code");
    }, 60_000);

    it("未编辑保存松散列表 应该 逐字一致（回归：升到 Milkdown 7.22.2 后空行被吃掉）", async () => {

        const source = "# t\n\n- [x] done\n\n- a\n- b\n\n```js\nconst x = 1;\n```\n";
        const { save } = await openEditor(source);

        expect(save()).toBe(source);

        expect(save()).toBe(source);
    }, 60_000);

    it("未编辑保存松散列表（CRLF）应该 逐字一致并保持 CRLF", async () => {
        const source = ["# t", "", "- [x] done", "", "- a", ""].join("\r\n");
        const { save } = await openEditor(source);
        const saved = save();

        expect(saved).toBe(source);
        expect(saved.includes("\r\n")).toBe(true);
    }, 60_000);

    it("链接目标里的 & 应该 保留原样（回归：被写成 \\& 改写用户文件）", async () => {
        const source = [
            "[![CI](https://img.shields.io/x/ci.yml?branch=main&label=ci)](https://github.com/a/b/actions)",
            "",
            "正文一行",
            "",
        ].join("\n");
        const { save } = await openEditor(source);
        const saved = save();

        expect(saved).toBe(source);
        expect(saved.includes("\\&")).toBe(false);
    }, 60_000);
});

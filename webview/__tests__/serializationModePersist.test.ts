
import { afterEach, describe, expect, it } from "vitest";
import { createEditor, destroyEditor, getSerializationMode, setSerializationMode } from "../editor";

if (typeof (window as unknown as Record<string, unknown>).ResizeObserver === "undefined") {
    (window as unknown as Record<string, unknown>).ResizeObserver = class {
        observe() {  } unobserve() {  } disconnect() {  }
    };
}
if (typeof (window as unknown as Record<string, unknown>).IntersectionObserver === "undefined") {
    (window as unknown as Record<string, unknown>).IntersectionObserver = class {
        observe() {  } unobserve() {  } disconnect() {  } takeRecords() { return []; }
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

(window as unknown as Record<string, unknown>).__i18n = {
    translations: {},
    isMac: false,
    serializationMode: "clean",
};

afterEach(() => {
    destroyEditor();
    document.body.innerHTML = "";
    setSerializationMode("clean");
});

describe("序列化模式持久性（F1）", () => {
    it("运行期改为 compatible 后重建编辑器 应该 保持 compatible（回归：启动快照静默回滚）", async () => {
        const root1 = document.createElement("div");
        document.body.appendChild(root1);
        await createEditor(root1, "第一份内容", () => {});
        expect(getSerializationMode()).toBe("clean");

        setSerializationMode("compatible");
        expect(getSerializationMode()).toBe("compatible");


        destroyEditor();
        root1.remove();
        const root2 = document.createElement("div");
        document.body.appendChild(root2);
        await createEditor(root2, "外部修改后的内容", () => {});

        expect(getSerializationMode()).toBe("compatible");
    }, 30000);
});

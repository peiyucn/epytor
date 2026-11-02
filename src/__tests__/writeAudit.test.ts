import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    WRITE_AUDIT_LOG_NAME,
    WRITE_AUDIT_MAX_BYTES,
    WriteAudit,
    type WriteAuditFileSystem,
} from "../editor/writeAudit";

const LOG_DIR = path.join(path.sep, "logs");
const DOC_URI_KEY = "file:///docs/note.md";

/** In-memory fs: the audit log must never touch a real disk in unit tests. */
class FakeWriteAuditFs implements WriteAuditFileSystem {
    readonly files = new Map<string, string>();
    readonly mkdirCalls: string[] = [];
    failAppend = false;

    async mkdir(dir: string): Promise<unknown> {
        this.mkdirCalls.push(dir);
        return undefined;
    }

    async appendFile(file: string, data: string): Promise<void> {
        if (this.failAppend) { throw new Error("disk full"); }
        this.files.set(file, (this.files.get(file) ?? "") + data);
    }

    async stat(file: string): Promise<{ size: number }> {
        const content = this.files.get(file);
        if (content === undefined) { throw new Error("ENOENT"); }
        return { size: Buffer.byteLength(content, "utf-8") };
    }

    async rename(from: string, to: string): Promise<void> {
        const content = this.files.get(from);
        if (content === undefined) { throw new Error("ENOENT"); }
        this.files.set(to, content);
        this.files.delete(from);
    }
}

function makeAudit(fs: FakeWriteAuditFs): WriteAudit {
    return new WriteAudit(() => LOG_DIR, fs);
}

const LOG_FILE = path.join(LOG_DIR, WRITE_AUDIT_LOG_NAME);

describe("WriteAudit 写盘审计日志", () => {
    let fs: FakeWriteAuditFs;
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        vi.clearAllMocks();
        fs = new FakeWriteAuditFs();
        warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("record 应该 以 JSON 行追写，含文件、原因、长度、哈希与附加字段", async () => {
        const audit = makeAudit(fs);
        audit.record(DOC_URI_KEY, "save", "hello", { ok: true });
        await audit.flush();

        expect(fs.mkdirCalls).toEqual([LOG_DIR]);
        const lines = (fs.files.get(LOG_FILE) ?? "").trim().split("\n");
        expect(lines).toHaveLength(1);
        const entry = JSON.parse(lines[0]) as Record<string, unknown>;
        expect(entry.file).toBe("note.md");
        expect(entry.reason).toBe("save");
        expect(entry.len).toBe(5);
        expect(entry.sha).toMatch(/^[0-9a-f]{12}$/);
        expect(entry.ok).toBe(true);
        expect(typeof entry.at).toBe("string");
    });

    it("多次 record 应该 按调用顺序串行追加", async () => {
        const audit = makeAudit(fs);
        audit.record(DOC_URI_KEY, "first", "a");
        audit.record(DOC_URI_KEY, "second", "b");
        await audit.flush();

        const reasons = (fs.files.get(LOG_FILE) ?? "").trim().split("\n")
            .map((line) => (JSON.parse(line) as { reason: string }).reason);
        expect(reasons).toEqual(["first", "second"]);
    });

    it("超过上限 应该 轮转为 .1 并重写新日志（回归：日志无限增长）", async () => {
        fs.files.set(LOG_FILE, "x".repeat(WRITE_AUDIT_MAX_BYTES));
        const audit = makeAudit(fs);
        audit.record(DOC_URI_KEY, "save", "new");
        await audit.flush();

        const rotated = fs.files.get(LOG_FILE + ".1") ?? "";
        expect(rotated.length).toBe(WRITE_AUDIT_MAX_BYTES);
        const current = fs.files.get(LOG_FILE) ?? "";
        expect(current.trim().split("\n")).toHaveLength(1);
        expect((JSON.parse(current.trim()) as { reason: string }).reason).toBe("save");
    });

    it("未达上限 应该 原地追加、不产生 .1", async () => {
        fs.files.set(LOG_FILE, "existing\n");
        const audit = makeAudit(fs);
        audit.record(DOC_URI_KEY, "save", "new");
        await audit.flush();

        expect(fs.files.has(LOG_FILE + ".1")).toBe(false);
        expect((fs.files.get(LOG_FILE) ?? "").startsWith("existing\n")).toBe(true);
    });

    it("写日志失败 应该 只记录警告，且后续记录仍可继续", async () => {
        const audit = makeAudit(fs);
        fs.failAppend = true;
        audit.record(DOC_URI_KEY, "failed", "a");
        await audit.flush();
        expect(warnSpy).toHaveBeenCalled();

        fs.failAppend = false;
        audit.record(DOC_URI_KEY, "recovered", "b");
        await audit.flush();
        expect((fs.files.get(LOG_FILE) ?? "").trim()).toContain("\"reason\":\"recovered\"");
    });

    it("save trigger 应该 读取即重置，避免标签泄漏到下一次保存", () => {
        const audit = makeAudit(fs);
        expect(audit.consumeSaveTrigger()).toBe("vs-code");
        audit.markSaveTrigger("flush-deactivate");
        expect(audit.consumeSaveTrigger()).toBe("flush-deactivate");
        expect(audit.consumeSaveTrigger()).toBe("vs-code");
    });
});

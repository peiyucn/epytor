
import { createHash } from "crypto";
import { appendFile, mkdir, rename, stat } from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

export const WRITE_AUDIT_LOG_NAME = "epytor-writes.log";

export const WRITE_AUDIT_MAX_BYTES = 2 * 1024 * 1024;

const WRITE_AUDIT_ROTATED_SUFFIX = ".1";

const DEFAULT_SAVE_TRIGGER = "vs-code";

export interface WriteAuditFileSystem {
    mkdir(dir: string): Promise<unknown>;
    appendFile(file: string, data: string): Promise<void>;
    stat(file: string): Promise<{ size: number }>;
    rename(from: string, to: string): Promise<void>;
}

const nodeWriteAuditFileSystem: WriteAuditFileSystem = {
    mkdir: (dir) => mkdir(dir, { recursive: true }),
    appendFile: (file, data) => appendFile(file, data),
    stat: (file) => stat(file),
    rename: (from, to) => rename(from, to),
};

export class WriteAudit {

    private _saveTrigger = DEFAULT_SAVE_TRIGGER;

    private _writeChain: Promise<void> = Promise.resolve();

    constructor(
        private readonly logDir: () => string,
        private readonly fileSystem: WriteAuditFileSystem = nodeWriteAuditFileSystem,
    ) {}

    markSaveTrigger(trigger: string): void {
        this._saveTrigger = trigger;
    }

    consumeSaveTrigger(): string {
        const trigger = this._saveTrigger;
        this._saveTrigger = DEFAULT_SAVE_TRIGGER;
        return trigger;
    }

    record(uriKey: string, reason: string, content: string, extra?: Record<string, unknown>): void {
        const line = JSON.stringify({
            at: new Date().toISOString(),
            file: path.basename(vscode.Uri.parse(uriKey).fsPath),
            reason,
            len: content.length,
            sha: createHash("sha1").update(content).digest("hex").slice(0, 12),
            ...extra,
        });
        const logFile = path.join(this.logDir(), WRITE_AUDIT_LOG_NAME);
        this._writeChain = this._writeChain
            .then(() => this._append(logFile, reason, line))
            .catch((error) => {

                console.warn("[epytor] write audit failed:", error);
            });
    }

    flush(): Promise<void> {
        return this._writeChain;
    }

    private async _append(logFile: string, reason: string, line: string): Promise<void> {

        await this.fileSystem.mkdir(path.dirname(logFile));
        const rotated = await this._rotateIfOversized(logFile);
        await this.fileSystem.appendFile(logFile, line + "\n");

        console.log(`[epytor] write audit${rotated ? " (rotated)" : ""}: ${reason} -> ${logFile}`);
    }

    private async _rotateIfOversized(logFile: string): Promise<boolean> {
        let size: number;
        try {
            size = (await this.fileSystem.stat(logFile)).size;
        } catch {

            return false;
        }
        if (size < WRITE_AUDIT_MAX_BYTES) { return false; }
        await this.fileSystem.rename(logFile, logFile + WRITE_AUDIT_ROTATED_SUFFIX);
        return true;
    }
}

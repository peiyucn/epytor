/**
 * Write-audit log: one line per save attempt under `<logDir>/epytor-writes.log`.
 *
 * Purpose: decisive attribution. "The file rolled back" reports are impossible to resolve
 * from the outside — several tools may write the same path. With this log we can tell whether
 * epytor wrote, from which trigger, and with which content hash.
 *
 * The log is diagnostic only, so it is capped by a size rotation instead of growing for the
 * lifetime of the installation.
 */
import { createHash } from "crypto";
import { appendFile, mkdir, rename, stat } from "fs/promises";
import * as path from "path";
import * as vscode from "vscode";

export const WRITE_AUDIT_LOG_NAME = "epytor-writes.log";
/** Rotate before the log can bloat a user profile or a synced settings folder. */
export const WRITE_AUDIT_MAX_BYTES = 2 * 1024 * 1024;
/** Exactly one previous generation is kept; older history has no diagnostic value. */
const WRITE_AUDIT_ROTATED_SUFFIX = ".1";

/** Default trigger label when the save was driven by VS Code rather than a special path. */
const DEFAULT_SAVE_TRIGGER = "vs-code";

/** Node fs operations used by the log; injectable so unit tests never write a real disk. */
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
    /** Label used in the log for the save currently in flight. */
    private _saveTrigger = DEFAULT_SAVE_TRIGGER;

    /**
     * Writes are chained: rotation renames the file, so an interleaved append could recreate it
     * with the pre-rotation content and defeat the cap.
     */
    private _writeChain: Promise<void> = Promise.resolve();

    constructor(
        private readonly logDir: () => string,
        private readonly fileSystem: WriteAuditFileSystem = nodeWriteAuditFileSystem,
    ) {}

    /** Label the next `saveCustomDocument` call (e.g. a deactivation flush). */
    markSaveTrigger(trigger: string): void {
        this._saveTrigger = trigger;
    }

    /** Read the pending trigger and reset it, so one labelled save cannot leak into the next. */
    consumeSaveTrigger(): string {
        const trigger = this._saveTrigger;
        this._saveTrigger = DEFAULT_SAVE_TRIGGER;
        return trigger;
    }

    /** Queue one audit line; failures are logged, never thrown into the save chain. */
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
                // Surface the failure: a broken audit trail must not look like a clean one.
                console.warn("[epytor] write audit failed:", error);
            });
    }

    /** Wait for every queued audit write to settle (tests and shutdown paths). */
    flush(): Promise<void> {
        return this._writeChain;
    }

    private async _append(logFile: string, reason: string, line: string): Promise<void> {
        // The directory may not exist yet on a fresh session; appendFile would fail silently and
        // an absent log must never be read as "epytor did not write".
        await this.fileSystem.mkdir(path.dirname(logFile));
        const rotated = await this._rotateIfOversized(logFile);
        await this.fileSystem.appendFile(logFile, line + "\n");
        // A rotation is visible in the log too, so a truncated history is not mistaken for data loss.
        console.log(`[epytor] write audit${rotated ? " (rotated)" : ""}: ${reason} -> ${logFile}`);
    }

    private async _rotateIfOversized(logFile: string): Promise<boolean> {
        let size: number;
        try {
            size = (await this.fileSystem.stat(logFile)).size;
        } catch {
            // No log yet: nothing to rotate.
            return false;
        }
        if (size < WRITE_AUDIT_MAX_BYTES) { return false; }
        await this.fileSystem.rename(logFile, logFile + WRITE_AUDIT_ROTATED_SUFFIX);
        return true;
    }
}

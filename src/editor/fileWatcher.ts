/**
 * OS-level file watcher for external writes (another editor, an AI tool, a sync client).
 *
 * `vscode.workspace.createFileSystemWatcher` ignores writes from this same extension host, so
 * the OS is watched directly. Kept out of the provider so a watcher failure cannot blur the
 * editing logic, and so the debounce policy lives in one place.
 */
import * as fs from "fs";
import * as path from "path";

/** Coalesce burst writes: a sync client can emit several events for one save. */
const FS_WATCH_DEBOUNCE_MS = 200;

/** Watch the directory of `documentFsPath`; returns an idempotent disposer. */
export function watchExternalWrites(documentFsPath: string, onExternalWrite: () => void): () => void {
    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const targetFile = path.basename(documentFsPath);
    let watcher: fs.FSWatcher;
    try {
        watcher = fs.watch(path.dirname(documentFsPath), (_event, filename) => {
            if (filename !== targetFile) { return; }
            if (debounceTimer !== undefined) { clearTimeout(debounceTimer); }
            debounceTimer = setTimeout(() => {
                debounceTimer = undefined;
                onExternalWrite();
            }, FS_WATCH_DEBOUNCE_MS);
        });
    } catch (error) {
        // Deleted/unreadable directory at open time: external-change adoption is unavailable,
        // but the editor itself must still open.
        console.error("[epytor] file watcher unavailable:", error);
        return () => { /* nothing to release */ };
    }
    // fs.watch can emit EPERM asynchronously on OneDrive/network dirs; without a handler that
    // becomes an unhandled error event.
    watcher.on("error", (error) => {
        console.warn("[epytor] file watcher error:", error);
    });
    return () => {
        if (debounceTimer !== undefined) { clearTimeout(debounceTimer); }
        watcher.close();
    };
}

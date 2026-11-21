
import * as fs from "fs";
import * as path from "path";

const FS_WATCH_DEBOUNCE_MS = 200;

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

        console.error("[epytor] file watcher unavailable:", error);
        return () => {  };
    }

    watcher.on("error", (error) => {
        console.warn("[epytor] file watcher error:", error);
    });
    return () => {
        if (debounceTimer !== undefined) { clearTimeout(debounceTimer); }
        watcher.close();
    };
}

import { notifyGetPathSuggestions, notifyResolveImagePath } from "@/messaging";
import { getFileIcon } from "../pathLink/fileIcons";
import type { PathSuggestionItem } from "../../../shared/messages";
import {
    createCompletionTeardown,
    createPathDropdown,
    renderPathSuggestionItem,
    retriggerCompletionAfterDirectoryPick,
} from "@/ui/pathCompleteCore";
import { PATH_COMPLETE_DEBOUNCE_MS, PATH_PREFIX_REGEX } from "../../../shared/constants";
import { beginPathSuggestionRequest } from "@/images/pathSuggestionRequests";

const IMG_ACTIVE_CLASS = "img-path-complete-item--active";
const RESOLVE_IMAGE_TIMEOUT_MS = 3000;
const IMAGE_BLUR_CLOSE_DELAY_MS = 150;

const _pendingResolve = new Map<string, (uri: string) => void>();

/** Called by index.ts when an imagePathResolved message arrives. */
export function dispatchImagePathResolved(id: string, webviewUri: string): void {
    const cb = _pendingResolve.get(id);
    if (cb) { _pendingResolve.delete(id); cb(webviewUri); }
}

/** Resolve a relPath to a webviewUri (async; falls back to the input after 3s). */
export function resolveToWebviewUri(relPath: string): Promise<string> {
    return new Promise((resolve) => {
        const id = `rip_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
        const timer = setTimeout(() => {
            _pendingResolve.delete(id);
            resolve(relPath);
        }, RESOLVE_IMAGE_TIMEOUT_MS);
        _pendingResolve.set(id, (uri) => {
            clearTimeout(timer);
            resolve(uri);
        });
        notifyResolveImagePath(id, relPath);
    });
}

/**
 * Attach image-path autocomplete to an input.
 * `onEnter` / `onEscape` fire when the dropdown is closed (i.e. confirm / cancel).
 * Returns a cleanup function that removes every listener and closes the dropdown.
 */
export function attachImgPathComplete(
    input: HTMLInputElement,
    onEnter?: () => void,
    onEscape?: () => void,
): () => void {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let skipDatasetClear = false;
    /** Most recent suggestion request; stale responses must not replace the current dropdown. */
    let latestSuggestionId = "";

    const dropdown = createPathDropdown<PathSuggestionItem>({
        listClass: "img-path-complete-list",
        itemClass: "img-path-complete-item",
        activeClass: IMG_ACTIVE_CLASS,
        renderItem: (item) => renderPathSuggestionItem(item, {
            iconHtml: getFileIcon(item.path, item.isDir),
            iconClass: "img-complete-icon",
            labelClass: "img-complete-label",
            thumbnail: item.webviewUri
                ? { className: "img-complete-thumb", webviewUri: item.webviewUri }
                : undefined,
        }),
        getTitle: (item) => item.path,
        onSelect: (item) => applySelection(item),
    });

    function applySelection(item: PathSuggestionItem): void {
        input.value = item.path;
        if (item.webviewUri) {
            input.dataset.imgWebviewUri = item.webviewUri;
        } else {
            delete input.dataset.imgWebviewUri;
        }
        skipDatasetClear = true;
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        input.focus();

        if (item.isDir) {
            // The new value ends with `/`: the debounced flow will not fire on its own.
            retriggerCompletionAfterDirectoryPick(dropdown, triggerSuggest);
        } else {
            dropdown.close();
        }
    }

    function triggerSuggest(): void {
        const query = input.value.trim();
        if (!query || !PATH_PREFIX_REGEX.test(query)) {
            // Invalidate any in-flight response (the query no longer matches) so it cannot revive.
            latestSuggestionId = "";
            dropdown.close();
            return;
        }

        // Registration/timeout live in pathSuggestionRequests (P4: hand-rolled Map+setTimeout).
        const handle = beginPathSuggestionRequest();
        latestSuggestionId = handle.id;
        handle.promise.then((items) => {
            // Stale guard: with large directories B can be requested after A and A may answer
            // last, overwriting B's dropdown.
            if (teardown.disposed || handle.id !== latestSuggestionId) { return; }
            // Second guard: refuse to render when the input left the document (dialog closed).
            if (!input.isConnected) return;
            const filtered = items.filter(item => item.isDir || item.webviewUri !== undefined);
            if (filtered.length === 0) return;
            const rect = input.getBoundingClientRect();
            dropdown.show(
                { left: rect.left, top: rect.bottom + 2 },
                filtered,
                `${rect.width}px`,
            );
        }).catch(() => { /* timeout/cancel: give up silently, never revive the dropdown */ });
        notifyGetPathSuggestions(handle.id, query);
    }

    function onInput(): void {
        // The first input after autocomplete keeps the dataset (dataset means "manually typed").
        if (skipDatasetClear) {
            skipDatasetClear = false;
        } else {
            delete input.dataset.imgWebviewUri;
        }
        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            if (!teardown.disposed) { triggerSuggest(); }
        }, PATH_COMPLETE_DEBOUNCE_MS);
    }

    function onKeydown(e: KeyboardEvent): void {
        if (e.isComposing) { return; }

        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            if (dropdown.isOpen()) {
                dropdown.handleKeydown(e);
            } else {
                onEnter?.();
            }
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (dropdown.isOpen()) {
                dropdown.close();
            } else {
                onEscape?.();
            }
            return;
        }

        if (!dropdown.isOpen()) { return; }
        dropdown.handleKeydown(e); // arrows / Tab
    }

    function onDocMousedown(e: MouseEvent): void {
        if (dropdown.isOpen() && !dropdown.contains(e.target as Node) && e.target !== input) {
            dropdown.close();
        }
    }

    function onBlur(): void {
        // Delayed close so the mousedown-driven applySelection wins.
        setTimeout(() => {
            if (!teardown.disposed) { dropdown.close(); }
        }, IMAGE_BLUR_CLOSE_DELAY_MS);
    }

    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeydown, true);
    input.addEventListener("blur", onBlur);
    document.addEventListener("mousedown", onDocMousedown, true);

    const teardown = createCompletionTeardown({
        clearTimer: () => {
            if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        },
        closeDropdown: () => dropdown.close(),
        removeListeners: () => {
            input.removeEventListener("input", onInput);
            input.removeEventListener("keydown", onKeydown, true);
            input.removeEventListener("blur", onBlur);
            document.removeEventListener("mousedown", onDocMousedown, true);
        },
    });

    return () => teardown.dispose();
}

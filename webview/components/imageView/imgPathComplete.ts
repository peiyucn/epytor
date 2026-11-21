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


export function dispatchImagePathResolved(id: string, webviewUri: string): void {
    const cb = _pendingResolve.get(id);
    if (cb) { _pendingResolve.delete(id); cb(webviewUri); }
}


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


export function attachImgPathComplete(
    input: HTMLInputElement,
    onEnter?: () => void,
    onEscape?: () => void,
): () => void {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let skipDatasetClear = false;

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

            retriggerCompletionAfterDirectoryPick(dropdown, triggerSuggest);
        } else {
            dropdown.close();
        }
    }

    function triggerSuggest(): void {
        const query = input.value.trim();
        if (!query || !PATH_PREFIX_REGEX.test(query)) {

            latestSuggestionId = "";
            dropdown.close();
            return;
        }


        const handle = beginPathSuggestionRequest();
        latestSuggestionId = handle.id;
        handle.promise.then((items) => {


            if (teardown.disposed || handle.id !== latestSuggestionId) { return; }

            if (!input.isConnected) return;
            const filtered = items.filter(item => item.isDir || item.webviewUri !== undefined);
            if (filtered.length === 0) return;
            const rect = input.getBoundingClientRect();
            dropdown.show(
                { left: rect.left, top: rect.bottom + 2 },
                filtered,
                `${rect.width}px`,
            );
        }).catch(() => {  });
        notifyGetPathSuggestions(handle.id, query);
    }

    function onInput(): void {

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
        dropdown.handleKeydown(e);
    }

    function onDocMousedown(e: MouseEvent): void {
        if (dropdown.isOpen() && !dropdown.contains(e.target as Node) && e.target !== input) {
            dropdown.close();
        }
    }

    function onBlur(): void {

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

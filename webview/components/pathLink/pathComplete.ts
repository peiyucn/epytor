import { notifyGetPathSuggestions } from "@/messaging";
import { getFileIcon } from "./fileIcons";
import type { EditorView } from "@milkdown/kit/prose/view";
import {
    createCompletionTeardown,
    createPathDropdown,
    renderPathSuggestionItem,
    retriggerCompletionAfterDirectoryPick,
} from "@/ui/pathCompleteCore";
import { PATH_COMPLETE_DEBOUNCE_MS, PATH_PREFIX_REGEX } from "../../../shared/constants";
import { beginPathSuggestionRequest } from "@/images/pathSuggestionRequests";
import type { PathSuggestionItem } from "../../../shared/messages";

const PATH_ACTIVE_CLASS = "path-complete-item--active";

type SuggestionItem = PathSuggestionItem;

/** Current inline <code> at the caret (excludes pre>code and a>code). */
function getActiveInlineCode(): HTMLElement | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { return null; }
    const node = sel.anchorNode;
    if (!node) { return null; }
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
    if (!el) { return null; }
    const code = el.closest("code");
    if (!code) { return null; }
    if (code.closest("pre")) { return null; }
    if (code.closest("a")) { return null; }
    return code as HTMLElement;
}

/** InlineCode mark range under the selection (null when the caret is not in such a mark). */
function getCodeNodeRangeFromSelection(view: EditorView): { from: number; to: number } | null {
    const { state } = view;
    const codeMark = state.schema.marks["inlineCode"];
    if (!codeMark) { return null; }

    const { $from } = state.selection;
    const parentStart = $from.start();
    let from: number | undefined;
    let to: number | undefined;
    $from.parent.forEach((node, offset) => {
        if (node.isText && node.marks.some(m => m.type === codeMark)) {
            const s = parentStart + offset;
            const e = s + node.nodeSize;
            if ($from.pos >= s && $from.pos <= e) {
                from = s;
                to = e;
            }
        }
    });
    return from !== undefined && to !== undefined ? { from, to } : null;
}

/**
 * Inline-code path completion. Page-lifecycle singleton: the webview calls it once per page,
 * so no rebuild path tears it down. The returned detach exists for tests and keeps the
 * listener/timer cleanup contract explicit.
 */
export function initPathComplete(getEditorViewFn: () => EditorView | null): () => void {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let savedRange: { from: number; to: number } | null = null;

    const dropdown = createPathDropdown<SuggestionItem>({
        listClass: "path-complete-list",
        itemClass: "path-complete-item",
        activeClass: PATH_ACTIVE_CLASS,
        renderItem: (item) => renderPathSuggestionItem(item, {
            iconHtml: getFileIcon(item.path, item.isDir),
            iconClass: "path-complete-icon",
            labelClass: "path-complete-label",
        }),
        getTitle: (item) => item.path,
        onClose: () => { savedRange = null; },
        onSelect: (item) => applySelection(item),
    });

    function applySelection(item: SuggestionItem): void {
        const view = getEditorViewFn();
        if (!view) { dropdown.close(); return; }
        const range = savedRange ?? getCodeNodeRangeFromSelection(view);
        if (!range) { dropdown.close(); return; }
        const codeMark = view.state.schema.marks["inlineCode"];
        if (!codeMark) { return; }
        const { state: editorState } = view;
        view.dispatch(
            editorState.tr.replaceRangeWith(
                range.from,
                range.to,
                editorState.schema.text(item.path, [codeMark.create()]),
            ),
        );
        view.focus();

        if (item.isDir) {
            retriggerCompletionAfterDirectoryPick(dropdown, () => {
                const newCode = getActiveInlineCode();
                if (newCode) { triggerSuggest(newCode); }
            });
        } else {
            dropdown.close();
        }
    }

    function triggerSuggest(code: HTMLElement): void {
        const query = (code.textContent ?? "").trim();
        if (!query || !PATH_PREFIX_REGEX.test(query)) {
            dropdown.close();
            return;
        }

        // Request registration and timeout cleanup live in pathSuggestionRequests (P4: hand-rolled Map+setTimeout).
        const handle = beginPathSuggestionRequest();
        handle.promise.then((items) => {
            const currentCode = getActiveInlineCode();
            if (currentCode !== code) { return; }
            const view = getEditorViewFn();
            if (view) { savedRange = getCodeNodeRangeFromSelection(view); }
            const rect = code.getBoundingClientRect();
            dropdown.show(
                { left: rect.left + window.scrollX, top: rect.bottom + window.scrollY + 2 },
                items,
            );
        }).catch(() => { /* timeout/cancel: give up silently, never revive the dropdown */ });
        notifyGetPathSuggestions(handle.id, query);
    }

    // Capture phase: the dropdown must see keys before the editor.
    function onKeydown(e: KeyboardEvent): void {
        dropdown.handleKeydown(e);
    }

    function onKeyup(e: KeyboardEvent): void {
        if (["Escape", "ArrowDown", "ArrowUp", "Enter", "Tab"].includes(e.key)) { return; }

        const code = getActiveInlineCode();
        if (!code) {
            dropdown.close();
            return;
        }

        if (debounceTimer) { clearTimeout(debounceTimer); }
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            triggerSuggest(code);
        }, PATH_COMPLETE_DEBOUNCE_MS);
    }

    function onMousedown(e: MouseEvent): void {
        if (dropdown.isOpen() && !dropdown.contains(e.target as Node)) {
            dropdown.close();
        }
    }

    function onWindowBlur(): void {
        dropdown.close();
    }

    document.addEventListener("keydown", onKeydown, true);
    document.addEventListener("keyup", onKeyup);
    document.addEventListener("mousedown", onMousedown, true);
    window.addEventListener("blur", onWindowBlur);

    const teardown = createCompletionTeardown({
        clearTimer: () => {
            if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        },
        closeDropdown: () => dropdown.close(),
        removeListeners: () => {
            document.removeEventListener("keydown", onKeydown, true);
            document.removeEventListener("keyup", onKeyup);
            document.removeEventListener("mousedown", onMousedown, true);
            window.removeEventListener("blur", onWindowBlur);
        },
    });

    return () => teardown.dispose();
}

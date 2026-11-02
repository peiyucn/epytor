/**
 * Path-completion dropdown core (render + keyboard nav + click select), shared by
 * pathComplete and imgPathComplete.
 *
 * Regression: the two implementations were near line-for-line mirrors (ul/li building,
 * mouseover suppression, Escape/arrow/Enter/Tab navigation), so every keyboard fix had to be
 * made twice — and they had already drifted apart.
 */
import {
    closeDropdown as closeDropdownState,
    updateActiveItem,
    type DropdownState,
} from "@/ui/dropdownComplete";
import type { PathSuggestionItem } from "../../shared/messages";
import { PATH_COMPLETE_RETRIGGER_DELAY_MS } from "../../shared/constants";

export interface PathDropdownOptions<T> {
    listClass: string;
    itemClass: string;
    activeClass: string;
    /** Inner HTML for an item (icon/thumbnail + label), assembled by the caller. */
    renderItem: (item: T) => string;
    getTitle: (item: T) => string;
    /** Item chosen (mousedown / Enter / Tab). */
    onSelect: (item: T) => void;
    /** Extra cleanup on close (e.g. restore the saved selection range). */
    onClose?: () => void;
}

export interface PathDropdown<T> {
    isOpen(): boolean;
    /** Whether the dropdown contains this node (outside-click dismissal). */
    contains(node: Node): boolean;
    /** Render at absolute coordinates; the caller computes the anchor (input bottom + scroll offset). */
    show(anchor: { left: number; top: number }, items: T[], listMinWidth?: string): void;
    close(): void;
    /** Keyboard nav (registered on document in capture phase): Escape closes, arrows wrap, Enter/Tab select. */
    handleKeydown(e: KeyboardEvent): void;
}

/** Basename of a suggestion path (trailing slash stripped, last segment kept). */
export function pathLastSegment(path: string): string {
    return path.replace(/\/$/, "").split("/").pop() ?? path;
}

/** Minimal HTML escape: item labels/URIs are assembled as innerHTML strings. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export interface PathSuggestionRenderOptions {
    /** SVG markup for the file/dir icon (each caller keeps its own icon source). */
    iconHtml: string;
    iconClass: string;
    labelClass: string;
    /** Image completion only: render a thumbnail instead of the icon. */
    thumbnail?: { className: string; webviewUri: string };
}

/**
 * One suggestion row: either a thumbnail + label (image completion, host-resolved URI) or an
 * icon + label. The two completion flows had assembled this row with different class names but
 * identical structure and escape rules.
 */
export function renderPathSuggestionItem(
    item: PathSuggestionItem,
    opts: PathSuggestionRenderOptions,
): string {
    const label = escapeHtml(pathLastSegment(item.path));
    if (opts.thumbnail) {
        const src = escapeHtml(opts.thumbnail.webviewUri);
        return `<img class="${opts.thumbnail.className}" src="${src}" alt=""><span class="${opts.labelClass}">${label}</span>`;
    }
    return `<span class="${opts.iconClass}">${opts.iconHtml}</span><span class="${opts.labelClass}">${label}</span>`;
}

/**
 * After picking a directory the value ends with `/`, so the debounced "type-to-complete" flow
 * will not fire on its own: close the list and re-trigger completion once the new value is in.
 */
export function retriggerCompletionAfterDirectoryPick(
    dropdown: { close(): void },
    retrigger: () => void,
    delayMs: number = PATH_COMPLETE_RETRIGGER_DELAY_MS,
): void {
    dropdown.close();
    setTimeout(retrigger, delayMs);
}

export interface CompletionTeardownOptions {
    /** Cancel the debounce timer (and any other in-flight timer). */
    clearTimer: () => void;
    closeDropdown: () => void;
    /** Remove the listeners the caller registered. */
    removeListeners: () => void;
}

export interface CompletionTeardown {
    /** True once dispose() ran: async responses must never render after this. */
    readonly disposed: boolean;
    dispose(): void;
}

/**
 * Shared teardown envelope for a completion session: mark destroyed first (async guards read
 * `disposed`), then drop timers, close the dropdown and remove listeners — in that order and
 * exactly once. Both completions must survive a second dispose (destroy after confirm).
 */
export function createCompletionTeardown(options: CompletionTeardownOptions): CompletionTeardown {
    let disposed = false;
    return {
        get disposed() {
            return disposed;
        },
        dispose() {
            if (disposed) {
                return;
            }
            disposed = true;
            options.clearTimer();
            options.closeDropdown();
            options.removeListeners();
        },
    };
}

export function createPathDropdown<T>(opts: PathDropdownOptions<T>): PathDropdown<T> {
    const state: DropdownState = { el: null, activeIndex: -1 };
    let lastItems: T[] = [];
    let suppressMouseover = false;

    function close(): void {
        closeDropdownState(state);
        lastItems = [];
        opts.onClose?.();
    }

    function show(anchor: { left: number; top: number }, items: T[], listMinWidth?: string): void {
        close();
        if (items.length === 0) return;
        lastItems = items;

        const ul = document.createElement("ul");
        ul.className = opts.listClass;
        ul.style.top = `${anchor.top}px`;
        ul.style.left = `${anchor.left}px`;
        if (listMinWidth) {
            ul.style.minWidth = listMinWidth;
        }

        items.forEach((item, i) => {
            const li = document.createElement("li");
            li.className = opts.itemClass;
            li.innerHTML = opts.renderItem(item);
            li.title = opts.getTitle(item);

            li.addEventListener("mousedown", (e) => {
                e.preventDefault();
                state.activeIndex = i;
                opts.onSelect(item);
            });
            li.addEventListener("mousemove", () => { suppressMouseover = false; });
            li.addEventListener("mouseover", () => {
                if (suppressMouseover) return;
                state.activeIndex = i;
                updateActiveItem(state, opts.activeClass);
            });
            ul.appendChild(li);
        });

        document.body.appendChild(ul);
        state.el = ul;
        state.activeIndex = 0;
        updateActiveItem(state, opts.activeClass);
    }

    function handleKeydown(e: KeyboardEvent): void {
        if (!state.el) return;

        if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close();
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            suppressMouseover = true;
            state.activeIndex = state.activeIndex >= lastItems.length - 1 ? 0 : state.activeIndex + 1;
            updateActiveItem(state, opts.activeClass);
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            suppressMouseover = true;
            state.activeIndex = state.activeIndex <= 0 ? lastItems.length - 1 : state.activeIndex - 1;
            updateActiveItem(state, opts.activeClass);
            return;
        }

        if (e.key === "Enter" || e.key === "Tab") {
            if (state.activeIndex >= 0 && state.activeIndex < lastItems.length) {
                e.preventDefault();
                e.stopPropagation();
                opts.onSelect(lastItems[state.activeIndex]);
            }
            return;
        }
    }

    function contains(node: Node): boolean {
        return state.el !== null && state.el.contains(node);
    }

    return { isOpen: () => state.el !== null, contains, show, close, handleKeydown };
}

/**
 * Top-bar overflow: hides buttons that no longer fit and mirrors them into a body-level menu.
 * The official top bar is a Vue component, so buttons are never moved — only hidden by class;
 * the host supplies `runItem` so a menu copy can execute the original action.
 */
import "./topBarOverflow.css";
import type { Ctx } from "@milkdown/kit/ctx";
import { computeOverflow, type TopBarMeasuredItem } from "@/shell/topBarOverflow";
import { applyTooltip } from "@/ui/tooltip";
import { openAnchoredOverlay, type AnchoredOverlay } from "@/ui/anchoredOverlay";
import { t } from "@/i18n";
import { isHostCollapsedViewport } from "@/scroll/viewportLedger";

export interface TopBarButtonMeta {
    key: string;
    icon: string;
    onRun: (ctx: Ctx) => void;
}

interface TopBarOverflowHost {
    getTopBarEl: () => HTMLElement | null;
    /** Executes a hidden button's original action (the host injects the editor ctx). */
    runItem: (meta: TopBarButtonMeta) => void;
}

const ITEM_LABELS: Record<string, string> = {
    "heading": t("Heading"),
    "undo": t("Undo"),
    "redo": t("Redo"),
    "clear-format": t("Clear Formatting"),
    "image": t("Insert Image"),
    "table": t("Insert Table"),
    "link": t("Insert/Edit Link"),
    "code-block": t("Code Block"),
    "math": t("Math Formula"),
    "bullet-list": t("Bullet List"),
    "ordered-list": t("Ordered List"),
    "task-list": t("Task List"),
    "quote": t("Blockquote"),
    "hr": t("Horizontal Rule"),
    "toc": t("Table of Contents"),
    "settings": t("Settings"),
};

/** Buttons that stay in the bar as long as possible (heading dropdown + history). */
const PINNED_KEYS = new Set(["heading", "undo", "redo"]);

/**
 * Settings always lives in the menu: the bar only carries editing actions. Fewer buttons means
 * less overflow, and a fixed right-edge "⋯" needs no dynamic gap (no overlap by construction).
 */
const ALWAYS_IN_MENU_KEYS = new Set(["settings"]);

const MORE_BTN_WIDTH = 34;
/**
 * Safety margin: with a fixed right edge the measured group and the budget differ by 7–40px
 * (centered flex shrink/gap); 96px covers it.
 */
const MORE_BTN_SAFETY_GAP_PX = 96;
const MORE_BTN_HEIGHT_PX = 28;
const MORE_BTN_RIGHT_MARGIN_PX = 8;
/** Menu geometry, kept identical to the pre-scaffold values (see anchoredOverlay options). */
const MENU_VIEWPORT_MARGIN_PX = 8;
const MENU_RIGHT_EDGE_MARGIN_PX = 12;
const MENU_GAP_PX = 6;
const HIDDEN_CLASS = "top-bar-item--overflow-hidden";

let _meta: TopBarButtonMeta[] = [];

export function setTopBarButtonMeta(meta: TopBarButtonMeta[]): void {
    _meta = meta;
}

/**
 * Usable width = top-bar width minus horizontal padding.
 * Regression: using the full width over-budgeted by 125px (85/40 padding), so buttons
 * overlapped "⋯" when the window narrowed.
 */
function getTopBarUsableWidth(topBar: HTMLElement): number {
    const style = window.getComputedStyle(topBar);
    const padLeft = Number.parseFloat(style.paddingLeft) || 0;
    const padRight = Number.parseFloat(style.paddingRight) || 0;
    return Math.max(0, topBar.clientWidth - padLeft - padRight);
}

/** Locate a top-bar button by meta order (heading selector and items both count). */
export function findTopBarButtonEl(topBar: HTMLElement, key: string): HTMLElement | null {
    const children = Array.from(
        topBar.querySelectorAll<HTMLElement>(".top-bar-item, .top-bar-heading-selector"),
    );
    let metaIdx = 0;
    for (const child of children) {
        const meta = _meta[metaIdx];
        if (meta && meta.key === key) return child;
        metaIdx++;
    }
    return null;
}

/** Open overflow menu; the handle owns its dismissal listeners. */
let _activeMenu: AnchoredOverlay | null = null;

function closeMenu(): void {
    _activeMenu?.dispose();
    _activeMenu = null;
}

function openOverflowMenu(anchor: HTMLElement, hiddenKeys: ReadonlySet<string>, host: TopBarOverflowHost): void {
    closeMenu();
    if (hiddenKeys.size === 0) return;

    const menu = document.createElement("div");
    menu.className = "epytor-topbar-overflow-menu";
    menu.setAttribute("role", "menu");

    for (const meta of _meta) {
        if (!hiddenKeys.has(meta.key)) continue;
        const item = document.createElement("button");
        item.type = "button";
        item.className = "epytor-topbar-overflow-item";
        item.setAttribute("role", "menuitem");
        item.innerHTML = meta.icon;
        const label = document.createElement("span");
        label.className = "epytor-topbar-overflow-label";
        label.textContent = ITEM_LABELS[meta.key] ?? meta.key;
        item.appendChild(label);
        item.addEventListener("click", () => {
            closeMenu();
            host.runItem(meta);
        });
        menu.appendChild(item);
    }

    _activeMenu = openAnchoredOverlay({
        el: menu,
        anchor,
        align: "right",
        gap: MENU_GAP_PX,
        viewportMargin: MENU_VIEWPORT_MARGIN_PX,
        viewportRightMargin: MENU_RIGHT_EDGE_MARGIN_PX,
    });
}

export function initTopBarOverflow(host: TopBarOverflowHost): { dispose(): void } {
    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "epytor-topbar-more-btn";
    moreBtn.textContent = "⋯";
    moreBtn.hidden = true;
    moreBtn.setAttribute("aria-label", t("More"));
    applyTooltip(moreBtn, t("More"), { placement: "below" });
    document.body.appendChild(moreBtn);

    let hiddenKeys: Set<string> = new Set();
    let rafId: number | null = null;
    let mutObs: MutationObserver | null = null;

    const measure = (): void => {
        rafId = null;
        // Suspend the observer while measuring: applying HIDDEN_CLASS would otherwise
        // re-trigger schedule→measure every frame.
        mutObs?.disconnect();
        mutObs = null;
        const topBar = host.getTopBarEl();
        const inner = topBar?.querySelector<HTMLElement>(".top-bar-inner");
        if (!topBar || !inner) {
            moreBtn.hidden = true;
            return;
        }

        // Show everything first so hidden buttons still take part in the measurement.
        inner.querySelectorAll<HTMLElement>(`.${HIDDEN_CLASS}`).forEach((el) => el.classList.remove(HIDDEN_CLASS));

        const containerWidth = getTopBarUsableWidth(topBar);
        const items: TopBarMeasuredItem[] = [];
        let metaIdx = 0;
        for (const child of Array.from(inner.children) as HTMLElement[]) {
            if (child.classList.contains("top-bar-divider")) {
                items.push({ key: `__divider__${items.length}`, width: child.getBoundingClientRect().width });
            } else if (
                child.classList.contains("top-bar-item") ||
                child.classList.contains("top-bar-heading-selector")
            ) {
                const key = _meta[metaIdx]?.key ?? `__item__${metaIdx}`;
                metaIdx++;
                items.push({ key, width: child.getBoundingClientRect().width });
            }
        }

        hiddenKeys = computeOverflow({
            // Always-in-menu buttons never enter the bar, so they consume no budget.
            items: items.filter((item) => !ALWAYS_IN_MENU_KEYS.has(item.key)),
            containerWidth,
            moreBtnWidth: MORE_BTN_WIDTH + MORE_BTN_SAFETY_GAP_PX,
            pinnedKeys: PINNED_KEYS,
        });
        // Always-in-menu buttons are always in the overflow set: "⋯" stays visible and the
        // menu always has at least one entry.
        for (const key of ALWAYS_IN_MENU_KEYS) {
            hiddenKeys.add(key);
        }

        // Apply the hidden class in meta order. Dividers follow both neighbours: hide when the
        // button before or after is hidden, otherwise "⋯" sits on a leftover divider.
        const children = Array.from(inner.children) as HTMLElement[];
        const hiddenFlags = new Map<HTMLElement, boolean>();
        metaIdx = 0;
        for (const child of children) {
            if (child.classList.contains("top-bar-divider")) continue;
            if (
                !child.classList.contains("top-bar-item") &&
                !child.classList.contains("top-bar-heading-selector")
            ) {
                continue;
            }
            const key = _meta[metaIdx]?.key ?? "";
            metaIdx++;
            hiddenFlags.set(child, hiddenKeys.has(key));
        }
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child.classList.contains("top-bar-divider")) {
                let prev: HTMLElement | null = null;
                let next: HTMLElement | null = null;
                for (let j = i - 1; j >= 0; j--) {
                    if (hiddenFlags.has(children[j])) { prev = children[j]; break; }
                }
                for (let j = i + 1; j < children.length; j++) {
                    if (hiddenFlags.has(children[j])) { next = children[j]; break; }
                }
                const hidden =
                    (prev !== null && hiddenFlags.get(prev)) ||
                    (next !== null && hiddenFlags.get(next));
                child.classList.toggle(HIDDEN_CLASS, hidden);
                continue;
            }
            if (hiddenFlags.has(child)) {
                child.classList.toggle(HIDDEN_CLASS, hiddenFlags.get(child));
            }
        }

        moreBtn.hidden = hiddenKeys.size === 0;
        const rect = topBar.getBoundingClientRect();
        moreBtn.style.top = `${Math.max(2, rect.top + (rect.height - MORE_BTN_HEIGHT_PX) / 2)}px`;
        // Fixed to the right edge: the visible group never crosses the more button's left edge,
        // so no dynamic gap is needed. clientWidth excludes the scrollbar, innerWidth does not.
        const viewportW = document.documentElement.clientWidth;
        moreBtn.style.left = `${viewportW - MORE_BTN_WIDTH - MORE_BTN_RIGHT_MARGIN_PX}px`;
        moreBtn.style.right = "auto";

        // Vue patches can drop the hidden class: re-attach after measuring (the target may be
        // rebuilt) and observe content-box — pinning/dragging the TOC only changes padding, so
        // a border-box observation would miss the budget change until the next window resize.
        resizeObserver.observe(topBar, { box: "content-box" });
        mutObs = new MutationObserver(schedule);
        mutObs.observe(topBar, {
            subtree: true,
            childList: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["class"],
        });
    };

    const schedule = (): void => {
        if (rafId !== null) return;
        rafId = requestAnimationFrame(measure);
    };

    /**
     * Collapsed host viewport (non-webview tab) is a fake 300×150: measuring there would hide
     * buttons and flashing them back. A real 300×150 window still measures (regression A6):
     * a detached webview receives no input, so input means the size is genuine.
     */
    const scheduleUnlessCollapsed = (): void => {
        if (isHostCollapsedViewport()) return;
        schedule();
    };

    const resizeObserver = new ResizeObserver(scheduleUnlessCollapsed);
    resizeObserver.observe(document.body);
    window.addEventListener("resize", scheduleUnlessCollapsed);

    moreBtn.addEventListener("mousedown", (e) => {
        // Keep focus in the editor (otherwise the caret stays but typing stops).
        e.preventDefault();
    });
    moreBtn.addEventListener("click", () => {
        const el = host.getTopBarEl();
        if (!el) return;
        if (_activeMenu?.isOpen()) {
            closeMenu();
            return;
        }
        // Stale handle: the overlay dismissed itself (Escape / outside click / scroll).
        _activeMenu = null;
        openOverflowMenu(moreBtn, hiddenKeys, host);
    });

    schedule();

    return {
        dispose() {
            mutObs?.disconnect();
            if (rafId !== null) cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
            // Must be the exact registered reference (regression: removing `schedule` instead
            // of `scheduleUnlessCollapsed` leaked one listener per editor rebuild).
            window.removeEventListener("resize", scheduleUnlessCollapsed);
            moreBtn.remove();
            closeMenu();
        },
    };
}

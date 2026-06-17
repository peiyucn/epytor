import './toc.css';
import type { EditorView } from "@milkdown/kit/prose/view";
import { applyTooltip } from "@/ui/tooltip";
import { t } from "@/i18n";
import { IconPin, IconChevronRight, IconChevronDown, IconChevronsUp, IconChevronsDown } from "@/ui/icons";
import { getWebviewState, setWebviewState } from "@/messaging";

interface HeadingEntry {
    level: number;
    text: string;
    pos: number;
}

const TOC_WIDTH = 200;
const TOC_MIN_WIDTH = 200;
const TOC_MAX_WIDTH = 500;

export function initToc(getEditorView: () => EditorView | null): {
    panel: HTMLElement;
    toggle: () => void;
    refresh: () => void;
} {
    const panel = document.createElement("div");
    panel.className = "toc-panel";

    const header = document.createElement("div");
    header.className = "toc-header";

    const headerTitle = document.createElement("span");
    headerTitle.className = "toc-header-title";
    headerTitle.textContent = t("Table of Contents");

    // ── 全部折叠/展开按钮 ───────────────────────────────────
    const collapseAllBtn = document.createElement("button");
    collapseAllBtn.className = "toc-pin-btn"; // 复用 pin btn 样式
    collapseAllBtn.tabIndex = -1;
    collapseAllBtn.title = t("Collapse all");

    function updateCollapseBtn(): void {
        const headings = getHeadings();
        const anyExpanded = headings.some(
            (h, i) => hasChildren(headings, i) && !collapsedHeadings.has(h.pos),
        );
        collapseAllBtn.innerHTML = anyExpanded ? IconChevronsUp : IconChevronsDown;
        collapseAllBtn.title = anyExpanded ? t("Collapse all") : t("Expand all");
    }

    // ── 固定按钮 ──────────────────────────────────────────────
    const pinBtn = document.createElement("button");
    pinBtn.className = "toc-pin-btn";
    pinBtn.tabIndex = -1;
    pinBtn.innerHTML = IconPin;
    pinBtn.title = t("Pin panel");

    header.appendChild(headerTitle);
    header.appendChild(collapseAllBtn);
    header.appendChild(pinBtn);

    const list = document.createElement("div");
    list.className = "toc-list";

    panel.appendChild(header);
    panel.appendChild(list);

    // ── 右侧收起/展开 Tab（独立 fixed 元素，不受 panel overflow:hidden 影响）──
    const tabEl = document.createElement("button");
    tabEl.className = "toc-toggle-tab";
    tabEl.tabIndex = -1;
    document.body.appendChild(tabEl);

    let isOpen = false;
    let isAutoShown = false;
    let isPinned = false;
    let panelWidth = TOC_WIDTH;

    // 从 webview 状态恢复固定设置和面板宽度
    const savedState = getWebviewState();
    if (savedState?.tocPinned) {
        isPinned = true;
        pinBtn.classList.add("toc-pin-btn--active");
    }
    if (savedState?.tocWidth && typeof savedState.tocWidth === "number") {
        panelWidth = Math.min(TOC_MAX_WIDTH, Math.max(TOC_MIN_WIDTH, savedState.tocWidth));
    }
    panel.style.width = `${panelWidth}px`;

    // ── 折叠状态 ──────────────────────────────────────────────
    const collapsedHeadings = new Set<number>();
    if (Array.isArray(savedState?.tocCollapsed)) {
        for (const pos of savedState.tocCollapsed) {
            if (typeof pos === "number") collapsedHeadings.add(pos);
        }
    }
    updateCollapseBtn();

    // ── Pin 按钮点击 ─────────────────────────────────────────
    pinBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        isPinned = !isPinned;
        pinBtn.classList.toggle("toc-pin-btn--active", isPinned);
        // 钉住时不注册外部点击关闭；取消固定后若面板仍打开则补注册
        if (!isPinned && isOpen && !isAutoShown) {
            setTimeout(() => {
                document.addEventListener("mousedown", outsideClickHandler);
            }, 0);
        }
        syncBodyPadding();
        setWebviewState({ ...(getWebviewState() ?? {}), tocPinned: isPinned, tocWidth: panelWidth });
    });

    // ── 全部折叠/展开点击 ──────────────────────────────────────
    collapseAllBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const headings = getHeadings();
        const anyExpanded = headings.some(
            (h, i) => hasChildren(headings, i) && !collapsedHeadings.has(h.pos),
        );
        if (anyExpanded) {
            // 全部折叠
            headings.forEach((h, i) => {
                if (hasChildren(headings, i)) collapsedHeadings.add(h.pos);
            });
            collapseAllBtn.title = t("Expand all");
        } else {
            // 全部展开
            collapsedHeadings.clear();
            collapseAllBtn.title = t("Collapse all");
        }
        saveCollapsedState();
        updateCollapseBtn();
        refresh();
    });

    // ── 宽度拖拽手柄 ───────────────────────────────────────────
    const resizeHandle = document.createElement("div");
    resizeHandle.className = "toc-resize-handle";
    panel.appendChild(resizeHandle);

    resizeHandle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startWidth = panelWidth;
        document.body.classList.add("toc-resizing");

        function onMouseMove(ev: MouseEvent) {
            const delta = ev.clientX - startX;
            const newWidth = Math.min(
                TOC_MAX_WIDTH,
                Math.max(TOC_MIN_WIDTH, startWidth + delta),
            );
            if (newWidth !== panelWidth) {
                panelWidth = newWidth;
                panel.style.width = `${panelWidth}px`;
                updateTab();
                if (isPinned && isOpen) syncBodyPadding();
            }
        }

        function onMouseUp() {
            document.body.classList.remove("toc-resizing");
            document.removeEventListener("mousemove", onMouseMove);
            document.removeEventListener("mouseup", onMouseUp);
            setWebviewState({
                ...(getWebviewState() ?? {}),
                tocPinned: isPinned,
                tocWidth: panelWidth,
            });
        }

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
    });

    function updateTab(): void {
        tabEl.textContent = isOpen ? "‹" : "›";
        tabEl.style.left = isOpen ? `${panelWidth}px` : "0px";
    }
    updateTab();

    // ── 从 ProseMirror 文档中提取所有 heading 节点 ────────
    function getHeadings(): HeadingEntry[] {
        const view = getEditorView();
        if (!view) {
            return [];
        }
        const headings: HeadingEntry[] = [];
        view.state.doc.nodesBetween(
            0,
            view.state.doc.content.size,
            (node, pos) => {
                if (node.type.name === "heading") {
                    headings.push({
                        level: node.attrs["level"] as number,
                        text: node.textContent,
                        pos,
                    });
                }
            },
        );
        return headings;
    }

    function hasChildren(
        headings: HeadingEntry[],
        index: number,
    ): boolean {
        if (index >= headings.length - 1) return false;
        return headings[index + 1].level > headings[index].level;
    }

    function isHeadingVisible(
        headings: HeadingEntry[],
        index: number,
    ): boolean {
        let ancestorLevel = headings[index].level;
        for (let i = index - 1; i >= 0; i--) {
            if (headings[i].level < ancestorLevel) {
                if (collapsedHeadings.has(headings[i].pos)) return false;
                ancestorLevel = headings[i].level;
            }
        }
        return true;
    }

    function saveCollapsedState(): void {
        setWebviewState({
            ...(getWebviewState() ?? {}),
            tocPinned: isPinned,
            tocWidth: panelWidth,
            tocCollapsed: Array.from(collapsedHeadings),
        });
    }

    function refresh(): void {
        if (!isOpen) {
            return;
        }
        const headings = getHeadings();
        list.innerHTML = "";
        if (headings.length === 0) {
            const empty = document.createElement("div");
            empty.className = "toc-empty";
            empty.textContent = t("No headings");
            list.appendChild(empty);
            updateCollapseBtn();
            return;
        }
        headings.forEach(({ level, text, pos }, idx) => {
            if (!isHeadingVisible(headings, idx)) return;

            const item = document.createElement("div");
            item.className = `toc-item toc-item--h${level}`;
            item.style.paddingLeft = `${(level - 1) * 12 + 8}px`;

            // 折叠/展开按钮（无子项的也加占位符保持对齐）
            const hasKids = hasChildren(headings, idx);
            const toggle = document.createElement("span");
            toggle.className = "toc-collapse-toggle";
            if (hasKids) {
                const isCollapsed = collapsedHeadings.has(pos);
                toggle.innerHTML = isCollapsed ? IconChevronRight : IconChevronDown;
                toggle.addEventListener("mousedown", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (isCollapsed) {
                        collapsedHeadings.delete(pos);
                    } else {
                        collapsedHeadings.add(pos);
                    }
                    saveCollapsedState();
                    refresh();
                });
            }
            item.appendChild(toggle);

            // 标题文字 + 导航点击
            const label = document.createElement("span");
            label.className = "toc-item-label";
            label.textContent = text || `${t("Heading")} ${level}`;
            applyTooltip(label, text, {
                placement: "above",
                truncatedOnly: true,
            });
            label.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const view = getEditorView();
                if (!view) return;
                try {
                    const { node } = view.domAtPos(pos + 1);
                    let el: HTMLElement | null =
                        node.nodeType === Node.TEXT_NODE
                            ? node.parentElement
                            : (node as HTMLElement);
                    while (el && !el.matches("h1,h2,h3,h4,h5,h6")) {
                        el = el.parentElement;
                    }
                    if (el) {
                        const topbar = document.querySelector(
                            ".editor-topbar",
                        ) as HTMLElement | null;
                        const topbarH =
                            topbar?.getBoundingClientRect().height ?? 40;
                        const top =
                            el.getBoundingClientRect().top +
                            window.scrollY -
                            topbarH -
                            8;
                        window.scrollTo({ top, behavior: "smooth" });
                    }
                } catch {
                    /* 文档结构异常时忽略 */
                }
            });

            item.appendChild(label);
            list.appendChild(item);
        });
        updateCollapseBtn();
    }

    function outsideClickHandler(e: MouseEvent): void {
        if (isPinned) return; // 钉住时不因外部点击关闭
        if (!panel.contains(e.target as Node)) {
            close();
        }
    }

    function syncBodyPadding(): void {
        const active = isPinned && isOpen;
        document.body.classList.toggle("toc-pinned", active);
        if (active) {
            document.body.style.paddingLeft = `${panelWidth}px`;
            const topbar = document.querySelector<HTMLElement>(".editor-topbar");
            if (topbar) topbar.style.left = `${panelWidth}px`;
        } else {
            document.body.style.paddingLeft = "";
            const topbar = document.querySelector<HTMLElement>(".editor-topbar");
            if (topbar) topbar.style.left = "";
        }
    }

    function close(): void {
        isOpen = false;
        isAutoShown = false;
        panel.classList.remove("toc-panel--open");
        document.removeEventListener("mousedown", outsideClickHandler);
        updateTab();
        syncBodyPadding();
    }

    function openPanel(auto: boolean): void {
        isOpen = true;
        isAutoShown = auto;
        panel.classList.add("toc-panel--open");
        refresh();
        updateTab();
        syncBodyPadding();
        if (!auto && !isPinned) {
            // 手动打开才注册外部点击关闭（自动展开时或钉住时 TOC 持久显示）
            setTimeout(() => {
                document.addEventListener("mousedown", outsideClickHandler);
            }, 0);
        }
    }

    function toggle(): void {
        if (isOpen) {
            close();
        } else {
            openPanel(false);
        }
    }

    // Tab 点击：始终调用 toggle
    tabEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle();
    });

    // ── 自动展开检测 ──────────────────────────────────────
    function hasEnoughSpace(): boolean {
        const editorEl = document.getElementById("editor");
        if (!editorEl) {
            return false;
        }
        return editorEl.getBoundingClientRect().left >= panelWidth;
    }

    function checkAutoShow(): void {
        if (isPinned) return; // 钉住时不因窗口尺寸变化自动关闭
        if (hasEnoughSpace() && !isOpen) {
            openPanel(true);
        } else if (!hasEnoughSpace() && isAutoShown) {
            close();
        }
    }

    // ── 动态对齐到 topbar 底部，同步 tab 垂直位置 ──────────
    function updatePanelPosition(): void {
        const topbar = document.querySelector(
            ".editor-topbar",
        ) as HTMLElement | null;
        const topbarBottom = topbar?.getBoundingClientRect().bottom ?? 40;
        panel.style.top = `${topbarBottom}px`;
        panel.style.height = `calc(100vh - ${topbarBottom}px)`;
        // tab 垂直居中于面板
        const tabTop =
            topbarBottom + (window.innerHeight - topbarBottom) / 2 - 24;
        tabEl.style.top = `${tabTop}px`;
    }

    requestAnimationFrame(() => {
        updatePanelPosition();
        // 钉住状态下遮罩初始展开（不受窗口宽度限制）
        if (isPinned && !isOpen) {
            openPanel(true);
        }
        checkAutoShow();
    });

    window.addEventListener("resize", () => {
        updatePanelPosition();
        checkAutoShow();
    });

    return { panel, toggle, refresh };
}

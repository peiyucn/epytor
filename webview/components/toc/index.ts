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
    updatePosition: () => void;
    show: () => void;
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
    collapseAllBtn.className = "toc-pin-btn";
    collapseAllBtn.tabIndex = -1;
    const collapseAllTip = applyTooltip(collapseAllBtn, t("Collapse all"), { placement: "below" });

    function updateCollapseBtn(): void {
        const headings = getHeadings();
        const anyExpanded = headings.some(
            (h, i) => hasChildren(headings, i) && !collapsedHeadings.has(h.pos),
        );
        collapseAllBtn.innerHTML = anyExpanded ? IconChevronsUp : IconChevronsDown;
        collapseAllTip.setText(anyExpanded ? t("Collapse all") : t("Expand all"));
    }

    // ── 固定按钮 ──────────────────────────────────────────────
    const pinBtn = document.createElement("button");
    pinBtn.className = "toc-pin-btn";
    pinBtn.tabIndex = -1;
    pinBtn.innerHTML = IconPin;
    applyTooltip(pinBtn, t("Pin panel"), { placement: "below" });

    header.appendChild(headerTitle);
    header.appendChild(collapseAllBtn);
    header.appendChild(pinBtn);

    const list = document.createElement("div");
    list.className = "toc-list";

    panel.appendChild(header);
    panel.appendChild(list);

    // ── 右侧 Tab（独立 fixed 元素，JS 同步 left 对齐 panel 右边缘）──
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
            /** 根据 heading 在文档中的 pos 找到对应的 h1-h6 DOM 元素 */
            function findHeadingElement(view: EditorView, pos: number): HTMLElement | null {
                const dom = view.nodeDOM(pos) as HTMLElement | null;
                if (dom && dom.matches("h1,h2,h3,h4,h5,h6")) return dom;

                // 回退：pos 可能落在文本节点内，向上遍历找到标题元素
                const { node } = view.domAtPos(pos + 1);
                let el: HTMLElement | null =
                    node.nodeType === Node.TEXT_NODE
                        ? node.parentElement
                        : (node as HTMLElement);
                while (el && !el.matches("h1,h2,h3,h4,h5,h6")) {
                    el = el.parentElement;
                }
                return el;
            }

            label.addEventListener("mousedown", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const view = getEditorView();
                if (!view) return;
                try {
                    const el = findHeadingElement(view, pos);
                    if (el) {
                        const topbar = document.querySelector(".milkdown-top-bar") as HTMLElement | null;
                        const topbarH = topbar?.getBoundingClientRect().height ?? 40;
                        const top = el.getBoundingClientRect().top + window.scrollY - topbarH - 8;
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
        const topbar = document.querySelector<HTMLElement>(".milkdown-top-bar");
        if (active) {
            document.body.style.paddingLeft = `${panelWidth}px`;
            if (topbar) topbar.style.paddingLeft = `${panelWidth}px`;
        } else {
            document.body.style.paddingLeft = '';
            if (topbar) topbar.style.paddingLeft = '';
        }
    }

    function updateTabPos(): void {
        tabEl.style.left = isOpen ? `${panelWidth}px` : '0px';
    }

    function close(): void {
        isOpen = false;
        isAutoShown = false;
        panel.classList.remove("toc-panel--open");
        document.removeEventListener("mousedown", outsideClickHandler);
        updateTabPos();
        syncBodyPadding();
    }

    function openPanel(auto: boolean): void {
        isOpen = true;
        isAutoShown = auto;
        panel.classList.add("toc-panel--open");
        refresh();
        updateTabPos();
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

    // Tab：关闭时点按=toggle，展开时点按=toggle / 拖拽=调整宽度
    let tabDragStart = 0;
    let tabDragWidth = 0;
    let tabDragging = false;
    tabEl.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // 关闭状态：不进入拖拽，直接 toggle
        if (!isOpen) { toggle(); return; }
        tabDragStart = e.clientX;
        tabDragWidth = panelWidth;
        tabDragging = false;
        document.body.classList.add("toc-resizing");

        function onMove(ev: MouseEvent) {
            const delta = ev.clientX - tabDragStart;
            if (!tabDragging && Math.abs(delta) < 3) return;
            tabDragging = true;
            const newWidth = Math.min(TOC_MAX_WIDTH, Math.max(TOC_MIN_WIDTH, tabDragWidth + delta));
            if (newWidth !== panelWidth) {
                panelWidth = newWidth;
                panel.style.width = `${panelWidth}px`;
                updateTabPos();
                syncBodyPadding();
            }
        }
        function onUp() {
            document.body.classList.remove("toc-resizing");
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            if (!tabDragging) toggle();
            setWebviewState({ ...(getWebviewState() ?? {}), tocPinned: isPinned, tocWidth: panelWidth });
        }
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
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
        // TOC 吸顶：从视口最顶部开始，全高
        panel.style.top = '36px';
        panel.style.height = 'calc(100vh - 36px)';
        // tab 全高细竖条，CSS 已处理
    }

    updateTabPos();
    requestAnimationFrame(() => {
        updatePanelPosition();
        if (isPinned && !isOpen) {
            openPanel(true);
        }
        checkAutoShow();
    });

    window.addEventListener("resize", () => {
        updatePanelPosition();
        checkAutoShow();
    });

    function show(): void {
        panel.style.visibility = 'visible';
        tabEl.style.visibility = 'visible';
    }

    return { panel, toggle, refresh, updatePosition: updatePanelPosition, show };
}

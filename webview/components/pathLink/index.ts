import "./pathLink.css";
import { notifyOpenFile } from "@/messaging";
import { isModifierActive, onModifierChange } from "@/ui/modifierKeys";

// Matches @/path, ./path, ../path, dir/file and file.ext (with an optional :line / :line-range).
const PATH_REGEX =
    /^(@\/[^\s]+|\.{1,2}\/[^\s]+|[a-zA-Z0-9_-][a-zA-Z0-9._-]*\/[^\s]+|[a-zA-Z0-9_-][a-zA-Z0-9._-]*\.[a-zA-Z][a-zA-Z0-9]*(#\d+(-\d+)?)?)$/;

function isPathLike(text: string): boolean {
    return PATH_REGEX.test(text.trim());
}

// Eligible: a <code> that is not inside a code block or an existing link and looks like a path.
function isEligibleCode(el: Element): boolean {
    if (el.tagName !== "CODE") return false;
    if (el.closest("pre")) return false;
    if (el.closest("a")) return false;
    return isPathLike(el.textContent ?? "");
}

export function setupPathLink(container: HTMLElement): void {
    let activeCode: Element | null = null;
    let lastHoveredCode: Element | null = null;

    function highlight(el: Element): void {
        if (activeCode === el) return;
        unhighlight();
        activeCode = el;
        el.classList.add("path-link--active");
    }

    function unhighlight(): void {
        if (!activeCode) return;
        activeCode.classList.remove("path-link--active");
        activeCode = null;
    }

    // Ctrl/Meta tracking is shared with the CSS body class (ui/modifierKeys); page-lifecycle
    // setup, so the subscription is never torn down.
    onModifierChange((held) => {
        if (!held) {
            unhighlight();
            return;
        }
        // Modifier pressed while already hovering: highlight immediately.
        if (lastHoveredCode && isEligibleCode(lastHoveredCode)) {
            highlight(lastHoveredCode);
        }
    });

    container.addEventListener("mouseover", (e) => {
        const code = (e.target as Element).closest("code");
        if (code && isEligibleCode(code)) {
            lastHoveredCode = code;
            if (isModifierActive()) highlight(code);
        } else {
            lastHoveredCode = null;
            unhighlight();
        }
    });

    container.addEventListener("mouseout", (e) => {
        const related = e.relatedTarget as Node | null;
        // Moving into a child keeps the code element highlighted.
        if (activeCode && related && activeCode.contains(related)) return;
        lastHoveredCode = null;
        if (isModifierActive()) unhighlight();
    });

    container.addEventListener("click", (e) => {
        const me = e as MouseEvent;
        if (!me.metaKey && !me.ctrlKey) return;

        const code = (me.target as Element).closest("code");
        if (!code || !isEligibleCode(code)) return;

        e.preventDefault();
        e.stopPropagation();
        const path = (code.textContent ?? "").trim();
        notifyOpenFile(path);
        unhighlight();
    });
}

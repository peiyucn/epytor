

const RESTORE_FRAMES = 2;

let lastRealScrollY = 0;

let hasRealScrollRecord = false;

let wasCollapsed = false;

let restoringScroll = false;

export function recordScrollPosition(collapsed: boolean): void {
    if (restoringScroll || collapsed) { return; }
    lastRealScrollY = window.scrollY;
    hasRealScrollRecord = true;
}

function restoreTo(expected: number): void {
    restoringScroll = true;
    const restore = (): void => {
        if (window.scrollY !== expected) { window.scrollTo(0, expected); }
    };
    const tick = (remaining: number): void => {
        restore();
        if (remaining > 1) { requestAnimationFrame(() => tick(remaining - 1)); }
        else { restoringScroll = false; }
    };
    requestAnimationFrame(() => tick(RESTORE_FRAMES));
}

export function trackViewportResize(collapsed: boolean): void {
    if (wasCollapsed && !collapsed && hasRealScrollRecord) {
        restoreTo(lastRealScrollY);
    } else if (!collapsed) {
        lastRealScrollY = window.scrollY;
        hasRealScrollRecord = true;
    }
    wasCollapsed = collapsed;
}

export function clearCollapsedEdge(): void {
    wasCollapsed = false;
}

export interface TopBarMeasuredItem {

    key: string;
    width: number;
}

export interface OverflowBudgetInput {
    items: TopBarMeasuredItem[];
    containerWidth: number;
    moreBtnWidth: number;

    pinnedKeys?: ReadonlySet<string>;
}

export function computeOverflow(input: OverflowBudgetInput): Set<string> {
    const { items, containerWidth, moreBtnWidth } = input;
    const pinned = input.pinnedKeys ?? new Set<string>();
    const hidden = new Set<string>();

    const total = items.reduce((sum, item) => sum + item.width, 0);
    if (total <= containerWidth - moreBtnWidth) {
        return hidden;
    }

    let used = total;
    for (let i = items.length - 1; i >= 0; i--) {
        if (used <= containerWidth - moreBtnWidth) break;
        const item = items[i];
        if (pinned.has(item.key)) continue;
        hidden.add(item.key);
        used -= item.width;
    }
    for (let i = items.length - 1; i >= 0; i--) {
        if (used <= containerWidth - moreBtnWidth) break;
        const item = items[i];
        if (hidden.has(item.key)) continue;
        hidden.add(item.key);
        used -= item.width;
    }
    return hidden;
}



export interface MdastNode {
    type?: string;
    checked?: boolean | null;
    value?: unknown;
    children?: MdastNode[];
}

const EMPTY_TASK_MARKER_RE = /^\[([ xX])\][ \t]*$/;

export function fixEmptyTaskListItems(root: unknown): void {
    walk(root as MdastNode | undefined);
}

function walk(node: MdastNode | undefined): void {
    if (!node || !Array.isArray(node.children)) { return; }
    for (const child of node.children) {
        if (child?.type === "listItem") { fixEmptyItem(child); }
        walk(child);
    }
}

function fixEmptyItem(item: MdastNode): void {
    if (typeof item.checked === "boolean") { return; }
    const head = item.children?.[0];
    if (head?.type !== "paragraph" || head.children?.length !== 1) { return; }
    const text = head.children[0];
    if (text?.type !== "text" || typeof text.value !== "string") { return; }

    const match = EMPTY_TASK_MARKER_RE.exec(text.value);
    if (!match) { return; }
    item.checked = match[1].toLowerCase() === "x";

    head.children?.shift();
}

export const emptyTaskListItemPlugin = () =>
    (tree: unknown): void => {
        fixEmptyTaskListItems(tree);
    };

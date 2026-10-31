/**
 * Fix empty task items so `- [ ] ` / `- [x] ` (marker with no content) is still a checkbox.
 *
 * remark-gfm only recognizes a task item when content follows `[ ]`; otherwise `checked`
 * stays null and `[ ]` remains body text, so notes show a bullet with a literal `[ ]` and
 * saving escapes the bracket (regression). After parsing, an item whose first block is a
 * marker-only paragraph gets `checked` set and just the marker text removed, producing the
 * same tree as `- [ ] a`. If upstream ever supports empty markers, the `checked` guard
 * makes this a no-op.
 */

/** Minimal mdast shape; avoids taking @types/mdast just for this module. */
export interface MdastNode {
    type?: string;
    checked?: boolean | null;
    value?: unknown;
    children?: MdastNode[];
}

/** Marker-only task text: `[ ]` / `[x]` / `[X]`, trailing whitespace only. */
const EMPTY_TASK_MARKER_RE = /^\[([ xX])\][ \t]*$/;

/** Fix the tree in place (mutates `checked` / `children`, creates no nodes). */
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
    // Drop only the marker text but keep the paragraph: mdast serialization needs a leading
    // paragraph or the checkbox is lost (`- [ ] ` became `-`). The empty paragraph gets a
    // `<br />` placeholder that stripListItemBreakPlaceholder removes later.
    head.children?.shift();
}

/**
 * remark plugin (registered via `$remark`), after remark-gfm: it consumes the listItem
 * structure gfm produced.
 */
export const emptyTaskListItemPlugin = () =>
    (tree: unknown): void => {
        fixEmptyTaskListItems(tree);
    };

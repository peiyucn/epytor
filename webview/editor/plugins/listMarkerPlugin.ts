import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { computeListMarker } from "../../markdown/listMarker";

/**
 * Word-style multilevel list markers (display only): one decoration per list item, carrying its
 * depth and the marker to display. Depth becomes `epytor-li-level-N`, which CSS maps to ●/■/◆.
 * Numbering must be computed here: CSS counters cannot see a list's start `order` (e.g. resumed
 * at 3 after a backspace), and CSS has no depth selector, so it cannot tell the 4th level's
 * wrap-around. Markers ride custom properties (`--epytor-marker: "a)"`) painted with
 * `content: var(...)`.
 *
 * Decorations never touch the document (not serialized). Task items (`checked` non-null) are
 * skipped so their checkboxes stay native.
 * See docs/specs/2026-09-12-word-style-multilevel-markers.md.
 */
export const listMarkerPluginKey = new PluginKey("epytor-list-marker");

/** What one list item should render (plain data, directly testable). */
export interface ListMarkerDecoration {
    from: number;
    to: number;
    cls: string;
    style: string;
}

const isList = (node: ProseNode): boolean =>
    node.type.name === "bullet_list" || node.type.name === "ordered_list";

const isTaskItem = (node: ProseNode): boolean =>
    node.attrs.checked !== null && node.attrs.checked !== undefined;

/**
 * Walk the doc and collect decoration data for every list item (pure, view-independent).
 * Depth-first: list → each item (at `depth`) → drill into the item (`depth + 1`).
 */
export function collectListMarkers(doc: ProseNode): ListMarkerDecoration[] {
    const out: ListMarkerDecoration[] = [];

    const walk = (node: ProseNode, offset: number, depth: number): void => {
        node.forEach((child, childOffset) => {
            const pos = offset + childOffset;
            if (isList(child)) {
                const kind = child.type.name === "ordered_list" ? "ordered" : "bullet";
                const order = Number(child.attrs.order ?? 1);
                let index = 0;
                child.forEach((item, itemOffset) => {
                    const itemPos = pos + 1 + itemOffset;
                    if (item.type.name === "list_item" && !isTaskItem(item)) {
                        const marker = computeListMarker(kind, depth, index, order);
                        // Custom properties inherit from the nearest ancestor, so a marker cannot leak;
                        // a depth class + depth selector would hit ancestors' rules at level 4's wrap.
                        const style = [
                            marker.text === null ? null : `--epytor-marker: "${marker.text}"`,
                            `--epytor-marker-size: ${marker.bullet.size}`,
                            `--epytor-marker-radius: ${marker.bullet.radius}`,
                            `--epytor-marker-rotate: ${marker.bullet.rotate}`,
                        ].filter((part): part is string => part !== null).join("; ");
                        out.push({
                            from: itemPos,
                            to: itemPos + item.nodeSize,
                            cls: `epytor-li-level-${marker.level}`,
                            style,
                        });
                    }
                    index += 1;
                    walk(item, itemPos + 1, depth + 1);
                });
                return;
            }
            walk(child, pos + 1, depth);
        });
    };

    walk(doc, 0, 1);
    return out;
}

export const listMarkerPlugin = $prose(() => {
    // Decorations depend on the doc only: reuse the previous result for transactions that leave
    // it unchanged (selection, scroll) instead of rescanning on every keystroke.
    let cachedDoc: ProseNode | null = null;
    let cachedSet: DecorationSet | null = null;

    return new Plugin({
        key: listMarkerPluginKey,
        props: {
            decorations(state) {
                if (state.doc === cachedDoc && cachedSet) { return cachedSet; }
                cachedDoc = state.doc;
                cachedSet = DecorationSet.create(
                    state.doc,
                    collectListMarkers(state.doc).map((d) =>
                        Decoration.node(d.from, d.to, { class: d.cls, style: d.style }),
                    ),
                );
                return cachedSet;
            },
        },
    });
});

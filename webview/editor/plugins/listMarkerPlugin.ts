import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { computeListMarker } from "../../markdown/listMarker";

export const listMarkerPluginKey = new PluginKey("epytor-list-marker");

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

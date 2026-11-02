/**
 * Heading folding via ProseMirror decorations; fold state lives in plugin state and never
 * touches the document. Adapted from git-xing/md-wysiwyg-editor v0.3.x, minus its level
 * dropdown and `#H` markers (epytor's top bar already has the official heading dropdown). The
 * gutter holds only the fold arrow, shown on heading hover.
 */
import "../../heading.css";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { IconChevronDown, IconChevronRight } from "../../ui/icons";
import { applyTooltip, hideTooltip } from "../../ui/tooltip";
import { t } from "../../i18n";
import { findHeadingFoldRange, getHeadingLevel, isHeadingNode, buildHeadingIndex, computeAllHeadingSignature, computeHeadingSignature } from "../../outline/headingFold";
import { getWebviewState, setWebviewState } from "../../messaging";

/**
 * Persist fold state so it survives editor rebuilds. Plugin state dies with the Milkdown
 * instance (revert, window reload, tab reopen), so the fold set is kept in webview state and
 * validated by a heading-structure signature: a changed doc would fold the wrong headings.
 * Keep-alive tab switches need no persistence — that instance is still alive.
 */
function persistFoldState(doc: ProseNode, folded: ReadonlySet<number>): void {
    const cur = getWebviewState() ?? {};
    setWebviewState({
        ...cur,
        foldState: { sig: computeAllHeadingSignature(doc), folded: [...folded] },
    });
}

/**
 * Filter restored fold positions down to those still pointing at a heading (the doc may have
 * changed; a stale position would fold the wrong heading). Pure function, directly testable.
 */
export function normalizeFoldPositions(doc: ProseNode, folded: number[]): number[] {
    return folded.filter((pos) => {
        if (!Number.isInteger(pos) || pos < 0 || pos > doc.content.size) { return false; }
        try {
            return isHeadingNode(doc.nodeAt(pos));
        } catch {
            return false;
        }
    });
}

export type HeadingFoldMeta =
    | { type: "toggle"; pos: number }
    /** Replace the whole fold set (restored from webview state on rebuild; see index.ts restoreFoldState). */
    | { type: "set"; folded: number[] };
type HeadingFoldRange = { from: number; to: number };

export const headingFoldPluginKey = new PluginKey<Set<number>>("epytor-heading-fold");

function createFoldGutter(
    view: import("@milkdown/kit/prose/view").EditorView,
    headingPos: number,
    collapsed: boolean,
): HTMLElement {
    const gutter = document.createElement("span");
    gutter.className = "heading-fold-gutter";
    gutter.contentEditable = "false";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "heading-fold-toggle";
    button.innerHTML = collapsed ? IconChevronRight : IconChevronDown;
    const tipText = collapsed ? t("Expand content") : t("Collapse content");
    button.setAttribute("aria-label", tipText);
    button.setAttribute("aria-expanded", collapsed ? "false" : "true");
    applyTooltip(button, tipText, { placement: "above" });

    button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
    });
    button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const node = view.state.doc.nodeAt(headingPos);
        if (!isHeadingNode(node)) return;

        const tr = view.state.tr
            .setMeta(headingFoldPluginKey, { type: "toggle", pos: headingPos } satisfies HeadingFoldMeta)
            .setMeta("addToHistory", false);

        if (!collapsed) {
            const range = findHeadingFoldRange(view.state.doc, headingPos, getHeadingLevel(node));
            if (
                range &&
                view.state.selection.from < range.to &&
                view.state.selection.to > range.from
            ) {
                // Cursor sits inside the range about to collapse: move it out first.
                tr.setSelection(
                    TextSelection.near(tr.doc.resolve(Math.min(headingPos + 1, tr.doc.content.size))),
                );
            }
        }

        view.dispatch(tr);
        view.focus();
        hideTooltip();
    });

    gutter.appendChild(button);
    return gutter;
}

export function buildFoldDecorations(doc: ProseNode, folded: ReadonlySet<number>): DecorationSet {
    const decorations: Decoration[] = [];
    const hiddenRanges: HeadingFoldRange[] = [];
    // Shared heading index: one pass yields both headings and fold ranges, same view as TOC/sticky.
    for (const entry of buildHeadingIndex(doc)) {
        if (!entry.topLevel) continue; // Folding applies to top-level headings only (nested ones are neither decorated nor sticky).

        const collapsed = folded.has(entry.pos);
        const foldable = entry.foldRange !== null;

        decorations.push(
            Decoration.node(entry.pos, entry.pos + entry.size, {
                class: `heading-fold-heading${foldable ? " heading-fold-heading--foldable" : ""}${collapsed ? " heading-fold-heading--collapsed" : ""}`,
            }),
        );
        if (foldable) {
            decorations.push(
                Decoration.widget(
                    entry.pos + 1,
                    (view) => createFoldGutter(view, entry.pos, collapsed),
                    {
                        // Key includes fold state so a flip rebuilds the widget (chevron icon swap).
                        key: `epytor-heading-fold-gutter-${entry.pos}-${collapsed ? "closed" : "open"}`,
                    },
                ),
            );
        }

        if (collapsed && entry.foldRange) {
            hiddenRanges.push(entry.foldRange);
        }
    }

    if (hiddenRanges.length > 0) {
        // Merge overlapping ranges (outer folds contain inner ones) so a single two-pointer pass
        // over top-level blocks can decide visibility. Regression: per-block `some` was O(blocks x folds).
        const sorted = [...hiddenRanges].sort((a, b) => a.from - b.from);
        const merged: HeadingFoldRange[] = [];
        for (const range of sorted) {
            const last = merged[merged.length - 1];
            if (last && range.from <= last.to) {
                last.to = Math.max(last.to, range.to);
            } else {
                merged.push({ from: range.from, to: range.to });
            }
        }
        let rangeIdx = 0;
        doc.forEach((node, offset) => {
            while (rangeIdx < merged.length && offset >= merged[rangeIdx].to) {
                rangeIdx++;
            }
            const range = merged[rangeIdx];
            if (range && offset >= range.from && offset < range.to) {
                decorations.push(
                    Decoration.node(offset, offset + node.nodeSize, {
                        class: "heading-fold-hidden",
                    }),
                );
            }
        });
    }

    return decorations.length > 0 ? DecorationSet.create(doc, decorations) : DecorationSet.empty;
}

export const headingFoldPlugin = $prose(() => {
    // Per-instance decoration cache, reused while the heading + fold signature is unchanged.
    let cachedSignature = "";
    let cachedDecorations: DecorationSet | null = null;

    return new Plugin<Set<number>>({
        key: headingFoldPluginKey,
        state: {
            init: () => new Set<number>(),
            apply(tr, value, _oldState, newState) {
                let next = value;

                if (tr.docChanged) {
                    next = new Set<number>();
                    for (const pos of value) {
                        const mapped = tr.mapping.map(pos, -1);
                        if (isHeadingNode(newState.doc.nodeAt(mapped))) {
                            next.add(mapped);
                        }
                    }
                }

                const meta = tr.getMeta(headingFoldPluginKey) as HeadingFoldMeta | undefined;
                if (meta?.type === "set") {
                    next = new Set<number>(normalizeFoldPositions(newState.doc, meta.folded));
                }

                if (meta?.type === "toggle") {
                    next = new Set<number>(next);
                    if (next.has(meta.pos)) {
                        next.delete(meta.pos);
                    } else if (isHeadingNode(newState.doc.nodeAt(meta.pos))) {
                        next.add(meta.pos);
                    }
                }

                return next;
            },
        },
        props: {
            decorations(state) {
                const folded = headingFoldPluginKey.getState(state) ?? new Set<number>();
                // Reuse while the signature holds. Regression: rebuilding on every keystroke caused
                // typing lag on 10k-line docs; debouncing only postponed the cost.
                const signature = computeHeadingSignature(state.doc, folded);
                if (cachedDecorations !== null && signature === cachedSignature) {
                    return cachedDecorations;
                }
                cachedSignature = signature;
                cachedDecorations = buildFoldDecorations(state.doc, folded);
                return cachedDecorations;
            },
            handleKeyDown(view, event) {
                // Enter at the end of a folded heading: expand first, then let the default run.
                if (event.key !== "Enter") return false;
                const folded = headingFoldPluginKey.getState(view.state);
                if (!folded || folded.size === 0) return false;

                const { $from } = view.state.selection;
                let headingPos: number | null = null;
                let headingTextLen = 0;
                for (let depth = $from.depth; depth >= 0; depth--) {
                    const node = $from.node(depth);
                    if (node.type.name === "heading") {
                        headingPos = $from.before(depth);
                        headingTextLen = node.textContent.length;
                        break;
                    }
                }
                if (headingPos === null || !folded.has(headingPos)) return false;
                if ($from.pos < headingPos + 1 + headingTextLen) return false;

                // Expand and put the cursor in the first revealed block (no new paragraph).
                const headingNode = view.state.doc.nodeAt(headingPos);
                const range = headingNode
                    ? findHeadingFoldRange(view.state.doc, headingPos, getHeadingLevel(headingNode))
                    : null;
                const tr = view.state.tr
                    .setMeta(headingFoldPluginKey, { type: "toggle", pos: headingPos } satisfies HeadingFoldMeta)
                    .setMeta("addToHistory", false);
                if (range) {
                    tr.setSelection(
                        TextSelection.near(tr.doc.resolve(Math.min(range.from + 1, tr.doc.content.size))),
                    );
                }
                view.dispatch(tr);
                view.focus();
                return true;
            },
        },
        view(view) {
            let hoveredGutter: HTMLElement | null = null;

            const setHoveredGutter = (gutter: HTMLElement | null) => {
                if (gutter === hoveredGutter) return;
                hoveredGutter?.classList.remove("heading-fold-gutter--visible");
                hoveredGutter = gutter;
                hoveredGutter?.classList.add("heading-fold-gutter--visible");
            };

            const handleMouseMove = (event: MouseEvent) => {
                const target = event.target as Element | null;
                const heading = target?.closest("h1,h2,h3,h4,h5,h6") ?? null;
                if (heading && view.dom.contains(heading)) {
                    setHoveredGutter(heading.querySelector<HTMLElement>(".heading-fold-gutter"));
                } else {
                    setHoveredGutter(null);
                }
            };

            const handleMouseLeave = () => setHoveredGutter(null);
            view.dom.addEventListener("mousemove", handleMouseMove);
            view.dom.addEventListener("mouseleave", handleMouseLeave);

            return {
                update(_view, prevState) {
                    if (hoveredGutter && !view.dom.contains(hoveredGutter)) {
                        setHoveredGutter(null);
                    }
                    // Persist on change (restored after a webview rebuild). An unchanged Set keeps
                    // its identity, so this per-transaction comparison stays O(1).
                    const folded = headingFoldPluginKey.getState(view.state);
                    if (folded !== headingFoldPluginKey.getState(prevState)) {
                        persistFoldState(view.state.doc, folded ?? new Set<number>());
                    }
                },
                destroy() {
                    view.dom.removeEventListener("mousemove", handleMouseMove);
                    view.dom.removeEventListener("mouseleave", handleMouseLeave);
                    setHoveredGutter(null);
                },
            };
        },
    });
});

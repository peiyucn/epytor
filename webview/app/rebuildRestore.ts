/**
 * Restore plan for continuity after an editor rebuild (revert / init); pure and testable.
 *
 * Regression: revert recreates the whole editor, focus returns to `<body>` and the caret
 * jumps to 1:1. Any revert takes this path, so focus/selection/scroll must be restored.
 * Focus only when the editor had it and the panel is active (background webviews must not
 * steal it). Selection and scroll are restored regardless of focus: without that,
 * returning to the editor lands the caret at the default position, which was the 1:1
 * regression. Equal content restores the exact selection; changed content keeps only a
 * clamped caret.
 */

export interface TextSelectionRange {
    from: number;
    to: number;
}

export interface RebuildRestoreInput {
    /** Whether the editor held focus before the rebuild. */
    hadEditorFocus: boolean;
    /** Whether the panel is active (a background webview must not grab focus). */
    isActivePanel: boolean;
    /** Text selection before the rebuild; null = non-text or no editor. */
    previousSelection: TextSelectionRange | null;
    /** Whether old and new document content are equal. */
    docUnchanged: boolean;
    /** New document content.size, for clamping. */
    docSize: number;
    /** Window scroll position before the rebuild. */
    previousScrollY: number;
}

export interface RebuildRestorePlan {
    restoreFocus: boolean;
    /** Selection to restore (null = none / non-text selection). */
    selection: TextSelectionRange | null;
    /** Scroll position to restore (null = do not restore). */
    scrollY: number | null;
}

export function planRebuildRestore(input: RebuildRestoreInput): RebuildRestorePlan {
    const restoreFocus = input.hadEditorFocus && input.isActivePanel;

    let selection: TextSelectionRange | null = null;
    if (input.previousSelection) {
        const clamp = (pos: number): number => Math.max(0, Math.min(pos, input.docSize));
        const from = clamp(Math.min(input.previousSelection.from, input.previousSelection.to));
        const to = clamp(Math.max(input.previousSelection.from, input.previousSelection.to));
        // Changed content: keep the caret only, so nothing unrelated stays selected.
        selection = input.docUnchanged ? { from, to } : { from, to: from };
    }

    return {
        restoreFocus,
        selection,
        scrollY: input.previousScrollY,
    };
}

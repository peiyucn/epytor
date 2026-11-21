

export interface TextSelectionRange {
    from: number;
    to: number;
}

export interface RebuildRestoreInput {

    hadEditorFocus: boolean;

    isActivePanel: boolean;

    previousSelection: TextSelectionRange | null;

    docUnchanged: boolean;

    docSize: number;

    previousScrollY: number;
}

export interface RebuildRestorePlan {
    restoreFocus: boolean;

    selection: TextSelectionRange | null;

    scrollY: number | null;
}

export function planRebuildRestore(input: RebuildRestoreInput): RebuildRestorePlan {
    const restoreFocus = input.hadEditorFocus && input.isActivePanel;

    let selection: TextSelectionRange | null = null;
    if (input.previousSelection) {
        const clamp = (pos: number): number => Math.max(0, Math.min(pos, input.docSize));
        const from = clamp(Math.min(input.previousSelection.from, input.previousSelection.to));
        const to = clamp(Math.max(input.previousSelection.from, input.previousSelection.to));

        selection = input.docUnchanged ? { from, to } : { from, to: from };
    }

    return {
        restoreFocus,
        selection,
        scrollY: input.previousScrollY,
    };
}

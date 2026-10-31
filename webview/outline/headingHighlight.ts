/**
 * Click-to-pin TOC highlighting (pure, jsdom-testable).
 *
 * Highlight is scroll geometry: the current section is the last heading whose top crossed
 * the reading line. In the last `viewportHeight - topbarBottom` px that line slides to the
 * viewport bottom, so in a short document every heading sits above it and clicking item 4
 * highlights the last item (regression). Such documents cannot scroll far enough to
 * express the click, so a click pins the highlight until the next interaction; the epoch
 * comes from `shell/userInteraction.ts`.
 */

export interface HeadingHighlightPin {
    /** Document position of the clicked heading (current value at click time). */
    pos: number;
    /** Interaction epoch at pin time; any change since then means the user acted. */
    epoch: number;
}

export function pinHeadingHighlight(pos: number, epoch: number): HeadingHighlightPin {
    return { pos, epoch };
}

export interface HighlightResolution {
    /** Position to highlight (null = none). */
    pos: number | null;
    /** Resolved pin (null = released). */
    pin: HeadingHighlightPin | null;
}

/** No pin -> scroll-follow; same epoch -> keep the clicked item; older epoch -> release. */
export function resolveHighlight(
    pin: HeadingHighlightPin | null,
    incoming: number | null,
    currentEpoch: number,
): HighlightResolution {
    if (pin === null) { return { pos: incoming, pin: null }; }
    if (currentEpoch !== pin.epoch) { return { pos: incoming, pin: null }; }
    return { pos: pin.pos, pin };
}

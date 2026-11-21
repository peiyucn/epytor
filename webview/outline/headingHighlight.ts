

export interface HeadingHighlightPin {

    pos: number;

    epoch: number;
}

export function pinHeadingHighlight(pos: number, epoch: number): HeadingHighlightPin {
    return { pos, epoch };
}

export interface HighlightResolution {

    pos: number | null;

    pin: HeadingHighlightPin | null;
}

export function resolveHighlight(
    pin: HeadingHighlightPin | null,
    incoming: number | null,
    currentEpoch: number,
): HighlightResolution {
    if (pin === null) { return { pos: incoming, pin: null }; }
    if (currentEpoch !== pin.epoch) { return { pos: incoming, pin: null }; }
    return { pos: pin.pos, pin };
}

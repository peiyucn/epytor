/**
 * Page-lifecycle singleton: one interaction-epoch counter shared by every consumer.
 * No teardown by design (same lifetime as the page); do not dispose it on editor rebuild.
 */
const USER_INTERACTION_EVENTS = [
    "keydown", "mousedown", "paste", "drop", "cut", "wheel", "touchstart",
] as const;

/** Events that count as user interaction (single source of truth); consumers must reuse this list. */
export const USER_INTERACTION_EVENT_TYPES: readonly string[] = USER_INTERACTION_EVENTS;

let _epoch = 0;

for (const evt of USER_INTERACTION_EVENTS) {
    document.addEventListener(
        evt,
        () => {
            _epoch += 1;
        },
        { capture: true, passive: true },
    );
}

/** Unequal to an earlier snapshot means the user interacted in between. */
export function getUserInteractionEpoch(): number {
    return _epoch;
}

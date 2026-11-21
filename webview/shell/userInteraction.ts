
const USER_INTERACTION_EVENTS = [
    "keydown", "mousedown", "paste", "drop", "cut", "wheel", "touchstart",
] as const;

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

export function getUserInteractionEpoch(): number {
    return _epoch;
}

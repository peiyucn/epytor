import type { PathSuggestionItem } from "../../shared/messages";
import { PATH_SUGGESTION_TIMEOUT_MS } from "../../shared/constants";
import { PendingRequestRegistry, type PendingHandle } from "../app/pendingRequest";

/**
 * Path suggestion request bus.
 *
 * Regression P4/C4: both consumers hand-rolled a Map + id + timeout (duplicating
 * PendingRequestRegistry) and `index.ts` dispatched each response into both registries.
 * One registry, one entry point; the id prefix is diagnostic only.
 */
const _registry = new PendingRequestRegistry<PathSuggestionItem[]>("path");

/** Register a request; the caller then sends `notifyGetPathSuggestions(handle.id, query)`. */
export function beginPathSuggestionRequest(): PendingHandle<PathSuggestionItem[]> {
    return _registry.begin({
        timeoutMs: PATH_SUGGESTION_TIMEOUT_MS,
        timeout: { kind: "reject", error: "path suggestion timeout" },
    });
}

/** Settle a response (the single dispatch point for incoming pathSuggestions). */
export function resolvePathSuggestionRequest(id: string, items: PathSuggestionItem[]): void {
    _registry.resolve(id, items);
}

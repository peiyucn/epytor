import type { PathSuggestionItem } from "../../shared/messages";
import { PATH_SUGGESTION_TIMEOUT_MS } from "../../shared/constants";
import { PendingRequestRegistry, type PendingHandle } from "../app/pendingRequest";

const _registry = new PendingRequestRegistry<PathSuggestionItem[]>("path");

export function beginPathSuggestionRequest(): PendingHandle<PathSuggestionItem[]> {
    return _registry.begin({
        timeoutMs: PATH_SUGGESTION_TIMEOUT_MS,
        timeout: { kind: "reject", error: "path suggestion timeout" },
    });
}

export function resolvePathSuggestionRequest(id: string, items: PathSuggestionItem[]): void {
    _registry.resolve(id, items);
}

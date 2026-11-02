/**
 * Fire-and-forget wrapper for VS Code thenables whose rejection must not become an unhandled
 * rejection.
 *
 * `openExternal` rejects when no application is associated (a `mailto:` without a mail client is
 * the common case) and `executeCommand` rejects for commands the host does not know (older VS
 * Code builds). The callers deliberately do not surface those failures to the user — the action
 * simply did not happen — but they must leave a trace.
 */
export function fireAndLog(promise: Thenable<unknown>, what: string): void {
    void promise.then(undefined, (error) => {
        console.error(`[epytor] ${what} failed:`, error);
    });
}

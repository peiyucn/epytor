/**
 * Single-flight content pulls for pull-based saving (pure logic, no vscode dependency).
 * Concurrent pulls for one document must share one `send` and one reply, and every promise has
 * to settle — a promise that never settles means a save that silently never happens.
 *
 * Regression: one pending slot per document let a later pull overwrite the earlier resolver, and
 * the timeout path then deleted the later slot too.
 */

interface PendingRequest {
    resolvers: Array<(result: ContentReply) => void>;
    fallbackContent: string;
    timer: ReturnType<typeof setTimeout>;
}

/** Reply plus where it came from: the live webview, or the timeout/dispose fallback. */
export interface ContentReply {
    content: string;
    /**
     * True only when the webview actually answered. Fallback content can be up to the push
     * debounce older than what the user sees, so decisions about "are there unsaved edits"
     * must not trust it (regression: a revert then rolled the editor back to older text).
     */
    authoritative: boolean;
}

export class ContentRequestCoordinator {
    private readonly _pending = new Map<string, PendingRequest>();

    constructor(
        private readonly send: (uriKey: string) => void,
        private readonly timeoutMs: number,
        /** Fired after a timeout settles with fallback content, so the host can warn the user. */
        private readonly onTimeout?: (uriKey: string) => void,
    ) {}

    /** Cheap pre-check, so the caller can skip content preprocessing. */
    has(uriKey: string): boolean {
        return this._pending.has(uriKey);
    }

    /** Joins an in-flight request when there is one; the first requester's fallback wins. */
    request(uriKey: string, fallbackContent: string): Promise<string> {
        return this.requestDetailed(uriKey, fallbackContent).then((reply) => reply.content);
    }

    /** Same as `request`, but reports whether the content really came from the webview. */
    requestDetailed(uriKey: string, fallbackContent: string): Promise<ContentReply> {
        const pending = this._pending.get(uriKey);
        if (pending) {
            return new Promise((resolve) => pending.resolvers.push(resolve));
        }
        return new Promise((resolve) => {
            const entry: PendingRequest = {
                resolvers: [resolve],
                fallbackContent,
                timer: setTimeout(() => {
                    this._settle(uriKey, { content: entry.fallbackContent, authoritative: false });
                    this.onTimeout?.(uriKey);
                }, this.timeoutMs),
            };
            this._pending.set(uriKey, entry);
            this.send(uriKey);
        });
    }

    /** Reply from the webview: settles every waiter for this key. */
    resolve(uriKey: string, content: string): void {
        this._settle(uriKey, { content, authoritative: true });
    }

    /** Panel disposal: settle with fallback content so no save promise is left hanging. */
    settleAll(uriKey: string): void {
        const entry = this._pending.get(uriKey);
        if (!entry) return;
        this._settle(uriKey, { content: entry.fallbackContent, authoritative: false });
    }

    private _settle(uriKey: string, reply: ContentReply): void {
        const entry = this._pending.get(uriKey);
        if (!entry) return;
        this._pending.delete(uriKey);
        clearTimeout(entry.timer);
        for (const resolver of entry.resolvers) resolver(reply);
    }
}

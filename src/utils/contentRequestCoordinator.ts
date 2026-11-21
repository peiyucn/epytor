

interface PendingRequest {
    resolvers: Array<(result: ContentReply) => void>;
    fallbackContent: string;
    timer: ReturnType<typeof setTimeout>;
}


export interface ContentReply {
    content: string;

    authoritative: boolean;
}

export class ContentRequestCoordinator {
    private readonly _pending = new Map<string, PendingRequest>();

    constructor(
        private readonly send: (uriKey: string) => void,
        private readonly timeoutMs: number,

        private readonly onTimeout?: (uriKey: string) => void,
    ) {}


    has(uriKey: string): boolean {
        return this._pending.has(uriKey);
    }


    request(uriKey: string, fallbackContent: string): Promise<string> {
        return this.requestDetailed(uriKey, fallbackContent).then((reply) => reply.content);
    }


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


    resolve(uriKey: string, content: string): void {
        this._settle(uriKey, { content, authoritative: true });
    }


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

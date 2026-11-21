

export interface PendingCallbacks<T> {
    resolve: (value: T) => void;
    reject: (error: Error) => void;
}

export type PendingTimeout<T> =
    | { kind: "resolve"; value: T }
    | { kind: "reject"; error: string };

export interface PendingHandle<T> {
    id: string;
    promise: Promise<T>;

    cancel: (reason?: string) => void;
}

export class PendingRequestRegistry<T> {
    private readonly _pending = new Map<string, PendingCallbacks<T>>();

    constructor(private readonly idPrefix: string) {}

    begin(opts: { timeoutMs: number; timeout: PendingTimeout<T> }): PendingHandle<T> {
        const id = `${this.idPrefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        let settleReject: ((error: Error) => void) | null = null;

        const promise = new Promise<T>((resolve, reject) => {
            settleReject = reject;
            timeoutId = setTimeout(() => {
                if (settled) return;
                settled = true;
                this._pending.delete(id);
                if (opts.timeout.kind === "resolve") {
                    resolve(opts.timeout.value);
                } else {
                    reject(new Error(opts.timeout.error));
                }
            }, opts.timeoutMs);
            this._pending.set(id, {
                resolve: (value) => {
                    if (settled) return;
                    settled = true;
                    if (timeoutId !== null) clearTimeout(timeoutId);
                    resolve(value);
                },
                reject: (error) => {
                    if (settled) return;
                    settled = true;
                    if (timeoutId !== null) clearTimeout(timeoutId);
                    reject(error);
                },
            });
        });

        return {
            id,
            promise,
            cancel: (reason = "Cancelled") => {
                if (settled) return;
                settled = true;
                if (timeoutId !== null) clearTimeout(timeoutId);
                this._pending.delete(id);
                settleReject?.(new Error(reason));
            },
        };
    }

    resolve(id: string, value: T): void {
        const cb = this._pending.get(id);
        if (cb) {
            this._pending.delete(id);
            cb.resolve(value);
        }
    }

    reject(id: string, error: string): void {
        const cb = this._pending.get(id);
        if (cb) {
            this._pending.delete(id);
            cb.reject(new Error(error));
        }
    }
}

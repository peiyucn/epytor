
export function fireAndLog(promise: Thenable<unknown>, what: string): void {
    void promise.then(undefined, (error) => {
        console.error(`[epytor] ${what} failed:`, error);
    });
}

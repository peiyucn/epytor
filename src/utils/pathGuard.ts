/**
 * Path containment for opening local files from document links: a malicious markdown link
 * (absolute path or `../`) must not reach outside the workspace.
 */
import * as path from "path";

/**
 * Injectable path primitives so tests can pin Windows/POSIX semantics on Linux CI, where
 * `resolve` treats a `C:\...` path as relative.
 */
type PathPrimitives = Pick<typeof path, "resolve" | "relative" | "isAbsolute" | "sep">;

export function isPathWithinBase(
    candidate: string,
    base: string,
    pathImpl: PathPrimitives = path,
): boolean {
    const rel = pathImpl.relative(pathImpl.resolve(base), pathImpl.resolve(candidate));
    if (rel === "") return true;
    if (pathImpl.isAbsolute(rel)) return false;
    return rel !== ".." && !rel.startsWith(".." + pathImpl.sep);
}

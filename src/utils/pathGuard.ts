
import * as path from "path";


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


import * as path from "path";
import { isPathWithinBase } from "./pathGuard";


export const CANDIDATE_IMAGE_DIRS = ["images", "imgs", "assets/images", "assets"];

interface ImageLocalDirInput {

    customPath: string;

    docDir: string | null;
    workspaceRoot: string | null;

    workspaceLevel: boolean;
}

type ImageLocalDirPlan =

    | { kind: "fixed"; dir: string; downgraded: boolean }

    | { kind: "probe"; candidates: string[]; fallbackDir: string | null };


export function expandCandidateDirs(roots: Array<string | null>): string[] {
    const result: string[] = [];
    for (const root of roots) {
        if (!root) { continue; }
        for (const candidate of CANDIDATE_IMAGE_DIRS) {
            const dir = path.join(root, candidate);
            if (!result.includes(dir)) { result.push(dir); }
        }
    }
    return result;
}


export function planImageLocalDir(input: ImageLocalDirInput): ImageLocalDirPlan {
    const { customPath, docDir, workspaceRoot, workspaceLevel } = input;

    if (customPath) {
        const base = workspaceRoot ?? docDir;
        const resolved = path.isAbsolute(customPath)
            ? customPath
            : base ? path.resolve(base, customPath) : null;
        const allowedBase = workspaceRoot ?? docDir;
        if (resolved && (!workspaceLevel || (allowedBase !== null && isPathWithinBase(resolved, allowedBase)))) {
            return { kind: "fixed", dir: resolved, downgraded: false };
        }
        return docDir
            ? { kind: "fixed", dir: path.join(docDir, "images"), downgraded: true }
            : { kind: "probe", candidates: [], fallbackDir: null };
    }

    return {
        kind: "probe",
        candidates: expandCandidateDirs([workspaceRoot, docDir]),
        fallbackDir: docDir ? path.join(docDir, "images") : null,
    };
}

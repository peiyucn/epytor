/**
 * Where local images live, shared by the write path (imageService.saveImageLocally) and the
 * gallery listing path so the two cannot drift.
 *
 * Regression: the listing path lacked the containment check, so a workspace-level
 * `imageLocalPath` injected by a cloned repo could list e.g. `~/.ssh`. Workspace-level config is
 * untrusted (out of bounds → `<doc dir>/images`); user-level config is the user's own choice.
 */
import * as path from "path";
import { isPathWithinBase } from "./pathGuard";

/** Auto-detection candidates, in priority order. */
export const CANDIDATE_IMAGE_DIRS = ["images", "imgs", "assets/images", "assets"];

interface ImageLocalDirInput {
    /** imageLocalPath, already trimmed by the caller. */
    customPath: string;
    /** null when the document is not on disk (untitled). */
    docDir: string | null;
    workspaceRoot: string | null;
    /** Whether imageLocalPath comes from workspace-level config. */
    workspaceLevel: boolean;
}

type ImageLocalDirPlan =
    /** `downgraded` = workspace-level value was out of bounds, so `dir` is the doc's images dir. */
    | { kind: "fixed"; dir: string; downgraded: boolean }
    /** Probe `candidates` in order; use `fallbackDir` when none exists (null = no fallback). */
    | { kind: "probe"; candidates: string[]; fallbackDir: string | null };

/** Workspace root first, then the document dir, each in CANDIDATE_IMAGE_DIRS order. */
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

/** Absolute custom paths win; relative ones resolve against the workspace root, then the doc dir. */
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

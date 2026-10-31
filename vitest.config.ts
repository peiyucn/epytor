import { defineConfig } from "vitest/config";
import path from "path";

const alias = {
    // 将 vscode 模块重定向到 mock 实现，Extension 侧单元测试所需
    vscode: path.resolve(__dirname, "__mocks__/vscode.ts"),
    "@": path.resolve(__dirname, "webview"),
};

export default defineConfig({
    resolve: { alias },
    test: {
        // Heavy real-editor tests + high-core dev machines: the default (cores-1) spawns so
        // many forks that worker startup can time out under load ("Timeout waiting for worker
        // to respond"). Cap it; CI runners have <=4 cores so their effective concurrency is
        // unchanged.
        maxWorkers: 2,
        projects: [
            {
                extends: true,
                test: {
                    name: "extension",
                    environment: "node",
                    include: ["src/__tests__/**/*.test.ts", "shared/__tests__/**/*.test.ts"],
                },
            },
            {
                extends: true,
                test: {
                    name: "webview",
                    environment: "jsdom",
                    include: ["webview/__tests__/**/*.test.ts"],
                    setupFiles: ["./webview/__tests__/setup.ts"],
                },
            },
        ],
        coverage: {
            provider: "v8",
            reporter: ["text", "lcov", "html"],
            // Measure every production file, not a hand-picked allow-list: the previous list
            // covered 46 of 83 files (28.2% of production lines), leaving the three largest
            // units (MarkdownEditorProvider, webview/index, webview/editor) out of the gate.
            include: [
                "src/**/*.ts",
                "webview/**/*.ts",
                "shared/**/*.ts",
            ],
            exclude: [
                "**/*.test.ts",
                "**/*.bench.ts",
                "**/__tests__/**",
                "webview/vendor/**",
                "webview/global.d.ts",
            ],
            thresholds: {
                // Measured baseline over *all* production files (2026-10-31): 73.75% lines /
                // 73.90% functions after the entry/provider split made the extracted modules
                // unit-testable (2026-10-27 was 55.1% / 57.3%; the original 98.9% covered only
                // a hand-picked allow-list that skipped the three largest units). The floor is
                // deliberately ~3-4 points below the measurement: it guards against regression,
                // it is not a target. Uplift history lives in docs/tech-debt.md.
                lines: 70,
                functions: 70,
                // AGENTS 分模块覆盖率底线（CI test:coverage 强制；实测各模块线覆盖远超底线）
                "src/utils/imageService.ts": { lines: 85 },
                "src/utils/getNonce.ts": { lines: 100 },
                "src/MarkdownDocument.ts": { lines: 80 },
                "src/utils/contentTransform.ts": { lines: 90 },
                "src/utils/lineMap.ts": { lines: 90 },
            },
        },
    },
});

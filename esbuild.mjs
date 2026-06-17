import * as esbuild from 'esbuild';
import path from 'path';

const isProduction = process.argv.includes('--production');
const isWatch = process.argv.includes('--watch');

const commonOptions = {
    bundle: true,
    minify: isProduction,
    sourcemap: !isProduction,
    logLevel: 'info',
};

// Extension 主进程（Node.js）
const extensionBuild = {
    ...commonOptions,
    entryPoints: ['src/extension.ts'],
    outfile: 'dist/extension.js',
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    external: ['vscode'],
};

// WebView 前端（Browser）
const webviewBuild = {
    ...commonOptions,
    entryPoints: { webview: 'webview/index.ts' },
    outdir: 'dist',
    platform: 'browser',
    target: 'es2020',
    format: 'esm',
    loader: {
        '.ttf': 'dataurl',
        '.woff': 'dataurl',
        '.woff2': 'dataurl',
    },
    alias: {
        '@': path.resolve('./webview'),
    },
    define: {
        __VUE_OPTIONS_API__: 'true',
        __VUE_PROD_DEVTOOLS__: 'false',
        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false',
    },
};

if (isWatch) {
    const [ctx1, ctx2] = await Promise.all([
        esbuild.context(extensionBuild),
        esbuild.context(webviewBuild),
    ]);
    await Promise.all([ctx1.watch(), ctx2.watch()]);
    console.log('Watching for changes...');
} else {
    await Promise.all([
        esbuild.build(extensionBuild),
        esbuild.build(webviewBuild),
    ]);
}

// End-to-end smoke test for the built webview bundle, using the local Edge (no downloads).
//
// It serves `dist/` over a tiny HTTP server, loads the real production `webview.js` in headless
// Edge with a mocked `acquireVsCodeApi`, then drives it through the real VS Code message
// protocol and asserts user-visible state (render, save round-trip, typing, config, scroll,
// revert, lazy code-block chunk). This covers the wiring that jsdom cannot: real layout,
// real module loading and real input events.
//
// Usage: pnpm run smoke            (requires `pnpm run vscode:prepublish` first)
// Env:   EPYTOR_EDGE=<path to msedge.exe>, SMOKE_PORT, SMOKE_CDP_PORT
//
// Exit code 0 = all checks passed, 1 = a check failed, 2 = environment/harness failure.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const SMOKE_DIR = path.join(REPO_ROOT, "releases", "smoke");
const PORT = Number(process.env.SMOKE_PORT ?? 0);
const CDP_PORT = Number(process.env.SMOKE_CDP_PORT ?? 0);
const PROFILE = path.join(os.tmpdir(), `epytor-smoke-edge-${process.pid}`);

const EDGE_CANDIDATES = [
    process.env.EPYTOR_EDGE,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/microsoft-edge",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);
const EDGE = EDGE_CANDIDATES.find((candidate) => fs.existsSync(candidate));

const results = [];
const pageErrors = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function check(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}
function note(message) { console.log(`[smoke] ${message}`); }

async function waitForResponse(url, timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const res = await fetch(url);
            if (res.ok) return res;
        } catch { /* not up yet */ }
        await sleep(200);
    }
    throw new Error(`timeout waiting for ${url}`);
}

class Cdp {
    constructor(wsUrl) {
        this.wsUrl = wsUrl;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = new Map();
    }
    async connect() {
        this.ws = new WebSocket(this.wsUrl);
        await new Promise((resolve, reject) => {
            this.ws.addEventListener("open", resolve, { once: true });
            this.ws.addEventListener("error", reject, { once: true });
        });
        this.ws.addEventListener("message", (event) => {
            const message = JSON.parse(typeof event.data === "string" ? event.data : event.data.toString());
            if (message.id !== undefined) {
                const entry = this.pending.get(message.id);
                if (!entry) return;
                this.pending.delete(message.id);
                if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
                else entry.resolve(message.result);
                return;
            }
            for (const handler of this.listeners.get(message.method) ?? []) handler(message.params);
        });
    }
    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, { resolve, reject, method });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    on(method, handler) {
        if (!this.listeners.has(method)) this.listeners.set(method, []);
        this.listeners.get(method).push(handler);
    }
    close() { try { this.ws.close(); } catch { /* already closed */ } }
}

function killTree(child) {
    if (!child || child.killed) return;
    try {
        if (process.platform === "win32" && child.pid) {
            spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } else {
            child.kill();
        }
    } catch { /* already gone */ }
}

function removeProfile() {
    // Edge may still hold files right after kill (Windows); a leftover profile is harmless.
    try {
        fs.rmSync(PROFILE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
        if (process.env.SMOKE_VERBOSE) console.warn("[smoke] profile cleanup skipped:", error.message);
    }
}

async function main() {
    if (!EDGE) {
        console.error("[smoke] Edge not found. Set EPYTOR_EDGE to msedge.exe.");
        process.exit(2);
    }
    if (!fs.existsSync(path.join(REPO_ROOT, "dist", "webview.js"))) {
        console.error("[smoke] dist/webview.js missing. Run `pnpm run vscode:prepublish` first.");
        process.exit(2);
    }
    fs.mkdirSync(SMOKE_DIR, { recursive: true });
    removeProfile();
    fs.mkdirSync(PROFILE, { recursive: true });

    const server = spawn(process.execPath, [path.join(import.meta.dirname, "server.mjs")], {
        cwd: import.meta.dirname,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, SMOKE_PORT: String(PORT) },
    });
    server.stderr.on("data", (data) => process.stderr.write(`[server-err] ${data}`));
    const portLine = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("smoke server did not report a port")), 20000);
        server.stdout.on("data", (data) => {
            const match = /PORT=(\d+)/.exec(data.toString());
            if (!match) return;
            clearTimeout(timer);
            resolve(match[1]);
        });
        server.on("error", reject);
        server.on("exit", (code) => reject(new Error(`smoke server exited (${code})`)));
    });
    const URL = `http://127.0.0.1:${portLine}/harness.html`;
    note(`server on port ${portLine}`);

    let edge;
    let cdp;
    try {
        await waitForResponse(URL);
        edge = spawn(EDGE, [
            "--headless=new",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-background-networking",
            "--no-first-run",
            "--no-default-browser-check",
            "--window-size=1280,900",
            `--user-data-dir=${PROFILE}`,
            `--remote-debugging-port=${CDP_PORT}`,
            URL,
        ], { stdio: ["ignore", "pipe", "pipe"] });
        edge.stderr.on("data", (data) => {
            if (process.env.SMOKE_VERBOSE) process.stderr.write(`[edge] ${data}`);
        });

        let cdpPort = CDP_PORT;
        if (cdpPort === 0) {
            const portFile = path.join(PROFILE, "DevToolsActivePort");
            const start = Date.now();
            while (!fs.existsSync(portFile)) {
                if (Date.now() - start > 20000) throw new Error("Edge did not write DevToolsActivePort");
                await sleep(100);
            }
            cdpPort = Number(fs.readFileSync(portFile, "utf8").split("\n")[0]);
        }
        const targets = await (await waitForResponse(`http://127.0.0.1:${cdpPort}/json/list`)).json();
        const page = targets.find((target) => target.type === "page" && target.url.includes("harness.html"))
            ?? targets.find((target) => target.type === "page");
        if (!page) throw new Error("no page target");

        cdp = new Cdp(page.webSocketDebuggerUrl);
        await cdp.connect();
        await cdp.send("Runtime.enable");
        await cdp.send("Log.enable");
        await cdp.send("Page.enable");

        cdp.on("Runtime.exceptionThrown", (params) => {
            pageErrors.push(`exception: ${params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text}`);
        });
        cdp.on("Runtime.consoleAPICalled", (params) => {
            if (params.type !== "error") return;
            pageErrors.push(`console.error: ${(params.args ?? []).map((a) => a.value ?? a.description ?? "").join(" ")}`);
        });
        cdp.on("Log.entryAdded", (params) => {
            const entry = params.entry;
            if (entry.level !== "error") return;
            if (/favicon\.ico/.test(entry.url ?? "")) return;
            pageErrors.push(`log: ${entry.text} ${entry.url ?? ""}`);
        });

        const evaluate = async (expression) => {
            const result = await cdp.send("Runtime.evaluate", {
                expression,
                awaitPromise: true,
                returnByValue: true,
                userGesture: true,
            });
            if (result.exceptionDetails) {
                throw new Error(`evaluate failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
            }
            return result.result.value;
        };
        const waitForExpr = async (expression, timeoutMs = 30000, label = expression) => {
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                try {
                    if (await evaluate(expression)) return true;
                } catch { /* page still loading */ }
                await sleep(100);
            }
            throw new Error(`timeout waiting for ${label}`);
        };

        // 1) Bundle boots and announces itself.
        await waitForExpr("document.readyState === 'complete'", 30000, "page load");
        await waitForExpr("Array.isArray(window.__posted) && window.__posted.some(m => m.type === 'ready')", 30000, "ready message");
        check("webview bundle boots and posts ready", true);

        // 2) init message renders the document.
        const blocks = 28;
        const lines = ["# Smoke heading", ""];
        for (let i = 1; i <= blocks; i += 1) {
            lines.push(`Paragraph ${i} with **bold** text.`, "");
        }
        const markdown = `${lines.join("\n").trimEnd()}\n`;
        const lineMap = [];
        const lineEndMap = [];
        let sourceLine = 1;
        for (let i = 0; i < blocks + 1; i += 1) {
            lineMap.push(sourceLine);
            lineEndMap.push(sourceLine);
            sourceLine += 2;
        }
        await evaluate(`window.postMessage(${JSON.stringify({
            type: "init",
            content: markdown,
            lineMap,
            lineEndMap,
            frontmatter: "",
            imageUriMap: {},
            active: true,
            serializationMode: "clean",
        })}, "*"); true`);
        await waitForExpr("document.querySelector('#editor .milkdown .ProseMirror') !== null", 45000, "editor mount");
        await waitForExpr("document.querySelector('#editor .ProseMirror').textContent.includes('Smoke heading')", 15000, "heading rendered");
        await waitForExpr("document.querySelector('#editor .ProseMirror').textContent.includes('Paragraph 28')", 15000, "last paragraph rendered");
        check("init renders heading + all paragraphs", true);

        const tocItems = await evaluate("document.querySelectorAll('.toc-panel .toc-item').length");
        check("outline panel lists the heading", tocItems >= 1, `items=${tocItems}`);

        await waitForExpr("window.__posted.some(m => m.type === 'wordCount')", 10000, "wordCount");
        const wordCount = await evaluate("window.__posted.filter(m => m.type === 'wordCount').pop()");
        check("word count posted", wordCount.lines >= blocks, JSON.stringify({ lines: wordCount.lines, words: wordCount.words }));

        // 3) Unedited save round-trips byte-for-byte.
        await evaluate("window.postMessage({type:'requestContent'}, '*'); true");
        await waitForExpr("window.__posted.some(m => m.type === 'contentResponse')", 10000, "contentResponse");
        const unedited = await evaluate("window.__posted.filter(m => m.type === 'contentResponse').pop().content");
        check("unedited save is byte-identical", unedited === markdown, `${unedited.length} vs ${markdown.length} chars`);

        // 4) Real keyboard input reaches the ProseMirror doc and the serializer.
        await evaluate("document.querySelector('#editor .ProseMirror').focus(); true");
        await cdp.send("Input.insertText", { text: " SMOKE-TYPED" });
        await sleep(500);
        await evaluate("window.postMessage({type:'requestContent'}, '*'); true");
        await waitForExpr("window.__posted.filter(m => m.type === 'contentResponse').length >= 2", 10000, "second contentResponse");
        const typed = await evaluate("window.__posted.filter(m => m.type === 'contentResponse').pop().content");
        check("typed text is serialized", typed.includes("SMOKE-TYPED"), typed.slice(0, 80));

        // 5) Runtime config messages apply CSS variables immediately.
        await evaluate("window.postMessage({type:'tableWrapModeChanged', mode:'nowrap'}, '*'); true");
        await evaluate("window.postMessage({type:'editorMaxWidthChanged', value:1234}, '*'); true");
        await evaluate("window.postMessage({type:'codeBlockMaxHeightChanged', value:777}, '*'); true");
        await sleep(200);
        const vars = await evaluate(`(() => {
            const style = document.documentElement.style;
            return {
                tableWrap: style.getPropertyValue('--epytor-table-white-space'),
                maxWidth: style.getPropertyValue('--editor-max-width'),
                codeHeight: style.getPropertyValue('--code-block-max-height'),
            };
        })()`);
        check("table wrap mode applied", vars.tableWrap === "nowrap", JSON.stringify(vars));
        check("editor max width applied", vars.maxWidth === "1234px", vars.maxWidth);
        check("code block max height applied", vars.codeHeight === "777px", vars.codeHeight);

        // 6) scrollToLine navigates in the real layout engine and persists the offset.
        await evaluate(`window.postMessage(${JSON.stringify({ type: "scrollToLine", line: 41 })}, "*"); true`);
        await sleep(3000);
        const scrollY = await evaluate("window.scrollY");
        check("scrollToLine scrolls the viewport", scrollY > 0, `scrollY=${scrollY}`);
        const persisted = await evaluate("window.__webviewState");
        check("scroll position persisted to webview state", persisted !== null && Number(persisted.scrollY) > 0, JSON.stringify(persisted));

        // 7) revert rebuilds the editor with disk content, then a fenced block mounts CodeMirror
        //    (the language/CM chunks are loaded on demand, so this tests the real splitting).
        await evaluate(`window.postMessage(${JSON.stringify({
            type: "revert",
            content: "# Reverted heading\n\n```js\nconst x = 1;\n```\n\nfresh content\n",
            lineMap: [1, 3, 6],
            lineEndMap: [1, 5, 7],
            frontmatter: "",
        })}, "*"); true`);
        await waitForExpr("document.querySelector('#editor .ProseMirror').textContent.includes('Reverted heading')", 45000, "revert content");
        const oldGone = await evaluate("!document.querySelector('#editor .ProseMirror').textContent.includes('Paragraph 28')");
        check("revert rebuilds editor with disk content", oldGone);
        await waitForExpr("document.querySelector('.milkdown-code-block') !== null", 30000, "code block mounted");
        check("fenced code block mounts in the real bundle", true);

        // 8) A plain-language block has no preview: Crepe treats `undefined` as "async preview
        //    pending" and `null` as "no preview", so unhandled languages must answer `null` —
        //    otherwise every plain code block keeps a stuck "Loading..." preview panel.
        const plainBlockState = await evaluate(`(() => {
            const block = document.querySelector('.milkdown-code-block');
            return {
                toggle: block !== null && block.querySelector('.preview-toggle-button') !== null,
                preview: block === null ? null : (block.querySelector('.preview-panel .preview')?.textContent ?? null),
            };
        })()`);
        check(
            "plain code block offers no preview",
            plainBlockState !== null && plainBlockState.toggle === false && plainBlockState.preview === null,
            JSON.stringify(plainBlockState),
        );

        // 9) No uncaught page errors (network favicon noise filtered above).
        check("no page errors", pageErrors.length === 0, pageErrors.slice(0, 3).join(" | "));

        const screenshot = await cdp.send("Page.captureScreenshot", { format: "png" });
        fs.writeFileSync(path.join(SMOKE_DIR, "smoke-final.png"), Buffer.from(screenshot.data, "base64"));
        note(`screenshot: ${path.join(SMOKE_DIR, "smoke-final.png")}`);
    } finally {
        cdp?.close();
        killTree(edge);
        killTree(server);
        await sleep(500);
        removeProfile();
        await sleep(100);
    }

    const failed = results.filter((result) => !result.ok);
    console.log(`\n[smoke] ${results.length - failed.length}/${results.length} checks passed, ${pageErrors.length} page errors`);
    fs.writeFileSync(path.join(SMOKE_DIR, "smoke-result.json"), JSON.stringify({ results, pageErrors }, null, 2));
    process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
    console.error("[smoke] fatal:", error);
    process.exit(2);
});

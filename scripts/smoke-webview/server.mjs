// Tiny static server for the webview smoke harness (no dependencies).
// Serves harness.html and the built `dist/` bundle from the repo root.
// Binds an ephemeral port by default and prints `PORT=<n>` so the driver can find it.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.SMOKE_PORT ?? 0);
const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const DIST_ROOT = path.resolve(REPO_ROOT, "dist");
const HARNESS = path.join(import.meta.dirname, "harness.html");

/** Resolve a /dist/ URL below DIST_ROOT, or null when it would escape the folder. */
function resolveDistPath(urlPath) {
    const resolved = path.resolve(DIST_ROOT, urlPath.slice("/dist/".length));
    if (resolved !== DIST_ROOT && !resolved.startsWith(DIST_ROOT + path.sep)) { return null; }
    return resolved;
}

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".png": "image/png",
};

const server = http.createServer((req, res) => {
    let urlPath;
    try {
        urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
    } catch {
        res.writeHead(400); res.end("bad request"); return;
    }
    if (urlPath.includes("\0")) {
        res.writeHead(400); res.end("bad request"); return;
    }
    let filePath;
    if (urlPath === "/" || urlPath === "/harness.html") {
        filePath = HARNESS;
    } else if (urlPath.startsWith("/dist/")) {
        filePath = resolveDistPath(urlPath);
        if (filePath === null) { res.writeHead(403); res.end("forbidden"); return; }
    } else {
        res.writeHead(404); res.end("not found"); return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream" });
        res.end(data);
    });
});

server.listen(PORT, "127.0.0.1", () => {
    const actual = server.address().port;
    console.log(`PORT=${actual}`);
    console.log(`[smoke-server] http://127.0.0.1:${actual}/harness.html  dist=${REPO_ROOT}/dist`);
});

const stop = () => server.close(() => process.exit(0));
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

/**
 * Fail-closed security alert gate for releases (AGENTS E18).
 *
 * Checks the three alert families the release rules require (Dependabot, code scanning, secret
 * scanning) and fails the publish job when any is open — or when the check itself cannot be
 * completed. A broken query must never read as "clean": non-200, timeout, malformed body and
 * missing credentials all block the release.
 *
 * Credentials follow the dsh-launcher-panel split:
 * - GITHUB_TOKEN_ALERTS: `${{ github.token }}`; reads Dependabot (`vulnerability-alerts: read`)
 *   and code scanning (`security-events: read`).
 * - SECRET_SCAN_TOKEN: environment secret `SECURITY_ALERTS_TOKEN`, a read-only fine-grained PAT.
 *   GITHUB_TOKEN cannot read secret scanning alerts ("Resource not accessible by integration").
 *
 * Usage: GITHUB_REPOSITORY=owner/repo GITHUB_TOKEN_ALERTS=... SECRET_SCAN_TOKEN=... \
 *          node scripts/security-gate.mjs
 * Self-test (no network): node scripts/security-gate.mjs --self-test
 */
import process from "node:process";
import { pathToFileURL } from "node:url";

const API_BASE = "https://api.github.com";
const PAGE_SIZE = 100;
const REQUEST_TIMEOUT_MS = 30_000;

/** Alert families E18 requires to be zero before a release. */
const ALERT_TYPES = [
    { name: "Dependabot", path: "dependabot/alerts", tokenKey: "alerts" },
    { name: "Code scanning", path: "code-scanning/alerts", tokenKey: "alerts" },
    { name: "Secret scanning", path: "secret-scanning/alerts", tokenKey: "secretScan" },
];

/** Classify one alerts response; only an empty list on HTTP 200 counts as clean. */
function evaluateAlertsResponse(status, body) {
    if (status !== 200) {
        return { ok: false, count: null, reason: `HTTP ${status}` };
    }
    if (!Array.isArray(body)) {
        return { ok: false, count: null, reason: "response is not an alert list" };
    }
    if (body.length === 0) {
        return { ok: true, count: 0, reason: "" };
    }
    // Any alert blocks; a full page only proves "at least" this many.
    return { ok: false, count: body.length, reason: body.length >= PAGE_SIZE ? ">=100 open" : "open" };
}

async function fetchOpenAlerts(fetchImpl, repository, type, token) {
    const url = `${API_BASE}/repos/${repository}/${type.path}?state=open&per_page=${PAGE_SIZE}`;
    const response = await fetchImpl(url, {
        method: "GET",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    let body = null;
    try {
        body = await response.json();
    } catch {
        body = null;
    }
    return evaluateAlertsResponse(response.status, body);
}

/** Run the gate; expected failures are returned, not thrown, so the CLI can report them. */
async function runGate({ fetchImpl = fetch, repository, alertsToken, secretScanToken }) {
    if (!repository) {
        return { pass: false, reason: "GITHUB_REPOSITORY is not set", results: [] };
    }
    if (!alertsToken) {
        return { pass: false, reason: "GITHUB_TOKEN_ALERTS is not set (publish workflow wiring missing)", results: [] };
    }
    if (!secretScanToken) {
        return {
            pass: false,
            reason: "SECRET_SCAN_TOKEN is not set (environment secret SECURITY_ALERTS_TOKEN is missing)",
            results: [],
        };
    }
    const tokens = { alerts: alertsToken, secretScan: secretScanToken };
    const results = [];
    for (const type of ALERT_TYPES) {
        let result;
        try {
            result = await fetchOpenAlerts(fetchImpl, repository, type, tokens[type.tokenKey]);
        } catch (error) {
            result = { ok: false, count: null, reason: `request failed: ${error instanceof Error ? error.message : String(error)}` };
        }
        results.push({ name: type.name, ...result });
    }
    const blocked = results.filter((result) => !result.ok);
    return {
        pass: blocked.length === 0,
        reason: blocked.length === 0 ? "" : blocked.map((result) => `${result.name}: ${result.reason}`).join("; "),
        results,
    };
}

/** No-network checks; `pnpm run verify` runs this so the gate logic stays covered. */
async function runSelfTest() {
    const cases = [];
    const expect = (label, actual, wanted) => {
        const ok = actual === wanted;
        cases.push({ label, ok, detail: `expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}` });
    };
    expect("empty list passes", evaluateAlertsResponse(200, []).ok, true);
    expect("one alert blocks", evaluateAlertsResponse(200, [{}, {}]).ok, false);
    expect("one alert count", evaluateAlertsResponse(200, [{}, {}]).count, 2);
    expect("403 blocks", evaluateAlertsResponse(403, { message: "nope" }).ok, false);
    expect("non-array blocks", evaluateAlertsResponse(200, {}).ok, false);

    const zeroFetch = async () => ({ status: 200, json: async () => [] });
    const alertFetch = async (url) => ({
        status: 200,
        json: async () => (url.includes("code-scanning") ? [{}] : []),
    });
    const forbiddenFetch = async () => ({ status: 403, json: async () => ({ message: "Resource not accessible by integration" }) });
    const gate = (fetchImpl, alertsToken = "t", secretScanToken = "t") => ({ fetchImpl, repository: "o/r", alertsToken, secretScanToken });

    expect("all zero passes", (await runGate(gate(zeroFetch))).pass, true);
    expect("any open alert blocks", (await runGate(gate(alertFetch))).pass, false);
    expect("forbidden blocks", (await runGate(gate(forbiddenFetch))).pass, false);
    expect("missing secret scan token blocks", (await runGate(gate(zeroFetch, "t", ""))).pass, false);
    expect("missing alerts token blocks", (await runGate(gate(zeroFetch, "", "t"))).pass, false);
    expect("missing repo blocks", (await runGate({ fetchImpl: zeroFetch, repository: "", alertsToken: "t", secretScanToken: "t" })).pass, false);

    for (const testCase of cases) {
        console.log(`${testCase.ok ? "PASS" : "FAIL"}  ${testCase.label}${testCase.ok ? "" : `  (${testCase.detail})`}`);
    }
    const failed = cases.filter((testCase) => !testCase.ok).length;
    console.log(`\n[gate] self-test: ${cases.length - failed}/${cases.length} passed`);
    return failed === 0;
}

async function main() {
    if (process.argv.includes("--self-test")) {
        const ok = await runSelfTest();
        process.exit(ok ? 0 : 1);
    }
    const result = await runGate({
        repository: process.env.GITHUB_REPOSITORY ?? process.env.REPO ?? "",
        alertsToken: process.env.GITHUB_TOKEN_ALERTS ?? "",
        secretScanToken: process.env.SECRET_SCAN_TOKEN ?? "",
    });
    for (const entry of result.results) {
        const status = entry.ok ? "PASS" : "BLOCK";
        const count = entry.count === null ? "?" : String(entry.count);
        console.log(`${status}  ${entry.name}: ${count} open${entry.ok ? "" : `  (${entry.reason})`}`);
    }
    if (!result.pass) {
        console.error(`[gate] RELEASE BLOCKED — ${result.reason}`);
        if (!process.env.SECRET_SCAN_TOKEN) {
            console.error("[gate] configure the environment secret SECURITY_ALERTS_TOKEN with a read-only fine-grained token (Secret scanning alerts: read) — see AGENTS E20.");
        }
        process.exit(1);
    }
    console.log("\n[gate] all alert families are clear — release may proceed");
}

const isEntryPoint = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntryPoint) {
    main().catch((error) => {
        console.error(`[gate] unexpected failure — release blocked: ${error instanceof Error ? error.stack : String(error)}`);
        process.exit(1);
    });
}

/* global AbortController, clearTimeout, console, fetch, performance, process, setTimeout */

const readArg = (name, fallback) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.split("=").slice(1).join("=") ?? fallback;
const count = Math.max(1, Number(readArg("count", "20")) || 20);
const concurrency = Math.max(1, Number(readArg("concurrency", "3")) || 3);
const base = readArg("base", "http://localhost:3000").replace(/\/$/, "");

const directoryResponse = await fetch(`${base}/api/availability`);
if (!directoryResponse.ok) throw new Error(`Tutor directory returned HTTP ${directoryResponse.status}.`);
const directory = await directoryResponse.json();
const tutors = directory.bookingPages.slice(0, count);
if (!tutors.length) throw new Error("The tutor directory returned no booking pages.");

let next = 0;
let active = 0;
let maxActive = 0;
const rows = [];
const started = performance.now();

async function worker() {
  while (next < tutors.length) {
    const tutor = tutors[next++];
    active += 1;
    maxActive = Math.max(maxActive, active);
    const requestStarted = performance.now();
    try {
      const response = await fetch(`${base}/api/slots`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingUrl: tutor.bookingUrl }) });
      const result = await response.json().catch(() => ({}));
      rows.push({ status: result.status ?? "failed", reasonCode: result.reasonCode, http: response.status, ms: performance.now() - requestStarted });
    } catch {
      rows.push({ status: "failed", http: 0, ms: performance.now() - requestStarted });
    } finally {
      active -= 1;
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, tutors.length) }, worker));
const elapsed = performance.now() - started;
const durations = rows.map((row) => row.ms);
const statusCount = (status) => rows.filter((row) => row.status === status).length;
const cancellationStarted = performance.now();
const cancellationController = new AbortController();
const cancellationTimer = setTimeout(() => cancellationController.abort(), 500);
await fetch(`${base}/api/slots`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ bookingUrl: tutors[0].bookingUrl }), signal: cancellationController.signal }).catch(() => undefined);
clearTimeout(cancellationTimer);
const cancellationMs = performance.now() - cancellationStarted;
console.table([{
  concurrency,
  tutors: rows.length,
  "total s": (elapsed / 1000).toFixed(1),
  successful: rows.filter((row) => row.http >= 200 && row.http < 300).length,
  available: statusCount("available"),
  none_in_view: statusCount("none_in_view"),
  unknown: statusCount("unknown"),
  failed: statusCount("failed"),
  "HTTP 429": rows.filter((row) => row.http === 429).length,
  "HTTP 5xx": rows.filter((row) => row.http >= 500).length,
  "launch failures": rows.filter((row) => row.reasonCode === "browser_launch_failed").length,
  "nav timeouts": rows.filter((row) => row.reasonCode === "navigation_timeout").length,
  "avg ms": Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length),
  "slowest ms": Math.round(Math.max(...durations)),
  "max active": maxActive,
  "cancel ms": Math.round(cancellationMs),
}]);
console.log("The production adapter uses direct Google Calendar requests, so no Chromium process is launched. No page HTML, URLs, or secrets are saved.");

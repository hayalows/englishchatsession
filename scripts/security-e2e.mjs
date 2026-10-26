// E2E HTTP checks against a real local production Next.js server.
// Run: npm ci && npm run build && node scripts/security-e2e.mjs
// No live credentials, student records, or external calendar fetches are used.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const port = 31871;
const base = `http://127.0.0.1:${port}`;
const report = {
  revision: process.env.GITHUB_SHA ?? "local",
  environment: { node: process.version, productionServer: "next start" },
  startedAt: new Date().toISOString(),
  scenarios: [],
};
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  env: { ...process.env, ADMIN_PASSWORD: "", DATABASE_URL: "", NODE_ENV: "production" },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", chunk => {
    log = (log + chunk.toString()).slice(-4_000);
  });
}

async function get(path, options = {}) {
  return fetch(base + path, { redirect: "manual", signal: AbortSignal.timeout(8_000), ...options });
}

async function ready() {
  const expires = Date.now() + 30_000;
  while (Date.now() < expires) {
    if (server.exitCode !== null) throw new Error("Server exited before it became ready.");
    try {
      const response = await get("/");
      if (response.status === 200) return;
    } catch {
      // The application may still be starting; retry until the bounded deadline.
    }
    await sleep(250);
  }
  throw new Error("Production server did not return HTTP 200 within 30 seconds.");
}

async function scenario(name, action) {
  try {
    const actual = await action();
    report.scenarios.push({ name, status: "pass", actual });
  } catch (error) {
    report.scenarios.push({ name, status: "fail", error: String(error) });
    throw error;
  }
}

const jsonPost = (path, data) => get(path, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
});

try {
  await ready();
  await scenario("Student finder responds", async () => {
    const response = await get("/");
    assert.equal(response.status, 200);
    return response.status;
  });
  await scenario("Admin page requires authentication", async () => {
    const response = await get("/admin");
    assert.ok([302, 303, 307, 308].includes(response.status), `Status ${response.status}`);
    assert.match(response.headers.get("location") ?? "", /\/admin\/login/);
    return response.status;
  });
  await scenario("External booking host is rejected", async () => {
    const response = await jsonPost("/api/slots", { bookingUrl: "https://example.com/private" });
    assert.equal(response.status, 400);
    return response.status;
  });
  await scenario("Nonstandard Google Calendar port is rejected", async () => {
    const response = await jsonPost("/api/slots", {
      bookingUrl: "https://calendar.google.com:444/calendar/appointments/schedules/test",
    });
    assert.equal(response.status, 400);
    return response.status;
  });
  await scenario("Credential-bearing Calendar URL is rejected", async () => {
    const response = await jsonPost("/api/slots", {
      bookingUrl: "https://user:pass@calendar.google.com/calendar/appointments/schedules/test",
    });
    assert.equal(response.status, 400);
    return response.status;
  });
  await scenario("Admin login fails closed without a configured password", async () => {
    const response = await jsonPost("/api/admin/login", { password: "not-a-real-secret" });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("set-cookie"), null);
    return response.status;
  });
  await scenario("Invalid analytics event does not reach persistence", async () => {
    const response = await jsonPost("/api/analytics", { eventName: "arbitrary", visitorId: "visitor123", sessionId: "session123", pagePath: "/" });
    assert.equal(response.status, 400);
    return response.status;
  });
} catch (error) {
  report.error = String(error);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  report.result = report.scenarios.some(entry => entry.status === "fail") || report.error ? "fail" : "pass";
  await mkdir("reports", { recursive: true });
  await writeFile("reports/security-e2e.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (process.exitCode) console.error("Last server output:", log);
  server.kill("SIGTERM");
}

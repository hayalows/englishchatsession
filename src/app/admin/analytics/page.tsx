import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import styles from "./analytics.module.css";

import { AdminTopNav } from "@/components/admin/admin-top-nav";
import { ADMIN_SESSION_COOKIE, isValidAdminSessionToken } from "@/lib/admin/auth";
import { getAnalyticsReport, type AnalyticsReport } from "@/lib/analytics/report";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Analytics | English Chat Finder",
  description: "Private anonymous usage analytics for English Chat Finder.",
};

const EMPTY_REPORT: AnalyticsReport = {
  configured: false,
  metrics: { visitorsToday: 0, visitors7d: 0, visitors30d: 0, pageViews7d: 0, sessions7d: 0, bookingClicks7d: 0 },
  daily: [], countries: [], referrers: [], devices: [],
};

function ListPanel({ title, rows }: { title: string; rows: Array<{ label: string; total: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.total));
  return (
    <section className={styles.panel}>
      <h2>{title}</h2>
      {rows.length ? (
        <div className={styles.rows}>
          {rows.map((row) => (
            <div className={styles.row} key={row.label}>
              <div className={styles.rowLabel}>
                <strong>{row.label}</strong>
                <div className={styles.barTrack} aria-hidden="true">
                  <div className={styles.bar} style={{ width: `${Math.max(2, (row.total / max) * 100)}%` }} />
                </div>
              </div>
              <strong>{row.total.toLocaleString()}</strong>
            </div>
          ))}
        </div>
      ) : <p className={styles.empty}>No data yet.</p>}
    </section>
  );
}

export default async function AdminAnalyticsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (!isValidAdminSessionToken(token)) redirect("/admin/login");

  let report = EMPTY_REPORT;
  let storageError = false;
  try {
    report = await getAnalyticsReport();
  } catch {
    storageError = true;
  }

  const metrics = [
    ["Visitors today", report.metrics.visitorsToday],
    ["Visitors · 7 days", report.metrics.visitors7d],
    ["Visitors · 30 days", report.metrics.visitors30d],
    ["Page views · 7 days", report.metrics.pageViews7d],
    ["Sessions · 7 days", report.metrics.sessions7d],
    ["Booking clicks · 7 days", report.metrics.bookingClicks7d],
  ] as const;

  const dailyRows = report.daily.map((row) => ({
    label: new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${row.day}T12:00:00Z`)),
    total: row.visitors,
  }));

  return (
    <div className={styles.page}>
      <AdminTopNav />
      <main className={styles.main} id="admin-main">
        <header className={styles.header}>
          <h1>Site analytics</h1>
          <p>Anonymous first-party usage data from the student finder. Visitor counts use a browser-generated anonymous ID, so they are estimates rather than named people.</p>
        </header>

        {!report.configured ? <div className={styles.notice}>Analytics storage is waiting for the server database connection.</div> : null}
        {storageError ? <div className={styles.notice}>The analytics database could not be read right now. The student finder is unaffected.</div> : null}

        <section className={styles.metrics} aria-label="Analytics summary">
          {metrics.map(([label, value]) => (
            <article className={styles.metric} key={label}>
              <span>{label}</span>
              <strong>{value.toLocaleString()}</strong>
            </article>
          ))}
        </section>

        <div className={styles.grid}>
          <div className={styles.stack}>
            <ListPanel title="Daily visitors · last 7 days" rows={dailyRows} />
            <ListPanel title="Traffic sources · last 30 days" rows={report.referrers} />
          </div>
          <div className={styles.stack}>
            <ListPanel title="Countries · last 30 days" rows={report.countries} />
            <ListPanel title="Devices · last 30 days" rows={report.devices} />
          </div>
        </div>

        <p className={styles.privacy}>This system does not store raw IP addresses, student names, email addresses, or volunteer search text. Location is approximate and comes from request-level geographic headers.</p>
      </main>
    </div>
  );
}

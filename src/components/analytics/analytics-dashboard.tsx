import styles from "./analytics-dashboard.module.css";

import { AnalyticsTopNav } from "@/components/analytics/analytics-top-nav";
import type { AnalyticsReport } from "@/lib/analytics/report";

function displayGeneratedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Not available"
    : new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC";
}

function displayDay(value: string, weekdayOnly = false) {
  const date = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    ...(weekdayOnly ? {} : { day: "numeric", month: "short" }),
    timeZone: "UTC",
  }).format(date);
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className={styles.metric}>
      <span className={styles.metricLabel}>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function TrendPanel({ rows }: { rows: AnalyticsReport["daily"] }) {
  const width = 720;
  const height = 240;
  const padding = { top: 24, right: 18, bottom: 46, left: 42 };
  const max = Math.max(1, ...rows.map((row) => row.visitors));
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const points = rows.map((row, index) => {
    const x = rows.length === 1 ? padding.left + chartWidth / 2 : padding.left + (index / (rows.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (row.visitors / max) * chartHeight;
    return { ...row, x, y };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <section className={`${styles.panel} ${styles.trendPanel}`} aria-labelledby="daily-visitors-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Traffic shape</p>
          <h2 id="daily-visitors-title">Daily finder visitors</h2>
        </div>
        <span className={styles.panelMeta}>Unique page-view IDs / UTC</span>
      </div>
      {rows.length ? (
        <>
          <div
            aria-label="Line chart showing unique finder visitors for each of the last seven days"
            className={styles.chartFrame}
            role="img"
          >
            <svg aria-hidden="true" className={styles.chart} preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
              {[0, 0.5, 1].map((ratio) => {
                const y = padding.top + chartHeight * ratio;
                const value = Math.round(max * (1 - ratio));
                return (
                  <g key={ratio}>
                    <line className={styles.gridLine} x1={padding.left} x2={width - padding.right} y1={y} y2={y} />
                    <text className={styles.axisLabel} x={padding.left - 10} y={y + 4} textAnchor="end">{value}</text>
                  </g>
                );
              })}
              <polyline className={styles.trendLine} fill="none" points={polyline} />
              {points.map((point) => (
                <g key={point.day}>
                  <circle className={styles.trendPoint} cx={point.x} cy={point.y} r="5" />
                  <text className={styles.pointLabel} x={point.x} y={point.y - 12} textAnchor="middle">{point.visitors}</text>
                  <text className={styles.dayLabel} x={point.x} y={height - 16} textAnchor="middle">{displayDay(point.day, true)}</text>
                </g>
              ))}
            </svg>
          </div>
          <details className={styles.dataDisclosure}>
            <summary>Show daily data table</summary>
            <div className={styles.tableWrap}>
              <table>
                <caption className={styles.srOnly}>Daily finder visitor and page-view counts for the last seven days</caption>
                <thead><tr><th scope="col">Day</th><th scope="col">Visitors</th><th scope="col">Page views</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.day}><th scope="row">{displayDay(row.day)}</th><td>{row.visitors.toLocaleString()}</td><td>{row.pageViews.toLocaleString()}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className={styles.empty}>No finder visits yet. The public finder remains usable while analytics storage is empty.</p>
      )}
    </section>
  );
}

function ListPanel({ title, caption, rows }: { title: string; caption: string; rows: Array<{ label: string; total: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.total));
  const titleId = `${title.replaceAll(" ", "-").toLowerCase()}-title`;
  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.panelHeader}>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>{caption}</p>
        </div>
      </div>
      {rows.length ? (
        <div className={styles.rows}>
          {rows.map((row, index) => (
            <div className={styles.row} key={`${row.label}-${index}`}>
              <div className={styles.rowLabel}>
                <strong>{row.label}</strong>
                <div aria-hidden="true" className={styles.barTrack}>
                  <div className={styles.bar} style={{ width: `${Math.max(2, (row.total / max) * 100)}%` }} />
                </div>
              </div>
              <strong>{row.total.toLocaleString()}</strong>
            </div>
          ))}
        </div>
      ) : <p className={styles.empty}>No data in this period yet.</p>}
    </section>
  );
}

function StatusNotice({ report }: { report: AnalyticsReport }) {
  if (report.status === "configured") return null;
  const message = report.status === "disabled"
    ? "Analytics is not enabled yet. Set DATABASE_URL and apply docs/analytics.sql when you are ready; the public finder does not depend on it."
    : report.status === "invalid"
      ? "DATABASE_URL is not a valid PostgreSQL connection string. Analytics is disabled until the server configuration is corrected."
      : "Analytics storage could not be read. The public finder is unaffected; check the database connection and apply docs/analytics.sql.";
  return <div className={styles.notice} role={report.status === "error" ? "alert" : "status"}>{message}</div>;
}

export function AnalyticsDashboard({ report }: { report: AnalyticsReport }) {
  const metrics = report.metrics;

  return (
    <div className={styles.page}>
      <AnalyticsTopNav />
      <main className={styles.main} id="analytics-main" aria-labelledby="analytics-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>Private visitor view</p>
            <h1 id="analytics-title">Finder visits</h1>
            <p>See people who open the public English Chat Finder. This page measures visits to the finder only; it does not measure whether someone runs the scanner or books an appointment.</p>
          </div>
          <div className={styles.freshness}>
            <span>Last refreshed</span>
            <strong>{displayGeneratedAt(report.generatedAt)}</strong>
            <small>{metrics.visitors30d.toLocaleString()} unique visitors in the last 30 days</small>
          </div>
        </header>

        <StatusNotice report={report} />

        <section className={styles.metrics} aria-label="Finder visit summary">
          <MetricCard detail="Unique page-view IDs" label="Visitors today" value={metrics.visitorsToday.toLocaleString()} />
          <MetricCard detail="Unique page-view IDs" label="Visitors (7 days)" value={metrics.visitors7d.toLocaleString()} />
          <MetricCard detail="Unique page-view IDs" label="Visitors (30 days)" value={metrics.visitors30d.toLocaleString()} />
          <MetricCard detail="All public finder opens" label="Page views (7 days)" value={metrics.pageViews7d.toLocaleString()} />
          <MetricCard detail="Unique browser sessions" label="Sessions (7 days)" value={metrics.sessions7d.toLocaleString()} />
        </section>

        <div className={styles.grid}>
          <div className={styles.stack}>
            <TrendPanel rows={report.daily} />
            <ListPanel caption="Unique sessions that opened the finder" rows={report.referrers} title="Traffic sources (last 30 days)" />
          </div>
          <div className={styles.stack}>
            <ListPanel caption="Unique page-view IDs" rows={report.countries} title="Countries (last 30 days)" />
            <ListPanel caption="Unique page-view IDs" rows={report.devices} title="Devices (last 30 days)" />
          </div>
        </div>

        <p className={styles.privacy}>The optional collector stores event time, the public finder path, coarse location headers, device/browser categories, and pseudonymous browser/session IDs. It does not store raw IP addresses, student names, email addresses, volunteer search text, scanner results, or appointment results. The scanner does not call or depend on this system.</p>
      </main>
    </div>
  );
}

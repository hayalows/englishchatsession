import styles from "./analytics-dashboard.module.css";

import { AnalyticsLiveRefresh } from "@/components/analytics/analytics-live-refresh";
import { AnalyticsTopNav } from "@/components/analytics/analytics-top-nav";
import type { AnalyticsReport } from "@/lib/analytics/report";

const ENGAGEMENT_MILESTONES = [10, 30, 60, 180] as const;

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

function displayMilestone(seconds: number) {
  return seconds >= 60 ? `${seconds / 60} min active` : `${seconds} sec active`;
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
  const width = 760;
  const height = 248;
  const padding = { top: 22, right: 18, bottom: 44, left: 42 };
  const max = Math.max(1, ...rows.map((row) => row.visitors), ...rows.map((row) => row.scanStarters));
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const pointsFor = (field: "visitors" | "scanStarters") => rows.map((row, index) => {
    const x = rows.length === 1 ? padding.left + chartWidth / 2 : padding.left + (index / (rows.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - (row[field] / max) * chartHeight;
    return { ...row, x, y };
  });
  const visitorPoints = pointsFor("visitors");
  const scanPoints = pointsFor("scanStarters");

  return (
    <section className={`${styles.panel} ${styles.trendPanel}`} aria-labelledby="daily-visitors-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Movement</p>
          <h2 id="daily-visitors-title">Visitors and scan starters</h2>
          <p>Unique anonymous visitors, last 14 days · UTC</p>
        </div>
        <div className={styles.legend} aria-label="Chart legend">
          <span><i className={styles.legendVisitor} aria-hidden="true" /> Visitors</span>
          <span><i className={styles.legendScan} aria-hidden="true" /> Scan starters</span>
        </div>
      </div>
      {rows.length ? (
        <>
          <div
            aria-label="Line chart comparing unique finder visitors with unique visitors who started a scan during the last fourteen days"
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
              <polyline className={styles.trendLine} fill="none" points={visitorPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
              <polyline className={styles.scanLine} fill="none" points={scanPoints.map((point) => `${point.x},${point.y}`).join(" ")} />
              {visitorPoints.map((point, index) => (
                <g key={point.day}>
                  <circle className={styles.trendPoint} cx={point.x} cy={point.y} r="4.5" />
                  <circle className={styles.scanPoint} cx={scanPoints[index]?.x} cy={scanPoints[index]?.y} r="4" />
                  <text className={styles.dayLabel} x={point.x} y={height - 15} textAnchor="middle">{displayDay(point.day, true)}</text>
                </g>
              ))}
            </svg>
          </div>
          <details className={styles.dataDisclosure}>
            <summary>Show daily data table</summary>
            <div className={styles.tableWrap}>
              <table>
                <caption className={styles.srOnly}>Daily visitors, scan starters, page views, and scan-start clicks for the last fourteen days</caption>
                <thead><tr><th scope="col">Day</th><th scope="col">Visitors</th><th scope="col">Scan starters</th><th scope="col">Page views</th><th scope="col">Scan clicks</th></tr></thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.day}>
                      <th scope="row">{displayDay(row.day)}</th>
                      <td>{row.visitors.toLocaleString()}</td>
                      <td>{row.scanStarters.toLocaleString()}</td>
                      <td>{row.pageViews.toLocaleString()}</td>
                      <td>{row.scanStarts.toLocaleString()}</td>
                    </tr>
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

function FunnelPanel({ report }: { report: AnalyticsReport }) {
  const { visitors7d, scanStarters7d, scanStartRate7d } = report.metrics;
  const scanWidth = visitors7d ? Math.max(2, (scanStarters7d / visitors7d) * 100) : 0;

  return (
    <section className={styles.panel} aria-labelledby="finder-funnel-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Primary action</p>
          <h2 id="finder-funnel-title">Finder opens to scan starts</h2>
          <p>Unique visitors, last 7 days</p>
        </div>
        <strong className={styles.heroRate}>{visitors7d ? `${scanStartRate7d}%` : "—"}</strong>
      </div>
      <div className={styles.flowStages}>
        <div className={styles.flowStage}>
          <div className={styles.flowStageHeader}><span>Opened finder</span><strong>{visitors7d.toLocaleString()}</strong></div>
          <div className={styles.flowTrack}><span className={styles.flowBar} style={{ width: "100%" }} /></div>
          <small>100% baseline</small>
        </div>
        <div className={styles.flowConnector} aria-hidden="true"><span>↓</span><strong>{visitors7d ? `${scanStartRate7d}%` : "—"}</strong></div>
        <div className={styles.flowStage}>
          <div className={styles.flowStageHeader}><span>Started a scan</span><strong>{scanStarters7d.toLocaleString()}</strong></div>
          <div className={styles.flowTrack}><span className={`${styles.flowBar} ${styles.flowBarAccent}`} style={{ width: `${scanWidth}%` }} /></div>
          <small>One event per scan click</small>
        </div>
      </div>
      <p className={styles.panelNote}>The scan-start event is recorded when the user requests a scan. Checking 20 calendars does not create 20 analytics events.</p>
    </section>
  );
}

function EngagementPanel({ report }: { report: AnalyticsReport }) {
  const baseline = Math.max(1, report.metrics.sessions7d);
  const values = new Map(report.engagement.map((row) => [row.milestoneSeconds, row]));

  return (
    <section className={styles.panel} aria-labelledby="engagement-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Depth</p>
          <h2 id="engagement-title">Active time on finder</h2>
          <p>Visible browser sessions, last 7 days</p>
        </div>
      </div>
      {report.engagement.length ? (
        <div className={styles.rows}>
          {ENGAGEMENT_MILESTONES.map((milestone) => {
            const row = values.get(milestone);
            const sessions = row?.sessions ?? 0;
            return (
              <div className={styles.row} key={milestone}>
                <div className={styles.rowLabel}>
                  <strong>{displayMilestone(milestone)}</strong>
                  <div className={styles.barTrack}>
                    <div className={`${styles.bar} ${styles.engagementBar}`} style={{ width: `${Math.max(0, Math.min(100, (sessions / baseline) * 100))}%` }} />
                  </div>
                </div>
                <strong>{sessions.toLocaleString()}</strong>
              </div>
            );
          })}
        </div>
      ) : <p className={styles.empty}>Engagement milestones will appear after visitors spend visible time on the finder.</p>}
      <p className={styles.panelNote}>Approximate active time. Background tabs are paused, and no exact browsing history is stored.</p>
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
            <p className={styles.eyebrow}>Private product view</p>
            <h1 id="analytics-title">Finder visits</h1>
            <p>Understand who opens the public English Chat Finder, whether they start a scan, and how deeply they use the page. Scanner calendar checks are not counted as separate actions.</p>
          </div>
          <div className={styles.freshness}>
            <span>Last refreshed</span>
            <strong>{displayGeneratedAt(report.generatedAt)}</strong>
            <small>{metrics.visitorsToday.toLocaleString()} today · {metrics.visitors30d.toLocaleString()} unique visitors in 30 days</small>
            <AnalyticsLiveRefresh />
          </div>
        </header>

        <StatusNotice report={report} />

        <section className={styles.metrics} aria-label="Finder visit summary">
          <MetricCard detail="Unique anonymous visitors" label="Visitors (7 days)" value={metrics.visitors7d.toLocaleString()} />
          <MetricCard detail="Scan starters ÷ visitors" label="Scan-start rate" value={metrics.visitors7d ? `${metrics.scanStartRate7d}%` : "—"} />
          <MetricCard detail="One event per scan click" label="Scan starts (7 days)" value={metrics.scanStarts7d.toLocaleString()} />
          <MetricCard detail="All public finder opens" label="Page views (7 days)" value={metrics.pageViews7d.toLocaleString()} />
          <MetricCard detail="Active for at least 60 seconds" label="Engaged sessions" value={metrics.engagedSessions60s7d.toLocaleString()} />
        </section>

        <div className={styles.grid}>
          <div className={styles.stack}>
            <TrendPanel rows={report.daily} />
            <FunnelPanel report={report} />
          </div>
          <div className={styles.stack}>
            <EngagementPanel report={report} />
            <div className={styles.breakdownGrid}>
              <ListPanel caption="Unique visitors, last 30 days" rows={report.countries} title="Countries" />
              <ListPanel caption="Unique visitors, last 30 days" rows={report.devices} title="Devices" />
            </div>
          </div>
        </div>

        <details className={styles.detailDisclosure}>
          <summary>Explore traffic detail</summary>
          <div className={styles.detailGrid}>
            <ListPanel caption="Unique visitors, last 30 days" rows={report.browsers} title="Browsers" />
            <ListPanel caption="Unique sessions, last 30 days" rows={report.referrers} title="Traffic sources" />
            <ListPanel caption="Recorded scan-start clicks, last 30 days" rows={report.scanModes} title="Scan mode mix" />
          </div>
        </details>

        <details className={styles.definitions}>
          <summary>How these numbers are defined</summary>
          <ul>
            <li><strong>Visitor:</strong> a pseudonymous browser ID. It is not a named person.</li>
            <li><strong>Scan-start rate:</strong> unique visitors who started a scan divided by unique visitors who opened the finder in the same 7-day window.</li>
            <li><strong>Scan start:</strong> one click/request by the user. Individual calendar checks are never recorded as analytics events.</li>
            <li><strong>Active time:</strong> visible-page milestones at 10 seconds, 30 seconds, 60 seconds, and 3 minutes. Hidden tabs pause the clock.</li>
            <li><strong>Country and device:</strong> coarse request-level categories. Raw IP addresses, names, searches, results, and booking choices are not stored.</li>
          </ul>
        </details>

        <p className={styles.privacy}>The optional collector stores event time, the public finder path, coarse location headers, device/browser categories, scan mode, active-time milestones, and pseudonymous browser/session IDs. It does not store raw IP addresses, student names, email addresses, volunteer search text, scanner results, or appointment results. Analytics requests are best-effort and never block the scanner.</p>
      </main>
    </div>
  );
}

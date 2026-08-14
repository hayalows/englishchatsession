import refinements from "./analytics-dashboard-refinements.module.css";
import styles from "./analytics-dashboard.module.css";

import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { AnalyticsKpiGrid } from "@/components/analytics/analytics-kpi-grid";
import { AnalyticsTopNav } from "@/components/analytics/analytics-top-nav";
import { AnalyticsTrendChart } from "@/components/analytics/analytics-trend-chart";
import type { AnalyticsComparison } from "@/lib/analytics/comparison";
import type { AnalyticsReport } from "@/lib/analytics/report";

const ENGAGEMENT_MILESTONES = [10, 30, 60, 180] as const;
const DEFAULT_LIST_ROWS = 5;

type ListRow = { label: string; total: number };

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

function displayLatestEventAt(value: string | null) {
  if (!value) return "No events yet";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Not available"
    : new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(date) + " UTC";
}

function displayTrendLabel(value: string, granularity: AnalyticsReport["filters"]["granularity"]) {
  if (granularity === "week") {
    const [year, week] = value.split("-W");
    return `Week ${week ?? value}${year ? ` · ${year}` : ""}`;
  }

  const date = new Date(granularity === "hour" ? `${value.replace(" ", "T")}:00Z` : `${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", granularity === "hour"
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }
    : { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function displayMilestone(seconds: number) {
  return seconds >= 60 ? `${seconds / 60} min active` : `${seconds} sec active`;
}

function TrendPanel({ report }: { report: AnalyticsReport }) {
  const rows = report.trend;

  return (
    <section className={`${styles.panel} ${styles.trendPanel}`} aria-labelledby="trend-title">
      <div className={`${styles.panelHeader} ${styles.trendHeader}`}>
        <div>
          <p className={styles.eyebrow}>Movement</p>
          <h2 id="trend-title">Finder activity over time</h2>
          <p>Choose one metric to focus on its movement, then inspect exact values only when needed.</p>
        </div>
        <div className={styles.panelMeta}>
          <strong>{report.filters.trendLabel}</strong>
          <span>{report.filters.rangeLabel} · {report.filters.segmentLabel}</span>
        </div>
      </div>

      {rows.length ? (
        <>
          <AnalyticsTrendChart granularity={report.filters.granularity} rows={rows} />
          <details className={styles.dataDisclosure}>
            <summary>View exact trend data ({rows.length})</summary>
            {rows.length > 6 ? (
              <p className={refinements.tableHint}>{rows.length} periods · scroll inside the table to inspect more without extending the page.</p>
            ) : null}
            <div className={refinements.tableViewport} tabIndex={0}>
              <table>
                <caption className={styles.srOnly}>Visitors, page views, scan starters, and scan clicks for {report.filters.rangeLabel.toLowerCase()}</caption>
                <thead><tr><th scope="col">Period</th><th scope="col">Visitors</th><th scope="col">Views</th><th scope="col">Scan starters</th><th scope="col">Scan clicks</th></tr></thead>
                <tbody>
                  {rows.map((row, index) => (
                    <tr key={`${row.label}-${index}`}>
                      <th scope="row">{displayTrendLabel(row.label, report.filters.granularity)}</th>
                      <td>{row.visitors.toLocaleString()}</td>
                      <td>{row.pageViews.toLocaleString()}</td>
                      <td>{row.scanStarters.toLocaleString()}</td>
                      <td>{row.scanStarts.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <p className={styles.empty}>No finder visits match this view yet.</p>
      )}
    </section>
  );
}

function FunnelPanel({ report }: { report: AnalyticsReport }) {
  const { visitors, scanStarters, scanStartRate } = report.metrics;
  const scanWidth = visitors ? Math.min(100, Math.max(2, (scanStarters / visitors) * 100)) : 0;

  return (
    <section className={styles.panel} aria-labelledby="finder-funnel-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Primary action</p>
          <h2 id="finder-funnel-title">Finder opens to scan starts</h2>
          <p>Unique visitors · {report.filters.rangeLabel}</p>
        </div>
        <strong className={styles.heroRate}>{visitors ? `${scanStartRate}%` : "—"}</strong>
      </div>
      <div className={styles.flowStages}>
        <div className={styles.flowStage}>
          <div className={styles.flowStageHeader}><span>Opened finder</span><strong>{visitors.toLocaleString()}</strong></div>
          <div className={styles.flowTrack}><span className={styles.flowBar} style={{ width: "100%" }} /></div>
          <small>100% baseline</small>
        </div>
        <div className={styles.flowConnector} aria-hidden="true"><span>↓</span><strong>{visitors ? `${scanStartRate}%` : "—"}</strong></div>
        <div className={styles.flowStage}>
          <div className={styles.flowStageHeader}><span>Started a scan</span><strong>{scanStarters.toLocaleString()}</strong></div>
          <div className={styles.flowTrack}><span className={`${styles.flowBar} ${styles.flowBarAccent}`} style={{ width: `${scanWidth}%` }} /></div>
          <small>One event per scan click</small>
        </div>
      </div>
      <p className={styles.panelNote}>The rate uses unique visitors. Scan clicks remain available separately, so repeated use is visible without multiplying calendar checks.</p>
    </section>
  );
}

function EngagementPanel({ report }: { report: AnalyticsReport }) {
  const baseline = Math.max(1, report.metrics.sessions);
  const values = new Map(report.engagement.map((row) => [row.milestoneSeconds, row]));

  return (
    <section className={styles.panel} aria-labelledby="engagement-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Depth</p>
          <h2 id="engagement-title">Active time on finder</h2>
          <p>Visible browser sessions · {report.filters.rangeLabel}</p>
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
      <p className={styles.panelNote}>Approximate active time. Background tabs pause, and no exact browsing history is stored.</p>
    </section>
  );
}

function ScanHealthPanel({ report }: { report: AnalyticsReport }) {
  const {
    scanStarts,
    repeatScanVisitors,
    repeatScanRate,
    frequentScanVisitors,
    scansPerStarter,
    returningVisitors,
    returningVisitorRate,
  } = report.metrics;

  return (
    <section className={styles.panel} aria-labelledby="scan-health-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Scanner signal</p>
          <h2 id="scan-health-title">Scan activity</h2>
          <p>Repeat use and scan intensity · {report.filters.rangeLabel}</p>
        </div>
      </div>

      <div className={refinements.scanSummary}>
        <div className={refinements.scanSummaryStat}><strong>{scanStarts.toLocaleString()}</strong><span>Total starts</span></div>
        <div className={refinements.scanSummaryStat}><strong>{repeatScanRate ? `${repeatScanRate}%` : "—"}</strong><span>Repeat rate</span></div>
        <div className={refinements.scanSummaryStat}><strong>{scansPerStarter ? `${scansPerStarter}×` : "—"}</strong><span>Scans / starter</span></div>
      </div>

      <details className={refinements.scanDetailDisclosure}>
        <summary>More scan details</summary>
        <div className={refinements.scanDetailRows}>
          <div className={refinements.scanDetailRow}><span>Visitors with 2+ scans</span><strong>{repeatScanVisitors.toLocaleString()}</strong></div>
          <div className={refinements.scanDetailRow}><span>Visitors with 5+ scans</span><strong>{frequentScanVisitors.toLocaleString()}</strong></div>
          <div className={refinements.scanDetailRow}><span>Returning visitor IDs</span><strong>{returningVisitors.toLocaleString()} · {returningVisitorRate}%</strong></div>
          {report.scanFrequency.length ? (
            <>
              <p className={refinements.scanDetailLabel}>Scan-frequency mix</p>
              {report.scanFrequency.map((row) => (
                <div className={refinements.scanDetailRow} key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.total.toLocaleString()}</strong>
                </div>
              ))}
            </>
          ) : null}
        </div>
      </details>

      <p className={styles.panelNote}>Repeated use can signal strong intent, uncertainty, or a technical issue. Treat it as an investigation signal, not a verdict.</p>
    </section>
  );
}

function ListRows({ rows, max }: { rows: ListRow[]; max: number }) {
  return (
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
  );
}

function ListPanel({ title, caption, rows }: { title: string; caption: string; rows: ListRow[] }) {
  const max = Math.max(1, ...rows.map((row) => row.total));
  const titleId = `${title.replaceAll(" ", "-").toLowerCase()}-title`;
  const visibleRows = rows.slice(0, DEFAULT_LIST_ROWS);
  const hiddenRows = rows.slice(DEFAULT_LIST_ROWS);

  return (
    <section className={styles.panel} aria-labelledby={titleId}>
      <div className={styles.panelHeader}>
        <div>
          <h2 id={titleId}>{title}</h2>
          <p>{caption}</p>
        </div>
      </div>
      {rows.length ? (
        <>
          <ListRows max={max} rows={visibleRows} />
          {hiddenRows.length ? (
            <details className={refinements.panelRowsDisclosure}>
              <summary>View all {rows.length}</summary>
              <div className={refinements.moreRows}>
                <ListRows max={max} rows={hiddenRows} />
              </div>
            </details>
          ) : null}
        </>
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

export function AnalyticsDashboard({
  report,
  comparison,
}: {
  report: AnalyticsReport;
  comparison: AnalyticsComparison;
}) {
  const metrics = report.metrics;

  return (
    <div className={styles.page}>
      <AnalyticsTopNav activeNowVisitors={metrics.activeNowVisitors} />
      <main className={styles.main} id="analytics-main" aria-labelledby="analytics-title">
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>English Chat Finder</p>
            <h1 id="analytics-title">Finder analytics</h1>
            <p>A fast read on audience, scan intent, and repeat use. Calendar checks stay outside analytics.</p>
          </div>
          <div className={styles.freshness}>
            <span className={styles.freshnessLabel}>Selected window</span>
            <strong className={styles.freshnessRange}>{report.filters.rangeLabel}</strong>
            <small className={styles.freshnessLatest}>Latest data {displayLatestEventAt(report.latestEventAt)}</small>
            <small className={styles.freshnessRefresh}>Report refreshed {displayGeneratedAt(report.generatedAt)}</small>
          </div>
        </header>

        <StatusNotice report={report} />
        <AnalyticsFilters filters={report.filters} options={report.filterOptions} />
        <AnalyticsKpiGrid comparison={comparison} report={report} />

        <div className={styles.primaryGrid}>
          <TrendPanel report={report} />
        </div>

        <section className={styles.breakdownSection} aria-labelledby="audience-breakdown-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Audience</p>
              <h2 id="audience-breakdown-title">Where usage comes from</h2>
            </div>
            <small>Swipe on mobile</small>
          </div>
          <div className={styles.breakdownGrid} aria-label="Finder audience breakdowns">
            <ListPanel caption={`Unique visitors · ${report.filters.rangeLabel}`} rows={report.countries} title="Countries" />
            <ListPanel caption={`Unique visitors · ${report.filters.rangeLabel}`} rows={report.devices} title="Devices" />
            <ListPanel caption={`Unique sessions · ${report.filters.rangeLabel}`} rows={report.referrers} title="Traffic sources" />
          </div>
        </section>

        <div className={styles.grid}>
          <div className={styles.stack}>
            <FunnelPanel report={report} />
            <EngagementPanel report={report} />
          </div>
          <div className={styles.stack}>
            <ScanHealthPanel report={report} />
          </div>
        </div>

        <details className={styles.detailDisclosure}>
          <summary>Explore traffic detail</summary>
          <div className={styles.detailGrid}>
            <ListPanel caption={`Unique visitors · ${report.filters.rangeLabel}`} rows={report.browsers} title="Browsers" />
            <ListPanel caption={`Recorded scan clicks · ${report.filters.rangeLabel}`} rows={report.scanModes} title="Scan mode mix" />
          </div>
        </details>

        <details className={styles.definitions}>
          <summary>How these numbers are defined</summary>
          <ul>
            <li><strong>Visitor:</strong> a pseudonymous browser ID. It is not a named person.</li>
            <li><strong>Page view:</strong> one recorded opening/view of the finder page. One visitor can create multiple views.</li>
            <li><strong>Period change:</strong> Visitors and views compare with the immediately preceding equal-length window using the same audience filter. For Today, the comparison is the same elapsed time yesterday.</li>
            <li><strong>Today:</strong> the current UTC/Ghana calendar day from 00:00 to now. Each new date starts a new day view.</li>
            <li><strong>Scan-start rate:</strong> unique visitors who started a scan divided by unique visitors who opened the finder in the selected window.</li>
            <li><strong>Scan start:</strong> one click/request by the user. Individual calendar checks are never recorded as analytics events.</li>
            <li><strong>Repeat scan:</strong> a visitor ID with at least 2 scan-start events in the selected window. Five or more is shown as a high-frequency signal, not an abuse verdict.</li>
            <li><strong>Returning visitor:</strong> a visitor ID seen before the selected window. Browser storage resets and privacy controls can make this an undercount.</li>
            <li><strong>Active time:</strong> visible-page milestones at 10 seconds, 30 seconds, 60 seconds, and 3 minutes. Hidden tabs pause the clock.</li>
            <li><strong>Active now:</strong> distinct anonymous visitors with a visible-page heartbeat received in the last 90 seconds. It is an approximate live signal, not an exact count of people.</li>
            <li><strong>Event time:</strong> Neon records <code>created_at</code> when the server accepts an event. The latest-event label is receipt time, and chart buckets use UTC.</li>
            <li><strong>Country, device, browser, and source:</strong> coarse request-level categories. Raw IP addresses, names, searches, results, and booking choices are not stored.</li>
          </ul>
        </details>

        <footer className={styles.footer}>Designed and built by Papa Kojo Mensah</footer>
      </main>
    </div>
  );
}

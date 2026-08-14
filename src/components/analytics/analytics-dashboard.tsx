"use client";

import { useState } from "react";

import refinements from "./analytics-dashboard-refinements.module.css";
import styles from "./analytics-dashboard.module.css";

import { AnalyticsBreakdownCard } from "@/components/analytics/analytics-breakdown-card";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { AnalyticsLiveRefresh } from "@/components/analytics/analytics-live-refresh";
import { AnalyticsTopNav } from "@/components/analytics/analytics-top-nav";
import {
  AnalyticsTrendChart,
  type AnalyticsPrimaryMetric,
} from "@/components/analytics/analytics-trend-chart";
import type { AnalyticsMetricBreakdowns } from "@/lib/analytics/breakdown-types";
import type { AnalyticsComparison } from "@/lib/analytics/comparison";
import type { AnalyticsReport } from "@/lib/analytics/report";

const ENGAGEMENT_MILESTONES = [10, 30, 60, 180] as const;

type ListRow = { label: string; total: number };

const METRIC_LABELS: Record<AnalyticsPrimaryMetric, string> = {
  visitors: "Visitors",
  pageViews: "Page views",
  scanUsage: "Scan usage",
};

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
  return seconds >= 60 ? `${seconds / 60} min` : `${seconds} sec`;
}

function TrendPanel({
  report,
  comparison,
  activeMetric,
  onMetricChange,
}: {
  report: AnalyticsReport;
  comparison: AnalyticsComparison;
  activeMetric: AnalyticsPrimaryMetric;
  onMetricChange: (metric: AnalyticsPrimaryMetric) => void;
}) {
  const rows = report.trend;

  return (
    <section className={`${styles.panel} ${styles.trendPanel}`} aria-labelledby="trend-title">
      <h2 className={styles.srOnly} id="trend-title">Finder activity over time</h2>

      {rows.length ? (
        <>
          <AnalyticsTrendChart
            activeMetric={activeMetric}
            comparison={comparison}
            onMetricChange={onMetricChange}
            report={report}
          />
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

function ScannerPanel({ report }: { report: AnalyticsReport }) {
  const {
    visitors,
    scanStarters,
    scanStarts,
    repeatScanVisitors,
    repeatScanRate,
    returningVisitors,
    returningVisitorRate,
    scansPerStarter,
  } = report.metrics;
  const starterWidth = visitors ? Math.min(100, Math.max(2, (scanStarters / visitors) * 100)) : 0;

  return (
    <section className={`${styles.panel} ${styles.scannerPanel}`} aria-labelledby="scanner-journey-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Scanner</p>
          <h2 id="scanner-journey-title">From visit to scan</h2>
          <p>{report.filters.rangeLabel} - unique visitors</p>
        </div>
      </div>

      <div aria-label="Finder to scanner journey" className={styles.scanFlow}>
        <div className={styles.scanStage}>
          <div className={styles.scanStageTop}><span>Opened finder</span><strong>{visitors.toLocaleString()}</strong></div>
          <div className={styles.flowTrack}><span className={styles.flowBar} style={{ width: "100%" }} /></div>
        </div>
        <div className={styles.scanStage}>
          <div className={styles.scanStageTop}><span>Started a scan</span><strong>{scanStarters.toLocaleString()}</strong></div>
          <div className={styles.flowTrack}><span className={`${styles.flowBar} ${styles.flowBarAccent}`} style={{ width: `${starterWidth}%` }} /></div>
          <small>{visitors ? `${scanStarters.toLocaleString()} of ${visitors.toLocaleString()} visitors` : "No visitor baseline yet"}</small>
        </div>
      </div>

      <div aria-label="Scanner activity summary" className={styles.scanStats}>
        <div className={styles.scanStat}>
          <strong>{scanStarts.toLocaleString()}</strong>
          <span>scan starts</span>
        </div>
        <div className={styles.scanStat}>
          <strong>{scanStarters ? `${repeatScanRate}%` : "—"}</strong>
          <span>repeat use</span>
          <small>{repeatScanVisitors.toLocaleString()} visitors - 2+ scans</small>
        </div>
        <div className={styles.scanStat}>
          <strong>{scanStarters ? `${scansPerStarter}x` : "—"}</strong>
          <span>per starter</span>
        </div>
      </div>

      <details className={refinements.scanDetailDisclosure}>
        <summary>See repeat-use detail</summary>
        <div className={refinements.scanDetailRows}>
          <div className={refinements.scanDetailRow}>
            <span>Returning visitors</span>
            <strong>{returningVisitors.toLocaleString()} · {returningVisitorRate}%</strong>
          </div>
          {report.scanFrequency.length ? report.scanFrequency.map((row) => (
            <div className={refinements.scanDetailRow} key={row.label}>
              <span>{row.label}</span>
              <strong>{row.total.toLocaleString()}</strong>
            </div>
          )) : <p className={styles.empty}>Scan frequency will appear after visitors use the scanner.</p>}
        </div>
      </details>

      <p className={styles.panelNote}>One scan action counts once. Five-plus scans are a signal to investigate, not a verdict.</p>
    </section>
  );
}

function EngagementPanel({ report }: { report: AnalyticsReport }) {
  const baseline = Math.max(1, report.metrics.sessions);
  const values = new Map(report.engagement.map((row) => [row.milestoneSeconds, row]));
  const engagedSessions = report.metrics.engagedSessions60s;
  const engagedRate = report.metrics.sessions
    ? Math.round((engagedSessions / report.metrics.sessions) * 100)
    : 0;

  return (
    <section className={`${styles.panel} ${styles.engagementPanel}`} aria-labelledby="engagement-title">
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>Attention</p>
          <h2 id="engagement-title">Time spent</h2>
          <p>Visible sessions - {report.filters.rangeLabel}</p>
        </div>
      </div>
      {report.engagement.length ? (
        <>
          <div className={styles.engagementLead}>
            <div>
              <strong>{engagedSessions.toLocaleString()}</strong>
              <span>sessions reached 1 min</span>
            </div>
            {report.metrics.sessions ? <b>{engagedRate}%</b> : null}
          </div>
          <div className={styles.engagementRows}>
            {ENGAGEMENT_MILESTONES.map((milestone) => {
              const row = values.get(milestone);
              const sessions = row?.sessions ?? 0;
              return (
                <div className={styles.engagementRow} key={milestone}>
                  <div className={styles.engagementRowTop}>
                    <span>{displayMilestone(milestone)}</span>
                    <strong>{sessions.toLocaleString()}</strong>
                  </div>
                  <div className={styles.barTrack}>
                    <div className={`${styles.bar} ${styles.engagementBar}`} style={{ width: `${Math.max(0, Math.min(100, (sessions / baseline) * 100))}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : <p className={styles.empty}>Engagement milestones will appear after visitors spend visible time on the finder.</p>}
      <p className={styles.panelNote}>Approximate visible time; background tabs pause.</p>
    </section>
  );
}

function ListPanel({ title, caption, rows }: { title: string; caption: string; rows: ListRow[] }) {
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

export function AnalyticsDashboard({
  report,
  comparison,
  breakdowns,
}: {
  report: AnalyticsReport;
  comparison: AnalyticsComparison;
  breakdowns: AnalyticsMetricBreakdowns;
}) {
  const metrics = report.metrics;
  const [activeMetric, setActiveMetric] = useState<AnalyticsPrimaryMetric>("visitors");
  const selectedMetricLabel = METRIC_LABELS[activeMetric];

  return (
    <div className={styles.page}>
      <AnalyticsTopNav />
      <main className={styles.main} id="analytics-main" aria-labelledby="analytics-title">
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>English Chat Finder</p>
            <h1 id="analytics-title">Finder analytics</h1>
            <p>Reach, scan intent, and repeat use at a glance.</p>
          </div>
          <div className={styles.headerTools}>
            <div className={styles.controlRow}>
              <AnalyticsFilters filters={report.filters} options={report.filterOptions} />
              <AnalyticsLiveRefresh />
            </div>
            <div className={styles.statusRow}>
              <span className={styles.activeNow} aria-live="polite">
                <i aria-hidden="true" className={styles.activeDot} />
                {metrics.activeNowVisitors.toLocaleString()} active now
              </span>
            </div>
          </div>
        </header>

        <StatusNotice report={report} />

        <div className={styles.primaryGrid}>
          <TrendPanel
            activeMetric={activeMetric}
            comparison={comparison}
            onMetricChange={setActiveMetric}
            report={report}
          />
        </div>

        <section className={styles.breakdownSection} aria-labelledby="audience-breakdown-title">
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Audience</p>
              <h2 id="audience-breakdown-title">Where usage comes from</h2>
            </div>
            <small>{selectedMetricLabel} · swipe on mobile</small>
          </div>
          <div className={styles.breakdownGrid} aria-label={`${selectedMetricLabel} breakdowns`}>
            <AnalyticsBreakdownCard activeMetric={activeMetric} kind="country" onMetricChange={setActiveMetric} rangeLabel={report.filters.rangeLabel} rows={breakdowns.countries} title="Countries" />
            <AnalyticsBreakdownCard activeMetric={activeMetric} kind="device" onMetricChange={setActiveMetric} rangeLabel={report.filters.rangeLabel} rows={breakdowns.devices} title="Devices" />
            <AnalyticsBreakdownCard activeMetric={activeMetric} kind="browser" onMetricChange={setActiveMetric} rangeLabel={report.filters.rangeLabel} rows={breakdowns.browsers} title="Browsers" />
          </div>
        </section>

        <div className={styles.insightsGrid}>
          <ScannerPanel report={report} />
          <EngagementPanel report={report} />
        </div>

        <details className={styles.detailDisclosure}>
          <summary>Traffic sources &amp; scan modes</summary>
          <div className={styles.detailGrid}>
            <AnalyticsBreakdownCard activeMetric={activeMetric} kind="source" onMetricChange={setActiveMetric} rangeLabel={report.filters.rangeLabel} rows={breakdowns.referrers} title="Traffic sources" />
            <ListPanel caption={`Recorded scan clicks · ${report.filters.rangeLabel}`} rows={report.scanModes} title="Scan mode mix" />
          </div>
        </details>

        <details className={styles.definitions}>
          <summary>Metric notes</summary>
          <ul>
            <li><strong>Visitor:</strong> a pseudonymous browser ID. It is not a named person.</li>
            <li><strong>Page view:</strong> one recorded opening/view of the finder page. One visitor can create multiple views.</li>
            <li><strong>Scan usage:</strong> the percentage of unique visitors who started at least one scan in the selected period. For example, 3 starters out of 5 visitors is 60% scan usage.</li>
            <li><strong>Period change:</strong> Visitors and page views use percentage change. Scan usage uses percentage-point change. Today compares with the same elapsed time yesterday.</li>
            <li><strong>Today:</strong> the current UTC/Ghana calendar day from 00:00 to now. Each new date starts a new day view.</li>
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

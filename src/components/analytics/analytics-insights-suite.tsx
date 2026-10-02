"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react";

import type { AnalyticsBreakdownRow, AnalyticsMetricBreakdowns } from "@/lib/analytics/breakdown-types";
import type { AnalyticsReport } from "@/lib/analytics/report";
import type { AnalyticsPrimaryMetric } from "./analytics-trend-chart";

import styles from "./analytics-insights-suite.module.css";

type CountRow = { label: string; value: number };
type SortKey = "period" | "visitors" | "pageViews" | "scanStarters" | "scanStarts" | "scanUsage";
type SortDirection = "asc" | "desc";

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

function scanUsage(row: Pick<AnalyticsBreakdownRow, "visitors" | "scanStarters">) {
  return row.visitors ? Math.min(100, Math.round((row.scanStarters / row.visitors) * 100)) : 0;
}

function breakdownValue(row: AnalyticsBreakdownRow, metric: AnalyticsPrimaryMetric) {
  if (metric === "pageViews") return row.pageViews;
  if (metric === "scanUsage") return scanUsage(row);
  return row.visitors;
}

function compositionValue(row: AnalyticsBreakdownRow, metric: AnalyticsPrimaryMetric) {
  if (metric === "pageViews") return row.pageViews;
  if (metric === "scanUsage") return row.scanStarters;
  return row.visitors;
}

function withOther(rows: AnalyticsBreakdownRow[], metric: AnalyticsPrimaryMetric, limit = 5): CountRow[] {
  const sorted = [...rows]
    .map((row) => ({ label: row.label, value: compositionValue(row, metric) }))
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);
  if (sorted.length <= limit) return sorted;

  const visible = sorted.slice(0, limit - 1);
  return [...visible, {
    label: "Other",
    value: sorted.slice(limit - 1).reduce((sum, row) => sum + row.value, 0),
  }];
}

function DonutCard({
  rows,
  metric,
  rangeLabel,
}: {
  rows: AnalyticsBreakdownRow[];
  metric: AnalyticsPrimaryMetric;
  rangeLabel: string;
}) {
  const data = withOther(rows, metric);
  const total = data.reduce((sum, row) => sum + row.value, 0);
  let cursor = 0;
  const stops = data.map((row, index) => {
    const start = cursor;
    cursor += total ? (row.value / total) * 100 : 0;
    return `var(--chart-${Math.min(index + 1, 6)}) ${start.toFixed(2)}% ${cursor.toFixed(2)}%`;
  });
  const background = total ? `conic-gradient(${stops.join(", ")})` : "var(--surface-subtle)";
  const noun = metric === "scanUsage" ? "scan starters" : metric === "pageViews" ? "page views" : "visitors";

  return (
    <article className={styles.visualCard} aria-labelledby="source-composition-title">
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.kicker}>Composition</p>
          <h3 id="source-composition-title">{metric === "scanUsage" ? "Scan starters by source" : `${METRIC_LABELS[metric]} by source`}</h3>
        </div>
        <span>{rangeLabel}</span>
      </header>

      {total ? (
        <div className={styles.donutLayout}>
          <div
            aria-label={`${total.toLocaleString()} ${noun} split across ${data.length} traffic-source groups`}
            className={styles.donut}
            role="img"
            style={{ background }}
          >
            <div className={styles.donutHole}>
              <strong>{total.toLocaleString()}</strong>
              <span>{noun}</span>
            </div>
          </div>
          <div className={styles.donutLegend}>
            {data.map((row, index) => {
              const share = total ? Math.round((row.value / total) * 100) : 0;
              return (
                <div className={styles.legendRow} key={row.label}>
                  <span
                    aria-hidden="true"
                    className={styles.legendSwatch}
                    style={{ "--swatch": `var(--chart-${Math.min(index + 1, 6)})` } as CSSProperties}
                  />
                  <span className={styles.legendName}>{row.label}</span>
                  <strong>{share}%</strong>
                </div>
              );
            })}
          </div>
        </div>
      ) : <p className={styles.empty}>No source data in this view yet.</p>}
    </article>
  );
}

function BarCard({
  rows,
  metric,
  rangeLabel,
}: {
  rows: AnalyticsBreakdownRow[];
  metric: AnalyticsPrimaryMetric;
  rangeLabel: string;
}) {
  const data = useMemo(() => [...rows]
    .sort((a, b) => breakdownValue(b, metric) - breakdownValue(a, metric))
    .slice(0, 7), [rows, metric]);
  const max = metric === "scanUsage" ? 100 : Math.max(1, ...data.map((row) => breakdownValue(row, metric)));

  return (
    <article className={styles.visualCard} aria-labelledby="country-ranking-title">
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.kicker}>Ranking</p>
          <h3 id="country-ranking-title">{metric === "scanUsage" ? "Scan rate by country" : `Top countries · ${METRIC_LABELS[metric]}`}</h3>
        </div>
        <span>{rangeLabel}</span>
      </header>

      {data.length ? (
        <div className={styles.barList}>
          {data.map((row, index) => {
            const value = breakdownValue(row, metric);
            const width = metric === "scanUsage" ? value : (value / max) * 100;
            return (
              <div className={styles.barRow} key={row.label}>
                <div className={styles.barLabel}>
                  <span className={styles.rank}>{index + 1}</span>
                  <span title={row.label}>{row.label.replace(/\s*\([A-Z]{2}\)$/, "")}</span>
                  <strong>{metric === "scanUsage" ? `${value}%` : value.toLocaleString()}</strong>
                </div>
                <div className={styles.barTrack} aria-hidden="true">
                  <span style={{ width: `${Math.max(value ? 3 : 0, Math.min(100, width))}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      ) : <p className={styles.empty}>No country data in this view yet.</p>}
    </article>
  );
}

function ActivityHeatmap({ report }: { report: AnalyticsReport }) {
  const days = report.activityDays;
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const max = Math.max(0, ...days.map((day) => day.count));
  const thresholds = [
    Math.max(1, Math.ceil(max * .25)),
    Math.max(2, Math.ceil(max * .5)),
    Math.max(3, Math.ceil(max * .75)),
  ];
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const selected = selectedDate ? days.find((day) => day.date === selectedDate) ?? null : null;

  function level(count: number) {
    if (!count) return 0;
    if (count <= thresholds[0]) return 1;
    if (count <= thresholds[1]) return 2;
    if (count <= thresholds[2]) return 3;
    return 4;
  }

  return (
    <article className={styles.heatmapCard} aria-labelledby="activity-rhythm-title">
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.kicker}>Rhythm</p>
          <h3 id="activity-rhythm-title">All-time visitor activity</h3>
        </div>
        <span>{days.length ? `${days.length} days` : "No history"}</span>
      </header>

      {days.length ? (
        <>
          <div className={styles.heatmapSummary}>
            <div>
              <strong>{total.toLocaleString()}</strong>
              <span>daily unique-visitor counts across recorded history</span>
            </div>
            {selected ? (
              <p aria-live="polite"><strong>{selected.count.toLocaleString()}</strong> visitors · {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${selected.date}T12:00:00Z`))}</p>
            ) : <p>Select a square for the exact day.</p>}
          </div>

          <div className={styles.heatmapScroller} tabIndex={0}>
            <div
              aria-label="Daily unique visitors across all recorded history"
              className={styles.heatmap}
              role="grid"
            >
              {days.map((day) => (
                <button
                  aria-label={`${day.date}: ${day.count} unique ${day.count === 1 ? "visitor" : "visitors"}`}
                  aria-pressed={selectedDate === day.date}
                  className={styles.heatCell}
                  data-level={level(day.count)}
                  key={day.date}
                  onClick={() => setSelectedDate((current) => current === day.date ? null : day.date)}
                  title={`${day.date} · ${day.count.toLocaleString()} visitors`}
                  type="button"
                />
              ))}
            </div>
          </div>

          <div className={styles.heatLegend} aria-label="Activity intensity">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((item) => <i aria-hidden="true" data-level={item} key={item} />)}
            <span>More</span>
          </div>
        </>
      ) : <p className={styles.empty}>Daily activity will appear once visitor history is available.</p>}
    </article>
  );
}

function sortValue(row: AnalyticsReport["trend"][number], key: SortKey) {
  if (key === "period") return row.label;
  if (key === "scanUsage") return row.visitors ? (row.scanStarters / row.visitors) * 100 : 0;
  return row[key];
}

function TrendTable({ report }: { report: AnalyticsReport }) {
  const [sortKey, setSortKey] = useState<SortKey>("period");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  const sorted = useMemo(() => [...report.trend].sort((a, b) => {
    const left = sortValue(a, sortKey);
    const right = sortValue(b, sortKey);
    const result = typeof left === "string" && typeof right === "string"
      ? left.localeCompare(right)
      : Number(left) - Number(right);
    return direction === "asc" ? result : -result;
  }), [direction, report.trend, sortKey]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function chooseSort(key: SortKey) {
    if (key === sortKey) setDirection((current) => current === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setDirection(key === "period" ? "desc" : "desc");
    }
    setPage(1);
  }

  function SortIcon({ column }: { column: SortKey }) {
    if (column !== sortKey) return <CaretUpDown aria-hidden="true" size={13} />;
    return direction === "asc"
      ? <CaretUp aria-hidden="true" size={13} />
      : <CaretDown aria-hidden="true" size={13} />;
  }

  const columns: Array<{ key: SortKey; label: string }> = [
    { key: "period", label: "Period" },
    { key: "visitors", label: "Visitors" },
    { key: "pageViews", label: "Views" },
    { key: "scanStarters", label: "Scan starters" },
    { key: "scanStarts", label: "Scan actions" },
    { key: "scanUsage", label: "Scan usage" },
  ];

  return (
    <article className={styles.tableCard} aria-labelledby="exact-data-title">
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.kicker}>Exact data</p>
          <h3 id="exact-data-title">Trend periods</h3>
        </div>
        <span>{report.trend.length.toLocaleString()} periods</span>
      </header>

      {report.trend.length ? (
        <>
          <div className={styles.tableScroller} tabIndex={0}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>Sortable trend data for {report.filters.rangeLabel.toLowerCase()}</caption>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} scope="col">
                      <button
                        aria-label={`Sort by ${column.label}`}
                        onClick={() => chooseSort(column.key)}
                        type="button"
                      >
                        <span>{column.label}</span>
                        <SortIcon column={column.key} />
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => {
                  const usage = row.visitors ? Math.round((row.scanStarters / row.visitors) * 100) : 0;
                  return (
                    <tr key={row.label}>
                      <th scope="row">{displayTrendLabel(row.label, report.filters.granularity)}</th>
                      <td>{row.visitors.toLocaleString()}</td>
                      <td>{row.pageViews.toLocaleString()}</td>
                      <td>{row.scanStarters.toLocaleString()}</td>
                      <td>{row.scanStarts.toLocaleString()}</td>
                      <td>{row.visitors ? `${usage}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pageCount > 1 ? (
            <nav className={styles.pagination} aria-label="Trend table pages">
              <button disabled={currentPage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button">Previous</button>
              <div aria-live="polite">Page <strong>{currentPage}</strong> of {pageCount}</div>
              <button disabled={currentPage >= pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} type="button">Next</button>
            </nav>
          ) : null}
        </>
      ) : <p className={styles.empty}>No exact trend rows are available for this view.</p>}
    </article>
  );
}

export function AnalyticsInsightsSuite({
  report,
  breakdowns,
  activeMetric,
}: {
  report: AnalyticsReport;
  breakdowns: AnalyticsMetricBreakdowns;
  activeMetric: AnalyticsPrimaryMetric;
}) {
  return (
    <>
      <section className={styles.section} aria-labelledby="analytics-breakdown-visuals-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Breakdowns</p>
            <h2 id="analytics-breakdown-visuals-title">Where activity comes from</h2>
          </div>
          <span>{METRIC_LABELS[activeMetric]} · {report.filters.rangeLabel}</span>
        </div>
        <div className={styles.visualGrid}>
          <DonutCard metric={activeMetric} rangeLabel={report.filters.rangeLabel} rows={breakdowns.referrers} />
          <BarCard metric={activeMetric} rangeLabel={report.filters.rangeLabel} rows={breakdowns.countries} />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="activity-history-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>History</p>
            <h2 id="activity-history-title">Activity across time</h2>
          </div>
          <span>Daily visitor rhythm</span>
        </div>
        <ActivityHeatmap report={report} />
      </section>

      <section className={styles.section} aria-labelledby="trend-data-section-title">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.kicker}>Inspect</p>
            <h2 id="trend-data-section-title">Exact trend data</h2>
          </div>
          <span>Sortable · paginated</span>
        </div>
        <TrendTable report={report} />
      </section>
    </>
  );
}

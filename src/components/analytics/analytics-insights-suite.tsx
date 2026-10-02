"use client";

import { useEffect, useMemo, useState } from "react";

import { ActivityHeatmap } from "../arc/activity-heatmap/activity-heatmap";
import { DonutChart, type DonutChartDatum } from "../arc/donut-chart/donut-chart";
import { Pagination } from "../arc/pagination/pagination";
import {
  SortableDataTable,
  type DataColumn,
  type SortState,
} from "../arc/sortable-data-table/sortable-data-table";
import { AnalyticsBreakdownCard } from "./analytics-breakdown-card";
import type { AnalyticsBreakdownRow, AnalyticsMetricBreakdowns } from "@/lib/analytics/breakdown-types";
import type { AnalyticsReport } from "@/lib/analytics/report";
import type { AnalyticsPrimaryMetric } from "./analytics-trend-chart";

import styles from "./analytics-insights-suite.module.css";

const METRIC_LABELS: Record<AnalyticsPrimaryMetric, string> = {
  visitors: "Visitors",
  pageViews: "Page views",
  scanUsage: "Scan usage",
};

function compositionValue(row: AnalyticsBreakdownRow, metric: AnalyticsPrimaryMetric) {
  if (metric === "pageViews") return row.pageViews;
  if (metric === "scanUsage") return row.scanStarters;
  return row.visitors;
}

function displayTrendLabel(value: string, granularity: AnalyticsReport["filters"]["granularity"]) {
  if (granularity === "week") {
    const [year, week] = value.split("-W");
    return "Week " + (week ?? value) + (year ? " · " + year : "");
  }

  const date = new Date(granularity === "hour" ? value.replace(" ", "T") + ":00Z" : value + "T12:00:00Z");
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", granularity === "hour"
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }
    : { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function SourceComposition({
  rows,
  metric,
  rangeLabel,
}: {
  rows: AnalyticsBreakdownRow[];
  metric: AnalyticsPrimaryMetric;
  rangeLabel: string;
}) {
  const data = useMemo<DonutChartDatum[]>(() => rows
    .map((row) => ({
      key: row.label,
      label: row.label,
      value: compositionValue(row, metric),
    }))
    .filter((row) => row.value > 0), [metric, rows]);

  const unit = metric === "scanUsage" ? "scan starters" : metric === "pageViews" ? "page views" : "visitors";
  const label = metric === "scanUsage" ? "Scan starters by traffic source" : METRIC_LABELS[metric] + " by traffic source";

  return (
    <article className={styles.visualCard} aria-labelledby="source-composition-title">
      <header className={styles.cardHeader}>
        <div>
          <p className={styles.kicker}>Composition</p>
          <h3 id="source-composition-title">Traffic sources</h3>
        </div>
        <span>{rangeLabel}</span>
      </header>
      <div className={styles.arcBody}>
        <DonutChart
          data={data}
          emptyLabel="No source data in this view yet"
          groupBelow={0.035}
          label={label}
          legend
          legendAction="select"
          maxSegments={6}
          otherLabel="Other sources"
          size={196}
          thickness={23}
          totalLabel={METRIC_LABELS[metric]}
          unit={unit}
        />
      </div>
    </article>
  );
}

export function AnalyticsBreakdownVisuals({
  report,
  breakdowns,
  activeMetric,
}: {
  report: AnalyticsReport;
  breakdowns: AnalyticsMetricBreakdowns;
  activeMetric: AnalyticsPrimaryMetric;
}) {
  return (
    <section className={styles.section + " " + styles.arcTheme} aria-labelledby="analytics-breakdown-visuals-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Breakdowns</p>
          <h2 id="analytics-breakdown-visuals-title">Where activity comes from</h2>
        </div>
        <span>{METRIC_LABELS[activeMetric]} · {report.filters.rangeLabel}</span>
      </div>
      <div className={styles.visualGrid}>
        <SourceComposition metric={activeMetric} rangeLabel={report.filters.rangeLabel} rows={breakdowns.referrers} />
        <AnalyticsBreakdownCard
          activeMetric={activeMetric}
          kind="country"
          rangeLabel={report.filters.rangeLabel}
          rows={breakdowns.countries}
          title="Countries"
        />
      </div>
    </section>
  );
}

export function AnalyticsActivityHistory({ report }: { report: AnalyticsReport }) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const period = report.activityDays.length
    ? (report.activityDays[0]?.date ?? "") + " to " + (report.activityDays.at(-1)?.date ?? "")
    : "recorded history";

  useEffect(() => {
    setSelectedDate(null);
  }, [report.filters.segment, report.filters.value]);

  return (
    <section className={styles.section + " " + styles.arcTheme} aria-labelledby="activity-history-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>History</p>
          <h2 id="activity-history-title">Activity across time</h2>
        </div>
        <span>All recorded history · daily visitors</span>
      </div>
      <article className={styles.heatmapCard}>
        <div className={styles.arcBody}>
          <ActivityHeatmap
            days={report.activityDays}
            label="Daily unique visitor activity"
            locale="en-GB"
            onSelectDate={setSelectedDate}
            period={period}
            selectedDate={selectedDate}
            unit={{ one: "visitor", other: "visitors" }}
            weekStartsOn={1}
          />
        </div>
      </article>
    </section>
  );
}

type TrendTableRow = Record<string, unknown> & {
  period: string;
  visitors: number;
  pageViews: number;
  scanStarters: number;
  scanStarts: number;
  scanUsage: number;
};

function exactRows(report: AnalyticsReport): TrendTableRow[] {
  return report.trend.map((row) => ({
    period: row.label,
    visitors: row.visitors,
    pageViews: row.pageViews,
    scanStarters: row.scanStarters,
    scanStarts: row.scanStarts,
    scanUsage: row.visitors ? Math.round((row.scanStarters / row.visitors) * 100) : 0,
  }));
}

export function AnalyticsTrendData({ report }: { report: AnalyticsReport }) {
  const allRows = useMemo(() => exactRows(report), [report]);
  const [sort, setSort] = useState<SortState>({ key: "period", direction: "desc" });
  const [page, setPage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    setPage(1);
  }, [report.filters.range, report.filters.from, report.filters.to, report.filters.segment, report.filters.value]);

  const sortedRows = useMemo(() => {
    const rows = [...allRows];
    const direction = sort.direction === "asc" ? 1 : -1;
    return rows.sort((a, b) => {
      const left = a[sort.key];
      const right = b[sort.key];
      if (typeof left === "number" && typeof right === "number") return (left - right) * direction;
      return String(left ?? "").localeCompare(String(right ?? ""), "en", { numeric: true }) * direction;
    });
  }, [allRows, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const rows = sortedRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const columns = useMemo<DataColumn<TrendTableRow>[]>(() => [
    {
      key: "period",
      label: "Period",
      sortable: true,
      render: (value) => displayTrendLabel(String(value ?? ""), report.filters.granularity),
    },
    { key: "visitors", label: "Visitors", sortable: true, numeric: true },
    { key: "pageViews", label: "Views", sortable: true, numeric: true },
    { key: "scanStarters", label: "Scan starters", sortable: true, numeric: true },
    { key: "scanStarts", label: "Scan actions", sortable: true, numeric: true },
    {
      key: "scanUsage",
      label: "Scan usage",
      sortable: true,
      numeric: true,
      render: (value, row) => row.visitors ? Number(value).toLocaleString() + "%" : "—",
    },
  ], [report.filters.granularity]);

  return (
    <section className={styles.section + " " + styles.arcTheme} aria-labelledby="trend-data-section-title">
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.kicker}>Inspect</p>
          <h2 id="trend-data-section-title">Exact trend data</h2>
        </div>
        <span>Sortable · {report.trend.length.toLocaleString()} periods</span>
      </div>
      <article className={styles.tableCard}>
        <div className={styles.tableBody}>
          <SortableDataTable
            caption={"Exact analytics periods for " + report.filters.rangeLabel}
            columns={columns}
            defaultSort={{ key: "period", direction: "desc" }}
            emptyMessage="No exact trend rows are available for this view."
            itemName={{ one: "period", other: "periods" }}
            onSortChange={(next) => {
              setSort(next);
              setPage(1);
            }}
            rowKey="period"
            rows={rows}
          />
        </div>
        {pageCount > 1 ? (
          <div className={styles.paginationWrap}>
            <Pagination
              label="Trend data pages"
              onPageChange={setPage}
              page={currentPage}
              pageCount={pageCount}
            />
          </div>
        ) : null}
      </article>
    </section>
  );
}

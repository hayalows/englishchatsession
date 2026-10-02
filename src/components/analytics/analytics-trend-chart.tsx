"use client";

import { useMemo, useState } from "react";

import {
  LineChart,
  type LineChartDatum,
  type LineChartSeries,
} from "@/components/arc/line-chart/line-chart";
import type { AnalyticsComparison } from "@/lib/analytics/comparison";
import type { AnalyticsReport } from "@/lib/analytics/report";

import styles from "./analytics-trend-chart.module.css";

type TrendRow = AnalyticsReport["trend"][number];
type Granularity = AnalyticsReport["filters"]["granularity"];
export type AnalyticsPrimaryMetric = "visitors" | "pageViews" | "scanUsage";
type DeltaTone = "positive" | "negative" | "neutral" | "pending";
type Delta = { text: string; tone: DeltaTone; title: string };

const METRICS: Array<{ key: AnalyticsPrimaryMetric; label: string; valueLabel: string }> = [
  { key: "visitors", label: "Visitors", valueLabel: "visitors" },
  { key: "pageViews", label: "Page views", valueLabel: "page views" },
  { key: "scanUsage", label: "Scan usage", valueLabel: "scan usage" },
];

const compactNumber = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function scanUsage(row: TrendRow) {
  return row.visitors
    ? Math.max(0, Math.min(100, Math.round((row.scanStarters / row.visitors) * 100)))
    : 0;
}

function metricValue(row: TrendRow, metric: AnalyticsPrimaryMetric) {
  if (metric === "scanUsage") return scanUsage(row);
  return row[metric];
}

function countDelta(current: number, previous: number, ready: boolean, comparisonLabel: string): Delta {
  if (!ready) return {
    text: "—",
    tone: "pending",
    title: `Comparison with ${comparisonLabel} is still building`,
  };
  if (previous === 0 && current === 0) return {
    text: "0%",
    tone: "neutral",
    title: `No change vs ${comparisonLabel}`,
  };
  if (previous === 0) return {
    text: "New",
    tone: "positive",
    title: `${current.toLocaleString()} now, no recorded value in ${comparisonLabel}`,
  };

  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return {
    text: "0%",
    tone: "neutral",
    title: `No change vs ${comparisonLabel}`,
  };
  return {
    text: `${change > 0 ? "+" : "−"}${Math.abs(change)}%`,
    tone: change > 0 ? "positive" : "negative",
    title: `${Math.abs(change)}% ${change > 0 ? "higher" : "lower"} than ${comparisonLabel}`,
  };
}

function rateDelta(
  current: number,
  previous: number,
  previousVisitors: number,
  ready: boolean,
  comparisonLabel: string,
): Delta {
  if (!ready) return {
    text: "—",
    tone: "pending",
    title: `Scan-usage comparison with ${comparisonLabel} is still building`,
  };
  if (!previousVisitors) return current > 0
    ? {
      text: "New",
      tone: "positive",
      title: `Scan usage recorded now, with no visitor baseline in ${comparisonLabel}`,
    }
    : {
      text: "—",
      tone: "pending",
      title: `No visitor baseline in ${comparisonLabel}`,
    };

  const change = current - previous;
  if (change === 0) return {
    text: "0 pts",
    tone: "neutral",
    title: `No scan-usage change vs ${comparisonLabel}`,
  };
  return {
    text: `${change > 0 ? "+" : "−"}${Math.abs(change)} pts`,
    tone: change > 0 ? "positive" : "negative",
    title: `Scan usage is ${Math.abs(change)} percentage points ${change > 0 ? "higher" : "lower"} than ${comparisonLabel}`,
  };
}

function displayTrendLabel(value: string, granularity: Granularity, compact = false) {
  if (granularity === "week") {
    const [year, week] = value.split("-W");
    return compact ? `W${week ?? value}` : `Week ${week ?? value}${year ? ` · ${year}` : ""}`;
  }

  const date = new Date(granularity === "hour" ? `${value.replace(" ", "T")}:00Z` : `${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;

  if (compact && granularity === "hour") {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    }).format(date);
  }

  return new Intl.DateTimeFormat("en-GB", granularity === "hour"
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }
    : compact
      ? { day: "numeric", month: "short", timeZone: "UTC" }
      : { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function displayReadyAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function DeltaBadge({ delta }: { delta: Delta }) {
  return (
    <span className={`${styles.delta} ${styles[delta.tone]}`} title={delta.title} aria-label={delta.title}>
      {delta.text}
    </span>
  );
}

export function AnalyticsTrendChart({
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
  const granularity = report.filters.granularity;
  const metrics = report.metrics;
  const [activeDatum, setActiveDatum] = useState<LineChartDatum | null>(null);

  const comparisonDisabled = report.filters.range === "all";
  const visitorsDelta = comparisonDisabled
    ? { text: "—", tone: "pending" as const, title: "No prior-period comparison for All time" }
    : countDelta(metrics.visitors, comparison.previous.visitors, comparison.audienceReady, comparison.label);
  const viewsDelta = comparisonDisabled
    ? { text: "—", tone: "pending" as const, title: "No prior-period comparison for All time" }
    : countDelta(metrics.pageViews, comparison.previous.pageViews, comparison.audienceReady, comparison.label);
  const scanUsageDelta = comparisonDisabled
    ? { text: "—", tone: "pending" as const, title: "No prior-period comparison for All time" }
    : rateDelta(
      metrics.scanStartRate,
      comparison.previous.scanStartRate,
      comparison.previous.visitors,
      comparison.scanReady,
      comparison.label,
    );

  const active = METRICS.find((metric) => metric.key === activeMetric) ?? METRICS[0];

  const chartData = useMemo<LineChartDatum[]>(() => rows.map((row) => ({
    key: row.label,
    label: displayTrendLabel(row.label, granularity),
    axisLabel: displayTrendLabel(row.label, granularity, true),
    values: { value: metricValue(row, activeMetric) },
  })), [activeMetric, granularity, rows]);

  const series = useMemo<LineChartSeries[]>(() => [{
    key: "value",
    label: active.label,
    area: true,
  }], [active.label]);

  const selected = activeDatum ?? chartData.at(-1) ?? null;
  const selectedValue = selected?.values.value ?? 0;
  const selectedValueText = activeMetric === "scanUsage"
    ? `${Math.round(selectedValue)}%`
    : Math.round(selectedValue).toLocaleString();
  const selectedValueWithLabel = activeMetric === "scanUsage"
    ? `${selectedValueText} scan usage`
    : `${selectedValueText} ${active.valueLabel}`;
  const activeComparisonReady = activeMetric === "scanUsage" ? comparison.scanReady : comparison.audienceReady;
  const activeComparisonReadyAt = activeMetric === "scanUsage" ? comparison.scanReadyAt : comparison.audienceReadyAt;

  function chooseMetric(metric: AnalyticsPrimaryMetric) {
    setActiveDatum(null);
    onMetricChange(metric);
  }

  return (
    <div className={styles.chartExperience}>
      <div className={styles.summaryStrip} aria-label="Chart metric">
        <button
          aria-pressed={activeMetric === "visitors"}
          className={`${styles.summaryCell} ${styles.summaryButton}`}
          onClick={() => chooseMetric("visitors")}
          type="button"
        >
          <span className={styles.summaryTopline}><span className={styles.summaryLabel}>Visitors</span><DeltaBadge delta={visitorsDelta} /></span>
          <strong>{metrics.visitors.toLocaleString()}</strong>
          <small>Unique anonymous visitors</small>
        </button>

        <button
          aria-pressed={activeMetric === "pageViews"}
          className={`${styles.summaryCell} ${styles.summaryButton}`}
          onClick={() => chooseMetric("pageViews")}
          type="button"
        >
          <span className={styles.summaryTopline}><span className={styles.summaryLabel}>Page views</span><DeltaBadge delta={viewsDelta} /></span>
          <strong>{metrics.pageViews.toLocaleString()}</strong>
          <small>Recorded finder opens</small>
        </button>

        <button
          aria-pressed={activeMetric === "scanUsage"}
          className={`${styles.summaryCell} ${styles.summaryButton}`}
          onClick={() => chooseMetric("scanUsage")}
          type="button"
        >
          <span className={styles.summaryTopline}><span className={styles.summaryLabel}>Scan usage</span><DeltaBadge delta={scanUsageDelta} /></span>
          <strong>{metrics.visitors ? `${metrics.scanStartRate}%` : "—"}</strong>
          <small>Visitors who started a scan</small>
        </button>
      </div>

      {!comparisonDisabled && !activeComparisonReady ? (
        <p className={styles.baselineNote} role="status">
          <span>Baseline building</span>
          <span aria-hidden="true">·</span>
          <span>Comparison begins {displayReadyAt(activeComparisonReadyAt)}</span>
        </p>
      ) : null}

      <div className={styles.chartContext} aria-live="polite">
        <span><strong>{active.label}</strong>{selected ? ` · ${selected.label}` : ""}</span>
        <strong>{selectedValueWithLabel}</strong>
      </div>

      <div className={styles.arcChartShell}>
        <LineChart
          categoryLabel={granularity === "hour" ? "Hour" : granularity === "week" ? "Week" : "Date"}
          curve="smooth"
          data={chartData}
          formatTick={(value) => activeMetric === "scanUsage" ? `${Math.round(value)}%` : compactNumber.format(value)}
          formatValue={(value) => activeMetric === "scanUsage" ? `${Math.round(value)}%` : Math.round(value).toLocaleString()}
          height={250}
          label={`${active.label} over time`}
          legend={false}
          onActiveChange={(_, datum) => setActiveDatum(datum)}
          series={series}
        />
      </div>

      <p className={styles.chartHint}>Hover, tap, or use arrow keys for exact values.</p>
    </div>
  );
}

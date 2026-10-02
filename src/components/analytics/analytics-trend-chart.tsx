"use client";

import { useMemo, useState } from "react";

import {
  LineChart,
  type LineChartDatum,
  type LineChartSeries,
} from "../arc/line-chart/line-chart";
import Sparkline from "../arc/sparkline/sparkline";
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

function comparisonMetricValue(row: AnalyticsComparison["trend"][number] | undefined, metric: AnalyticsPrimaryMetric) {
  if (!row) return 0;
  if (metric === "scanUsage") {
    return row.visitors ? Math.max(0, Math.min(100, Math.round((row.scanStarters / row.visitors) * 100))) : 0;
  }
  return metric === "visitors" ? row.visitors : row.pageViews;
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
  const [compareEnabled, setCompareEnabled] = useState(true);

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

  const activeComparisonReady = activeMetric === "scanUsage" ? comparison.scanReady : comparison.audienceReady;
  const activeComparisonReadyAt = activeMetric === "scanUsage" ? comparison.scanReadyAt : comparison.audienceReadyAt;
  const canCompare = !comparisonDisabled && activeComparisonReady && comparison.trend.length > 0;

  const chartData = useMemo<LineChartDatum[]>(() => rows.map((row, index) => ({
    key: row.label,
    label: displayTrendLabel(row.label, granularity),
    axisLabel: displayTrendLabel(row.label, granularity, true),
    values: {
      current: metricValue(row, activeMetric),
      previous: comparisonMetricValue(comparison.trend[index], activeMetric),
    },
  })), [activeMetric, comparison.trend, granularity, rows]);

  const series = useMemo<LineChartSeries[]>(() => {
    const current: LineChartSeries = {
      key: "current",
      label: active.label,
      area: true,
    };
    if (!compareEnabled || !canCompare) return [current];
    return [
      current,
      {
        key: "previous",
        label: comparison.label,
        dashed: true,
        area: false,
      },
    ];
  }, [active.label, canCompare, compareEnabled, comparison.label]);

  const selected = activeDatum ?? chartData.at(-1) ?? null;
  const selectedValue = selected?.values.current ?? 0;
  const selectedPreviousValue = selected?.values.previous ?? 0;
  const selectedValueText = activeMetric === "scanUsage"
    ? `${Math.round(selectedValue)}%`
    : Math.round(selectedValue).toLocaleString();
  const selectedValueWithLabel = activeMetric === "scanUsage"
    ? `${selectedValueText} scan usage`
    : `${selectedValueText} ${active.valueLabel}`;
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
          <span className={styles.sparklineSlot} aria-hidden="true"><Sparkline area data={rows.map((row) => metricValue(row, "visitors"))} height={32} interactive={false} label="Visitor trend" width={120} /></span>
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
          <span className={styles.sparklineSlot} aria-hidden="true"><Sparkline area data={rows.map((row) => metricValue(row, "pageViews"))} height={32} interactive={false} label="Page view trend" width={120} /></span>
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
          <span className={styles.sparklineSlot} aria-hidden="true"><Sparkline area data={rows.map((row) => metricValue(row, "scanUsage"))} height={32} interactive={false} label="Scan usage trend" width={120} /></span>
        </button>
      </div>

      {!comparisonDisabled && !activeComparisonReady ? (
        <p className={styles.baselineNote} role="status">
          <span>Baseline building</span>
          <span aria-hidden="true">·</span>
          <span>Comparison begins {displayReadyAt(activeComparisonReadyAt)}</span>
        </p>
      ) : null}

      <div className={styles.chartContext}>
        <div className={styles.chartReadout} aria-live="polite">
          <span><strong>{active.label}</strong>{selected ? " · " + selected.label : ""}</span>
          <strong>{selectedValueWithLabel}</strong>
          {compareEnabled && canCompare ? (
            <small>
              {comparison.label}: {activeMetric === "scanUsage" ? Math.round(selectedPreviousValue) + "%" : Math.round(selectedPreviousValue).toLocaleString()}
            </small>
          ) : null}
        </div>
        <button
          aria-pressed={compareEnabled && canCompare}
          className={styles.compareButton}
          disabled={!canCompare}
          onClick={() => setCompareEnabled((current) => !current)}
          title={canCompare ? "Overlay the matching previous period" : comparisonDisabled ? "All time has no previous period" : "Previous-period baseline is still building"}
          type="button"
        >
          Compare
        </button>
      </div>

      <div className={styles.arcChartShell}>
        <LineChart
          categoryLabel={granularity === "hour" ? "Hour" : granularity === "week" ? "Week" : "Date"}
          curve="smooth"
          data={chartData}
          formatTick={(value) => activeMetric === "scanUsage" ? `${Math.round(value)}%` : compactNumber.format(value)}
          formatValue={(value) => activeMetric === "scanUsage" ? `${Math.round(value)}%` : Math.round(value).toLocaleString()}
          height={250}
          label={active.label + " over time"}
          legend={compareEnabled && canCompare}
          onActiveChange={(_, datum) => setActiveDatum(datum)}
          series={series}
        />
      </div>

      <p className={styles.chartHint}>Hover, tap, or use arrow keys for exact values.</p>
    </div>
  );
}

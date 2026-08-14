"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { AnalyticsComparison } from "@/lib/analytics/comparison";
import type { AnalyticsReport } from "@/lib/analytics/report";

import styles from "./analytics-trend-chart.module.css";

type TrendRow = AnalyticsReport["trend"][number];
type Granularity = AnalyticsReport["filters"]["granularity"];
type MetricKey = "visitors" | "pageViews";
type DeltaTone = "positive" | "negative" | "neutral" | "pending";
type Delta = { text: string; tone: DeltaTone; title: string };

type Point = TrendRow & {
  x: number;
  y: number;
};

const ACTIVE_NOW_WINDOW_SECONDS = 90;
const WIDTH = 880;
const HEIGHT = 270;
const PADDING = { top: 22, right: 22, bottom: 40, left: 40 };

const METRICS: Array<{ key: MetricKey; label: string; valueLabel: string }> = [
  { key: "visitors", label: "Visitors", valueLabel: "visitors" },
  { key: "pageViews", label: "Page views", valueLabel: "page views" },
];

function metricValue(row: TrendRow, metric: MetricKey) {
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
  if (!ready || !previousVisitors) return {
    text: "—",
    tone: "pending",
    title: `Scan-rate comparison with ${comparisonLabel} is still building`,
  };

  const change = current - previous;
  if (change === 0) return {
    text: "0 pts",
    tone: "neutral",
    title: `No scan-start-rate change vs ${comparisonLabel}`,
  };
  return {
    text: `${change > 0 ? "+" : "−"}${Math.abs(change)} pts`,
    tone: change > 0 ? "positive" : "negative",
    title: `Scan-start rate is ${Math.abs(change)} percentage points ${change > 0 ? "higher" : "lower"} than ${comparisonLabel}`,
  };
}

function displayTrendLabel(value: string, granularity: Granularity, compact = false) {
  if (granularity === "week") {
    const [year, week] = value.split("-W");
    return compact ? `W${week ?? value}` : `Week ${week ?? value}${year ? ` · ${year}` : ""}`;
  }

  const date = new Date(granularity === "hour" ? `${value.replace(" ", "T")}:00Z` : `${value}T12:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;

  return new Intl.DateTimeFormat("en-GB", granularity === "hour"
    ? { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }
    : { day: "numeric", month: "short", timeZone: "UTC" }).format(date);
}

function smoothPath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const midpoint = (current.x + next.x) / 2;
    path += ` C ${midpoint} ${current.y}, ${midpoint} ${next.y}, ${next.x} ${next.y}`;
  }
  return path;
}

function uniqueTicks(max: number) {
  return Array.from(new Set([max, Math.round(max / 2), 0])).sort((a, b) => b - a);
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
}: {
  report: AnalyticsReport;
  comparison: AnalyticsComparison;
}) {
  const rows = report.trend;
  const granularity = report.filters.granularity;
  const metrics = report.metrics;
  const gradientId = useId().replaceAll(":", "");
  const [activeMetric, setActiveMetric] = useState<MetricKey>("visitors");
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, rows.length - 1));

  const visitorsDelta = countDelta(metrics.visitors, comparison.previous.visitors, comparison.audienceReady, comparison.label);
  const viewsDelta = countDelta(metrics.pageViews, comparison.previous.pageViews, comparison.audienceReady, comparison.label);
  const scanRateChange = rateDelta(
    metrics.scanStartRate,
    comparison.previous.scanStartRate,
    comparison.previous.visitors,
    comparison.scanReady,
    comparison.label,
  );

  const geometry = useMemo(() => {
    const maxValue = Math.max(1, ...rows.map((row) => metricValue(row, activeMetric)));
    const chartWidth = WIDTH - PADDING.left - PADDING.right;
    const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const points: Point[] = rows.map((row, index) => {
      const x = rows.length === 1
        ? PADDING.left + chartWidth / 2
        : PADDING.left + (index / (rows.length - 1)) * chartWidth;
      return {
        ...row,
        x,
        y: PADDING.top + chartHeight - (metricValue(row, activeMetric) / maxValue) * chartHeight,
      };
    });

    const path = smoothPath(points.map((point) => ({ x: point.x, y: point.y })));
    const baseline = PADDING.top + chartHeight;
    const area = points.length
      ? `${path} L ${points.at(-1)?.x ?? PADDING.left} ${baseline} L ${points[0].x} ${baseline} Z`
      : "";

    return { maxValue, chartHeight, points, path, area, baseline };
  }, [activeMetric, rows]);

  if (!rows.length) return null;

  const clampedIndex = Math.min(selectedIndex, rows.length - 1);
  const selected = geometry.points[clampedIndex] ?? geometry.points.at(-1)!;
  const active = METRICS.find((metric) => metric.key === activeMetric) ?? METRICS[0];
  const selectedValue = metricValue(selected, activeMetric);
  const labelEvery = rows.length > 12 ? Math.ceil(rows.length / 6) : rows.length > 7 ? 2 : 1;

  function chooseMetric(metric: MetricKey) {
    setActiveMetric(metric);
    setSelectedIndex(Math.max(0, rows.length - 1));
  }

  function selectFromPointer(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / Math.max(1, rect.width)) * WIDTH;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    geometry.points.forEach((point, index) => {
      const distance = Math.abs(point.x - svgX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    setSelectedIndex(nearestIndex);
  }

  function handleKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    if (event.key === "Home") return setSelectedIndex(0);
    if (event.key === "End") return setSelectedIndex(rows.length - 1);
    setSelectedIndex((current) => {
      const next = event.key === "ArrowLeft" ? current - 1 : current + 1;
      return Math.max(0, Math.min(rows.length - 1, next));
    });
  }

  return (
    <div className={styles.chartExperience}>
      <div className={styles.summaryStrip} aria-label="Primary finder analytics">
        <div className={`${styles.summaryCell} ${styles.liveSummary}`}>
          <div className={styles.summaryLabel}><i className={styles.liveDot} aria-hidden="true" />Active now</div>
          <strong>{metrics.activeNowVisitors.toLocaleString()}</strong>
          <small>{metrics.activeNowSessions.toLocaleString()} visible sessions · last {ACTIVE_NOW_WINDOW_SECONDS}s</small>
        </div>

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
      </div>

      <div className={styles.chartContext} aria-live="polite">
        <span><strong>{active.label}</strong> · {displayTrendLabel(selected.label, granularity)}</span>
        <strong>{selectedValue.toLocaleString()} {active.valueLabel}</strong>
      </div>

      <div className={styles.chartFrame}>
        <svg
          aria-label={`Interactive ${active.label.toLowerCase()} line chart. ${displayTrendLabel(selected.label, granularity)} has ${selectedValue} ${active.valueLabel}. Use left and right arrow keys to inspect other periods.`}
          className={styles.chart}
          onKeyDown={handleKeyDown}
          onPointerDown={selectFromPointer}
          onPointerMove={selectFromPointer}
          role="img"
          tabIndex={0}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop className={styles.areaStopStrong} offset="0%" />
              <stop className={styles.areaStopSoft} offset="100%" />
            </linearGradient>
          </defs>

          {uniqueTicks(geometry.maxValue).map((tick) => {
            const y = PADDING.top + geometry.chartHeight - (tick / geometry.maxValue) * geometry.chartHeight;
            return (
              <g key={tick}>
                <line className={styles.gridLine} x1={PADDING.left} x2={WIDTH - PADDING.right} y1={y} y2={y} />
                <text className={styles.axisLabel} textAnchor="end" x={PADDING.left - 10} y={y + 4}>{tick}</text>
              </g>
            );
          })}

          <path className={styles.trendArea} d={geometry.area} fill={`url(#${gradientId})`} />
          <path className={styles.trendLine} d={geometry.path} fill="none" pathLength="1" />

          <line className={styles.selectionLine} x1={selected.x} x2={selected.x} y1={PADDING.top} y2={geometry.baseline} />
          <circle className={styles.trendPoint} cx={selected.x} cy={selected.y} r="5" />

          {geometry.points.map((point, index) => (
            index % labelEvery === 0 || index === rows.length - 1 ? (
              <text className={styles.dayLabel} key={`${point.label}-${index}`} textAnchor="middle" x={point.x} y={HEIGHT - 13}>
                {displayTrendLabel(point.label, granularity, true)}
              </text>
            ) : null
          ))}
        </svg>
      </div>

      <div className={styles.scanIntent}>
        <div>
          <span className={styles.scanIntentLabel}>Scan-start rate</span>
          <strong>{metrics.visitors ? `${metrics.scanStartRate}%` : "—"}</strong>
          <DeltaBadge delta={scanRateChange} />
        </div>
        <p>
          {metrics.visitors
            ? `${metrics.scanStarters.toLocaleString()} of ${metrics.visitors.toLocaleString()} visitors started a scan.`
            : "The share of visitors who started a scan will appear once visits are recorded."}
          {metrics.scanStarts ? ` ${metrics.scanStarts.toLocaleString()} total scan starts.` : ""}
        </p>
      </div>

      <p className={styles.chartHint}>Tap Visitors or Page views to switch the chart. Tap or move across the graph to inspect a point.</p>
    </div>
  );
}

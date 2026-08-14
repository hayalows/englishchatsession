"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { AnalyticsReport } from "@/lib/analytics/report";

import styles from "./analytics-trend-chart.module.css";

type TrendRow = AnalyticsReport["trend"][number];
type Granularity = AnalyticsReport["filters"]["granularity"];
type MetricKey = "visitors" | "pageViews" | "scanStarters";

type Point = TrendRow & {
  x: number;
  y: number;
};

const WIDTH = 880;
const HEIGHT = 292;
const PADDING = { top: 24, right: 24, bottom: 42, left: 42 };

const METRICS: Array<{ key: MetricKey; label: string; valueLabel: string }> = [
  { key: "visitors", label: "Visitors", valueLabel: "visitors" },
  { key: "pageViews", label: "Views", valueLabel: "views" },
  { key: "scanStarters", label: "Scan starters", valueLabel: "scan starters" },
];

function metricValue(row: TrendRow, metric: MetricKey) {
  return row[metric];
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

export function AnalyticsTrendChart({
  rows,
  granularity,
}: {
  rows: TrendRow[];
  granularity: Granularity;
}) {
  const gradientId = useId().replaceAll(":", "");
  const [activeMetric, setActiveMetric] = useState<MetricKey>("visitors");
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, rows.length - 1));

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
      <div className={styles.metricTabs} aria-label="Chart metric" role="group">
        {METRICS.map((metric) => (
          <button
            aria-pressed={activeMetric === metric.key}
            className={styles.metricTab}
            key={metric.key}
            onClick={() => chooseMetric(metric.key)}
            type="button"
          >
            {metric.label}
          </button>
        ))}
      </div>

      <div className={styles.chartReadout} aria-live="polite">
        <div>
          <span className={styles.chartReadoutLabel}>Selected period</span>
          <strong>{displayTrendLabel(selected.label, granularity)}</strong>
        </div>
        <div className={styles.selectedMetricValue}>
          <span>{active.label}</span>
          <strong>{selectedValue.toLocaleString()}</strong>
        </div>
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
              <text className={styles.dayLabel} key={`${point.label}-${index}`} textAnchor="middle" x={point.x} y={HEIGHT - 14}>
                {displayTrendLabel(point.label, granularity, true)}
              </text>
            ) : null
          ))}
        </svg>
      </div>

      <div className={styles.chartFooter}>
        <strong>{active.label}</strong>
        <p>Tap or move across the chart, or use ← →, to inspect values.</p>
      </div>
    </div>
  );
}

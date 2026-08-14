"use client";

import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";

import type { AnalyticsReport } from "@/lib/analytics/report";

import styles from "./analytics-dashboard.module.css";

type TrendRow = AnalyticsReport["trend"][number];
type Granularity = AnalyticsReport["filters"]["granularity"];

type Point = TrendRow & {
  x: number;
  visitorY: number;
  pageViewY: number;
  scanY: number;
};

const WIDTH = 880;
const HEIGHT = 292;
const PADDING = { top: 24, right: 24, bottom: 42, left: 42 };

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
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, rows.length - 1));

  const geometry = useMemo(() => {
    const maxValue = Math.max(
      1,
      ...rows.map((row) => row.visitors),
      ...rows.map((row) => row.pageViews),
      ...rows.map((row) => row.scanStarters),
    );
    const chartWidth = WIDTH - PADDING.left - PADDING.right;
    const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
    const points: Point[] = rows.map((row, index) => {
      const x = rows.length === 1
        ? PADDING.left + chartWidth / 2
        : PADDING.left + (index / (rows.length - 1)) * chartWidth;
      return {
        ...row,
        x,
        visitorY: PADDING.top + chartHeight - (row.visitors / maxValue) * chartHeight,
        pageViewY: PADDING.top + chartHeight - (row.pageViews / maxValue) * chartHeight,
        scanY: PADDING.top + chartHeight - (row.scanStarters / maxValue) * chartHeight,
      };
    });

    const visitorPath = smoothPath(points.map((point) => ({ x: point.x, y: point.visitorY })));
    const pageViewPath = smoothPath(points.map((point) => ({ x: point.x, y: point.pageViewY })));
    const scanPath = smoothPath(points.map((point) => ({ x: point.x, y: point.scanY })));
    const baseline = PADDING.top + chartHeight;
    const visitorArea = points.length
      ? `${visitorPath} L ${points.at(-1)?.x ?? PADDING.left} ${baseline} L ${points[0].x} ${baseline} Z`
      : "";

    return { maxValue, chartHeight, points, visitorPath, pageViewPath, scanPath, visitorArea, baseline };
  }, [rows]);

  if (!rows.length) return null;

  const clampedIndex = Math.min(selectedIndex, rows.length - 1);
  const selected = geometry.points[clampedIndex] ?? geometry.points.at(-1)!;
  const labelEvery = rows.length > 12 ? Math.ceil(rows.length / 6) : rows.length > 7 ? 2 : 1;

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
      <div className={styles.chartReadout} aria-live="polite">
        <div>
          <span className={styles.chartReadoutLabel}>Selected period</span>
          <strong>{displayTrendLabel(selected.label, granularity)}</strong>
        </div>
        <div className={styles.chartReadoutValues}>
          <span><i className={styles.readoutVisitor} aria-hidden="true" /><strong>{selected.visitors.toLocaleString()}</strong> visitors</span>
          <span><i className={styles.readoutView} aria-hidden="true" /><strong>{selected.pageViews.toLocaleString()}</strong> views</span>
          <span><i className={styles.readoutScan} aria-hidden="true" /><strong>{selected.scanStarters.toLocaleString()}</strong> scan starters</span>
        </div>
      </div>

      <div className={styles.chartFrame}>
        <svg
          aria-label={`Interactive line chart. ${displayTrendLabel(selected.label, granularity)} has ${selected.visitors} visitors, ${selected.pageViews} page views, and ${selected.scanStarters} scan starters. Use left and right arrow keys to inspect other periods.`}
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

          <path className={styles.trendArea} d={geometry.visitorArea} fill={`url(#${gradientId})`} />
          <path className={styles.viewLine} d={geometry.pageViewPath} fill="none" pathLength="1" />
          <path className={styles.trendLine} d={geometry.visitorPath} fill="none" pathLength="1" />
          <path className={styles.scanLine} d={geometry.scanPath} fill="none" pathLength="1" />

          <line className={styles.selectionLine} x1={selected.x} x2={selected.x} y1={PADDING.top} y2={geometry.baseline} />
          <circle className={styles.viewPoint} cx={selected.x} cy={selected.pageViewY} r="4.5" />
          <circle className={styles.trendPoint} cx={selected.x} cy={selected.visitorY} r="5" />
          <circle className={styles.scanPoint} cx={selected.x} cy={selected.scanY} r="4.5" />

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
        <div className={styles.legend} aria-label="Chart legend">
          <span><i className={styles.legendVisitor} aria-hidden="true" /> Visitors</span>
          <span><i className={styles.legendView} aria-hidden="true" /> Views</span>
          <span><i className={styles.legendScan} aria-hidden="true" /> Scan starters</span>
        </div>
        <p>Move across the chart, tap a date, or use ← → to inspect values.</p>
      </div>
    </div>
  );
}

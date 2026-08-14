import type { AnalyticsComparison } from "@/lib/analytics/comparison";
import { ACTIVE_NOW_WINDOW_SECONDS, type AnalyticsReport } from "@/lib/analytics/report";

import styles from "./analytics-kpi-grid.module.css";

type DeltaTone = "positive" | "negative" | "neutral" | "pending";
type Delta = { text: string; tone: DeltaTone; title: string };

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
    title: `Scan-rate comparison with ${comparisonLabel} is still building`,
  };
  if (!previousVisitors) return {
    text: "—",
    tone: "pending",
    title: `No visitor baseline in ${comparisonLabel}`,
  };

  const change = current - previous;
  if (change === 0) return {
    text: "0 pts",
    tone: "neutral",
    title: `No scan-rate change vs ${comparisonLabel}`,
  };
  return {
    text: `${change > 0 ? "+" : "−"}${Math.abs(change)} pts`,
    tone: change > 0 ? "positive" : "negative",
    title: `Scan-start rate is ${Math.abs(change)} percentage points ${change > 0 ? "higher" : "lower"} than ${comparisonLabel}`,
  };
}

function DeltaBadge({ delta }: { delta: Delta }) {
  return (
    <span className={`${styles.delta} ${styles[delta.tone]}`} title={delta.title} aria-label={delta.title}>
      {delta.text}
    </span>
  );
}

function KpiCard({
  label,
  value,
  detail,
  delta,
  live = false,
}: {
  label: string;
  value: string;
  detail: string;
  delta?: Delta;
  live?: boolean;
}) {
  return (
    <article className={`${styles.card} ${live ? styles.liveCard : ""}`}>
      <div className={styles.cardHeader}>
        <span className={styles.label}>{live ? <i className={styles.liveDot} aria-hidden="true" /> : null}{label}</span>
        {delta ? <DeltaBadge delta={delta} /> : null}
      </div>
      <strong className={styles.value}>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

export function AnalyticsKpiGrid({
  report,
  comparison,
}: {
  report: AnalyticsReport;
  comparison: AnalyticsComparison;
}) {
  const metrics = report.metrics;
  const label = comparison.label;

  const visitorsDelta = countDelta(metrics.visitors, comparison.previous.visitors, comparison.audienceReady, label);
  const viewsDelta = countDelta(metrics.pageViews, comparison.previous.pageViews, comparison.audienceReady, label);
  const scanRateDelta = rateDelta(
    metrics.scanStartRate,
    comparison.previous.scanStartRate,
    comparison.previous.visitors,
    comparison.scanReady,
    label,
  );

  return (
    <section className={styles.grid} aria-label="Primary finder analytics">
      <KpiCard
        delta={visitorsDelta}
        detail="Unique anonymous visitors"
        label="Visitors"
        value={metrics.visitors.toLocaleString()}
      />
      <KpiCard
        delta={viewsDelta}
        detail="Recorded finder opens"
        label="Page views"
        value={metrics.pageViews.toLocaleString()}
      />
      <KpiCard
        delta={scanRateDelta}
        detail="Unique starters ÷ visitors"
        label="Scan-start rate"
        value={metrics.visitors ? `${metrics.scanStartRate}%` : "—"}
      />
      <KpiCard
        detail={`${metrics.activeNowSessions.toLocaleString()} visible sessions · last ${ACTIVE_NOW_WINDOW_SECONDS}s`}
        label="Active now"
        live
        value={metrics.activeNowVisitors.toLocaleString()}
      />
    </section>
  );
}

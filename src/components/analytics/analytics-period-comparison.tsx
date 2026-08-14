import type { AnalyticsComparison } from "@/lib/analytics/comparison";
import type { AnalyticsReport } from "@/lib/analytics/report";

import styles from "./analytics-period-comparison.module.css";

type ChangeTone = "up" | "down" | "flat" | "new" | "pending";

type ChangeDisplay = {
  text: string;
  detail: string;
  tone: ChangeTone;
};

function displayReadyAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "when enough history is available";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  }).format(date) + " UTC";
}

function percentChange(current: number, previous: number, ready: boolean): ChangeDisplay {
  if (!ready) return { text: "Building", detail: "Waiting for a complete earlier window", tone: "pending" };
  if (previous === 0 && current === 0) return { text: "No change", detail: "0 in both periods", tone: "flat" };
  if (previous === 0) return { text: "New", detail: `${current.toLocaleString()} now · 0 before`, tone: "new" };

  const value = Math.round(((current - previous) / previous) * 100);
  if (value === 0) return { text: "No change", detail: `${current.toLocaleString()} now · ${previous.toLocaleString()} before`, tone: "flat" };
  return {
    text: `${value > 0 ? "↑" : "↓"} ${Math.abs(value)}%`,
    detail: `${current.toLocaleString()} now · ${previous.toLocaleString()} before`,
    tone: value > 0 ? "up" : "down",
  };
}

function pointChange(current: number, previous: number, previousVisitors: number, ready: boolean): ChangeDisplay {
  if (!ready) return { text: "Building", detail: "Waiting for complete scan history", tone: "pending" };
  if (!previousVisitors) return { text: "No baseline", detail: "No visitors in the earlier period", tone: "flat" };

  const value = current - previous;
  if (value === 0) return { text: "No change", detail: `${current}% now · ${previous}% before`, tone: "flat" };
  return {
    text: `${value > 0 ? "↑" : "↓"} ${Math.abs(value)} pts`,
    detail: `${current}% now · ${previous}% before`,
    tone: value > 0 ? "up" : "down",
  };
}

function ChangeItem({ label, change }: { label: string; change: ChangeDisplay }) {
  return (
    <div className={styles.item} title={change.detail}>
      <span>{label}</span>
      <strong className={styles[change.tone]}>{change.text}</strong>
      <small>{change.detail}</small>
    </div>
  );
}

export function AnalyticsPeriodComparison({
  report,
  comparison,
}: {
  report: AnalyticsReport;
  comparison: AnalyticsComparison;
}) {
  const metrics = report.metrics;
  const visitorChange = percentChange(metrics.visitors, comparison.previous.visitors, comparison.audienceReady);
  const viewChange = percentChange(metrics.pageViews, comparison.previous.pageViews, comparison.audienceReady);
  const scanStarterChange = percentChange(metrics.scanStarters, comparison.previous.scanStarters, comparison.scanReady);
  const scanRateChange = pointChange(
    metrics.scanStartRate,
    comparison.previous.scanStartRate,
    comparison.previous.visitors,
    comparison.scanReady,
  );

  const fullyReady = comparison.audienceReady && comparison.scanReady;

  return (
    <section className={styles.comparison} aria-labelledby="period-comparison-title">
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>Period change</span>
          <strong id="period-comparison-title">Compared with {comparison.label}</strong>
        </div>
        {!fullyReady ? (
          <small>
            {comparison.audienceReady
              ? `Scan comparison unlocks ${displayReadyAt(comparison.scanReadyAt)}`
              : `Clean comparison unlocks ${displayReadyAt(comparison.audienceReadyAt)}`}
          </small>
        ) : (
          <small>Same filters · equal-length window</small>
        )}
      </div>

      <div className={styles.items}>
        <ChangeItem change={visitorChange} label="Visitors" />
        <ChangeItem change={viewChange} label="Views" />
        <ChangeItem change={scanStarterChange} label="Scan starters" />
        <ChangeItem change={scanRateChange} label="Scan rate" />
      </div>
    </section>
  );
}

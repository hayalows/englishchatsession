"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { AnalyticsBreakdownRow } from "@/lib/analytics/breakdown-types";
import type { AnalyticsPrimaryMetric } from "@/components/analytics/analytics-trend-chart";

import styles from "./analytics-breakdown-card.module.css";

const METRIC_LABELS: Record<AnalyticsPrimaryMetric, string> = {
  visitors: "Visitors",
  pageViews: "Page views",
  scanUsage: "Scan usage",
};

const METRIC_ORDER: AnalyticsPrimaryMetric[] = ["visitors", "pageViews", "scanUsage"];

type Props = {
  title: string;
  rows: AnalyticsBreakdownRow[];
  activeMetric: AnalyticsPrimaryMetric;
  rangeLabel: string;
  onMetricChange: (metric: AnalyticsPrimaryMetric) => void;
  kind?: "country" | "device" | "browser" | "source";
};

function scanUsage(row: AnalyticsBreakdownRow) {
  return row.visitors ? Math.min(100, Math.round((row.scanStarters / row.visitors) * 100)) : 0;
}

function metricValue(row: AnalyticsBreakdownRow, metric: AnalyticsPrimaryMetric) {
  if (metric === "pageViews") return row.pageViews;
  if (metric === "scanUsage") return scanUsage(row);
  return row.visitors;
}

function formatMetric(value: number, metric: AnalyticsPrimaryMetric) {
  return metric === "scanUsage" ? `${value}%` : value.toLocaleString();
}

function flagFromCountryLabel(label: string) {
  const match = label.match(/\(([A-Z]{2})\)$/);
  if (!match) return null;
  return String.fromCodePoint(...match[1].split("").map((char) => 127397 + char.charCodeAt(0)));
}

function displayLabel(label: string, kind?: Props["kind"]) {
  if (kind !== "country") return label;
  return label.replace(/\s*\([A-Z]{2}\)$/, "");
}

function IconExpand() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M7.2 3.5H3.5v3.7M12.8 3.5h3.7v3.7M7.2 16.5H3.5v-3.7M12.8 16.5h3.7v-3.7M3.8 7l4-4M16.2 7l-4-4M3.8 13l4 4M16.2 13l-4 4" /></svg>
  );
}

function IconSwitch() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3.5 6h10.8M11.5 3.2 14.3 6l-2.8 2.8M16.5 14H5.7M8.5 11.2 5.7 14l2.8 2.8" /></svg>
  );
}

function IconDownload() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 3.2v8.4M6.9 8.8 10 12l3.1-3.2M4 15.8h12" /></svg>
  );
}

function IconMore() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="4" cy="10" r="1.3" /><circle cx="10" cy="10" r="1.3" /><circle cx="16" cy="10" r="1.3" /></svg>
  );
}

function escapeCsv(value: string | number) {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function AnalyticsBreakdownCard({
  title,
  rows,
  activeMetric,
  rangeLabel,
  onMetricChange,
  kind,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => metricValue(b, activeMetric) - metricValue(a, activeMetric)),
    [rows, activeMetric],
  );
  const topRows = sortedRows.slice(0, 5);
  const max = activeMetric === "scanUsage"
    ? 100
    : Math.max(1, ...sortedRows.map((row) => metricValue(row, activeMetric)));
  const total = activeMetric === "scanUsage"
    ? 0
    : sortedRows.reduce((sum, row) => sum + metricValue(row, activeMetric), 0);
  const nextMetric = METRIC_ORDER[(METRIC_ORDER.indexOf(activeMetric) + 1) % METRIC_ORDER.length];

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (dialogOpen && !dialog.open) {
      dialog.showModal();
      requestAnimationFrame(() => searchRef.current?.focus());
    } else if (!dialogOpen && dialog.open) {
      dialog.close();
    }
  }, [dialogOpen]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return sortedRows;
    return sortedRows.filter((row) => row.label.toLocaleLowerCase().includes(normalized));
  }, [query, sortedRows]);

  function openDetails() {
    setMenuOpen(false);
    setQuery("");
    setDialogOpen(true);
  }

  function switchMetric() {
    setMenuOpen(false);
    onMetricChange(nextMetric);
  }

  function exportCsv() {
    setMenuOpen(false);
    const header = [title, "Share / rate", "Visitors", "Page views", "Scan usage"];
    const csvRows = sortedRows.map((row) => {
      const value = metricValue(row, activeMetric);
      const share = activeMetric === "scanUsage"
        ? `${scanUsage(row)}%`
        : `${total ? Math.round((value / total) * 100) : 0}%`;
      return [displayLabel(row.label, kind), share, row.visitors, row.pageViews, `${scanUsage(row)}%`];
    });
    const csv = [header, ...csvRows].map((line) => line.map(escapeCsv).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.toLocaleLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${activeMetric}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <section className={styles.card} aria-label={`${title}, ${METRIC_LABELS[activeMetric]}`}>
      <header className={styles.header}>
        <div>
          <h3>{title}</h3>
          <p>{rangeLabel}</p>
        </div>
        <span className={styles.metricLabel}>{METRIC_LABELS[activeMetric]}</span>
        <button
          aria-expanded={menuOpen}
          aria-label={`${title} actions`}
          className={styles.mobileMenuButton}
          onClick={() => setMenuOpen((value) => !value)}
          type="button"
        >
          <IconMore />
        </button>
        {menuOpen ? (
          <div className={styles.mobileMenu} role="menu">
            <button onClick={openDetails} role="menuitem" type="button">View all</button>
            <button onClick={switchMetric} role="menuitem" type="button">Switch to {METRIC_LABELS[nextMetric]}</button>
            <button onClick={exportCsv} role="menuitem" type="button">Export CSV</button>
          </div>
        ) : null}
      </header>

      {topRows.length ? (
        <div className={styles.rows}>
          {topRows.map((row) => {
            const value = metricValue(row, activeMetric);
            const fill = activeMetric === "scanUsage" ? value : Math.max(3, (value / max) * 100);
            const share = activeMetric === "scanUsage"
              ? value
              : total ? Math.round((value / total) * 100) : 0;
            const flag = flagFromCountryLabel(row.label);
            return (
              <div className={styles.row} key={row.label}>
                <span className={styles.rowFill} style={{ width: `${Math.min(100, fill)}%` }} />
                <span className={styles.rowName}>
                  {flag ? <span className={styles.flag} aria-hidden="true">{flag}</span> : null}
                  <span>{displayLabel(row.label, kind)}</span>
                </span>
                <strong>{activeMetric === "scanUsage" ? `${value}%` : `${share}%`}</strong>
              </div>
            );
          })}
        </div>
      ) : <p className={styles.empty}>No data in this period yet.</p>}

      <footer className={styles.footer}>
        <span>{sortedRows.length > 5 ? `Top 5 of ${sortedRows.length}` : `${sortedRows.length} ${sortedRows.length === 1 ? "entry" : "entries"}`}</span>
        <span>{activeMetric === "scanUsage" ? "Rate by group" : "Share of selected metric"}</span>
      </footer>

      <div className={styles.actionDock} aria-label={`${title} quick actions`}>
        <button aria-label={`View all ${title}`} onClick={openDetails} title="View all" type="button"><IconExpand /></button>
        <button aria-label={`Switch ${title} to ${METRIC_LABELS[nextMetric]}`} onClick={switchMetric} title={`Switch to ${METRIC_LABELS[nextMetric]}`} type="button"><IconSwitch /></button>
        <button aria-label={`Export ${title} as CSV`} onClick={exportCsv} title="Export CSV" type="button"><IconDownload /></button>
      </div>

      <dialog
        className={styles.dialog}
        onCancel={(event) => { event.preventDefault(); setDialogOpen(false); }}
        onClick={(event) => { if (event.target === event.currentTarget) setDialogOpen(false); }}
        onClose={() => setDialogOpen(false)}
        ref={dialogRef}
      >
        <div className={styles.dialogSurface}>
          <header className={styles.dialogHeader}>
            <div>
              <h2>{title}</h2>
              <p>{rangeLabel} · {METRIC_LABELS[activeMetric]}</p>
            </div>
            <button aria-label={`Close ${title}`} className={styles.closeButton} onClick={() => setDialogOpen(false)} type="button">×</button>
          </header>

          <div className={styles.searchWrap}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><circle cx="8.5" cy="8.5" r="4.5" /><path d="m12 12 4 4" /></svg>
            <input
              aria-label={`Search ${title}`}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${title.toLocaleLowerCase()}`}
              ref={searchRef}
              type="search"
              value={query}
            />
          </div>

          <div className={styles.dialogTableWrap} tabIndex={0}>
            <div className={styles.dialogTableHeader} aria-hidden="true">
              <span>{title}</span><span>{activeMetric === "scanUsage" ? "Rate" : "Share"}</span><span>Visitors</span><span>Page views</span><span>Scan usage</span>
            </div>
            <div className={styles.dialogRows}>
              {filteredRows.map((row) => {
                const value = metricValue(row, activeMetric);
                const fill = activeMetric === "scanUsage" ? value : Math.max(3, (value / max) * 100);
                const share = activeMetric === "scanUsage"
                  ? value
                  : total ? Math.round((value / total) * 100) : 0;
                const flag = flagFromCountryLabel(row.label);
                return (
                  <div className={styles.dialogRow} key={row.label}>
                    <span className={styles.dialogRowFill} style={{ width: `${Math.min(100, fill)}%` }} />
                    <span className={styles.dialogName}>
                      {flag ? <span className={styles.flag} aria-hidden="true">{flag}</span> : null}
                      <span>{displayLabel(row.label, kind)}</span>
                    </span>
                    <strong>{`${share}%`}</strong>
                    <strong>{row.visitors.toLocaleString()}</strong>
                    <strong>{row.pageViews.toLocaleString()}</strong>
                    <strong>{`${scanUsage(row)}%`}</strong>
                  </div>
                );
              })}
              {!filteredRows.length ? <p className={styles.noResults}>No matching results.</p> : null}
            </div>
          </div>

          <footer className={styles.dialogFooter}>
            <span>{filteredRows.length} of {sortedRows.length}</span>
            <button onClick={exportCsv} type="button"><IconDownload /> Export CSV</button>
            <button onClick={() => setDialogOpen(false)} type="button">Close</button>
          </footer>
        </div>
      </dialog>
    </section>
  );
}

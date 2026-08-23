"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowsOutSimple,
  DownloadSimple,
  FileText,
  MagnifyingGlass,
  X,
} from "@phosphor-icons/react";
import * as CountryFlags from "country-flag-icons/react/3x2";

import type { AnalyticsBreakdownRow } from "@/lib/analytics/breakdown-types";
import type { AnalyticsPrimaryMetric } from "@/components/analytics/analytics-trend-chart";

import styles from "./analytics-breakdown-card.module.css";

const METRIC_LABELS: Record<AnalyticsPrimaryMetric, string> = {
  visitors: "Visitors",
  pageViews: "Page views",
  scanUsage: "Scan usage",
};

type Props = {
  title: string;
  rows: AnalyticsBreakdownRow[];
  activeMetric: AnalyticsPrimaryMetric;
  rangeLabel: string;
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

function countryCodeFromLabel(label: string) {
  return label.match(/\(([A-Z]{2})\)$/)?.[1] ?? null;
}

function CountryFlag({ code }: { code: string }) {
  const Flag = CountryFlags[code as keyof typeof CountryFlags];
  if (!Flag) return <span aria-hidden="true" className={styles.countryCodeFallback}>{code}</span>;
  return <Flag aria-hidden="true" className={styles.countryFlag} />;
}

function displayLabel(label: string, kind?: Props["kind"]) {
  if (kind !== "country") return label;
  return label.replace(/\s*\([A-Z]{2}\)$/, "");
}

function SearchIcon() {
  return <MagnifyingGlass aria-hidden="true" className={styles.searchIcon} size={18} />;
}

function CloseIcon() {
  return <X aria-hidden="true" className={styles.icon} size={18} />;
}

function EmptyStateIcon() {
  return <FileText aria-hidden="true" className={styles.emptyIcon} size={20} />;
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: ReactNode }) {
  return (
    <div className={styles.emptyState} role="status">
      <span className={styles.emptyIconWrap}><EmptyStateIcon /></span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
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
  kind,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const [dialogOpen, setDialogOpen] = useState(false);
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
  const hasRows = sortedRows.length > 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (dialogOpen && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      if (window.matchMedia("(pointer: fine)").matches) {
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      return;
    }

    if (!dialogOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [dialogOpen]);

  useEffect(() => {
    if (!dialogOpen) return;

    const body = document.body;
    const root = document.documentElement;
    const scrollY = window.scrollY;
    const scrollbarGap = Math.max(0, window.innerWidth - root.clientWidth);
    const previousBody = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    const previousRootOverscroll = root.style.overscrollBehavior;

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbarGap > 0) body.style.paddingRight = `${scrollbarGap}px`;
    root.style.overscrollBehavior = "none";

    return () => {
      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.left = previousBody.left;
      body.style.right = previousBody.right;
      body.style.width = previousBody.width;
      body.style.overflow = previousBody.overflow;
      body.style.paddingRight = previousBody.paddingRight;
      root.style.overscrollBehavior = previousRootOverscroll;
      window.scrollTo(0, scrollY);
    };
  }, [dialogOpen]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return sortedRows;
    return sortedRows.filter((row) => row.label.toLocaleLowerCase().includes(normalized));
  }, [query, sortedRows]);

  function openDetails(trigger: HTMLButtonElement | null) {
    lastTriggerRef.current = trigger;
    setQuery("");
    setDialogOpen(true);
  }

  function closeDetails() {
    setDialogOpen(false);
  }

  function handleDialogClose() {
    setDialogOpen(false);
    requestAnimationFrame(() => lastTriggerRef.current?.focus());
  }

  function exportCsv() {
    if (!hasRows) return;
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
    anchor.download = `${title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${activeMetric}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className={styles.card} aria-label={`${title}, ${METRIC_LABELS[activeMetric]}`}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h3>{title}</h3>
        </div>
        <span className={styles.metricLabel}>{METRIC_LABELS[activeMetric]}</span>
      </header>

      {topRows.length ? (
        <div className={styles.rows}>
          {topRows.map((row) => {
            const value = metricValue(row, activeMetric);
            const fill = activeMetric === "scanUsage" ? value : Math.max(3, (value / max) * 100);
            const share = activeMetric === "scanUsage" ? value : total ? Math.round((value / total) * 100) : 0;
            const countryCode = kind === "country" ? countryCodeFromLabel(row.label) : null;
            return (
              <div className={styles.row} key={row.label}>
                <span className={styles.rowFill} style={{ width: `${Math.min(100, fill)}%` }} />
                <span className={styles.rowName}>
                  {countryCode ? <CountryFlag code={countryCode} /> : null}
                  <span>{displayLabel(row.label, kind)}</span>
                </span>
                <strong>{activeMetric === "scanUsage" ? `${value}%` : `${share}%`}</strong>
              </div>
            );
          })}
        </div>
      ) : <p className={styles.empty}>No data in this period yet.</p>}

      <span aria-hidden="true" className={styles.actionHandle} />
      <div aria-label={`${title} actions`} className={styles.actionDock} role="group">
        <button
          aria-label={`View all ${title}`}
          className={styles.actionButton}
          data-tooltip="View all"
          disabled={!hasRows}
          onClick={(event) => openDetails(event.currentTarget)}
          type="button"
        >
          <ArrowsOutSimple aria-hidden="true" size={17} />
        </button>
        <button
          aria-label={`Export ${title} as CSV`}
          className={styles.actionButton}
          data-tooltip="Export CSV"
          disabled={!hasRows}
          onClick={exportCsv}
          type="button"
        >
          <DownloadSimple aria-hidden="true" size={17} />
        </button>
      </div>

      <dialog
        className={styles.dialog}
        aria-describedby={dialogDescriptionId}
        aria-labelledby={dialogTitleId}
        onCancel={(event) => { event.preventDefault(); closeDetails(); }}
        onClick={(event) => { if (event.target === event.currentTarget) closeDetails(); }}
        onClose={handleDialogClose}
        ref={dialogRef}
      >
        <div className={`${styles.dialogSurface} ${hasRows ? "" : styles.dialogSurfaceEmpty}`}>
          <header className={styles.dialogHeader}>
            <div className={styles.dialogTitleBlock}>
              <span className={styles.dialogEyebrow}>Audience breakdown</span>
              <h2 id={dialogTitleId}>{title}</h2>
              <p id={dialogDescriptionId}>{rangeLabel} · {METRIC_LABELS[activeMetric]}</p>
            </div>
            <div className={styles.dialogHeaderAside}>
              <span className={styles.dialogCount}>{hasRows ? `${sortedRows.length} entries` : "No entries"}</span>
              <button aria-label={`Close ${title}`} className={styles.closeButton} onClick={closeDetails} type="button"><CloseIcon /></button>
            </div>
          </header>

          {hasRows ? (
            <div className={styles.searchWrap}>
              <SearchIcon />
              <input
                aria-label={`Search ${title}`}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`Search ${title.toLocaleLowerCase()}`}
                ref={searchRef}
                type="search"
                value={query}
              />
            </div>
          ) : null}

          <div className={`${styles.dialogTableWrap} ${hasRows ? "" : styles.dialogTableWrapEmpty}`} tabIndex={hasRows ? 0 : -1}>
            {hasRows ? (
              <>
                <div className={styles.dialogTableHeader} aria-hidden="true">
                  <span>{title}</span>
                  <span>{activeMetric === "scanUsage" ? "Rate" : "Share"}</span>
                  <span>Visitors</span>
                  <span>Views</span>
                </div>
                <div aria-label={`${title} details`} className={styles.dialogRows} role="list">
                  {filteredRows.map((row) => {
                    const value = metricValue(row, activeMetric);
                    const fill = activeMetric === "scanUsage" ? value : Math.max(3, (value / max) * 100);
                    const share = activeMetric === "scanUsage" ? value : total ? Math.round((value / total) * 100) : 0;
                    const countryCode = kind === "country" ? countryCodeFromLabel(row.label) : null;
                    return (
                      <div className={styles.dialogRow} key={row.label} role="listitem">
                        <span aria-hidden="true" className={styles.dialogRowFill} style={{ width: `${Math.min(100, fill)}%` }} />
                        <span className={styles.dialogName}>
                          {countryCode ? <CountryFlag code={countryCode} /> : null}
                          <span>{displayLabel(row.label, kind)}</span>
                        </span>
                        <strong>{`${share}%`}</strong>
                        <strong>{row.visitors.toLocaleString()}</strong>
                        <strong>{row.pageViews.toLocaleString()}</strong>
                      </div>
                    );
                  })}
                  {!filteredRows.length ? (
                    <EmptyState
                      action={<button className={styles.emptyAction} onClick={() => setQuery("")} type="button">Clear search</button>}
                      message="Try a shorter search or clear the filter to see every entry."
                      title="No matching results"
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <EmptyState
                message={`No ${title.toLocaleLowerCase()} were recorded for ${rangeLabel.toLocaleLowerCase()}. Try a wider time window if you expect activity.`}
                title={`No ${title.toLocaleLowerCase()} in this period`}
              />
            )}
          </div>

          <footer className={styles.dialogFooter}>
            <span className={styles.dialogFooterMeta}>{hasRows ? `${filteredRows.length} of ${sortedRows.length} shown` : "Choose another period to explore details"}</span>
            <div className={styles.dialogFooterActions}>
              {hasRows ? <button onClick={exportCsv} type="button"><DownloadSimple aria-hidden="true" size={18} /><span>Export CSV</span></button> : null}
              <button onClick={closeDetails} type="button">Close</button>
            </div>
          </footer>
        </div>
      </dialog>
    </section>
  );
}

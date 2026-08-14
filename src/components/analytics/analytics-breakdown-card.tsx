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

function countryCodeFromLabel(label: string) {
  return label.match(/\(([A-Z]{2})\)$/)?.[1] ?? null;
}

function displayLabel(label: string, kind?: Props["kind"]) {
  if (kind !== "country") return label;
  return label.replace(/\s*\([A-Z]{2}\)$/, "");
}

function ExpandIcon() {
  return (
    <svg aria-hidden="true" className={styles.icon} fill="none" viewBox="0 0 24 24">
      <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" />
      <path d="m3.5 8 5-5M20.5 8l-5-5M3.5 16l5 5M20.5 16l-5 5" />
    </svg>
  );
}

function SwitchIcon() {
  return (
    <svg aria-hidden="true" className={styles.icon} fill="none" viewBox="0 0 24 24">
      <path d="M4 7h13M14 4l3 3-3 3M20 17H7M10 14l-3 3 3 3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className={styles.icon} fill="none" viewBox="0 0 24 24">
      <path d="M12 4v10M8 10l4 4 4-4M5 20h14" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg aria-hidden="true" className={styles.icon} viewBox="0 0 24 24">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className={styles.searchIcon} fill="none" viewBox="0 0 24 24">
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className={styles.icon} fill="none" viewBox="0 0 24 24">
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
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
  const cardRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
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
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      requestAnimationFrame(() => searchRef.current?.focus());
      return;
    }

    if (!dialogOpen && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [dialogOpen]);

  useEffect(() => {
    if (!menuOpen) return;

    function onPointerDown(event: PointerEvent) {
      const target = event.target;
      if (target instanceof Node && !cardRef.current?.contains(target)) setMenuOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  const filteredRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return sortedRows;
    return sortedRows.filter((row) => row.label.toLocaleLowerCase().includes(normalized));
  }, [query, sortedRows]);

  function openDetails(trigger: HTMLButtonElement | null) {
    lastTriggerRef.current = trigger;
    setMenuOpen(false);
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
    anchor.download = `${title.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${activeMetric}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section className={styles.card} aria-label={`${title}, ${METRIC_LABELS[activeMetric]}`} ref={cardRef}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h3>{title}</h3>
          <p>{rangeLabel}</p>
        </div>

        <div className={styles.headerMeta}>
          <span className={styles.metricLabel}>{METRIC_LABELS[activeMetric]}</span>

          <div className={styles.desktopActions} aria-label={`${title} actions`}>
            <button
              aria-label={`View all ${title}`}
              onClick={(event) => openDetails(event.currentTarget)}
              title={`View all ${title}`}
              type="button"
            >
              <ExpandIcon />
            </button>
            <button
              aria-label={`Switch ${title} to ${METRIC_LABELS[nextMetric]}`}
              onClick={switchMetric}
              title={`Switch to ${METRIC_LABELS[nextMetric]}`}
              type="button"
            >
              <SwitchIcon />
            </button>
            <button
              aria-label={`Export ${title} as CSV`}
              onClick={exportCsv}
              title="Export CSV"
              type="button"
            >
              <DownloadIcon />
            </button>
          </div>

          <button
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`${title} actions`}
            className={styles.mobileMenuButton}
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            <MoreIcon />
          </button>
        </div>

        {menuOpen ? (
          <div className={styles.mobileMenu} role="menu">
            <button onClick={(event) => openDetails(event.currentTarget)} role="menuitem" type="button">
              <ExpandIcon /><span>View all</span>
            </button>
            <button onClick={switchMetric} role="menuitem" type="button">
              <SwitchIcon /><span>Switch to {METRIC_LABELS[nextMetric]}</span>
            </button>
            <button onClick={exportCsv} role="menuitem" type="button">
              <DownloadIcon /><span>Export CSV</span>
            </button>
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
            const countryCode = kind === "country" ? countryCodeFromLabel(row.label) : null;
            return (
              <div className={styles.row} key={row.label}>
                <span className={styles.rowFill} style={{ width: `${Math.min(100, fill)}%` }} />
                <span className={styles.rowName}>
                  {countryCode ? <span aria-hidden="true" className={styles.countryBadge}>{countryCode}</span> : null}
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

      <dialog
        className={styles.dialog}
        onCancel={(event) => { event.preventDefault(); closeDetails(); }}
        onClick={(event) => { if (event.target === event.currentTarget) closeDetails(); }}
        onClose={handleDialogClose}
        ref={dialogRef}
      >
        <div className={styles.dialogSurface}>
          <header className={styles.dialogHeader}>
            <div>
              <h2>{title}</h2>
              <p>{rangeLabel} · {METRIC_LABELS[activeMetric]}</p>
            </div>
            <button aria-label={`Close ${title}`} className={styles.closeButton} onClick={closeDetails} type="button">
              <CloseIcon />
            </button>
          </header>

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
                const countryCode = kind === "country" ? countryCodeFromLabel(row.label) : null;
                return (
                  <div className={styles.dialogRow} key={row.label}>
                    <span className={styles.dialogRowFill} style={{ width: `${Math.min(100, fill)}%` }} />
                    <span className={styles.dialogName}>
                      {countryCode ? <span aria-hidden="true" className={styles.countryBadge}>{countryCode}</span> : null}
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
            <button onClick={exportCsv} type="button"><DownloadIcon /><span>Export CSV</span></button>
            <button onClick={closeDetails} type="button">Close</button>
          </footer>
        </div>
      </dialog>
    </section>
  );
}

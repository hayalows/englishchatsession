"use client";

import type { ChangeEvent } from "react";

import {
  ANALYTICS_RANGE_OPTIONS,
  ANALYTICS_SEGMENT_OPTIONS,
  displayCountryLabel,
  type AnalyticsRange,
  type AnalyticsSegment,
} from "@/lib/analytics/filters";

import styles from "./analytics-filters.module.css";

const SEGMENT_PLURALS: Record<AnalyticsSegment, string> = {
  all: "traffic",
  country: "countries",
  device: "devices",
  browser: "browsers",
  source: "sources",
};

const RANGE_SHORT_LABELS: Record<AnalyticsRange, string> = {
  "24h": "24H",
  "7d": "7D",
  "30d": "30D",
  "60d": "60D",
  "90d": "90D",
};

type AnalyticsFiltersProps = {
  filters: {
    range: AnalyticsRange;
    rangeLabel: string;
    segment: AnalyticsSegment;
    value: string | null;
    segmentLabel: string;
    trendLabel: string;
  };
  options: Array<{ label: string; total: number }>;
};

function submitOnChange(event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
  const control = event.currentTarget;
  const form = control.form;
  if (control.name === "segment" && form) {
    const valueField = form.elements.namedItem("value");
    if (valueField instanceof HTMLSelectElement) valueField.value = "";
  }
  form?.requestSubmit();
}

function displayOptionLabel(segment: AnalyticsSegment, value: string) {
  return segment === "country" ? displayCountryLabel(value) : value;
}

export function AnalyticsFilters({ filters, options }: AnalyticsFiltersProps) {
  const hasCurrentValue = Boolean(filters.value && !options.some((option) => option.label === filters.value));
  const segmentName = filters.segment === "source" ? "traffic source" : filters.segment;
  const hasActiveFilter = Boolean(filters.value);
  const clearHref = `/analytics?range=${filters.range}`;

  return (
    <section className={styles.filters} aria-label="Analytics controls">
      <form action="/analytics" className={styles.form} method="get">
        <div className={styles.toolbar}>
          <fieldset className={styles.rangeFieldset}>
            <legend className={styles.srOnly}>Time range</legend>
            <div className={styles.rangeChoices}>
              {ANALYTICS_RANGE_OPTIONS.map((option) => (
                <label className={styles.rangeChoice} key={option.value}>
                  <input
                    defaultChecked={filters.range === option.value}
                    name="range"
                    onChange={submitOnChange}
                    type="radio"
                    value={option.value}
                  />
                  <span>
                    <span className={styles.fullRangeLabel}>{option.label}</span>
                    <span className={styles.compactRangeLabel}>{RANGE_SHORT_LABELS[option.value]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <details className={styles.filterDisclosure} open={filters.segment !== "all" && !filters.value}>
            <summary>
              <span aria-hidden="true" className={styles.filterIcon}>⌁</span>
              <span>Filter</span>
              {hasActiveFilter ? <span className={styles.filterBadge} aria-label="1 active filter">1</span> : null}
            </summary>
            <div className={styles.filterPanel}>
              <div className={styles.filterPanelHeader}>
                <div>
                  <strong>Filter traffic</strong>
                  <span>Focus every metric and chart on one audience segment.</span>
                </div>
                {hasActiveFilter ? <a className={styles.clearLink} href={clearHref}>Clear</a> : null}
              </div>

              <label className={styles.field}>
                <span>Dimension</span>
                <select defaultValue={filters.segment} name="segment" onChange={submitOnChange}>
                  {ANALYTICS_SEGMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              {filters.segment !== "all" ? (
                <label className={styles.field}>
                  <span>Choose {segmentName}</span>
                  <select defaultValue={filters.value ?? ""} disabled={!options.length} name="value" onChange={submitOnChange}>
                    <option value="">All {SEGMENT_PLURALS[filters.segment]}</option>
                    {hasCurrentValue ? (
                      <option value={filters.value ?? ""}>{displayOptionLabel(filters.segment, filters.value ?? "")}</option>
                    ) : null}
                    {options.map((option) => (
                      <option key={option.label} value={option.label}>
                        {displayOptionLabel(filters.segment, option.label)} · {option.total.toLocaleString()}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </div>
          </details>
        </div>
      </form>

      {hasActiveFilter ? (
        <div className={styles.activeFilter} aria-live="polite">
          <span>{filters.segmentLabel}</span>
          <a aria-label={`Clear ${filters.segmentLabel} filter`} href={clearHref}>×</a>
        </div>
      ) : null}
    </section>
  );
}

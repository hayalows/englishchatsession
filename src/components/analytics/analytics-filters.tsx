"use client";

import type { ChangeEvent } from "react";

import {
  ANALYTICS_RANGE_OPTIONS,
  ANALYTICS_SEGMENT_OPTIONS,
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

export function AnalyticsFilters({ filters, options }: AnalyticsFiltersProps) {
  const hasCurrentValue = Boolean(filters.value && !options.some((option) => option.label === filters.value));
  const segmentName = filters.segment === "source" ? "traffic source" : filters.segment;

  return (
    <section className={styles.filters} aria-labelledby="analytics-filters-title">
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>View</p>
          <h2 id="analytics-filters-title">View data</h2>
          <p>Change the time range or audience filter. The dashboard updates immediately.</p>
        </div>
        {filters.segment !== "all" || filters.value ? (
          <a className={styles.reset} href={`/analytics?range=${filters.range}`}>Clear audience filter</a>
        ) : null}
      </div>

      <form action="/analytics" className={styles.form} method="get">
        <fieldset className={styles.rangeFieldset}>
          <legend>Time range</legend>
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
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.filterRow}>
          <label className={styles.field}>
            <span>Filter people by</span>
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
                {hasCurrentValue ? <option value={filters.value ?? ""}>{filters.value}</option> : null}
                {options.map((option) => (
                  <option key={option.label} value={option.label}>{option.label} · {option.total.toLocaleString()}</option>
                ))}
              </select>
            </label>
          ) : null}

        </div>
      </form>

      <p className={styles.summary} aria-live="polite"><strong>Showing:</strong> {filters.rangeLabel} · {filters.segmentLabel} · {filters.trendLabel}</p>
    </section>
  );
}

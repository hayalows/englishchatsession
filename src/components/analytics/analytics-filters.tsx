"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

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

type OpenPanel = "range" | "filter" | null;

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

function rangeHref(filters: AnalyticsFiltersProps["filters"], range: AnalyticsRange) {
  const params = new URLSearchParams({ range });
  if (filters.segment !== "all") {
    params.set("segment", filters.segment);
    if (filters.value) params.set("value", filters.value);
  }
  return `/analytics?${params.toString()}`;
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" className={styles.controlIcon} fill="none" viewBox="0 0 24 24">
      <rect height="16" rx="2.5" width="17" x="3.5" y="5" />
      <path d="M7.5 3.5v3M16.5 3.5v3M3.5 9.5h17" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" className={`${styles.controlIcon} ${styles.chevronIcon}`} fill="none" viewBox="0 0 24 24">
      <path d="m7 9 5 5 5-5" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" className={styles.controlIcon} fill="none" viewBox="0 0 24 24">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className={styles.checkIcon} fill="none" viewBox="0 0 24 24">
      <path d="m5 12 4.2 4.2L19 6.5" />
    </svg>
  );
}

export function AnalyticsFilters({ filters, options }: AnalyticsFiltersProps) {
  const initialPanel: OpenPanel = filters.segment !== "all" && !filters.value ? "filter" : null;
  const [openPanel, setOpenPanel] = useState<OpenPanel>(initialPanel);
  const filtersRef = useRef<HTMLElement>(null);
  const rangeTriggerRef = useRef<HTMLButtonElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const filterKey = `${filters.range}:${filters.segment}:${filters.value ?? ""}`;
  const previousFilterKey = useRef(filterKey);

  useEffect(() => {
    if (previousFilterKey.current === filterKey) return;
    previousFilterKey.current = filterKey;
    setOpenPanel(null);
  }, [filterKey]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !filtersRef.current?.contains(event.target)) {
        setOpenPanel(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !openPanel) return;
      event.preventDefault();
      const trigger = openPanel === "range" ? rangeTriggerRef : filterTriggerRef;
      setOpenPanel(null);
      requestAnimationFrame(() => trigger.current?.focus());
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openPanel]);

  const hasCurrentValue = Boolean(filters.value && !options.some((option) => option.label === filters.value));
  const segmentName = filters.segment === "source" ? "traffic source" : filters.segment;
  const hasActiveFilter = Boolean(filters.value);
  const clearHref = `/analytics?range=${filters.range}`;

  function handleFilterChange(event: ChangeEvent<HTMLSelectElement>) {
    setOpenPanel(null);
    submitOnChange(event);
  }

  return (
    <section ref={filtersRef} className={styles.filters} aria-label="Analytics controls">
      <div className={styles.toolbar}>
        <div className={styles.rangeDisclosure} data-open={openPanel === "range" ? "true" : undefined}>
          <button
            aria-controls="analytics-range-panel"
            aria-expanded={openPanel === "range"}
            aria-label={`Time range: ${filters.rangeLabel}`}
            className={styles.controlTrigger}
            onClick={() => setOpenPanel((current) => current === "range" ? null : "range")}
            ref={rangeTriggerRef}
            type="button"
          >
            <CalendarIcon />
            <span className={styles.rangeSummaryLabel}>{filters.rangeLabel}</span>
            <ChevronIcon />
          </button>
          {openPanel === "range" ? <div className={styles.rangePanel} id="analytics-range-panel" role="group" aria-label="Time range options">
            <span className={styles.rangePanelLabel}>Time range</span>
            {ANALYTICS_RANGE_OPTIONS.map((option) => (
              <a
                aria-current={filters.range === option.value ? "true" : undefined}
                className={styles.rangeOption}
                href={rangeHref(filters, option.value)}
                key={option.value}
                onClick={() => setOpenPanel(null)}
              >
                <span>{option.label}</span>
                {filters.range === option.value ? <CheckIcon /> : null}
              </a>
            ))}
          </div> : null}
        </div>

        <div className={styles.filterDisclosure} data-open={openPanel === "filter" ? "true" : undefined}>
          <button
            aria-controls="analytics-filter-panel"
            aria-expanded={openPanel === "filter"}
            className={styles.controlTrigger}
            onClick={() => setOpenPanel((current) => current === "filter" ? null : "filter")}
            ref={filterTriggerRef}
            title="Filter traffic"
            type="button"
          >
            <FilterIcon />
            <span className={styles.filterText}>Filter</span>
            {hasActiveFilter ? <span className={styles.filterBadge} aria-label="1 active filter">1</span> : null}
          </button>
          {openPanel === "filter" ? <div className={styles.filterPanel} id="analytics-filter-panel" role="group" aria-label="Traffic filter options">
            <form action="/analytics" className={styles.form} method="get" onSubmit={() => setOpenPanel(null)}>
              <input name="range" type="hidden" value={filters.range} />
              <div className={styles.filterPanelHeader}>
                <div>
                  <strong>Filter traffic</strong>
                  <span>Narrow the report by audience.</span>
                </div>
                {hasActiveFilter ? <a className={styles.clearLink} href={clearHref}>Clear</a> : null}
              </div>

              <label className={styles.field}>
                <span>Dimension</span>
                <select defaultValue={filters.segment} name="segment" onChange={handleFilterChange}>
                  {ANALYTICS_SEGMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              {filters.segment !== "all" ? (
                <label className={styles.field}>
                  <span>Choose {segmentName}</span>
                  <select defaultValue={filters.value ?? ""} disabled={!options.length} name="value" onChange={handleFilterChange}>
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
            </form>
          </div> : null}
        </div>
      </div>

      {hasActiveFilter ? (
        <div className={styles.activeFilter} aria-live="polite">
          <span>{filters.segmentLabel}</span>
          <a aria-label={`Clear ${filters.segmentLabel} filter`} href={clearHref}>×</a>
        </div>
      ) : null}
    </section>
  );
}

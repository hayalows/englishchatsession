"use client";

import { useMemo, useState } from "react";
import { FunnelSimple } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

import { BottomSheet } from "../arc/bottom-sheet/bottom-sheet";
import {
  DateRangePicker,
  type DateRange,
} from "../arc/date-range-picker/date-range-picker";
import FilterToolbar, {
  type FilterChip,
  type FilterField,
} from "../arc/filter-toolbar/filter-toolbar";
import SegmentedControl from "../arc/segmented-control/segmented-control";
import type { AnalyticsMetricBreakdowns } from "@/lib/analytics/breakdown-types";
import {
  ANALYTICS_RANGE_OPTIONS,
  ANALYTICS_SEGMENT_LABELS,
  displayCountryLabel,
  type AnalyticsRange,
  type AnalyticsSegment,
} from "@/lib/analytics/filters";

import styles from "./analytics-filters.module.css";

type AnalyticsFiltersProps = {
  filters: {
    range: AnalyticsRange;
    rangeLabel: string;
    segment: AnalyticsSegment;
    value: string | null;
    from: string | null;
    to: string | null;
    segmentLabel: string;
    trendLabel: string;
  };
  breakdowns: AnalyticsMetricBreakdowns;
};

const SEGMENTED_RANGES = ANALYTICS_RANGE_OPTIONS
  .filter((option) => option.value !== "custom")
  .map((option) => ({
    value: option.value,
    label: option.value === "24h"
      ? "Today"
      : option.value === "7d"
        ? "7D"
        : option.value === "30d"
          ? "30D"
          : option.value === "60d"
            ? "60D"
            : option.value === "90d"
              ? "90D"
              : "All",
  }));

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function parseDate(value: string | null) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function rawCountryValue(label: string) {
  return label.match(/\(([A-Z]{2})\)$/)?.[1] ?? label;
}

function baseParams(filters: AnalyticsFiltersProps["filters"]) {
  const params = new URLSearchParams({ range: filters.range });
  if (filters.range === "custom" && filters.from && filters.to) {
    params.set("from", filters.from);
    params.set("to", filters.to);
  }
  return params;
}

function rangeHref(filters: AnalyticsFiltersProps["filters"], range: AnalyticsRange) {
  const params = new URLSearchParams({ range });
  if (filters.segment !== "all" && filters.value) {
    params.set("segment", filters.segment);
    params.set("value", filters.value);
  }
  return "/analytics?" + params.toString();
}

function audienceHref(
  filters: AnalyticsFiltersProps["filters"],
  segment: AnalyticsSegment,
  value: string | null,
) {
  const params = baseParams(filters);
  if (segment !== "all" && value) {
    params.set("segment", segment);
    params.set("value", value);
  }
  return "/analytics?" + params.toString();
}

function customHref(filters: AnalyticsFiltersProps["filters"], range: DateRange) {
  const params = new URLSearchParams({
    range: "custom",
    from: dateKey(range.start),
    to: dateKey(range.end),
  });
  if (filters.segment !== "all" && filters.value) {
    params.set("segment", filters.segment);
    params.set("value", filters.value);
  }
  return "/analytics?" + params.toString();
}

function optionRows(
  rows: AnalyticsMetricBreakdowns["countries"],
  segment: Exclude<AnalyticsSegment, "all">,
) {
  return rows.map((row) => ({
    value: segment === "country" ? rawCountryValue(row.label) : row.label,
    label: row.label,
    hint: row.visitors.toLocaleString(),
  }));
}

export function AnalyticsFilters({ filters, breakdowns }: AnalyticsFiltersProps) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const selectedRange = filters.range === "custom" ? "" : filters.range;

  const customValue = filters.range === "custom"
    ? (() => {
      const start = parseDate(filters.from);
      const end = parseDate(filters.to);
      return start && end ? { start, end } : null;
    })()
    : null;

  const activeFilters = useMemo<FilterChip[]>(() => {
    if (filters.segment === "all" || !filters.value) return [];
    const label = ANALYTICS_SEGMENT_LABELS[filters.segment];
    const value = filters.segment === "country" ? displayCountryLabel(filters.value) : filters.value;
    return [{ id: filters.segment, label, value }];
  }, [filters.segment, filters.value]);

  const fields = useMemo<FilterField[]>(() => [
    {
      id: "country",
      label: "Country",
      options: optionRows(breakdowns.countries, "country"),
    },
    {
      id: "device",
      label: "Device",
      options: optionRows(breakdowns.devices, "device"),
    },
    {
      id: "browser",
      label: "Browser",
      options: optionRows(breakdowns.browsers, "browser"),
    },
    {
      id: "source",
      label: "Traffic source",
      options: optionRows(breakdowns.referrers, "source"),
    },
  ], [breakdowns]);

  function chooseRange(value: string) {
    router.push(rangeHref(filters, value as AnalyticsRange));
  }

  function chooseCustom(range: DateRange) {
    router.push(customHref(filters, range));
    setMobileOpen(false);
  }

  function addFilter(filter: FilterChip, field: FilterField) {
    const segment = field.id as AnalyticsSegment;
    router.push(audienceHref(filters, segment, filter.value ?? null));
    setMobileOpen(false);
  }

  function clearFilter() {
    router.push(audienceHref(filters, "all", null));
  }

  const controls = (
    <div className={styles.controlStack}>
      <div className={styles.rangeGroup}>
        <span className={styles.controlLabel}>Time range</span>
        <div className={styles.rangeControls}>
          <SegmentedControl
            label="Analytics time range"
            onValueChange={chooseRange}
            options={SEGMENTED_RANGES}
            value={selectedRange}
          />
          <DateRangePicker
            label="Custom analytics date range"
            maxDate={new Date()}
            minDate={new Date(2026, 7, 13)}
            months="auto"
            onChange={chooseCustom}
            placeholder={filters.range === "custom" ? filters.rangeLabel : "Custom"}
            value={customValue}
            weekStartsOn={1}
          />
        </div>
      </div>

      <div className={styles.filterGroup}>
        <span className={styles.controlLabel}>Audience</span>
        <FilterToolbar
          addFilter={{
            fields,
            label: activeFilters.length ? "Change filter" : "Add filter",
            align: "start",
            onAdd: addFilter,
          }}
          filters={activeFilters}
          label="Analytics audience filters"
          onClearAll={clearFilter}
          onRemove={clearFilter}
        />
      </div>
    </div>
  );

  return (
    <section className={styles.filters} aria-label="Analytics controls">
      <div className={styles.desktopControls}>{controls}</div>

      <div className={styles.mobileControls}>
        <div className={styles.mobileRange}>
          <SegmentedControl
            label="Analytics time range"
            onValueChange={chooseRange}
            options={SEGMENTED_RANGES.filter((option) => ["24h", "7d", "30d", "all"].includes(option.value))}
            value={["24h", "7d", "30d", "all"].includes(selectedRange) ? selectedRange : ""}
          />
        </div>
        <button
          aria-expanded={mobileOpen}
          className={styles.mobileFilterButton}
          onClick={() => setMobileOpen(true)}
          type="button"
        >
          <FunnelSimple aria-hidden="true" size={17} />
          <span>Filters</span>
          {activeFilters.length || filters.range === "custom" || ["60d", "90d"].includes(filters.range)
            ? <strong>{activeFilters.length + (filters.range === "custom" || ["60d", "90d"].includes(filters.range) ? 1 : 0)}</strong>
            : null}
        </button>
      </div>

      <BottomSheet
        description="Choose a reporting range or narrow the report to one audience dimension."
        onOpenChange={setMobileOpen}
        open={mobileOpen}
        title="Analytics filters"
      >
        {controls}
      </BottomSheet>
    </section>
  );
}

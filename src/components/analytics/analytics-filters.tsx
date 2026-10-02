"use client";

import { useMemo, useState } from "react";
import { FunnelSimple, X, CalendarBlank, CaretDown } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";

import { BottomSheet, BottomSheetClose } from "../arc/bottom-sheet/bottom-sheet";
import {
  DateRangePicker,
  type DateRange,
  type DateRangePreset,
  defaultDateRangePresets,
} from "../arc/date-range-picker/date-range-picker";
import type {
  FilterChip,
  FilterField,
} from "../arc/filter-toolbar/filter-toolbar";
import type { AnalyticsMetricBreakdowns } from "@/lib/analytics/breakdown-types";
import {
  ANALYTICS_RANGE_OPTIONS,
  ANALYTICS_SEGMENT_LABELS,
  displayCountryLabel,
  type AnalyticsRange,
  type AnalyticsSegment,
} from "@/lib/analytics/filters";

import { AnalyticsFilterInteraction } from "./analytics-filter-interaction";
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

const HISTORY_START = new Date(2026, 7, 13);
const shiftDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
const DATE_PRESETS: DateRangePreset[] = [
  ...ANALYTICS_RANGE_OPTIONS.filter(option => option.value !== "custom").map(option => ({
    id: option.value,
    label: option.label,
    description: option.value === "24h" ? "Today so far · UTC" : option.value === "all" ? "All recorded history · UTC" : "Rolling period · ends now",
    range: (today: Date) => ({ start: option.value === "all" ? HISTORY_START : option.value === "24h" ? today : shiftDays(today, -Number(option.value.slice(0, -1))), end: today }),
  })),
  ...defaultDateRangePresets.filter(preset => !["Today", "Last 7 days", "Last 30 days"].includes(preset.label)).map(preset => ({
    ...preset,
    description: "Whole calendar days · UTC",
    range: (today: Date) => {
      const range = preset.range(today);
      return { start: range.start < HISTORY_START ? HISTORY_START : range.start, end: range.end };
    },
  })),
];

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

function utcCalendarToday() {
  const now = new Date();
  return new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
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
  const [mobileTab, setMobileTab] = useState<"dates" | "audience">("dates");
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayUtc = useMemo(utcCalendarToday, [todayKey]);

  const customValue = useMemo(() => filters.range === "custom"
    ? (() => {
      const start = parseDate(filters.from);
      const end = parseDate(filters.to);
      return start && end ? { start, end } : null;
    })()
    : DATE_PRESETS.find(preset => preset.id === filters.range)?.range(todayUtc) ?? null,
    [filters.range, filters.from, filters.to, todayUtc]);

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

  function chooseCustom(range: DateRange, preset?: DateRangePreset) {
    router.push(preset?.id ? rangeHref(filters, preset.id as AnalyticsRange) : customHref(filters, range));
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

  const datePicker = (inline = false) => <DateRangePicker
    label="Analytics date range"
    maxDate={todayUtc}
    minDate={HISTORY_START}
    months={inline ? 1 : "auto"}
    onChange={chooseCustom}
    onCancel={() => setMobileOpen(false)}
    displayLabel={filters.rangeLabel}
    selectedPreset={filters.range === "custom" ? "" : filters.range}
    presets={DATE_PRESETS}
    timeZone="UTC"
    inline={inline}
    value={customValue}
    weekStartsOn={1}
  />;

  const audienceControls = <div className={styles.filterGroup}>
    <span className={styles.controlLabel}>Audience</span>
    <AnalyticsFilterInteraction fields={fields} selected={activeFilters[0] ? { ...activeFilters[0], value: filters.value ?? undefined } : undefined} onSelect={addFilter} />
    {activeFilters.length ? <button type="button" className={styles.clearAudience} aria-label="Clear audience filter" onClick={clearFilter}><X size={16} aria-hidden="true" /></button> : null}
  </div>;

  const controls = <div className={styles.controlStack}>
    <div className={styles.rangeGroup}>{datePicker()}</div>
    {audienceControls}
  </div>;

  return (
    <section className={styles.filters} aria-label="Analytics controls">
      <div className={styles.desktopControls}>{controls}</div>

      <div className={styles.mobileControls}>
        <BottomSheet className={styles.filters + " " + styles.mobileSheet}
          description="Presets or exact dates, in UTC." title="Date range" closeLabel="Close date range"
          detents={[0.94]} open={mobileOpen && mobileTab === "dates"}
          onOpenChange={open => { setMobileOpen(open); if (open) setMobileTab("dates"); }}
          trigger={<button type="button" className={styles.mobileDateButton} aria-haspopup="dialog">
            <CalendarBlank size={17} aria-hidden="true" /><span>{filters.rangeLabel}</span><CaretDown size={14} aria-hidden="true" />
          </button>}>
          {datePicker(true)}
        </BottomSheet>
        <BottomSheet
          className={styles.filters + " " + styles.mobileSheet}
          description="Narrow the report to one audience."
          onOpenChange={setMobileOpen}
          open={mobileOpen && mobileTab === "audience"}
          detents={[0.65, 0.94]}
          title="Audience"
          closeLabel="Close analytics filters"
          trigger={<button
          aria-expanded={mobileOpen && mobileTab === "audience"}
          onClick={() => setMobileTab("audience")}
          className={styles.mobileFilterButton}
          type="button"
        >
          <FunnelSimple aria-hidden="true" size={17} />
          <span>Audience</span>
          {activeFilters.length ? <strong>{activeFilters.length}</strong> : null}
        </button>}
        >
          {audienceControls}
          <footer className={styles.sheetFooter}>
            <BottomSheetClose asChild><button type="button" className={styles.doneButton}>Done</button></BottomSheetClose>
          </footer>
        </BottomSheet>
      </div>
      <p className={styles.scopeCaption}>{filters.rangeLabel} · {filters.segmentLabel} · UTC</p>
    </section>
  );
}

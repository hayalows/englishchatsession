export const ANALYTICS_RANGE_OPTIONS = [
  { value: "24h", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "60d", label: "Last 60 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
] as const;

export const ANALYTICS_SEGMENT_OPTIONS = [
  { value: "all", label: "All traffic" },
  { value: "country", label: "Country" },
  { value: "device", label: "Device" },
  { value: "browser", label: "Browser" },
  { value: "source", label: "Traffic source" },
] as const;

export const ANALYTICS_RANGES = ANALYTICS_RANGE_OPTIONS.map((option) => option.value);
export const ANALYTICS_SEGMENTS = ANALYTICS_SEGMENT_OPTIONS.map((option) => option.value);

export type AnalyticsRange = typeof ANALYTICS_RANGES[number];
export type AnalyticsSegment = typeof ANALYTICS_SEGMENTS[number];
export type AnalyticsFilterInput = {
  range?: unknown;
  segment?: unknown;
  value?: unknown;
  from?: unknown;
  to?: unknown;
};

export const ANALYTICS_SEGMENT_LABELS: Record<AnalyticsSegment, string> = {
  all: "All traffic",
  country: "Country",
  device: "Device",
  browser: "Browser",
  source: "Traffic source",
};

export function displayCountryLabel(value: string) {
  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return value;

  try {
    const name = new Intl.DisplayNames(["en"], { type: "region" }).of(code);
    return name && name !== code ? `${name} (${code})` : code;
  } catch {
    return code;
  }
}

function normalizeDate(value: unknown) {
  const raw = firstQueryValue(value);
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== raw ? null : raw;
}

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function normalizeAnalyticsFilters(input: AnalyticsFilterInput = {}) {
  const requestedRange = firstQueryValue(input.range);
  const requestedSegment = firstQueryValue(input.segment);
  const requestedValue = firstQueryValue(input.value);
  const requestedFrom = normalizeDate(input.from);
  const requestedTo = normalizeDate(input.to);
  const requestedRangeIsSupported = typeof requestedRange === "string"
    && ANALYTICS_RANGES.includes(requestedRange as AnalyticsRange);
  const customDatesValid = Boolean(
    requestedFrom
      && requestedTo
      && requestedFrom <= requestedTo
      && requestedTo <= new Date().toISOString().slice(0, 10),
  );
  const range = requestedRangeIsSupported && (requestedRange !== "custom" || customDatesValid)
    ? requestedRange as AnalyticsRange
    : "24h";
  const segment = typeof requestedSegment === "string" && ANALYTICS_SEGMENTS.includes(requestedSegment as AnalyticsSegment)
    ? requestedSegment as AnalyticsSegment
    : "all";
  const value = segment === "all" || typeof requestedValue !== "string"
    ? null
    : requestedValue.trim().slice(0, 120) || null;
  const from = range === "custom" && customDatesValid ? requestedFrom : null;
  const to = range === "custom" && customDatesValid ? requestedTo : null;

  return { range, segment, value, from, to } as const;
}

export function parseAnalyticsSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  return normalizeAnalyticsFilters({
    range: searchParams.range,
    segment: searchParams.segment,
    value: searchParams.value,
    from: searchParams.from,
    to: searchParams.to,
  });
}

export function analyticsFilterLabel(filters: ReturnType<typeof normalizeAnalyticsFilters>) {
  if (filters.segment === "all" || !filters.value) return "All traffic";
  const value = filters.segment === "country" ? displayCountryLabel(filters.value) : filters.value;
  return `${ANALYTICS_SEGMENT_LABELS[filters.segment]}: ${value}`;
}

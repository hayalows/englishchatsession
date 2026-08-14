export const ANALYTICS_RANGE_OPTIONS = [
  { value: "24h", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "60d", label: "Last 60 days" },
  { value: "90d", label: "Last 90 days" },
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

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function normalizeAnalyticsFilters(input: AnalyticsFilterInput = {}) {
  const requestedRange = firstQueryValue(input.range);
  const requestedSegment = firstQueryValue(input.segment);
  const requestedValue = firstQueryValue(input.value);
  const range = typeof requestedRange === "string" && ANALYTICS_RANGES.includes(requestedRange as AnalyticsRange)
    ? requestedRange as AnalyticsRange
    : "7d";
  const segment = typeof requestedSegment === "string" && ANALYTICS_SEGMENTS.includes(requestedSegment as AnalyticsSegment)
    ? requestedSegment as AnalyticsSegment
    : "all";
  const value = segment === "all" || typeof requestedValue !== "string"
    ? null
    : requestedValue.trim().slice(0, 120) || null;

  return { range, segment, value } as const;
}

export function parseAnalyticsSearchParams(searchParams: Record<string, string | string[] | undefined>) {
  return normalizeAnalyticsFilters({
    range: searchParams.range,
    segment: searchParams.segment,
    value: searchParams.value,
  });
}

export function analyticsFilterLabel(filters: ReturnType<typeof normalizeAnalyticsFilters>) {
  if (filters.segment === "all" || !filters.value) return "All traffic";
  const value = filters.segment === "country" ? displayCountryLabel(filters.value) : filters.value;
  return `${ANALYTICS_SEGMENT_LABELS[filters.segment]}: ${value}`;
}

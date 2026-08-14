export type AnalyticsBreakdownRow = {
  label: string;
  visitors: number;
  pageViews: number;
  scanStarters: number;
};

export type AnalyticsMetricBreakdowns = {
  countries: AnalyticsBreakdownRow[];
  devices: AnalyticsBreakdownRow[];
  browsers: AnalyticsBreakdownRow[];
  referrers: AnalyticsBreakdownRow[];
};

export const EMPTY_ANALYTICS_METRIC_BREAKDOWNS: AnalyticsMetricBreakdowns = {
  countries: [],
  devices: [],
  browsers: [],
  referrers: [],
};

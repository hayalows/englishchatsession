import "server-only";

import {
  analyticsDatabaseStatus,
  analyticsQuery,
  type AnalyticsDatabaseStatus,
} from "./neon";
import {
  type AnalyticsFilterInput,
  type AnalyticsRange,
  type AnalyticsSegment,
  analyticsFilterLabel,
  normalizeAnalyticsFilters,
} from "./filters";

export {
  ANALYTICS_RANGE_OPTIONS,
  ANALYTICS_RANGES,
  ANALYTICS_SEGMENT_OPTIONS,
  ANALYTICS_SEGMENTS,
  analyticsFilterLabel,
  normalizeAnalyticsFilters,
  parseAnalyticsSearchParams,
} from "./filters";
export type { AnalyticsFilterInput, AnalyticsRange, AnalyticsSegment } from "./filters";

type TrendGranularity = "hour" | "day" | "week";
export const ACTIVE_NOW_WINDOW_SECONDS = 90;
type RangeConfig = {
  label: string;
  interval: string;
  startSql: string;
  granularity: TrendGranularity;
  bucketInterval: string;
  bucketFormat: string;
  trendLabel: string;
};

const RANGE_CONFIG: Record<AnalyticsRange, RangeConfig> = {
  "24h": {
    label: "Today",
    interval: "24 hours",
    startSql: "date_trunc('day', now())",
    granularity: "hour",
    bucketInterval: "1 hour",
    bucketFormat: "YYYY-MM-DD HH24:00",
    trendLabel: "Hourly, UTC",
  },
  "7d": {
    label: "Last 7 days",
    interval: "7 days",
    startSql: "now() - interval '7 days'",
    granularity: "day",
    bucketInterval: "1 day",
    bucketFormat: "YYYY-MM-DD",
    trendLabel: "Daily, UTC",
  },
  "30d": {
    label: "Last 30 days",
    interval: "30 days",
    startSql: "now() - interval '30 days'",
    granularity: "day",
    bucketInterval: "1 day",
    bucketFormat: "YYYY-MM-DD",
    trendLabel: "Daily, UTC",
  },
  "60d": {
    label: "Last 60 days",
    interval: "60 days",
    startSql: "now() - interval '60 days'",
    granularity: "week",
    bucketInterval: "1 week",
    bucketFormat: 'IYYY-"W"IW',
    trendLabel: "Weekly, UTC",
  },
  "90d": {
    label: "Last 90 days",
    interval: "90 days",
    startSql: "now() - interval '90 days'",
    granularity: "week",
    bucketInterval: "1 week",
    bucketFormat: 'IYYY-"W"IW',
    trendLabel: "Weekly, UTC",
  },
};

const SEGMENT_SQL: Record<Exclude<AnalyticsSegment, "all">, string> = {
  country: "coalesce(nullif(country, ''), 'Unknown')",
  device: "coalesce(nullif(device_type, ''), 'Unknown')",
  browser: "coalesce(nullif(browser, ''), 'Unknown')",
  source: "coalesce(nullif(referrer_host, ''), 'Direct / unknown')",
};

type MetricRow = {
  visitors: unknown;
  sessions: unknown;
  page_views: unknown;
  scan_starts: unknown;
  scan_starters: unknown;
  repeat_scan_visitors: unknown;
  frequent_scan_visitors: unknown;
  engaged_sessions_60s: unknown;
  returning_visitors: unknown;
  active_now_visitors: unknown;
  active_now_sessions: unknown;
  latest_event_at: unknown;
};

type TrendRow = {
  bucket_label: unknown;
  visitors: unknown;
  page_views: unknown;
  scan_starters: unknown;
  scan_starts: unknown;
};

type CountRow = { label: string | null; total: unknown };
type FrequencyRow = { label: string | null; total: unknown; sort_order: unknown };
type EngagementRow = { milestone_seconds: unknown; visitors: unknown; sessions: unknown };

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toIsoDate(value: unknown) {
  if (value === null || value === undefined) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function filterLabel(filters: ReturnType<typeof normalizeAnalyticsFilters>) {
  return analyticsFilterLabel(filters);
}

function filterScope(filters: ReturnType<typeof normalizeAnalyticsFilters>) {
  const column = filters.segment === "all" ? null : SEGMENT_SQL[filters.segment];
  if (!column || !filters.value) return { clause: "TRUE", params: [] as unknown[] };
  return { clause: `${column} = $1`, params: [filters.value] };
}

function emptyReport(status: AnalyticsDatabaseStatus | "error", filtersInput: AnalyticsFilterInput = {}): AnalyticsReport {
  const filters = normalizeAnalyticsFilters(filtersInput);
  const config = RANGE_CONFIG[filters.range];
  return {
    status,
    generatedAt: new Date().toISOString(),
    filters: {
      ...filters,
      rangeLabel: config.label,
      segmentLabel: filterLabel(filters),
      trendLabel: config.trendLabel,
      granularity: config.granularity,
    },
    metrics: {
      visitors: 0,
      sessions: 0,
      pageViews: 0,
      scanStarts: 0,
      scanStarters: 0,
      scanStartRate: 0,
      repeatScanVisitors: 0,
      repeatScanRate: 0,
      frequentScanVisitors: 0,
      scansPerStarter: 0,
      engagedSessions60s: 0,
      returningVisitors: 0,
      returningVisitorRate: 0,
      activeNowVisitors: 0,
      activeNowSessions: 0,
    },
    latestEventAt: null,
    trend: [],
    countries: [],
    referrers: [],
    devices: [],
    browsers: [],
    scanModes: [],
    engagement: [],
    scanFrequency: [],
    filterOptions: [],
  };
}

export function emptyAnalyticsReport(status: AnalyticsDatabaseStatus | "error", filtersInput: AnalyticsFilterInput = {}) {
  return emptyReport(status, filtersInput);
}

export type AnalyticsReport = {
  status: AnalyticsDatabaseStatus | "error";
  generatedAt: string;
  latestEventAt: string | null;
  filters: {
    range: AnalyticsRange;
    rangeLabel: string;
    segment: AnalyticsSegment;
    value: string | null;
    segmentLabel: string;
    trendLabel: string;
    granularity: TrendGranularity;
  };
  metrics: {
    visitors: number;
    sessions: number;
    pageViews: number;
    scanStarts: number;
    scanStarters: number;
    scanStartRate: number;
    repeatScanVisitors: number;
    repeatScanRate: number;
    frequentScanVisitors: number;
    scansPerStarter: number;
    engagedSessions60s: number;
    returningVisitors: number;
    returningVisitorRate: number;
    activeNowVisitors: number;
    activeNowSessions: number;
  };
  trend: Array<{
    label: string;
    visitors: number;
    pageViews: number;
    scanStarters: number;
    scanStarts: number;
  }>;
  countries: Array<{ label: string; total: number }>;
  referrers: Array<{ label: string; total: number }>;
  devices: Array<{ label: string; total: number }>;
  browsers: Array<{ label: string; total: number }>;
  scanModes: Array<{ label: string; total: number }>;
  engagement: Array<{ milestoneSeconds: number; visitors: number; sessions: number }>;
  scanFrequency: Array<{ label: string; total: number }>;
  filterOptions: Array<{ label: string; total: number }>;
};

export async function getAnalyticsReport(filtersInput: AnalyticsFilterInput = {}): Promise<AnalyticsReport> {
  const filters = normalizeAnalyticsFilters(filtersInput);
  const status = analyticsDatabaseStatus();
  if (status !== "configured") return emptyReport(status, filters);

  const config = RANGE_CONFIG[filters.range];
  const scope = filterScope(filters);
  const filterOptionsColumn = filters.segment === "all" ? null : SEGMENT_SQL[filters.segment];

  try {
    const [metricRows, trendRows, countryRows, referrerRows, deviceRows, browserRows, scanModeRows, engagementRows, frequencyRows, filterOptionRows] = await Promise.all([
      analyticsQuery<MetricRow>(`
        WITH bounds AS (
          SELECT ${config.startSql} AS start_at
        ),
        filtered_events AS (
          SELECT events.*
          FROM analytics_events events CROSS JOIN bounds
          WHERE events.created_at >= bounds.start_at
            AND ${scope.clause}
        ),
        active_presence AS (
          SELECT DISTINCT events.visitor_id, events.session_id
          FROM analytics_events events
          WHERE events.event_name = 'presence'
            AND events.created_at >= now() - interval '${ACTIVE_NOW_WINDOW_SECONDS} seconds'
            AND ${scope.clause}
        ),
        page_views AS (
          SELECT * FROM filtered_events WHERE event_name = 'page_view'
        ),
        page_view_visitors AS (
          SELECT DISTINCT visitor_id FROM page_views
        ),
        page_view_sessions AS (
          SELECT DISTINCT session_id FROM page_views
        ),
        page_view_visitor_status AS (
          SELECT
            visitors.visitor_id,
            EXISTS (
              SELECT 1
              FROM analytics_events earlier
              CROSS JOIN bounds
              WHERE earlier.event_name = 'page_view'
                AND earlier.visitor_id = visitors.visitor_id
                AND earlier.created_at < bounds.start_at
            ) AS is_returning
          FROM page_view_visitors visitors
        ),
        scan_frequency AS (
          SELECT events.visitor_id, count(*)::int AS scan_starts
          FROM filtered_events events
          INNER JOIN page_view_visitors visitors ON visitors.visitor_id = events.visitor_id
          WHERE events.event_name = 'scan_started'
          GROUP BY events.visitor_id
        )
        SELECT
          (SELECT count(DISTINCT visitor_id) FROM page_views) AS visitors,
          (SELECT count(DISTINCT session_id) FROM page_views) AS sessions,
          (SELECT count(*) FROM page_views) AS page_views,
          (SELECT count(*) FROM filtered_events WHERE event_name = 'scan_started') AS scan_starts,
          (SELECT count(*) FROM scan_frequency) AS scan_starters,
          (SELECT count(*) FROM scan_frequency WHERE scan_starts >= 2) AS repeat_scan_visitors,
          (SELECT count(*) FROM scan_frequency WHERE scan_starts >= 5) AS frequent_scan_visitors,
          (SELECT count(*) FROM page_view_visitor_status WHERE is_returning) AS returning_visitors,
          (SELECT count(DISTINCT visitor_id) FROM active_presence) AS active_now_visitors,
          (SELECT count(DISTINCT session_id) FROM active_presence) AS active_now_sessions,
          (SELECT max(created_at) FROM filtered_events) AS latest_event_at,
          (SELECT count(DISTINCT events.session_id)
            FROM filtered_events events
            INNER JOIN page_view_sessions sessions ON sessions.session_id = events.session_id
            WHERE events.event_name = 'engagement' AND events.metadata->>'milestoneSeconds' = '60') AS engaged_sessions_60s
      `, scope.params),
      analyticsQuery<TrendRow>(`
        WITH bounds AS (
          SELECT
            ${config.startSql} AS range_start,
            date_trunc('${config.granularity}', ${config.startSql}) AS first_bucket,
            date_trunc('${config.granularity}', now()) AS current_bucket
        ),
        buckets AS (
          SELECT generate_series(bounds.first_bucket, bounds.current_bucket, interval '${config.bucketInterval}') AS bucket
          FROM bounds
        ),
        filtered_events AS (
          SELECT events.*
          FROM analytics_events events CROSS JOIN bounds
          WHERE events.created_at >= bounds.range_start
            AND events.created_at < bounds.current_bucket + interval '${config.bucketInterval}'
            AND ${scope.clause}
        )
        SELECT
          to_char(buckets.bucket, '${config.bucketFormat}') AS bucket_label,
          count(DISTINCT filtered_events.visitor_id) FILTER (WHERE filtered_events.event_name = 'page_view') AS visitors,
          count(*) FILTER (WHERE filtered_events.event_name = 'page_view') AS page_views,
          count(DISTINCT filtered_events.visitor_id) FILTER (WHERE filtered_events.event_name = 'scan_started') AS scan_starters,
          count(*) FILTER (WHERE filtered_events.event_name = 'scan_started') AS scan_starts
        FROM buckets
        LEFT JOIN filtered_events
          ON filtered_events.created_at >= buckets.bucket
         AND filtered_events.created_at < buckets.bucket + interval '${config.bucketInterval}'
        GROUP BY buckets.bucket
        ORDER BY buckets.bucket
      `, scope.params),
      analyticsQuery<CountRow>(`
        WITH bounds AS (SELECT ${config.startSql} AS start_at)
        SELECT coalesce(nullif(country, ''), 'Unknown') AS label, count(DISTINCT visitor_id) AS total
        FROM analytics_events, bounds
        WHERE event_name = 'page_view' AND created_at >= bounds.start_at AND ${scope.clause}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8
      `, scope.params),
      analyticsQuery<CountRow>(`
        WITH bounds AS (SELECT ${config.startSql} AS start_at)
        SELECT coalesce(nullif(referrer_host, ''), 'Direct / unknown') AS label, count(DISTINCT session_id) AS total
        FROM analytics_events, bounds
        WHERE event_name = 'page_view' AND created_at >= bounds.start_at AND ${scope.clause}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8
      `, scope.params),
      analyticsQuery<CountRow>(`
        WITH bounds AS (SELECT ${config.startSql} AS start_at)
        SELECT coalesce(nullif(device_type, ''), 'Unknown') AS label, count(DISTINCT visitor_id) AS total
        FROM analytics_events, bounds
        WHERE event_name = 'page_view' AND created_at >= bounds.start_at AND ${scope.clause}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8
      `, scope.params),
      analyticsQuery<CountRow>(`
        WITH bounds AS (SELECT ${config.startSql} AS start_at)
        SELECT coalesce(nullif(browser, ''), 'Unknown') AS label, count(DISTINCT visitor_id) AS total
        FROM analytics_events, bounds
        WHERE event_name = 'page_view' AND created_at >= bounds.start_at AND ${scope.clause}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8
      `, scope.params),
      analyticsQuery<CountRow>(`
        WITH bounds AS (SELECT ${config.startSql} AS start_at)
        SELECT coalesce(nullif(metadata->>'scanMode', ''), 'Unknown') AS label, count(*) AS total
        FROM analytics_events, bounds
        WHERE event_name = 'scan_started' AND created_at >= bounds.start_at AND ${scope.clause}
        GROUP BY 1 ORDER BY 2 DESC
      `, scope.params),
      analyticsQuery<EngagementRow>(`
        WITH bounds AS (SELECT ${config.startSql} AS start_at)
        SELECT
          metadata->>'milestoneSeconds' AS milestone_seconds,
          count(DISTINCT visitor_id) AS visitors,
          count(DISTINCT session_id) AS sessions
        FROM analytics_events, bounds
        WHERE event_name = 'engagement' AND created_at >= bounds.start_at AND ${scope.clause}
        GROUP BY 1 ORDER BY 1
      `, scope.params),
      analyticsQuery<FrequencyRow>(`
        WITH bounds AS (SELECT ${config.startSql} AS start_at),
        filtered_events AS (
          SELECT events.* FROM analytics_events events, bounds
          WHERE events.created_at >= bounds.start_at AND ${scope.clause}
        ),
        page_view_visitors AS (
          SELECT DISTINCT visitor_id FROM filtered_events WHERE event_name = 'page_view'
        ),
        scan_frequency AS (
          SELECT events.visitor_id, count(*)::int AS scan_starts
          FROM filtered_events events
          INNER JOIN page_view_visitors visitors ON visitors.visitor_id = events.visitor_id
          WHERE events.event_name = 'scan_started'
          GROUP BY events.visitor_id
        )
        SELECT
          CASE
            WHEN scan_starts = 1 THEN '1 scan'
            WHEN scan_starts = 2 THEN '2 scans'
            WHEN scan_starts BETWEEN 3 AND 4 THEN '3–4 scans'
            ELSE '5+ scans'
          END AS label,
          count(*) AS total,
          CASE
            WHEN scan_starts = 1 THEN 1
            WHEN scan_starts = 2 THEN 2
            WHEN scan_starts BETWEEN 3 AND 4 THEN 3
            ELSE 4
          END AS sort_order
        FROM scan_frequency
        GROUP BY 1, 3
        ORDER BY 3
      `, scope.params),
      filterOptionsColumn
        ? analyticsQuery<CountRow>(`
          WITH bounds AS (SELECT ${config.startSql} AS start_at)
          SELECT ${filterOptionsColumn} AS label, count(DISTINCT visitor_id) AS total
          FROM analytics_events, bounds
          WHERE event_name = 'page_view' AND created_at >= bounds.start_at
          GROUP BY 1 ORDER BY 2 DESC LIMIT 30
        `)
        : Promise.resolve([] as CountRow[]),
    ]);

    const metrics = metricRows[0];
    const visitors = number(metrics?.visitors);
    const scanStarters = number(metrics?.scan_starters);
    const scanStarts = number(metrics?.scan_starts);
    const repeatScanVisitors = number(metrics?.repeat_scan_visitors);
    const returningVisitors = number(metrics?.returning_visitors);
    const latestEventAt = toIsoDate(metrics?.latest_event_at);

    return {
      status: "configured",
      generatedAt: new Date().toISOString(),
      latestEventAt,
      filters: {
        ...filters,
        rangeLabel: config.label,
        segmentLabel: filterLabel(filters),
        trendLabel: config.trendLabel,
        granularity: config.granularity,
      },
      metrics: {
        visitors,
        sessions: number(metrics?.sessions),
        pageViews: number(metrics?.page_views),
        scanStarts,
        scanStarters,
        scanStartRate: visitors ? Math.round((scanStarters / visitors) * 100) : 0,
        repeatScanVisitors,
        repeatScanRate: scanStarters ? Math.round((repeatScanVisitors / scanStarters) * 100) : 0,
        frequentScanVisitors: number(metrics?.frequent_scan_visitors),
        scansPerStarter: scanStarters ? Number((scanStarts / scanStarters).toFixed(1)) : 0,
        engagedSessions60s: number(metrics?.engaged_sessions_60s),
        returningVisitors,
        returningVisitorRate: visitors ? Math.round((returningVisitors / visitors) * 100) : 0,
        activeNowVisitors: number(metrics?.active_now_visitors),
        activeNowSessions: number(metrics?.active_now_sessions),
      },
      trend: trendRows.flatMap((row) => typeof row.bucket_label === "string"
        ? [{
          label: row.bucket_label,
          visitors: number(row.visitors),
          pageViews: number(row.page_views),
          scanStarters: number(row.scan_starters),
          scanStarts: number(row.scan_starts),
        }]
        : []),
      countries: countryRows.map((row) => ({ label: row.label ?? "Unknown", total: number(row.total) })),
      referrers: referrerRows.map((row) => ({ label: row.label ?? "Direct / unknown", total: number(row.total) })),
      devices: deviceRows.map((row) => ({ label: row.label ?? "Unknown", total: number(row.total) })),
      browsers: browserRows.map((row) => ({ label: row.label ?? "Unknown", total: number(row.total) })),
      scanModes: scanModeRows.map((row) => ({ label: row.label ?? "Unknown", total: number(row.total) })),
      engagement: [10, 30, 60, 180].flatMap((milestoneSeconds) => {
        const row = engagementRows.find((candidate) => number(candidate.milestone_seconds) === milestoneSeconds);
        return row
          ? [{ milestoneSeconds, visitors: number(row.visitors), sessions: number(row.sessions) }]
          : [];
      }),
      scanFrequency: frequencyRows.map((row) => ({ label: row.label ?? "Unknown", total: number(row.total) })),
      filterOptions: filterOptionRows.map((row) => ({ label: row.label ?? "Unknown", total: number(row.total) })),
    };
  } catch {
    // A database outage must leave the finder and analytics login renderable.
    return emptyReport("error", filters);
  }
}

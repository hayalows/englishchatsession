import "server-only";

import { analyticsDatabaseStatus, analyticsQuery } from "./neon";
import {
  normalizeAnalyticsFilters,
  type AnalyticsFilterInput,
  type AnalyticsRange,
  type AnalyticsSegment,
} from "./filters";
import {
  EMPTY_ANALYTICS_METRIC_BREAKDOWNS,
  type AnalyticsBreakdownRow,
  type AnalyticsMetricBreakdowns,
} from "./breakdown-types";

const RANGE_START_SQL: Record<AnalyticsRange, string> = {
  "24h": "date_trunc('day', now())",
  "7d": "now() - interval '7 days'",
  "30d": "now() - interval '30 days'",
  "60d": "now() - interval '60 days'",
  "90d": "now() - interval '90 days'",
};

const SEGMENT_SQL: Record<Exclude<AnalyticsSegment, "all">, string> = {
  country: "coalesce(nullif(events.country, ''), 'Unknown')",
  device: "coalesce(nullif(events.device_type, ''), 'Unknown')",
  browser: "coalesce(nullif(events.browser, ''), 'Unknown')",
  source: "coalesce(nullif(events.referrer_host, ''), 'Direct / unknown')",
};

const DIMENSION_SQL = {
  countries: "coalesce(nullif(events.country, ''), 'Unknown')",
  devices: "coalesce(nullif(events.device_type, ''), 'Unknown')",
  browsers: "coalesce(nullif(events.browser, ''), 'Unknown')",
  referrers: "coalesce(nullif(events.referrer_host, ''), 'Direct / unknown')",
} as const;

type BreakdownQueryRow = {
  label: string | null;
  visitors: unknown;
  page_views: unknown;
  scan_starters: unknown;
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mapRows(rows: BreakdownQueryRow[]): AnalyticsBreakdownRow[] {
  return rows.map((row) => ({
    label: row.label ?? "Unknown",
    visitors: number(row.visitors),
    pageViews: number(row.page_views),
    scanStarters: number(row.scan_starters),
  }));
}

function filterScope(filters: ReturnType<typeof normalizeAnalyticsFilters>) {
  if (filters.segment === "all" || !filters.value) {
    return { clause: "TRUE", params: [] as unknown[] };
  }
  return {
    clause: `${SEGMENT_SQL[filters.segment]} = $1`,
    params: [filters.value] as unknown[],
  };
}

async function queryBreakdown(
  dimensionSql: string,
  startSql: string,
  scope: ReturnType<typeof filterScope>,
) {
  return analyticsQuery<BreakdownQueryRow>(`
    WITH bounds AS (
      SELECT ${startSql} AS start_at
    ),
    page_view_events AS (
      SELECT
        events.visitor_id,
        ${dimensionSql} AS label
      FROM analytics_events events CROSS JOIN bounds
      WHERE events.event_name = 'page_view'
        AND events.created_at >= bounds.start_at
        AND ${scope.clause}
    ),
    page_view_rollup AS (
      SELECT label, visitor_id, count(*)::int AS page_views
      FROM page_view_events
      GROUP BY label, visitor_id
    ),
    scan_visitors AS (
      SELECT DISTINCT
        events.visitor_id,
        ${dimensionSql} AS label
      FROM analytics_events events CROSS JOIN bounds
      WHERE events.event_name = 'scan_started'
        AND events.created_at >= bounds.start_at
        AND ${scope.clause}
    )
    SELECT
      page_view_rollup.label,
      count(*) AS visitors,
      sum(page_view_rollup.page_views) AS page_views,
      count(*) FILTER (
        WHERE EXISTS (
          SELECT 1
          FROM scan_visitors
          WHERE scan_visitors.visitor_id = page_view_rollup.visitor_id
            AND scan_visitors.label = page_view_rollup.label
        )
      ) AS scan_starters
    FROM page_view_rollup
    GROUP BY page_view_rollup.label
    ORDER BY visitors DESC, page_views DESC
    LIMIT 50
  `, scope.params);
}

export async function getAnalyticsMetricBreakdowns(
  filtersInput: AnalyticsFilterInput = {},
): Promise<AnalyticsMetricBreakdowns> {
  if (analyticsDatabaseStatus() !== "configured") return EMPTY_ANALYTICS_METRIC_BREAKDOWNS;

  const filters = normalizeAnalyticsFilters(filtersInput);
  const startSql = RANGE_START_SQL[filters.range];
  const scope = filterScope(filters);

  try {
    const [countries, devices, browsers, referrers] = await Promise.all([
      queryBreakdown(DIMENSION_SQL.countries, startSql, scope),
      queryBreakdown(DIMENSION_SQL.devices, startSql, scope),
      queryBreakdown(DIMENSION_SQL.browsers, startSql, scope),
      queryBreakdown(DIMENSION_SQL.referrers, startSql, scope),
    ]);

    return {
      countries: mapRows(countries),
      devices: mapRows(devices),
      browsers: mapRows(browsers),
      referrers: mapRows(referrers),
    };
  } catch {
    return EMPTY_ANALYTICS_METRIC_BREAKDOWNS;
  }
}

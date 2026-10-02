import "server-only";

import { analyticsDatabaseStatus, analyticsQuery } from "./neon";
import {
  normalizeAnalyticsFilters,
  type AnalyticsFilterInput,
  type AnalyticsRange,
  type AnalyticsSegment,
} from "./filters";

// First production collection points. Preview/test rows existed before these
// deploys, so comparisons do not begin until a production calendar day closes.
const PAGE_VIEW_PRODUCTION_START = Date.parse("2026-08-14T06:45:34Z");
const SCAN_PRODUCTION_START = Date.parse("2026-08-14T07:37:18Z");

const DAY_MS = 24 * 60 * 60 * 1000;
type TrendGranularity = "hour" | "day" | "week";

const RANGE_CONFIG: Record<AnalyticsRange, {
  interval: string;
  durationMs: number;
  label: string;
  granularity: TrendGranularity;
  bucketInterval: string;
}> = {
  "24h": { interval: "24 hours", durationMs: DAY_MS, label: "yesterday", granularity: "hour", bucketInterval: "1 hour" },
  "7d": { interval: "7 days", durationMs: 7 * DAY_MS, label: "previous 7 days", granularity: "day", bucketInterval: "1 day" },
  "30d": { interval: "30 days", durationMs: 30 * DAY_MS, label: "previous 30 days", granularity: "day", bucketInterval: "1 day" },
  "60d": { interval: "60 days", durationMs: 60 * DAY_MS, label: "previous 60 days", granularity: "week", bucketInterval: "1 week" },
  "90d": { interval: "90 days", durationMs: 90 * DAY_MS, label: "previous 90 days", granularity: "week", bucketInterval: "1 week" },
  all: { interval: "0 days", durationMs: 0, label: "all time", granularity: "week", bucketInterval: "1 week" },
  custom: { interval: "0 days", durationMs: 0, label: "previous period", granularity: "day", bucketInterval: "1 day" },
};

const SEGMENT_SQL: Record<Exclude<AnalyticsSegment, "all">, string> = {
  country: "coalesce(nullif(events.country, ''), 'Unknown')",
  device: "coalesce(nullif(events.device_type, ''), 'Unknown')",
  browser: "coalesce(nullif(events.browser, ''), 'Unknown')",
  source: "coalesce(nullif(events.metadata->>'utmSource', ''), nullif(nullif(events.referrer_host, ''), 'englishchatsession.vercel.app'), 'Direct / unknown')",
};

type PreviousRow = {
  visitors: unknown;
  page_views: unknown;
  scan_starts: unknown;
  scan_starters: unknown;
};

type PreviousTrendRow = {
  bucket_label: unknown;
  visitors: unknown;
  page_views: unknown;
  scan_starts: unknown;
  scan_starters: unknown;
};

export type AnalyticsComparison = {
  label: string;
  audienceReady: boolean;
  scanReady: boolean;
  audienceReadyAt: string;
  scanReadyAt: string;
  previous: {
    visitors: number;
    pageViews: number;
    scanStarts: number;
    scanStarters: number;
    scanStartRate: number;
  };
  trend: Array<{
    label: string;
    visitors: number;
    pageViews: number;
    scanStarts: number;
    scanStarters: number;
  }>;
};

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function utcDayStart(valueMs: number) {
  const value = new Date(valueMs);
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function readiness(range: AnalyticsRange, nowMs = Date.now()) {
  if (range === "all") {
    const readyAt = new Date(PAGE_VIEW_PRODUCTION_START).toISOString();
    return { audienceReady: false, scanReady: false, audienceReadyAt: readyAt, scanReadyAt: readyAt };
  }
  if (range === "custom") {
    return {
      audienceReady: true,
      scanReady: true,
      audienceReadyAt: new Date(PAGE_VIEW_PRODUCTION_START).toISOString(),
      scanReadyAt: new Date(SCAN_PRODUCTION_START).toISOString(),
    };
  }
  if (range === "24h") {
    const audienceReadyAtMs = utcDayStart(PAGE_VIEW_PRODUCTION_START) + DAY_MS;
    const scanReadyAtMs = utcDayStart(SCAN_PRODUCTION_START) + DAY_MS;
    return {
      audienceReady: nowMs >= audienceReadyAtMs,
      scanReady: nowMs >= scanReadyAtMs,
      audienceReadyAt: new Date(audienceReadyAtMs).toISOString(),
      scanReadyAt: new Date(scanReadyAtMs).toISOString(),
    };
  }

  const durationMs = RANGE_CONFIG[range].durationMs;
  const audienceReadyAtMs = PAGE_VIEW_PRODUCTION_START + durationMs * 2;
  const scanReadyAtMs = SCAN_PRODUCTION_START + durationMs * 2;
  return {
    audienceReady: nowMs >= audienceReadyAtMs,
    scanReady: nowMs >= scanReadyAtMs,
    audienceReadyAt: new Date(audienceReadyAtMs).toISOString(),
    scanReadyAt: new Date(scanReadyAtMs).toISOString(),
  };
}

function comparisonBuckets(filters: ReturnType<typeof normalizeAnalyticsFilters>) {
  const configured = RANGE_CONFIG[filters.range];
  if (filters.range !== "custom" || !filters.from || !filters.to) {
    return { granularity: configured.granularity, bucketInterval: configured.bucketInterval };
  }

  const start = Date.parse(`${filters.from}T00:00:00Z`);
  const end = Date.parse(`${filters.to}T00:00:00Z`);
  const days = Math.max(1, Math.round((end - start) / DAY_MS) + 1);
  return days > 45
    ? { granularity: "week" as const, bucketInterval: "1 week" }
    : { granularity: "day" as const, bucketInterval: "1 day" };
}

export function emptyAnalyticsComparison(filtersInput: AnalyticsFilterInput = {}): AnalyticsComparison {
  const filters = normalizeAnalyticsFilters(filtersInput);
  const ready = readiness(filters.range);
  return {
    label: RANGE_CONFIG[filters.range].label,
    ...ready,
    previous: {
      visitors: 0,
      pageViews: 0,
      scanStarts: 0,
      scanStarters: 0,
      scanStartRate: 0,
    },
    trend: [],
  };
}

export async function getAnalyticsComparison(filtersInput: AnalyticsFilterInput = {}): Promise<AnalyticsComparison> {
  const filters = normalizeAnalyticsFilters(filtersInput);
  let comparison = emptyAnalyticsComparison(filters);
  if (filters.range === "custom" && filters.from && filters.to) {
    const fromMs = Date.parse(`${filters.from}T00:00:00Z`);
    const toExclusiveMs = Date.parse(`${filters.to}T00:00:00Z`) + DAY_MS;
    const durationMs = toExclusiveMs - fromMs;
    const previousStartMs = fromMs - durationMs;
    comparison = {
      ...comparison,
      audienceReady: previousStartMs >= PAGE_VIEW_PRODUCTION_START,
      scanReady: previousStartMs >= SCAN_PRODUCTION_START,
      audienceReadyAt: new Date(PAGE_VIEW_PRODUCTION_START + durationMs).toISOString(),
      scanReadyAt: new Date(SCAN_PRODUCTION_START + durationMs).toISOString(),
    };
  }
  if (analyticsDatabaseStatus() !== "configured") return comparison;
  if (filters.range === "all") return comparison;
  if (filters.range === "custom" && (!filters.from || !filters.to)) return comparison;
  if (!comparison.audienceReady && !comparison.scanReady) return comparison;

  const config = RANGE_CONFIG[filters.range];
  const bucket = comparisonBuckets(filters);
  const column = filters.segment === "all" ? null : SEGMENT_SQL[filters.segment];
  const scope = column && filters.value
    ? { clause: `${column} = $1`, params: [filters.value] as unknown[] }
    : { clause: "TRUE", params: [] as unknown[] };

  const boundsSql = filters.range === "24h"
    ? `SELECT
        date_trunc('day', now()) - interval '1 day' AS previous_start,
        date_trunc('day', now()) AS previous_end,
        now() AS current_reference`
    : filters.range === "custom" && filters.from && filters.to
      ? `SELECT
          '${filters.from}T00:00:00Z'::timestamptz - (('${filters.to}T00:00:00Z'::timestamptz + interval '1 day') - '${filters.from}T00:00:00Z'::timestamptz) AS previous_start,
          '${filters.from}T00:00:00Z'::timestamptz AS previous_end,
          '${filters.to}T00:00:00Z'::timestamptz AS current_reference`
      : `SELECT
          now() - interval '${config.interval}' AS previous_end,
          now() - (interval '${config.interval}' * 2) AS previous_start,
          now() AS current_reference`;

  try {
    const [rows, trendRows] = await Promise.all([
      analyticsQuery<PreviousRow>(`
        WITH bounds AS (
          ${boundsSql}
        ),
        previous_events AS (
          SELECT events.*
          FROM analytics_events events CROSS JOIN bounds
          WHERE events.created_at >= bounds.previous_start
            AND events.created_at < bounds.previous_end
            AND ${scope.clause}
        ),
        previous_page_views AS (
          SELECT * FROM previous_events WHERE event_name = 'page_view'
        ),
        previous_page_view_visitors AS (
          SELECT DISTINCT visitor_id FROM previous_page_views
        ),
        previous_scan_frequency AS (
          SELECT events.visitor_id, count(*)::int AS scan_starts
          FROM previous_events events
          INNER JOIN previous_page_view_visitors visitors ON visitors.visitor_id = events.visitor_id
          WHERE events.event_name = 'scan_started'
          GROUP BY events.visitor_id
        )
        SELECT
          (SELECT count(DISTINCT visitor_id) FROM previous_page_views) AS visitors,
          (SELECT count(*) FROM previous_page_views) AS page_views,
          (SELECT count(*) FROM previous_events WHERE event_name = 'scan_started') AS scan_starts,
          (SELECT count(*) FROM previous_scan_frequency) AS scan_starters
      `, scope.params),
      analyticsQuery<PreviousTrendRow>(`
        WITH bounds AS (
          ${boundsSql}
        ),
        aligned AS (
          SELECT
            bounds.*,
            bounds.previous_end - bounds.previous_start AS period_shift,
            date_trunc('${bucket.granularity}', bounds.previous_end)
              - (bounds.previous_end - bounds.previous_start) AS first_bucket,
            date_trunc('${bucket.granularity}', bounds.current_reference)
              - (bounds.previous_end - bounds.previous_start) AS last_bucket
          FROM bounds
        ),
        buckets AS (
          SELECT generate_series(
            aligned.first_bucket,
            aligned.last_bucket,
            interval '${bucket.bucketInterval}'
          ) AS bucket
          FROM aligned
        ),
        previous_events AS (
          SELECT events.*
          FROM analytics_events events CROSS JOIN bounds
          WHERE events.created_at >= bounds.previous_start
            AND events.created_at < bounds.previous_end
            AND ${scope.clause}
        ),
        bucketed_events AS (
          SELECT buckets.bucket, events.*
          FROM buckets
          LEFT JOIN previous_events events
            ON events.created_at >= buckets.bucket
           AND events.created_at < buckets.bucket + interval '${bucket.bucketInterval}'
        ),
        bucket_page_view_visitors AS (
          SELECT DISTINCT bucket, visitor_id
          FROM bucketed_events
          WHERE event_name = 'page_view'
        )
        SELECT
          buckets.bucket::text AS bucket_label,
          count(DISTINCT events.visitor_id) FILTER (WHERE events.event_name = 'page_view') AS visitors,
          count(*) FILTER (WHERE events.event_name = 'page_view') AS page_views,
          count(DISTINCT events.visitor_id) FILTER (
            WHERE events.event_name = 'scan_started'
              AND scan_visitor.visitor_id IS NOT NULL
          ) AS scan_starters,
          count(*) FILTER (WHERE events.event_name = 'scan_started') AS scan_starts
        FROM buckets
        LEFT JOIN bucketed_events events ON events.bucket = buckets.bucket
        LEFT JOIN bucket_page_view_visitors scan_visitor
          ON scan_visitor.bucket = buckets.bucket
         AND scan_visitor.visitor_id = events.visitor_id
        GROUP BY buckets.bucket
        ORDER BY buckets.bucket
      `, scope.params),
    ]);

    const row = rows[0];
    const visitors = number(row?.visitors);
    const scanStarters = number(row?.scan_starters);
    return {
      ...comparison,
      previous: {
        visitors,
        pageViews: number(row?.page_views),
        scanStarts: number(row?.scan_starts),
        scanStarters,
        scanStartRate: visitors ? Math.round((scanStarters / visitors) * 100) : 0,
      },
      trend: trendRows.map((trendRow, index) => ({
        label: typeof trendRow.bucket_label === "string" ? trendRow.bucket_label : String(index),
        visitors: number(trendRow.visitors),
        pageViews: number(trendRow.page_views),
        scanStarts: number(trendRow.scan_starts),
        scanStarters: number(trendRow.scan_starters),
      })),
    };
  } catch {
    return comparison;
  }
}

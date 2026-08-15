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

const RANGE_CONFIG: Record<AnalyticsRange, { interval: string; durationMs: number; label: string }> = {
  "24h": { interval: "24 hours", durationMs: DAY_MS, label: "yesterday" },
  "7d": { interval: "7 days", durationMs: 7 * DAY_MS, label: "previous 7 days" },
  "30d": { interval: "30 days", durationMs: 30 * DAY_MS, label: "previous 30 days" },
  "60d": { interval: "60 days", durationMs: 60 * DAY_MS, label: "previous 60 days" },
  "90d": { interval: "90 days", durationMs: 90 * DAY_MS, label: "previous 90 days" },
};

const SEGMENT_SQL: Record<Exclude<AnalyticsSegment, "all">, string> = {
  country: "coalesce(nullif(events.country, ''), 'Unknown')",
  device: "coalesce(nullif(events.device_type, ''), 'Unknown')",
  browser: "coalesce(nullif(events.browser, ''), 'Unknown')",
  source: "coalesce(nullif(events.referrer_host, ''), 'Direct / unknown')",
};

type PreviousRow = {
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
  if (range === "24h") {
    // Today is a UTC/Ghana calendar day. Compare day-to-date with the last
    // completed calendar day so a useful daily baseline exists from midnight.
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
  };
}

export async function getAnalyticsComparison(filtersInput: AnalyticsFilterInput = {}): Promise<AnalyticsComparison> {
  const filters = normalizeAnalyticsFilters(filtersInput);
  const comparison = emptyAnalyticsComparison(filters);
  if (analyticsDatabaseStatus() !== "configured") return comparison;
  if (!comparison.audienceReady && !comparison.scanReady) return comparison;

  const config = RANGE_CONFIG[filters.range];
  const column = filters.segment === "all" ? null : SEGMENT_SQL[filters.segment];
  const scope = column && filters.value
    ? { clause: `${column} = $1`, params: [filters.value] as unknown[] }
    : { clause: "TRUE", params: [] as unknown[] };

  const boundsSql = filters.range === "24h"
    ? `SELECT
        date_trunc('day', now()) - interval '1 day' AS previous_start,
        date_trunc('day', now()) AS previous_end`
    : `SELECT
        now() - interval '${config.interval}' AS previous_end,
        now() - (interval '${config.interval}' * 2) AS previous_start`;

  try {
    const rows = await analyticsQuery<PreviousRow>(`
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
    `, scope.params);

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
    };
  } catch {
    return comparison;
  }
}

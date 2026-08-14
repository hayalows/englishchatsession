import "server-only";

import {
  analyticsDatabaseStatus,
  analyticsQuery,
  type AnalyticsDatabaseStatus,
} from "@/lib/analytics/neon";

type MetricRow = {
  visitors_today: unknown;
  visitors_7d: unknown;
  visitors_30d: unknown;
  page_views_7d: unknown;
  sessions_7d: unknown;
};

type DailyRow = { day: unknown; visitors: unknown; page_views: unknown };
type CountRow = { label: string | null; total: unknown };

function number(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyReport(status: AnalyticsDatabaseStatus | "error"): AnalyticsReport {
  return {
    status,
    generatedAt: new Date().toISOString(),
    metrics: {
      visitorsToday: 0,
      visitors7d: 0,
      visitors30d: 0,
      pageViews7d: 0,
      sessions7d: 0,
    },
    daily: [],
    countries: [],
    referrers: [],
    devices: [],
  };
}

export type AnalyticsReport = {
  status: AnalyticsDatabaseStatus | "error";
  generatedAt: string;
  metrics: {
    visitorsToday: number;
    visitors7d: number;
    visitors30d: number;
    pageViews7d: number;
    sessions7d: number;
  };
  daily: Array<{ day: string; visitors: number; pageViews: number }>;
  countries: Array<{ label: string; total: number }>;
  referrers: Array<{ label: string; total: number }>;
  devices: Array<{ label: string; total: number }>;
};

export async function getAnalyticsReport(): Promise<AnalyticsReport> {
  const status = analyticsDatabaseStatus();
  if (status !== "configured") return emptyReport(status);

  try {
    const [metricRows, dailyRows, countryRows, referrerRows, deviceRows] = await Promise.all([
      analyticsQuery<MetricRow>(`
        WITH bounds AS (
          SELECT date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS today_start
        )
        SELECT
          count(DISTINCT visitor_id) FILTER (WHERE event_name = 'page_view' AND created_at >= today_start) AS visitors_today,
          count(DISTINCT visitor_id) FILTER (WHERE event_name = 'page_view' AND created_at >= today_start - interval '7 days') AS visitors_7d,
          count(DISTINCT visitor_id) FILTER (WHERE event_name = 'page_view' AND created_at >= today_start - interval '30 days') AS visitors_30d,
          count(*) FILTER (WHERE event_name = 'page_view' AND created_at >= today_start - interval '7 days') AS page_views_7d,
          count(DISTINCT session_id) FILTER (WHERE event_name = 'page_view' AND created_at >= today_start - interval '7 days') AS sessions_7d
        FROM analytics_events, bounds
      `),
      analyticsQuery<DailyRow>(`
        WITH days AS (
          SELECT generate_series(
            (now() AT TIME ZONE 'UTC')::date - 6,
            (now() AT TIME ZONE 'UTC')::date,
            interval '1 day'
          )::date AS day
        )
        SELECT
          to_char(days.day, 'YYYY-MM-DD') AS day,
          count(DISTINCT events.visitor_id) AS visitors,
          count(*) FILTER (WHERE events.event_name = 'page_view') AS page_views
        FROM days
        LEFT JOIN analytics_events events
          ON events.created_at >= (days.day::timestamp AT TIME ZONE 'UTC')
         AND events.created_at < ((days.day + 1)::timestamp AT TIME ZONE 'UTC')
         AND events.event_name = 'page_view'
        GROUP BY days.day
        ORDER BY days.day
      `),
      analyticsQuery<CountRow>(`
        SELECT coalesce(nullif(country, ''), 'Unknown') AS label, count(DISTINCT visitor_id) AS total
        FROM analytics_events
        WHERE event_name = 'page_view' AND created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8
      `),
      analyticsQuery<CountRow>(`
        SELECT coalesce(nullif(referrer_host, ''), 'Direct / unknown') AS label, count(DISTINCT session_id) AS total
        FROM analytics_events
        WHERE event_name = 'page_view' AND created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 2 DESC LIMIT 8
      `),
      analyticsQuery<CountRow>(`
        SELECT coalesce(nullif(device_type, ''), 'Unknown') AS label, count(DISTINCT visitor_id) AS total
        FROM analytics_events
        WHERE event_name = 'page_view' AND created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 2 DESC
      `),
    ]);

    const metrics = metricRows[0];
    return {
      status: "configured",
      generatedAt: new Date().toISOString(),
      metrics: {
        visitorsToday: number(metrics?.visitors_today),
        visitors7d: number(metrics?.visitors_7d),
        visitors30d: number(metrics?.visitors_30d),
        pageViews7d: number(metrics?.page_views_7d),
        sessions7d: number(metrics?.sessions_7d),
      },
      daily: dailyRows.flatMap((row) => typeof row.day === "string"
        ? [{ day: row.day, visitors: number(row.visitors), pageViews: number(row.page_views) }]
        : []),
      countries: countryRows.map((row) => ({ label: row.label ?? "Unknown", total: number(row.total) })),
      referrers: referrerRows.map((row) => ({ label: row.label ?? "Direct / unknown", total: number(row.total) })),
      devices: deviceRows.map((row) => ({ label: row.label ?? "Unknown", total: number(row.total) })),
    };
  } catch {
    // A database outage must leave the student finder and analytics login renderable.
    return emptyReport("error");
  }
}

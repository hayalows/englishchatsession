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
  scan_starts_7d: unknown;
  scan_starters_7d: unknown;
  engaged_sessions_60s_7d: unknown;
};

type DailyRow = {
  day: unknown;
  visitors: unknown;
  page_views: unknown;
  scan_starters: unknown;
  scan_starts: unknown;
};

type CountRow = { label: string | null; total: unknown };
type EngagementRow = { milestone_seconds: unknown; visitors: unknown; sessions: unknown };

const ENGAGEMENT_MILESTONES = [10, 30, 60, 180] as const;

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
      scanStarts7d: 0,
      scanStarters7d: 0,
      scanStartRate7d: 0,
      engagedSessions60s7d: 0,
    },
    daily: [],
    countries: [],
    referrers: [],
    devices: [],
    browsers: [],
    scanModes: [],
    engagement: [],
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
    scanStarts7d: number;
    scanStarters7d: number;
    scanStartRate7d: number;
    engagedSessions60s7d: number;
  };
  daily: Array<{
    day: string;
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
};

export async function getAnalyticsReport(): Promise<AnalyticsReport> {
  const status = analyticsDatabaseStatus();
  if (status !== "configured") return emptyReport(status);

  try {
    const [metricRows, dailyRows, countryRows, referrerRows, deviceRows, browserRows, scanModeRows, engagementRows] = await Promise.all([
      analyticsQuery<MetricRow>(`
        WITH bounds AS (
          SELECT date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' AS today_start
        ),
        window_events AS (
          SELECT * FROM analytics_events WHERE created_at >= now() - interval '30 days'
        ),
        page_view_visitors_7d AS (
          SELECT DISTINCT visitor_id
          FROM window_events, bounds
          WHERE event_name = 'page_view' AND created_at >= bounds.today_start - interval '7 days'
        )
        SELECT
          count(DISTINCT events.visitor_id) FILTER (WHERE events.event_name = 'page_view' AND events.created_at >= bounds.today_start) AS visitors_today,
          count(DISTINCT events.visitor_id) FILTER (WHERE events.event_name = 'page_view' AND events.created_at >= bounds.today_start - interval '7 days') AS visitors_7d,
          count(DISTINCT events.visitor_id) FILTER (WHERE events.event_name = 'page_view') AS visitors_30d,
          count(*) FILTER (WHERE events.event_name = 'page_view' AND events.created_at >= bounds.today_start - interval '7 days') AS page_views_7d,
          count(DISTINCT events.session_id) FILTER (WHERE events.event_name = 'page_view' AND events.created_at >= bounds.today_start - interval '7 days') AS sessions_7d,
          count(*) FILTER (WHERE events.event_name = 'scan_started' AND events.created_at >= bounds.today_start - interval '7 days') AS scan_starts_7d,
          count(DISTINCT events.visitor_id) FILTER (
            WHERE events.event_name = 'scan_started'
              AND events.created_at >= bounds.today_start - interval '7 days'
              AND events.visitor_id IN (SELECT visitor_id FROM page_view_visitors_7d)
          ) AS scan_starters_7d,
          count(DISTINCT events.session_id) FILTER (
            WHERE events.event_name = 'engagement'
              AND events.created_at >= bounds.today_start - interval '7 days'
              AND events.metadata->>'milestoneSeconds' = '60'
          ) AS engaged_sessions_60s_7d
        FROM window_events events CROSS JOIN bounds
      `),
      analyticsQuery<DailyRow>(`
        WITH days AS (
          SELECT generate_series(
            (now() AT TIME ZONE 'UTC')::date - 13,
            (now() AT TIME ZONE 'UTC')::date,
            interval '1 day'
          )::date AS day
        )
        SELECT
          to_char(days.day, 'YYYY-MM-DD') AS day,
          count(DISTINCT events.visitor_id) FILTER (WHERE events.event_name = 'page_view') AS visitors,
          count(*) FILTER (WHERE events.event_name = 'page_view') AS page_views,
          count(DISTINCT events.visitor_id) FILTER (WHERE events.event_name = 'scan_started') AS scan_starters,
          count(*) FILTER (WHERE events.event_name = 'scan_started') AS scan_starts
        FROM days
        LEFT JOIN analytics_events events
          ON events.created_at >= (days.day::timestamp AT TIME ZONE 'UTC')
         AND events.created_at < ((days.day + 1)::timestamp AT TIME ZONE 'UTC')
         AND events.event_name IN ('page_view', 'scan_started')
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
      analyticsQuery<CountRow>(`
        SELECT coalesce(nullif(browser, ''), 'Unknown') AS label, count(DISTINCT visitor_id) AS total
        FROM analytics_events
        WHERE event_name = 'page_view' AND created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 2 DESC
      `),
      analyticsQuery<CountRow>(`
        SELECT coalesce(nullif(metadata->>'scanMode', ''), 'Unknown') AS label, count(*) AS total
        FROM analytics_events
        WHERE event_name = 'scan_started' AND created_at >= now() - interval '30 days'
        GROUP BY 1 ORDER BY 2 DESC
      `),
      analyticsQuery<EngagementRow>(`
        SELECT
          metadata->>'milestoneSeconds' AS milestone_seconds,
          count(DISTINCT visitor_id) AS visitors,
          count(DISTINCT session_id) AS sessions
        FROM analytics_events
        WHERE event_name = 'engagement' AND created_at >= now() - interval '7 days'
        GROUP BY 1 ORDER BY 1
      `),
    ]);

    const metrics = metricRows[0];
    const visitors7d = number(metrics?.visitors_7d);
    const scanStarters7d = number(metrics?.scan_starters_7d);

    return {
      status: "configured",
      generatedAt: new Date().toISOString(),
      metrics: {
        visitorsToday: number(metrics?.visitors_today),
        visitors7d,
        visitors30d: number(metrics?.visitors_30d),
        pageViews7d: number(metrics?.page_views_7d),
        sessions7d: number(metrics?.sessions_7d),
        scanStarts7d: number(metrics?.scan_starts_7d),
        scanStarters7d,
        scanStartRate7d: visitors7d ? Math.round((scanStarters7d / visitors7d) * 100) : 0,
        engagedSessions60s7d: number(metrics?.engaged_sessions_60s_7d),
      },
      daily: dailyRows.flatMap((row) => typeof row.day === "string"
        ? [{
          day: row.day,
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
      engagement: ENGAGEMENT_MILESTONES.flatMap((milestoneSeconds) => {
        const row = engagementRows.find((candidate) => number(candidate.milestone_seconds) === milestoneSeconds);
        return row
          ? [{ milestoneSeconds, visitors: number(row.visitors), sessions: number(row.sessions) }]
          : [];
      }),
    };
  } catch {
    // A database outage must leave the student finder and analytics login renderable.
    return emptyReport("error");
  }
}

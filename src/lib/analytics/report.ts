import "server-only";

import { analyticsDatabaseConfigured, analyticsQuery } from "@/lib/analytics/neon";

type MetricRow = {
  visitors_today: string | null;
  visitors_7d: string | null;
  visitors_30d: string | null;
  page_views_7d: string | null;
  sessions_7d: string | null;
  booking_clicks_7d: string | null;
};

type DailyRow = { day: string | null; visitors: string | null; page_views: string | null };
type CountRow = { label: string | null; total: string | null };

function number(value: string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export type AnalyticsReport = {
  configured: boolean;
  metrics: {
    visitorsToday: number;
    visitors7d: number;
    visitors30d: number;
    pageViews7d: number;
    sessions7d: number;
    bookingClicks7d: number;
  };
  daily: Array<{ day: string; visitors: number; pageViews: number }>;
  countries: Array<{ label: string; total: number }>;
  referrers: Array<{ label: string; total: number }>;
  devices: Array<{ label: string; total: number }>;
};

export async function getAnalyticsReport(): Promise<AnalyticsReport> {
  const configured = analyticsDatabaseConfigured();
  const empty: AnalyticsReport = {
    configured,
    metrics: { visitorsToday: 0, visitors7d: 0, visitors30d: 0, pageViews7d: 0, sessions7d: 0, bookingClicks7d: 0 },
    daily: [],
    countries: [],
    referrers: [],
    devices: [],
  };
  if (!configured) return empty;

  const [metricRows, dailyRows, countryRows, referrerRows, deviceRows] = await Promise.all([
    analyticsQuery<MetricRow>(`
      SELECT
        count(DISTINCT visitor_id) FILTER (WHERE created_at >= date_trunc('day', now())) AS visitors_today,
        count(DISTINCT visitor_id) FILTER (WHERE created_at >= now() - interval '7 days') AS visitors_7d,
        count(DISTINCT visitor_id) FILTER (WHERE created_at >= now() - interval '30 days') AS visitors_30d,
        count(*) FILTER (WHERE event_name = 'page_view' AND created_at >= now() - interval '7 days') AS page_views_7d,
        count(DISTINCT session_id) FILTER (WHERE created_at >= now() - interval '7 days') AS sessions_7d,
        count(*) FILTER (WHERE event_name = 'booking_clicked' AND created_at >= now() - interval '7 days') AS booking_clicks_7d
      FROM analytics_events
    `),
    analyticsQuery<DailyRow>(`
      SELECT
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
        count(DISTINCT visitor_id) AS visitors,
        count(*) FILTER (WHERE event_name = 'page_view') AS page_views
      FROM analytics_events
      WHERE created_at >= date_trunc('day', now()) - interval '6 days'
      GROUP BY 1
      ORDER BY 1
    `),
    analyticsQuery<CountRow>(`
      SELECT coalesce(nullif(country, ''), 'Unknown') AS label, count(DISTINCT visitor_id) AS total
      FROM analytics_events
      WHERE created_at >= now() - interval '30 days'
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
      WHERE created_at >= now() - interval '30 days'
      GROUP BY 1 ORDER BY 2 DESC
    `),
  ]);

  const metrics = metricRows[0];
  return {
    configured,
    metrics: {
      visitorsToday: number(metrics?.visitors_today),
      visitors7d: number(metrics?.visitors_7d),
      visitors30d: number(metrics?.visitors_30d),
      pageViews7d: number(metrics?.page_views_7d),
      sessions7d: number(metrics?.sessions_7d),
      bookingClicks7d: number(metrics?.booking_clicks_7d),
    },
    daily: dailyRows.flatMap((row) => row.day ? [{ day: row.day, visitors: number(row.visitors), pageViews: number(row.page_views) }] : []),
    countries: countryRows.map((row) => ({ label: row.label ?? 'Unknown', total: number(row.total) })),
    referrers: referrerRows.map((row) => ({ label: row.label ?? 'Direct / unknown', total: number(row.total) })),
    devices: deviceRows.map((row) => ({ label: row.label ?? 'Unknown', total: number(row.total) })),
  };
}

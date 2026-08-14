-- Optional first-party analytics storage for English Chat Finder.
-- Run this once in the Neon database used by DATABASE_URL before enabling
-- analytics in Vercel. The scanner does not read from this table.

CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  visitor_id VARCHAR(80) NOT NULL,
  session_id VARCHAR(80) NOT NULL,
  event_name VARCHAR(40) NOT NULL CHECK (event_name = 'page_view'),
  page_path VARCHAR(200) NOT NULL,
  referrer_host VARCHAR(120),
  country VARCHAR(8),
  region VARCHAR(80),
  city VARCHAR(120),
  device_type VARCHAR(16) NOT NULL,
  browser VARCHAR(32) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CREATE TABLE IF NOT EXISTS does not add constraints to an existing table.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'analytics_events_event_name_check'
      AND conrelid = 'public.analytics_events'::regclass
  ) THEN
    ALTER TABLE public.analytics_events
      ADD CONSTRAINT analytics_events_event_name_check CHECK (
        event_name = 'page_view'
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx
  ON analytics_events (created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_event_created_idx
  ON analytics_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS analytics_events_visitor_created_idx
  ON analytics_events (visitor_id, created_at DESC);

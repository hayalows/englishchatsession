create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.monitoring_runs (
  id uuid primary key default extensions.gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('started', 'succeeded', 'failed', 'skipped')),
  sessions_found integer not null default 0 check (sessions_found >= 0),
  changes_found integer not null default 0 check (changes_found >= 0),
  source_http_status integer,
  parser_status text not null default 'pending' check (parser_status in ('pending', 'succeeded', 'failed')),
  error_message text,
  raw_snapshot_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  source_id text not null unique,
  title text not null,
  tutor text,
  session_date date,
  start_time time,
  end_time time,
  source_timezone text,
  booking_url text not null,
  status text not null default 'open' check (status in ('open', 'closed', 'unavailable')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_notified_at timestamptz,
  raw_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sessions_time_range check (end_time is null or start_time is null or end_time > start_time)
);

create table if not exists public.session_changes (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  change_type text not null check (change_type in ('new_session', 'reopened_session', 'time_changed', 'details_changed')),
  previous_data jsonb,
  current_data jsonb not null,
  detected_at timestamptz not null default now()
);

create table if not exists public.notification_events (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  notification_type text not null check (notification_type in ('email')),
  destination text not null,
  provider_message_id text,
  status text not null check (status in ('queued', 'sent', 'failed', 'suppressed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_settings (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  notifications_enabled boolean not null default true,
  preferred_days text[] not null default '{}',
  preferred_start_time time,
  preferred_end_time time,
  preferred_tutors text[] not null default '{}',
  timezone text not null default 'Africa/Accra',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_time_range check (preferred_end_time is null or preferred_start_time is null or preferred_end_time > preferred_start_time)
);

create table if not exists private.monitoring_locks (
  lock_name text primary key,
  locked_until timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists monitoring_runs_started_at_idx on public.monitoring_runs (started_at desc);
create index if not exists sessions_status_last_seen_idx on public.sessions (status, last_seen_at desc);
create index if not exists session_changes_session_detected_idx on public.session_changes (session_id, detected_at desc);
create index if not exists notification_events_session_created_idx on public.notification_events (session_id, created_at desc);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sessions_set_updated_at on public.sessions;
create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function private.set_updated_at();

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
before update on public.user_settings
for each row execute function private.set_updated_at();

create or replace function public.acquire_monitor_lock(p_lock_name text, p_ttl_seconds integer default 840)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  acquired boolean := false;
begin
  if p_lock_name !~ '^[a-z0-9_-]{1,80}$' or p_ttl_seconds < 60 or p_ttl_seconds > 3600 then
    raise exception 'invalid lock arguments';
  end if;

  insert into private.monitoring_locks (lock_name, locked_until, updated_at)
  values (p_lock_name, now() + make_interval(secs => p_ttl_seconds), now())
  on conflict (lock_name) do update
    set locked_until = excluded.locked_until,
        updated_at = now()
    where private.monitoring_locks.locked_until <= now()
  returning true into acquired;

  return coalesce(acquired, false);
end;
$$;

create or replace function public.release_monitor_lock(p_lock_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.monitoring_locks where lock_name = p_lock_name;
$$;

revoke all on function public.acquire_monitor_lock(text, integer) from public, anon, authenticated;
revoke all on function public.release_monitor_lock(text) from public, anon, authenticated;
grant execute on function public.acquire_monitor_lock(text, integer) to service_role;
grant execute on function public.release_monitor_lock(text) to service_role;

alter table public.monitoring_runs enable row level security;
alter table public.sessions enable row level security;
alter table public.session_changes enable row level security;
alter table public.notification_events enable row level security;
alter table public.user_settings enable row level security;
alter table private.monitoring_locks enable row level security;

revoke all on public.monitoring_runs, public.sessions, public.session_changes, public.notification_events from anon, authenticated;
revoke all on private.monitoring_locks from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.user_settings to authenticated;

drop policy if exists "Users manage their own settings" on public.user_settings;
create policy "Users manage their own settings"
on public.user_settings
for all
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

import { createHash } from "node:crypto";

import { getServerEnvironment } from "@/lib/env";
import { detectSessionChanges } from "@/lib/monitoring/diff";
import { parseSchedulingPage } from "@/lib/monitoring/parser";
import type { DetectedChange, NormalizedSession, StoredSession } from "@/lib/monitoring/types";
import { sendSessionNotification } from "@/lib/notifications";
import { createAdminClient } from "@/lib/supabase/admin";

type RunResult = {
  status: "succeeded" | "failed" | "skipped";
  sessionsFound: number;
  changesFound: number;
  message?: string;
};

function sessionRecord(session: NormalizedSession) {
  return {
    source_id: session.sourceId,
    title: session.title,
    tutor: session.tutor,
    session_date: session.sessionDate,
    start_time: session.startTime,
    end_time: session.endTime,
    source_timezone: session.sourceTimezone,
    booking_url: session.bookingUrl,
    status: session.status,
    last_seen_at: new Date().toISOString(),
    raw_data: session.rawData,
  };
}

function changeSnapshot(change: DetectedChange) {
  return {
    sourceId: change.current.sourceId,
    title: change.current.title,
    tutor: change.current.tutor,
    sessionDate: change.current.sessionDate,
    startTime: change.current.startTime,
    endTime: change.current.endTime,
    sourceTimezone: change.current.sourceTimezone,
    bookingUrl: change.current.bookingUrl,
    status: change.current.status,
  };
}

async function fetchSchedulingPage(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(25_000),
    headers: { "User-Agent": "EnglishChatSessionMonitor/1.0 (+private availability monitor)" },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Source page responded with HTTP ${response.status}`);
  return { body, status: response.status };
}

function matchesPreferences(change: DetectedChange, settings: { notifications_enabled: boolean; preferred_tutors: string[]; preferred_days: string[] } | null) {
  if (!settings || !settings.notifications_enabled) return settings === null;
  const tutor = change.current.tutor?.toLocaleLowerCase() ?? "";
  if (settings.preferred_tutors.length > 0 && !settings.preferred_tutors.some((value) => tutor.includes(value.toLocaleLowerCase()))) return false;
  if (settings.preferred_days.length > 0 && change.current.sessionDate) {
    const day = new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "Africa/Accra" }).format(new Date(`${change.current.sessionDate}T12:00:00Z`));
    if (!settings.preferred_days.includes(day)) return false;
  }
  return true;
}

async function storeNotification(change: DetectedChange, sessionId: string, isBaseline: boolean) {
  const admin = createAdminClient();
  const { data: settings } = await admin
    .from("user_settings")
    .select("notifications_enabled, preferred_tutors, preferred_days")
    .limit(1)
    .maybeSingle();

  const environment = getServerEnvironment();
  if (isBaseline || !matchesPreferences(change, settings)) {
    await admin.from("notification_events").insert({
      session_id: sessionId,
      notification_type: "email",
      destination: environment.ALERT_EMAIL_TO,
      status: "suppressed",
      error_message: isBaseline ? "Initial baseline is not alerted." : "Does not match notification preferences.",
    });
    return;
  }

  const delivery = await sendSessionNotification(change);
  if (delivery.error) {
    await admin.from("notification_events").insert({
      session_id: sessionId,
      notification_type: "email",
      destination: environment.ALERT_EMAIL_TO,
      status: "failed",
      error_message: delivery.error.message,
    });
    return;
  }

  await admin.from("notification_events").insert({
    session_id: sessionId,
    notification_type: "email",
    destination: environment.ALERT_EMAIL_TO,
    provider_message_id: delivery.data?.id ?? null,
    status: "sent",
    sent_at: new Date().toISOString(),
  });
  await admin.from("sessions").update({ last_notified_at: new Date().toISOString() }).eq("id", sessionId);
}

async function persistChange(change: DetectedChange, isBaseline: boolean) {
  const admin = createAdminClient();
  const record = sessionRecord(change.current);
  const result = change.existing
    ? await admin.from("sessions").update(record).eq("id", change.existing.id).select("id").single()
    : await admin
        .from("sessions")
        .insert({ ...record, first_seen_at: new Date().toISOString() })
        .select("id")
        .single();
  if (result.error || !result.data) throw new Error(`Unable to save session: ${result.error?.message ?? "unknown error"}`);

  const sessionId = result.data.id as string;
  const { error: changeError } = await admin.from("session_changes").insert({
    session_id: sessionId,
    change_type: change.type,
    previous_data: change.previous,
    current_data: changeSnapshot(change),
  });
  if (changeError) throw new Error(`Unable to record session change: ${changeError.message}`);

  await storeNotification(change, sessionId, isBaseline);
}

export async function runMonitoring(): Promise<RunResult> {
  const environment = getServerEnvironment();
  const admin = createAdminClient();
  const { data: lockGranted, error: lockError } = await admin.rpc("acquire_monitor_lock", {
    p_lock_name: "english-chat-monitor",
    p_ttl_seconds: Math.max(environment.MONITOR_INTERVAL_MINUTES * 60 - 10, 60),
  });
  if (lockError) throw new Error(`Unable to acquire monitoring lock: ${lockError.message}`);
  if (!lockGranted) return { status: "skipped", sessionsFound: 0, changesFound: 0, message: "Another monitor run is active." };

  let runId: string | null = null;
  try {
    const { data: run, error: runError } = await admin.from("monitoring_runs").insert({ status: "started" }).select("id").single();
    if (runError || !run) throw new Error(`Unable to record monitor run: ${runError?.message ?? "unknown error"}`);
    runId = run.id as string;

    const source = await fetchSchedulingPage(environment.MONITORED_PAGE_URL);
    const sessions = parseSchedulingPage(source.body, environment.MONITORED_PAGE_URL);
    const snapshotHash = createHash("sha256").update(source.body).digest("hex");
    const { data: persisted, error: persistedError } = await admin.from("sessions").select("*");
    if (persistedError) throw new Error(`Unable to load sessions: ${persistedError.message}`);

    const existing = (persisted ?? []) as StoredSession[];
    const isBaseline = existing.length === 0;
    const changes = detectSessionChanges(existing, sessions);
    for (const change of changes) await persistChange(change, isBaseline);

    const presentSourceIds = new Set(sessions.map((session) => session.sourceId));
    const unseenIds = existing.filter((session) => session.status === "open" && !presentSourceIds.has(session.source_id)).map((session) => session.id);
    if (unseenIds.length > 0) await admin.from("sessions").update({ status: "unavailable" }).in("id", unseenIds);

    await admin
      .from("monitoring_runs")
      .update({
        completed_at: new Date().toISOString(),
        status: "succeeded",
        sessions_found: sessions.length,
        changes_found: changes.length,
        source_http_status: source.status,
        parser_status: "succeeded",
        raw_snapshot_hash: snapshotHash,
      })
      .eq("id", runId);
    return { status: "succeeded", sessionsFound: sessions.length, changesFound: changes.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown monitoring error";
    if (runId) {
      await admin
        .from("monitoring_runs")
        .update({ completed_at: new Date().toISOString(), status: "failed", parser_status: "failed", error_message: message })
        .eq("id", runId);
    }
    return { status: "failed", sessionsFound: 0, changesFound: 0, message };
  } finally {
    await admin.rpc("release_monitor_lock", { p_lock_name: "english-chat-monitor" });
  }
}

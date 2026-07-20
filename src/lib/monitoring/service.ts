import { createHash } from "node:crypto";

import { getServerEnvironment } from "@/lib/env";
import { detectSessionChanges } from "@/lib/monitoring/diff";
import { parseSchedulingPage } from "@/lib/monitoring/parser";
import type { DetectedChange, NormalizedSession, StoredSession } from "@/lib/monitoring/types";
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

async function persistChange(change: DetectedChange) {
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

  // Availability is intentionally surfaced in the dashboard only. Manual checks never send messages.
}

export async function runMonitoring(): Promise<RunResult> {
  const environment = getServerEnvironment();
  const admin = createAdminClient();
  const { data: lockGranted, error: lockError } = await admin.rpc("acquire_monitor_lock", {
    p_lock_name: "english-chat-monitor",
    // This protects one deliberate manual request. It is not a recurring schedule.
    p_ttl_seconds: 900,
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
    const changes = detectSessionChanges(existing, sessions);
    for (const change of changes) await persistChange(change);

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

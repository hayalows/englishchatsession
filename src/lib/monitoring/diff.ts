import type { DetectedChange, NormalizedSession, StoredSession } from "@/lib/monitoring/types";

function snapshot(session: StoredSession) {
  return {
    title: session.title,
    tutor: session.tutor,
    sessionDate: session.session_date,
    startTime: session.start_time,
    endTime: session.end_time,
    sourceTimezone: session.source_timezone,
    bookingUrl: session.booking_url,
    status: session.status,
  };
}

function hasTimeChanged(existing: StoredSession, current: NormalizedSession) {
  return (
    existing.session_date !== current.sessionDate ||
    existing.start_time !== current.startTime ||
    existing.end_time !== current.endTime ||
    existing.source_timezone !== current.sourceTimezone
  );
}

function hasDetailsChanged(existing: StoredSession, current: NormalizedSession) {
  return existing.title !== current.title || existing.tutor !== current.tutor || existing.booking_url !== current.bookingUrl;
}

export function detectSessionChanges(existing: StoredSession[], current: NormalizedSession[]): DetectedChange[] {
  const existingBySource = new Map(existing.map((session) => [session.source_id, session]));
  const changes: DetectedChange[] = [];

  for (const candidate of current) {
    const previous = existingBySource.get(candidate.sourceId);
    if (!previous) {
      changes.push({ type: "new_session", previous: null, current: candidate });
      continue;
    }
    if (previous.status !== "open") {
      changes.push({ type: "reopened_session", previous: snapshot(previous), current: candidate, existing: previous });
      continue;
    }
    if (hasTimeChanged(previous, candidate)) {
      changes.push({ type: "time_changed", previous: snapshot(previous), current: candidate, existing: previous });
      continue;
    }
    if (hasDetailsChanged(previous, candidate)) {
      changes.push({ type: "details_changed", previous: snapshot(previous), current: candidate, existing: previous });
    }
  }
  return changes;
}

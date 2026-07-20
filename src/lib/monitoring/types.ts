export type NormalizedSession = {
  sourceId: string;
  title: string;
  tutor: string | null;
  sessionDate: string | null;
  startTime: string | null;
  endTime: string | null;
  sourceTimezone: string | null;
  bookingUrl: string;
  status: "open";
  rawData: Record<string, unknown>;
};

export type StoredSession = {
  id: string;
  source_id: string;
  title: string;
  tutor: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  source_timezone: string | null;
  booking_url: string;
  status: "open" | "closed" | "unavailable";
  raw_data: Record<string, unknown>;
};

export type ChangeType = "new_session" | "reopened_session" | "time_changed" | "details_changed";

export type DetectedChange = {
  type: ChangeType;
  previous: Record<string, unknown> | null;
  current: NormalizedSession;
  existing?: StoredSession;
};

export type TutorCheckStatus = "not_checked" | "checking" | "available" | "none_in_view" | "unknown" | "failed";

export type CheckedRange = {
  start?: string;
  end?: string;
  description: string;
};

export type SlotResult = {
  status: TutorCheckStatus;
  availableDates: string[];
  availableTimes?: string[];
  checkedAt?: string;
  checkedRange?: CheckedRange;
  message: string;
  adapter?: "direct";
  reasonCode?: "confirmed_dates" | "confirmed_empty_range" | "schedule_unavailable" | "request_failed";
};

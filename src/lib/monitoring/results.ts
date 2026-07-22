export type TutorCheckStatus = "not_checked" | "checking" | "available" | "none_in_view" | "unknown" | "failed";

export type CheckedRange = {
  start?: string;
  end?: string;
  description: string;
};

export type SlotResult = {
  status: TutorCheckStatus;
  availableDates: string[];
  checkedAt?: string;
  checkedRange?: CheckedRange;
  message: string;
  reasonCode?: "confirmed_dates" | "confirmed_empty_range" | "jump_unreadable" | "page_unreadable" | "browser_launch_failed" | "navigation_timeout" | "request_failed";
};

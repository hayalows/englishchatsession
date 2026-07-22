import type { SlotResult } from "./results";

export type CalendarSnapshot = {
  availableDates: string[];
  rangeStart?: string;
  rangeEnd?: string;
  rangeLabel?: string;
  hasCalendarDays: boolean;
  hasJumpButton: boolean;
  saysNoAvailability: boolean;
  cellFingerprint: string;
};

function rangeDescription(snapshot: CalendarSnapshot, jumped: boolean) {
  if (snapshot.rangeLabel) return snapshot.rangeLabel;
  if (snapshot.rangeStart && snapshot.rangeEnd) return `${snapshot.rangeStart} through ${snapshot.rangeEnd}${jumped ? " after checking Google's next bookable date" : ""}`;
  return jumped ? "Google's next bookable-date view" : "Google's currently displayed calendar range";
}

export function classifyCalendarSnapshot(snapshot: CalendarSnapshot, jumped: boolean, checkedAt = new Date().toISOString()): SlotResult {
  const checkedRange = { start: snapshot.rangeStart, end: snapshot.rangeEnd, description: rangeDescription(snapshot, jumped) };
  if (snapshot.availableDates.length > 0) return {
    status: "available", availableDates: snapshot.availableDates.slice(0, 12), checkedAt, checkedRange,
    message: `${snapshot.availableDates.length} available date${snapshot.availableDates.length === 1 ? "" : "s"} confirmed on Google Calendar.`, reasonCode: "confirmed_dates",
  };
  if (snapshot.hasCalendarDays && snapshot.saysNoAvailability && !snapshot.hasJumpButton && !jumped) return {
    status: "none_in_view", availableDates: [], checkedAt, checkedRange,
    message: "Google Calendar showed no appointments in the checked date range.", reasonCode: "confirmed_empty_range",
  };
  return {
    status: "unknown", availableDates: [], checkedAt, checkedRange,
    message: jumped ? "Google offered a later bookable date, but the date could not be read reliably. Open the booking page to confirm it." : "The calendar loaded, but its availability could not be confirmed reliably.",
    reasonCode: jumped ? "jump_unreadable" : "page_unreadable",
  };
}


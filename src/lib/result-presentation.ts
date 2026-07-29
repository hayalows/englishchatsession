import { isDateInWeek } from "./date-window";
import type { SlotResult } from "./monitoring/results";

export type OpeningGroup = "this_week" | "next_week" | "later";
export type RecommendedView = OpeningGroup | "best";

export function localDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function datesInUserTime(result?: SlotResult) {
  if (!result) return [];

  const localDates = result.availableTimes?.map(localDateKey).filter((date): date is string => Boolean(date)) ?? [];
  return localDates.length ? [...new Set(localDates)] : result.availableDates;
}

export function hasDateInWeek(result: SlotResult | undefined, weekOffset: number, now: Date) {
  return result?.status === "available"
    && datesInUserTime(result).some((date) => isDateInWeek(date, weekOffset, now));
}

export function openingGroup(result: SlotResult | undefined, now: Date): OpeningGroup | null {
  if (result?.status !== "available") return null;
  if (hasDateInWeek(result, 0, now)) return "this_week";
  if (hasDateInWeek(result, 1, now)) return "next_week";
  return "later";
}

export function earliestAvailableTime(result?: SlotResult) {
  if (result?.status !== "available") return null;
  const validTimes = (result.availableTimes ?? [])
    .map((value) => ({ value, timestamp: new Date(value).valueOf() }))
    .filter(({ timestamp }) => !Number.isNaN(timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  return validTimes[0]?.value ?? null;
}

export function countAvailableTimes(result?: SlotResult) {
  if (result?.status !== "available") return 0;
  return result.availableTimes?.length ?? result.availableDates.length;
}

export function chooseRecommendedView(counts: {
  thisWeek: number;
  nextWeek: number;
  later: number;
}): RecommendedView {
  if (counts.thisWeek > 0) return "this_week";
  if (counts.nextWeek > 0) return "next_week";
  if (counts.later > 0) return "later";
  return "best";
}

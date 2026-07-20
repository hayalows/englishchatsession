import { parseSchedulingPage } from "@/lib/monitoring/parser";

export const SCHEDULING_PAGE_URL = "https://sites.google.com/view/english-chat-student-center/Scheduling?authuser=0";

export async function getCurrentBookings() {
  const response = await fetch(SCHEDULING_PAGE_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
    headers: { "User-Agent": "EnglishChatBookingFinder/1.0" },
  });
  if (!response.ok) throw new Error(`The scheduling page responded with HTTP ${response.status}.`);

  return {
    checkedAt: new Date().toISOString(),
    bookingPages: parseSchedulingPage(await response.text(), SCHEDULING_PAGE_URL).map(({ tutor, bookingUrl }) => ({ tutor, bookingUrl })),
  };
}

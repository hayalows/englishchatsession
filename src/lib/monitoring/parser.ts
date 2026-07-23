import { createHash } from "node:crypto";
import { load } from "cheerio";

type BookingPage = {
  sourceId: string;
  tutor: string | null;
  bookingUrl: string;
};

const CALENDAR_HOSTS = new Set(["calendar.app.google", "calendar.google.com"]);
const SAFE_LINK_HOSTS = new Set(["nam10.safelinks.protection.outlook.com"]);

function cleanText(value: string, maxLength = 160) {
  // The source is untrusted HTML; discard ASCII control characters before rendering or storing labels.
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function unwrapSafeLink(url: URL) {
  if (!SAFE_LINK_HOSTS.has(url.hostname)) return url;
  const target = url.searchParams.get("url");
  if (!target) return null;
  try {
    return new URL(target);
  } catch {
    return null;
  }
}

function normalizeBookingUrl(rawUrl: string, sourceUrl: string) {
  try {
    const parsed = unwrapSafeLink(new URL(rawUrl, sourceUrl));
    if (!parsed || parsed.protocol !== "https:" || !CALENDAR_HOSTS.has(parsed.hostname)) return null;
    parsed.hash = "";
    for (const key of [...parsed.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "authuser") parsed.searchParams.delete(key);
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function stableSourceId(url: string) {
  return createHash("sha256").update(`booking-link:${url}`).digest("hex");
}

export function parseSchedulingPage(html: string, sourceUrl: string): BookingPage[] {
  const $ = load(html);
  const bySourceId = new Map<string, BookingPage>();

  $("a[href]").each((_, element) => {
    const tutor = cleanText($(element).text());
    const bookingUrl = normalizeBookingUrl($(element).attr("href") ?? "", sourceUrl);
    if (!tutor || !bookingUrl) return;

    const sourceId = stableSourceId(bookingUrl);
    bySourceId.set(sourceId, {
      sourceId,
      tutor,
      bookingUrl,
    });
  });

  return [...bySourceId.values()].sort((a, b) => a.tutor?.localeCompare(b.tutor ?? "") ?? 0);
}

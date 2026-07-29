export type BookingPageReference = {
  tutor: string | null;
  bookingUrl: string;
};

export type LinkHealthReason =
  | "confirmed_dates"
  | "confirmed_empty_range"
  | "schedule_unavailable"
  | "request_timeout"
  | "rate_limited"
  | "temporary_provider_failure";

export type LinkHealthRecord = {
  status: "healthy" | "paused";
  lastCheckedAt: string;
  lastSuccessfulAt?: string;
  consecutiveFailureCount: number;
  reasonCode: LinkHealthReason;
  retryAfter?: string;
};

export type LinkHealthMap = Record<string, LinkHealthRecord>;
export type BookingUrlCatalog = Record<string, string[]>;

export const TEMPORARY_FAILURE_COOLDOWN_MS = 10 * 60 * 1_000;
export const SCHEDULE_UNAVAILABLE_COOLDOWN_MS = 8 * 60 * 60 * 1_000;

function tutorKey(tutor: string | null) {
  return tutor?.trim().toLocaleLowerCase() || null;
}

export function catalogBookingPages(pages: BookingPageReference[]): BookingUrlCatalog {
  const grouped = new Map<string, Set<string>>();
  for (const page of pages) {
    const key = tutorKey(page.tutor);
    if (!key) continue;
    grouped.set(key, new Set([...(grouped.get(key) ?? []), page.bookingUrl]));
  }
  return Object.fromEntries(
    [...grouped.entries()].map(([key, urls]) => [key, [...urls].sort()]),
  );
}

function sameUrls(left: string[] | undefined, right: string[] | undefined) {
  if (!left || !right || left.length !== right.length) return false;
  return left.every((url, index) => url === right[index]);
}

export function reconcileLinkHealth(
  health: LinkHealthMap,
  previousCatalog: BookingUrlCatalog,
  nextPages: BookingPageReference[],
) {
  const nextCatalog = catalogBookingPages(nextPages);
  const nextHealth = { ...health };
  const listedUrls = new Set(nextPages.map((page) => page.bookingUrl));

  for (const url of Object.keys(nextHealth)) {
    if (!listedUrls.has(url)) delete nextHealth[url];
  }

  for (const [key, nextUrls] of Object.entries(nextCatalog)) {
    const previousUrls = previousCatalog[key];
    if (sameUrls(previousUrls, nextUrls)) continue;
    for (const url of [...(previousUrls ?? []), ...nextUrls]) delete nextHealth[url];
  }

  return { health: nextHealth, catalog: nextCatalog };
}

export function markLinkHealthy(
  health: LinkHealthMap,
  bookingUrl: string,
  checkedAt: string,
  reasonCode: Extract<LinkHealthReason, "confirmed_dates" | "confirmed_empty_range">,
): LinkHealthMap {
  return {
    ...health,
    [bookingUrl]: {
      status: "healthy",
      lastCheckedAt: checkedAt,
      lastSuccessfulAt: checkedAt,
      consecutiveFailureCount: 0,
      reasonCode,
    },
  };
}

export function markLinkPaused(
  health: LinkHealthMap,
  bookingUrl: string,
  checkedAt: string,
  reasonCode: Exclude<LinkHealthReason, "confirmed_dates" | "confirmed_empty_range">,
  cooldownMs: number,
): LinkHealthMap {
  const previous = health[bookingUrl];
  return {
    ...health,
    [bookingUrl]: {
      status: "paused",
      lastCheckedAt: checkedAt,
      lastSuccessfulAt: previous?.lastSuccessfulAt,
      consecutiveFailureCount: (previous?.consecutiveFailureCount ?? 0) + 1,
      reasonCode,
      retryAfter: new Date(new Date(checkedAt).valueOf() + cooldownMs).toISOString(),
    },
  };
}

export function isLinkPaused(record: LinkHealthRecord | undefined, now = Date.now()) {
  if (!record || record.status !== "paused" || !record.retryAfter) return false;
  return new Date(record.retryAfter).valueOf() > now;
}

export function planLinkChecks(
  pages: BookingPageReference[],
  health: LinkHealthMap,
  now = Date.now(),
) {
  const queued: BookingPageReference[] = [];
  const paused: BookingPageReference[] = [];
  for (const page of pages) {
    (isLinkPaused(health[page.bookingUrl], now) ? paused : queued).push(page);
  }
  return { queued, paused };
}

